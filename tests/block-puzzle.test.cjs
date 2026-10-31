const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../tetris-puzzle/engine.js');
const empty=()=>Array(P.SIZE*P.SIZE).fill(null);
const fixed=()=>0.5;
function stateFor(board,kind='O'){
  return {...P.newGame(fixed),board,piece:{kind,cells:P.normalize(P.SHAPES[kind])},bag:['I'],points:0};
}
test('All seven tetrominoes have four distinct orthogonally connected cells',()=>{
  assert.equal(Object.keys(P.SHAPES).length,7);
  for(const shape of Object.values(P.SHAPES)){
    assert.equal(new Set(shape.map(String)).size,4);
    for(const cells of P.orientations(shape)){
      assert.equal(cells.length,4);assert.equal(Math.min(...cells.map(c=>c[0])),0);assert.equal(Math.min(...cells.map(c=>c[1])),0);
      assert.equal(P.canPlace(empty(),cells,0,0),true);
      const reached=new Set([String(cells[0])]);
      for(let k=0;k<4;k++)for(const a of cells)if(cells.some(b=>reached.has(String(b))&&Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1))reached.add(String(a));
      assert.equal(reached.size,4);
    }
    let rotated=shape;for(let i=0;i<4;i++)rotated=P.rotate(rotated);
    assert.deepEqual(rotated,P.normalize(shape));
  }
  assert.equal(P.orientations(P.SHAPES.O).length,1);assert.equal(P.orientations(P.SHAPES.I).length,2);assert.equal(P.orientations(P.SHAPES.T).length,4);
});
test('A seven-bag provides each shape once and never mutates the previous bag',()=>{
  let bag=[],found=[];
  for(let i=0;i<7;i++){
    const copy=bag.slice(),next=P.drawPiece(bag,fixed);
    assert.deepEqual(bag,copy);bag=next.bag;found.push(next.piece.kind);
  }
  assert.deepEqual(found.sort(),Object.keys(P.SHAPES).sort());assert.equal(bag.length,0);
});
test('Invalid placements reject overlap and every border without changing state',()=>{
  const board=empty();board[0]='I';const state=stateFor(board),copy=structuredClone(state);
  for(const [r,c] of [[0,0],[-1,2],[2,-1],[9,0],[0,9],[10,0],[0,10],[0.5,1],[NaN,0]])assert.equal(P.place(state,r,c,fixed),null);
  assert.deepEqual(state,copy);
});
test('Pieces stay exactly where placed, with no gravity, points or line movement',()=>{
  const state=stateFor(empty()),result=P.place(state,2,5,fixed);
  assert.deepEqual(result.state.board.map((v,i)=>v?i:null).filter(v=>v!==null),[25,26,35,36]);
  assert.equal(result.removed,0);assert.equal(result.state.points,0);assert.equal(result.state.placed,1);assert.equal(result.state.lines,0);assert.deepEqual(state.board,empty());
});
test('A horizontal line removes and counts exactly ten fields',()=>{
  const board=empty();for(let c=0;c<8;c++)board[9*10+c]='T';board[73]='L';
  const state=stateFor(board),result=P.place(state,8,8,fixed);
  assert.equal(result.rows,1);assert.equal(result.cols,0);assert.equal(result.removed,10);assert.equal(result.state.points,10);assert.equal(result.state.lines,1);
  assert.ok(result.state.board.slice(90).every(v=>v===null));assert.equal(result.state.board[73],'L');assert.equal(result.state.board[88],'O');
});
test('A vertical line removes and counts exactly ten fields',()=>{
  const board=empty();for(let r=0;r<8;r++)board[r*10+9]='T';
  const result=P.place(stateFor(board),8,8,fixed);
  assert.equal(result.rows,0);assert.equal(result.cols,1);assert.equal(result.removed,10);assert.equal(result.state.points,10);
  for(let r=0;r<10;r++)assert.equal(result.state.board[r*10+9],null);
  assert.equal(result.state.board[88],'O');assert.equal(result.state.board[98],'O');
});
test('Crossing lines disappear simultaneously and the intersection counts once',()=>{
  const board=empty();for(let i=0;i<10;i++){board[4*10+i]='I';board[i*10+6]='I';}
  board[0]='Z';const result=P.clearLines(board);
  assert.deepEqual(result.rows,[4]);assert.deepEqual(result.cols,[6]);assert.equal(result.removed,19);assert.equal(result.cleared.length,19);
  assert.equal(result.board[0],'Z');assert.equal(board[46],'I');
});
test('A placement completing a cross awards 19 points, not 20',()=>{
  const board=empty();for(let c=0;c<10;c++)if(c!==4&&c!==5)board[4*10+c]='L';
  for(let r=0;r<10;r++)if(r!==4&&r!==5)board[r*10+4]='S';
  const result=P.place(stateFor(board),4,4,fixed);
  assert.equal(result.rows,1);assert.equal(result.cols,1);assert.equal(result.state.points,19);assert.equal(result.state.lines,2);assert.equal(result.state.board[55],'O');
});
test('Multiple rows and columns are removed as a union',()=>{
  const board=empty();for(let i=0;i<100;i++)if([0,1].includes(Math.floor(i/10))||[8,9].includes(i%10))board[i]='I';
  const result=P.clearLines(board);assert.equal(result.removed,36);assert.equal(result.rows.length,2);assert.equal(result.cols.length,2);assert.ok(result.board.every(v=>v===null));
});
test('Game over checks every orientation, including the last possible corner',()=>{
  const board=Array(100).fill('Z');for(const i of [69,79,89,99])board[i]=null;
  assert.equal(P.canPlace(board,P.SHAPES.I,6,9),false);
  assert.equal(P.hasPlacement(board,P.SHAPES.I),true);
  board[99]='Z';assert.equal(P.hasPlacement(board,P.SHAPES.I),false);
});
test('The board can be almost empty yet the next O block cannot fit',()=>{
  const board=empty();for(let r=0;r<10;r++)for(let c=0;c<10;c++)if((r+c)%2===0)board[r*10+c]='Z';
  assert.equal(P.hasPlacement(board,P.SHAPES.O),false);
});
test('Clearing happens before the next-piece game-over check',()=>{
  const board=empty();for(let c=0;c<8;c++)board[c]='Z';
  const state=stateFor(board);state.points=30;
  const result=P.place(state,0,8,fixed);
  assert.equal(result.state.points,40);assert.equal(result.state.over,false);assert.equal(result.state.piece.kind,'I');
});
test('An unplaceable next piece ends the round; no more turns or placements',()=>{
  const board=empty();for(let r=0;r<10;r++)for(let c=0;c<10;c++)if((r+c)%2===0)board[r*10+c]='Z';
  // Make one O-sized opening for the final move. All remaining holes are isolated.
  for(const i of [0,1,10,11])board[i]=null;
  const state=stateFor(board);state.bag=['O'];
  const result=P.place(state,0,0,fixed);
  assert.equal(result.state.over,true);assert.equal(result.state.placed,1);assert.equal(P.place(result.state,8,8,fixed),null);assert.equal(P.turn(result.state),result.state);
});
test('New round resets score and board; turning never changes either',()=>{
  const initial=P.newGame(fixed);assert.equal(initial.points,0);assert.equal(initial.placed,0);assert.equal(initial.over,false);assert.equal(initial.board.filter(Boolean).length,0);
  const rotated=P.turn(initial);assert.deepEqual(rotated.board,initial.board);assert.equal(rotated.points,0);assert.equal(rotated.placed,0);assert.deepEqual(initial.piece.cells,P.normalize(P.SHAPES[initial.piece.kind]));
});
test('Seeded complete rounds preserve occupancy, score, legal moves and terminal state',()=>{
  for(let seed=1;seed<=25;seed++){
    let x=seed;const rng=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
    let state=P.newGame(rng),removed=0;
    for(let move=0;!state.over&&move<500;move++){
      const candidates=[];
      for(const shape of P.orientations(state.piece.cells))for(let r=0;r<10;r++)for(let c=0;c<10;c++)if(P.canPlace(state.board,shape,r,c))candidates.push({shape,r,c});
      assert.ok(candidates.length>0);const choice=candidates[Math.floor(rng()*candidates.length)];
      state={...state,piece:{...state.piece,cells:choice.shape}};
      const before=state.board.filter(Boolean).length,result=P.place(state,choice.r,choice.c,rng);assert.ok(result);
      assert.equal(result.state.board.filter(Boolean).length,before+4-result.removed);
      removed+=result.removed;state=result.state;assert.equal(state.points,removed);assert.equal(state.over,!P.hasPlacement(state.board,state.piece.cells));
      assert.equal(P.clearLines(state.board).removed,0);
    }
    assert.equal(state.over,true);
  }
});
