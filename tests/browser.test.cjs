const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const P=require('../puzzle/engines.js');
const base=process.env.GAMES_URL||'http://127.0.0.1:8000';
async function open(game,viewport={width:1280,height:900}){
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage({viewport});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/'+game+'/index.html');
  await page.locator('#board [data-index]').first().waitFor();
  await page.evaluate(()=>{window.submissions=[];window.Highscore={submit:r=>window.submissions.push(r)};});
  return {browser,page,errors};
}
for(const game of ['netwalk','skyscrapers','sokoban']){
  test(game+': mobile layout, all level loads, reset and error-free initialization',async()=>{
    const {browser,page,errors}=await open(game,{width:360,height:800});
    try{
      for(let level=1;level<=24;level++){
        await page.selectOption('#level',String(level));
        assert.equal(await page.locator('#win').isHidden(),true);
        assert.equal(await page.locator('#moves').textContent(),'0');
      }
      await page.getByRole('button',{name:'Neustart'}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.locator('#levels button').count(),24);
      await page.screenshot({path:'/tmp/'+game+'-mobile.png',fullPage:true});
      assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  });
}
test('Netwalk: rotation, lock, undo and exactly one score per solved round',async()=>{
  const {browser,page,errors}=await open('netwalk');
  try{
    const p=P.netwalk(1),i=p.cells.findIndex(m=>P.rotate(m)!==m),cell=page.locator('[data-index="'+i+'"]');
    await cell.click({button:'right'});await cell.click();assert.equal(await page.locator('#moves').textContent(),'0');
    await cell.click({button:'right'});await cell.click();assert.equal(await page.locator('#moves').textContent(),'1');
    await page.locator('#undo').click();assert.equal(await page.locator('#moves').textContent(),'2');
    await page.locator('#reset').click();
    for(let j=0;j<p.cells.length;j++){
      let mask=p.cells[j];while(mask!==p.solution[j]){await page.locator('[data-index="'+j+'"]').click();mask=P.rotate(mask);}
    }
    assert.equal(await page.locator('#win').isVisible(),true);
    const score=await page.evaluate(()=>window.submissions);assert.equal(score.length,1);assert.equal(score[0].game,'netwalk');assert.equal(score[0].level,1);assert.ok(score[0].moves>0);assert.ok(score[0].time>0);
    await page.locator('[data-index="0"]').click();assert.equal(await page.evaluate(()=>window.submissions.length),1);
    await page.reload();await page.locator('#board [data-index]').first().waitFor();assert.match(await page.locator('#progress').textContent(),/^1 \/ 24/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
test('Skyscrapers: keyboard, fixed cells, validation, undo and win',async()=>{
  const {browser,page,errors}=await open('skyscrapers');
  try{
    const p=P.skyscrapers(1),fixed=p.givens.findIndex(Boolean),free=p.givens.findIndex(v=>!v);
    await page.locator('[data-index="'+fixed+'"]').click();await page.keyboard.press('1');assert.equal(await page.locator('#moves').textContent(),'0');
    await page.locator('[data-index="'+free+'"]').click();await page.keyboard.press(String(p.solution[free]));
    assert.equal(await page.locator('#moves').textContent(),'1');await page.locator('#undo').click();assert.equal(await page.locator('[data-index="'+free+'"]').textContent(),'');
    await page.locator('#reset').click();
    for(let i=0;i<p.givens.length;i++)if(!p.givens[i]){
      await page.locator('[data-index="'+i+'"]').click();await page.getByRole('button',{name:'Höhe '+p.solution[i],exact:true}).click();
    }
    assert.equal(await page.locator('#win').isVisible(),true);const scores=await page.evaluate(()=>window.submissions);assert.equal(scores.length,1);assert.equal(scores[0].game,'skyscrapers');
    await page.locator('#next').click();assert.equal(await page.locator('#level').inputValue(),'2');assert.equal(await page.locator('#win').isHidden(),true);
    await page.locator('#check').click();assert.match(await page.locator('#status').textContent(),/keine Regel verletzt/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
test('Sokoban: keyboard solution, undo, blocked move and win',async()=>{
  const {browser,page,errors}=await open('sokoban');
  try{
    const p=P.sokoban(1),keys=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'];
    const first=p.solution[0];await page.keyboard.press(keys[first]);assert.equal(await page.locator('#moves').textContent(),'1');
    await page.getByRole('button',{name:'Rückgängig'}).click();assert.equal(await page.locator('#moves').textContent(),'2');
    await page.locator('#reset').click();
    for(const d of p.solution)await page.keyboard.press(keys[d]);
    assert.equal(await page.locator('#win').isVisible(),true);
    const scores=await page.evaluate(()=>window.submissions);assert.equal(scores.length,1);assert.equal(scores[0].game,'sokoban');assert.equal(scores[0].level,1);
    await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>window.submissions.length),1);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
test('Games remain playable when storage is unavailable',async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try{
    const page=await browser.newPage();await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});});
    for(const game of ['netwalk','skyscrapers','sokoban']){await page.goto(base+'/'+game+'/index.html');assert.equal(await page.locator('#levels button').count(),24);}
  }finally{await browser.close();}
});
