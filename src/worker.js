import {executeTask} from './tasks.js';
const cancelled=new Set();
self.onmessage=async({data})=>{
  const {id,type,payload}=data;
  if(type==='cancel'){cancelled.add(payload.id);return;}
  try{const result=await executeTask(type,payload,progress=>self.postMessage({id,progress}),()=>cancelled.has(id));self.postMessage({id,result});}
  catch(e){self.postMessage({id,error:e.message,stack:e.stack});}
  finally{cancelled.delete(id);}
};
