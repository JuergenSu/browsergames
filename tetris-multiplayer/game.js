(() => {
  'use strict';
  const $=id=>document.getElementById(id),T=window.Tetris,canvas=$('board'),ctx=canvas.getContext('2d'),preview=$('next').getContext('2d');
  const colors={I:'#57d1de',O:'#f2cb60',T:'#b18bea',J:'#7397f2',L:'#efa467',S:'#6bd2a1',Z:'#ed8297',G:'#7b8ba4'};
  let game=null,running=false,paused=false,finished=false,started=0,spent=0,previous=0,localName='',roster=[],ownId=null,connection='idle',attackQueue=[],attackTimer=null;
  const repeats=new Map();let best=0;
  try{const stored=Number(localStorage.getItem('tetris-multiplayer-best-v1'));if(Number.isSafeInteger(stored)&&stored>=0)best=stored;}catch{}
  function cookieName(){try{return decodeURIComponent(document.cookie.split('; ').find(c=>c.startsWith('spielewelt_name='))?.split('=').slice(1).join('=')||'');}catch{return '';}}
  try{$('player-name').value=cookieName()||localStorage.getItem('tetris-multiplayer-name-v1')||'';}catch{}
  $('best').textContent=best;
  const room=new window.TetrisRoom.Room({
    onRoster(players,id){roster=players;ownId=id;renderRoster();},
    onAttack(event){if(!running||paused||game.over)return;game.queueGarbage(event.rows);attackQueue.push(event);showAttack();draw();},
    onStatus(status){connection=status;renderConnection();renderRoster();},
    id:()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')
  });
  function renderRoster(){
    const players=connection==='online'?roster:(running&&!paused?[{id:'local',name:localName}]:[]);
    const frag=document.createDocumentFragment();
    for(const player of players){
      const li=document.createElement('li');li.append(document.createTextNode(String(player.name)));
      if(player.id===ownId||player.id==='local'){const tag=document.createElement('span');tag.textContent='Du';li.append(tag);}frag.append(li);
    }
    $('players').replaceChildren(frag);$('player-count').textContent=players.length;
    $('players-empty').hidden=players.length>0;$('players-empty').textContent=paused?'Deine Runde pausiert.':finished?'Starte eine neue Runde.':'Noch keine Runde gestartet.';
  }
  function renderConnection(){
    const messages={idle:'Starte eine Runde, um mitzuspielen.',connecting:'Mitspieler werden gesucht …',online:'Gemeinsamer Raum · Spieleranzeige wird laufend aktualisiert.',offline:'Verbindung unterbrochen. Du spielst allein weiter; wir verbinden automatisch neu.',single:'Singleplayer: Mitspieler sind hier nicht erreichbar.'};
    $('connection').textContent=paused?'Pause · Du bist nicht im aktiven Raum.':finished?'Runde beendet · Du kannst jederzeit neu einsteigen.':messages[connection];
    $('mode').textContent=connection==='online'&&!paused&&running?'Multiplayer':'Singleplayer';$('mode').classList.toggle('online',connection==='online'&&!paused&&running);
    $('retry').hidden=!running||paused||!['offline','single'].includes(connection);
  }
  function showAttack(){
    if(attackTimer||!attackQueue.length)return;
    const event=attackQueue.shift();$('attack').textContent=event.name+' schickt dir '+event.rows+' '+(event.rows===1?'Reihe':'Reihen')+'!';$('attack').classList.add('received');
    attackTimer=setTimeout(()=>{attackTimer=null;if(attackQueue.length)showAttack();else{$('attack').classList.remove('received');$('attack').textContent='Weitere Reihen kommen nach deinem aktuellen Stein dazu.';}},3500);
  }
  function block(context,x,y,size,kind,ghost=false){
    context.fillStyle=ghost?'#293a54':colors[kind]||'#7b8ba4';context.fillRect(x+1,y+1,size-2,size-2);
    if(ghost){context.strokeStyle=colors[kind]||'#8297b7';context.lineWidth=1.5;context.strokeRect(x+2,y+2,size-4,size-4);}
    else{context.fillStyle='#ffffff25';context.fillRect(x+2,y+2,size-4,3);context.fillStyle='#00000020';context.fillRect(x+2,y+size-5,size-4,3);}
  }
  function draw(){
    ctx.fillStyle='#0b1424';ctx.fillRect(0,0,300,600);ctx.strokeStyle='#1b2940';ctx.lineWidth=.5;
    for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*30,0);ctx.lineTo(x*30,600);ctx.stroke();}
    for(let y=0;y<=20;y++){ctx.beginPath();ctx.moveTo(0,y*30);ctx.lineTo(300,y*30);ctx.stroke();}
    preview.clearRect(0,0,100,240);
    if(game){
      for(let y=2;y<T.HEIGHT;y++)for(let x=0;x<10;x++)if(game.board[y][x])block(ctx,x*30,(y-2)*30,30,game.board[y][x]);
      if(!game.over){
        const p=game.piece,ghost=game.ghostY();
        for(const [x,y] of p.cells)if(ghost+y>=2)block(ctx,(p.x+x)*30,(ghost+y-2)*30,30,p.kind,true);
        for(const [x,y] of p.cells)if(p.y+y>=2)block(ctx,(p.x+x)*30,(p.y+y-2)*30,30,p.kind);
      }
      game.next.slice(0,3).forEach((kind,i)=>{for(const [x,y] of T.SHAPES[kind])block(preview,10+x*20,12+i*78+y*20,20,kind);});
      $('score').textContent=game.score;$('lines').textContent=game.lines;$('level').textContent=game.level;$('pending').textContent=game.pending;
    }
  }
  function flushEvents(){for(const event of game.drainEvents())if(event.type==='clear')room.attack(event.lines);}
  function stopRepeats(){for(const item of repeats.values())clearInterval(item.timer);repeats.clear();for(const b of document.querySelectorAll('[data-action]'))b.classList.remove('pressed');}
  function finish(){
    if(finished)return;flushEvents();finished=true;running=false;paused=false;spent+=performance.now()-started;room.stop();connection='idle';stopRepeats();
    $('overlay').hidden=false;$('overlay-title').textContent='Game-over';$('overlay-text').textContent=game.score+' Punkte · '+game.lines+' entfernte Reihen. Steige mit einer neuen Runde wieder ein.';$('resume').hidden=true;
    $('start').textContent='Neue Runde starten →';$('pause').disabled=true;$('player-name').disabled=false;
    if(game.score>best){best=game.score;try{localStorage.setItem('tetris-multiplayer-best-v1',String(best));}catch{}$('best').textContent=best;}
    window.Highscore?.submit({game:'tetris-multiplayer',level:'random',points:game.score,moves:game.placed,time:Math.round(spent)});
    clearTimeout(attackTimer);attackTimer=null;attackQueue=[];renderConnection();renderRoster();draw();
  }
  function action(type){
    if(!running||paused||!game||game.over)return;
    if(type==='left')game.move(-1);if(type==='right')game.move(1);if(type==='rotate')game.rotate();if(type==='reverse')game.rotate(-1);if(type==='down')game.softDrop();if(type==='drop')game.hardDrop();
    flushEvents();if(game.over)finish();draw();
  }
  function togglePause(){
    if(!running||game.over)return;
    paused=!paused;stopRepeats();
    if(paused){spent+=performance.now()-started;room.stop();connection='idle';$('overlay').hidden=false;$('overlay-title').textContent='Kurze Pause';$('overlay-text').textContent='Du bist vorübergehend aus dem gemeinsamen Raum ausgestiegen.';$('resume').hidden=false;}
    else{started=performance.now();previous=0;$('overlay').hidden=true;room.start(localName);canvas.focus({preventScroll:true});}
    $('pause').textContent=paused?'▶ Weiter':'Ⅱ Pause';renderConnection();renderRoster();
  }
  $('start-form').addEventListener('submit',e=>{
    e.preventDefault();if(document.hidden)return;
    const name=$('player-name').value.trim();
    if(!name||[...name].length>30||/[\u0000-\u001f\u007f]/u.test(name)){$('player-name').setCustomValidity('Bitte 1–30 Zeichen ohne Steuerzeichen eingeben.');$('player-name').reportValidity();return;}
    localName=name;$('player-name').setCustomValidity('');
    const base=new URL('../',location.href).pathname;
    document.cookie='spielewelt_name='+encodeURIComponent(name)+'; Max-Age=31536000; Path='+base+'; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
    window.dispatchEvent(new Event('spielewelt:player-name'));
    try{localStorage.setItem('tetris-multiplayer-name-v1',name);}catch{}
    room.stop();clearTimeout(attackTimer);attackTimer=null;attackQueue=[];stopRepeats();game=new T.Game();running=true;paused=false;finished=false;spent=0;started=performance.now();previous=0;
    $('overlay').hidden=true;$('start').textContent='Neue Runde starten →';$('pause').disabled=false;$('pause').textContent='Ⅱ Pause';$('player-name').disabled=true;$('attack').textContent='Entferne Reihen und schicke deinen Mitspielern zusätzliche Blöcke.';$('attack').classList.remove('received');
    room.start(name);renderRoster();draw();canvas.focus({preventScroll:true});
  });
  $('player-name').addEventListener('input',()=>$('player-name').setCustomValidity(''));
  $('pause').addEventListener('click',togglePause);$('resume').addEventListener('click',togglePause);$('retry').addEventListener('click',()=>{if(running&&!paused)room.start(localName);});
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.altKey||e.metaKey||e.target.closest('input,textarea,select,button,a,[contenteditable]'))return;
    const key=e.key.toLowerCase();
    if(['p','escape'].includes(key)){e.preventDefault();if(!e.repeat)togglePause();return;}
    const map={arrowleft:'left',arrowright:'right',arrowdown:'down',arrowup:'rotate',x:'rotate',z:'reverse',' ':'drop'};
    if(map[key]){e.preventDefault();if(e.repeat&&['drop','rotate','reverse'].includes(map[key]))return;action(map[key]);}
  });
  for(const button of document.querySelectorAll('[data-action]')){
    const type=button.dataset.action;
    const release=e=>{const item=repeats.get(e.pointerId);if(item){clearInterval(item.timer);repeats.delete(e.pointerId);}button.classList.remove('pressed');};
    button.addEventListener('pointerdown',e=>{
      if(e.button!==0||!running||paused)return;e.preventDefault();button.setPointerCapture(e.pointerId);button.classList.add('pressed');action(type);
      if(!running)return;
      if(['left','right','down'].includes(type)){
        let held=0;const timer=setInterval(()=>{held+=40;if(type==='down'||held>=160)action(type);},40);repeats.set(e.pointerId,{timer});
      }
    });
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('click',e=>{if(e.detail===0)action(type);});
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)togglePause();});
  window.addEventListener('pagehide',()=>{stopRepeats();room.stop();});
  function frame(now){
    if(running&&!paused){const dt=previous?Math.min(100,now-previous):0;game.tick(dt);flushEvents();if(game.over)finish();draw();}
    previous=now;requestAnimationFrame(frame);
  }
  renderRoster();draw();requestAnimationFrame(frame);
})();
