(() => {
  'use strict';
  const P=window.BlockPuzzle, $=id=>document.getElementById(id), board=$('board');
  const COLORS={I:'#249caf',O:'#d6a03e',T:'#9965c9',S:'#3b9b72',Z:'#d06479',J:'#547bc7',L:'#d38243'};
  const bestKey='spielewelt-tetris-puzzle-best-v1';
  let best=0;
  try{const stored=Number(localStorage.getItem(bestKey));if(Number.isSafeInteger(stored)&&stored>=0)best=stored;}catch{}
  let state,anchor=null,keyboardIndex=0,started=null,submitted=false,clearTimer=null;
  const cells=[];
  const cellLabel=i=>'Zeile '+(Math.floor(i/P.SIZE)+1)+', Spalte '+(i%P.SIZE+1);
  function say(text){$('status').textContent=text;}
  function setTabStop(i){cells[keyboardIndex].tabIndex=-1;keyboardIndex=i;cells[i].tabIndex=0;}
  function preview(i){
    anchor=i;
    for(const cell of cells)cell.classList.remove('preview','invalid');
    if(i===null||state.over)return;
    const row=Math.floor(i/state.size),col=i%state.size,valid=P.canPlace(state.board,state.piece.cells,row,col,state.size);
    state.piece.cells.forEach(([r,c])=>{
      const rr=row+r,cc=col+c;
      if(rr<state.size&&cc<state.size)cells[rr*state.size+cc].classList.add(valid?'preview':'invalid');
    });
  }
  function rememberBest(){
    if(state.points<=best)return;
    best=state.points;
    try{localStorage.setItem(bestKey,String(best));}catch{}
  }
  function draw(){
    $('points').textContent=state.points;$('best').textContent=best;$('placed').textContent=state.placed;$('lines').textContent=state.lines;
    cells.forEach((cell,i)=>{
      const kind=state.board[i];
      cell.className='block-cell'+(kind?' filled':'');
      cell.style.setProperty('--block',kind?COLORS[kind]:'transparent');
      cell.setAttribute('aria-label',cellLabel(i)+(kind?', belegt':', frei'));
      cell.setAttribute('aria-disabled',state.over?'true':'false');
    });
    board.classList.toggle('ended',state.over);
    $('piece-label').textContent=(state.over?'Passt nicht mehr: ':'Dein Stein: ')+state.piece.kind;
    $('piece').setAttribute('aria-label',state.piece.kind+'-Stein, '+(Math.max(...state.piece.cells.map(c=>c[1]))+1)+' Felder breit und '+(Math.max(...state.piece.cells.map(c=>c[0]))+1)+' Felder hoch');
    const frag=document.createDocumentFragment();
    for(let r=0;r<4;r++)for(let c=0;c<4;c++){
      const block=document.createElement('span');block.className='mini-cell';
      if(state.piece.cells.some(([rr,cc])=>rr===r&&cc===c))block.classList.add('filled');
      block.style.setProperty('--block',COLORS[state.piece.kind]);frag.append(block);
    }
    $('piece').replaceChildren(frag);$('rotate').disabled=state.over;
    preview(anchor);
  }
  function endRound(){
    if(submitted)return;
    submitted=true;
    const time=started===null?0:Math.max(0,Math.round(performance.now()-started));
    $('game-over').hidden=false;
    $('result').textContent=state.points+' entfernte Felder · '+state.placed+' gesetzte Steine';
    say('Runde beendet: Der nächste Stein passt auch gedreht nirgends mehr. '+state.points+' Punkte.');
    window.Highscore?.submit({game:'tetris-puzzle',level:'random',points:state.points,moves:state.placed,time});
    $('again').focus({preventScroll:true});
  }
  function place(i){
    if(state.over)return;
    setTabStop(i);
    const result=P.place(state,Math.floor(i/state.size),i%state.size);
    if(!result){preview(i);say('Hier passt der Stein nicht. Wähle freie Felder oder drehe ihn.');return;}
    if(started===null)started=performance.now();
    clearTimeout(clearTimer);state=result.state;anchor=null;
    rememberBest();draw();
    if(result.removed){
      result.cleared.forEach(index=>cells[index].classList.add('cleared'));
      clearTimer=setTimeout(()=>{cells.forEach(cell=>cell.classList.remove('cleared'));},500);
      say('+'+result.removed+' Punkte! '+(result.rows+result.cols)+' '+(result.rows+result.cols===1?'Linie entfernt.':'Linien gleichzeitig entfernt.')+' Nächsten Stein platzieren.');
    }else say('Stein gesetzt. Platziere jetzt den nächsten Stein.');
    if(state.over)endRound();
  }
  function turn(){
    if(state.over)return;
    state=P.turn(state);draw();say('Stein gedreht. Wähle seinen Platz auf dem Feld.');
  }
  function restart(){
    clearTimeout(clearTimer);state=P.newGame();anchor=null;submitted=false;started=null;
    setTabStop(0);$('game-over').hidden=true;draw();
    say('Platziere den angezeigten Stein. Volle Zeilen und Spalten bringen Punkte.');
  }
  for(let i=0;i<P.SIZE*P.SIZE;i++){
    const cell=document.createElement('button');cell.type='button';cell.className='block-cell';cell.tabIndex=i===0?0:-1;
    cell.dataset.index=i;
    cell.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')preview(i);});
    cell.addEventListener('focus',()=>{setTabStop(i);preview(i);});
    cell.addEventListener('click',()=>place(i));
    cell.addEventListener('keydown',e=>{
      const r=Math.floor(i/P.SIZE),c=i%P.SIZE;
      const next={ArrowLeft:r*P.SIZE+Math.max(0,c-1),ArrowRight:r*P.SIZE+Math.min(P.SIZE-1,c+1),ArrowUp:Math.max(0,r-1)*P.SIZE+c,ArrowDown:Math.min(P.SIZE-1,r+1)*P.SIZE+c}[e.key];
      if(next!==undefined){e.preventDefault();setTabStop(next);cells[next].focus();}
      // Enter and Space use the native button click behavior.
    });
    cells.push(cell);board.append(cell);
  }
  board.addEventListener('pointerleave',()=>{if(!board.contains(document.activeElement))preview(null);});
  board.addEventListener('focusout',e=>{if(!board.contains(e.relatedTarget))preview(null);});
  $('rotate').addEventListener('click',turn);
  $('restart').addEventListener('click',restart);
  $('again').addEventListener('click',()=>{restart();cells[0].focus();});
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable]'))return;
    if(e.key.toLowerCase()==='r'){e.preventDefault();turn();}
  });
  restart();
})();
