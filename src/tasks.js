import {prepare,summarize,analyze,bestFocus,optimize,sweep,compile,tracePupil,geometryWarnings,traceRay,packResult,STRIDE} from './optics.js';
import {runBenchmarks} from './benchmarks.js';

/** Shared task dispatcher: real worker, with an explicit same-kernel fallback. */
export async function executeTask(type,payload={},progress=()=>{},cancelled=()=>false){
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
