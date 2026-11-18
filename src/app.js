(function(){
"use strict";
/* DATA (balls per year) and CONFIG (what the three dimensions are) come from the page that includes this file */
const YEARS=DATA.years, N=DATA.cells[YEARS[0]].length, SIZES=DATA.sizes, ABS=SIZES[0]*SIZES[1]*SIZES[2]; /* N = most balls any year needs; ABS = ball absent this year */
const DIMS={};
CONFIG.dims.forEach((d,i)=>{const div=SIZES.slice(i+1).reduce((a,b)=>a*b,1),size=SIZES[i],raw=c=>Math.floor(c/div)%size;
  if(d.group){ /* the data is stored by member (prefecture); the dimension itself is the member's group (region) */
    const par=d.group.parent;
    DIMS[d.key]={name:d.name,cats:d.cats,short:d.short||d.cats,light:d.light,dark:d.dark,of:c=>par[raw(c)]};
    DIMS[d.group.key]={name:d.group.name,cats:d.group.cats,short:d.group.cats,light:d.light,dark:d.dark,of:raw,parent:par};
  }else DIMS[d.key]={name:d.name,cats:d.cats,short:d.short||d.cats,light:d.light,dark:d.dark,of:raw};});
const DRILL=CONFIG.dims.find(d=>d.group)||null; /* the dimension whose tubes can be opened ("look inside") */
/* focus: index of the opened group, or -1. While open, x is the member dimension and only that group's balls are on stage. */
const state={year:CONFIG.start.year,x:CONFIG.start.x,z:CONFIG.start.z,c:CONFIG.start.c,sel:-1,focus:-1,saved:null};
const cells={}; YEARS.forEach(y=>{const s=DATA.cells[y],a=new Uint16Array(N);for(let i=0;i<N;i++)a[i]=s.charCodeAt(i)-33;cells[y]=a;});
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const isDark=()=>{const t=document.documentElement.dataset.theme;return t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;};
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- scene ---------- */
const stage=document.getElementById("stage"),canvas=document.getElementById("cv"),labelBox=document.getElementById("labels");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(32,1,0.1,500);
scene.add(new THREE.HemisphereLight(0xffffff,0x8a8f98,0.92));
const sun=new THREE.DirectionalLight(0xffffff,0.38);sun.position.set(-6,14,10);scene.add(sun);
const balls=new THREE.InstancedMesh(new THREE.SphereGeometry(0.47,18,12),new THREE.MeshPhongMaterial({shininess:55,specular:0x3a3a3a}),N);
balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);balls.frustumCulled=false;scene.add(balls);
const frame=new THREE.Group();scene.add(frame);
const mat=new THREE.Mesh(new THREE.CircleGeometry(1,72),new THREE.MeshBasicMaterial({depthWrite:false}));mat.rotation.x=-Math.PI/2;mat.position.y=-0.03;mat.renderOrder=-1;scene.add(mat);

const cur=new Float32Array(N*3),from=new Float32Array(N*3),to=new Float32Array(N*3),t0=new Float32Array(N),dur=new Float32Array(N);
const binOf=new Int16Array(N),jit=new Float32Array(N*3),pour=new Uint8Array(N),prev=new Float32Array(N*3),sc=new Float32Array(N),act=new Uint8Array(N);
let phase="",spillEnd=0,apexY=10,clampR=40;
for(let i=0;i<N*3;i++)jit[i]=(Math.sin(i*12.9898)*43758.5453%1)*0.07;
let bins=[],labels=[],moving=false,dirty=true,clock=0;
const cam={az:-0.5,pol:1.12,dist:40,tx:0,ty:5,tz:0, gDist:40,gTy:5, zoom:1};

let xLabels=null,xNames=null,xMembers=null;
function members(f){const par=DIMS[DRILL.group.key].parent,m=[];par.forEach((r,i)=>{if(r===f)m.push(i);});return m;}
function catsOf(d){return d==="none"?[null]:DIMS[d].cats.map((_,i)=>i);}
function layout(mode){
  const first=mode==="first";
  const F=state.focus,G=F>=0?DIMS[DRILL.group.key]:null,mem=G?members(F):null,pos={};
  if(mem)mem.forEach((p,i)=>{pos[p]=i;});
  const cell=cells[state.year],Z=catsOf(state.z),nx=mem?mem.length:catsOf(state.x).length,nz=Z.length,C=DIMS[state.c];
  xLabels=mem?mem.map(p=>G.short[p]):(state.x==="none"?null:DIMS[state.x].short);
  xNames=mem?mem.map(p=>G.cats[p]):(state.x==="none"?null:DIMS[state.x].cats);xMembers=mem;
  bins=[];
  for(let zi=0;zi<nz;zi++)for(let xi=0;xi<nx;xi++)bins.push({xi,zi,ids:[],n:0});
  const zOf=c=>state.z==="none"?0:DIMS[state.z].of(c);
  /* -1: this ball is not on stage (it belongs to another group than the opened one) */
  const binIx=mem?(c=>{const p=G.of(c);return G.parent[p]===F?zOf(c)*nx+pos[p]:-1;}):(c=>zOf(c)*nx+(state.x==="none"?0:DIMS[state.x].of(c)));
  for(let i=0;i<N;i++){const c=cell[i];if(c>=ABS){binOf[i]=-1;continue;}const b=binIx(c);binOf[i]=b;if(b>=0)bins[b].ids.push(i);}
  /* footprint and frame height come from the largest group in ANY year, so tube heights compare across years */
  let maxN=1;YEARS.forEach(y=>{const k=new Uint16Array(nx*nz),cy=cells[y];for(let i=0;i<N;i++)if(cy[i]<ABS){const b=binIx(cy[i]);if(b>=0)k[b]++;}for(let j=0;j<k.length;j++)if(k[j]>maxN)maxN=k[j];});
  const s=(nx*nz===1)?10:Math.max(3,Math.ceil(Math.sqrt(maxN/12)));
  const pitch=s+1.6,H=Math.ceil(maxN/(s*s));
  const now=clock;apexY=H+3;clampR=Math.hypot(nx*pitch,nz*pitch)*0.5+6;
  bins.forEach(b=>{
    b.n=b.ids.length;b.cx=(b.xi-(nx-1)/2)*pitch;b.cz=((nz-1)/2-b.zi)*pitch;b.top=Math.ceil(b.n/(s*s));
    b.ids.sort((p,q)=>(C.of(cell[p])-C.of(cell[q]))||(p-q));
    b.ids.forEach((id,k)=>{
      const L=Math.floor(k/(s*s)),r=Math.floor((k%(s*s))/s),col=k%s,o=id*3;
      to[o]=b.cx+col-(s-1)/2+jit[o];to[o+1]=L+0.5+jit[o+1]*0.5;to[o+2]=b.cz+r-(s-1)/2+jit[o+2];
      if(first||reduce){cur[o]=to[o];cur[o+1]=to[o+1];cur[o+2]=to[o+2];dur[id]=0;sc[id]=1;}
      else if(sc[id]<0.5){/* new ball this year: drops in from above its slot */
        from[o]=cur[o]=to[o];from[o+1]=cur[o+1]=apexY+1.5+Math.abs(jit[o+1])*30;from[o+2]=cur[o+2]=to[o+2];
        pour[id]=2;t0[id]=now+0.25+L*0.05+Math.abs(jit[o])*5;dur[id]=0.7;}
      else{from[o]=cur[o];from[o+1]=cur[o+1];from[o+2]=cur[o+2];
        const d=Math.hypot(to[o]-cur[o],to[o+1]-cur[o+1],to[o+2]-cur[o+2]);
        if(mode==="pour"){pour[id]=1;t0[id]=now+L*0.075+Math.abs(jit[o])*3;dur[id]=1.0;}
        else{pour[id]=0;if(d<0.01){dur[id]=0;}else{t0[id]=now+Math.abs(jit[o])*6+(d>3?0.12:0);dur[id]=0.55+Math.min(d,30)*0.022;}}}
    });
  });
  for(let i=0;i<N;i++){if(binOf[i]>=0)continue;
    if(first||reduce||sc[i]<0.5){sc[i]=0;dur[i]=0;}
    else{const o=i*3;from[o]=cur[o];from[o+1]=cur[o+1];from[o+2]=cur[o+2];pour[i]=3;t0[i]=now+Math.abs(jit[o])*4;dur[i]=0.4;}}
  moving=!(first||reduce);
  if(!moving)writeAll();
  buildFrame(s,H,nx,nz,pitch);
  ext=[nx*pitch,nz*pitch,H,Math.max.apply(null,bins.map(b=>b.top)),s];cam.zoom=1;fit(first||reduce);
  state.sel=-1;paint();detail();dirty=true;
}
const M=new THREE.Matrix4();
let ext=[10,10,10,10,10];
/* Frame the picture by projecting the corners of what must be visible, for the current view angle.
   Distance: the whole frame (tubes at their tallest in any year, plus the labels around them) fits,
   so it does not change from year to year. Height: what is on stage now sits a little above the middle. */
const fitCam=new THREE.PerspectiveCamera(32,1,0.1,500),FV=new THREE.Vector3();
function fit(snap){
  const W=ext[0],D=ext[1],H=ext[2],top=ext[3],s=ext[4],hv=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const x0=-W/2-(state.z==="none"?0.6:s*0.5+3.2),x1=W/2+0.6,z0=-D/2-0.4,z1=D/2+(xLabels?3.2:0.8),yb=-1.6;
  const box=yt=>{const p=[];[x0,x1].forEach(x=>[yb,yt].forEach(y=>[z0,z1].forEach(z=>p.push([x,y,z]))));return p;};
  const full=box(H+0.4),now=box(Math.max(top+2.2,2.5));
  fitCam.fov=camera.fov;fitCam.aspect=camera.aspect;fitCam.updateProjectionMatrix();
  const span=(dist,ty,pts)=>{const sp=Math.sin(cam.pol);
    fitCam.position.set(dist*Math.sin(cam.az)*sp,ty+dist*Math.cos(cam.pol),dist*Math.cos(cam.az)*sp);fitCam.lookAt(0,ty,0);fitCam.updateMatrixWorld(true);
    let mx=0,lo=1e9,hi=-1e9;pts.forEach(q=>{FV.set(q[0],q[1],q[2]).project(fitCam);mx=Math.max(mx,Math.abs(FV.x));lo=Math.min(lo,FV.y);hi=Math.max(hi,FV.y);});return [mx,lo,hi];};
  let ty=H*0.4,lo=4,hi=600;
  for(let k=0;k<22;k++){const d=(lo+hi)/2,r=span(d,ty,full);if(r[0]<=0.94&&r[2]-r[1]<=1.84)hi=d;else lo=d;}
  const dist=hi;
  for(let k=0;k<4;k++){const r=span(dist,ty,now);ty+=((r[1]+r[2])/2-0.06)*dist*hv;}     /* current content slightly above centre */
  for(let k=0;k<3;k++){const r=span(dist,ty,full);                                      /* but keep the floor and labels in view */
    if(r[1]<-0.95)ty-=(-0.95-r[1])*dist*hv;else if(r[2]>0.98&&r[2]-r[1]<=1.93)ty+=(r[2]-0.98)*dist*hv;}
  cam.gDist=dist;cam.gTy=ty;
  if(snap){cam.dist=cam.gDist;cam.ty=cam.gTy;}
}
function writeAll(){for(let i=0;i<N;i++){const k=sc[i];M.makeScale(k,k,k);M.setPosition(cur[i*3],cur[i*3+1],cur[i*3+2]);balls.setMatrixAt(i,M);}balls.instanceMatrix.needsUpdate=true;}
function step(){
  let any=false,land=-1,landPour=false;
  for(let i=0;i<N;i++){
    if(dur[i]<=0)continue;const o=i*3;let u=(clock-t0[i])/dur[i];
    if(u<=0){any=true;continue;}
    if(u>=1){u=1;dur[i]=0;if(pour[i]!==3&&(land<0||to[o+1]>to[land*3+1])){land=i;landPour=!!pour[i];}}else any=true;
    if(pour[i]===4){cur[o+1]=to[o+1]+Math.sin(Math.PI*u)*(0.55+Math.abs(jit[o+2])*7);continue;}
    if(pour[i]===3){sc[i]=1-u;continue;}
    if(pour[i]===2){sc[i]=1;cur[o+1]=from[o+1]+(to[o+1]-from[o+1])*u*u;continue;}
    if(pour[i]){
      const uh=Math.min(1,u/0.6),eh=1-Math.pow(1-uh,3);
      cur[o]=from[o]+(to[o]-from[o])*eh;cur[o+2]=from[o+2]+(to[o+2]-from[o+2])*eh;
      if(u<0.6)cur[o+1]=from[o+1]+(apexY-from[o+1])*Math.sin(uh*Math.PI/2);
      else{const w=(u-0.6)/0.4;cur[o+1]=apexY+(to[o+1]-apexY)*w*w;}
      continue;
    }
    const e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
    const dx=to[o]-from[o],dz=to[o+2]-from[o+2],lift=Math.min(6,Math.hypot(dx,dz)*0.28);
    cur[o]=from[o]+dx*e;cur[o+2]=from[o+2]+dz*e;cur[o+1]=from[o+1]+(to[o+1]-from[o+1])*e+Math.sin(Math.PI*e)*lift;
  }
  writeAll();moving=any;
  if(land>=0){const h=Math.max(0,Math.min(1,to[land*3+1]/Math.max(4,apexY-3)));
    if(landPour)blip(PENTA[Math.round(h*8)+(Math.random()<0.3?1:0)],0.12,0.16);else blip(PENTA[2+Math.round(h*6)],0.07,0.14);}
}
/* ---------- sound: soft sine blips, pitched on a pentatonic scale ---------- */
const PENTA=[261.6,293.7,329.6,392.0,440.0,523.3,587.3,659.3,784.0,880.0,1046.5];
let ac=null,master=null,sndOn=true,lastV=0,sfxCount=0,unl=null,sndErr=false;
const SILENT="data:audio/wav;base64,UklGRsQPAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAPAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
try{sndOn=localStorage.getItem("ballpool-sound")!=="off";}catch(e){}
let sndTried=false,sndFail=0,sndFailAt=0;
function ensureAudio(){
  if(!sndOn)return;
  sndTried=true;
  try{
    /* a context that stays stopped through several separate taps is thrown away and made again inside the tap */
    if(ac&&ac.state!=="running"){const n=performance.now();if(n-sndFailAt>500){sndFail++;sndFailAt=n;}
      if(sndFail>=3){try{ac.close();}catch(e){}ac=null;master=null;sndFail=0;}}
    else if(ac){sndFail=0;}
    if(!ac){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;ac=new AC();
      master=ac.createGain();master.gain.value=0.55;const lp=ac.createBiquadFilter();lp.type="lowpass";lp.frequency.value=2000;lp.Q.value=0.3;
      const cp=ac.createDynamicsCompressor();master.connect(lp);lp.connect(cp);cp.connect(ac.destination);}
    if(ac.state!=="running")ac.resume().then(sndSync,function(){});
    /* unlock inside the tap: one silent buffer, plus a silent looping media element so that
       iOS routes Web Audio to the media channel (audible even with the ringer switch off) */
    const b=ac.createBuffer(1,1,22050),src=ac.createBufferSource();src.buffer=b;src.connect(ac.destination);src.start(0);
    if(!unl){unl=new Audio(SILENT);unl.loop=true;unl.setAttribute("playsinline","");}
    if(unl.paused){const pr=unl.play();if(pr&&pr.catch)pr.catch(function(){});}
    ac.onstatechange=sndSync;
  }catch(e){sndErr=true;}
  sndSync();setTimeout(sndSync,350);setTimeout(sndSync,1500);
}
function blip(freq,vol,len){
  if(!sndOn||!ac||ac.state!=="running")return;
  const t=ac.currentTime;if(t-lastV<0.024)return;lastV=t;sfxCount++;
  try{
    const o=ac.createOscillator(),g=ac.createGain();o.type="sine";
    o.frequency.setValueAtTime(freq*1.1,t);o.frequency.exponentialRampToValueAtTime(freq,t+0.045);
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.001,vol),t+0.008);g.gain.exponentialRampToValueAtTime(0.0001,t+len);
    o.connect(g);g.connect(master);o.start(t);o.stop(t+len+0.03);
  }catch(e){}
}
const pick=(lo,hi)=>PENTA[lo+Math.floor(Math.random()*(hi-lo+1))];
let hitBall=0,hitBallMax=0,hitFloor=0,hitFloorMax=0;

