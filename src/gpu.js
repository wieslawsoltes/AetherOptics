/** WebGPU Float32 tracing. The Float64 CPU kernel remains the numerical reference. */
export const TRACE_WGSL = /* wgsl */ `
struct Ray { p: vec4f, d: vec4f }
struct Surface { shape: vec4f, aperture: vec4f, poly: vec4f, indices: vec4f }
struct Result { hit: vec4f, direction: vec4f, exit: vec4f, exitDirection: vec4f, info: vec4f }
struct Hit { p: vec3f, t: f32, normal: vec3f, valid: u32, residual: f32 }
struct Sag { z: f32, g: f32, valid: bool }
@group(0) @binding(0) var<storage, read> rays: array<Ray>;
@group(0) @binding(1) var<storage, read> surfaces: array<Surface>;
@group(0) @binding(2) var<storage, read_write> results: array<Result>;
@group(0) @binding(3) var<uniform> counts: vec4u;
fn sag(s: Surface, x: f32, y: f32) -> Sag {
  let r2=x*x+y*y; let c=s.shape.y; let k=s.shape.z;
  let q=1.0-(1.0+k)*c*c*r2;
  if(q<=0.0){return Sag(0.0,0.0,false);}
  let sr=sqrt(q); let r4=r2*r2; let r6=r4*r2; let r8=r4*r4;
  return Sag(c*r2/(1.0+sr)+s.poly.x*r4+s.poly.y*r6+s.poly.z*r8+s.poly.w*r8*r2,
    c/sr+4.0*s.poly.x*r2+6.0*s.poly.y*r4+8.0*s.poly.z*r6+10.0*s.poly.w*r8,true);
}
fn invalidHit() -> Hit { return Hit(vec3f(0.0),0.0,vec3f(0.0,0.0,1.0),0u,0.0); }
fn makeHit(p: vec3f,d: vec3f,t: f32,s: Surface) -> Hit {
  let hit=p+t*d; let g=sag(s,hit.x,hit.y);
  if(!g.valid){return invalidHit();}
  return Hit(hit,max(0.0,t),normalize(vec3f(-g.g*hit.x,-g.g*hit.y,1.0)),1u,abs(hit.z-s.shape.x-g.z));
}
fn conicHit(p:vec3f,d:vec3f,s:Surface) -> Hit {
  let q=p-vec3f(0.0,0.0,s.shape.x);let c=s.shape.y;let k=s.shape.z;
  if(c==0.0){
    if(abs(d.z)<1e-8){return invalidHit();}
    let t=-q.z/d.z;if(t< -0.00002){return invalidHit();}
    return makeHit(p,d,max(0.0,t),s);
  }
  let a=c*(d.x*d.x+d.y*d.y+(1.0+k)*d.z*d.z);
  let b=2.0*c*(q.x*d.x+q.y*d.y+(1.0+k)*q.z*d.z)-2.0*d.z;
  let cc=c*(q.x*q.x+q.y*q.y+(1.0+k)*q.z*q.z)-2.0*q.z;
  var roots=vec2f(-1e30);var count=0u;
  if(abs(a)<1e-15){if(abs(b)>1e-15){roots.x=-cc/b;count=1u;}}
  else{
    let disc=b*b-4.0*a*cc;
    if(disc>=0.0){
      let rr=sqrt(disc);let qq=-0.5*(b+select(-rr,rr,b>=0.0));
      if(abs(qq)<1e-20){roots.x=-b/(2.0*a);count=1u;}
      else{let r1=qq/a;let r2=cc/qq;roots=vec2f(min(r1,r2),max(r1,r2));count=2u;}
    }
  }
  for(var i=0u;i<count;i++){
    let t=roots[i];if(t< -0.00002){continue;}
    let hit=makeHit(p,d,max(0.0,t),s);
    if(hit.valid==1u&&hit.residual<0.0003){return hit;}
  }
  return invalidHit();
}
fn polynomialHit(p:vec3f,d:vec3f,s:Surface) -> Hit {
  var base=s;base.poly=vec4f(0.0);
  let h=conicHit(p,d,base);var t=max(0.0,(s.shape.x-p.z)/d.z);if(h.valid==1u){t=h.t;}
  for(var i=0;i<32;i++){
    let pt=p+t*d;let sg=sag(s,pt.x,pt.y);if(!sg.valid){break;}
    let f=pt.z-s.shape.x-sg.z;
    if(abs(f)<0.00001){return makeHit(p,d,t,s);}
    let df=d.z-sg.g*(pt.x*d.x+pt.y*d.y);if(abs(df)<1e-8){break;}
    var step=f/df;var accepted=false;
    for(var j=0;j<12;j++){
      let nt=t-step;
      if(nt>= -0.00002){let np=p+max(nt,0.0)*d;let ns=sag(s,np.x,np.y);if(ns.valid&&abs(np.z-s.shape.x-ns.z)<abs(f)){t=max(nt,0.0);accepted=true;break;}}
      step*=0.5;
    }
    if(!accepted){break;}
  }
  var zmin=s.shape.x;var zmax=s.shape.x;
  var rmax=s.aperture.x;if(s.aperture.w>0.5){rmax=length(s.aperture.xy);}
  for(var i=0;i<=64;i++){let g=sag(s,rmax*f32(i)/64.0,0.0);if(g.valid){zmin=min(zmin,s.shape.x+g.z);zmax=max(zmax,s.shape.x+g.z);}}
  if(abs(d.z)<1e-8){return invalidHit();}
  let lo=max(0.0,min((zmin-p.z)/d.z,(zmax-p.z)/d.z)-0.001);let hi=max((zmin-p.z)/d.z,(zmax-p.z)/d.z)+0.001;
  if(hi<lo){return invalidHit();}
  var ta=lo;var pp=p+ta*d;var ga=sag(s,pp.x,pp.y);var fa=pp.z-s.shape.x-ga.z;
  for(var i=1;i<=96;i++){
    let tb=lo+(hi-lo)*f32(i)/96.0;let pb=p+tb*d;let gb=sag(s,pb.x,pb.y);let fb=pb.z-s.shape.x-gb.z;
    if(gb.valid&&abs(fb)<0.00001){return makeHit(p,d,tb,s);}
    if(ga.valid&&gb.valid&&fa*fb<=0.0){
      var a=ta;var b=tb;var fleft=fa;
      for(var j=0;j<36;j++){let mid=(a+b)*0.5;let pm=p+mid*d;let gm=sag(s,pm.x,pm.y);if(!gm.valid){break;}let fm=pm.z-s.shape.x-gm.z;if(abs(fm)<0.00001){return makeHit(p,d,mid,s);}if(fleft*fm<=0.0){b=mid;}else{a=mid;fleft=fm;}}
    }
    ta=tb;ga=gb;fa=fb;
  }
  return invalidHit();
}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid:vec3u){
  let index=gid.x;if(index>=counts.x){return;}
  let incomingRay=rays[index];var p=incomingRay.p.xyz;var d=incomingRay.d.xyz;var opl=incomingRay.p.w;
  var ep=p;var ed=d;var eopl=opl;var en=1.0;var status=0.0;var last=0.0;var residual=0.0;
  let referenceChief=incomingRay.d.w>=16.0;
  let offset=(u32(incomingRay.d.w)%16u)*counts.y;
  for(var i=0u;i<counts.y;i++){
    let s=surfaces[offset+i];last=f32(i);var h=invalidHit();
    if(any(s.poly!=vec4f(0.0))){h=polynomialHit(p,d,s);}else{h=conicHit(p,d,s);}
    if(h.valid==0u){status=1.0;break;}
    p=h.p;opl+=h.t*s.indices.x;residual=max(residual,h.residual);
    let r2=dot(p.xy,p.xy);var outside=r2>s.aperture.x*s.aperture.x+0.00003;
    if(s.aperture.w>0.5){outside=abs(p.x)>s.aperture.x+0.00001||abs(p.y)>s.aperture.y+0.00001;}
    if(!referenceChief&&(outside||r2+0.00003<s.aperture.z*s.aperture.z)){status=2.0;break;}
    if(s.shape.w<1.5){
      var normal=h.normal;if(dot(d,normal)>0.0){normal=-normal;}
      let ci=clamp(-dot(d,normal),0.0,1.0);
      if(s.shape.w>0.5){d=normalize(d+2.0*ci*normal);}
      else{let eta=s.indices.x/s.indices.y;let k=1.0-eta*eta*(1.0-ci*ci);if(k<0.0){status=3.0;break;}d=normalize(eta*d+(eta*ci-sqrt(max(k,0.0)))*normal);}
      ep=p;ed=d;eopl=opl;en=s.indices.y;
    }
  }
  results[index]=Result(vec4f(p,opl),vec4f(d,status),vec4f(ep,eopl),vec4f(ed,en),vec4f(last,residual,0.0,0.0));
}
`;

