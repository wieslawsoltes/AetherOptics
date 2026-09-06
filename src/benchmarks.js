import {GLASSES,refractiveIndex} from './glass.js';
import {surface,createExample,clone,History,validateModel} from './model.js';
import {compile,intersect,interact,sagGradient,traceRay,tracePupil,analyze,paraxial,bestFocus,aimRay,STATUS,meritResiduals,optimize} from './optics.js';
import {DEG,normalize,sub} from './math.js';
function assert(condition,message){if(!condition)throw new Error(message);}
function close(actual,expected,tolerance){assert(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`Got ${actual}; expected ${expected} ± ${tolerance}`);return {actual,expected,tolerance,error:Math.abs(actual-expected)};}
function fixture(surfaces){const m=createExample('singlet');m.surfaces=surfaces;m.stopId=surfaces[0].id;m.fields=[{x:0,y:0,weight:1}];m.wavelengths=[{um:0.5875618,weight:1}];m.primary=0;m.samples=128;m.optimization.variables=[];return m;}
export const BENCHMARKS=[
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
export async function runBenchmarks(onProgress=()=>{}) {
  const start=performance.now(),rows=[];
  for(const [name,run]of BENCHMARKS){const t=performance.now();try{const detail=await run();rows.push({name,passed:true,ms:performance.now()-t,...detail});}catch(e){rows.push({name,passed:false,ms:performance.now()-t,error:e.message});}onProgress(rows.at(-1));}
  return {rows,passed:rows.filter(r=>r.passed).length,total:rows.length,ms:performance.now()-start,backend:'CPU Float64',version:1};
}