/* ---------- spill: walls vanish, balls slump and roll (position-based dynamics) ---------- */
const GX=128,GY=32,GZ=128,head=new Int32Array(GX*GY*GZ),nextB=new Int32Array(N),cellI=new Int32Array(N),DIA=0.94,HS=1/120;
function startSpill(){
  if(reduce){layout("first");return;}
  while(frame.children.length){const o=frame.children.pop();o.geometry.dispose();o.material.dispose();}
  labelBox.textContent="";labels=[];state.sel=-1;detail();
  for(let i=0;i<N;i++){
    act[i]=(sc[i]>0.5&&binOf[i]>=0)?1:0;if(!act[i]){sc[i]=0;dur[i]=0;continue;}sc[i]=1;
    const o=i*3,b=bins[binOf[i]];let dx=cur[o]-b.cx,dz=cur[o+2]-b.cz,l=Math.hypot(dx,dz);
    if(l<0.3){const a=jit[o]*90;dx=Math.cos(a);dz=Math.sin(a);l=1;}
    const sp=(1.2+cur[o+1]*0.55+Math.abs(jit[o+1])*14)*HS;
    prev[o]=cur[o]-dx/l*sp;prev[o+1]=cur[o+1]-Math.abs(jit[o+2])*12*HS;prev[o+2]=cur[o+2]-dz/l*sp;dur[i]=0;
  }
  phase="spill";spillEnd=clock+1.35;moving=false;dirty=true;
}
function physics(dt){
  const steps=Math.max(1,Math.min(4,Math.round(dt/HS))),R=DIA/2,g=-34*HS*HS;
  for(let s=0;s<steps;s++){
    for(let i=0;i<N;i++){if(!act[i])continue;const o=i*3;
      const vx=(cur[o]-prev[o])*0.992,vy=(cur[o+1]-prev[o+1])*0.992,vz=(cur[o+2]-prev[o+2])*0.992;
      prev[o]=cur[o];prev[o+1]=cur[o+1];prev[o+2]=cur[o+2];cur[o]+=vx;cur[o+1]+=vy+g;cur[o+2]+=vz;}
    for(let it=0;it<3;it++){
      head.fill(-1);
      for(let i=0;i<N;i++){if(!act[i])continue;const o=i*3;
        const ix=Math.max(1,Math.min(GX-2,Math.floor(cur[o])+64)),iy=Math.max(1,Math.min(GY-2,Math.floor(cur[o+1])+1)),iz=Math.max(1,Math.min(GZ-2,Math.floor(cur[o+2])+64));
        const c=ix+GX*(iy+GY*iz);cellI[i]=c;nextB[i]=head[c];head[c]=i;}
      for(let i=0;i<N;i++){if(!act[i])continue;const o=i*3,c=cellI[i];
        for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          let j=head[c+dx+GX*(dy+GY*dz)];
          while(j>=0){if(j>i){const q=j*3,ex=cur[q]-cur[o],ey=cur[q+1]-cur[o+1],ez=cur[q+2]-cur[o+2],d2=ex*ex+ey*ey+ez*ez;
            if(d2<DIA*DIA&&d2>1e-8){const d=Math.sqrt(d2),k=(DIA-d)/d*0.42;
              if(it===0){const cs=-(((cur[q]-prev[q])-(cur[o]-prev[o]))*ex+((cur[q+1]-prev[q+1])-(cur[o+1]-prev[o+1]))*ey+((cur[q+2]-prev[q+2])-(cur[o+2]-prev[o+2]))*ez)/d;if(cs>0.03){hitBall++;if(cs>hitBallMax)hitBallMax=cs;}}cur[o]-=ex*k;cur[o+1]-=ey*k;cur[o+2]-=ez*k;cur[q]+=ex*k;cur[q+1]+=ey*k;cur[q+2]+=ez*k;}}
            j=nextB[j];}
        }
      }
      for(let i=0;i<N;i++){if(!act[i])continue;const o=i*3;
        if(cur[o+1]<R){if(it===0){const fs=prev[o+1]-cur[o+1];if(fs>0.035){hitFloor++;if(fs>hitFloorMax)hitFloorMax=fs;}}cur[o+1]=R;prev[o]=cur[o]-(cur[o]-prev[o])*0.93;prev[o+2]=cur[o+2]-(cur[o+2]-prev[o+2])*0.93;if(prev[o+1]<cur[o+1])prev[o+1]=cur[o+1]+(cur[o+1]-prev[o+1])*-0.25;}
        const rr=Math.hypot(cur[o],cur[o+2]);if(rr>clampR){cur[o]*=clampR/rr;cur[o+2]*=clampR/rr;}
      }
    }
  }
  if(hitFloor>0){blip(pick(0,3)*0.5,Math.min(0.22,0.05+hitFloorMax*1.1),0.2);}
  else if(hitBall>0){blip(pick(2,7),Math.min(0.16,0.03+hitBallMax*0.9),0.13);}
  hitBall=hitBallMax=hitFloor=hitFloorMax=0;
  writeAll();
}
function paint(){
  const C=DIMS[state.c],pal=(isDark()?C.dark:C.light).map(h=>new THREE.Color(h)),cell=cells[state.year];
  for(let i=0;i<N;i++)if(cell[i]<ABS)balls.setColorAt(i,pal[C.of(cell[i])]);
  balls.instanceColor.needsUpdate=true;dirty=true;
}
function buildFrame(s,H,nx,nz,pitch){
  while(frame.children.length){const o=frame.children.pop();o.geometry.dispose();o.material.dispose();}
  labelBox.textContent="";labels=[];
  mat.material.color.set(css("--mat"));mat.scale.setScalar(Math.hypot(nx*pitch,nz*pitch)/2+1.2);
  const line=new THREE.Color(css("--line")),ink=new THREE.Color(css("--muted"));
  bins.forEach((b,bi)=>{
    const g=new THREE.EdgesGeometry(new THREE.BoxGeometry(s+0.3,H+0.2,s+0.3));
    const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:line,transparent:true,opacity:0.9}));
    m.position.set(b.cx,(H+0.2)/2,b.cz);m.userData.bin=bi;frame.add(m);
    const f=new THREE.Mesh(new THREE.PlaneGeometry(s+0.3,s+0.3),new THREE.MeshBasicMaterial({color:ink,transparent:true,opacity:0.10,depthWrite:false}));
    f.rotation.x=-Math.PI/2;f.position.set(b.cx,0.001,b.cz);frame.add(f);
    if(b.n>0){addLabel("n",String(b.n),b.cx,b.top+0.9,b.cz);labels[labels.length-1].val=b.n;}
  });
  const half=s/2+1.1;
  if(xLabels)xLabels.forEach((nm,i)=>addLabel("c",nm,(i-(nx-1)/2)*pitch,-0.2,((nz-1)/2)*pitch+half+0.6));
  if(state.z!=="none")DIMS[state.z].short.forEach((nm,i)=>addLabel("r",nm,-((nx-1)/2)*pitch-half-0.4,-0.2,((nz-1)/2-i)*pitch,true));
}
function addLabel(cls,text,x,y,z,right){const el=document.createElement("div");el.className="lb "+cls;el.textContent=text;labelBox.appendChild(el);labels.push({el,p:new THREE.Vector3(x,y,z),right:!!right,cls});}
const V=new THREE.Vector3();
function placeLabels(){
  const w=stage.clientWidth,h=stage.clientHeight;
  labels.forEach(l=>{V.copy(l.p).project(camera);const x=(V.x*0.5+0.5)*w,y=(-V.y*0.5+0.5)*h;l.x=x;l.y=y;
    l.el.style.transform="translate("+x.toFixed(1)+"px,"+y.toFixed(1)+"px) translate("+(l.right?"-100%":"-50%")+","+(l.cls==="n"?"-100%":"0")+")";});
  /* counts: larger groups win; a count that would touch a kept one is hidden (tap the tube to read it) */
  const kept=[];
  labels.filter(l=>l.cls==="n").sort((a,b)=>b.val-a.val).forEach(l=>{
    const hw=l.el.textContent.length*4.6+5,x0=l.x-hw,x1=l.x+hw,y0=l.y-19,y1=l.y;
    const hit=kept.some(k=>x0<k[1]&&x1>k[0]&&y0<k[3]&&y1>k[2]);
    l.el.style.visibility=hit?"hidden":"visible";if(!hit)kept.push([x0,x1,y0,y1]);});
}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();fit(false);dirty=true;}
function applyCam(){
  const d=cam.dist*cam.zoom,sp=Math.sin(cam.pol);
  camera.position.set(cam.tx+d*Math.sin(cam.az)*sp,cam.ty+d*Math.cos(cam.pol),cam.tz+d*Math.cos(cam.az)*sp);camera.lookAt(cam.tx,cam.ty,cam.tz);
}
let last=performance.now();
function tick(t){
  const dt=Math.min(0.05,(t-last)/1000);last=t;clock+=dt;
  if(phase==="spill"){physics(dt);dirty=true;if(clock>=spillEnd){phase="";layout("pour");}}
  else if(moving){step();dirty=true;}
  const dd=cam.gDist-cam.dist,dy=cam.gTy-cam.ty;
  if(Math.abs(dd)>0.01||Math.abs(dy)>0.01){const k=1-Math.exp(-dt*5);cam.dist+=dd*k;cam.ty+=dy*k;dirty=true;}
  if(dirty){applyCam();renderer.render(scene,camera);placeLabels();dirty=false;}
  requestAnimationFrame(tick);
}

