# Spielewelt mit PHP-Highscores

## Deployment durch Kopieren

Voraussetzung: PHP ab Version 8.1 (64 Bit) und ein Webserver mit PHP-Unterstützung.
Keine Datenbank, kein Composer, keine zusätzlichen Pakete und kein Build notwendig.

1. Den gesamten Projektordner einschließlich `data/.htaccess` auf den PHP-Webspace kopieren. Das Projekt funktioniert auch in einem Unterverzeichnis wie `/games/`.
2. Dem PHP-Prozess Schreibrechte für `data/` geben. Die Rechte müssen auch das Anlegen und Umbenennen von Dateien erlauben; keine pauschalen 777-Rechte nötig.
3. Die Projektadresse beziehungsweise `index.php` öffnen. Die vorhandene PHP-Seite erkennt Spielordner automatisch und enthält die Namenseingabe und den Link zu `highscores.html`.

Die API ist direkt über `highscore/api.php` erreichbar. URL-Rewriting und ein separater Anwendungsserver sind nicht erforderlich. JavaScript läuft nur im Browser für Spiele, Cookie-Verwaltung und API-Aufrufe; der Dienst läuft in PHP.

Falls eine frühere Version bereits auf dem Webspace liegt, deren `index.html`, `server.js`, `package.json` und `highscore/home.js` entfernen. Insbesondere darf eine alte `index.html` die PHP-Startseite nicht überdecken. Bei einem späteren Update vorhandene Highscore-Daten in `data/` erhalten.

## JSON-Datei und Zugriffsschutz

Beim ersten Ergebnis entsteht `data/highscores.json`; beim Zugriff wird zusätzlich `data/highscores.lock` angelegt. Alle PHP-Prozesse verwenden dieselbe Dateisperre. Geschrieben wird zuerst in eine temporäre Datei und dann durch Umbenennen, damit parallele Übertragungen keine Ergebnisse überschreiben. Das Datenverzeichnis muss auf einem Dateisystem liegen, das `flock` und atomare Umbenennungen unterstützt.

Unter Apache 2.4 verhindert die mitgelieferte `data/.htaccess` öffentliche Zugriffe auf das Datenverzeichnis, sofern der Hoster diese Regeln zulässt (`AllowOverride`). Für IIS liegt eine `data/web.config` bei, die die Dateiauslieferung sperrt. Bei nginx oder deaktivierten `.htaccess`-Regeln das Datenverzeichnis in der Webserver-Konfiguration sperren, z. B. bei Deployment unter `/games/`:

```nginx
location ^~ /games/data/ { deny all; }
```

Alternativ kann `HIGHSCORE_DATA_DIR` als Server-Umgebungsvariable auf ein beschreibbares Verzeichnis außerhalb des öffentlichen Webverzeichnisses zeigen. Der Pfad wird ausschließlich serverseitig konfiguriert. Die JSON-Datei regelmäßig sichern; sie ist von Git ausgeschlossen.

## Bedienung

Der Spielername (1–30 Zeichen) wird für ein Jahr als Cookie gespeichert und kann auf der Startseite, in den Spielen und in der Highscore-Ansicht geändert werden. Bereits gespeicherte Einträge behalten ihren bisherigen Namen.

Alle 19 Spiele übermitteln nach Abschluss einer Runde ihre Zeit in Millisekunden und, soweit vorhanden, Züge oder Punkte. Ohne Namen wartet das Ergebnis auf die Eingabe. Bei Verbindungsproblemen lässt es sich mit „Erneut senden“ erneut übertragen, ohne einen doppelten Eintrag anzulegen. Wartende Ergebnisse bleiben bis zum Verlassen der Seite im Arbeitsspeicher. Nach dem Speichern des Namens erscheint nur „Hallo <Spielername>“ mit einem Stift zum Ändern; der Highscore-Link steht separat daneben.

`highscores.html` zeigt die besten zehn Runden je Spiel und Level bzw. Schwierigkeitsgrad. Jede Runde zählt; ein Name kann mehrfach vorkommen. Bei gleicher Hauptwertung entscheidet die Zeit, danach der frühere Eintrag. Zufallsrunden sind eine eigene Kategorie und wegen unterschiedlicher Rätsel nur eingeschränkt vergleichbar.

## Weitere Spiele ergänzen

1. Spielordner mit `index.html` anlegen.
2. Das Spiel in `highscore/games.json` registrieren, beispielsweise:

```json
"mein-spiel": { "name": "Mein Spiel", "metric": "points", "order": "desc" }
```

Mögliche Hauptwertungen sind `time`, `moves`, `points`; `asc` bedeutet weniger ist besser, `desc` mehr ist besser. Die Konfiguration wird bei jedem API-Aufruf geladen. Ein Serverneustart ist nicht erforderlich.

3. Nach dem öffnenden Body und vor dem Spielskript den Client laden:

```html
<script src="../highscore/client.js"></script>
```

4. Einmal beim erfolgreichen Abschluss aufrufen:

```js
window.Highscore?.submit({
  game: 'mein-spiel', level: 1,
  time: 12345, // Millisekunden, immer erforderlich
  points: 900, moves: 20 // weitere Werte nach Bedarf
});
```

Level sind positive Zahlen bis 9999 oder `easy`, `medium`, `hard`, `expert`, `random`. Alle Messwerte sind nichtnegative ganze Zahlen; die konfigurierte Hauptwertung muss enthalten sein.

