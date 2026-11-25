<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Manila');
const CATEGORIES = ['Tea', 'Dairy & creamers', 'Pearls & toppings', 'Flavorings', 'Sweeteners', 'Packaging'];
const UNITS = ['g', 'kg', 'mL', 'L', 'pcs'];
const TYPES = ['Stock in', 'Stock out', 'Wastage', 'Adjustment'];
// An unreceived first batch has no ledger entries. A depleted batch retains its history.
const PENDING_BATCH_SQL = 'SELECT l.id,l.item_id,l.expiry FROM ac_lots l WHERE l.balance=0 AND NOT EXISTS (SELECT 1 FROM ac_lines x WHERE x.lot_id=l.id)';
class FormError extends RuntimeException {}
function reject(string $text, int $code=422): void { throw new FormError($text, $code); }
function rows(PDO $db, string $sql, array $params=[]): array {
    $stmt=$db->prepare($sql); $stmt->execute($params); return $stmt->fetchAll();
}
function executeSql(PDO $db, string $sql, array $params=[]): void {
    $db->prepare($sql)->execute($params);
}
function connection(bool $install=false): PDO {
    $c=require __DIR__.'/config.php';
    if (!preg_match('/^[A-Za-z0-9_]+$/D',$c['database'])) reject('Invalid database name.',503);
    $dsn='mysql:host='.$c['host'].';port='.$c['port'].';charset=utf8mb4';
    $options=[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false];
    if ($install) {
        $db=new PDO($dsn,$c['user'],$c['password'],$options);
        try { $db->exec('USE `'.$c['database'].'`'); }
        catch(PDOException $e) {
            if (($e->errorInfo[1]??0)!==1049) throw $e;
            $db->exec('CREATE DATABASE IF NOT EXISTS `'.$c['database'].'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $db->exec('USE `'.$c['database'].'`');
        }
        foreach(explode(';',file_get_contents(__DIR__.'/schema.sql')) as $sql) if(trim($sql)!=='') $db->exec($sql);
    } else $db=new PDO($dsn.';dbname='.$c['database'],$c['user'],$c['password'],$options);
    return $db;
}
// Upgrade existing installations before starting an inventory transaction.
function ensureArchiveColumn(PDO $db): void {
    try { $db->query('SELECT archived FROM ac_items LIMIT 0'); }
    catch (PDOException $e) {
        if ((int)($e->errorInfo[1]??0)!==1054) throw $e;
        try { $db->exec('ALTER TABLE ac_items ADD archived TINYINT NOT NULL DEFAULT 0'); }
        catch (PDOException $race) {
            if ((int)($race->errorInfo[1]??0)!==1060) throw $race;
        }
    }
}
function field($value,int $limit,string $label): string {
    if (!is_string($value) || trim($value)==='' || mb_strlen(trim($value))>$limit) reject("Enter a valid $label (up to $limit characters).");
    return trim($value);
}
function units($raw, string $unit): int {
    $s=(string)$raw;
    if(!preg_match('/^\d{1,8}(?:\.\d{1,3})?$/D',$s)) reject('Enter a quantity from 0 to 99,999,999 with up to three decimal places.');
    [$whole,$fraction]=array_pad(explode('.',$s,2),2,'');
    $n=(int)$whole*1000+(int)str_pad($fraction,3,'0');
    if($unit==='pcs' && $n%1000) reject('Pieces must be whole numbers.');
    return $n;
}
function expiryDate($value): ?string {
    if ($value===null || $value==='') return null;
    if(!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D',$value) || $value<'1000-01-01') reject('Enter a valid expiration date.');
    $d=DateTimeImmutable::createFromFormat('!Y-m-d',$value);
    if(!$d || $d->format('Y-m-d')!==$value) reject('Enter a valid expiration date.');
    return $value;
}
function createAccount(PDO $db,array $data,string $role): int {
    $name=field($data['name']??'',80,'display name');
    $username=strtolower(field($data['username']??'',60,'username'));
    if(!preg_match('/^[a-z0-9._-]{3,60}$/D',$username)) reject('Use 3–60 letters, numbers, dots, dashes or underscores for the username.');
    $pw=$data['password']??'';
    if(!is_string($pw) || strlen($pw)<8 || strlen($pw)>72) reject('Use a password of 8–72 bytes.');
    executeSql($db,'INSERT INTO ac_users(name,username,password_hash,role) VALUES (?,?,?,?)',[$name,$username,password_hash($pw,PASSWORD_DEFAULT),$role]);
    return (int)$db->lastInsertId();
}
// Caller owns the transaction. The item lock serializes every balance change.
function recordMove(PDO $db,array $v,int $uid,string $role,?string $time=null): int {
    $type=$v['type']??'';
    if(!in_array($type,TYPES,true)) reject('Select a movement type.');
    if($type==='Adjustment' && $role!=='Owner') reject('Only the owner can adjust stock.',403);
    $key=$v['key']??'';
    if(!is_string($key) || !preg_match('/^[a-f0-9]{32}$/D',$key)) reject('Reopen the entry form and try again.');
    $item=rows($db,'SELECT * FROM ac_items WHERE id=? FOR UPDATE',[(int)($v['item']??0)])[0]??null;
    if(!$item) reject('Select an inventory item.');
    $prior=rows($db,'SELECT id,user_id FROM ac_moves WHERE request_key=? FOR UPDATE',[$key]);
    if($prior) { if((int)$prior[0]['user_id']!==$uid) reject('Invalid request.',409); return (int)$prior[0]['id']; }
    if(!empty($item['archived'])) reject('Restore this archived item before recording a movement.',409);
    $qty=units($v['quantity']??'',$item['unit']);
    if($qty===0) reject('Quantity must be greater than zero.');
    $note=trim((string)($v['note']??''));
    if(mb_strlen($note)>255 || (in_array($type,['Adjustment','Wastage'],true) && $note==='')) reject('Give a reason of up to 255 characters.');
    if($type==='Adjustment' && !in_array($v['direction']??'',['increase','decrease'],true)) reject('Choose an adjustment direction.');
    $incoming=$type==='Stock in' || ($type==='Adjustment' && $v['direction']==='increase');
    $now=$time??date('Y-m-d H:i:s');
    $lots=rows($db,'SELECT * FROM ac_lots WHERE item_id=? AND balance>0 ORDER BY expiry IS NULL,expiry,id FOR UPDATE',[$item['id']]);
    $total=(int)array_sum(array_column($lots,'balance'));
    $changes=[];
    if($incoming) {
        $pending=rows($db,PENDING_BATCH_SQL.' AND l.item_id=? FOR UPDATE',[$item['id']])[0]??null;
        if(isset($v['pending_lot']) && (int)$v['pending_lot']!==(int)($pending['id']??0)) {
            reject('Another entry received this batch. Refresh and enter the delivery date again.',409);
        }
        $exp=expiryDate($v['expiry']??($pending['expiry']??null));
        if($pending) {
            $lotId=(int)$pending['id'];
            executeSql($db,'UPDATE ac_lots SET expiry=?,balance=? WHERE id=?',[$exp,$qty,$lotId]);
        } else {
            executeSql($db,'INSERT INTO ac_lots(item_id,expiry,balance) VALUES (?,?,?)',[$item['id'],$exp,$qty]);
            $lotId=(int)$db->lastInsertId();
        }
        $changes[$lotId]=$qty;
    } else {
        $remaining=$qty; $selected=(int)($v['lot']??0);
        foreach($lots as $lot) {
            if($selected && $selected!==(int)$lot['id']) continue;
            if($type==='Stock out' && $lot['expiry'] && $lot['expiry']<substr($now,0,10)) continue;
            $used=min($remaining,(int)$lot['balance']);
            executeSql($db,'UPDATE ac_lots SET balance=balance-? WHERE id=?',[$used,$lot['id']]);
            $changes[$lot['id']]=-$used; $remaining-=$used;
            if(!$remaining) break;
        }
        if($remaining) reject('Insufficient eligible stock. Check the quantity, batch and expiry.');
    }
    $delta=$incoming?$qty:-$qty;
    executeSql($db,'INSERT INTO ac_moves(item_id,user_id,type,delta,after_qty,note,created,request_key) VALUES (?,?,?,?,?,?,?,?)',[$item['id'],$uid,$type,$delta,$total+$delta,$note,$now,$key]);
    $mid=(int)$db->lastInsertId();
    foreach($changes as $lid=>$change) executeSql($db,'INSERT INTO ac_lines VALUES (?,?,?)',[$mid,$lid,$change]);
    return $mid;
}
