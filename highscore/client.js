(() => {
  'use strict';
  const base = new URL('../', document.currentScript.src);
  const cookiePath = base.pathname;
  function getName() {
    try { return decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('spielewelt_name='))?.split('=').slice(1).join('=') || ''); }
    catch { return ''; }
  }
  const validName = name => name.trim() && [...name.trim()].length <= 30 && !/[\u0000-\u001f\u007f]/u.test(name);
  const panel = document.createElement('section');
  panel.className = 'highscore-profile';
  panel.setAttribute('aria-label', 'Spielername');
  panel.innerHTML = '<div class="highscore-greeting" hidden><span></span><button class="highscore-edit" type="button" aria-label="Spielername ändern" title="Spielername ändern"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5"/></svg></button></div><form><label>Dein Spielername <input name="player" maxlength="60" autocomplete="nickname" placeholder="Name eingeben" required></label><button>Speichern</button><button class="highscore-cancel" type="button" hidden>Abbrechen</button></form><p role="status" aria-live="polite"></p><button class="highscore-retry" type="button" hidden>Erneut senden</button>';
  const input = panel.querySelector('input');
  const form = panel.querySelector('form');
  const greeting = panel.querySelector('.highscore-greeting');
  const edit = panel.querySelector('.highscore-edit');
  const cancel = panel.querySelector('.highscore-cancel');
  const retry = panel.querySelector('.highscore-retry');
  input.value = getName();
  let pending = [];
  const status = message => { panel.querySelector('p').textContent = message; };
  function showProfile(editing = false) {
    const name = getName();
    const showForm = editing || !name;
    panel.classList.toggle('is-editing', showForm);
    form.hidden = !showForm;
    greeting.hidden = showForm;
    greeting.querySelector('span').textContent = `Hallo ${name}`;
    cancel.hidden = !name;
    input.value = name;
  }
  edit.addEventListener('click', () => { showProfile(true); input.focus(); input.select(); });
  cancel.addEventListener('click', () => { status(''); showProfile(); edit.focus(); });
  function resend() {
    const waiting = pending; pending = [];
    retry.hidden = true;
    waiting.forEach(result => send(result));
  }
  retry.addEventListener('click', resend);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!validName(input.value)) { status('Bitte 1–30 Zeichen ohne Steuerzeichen eingeben.'); return; }
    document.cookie = `spielewelt_name=${encodeURIComponent(input.value.trim())}; Max-Age=31536000; Path=${cookiePath}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    if (getName() !== input.value.trim()) { status('Bitte Cookies erlauben, damit der Name gespeichert werden kann.'); return; }
    status('');
    showProfile();
    edit.focus();
    resend();
  });
  showProfile();
  const account = document.createElement('div');
  account.className = 'highscore-account';
  account.append(panel);
  if (!location.pathname.endsWith('/highscores.html') && !document.querySelector('[data-game-highscores]')) {
    const navigation = document.createElement('nav');
    navigation.className = 'highscore-navigation';
    navigation.setAttribute('aria-label', 'Highscores');
    const link = document.createElement('a');
    link.href = new URL('highscores.html', base).href;
    link.textContent = '🏆 Highscores';
    navigation.append(link);
    account.append(navigation);
  }
  const mount = document.querySelector('[data-player-profile]');
  if (mount) mount.append(account);
  else document.body.append(account);
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('highscore/style.css', base); document.head.append(css);
  async function send(result) {
    if (!getName()) { pending.push(result); status('Geschafft! Gib einen Namen ein, um dein Ergebnis zu speichern.'); return; }
    const payload = { ...result, name:getName() };
    status('Ergebnis wird gespeichert …');
    try {
      const response = await fetch(new URL('highscore/api.php?action=scores', base), { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Speichern fehlgeschlagen');
      status('✓ Dein Ergebnis wurde in den Highscores gespeichert.');
    } catch {
      pending.push(result);
      status('Ergebnis nicht gespeichert. Bitte prüfe die Verbindung und versuche es erneut.');
      retry.hidden = false;
    }
  }
  window.Highscore = Object.freeze({ submit(result) {
    // Capture the finished run immediately, including its level and stable retry ID.
    const submissionId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
    void send({ ...result, level:String(result.level), time:Math.round(result.time), submissionId });
  } });
})();
