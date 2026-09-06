/** Geometry in millimetres. Angles in radians inside the kernel. */
export const EPS = 1e-10;
export const TAU = 2 * Math.PI;
export const DEG = Math.PI / 180;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function normalize(a) {
  const n = Math.hypot(...a);
  if (!Number.isFinite(n) || n < 1e-30) throw new RangeError('Cannot normalize a zero or non-finite vector.');
  return mul(a, 1/n);
}
export function quadratic(a,b,c) {
  if (Math.abs(a) < 1e-25) return Math.abs(b) < 1e-25 ? [] : [-c/b];
  const d = b*b-4*a*c;
  if (d < -1e-12*Math.max(1,b*b,Math.abs(4*a*c))) return [];
  const root = Math.sqrt(Math.max(0,d));
  const q = -0.5*(b + (b >= 0 ? root : -root));
  if (q === 0) return [-b/(2*a)];
  return [q/a,c/q].sort((x,y)=>x-y);
}
/** Partial-pivoted dense linear solve, used only for the small LM normal system. */
export function solveLinear(matrix, rhs) {
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
export function sumSquares(a) { let sum=0,c=0; for(const x of a){const y=x*x-c,t=sum+y;c=(t-sum)-y;sum=t;} return sum; }
export function mat4mul(a,b) {
  const out=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
export function ortho(l,r,b,t,n,f) { return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,1/(n-f),0,(l+r)/(l-r),(t+b)/(b-t),n/(n-f),1]); }
export function perspective(fov,aspect,n,f) {const q=1/Math.tan(fov/2);return new Float32Array([q/aspect,0,0,0,0,q,0,0,0,0,f/(n-f),-1,0,0,f*n/(n-f),0]);}
export function lookAt(eye,target,up=[0,1,0]) {
  const z=normalize(sub(eye,target)),x=normalize(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
export function project(p,m,w,h) {
  const q=[0,0,0,0];
  for(let r=0;r<4;r++) q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];
  return [(q[0]/q[3]+1)*w/2,(1-q[1]/q[3])*h/2,q[2]/q[3],q[3]];
}