/* ---------- pointer: orbit, pinch, tap ---------- */
const pts=new Map();let moved=0,pinch=0;
stage.addEventListener("pointerdown",e=>{stage.setPointerCapture(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;pinch=0;});
stage.addEventListener("pointermove",e=>{
  const p=pts.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;
  if(pts.size===1){moved+=Math.abs(dx)+Math.abs(dy);cam.az-=dx*0.008;cam.pol=Math.min(1.5,Math.max(0.2,cam.pol-dy*0.006));}
  p.x=e.clientX;p.y=e.clientY;
  if(pts.size===2){const a=Array.from(pts.values()),d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(pinch)cam.zoom=Math.min(2.2,Math.max(0.35,cam.zoom*pinch/d));pinch=d;moved=99;}
  dirty=true;
});
function up(e){if(!pts.has(e.pointerId))return;const one=pts.size===1;pts.delete(e.pointerId);pinch=0;if(one&&moved<8)tap(e);}
stage.addEventListener("pointerup",up);stage.addEventListener("pointercancel",e=>{pts.delete(e.pointerId);pinch=0;});
stage.addEventListener("wheel",e=>{e.preventDefault();cam.zoom=Math.min(2.2,Math.max(0.35,cam.zoom*Math.exp(e.deltaY*0.001)));dirty=true;},{passive:false});
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
function tap(e){
  if(phase==="spill")return;
  const r=stage.getBoundingClientRect();ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera);const hit=ray.intersectObject(balls)[0];
  state.sel=hit?binOf[hit.instanceId]:-1;
  const acc=new THREE.Color(css("--accent")),line=new THREE.Color(css("--line"));
  frame.children.forEach(o=>{if(o.isLineSegments)o.material.color.copy(o.userData.bin===state.sel?acc:line);});
  detail();dirty=true;
  if(hit&&!moving&&!reduce){/* the tapped tube answers: its balls hop, bottom layer first */
    const b=bins[state.sel];
    b.ids.forEach((id,k)=>{const o=id*3;from[o]=cur[o]=to[o];from[o+1]=cur[o+1]=to[o+1];from[o+2]=cur[o+2]=to[o+2];
      pour[id]=4;t0[id]=clock+(to[o+1]|0)*0.035+Math.abs(jit[o])*1.2;dur[id]=0.42;});
    moving=true;blip(PENTA[4],0.13,0.2);
  }
}

