const {test}=require('node:test');
const assert=require('node:assert/strict');
const T=require('../tetris-multiplayer/engine.js');
const {Room}=require('../tetris-multiplayer/room.js');
const game=()=>new T.Game(()=>.5);
test('Seven-bag, empty board, legal spawn and five preview pieces',()=>{
 const g=game();assert.equal(g.board.length,22);assert.equal(g.next.length,5);assert.equal(g.fits(g.piece),true);
 const names=[g.piece.kind,...g.next,g.draw()];assert.equal(new Set(names).size,7);
});
test('Gravity, soft drop, hard drop and lock delay',()=>{
 const g=game(),y=g.piece.y;for(let i=0;i<9;i++)g.tick(100);assert.ok(g.piece.y>y);
 assert.equal(g.softDrop(),true);assert.equal(g.score,1);g.hardDrop();assert.equal(g.placed,1);assert.ok(g.board.flat().some(Boolean));
 const h=game();h.piece.y=h.ghostY();for(let i=0;i<4;i++)h.tick(100);assert.equal(h.placed,0);h.tick(100);assert.equal(h.placed,1);
});
test('Rotations retain four integer cells, honor borders and never overwrite blocks',()=>{
 for(const kind of Object.keys(T.SHAPES)){
  const g=game();g.piece={kind,x:3,y:5,cells:T.SHAPES[kind].map(c=>c.slice())};const before=JSON.stringify(g.piece.cells);
  for(let i=0;i<4;i++)g.rotate();assert.equal(JSON.stringify(g.piece.cells),before);assert.ok(g.piece.cells.every(c=>c.every(Number.isInteger)));
  for(let i=0;i<20;i++)g.move(-1);assert.equal(g.fits(g.piece),true);g.rotate();assert.equal(g.fits(g.piece),true);
 }
});
for(let lines=1;lines<=4;lines++)test(lines+' cleared lines emit one message and award classic points',()=>{
 const g=game();for(let y=22-lines;y<22;y++)g.board[y]=Array.from({length:10},(_,x)=>x===4?null:'G');
 g.piece={kind:'I',x:4,y:18,cells:[[0,0],[0,1],[0,2],[0,3]]};g.lock();
 assert.equal(g.lines,lines);assert.equal(g.score,[0,100,300,500,800][lines]);assert.deepEqual(g.drainEvents(),[{type:'clear',lines}]);assert.deepEqual(g.drainEvents(),[]);
 assert.ok(g.board.every(row=>!row.every(Boolean)));
});
test('Incoming rows wait for the lock and each has exactly one hole',()=>{
 const g=game();g.queueGarbage(2);assert.equal(g.pending,2);assert.equal(g.board.flat().filter(Boolean).length,0);g.hardDrop();assert.equal(g.pending,0);
 for(const row of g.board.slice(-2)){assert.equal(row.filter(Boolean).length,9);assert.equal(row.filter(c=>c==='G').length,9);}
});
test('Garbage overflow and blocked spawns end the game',()=>{
 const g=game();g.board[0][0]='G';g.queueGarbage(1);g.hardDrop();assert.equal(g.over,true);
 const h=game();h.board[0]=Array(10).fill('G');h.spawn();assert.equal(h.over,true);
});
test('Pending garbage cannot grow without bound or accept invalid counts',()=>{
 const g=game();g.queueGarbage(-1);g.queueGarbage(1.5);assert.equal(g.pending,0);g.queueGarbage(101);assert.equal(g.pending,100);
});
function harness(){
 const calls=[],statuses=[],rosters=[],attacks=[],scheduled=new Map();let timer=0;const responses=[];
 const fetcher=async(url,options)=>{calls.push(JSON.parse(options.body));const r=responses.shift();if(r instanceof Error)throw r;return {ok:r?.ok!==false,status:r?.status||200,headers:{get:()=>r?.type||'application/json'},json:async()=>r?.body||{left:true}};};
 const room=new Room({fetcher,onStatus:s=>statuses.push(s),onRoster:(p,id)=>rosters.push({p,id}),onAttack:e=>attacks.push(e),id:()=> 'unique-event-123456',schedule:(fn,delay)=>{scheduled.set(++timer,{fn,delay});return timer;},unschedule:id=>scheduled.delete(id)});
 return {room,calls,statuses,rosters,attacks,responses,scheduled};
}
const joined={body:{token:'secret',id:'me',cursor:10,players:[{id:'me',name:'Anna'},{id:'other',name:'Ben'}]}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('Joining displays the roster and polls only after the join cursor',async()=>{
 const h=harness();h.responses.push(joined);h.room.start('Anna');await settle();assert.equal(h.statuses.at(-1),'online');assert.equal(h.rosters.at(-1).p.length,2);assert.equal(h.rosters.at(-1).id,'me');
 h.responses.push({body:{cursor:11,players:joined.body.players,events:[{seq:11,name:'Ben',rows:2,lines:4}]}});await h.room.cycle(h.room.version);
 assert.equal(h.calls.at(-1).after,10);assert.equal(h.attacks.length,1);assert.equal(h.room.session.cursor,11);
 h.responses.push({body:{cursor:11,players:[],events:[{seq:11,name:'Ben',rows:2,lines:4}]}});await h.room.cycle(h.room.version);assert.equal(h.attacks.length,1);assert.equal(h.rosters.at(-1).p.length,0);
});
test('Static/non-PHP hosting falls back to singleplayer with no retry storm',async()=>{
 const h=harness();h.responses.push({type:'text/html',body:{}});h.room.start('Anna');await settle();assert.equal(h.statuses.at(-1),'single');assert.equal(h.room.session,null);assert.equal(h.scheduled.size,0);
});
test('Network failure clears stale roster and rejoining uses a fresh cursor',async()=>{
 const h=harness();h.responses.push(joined);h.room.start('Anna');await settle();h.responses.push(Error('offline'));await h.room.cycle(h.room.version);
 assert.equal(h.statuses.at(-1),'offline');assert.equal(h.rosters.at(-1).p.length,0);assert.equal(h.room.queue.length,0);
 h.responses.push({body:{...joined.body,cursor:500}});await h.room.connect(h.room.version);assert.equal(h.room.session.cursor,500);
});
test('Clears send the name-bound session, count and stable event ID',async()=>{
 const h=harness();h.responses.push(joined);h.room.start('Anna');await settle();
 h.responses.push({body:{accepted:true}},{body:{cursor:11,players:joined.body.players,events:[]}});h.room.attack(4);await settle();
 const message=h.calls.find(c=>c.action==='clear');assert.equal(message.token,'secret');assert.equal(message.name,'Anna');assert.equal(message.lines,4);assert.equal(message.eventId,'unique-event-123456');assert.equal(h.room.queue.length,0);
});
test('Rate-limit retry keeps the same event ID; stopping removes the session',async()=>{
 const h=harness();h.responses.push(joined);h.room.start('Anna');await settle();h.responses.push({ok:false,status:429,body:{error:'wait'}});h.room.attack(2);await settle();assert.equal(h.room.queue.length,1);
 h.responses.push({body:{accepted:true}},{body:{cursor:12,players:[],events:[]}});await h.room.cycle(h.room.version);
 assert.deepEqual(h.calls.filter(c=>c.action==='clear').map(c=>c.eventId),['unique-event-123456','unique-event-123456']);
 h.room.stop();await settle();assert.equal(h.calls.at(-1).action,'leave');assert.equal(h.room.session,null);assert.equal(h.scheduled.size,0);
});
