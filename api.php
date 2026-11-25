<?php
declare(strict_types=1);
require __DIR__.'/app/core.php';
session_name('ABOUTCOFFEESESSID');
session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/').'/']);
ini_set('session.use_strict_mode','1');
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(array $data): void { echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); exit; }
function signIn(int $id): void { session_regenerate_id(true); $_SESSION=['uid'=>$id,'token'=>bin2hex(random_bytes(24))]; }
$db=null;
try {
    $action=$_GET['action']??'state'; $post=$_SERVER['REQUEST_METHOD']==='POST';
    $_SESSION['token']??=bin2hex(random_bytes(24));
    $v=[];
    if($post) {
        if(!hash_equals($_SESSION['token'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) reject('Your session changed. Refresh and try again.',403);
        $v=json_decode(file_get_contents('php://input'),true);
        if(!is_array($v)) reject('Invalid input.');
    } elseif($action!=='state') reject('Use the entry form.',405);
    $local=in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true);
    if($action==='setup' && !$local) reject('Create the first owner account on localhost.',403);
    try {
        $db=connection($action==='setup');
        $installed=(bool)rows($db,"SELECT id FROM ac_users WHERE role='Owner' LIMIT 1");
    } catch(PDOException $e) {
        if($action==='state' && in_array((int)($e->errorInfo[1]??0),[1049,1146],true)) $installed=false;
        else throw $e;
    }
    if($action==='state' && !$installed) respond(['mode'=>$local?'setup':'pending','token'=>$_SESSION['token']]);
    if($action==='setup') {
        if($installed) reject('Setup has already been completed.',409);
        $lock='ac_setup_'.substr(hash('sha256',rows($db,'SELECT DATABASE() AS n')[0]['n']),0,32);
        if((int)rows($db,'SELECT GET_LOCK(?,5) AS ok',[$lock])[0]['ok']!==1) reject('Setup in progress. Try again shortly.',409);
        $db->beginTransaction();
        if(rows($db,"SELECT id FROM ac_users WHERE role='Owner' LIMIT 1 FOR UPDATE")) reject('Setup has already been completed.',409);
        if(strtolower(trim($v['username']??''))==='sample.ledger') reject('Choose another username.');
        $uid=createAccount($db,$v,'Owner');
        if(($v['sample']??false)===true) { require __DIR__.'/app/sample.php'; seedInventory($db); }
        $db->commit(); signIn($uid); respond(['ok'=>true]);
    }
    if(!$installed) reject('Complete setup on localhost first.',409);
    if($action==='login') {
        $r=rows($db,'SELECT * FROM ac_users WHERE username=? AND active=1',[strtolower(trim($v['username']??''))])[0]??null;
        if(!$r || !password_verify($v['password']??'',$r['password_hash'])) reject('The username or password is incorrect.',401);
        signIn((int)$r['id']); respond(['ok'=>true]);
    }
    $user=rows($db,'SELECT id,name,username,role FROM ac_users WHERE id=? AND active=1',[$_SESSION['uid']??0])[0]??null;
    if(!$user) {
        if($action==='state') respond(['mode'=>'login','token'=>$_SESSION['token']]);
        reject('Sign in to continue.',401);
    }
    $owner=$user['role']==='Owner';
    if($action==='logout') { $_SESSION=[]; session_destroy(); respond(['ok'=>true]); }
    ensureArchiveColumn($db);
    if($action==='state') {
        $db->beginTransaction();
        $result=['mode'=>'app','token'=>$_SESSION['token'],'user'=>$user,'today'=>date('Y-m-d'),'categories'=>CATEGORIES,'units'=>UNITS,
            'items'=>rows($db,'SELECT i.id,i.name,i.category,i.unit,i.minimum,i.archived,p.id AS pending_lot,p.expiry AS pending_expiry FROM ac_items i LEFT JOIN ('.PENDING_BATCH_SQL.') p ON p.item_id=i.id ORDER BY i.name'),
            'lots'=>rows($db,'SELECT id,item_id,expiry,balance FROM ac_lots WHERE balance>0 ORDER BY expiry IS NULL,expiry,id'),
            'moves'=>rows($db,'SELECT m.id,m.item_id,m.delta,m.after_qty,m.type,m.note,m.created,u.name AS actor FROM ac_moves m JOIN ac_users u ON u.id=m.user_id ORDER BY m.created DESC,m.id DESC'),
            'lines'=>rows($db,'SELECT x.move_id,x.lot_id,x.delta,l.expiry FROM ac_lines x JOIN ac_lots l ON l.id=x.lot_id ORDER BY x.move_id,x.lot_id'),
            'team'=>$owner?rows($db,"SELECT id,name,username,role,active FROM ac_users WHERE username<>'sample.ledger' ORDER BY id"):[]];
        $db->commit(); respond($result);
    }
    if($action!=='move' && !$owner) reject('This action requires an owner account.',403);
    $db->beginTransaction();
    switch($action) {
        case 'move': recordMove($db,$v,(int)$user['id'],$user['role']); break;
        case 'item':
            $name=field($v['name']??'',100,'item name');
            $category=$v['category']??''; $unit=$v['unit']??'';
            if(!in_array($category,CATEGORIES,true) || !in_array($unit,UNITS,true)) reject('Select a valid category and unit.');
            $min=units($v['minimum']??'',$unit); $id=(int)($v['id']??0);
            if($id) {
                $item=rows($db,'SELECT * FROM ac_items WHERE id=? FOR UPDATE',[$id])[0]??null;
                if(!$item) reject('Item not found.',404);
                if(!empty($item['archived'])) reject('Restore this item before editing it.',409);
                if($unit!==$item['unit'] && rows($db,'SELECT id FROM ac_moves WHERE item_id=? LIMIT 1',[$id])) reject('Keep the original unit for items with movement history.');
                executeSql($db,'UPDATE ac_items SET name=?,category=?,unit=?,minimum=? WHERE id=?',[$name,$category,$unit,$min,$id]);
            } else {
                $expiry=expiryDate($v['expiry']??null);
                executeSql($db,'INSERT INTO ac_items(name,category,unit,minimum) VALUES (?,?,?,?)',[$name,$category,$unit,$min]);
                if($expiry!==null) {
                    $itemId=(int)$db->lastInsertId();
                    executeSql($db,'INSERT INTO ac_lots(item_id,expiry,balance) VALUES (?,?,0)',[$itemId,$expiry]);
                }
            }
            break;
        case 'archive': case 'restore': case 'delete_item':
            $id=(int)($v['id']??0);
            $item=rows($db,'SELECT id FROM ac_items WHERE id=? FOR UPDATE',[$id]);
            if(!$item) reject('Item no longer exists.',404);
            if($action==='delete_item') {
                if(rows($db,'SELECT id FROM ac_moves WHERE item_id=? LIMIT 1',[$id]) ||
                   rows($db,'SELECT id FROM ac_lots WHERE item_id=? AND balance<>0 LIMIT 1',[$id])) {
                    reject('This item has stock or movement history. Archive it instead.',409);
                }
                executeSql($db,'DELETE FROM ac_lots WHERE item_id=?',[$id]);
                executeSql($db,'DELETE FROM ac_items WHERE id=?',[$id]);
            } else {
                executeSql($db,'UPDATE ac_items SET archived=? WHERE id=?',[$action==='archive'?1:0,$id]);
            }
            break;
        case 'staff':
            if(strtolower(trim($v['username']??''))==='sample.ledger') reject('Choose another username.');
            createAccount($db,$v,'Staff'); break;
        case 'access':
            $id=(int)($v['id']??0);
            $staff=rows($db,"SELECT id FROM ac_users WHERE id=? AND role='Staff' AND username<>'sample.ledger' FOR UPDATE",[$id]);
            if(!$staff) reject('Select a staff account.');
            executeSql($db,'UPDATE ac_users SET active=? WHERE id=?',[($v['active']??false)===true?1:0,$id]); break;
        default: reject('Action not found.',404);
    }
    $db->commit(); respond(['ok'=>true]);
} catch(Throwable $e) {
    if($db && $db->inTransaction()) $db->rollBack();
    $status=$e instanceof FormError?$e->getCode():500;
    $message=$e instanceof FormError?$e->getMessage():'Could not complete the request. Check that MySQL is running and app/config.php matches your local database settings.';
    if($e instanceof PDOException && (int)($e->errorInfo[1]??0)===1062) { $status=409; $message='That item name, username or entry already exists.'; }
    if($status===500) error_log('About Coffee: '.$e->getMessage());
    http_response_code($status); respond(['error'=>$message]);
}
