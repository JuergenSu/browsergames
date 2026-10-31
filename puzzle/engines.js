/* Pure game rules, shared by the browser and node --test. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Puzzle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const DIR = [[-1,0],[0,1],[1,0],[0,-1]];
  function random(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(a, rng) {
    for (let i=a.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  function neighbor(i, d, n) {
    const r=Math.floor(i/n)+DIR[d][0], c=i%n+DIR[d][1];
    return r<0||c<0||r>=n||c>=n ? -1 : r*n+c;
  }
  const rotate = mask => ((mask<<1)&15)|(mask>>3);
  function networkStatus(cells,n,source) {
    const connected=new Set([source]), queue=[source]; let leaks=0;
    cells.forEach((mask,i) => DIR.forEach((_,d) => {
      if (!(mask&(1<<d))) return;
      const j=neighbor(i,d,n);
      if (j<0 || !(cells[j]&(1<<((d+2)%4)))) leaks++;
    }));
    for (let k=0;k<queue.length;k++) {
      const i=queue[k];
      DIR.forEach((_,d) => {
        const j=neighbor(i,d,n);
        if ((cells[i]&(1<<d))&&j>=0&&(cells[j]&(1<<((d+2)%4)))&&!connected.has(j)) { connected.add(j); queue.push(j); }
      });
    }
    return {connected,leaks,solved:connected.size===cells.length&&leaks===0};
  }
  function netwalk(level) {
    const n=level<=8?4:level<=16?5:6, rng=random(32000+level), source=Math.floor(n/2)*n+Math.floor(n/2);
    const solution=Array(n*n).fill(0), seen=new Set([source]), stack=[source];
    while (stack.length) {
      const i=stack[stack.length-1];
      const choices=shuffle([0,1,2,3],rng).filter(d=>{const j=neighbor(i,d,n);return j>=0&&!seen.has(j);});
      if (!choices.length) {stack.pop();continue;}
      const d=choices[0], j=neighbor(i,d,n);
      solution[i]|=1<<d;solution[j]|=1<<((d+2)%4);seen.add(j);stack.push(j);
    }
    const cells=solution.map(mask=>{for(let k=Math.floor(rng()*4);k>0;k--)mask=rotate(mask);return mask;});
    if(networkStatus(cells,n,source).solved){const i=cells.findIndex(m=>rotate(m)!==m);cells[i]=rotate(cells[i]);}
    return {n,source,solution,cells};
  }
  function visible(line) {let max=0,count=0;for(const v of line)if(v>max){max=v;count++;}return count;}
  function cluesFor(values,n) {
    const top=[],bottom=[],left=[],right=[];
    for(let r=0;r<n;r++){const row=values.slice(r*n,(r+1)*n),col=Array.from({length:n},(_,c)=>values[c*n+r]);left.push(visible(row));right.push(visible(row.slice().reverse()));top.push(visible(col));bottom.push(visible(col.slice().reverse()));}
    return {top,bottom,left,right};
  }
  const permutationCache=new Map();
  function permutations(n) {
    if(permutationCache.has(n))return permutationCache.get(n);
    const result=[];
    function add(prefix,rest){if(!rest.length){result.push(prefix);return;}rest.forEach((v,i)=>add([...prefix,v],rest.filter((_,j)=>i!==j)));}
    add([],Array.from({length:n},(_,i)=>i+1));permutationCache.set(n,result);return result;
  }
  function skySolutions(givens,n,clues,limit=2) {
    const perms=permutations(n), rows=[], cols=[];
    for(let i=0;i<n;i++){
      rows.push(perms.filter(p=>visible(p)===clues.left[i]&&visible(p.slice().reverse())===clues.right[i]&&p.every((v,c)=>!givens[i*n+c]||givens[i*n+c]===v)));
      cols.push(perms.filter(p=>visible(p)===clues.top[i]&&visible(p.slice().reverse())===clues.bottom[i]&&p.every((v,r)=>!givens[r*n+i]||givens[r*n+i]===v)));
    }
    let count=0,solution=null;const chosen=[];
    function search(r,candidates){
      if(r===n){count++;solution=chosen.flat();return count>=limit;}
      for(const row of rows[r]){
        const next=candidates.map((ps,c)=>ps.filter(p=>p[r]===row[c]));
        if(next.some(ps=>!ps.length))continue;
        chosen.push(row);if(search(r+1,next))return true;chosen.pop();
      }
      return false;
    }
    search(0,cols);return {count,solution};
  }
  function skyscrapers(level) {
    const n=level<=8?4:level<=16?5:6, rng=random(91000+level);
    const rows=shuffle(Array.from({length:n},(_,i)=>i),rng), cols=shuffle(Array.from({length:n},(_,i)=>i),rng), symbols=shuffle(Array.from({length:n},(_,i)=>i+1),rng);
    const solution=rows.flatMap(r=>cols.map(c=>symbols[(r+c)%n])), clues=cluesFor(solution,n), givens=solution.slice();
    const target=level<=8?3:level<=16?2:0;
    for(const i of shuffle(Array.from({length:n*n},(_,i)=>i),rng)){
      if(givens.filter(Boolean).length<=target)break;
      const old=givens[i];givens[i]=0;
      if(skySolutions(givens,n,clues).count!==1)givens[i]=old;
    }
    return {n,solution,clues,givens};
  }
  function skyErrors(values,n,clues) {
    const bad=new Set(), badClues=[];
    for(let k=0;k<n;k++){
      for(const vertical of [false,true]){
        const ids=Array.from({length:n},(_,j)=>vertical?j*n+k:k*n+j), line=ids.map(i=>values[i]);
        ids.forEach(i=>{if(values[i]&&ids.some(j=>j!==i&&values[j]===values[i]))bad.add(i);});
        if(line.every(Boolean)){
          const ends=vertical?['top','bottom']:['left','right'];
          for(const [a,side] of ends.entries())if(visible(a?line.slice().reverse():line)!==clues[side][k]){badClues.push(side+'-'+k);ids.forEach(i=>bad.add(i));}
        }
      }
    }
    return {bad,badClues,solved:values.every(v=>Number.isInteger(v)&&v>=1&&v<=n)&&bad.size===0};
  }
  function sokobanMove(puzzle,state,d) {
    const target=neighbor(state.player,d,puzzle.n);
    if(target<0||puzzle.walls.includes(target))return null;
    const boxes=state.boxes.slice(), index=boxes.indexOf(target);let pushed=false;
    if(index>=0){
      const beyond=neighbor(target,d,puzzle.n);
      if(beyond<0||puzzle.walls.includes(beyond)||boxes.includes(beyond))return null;
      boxes[index]=beyond;pushed=true;
    }
    return {player:target,boxes,pushed};
  }
  const sokobanSolved=(puzzle,state)=>state.boxes.length===puzzle.goals.length&&state.boxes.every(i=>puzzle.goals.includes(i));
  function reachable(n,walls,boxes,start) {
    const paths=new Map([[start,[]]]),queue=[start];
    for(let k=0;k<queue.length;k++)for(let d=0;d<4;d++){
      const j=neighbor(queue[k],d,n);
      if(j<0||walls.includes(j)||boxes.includes(j)||paths.has(j))continue;
      paths.set(j,[...paths.get(queue[k]),d]);queue.push(j);
    }
    return paths;
  }
  // Reverse play from a solved warehouse: every pull has a legal forward push.
  // Store the inverse route so every generated level has a reproducible witness.
  function sokoban(level, attempt=0) {
    const n=level<=8?7:level<=16?8:9, rng=random(73000+level+attempt*1000),walls=[];
    for(let i=0;i<n*n;i++){const r=Math.floor(i/n),c=i%n;if(!r||!c||r===n-1||c===n-1||(r===Math.floor(n/2)&&c===Math.floor(n/2)))walls.push(i);}
    const floor=Array.from({length:n*n},(_,i)=>i).filter(i=>!walls.includes(i));
    const candidates=floor.filter(i=>{const r=Math.floor(i/n),c=i%n;return r>1&&c>1&&r<n-2&&c<n-2;});
    const goals=shuffle(candidates,rng).slice(0,level<=8?2:level<=16?3:4), boxes=goals.slice();
    let player=floor.find(i=>!boxes.includes(i));const reverse=[],seen=new Set();
    for(let step=0;step<35+level*4;step++){
      const paths=reachable(n,walls,boxes,player),options=[];
      boxes.forEach((box,index)=>{for(let d=0;d<4;d++){
        const stand=neighbor(box,d,n),end=stand<0?-1:neighbor(stand,d,n);
        if(!paths.has(stand)||end<0||walls.includes(end)||boxes.includes(end))continue;
        const next=boxes.slice();next[index]=stand;
        const key=next.slice().sort((a,b)=>a-b).join(',')+':'+end;
        if(!seen.has(key))options.push({index,stand,end,d,path:paths.get(stand),key});
      }});
      if(!options.length)break;
      const option=options[Math.floor(rng()*options.length)];
      reverse.push(...option.path,option.d);boxes[option.index]=option.stand;player=option.end;seen.add(option.key);
    }
    const puzzle={n,walls,goals,boxes,player,solution:reverse.reverse().map(d=>(d+2)%4)};
    if(sokobanSolved(puzzle,puzzle)){
      if(attempt>=64)throw Error('No playable Sokoban layout generated');
      return sokoban(level,attempt+1);
    }
    return puzzle;
  }
  return {DIR,neighbor,rotate,netwalk,networkStatus,visible,cluesFor,skySolutions,skyscrapers,skyErrors,sokoban,sokobanMove,sokobanSolved};
});
