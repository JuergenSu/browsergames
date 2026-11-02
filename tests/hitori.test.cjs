const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../hitori/index.html'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const context={};vm.createContext(context);
vm.runInContext(script.split('const KEY=')[0]+';globalThis.api={GAME,U,hitoriCount};',context);
const {GAME,U,hitoriCount}=context.api;
const generate=level=>{const seed=U.hash('hitori-v3-'+level);return GAME.generate(level,seed,U.rng(seed));};
const baseline=require('./hitori-original-hashes.json');
const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const seen=new Set();
for(let level=1;level<=124;level++)test('Hitori level '+level+': valid, unique, repeatable puzzle',()=>{
  const p=generate(level),n=p.rows,blacks=new Set(p.solution);
  assert.equal(p.cols,n);assert.equal(p.values.length,n*n);
  assert.equal(hitoriCount(n,p.values,p.givens,2),1);
  assert.equal(hash(generate(level)),hash(p));
  if(level<=24)assert.equal(hash(p),baseline[level],'existing level must remain unchanged');
  const key=JSON.stringify([p.values,p.givens]);assert.equal(seen.has(key),false);seen.add(key);
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    const i=r*n+c;
    if(blacks.has(i)){
      if(c+1<n)assert.equal(blacks.has(i+1),false);
      if(r+1<n)assert.equal(blacks.has(i+n),false);
    }else{
      for(let k=c+1;k<n;k++)if(!blacks.has(r*n+k))assert.notEqual(p.values[i],p.values[r*n+k]);
      for(let k=r+1;k<n;k++)if(!blacks.has(k*n+c))assert.notEqual(p.values[i],p.values[k*n+c]);
    }
  }
  for(const [i,b] of p.givens)assert.equal(blacks.has(i),b===1);
  const start=p.values.findIndex((_,i)=>!blacks.has(i)),reached=new Set([start]),queue=[start];
  for(const i of queue){const r=Math.floor(i/n),c=i%n;for(const j of [r>0?i-n:-1,r+1<n?i+n:-1,c>0?i-1:-1,c+1<n?i+1:-1])if(j>=0&&!blacks.has(j)&&!reached.has(j)){reached.add(j);queue.push(j);}}
  assert.equal(reached.size,n*n-blacks.size);
  const solved={values:p.values.map((_,i)=>blacks.has(i)?1:2)};assert.equal(GAME.check(p,solved).won,true);
});
test('Navigation, progress and resume use all 124 levels and retain the storage key',()=>{
  const elements=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',style:{},options:[],listeners:{},add(option){this.options.push(option);},addEventListener(name,listener){this.listeners[name]=listener;}});return elements.get(id);};
  const ui={Option:function(text,value){this.text=text;this.value=String(value);},document:{getElementById:el},localStorage:{getItem:()=>JSON.stringify({done:{1:true,24:true,25:true,124:true,125:true,0:true},best:{1:42},last:124})}};
  vm.createContext(ui);vm.runInContext(script.replace(/init\(\);\s*$/,'')+';updateProgress();globalThis.result={TOTAL,KEY,store};',ui);
  assert.equal(ui.result.TOTAL,124);assert.equal(ui.result.KEY,'raetselwerkstatt-hitori-v2');assert.equal(ui.result.store.last,124);assert.equal(ui.result.store.best[1],42);
  assert.equal(el('progressText').textContent,'4 von 124 Level geschafft');assert.equal(el('progressBar').style.width,4/124*100+'%');
  vm.runInContext('load=n=>{level=n;globalThis.loaded=n;};init();',ui);
  assert.equal(ui.loaded,124);assert.equal(el('level').options.length,125);assert.equal(el('level').options[123].value,'124');assert.equal(el('level').options[124].value,'random');
  vm.runInContext('level=24;',ui);el('next').listeners.click();assert.equal(ui.loaded,25);
  vm.runInContext('level=124;globalThis.loaded=124;',ui);el('next').listeners.click();assert.equal(ui.loaded,124);el('prev').listeners.click();assert.equal(ui.loaded,123);
});