/* ---------- breakdown strip (legend + counts) ---------- */
function detail(){
  const C=DIMS[state.c],cell=cells[state.year],pal=isDark()?C.dark:C.light,cnt=C.cats.map(()=>0),F=state.focus;
  let tot=0,title=F>=0?DIMS[DRILL.key].cats[F]:"全体";
  for(let i=0;i<N;i++){if(cell[i]>=ABS||binOf[i]<0||(state.sel>=0&&binOf[i]!==state.sel))continue;cnt[C.of(cell[i])]++;tot++;}
  if(state.sel>=0){const b=bins[state.sel],p=[];if(xNames)p.push(xNames[b.xi]);if(state.z!=="none")p.push(DIMS[state.z].cats[b.zi]);title=p.join(" × ")||title;
    /* a whole prefecture: add its real population, since a few balls are a coarse measure */
    if(xMembers&&state.z==="none"&&DATA.sub)title+="　"+popText(DATA.sub[state.year][xMembers[b.xi]]).replace(/<[^>]+>/g,"");}
  const dt=document.getElementById("dt");dt.innerHTML="<b></b><span></span>";
  dt.querySelector("b").textContent=title;dt.querySelector("span").textContent=tot+"個の"+C.name+"別内訳";
  if(DRILL){
    const mk=(txt,fn)=>{const b=document.createElement("button");b.type="button";b.className="mini";b.textContent=txt;b.addEventListener("click",fn);dt.appendChild(b);};
    if(F>=0)mk("← "+DRILL.group.back,exitFocus);
    else if(state.sel>=0&&(state.x===DRILL.key||state.z===DRILL.key)){const b=bins[state.sel],r=state.x===DRILL.key?b.xi:b.zi;mk("中を見る",()=>enterFocus(r));}
  }
  const ul=document.getElementById("dl");ul.textContent="";
  C.cats.forEach((nm,i)=>{const li=document.createElement("li"),sw=document.createElement("i"),sp=document.createElement("span");sw.style.background=pal[i];sp.textContent=cnt[i];li.append(sw,nm,sp);ul.appendChild(li);});
}
/* look inside one group: its balls spill and are sorted again by member; the other balls leave the stage */
function enterFocus(r){
  if(phase==="spill"||state.focus>=0)return;
  const other=state.x===DRILL.key?state.z:state.x;
  state.saved={x:state.x,z:state.z};state.focus=r;state.x=DRILL.group.key;state.z=(other===DRILL.key)?"none":other;
  sync();fact();startSpill();
}
function exitFocus(){
  if(phase==="spill"||state.focus<0)return;
  state.focus=-1;state.x=state.saved.x;state.z=state.saved.z;state.saved=null;
  sync();fact();startSpill();
}
function popText(p){ /* 8231612568 -> 82.3億人 ; 123262450 -> 1億2326万人 ; 59736822 -> 5974万人 */
  if(p>=1e9)return "<b>"+(p/1e8).toFixed(1)+"</b>億人";
  const man=Math.round(p/1e4),oku=Math.floor(man/1e4),rest=man%1e4;
  return (oku?"<b>"+oku+"</b>億":"")+"<b>"+rest+"</b>万人";
}
function fact(){
  const k=YEARS.indexOf(state.year),el=document.getElementById("fact"),F=state.focus;
  if(F>=0){const G=DIMS[DRILL.group.key],cy=cells[state.year];let n=0,p=0;
    for(let i=0;i<N;i++)if(cy[i]<ABS&&G.parent[G.of(cy[i])]===F)n++;
    members(F).forEach(m=>{p+=DATA.sub[state.year][m];});
    el.innerHTML="<b>"+state.year+"</b>年　"+DIMS[DRILL.key].cats[F]+" "+popText(p)+"　ボール <b>"+n+"</b>個";}
  else el.innerHTML="<b>"+state.year+"</b>年　人口 "+popText(DATA.pop[k])+"　ボール <b>"+DATA.n[k]+"</b>個";
  if(!reduce)el.querySelectorAll("b").forEach((b,n)=>{b.style.animationDelay=(n*70)+"ms";b.classList.add("bump");});
}

