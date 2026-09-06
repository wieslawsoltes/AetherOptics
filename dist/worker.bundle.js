(()=>{
'use strict';
const __modules=Object.create(null);
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
// ---- worker.js ----
__modules["worker.js"]=(()=>{
const {executeTask}=__modules["tasks.js"];
const cancelled=new Set();
self.onmessage=async({data})=>{
  const {id,type,payload}=data;
  if(type==='cancel'){cancelled.add(payload.id);return;}
  try{const result=await executeTask(type,payload,progress=>self.postMessage({id,progress}),()=>cancelled.has(id));self.postMessage({id,result});}
  catch(e){self.postMessage({id,error:e.message,stack:e.stack});}
  finally{cancelled.delete(id);}
};

return {};
})();
})();