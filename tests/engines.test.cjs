const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../puzzle/engines.js');
for(let level=1;level<=24;level++){
  test(`Netwalk ${level}: deterministic, connected solution, scrambled start`,()=>{
    const p=P.netwalk(level);assert.deepEqual(p,P.netwalk(level));
    assert.equal(P.networkStatus(p.cells,p.n,p.source).solved,false);
    assert.equal(P.networkStatus(p.solution,p.n,p.source).solved,true);
    assert.equal(p.solution.reduce((s,m)=>s+m.toString(2).replace(/0/g,'').length,0),2*(p.n*p.n-1));
    p.cells.forEach((mask,i)=>{const rotations=[mask];for(let k=0;k<3;k++)rotations.push(P.rotate(rotations.at(-1)));assert.ok(rotations.includes(p.solution[i]));});
  });
  test(`Skyscrapers ${level}: exactly one solution, fixed clues match`,()=>{
    const p=P.skyscrapers(level),result=P.skySolutions(p.givens,p.n,p.clues);
    assert.equal(result.count,1);assert.deepEqual(result.solution,p.solution);
    assert.equal(P.skyErrors(p.solution,p.n,p.clues).solved,true);
    assert.equal(P.skyErrors(p.givens,p.n,p.clues).solved,false);
    assert.deepEqual(p,P.skyscrapers(level));
  });
  test(`Sokoban ${level}: every solution step is legal and solves all boxes`,()=>{
    const p=P.sokoban(level);assert.deepEqual(p,P.sokoban(level));
    assert.equal(p.goals.length,level<=8?2:level<=16?3:4);
    let state={player:p.player,boxes:p.boxes.slice()},pushes=0;
    assert.equal(P.sokobanSolved(p,state),false);
    for(const d of p.solution){state=P.sokobanMove(p,state,d);assert.ok(state,'generated inverse route must be legal');if(state.pushed)pushes++;assert.equal(new Set(state.boxes).size,p.goals.length);assert.ok(!state.boxes.includes(state.player));}
    assert.ok(pushes>0);assert.equal(P.sokobanSolved(p,state),true);
  });
}
test('Netwalk rejects reciprocal-looking connections across the border',()=>{
  assert.equal(P.neighbor(1,1,2),-1);assert.equal(P.networkStatus([8,2,8,2],2,0).solved,false);
  assert.equal(P.rotate(P.rotate(P.rotate(P.rotate(7)))),7);
});
test('Skyscrapers validates both directions and rejects duplicate heights',()=>{
  assert.equal(P.visible([2,1,4,3]),2);
  const p=P.skyscrapers(1),v=p.solution.slice();v[0]=v[1];
  assert.equal(P.skyErrors(v,p.n,p.clues).solved,false);assert.ok(P.skyErrors(v,p.n,p.clues).bad.has(0));
  const clues=structuredClone(p.clues);clues.bottom[0]=clues.bottom[0]%p.n+1;
  assert.equal(P.skyErrors(p.solution,p.n,clues).solved,false);
});
test('Sokoban refuses walls, double pushes and out of bounds',()=>{
  const p={n:5,walls:[0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24],goals:[8,13]};
  assert.equal(P.sokobanMove(p,{player:6,boxes:[7,8]},1),null);
  assert.equal(P.sokobanMove(p,{player:6,boxes:[7,8]},0),null);
  assert.equal(P.sokobanMove({n:2,walls:[]},{player:1,boxes:[]},1),null);
  assert.equal(P.sokobanMove(p,{player:6,boxes:[7,13]},1).pushed,true);
});