## PHP-API

- `GET highscore/api.php?action=games`: registrierte Spiele mit Wertung.
- `GET highscore/api.php?action=scores&game=zip&level=easy`: Top 10 und vorhandene Level.
- `POST highscore/api.php?action=scores`: JSON mit `game`, `level` (String), `time`, Hauptwertung, `name` und eindeutiger `submissionId`. Der Browser-Client erzeugt diese ID automatisch und verwendet sie bei einer Wiederholung erneut. Neue Einträge liefern HTTP 201, Wiederholungen HTTP 200.

Namen sind keine authentifizierten Identitäten. Der Dienst prüft die Datenformate, aber nicht die vom Browser gemeldete Spielleistung.


## Netwalk, Skyscrapers und Sokoban

Drei weitere Spiele sind über die automatisch aktualisierte Startseite erreichbar:

- `netwalk/index.html`: 24 feste Leitungsrätsel in 4×4, 5×5 und 6×6. Drehen per Klick, Fixieren per Rechtsklick oder Umschalt + Klick. Wertung nach Zügen.
- `skyscrapers/index.html`: 24 eindeutig lösbare Skyline-Rätsel in 4×4, 5×5 und 6×6. Zahlen per Bildschirmtasten oder Tastatur, Regelprüfung ohne Lösungsverrat. Wertung nach Zeit.
- `sokoban/index.html`: 24 feste, lösbare Lagerhallen mit zwei bis vier Kisten. Steuerung per Pfeiltasten, WASD, Bildschirmtasten oder benachbartem Feld. Wertung nach Schritten; Rückgängig zählt zusätzlich als Zug.

Die gemeinsamen Dateien in `puzzle/` müssen mitkopiert werden. Keine zusätzlichen Laufzeitpakete und kein Build erforderlich. Die Uhr startet bei der ersten Änderung bzw. Bewegung; Rückgängig lässt sie weiterlaufen. Neustart setzt die Runde zurück. Gewonnene Level werden je Spiel lokal im Browser gespeichert. Ein Ergebnis wird pro gewonnener Runde genau einmal an den vorhandenen Highscore-Client übergeben.

Die Netwalk-Level entstehen aus zusammenhängenden Bäumen; es gibt keinen Randüberlauf. Skyscrapers prüft bei der Erzeugung die Eindeutigkeit mit einem Lösungszähler. Sokoban-Level werden durch umgekehrte gültige Schubfolgen erzeugt; eine vollständige Lösungsfolge wird für die automatischen Tests mitgeführt.

### Entwicklung und Prüfungen

Lokal mit PHP ab 8.1 starten: `php -S 127.0.0.1:8000 -t .`. Für lokale Tests der Highscores kann `HIGHSCORE_DATA_DIR` auf ein beschreibbares Verzeichnis außerhalb des Projektordners gesetzt werden. Der PHP-Entwicklungsserver ist nur für lokale Entwicklung gedacht.

Die Regeltests laufen ohne Zusatzpakete mit Node.js ab Version 18:

```sh
node --test tests/engines.test.cjs
```

Optionale Browserprüfungen benötigen Playwright und dessen Chromium-Browser. Eine laufende Vorschau über `GAMES_URL` angeben:

```sh
GAMES_URL=http://127.0.0.1:8000 node --test tests/browser.test.cjs
```

## Tetris Puzzle

`tetris-puzzle/index.html` ist ein Blockpuzzle auf einem 10×10-Feld. Die sieben klassischen Tetrominos werden einzeln angeboten, lassen sich kostenlos drehen und werden per Klick oder Touch mit ihrer linken oberen Ecke am gewählten Feld platziert. Es gibt keine Schwerkraft und kein Zeitlimit. Tastatur: mit Tab ins Feld, Pfeiltasten zur Auswahl, Enter oder Leertaste zum Platzieren, R zum Drehen.

Vollständige Zeilen und Spalten werden gleichzeitig entfernt, ohne dass andere Steine nachrücken. Jedes tatsächlich entfernte Feld zählt genau einmal: eine Linie = 10 Punkte, eine sich kreuzende Zeile und Spalte = 19 Punkte. Platzierte Steine allein bringen keine Punkte. Die Runde endet, sobald der nächste Stein in keiner seiner Drehungen mehr platziert werden kann. Es gibt keine Möglichkeit, Steine zu überspringen.

Der persönliche Rekord wird lokal gespeichert; bei gesperrtem Browserspeicher bleibt das Spiel spielbar. Nach Rundenende übergibt das Spiel genau einmal Punkte, Anzahl platzierter Steine und Zeit an den bestehenden Highscore-Client (`game: tetris-puzzle`, `level: random`). Die Highscores zeigen ausschließlich den Endlosmodus; mehr Punkte sind besser. Die sieben Steinformen werden in gemischten Siebenergruppen gezogen.

Das Spiel verwendet `puzzle/style.css` sowie die Dateien im Verzeichnis `tetris-puzzle/`. Die Startseite erkennt den Spielordner und sein SVG-Titelbild automatisch. Kein Build und keine zusätzlichen Laufzeitpakete nötig.

Zusätzliche Regel- und Oberflächentests ohne Zusatzpakete:

```sh
node --test tests/block-puzzle.test.cjs tests/block-puzzle-ui.test.cjs
```
