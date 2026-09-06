import {compile,sagGradient} from './optics.js';
import {mat4mul,ortho,perspective,lookAt,project,clamp} from './math.js';
export const WAVE_COLORS=['#77aaff','#52e0ae','#ff9b79','#cf94ff','#f6d46a','#70d9ed','#ed95c5','#bcc6ed'];
export function wavelengthColor(um,index=0){return um<0.515?'#7fa7ff':um<0.61?'#56dfb6':um<0.72?'#ff987d':WAVE_COLORS[index%WAVE_COLORS.length];}
export function rgba(hex,alpha=1){return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,alpha];}
const DRAW_WGSL=`
struct Uniforms{mvp:mat4x4f}
@group(0) @binding(0) var<uniform> camera:Uniforms;
struct Out{@builtin(position) position:vec4f,@location(0) color:vec4f}
@vertex fn vertex(@location(0) p:vec3f,@location(1) color:vec4f)->Out{var o:Out;o.position=camera.mvp*vec4f(p,1.0);o.color=color;return o;}
@fragment fn fragment(i:Out)->@location(0) vec4f{return i.color;}`;
export function createScene(model,paths,{mode='2d',selected=null,field=-1,wavelength=-1,showRays=true,showGrid=true}={}) {
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
export class LayoutRenderer {
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
