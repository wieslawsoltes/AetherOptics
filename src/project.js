import {assertModel,clone} from './model.js';
import {executeTask} from './tasks.js';
export class WorkerClient {
  constructor(){this.id=0;this.pending=new Map();this.cancelled=new Set();this.fallback=false;this.spawn();}
  spawn(){
    try{
      const embedded=!!globalThis.__AETHER_WORKER__;
      const url=embedded?URL.createObjectURL(new Blob([globalThis.__AETHER_WORKER__],{type:'text/javascript'})):new URL('./worker.js',import.meta.url);
      this.worker=new Worker(url,{type:'module',name:'Aether Float64 optical kernel'});
      if(embedded)setTimeout(()=>URL.revokeObjectURL(url),5000);
      this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;if(data.progress){p.onProgress?.(data.progress);return;}this.pending.delete(data.id);if(data.error)p.reject(new Error(data.error));else p.resolve(data.result);};
      this.worker.onerror=()=>this.useFallback();
    }catch{this.useFallback();}
  }
  useFallback(){
    if(this.fallback)return;this.fallback=true;this.worker?.terminate();
    for(const [id,p]of this.pending)this.runLocal(id,p);
  }
  async runLocal(id,p){
    await new Promise(resolve=>setTimeout(resolve,0));
    if(!this.pending.has(id))return;
    try{const result=await executeTask(p.type,p.payload,p.onProgress,()=>this.cancelled.has(id));p.resolve(result);}
    catch(e){p.reject(e);}finally{this.pending.delete(id);this.cancelled.delete(id);}
  }
  run(type,payload={},onProgress=()=>{}){
    const id=++this.id,promise=new Promise((resolve,reject)=>{const p={resolve,reject,onProgress,type,payload};this.pending.set(id,p);if(this.fallback)this.runLocal(id,p);else try{this.worker.postMessage({id,type,payload});}catch{this.useFallback();}});promise.jobId=id;return promise;
  }
  cancel(id){if(this.fallback)this.cancelled.add(id);else this.worker.postMessage({type:'cancel',payload:{id}});}
  dispose(){this.worker?.terminate();for(const p of this.pending.values())p.reject(new Error('Worker disposed'));this.pending.clear();}
}
export class ProjectStore {
  async open(){
    this.mode='memory';this.memory=null;this.previous=null;
    try{localStorage.getItem('aether-optics-current');this.mode='localStorage';}catch{}
    if(!globalThis.indexedDB)return;
    try{
    this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('aether-optics',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    this.mode='indexedDB';}catch{}
  }
  async load(){
    if(this.mode==='memory')return this.memory?clone(this.memory):null;
    if(this.db){const row=await new Promise((resolve,reject)=>{const r=this.db.transaction('projects').objectStore('projects').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(row){assertModel(row.model);return row.model;}}
    const raw=localStorage.getItem('aether-optics-current');if(raw){const model=JSON.parse(raw);assertModel(model);return model;}return null;
  }
  async save(model){
    assertModel(model);
    if(this.mode==='memory'){this.previous=this.memory;this.memory=clone(model);return;}
    if(this.db){await new Promise((resolve,reject)=>{const tx=this.db.transaction('projects','readwrite'),store=tx.objectStore('projects'),request=store.get('current');request.onsuccess=()=>{if(request.result)store.put({...request.result,key:'recovery'});store.put({key:'current',model:clone(model),saved:new Date().toISOString()});};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});return;}
    const previous=localStorage.getItem('aether-optics-current');if(previous)localStorage.setItem('aether-optics-recovery',previous);localStorage.setItem('aether-optics-current',JSON.stringify(model));
  }
  async recovery(){
    if(this.mode==='memory')return this.previous?clone(this.previous):null;
    if(this.db){const row=await new Promise((resolve,reject)=>{const r=this.db.transaction('projects').objectStore('projects').get('recovery');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(row){assertModel(row.model);return row.model;}}
    const raw=localStorage.getItem('aether-optics-recovery');if(raw){const model=JSON.parse(raw);assertModel(model);return model;}return null;
  }
}
export function parseQuantity(text,dimension='length') {
  const value=String(text).trim().replaceAll('−','-');
  if(dimension==='radius'&&/^(infinity|inf|∞|plane)$/i.test(value))return 0;
  const match=/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(.*?)$/i.exec(value);
  if(!match)throw new Error(`Invalid numeric quantity: ${text}`);
  const number=Number(match[1]),unit=match[2].toLowerCase();let factor;
  const units={length:{'':1,mm:1,cm:10,m:1000,um:0.001,'µm':0.001,nm:1e-6,in:25.4},angle:{'':1,deg:1,'°':1,rad:180/Math.PI},wavelength:{'':1,nm:1,um:1000,'µm':1000,mm:1e6},scalar:{'':1},a4:{'':1,'mm^-3':1,'1/mm^3':1},a6:{'':1,'mm^-5':1,'1/mm^5':1},a8:{'':1,'mm^-7':1,'1/mm^7':1},a10:{'':1,'mm^-9':1,'1/mm^9':1}};
  factor=units[dimension==='radius'?'length':dimension]?.[unit];
  if(factor===undefined)throw new Error(`Unit “${unit}” is not valid for ${dimension}.`);
  if(!Number.isFinite(number*factor))throw new Error('Numeric value must be finite.');
  return number*factor;
}
export function downloadFile(name,text,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function csv(rows){return rows.map(row=>row.map(x=>{let s=x===null||x===undefined?'':String(x);if(typeof x==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(',')).join('\r\n');}
