(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Tetris=api;})(globalThis,()=>{
  'use strict';
  const WIDTH=10,HEIGHT=22,HIDDEN=2;
  const SHAPES={
    I:[[0,1],[1,1],[2,1],[3,1]],O:[[1,0],[2,0],[1,1],[2,1]],
    T:[[1,0],[0,1],[1,1],[2,1]],J:[[0,0],[0,1],[1,1],[2,1]],L:[[2,0],[0,1],[1,1],[2,1]],
    S:[[1,0],[2,0],[0,1],[1,1]],Z:[[0,0],[1,0],[1,1],[2,1]]
  };
  class Game{
    constructor(rng=Math.random){
      this.rng=rng;this.board=Array.from({length:HEIGHT},()=>Array(WIDTH).fill(null));this.bag=[];this.next=[];
      this.score=0;this.lines=0;this.placed=0;this.over=false;this.pending=0;this.events=[];this.fall=0;this.lockTime=0;this.resets=0;
      while(this.next.length<5)this.next.push(this.draw());this.spawn();
    }
    draw(){if(!this.bag.length){this.bag=Object.keys(SHAPES);for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.rng()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}return this.bag.pop();}
    get level(){return 1+Math.floor(this.lines/10);}
    get interval(){return Math.max(80,850*Math.pow(.82,this.level-1));}
    spawn(){const kind=this.next.shift();this.next.push(this.draw());this.piece={kind,cells:SHAPES[kind].map(c=>c.slice()),x:3,y:0};this.fall=0;this.lockTime=0;this.resets=0;if(!this.fits(this.piece))this.over=true;}
    fits(piece,x=piece.x,y=piece.y,cells=piece.cells){return cells.every(([dx,dy])=>{const xx=x+dx,yy=y+dy;return xx>=0&&xx<WIDTH&&yy>=0&&yy<HEIGHT&&!this.board[yy][xx];});}
    grounded(){return !this.fits(this.piece,this.piece.x,this.piece.y+1);}
    move(dx){if(this.over||!this.fits(this.piece,this.piece.x+dx))return false;const was=this.grounded();this.piece.x+=dx;this.resetLock(was);return true;}
    resetLock(was){if(was&&this.resets<15){this.lockTime=0;this.resets++;}}
    rotate(direction=1){
      if(this.over||this.piece.kind==='O')return false;
      const pivot=this.piece.kind==='I'?1.5:1;
      const cells=this.piece.cells.map(([x,y])=>direction===1?[pivot-(y-pivot),pivot+(x-pivot)]:[pivot+(y-pivot),pivot-(x-pivot)]);
      const was=this.grounded();
      for(const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,-2]])if(this.fits(this.piece,this.piece.x+dx,this.piece.y+dy,cells)){this.piece.cells=cells;this.piece.x+=dx;this.piece.y+=dy;this.resetLock(was);return true;}
      return false;
    }
    softDrop(){if(this.over||this.grounded())return false;this.piece.y++;this.score++;this.fall=0;return true;}
    ghostY(){let y=this.piece.y;while(this.fits(this.piece,this.piece.x,y+1))y++;return y;}
    hardDrop(){if(this.over)return;const y=this.ghostY();this.score+=(y-this.piece.y)*2;this.piece.y=y;this.lock();}
    tick(ms){
      if(this.over)return;ms=Math.max(0,Math.min(ms,100));
      this.fall+=ms;
      while(this.fall>=this.interval&&!this.grounded()){this.fall-=this.interval;this.piece.y++;}
      if(this.grounded()){this.lockTime+=ms;if(this.lockTime>=500)this.lock();}else this.lockTime=0;
    }
    queueGarbage(rows){if(!this.over&&Number.isInteger(rows)&&rows>0)this.pending=Math.min(100,this.pending+rows);}
    lock(){
      if(this.over)return;
      const topOut=this.piece.cells.some(([,dy])=>this.piece.y+dy<HIDDEN);
      for(const [dx,dy] of this.piece.cells)this.board[this.piece.y+dy][this.piece.x+dx]=this.piece.kind;
      this.placed++;
      const kept=this.board.filter(row=>!row.every(Boolean)),cleared=HEIGHT-kept.length;
      while(kept.length<HEIGHT)kept.unshift(Array(WIDTH).fill(null));this.board=kept;
      if(cleared){this.score+=([0,100,300,500,800][cleared]||0)*this.level;this.lines+=cleared;this.events.push({type:'clear',lines:cleared});}
      if(topOut){this.over=true;return;}
      // Incoming rows enter only between pieces, so they never overlap a falling stone.
      while(this.pending>0){
        const overflow=this.board.shift().some(Boolean),hole=Math.floor(this.rng()*WIDTH);
        this.board.push(Array.from({length:WIDTH},(_,i)=>i===hole?null:'G'));this.pending--;
        if(overflow){this.over=true;this.pending=0;return;}
      }
      this.spawn();
    }
    drainEvents(){return this.events.splice(0);}
  }
  return {Game,WIDTH,HEIGHT,HIDDEN,SHAPES};
});
