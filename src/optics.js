import { DEG, dot, sub, mul, normalize, quadratic, clamp, solveLinear, sumSquares } from './math.js';
import { glassCatalog, refractiveIndex } from './glass.js';
import { assertModel, validateModel, clone } from './model.js';
export const STATUS = Object.freeze({OK:0,MISS:1,VIGNETTED:2,TIR:3,AIM_FAILED:4});
export const STATUS_NAMES=['Transmitted','Miss / no forward root','Aperture clipped','Total internal reflection','Stop aiming failed'];
export const STRIDE=20;
/** Sag and (1/r) dsag/dr; the latter avoids division by r at the axis. */
export function sagGradient(s,x,y) {
  const r2=x*x+y*y,q=1-(1+s.k)*s.c*s.c*r2;
  if(q<=0) return null;
  const root=Math.sqrt(q);
  const z=s.c*r2/(1+root)+s.a4*r2*r2+s.a6*r2**3+s.a8*r2**4+s.a10*r2**5;
  const g=s.c/root+4*s.a4*r2+6*s.a6*r2*r2+8*s.a8*r2**3+10*s.a10*r2**4;
  return Number.isFinite(z)&&Number.isFinite(g)?{z,g}:null;
}
export function compile(model,check=true) {
  if(check) assertModel(model);
  const catalog=glassCatalog(model.customGlasses);let z=0;
  const shape=model.surfaces.map(s=>{const out={...s,z,c:s.radius===0?0:1/s.radius,k:s.type==='asphere'?s.conic:0,a4:s.type==='asphere'?s.a4:0,a6:s.type==='asphere'?s.a6:0,a8:s.type==='asphere'?s.a8:0,a10:s.type==='asphere'?s.a10:0};z+=s.thickness;return out;});
  const systems=model.wavelengths.map(w=>{let n=1;return shape.map(s=>{const n2=s.mode==='refract'?refractiveIndex(catalog[s.glass],w.um):n;const v={...s,n1:n,n2};n=n2;return v;});});
  const stop=shape.findIndex(s=>s.id===model.stopId);
  let sagMin=0;
  for(let j=0;j<=32;j++){const s=shape[0],r=s.semi*j/32;const g=sagGradient(s,0,r);if(g)sagMin=Math.min(sagMin,g.z);}
  const launchZ=Math.min(-20,sagMin-20);
  return {systems,shape,stop,launchZ,model};
}
/** Analytic conic roots followed by cap checks; damped Newton + bracket fallback for polynomial aspheres. */
export function intersect(p,d,s) {
  const q=[p[0],p[1],p[2]-s.z];
  const polynomial=s.a4!==0||s.a6!==0||s.a8!==0||s.a10!==0;
  const tolerance=2e-9*Math.max(1,Math.abs(s.z)*1e-3);
  if(!polynomial) {
    if(s.c===0) {
      if(Math.abs(d[2])<1e-14) return null;
      const t=-q[2]/d[2];
      return t>=-tolerance?{t:Math.max(0,t),p:[p[0]+t*d[0],p[1]+t*d[1],s.z],normal:[0,0,1],residual:0}:null;
    }
    const a=s.c*(d[0]*d[0]+d[1]*d[1]+(1+s.k)*d[2]*d[2]);
    const b=2*s.c*(q[0]*d[0]+q[1]*d[1]+(1+s.k)*q[2]*d[2])-2*d[2];
    const c=s.c*(q[0]*q[0]+q[1]*q[1]+(1+s.k)*q[2]*q[2])-2*q[2];
    for(const t0 of quadratic(a,b,c)) {
      if(t0 < -tolerance) continue;
      const t=Math.max(0,t0),hit=[p[0]+t*d[0],p[1]+t*d[1],p[2]+t*d[2]],sg=sagGradient(s,hit[0],hit[1]);
      if(!sg)continue;
      const residual=Math.abs(hit[2]-s.z-sg.z);
      if(residual>tolerance*10)continue; // Reject the far branch of the implicit quadric.
      return {t,p:hit,normal:normalize([-sg.g*hit[0],-sg.g*hit[1],1]),residual};
    }
    return null;
  }
  const evaluate=t=>{
    const x=p[0]+t*d[0],y=p[1]+t*d[1],z=p[2]+t*d[2];const sg=sagGradient(s,x,y);
    return sg?{f:z-s.z-sg.z,df:d[2]-sg.g*(x*d[0]+y*d[1]),x,y,z,g:sg.g}:null;
  };
  const make=(t,v)=>({t:Math.max(0,t),p:[v.x,v.y,v.z],normal:normalize([-v.g*v.x,-v.g*v.y,1]),residual:Math.abs(v.f)});
  let t=Math.abs(d[2])>1e-14?(s.z-p[2])/d[2]:0;
  const base=intersect(p,d,{...s,a4:0,a6:0,a8:0,a10:0});
  if(base)t=base.t;
  t=Math.max(0,t);
  for(let i=0;i<32;i++) {
    const v=evaluate(t);if(!v)break;
    if(Math.abs(v.f)<tolerance) return make(t,v);
    if(Math.abs(v.df)<1e-14)break;
    let step=v.f/v.df;let accepted=false;
    for(let j=0;j<12;j++) {
      const nt=t-step,nv=nt>=-tolerance?evaluate(Math.max(0,nt)):null;
      if(nv&&Math.abs(nv.f)<Math.abs(v.f)){t=Math.max(0,nt);accepted=true;break;}
      step*=0.5;
    }
    if(!accepted)break;
  }
  // Bounded root search over a conservative sag envelope, not over an infinite surface.
  let zmin=s.z,zmax=s.z;
  const rmax=s.aperture==='rectangle'?Math.hypot(s.semi,s.semiY):s.semi;
  for(let j=0;j<=64;j++){const sg=sagGradient(s,rmax*j/64,0);if(sg){zmin=Math.min(zmin,s.z+sg.z);zmax=Math.max(zmax,s.z+sg.z);}}
  if(Math.abs(d[2])<1e-14)return null;
  let lo=Math.max(0,Math.min((zmin-p[2])/d[2],(zmax-p[2])/d[2])-1e-6),hi=Math.max((zmin-p[2])/d[2],(zmax-p[2])/d[2])+1e-6;
  if(hi<lo)return null;
  let ta=lo,va=evaluate(ta);
  for(let j=1;j<=96;j++) {
    let tb=lo+(hi-lo)*j/96,vb=evaluate(tb);
    if(vb&&Math.abs(vb.f)<tolerance)return make(tb,vb);
    if(va&&vb&&va.f*vb.f<=0){
      let a=ta,b=tb,fa=va.f;
      for(let k=0;k<64;k++){const mid=(a+b)/2,vm=evaluate(mid);if(!vm)break;if(Math.abs(vm.f)<tolerance)return make(mid,vm);if(fa*vm.f<=0)b=mid;else{a=mid;fa=vm.f;}}
    }
    ta=tb;va=vb;
  }
  return null;
}
export function insideAperture(p,s) {
  const r2=p[0]*p[0]+p[1]*p[1],tol=1e-8;
  return r2+tol>=s.inner*s.inner && (s.aperture==='rectangle'?(Math.abs(p[0])<=s.semi+tol&&Math.abs(p[1])<=s.semiY+tol):r2<=s.semi*s.semi+tol);
}
/** Vector Snell law. Surface normal is oriented against incidence, not tied to +Z. */
export function interact(d,normal,n1,n2,mirror=false) {
  let n=normal;
  if(dot(d,n)>0)n=mul(n,-1);
  const cosI=clamp(-dot(d,n),0,1);
  if(mirror)return {direction:normalize([d[0]+2*cosI*n[0],d[1]+2*cosI*n[1],d[2]+2*cosI*n[2]]),cosI,cosT:cosI};
  const eta=n1/n2,k=1-eta*eta*(1-cosI*cosI);
  if(k< -1e-13)return null;
  const cosT=Math.sqrt(Math.max(0,k)),b=eta*cosI-cosT;
  return {direction:normalize([eta*d[0]+b*n[0],eta*d[1]+b*n[1],eta*d[2]+b*n[2]]),cosI,cosT};
}
export function traceRay(system,origin,direction,{opl=0,clip=true,path=false,end=system.length-1}={}) {
  let p=[...origin],d=[...direction],phase=opl,status=0,last=0,residual=0;
  let exitP=[...p],exitD=[...d],exitOpl=phase,exitN=1;
  const points=path?[{p:[...p],d:[...d],surface:-1,opl:phase,n1:1,n2:1}]:undefined;
  for(let j=0;j<=end;j++) {
    const s=system[j],hit=intersect(p,d,s);last=j;
    if(!hit){status=STATUS.MISS;break;}
    phase+=hit.t*s.n1;p=hit.p;residual=Math.max(residual,hit.residual);
    if(clip&&!insideAperture(p,s)){status=STATUS.VIGNETTED;if(path)points.push({p:[...p],surface:j,opl:phase,status});break;}
    if(s.mode!=='image') {
      const refr=interact(d,hit.normal,s.n1,s.n2,s.mode==='mirror');
      if(!refr){status=STATUS.TIR;if(path)points.push({p:[...p],surface:j,opl:phase,status});break;}
      d=refr.direction;exitP=[...p];exitD=[...d];exitOpl=phase;exitN=s.n2;
      if(path)points.push({p:[...p],d:[...d],surface:j,opl:phase,n1:s.n1,n2:s.n2,incidence:Math.acos(refr.cosI)/DEG,emergence:Math.acos(refr.cosT)/DEG,residual:hit.residual});
    } else if(path)points.push({p:[...p],d:[...d],surface:j,opl:phase,n1:s.n1,n2:s.n2,residual:hit.residual});
  }
  return {p,d,opl:phase,status,last,residual,exitP,exitD,exitOpl,exitN,path:points};
}
export function pupilDirection(field) {return normalize([Math.tan(field.x*DEG),Math.tan(field.y*DEG),1]);}
/** Newton ray aiming to the actual stop, including powered surfaces ahead of it. */
export function aimRay(compiled,field,wi,px,py) {
  const system=compiled.systems[wi],stop=system[compiled.stop],d=pupilDirection(field),sg=sagGradient(stop,px,py);
  if(!sg)return null;
  const targetZ=stop.z+sg.z,dist=(targetZ-compiled.launchZ)/d[2];
  let x=px-dist*d[0],y=py-dist*d[1];
  if(compiled.stop===0)return {p:[x,y,compiled.launchZ],d,opl:d[0]*x+d[1]*y};
  const evalAt=(a,b)=>traceRay(system,[a,b,compiled.launchZ],d,{clip:false,end:compiled.stop});
  for(let k=0;k<16;k++) {
    const r=evalAt(x,y);if(r.status)return null;
    const ex=r.p[0]-px,ey=r.p[1]-py;
    if(Math.hypot(ex,ey)<1e-8)return {p:[x,y,compiled.launchZ],d,opl:d[0]*x+d[1]*y};
    const h=1e-5*Math.max(1,Math.abs(x),Math.abs(y)),rx=evalAt(x+h,y),ry=evalAt(x,y+h);
    if(rx.status||ry.status)return null;
    const a=(rx.p[0]-r.p[0])/h,b=(ry.p[0]-r.p[0])/h,c=(rx.p[1]-r.p[1])/h,e=(ry.p[1]-r.p[1])/h,det=a*e-b*c;
    if(Math.abs(det)<1e-14)return null;
    const dx=(e*ex-b*ey)/det,dy=(-c*ex+a*ey)/det;
    let step=1,accepted=false;
    for(let j=0;j<10;j++){const nx=x-step*dx,ny=y-step*dy,nr=evalAt(nx,ny);if(!nr.status&&Math.hypot(nr.p[0]-px,nr.p[1]-py)<Math.hypot(ex,ey)){x=nx;y=ny;accepted=true;break;}step*=0.5;}
    if(!accepted)return null;
  }
  return null;
}
export function tracePupil(compiled,fi,wi,u,v,options={}) {
  const stop=compiled.shape[compiled.stop],seed=aimRay(compiled,compiled.model.fields[fi],wi,u*stop.semi,v*(stop.aperture==='rectangle'?stop.semiY:stop.semi));
  return seed?traceRay(compiled.systems[wi],seed.p,seed.d,{...options,opl:seed.opl}):{status:STATUS.AIM_FAILED,path:[],p:[NaN,NaN,NaN]};
}
function radicalInverse(i){let r=0,f=0.5;while(i>0){r+=f*(i&1);i>>>=1;f*=0.5;}return r;}
export function pupilSamples(n,stop) {
  const arr=[],obsc=(stop.inner/stop.semi)**2;
  for(let i=0;i<n;i++) {
    const u=(i+0.5)/n,v=radicalInverse(i);
    if(stop.aperture==='rectangle')arr.push([2*u-1,2*v-1]);
    else {const r=Math.sqrt(obsc+(1-obsc)*u),a=2*Math.PI*v;arr.push([r*Math.cos(a),r*Math.sin(a)]);}
  }
  return arr;
}
export function paraxial(compiled) {
  const system=compiled.systems[compiled.model.primary],h=1e-4;
  const ray=traceRay(system,[0,h,compiled.launchZ],[0,0,1],{clip:false,end:system.length-2});
  if(ray.status||Math.abs(ray.d[1])<1e-14)return {efl:null,bfl:null,focusZ:null,epd:null,fNumber:null,track:Math.abs(compiled.shape.at(-1).z)};
  const efl=-h/(ray.d[1]/Math.abs(ray.d[2])),t=-ray.p[1]/ray.d[1],bfl=t*Math.abs(ray.d[2]);
  const stop=compiled.shape[compiled.stop];
  const a=aimRay(compiled,{x:0,y:0},compiled.model.primary,0,Math.min(stop.semi,1)*1e-4);
  const epd=a?2*stop.semi*Math.abs(a.p[1]/(Math.min(stop.semi,1)*1e-4)):null;
  return {efl,bfl,focusZ:ray.p[2]+t*ray.d[2],epd,fNumber:epd?Math.abs(efl/epd):null,track:compiled.shape.slice(0,-1).reduce((a,s)=>a+Math.abs(s.thickness),0)};
}
export function prepare(model,{samples=model.samples,includeFans=true,includePaths=true}={}) {
  const t0=performance.now(),compiled=compile(model),stop=compiled.shape[compiled.stop],samplesUV=pupilSamples(samples,stop),tags=[],seedList=[];
  const push=(fi,wi,u,v,kind)=>{
    const s=aimRay(compiled,model.fields[fi],wi,u*stop.semi,v*(stop.aperture==='rectangle'?stop.semiY:stop.semi));
    tags.push({fi,wi,u,v,kind,aimFailed:!s});
    if(s)seedList.push(...s.p,s.opl,...s.d,wi);else seedList.push(0,0,compiled.launchZ,0,0,0,1,wi);
  };
  for(let fi=0;fi<model.fields.length;fi++) for(let wi=0;wi<model.wavelengths.length;wi++) {
    push(fi,wi,0,0,'chief');
    for(const [u,v]of samplesUV)push(fi,wi,u,v,'spot');
    if(includeFans)for(let j=0;j<=64;j++){const p=-1+2*j/64;push(fi,wi,p,0,'fanX');push(fi,wi,0,p,'fanY');}
  }
  const paths=[];
  if(includePaths)for(let fi=0;fi<model.fields.length;fi++)for(let wi=0;wi<model.wavelengths.length;wi++)for(let j=-4;j<=4;j++){
    const tr=tracePupil(compiled,fi,wi,0,j/4,{path:true});paths.push({fi,wi,u:0,v:j/4,status:tr.status,points:tr.path??[]});
  }
  return {model:clone(model),compiled,tags,seeds:new Float64Array(seedList),paths,paraxial:paraxial(compiled),samples,prepareMs:performance.now()-t0};
}
export function packResult(ray,out,index) {
  const o=index*STRIDE;
  out.set([...ray.p,ray.opl,...ray.d,ray.status,...ray.exitP,ray.exitOpl,...ray.exitD,ray.exitN,ray.last,ray.residual,0,0],o);
}
export function traceBatch(prepared) {
  const out=new Float64Array(prepared.tags.length*STRIDE),seeds=prepared.seeds;
  for(let i=0;i<prepared.tags.length;i++){
    const o=i*8,wi=seeds[o+7];
    const ray=traceRay(prepared.compiled.systems[wi],Array.from(seeds.subarray(o,o+3)),Array.from(seeds.subarray(o+4,o+7)),{opl:seeds[o+3],clip:prepared.tags[i].kind!=='chief'});
    if(prepared.tags[i].aimFailed)ray.status=STATUS.AIM_FAILED;
    packResult(ray,out,i);
  }
  return out;
}
/** Intersect the exiting real ray with the chief-centred reference sphere.
 * Radius = last-vertex chief point to detector chief intercept. Piston is referenced
 * to that wavelength's chief. Signed t permits extension in the exit medium.
 */
