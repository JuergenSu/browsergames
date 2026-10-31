/* Exercise actual UI event handlers without a browser or external DOM package.
   Rendering, native keyboard activation and touch behavior need a real browser. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const P=require('../tetris-puzzle/engine.js');
const script=fs.readFileSync(path.join(__dirname,'../tetris-puzzle/game.js'),'utf8');
function setup({initial,storage=new Map(),blockStorage=false}={}){
  let doc;
  class Element{
    constructor(tag='div'){
      this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.attributes={};this.textContent='';this.className='';this.tabIndex=-1;this.hidden=false;this.disabled=false;
      this.style={setProperty:(name,value)=>{this.style[name]=value;}};
      this.classList={
        contains:name=>this.className.split(' ').includes(name),
        add:(...names)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ');},
        remove:(...names)=>{this.className=this.className.split(' ').filter(n=>!names.includes(n)).join(' ');},
        toggle:(name,force)=>{const yes=force===undefined?!this.classList.contains(name):force;if(yes)this.classList.add(name);else this.classList.remove(name);return yes;}
      };
    }
    setAttribute(key,value){this.attributes[key]=String(value);}
    addEventListener(name,listener){(this.listeners[name]??=[]).push(listener);}
    append(...elements){for(const e of elements){if(e.tagName==='#fragment')this.append(...e.children);else this.children.push(e);}}
    replaceChildren(...elements){this.children=[];this.append(...elements);}
    contains(element){return element===this||this.children.some(c=>c.contains(element));}
    closest(){return null;}
    dispatch(name,event={}){let prevented=false;const e={target:this,preventDefault(){prevented=true;},...event};for(const listener of this.listeners[name]||[])listener(e);return prevented;}
    focus(){doc.activeElement=this;this.dispatch('focus');}
    click(){if(!this.disabled)this.dispatch('click');}
  }
  const ids={};
  for(const id of ['board','points','best','placed','lines','piece-label','piece','rotate','status','game-over','result','again','restart'])ids[id]=new Element();
  ids['game-over'].hidden=true;
  doc=new Element('document');doc.activeElement=null;doc.getElementById=id=>ids[id];doc.createElement=tag=>new Element(tag);doc.createDocumentFragment=()=>new Element('#fragment');
  const submissions=[];let clock=0;
  const block={...P,newGame:()=>initial?structuredClone(initial):P.newGame(()=>0.5)};
  const context={window:{BlockPuzzle:block,Highscore:{submit:r=>submissions.push(r)}},document:doc,performance:{now:()=>{clock+=100;return clock;}},setTimeout:()=>1,clearTimeout:()=>{},localStorage:{getItem:k=>{if(blockStorage)throw Error('blocked');return storage.get(k)??null;},setItem:(k,v)=>{if(blockStorage)throw Error('blocked');storage.set(k,v);}}};
  vm.runInNewContext(script,context);
  return {ids,doc,storage,submissions,cells:ids.board.children};
}
function fixture(board,points=0){return {...P.newGame(()=>0.5),board,piece:{kind:'O',cells:P.normalize(P.SHAPES.O)},bag:['O'],points};}
test('UI builds a 100-cell board and never places pieces by itself',()=>{
  const {ids,cells}=setup();assert.equal(cells.length,100);assert.equal(ids.piece.children.length,16);assert.equal(ids.placed.textContent,0);assert.equal(ids.points.textContent,0);assert.ok(cells.every(c=>!c.classList.contains('filled')));assert.equal(cells.filter(c=>c.tabIndex===0).length,1);
});
test('Clicking places a piece; invalid clicks do not consume it or award points',()=>{
  const {ids,cells}=setup({initial:fixture(Array(100).fill(null))});
  cells[22].click();assert.equal(ids.placed.textContent,1);assert.equal(ids.points.textContent,0);
  assert.deepEqual(cells.flatMap((c,i)=>c.classList.contains('filled')?[i]:[]),[22,23,32,33]);
  cells[22].click();assert.equal(ids.placed.textContent,1);assert.match(ids.status.textContent,/passt der Stein nicht/);
  cells[99].click();assert.equal(ids.placed.textContent,1);
});
test('Preview, rotation and keyboard navigation work without changing score',()=>{
  const initial=P.newGame(()=>0.5);initial.piece={kind:'I',cells:P.SHAPES.I};
  const {ids,cells,doc}=setup({initial});
  cells[12].dispatch('pointerenter',{pointerType:'mouse'});assert.deepEqual(cells.flatMap((c,i)=>c.classList.contains('preview')?[i]:[]),[12,13,14,15]);
  ids.rotate.click();assert.deepEqual(cells.flatMap((c,i)=>c.classList.contains('preview')?[i]:[]),[12,22,32,42]);
  assert.equal(ids.placed.textContent,0);assert.equal(ids.points.textContent,0);
  cells[0].focus();assert.equal(cells[0].dispatch('keydown',{key:'ArrowRight'}),true);assert.equal(doc.activeElement,cells[1]);assert.equal(cells[1].tabIndex,0);
  doc.dispatch('keydown',{key:'r',target:cells[1]});assert.equal(ids.placed.textContent,0);
});
test('Cleared-field score, line count and personal record are reflected in the UI',()=>{
  const board=Array(100).fill(null);for(let c=0;c<10;c++)if(c!==4&&c!==5)board[40+c]='L';
  for(let r=0;r<10;r++)if(r!==4&&r!==5)board[r*10+4]='S';
  const {ids,cells,storage}=setup({initial:fixture(board)});cells[44].click();
  assert.equal(ids.points.textContent,19);assert.equal(ids.lines.textContent,2);assert.equal(ids.best.textContent,19);assert.match(ids.status.textContent,/\+19 Punkte/);
  assert.equal(cells[55].classList.contains('filled'),true);assert.equal(cells[44].classList.contains('filled'),false);
  const reload=setup({storage});assert.equal(reload.ids.best.textContent,19);
});
test('Game over submits one points score and freezes placement until restart',()=>{
  const board=Array.from({length:100},(_,i)=>(Math.floor(i/10)+i%10)%2===0?'Z':null);
  for(const i of [0,1,10,11])board[i]=null;
  const {ids,cells,submissions}=setup({initial:fixture(board,42)});
  cells[0].click();assert.equal(ids['game-over'].hidden,false);assert.equal(ids.rotate.disabled,true);assert.equal(submissions.length,1);
  assert.equal(submissions[0].game,'tetris-puzzle');assert.equal(submissions[0].level,'random');assert.equal(submissions[0].points,42);assert.equal(submissions[0].moves,1);assert.ok(Number.isInteger(submissions[0].time));
  cells[22].click();cells[0].click();ids.rotate.click();assert.equal(submissions.length,1);
  ids.restart.click();assert.equal(ids['game-over'].hidden,true);assert.equal(ids.placed.textContent,0);assert.equal(ids.rotate.disabled,false);
});
test('Missing or malformed local storage does not prevent playing',()=>{
  const blocked=setup({blockStorage:true,initial:fixture(Array(100).fill(null))});blocked.cells[0].click();assert.equal(blocked.ids.placed.textContent,1);
  for(const value of ['NaN','-20','Infinity','{}','999999999999999999999']){
    const {ids}=setup({storage:new Map([['spielewelt-tetris-puzzle-best-v1',value]])});assert.equal(ids.best.textContent,0);
  }
});