export async function createGPU() {
  if(!globalThis.isSecureContext) return {device:null,reason:'WebGPU requires a secure context. Use localhost or HTTPS.'};
  if(!navigator.gpu)return {device:null,reason:'WebGPU is not available in this browser. Float64 CPU tracing is active.'};
  try {
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)return {device:null,reason:'No WebGPU adapter. Float64 CPU tracing is active.'};
    const device=await adapter.requestDevice();
    return {device,adapter,format:navigator.gpu.getPreferredCanvasFormat(),reason:null};
  } catch(e){return {device:null,reason:`WebGPU initialization: ${e.message}`};}
}
export class GPUTracer {
  constructor(device){this.device=device;this.capacity=0;this.surfaceCapacity=0;this.chain=Promise.resolve();this.lost=false;device.lost.then(()=>{this.lost=true;});}
  async init(){
    const module=this.device.createShaderModule({label:'Sequential ray tracing WGSL',code:TRACE_WGSL});
    const diagnostics=await module.getCompilationInfo();const errors=diagnostics.messages.filter(m=>m.type==='error');
    if(errors.length)throw new Error(errors.map(m=>`WGSL ${m.lineNum}:${m.linePos}: ${m.message}`).join('\n'));
    this.pipeline=await this.device.createComputePipelineAsync({label:'Aether trace / 128 rays per workgroup',layout:'auto',compute:{module,entryPoint:'main'}});
    this.counts=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  }
  trace(prepared){const promise=this.chain.then(()=>this._trace(prepared));this.chain=promise.catch(()=>{});return promise;}
  async _trace(prepared){
    if(this.lost)throw new Error('WebGPU device lost.');
    const device=this.device,count=prepared.tags.length,ns=prepared.model.surfaces.length,nw=prepared.model.wavelengths.length;
    if(count>this.capacity){
      this.capacity=2**Math.ceil(Math.log2(Math.max(128,count)));
      for(const key of ['input','output','readback'])this[key]?.destroy();
      this.input=device.createBuffer({label:'Ray input pool',size:this.capacity*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
      this.output=device.createBuffer({label:'Ray output pool',size:this.capacity*80,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      this.readback=device.createBuffer({label:'Ray readback pool',size:this.capacity*80,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    }
    if(ns*nw>this.surfaceCapacity){this.surfaceCapacity=2**Math.ceil(Math.log2(ns*nw));this.surfaces?.destroy();this.surfaces=device.createBuffer({size:this.surfaceCapacity*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});}
    const packed=new Float32Array(ns*nw*16);
    prepared.compiled.systems.forEach((system,wi)=>system.forEach((s,i)=>packed.set([s.z,s.c,s.k,s.mode==='mirror'?1:s.mode==='image'?2:0,s.semi,s.semiY,s.inner,s.aperture==='rectangle'?1:0,s.a4,s.a6,s.a8,s.a10,s.n1,s.n2,0,0],(wi*ns+i)*16)));
    const seeds=new Float32Array(prepared.seeds);
    for(let i=0;i<count;i++)if(prepared.tags[i].kind==='chief')seeds[i*8+7]+=16;
    device.queue.writeBuffer(this.input,0,seeds);device.queue.writeBuffer(this.surfaces,0,packed);device.queue.writeBuffer(this.counts,0,new Uint32Array([count,ns,nw,0]));
    const bind=device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.input}},{binding:1,resource:{buffer:this.surfaces}},{binding:2,resource:{buffer:this.output}},{binding:3,resource:{buffer:this.counts}}]});
    const command=device.createCommandEncoder({label:'Aether trace + readback'}),pass=command.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(count/128));pass.end();command.copyBufferToBuffer(this.output,0,this.readback,0,count*80);device.queue.submit([command.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ,0,count*80);const result=new Float32Array(this.readback.getMappedRange(0,count*80).slice(0));this.readback.unmap();return result;
  }
  dispose(){for(const key of ['input','output','readback','surfaces','counts'])this[key]?.destroy();}
}
