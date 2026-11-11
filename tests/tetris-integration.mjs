// Optional test-only PHP 8.3 WebAssembly runtime; no socket or test server needed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Room}=require('../tetris-multiplayer/room.js');
const {Game}=require('../tetris-multiplayer/engine.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleURL=name=>process.env.PHP_WASM_MODULES?pathToFileURL(path.join(process.env.PHP_WASM_MODULES,name,'index.js')).href:name;
const {PHP,loadPHPRuntime}=await import(moduleURL('@php-wasm/universal'));
const {getPHPLoaderModule}=await import(moduleURL('@php-wasm/node-8-3'));
async function runtime(){
 const php=new PHP(await loadPHPRuntime(await getPHPLoaderModule()));
 php.mkdirTree('/site/tetris-multiplayer');php.mkdirTree('/site/tests');
 php.writeFile('/site/tetris-multiplayer/api.php',fs.readFileSync(path.join(root,'tetris-multiplayer/api.php')));
 php.writeFile('/site/tests/tetris-room.php',fs.readFileSync(path.join(root,'tests/tetris-room.php')));
 return php;
}
const php=await runtime();
const encoder=new TextEncoder();
let tail=Promise.resolve();
function request(body,{method='POST',type='application/json',site='same-origin',directory='/test-room'}={}){
 const run=()=>php.run({scriptPath:'/site/tetris-multiplayer/api.php',method,headers:{'Content-Type':type,'Sec-Fetch-Site':site},body:encoder.encode(typeof body==='string'?body:JSON.stringify(body)),env:{TETRIS_DATA_DIR:directory}});
 const result=tail.then(run);tail=result.catch(()=>{});return result;
}
async function api(body,options){const response=await request(body,options);return {status:response.httpStatusCode,body:JSON.parse(response.text)};}
test('42 PHP library checks use actual PHP 8.3',async()=>{
 const r=await php.run({scriptPath:'/site/tests/tetris-room.php'});assert.equal(r.exitCode,0);assert.match(r.text,/42 PHP room checks passed/);
});
test('Real PHP request handler enforces HTTP validation and persists room state',async()=>{
 assert.equal((await api({}, {method:'GET'})).status,405);
 assert.equal((await api({}, {type:'text/plain'})).status,415);
 assert.equal((await api({}, {site:'cross-site'})).status,403);
 assert.equal((await api('x'.repeat(4097))).status,413);
 assert.equal((await api('{')).status,400);
 const alice=await api({action:'join',name:'Alice'});assert.equal(alice.status,200);
 const bob=await api({action:'join',name:'Bob'});assert.equal(bob.body.players.length,2);
 const attack={action:'clear',token:alice.body.token,lines:4,eventId:'http-event-00000001'};
 assert.equal((await api(attack)).body.accepted,true);assert.equal((await api(attack)).body.duplicate,true);
 const poll=await api({action:'poll',token:bob.body.token,after:bob.body.cursor});
 assert.deepEqual(poll.body.events.map(e=>[e.name,e.lines,e.rows]),[['Alice',4,2]]);
 assert.equal((await api({action:'poll',token:alice.body.token,after:0})).body.events.length,0);
 const late=await api({action:'join',name:'Late'});
 assert.equal((await api({action:'poll',token:late.body.token,after:0})).body.events.length,0);
 await api({action:'leave',token:bob.body.token});
 assert.equal((await api({action:'poll',token:bob.body.token,after:0})).status,410);
 const roster=await api({action:'poll',token:alice.body.token,after:poll.body.cursor});assert.deepEqual(roster.body.players.map(p=>p.name).sort(),['Alice','Late']);
 assert.ok(php.fileExists('/test-room/room.json'));assert.ok(php.fileExists('/test-room/room.lock'));
});
test('Two actual JS clients exchange attacks through PHP and update their rosters',async()=>{
 const entries=[],attacks=[],engine=new Game(()=>.5);let timer=0;
 const fetcher=async(_url,options)=>{
  const r=await request(options.body,{directory:'/client-room'});
  return new Response(r.bytes,{status:r.httpStatusCode,headers:{'Content-Type':'application/json'}});
 };
 const make=(name,onAttack=()=>{})=>{
  const client=new Room({fetcher,onAttack,onRoster:(players,id)=>entries.push({name,players,id}),id:()=> 'client-event-000001',schedule:()=>++timer,unschedule:()=>{}});
  return client;
 };
 const alice=make('Alice'),bob=make('Bob',e=>{attacks.push(e);engine.queueGarbage(e.rows);});
 // Connect directly with controlled scheduling; production start uses this same path.
 alice.wanted=true;alice.name='Alice';await alice.connect(alice.version);
 bob.wanted=true;bob.name='Bob';await bob.connect(bob.version);
 assert.equal(entries.at(-1).players.length,2);
 alice.attack(4);while(alice.busy)await new Promise(resolve=>setImmediate(resolve));
 await bob.cycle(bob.version);assert.equal(attacks.length,1);assert.equal(attacks[0].name,'Alice');assert.equal(engine.pending,2);
 await bob.cycle(bob.version);assert.equal(attacks.length,1);
 engine.hardDrop();assert.ok(engine.board.slice(-2).every(row=>row.filter(Boolean).length===9));
 alice.stop();await tail;await bob.cycle(bob.version);
 assert.deepEqual(entries.at(-1).players.map(p=>p.name),['Bob']);bob.stop();await tail;
});
