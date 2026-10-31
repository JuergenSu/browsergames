(() => {
  'use strict';
  const P=window.BlockPuzzle, $=id=>document.getElementById(id), board=$('board');
  const COLORS={I:'#249caf',O:'#d6a03e',T:'#9965c9',S:'#3b9b72',Z:'#d06479',J:'#547bc7',L:'#d38243'};
  const bestKey='spielewelt-tetris-puzzle-best-v1';
  let best=0;
  try{const stored=Number(localStorage.getItem(bestKey));if(Number.isSafeInteger(stored)&&stored>=0)best=stored;}catch{}
  let state,anchor=null,keyboardIndex=0,started=null,submitted=false,clearTimer=null;
  const cells=[];
  let drag=null;
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
      if(rr>=0&&cc>=0&&rr<state.size&&cc<state.size)cells[rr*state.size+cc].classList.add(valid?'preview':'invalid');
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
    if(state.over||drag)return;
    state=P.turn(state);draw();say('Stein gedreht. Wähle seinen Platz auf dem Feld.');
  }
  function restart(){
    cancelDrag();
    clearTimeout(clearTimer);state=P.newGame();anchor=null;submitted=false;started=null;
    setTabStop(0);$('game-over').hidden=true;draw();
    say('Ziehe den Stein auf das Feld oder tippe auf seinen Platz.');
  }
  for(let i=0;i<P.SIZE*P.SIZE;i++){
    const cell=document.createElement('button');cell.type='button';cell.className='block-cell';cell.tabIndex=i===0?0:-1;
    cell.dataset.index=i;
    cell.addEventListener('pointerenter',e=>{if(!drag&&e.pointerType!=='touch')preview(i);});
    cell.addEventListener('focus',()=>{setTabStop(i);if(!drag)preview(i);});
    cell.addEventListener('click',()=>{if(!drag)place(i);});
    cell.addEventListener('keydown',e=>{
      const r=Math.floor(i/P.SIZE),c=i%P.SIZE;
      const next={ArrowLeft:r*P.SIZE+Math.max(0,c-1),ArrowRight:r*P.SIZE+Math.min(P.SIZE-1,c+1),ArrowUp:Math.max(0,r-1)*P.SIZE+c,ArrowDown:Math.min(P.SIZE-1,r+1)*P.SIZE+c}[e.key];
      if(next!==undefined){e.preventDefault();setTabStop(next);cells[next].focus();}
      // Enter and Space use the native button click behavior.
    });
    cells.push(cell);board.append(cell);
  }
  // Pointer Events cover mouse, touch and pen. Capture keeps the gesture alive
  // outside the tray, while touch-action:none on the tray prevents page scrolling.
  function cancelDrag(){
    if(!drag)return;
    const previous=drag;drag=null;
    previous.ghost.remove();$('piece').classList.remove('dragging');
    if($('piece').hasPointerCapture(previous.id))$('piece').releasePointerCapture(previous.id);
    preview(null);
  }
  function moveDrag(e){
    if(!drag||e.pointerId!==drag.id)return;
    const first=cells[0].getBoundingClientRect(),right=cells[1].getBoundingClientRect(),below=cells[P.SIZE].getBoundingClientRect();
    const dx=right.left-first.left,dy=below.top-first.top;
    if(dx<=0||dy<=0){cancelDrag();return;}
    const left=e.clientX-(drag.grabCol+.5)*dx,top=e.clientY-(drag.grabRow+.5)*dy-drag.lift;
    drag.ghost.style.left=left+'px';drag.ghost.style.top=top+'px';
    drag.ghost.style.width=(drag.width-1)*dx+first.width+'px';
    drag.ghost.style.height=(drag.height-1)*dy+first.height+'px';
    drag.ghost.style.gridTemplateColumns='repeat('+drag.width+', '+first.width+'px)';
    drag.ghost.style.gridTemplateRows='repeat('+drag.height+', '+first.height+'px)';
    drag.ghost.style.columnGap=(dx-first.width)+'px';drag.ghost.style.rowGap=(dy-first.height)+'px';
    const col=Math.round((left-first.left)/dx),row=Math.round((top-first.top)/dy);
    const within=row>=0&&col>=0&&row<P.SIZE&&col<P.SIZE;
    drag.target=within?row*P.SIZE+col:null;
    drag.valid=within&&P.canPlace(state.board,state.piece.cells,row,col);
    drag.ghost.classList.toggle('invalid-drop',!drag.valid);
    preview(drag.target);
  }
  $('piece').addEventListener('pointerdown',e=>{
    if(state.over||drag||e.isPrimary===false||e.button!==0)return;
    e.preventDefault();
    const rect=$('piece').getBoundingClientRect();
    const width=Math.max(...state.piece.cells.map(c=>c[1]))+1,height=Math.max(...state.piece.cells.map(c=>c[0]))+1;
    const ghost=document.createElement('div');ghost.className='drag-piece';ghost.setAttribute('aria-hidden','true');
    for(const [r,c] of state.piece.cells){
      const block=document.createElement('span');block.className='mini-cell filled';block.style.gridRow=String(r+1);block.style.gridColumn=String(c+1);block.style.setProperty('--block',COLORS[state.piece.kind]);ghost.append(block);
    }
    document.body.append(ghost);
    drag={id:e.pointerId,ghost,width,height,target:null,valid:false,
      grabCol:Math.min(width-1,Math.max(0,Math.floor((e.clientX-rect.left)/(rect.width/4)))),
      grabRow:Math.min(height-1,Math.max(0,Math.floor((e.clientY-rect.top)/(rect.height/4)))),
      lift:e.pointerType==='touch'?Math.max(50,cells[0].getBoundingClientRect().height*1.6):0};
    $('piece').classList.add('dragging');$('piece').setPointerCapture(e.pointerId);moveDrag(e);
    say('Stein auf freie Felder ziehen und loslassen. Escape bricht ab.');
  });
  $('piece').addEventListener('pointermove',e=>{if(drag&&e.pointerId===drag.id){e.preventDefault();moveDrag(e);}});
  $('piece').addEventListener('pointerup',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    e.preventDefault();moveDrag(e);
    if(!drag)return;
    const {target,valid}=drag;cancelDrag();
    if(valid)place(target);
    else say('Hier passt der Stein nicht. Ziehe ihn erneut auf freie Felder.');
  });
  $('piece').addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.id){cancelDrag();say('Ziehen abgebrochen. Dein Stein bleibt erhalten.');}});
  $('piece').addEventListener('lostpointercapture',e=>{if(drag&&e.pointerId===drag.id)cancelDrag();});
  window.addEventListener('blur',cancelDrag);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDrag();});
  board.addEventListener('pointerleave',()=>{if(!drag&&!board.contains(document.activeElement))preview(null);});
  board.addEventListener('focusout',e=>{if(!drag&&!board.contains(e.relatedTarget))preview(null);});
  $('rotate').addEventListener('click',turn);
  $('restart').addEventListener('click',restart);
  $('again').addEventListener('click',()=>{restart();cells[0].focus();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&drag){e.preventDefault();cancelDrag();say('Ziehen abgebrochen.');return;}
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable]'))return;
    if(e.key.toLowerCase()==='r'){e.preventDefault();turn();}
  });
  restart();
})();
