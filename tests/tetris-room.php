<?php
declare(strict_types=1);
define('TETRIS_API_LIBRARY',true);
require __DIR__.'/../tetris-multiplayer/api.php';
$count=0;
function check(bool $condition,string $message): void { global $count;$count++;if(!$condition)throw new RuntimeException($message); }
function joinPlayer(array &$state,string $name,int $now): array {return tetrisHandle($state,['action'=>'join','name'=>$name],$now);}
function pollPlayer(array &$state,array $player,int $after,int $now): array {return tetrisHandle($state,['action'=>'poll','token'=>$player['token'],'after'=>$after],$now);}
function attackPlayer(array &$state,array $player,int $lines,string $id,int $now): array {return tetrisHandle($state,['action'=>'clear','token'=>$player['token'],'lines'=>$lines,'eventId'=>$id],$now);}
$s=tetrisState();$alice=joinPlayer($s,'Alice',1000);$bob=joinPlayer($s,'Bob',1000);
check(count($bob['players'])===2,'both players visible');
check(!array_key_exists('token',$bob['players'][0]),'roster must never expose session tokens');
for($lines=1;$lines<=4;$lines++){
 $result=attackPlayer($s,$alice,$lines,'event-id-0000000'.$lines,1000+$lines);
 check(($result['accepted']??false)===true,'valid clear accepted');
 $poll=pollPlayer($s,$bob,$lines-1,1000+$lines);
 check(count($poll['events'])===1,'exactly one event received');
 check($poll['events'][0]['rows']===intdiv($lines,2),'floor half of cleared lines');
 check($poll['events'][0]['name']==='Alice','sender name retained');
 check(count(pollPlayer($s,$alice,0,1000+$lines)['events'])===0,'no self attacks');
}
$repeat=attackPlayer($s,$alice,4,'event-id-00000004',1005);
check(($repeat['duplicate']??false)===true&&$s['seq']===4,'retry does not duplicate attack');
check(count(pollPlayer($s,$bob,3,1005)['events'])===1,'unacknowledged event can be replayed');
check(count(pollPlayer($s,$bob,4,1005)['events'])===0,'acknowledged event is not replayed');
$late=joinPlayer($s,'Late joiner',1005);check($late['cursor']===4,'late join starts at current cursor');
check(count(pollPlayer($s,$late,0,1005)['events'])===0,'late join gets no historical garbage');
tetrisHandle($s,['action'=>'leave','token'=>$bob['token']],1005);
check((pollPlayer($s,$bob,4,1005)['status']??0)===410,'left session is invalid');
$rejoined=joinPlayer($s,'Bob',1005);check($rejoined['id']!==$bob['id'],'rejoining uses a fresh player identity');
check(count(pollPlayer($s,$rejoined,0,1005)['events'])===0,'rejoined player gets no old attacks');
$invalid=attackPlayer($s,$alice,5,'invalid-event-0001',1006);check(($invalid['status']??0)===400,'reject impossible line counts');
$invalid=attackPlayer($s,$alice,2,'bad',1006);check(($invalid['status']??0)===400,'reject invalid event IDs');
$accepted=attackPlayer($s,$alice,2,'valid-event-000001',1006);check(($accepted['accepted']??false)===true,'new attack accepted');
$limited=attackPlayer($s,$alice,2,'valid-event-000002',1006);check(($limited['status']??0)===429,'rate limit protects storage');
$injected=joinPlayer($s,'<script>alert(1)</script>',1006);check($injected['players'][count($injected['players'])-1]['name']==='<script>alert(1)</script>','names are plain data; client renders as text');
foreach(['',str_repeat('x',31),"bad\nname"] as $name){$thrown=false;try{joinPlayer($s,$name,1006);}catch(InvalidArgumentException $e){$thrown=true;}check($thrown,'reject invalid names');}
$stale=tetrisState();$one=joinPlayer($stale,'One',2000);$two=joinPlayer($stale,'Two',2000);
$roster=pollPlayer($stale,$one,0,2011);check(count($roster['players'])===2,'heartbeat keeps active session alive');
$roster=pollPlayer($stale,$one,0,2012);check(count($roster['players'])===1,'disconnected peer expires after 12 seconds');
check((pollPlayer($stale,$two,0,2012)['status']??0)===410,'expired client must rejoin');
$cap=tetrisState();for($i=0;$i<TETRIS_MAX_PLAYERS;$i++)joinPlayer($cap,'Player '.$i,3000);
check((joinPlayer($cap,'Overflow',3000)['status']??0)===503,'room population is bounded');
echo "$count PHP room checks passed\n";
