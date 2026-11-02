(() => {
  const game = document.querySelector('#game'), level = document.querySelector('#level'), message = document.querySelector('#message');
  let generation = 0;
  const label = value => ({ easy:'Leicht',medium:'Mittel',hard:'Schwer',expert:'Experte',random:'Zufallsrätsel' }[value] || 'Level ' + value);
  const time = ms => { const s = Math.floor(ms/1000); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`; };
  async function load(reset = false) {
    const request = ++generation, selected = game.value;
    message.textContent = 'Highscores werden geladen …';
    document.querySelector('#scores').replaceChildren();
    try {
      const response = await fetch(`highscore/api.php?action=scores&game=${encodeURIComponent(selected)}&level=${encodeURIComponent(reset ? '' : level.value)}`);
      if (!response.ok) throw new Error();
      const data = await response.json(); if (request !== generation) return;
      if (reset) {
        const values = [...new Set([...Array.from({length:selected === 'hitori' ? 124 : 24},(_,i)=>String(i+1)), 'random', ...data.levels])];
        if (['patches','queens','zip'].includes(selected)) values.splice(0,values.length,...new Set(['easy','medium','hard',...data.levels]));
        if (selected === 'tetris-puzzle') values.splice(0,values.length,'random');
        level.replaceChildren(...values.map(value => new Option(selected === 'tetris-puzzle' ? 'Endlosmodus' : label(value),value)));
        document.querySelector('#play').href = encodeURIComponent(selected) + '/index.html';
        return load();
      }
      document.querySelector('#metric').textContent = ({ time:'Zeit',moves:'Züge',points:'Punkte' }[data.metric]) + (data.order === 'desc' ? ' ↓ mehr ist besser' : ' ↑ weniger ist besser');
      for (const [index, entry] of data.entries.entries()) {
        const row = document.createElement('tr');
        for (const value of [index+1,entry.name,data.metric === 'time' ? time(entry.time) : entry[data.metric] + ' · ' + time(entry.time),new Date(entry.createdAt).toLocaleString('de-DE')]) {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        }
        document.querySelector('#scores').append(row);
      }
      message.textContent = data.entries.length ? `Top ${data.entries.length} · ${selected === 'tetris-puzzle' ? 'Endlosmodus' : label(level.value)}` : 'Hier gibt es noch keine Ergebnisse. Spiele die erste Runde!';
    } catch { if (request === generation) message.textContent = 'Highscores sind gerade nicht erreichbar. Bitte erneut aktualisieren.'; }
  }
  game.addEventListener('change', () => load(true)); level.addEventListener('change', () => load()); document.querySelector('#refresh').addEventListener('click', () => load());
  (async () => {
    try {
      const response = await fetch('highscore/api.php?action=games'); if (!response.ok) throw new Error();
      const games = await response.json();
      const available = games.filter(g => g.metric);
      game.replaceChildren(...available.map(g => new Option(g.name,g.id)));
      const requestedGame = new URLSearchParams(location.search).get('game');
      if (available.some(g => g.id === requestedGame)) game.value = requestedGame;
      await load(true);
    } catch { message.textContent = 'Spiele konnten nicht geladen werden. Bitte lade die Seite neu.'; }
  })();
})();


