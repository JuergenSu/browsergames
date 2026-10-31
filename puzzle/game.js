(() => {
  'use strict';
  const P=window.Puzzle, $=id=>document.getElementById(id),game=document.body.dataset.game;
  const instructions={netwalk:'Tippe zum Drehen. Umschalt + Klick oder Rechtsklick fixiert ein Teil.',skyscrapers:'Wähle ein Feld und dann eine Höhe. Löschen entfernt den Eintrag.',sokoban:'Pfeiltasten / WASD oder die Richtungstasten bewegen die Figur.'};
  const key='spielewelt-'+game+'-v1';
  let progress={};try{const stored=JSON.parse(localStorage.getItem(key)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))progress=stored;}catch{}
  let level=1,puzzle,state,history=[],moves=0,pushes=0,won=false,selected=-1,locks=new Set(),startTime=null,finishedTime=0;
  const elapsed=()=>startTime===null?0:Math.max(0,Math.round(performance.now()-startTime));
  const format=ms=>{const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
  function message(text){$('status').textContent=text;}
  function progressDraw(){
    $('progress').textContent=Array.from({length:24},(_,i)=>i+1).filter(i=>progress[i]).length+' / 24 geschafft';
    [...$('levels').children].forEach((b,i)=>{b.className=(progress[i+1]?'done ':'')+(level===i+1?'current':'');b.setAttribute('aria-label','Level '+(i+1)+(progress[i+1]?', geschafft':''));b.setAttribute('aria-current',level===i+1?'true':'false');});
  }
  function load(next){
    level=next;puzzle=P[game](level);history=[];moves=0;pushes=0;won=false;selected=-1;locks=new Set();startTime=null;finishedTime=0;
    state=game==='netwalk'?puzzle.cells.slice():game==='skyscrapers'?puzzle.givens.slice():{player:puzzle.player,boxes:puzzle.boxes.slice()};
    $('level').value=level;$('win').hidden=true;$('next').textContent=level===24?'Zu Level 1 →':'Nächstes Level →';$('time').textContent='00:00';
    $('difficulty').textContent=(level<=8?'Einstieg':level<=16?'Fortgeschritten':'Experte')+' · '+puzzle.n+' × '+puzzle.n;
    $('number-pad').replaceChildren();
    if(game==='skyscrapers')for(let value=1;value<=puzzle.n+1;value++){
      const b=document.createElement('button');b.type='button';b.textContent=value<=puzzle.n?value:'⌫';b.setAttribute('aria-label',value<=puzzle.n?'Höhe '+value:'Feld löschen');b.addEventListener('click',()=>setHeight(value<=puzzle.n?value:0));$('number-pad').append(b);
    }
    $('dpad').hidden=game!=='sokoban';$('number-pad').hidden=game!=='skyscrapers';
    $('check').hidden=game!=='skyscrapers';$('check').disabled=false;
    message(instructions[game]);progressDraw();draw();
  }
  function remember(){if(startTime===null)startTime=performance.now();history.push({state:structuredClone(state),pushes});moves++;}
  function finish(){
    if(won)return;finishedTime=elapsed();won=true;
    progress[level]=true;try{localStorage.setItem(key,JSON.stringify(progress));}catch{}
    $('win').hidden=false;$('win-text').textContent='Level '+level+' in '+format(finishedTime)+' mit '+moves+' Zügen'+(game==='sokoban'?' und '+pushes+' Schüben':'')+'.';
    window.Highscore?.submit({game,level,time:finishedTime,moves});progressDraw();message('Geschafft! Alle Regeln sind erfüllt.');
    $('next').focus();
  }
  function tile(i){const b=document.createElement('button');b.type='button';b.className='tile';b.dataset.index=i;return b;}
  function label(i){return 'Zeile '+(Math.floor(i/puzzle.n)+1)+', Spalte '+(i%puzzle.n+1);}
  function pipe(mask,source,endpoint){
    const paths=P.DIR.map(([r,c],d)=>mask&(1<<d)?'<path class="pipe" d="M30 30 L'+(30+c*30)+' '+(30+r*30)+'"/>':'').join('');
    return '<svg aria-hidden="true" viewBox="0 0 60 60">'+paths+(source?'<rect class="source" x="18" y="18" width="24" height="24" rx="6"/><path d="m32 21-8 11h7l-3 8 10-13h-7z" fill="#925a12"/>':endpoint?'<rect class="node" x="20" y="21" width="20" height="16" rx="3"/><path d="M25 41h10M30 37v4" stroke="#8b9daf" stroke-width="3"/>':'<circle cx="30" cy="30" r="5" fill="currentColor"/>')+'</svg>';
  }
  function rotate(i,lock=false){
    if(won)return;
    if(lock){locks.has(i)?locks.delete(i):locks.add(i);draw();return;}
    if(locks.has(i)){message('Dieses Teil ist fixiert. Rechtsklick oder Umschalt + Klick löst die Fixierung.');return;}
    if(P.rotate(state[i])===state[i])return;
    remember();state[i]=P.rotate(state[i]);draw();
  }
  function setHeight(value){
    if(won)return;
    if(selected<0){message('Wähle zuerst ein freies Feld.');return;}
    if(puzzle.givens[selected])return;
    if(state[selected]===value)return;
    remember();state[selected]=value;draw();
  }
  function step(d){
    if(won)return;const next=P.sokobanMove(puzzle,state,d);
    if(!next){message('Hier ist kein Platz. Kisten lassen sich nur auf freie Felder schieben.');return;}
    remember();state=next;if(next.pushed)pushes++;message(instructions[game]);draw();
  }
  function draw(){
    const active=document.activeElement?.dataset.index, frag=document.createDocumentFragment(),n=puzzle.n;
    $('board').className='board '+(game==='netwalk'?'net-board':game==='skyscrapers'?'sky-board':'soko-board');
    $('board').style.gridTemplateColumns='repeat('+(game==='skyscrapers'?n+2:n)+', minmax(0,1fr))';
    $('board').setAttribute('aria-label',n+' mal '+n+' Spielfeld');
    let solved=false;
    if(game==='netwalk'){
      const result=P.networkStatus(state,n,puzzle.source);solved=result.solved;
      state.forEach((mask,i)=>{
        const b=tile(i),endpoint=[1,2,4,8].includes(mask);
        b.classList.add('net-tile');if(result.connected.has(i))b.classList.add('connected');if(locks.has(i))b.classList.add('locked');
        b.innerHTML=pipe(mask,i===puzzle.source,endpoint)+(locks.has(i)?'<span class="lock-mark" aria-hidden="true">▣</span>':'');
        b.setAttribute('aria-label',label(i)+': '+(i===puzzle.source?'Quelle, ':endpoint?'Gerät, ':'Leitung, ')+P.DIR.map((_,d)=>mask&(1<<d)?['oben','rechts','unten','links'][d]:null).filter(Boolean).join(' und ')+(result.connected.has(i)?', verbunden':', ohne Verbindung')+(locks.has(i)?', fixiert':''));
        b.addEventListener('click',e=>rotate(i,e.shiftKey));b.addEventListener('contextmenu',e=>{e.preventDefault();rotate(i,true);});frag.append(b);
      });
      $('filled').textContent=result.connected.size+'/'+n*n;
    }else if(game==='skyscrapers'){
      const result=P.skyErrors(state,n,puzzle.clues);solved=result.solved;
      for(let r=-1;r<=n;r++)for(let c=-1;c<=n;c++){
        if(r<0||c<0||r===n||c===n){
          const clue=document.createElement('span');clue.className='clue';
          const side=r<0?'top':r===n?'bottom':c<0?'left':'right',k=r<0||r===n?c:r;
          if(k>=0&&k<n){clue.textContent=puzzle.clues[side][k];clue.dataset.clue=side+'-'+k;clue.setAttribute('aria-label',({top:'Oben',bottom:'Unten',left:'Links',right:'Rechts'}[side])+': '+clue.textContent+' Gebäude sichtbar');}
          frag.append(clue);continue;
        }
        const i=r*n+c,b=tile(i);b.textContent=state[i]||'';
        b.classList.toggle('fixed',!!puzzle.givens[i]);b.classList.toggle('selected',i===selected);
        b.setAttribute('aria-label',label(i)+': '+(state[i]?'Höhe '+state[i]:'leer')+(puzzle.givens[i]?', Vorgabe':''));
        b.addEventListener('click',()=>{if(won)return;selected=i;draw();if(puzzle.givens[i])message('Diese Höhe ist vorgegeben. Wähle ein anderes Feld.');else message('Höhe 1–'+n+' wählen oder über die Tastatur eingeben.');});frag.append(b);
      }
      $('filled').textContent=state.filter(Boolean).length+'/'+n*n;
    }else{
      solved=P.sokobanSolved(puzzle,state);
      for(let i=0;i<n*n;i++){
        const b=tile(i),wall=puzzle.walls.includes(i),goal=puzzle.goals.includes(i),box=state.boxes.includes(i),worker=state.player===i;
        if(wall)b.classList.add('wall');if(goal)b.classList.add('goal');if(box&&goal)b.classList.add('on-goal');
        b.innerHTML=(box?'<span class="crate" aria-hidden="true"></span>':'')+(worker?'<span class="worker" aria-hidden="true">●</span>':'');
        b.setAttribute('aria-label',label(i)+': '+(wall?'Wand':worker?'Spielfigur':box?'Kiste':'frei')+(goal?', Zielfeld':''));b.tabIndex=-1;
        b.addEventListener('click',()=>{const d=P.DIR.findIndex((_,d)=>P.neighbor(state.player,d,n)===i);if(d>=0)step(d);else message('Tippe direkt neben die Figur oder nutze die Richtungstasten.');});frag.append(b);
      }
      $('filled').textContent=state.boxes.filter(i=>puzzle.goals.includes(i)).length+'/'+puzzle.goals.length;
    }
    $('board').replaceChildren(frag);
    if(active!==undefined)$('board').querySelector('[data-index="'+active+'"]')?.focus({preventScroll:true});
    $('moves').textContent=moves;$('undo').disabled=!history.length||won;
    $('check').disabled=won;
    if(solved)finish();
  }
  function undo(){
    if(!history.length||won)return;const last=history.pop();state=last.state;pushes=last.pushes;
    // Moves remain cumulative so undo cannot improve a submitted score.
    moves++;message('Letzten Zug zurückgenommen. Die Zeit läuft weiter.');draw();
  }
  for(let i=1;i<=24;i++){
    const option=new Option('Level '+i,i);$('level').append(option);
    const b=document.createElement('button');b.type='button';b.textContent=i;b.addEventListener('click',()=>load(i));$('levels').append(b);
  }
  $('level').addEventListener('change',()=>load(Number($('level').value)));
  $('undo').addEventListener('click',undo);$('reset').addEventListener('click',()=>load(level));$('next').addEventListener('click',()=>load(level===24?1:level+1));
  $('check').addEventListener('click',()=>{
    const result=P.skyErrors(state,puzzle.n,puzzle.clues);
    for(const b of $('board').querySelectorAll('[data-index]'))b.classList.toggle('bad',result.bad.has(Number(b.dataset.index)));
    for(const b of $('board').querySelectorAll('[data-clue]'))b.classList.toggle('bad',result.badClues.includes(b.dataset.clue));
    message(result.bad.size?'Markierte Reihen, Spalten oder Sichtzahlen sind noch nicht korrekt.':'Bisher keine Regel verletzt. Fülle die übrigen Felder.');
  });
  for(const b of $('dpad').querySelectorAll('button'))b.addEventListener('click',()=>step(Number(b.dataset.direction)));
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable]'))return;
    const lower=e.key.toLowerCase();
    if(game==='sokoban'){
      const d=({arrowup:0,w:0,arrowright:1,d:1,arrowdown:2,s:2,arrowleft:3,a:3})[lower];
      if(d!==undefined){e.preventDefault();step(d);return;}
    }
    if(lower==='z'){e.preventDefault();undo();return;}
    if(game!=='skyscrapers')return;
    if(/^[1-6]$/.test(e.key)&&Number(e.key)<=puzzle.n){e.preventDefault();setHeight(Number(e.key));return;}
    if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();setHeight(0);return;}
    const d=({ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3})[e.key];
    if(d!==undefined){e.preventDefault();selected=selected<0?0:P.neighbor(selected,d,puzzle.n);if(selected<0)selected=0;draw();$('board').querySelector('[data-index="'+selected+'"]')?.focus();}
  });
  setInterval(()=>{$('time').textContent=format(won?finishedTime:elapsed());},250);
  load(1);
})();