export function referenceSphereOPD(raw,i,chief) {
  const o=i*STRIDE,c=chief*STRIDE;
  if(raw[o+7]||raw[c+7])return NaN;
  const center=[raw[c],raw[c+1],raw[c+2]],cp=[raw[c+8],raw[c+9],raw[c+10]],r=Math.hypot(...sub(cp,center));
  if(r<1e-8)return NaN;
  const p=[raw[o+8],raw[o+9],raw[o+10]],d=[raw[o+12],raw[o+13],raw[o+14]],q=sub(p,center),b=dot(q,d),disc=b*b-dot(q,q)+r*r;
  if(disc<0)return NaN;
  const root=Math.sqrt(disc),t1=-b-root,t2=-b+root,t=Math.abs(t1)<Math.abs(t2)?t1:t2;
  return raw[o+11]+raw[o+15]*t-raw[c+11];
}
export function summarize(prepared,raw,backend='CPU · Float64',traceMs=0) {
  const {model,tags}=prepared,fields=model.fields.map((f,fi)=>({fi,field:f,spots:[],fans:[],chiefs:[],valid:0,total:0,rms:null,geometric:null,centroid:[0,0],wavefront:[],monochromatic:[]}));
  const counts=[0,0,0,0,0];let maxResidual=0;
  for(let i=0;i<tags.length;i++){const tag=tags[i];if(tag.aimFailed)raw[i*STRIDE+7]=STATUS.AIM_FAILED;if(tag.kind==='chief')fields[tag.fi].chiefs[tag.wi]=i;}
  for(let i=0;i<tags.length;i++){
    const tag=tags[i],o=i*STRIDE,status=Math.round(raw[o+7]),f=fields[tag.fi];
    maxResidual=Math.max(maxResidual,raw[o+17]||0);
    const opd=referenceSphereOPD(raw,i,f.chiefs[tag.wi]);
    if(tag.kind==='spot'){
      counts[status]++;f.total++;
      if(status===0){f.valid++;f.spots.push({index:i,x:raw[o],y:raw[o+1],u:tag.u,v:tag.v,wi:tag.wi,opd});}
    } else if(tag.kind.startsWith('fan')){
      const ci=f.chiefs[model.primary]*STRIDE;
      f.fans.push({index:i,p:tag.kind==='fanX'?tag.u:tag.v,axis:tag.kind==='fanX'?'X':'Y',wi:tag.wi,status,dx:raw[o]-raw[ci],dy:raw[o+1]-raw[ci+1],opd});
    }
  }
  let meritRms=0,fieldWeight=0;
  for(const f of fields) {
    let sx=0,sy=0,weight=0;
    for(const p of f.spots){const w=model.wavelengths[p.wi].weight;weight+=w;sx+=p.x*w;sy+=p.y*w;}
    if(weight){f.centroid=[sx/weight,sy/weight];let rr=0,maxr=0;for(const p of f.spots){const r2=(p.x-f.centroid[0])**2+(p.y-f.centroid[1])**2;rr+=r2*model.wavelengths[p.wi].weight;maxr=Math.max(maxr,Math.sqrt(r2));}f.rms=Math.sqrt(rr/weight);f.geometric=maxr;meritRms+=f.rms**2*f.field.weight;fieldWeight+=f.field.weight;}
    for(let wi=0;wi<model.wavelengths.length;wi++) {
      const arr=f.spots.filter(p=>p.wi===wi),opds=arr.filter(p=>Number.isFinite(p.opd)).map(p=>p.opd/(model.wavelengths[wi].um/1000));
      const mean=opds.reduce((a,b)=>a+b,0)/opds.length;
      let min=Infinity,max=-Infinity,sq=0;for(const p of opds){min=Math.min(min,p);max=Math.max(max,p);sq+=(p-mean)**2;}
      f.wavefront.push({wi,rms:opds.length?Math.sqrt(sq/opds.length):null,pv:opds.length?max-min:null,min,max,mean});
      const cx=arr.reduce((a,p)=>a+p.x,0)/arr.length,cy=arr.reduce((a,p)=>a+p.y,0)/arr.length;
      f.monochromatic.push({wi,count:arr.length,centroid:[cx,cy],rms:arr.length?Math.sqrt(arr.reduce((a,p)=>a+(p.x-cx)**2+(p.y-cy)**2,0)/arr.length):null});
    }
  }
  const total=counts.reduce((a,b)=>a+b,0);
  return {model:prepared.model,fields,counts,total,valid:counts[0],rms:fieldWeight?Math.sqrt(meritRms/fieldWeight):null,paraxial:prepared.paraxial,paths:prepared.paths,raw,tags,seeds:prepared.seeds,backend,traceMs,prepareMs:prepared.prepareMs,maxResidual,timestamp:new Date().toISOString()};
}
export function analyze(model,options={}){const prepared=prepare(model,options),t0=performance.now(),raw=traceBatch(prepared);return summarize(prepared,raw,'CPU · Float64',performance.now()-t0);}
/** Exact least-squares detector shift in the current homogeneous image medium.
 * Across all fields/wavelengths; removes each field's common polychromatic centroid.
 */
