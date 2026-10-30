<?php
declare(strict_types=1);

// Plain PHP endpoint: works in the web root and in any subdirectory, without rewrites.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function loadRecords(string $filename): array
{
    if (!is_file($filename)) {
        return [];
    }
    $contents = file_get_contents($filename);
    if ($contents === false) {
        throw new RuntimeException('Highscore-Datei kann nicht gelesen werden.');
    }
    $records = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($records) || !array_is_list($records)) {
        throw new RuntimeException('Ungültige Highscore-Datei.');
    }
    return $records;
}

function validValue($value): bool
{
    return is_int($value) && $value >= 0 && $value <= 1000000000000;
}

$lock = null;
$temporary = null;
try {
    $games = json_decode((string) file_get_contents(__DIR__ . '/games.json'), true, 512, JSON_THROW_ON_ERROR);
    foreach ($games as $id => $config) {
        if (!in_array($config['metric'] ?? '', ['time', 'moves', 'points'], true)
            || !in_array($config['order'] ?? '', ['asc', 'desc'], true)) {
            throw new RuntimeException('Ungültige Spiele-Konfiguration.');
        }
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? 'scores';
    if ($action === 'games') {
        if ($method !== 'GET') {
            header('Allow: GET');
            respond(405, ['error' => 'Methode nicht erlaubt']);
        }
        $catalog = [];
        foreach ($games as $id => $config) {
            if (is_file(dirname(__DIR__) . '/' . $id . '/index.html')) {
                $catalog[] = array_merge(['id' => $id], $config);
            }
        }
        usort($catalog, static fn(array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));
        respond(200, $catalog);
    }
    if ($action !== 'scores') {
        respond(404, ['error' => 'Unbekannte Aktion']);
    }
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        respond(405, ['error' => 'Methode nicht erlaubt']);
    }

    $record = null;
    if ($method === 'POST') {
        if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
            respond(403, ['error' => 'Fremde Herkunft']);
        }
        if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
            respond(415, ['error' => 'JSON erwartet']);
        }
        $body = file_get_contents('php://input', false, null, 0, 4097);
        if ($body === false) {
            respond(400, ['error' => 'Anfrage nicht lesbar']);
        }
        if (strlen($body) > 4096) {
            respond(413, ['error' => 'Anfrage zu groß']);
        }
        try {
            $input = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            respond(400, ['error' => 'Ungültiges JSON']);
        }
        if (!is_array($input)) {
            respond(400, ['error' => 'Ungültiges Ergebnis']);
        }
        $game = $input['game'] ?? null;
        $level = $input['level'] ?? null;
        $name = $input['name'] ?? null;
        $submissionId = $input['submissionId'] ?? null;
        if (!is_string($game) || !isset($games[$game]) || !is_string($level)
            || !preg_match('/\A(?:[1-9][0-9]{0,3}|easy|medium|hard|expert|random)\z/', $level)
            || !is_string($name) || trim($name) === ''
            || preg_match_all('/./us', trim($name)) > 30 || preg_match('/[\x00-\x1f\x7f]/u', $name)
            || !is_string($submissionId) || !preg_match('/\A[A-Za-z0-9_-]{16,80}\z/', $submissionId)) {
            respond(400, ['error' => 'Spiel, Level oder Spielername ungültig']);
        }
        foreach (['time', 'moves', 'points'] as $metric) {
            if (array_key_exists($metric, $input) && !validValue($input[$metric])) {
                respond(400, ['error' => 'Ungültiger Messwert']);
            }
        }
        if (!validValue($input['time'] ?? null) || !validValue($input[$games[$game]['metric']] ?? null)) {
            respond(400, ['error' => 'Messwert fehlt']);
        }
        $record = [
            'game' => $game, 'level' => $level, 'name' => trim($name),
            'submissionId' => $submissionId, 'time' => $input['time'],
            'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
        foreach (['moves', 'points'] as $metric) {
            if (isset($input[$metric])) {
                $record[$metric] = $input[$metric];
            }
        }
    } else {
        $game = $_GET['game'] ?? null;
        $level = $_GET['level'] ?? '';
        if (!is_string($game) || !isset($games[$game]) || !is_string($level)) {
            respond(400, ['error' => 'Unbekanntes Spiel oder ungültiges Level']);
        }
    }

    // A separate lock stays valid while the JSON file is replaced atomically.
    // All PHP workers use this same lock for reads and writes.
    $directory = getenv('HIGHSCORE_DATA_DIR') ?: dirname(__DIR__) . '/data';
    if (!is_dir($directory) && !@mkdir($directory, 0770, true) && !is_dir($directory)) {
        throw new RuntimeException('Datenverzeichnis kann nicht angelegt werden.');
    }
    $filename = $directory . '/highscores.json';
    $lock = @fopen($directory . '/highscores.lock', 'c');
    if ($lock === false || !flock($lock, $method === 'POST' ? LOCK_EX : LOCK_SH)) {
        throw new RuntimeException('Datenverzeichnis ist nicht beschreibbar oder nicht sperrbar.');
    }
    $records = loadRecords($filename);
    $status = 200;
    if ($record !== null) {
        $exists = false;
        foreach ($records as $existing) {
            if ($existing['submissionId'] === $record['submissionId']) {
                $exists = true;
                break;
            }
        }
        if (!$exists) {
            $records[] = $record;
            $json = json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
            $temporary = tempnam($directory, 'highscore-');
            if ($temporary === false || file_put_contents($temporary, $json) !== strlen($json)
                || !rename($temporary, $filename)) {
                throw new RuntimeException('Highscore-Datei kann nicht gespeichert werden.');
            }
            $temporary = null;
            $status = 201;
        }
        $response = ['saved' => true];
    } else {
        $config = $games[$game];
        $levels = [];
        $entries = [];
        foreach ($records as $existing) {
            if ($existing['game'] !== $game) {
                continue;
            }
            $levels[] = $existing['level'];
            if ($existing['level'] === $level) {
                $entries[] = $existing;
            }
        }
        $levels = array_values(array_unique($levels));
        usort($levels, 'strnatcmp');
        usort($entries, static function (array $a, array $b) use ($config): int {
            return (($a[$config['metric']] <=> $b[$config['metric']]) * ($config['order'] === 'desc' ? -1 : 1))
                ?: ($a['time'] <=> $b['time']) ?: strcmp($a['createdAt'], $b['createdAt']);
        });
        $response = array_merge(['game' => $game], $config, ['levels' => $levels, 'entries' => array_slice($entries, 0, 10)]);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    $lock = null;
    respond($status, $response);
} catch (Throwable $error) {
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
    if (is_string($temporary) && is_file($temporary)) {
        unlink($temporary);
    }
    error_log('Highscore: ' . $error->getMessage());
    respond(500, ['error' => 'Highscore-Dienst nicht verfügbar. Bitte Serverkonfiguration und Schreibrechte prüfen.']);
}
