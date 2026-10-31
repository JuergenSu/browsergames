/* No timers or DOM: pieces move only when the player places them. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BlockPuzzle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const SIZE = 10;
  const SHAPES = {
    I: [[0,0],[0,1],[0,2],[0,3]],
    O: [[0,0],[0,1],[1,0],[1,1]],
    T: [[0,0],[0,1],[0,2],[1,1]],
    S: [[0,1],[0,2],[1,0],[1,1]],
    Z: [[0,0],[0,1],[1,1],[1,2]],
    J: [[0,0],[1,0],[1,1],[1,2]],
    L: [[0,2],[1,0],[1,1],[1,2]]
  };
  function normalize(cells) {
    const minRow = Math.min(...cells.map(c => c[0]));
    const minCol = Math.min(...cells.map(c => c[1]));
    return cells.map(([r,c]) => [r-minRow,c-minCol]).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  }
  function rotate(cells) { return normalize(cells.map(([r,c]) => [c,-r])); }
  function orientations(cells) {
    const result = [], seen = new Set();
    let rotated = normalize(cells);
    for (let i=0;i<4;i++) {
      const key = JSON.stringify(rotated);
      if (!seen.has(key)) { seen.add(key); result.push(rotated); }
      rotated = rotate(rotated);
    }
    return result;
  }
  function canPlace(board,cells,row,col,size=SIZE) {
    return Number.isInteger(row) && Number.isInteger(col) && cells.every(([r,c]) => {
      const rr=row+r, cc=col+c;
      return rr>=0 && cc>=0 && rr<size && cc<size && !board[rr*size+cc];
    });
  }
  function hasPlacement(board,cells,size=SIZE) {
    return orientations(cells).some(shape => {
      for (let r=0;r<size;r++) for(let c=0;c<size;c++) if(canPlace(board,shape,r,c,size))return true;
      return false;
    });
  }
  function clearLines(board,size=SIZE) {
    // Find both directions BEFORE removing anything. An intersection scores once.
    const rows=[],cols=[],cleared=new Set();
    for(let i=0;i<size;i++) {
      if(Array.from({length:size},(_,c)=>board[i*size+c]).every(Boolean))rows.push(i);
      if(Array.from({length:size},(_,r)=>board[r*size+i]).every(Boolean))cols.push(i);
    }
    rows.forEach(r=>{for(let c=0;c<size;c++)cleared.add(r*size+c);});
    cols.forEach(c=>{for(let r=0;r<size;r++)cleared.add(r*size+c);});
    const next=board.slice();cleared.forEach(i=>{next[i]=null;});
    return {board:next,rows,cols,cleared:[...cleared],removed:cleared.size};
  }
  function drawPiece(bag,rng) {
    const nextBag=bag.slice();
    if(!nextBag.length) {
      nextBag.push(...Object.keys(SHAPES));
      for(let i=nextBag.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[nextBag[i],nextBag[j]]=[nextBag[j],nextBag[i]];}
    }
    const kind=nextBag.pop();
    return {piece:{kind,cells:normalize(SHAPES[kind])},bag:nextBag};
  }
  function newGame(rng=Math.random) {
    const {piece,bag}=drawPiece([],rng);
    return {size:SIZE,board:Array(SIZE*SIZE).fill(null),piece,bag,points:0,placed:0,lines:0,over:false};
  }
  function turn(state) {
    if(state.over)return state;
    return {...state,piece:{...state.piece,cells:rotate(state.piece.cells)}};
  }
  function place(state,row,col,rng=Math.random) {
    if(state.over || !canPlace(state.board,state.piece.cells,row,col,state.size))return null;
    const board=state.board.slice();
    state.piece.cells.forEach(([r,c])=>{board[(row+r)*state.size+col+c]=state.piece.kind;});
    const result=clearLines(board,state.size),{piece,bag}=drawPiece(state.bag,rng);
    const next={...state,board:result.board,piece,bag,points:state.points+result.removed,placed:state.placed+1,lines:state.lines+result.rows.length+result.cols.length};
    next.over=!hasPlacement(next.board,piece.cells,state.size);
    return {state:next,cleared:result.cleared,removed:result.removed,rows:result.rows.length,cols:result.cols.length};
  }
  return {SIZE,SHAPES,normalize,rotate,orientations,canPlace,hasPlacement,clearLines,drawPiece,newGame,turn,place};
});
