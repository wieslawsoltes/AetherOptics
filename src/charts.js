import {wavelengthColor} from './render.js';
export function setupCanvas(canvas){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w:r.width,h:r.height};}
function grid(ctx,w,h){ctx.fillStyle='#10151c';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#242e3a';ctx.lineWidth=0.6;ctx.beginPath();for(let x=0;x<=w;x+=w/8){ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let y=0;y<=h;y+=h/4){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();}
export function spotChart(canvas,field,model,{onProbe}={}){
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
export function fanChart(canvas,field,model,axis='Y',wavefront=false){
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
export function wavefrontChart(canvas,field,model,wi){
  const {ctx,w,h}=setupCanvas(canvas);grid(ctx,w,h);const wf=field.wavefront[wi],points=field.spots.filter(p=>p.wi===wi&&Number.isFinite(p.opd)),r=Math.min(w,h)*0.39,cx=w/2,cy=h/2;
  ctx.fillStyle='#1b2531';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  const size=Math.max(2,r*2.7/Math.sqrt(Math.max(1,points.length)));
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
  for(const p of points){const v=p.opd/(model.wavelengths[wi].um/1000),t=(v-wf.min)/Math.max(wf.max-wf.min,1e-14);ctx.fillStyle=heat(t);ctx.beginPath();ctx.arc(cx+p.u*r,cy-p.v*r,size,0,Math.PI*2);ctx.fill();}ctx.restore();
  ctx.strokeStyle='#607181';ctx.lineWidth=0.6;ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.moveTo(cx-r-5,cy);ctx.lineTo(cx+r+5,cy);ctx.moveTo(cx,cy-r-5);ctx.lineTo(cx,cy+r+5);ctx.stroke();
  const y=h-16,barW=100,x=(w-barW)/2;for(let i=0;i<barW;i++){ctx.fillStyle=heat(i/barW);ctx.fillRect(x+i,y,1,5);}ctx.font='9px ui-monospace, monospace';ctx.fillStyle='#98a8ba';ctx.textAlign='right';ctx.fillText(Number.isFinite(wf.min)?wf.min.toFixed(2):'—',x-5,y+5);ctx.textAlign='left';ctx.fillText(Number.isFinite(wf.max)?`${wf.max.toFixed(2)} λ`:'—',x+barW+5,y+5);
  if(!points.length){ctx.fillStyle='#e0ae8a';ctx.fillText('No valid reference sphere',12,20);}
}
export function lineChart(canvas,series,{xlabel='',ylabel='',log=false}={}){
  if(!canvas)return;
  const {ctx,w,h}=setupCanvas(canvas);grid(ctx,w,h);const m={l:58,r:18,t:24,b:35},pw=w-m.l-m.r,ph=h-m.t-m.b;
  const points=series.flatMap(s=>s.points).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(!points.length){ctx.fillStyle='#8f9cac';ctx.fillText('Run the study to calculate this plot.',18,30);return;}
  const ys=points.map(p=>log?Math.log10(Math.max(p.y,1e-15)):p.y);let xmin=Math.min(...points.map(p=>p.x)),xmax=Math.max(...points.map(p=>p.x)),ymin=Math.min(...ys),ymax=Math.max(...ys);if(xmax===xmin)xmax=xmin+1;if(ymax===ymin)ymax=ymin+1;
  const pad=(ymax-ymin)*0.1;ymin-=pad;ymax+=pad;const X=x=>m.l+(x-xmin)/(xmax-xmin)*pw,Y=y=>m.t+ph-((log?Math.log10(Math.max(y,1e-15)):y)-ymin)/(ymax-ymin)*ph;
  for(const s of series){ctx.strokeStyle=s.color??'#5cdbc0';ctx.lineWidth=1.8;ctx.beginPath();let start=true;for(const p of s.points){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){start=true;continue;}if(start)ctx.moveTo(X(p.x),Y(p.y));else ctx.lineTo(X(p.x),Y(p.y));start=false;}ctx.stroke();}
  ctx.fillStyle='#8f9cac';ctx.font='10px ui-monospace,monospace';for(let i=0;i<=4;i++){const xx=xmin+(xmax-xmin)*i/4,yy=ymin+(ymax-ymin)*i/4;ctx.fillText(xx.toPrecision(4),X(xx)-10,h-19);ctx.fillText((log?10**yy:yy).toPrecision(3),4,m.t+ph-i*ph/4+3);}ctx.fillStyle='#bbc7d3';ctx.fillText(ylabel,m.l,14);ctx.textAlign='center';ctx.fillText(xlabel,m.l+pw/2,h-3);ctx.textAlign='left';
}