/* ---------- controls ---------- */
function apply(key,val){
  if(String(state[key])===String(val))return;state[key]=val;
  if(key==="x"&&state.z===state.x)state.z="none";if(key==="z"&&state.x===state.z)state.x="none";
  sync();if(key==="year")fact();
  if(phase==="spill"){if(key==="c")paint();return;}
  if(key==="x"||key==="z")startSpill();else layout("move");
}
function seg(id,opts,key){
  const box=document.getElementById(id);
  opts.forEach(o=>{const b=document.createElement("button");b.type="button";b.textContent=o[1];b.dataset.v=o[0];b.id=id+"-"+o[0];
    b.addEventListener("click",()=>{b.classList.remove("pop");void b.offsetWidth;b.classList.add("pop");apply(key,key==="year"?+o[0]:o[0]);});
    box.appendChild(b);});
}
/* year rail: the handle sits on the current stop; drag it or tap a stop and it slides there */
const knob=document.getElementById("knob"),rail=document.getElementById("rail");
const stopPct=i=>(i+0.5)/YEARS.length*100;
function placeKnob(){
  const i=YEARS.indexOf(state.year),w=rail.clientWidth||320;
  knob.style.left=stopPct(i)+"%";
  knob.setAttribute("aria-valuenow",state.year);knob.setAttribute("aria-valuetext",state.year+"年");
}
function sync(){
  [["s-year","year"],["s-c","c"]].forEach(p=>{document.querySelectorAll("#"+p[0]+" button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.v===String(state[p[1]]))));});
  document.querySelectorAll("#s-split button").forEach(b=>{
    const open=state.focus>=0&&b.dataset.v===DRILL.key,ax=(open||state.x===b.dataset.v)?"横":state.z===b.dataset.v?"奥":"";
    b.textContent=open?DRILL.group.name:DIMS[b.dataset.v].name;
    b.setAttribute("aria-pressed",String(!!ax));b.dataset.ax=ax;b.setAttribute("aria-label",b.textContent+(ax?"（"+ax+"に分ける）":"（分けない）"));});
  placeKnob();
}
let dragNear=-1;
function nearAt(clientX){const r=rail.getBoundingClientRect();return Math.max(0,Math.min(YEARS.length-1,Math.floor((clientX-r.left)/r.width*YEARS.length)));}
knob.addEventListener("pointerdown",e=>{knob.setPointerCapture(e.pointerId);knob.classList.add("drag");dragNear=YEARS.indexOf(state.year);e.preventDefault();});
knob.addEventListener("pointermove",e=>{
  if(!knob.classList.contains("drag"))return;
  const r=rail.getBoundingClientRect(),x=Math.max(r.width*0.5/YEARS.length,Math.min(r.width*(1-0.5/YEARS.length),e.clientX-r.left));
  knob.style.left=x+"px";
  const n=nearAt(e.clientX);
  if(n!==dragNear){dragNear=n;document.querySelectorAll("#s-year button").forEach((b,i)=>b.classList.toggle("near",i===n));blip(PENTA[3+n],0.09,0.1);}
});
function endDrag(e){
  if(!knob.classList.contains("drag"))return;knob.classList.remove("drag");
  document.querySelectorAll("#s-year button").forEach(b=>b.classList.remove("near"));
  const y=YEARS[dragNear<0?YEARS.indexOf(state.year):dragNear];
  if(y===state.year)placeKnob();else apply("year",y);
}
knob.addEventListener("pointerup",e=>{ensureAudio();endDrag(e);});knob.addEventListener("pointercancel",endDrag);
knob.addEventListener("keydown",e=>{const i=YEARS.indexOf(state.year),d=(e.key==="ArrowRight"||e.key==="ArrowUp")?1:(e.key==="ArrowLeft"||e.key==="ArrowDown")?-1:0;
  if(d&&YEARS[i+d]){e.preventDefault();apply("year",YEARS[i+d]);}});
const dimOpts=CONFIG.dims.map(d=>[d.key,d.name]);
seg("s-year",YEARS.map(y=>[y,String(y)]),"year");
/* one row for both directions: the first choice divides across (横), the second into depth (奥); tap again to remove */
(function(){const box=document.getElementById("s-split");
  dimOpts.forEach(o=>{const b=document.createElement("button");b.type="button";b.textContent=o[1];b.dataset.v=o[0];b.id="s-split-"+o[0];
    b.addEventListener("click",()=>{b.classList.remove("pop");void b.offsetWidth;b.classList.add("pop");
      const d=o[0];
      if(state.focus>=0){ /* while a group is open, across is fixed to its members; only depth can change */
        if(d===DRILL.key)return;
        state.z=(state.z===d)?"none":d;sync();if(phase!=="spill")startSpill();return;}
      if(state.x===d){state.x=state.z;state.z="none";}
      else if(state.z===d){state.z="none";}
      else if(state.x==="none"){state.x=d;}
      else{state.z=d;}
      sync();if(phase!=="spill")startSpill();});
    box.appendChild(b);});})();
seg("s-c",dimOpts,"c");

const sndBtn=document.getElementById("snd");
function sndSync(){const b=document.getElementById("snd");b.setAttribute("aria-pressed",String(sndOn));b.textContent=!sndOn?"音 オフ":sndErr?"音 不可":(!sndTried||(ac&&ac.state==="running"))?"音 オン":"音 待機中";}
sndBtn.addEventListener("click",function(){sndOn=!sndOn;try{localStorage.setItem("ballpool-sound",sndOn?"on":"off");}catch(e){}if(sndOn){sndErr=false;ensureAudio();setTimeout(function(){blip(523.3,0.2,0.25);},120);}else if(unl){unl.pause();}sndSync();});
document.addEventListener("visibilitychange",function(){if(document.hidden){if(unl)unl.pause();}else if(ac&&sndOn&&ac.state!=="running"){ac.resume().then(sndSync,function(){});}});
document.getElementById("controls").addEventListener("click",ensureAudio,true);
stage.addEventListener("click",ensureAudio);
/* any tap or key press anywhere may start the sound (some browsers only allow it on touchend or click) */
["touchend","click","keydown"].forEach(function(t){document.addEventListener(t,function(e){if(e.target&&e.target.id==="snd")return;ensureAudio();},{capture:true,passive:true});});
sndSync();
function retheme(){paint();detail();phase="";layout("first");}
new MutationObserver(retheme).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",retheme);
new ResizeObserver(()=>{resize();}).observe(stage);
sync();fact();resize();layout("first");requestAnimationFrame(tick);
window.__app={snd:function(){return {state:ac?ac.state:"none",tried:sndTried,fail:sndFail,err:sndErr,on:sndOn,rate:ac?ac.sampleRate:0,count:sfxCount};},state,layout,cam,sync,fact,sfx:function(){return sfxCount;},audio:function(){return ac?ac.state:"none";}};
})();
