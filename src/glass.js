/** SCHOTT catalogue Sellmeier coefficients; wavelength is in micrometres.
 * Catalogue indices are relative to air at nominal room temperature. Here AIR=1.
 * No temperature, pressure, absorption, birefringence, or coating model is implied.
 * Provenance and validity intervals: docs/NUMERICS.md.
 */
export const GLASSES = Object.freeze({
  AIR: {name:'AIR',model:'constant',n:1,min:0.2,max:5,description:'Reference medium'},
  'N-BK7': {name:'N-BK7',model:'sellmeier',B:[1.03961212,0.231792344,1.01046945],C:[0.00600069867,0.0200179144,103.560653],min:0.3,max:2.5,description:'Borosilicate crown · SCHOTT',nd:1.51680,vd:64.17},
  F2: {name:'F2',model:'sellmeier',B:[1.34533359,0.209073176,0.937357162],C:[0.00997743871,0.0470450767,111.886764],min:0.365,max:2.5,description:'Flint · SCHOTT',nd:1.62004,vd:36.37},
  'N-SF11': {name:'N-SF11',model:'sellmeier',B:[1.73759695,0.313747346,1.89878101],C:[0.013188707,0.0623068142,155.23629],min:0.37,max:2.5,description:'Dense flint · SCHOTT',nd:1.78472,vd:25.68},
  IDEAL150: {name:'IDEAL150',model:'constant',n:1.5,min:0.2,max:5,description:'Ideal, non-dispersive n = 1.5'}
});
export function glassCatalog(custom=[]) { return Object.assign(Object.create(null),GLASSES,Object.fromEntries(custom.map(g=>[g.name,g]))); }
export function refractiveIndex(glass,um) {
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
export function validateGlass(g) {
  if(!g || !/^[A-Za-z0-9_. -]{1,32}$/.test(g.name) || Object.hasOwn(GLASSES,g.name) || ['__proto__','constructor','prototype'].includes(g.name)) throw new Error('Custom glass needs a unique, safe name.');
  if(!Number.isFinite(g.min)||!Number.isFinite(g.max)||g.min<=0||g.max<=g.min) throw new Error('Invalid glass wavelength interval.');
  if(g.model==='sellmeier' && (!Array.isArray(g.B)||!Array.isArray(g.C)||g.B.length!==3||g.C.length!==3||![...g.B,...g.C].every(Number.isFinite))) throw new Error('Sellmeier requires three finite B and three finite C coefficients.');
  if(g.model==='cauchy' && ![g.A,g.B,g.C].every(Number.isFinite)) throw new Error('Cauchy requires finite A, B and C.');
  refractiveIndex(g,(g.min+g.max)/2);
}
