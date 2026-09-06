import { glassCatalog, refractiveIndex, validateGlass } from './glass.js';
export const SCHEMA_VERSION=1;
export const clone = obj => structuredClone(obj);
export const makeId = () => globalThis.crypto?.randomUUID?.() ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export function surface(options={}) {
  return {id:makeId(),label:'Optical surface',type:'standard',mode:'refract',radius:0,thickness:5,glass:'AIR',semi:12.5,semiY:12.5,inner:0,aperture:'circle',conic:0,a4:0,a6:0,a8:0,a10:0,...options};
}
export function createExample(which='achromat') {
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
export function validateModel(m) {
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
export function assertModel(m) {const v=validateModel(m);if(v.errors.length)throw new Error(v.errors.join('\n'));return v;}
export class History {
  constructor(initial,limit=100){assertModel(initial);this.current=clone(initial);this.past=[];this.future=[];this.limit=limit;this.revision=0;}
  commit(next,label='Edit'){assertModel(next);if(JSON.stringify(next)===JSON.stringify(this.current))return false;this.past.push({model:this.current,label});if(this.past.length>this.limit)this.past.shift();this.current=clone(next);this.future=[];this.revision++;return true;}
  undo(){if(!this.past.length)return false;const p=this.past.pop();this.future.push({model:this.current,label:p.label});this.current=p.model;this.revision++;return true;}
  redo(){if(!this.future.length)return false;const p=this.future.pop();this.past.push({model:this.current,label:p.label});this.current=p.model;this.revision++;return true;}
}
