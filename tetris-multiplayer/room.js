(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TetrisRoom=api;})(globalThis,()=>{
  'use strict';
  class Room{
    constructor({url='api.php',fetcher=globalThis.fetch?.bind(globalThis),onRoster=()=>{},onAttack=()=>{},onStatus=()=>{},id=()=>crypto.randomUUID(),schedule=setTimeout,unschedule=clearTimeout}={}){
      Object.assign(this,{url,fetcher,onRoster,onAttack,onStatus,id,schedule,unschedule});
      this.version=0;this.session=null;this.queue=[];this.timer=null;this.controller=null;this.wanted=false;this.busy=false;
    }
    async request(body,signal,keepalive=false){
      const response=await this.fetcher(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal,keepalive,cache:'no-store'});
      if(!response.headers.get('content-type')?.includes('application/json'))throw Object.assign(Error('Kein Spieldienst'),{permanent:true});
      const data=await response.json();
      if(!response.ok)throw Object.assign(Error(data.error||'Verbindungsfehler'),{status:response.status,permanent:[400,403,404,405,415].includes(response.status)});
      return data;
    }
    start(name){this.stop();this.name=name;this.wanted=true;this.connect(this.version);}
    stop(){
      this.wanted=false;this.version++;this.unschedule(this.timer);this.controller?.abort();
      const session=this.session;this.session=null;this.queue=[];this.busy=false;
      if(session)void this.request({action:'leave',token:session.token},undefined,true).catch(()=>{});
      this.onRoster([],null);
    }
    later(delay,version){this.unschedule(this.timer);this.timer=this.schedule(()=>this.session?this.cycle(version):this.connect(version),delay);}
    async bounded(body){
      const controller=new AbortController();this.controller=controller;
      const timeout=this.schedule(()=>controller.abort(),4500);
      try{return await this.request(body,controller.signal);}finally{this.unschedule(timeout);if(this.controller===controller)this.controller=null;}
    }
    async connect(version){
      if(!this.wanted||version!==this.version||this.busy)return;
      this.busy=true;this.onStatus('connecting');
      try{
        const data=await this.bounded({action:'join',name:this.name});
        if(version!==this.version){if(data.token)void this.request({action:'leave',token:data.token},undefined,true).catch(()=>{});return;}
        if(typeof data.token!=='string'||typeof data.id!=='string'||!Number.isInteger(data.cursor)||!Array.isArray(data.players))throw Error('Ungültige Serverantwort');
        this.session={token:data.token,id:data.id,cursor:data.cursor};this.onRoster(data.players,data.id);this.onStatus('online');this.later(1000,version);
      }catch(error){if(version===this.version)this.fail(error,version);}
      finally{if(version===this.version)this.busy=false;}
    }
    attack(lines){
      if(!this.session||!this.wanted||!Number.isInteger(lines)||lines<1||lines>4)return;
      if(this.queue.length>=32)return;
      this.queue.push({action:'clear',name:this.name,lines,eventId:this.id()});
      if(!this.busy){this.unschedule(this.timer);void this.cycle(this.version);}
    }
    async cycle(version){
      if(!this.wanted||version!==this.version||!this.session||this.busy)return;
      this.busy=true;
      try{
        // One request at a time prevents out-of-order cursor updates and retries.
        if(this.queue.length){
          try{await this.bounded({...this.queue[0],token:this.session.token});if(version!==this.version)return;this.queue.shift();}
          catch(error){if(version!==this.version)return;if(error.status===429){this.later(1100,version);return;}throw error;}
        }
        if(version!==this.version||!this.session)return;
        const data=await this.bounded({action:'poll',token:this.session.token,after:this.session.cursor});
        if(version!==this.version||!this.session)return;
        if(!Number.isInteger(data.cursor)||data.cursor<this.session.cursor||!Array.isArray(data.events)||!Array.isArray(data.players))throw Error('Ungültige Serverantwort');
        for(const event of data.events){
          if(!Number.isInteger(event.seq)||event.seq<=this.session.cursor)continue;
          if(event.seq>data.cursor||!Number.isInteger(event.rows)||event.rows<0||event.rows>2||typeof event.name!=='string')throw Error('Ungültiger Angriff');
          if(event.rows)this.onAttack(event);
          this.session.cursor=event.seq;
        }
        this.session.cursor=data.cursor;this.onRoster(data.players,this.session.id);this.onStatus('online');
        this.later(1000,version);
      }catch(error){if(version===this.version)this.fail(error,version);}
      finally{if(version===this.version)this.busy=false;}
    }
    fail(error,version){
      const session=this.session;this.session=null;this.queue=[];this.onRoster([],null);
      if(session)void this.request({action:'leave',token:session.token},undefined,true).catch(()=>{});
      this.onStatus(error.permanent?'single':'offline');
      if(this.wanted&&!error.permanent)this.later(5000,version);
    }
  }
  return {Room};
});
