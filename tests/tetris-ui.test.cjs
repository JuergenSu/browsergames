// UI event logic smoke tests. Canvas rendering and physical touch need a browser.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const T=require('../tetris-multiplayer/engine.js');
function setup(){
 let doc,room;const games=[],frames=[],timers=new Map(),submissions=[];let timerId=0;
 class El{
  constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.dataset={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.className='';this.attributes={};this.style={};this.classList={add:n=>{this.className+=' '+n;},remove:n=>{this.className=this.className.split(' ').filter(x=>x!==n).join(' ');},toggle:(n,yes)=>yes?this.classList.add(n):this.classList.remove(n)};}
  dispatchEvent(event){this.send(event.type);return true;}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  send(type,extra={}){const e={target:this,preventDefault(){},...extra};for(const fn of this.events[type]||[])fn(e);}
  append(...items){for(const item of items){if(item.tag==='fragment')this.children.push(...item.children);else this.children.push(item);}}
  replaceChildren(...items){this.children=[];this.append(...items);}
  closest(){return ['input','button','a','select'].includes(this.tag)?this:null;}
  getContext(){return new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}
  focus(){doc.activeElement=this;}
  setPointerCapture(){}
  setCustomValidity(s){this.validity=s;}
  reportValidity(){}
 }
 const ids={},get=id=>ids[id]??=new El(id==='player-name'?'input':id==='board'||id==='next'?'canvas':'div');
 for(const id of ['score','lines','level','pending','players','player-count','players-empty','connection','mode','retry','best','player-name','overlay','overlay-title','overlay-text','resume','pause','attack','start','start-form','board','next'])get(id);
 const buttons=['left','rotate','right','down','drop'].map(action=>{const b=new El('button');b.dataset.action=action;return b;});
 doc=new El('document');Object.assign(doc,{cookie:'',hidden:false,getElementById:get,createDocumentFragment:()=>new El('fragment'),createElement:tag=>new El(tag),createTextNode:text=>{const e=new El('text');e.textContent=text;return e;},querySelectorAll:()=>buttons});
 const win=new El('window');win.Highscore={submit:s=>submissions.push(s)};
 win.Tetris={...T,Game:class extends T.Game{constructor(){super(()=>.5);games.push(this);}}};
 win.TetrisRoom={Room:class{
  constructor(callbacks){this.callbacks=callbacks;this.started=[];this.attacks=[];this.stops=0;room=this;}
  start(name){this.started.push(name);this.callbacks.onStatus('online');this.callbacks.onRoster([{id:'me',name},{id:'bob',name:'Bob'}],'me');}
  stop(){this.stops++;this.callbacks.onRoster([],null);}
  attack(lines){this.attacks.push(lines);}
 }};
 const context={Event,window:win,document:doc,location:{href:'https://test.invalid/games/tetris-multiplayer/index.html',protocol:'https:'},URL,performance:{now:()=>1000},localStorage:{getItem:()=>null,setItem(){}},crypto:globalThis.crypto,requestAnimationFrame:fn=>frames.push(fn),setTimeout:(fn)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tetris-multiplayer/game.js'),'utf8'),context);
 const start=(name='Alice')=>{ids['player-name'].value=name;ids['start-form'].send('submit');};
 return {ids,doc,win,buttons,room,games,frames,timers,submissions,start};
}
test('Starting joins the shared room and lists all players including self',()=>{
 const h=setup();h.start();assert.equal(h.ids['overlay'].hidden,true);assert.equal(h.room.started.at(-1),'Alice');assert.equal(h.ids['player-count'].textContent,2);assert.equal(h.ids.players.children.length,2);assert.equal(h.ids.mode.textContent,'Multiplayer');assert.equal(h.ids['player-name'].disabled,true);
});
test('Attack announcements use text and queue garbage without disturbing a falling piece',()=>{
 const h=setup();h.start();const g=h.games[0],y=g.piece.y;
 h.room.callbacks.onAttack({name:'<img src=x onerror=alert(1)>',rows:2});
 assert.equal(g.pending,2);assert.equal(g.piece.y,y);assert.match(h.ids.attack.textContent,/^<img/);assert.equal(h.ids.attack.children.length,0);
});
test('Pause and hidden tabs leave the room; resume joins a fresh session',()=>{
 const h=setup();h.start();const previous=h.room.stops;h.ids.pause.send('click');assert.equal(h.room.stops,previous+1);assert.equal(h.ids.overlay.hidden,false);assert.equal(h.ids['player-count'].textContent,0);
 h.ids.resume.send('click');assert.equal(h.room.started.length,2);assert.equal(h.ids.overlay.hidden,true);
 h.doc.hidden=true;h.doc.send('visibilitychange');assert.equal(h.ids.overlay.hidden,false);assert.equal(h.ids['player-count'].textContent,0);
});
test('Connection failure retains a playable singleplayer and drops the stale roster',()=>{
 const h=setup();h.start();h.room.callbacks.onRoster([],null);h.room.callbacks.onStatus('single');
 assert.equal(h.ids.mode.textContent,'Singleplayer');assert.equal(h.ids['player-count'].textContent,1);assert.equal(h.ids.retry.hidden,false);
 const y=h.games[0].piece.y;h.buttons.find(b=>b.dataset.action==='down').send('click',{detail:0});assert.ok(h.games[0].piece.y>y);
});
test('Touch hold repeats movement and pointer cancellation releases the repeat timer',()=>{
 const h=setup();h.start();const g=h.games[0],x=g.piece.x,left=h.buttons[0];
 left.send('pointerdown',{pointerId:1,button:0});assert.equal(g.piece.x,x-1);assert.equal(h.timers.size,1);
 for(const timer of h.timers.values())for(let i=0;i<6;i++)timer();assert.ok(g.piece.x<x-1);
 left.send('pointercancel',{pointerId:1});assert.equal(h.timers.size,0);
});
test('Game-over leaves the room, submits once and allows a new player round',()=>{
 const h=setup();h.start();h.games[0].over=true;h.frames.shift()(2000);
 assert.equal(h.ids['overlay-title'].textContent,'Game-over');assert.equal(h.ids['player-count'].textContent,0);assert.equal(h.submissions.length,1);assert.equal(h.ids.pause.disabled,true);
 h.frames.shift()(2100);assert.equal(h.submissions.length,1);h.start('Another player');assert.equal(h.games.length,2);assert.equal(h.room.started.at(-1),'Another player');assert.equal(h.ids.overlay.hidden,true);
});
test('Actual keyboard hard drop sends the cleared line count to the room',()=>{
 const h=setup();h.start();const g=h.games[0];for(let y=20;y<22;y++)g.board[y]=Array.from({length:10},(_,x)=>x===4?null:'G');
 g.piece={kind:'I',x:4,y:18,cells:[[0,0],[0,1],[0,2],[0,3]]};h.doc.send('keydown',{key:' ',target:h.ids.board});assert.deepEqual(h.room.attacks,[2]);assert.equal(h.ids.lines.textContent,2);
});
