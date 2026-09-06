(()=>{
'use strict';
const __modules=Object.create(null);
// ---- glass.js ----
__modules["glass.js"]=(()=>{
/** SCHOTT catalogue Sellmeier coefficients; wavelength is in micrometres.
 * Catalogue indices are relative to air at nominal room temperature. Here AIR=1.
 * No temperature, pressure, absorption, birefringence, or coating model is implied.
 * Provenance and validity intervals: docs/NUMERICS.md.
 */
const GLASSES = Object.freeze({
  AIR: {name:'AIR',model:'constant',n:1,min:0.2,max:5,description:'Reference medium'},
  'N-BK7': {name:'N-BK7',model:'sellmeier',B:[1.03961212,0.231792344,1.01046945],C:[0.00600069867,0.0200179144,103.560653],min:0.3,max:2.5,description:'Borosilicate crown · SCHOTT',nd:1.51680,vd:64.17},
  F2: {name:'F2',model:'sellmeier',B:[1.34533359,0.209073176,0.937357162],C:[0.00997743871,0.0470450767,111.886764],min:0.365,max:2.5,description:'Flint · SCHOTT',nd:1.62004,vd:36.37},
  'N-SF11': {name:'N-SF11',model:'sellmeier',B:[1.73759695,0.313747346,1.89878101],C:[0.013188707,0.0623068142,155.23629],min:0.37,max:2.5,description:'Dense flint · SCHOTT',nd:1.78472,vd:25.68},
  IDEAL150: {name:'IDEAL150',model:'constant',n:1.5,min:0.2,max:5,description:'Ideal, non-dispersive n = 1.5'}
});
function glassCatalog(custom=[]) { return Object.assign(Object.create(null),GLASSES,Object.fromEntries(custom.map(g=>[g.name,g]))); }
function refractiveIndex(glass,um) {
  if(!glass || !Number.isFinite(um) || um <= 0) throw new RangeError('Invalid glass or wavelength.');
  if(um < glass.min || um > glass.max) throw new RangeError(`${glass.name}: ${um} µm is outside ${glass.min}–${glass.max} µm.`);
  const l2=um*um;
  let n;
  if(glass.model==='constant') n=glass.n;
  else if(glass.model==='cauchy') n=glass.A+glass.B/l2+glass.C/(l2*l2);
  else if(glass.model==='sellmeier') {
    let n2=1;
    for(let i=0;i<3;i++) {
      if(Math.abs(l2-glass.C[i])<1e-12) throw new RangeError(`${glass.name}: dispersion pole.`);
      n2+=glass.B[i]*l2/(l2-glass.C[i]);
    }
    n=Math.sqrt(n2);
  } else throw new TypeError(`Unknown dispersion model: ${glass.model}`);
  if(!Number.isFinite(n)||n<0.1||n>10) throw new RangeError(`${glass.name}: unphysical refractive index.`);
  return n;
}
function validateGlass(g) {
  if(!g || !/^[A-Za-z0-9_. -]{1,32}$/.test(g.name) || Object.hasOwn(GLASSES,g.name) || ['__proto__','constructor','prototype'].includes(g.name)) throw new Error('Custom glass needs a unique, safe name.');
  if(!Number.isFinite(g.min)||!Number.isFinite(g.max)||g.min<=0||g.max<=g.min) throw new Error('Invalid glass wavelength interval.');
  if(g.model==='sellmeier' && (!Array.isArray(g.B)||!Array.isArray(g.C)||g.B.length!==3||g.C.length!==3||![...g.B,...g.C].every(Number.isFinite))) throw new Error('Sellmeier requires three finite B and three finite C coefficients.');
  if(g.model==='cauchy' && ![g.A,g.B,g.C].every(Number.isFinite)) throw new Error('Cauchy requires finite A, B and C.');
  refractiveIndex(g,(g.min+g.max)/2);
}

return {GLASSES,glassCatalog,refractiveIndex,validateGlass};
})();
// ---- model.js ----
__modules["model.js"]=(()=>{
const { glassCatalog, refractiveIndex, validateGlass }=__modules["glass.js"];
const SCHEMA_VERSION=1;
const clone = obj => structuredClone(obj);
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
function surface(options={}) {
  return {id:makeId(),label:'Optical surface',type:'standard',mode:'refract',radius:0,thickness:5,glass:'AIR',semi:12.5,semiY:12.5,inner:0,aperture:'circle',conic:0,a4:0,a6:0,a8:0,a10:0,...options};
}
function createExample(which='achromat') {
  const common={version:1,name:'Aurora · air-spaced achromat',description:'Crown / flint achromat. Infinity conjugate, three visible wavelengths and three angular fields.',units:'mm',wavelengths:[{um:0.4861327,weight:1},{um:0.5875618,weight:1},{um:0.6562725,weight:1}],primary:1,fields:[{x:0,y:0,weight:1},{x:0,y:1.5,weight:1},{x:0,y:3,weight:1}],samples:512,customGlasses:[],surfaces:[],stopId:'stop',optimization:{iterations:35,variables:[],operands:[{type:'RMS',target:0,tolerance:0.01,weight:1},{type:'EFL',target:100,tolerance:1,weight:2}]}};
  if(which==='mirror') {
    common.name='Parabola · reflective benchmark';
    common.description='100 mm focal-length paraboloid. Signed negative thickness after reflection. Exact on-axis geometric focus; no obscuration model.';
    common.fields=[{x:0,y:0,weight:1},{x:0,y:0.4,weight:1},{x:0,y:0.8,weight:1}];
    common.surfaces=[surface({id:'stop',label:'Parabolic primary',type:'asphere',mode:'mirror',radius:-200,conic:-1,thickness:-100,semi:20,semiY:20}),surface({id:'image',label:'Image plane',mode:'image',thickness:0,semi:15,semiY:15})];
  } else if(which==='singlet'||which==='asphere') {
    common.name=which==='asphere'?'Nova · aspheric singlet':'Vega · spherical singlet';
    common.description='Biconvex N-BK7 singlet; a deliberately simple design for exploring spherical and chromatic aberration.';
    common.surfaces=[surface({id:'stop',label:'Aperture stop',thickness:4,semi:9,semiY:9}),surface({id:'front',label:'Crown · front',radius:55,thickness:5,glass:'N-BK7',...(which==='asphere'?{type:'asphere',conic:-1,a4:-0.000001}:{} )}),surface({id:'rear',label:'Crown · rear',radius:-55,thickness:50}),surface({id:'image',label:'Image plane',mode:'image',thickness:0,semi:15,semiY:15})];
    common.optimization.operands[1].target=54;
  } else {
    common.surfaces=[surface({id:'stop',label:'Aperture stop',thickness:5,semi:10,semiY:10}),surface({id:'crown-front',label:'Crown · front',radius:62,thickness:6,glass:'N-BK7'}),surface({id:'crown-rear',label:'Crown · rear',radius:-40,thickness:1}),surface({id:'flint-front',label:'Flint · front',radius:-41,thickness:3.5,glass:'F2'}),surface({id:'flint-rear',label:'Flint · rear',radius:-210,thickness:99}),surface({id:'image',label:'Image plane',mode:'image',thickness:0,semi:15,semiY:15})];
  }
  const focus=common.surfaces.at(-2);
  common.optimization.variables=[{id:focus.id,param:'thickness',min:which==='mirror'?-150:5,max:which==='mirror'?-50:250,scale:5}];
  return common;
}
function validateModel(m) {
  const errors=[],warnings=[];
  const fail=s=>errors.push(s);
  if(!m||typeof m!=='object') return {errors:['Project must be an object.'],warnings};
  if(m.version!==SCHEMA_VERSION) fail(`Unsupported project version: ${m.version}.`);
  if(m.units!=='mm') fail('The kernel uses mm; import requires units="mm".');
  if(typeof m.name!=='string'||m.name.length>160) fail('Project name must contain at most 160 characters.');
  if(!Array.isArray(m.surfaces)||m.surfaces.length<2||m.surfaces.length>64) return {errors:[...errors,'A prescription requires 2–64 surfaces.'],warnings};
  if(!Array.isArray(m.wavelengths)||m.wavelengths.length<1||m.wavelengths.length>8) return {errors:[...errors,'Use 1–8 wavelengths.'],warnings};
  if(!Array.isArray(m.fields)||m.fields.length<1||m.fields.length>9) return {errors:[...errors,'Use 1–9 fields.'],warnings};
  if(!Number.isInteger(m.primary)||m.primary<0||m.primary>=m.wavelengths.length) fail('Invalid primary wavelength index.');
  if(!Number.isInteger(m.samples)||m.samples<16||m.samples>16384||m.samples*m.wavelengths.length*m.fields.length>300000) fail('Use 16–16384 samples per field / wavelength, at most 300,000 total pupil rays.');
  if(!Array.isArray(m.customGlasses)||m.customGlasses.length>64) fail('Custom glass catalogue must contain at most 64 glasses.');
  else {
    const names=new Set();
    for(const g of m.customGlasses) {try{validateGlass(g);if(names.has(g.name))fail('Duplicate custom glass name.');names.add(g.name);}catch(e){fail(e.message);}}
  }
  const catalog=glassCatalog(Array.isArray(m.customGlasses)?m.customGlasses.filter(g=>g&&typeof g==='object'&&typeof g.name==='string'):[]);
  for(const f of m.fields) if(!f||![f.x,f.y,f.weight].every(Number.isFinite)||Math.abs(f.x)>45||Math.abs(f.y)>45||f.weight<0||f.weight>1e8) fail('Fields require finite angles within ±45°, and nonnegative weights.');
  if(!m.fields.some(f=>f?.weight>0)) fail('At least one field must have positive weight.');
  for(const w of m.wavelengths) if(!w||![w.um,w.weight].every(Number.isFinite)||w.um<0.2||w.um>5||w.weight<=0||w.weight>1e8) fail('Wavelengths must be 0.2–5 µm with positive weights.');
  const ids=new Set(); let direction=1;
  for(let i=0;i<m.surfaces.length;i++) {
    const s=m.surfaces[i];
    if(!s||typeof s.id!=='string'||ids.has(s.id)) {fail(`Surface ${i}: missing or duplicate identity.`);continue;}
    ids.add(s.id);
    if(typeof s.label!=='string'||s.label.length>120) fail(`S${i}: invalid label.`);
    if(!['standard','asphere'].includes(s.type)||!['refract','mirror','image'].includes(s.mode)||!['circle','rectangle'].includes(s.aperture)) fail(`S${i}: unsupported surface / aperture mode.`);
    for(const key of ['radius','thickness','semi','semiY','inner','conic','a4','a6','a8','a10']) if(!Number.isFinite(s[key])) fail(`S${i}: ${key} must be finite (radius 0 represents infinity).`);
    if(Math.abs(s.radius)>1e8 || (s.radius!==0&&Math.abs(s.radius)<0.01) || Math.abs(s.thickness)>1e6) fail(`S${i}: radius or spacing outside supported numerical range.`);
    if(s.semi<=0||s.semi>10000||s.semiY<=0||s.semiY>10000||s.inner<0||s.inner>=Math.min(s.semi,s.semiY)) fail(`S${i}: invalid aperture.`);
    if(s.aperture==='circle'&&Math.abs(s.semi-s.semiY)>1e-10) fail(`S${i}: circular apertures require equal semi and semiY.`);
    const c=s.radius===0?0:1/s.radius,k=s.type==='asphere'?s.conic:0;
    const maxR=s.aperture==='rectangle'?Math.hypot(s.semi,s.semiY):s.semi;
    if(1-(1+k)*c*c*maxR*maxR<=1e-10) fail(`S${i}: clear aperture reaches beyond the real, single-valued conic cap.`);
    if(s.mode==='image'&&i!==m.surfaces.length-1) fail('Only the last surface may be the image.');
    if(s.mode==='image'&&(s.radius!==0||s.a4!==0||s.a6!==0||s.a8!==0||s.a10!==0)) fail('The image detector must be planar.');
    if(s.mode==='mirror') direction*=-1;
    if(i<m.surfaces.length-1&&s.thickness*direction<0) fail(`S${i}: spacing must follow the propagation direction (negative after an odd number of mirrors).`);
    if(i<m.surfaces.length-1 && s.thickness===0) warnings.push(`S${i}: coincident vertices; check surface order and cap separation.`);
    if(!catalog[s.glass]) fail(`S${i}: unknown medium "${s.glass}".`);
    else if(s.mode==='refract') for(const w of m.wavelengths) try{refractiveIndex(catalog[s.glass],w?.um);}catch(e){fail(e.message);}
  }
  if(m.surfaces.at(-1)?.mode!=='image') fail('The final surface must be the image plane.');
  if(!ids.has(m.stopId)||m.surfaces.find(s=>s?.id===m.stopId)?.mode==='image') fail('Choose an optical surface as the aperture stop.');
  const o=m.optimization;
  if(!o||!Array.isArray(o.variables)||!Array.isArray(o.operands)||o.variables.length>16||o.operands.length>32) fail('Invalid optimization configuration.');
  else {
    const keys=new Set();
    for(const v of o.variables){
      if(!v||typeof v!=='object'){fail('Invalid optimization variable.');continue;}
      if(!ids.has(v.id)||!['radius','thickness','conic','a4','a6','a8','a10'].includes(v.param)||![v.min,v.max,v.scale].every(Number.isFinite)||v.min>=v.max||v.scale<=0) fail('Invalid optimization variable or bounds.');
      const key=v.id+':'+v.param; if(keys.has(key)) fail('Duplicate optimization variable.'); keys.add(key);
      const s=m.surfaces.find(s=>s?.id===v.id); if(s?.mode==='image') fail('Image surface geometry is fixed; vary the preceding thickness to focus.');
      if(v.param==='radius'&&v.min<=0&&v.max>=0) fail('Radius bounds may not cross zero (zero means a plane).');
      if(['conic','a4','a6','a8','a10'].includes(v.param)&&s?.type!=='asphere') fail('Asphere variables require an Even Asphere surface.');
    }
    for(const r of o.operands) if(!r||!['RMS','EFL','BFL','TRACK'].includes(r.type)||![r.target,r.tolerance,r.weight].every(Number.isFinite)||r.tolerance<=0||r.weight<0) fail('Invalid merit operand.');
    if(!Number.isInteger(o.iterations)||o.iterations<1||o.iterations>150) fail('Use 1–150 optimization iterations.');
  }
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
function assertModel(m) {const v=validateModel(m);if(v.errors.length)throw new Error(v.errors.join('\n'));return v;}
class History {
  constructor(initial,limit=100){assertModel(initial);this.current=clone(initial);this.past=[];this.future=[];this.limit=limit;this.revision=0;}
  commit(next,label='Edit'){assertModel(next);if(JSON.stringify(next)===JSON.stringify(this.current))return false;this.past.push({model:this.current,label});if(this.past.length>this.limit)this.past.shift();this.current=clone(next);this.future=[];this.revision++;return true;}
  undo(){if(!this.past.length)return false;const p=this.past.pop();this.future.push({model:this.current,label:p.label});this.current=p.model;this.revision++;return true;}
  redo(){if(!this.future.length)return false;const p=this.future.pop();this.past.push({model:this.current,label:p.label});this.current=p.model;this.revision++;return true;}
}

return {SCHEMA_VERSION,clone,makeId,surface,createExample,validateModel,assertModel,History};
})();
// ---- math.js ----
__modules["math.js"]=(()=>{
/** Geometry in millimetres. Angles in radians inside the kernel. */
const EPS = 1e-10;
const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function normalize(a) {
  const n = Math.hypot(...a);
  if (!Number.isFinite(n) || n < 1e-30) throw new RangeError('Cannot normalize a zero or non-finite vector.');
  return mul(a, 1/n);
}
function quadratic(a,b,c) {
  if (Math.abs(a) < 1e-25) return Math.abs(b) < 1e-25 ? [] : [-c/b];
  const d = b*b-4*a*c;
  if (d < -1e-12*Math.max(1,b*b,Math.abs(4*a*c))) return [];
  const root = Math.sqrt(Math.max(0,d));
  const q = -0.5*(b + (b >= 0 ? root : -root));
  if (q === 0) return [-b/(2*a)];
  return [q/a,c/q].sort((x,y)=>x-y);
}
/** Partial-pivoted dense linear solve, used only for the small LM normal system. */
function solveLinear(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((r,i)=>[...r,rhs[i]]);
  for (let k=0;k<n;k++) {
    let pivot=k;
    for(let i=k+1;i<n;i++) if(Math.abs(a[i][k])>Math.abs(a[pivot][k])) pivot=i;
    if(Math.abs(a[pivot][k])<1e-18 || !Number.isFinite(a[pivot][k])) return null;
    [a[k],a[pivot]]=[a[pivot],a[k]];
    for(let i=k+1;i<n;i++) {
      const f=a[i][k]/a[k][k];
      for(let j=k+1;j<=n;j++) a[i][j]-=f*a[k][j];
      a[i][k]=0;
    }
  }
  const x=Array(n).fill(0);
  for(let i=n-1;i>=0;i--) {
    let v=a[i][n];
    for(let j=i+1;j<n;j++) v-=a[i][j]*x[j];
    x[i]=v/a[i][i];
  }
  return x.every(Number.isFinite)?x:null;
}
function sumSquares(a) { let sum=0,c=0; for(const x of a){const y=x*x-c,t=sum+y;c=(t-sum)-y;sum=t;} return sum; }
function mat4mul(a,b) {
  const out=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
function ortho(l,r,b,t,n,f) { return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,1/(n-f),0,(l+r)/(l-r),(t+b)/(b-t),n/(n-f),1]); }
function perspective(fov,aspect,n,f) {const q=1/Math.tan(fov/2);return new Float32Array([q/aspect,0,0,0,0,q,0,0,0,0,f/(n-f),-1,0,0,f*n/(n-f),0]);}
function lookAt(eye,target,up=[0,1,0]) {
  const z=normalize(sub(eye,target)),x=normalize(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function project(p,m,w,h) {
  const q=[0,0,0,0];
  for(let r=0;r<4;r++) q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];
  return [(q[0]/q[3]+1)*w/2,(1-q[1]/q[3])*h/2,q[2]/q[3],q[3]];
}

return {EPS,TAU,DEG,clamp,dot,add,sub,mul,cross,normalize,quadratic,solveLinear,sumSquares,mat4mul,ortho,perspective,lookAt,project};
})();
// ---- optics.js ----
__modules["optics.js"]=(()=>{
const { DEG, dot, sub, mul, normalize, quadratic, clamp, solveLinear, sumSquares }=__modules["math.js"];
const { glassCatalog, refractiveIndex }=__modules["glass.js"];
const { assertModel, validateModel, clone }=__modules["model.js"];
const STATUS = Object.freeze({OK:0,MISS:1,VIGNETTED:2,TIR:3,AIM_FAILED:4});
const STATUS_NAMES=['Transmitted','Miss / no forward root','Aperture clipped','Total internal reflection','Stop aiming failed'];
const STRIDE=20;
/** Sag and (1/r) dsag/dr; the latter avoids division by r at the axis. */
function sagGradient(s,x,y) {
  const r2=x*x+y*y,q=1-(1+s.k)*s.c*s.c*r2;
  if(q<=0) return null;
  const root=Math.sqrt(q);
  const z=s.c*r2/(1+root)+s.a4*r2*r2+s.a6*r2**3+s.a8*r2**4+s.a10*r2**5;
  const g=s.c/root+4*s.a4*r2+6*s.a6*r2*r2+8*s.a8*r2**3+10*s.a10*r2**4;
  return Number.isFinite(z)&&Number.isFinite(g)?{z,g}:null;
}
function compile(model,check=true) {
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
function intersect(p,d,s) {
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
function insideAperture(p,s) {
  const r2=p[0]*p[0]+p[1]*p[1],tol=1e-8;
  return r2+tol>=s.inner*s.inner && (s.aperture==='rectangle'?(Math.abs(p[0])<=s.semi+tol&&Math.abs(p[1])<=s.semiY+tol):r2<=s.semi*s.semi+tol);
}
/** Vector Snell law. Surface normal is oriented against incidence, not tied to +Z. */
function interact(d,normal,n1,n2,mirror=false) {
  let n=normal;
  if(dot(d,n)>0)n=mul(n,-1);
  const cosI=clamp(-dot(d,n),0,1);
  if(mirror)return {direction:normalize([d[0]+2*cosI*n[0],d[1]+2*cosI*n[1],d[2]+2*cosI*n[2]]),cosI,cosT:cosI};
  const eta=n1/n2,k=1-eta*eta*(1-cosI*cosI);
  if(k< -1e-13)return null;
  const cosT=Math.sqrt(Math.max(0,k)),b=eta*cosI-cosT;
  return {direction:normalize([eta*d[0]+b*n[0],eta*d[1]+b*n[1],eta*d[2]+b*n[2]]),cosI,cosT};
}
function traceRay(system,origin,direction,{opl=0,clip=true,path=false,end=system.length-1}={}) {
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
function pupilDirection(field) {return normalize([Math.tan(field.x*DEG),Math.tan(field.y*DEG),1]);}
/** Newton ray aiming to the actual stop, including powered surfaces ahead of it. */
function aimRay(compiled,field,wi,px,py) {
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
function tracePupil(compiled,fi,wi,u,v,options={}) {
  const stop=compiled.shape[compiled.stop],seed=aimRay(compiled,compiled.model.fields[fi],wi,u*stop.semi,v*(stop.aperture==='rectangle'?stop.semiY:stop.semi));
  return seed?traceRay(compiled.systems[wi],seed.p,seed.d,{...options,opl:seed.opl}):{status:STATUS.AIM_FAILED,path:[],p:[NaN,NaN,NaN]};
}
function radicalInverse(i){let r=0,f=0.5;while(i>0){r+=f*(i&1);i>>>=1;f*=0.5;}return r;}
function pupilSamples(n,stop) {
  const arr=[],obsc=(stop.inner/stop.semi)**2;
  for(let i=0;i<n;i++) {
    const u=(i+0.5)/n,v=radicalInverse(i);
    if(stop.aperture==='rectangle')arr.push([2*u-1,2*v-1]);
    else {const r=Math.sqrt(obsc+(1-obsc)*u),a=2*Math.PI*v;arr.push([r*Math.cos(a),r*Math.sin(a)]);}
  }
  return arr;
}
function paraxial(compiled) {
  const system=compiled.systems[compiled.model.primary],h=1e-4;
  const ray=traceRay(system,[0,h,compiled.launchZ],[0,0,1],{clip:false,end:system.length-2});
  if(ray.status||Math.abs(ray.d[1])<1e-14)return {efl:null,bfl:null,focusZ:null,epd:null,fNumber:null,track:Math.abs(compiled.shape.at(-1).z)};
  const efl=-h/(ray.d[1]/Math.abs(ray.d[2])),t=-ray.p[1]/ray.d[1],bfl=t*Math.abs(ray.d[2]);
  const stop=compiled.shape[compiled.stop];
  const a=aimRay(compiled,{x:0,y:0},compiled.model.primary,0,Math.min(stop.semi,1)*1e-4);
  const epd=a?2*stop.semi*Math.abs(a.p[1]/(Math.min(stop.semi,1)*1e-4)):null;
  return {efl,bfl,focusZ:ray.p[2]+t*ray.d[2],epd,fNumber:epd?Math.abs(efl/epd):null,track:compiled.shape.slice(0,-1).reduce((a,s)=>a+Math.abs(s.thickness),0)};
}
function prepare(model,{samples=model.samples,includeFans=true,includePaths=true}={}) {
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
function packResult(ray,out,index) {
  const o=index*STRIDE;
  out.set([...ray.p,ray.opl,...ray.d,ray.status,...ray.exitP,ray.exitOpl,...ray.exitD,ray.exitN,ray.last,ray.residual,0,0],o);
}
function traceBatch(prepared) {
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
function referenceSphereOPD(raw,i,chief) {
  const o=i*STRIDE,c=chief*STRIDE;
  if(raw[o+7]||raw[c+7])return NaN;
  const center=[raw[c],raw[c+1],raw[c+2]],cp=[raw[c+8],raw[c+9],raw[c+10]],r=Math.hypot(...sub(cp,center));
  if(r<1e-8)return NaN;
  const p=[raw[o+8],raw[o+9],raw[o+10]],d=[raw[o+12],raw[o+13],raw[o+14]],q=sub(p,center),b=dot(q,d),disc=b*b-dot(q,q)+r*r;
  if(disc<0)return NaN;
  const root=Math.sqrt(disc),t1=-b-root,t2=-b+root,t=Math.abs(t1)<Math.abs(t2)?t1:t2;
  return raw[o+11]+raw[o+15]*t-raw[c+11];
}
function summarize(prepared,raw,backend='CPU · Float64',traceMs=0) {
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
function analyze(model,options={}){const prepared=prepare(model,options),t0=performance.now(),raw=traceBatch(prepared);return summarize(prepared,raw,'CPU · Float64',performance.now()-t0);}
/** Exact least-squares detector shift in the current homogeneous image medium.
 * Across all fields/wavelengths; removes each field's common polychromatic centroid.
 */
function bestFocus(model,{samples=128}={}) {
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
function geometryWarnings(compiled) {
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
function meritResiduals(model,{samples=48}={}) {
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
async function optimize(model,{onProgress=()=>{},cancelled=()=>false,samples=48}={}) {
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
async function sweep(model,{id,param,start,end,steps=31,refocus=false,onProgress=()=>{},cancelled=()=>false}) {
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

return {STATUS,STATUS_NAMES,STRIDE,sagGradient,compile,intersect,insideAperture,interact,traceRay,pupilDirection,aimRay,tracePupil,pupilSamples,paraxial,prepare,packResult,traceBatch,referenceSphereOPD,summarize,analyze,bestFocus,geometryWarnings,meritResiduals,optimize,sweep};
})();
// ---- benchmarks.js ----
__modules["benchmarks.js"]=(()=>{
const {GLASSES,refractiveIndex}=__modules["glass.js"];
const {surface,createExample,clone,History,validateModel}=__modules["model.js"];
const {compile,intersect,interact,sagGradient,traceRay,tracePupil,analyze,paraxial,bestFocus,aimRay,STATUS,meritResiduals,optimize}=__modules["optics.js"];
const {DEG,normalize,sub}=__modules["math.js"];
function assert(condition,message){if(!condition)throw new Error(message);}
function close(actual,expected,tolerance){assert(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`Got ${actual}; expected ${expected} ± ${tolerance}`);return {actual,expected,tolerance,error:Math.abs(actual-expected)};}
function fixture(surfaces){const m=createExample('singlet');m.surfaces=surfaces;m.stopId=surfaces[0].id;m.fields=[{x:0,y:0,weight:1}];m.wavelengths=[{um:0.5875618,weight:1}];m.primary=0;m.samples=128;m.optimization.variables=[];return m;}
const BENCHMARKS=[
  ['SCHOTT N-BK7 d-line',()=>close(refractiveIndex(GLASSES['N-BK7'],0.5875618),1.51680,5e-6)],
  ['SCHOTT F2 d-line',()=>close(refractiveIndex(GLASSES.F2,0.5875618),1.62004,5e-6)],
  ['SCHOTT N-SF11 d-line',()=>close(refractiveIndex(GLASSES['N-SF11'],0.5875618),1.78472,5e-6)],
  ['Cauchy dispersion',()=>close(refractiveIndex({name:'test',model:'cauchy',A:1.5,B:0.004,C:0.0001,min:0.3,max:1},0.5),1.5176,1e-12)],
  ['Snell law · 30° air / n=1.5',()=>{const r=interact([0,0.5,Math.sqrt(0.75)],[0,0,1],1,1.5);return close(Math.asin(r.direction[1])/DEG,19.47122063449069,1e-10);}],
  ['Normal incidence preserves direction',()=>{const r=interact([0,0,1],[0,0,1],1,1.7);return close(r.direction[2],1,1e-14);}],
  ['Total internal reflection · glass / air',()=>{assert(interact([0,Math.sin(50*DEG),Math.cos(50*DEG)],[0,0,1],1.5,1)===null,'TIR not detected');return {actual:'TIR',expected:'TIR'};}],
  ['Specular reflection',()=>{const r=interact(normalize([0,1,1]),[0,0,1],1,1,true);return close(r.direction[2],-Math.SQRT1_2,1e-14);}],
  ['Refraction reciprocity',()=>{const d=normalize([0.15,0.2,1]),n=normalize([0.2,-0.1,1]),r=interact(d,n,1,1.5),back=interact(r.direction.map(v=>-v),n,1.5,1);return close(Math.hypot(...back.direction.map((v,i)=>v+d[i])),0,2e-14);}],
  ['Positive-radius spherical cap branch',()=>{const s=compile(fixture([surface({id:'a',radius:50,thickness:100}),surface({mode:'image',thickness:0})])).shape[0],h=intersect([0,10,-20],[0,0,1],s);return close(h.p[2],50-Math.sqrt(2400),1e-10);}],
  ['Negative-radius spherical cap branch',()=>{const s=compile(fixture([surface({id:'a',radius:-50,thickness:100}),surface({mode:'image',thickness:0})])).shape[0],h=intersect([0,10,-20],[0,0,1],s);return close(h.p[2],-50+Math.sqrt(2400),1e-10);}],
  ['Plane-parallel plate angular invariance',()=>{const m=fixture([surface({id:'a',thickness:8,glass:'IDEAL150',semi:100,semiY:100}),surface({thickness:20,semi:100,semiY:100}),surface({mode:'image',thickness:0,semi:100,semiY:100})]),d=[0,0.5,Math.sqrt(0.75)],r=traceRay(compile(m).systems[0],[0,0,-10],d);return close(Math.hypot(...sub(r.d,d)),0,1e-13);}],
  ['Optical path through a normal plate',()=>{const m=fixture([surface({id:'a',thickness:8,glass:'IDEAL150'}),surface({thickness:20}),surface({mode:'image',thickness:0})]),r=traceRay(compile(m).systems[0],[0,0,-10],[0,0,1]);return close(r.opl,10+8*1.5+20,1e-12);}],
  ['Circular aperture clipping',()=>{const m=fixture([surface({id:'a',semi:2,semiY:2}),surface({mode:'image',thickness:0})]),r=traceRay(compile(m).systems[0],[0,3,-20],[0,0,1]);assert(r.status===STATUS.VIGNETTED,'Ray not clipped');return {actual:r.status,expected:STATUS.VIGNETTED};}],
  ['Annular aperture central obscuration',()=>{const m=fixture([surface({id:'a',semi:3,semiY:3,inner:1}),surface({mode:'image',thickness:0})]),r=traceRay(compile(m).systems[0],[0,0,-20],[0,0,1]);assert(r.status===STATUS.VIGNETTED,'Central ray not clipped');return {actual:r.status,expected:STATUS.VIGNETTED};}],
  ['Rectangle aperture corner',()=>{const m=fixture([surface({id:'a',aperture:'rectangle',semi:2,semiY:3}),surface({mode:'image',thickness:0})]),r=traceRay(compile(m).systems[0],[1.9,2.9,-20],[0,0,1]);assert(r.status===0,'Rectangle rejected valid corner');return {actual:r.status,expected:0};}],
  ['Even-asphere analytic slope',()=>{const m=createExample('asphere'),s=compile(m).shape[1],x=3.2,h=1e-4,g=sagGradient(s,x,0),numeric=(sagGradient(s,x+h,0).z-sagGradient(s,x-h,0).z)/(2*h);return close(g.g*x,numeric,1e-10);}],
  ['Polynomial asphere intersection residual',()=>{const s=compile(createExample('asphere')).shape[1],h=intersect([2,3,-20],normalize([0.01,0.02,1]),s);assert(h,'Missed asphere');return close(h.residual,0,3e-9);}],
  ['Thin-lens limit · n=1.5 / R=50',()=>{const m=fixture([surface({id:'a',radius:50,glass:'IDEAL150',thickness:0.00001}),surface({radius:-50,thickness:50}),surface({mode:'image',thickness:0})]);return close(paraxial(compile(m)).efl,50,1e-5);}],
  ['Thick-lens lensmaker equation',()=>{const n=refractiveIndex(GLASSES['N-BK7'],0.5875618),r1=55,r2=-55,t=5,expected=1/((n-1)*(1/r1-1/r2+(n-1)*t/(n*r1*r2)));return close(paraxial(compile(createExample('singlet'))).efl,expected,1e-7);}],
  ['Paraboloid · exact 100 mm focus',()=>{const m=createExample('mirror');m.fields=[{x:0,y:0,weight:1}];const r=analyze(m,{samples:256,includeFans:false,includePaths:false});return close(r.rms,0,1e-10);}],
  ['Paraboloid · equal optical paths',()=>{const m=createExample('mirror');m.fields=[{x:0,y:0,weight:1}];const r=analyze(m,{samples:128,includeFans:false,includePaths:false});return close(r.fields[0].wavefront[1].pv,0,1e-7);}],
  ['Internal-stop Newton ray aiming',()=>{const m=createExample('singlet');m.stopId=m.surfaces[2].id;const c=compile(m),a=aimRay(c,{x:1,y:2},1,2,-3);assert(a,'Ray aiming failed');const r=traceRay(c.systems[1],a.p,a.d,{clip:false,end:c.stop});return close(Math.hypot(r.p[0]-2,r.p[1]+3),0,1e-7);}],
  ['Least-squares focus lowers spot RMS',()=>{const m=createExample('singlet');m.surfaces.at(-2).thickness=60;const before=analyze(m,{samples:128,includeFans:false,includePaths:false}).rms,after=analyze(bestFocus(m).model,{samples:128,includeFans:false,includePaths:false}).rms;assert(after<before*0.3,'Focus did not sufficiently improve RMS');return {actual:after,expected:`< ${before*0.3} mm`};}],
  ['Project validation rejects a non-real cap',()=>{const m=createExample();m.surfaces[1].radius=1;assert(validateModel(m).errors.some(e=>e.includes('conic cap')),'Invalid cap accepted');return {actual:'Rejected',expected:'Rejected'};}],
  ['Transactional undo / redo',()=>{const m=createExample(),h=new History(m),next=clone(m);next.surfaces[1].radius=70;h.commit(next);h.undo();close(h.current.surfaces[1].radius,62,0);h.redo();return close(h.current.surfaces[1].radius,70,0);}],
  ['Deterministic sampling / merit',()=>{const m=createExample(),a=meritResiduals(m),b=meritResiduals(m);return close(a.value,b.value,0);}],
  ['Bounded LM improves defocus',async()=>{const m=createExample('singlet');m.surfaces.at(-2).thickness=59;m.optimization.operands=[{type:'RMS',target:0,tolerance:0.01,weight:1}];m.optimization.iterations=12;const r=await optimize(m,{samples:32});assert(r.final<r.initial*0.1,'LM did not improve merit');assert(r.model.surfaces.at(-2).thickness>=5&&r.model.surfaces.at(-2).thickness<=250,'LM violated bounds');return {actual:r.final,expected:`< ${r.initial*0.1}`,iterations:r.iterations};}]
];
async function runBenchmarks(onProgress=()=>{}) {
  const start=performance.now(),rows=[];
  for(const [name,run]of BENCHMARKS){const t=performance.now();try{const detail=await run();rows.push({name,passed:true,ms:performance.now()-t,...detail});}catch(e){rows.push({name,passed:false,ms:performance.now()-t,error:e.message});}onProgress(rows.at(-1));}
  return {rows,passed:rows.filter(r=>r.passed).length,total:rows.length,ms:performance.now()-start,backend:'CPU Float64',version:1};
}

return {BENCHMARKS,runBenchmarks};
})();
// ---- tasks.js ----
__modules["tasks.js"]=(()=>{
const {prepare,summarize,analyze,bestFocus,optimize,sweep,compile,tracePupil,geometryWarnings,traceRay,packResult,STRIDE}=__modules["optics.js"];
const {runBenchmarks}=__modules["benchmarks.js"];

/** Shared task dispatcher: real worker, with an explicit same-kernel fallback. */
async function executeTask(type,payload={},progress=()=>{},cancelled=()=>false){
  let result;
    switch(type){
      case 'analyze':result=analyze(payload.model,payload.options);break;
      case 'prepare':result=prepare(payload.model,payload.options);break;
      case 'summarize':result=summarize(payload.prepared,payload.raw,payload.backend,payload.traceMs);break;
      case 'focus':result=bestFocus(payload.model);break;
      case 'optimize':result=await optimize(payload.model,{onProgress:progress,cancelled});break;
      case 'sweep':result=await sweep(payload.model,{...payload.options,onProgress:progress,cancelled});break;
      case 'benchmarks':result=await runBenchmarks(progress);break;
      case 'probe':result=tracePupil(compile(payload.model),payload.fi,payload.wi,payload.u,payload.v,{path:true});break;
      case 'geometry':result=geometryWarnings(compile(payload.model));break;
      case 'audit':{
        const p=payload.prepared;let maxPosition=0,maxOpl=0,mismatches=0,tested=0;
        const step=Math.max(1,Math.floor(p.tags.length/64));
        for(let i=0;i<p.tags.length;i+=step){const o=i*8,r=traceRay(p.compiled.systems[p.seeds[o+7]],Array.from(p.seeds.subarray(o,o+3)),Array.from(p.seeds.subarray(o+4,o+7)),{opl:p.seeds[o+3],clip:p.tags[i].kind!=='chief'});const g=i*STRIDE;if(p.tags[i].aimFailed)r.status=4;if(r.status!==Math.round(payload.raw[g+7]))mismatches++;else if(r.status===0){maxPosition=Math.max(maxPosition,Math.hypot(r.p[0]-payload.raw[g],r.p[1]-payload.raw[g+1],r.p[2]-payload.raw[g+2]));maxOpl=Math.max(maxOpl,Math.abs(r.opl-payload.raw[g+3]));}tested++;}
        result={maxPosition,maxOpl,mismatches,tested,passed:mismatches===0&&maxPosition<0.002};break;
      }
      default:throw new Error(`Unknown worker task: ${type}`);
    }
  return result;
}

return {executeTask};
})();
// ---- project.js ----
__modules["project.js"]=(()=>{
const {assertModel,clone}=__modules["model.js"];
const {executeTask}=__modules["tasks.js"];
class WorkerClient {
  constructor(){this.id=0;this.pending=new Map();this.cancelled=new Set();this.fallback=false;this.spawn();}
  spawn(){
    try{
      const embedded=!!globalThis.__AETHER_WORKER__;
      const url=embedded?URL.createObjectURL(new Blob([globalThis.__AETHER_WORKER__],{type:'text/javascript'})):new URL('./worker.js',globalThis.__AETHER_MODULE_URL__);
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
class ProjectStore {
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
function parseQuantity(text,dimension='length') {
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
function downloadFile(name,text,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(rows){return rows.map(row=>row.map(x=>{let s=x===null||x===undefined?'':String(x);if(typeof x==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(',')).join('\r\n');}

return {WorkerClient,ProjectStore,parseQuantity,downloadFile,csv};
})();
// ---- gpu.js ----
__modules["gpu.js"]=(()=>{
/** WebGPU Float32 tracing. The Float64 CPU kernel remains the numerical reference. */
const TRACE_WGSL = /* wgsl */ `
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

async function createGPU() {
  if(!globalThis.isSecureContext) return {device:null,reason:'WebGPU requires a secure context. Use localhost or HTTPS.'};
  if(!navigator.gpu)return {device:null,reason:'WebGPU is not available in this browser. Float64 CPU tracing is active.'};
  try {
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)return {device:null,reason:'No WebGPU adapter. Float64 CPU tracing is active.'};
    const device=await adapter.requestDevice();
    return {device,adapter,format:navigator.gpu.getPreferredCanvasFormat(),reason:null};
  } catch(e){return {device:null,reason:`WebGPU initialization: ${e.message}`};}
}
class GPUTracer {
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

return {TRACE_WGSL,createGPU,GPUTracer};
})();
// ---- render.js ----
__modules["render.js"]=(()=>{
const {compile,sagGradient}=__modules["optics.js"];
const {mat4mul,ortho,perspective,lookAt,project,clamp}=__modules["math.js"];
const WAVE_COLORS=['#77aaff','#52e0ae','#ff9b79','#cf94ff','#f6d46a','#70d9ed','#ed95c5','#bcc6ed'];
function wavelengthColor(um,index=0){return um<0.515?'#7fa7ff':um<0.61?'#56dfb6':um<0.72?'#ff987d':WAVE_COLORS[index%WAVE_COLORS.length];}
function rgba(hex,alpha=1){return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,alpha];}
const DRAW_WGSL=`
struct Uniforms{mvp:mat4x4f}
@group(0) @binding(0) var<uniform> camera:Uniforms;
struct Out{@builtin(position) position:vec4f,@location(0) color:vec4f}
@vertex fn vertex(@location(0) p:vec3f,@location(1) color:vec4f)->Out{var o:Out;o.position=camera.mvp*vec4f(p,1.0);o.color=color;return o;}
@fragment fn fragment(i:Out)->@location(0) vec4f{return i.color;}`;
function createScene(model,paths,{mode='2d',selected=null,field=-1,wavelength=-1,showRays=true,showGrid=true}={}) {
  const compiled=compile(model),surfaces=compiled.shape,lines=[],triangles=[];
  const vertex=(a,p,c)=>a.push(...p,...c);
  const line=(a,b,c)=>{vertex(lines,a,c);vertex(lines,b,c);};
  const tri=(a,b,c,color)=>{vertex(triangles,a,color);vertex(triangles,b,color);vertex(triangles,c,color);};
  const pt=(s,x,y)=>{const g=sagGradient(s,x,y);return g?[s.z+g.z,y,x]:null;};
  const zValues=[compiled.launchZ,...surfaces.map(s=>s.z)];let min=Math.min(...zValues),max=Math.max(...zValues),radius=Math.max(...surfaces.map(s=>s.semi));
  const span=max-min;
  // Physical-coordinate grid; a complete model edit rebuilds this batch, camera changes do not.
  if(showGrid){
    const spacing=10**Math.floor(Math.log10(Math.max(span,20)/8));
    for(let z=Math.floor(min/spacing)*spacing;z<=max+spacing;z+=spacing)line([z,-radius*1.55,mode==='3d'?-radius*1.1:0],[z,radius*1.55,mode==='3d'?-radius*1.1:0],rgba('#29333e',0.45));
    for(let y=-Math.ceil(radius*1.5/spacing)*spacing;y<=radius*1.5;y+=spacing)line([min,y,mode==='3d'?-radius*1.1:0],[max+span*0.06,y,mode==='3d'?-radius*1.1:0],rgba('#29333e',0.45));
  }
  line([min,0,0],[max+span*0.06,0,0],rgba('#526070',0.55));
  for(let i=0;i<surfaces.length;i++){
    const s=surfaces[i],isStop=s.id===model.stopId,isImage=s.mode==='image',isSelected=s.id===selected;
    const color=rgba(isSelected?'#a9f7e6':isImage?'#bba1f6':isStop?'#f1c786':'#5ec9c4',isSelected?1:0.72);
    if(mode==='2d'){
      const points=[];
      for(let j=0;j<=96;j++){const y=-s.semi+2*s.semi*j/96,p=pt(s,0,y);if(p)points.push(p);}
      for(let j=1;j<points.length;j++)line(points[j-1],points[j],color);
      if(isStop){for(const sign of [-1,1]){line([s.z,sign*s.semi,0],[s.z,sign*s.semi*1.38,0],rgba('#efc98f',1));line([s.z-0.7,sign*s.semi*1.38,0],[s.z+0.7,sign*s.semi*1.38,0],rgba('#efc98f',1));}}
      const next=surfaces[i+1];
      if(next&&s.glass!=='AIR'&&s.mode==='refract'){
        const r=Math.min(s.semi,next.semi),fill=rgba(s.glass==='F2'?'#b6a3ec':'#53beb5',0.18);
        for(let j=0;j<96;j++){
          const y1=-r+2*r*j/96,y2=-r+2*r*(j+1)/96,a=pt(s,0,y1),b=pt(next,0,y1),c=pt(next,0,y2),d=pt(s,0,y2);
          if(a&&b&&c&&d){tri(a,b,c,fill);tri(a,c,d,fill);}
        }
        for(const y of [-r,r]){const a=pt(s,0,y),b=pt(next,0,y);if(a&&b)line(a,b,color);}
      }
      if(isImage){const fill=rgba('#bba1f6',0.08),a=[s.z,-s.semi,0],b=[s.z+1,-s.semi,0],c=[s.z+1,s.semi,0],d=[s.z,s.semi,0];tri(a,b,c,fill);tri(a,c,d,fill);}
    }else{
      const segments=72,rings=14;
      if(s.aperture==='rectangle'){
        for(let edge=0;edge<4;edge++)for(let j=0;j<segments;j++){
          const u1=-1+2*j/segments,u2=-1+2*(j+1)/segments;
          const coord=u=>edge===0?[s.semi*u,-s.semiY]:edge===1?[s.semi,s.semiY*u]:edge===2?[-s.semi*u,s.semiY]:[-s.semi,-s.semiY*u];
          const c1=coord(u1),c2=coord(u2),a=pt(s,...c1),b=pt(s,...c2);if(a&&b)line(a,b,color);
        }
      }else{
        for(let j=0;j<segments;j++){const a=j*2*Math.PI/segments,b=(j+1)*2*Math.PI/segments,p=pt(s,s.semi*Math.cos(a),s.semi*Math.sin(a)),q=pt(s,s.semi*Math.cos(b),s.semi*Math.sin(b));if(p&&q)line(p,q,color);}
      }
      if(isStop&&s.mode!=='mirror'){
        for(let j=0;j<segments;j++){const a=j*2*Math.PI/segments,b=(j+1)*2*Math.PI/segments,r=s.semi,R=r*1.14,p=[s.z,r*Math.sin(a),r*Math.cos(a)],q=[s.z,r*Math.sin(b),r*Math.cos(b)],u=[s.z,R*Math.sin(b),R*Math.cos(b)],v=[s.z,R*Math.sin(a),R*Math.cos(a)];tri(p,q,u,rgba('#d8b275',0.3));tri(p,u,v,rgba('#d8b275',0.3));}
      }
      if(s.mode==='mirror'||s.glass!=='AIR'||isImage||i>0&&surfaces[i-1].glass!=='AIR'){
        const fill=rgba(isImage?'#bba1f6':s.mode==='mirror'?'#b9d4e6':s.glass==='F2'?'#b6a3ec':'#53beb5',s.mode==='mirror'?0.26:0.075);
        for(let r=0;r<rings;r++)for(let j=0;j<segments;j++){
          const r1=s.semi*r/rings,r2=s.semi*(r+1)/rings,a=j*2*Math.PI/segments,b=(j+1)*2*Math.PI/segments;
          const p=pt(s,r1*Math.cos(a),r1*Math.sin(a)),q=pt(s,r2*Math.cos(a),r2*Math.sin(a)),u=pt(s,r2*Math.cos(b),r2*Math.sin(b)),v=pt(s,r1*Math.cos(b),r1*Math.sin(b));
          if(p&&q&&u&&v){tri(p,q,u,fill);tri(p,u,v,fill);}
        }
      }
      for(let j=0;j<8;j++){
        const theta=j*Math.PI/4;
        for(let r=0;r<rings;r++){const a=pt(s,s.semi*r/rings*Math.cos(theta),s.semi*r/rings*Math.sin(theta)),b=pt(s,s.semi*(r+1)/rings*Math.cos(theta),s.semi*(r+1)/rings*Math.sin(theta));if(a&&b)line(a,b,rgba('#66bdba',0.25));}
      }
      const next=surfaces[i+1];if(next&&s.glass!=='AIR'&&s.mode==='refract')for(let j=0;j<24;j++){const a=j*2*Math.PI/24,r=Math.min(s.semi,next.semi),p=pt(s,r*Math.cos(a),r*Math.sin(a)),q=pt(next,r*Math.cos(a),r*Math.sin(a));if(p&&q)line(p,q,rgba('#69bcb9',0.3));}
    }
  }
  if(showRays)for(const path of paths){
    if(field!==-1&&path.fi!==field||wavelength!==-1&&path.wi!==wavelength)continue;
    const color=rgba(wavelengthColor(model.wavelengths[path.wi].um,path.wi),path.v===0?0.9:0.45);
    for(let j=1;j<path.points.length;j++){const a=path.points[j-1].p,b=path.points[j].p;if(a?.every(Number.isFinite)&&b?.every(Number.isFinite))line([a[2],a[1],a[0]],[b[2],b[1],b[0]],color);}
  }
  return {lines:new Float32Array(lines),triangles:new Float32Array(triangles),min,max,radius,compiled};
}
class LayoutRenderer {
  constructor(canvas,overlay){this.canvas=canvas;this.overlay=overlay;this.mode='2d';this.yaw=-0.38;this.pitch=0.18;this.zoom=1;this.pan=[0,0];this.dirty=false;this.scene=null;this.width=1;this.height=1;this.fallback=null;
    this.resizeObserver=new ResizeObserver(()=>this.requestRender());this.resizeObserver.observe(canvas.parentElement);
    let drag=null;
    overlay.addEventListener('pointerdown',e=>{if(e.button>1)return;drag={x:e.clientX,y:e.clientY,pan:[...this.pan],yaw:this.yaw,pitch:this.pitch,shift:e.shiftKey||e.button===1};overlay.setPointerCapture(e.pointerId);});
    overlay.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(this.mode==='3d'&&!drag.shift){this.yaw=drag.yaw+dx*0.006;this.pitch=clamp(drag.pitch+dy*0.006,-1.4,1.4);}else{this.pan=[drag.pan[0]+dx,drag.pan[1]+dy];}this.requestRender();});
    overlay.addEventListener('pointerup',()=>{drag=null;});overlay.addEventListener('pointercancel',()=>{drag=null;});
    overlay.addEventListener('wheel',e=>{e.preventDefault();this.zoom=clamp(this.zoom*Math.exp(-e.deltaY*0.001),0.2,20);this.requestRender();},{passive:false});
    overlay.addEventListener('dblclick',()=>this.fit());
  }
  async init(gpu){
    if(!gpu?.device){this.fallback=this.canvas.getContext('2d');return;}
    this.device=gpu.device;this.context=this.canvas.getContext('webgpu');this.format=gpu.format;
    this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});
    const module=this.device.createShaderModule({code:DRAW_WGSL,label:'Aether layout renderer'}),bufferLayout={arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x4'}]},base={layout:'auto',vertex:{module,entryPoint:'vertex',buffers:[bufferLayout]},fragment:{module,entryPoint:'fragment',targets:[{format:this.format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},multisample:{count:4}};
    this.linePipeline=await this.device.createRenderPipelineAsync({...base,label:'Ray and edge batch',primitive:{topology:'line-list'}});
    this.trianglePipeline=await this.device.createRenderPipelineAsync({...base,label:'Optical surface batch',primitive:{topology:'triangle-list',cullMode:'none'}});
    this.uniform=this.device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.lineBind=this.device.createBindGroup({layout:this.linePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
    this.triangleBind=this.device.createBindGroup({layout:this.trianglePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
    this.buffers={};
  }
  setScene(scene){this.scene=scene;if(this.device){for(const key of ['lines','triangles']){const arr=scene[key],size=Math.max(28,arr.byteLength);if(!this.buffers[key]||this.buffers[key].size<size){this.buffers[key]?.buffer.destroy();this.buffers[key]={size:2**Math.ceil(Math.log2(size)),buffer:null};this.buffers[key].buffer=this.device.createBuffer({size:this.buffers[key].size,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}if(arr.length)this.device.queue.writeBuffer(this.buffers[key].buffer,0,arr);}}this.requestRender();}
  setMode(mode){if(this.mode!==mode){this.mode=mode;this.fit();}}
  fit(){this.zoom=1;this.pan=[0,0];this.requestRender();}
  matrix(w,h){
    const s=this.scene,center=(s.min+s.max)/2,span=Math.max(s.max-s.min,20),radius=s.radius,aspect=w/h;
    const viewWidth=Math.max(span*1.16,2.9*radius*aspect)/this.zoom;
    if(this.mode==='2d'){
      const viewHeight=viewWidth/aspect,dx=this.pan[0]*viewWidth/w,dy=-this.pan[1]*viewHeight/h;
      return ortho(center-viewWidth/2-dx,center+viewWidth/2-dx,-viewHeight/2-dy,viewHeight/2-dy,-10000,10000);
    }
    const distance=Math.max(span*0.78,radius*3.4)*Math.max(1,1/aspect)/this.zoom;
    const target=[center-this.pan[0]*span/w,this.pan[1]*span/w,0],eye=[target[0]+Math.sin(this.yaw)*Math.cos(this.pitch)*distance,target[1]+Math.sin(this.pitch)*distance,Math.cos(this.yaw)*Math.cos(this.pitch)*distance];
    return mat4mul(perspective(Math.PI/3,aspect,0.1,Math.max(distance+span*5,1000)),lookAt(eye,target));
  }
  requestRender(){if(this.dirty)return;this.dirty=true;requestAnimationFrame(()=>{this.dirty=false;this.render();});}
  render(){
    if(!this.scene)return;const box=this.canvas.parentElement.getBoundingClientRect(),w=Math.max(1,box.width),h=Math.max(1,box.height),dpr=Math.min(devicePixelRatio||1,2);
    const pw=Math.floor(w*dpr),ph=Math.floor(h*dpr);this.width=w;this.height=h;
    if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph;this.overlay.width=pw;this.overlay.height=ph;if(this.device){this.msaa?.destroy();this.msaa=this.device.createTexture({size:[pw,ph],sampleCount:4,format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT});}}
    const m=this.matrix(w,h);this.mvp=m;
    if(this.device&&this.msaa){
      this.device.queue.writeBuffer(this.uniform,0,m);const encoder=this.device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.context.getCurrentTexture().createView(),clearValue:{r:0.055,g:0.071,b:0.09,a:1},loadOp:'clear',storeOp:'discard'}]});
      for(const [key,pipeline,bind]of [['triangles',this.trianglePipeline,this.triangleBind],['lines',this.linePipeline,this.lineBind]]){if(!this.scene[key].length)continue;pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.setVertexBuffer(0,this.buffers[key].buffer);pass.draw(this.scene[key].length/7);}
      pass.end();this.device.queue.submit([encoder.finish()]);
    }else if(this.fallback){
      const ctx=this.fallback;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0e1217';ctx.fillRect(0,0,w,h);
      for(const [key,stride]of [['triangles',21],['lines',14]]){
        const data=this.scene[key];ctx.lineWidth=0.85;
        for(let i=0;i<data.length;i+=stride){const count=stride/7;ctx.beginPath();let okay=true;for(let j=0;j<count;j++){const o=i+j*7,p=project(data.subarray(o,o+3),m,w,h);if(p[3]<=0){okay=false;break;}if(j===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);}if(!okay)continue;const color=`rgba(${Math.round(data[i+3]*255)},${Math.round(data[i+4]*255)},${Math.round(data[i+5]*255)},${data[i+6]})`;if(key==='triangles'){ctx.closePath();ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.stroke();}}
      }
    }
    this.drawOverlay(m,w,h,dpr);
  }
  drawOverlay(m,w,h,dpr){
    const ctx=this.overlay.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.font='10px ui-monospace, SFMono-Regular, Consolas, monospace';ctx.fillStyle='#647589';
    ctx.fillText(this.mode==='2d'?'Y–Z SECTION  /  TRUE ASPECT':'PERSPECTIVE  /  ORBIT VIEW',18,23);
    ctx.fillText(this.device?'WEBGPU  ·  MSAA ×4':'CANVAS 2D  ·  COMPATIBILITY RENDERER',18,h-17);
    ctx.textAlign='right';ctx.fillText(`${this.zoom.toFixed(2)}×`,w-17,h-17);ctx.textAlign='left';
    const s=this.scene;ctx.font='10px ui-monospace, monospace';
    if(this.mode==='2d'){
      const min=s.min,max=s.max,step=10**Math.floor(Math.log10(Math.max(max-min,20)/5));
      for(let z=Math.ceil(min/step)*step;z<=max;z+=step){const p=project([z,-s.radius*1.52,0],m,w,h);if(p[0]<20||p[0]>w-20)continue;ctx.fillStyle='#677585';ctx.fillText(`${z}`,p[0]-5,p[1]+15);}
      const stop=s.compiled.shape[s.compiled.stop],st=project([stop.z,-stop.semi*1.4,0],m,w,h),im=s.compiled.shape.at(-1),ip=project([im.z,im.semi*1.17,0],m,w,h);
      ctx.fillStyle='#b69b70';ctx.fillText('STOP',st[0]-12,st[1]+14);ctx.fillStyle='#ac97d7';ctx.fillText('IMAGE',ip[0]-13,ip[1]-8);
    }
    ctx.strokeStyle='#668091';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w-50,42);ctx.lineTo(w-27,42);ctx.moveTo(w-50,42);ctx.lineTo(w-50,19);ctx.stroke();ctx.fillStyle='#91a5b8';ctx.fillText('Z',w-22,45);ctx.fillText('Y',w-53,14);
  }
  exportSVG(){
    if(!this.scene)return '';const w=this.width,h=this.height,m=this.mvp,parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#0e1217"/>`];
    for(const [key,stride]of [['triangles',21],['lines',14]]){const data=this.scene[key];for(let i=0;i<data.length;i+=stride){const points=[];for(let j=0;j<stride/7;j++){const p=project(data.subarray(i+j*7,i+j*7+3),m,w,h);points.push(`${p[0].toFixed(3)},${p[1].toFixed(3)}`);}const color=`rgb(${Math.round(data[i+3]*255)},${Math.round(data[i+4]*255)},${Math.round(data[i+5]*255)})`;parts.push(key==='triangles'?`<polygon points="${points.join(' ')}" fill="${color}" opacity="${data[i+6]}"/>`:`<polyline points="${points.join(' ')}" stroke="${color}" opacity="${data[i+6]}" stroke-width="0.9" fill="none"/>`);}}
    parts.push('<text x="16" y="22" fill="#a5b9ca" font-family="monospace" font-size="11">AETHER OPTICS · Computed sequential ray layout · mm</text></svg>');return parts.join('');
  }
}

return {WAVE_COLORS,wavelengthColor,rgba,createScene,LayoutRenderer};
})();
// ---- charts.js ----
__modules["charts.js"]=(()=>{
const {wavelengthColor}=__modules["render.js"];
function setupCanvas(canvas){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w:r.width,h:r.height};}
function grid(ctx,w,h){ctx.fillStyle='#10151c';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#242e3a';ctx.lineWidth=0.6;ctx.beginPath();for(let x=0;x<=w;x+=w/8){ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let y=0;y<=h;y+=h/4){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();}
function spotChart(canvas,field,model,{onProbe}={}){
  const {ctx,w,h}=setupCanvas(canvas);grid(ctx,w,h);
  const cx=w/2,cy=h/2;let max=0;
  for(const p of field.spots)max=Math.max(max,Math.abs(p.x-field.centroid[0]),Math.abs(p.y-field.centroid[1]));
  max=Math.max(max*1.2,0.002);const scale=Math.min(w-44,h-30)/(2*max);
  ctx.strokeStyle='#46515e';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(cx,10);ctx.lineTo(cx,h-10);ctx.moveTo(12,cy);ctx.lineTo(w-12,cy);ctx.stroke();ctx.setLineDash([]);
  for(let wi=0;wi<model.wavelengths.length;wi++){
    ctx.fillStyle=wavelengthColor(model.wavelengths[wi].um,wi);ctx.globalAlpha=0.78;
    for(const p of field.spots)if(p.wi===wi){const x=cx+(p.x-field.centroid[0])*scale,y=cy-(p.y-field.centroid[1])*scale;ctx.fillRect(x-0.8,y-0.8,1.6,1.6);}
  }
  ctx.globalAlpha=1;ctx.font='10px ui-monospace, monospace';ctx.fillStyle='#8898aa';ctx.fillText(`±${(max*1000).toFixed(max<0.01?1:0)} µm`,10,h-10);ctx.textAlign='right';ctx.fillText('CENTROID',w-10,h-10);ctx.textAlign='left';
  if(!field.valid){ctx.fillStyle='#e3a77e';ctx.fillText('NO RAYS REACH THE DETECTOR',18,h/2);}
  canvas.onclick=e=>{if(!onProbe)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let best=null,dist=Infinity;for(const p of field.spots){const px=cx+(p.x-field.centroid[0])*scale,py=cy-(p.y-field.centroid[1])*scale,dd=(px-x)**2+(py-y)**2;if(dd<dist){dist=dd;best=p;}}if(best&&dist<225)onProbe(best);};
}
function fanChart(canvas,field,model,axis='Y',wavefront=false){
  const {ctx,w,h}=setupCanvas(canvas);grid(ctx,w,h);const margin={l:42,r:14,t:18,b:25},pw=w-margin.l-margin.r,ph=h-margin.t-margin.b;
  const points=field.fans.filter(f=>f.axis===axis&&!f.status),value=p=>wavefront?p.opd/(model.wavelengths[p.wi].um/1000):(axis==='Y'?p.dy:p.dx)*1000;
  let extent=wavefront?0.1:1;for(const p of points)if(Number.isFinite(value(p)))extent=Math.max(extent,Math.abs(value(p))*1.1);
  const x=p=>margin.l+(p+1)*pw/2,y=v=>margin.t+ph/2-v/extent*ph/2;
  ctx.strokeStyle='#465463';ctx.beginPath();ctx.moveTo(x(-1),y(0));ctx.lineTo(x(1),y(0));ctx.moveTo(x(0),margin.t);ctx.lineTo(x(0),h-margin.b);ctx.stroke();
  for(let wi=0;wi<model.wavelengths.length;wi++){
    ctx.strokeStyle=wavelengthColor(model.wavelengths[wi].um,wi);ctx.lineWidth=1.4;ctx.beginPath();let first=true;
    for(const p of field.fans.filter(p=>p.axis===axis&&p.wi===wi)){const v=value(p);if(p.status||!Number.isFinite(v)){first=true;continue;}if(first)ctx.moveTo(x(p.p),y(v));else ctx.lineTo(x(p.p),y(v));first=false;}ctx.stroke();
  }
  ctx.fillStyle='#8898aa';ctx.font='10px ui-monospace, monospace';ctx.fillText(`+${extent.toFixed(extent<1?2:1)}`,3,margin.t+5);ctx.fillText(`−${extent.toFixed(extent<1?2:1)}`,3,h-margin.b);ctx.fillText('−1',margin.l-4,h-8);ctx.fillText('0',x(0)-3,h-8);ctx.fillText('+1',x(1)-12,h-8);ctx.fillStyle='#b1bcc9';ctx.fillText(wavefront?'OPD / waves':`${axis==='Y'?'TANGENTIAL ΔY':'SAGITTAL ΔX'} / µm`,margin.l+6,13);
}
function heat(t){const colors=[[63,111,217],[82,204,209],[99,220,155],[239,210,119],[236,123,113]],u=Math.max(0,Math.min(0.999,t))*4,i=Math.floor(u),v=u-i,a=colors[i],b=colors[i+1]||a;return `rgb(${a.map((x,j)=>Math.round(x*(1-v)+b[j]*v)).join(',')})`;}
function wavefrontChart(canvas,field,model,wi){
  const {ctx,w,h}=setupCanvas(canvas);grid(ctx,w,h);const wf=field.wavefront[wi],points=field.spots.filter(p=>p.wi===wi&&Number.isFinite(p.opd)),r=Math.min(w,h)*0.39,cx=w/2,cy=h/2;
  ctx.fillStyle='#1b2531';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  const size=Math.max(2,r*2.7/Math.sqrt(Math.max(1,points.length)));
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
  for(const p of points){const v=p.opd/(model.wavelengths[wi].um/1000),t=(v-wf.min)/Math.max(wf.max-wf.min,1e-14);ctx.fillStyle=heat(t);ctx.beginPath();ctx.arc(cx+p.u*r,cy-p.v*r,size,0,Math.PI*2);ctx.fill();}ctx.restore();
  ctx.strokeStyle='#607181';ctx.lineWidth=0.6;ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.moveTo(cx-r-5,cy);ctx.lineTo(cx+r+5,cy);ctx.moveTo(cx,cy-r-5);ctx.lineTo(cx,cy+r+5);ctx.stroke();
  const y=h-16,barW=100,x=(w-barW)/2;for(let i=0;i<barW;i++){ctx.fillStyle=heat(i/barW);ctx.fillRect(x+i,y,1,5);}ctx.font='9px ui-monospace, monospace';ctx.fillStyle='#98a8ba';ctx.textAlign='right';ctx.fillText(Number.isFinite(wf.min)?wf.min.toFixed(2):'—',x-5,y+5);ctx.textAlign='left';ctx.fillText(Number.isFinite(wf.max)?`${wf.max.toFixed(2)} λ`:'—',x+barW+5,y+5);
  if(!points.length){ctx.fillStyle='#e0ae8a';ctx.fillText('No valid reference sphere',12,20);}
}
function lineChart(canvas,series,{xlabel='',ylabel='',log=false}={}){
  if(!canvas)return;
  const {ctx,w,h}=setupCanvas(canvas);grid(ctx,w,h);const m={l:58,r:18,t:24,b:35},pw=w-m.l-m.r,ph=h-m.t-m.b;
  const points=series.flatMap(s=>s.points).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(!points.length){ctx.fillStyle='#8f9cac';ctx.fillText('Run the study to calculate this plot.',18,30);return;}
  const ys=points.map(p=>log?Math.log10(Math.max(p.y,1e-15)):p.y);let xmin=Math.min(...points.map(p=>p.x)),xmax=Math.max(...points.map(p=>p.x)),ymin=Math.min(...ys),ymax=Math.max(...ys);if(xmax===xmin)xmax=xmin+1;if(ymax===ymin)ymax=ymin+1;
  const pad=(ymax-ymin)*0.1;ymin-=pad;ymax+=pad;const X=x=>m.l+(x-xmin)/(xmax-xmin)*pw,Y=y=>m.t+ph-((log?Math.log10(Math.max(y,1e-15)):y)-ymin)/(ymax-ymin)*ph;
  for(const s of series){ctx.strokeStyle=s.color??'#5cdbc0';ctx.lineWidth=1.8;ctx.beginPath();let start=true;for(const p of s.points){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){start=true;continue;}if(start)ctx.moveTo(X(p.x),Y(p.y));else ctx.lineTo(X(p.x),Y(p.y));start=false;}ctx.stroke();}
  ctx.fillStyle='#8f9cac';ctx.font='10px ui-monospace,monospace';for(let i=0;i<=4;i++){const xx=xmin+(xmax-xmin)*i/4,yy=ymin+(ymax-ymin)*i/4;ctx.fillText(xx.toPrecision(4),X(xx)-10,h-19);ctx.fillText((log?10**yy:yy).toPrecision(3),4,m.t+ph-i*ph/4+3);}ctx.fillStyle='#bbc7d3';ctx.fillText(ylabel,m.l,14);ctx.textAlign='center';ctx.fillText(xlabel,m.l+pw/2,h-3);ctx.textAlign='left';
}

return {setupCanvas,spotChart,fanChart,wavefrontChart,lineChart};
})();
// ---- app.js ----
__modules["app.js"]=(()=>{
const {History,assertModel,validateModel,createExample,clone,surface,makeId}=__modules["model.js"];
const {GLASSES,glassCatalog,refractiveIndex,validateGlass}=__modules["glass.js"];
const {compile,bestFocus,geometryWarnings,STATUS_NAMES,STRIDE}=__modules["optics.js"];
const {WorkerClient,ProjectStore,parseQuantity,downloadFile,csv}=__modules["project.js"];
const {createGPU,GPUTracer}=__modules["gpu.js"];
const {LayoutRenderer,createScene,wavelengthColor}=__modules["render.js"];
const {spotChart,fanChart,wavefrontChart,lineChart}=__modules["charts.js"];
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=3)=>Number.isFinite(n)?n.toFixed(d):'—',num=n=>Number.isFinite(n)?n.toLocaleString('en-US'):'—',val=n=>Number.isFinite(n)?Number(n.toPrecision(11)):'';
const paths={undo:'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',redo:'m15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12',save:'M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',new:'M14 3H4v18h16V9zM14 3v6h6M8 14h8M12 10v8',folder:'M3 7V4h7l3 3h8v13H3z',lens:'M12 2C3 7 3 17 12 22 21 17 21 7 12 2zM1 12h22',insert:'M7 3v18M17 3v18M10 12h4M12 10v4',plus:'M12 4v16M4 12h16',delete:'M3 6h18M9 6V3h6v3M6 6v15h12V6M10 10v7M14 10v7',copy:'M8 8h13v13H8zM4 16H2V2h14v2',asphere:'M7 2C20 7-1 17 12 22M17 2v20M1 12h22',mirror:'M16 2c-9 5-9 15 0 20M16 2l4 2M13 7l4 2M12 12h5M13 17l4-2M16 22l4-2',settings:'M4 7h16M4 17h16M8 3v8M16 13v8',spectrum:'M2 19 12 3l10 16zM12 11l10-4M12 12l10 0M12 13l10 5',field:'M3 20V4h18M3 20 21 4M3 20l18-6M3 20l6-16',glass:'M6 3h12l-2 8H8zM12 11v9M7 21h10',spot:'M5 6h.1M9 4h.1M15 6h.1M5 12h.1M10 10h.1M14 12h.1M19 10h.1M7 17h.1M12 16h.1M17 18h.1M11 21h.1',fans:'M3 20V4M3 12h18M4 4c8 0 5 16 17 16M4 20c8 0 5-16 17-16',wave:'M2 12c4-16 6 16 10 0s6 16 10 0',report:'M5 2h10l5 5v15H5zM15 2v6h5M9 12h7M9 16h7',optimize:'M3 20h18M4 4c3 0 3 13 8 13S16 4 21 4M12 12v8',sweep:'M3 3v18h18M5 16l4-7 5 4 6-9',check:'m5 12 4 4L20 5M21 12a9 9 0 1 1-9-9',layout:'M3 4h18v16H3zM4 12h16M8 7v10M15 7v10',cube:'m12 2 10 5v10l-10 5-10-5V7zM2 7l10 5 10-5M12 12v10M12 2v10',fit:'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',export:'M14 3h7v7M21 3 10 14M10 4H3v17h17v-7',focus:'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M12 7v10M7 12h10',play:'m7 3 14 9-14 9z',chevron:'m9 5 6 7-6 7',project:'M3 3h7l3 3h8v15H3zM7 11h10M7 16h7',arrow:'M4 12h16m-6-6 6 6-6 6',table:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',ray:'M2 5 22 12 2 19M9 2v20',grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',camera:'M3 6h5l2-3h4l2 3h5v15H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',close:'M5 5l14 14M5 19 19 5'};
function icons(root=document){for(const e of root.querySelectorAll('[data-icon]'))e.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[e.dataset.icon]||paths.lens}"/></svg>`;}
const worker=new WorkerClient(),store=new ProjectStore();
const state={history:null,result:null,resultRevision:-1,selected:null,mode:'2d',analysis:'spot',field:-1,wave:-1,showRays:true,showGrid:true,precision:'auto',gpu:null,tracer:null,renderer:null,audit:null,computeEpoch:0,computing:false,computeAgain:false,activeJob:null,dialogActions:new Map(),dialogEpoch:0,logs:[],benchmarks:null,optimization:null,sweep:null,warnings:[]};
const model=()=>state.history.current;
const microns=x=>Number.isFinite(x)?x*1000:null;
function requireResult(){if(!state.result||state.resultRevision!==state.history.revision)throw new Error('Wait for the current prescription to finish tracing.');return state.result;}
function log(message,kind='info'){state.logs.unshift({at:new Date().toISOString(),kind,message:String(message)});state.logs.length=Math.min(state.logs.length,100);}
let toastTimer,saveTimer,computeTimer;
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.add('visible');$('toast').classList.toggle('error',error);clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);log(message,error?'error':'info');}
function status(message,busy=false,error=false){$('status-message').textContent=message;$('status-dot').classList.toggle('busy',busy);$('status-dot').style.background=error?'#e39989':'';}
function persist(){clearTimeout(saveTimer);$('save-state').textContent='Saving locally…';saveTimer=setTimeout(async()=>{try{await store.save(model());$('save-state').textContent=store.mode==='memory'?'Memory only · export to save':'Saved locally';}catch(e){$('save-state').textContent='Export to save';log(e.message,'storage');}},250);}
function changed(){if(!model().surfaces.some(s=>s.id===state.selected))state.selected=model().surfaces[0].id;renderDocument();scheduleCompute();persist();}
function commit(next,label='Edit prescription'){assertModel(next);if(state.history.commit(next,label)){changed();return true;}return false;}
function edit(fn,label){const next=clone(model());fn(next);return commit(next,label);}
const selected=()=>model().surfaces.find(s=>s.id===state.selected)||model().surfaces[0];
function dimension(p){return p==='radius'?'radius':p==='conic'?'scalar':p.startsWith('a')&&p!=='aperture'?p:'length';}
function defaultVariable(s,param){const x=s[param];let scale=Math.max(Math.abs(x)*.1,param==='thickness'?1:param==='radius'?1:.01),min=x-scale*5,max=x+scale*5;if(param==='radius'){min=x>0?Math.max(s.semi*1.01,x*.4):x*2;max=x>0?x*2:Math.min(-s.semi*1.01,x*.4);}if(param==='thickness'){min=x>=0?Math.max(.01,x*.25):x*2;max=x>=0?Math.max(20,x*2):x*.25;}if(param.startsWith('a')){scale=Math.max(Math.abs(x),10**(-Number(param.slice(1))-2));min=x-scale*5;max=x+scale*5;}return {id:s.id,param,min,max,scale};}
function toggleVariable(id,param){edit(m=>{const s=m.surfaces.find(s=>s.id===id),v=m.optimization.variables,idx=v.findIndex(x=>x.id===id&&x.param===param);if(idx>=0)v.splice(idx,1);else v.push(defaultVariable(s,param));},'Toggle optimization variable');}
function normalizeDirections(m){let direction=1;for(const s of m.surfaces){if(s.mode==='mirror')direction*=-1;if(s.mode!=='image')s.thickness=direction*Math.abs(s.thickness);}for(const v of m.optimization.variables){const s=m.surfaces.find(s=>s.id===v.id);if(v.param==='thickness'&&Math.sign(v.min)!==Math.sign(s.thickness))Object.assign(v,defaultVariable(s,v.param));}}
function renderDocument(){const m=model();$('tree-name').textContent=m.name;$('document-name').textContent=m.name;document.title=`${m.name} · Aether Optics`;$('wave-count').textContent=m.wavelengths.length;$('field-count').textContent=m.fields.length;$('surface-count').textContent=m.surfaces.length;$('variable-count').textContent=`${m.optimization.variables.length} V`;$('status-surfaces').textContent=`${m.surfaces.length} surfaces`;
  document.querySelectorAll('[data-action="undo"]').forEach(b=>b.disabled=!state.history.past.length);document.querySelectorAll('[data-action="redo"]').forEach(b=>b.disabled=!state.history.future.length);
  if(!$('sampling').querySelector(`option[value="${m.samples}"]`))$('sampling').add(new Option(`${num(m.samples)} / pupil`,m.samples));$('sampling').value=m.samples;
  if(state.field>=m.fields.length)state.field=-1;if(state.wave>=m.wavelengths.length)state.wave=-1;
  $('layout-field').innerHTML='<option value="-1">All fields</option>'+m.fields.map((f,i)=>`<option value="${i}">F${i+1} · ${f.x}, ${f.y}°</option>`).join('');$('layout-field').value=state.field;
  $('layout-wave').innerHTML='<option value="-1">All wavelengths</option>'+m.wavelengths.map((w,i)=>`<option value="${i}">${fmt(w.um*1000,1)} nm</option>`).join('');$('layout-wave').value=state.wave;
  $('wavelength-legend').innerHTML=m.wavelengths.map((w,i)=>`<span class="legend-item"><i style="background:${wavelengthColor(w.um,i)}"></i>${fmt(w.um*1000,1)} nm${i===m.primary?' <b>★</b>':''}</span>`).join('');renderTree();renderTable();renderInspector();renderChecks();}
function renderTree(){const m=model();$('surface-tree').innerHTML=m.surfaces.map((s,i)=>`<button class="surface-row ${s.id===state.selected?'selected':''}" data-select="${esc(s.id)}"><span class="surface-number">${s.mode==='image'?'IMA':i}</span><span class="surface-glyph ${s.mode==='image'?'image':''}" data-icon="${s.mode==='mirror'?'mirror':s.mode==='image'?'field':'lens'}"></span><span class="surface-name">${esc(s.label)}</span>${s.id===m.stopId?'<span class="stop-tag">STO</span>':''}</button>`).join('');icons($('surface-tree'));}
function renderTable(){const m=model(),catalog=glassCatalog(m.customGlasses),cell=(s,param,disabled=false)=>{const variable=m.optimization.variables.some(v=>v.id===s.id&&v.param===param);return `<div class="numeric-cell"><input data-id="${esc(s.id)}" data-param="${param}" value="${param==='radius'&&!s.radius?'∞':val(s[param])}" aria-label="${esc(s.label)} ${param}" ${disabled?'disabled':''}><button class="variable-toggle ${variable?'is-variable':''}" data-action="variable" data-id="${esc(s.id)}" data-param="${param}" title="Toggle optimization variable" ${disabled?'disabled':''}>${variable?'V':'·'}</button></div>`;};
  $('lens-tbody').innerHTML=m.surfaces.map((s,i)=>`<tr data-row="${esc(s.id)}" class="${s.id===state.selected?'selected':''}"><td><button class="surface-index" data-select="${esc(s.id)}">${s.mode==='image'?'IMA':s.id===m.stopId?`${i} <b>STO</b>`:i}</button></td><td><input data-id="${esc(s.id)}" data-param="label" value="${esc(s.label)}" aria-label="Surface ${i} label"></td><td><select data-id="${esc(s.id)}" data-param="type" ${s.mode==='image'?'disabled':''}><option value="standard" ${s.type==='standard'?'selected':''}>${s.mode==='mirror'?'Mirror':'Standard'}</option><option value="asphere" ${s.type==='asphere'?'selected':''}>Even asphere</option></select></td><td>${cell(s,'radius',s.mode==='image')}</td><td>${cell(s,'thickness',s.mode==='image')}</td><td><select class="glass-value" data-id="${esc(s.id)}" data-param="glass" ${s.mode!=='refract'?'disabled':''}>${Object.keys(catalog).map(k=>`<option ${k===s.glass?'selected':''}>${esc(k)}</option>`).join('')}</select></td><td><input class="num" data-id="${esc(s.id)}" data-param="semi" value="${val(s.semi)}" aria-label="Surface ${i} semi diameter"></td><td>${cell(s,'conic',s.type!=='asphere'||s.mode==='image')}</td></tr>`).join('');}
function renderInspector(){const s=selected(),i=model().surfaces.indexOf(s);$('selected-number').textContent=`S${i}`;let n='—';try{n=fmt(compile(model()).systems[model().primary][i].n2,6);}catch{}
  $('surface-inspector').innerHTML=`<div class="inspector-surface-name">${esc(s.label)}</div><div class="property-row"><label>Radius</label><input data-id="${esc(s.id)}" data-param="radius" value="${s.radius?val(s.radius):'∞'}" ${s.mode==='image'?'disabled':''}></div><div class="property-row"><label>Thickness</label><input data-id="${esc(s.id)}" data-param="thickness" value="${val(s.thickness)}" ${s.mode==='image'?'disabled':''}></div><div class="property-row"><label>Semi-diameter</label><input data-id="${esc(s.id)}" data-param="semi" value="${val(s.semi)}"></div><div class="property-row"><label>Refractive index</label><span class="mono">${n}</span></div><div class="property-row"><label>Aperture</label><span>${s.aperture==='circle'?'Circular':'Rectangular'}${s.inner?' · annular':''}</span></div><button class="button inspector-button" data-action="surface-properties">All surface properties <span data-icon="arrow"></span></button>`;icons($('surface-inspector'));}
function renderChecks(){const v=validateModel(model());state.warnings=[...v.warnings,...geometryWarnings(compile(model()))];$('check-title').textContent=state.warnings.length?`${state.warnings.length} geometry notice${state.warnings.length===1?'':'s'}`:'Prescription valid';$('check-note').textContent=state.warnings.length?'Review geometry diagnostics':'Real caps · valid media · mm units';}
function updateScene(){if(!state.renderer)return;state.renderer.setMode(state.mode);state.renderer.setScene(createScene(model(),state.resultRevision===state.history.revision?(state.result?.paths||[]):[],{mode:state.mode,selected:state.selected,field:state.field,wavelength:state.wave,showRays:state.showRays,showGrid:state.showGrid}));}
function scheduleCompute(){state.computeEpoch++;state.computeAgain=true;clearTimeout(computeTimer);computeTimer=setTimeout(compute,100);status('Prescription changed · tracing…',true);$('viewport-loading').hidden=false;updateScene();}
async function compute(){if(state.computing){state.computeAgain=true;return;}state.computing=true;
  do{state.computeAgain=false;const epoch=state.computeEpoch,revision=state.history.revision,m=clone(model()),start=performance.now();try{
    let result;const gpu=state.tracer&&!state.tracer.lost&&state.precision==='auto'&&state.analysis!=='opd';
    if(gpu){const p=await worker.run('prepare',{model:m}),t0=performance.now(),raw=await state.tracer.trace(p),traceMs=performance.now()-t0;state.audit=await worker.run('audit',{prepared:p,raw});if(state.audit.passed)result=await worker.run('summarize',{prepared:p,raw,backend:'WebGPU · Float32',traceMs});else{result=await worker.run('analyze',{model:m});result.fallback='GPU audit outside 2 µm image-position tolerance';log(result.fallback,'precision');}}
    else result=await worker.run('analyze',{model:m});
    if(epoch!==state.computeEpoch||revision!==state.history.revision){state.computeAgain=true;continue;}
    if(worker.fallback&&result.backend.includes('CPU'))result.backend='CPU · Float64 · main-thread fallback';state.result=result;state.resultRevision=revision;renderResults();updateScene();$('viewport-loading').hidden=true;status(`${result.valid===result.total?'Trace complete':'Trace complete · some rays rejected'}${result.fallback?' · Float64 safety fallback':''}`);$('status-timing').textContent=`${fmt(performance.now()-start,0)} ms end-to-end`;
  }catch(e){if(state.tracer&&!state.tracer.lost&&state.precision==='auto'){state.tracer.lost=true;$('gpu-label').textContent='WebGPU render · Float64 trace';state.computeAgain=true;log(`GPU unavailable: ${e.message}`,'error');}else{status(e.message,false,true);toast(e.message,true);$('viewport-loading').hidden=true;}}
  }while(state.computeAgain);state.computing=false;}
function renderResults(){const r=state.result;if(!r)return;const p=r.paraxial;$('metric-efl').textContent=fmt(p.efl,2);$('metric-fno').textContent=p.fNumber?`f / ${fmt(p.fNumber,2)}`:'—';$('metric-aperture').textContent=`Entrance pupil ${fmt(p.epd,2)} mm`;$('metric-rms').textContent=fmt(microns(r.rms),2);$('metric-rays').textContent=num(r.valid);$('metric-total').textContent=`/ ${num(r.total)}`;$('metric-throughput').textContent=`${fmt(100*r.valid/r.total,1)}% geometric transmission`;$('precision-pill').textContent=r.backend.includes('Float32')?'f32':'f64';$('status-backend').textContent=r.backend.toUpperCase();renderAnalysis();}
function renderAnalysis(){const r=state.result;if(!r)return;document.querySelectorAll('[data-analysis]').forEach(b=>b.classList.toggle('active',b.dataset.analysis===state.analysis));const wi=state.wave>=0?state.wave:r.model.primary;
  $('analysis-content').innerHTML=r.fields.map(f=>`<div class="analysis-card"><div class="analysis-card-header"><span><b>F${f.fi+1}</b> ${fmt(f.field.x,1)}°, ${fmt(f.field.y,1)}°</span><span class="rms-badge">${state.analysis==='opd'?`RMS ${fmt(f.wavefront[wi].rms,3)} λ`:`RMS ${fmt(microns(f.rms),2)} µm`}</span></div>${state.analysis==='spot'?`<canvas id="spot-${f.fi}" aria-label="Field ${f.fi+1} spot diagram"></canvas>`:state.analysis==='fans'?`<canvas id="fan-y-${f.fi}" aria-label="Tangential ray fan"></canvas><canvas id="fan-x-${f.fi}" aria-label="Sagittal ray fan"></canvas>`:`<canvas class="wave-canvas" id="wave-${f.fi}" aria-label="Reference-sphere wavefront"></canvas><canvas id="opd-fan-${f.fi}" aria-label="Optical path difference fan"></canvas>`}<div class="analysis-card-footer"><span>${state.analysis==='opd'?`${fmt(r.model.wavelengths[wi].um*1000,1)} nm · PV ${fmt(f.wavefront[wi].pv,3)} λ`:`GEO ${fmt(microns(f.geometric),2)} µm`}</span><span>${num(f.valid)} / ${num(f.total)} rays</span></div></div>`).join('');
  $('analysis-footnote').textContent=state.analysis==='spot'?'Equal-area sampling · Click a spot to probe':state.analysis==='fans'?'Primary chief-ray reference · Normalized pupil':'Reference sphere · Piston removed for RMS · Float64';requestAnimationFrame(drawAnalysis);}
function drawAnalysis(){const r=state.result;if(!r)return;for(const f of r.fields){if($(`spot-${f.fi}`))spotChart($(`spot-${f.fi}`),f,r.model,{onProbe:p=>probe(f.fi,p.wi,p.u,p.v)});if($(`fan-y-${f.fi}`)){fanChart($(`fan-y-${f.fi}`),f,r.model,'Y');fanChart($(`fan-x-${f.fi}`),f,r.model,'X');}if($(`wave-${f.fi}`)){wavefrontChart($(`wave-${f.fi}`),f,r.model,state.wave>=0?state.wave:r.model.primary);fanChart($(`opd-fan-${f.fi}`),f,r.model,'Y',true);}}}
function openDialog(title,html,actions=[]){state.dialogEpoch++;$('dialog-title').textContent=title;$('dialog-content').innerHTML=html;state.dialogActions.clear();$('dialog-actions').innerHTML=actions.map((a,i)=>{state.dialogActions.set(`dialog-${i}`,a.run);return `<button class="button ${a.primary?'primary':''}" data-action="dialog-${i}" ${a.disabled?'disabled':''}>${esc(a.label)}</button>`;}).join('')+`<button class="button" data-action="close">Close</button>`;if(!$('dialog').open)$('dialog').showModal();icons($('dialog'));}
function closeDialog(){state.dialogEpoch++;if(state.activeJob){worker.cancel(state.activeJob);state.activeJob=null;}$('dialog').close();}
const input=(id,label,value,extra='',note='')=>`<div class="form-group"><label for="${id}">${label}</label><input id="${id}" value="${esc(value)}" ${extra}>${note?`<small>${note}</small>`:''}</div>`;
const infoRows=rows=>`<table class="stats-table">${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
const button=(action,label,extra='')=>`<button class="button" data-action="${action}" ${extra}>${label}</button>`;
const read=(id,dim='scalar')=>parseQuantity($(id).value,dim);
function properties(){const m=model();openDialog('System properties',`<div class="form-grid">${input('p-name','Design name',m.name,'class="full"')}<div class="form-group"><label>Aperture stop</label><select id="p-stop">${m.surfaces.filter(s=>s.mode!=='image').map(s=>`<option value="${esc(s.id)}" ${s.id===m.stopId?'selected':''}>${esc(s.label)}</option>`).join('')}</select></div>${input('p-diameter','Stop diameter · mm',m.surfaces.find(s=>s.id===m.stopId).semi*2)}<div class="form-group"><label>Primary wavelength</label><select id="p-primary">${m.wavelengths.map((w,i)=>`<option value="${i}" ${i===m.primary?'selected':''}>${fmt(w.um*1000,4)} nm</option>`).join('')}</select></div><div class="form-group full"><label>Description</label><textarea id="p-description" rows="3">${esc(m.description)}</textarea></div></div><div class="note">Sequential, coaxial optical surfaces; object at infinity. Lengths are stored in mm, wavelength in µm, and angular fields in degrees. The stop is physically ray-aimed, including internal stops. Thickness is the signed global-Z distance to the next vertex.</div>`,[{label:'Apply system',primary:true,run:()=>{edit(n=>{n.name=$('p-name').value;n.description=$('p-description').value;n.stopId=$('p-stop').value;n.primary=Number($('p-primary').value);const s=n.surfaces.find(s=>s.id===n.stopId);s.semi=read('p-diameter','length')/2;if(s.aperture==='circle')s.semiY=s.semi;},'System properties');closeDialog();}}]);$('p-stop').onchange=()=>$('p-diameter').value=model().surfaces.find(s=>s.id===$('p-stop').value).semi*2;}
function surfaceProperties(){const s=selected(),catalog=glassCatalog(model().customGlasses);openDialog(`Surface ${model().surfaces.indexOf(s)} · ${s.label}`,`<div class="form-grid three">${input('s-label','Comment / name',s.label)}<div class="form-group"><label>Surface equation</label><select id="s-type" ${s.mode==='image'?'disabled':''}><option value="standard" ${s.type==='standard'?'selected':''}>Standard sphere / plane</option><option value="asphere" ${s.type==='asphere'?'selected':''}>Even asphere</option></select></div><div class="form-group"><label>Material after surface</label><select id="s-glass" ${s.mode!=='refract'?'disabled':''}>${Object.keys(catalog).map(k=>`<option ${s.glass===k?'selected':''}>${esc(k)}</option>`).join('')}</select></div>${input('s-radius','Radius · mm',s.radius||'∞',s.mode==='image'?'disabled':'')}${input('s-thickness','Thickness to next · mm',s.thickness,s.mode==='image'?'disabled':'')}${input('s-conic','Conic constant k',s.conic)}<div class="form-group"><label>Aperture shape</label><select id="s-aperture"><option value="circle" ${s.aperture==='circle'?'selected':''}>Circular</option><option value="rectangle" ${s.aperture==='rectangle'?'selected':''}>Rectangular</option></select></div>${input('s-semi','Semi-diameter / half width · mm',s.semi)}${input('s-semiY','Half height · mm (rectangle)',s.semiY)}${input('s-inner','Central obscuration radius · mm',s.inner)}${['a4','a6','a8','a10'].map(p=>input(`s-${p}`,`${p.toUpperCase()} · mm⁻${Number(p.slice(1))-1}`,s[p])).join('')}</div><div class="note"><code>z(r) = c r² / [1 + √(1 − (1+k)c²r²)] + A₄r⁴ + A₆r⁶ + A₈r⁸ + A₁₀r¹⁰</code><br>c = 1/R; R = 0 means a plane. Polynomial terms and k are used only for an even asphere. ${s.mode==='mirror'?'This is an ideal mirror. Negative thickness propagates back along global Z.':''}</div>`,[{label:'Apply surface',primary:true,run:()=>{edit(m=>{const t=m.surfaces.find(x=>x.id===s.id);t.label=$('s-label').value;t.type=$('s-type').value;t.glass=$('s-glass').value;t.radius=read('s-radius','radius');t.thickness=read('s-thickness','length');t.aperture=$('s-aperture').value;t.semi=read('s-semi','length');t.semiY=t.aperture==='circle'?t.semi:read('s-semiY','length');t.inner=read('s-inner','length');for(const p of ['conic','a4','a6','a8','a10'])t[p]=t.type==='asphere'?read(`s-${p}`,dimension(p)):0;if(t.type==='standard')m.optimization.variables=m.optimization.variables.filter(v=>v.id!==s.id||!['conic','a4','a6','a8','a10'].includes(v.param));},'Surface properties');closeDialog();}}]);}
function wavelengths(draft=null){const rows=draft||model().wavelengths;openDialog('Wavelength data',`<p>Each wavelength is traced through its own dispersive optical system. Positive weights determine the polychromatic centroid and merit function.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Wavelength · nm</th><th>Weight</th><th></th></tr></thead><tbody>${rows.map((w,i)=>`<tr><td>λ${i+1}</td><td><input id="wl-${i}" value="${val(w.um*1000)}"></td><td><input id="ww-${i}" value="${val(w.weight)}"></td><td>${button('remove-wavelength','Remove',`data-index="${i}" ${rows.length===1?'disabled':''}`)}</td></tr>`).join('')}</tbody></table></div><div class="inline-actions">${button('add-wavelength','+ Wavelength',rows.length>=8?'disabled':'')}<small>Fraunhofer F / d / C: 486.1327 / 587.5618 / 656.2725 nm</small></div>`,[{label:'Apply wavelengths',primary:true,run:()=>{edit(m=>{m.wavelengths=readWavelengths();m.primary=Math.min(m.primary,m.wavelengths.length-1);},'Wavelengths');closeDialog();}}]);}
function readWavelengths(){return [...$('dialog-content').querySelectorAll('[id^="wl-"]')].map((e,i)=>({um:parseQuantity(e.value,'wavelength')/1000,weight:read(`ww-${i}`)}));}
function fields(draft=null){const rows=draft||model().fields;openDialog('Angular field data',`<p>Collimated bundles are launched with d = normalize(tan θx, tan θy, 1). Zero-weight fields remain visible but do not drive optimization.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Field</th><th>X angle · degrees</th><th>Y angle · degrees</th><th>Weight</th><th></th></tr></thead><tbody>${rows.map((f,i)=>`<tr><td>F${i+1}</td><td><input id="fx-${i}" value="${f.x}"></td><td><input id="fy-${i}" value="${f.y}"></td><td><input id="fw-${i}" value="${f.weight}"></td><td>${button('remove-field','Remove',`data-index="${i}" ${rows.length===1?'disabled':''}`)}</td></tr>`).join('')}</tbody></table></div><div class="inline-actions">${button('add-field','+ Angular field',rows.length>=9?'disabled':'')}</div>`,[{label:'Apply fields',primary:true,run:()=>{edit(m=>m.fields=readFields(),'Field data');closeDialog();}}]);}
function readFields(){return [...$('dialog-content').querySelectorAll('[id^="fx-"]')].map((e,i)=>({x:parseQuantity(e.value,'angle'),y:read(`fy-${i}`,'angle'),weight:read(`fw-${i}`)}));}
function examples(){const items=[['achromat','Aurora','Air-spaced crown / flint doublet','N-BK7 + F2 · 3 fields · 3 wavelengths'],['singlet','Vega','Spherical crown-glass singlet','CHROMATIC + SPHERICAL ABERRATION'],['asphere','Nova','Even-asphere crown-glass singlet','CONIC + POLYNOMIAL SURFACE'],['mirror','Parabola','Reflective parabolic telescope','EXACT ON-AXIS FOCUS · 100 mm']];openDialog('New optical design',`<p>Start from a working prescription. All rays and plots are calculated from the editable surface data. Opening an example is one undoable transaction.</p><div class="example-grid">${items.map(([id,title,sub,tag],i)=>`<button class="example-card" data-action="example" data-example="${id}"><span class="example-art"><svg viewBox="0 0 180 68" fill="none"><path d="M12 10 145 34 12 58M12 20 145 34 12 48M5 34h165" stroke="#71c7a7"/><path d="${i===3?'M95 5q-27 29 0 58':'M65 6q-19 28 0 56q19-28 0-56zM90 6q12 28 0 56q-8-28 0-56z'}" fill="#679bb428" stroke="#98c5d1"/></svg></span><strong>${title}</strong><small>${sub}</small><span class="example-tag">${tag}</span></button>`).join('')}</div>`);}
function glasses(name=selected().glass){const catalog=glassCatalog(model().customGlasses);if(!catalog[name])name='N-BK7';const g=catalog[name],refUm=Math.max(g.min??.2,Math.min(g.max??5,model().wavelengths[model().primary].um));openDialog('Optical glass catalog',`<p>Nominal dispersion at catalog reference conditions. AIR is exactly 1; coatings, thermal shifts, pressure correction, and absorption are not modeled.</p><div class="form-grid"><div class="form-group"><label>Material</label><select id="glass-picker">${Object.keys(catalog).map(k=>`<option ${k===name?'selected':''}>${esc(k)}</option>`).join('')}</select></div><div class="form-group"><label>Selected surface</label><span class="pill">${esc(selected().label)}</span></div></div>${infoRows([['Model',g.model],[`n at ${fmt(refUm*1000,4)} nm`,fmt(refractiveIndex(g,refUm),8)],['Wavelength interval',`${g.min??.2} – ${g.max??5} µm`],['Abbe number Vd',g.vd??'—']])}<canvas class="plot-large" id="dispersion-plot"></canvas><pre>${esc(JSON.stringify(g,null,2))}</pre><div class="inline-actions">${button('custom-glass','+ Custom Sellmeier / Cauchy material')}</div>`,[{label:'Assign to selected surface',primary:true,disabled:selected().mode!=='refract',run:()=>{edit(m=>m.surfaces.find(s=>s.id===state.selected).glass=name,'Assign material');closeDialog();}}]);$('glass-picker').onchange=e=>glasses(e.target.value);requestAnimationFrame(()=>{let lo=Math.max(g.min??.2,.4),hi=Math.min(g.max??5,1);if(hi<=lo){lo=g.min??.2;hi=g.max??5;}lineChart($('dispersion-plot'),[{points:Array.from({length:100},(_,i)=>{const um=lo+(hi-lo)*i/99;let n=NaN;try{n=refractiveIndex(g,um);}catch{}return{x:um*1000,y:n};})}],{xlabel:'Wavelength / nm',ylabel:'Refractive index'});});}
function customGlass(){openDialog('Custom dispersion material',`<div class="form-grid">${input('cg-name','Unique material name','CUSTOM-1')}<div class="form-group"><label>Dispersion model</label><select id="cg-model"><option value="cauchy">Cauchy · A + B/λ² + C/λ⁴</option><option value="sellmeier">Sellmeier · three terms</option><option value="constant">Constant refractive index</option></select></div>${input('cg-min','Minimum wavelength · µm',.4)}${input('cg-max','Maximum wavelength · µm',1)}<div class="form-group full"><label>Coefficients · JSON · λ in µm</label><textarea id="cg-coefficients" rows="5">{"A": 1.5, "B": 0.004, "C": 0}</textarea></div></div><div class="note">Custom materials are persisted inside the project. Importing a project never executes code. Dispersion poles and nonphysical indices at configured wavelengths are rejected.</div>`,[{label:'Add material',primary:true,run:()=>{const g={name:$('cg-name').value,model:$('cg-model').value,min:read('cg-min'),max:read('cg-max'),...JSON.parse($('cg-coefficients').value)};validateGlass(g);edit(m=>m.customGlasses.push(g),'Add custom glass');glasses(g.name);}}]);$('cg-model').onchange=e=>{$('cg-coefficients').value=JSON.stringify(e.target.value==='cauchy'?{A:1.5,B:.004,C:0}:e.target.value==='constant'?{n:1.5}:{B:[1.03961212,.231792344,1.01046945],C:[.00600069867,.0200179144,103.560653]},null,2);};}
function engine(){const info=state.gpu?.adapter?.info;openDialog('Rendering & numerical engines',`<div class="note">WebGPU batches the 3D layout and traces pupil rays in WGSL. The independent Float64 worker provides stop aiming, reference calculations, optical-path analysis, optimization, and validation. Failed GPU spot checks automatically select Float64.</div>${infoRows([['GPU adapter',info?.description||info?.device||state.gpu?.reason||'Unavailable'],['Graphics',state.renderer?.device?'WebGPU · MSAA ×4':'Canvas compatibility renderer'],['Compute pipeline',state.tracer&&!state.tracer.lost?'WebGPU WGSL · f32':worker.fallback?'Float64 · main-thread fallback':'Float64 CPU worker'],['Current analysis',state.result?.backend||'Pending'],['Last sampled audit',state.audit?`${state.audit.tested} rays · ${state.audit.passed?'pass':'fallback'}`:'Not run'],['Max audited image error',state.audit?`${fmt(state.audit.maxPosition*1000,4)} µm`:'—'],['Audited status mismatches',state.audit?.mismatches??'—']])}<h3>Analysis precision</h3><select id="engine-precision"><option value="auto" ${state.precision==='auto'?'selected':''}>Automatic · checked WebGPU, Float64 fallback</option><option value="cpu" ${state.precision==='cpu'?'selected':''}>Float64 reference · CPU worker</option></select><div class="note warning">GPU checks sample about 64 rays, not every ray. The image-position gate is 2 µm and is not an optical certification. Float32 is inappropriate for high-accuracy wavefront differences; the Wavefront tab always recomputes in Float64. All timing includes real execution, not an estimated frame rate.</div><div id="gpu-tests"></div>`,[{label:'Check all example systems',disabled:!state.tracer||state.tracer.lost,run:gpuChecks},{label:'Apply precision',primary:true,run:()=>{state.precision=$('engine-precision').value;try{localStorage.setItem('aether-precision',state.precision);}catch{}closeDialog();scheduleCompute();}}]);}
async function gpuChecks(){const rows=[];for(const name of ['achromat','singlet','asphere','mirror']){const m=createExample(name),p=await worker.run('prepare',{model:m,options:{samples:512}}),raw=await state.tracer.trace(p),audit=await worker.run('audit',{prepared:p,raw});rows.push({name,...audit});if($('gpu-tests'))$('gpu-tests').innerHTML=infoRows(rows.map(r=>[r.name,`${r.passed?'PASS':'FALLBACK'} · Δ ${fmt(r.maxPosition*1000,4)} µm · ${r.mismatches} flags`]));}state.gpuChecks=rows;return rows;}
function optimization(){const m=model(),v=m.optimization.variables,ops=m.optimization.operands;openDialog('Merit function & bounded optimization',`<p>Scaled Levenberg–Marquardt uses an explicit finite-difference Jacobian and deterministic Float64 traces. Candidates respect bounds and retain penalties for failed rays and intersecting glass caps. The result is reviewed before application.</p><h3>Variables</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Surface / parameter</th><th>Minimum</th><th>Maximum</th><th>Scale</th><th></th></tr></thead><tbody>${v.map((x,i)=>`<tr><td>${esc(m.surfaces.find(s=>s.id===x.id).label)}<br><b>${x.param}</b></td><td><input id="vmin-${i}" value="${val(x.min)}"></td><td><input id="vmax-${i}" value="${val(x.max)}"></td><td><input id="vscale-${i}" value="${val(x.scale)}"></td><td>${button('remove-variable','×',`data-index="${i}"`)}</td></tr>`).join('')||'<tr><td colspan="5">No variables. Click V beside a lens-editor value.</td></tr>'}</tbody></table></div><div class="inline-actions">${button('add-focus-variable','+ Image distance')}${button('add-radius-variable','+ Selected radius')}${button('add-asphere-variable','+ Selected A4')}</div><h3>Merit operands</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Operand</th><th>Target · mm</th><th>Tolerance · mm</th><th>Weight</th><th></th></tr></thead><tbody>${ops.map((o,i)=>`<tr><td><select id="otype-${i}">${['RMS','EFL','BFL','TRACK'].map(k=>`<option ${o.type===k?'selected':''}>${k}</option>`).join('')}</select></td><td><input id="otarget-${i}" value="${o.target}"></td><td><input id="otol-${i}" value="${o.tolerance}"></td><td><input id="oweight-${i}" value="${o.weight}"></td><td>${button('remove-operand','×',`data-index="${i}"`)}</td></tr>`).join('')}</tbody></table></div><div class="inline-actions">${button('add-operand','+ Operand')}<small>RMS = weighted polychromatic radius; TRACK = unfolded axial length.</small></div><div class="form-grid">${input('opt-iterations','Maximum iterations',m.optimization.iterations)}<div class="form-group"><label>Fixed optimization quadrature</label><span class="pill">48 pupil samples / wavelength / field</span></div></div><div class="note">RMS target 0 creates x/y ray residuals after centroid removal. Tolerances nondimensionalize operands. This is a local optimizer; inspect the full-density analysis after applying any result.</div>`,[{label:'Save setup',run:()=>{saveOptimizationSetup();closeDialog();}},{label:'Run optimization',primary:true,run:runOptimization}]);}
function saveOptimizationSetup(){edit(m=>{m.optimization.iterations=read('opt-iterations');m.optimization.variables.forEach((v,i)=>{v.min=read(`vmin-${i}`,dimension(v.param));v.max=read(`vmax-${i}`,dimension(v.param));v.scale=read(`vscale-${i}`,dimension(v.param));});m.optimization.operands.forEach((o,i)=>{o.type=$(`otype-${i}`).value;o.target=read(`otarget-${i}`,'length');o.tolerance=read(`otol-${i}`,'length');o.weight=read(`oweight-${i}`);});},'Optimization setup');}
async function runOptimization(){saveOptimizationSetup();const base=clone(model()),revision=state.history.revision,points=[];openDialog('Optimizing optical prescription',`<div class="progress-line"><span class="spinner"></span><span id="opt-progress">Assembling finite-difference Jacobian…</span></div><canvas class="plot-large" id="opt-plot"></canvas><div class="log-box" id="opt-log"></div>`,[{label:'Cancel calculation',run:()=>worker.cancel(state.activeJob)}]);const dialogEpoch=state.dialogEpoch;const job=worker.run('optimize',{model:base},p=>{points.push(p);if($('opt-progress')){$('opt-progress').textContent=`Iteration ${p.iteration} · merit ${p.merit.toPrecision(7)} · ${p.accepted?'accepted':'rejected'} step`;$('opt-log').textContent=points.map(x=>`${x.iteration.toString().padStart(3)}   M=${x.merit.toExponential(5)}   λ=${x.lambda.toExponential(2)}   ${x.accepted?'ACCEPT':'REJECT'}`).slice(-14).join('\n');lineChart($('opt-plot'),[{points:points.map(x=>({x:x.iteration,y:x.merit}))}],{xlabel:'Iteration',ylabel:'Merit · sum of squared residuals',log:true});}});state.activeJob=job.jobId;let result;try{result=await job;}finally{state.activeJob=null;}state.optimization={...result,revision};if(!$('dialog').open||state.dialogEpoch!==dialogEpoch)return;openDialog('Optimization result',`<div class="summary-grid"><div class="summary-tile"><span>INITIAL MERIT</span><strong>${result.initial.toPrecision(6)}</strong></div><div class="summary-tile"><span>FINAL MERIT</span><strong>${result.final.toPrecision(6)}</strong></div><div class="summary-tile"><span>ACCEPTED STEPS</span><strong>${result.accepted}</strong></div></div><div class="result-highlight">${esc(result.reason)} · ${result.evaluations} evaluations · ${fmt((1-result.final/result.initial)*100,2)}% merit reduction</div><canvas class="plot-large" id="opt-result-plot"></canvas>${infoRows(base.optimization.variables.map(v=>{const a=base.surfaces.find(s=>s.id===v.id),b=result.model.surfaces.find(s=>s.id===v.id);return[`${a.label} / ${v.param}`,`${val(a[v.param])} → ${val(b[v.param])}`];}))}<div class="note">The working prescription has not changed. Applying the candidate creates one undoable edit; a subsequent dense ray trace checks its actual displayed performance.</div>`,[{label:'Export convergence CSV',run:()=>downloadFile('aether-convergence.csv',csv([['iteration','merit','damping','gradient','accepted','evaluations'],...result.history.map(p=>[p.iteration,p.merit,p.lambda,p.gradient,p.accepted,p.evaluations])]),'text/csv')},{label:'Apply candidate',primary:true,run:()=>{if(state.history.revision!==revision)throw new Error('Prescription changed during optimization. Run again before applying.');commit(result.model,'Apply optimized prescription');closeDialog();}}]);requestAnimationFrame(()=>lineChart($('opt-result-plot'),[{points:[{x:0,y:result.initial},...result.history.map(p=>({x:p.iteration,y:p.merit}))]}],{xlabel:'Iteration',ylabel:'Merit',log:true}));}
function sweepDialog(){const s=selected().mode==='image'?model().surfaces.at(-2):selected(),param=s.radius?'radius':'thickness';openDialog('Parameter sweep',`<p>Every point is independently traced in Float64 using 128 pupil samples per field and wavelength. Failed prescriptions remain explicit rows, never interpolated as valid data.</p><div class="form-grid"><div class="form-group"><label>Surface</label><select id="sw-surface">${model().surfaces.filter(s=>s.mode!=='image').map(x=>`<option value="${esc(x.id)}" ${x.id===s.id?'selected':''}>${esc(x.label)}</option>`).join('')}</select></div><div class="form-group"><label>Parameter</label><select id="sw-param">${['radius','thickness','conic','a4','a6','a8','a10'].map(p=>`<option ${p===param?'selected':''}>${p}</option>`).join('')}</select></div>${input('sw-start','Start',val(s[param]*.85))}${input('sw-end','End',val(s[param]*1.15))}${input('sw-steps','Sample count · 2–201',21)}<label class="checkbox-row"><input id="sw-focus" type="checkbox">Refocus image plane at every point</label></div><div class="note">Conic and polynomial sweeps require an even-asphere surface. Refocusing is disallowed when sweeping image distance itself. Best-point selection only includes completely transmitted bundles.</div>`,[{label:'Run sweep',primary:true,run:runSweep}]);const reset=()=>{const p=$('sw-param').value,x=model().surfaces.find(s=>s.id===$('sw-surface').value),v=defaultVariable(x,p);$('sw-start').value=val(x[p]-(v.max-v.min)*.1);$('sw-end').value=val(x[p]+(v.max-v.min)*.1);};$('sw-surface').onchange=reset;$('sw-param').onchange=reset;}
async function runSweep(){const base=clone(model()),revision=state.history.revision,options={id:$('sw-surface').value,param:$('sw-param').value,start:read('sw-start',dimension($('sw-param').value)),end:read('sw-end',dimension($('sw-param').value)),steps:read('sw-steps'),refocus:$('sw-focus').checked},s=base.surfaces.find(s=>s.id===options.id);if(['conic','a4','a6','a8','a10'].includes(options.param)&&s.type!=='asphere')throw new Error('Select an even-asphere surface for this parameter.');if(options.refocus&&options.param==='thickness'&&options.id===base.surfaces.at(-2).id)throw new Error('Refocus would cancel this image-distance sweep.');const points=[];openDialog('Calculating parameter sweep',`<div class="progress-line"><span class="spinner"></span><span id="sw-progress">Tracing…</span></div><canvas class="plot-large" id="sw-plot"></canvas>`,[{label:'Cancel calculation',run:()=>worker.cancel(state.activeJob)}]);const dialogEpoch=state.dialogEpoch;const job=worker.run('sweep',{model:base,options},p=>{points.push(p.row);if($('sw-progress')){$('sw-progress').textContent=`Point ${p.step} / ${p.total} · ${options.param} = ${val(p.row.value)}`;lineChart($('sw-plot'),[{points:points.map(x=>({x:x.value,y:x.rms===null?NaN:x.rms*1000}))}],{xlabel:options.param,ylabel:'Polychromatic RMS / µm'});}});state.activeJob=job.jobId;let result;try{result=await job;}finally{state.activeJob=null;}state.sweep={...result,revision};if(!$('dialog').open||state.dialogEpoch!==dialogEpoch)return;const best=result.rows.filter(x=>Number.isFinite(x.rms)&&x.throughput===1).sort((a,b)=>a.rms-b.rms)[0];openDialog('Parameter sweep results',`${best?`<div class="result-highlight">Best unvignetted sample: ${options.param} = ${val(best.value)} · RMS ${fmt(best.rms*1000,3)} µm</div>`:'<div class="note warning">No completely transmitted candidate. Inspect aperture failures.</div>'}<canvas class="plot-large" id="sw-result-plot"></canvas><h3>${result.rows.length} calculated points</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(options.param)}</th><th>RMS · µm</th><th>EFL · mm</th><th>Transmission</th><th>Status</th></tr></thead><tbody>${result.rows.map(r=>`<tr><td class="num">${val(r.value)}</td><td class="num">${r.rms===null?'—':fmt(microns(r.rms),4)}</td><td class="num">${fmt(r.efl,4)}</td><td class="num">${fmt(r.throughput*100,1)}%</td><td>${esc(r.error||'Calculated')}</td></tr>`).join('')}</tbody></table></div>`,[{label:'Export sweep CSV',run:()=>downloadFile('aether-sweep.csv',csv([['parameter_value','rms_mm','efl_mm','bfl_mm','transmission','image_gap_mm','error'],...result.rows.map(r=>[r.value,r.rms,r.efl,r.bfl,r.throughput,r.focus,r.error])]),'text/csv')},{label:'Apply best sample',primary:true,disabled:!best,run:()=>{if(state.history.revision!==revision)throw new Error('Prescription changed during sweep. Run again before applying.');const n=clone(base);n.surfaces.find(s=>s.id===options.id)[options.param]=best.value;if(options.refocus)n.surfaces.at(-2).thickness=best.focus;commit(n,'Apply parameter-sweep sample');closeDialog();}}]);requestAnimationFrame(()=>lineChart($('sw-result-plot'),[{points:result.rows.map(r=>({x:r.value,y:r.rms===null?NaN:microns(r.rms)}))}],{xlabel:options.param,ylabel:'Polychromatic RMS / µm'}));}
async function benchmarks(){openDialog('Reproducible optical benchmarks','<p>Analytical identities, reference glass data, numerical tolerances, and engine regression checks. These are not a comparison against proprietary optical software.</p><div id="bench-progress" class="progress-line">Running Float64 tests…</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Benchmark</th><th>Result</th><th>Actual</th></tr></thead><tbody id="bench-rows"></tbody></table></div>');const rows=[],r=await worker.run('benchmarks',{},row=>{rows.push(row);if($('bench-rows'))$('bench-rows').innerHTML=rows.map(x=>`<tr><td>${esc(x.name)}</td><td class="${x.passed?'passed':'failed'}">${x.passed?'PASS':'FAIL'}</td><td class="num">${esc(x.error??(typeof x.actual==='number'?x.actual.toPrecision(8):x.actual))}</td></tr>`).join('');});state.benchmarks=r;if($('bench-progress')){$('bench-progress').textContent=`${r.passed} / ${r.total} passed · ${fmt(r.ms,1)} ms · CPU Float64`;$('dialog-actions').insertAdjacentHTML('afterbegin',button('export-benchmarks','Export test report'));}return r;}
async function probe(fi,wi,u,v){requireResult();const m=clone(model()),r=await worker.run('probe',{model:m,fi,wi,u,v});openDialog(`Ray probe · F${fi+1} · ${fmt(m.wavelengths[wi].um*1000,2)} nm`,`${infoRows([['Normalized stop coordinate',`${fmt(u,6)}, ${fmt(v,6)}`],['Status',STATUS_NAMES[r.status]],['Image position',r.p.map(x=>fmt(x,8)).join(', ')+' mm'],['Eikonal at final point',fmt(r.opl,9)+' mm'],['Calculation',worker.fallback?'Float64 main-thread retrace':'Float64 worker retrace']])}<h3>Surface-by-surface optical path</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Surface</th><th>X · mm</th><th>Y · mm</th><th>Z · mm</th><th>Eikonal · mm</th><th>n after</th></tr></thead><tbody>${(r.path||[]).map(p=>`<tr><td>${p.surface<0?'Launch plane':esc(m.surfaces[p.surface].label)}</td>${p.p.map(x=>`<td class="num">${fmt(x,7)}</td>`).join('')}<td class="num">${fmt(p.opl,8)}</td><td class="num">${fmt(p.n2,7)}</td></tr>`).join('')}</tbody></table></div><div class="note">Eikonal includes the incident plane-wave phase offset, so off-axis rays share the correct input wavefront. Differences between consecutive rows are physical n·distance. Coordinates follow global Z, including reflection.</div>`,[{label:'Export ray path CSV',run:()=>downloadFile('aether-ray-path.csv',csv([['surface','x_mm','y_mm','z_mm','eikonal_mm','n_after'],...(r.path||[]).map(p=>[p.surface,...p.p,p.opl,p.n2])]),'text/csv')}]);}
function summary(){const r=requireResult();return {application:'Aether Optics',version:1,name:r.model.name,timestamp:r.timestamp,backend:r.backend,units:{length:'mm',wavelength:'µm',field:'deg',opd:'mm'},paraxial:r.paraxial,rms:r.rms,valid:r.valid,total:r.total,counts:r.counts,maxResidual:r.maxResidual,traceMs:r.traceMs,prepareMs:r.prepareMs,fields:r.fields.map(f=>({field:f.field,rms:f.rms,geometric:f.geometric,centroid:f.centroid,valid:f.valid,total:f.total,monochromatic:f.monochromatic,wavefront:f.wavefront})),gpuAudit:state.audit};}
function exportRays(){const r=requireResult();const rows=[['kind','field','wavelength_um','pupil_u','pupil_v','status','x_mm','y_mm','z_mm','eikonal_mm','dx','dy','dz','backend']];for(let i=0;i<r.tags.length;i++){const t=r.tags[i],o=i*STRIDE;rows.push([t.kind,t.fi+1,r.model.wavelengths[t.wi].um,t.u,t.v,STATUS_NAMES[Math.round(r.raw[o+7])],...r.raw.slice(o,o+7),r.backend]);}downloadFile('aether-ray-data.csv',csv(rows),'text/csv');}
function report(){const r=requireResult();openDialog('Optical analysis report',`${infoRows([['Design',r.model.name],['Calculation',r.backend],['Effective focal length',`${fmt(r.paraxial.efl,8)} mm`],['Back focal length',`${fmt(r.paraxial.bfl,8)} mm`],['Entrance pupil diameter',`${fmt(r.paraxial.epd,7)} mm`],['F-number',fmt(r.paraxial.fNumber,5)],['Unfolded axial track',`${fmt(r.paraxial.track,6)} mm`],['Weighted polychromatic RMS',`${fmt(microns(r.rms),6)} µm`],['Geometric transmission',`${r.valid} / ${r.total}`],['Maximum stored intersection residual',`${r.maxResidual.toExponential(3)} mm`],['Trace dispatch + readback / CPU trace',`${fmt(r.traceMs,2)} ms`]])}<h3>Ray outcomes</h3>${infoRows(r.counts.map((n,i)=>[STATUS_NAMES[i],num(n)]))}<div class="note">Spot radii are geometric, wavelength-weighted, and measured from each field’s common polychromatic centroid. No diffraction PSF, MTF, polarization, coating loss, or Fresnel transmission is implied. RMS may improve artificially under vignetting; always inspect transmission.</div><div class="inline-actions">${button('probe-chief','Probe field 1 stop-center ray')}</div>`,[{label:'Export summary JSON',run:()=>downloadFile('aether-analysis.json',JSON.stringify(summary(),null,2))},{label:'Export all ray data',primary:true,run:exportRays}]);}
function exportsDialog(){openDialog('Export computed data',`<p>Exports contain the actual prescription or computed result. Analysis exports identify their numerical backend and units.</p><div class="example-grid">${[['save','Project JSON','Complete editable prescription, wavelengths, fields, custom glass, and optimization setup.'],['export-rays','Ray data CSV','Every sampled spot, fan, and chief ray with status, coordinates, direction and optical path.'],['export-summary','Analysis JSON','Focal properties, spot sizes, wavelength-specific data, and precision diagnostics.'],['export-svg','Layout SVG','Vector export of the current 2D or 3D projected geometry and traced rays.'],['export-prescription','Lens prescription CSV','Surface radii, signed separations, media, apertures and aspheric coefficients.']].map(([a,n,d])=>`<button class="example-card" data-action="${a}"><strong>${n}</strong><small>${d}</small></button>`).join('')}</div><div class="note">For optical-path exports, select the Wavefront tab or choose Float64 in Engine settings before exporting. The full source distribution also includes four example projects and a numerical test suite.</div>`);}
function diagnostics(){openDialog('Model diagnostics',`<h3>Prescription checks</h3>${state.warnings.length?state.warnings.map(w=>`<div class="note warning">${esc(w)}</div>`).join(''):'<div class="result-highlight">All configured materials, real conic caps, aperture dimensions, signed propagation gaps, and optimization bounds are valid.</div>'}<div class="note">Glass-cap clearance is sampled along radius and is not a certified manufacturing or mechanical collision analysis. General polynomial intersections use safeguarded Newton iterations and a finite bracketing fallback.</div><h3>Session log</h3><div class="log-box">${state.logs.map(x=>`${esc(x.at.slice(11,19))} [${esc(x.kind)}] ${esc(x.message)}`).join('<br>')||'No errors reported.'}</div>`,[{label:'Recover previous autosave',run:async()=>{const previous=await store.recovery();if(!previous)throw new Error('No previous autosave is available.');commit(previous,'Restore previous autosave');closeDialog();}},{label:'Run optical tests',primary:true,run:benchmarks}]);}
function help(){openDialog('Workbench guide',`<h3>Design workflow</h3><p>Edit the Lens Data Editor directly; units such as <code>5 cm</code> and <code>250 µm</code> are accepted. Select a surface to open its detailed aperture and asphere properties. Glass refers to the medium after a refracting surface. Radius 0 or ∞ denotes a plane.</p><p>Use System Setup for angular fields, wavelengths, the physical aperture stop, and custom dispersion. Quick focus minimizes weighted geometric variance by shifting the image plane. All changes, including optimizer and sweep results, are undoable.</p><h3>Analyze and optimize</h3><p>Spot diagrams are centroid referenced. Click an individual point for a Float64 surface-by-surface probe. Ray fans reference the primary-wavelength chief ray. Reference chief rays ignore aperture clipping so an obscured stop center still defines the reference sphere; they are excluded from transmission counts. Wavefront uses a chief-centered reference sphere and automatically selects Float64. Click V beside radius, thickness or conic to optimize that parameter; edit bounds and weighted RMS/EFL/BFL/TRACK targets in Merit Function.</p><h3>Navigation & keyboard</h3>${infoRows([['Ctrl / ⌘ S','Export project'],['Ctrl / ⌘ O','Open project'],['Ctrl / ⌘ Z · Shift Z','Undo · redo'],['Ctrl / ⌘ Enter','Trace rays'],['Ctrl / ⌘ Shift F','Quick focus'],['F · 2 · 3','Fit · 2D · 3D'],['Drag in 2D','Pan'],['Drag in 3D · Shift drag','Orbit · pan'],['Wheel / double click','Zoom / fit']])}<h3>Supported model and boundaries</h3><p>Rotationally symmetric sequential spheres, conics and even aspheres through A10; ideal mirrors; circular, annular and rectangular clipping; homogeneous isotropic media; infinite object; planar detector; signed axial distances after reflection. Up to 64 surfaces, 8 wavelengths and 9 fields.</p><div class="note warning">This is an independent optical-design implementation, not OpticStudio and not a validated drop-in replacement. It does not implement ZMX/ZOS import, non-sequential scattering, tilted/decentered coordinate breaks, freeform surfaces, polarization, coatings, diffraction PSF/MTF, mechanical tolerancing, thermal or pressure modeling. Its numerical test coverage and source are included; verify engineering designs independently.</div><h3>Persistence and privacy</h3><p>Models autosave in IndexedDB with one recovery generation. Export a project JSON for portable backup. Computation is local: no account, server-side optics, telemetry, CDN, or runtime dependency is required.</p>`);}
async function handleAction(action,target={dataset:{}}){const d=target.dataset||{};if(state.dialogActions.has(action))return state.dialogActions.get(action)();
  switch(action){
    case 'undo':if(state.history.undo())changed();break;case 'redo':if(state.history.redo())changed();break;
    case 'save':downloadFile(`${model().name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.aether.json`,JSON.stringify(model(),null,2));break;
    case 'open':$('file-input').click();break;case 'file':case 'examples':examples();break;
    case 'example':{let m=createExample(d.example);if(d.example!=='mirror')m=bestFocus(m).model;commit(m,'Open example');state.selected=model().surfaces[Math.min(1,model().surfaces.length-1)].id;renderDocument();state.renderer?.fit();closeDialog();break;}
    case 'properties':properties();break;case 'surface-properties':surfaceProperties();break;case 'wavelengths':wavelengths();break;case 'fields':fields();break;
    case 'add-wavelength':{const draft=readWavelengths();draft.push({um:.55,weight:1});wavelengths(draft);break;}case 'remove-wavelength':{const draft=readWavelengths();draft.splice(Number(d.index),1);wavelengths(draft);break;}
    case 'add-field':{const draft=readFields();draft.push({x:0,y:1,weight:1});fields(draft);break;}case 'remove-field':{const draft=readFields();draft.splice(Number(d.index),1);fields(draft);break;}
    case 'glass':glasses();break;case 'custom-glass':customGlass();break;
    case 'insert':edit(m=>{const i=Math.min(m.surfaces.findIndex(s=>s.id===state.selected),m.surfaces.length-2),prev=m.surfaces[i],gap=prev.thickness;prev.thickness=gap/2;const n=surface({label:'Inserted surface',thickness:gap/2,glass:m.surfaces.slice(0,i+1).filter(s=>s.mode==='refract').at(-1)?.glass||'AIR',semi:prev.semi,semiY:prev.semiY,aperture:prev.aperture,inner:prev.inner});m.surfaces.splice(i+1,0,n);state.selected=n.id;},'Insert optical surface');break;
    case 'add-lens':edit(m=>{const before=m.surfaces.at(-2),sign=Math.sign(before.thickness)||1,id=makeId();m.surfaces.splice(-1,0,surface({id,label:'New crown front',radius:60*sign,thickness:5*sign,glass:'N-BK7'}),surface({label:'New crown rear',radius:-60*sign,thickness:55*sign,glass:'AIR'}));state.selected=id;},'Add biconvex lens');break;
    case 'duplicate':if(selected().mode==='image')throw new Error('The image plane cannot be duplicated.');edit(m=>{const i=m.surfaces.findIndex(s=>s.id===state.selected),s=clone(m.surfaces[i]);s.id=makeId();s.label+=' copy';m.surfaces.splice(i+1,0,s);state.selected=s.id;normalizeDirections(m);},'Duplicate surface');break;
    case 'delete':{const id=state.selected;if(selected().mode==='image'||model().surfaces.length<=2)throw new Error('Keep at least one optical surface and the image plane.');edit(m=>{const i=m.surfaces.findIndex(s=>s.id===id);if(i>0)m.surfaces[i-1].thickness+=m.surfaces[i].thickness;m.surfaces.splice(i,1);m.optimization.variables=m.optimization.variables.filter(v=>v.id!==id);if(m.stopId===id)m.stopId=m.surfaces[0].id;state.selected=m.surfaces[Math.max(0,i-1)].id;normalizeDirections(m);},'Delete surface');break;}
    case 'asphere':if(selected().mode==='image')throw new Error('The detector remains planar.');edit(m=>m.surfaces.find(s=>s.id===state.selected).type='asphere','Convert to even asphere');surfaceProperties();break;
    case 'mirror':if(selected().mode==='image')throw new Error('Select an optical surface, not the detector.');edit(m=>{const s=m.surfaces.find(s=>s.id===state.selected);s.mode=s.mode==='mirror'?'refract':'mirror';normalizeDirections(m);},'Toggle ideal mirror');break;
    case 'stop':case 'set-stop':if(selected().mode==='image')throw new Error('The image plane cannot be the stop.');edit(m=>m.stopId=state.selected,'Set aperture stop');break;
    case 'variable':toggleVariable(d.id,d.param);break;
    case 'trace':scheduleCompute();break;
    case 'focus':{const revision=state.history.revision;status('Computing least-squares image plane…',true);const result=await worker.run('focus',{model:clone(model())});if(state.history.revision!==revision)throw new Error('Prescription changed during focus calculation.');commit(result.model,'Quick focus');toast(`Image plane shifted ${fmt(result.delta,5)} mm · ${num(result.samples)} reference rays`);break;}
    case '2d':case '3d':state.mode=action;document.querySelectorAll('#view-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.action===action));$('layout-help').textContent=action==='2d'?'Drag to pan · Scroll to zoom · F to fit':'Drag to orbit · Shift-drag to pan · Scroll to zoom';updateScene();break;
    case 'fit':state.renderer?.fit();break;
    case 'toggle-rays':state.showRays=!state.showRays;$('rays-toggle').classList.toggle('active',state.showRays);updateScene();break;
    case 'toggle-grid':state.showGrid=!state.showGrid;$('grid-toggle').classList.toggle('active',state.showGrid);updateScene();break;
    case 'analysis-spot':case 'analysis-fans':case 'analysis-opd':{const previous=state.analysis;state.analysis=action.slice(9);renderAnalysis();if(previous==='opd'||state.analysis==='opd')scheduleCompute();break;}
    case 'analysis-settings':case 'engine':engine();break;
    case 'optimization':optimization();break;
    case 'remove-variable':saveOptimizationSetup();edit(m=>m.optimization.variables.splice(Number(d.index),1),'Remove variable');optimization();break;
    case 'add-focus-variable':case 'add-radius-variable':case 'add-asphere-variable':{saveOptimizationSetup();const param=action==='add-focus-variable'?'thickness':action==='add-radius-variable'?'radius':'a4',s=action==='add-focus-variable'?model().surfaces.at(-2):selected();if(s.mode==='image')throw new Error('Select an optical surface first.');if(param==='radius'&&!s.radius)throw new Error('Give the selected surface a finite radius first.');if(param==='a4'&&s.type!=='asphere')throw new Error('Convert the selected surface to an even asphere first.');if(!model().optimization.variables.some(v=>v.id===s.id&&v.param===param))toggleVariable(s.id,param);optimization();break;}
    case 'add-operand':saveOptimizationSetup();edit(m=>m.optimization.operands.push({type:'EFL',target:100,tolerance:1,weight:1}),'Add merit operand');optimization();break;
    case 'remove-operand':saveOptimizationSetup();edit(m=>m.optimization.operands.splice(Number(d.index),1),'Remove merit operand');optimization();break;
    case 'sweep':sweepDialog();break;case 'benchmarks':return benchmarks();
    case 'export-benchmarks':downloadFile('aether-benchmarks.json',JSON.stringify(state.benchmarks,null,2));break;
    case 'report':report();break;case 'probe-chief':return probe(0,model().primary,0,0);
    case 'export':exportsDialog();break;case 'export-rays':exportRays();break;
    case 'export-summary':downloadFile('aether-analysis.json',JSON.stringify(summary(),null,2));break;
    case 'export-svg':downloadFile('aether-layout.svg',state.renderer.exportSVG(),'image/svg+xml');break;
    case 'export-prescription':{const keys=['id','label','type','mode','radius','thickness','glass','semi','semiY','aperture','inner','conic','a4','a6','a8','a10'];downloadFile('aether-prescription.csv',csv([keys,...model().surfaces.map(s=>keys.map(k=>s[k]))]),'text/csv');break;}
    case 'diagnostics':diagnostics();break;case 'help':help();break;
    case 'about':openDialog('Independent optical design workbench','<div class="about-logo">AETHER <small>OPTICS</small></div><p>Version 1.0 · Plain JavaScript · Sequential geometrical optics</p><p>A local-first optical workbench with a Float64 reference kernel, checked WGSL ray tracing, batched WebGPU layouts, reproducible tests, and an editable semantic prescription.</p><div class="note">Original independent implementation. Not affiliated with, endorsed by, or an exact replacement for Ansys Zemax OpticStudio. No proprietary code or assets are included. Source code is distributed under the MIT license.</div>',[{label:'Read workbench guide',primary:true,run:help}]);break;
    case 'close':closeDialog();break;default:throw new Error(`Action not implemented: ${action}`);
  }
}
function bindEvents(){document.addEventListener('click',async e=>{const tab=e.target.closest('[data-tab]');if(tab){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===tab));document.querySelectorAll('[data-ribbon]').forEach(g=>g.hidden=!g.dataset.ribbon.split(' ').includes(tab.dataset.tab));return;}const sel=e.target.closest('[data-select]');if(sel){state.selected=sel.dataset.select;renderTree();renderTable();renderInspector();updateScene();return;}const analysis=e.target.closest('[data-analysis]');if(analysis){await handleAction(`analysis-${analysis.dataset.analysis}`);return;}const action=e.target.closest('[data-action]');if(action&&!action.disabled){e.preventDefault();try{await handleAction(action.dataset.action,action);}catch(error){toast(error.message,true);status(error.message,false,true);}}});
  document.addEventListener('focusin',e=>{const id=e.target.dataset?.id;if(id&&id!==state.selected){state.selected=id;renderTree();renderInspector();document.querySelectorAll('[data-row]').forEach(r=>r.classList.toggle('selected',r.dataset.row===id));updateScene();}});
  document.addEventListener('change',e=>{const {id,param}=e.target.dataset||{};if(!id||!param)return;try{edit(m=>{const s=m.surfaces.find(x=>x.id===id);if(['label','glass','type'].includes(param))s[param]=e.target.value;else s[param]=parseQuantity(e.target.value,dimension(param));if(param==='semi'&&s.aperture==='circle')s.semiY=s.semi;if(param==='type'&&s.type==='standard'){for(const p of ['conic','a4','a6','a8','a10'])s[p]=0;m.optimization.variables=m.optimization.variables.filter(v=>v.id!==id||!['conic','a4','a6','a8','a10'].includes(v.param));}},`Edit ${param}`);}catch(error){toast(error.message,true);renderTable();renderInspector();}});
  $('sampling').onchange=()=>{try{edit(m=>m.samples=Number($('sampling').value),'Pupil sampling');}catch(e){toast(e.message,true);$('sampling').value=model().samples;}};
  $('layout-field').onchange=()=>{state.field=Number($('layout-field').value);updateScene();};$('layout-wave').onchange=()=>{state.wave=Number($('layout-wave').value);updateScene();renderAnalysis();};
  $('dialog-close').onclick=closeDialog;$('dialog').addEventListener('cancel',()=>{state.dialogEpoch++;if(state.activeJob)worker.cancel(state.activeJob);state.activeJob=null;});
  $('file-input').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024)throw new Error('Project exceeds the 5 MB import limit.');const next=JSON.parse(await file.text());assertModel(next);commit(next,'Import project');toast('Project imported and validated.');closeDialog();}catch(error){toast(error.message,true);}finally{e.target.value='';}};
  document.addEventListener('keydown',async e=>{const typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName),mod=e.metaKey||e.ctrlKey;let a=null;if(mod&&e.key.toLowerCase()==='s')a='save';else if(mod&&e.key.toLowerCase()==='o')a='open';else if(mod&&e.key==='Enter')a='trace';else if(mod&&e.shiftKey&&e.key.toLowerCase()==='f')a='focus';else if(!typing&&!$('dialog').open){if(mod&&e.key.toLowerCase()==='z')a=e.shiftKey?'redo':'undo';else if(mod&&e.key.toLowerCase()==='y')a='redo';else if(!mod&&e.key.toLowerCase()==='f')a='fit';else if(!mod&&['2','3'].includes(e.key))a=`${e.key}d`;}if(a){e.preventDefault();try{await handleAction(a);}catch(error){toast(error.message,true);}}if(typing&&e.target.dataset.param){if(e.key==='Enter')e.target.blur();if(e.key==='Escape'){e.target.value=e.target.defaultValue;e.target.blur();}}});
  let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawAnalysis,60);}).observe(document.querySelector('.analysis-panel'));
  window.addEventListener('unhandledrejection',e=>{log(e.reason?.message||String(e.reason),'error');});
}
async function initRenderer(gpu){state.renderer=new LayoutRenderer($('layout-canvas'),$('layout-overlay'));try{await state.renderer.init(gpu);}catch(e){log(`Graphics fallback: ${e.message}`,'error');state.renderer.resizeObserver?.disconnect();for(const id of ['layout-canvas','layout-overlay']){const old=$(id),fresh=old.cloneNode(false);old.replaceWith(fresh);}state.renderer=new LayoutRenderer($('layout-canvas'),$('layout-overlay'));await state.renderer.init(null);}}
async function boot(){icons();document.querySelectorAll('[data-ribbon]').forEach(g=>g.hidden=!g.dataset.ribbon.split(' ').includes('design'));let initial=null;try{await store.open();initial=await store.load();}catch(e){log(`Storage: ${e.message}`,'warning');}if(!initial)initial=bestFocus(createExample()).model;state.history=new History(initial);state.selected=initial.surfaces[1].id;try{state.precision=localStorage.getItem('aether-precision')==='cpu'?'cpu':'auto';}catch{}bindEvents();renderDocument();state.gpu=await createGPU();await initRenderer(state.gpu);if(state.gpu.device){state.gpu.device.addEventListener('uncapturederror',e=>log(e.error.message,'gpu-error'));try{state.tracer=new GPUTracer(state.gpu.device);await state.tracer.init();}catch(e){log(`WGSL compute unavailable: ${e.message}`,'error');state.tracer=null;}state.gpu.device.lost.then(async info=>{log(`GPU device lost: ${info.message}`,'error');if(state.tracer)state.tracer.lost=true;state.renderer.resizeObserver?.disconnect();for(const id of ['layout-canvas','layout-overlay'])$(id).replaceWith($(id).cloneNode(false));await initRenderer(null);$('gpu-label').textContent='Float64 · GPU disconnected';scheduleCompute();});}
  $('gpu-label').textContent=state.tracer?'WebGPU engine · ready':state.renderer.device?'WebGPU render · CPU trace':'Float64 reference engine';$('gpu-badge').classList.toggle('cpu',!state.tracer);updateScene();state.computeAgain=true;await compute();persist();globalThis.aether={version:'1.0.0',get model(){return clone(model());},get result(){return state.result;},get state(){return state;},setModel:m=>commit(m,'API edit'),command:(name,data={})=>handleAction(name,{dataset:data}),worker,gpuChecks,calculate:async()=>{scheduleCompute();clearTimeout(computeTimer);await compute();while(state.computing)await new Promise(r=>setTimeout(r,20));return state.result;}};document.documentElement.dataset.ready='true';}
boot().catch(e=>{console.error(e);log(e.stack,'fatal');status(`Initialization failed: ${e.message}`,false,true);toast(e.message,true);});

return {};
})();
})();