export function bestFocus(model,{samples=128}={}) {
  const c=compile(model),data=[],stop=c.shape[c.stop],uv=pupilSamples(samples,stop);let num=0,den=0;
  for(let fi=0;fi<model.fields.length;fi++){
    const rays=[];let sw=0,mx=0,my=0,mu=0,mv=0;
    for(let wi=0;wi<model.wavelengths.length;wi++)for(const [u,v]of uv){const r=tracePupil(c,fi,wi,u,v,{clip:true,end:model.surfaces.length-2});if(r.status||Math.abs(r.d[2])<1e-12)continue;const z=c.shape.at(-1).z,dx=r.d[0]/r.d[2],dy=r.d[1]/r.d[2],x=r.p[0]+(z-r.p[2])*dx,y=r.p[1]+(z-r.p[2])*dy,w=model.wavelengths[wi].weight;rays.push({x,y,dx,dy,w});sw+=w;mx+=w*x;my+=w*y;mu+=w*dx;mv+=w*dy;}
    if(sw===0)continue;mx/=sw;my/=sw;mu/=sw;mv/=sw;
    const fw=model.fields[fi].weight;
    for(const r of rays){num+=fw*r.w*((r.x-mx)*(r.dx-mu)+(r.y-my)*(r.dy-mv))/sw;den+=fw*r.w*((r.dx-mu)**2+(r.dy-mv)**2)/sw;}
    data.push(rays.length);
  }
  if(den<1e-20)throw new Error('No finite best focus: the surviving bundle is collimated or empty.');
  const delta=-num/den,next=clone(model),s=next.surfaces.at(-2);s.thickness+=delta;
  assertModel(next);
  return {model:next,delta,samples:data.reduce((a,b)=>a+b,0)};
}
export function geometryWarnings(compiled) {
  const warnings=[];
  for(let i=0;i<compiled.shape.length-1;i++){
    const a=compiled.shape[i],b=compiled.shape[i+1];
    if(a.mode==='mirror'||a.glass==='AIR'||a.mode==='image')continue;
    const r=Math.min(a.semi,b.semi),direction=Math.sign(a.thickness)||1;
    let minimum=Infinity;
    for(let j=0;j<=40;j++){const rr=r*j/40,sa=sagGradient(a,rr,0),sb=sagGradient(b,rr,0);if(sa&&sb)minimum=Math.min(minimum,(b.z+sb.z-a.z-sa.z)*direction);}
    if(minimum<=0)warnings.push(`S${i}–S${i+1}: glass caps cross (minimum axial thickness ${minimum.toFixed(4)} mm).`);
  }
  return warnings;
}
/** Fixed-size residual vector: failed rays receive an explicit penalty and are never dropped. */
export function meritResiduals(model,{samples=48}={}) {
  const validation=validateModel(model);if(validation.errors.length)throw new Error(validation.errors[0]);
  const p=prepare(model,{samples,includeFans:false,includePaths:false}),raw=traceBatch(p),res=[],sumFw=model.fields.reduce((a,f)=>a+f.weight,0),sumW=model.wavelengths.reduce((a,w)=>a+w.weight,0);
  let failures=0;
  for(const op of model.optimization.operands){if(op.weight===0)continue;
    if(op.type==='RMS'){
      for(let fi=0;fi<model.fields.length;fi++){
        const indices=[];let sw=0,mx=0,my=0;
        for(let i=0;i<p.tags.length;i++){const t=p.tags[i],o=i*STRIDE;if(t.fi!==fi||t.kind!=='spot')continue;indices.push(i);if(raw[o+7]===0){const w=model.wavelengths[t.wi].weight;sw+=w;mx+=w*raw[o];my+=w*raw[o+1];}}
        mx=sw?mx/sw:0;my=sw?my/sw:0;
        if(op.target===0){
          for(const i of indices){const t=p.tags[i],o=i*STRIDE,w=Math.sqrt(op.weight*model.fields[fi].weight/sumFw*model.wavelengths[t.wi].weight/(samples*sumW));if(raw[o+7]){res.push(100*w,100*w);failures++;}else res.push((raw[o]-mx)*w/op.tolerance,(raw[o+1]-my)*w/op.tolerance);}
        }else{
          let sq=0;for(const i of indices){const o=i*STRIDE;if(raw[o+7]){sq+=1e4;failures++;}else sq+=model.wavelengths[p.tags[i].wi].weight*((raw[o]-mx)**2+(raw[o+1]-my)**2);}
          res.push((Math.sqrt(sq/Math.max(sw,1))-op.target)/op.tolerance*Math.sqrt(op.weight*model.fields[fi].weight/sumFw));
        }
      }
    }else{
      const value={EFL:p.paraxial.efl,BFL:p.paraxial.bfl,TRACK:p.paraxial.track}[op.type];res.push(value===null?1e6:(value-op.target)/op.tolerance*Math.sqrt(op.weight));
    }
  }
  // Independent fixed penalties protect prescriptions even without an RMS operand.
  let lost=0,n=0;for(let i=0;i<p.tags.length;i++)if(p.tags[i].kind==='spot'){n++;if(raw[i*STRIDE+7])lost++;}
  res.push(1000*lost/Math.max(1,n),100*geometryWarnings(p.compiled).length);
  if(res.some(x=>!Number.isFinite(x)))throw new Error('Non-finite merit function.');
  return {residuals:res,value:sumSquares(res),lost,paraxial:p.paraxial};
}
/** Bounded, scaled Levenberg–Marquardt with finite-difference Jacobian and accepted-step diagnostics. */
export async function optimize(model,{onProgress=()=>{},cancelled=()=>false,samples=48}={}) {
  assertModel(model);const vars=model.optimization.variables;if(!vars.length)throw new Error('Mark at least one parameter as variable.');
  if(!model.optimization.operands.some(o=>o.weight>0))throw new Error('At least one merit operand must have a positive weight.');
  const reference=clone(model),make=x=>{const p=clone(reference);vars.forEach((v,i)=>{p.surfaces.find(s=>s.id===v.id)[v.param]=x[i]*v.scale;});return p;};
  const lo=vars.map(v=>v.min/v.scale),hi=vars.map(v=>v.max/v.scale);
  let x=vars.map((v,i)=>clamp(model.surfaces.find(s=>s.id===v.id)[v.param]/v.scale,lo[i],hi[i]));
  let current=meritResiduals(make(x),{samples}),initial=current.value,lambda=1e-3,reason='Iteration limit',evaluations=1,history=[],accepted=0;
  const n=x.length;let iter=0;
  for(;iter<model.optimization.iterations;iter++) {
    if(cancelled()){reason='Cancelled';break;}
    const rows=current.residuals.length,jac=Array.from({length:rows},()=>Array(n).fill(0));
    for(let j=0;j<n;j++){
      const h=1e-4*Math.max(1,Math.abs(x[j])),xp=[...x],xm=[...x];xp[j]=Math.min(hi[j],x[j]+h);xm[j]=Math.max(lo[j],x[j]-h);
      let ep=null,em=null;
      try{ep=meritResiduals(make(xp),{samples});evaluations++;}catch{}
      try{em=meritResiduals(make(xm),{samples});evaluations++;}catch{}
      if(ep&&em&&xp[j]!==xm[j])for(let r=0;r<rows;r++)jac[r][j]=(ep.residuals[r]-em.residuals[r])/(xp[j]-xm[j]);
      else if(ep&&xp[j]!==x[j])for(let r=0;r<rows;r++)jac[r][j]=(ep.residuals[r]-current.residuals[r])/(xp[j]-x[j]);
      else if(em&&x[j]!==xm[j])for(let r=0;r<rows;r++)jac[r][j]=(current.residuals[r]-em.residuals[r])/(x[j]-xm[j]);
    }
    const a=Array.from({length:n},()=>Array(n).fill(0)),g=Array(n).fill(0);
    for(let r=0;r<rows;r++)for(let i=0;i<n;i++){g[i]+=jac[r][i]*current.residuals[r];for(let j=0;j<n;j++)a[i][j]+=jac[r][i]*jac[r][j];}
    const gradient=Math.max(...g.map((v,i)=>(x[i]<=lo[i]+1e-12&&v>0)||(x[i]>=hi[i]-1e-12&&v<0)?0:Math.abs(v)));
    if(gradient<1e-8){reason='Projected gradient tolerance';break;}
    for(let i=0;i<n;i++)a[i][i]+=lambda*Math.max(a[i][i],1e-8);
    const step=solveLinear(a,g.map(v=>-v));if(!step){lambda*=10;if(lambda>1e14){reason='Singular Jacobian';break;}continue;}
    const trial=x.map((v,i)=>clamp(v+step[i],lo[i],hi[i]));
    let next=null;try{next=meritResiduals(make(trial),{samples});evaluations++;}catch{}
    const improved=next&&next.value<current.value;
    const old=current.value;
    if(improved){x=trial;current=next;accepted++;lambda=Math.max(1e-12,lambda*0.3);}else lambda=Math.min(1e15,lambda*8);
    const record={iteration:iter+1,merit:current.value,lambda,gradient,accepted:!!improved,evaluations,values:x.map((v,i)=>v*vars[i].scale),lost:current.lost};history.push(record);onProgress(record);
    await new Promise(resolve=>setTimeout(resolve,0));
    if(improved&&Math.abs(old-current.value)<1e-10*(1+old)){reason='Relative merit tolerance';iter++;break;}
    if(lambda>=1e15){reason='No acceptable bounded step';iter++;break;}
  }
  const result=make(x);assertModel(result);
  return {model:result,initial,final:current.value,history,evaluations,accepted,iterations:iter,reason,samples};
}
export async function sweep(model,{id,param,start,end,steps=31,refocus=false,onProgress=()=>{},cancelled=()=>false}) {
  if(!Number.isInteger(steps)||steps<2||steps>201||![start,end].every(Number.isFinite)||!model.surfaces.some(s=>s.id===id)||!['radius','thickness','conic','a4','a6','a8','a10'].includes(param))throw new Error('Invalid parameter sweep.');
  const rows=[];
  for(let i=0;i<steps;i++){
    if(cancelled())break;
    const value=start+(end-start)*i/(steps-1);let p=clone(model);p.surfaces.find(s=>s.id===id)[param]=value;
    try{assertModel(p);if(refocus)p=bestFocus(p,{samples:64}).model;const r=analyze(p,{samples:128,includeFans:false,includePaths:false});rows.push({value,rms:r.rms,efl:r.paraxial.efl,bfl:r.paraxial.bfl,throughput:r.valid/r.total,focus:p.surfaces.at(-2).thickness,error:null});}
    catch(e){rows.push({value,rms:null,efl:null,bfl:null,throughput:0,error:e.message});}
    onProgress({step:i+1,total:steps,row:rows.at(-1)});await new Promise(r=>setTimeout(r,0));
  }
  return {id,param,start,end,steps,refocus,rows};
}
