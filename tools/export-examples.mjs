/** Rebuild the portable sample prescriptions and their Float64 reference results. */
import {writeFile,mkdir} from 'node:fs/promises';
import {createExample} from '../src/model.js';
import {bestFocus,analyze} from '../src/optics.js';
import {runBenchmarks} from '../src/benchmarks.js';
await mkdir('examples',{recursive:true});await mkdir('docs',{recursive:true});
const records=[];
for(const key of ['achromat','singlet','asphere','mirror']){
  let model=createExample(key);
  if(key!=='mirror')model=bestFocus(model).model;
  const result=analyze(model);
  await writeFile(`examples/${key}.aether.json`,JSON.stringify(model,null,2)+'\n');
  records.push({key,name:model.name,backend:result.backend,samplesPerPupil:model.samples,
    fieldCount:model.fields.length,wavelengthCount:model.wavelengths.length,
    imageGapMm:model.surfaces.at(-2).thickness,paraxial:result.paraxial,
    polychromaticRmsMm:result.rms,transmitted:result.valid,total:result.total,
    counts:result.counts,maxIntersectionResidualMm:result.maxResidual,
    fields:result.fields.map(f=>({field:f.field,rmsMm:f.rms,centroidMm:f.centroid,
      geometricRadiusMm:f.geometric,transmitted:f.valid,total:f.total,
      wavefront:f.wavefront,monochromatic:f.monochromatic}))});
}
await writeFile('docs/example-results.json',JSON.stringify({version:1,engine:'Float64 CPU',results:records},null,2)+'\n');
await writeFile('docs/numerical-benchmarks.json',JSON.stringify(await runBenchmarks(),null,2)+'\n');
console.log(JSON.stringify(records.map(({key,polychromaticRmsMm,paraxial,transmitted,total})=>({key,rmsMicrometres:polychromaticRmsMm*1000,eflMm:paraxial.efl,transmitted,total})),null,2));
