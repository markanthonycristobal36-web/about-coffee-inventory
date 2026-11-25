<?php
function seedInventory(PDO $db): void {
    executeSql($db,"INSERT INTO ac_users(name,username,password_hash,role,active) VALUES ('Sample ledger','sample.ledger',?,'Staff',0)",[password_hash(bin2hex(random_bytes(20)),PASSWORD_DEFAULT)]);
    $uid=(int)$db->lastInsertId();
    $records=[
        ['Assam black tea',0,'g',500,2400,90],['Jasmine green tea',0,'g',500,1700,75],
        ['Fresh whole milk',1,'mL',3000,2700,4],['Non-dairy creamer',1,'g',1000,4800,36],
        ['Black tapioca pearls',2,'g',1000,880,16],['Coconut jelly',2,'g',600,2200,6],
        ['Taro powder',3,'g',500,2300,52],['Wintermelon syrup',3,'mL',900,2400,38],
        ['Brown sugar syrup',4,'mL',900,2400,28],['Fructose syrup',4,'mL',500,1700,63],
        ['Clear cups · 16 oz',5,'pcs',100,98,null],['Wide paper straws',5,'pcs',100,650,null]
    ];
    $events=[];
    foreach($records as $i=>$r) {
        [$name,$cat,$unit,$min,$start,$days]=$r;
        executeSql($db,'INSERT INTO ac_items(name,category,unit,minimum) VALUES (?,?,?,?)',[$name,CATEGORIES[$cat],$unit,$min*1000]);
        $item=(int)$db->lastInsertId();
        $opening=$days===null?null:date('Y-m-d',strtotime("+$days days"));
        $events[]=[-12,'08:30',$item,'Stock in',$start,$opening,'Opening count'];
        for($d=6;$d>=0;$d--) {
            if(($i+$d)%3===0) $events[]=[-$d,'00:01',$item,'Stock out',$unit==='pcs'?6:65,null,'Drink preparation'];
            if(($i+2*$d)%8===0) $events[]=[-$d,'00:00',$item,'Stock in',$unit==='pcs'?5:80,$opening,'Delivery received'];
        }
    }
    usort($events,fn($a,$b)=>[$a[0],$a[1],$a[2]]<=>[$b[0],$b[1],$b[2]]);
    foreach($events as [$offset,$clock,$id,$type,$qty,$expiry,$note]) {
        $day=date('Y-m-d',strtotime("$offset days"));
        recordMove($db,['type'=>$type,'quantity'=>$qty,'item'=>$id,'key'=>bin2hex(random_bytes(16)),'expiry'=>$expiry,'note'=>$note],$uid,'Staff',$day.' '.$clock.':00');
    }
}
