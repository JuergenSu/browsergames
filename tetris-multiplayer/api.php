<?php
declare(strict_types=1);

// Short requests and a locked JSON file: no daemon, database or WebSocket needed.
const TETRIS_TTL = 12;
const TETRIS_EVENTS_TTL = 30;
const TETRIS_MAX_PLAYERS = 100;

function tetrisName($value): string {
    if (!is_string($value) || trim($value) === '' || strlen($value) > 120
        || preg_match('//u', $value) !== 1 || preg_match_all('/./us', trim($value)) > 30
        || preg_match('/[\x00-\x1f\x7f]/u', $value)) {
        throw new InvalidArgumentException('Bitte einen Namen mit 1–30 Zeichen eingeben.');
    }
    return trim($value);
}

function tetrisState(): array { return ['seq'=>0, 'players'=>[], 'events'=>[]]; }

function tetrisHandle(array &$state, array $input, int $now): array {
    foreach ($state['players'] as $token=>$player) {
        if ($player['seen'] <= $now - TETRIS_TTL) unset($state['players'][$token]);
    }
    $state['events'] = array_values(array_filter($state['events'], static fn($event) => $event['time'] > $now - TETRIS_EVENTS_TTL));
    $action = $input['action'] ?? '';
    if ($action === 'join') {
        $name = tetrisName($input['name'] ?? null);
        if (count($state['players']) >= TETRIS_MAX_PLAYERS) return ['status'=>503,'error'=>'Der Raum ist gerade voll. Singleplayer bleibt verfügbar.'];
        $token=bin2hex(random_bytes(24));$id=bin2hex(random_bytes(8));
        $state['players'][$token]=['id'=>$id,'name'=>$name,'seen'=>$now,'start'=>$state['seq'],'recent'=>[],'lastAttack'=>0];
        return ['token'=>$token,'id'=>$id,'cursor'=>$state['seq'],'players'=>tetrisRoster($state)];
    }
    $token=$input['token'] ?? null;
    if (!is_string($token) || !isset($state['players'][$token])) return ['status'=>410,'error'=>'Verbindung abgelaufen. Bitte neu verbinden.'];
    if ($action === 'leave') { unset($state['players'][$token]); return ['left'=>true]; }
    if (!in_array($action,['poll','clear'],true)) return ['status'=>400,'error'=>'Unbekannte Aktion.'];
    $player=&$state['players'][$token];
    if (isset($input['name'])) $player['name']=tetrisName($input['name']);
    $player['seen']=$now;
    if ($action === 'clear') {
        $lines=$input['lines'] ?? null;$eventId=$input['eventId'] ?? null;
        if (!is_int($lines) || $lines<1 || $lines>4 || !is_string($eventId) || !preg_match('/\A[a-zA-Z0-9_-]{16,80}\z/', $eventId)) {
            return ['status'=>400,'error'=>'Ungültige Reihenanzahl oder Nachrichten-ID.'];
        }
        if (isset($player['recent'][$eventId])) return ['accepted'=>true,'duplicate'=>true];
        // At most one clear per second per player; bounded storage even for bad clients.
        if ($player['lastAttack'] === $now) return ['status'=>429,'error'=>'Bitte kurz warten.'];
        $recipients=[];
        foreach ($state['players'] as $other) if ($other['id'] !== $player['id']) $recipients[]=$other['id'];
        $seq=++$state['seq'];
        $state['events'][]=['seq'=>$seq,'sender'=>$player['id'],'name'=>$player['name'],'lines'=>$lines,'rows'=>intdiv($lines,2),'recipients'=>$recipients,'time'=>$now];
        $player['recent'][$eventId]=$seq;
        if(count($player['recent'])>64) array_shift($player['recent']);
        $player['lastAttack']=$now;
        return ['accepted'=>true];
    }
    $after=$input['after'] ?? null;
    if (!is_int($after) || $after<0 || $after>$state['seq']) return ['status'=>400,'error'=>'Ungültiger Nachrichtenstand.'];
    $after=max($after,$player['start']);
    $events=[];
    foreach ($state['events'] as $event) {
        if($event['seq']<=$after || !in_array($player['id'],$event['recipients'],true)) continue;
        $events[]=['seq'=>$event['seq'],'name'=>$event['name'],'lines'=>$event['lines'],'rows'=>$event['rows']];
    }
    return ['cursor'=>$state['seq'],'players'=>tetrisRoster($state),'events'=>$events];
}

function tetrisRoster(array $state): array {
    $players=[];
    foreach($state['players'] as $player) $players[]=['id'=>$player['id'],'name'=>$player['name']];
    return $players;
}

// Tests can call the same room logic with a controlled clock, without HTTP.
if (defined('TETRIS_API_LIBRARY')) return;
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function tetrisReply(int $status,array $body): never {
    http_response_code($status);echo json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST');tetrisReply(405,['error'=>'POST erwartet.']); }
if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') tetrisReply(403,['error'=>'Fremde Herkunft.']);
if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') tetrisReply(415,['error'=>'JSON erwartet.']);
$lock=null;$temp=null;
try {
    $body=file_get_contents('php://input',false,null,0,4097);
    if($body===false||strlen($body)>4096)tetrisReply(413,['error'=>'Anfrage zu groß.']);
    $input=json_decode($body,true,16,JSON_THROW_ON_ERROR);
    if(!is_array($input))tetrisReply(400,['error'=>'Ungültige Anfrage.']);
    $dir=getenv('TETRIS_DATA_DIR') ?: dirname(__DIR__).'/data/tetris-multiplayer';
    if(!is_dir($dir)&&!@mkdir($dir,0770,true)&&!is_dir($dir))throw new RuntimeException('Storage directory');
    $lock=@fopen($dir.'/room.lock','c');
    if(!$lock||!flock($lock,LOCK_EX))throw new RuntimeException('Storage lock');
    $file=$dir.'/room.json';$state=tetrisState();
    if(is_file($file)){
        $state=json_decode((string)file_get_contents($file),true,64,JSON_THROW_ON_ERROR);
        if(!is_array($state)||!isset($state['seq'],$state['players'],$state['events']))throw new RuntimeException('Invalid room');
    }
    $result=tetrisHandle($state,$input,time());
    $json=json_encode($state,JSON_THROW_ON_ERROR);
    $temp=tempnam($dir,'room-');
    if(!$temp||file_put_contents($temp,$json)!==strlen($json)||!rename($temp,$file))throw new RuntimeException('Storage write');
    $temp=null;flock($lock,LOCK_UN);fclose($lock);$lock=null;
    $status=$result['status']??200;unset($result['status']);tetrisReply($status,$result);
} catch (Throwable $e) {
    if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}
    if(is_string($temp)&&is_file($temp))unlink($temp);
    if($e instanceof InvalidArgumentException||$e instanceof JsonException)tetrisReply(400,['error'=>'Ungültige Anfrage oder Spielername.']);
    error_log('Tetris: '.$e->getMessage());tetrisReply(503,['error'=>'Multiplayer nicht erreichbar. Singleplayer bleibt verfügbar.']);
}
