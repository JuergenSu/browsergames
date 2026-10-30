<?php
declare(strict_types=1);

/**
 * Spiele-Übersicht
 * Diese Datei in /games/index.php ablegen. Spielordner mit index.html
 * werden automatisch erkannt. Das Kachelbild liegt im Ordner unter titel.jpg.
 */

function escapeHtml(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function displayName(string $directory): string
{
    if (strcasecmp($directory, 'zip') === 0) {
        return 'ZIP';
    }

    $title = str_replace(array('-', '_'), ' ', $directory);
    return ucwords($title);
}

$games = array();
$directories = scandir(__DIR__);

if ($directories !== false) {
    foreach ($directories as $directory) {
        if ($directory === '.' || $directory === '..' || $directory[0] === '.') {
            continue;
        }

        $directoryPath = __DIR__ . DIRECTORY_SEPARATOR . $directory;
        if (!is_dir($directoryPath) || is_link($directoryPath) || !is_file($directoryPath . DIRECTORY_SEPARATOR . 'index.html')) {
            continue;
        }

        $folderUrl = rawurlencode($directory) . '/';
        $imageExists = is_file($directoryPath . DIRECTORY_SEPARATOR . 'titel.jpg');

        $games[] = array(
            'name' => displayName($directory),
            'url' => $folderUrl . 'index.html',
            'image' => $imageExists ? $folderUrl . 'titel.jpg' : null,
        );
    }
}

usort($games, static function (array $a, array $b): int {
    return strnatcasecmp($a['name'], $b['name']);
});
?>
<!doctype html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#10192c">
    <meta name="description" content="Unsere Spielewelt: Wähle dein Lieblingsrätsel und spiele direkt im Browser.">
    <title>Unsere Spielewelt</title>
    <style>
        :root {
            color-scheme: dark;
            --bg: #10192c;
            --surface: #1b2940;
            --line: rgba(255,255,255,.11);
            --text: #f7f9ff;
            --muted: #a1aec4;
            --accent: #97b9ff;
        }

        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: var(--text);
            background:
                radial-gradient(ellipse at 15% 0%, rgba(91,114,205,.23), transparent 34%),
                radial-gradient(ellipse at 95% 85%, rgba(32,169,156,.12), transparent 34%),
                var(--bg);
        }

        .container { max-width: 1160px; margin: 0 auto; padding: 58px 26px 70px; }
        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 13px;
            border: 1px solid rgba(151,185,255,.24);
            border-radius: 999px;
            color: #b7c9ff;
            background: rgba(151,185,255,.08);
            font-size: 12px;
            font-weight: 750;
            letter-spacing: .04em;
        }
        .eyebrow::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #8fe5bc; }
        h1 { margin: 20px 0 11px; font-size: clamp(35px, 5vw, 58px); line-height: 1.05; letter-spacing: -.055em; }
        .intro { color: var(--muted); max-width: 650px; font-size: 16px; line-height: 1.7; margin: 0; }
        .section-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 44px 0 18px; }
        .section-top h2 { font-size: 19px; letter-spacing: -.02em; margin: 0; }
        .counter { color: #adbad0; font-size: 13px; font-weight: 700; }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); gap: 22px; }
        .game-card {
            display: block;
            overflow: hidden;
            color: inherit;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 19px;
            text-decoration: none;
            box-shadow: 0 14px 36px rgba(0,0,0,.13);
            transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
        }
        .game-card:hover, .game-card:focus-visible {
            transform: translateY(-5px);
            border-color: rgba(151,185,255,.5);
            box-shadow: 0 22px 46px rgba(0,0,0,.22);
        }
        .game-card:focus-visible { outline: 3px solid #b1c7ff; outline-offset: 4px; }
        .cover { position: relative; aspect-ratio: 16 / 10; overflow: hidden; background: linear-gradient(135deg, #37478b, #246b79 65%, #6b568f); }
        .cover img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .3s ease; }
        .game-card:hover .cover img { transform: scale(1.045); }
        .cover-fallback { height: 100%; display: grid; place-items: center; font-size: 70px; color: rgba(255,255,255,.84); }
        .cover::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(9,14,25,.15), transparent 50%); pointer-events: none; }
        .body { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 19px 20px; }
        .game-name { margin: 0; font-size: 21px; letter-spacing: -.03em; line-height: 1.2; }
        .game-sub { color: var(--muted); font-size: 12px; margin-top: 5px; }
        .arrow { display: grid; place-items: center; flex: 0 0 37px; height: 37px; border-radius: 11px; background: rgba(151,185,255,.11); color: var(--accent); font-size: 22px; transition: background .2s ease; }
        .game-card:hover .arrow { background: rgba(151,185,255,.22); }
        .empty { padding: 48px 20px; border-radius: 18px; border: 1px dashed rgba(255,255,255,.2); color: var(--muted); text-align: center; }
        .empty strong { display: block; color: var(--text); font-size: 18px; margin-bottom: 8px; }
        footer { color: #71839f; font-size: 12px; margin-top: 52px; }
        @media (max-width: 600px) {
            .container { padding: 35px 17px 45px; }
            .grid { grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 13px; }
            .body { padding: 14px 13px 16px; }
            .game-name { font-size: 18px; }
            .arrow { flex-basis: 31px; height: 31px; }
            .intro { font-size: 14px; }
            .section-top { margin-top: 35px; }
        }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
    </style>
<script defer src="highscore/client.js"></script></head>
<body>
<main class="container">
    <div class="eyebrow">SPIELEWELT</div>
    <h1>Was spielen wir heute?</h1>
    <p class="intro">Wähle ein Spiel aus und leg direkt los. Für eine kurze Denkpause, eine knifflige Herausforderung oder einfach eine Runde zwischendurch.</p>

    <div data-player-profile></div>
    <div class="section-top">
        <h2>Unsere Spiele</h2>
        <span class="counter"><?= count($games) ?> <?= count($games) === 1 ? 'Spiel' : 'Spiele' ?></span>
    </div>

    <?php if ($games): ?>
        <div class="grid">
            <?php foreach ($games as $game): ?>
                <a class="game-card" href="<?= escapeHtml($game['url']) ?>" aria-label="<?= escapeHtml($game['name']) ?> spielen">
                    <div class="cover">
                        <?php if ($game['image'] !== null): ?>
                            <img src="<?= escapeHtml($game['image']) ?>" alt="Titelbild von <?= escapeHtml($game['name']) ?>" loading="lazy">
                        <?php else: ?>
                            <div class="cover-fallback" aria-hidden="true">🎮</div>
                        <?php endif; ?>
                    </div>
                    <div class="body">
                        <div>
                            <h3 class="game-name"><?= escapeHtml($game['name']) ?></h3>
                            <div class="game-sub">Jetzt spielen</div>
                        </div>
                        <span class="arrow" aria-hidden="true">→</span>
                    </div>
                </a>
            <?php endforeach; ?>
        </div>
    <?php else: ?>
        <div class="empty"><strong>Noch keine Spiele gefunden</strong>Lege ein Spiel mit einer index.html in einem Unterordner dieses Verzeichnisses ab.</div>
    <?php endif; ?>

    <footer>Die Spielauswahl aktualisiert sich automatisch, sobald du einen neuen Spielordner hinzufügst.</footer>
</main>
</body>
</html>
