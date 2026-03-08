/* ══ SKETCHBOARD PRO  script.js ══════════════════ */
'use strict';

/* ══ STATE ══════════════════════════════════════ */
const S = {
  els:{}, nextId:1, maxZ:10,
  tool:'select',
  selId:null,
  multiSel:new Set(),   // IDs of multi-selected elements
  editId:null,

  panX:0, panY:0, scale:1,
  MIN:0.08, MAX:5,

  // Drag
  drag:false, dragId:null, dragOX:0, dragOY:0, dragMoved:false,
  multiDragOX:{}, multiDragOY:{},
  // Resize
  resz:false, rszId:null, rszW0:0, rszH0:0, rszX0:0, rszY0:0,
  // Pan
  pan:false, panX0:0, panY0:0, panPX:0, panPY:0,
  // Space-to-pan
  spaceDown:false, prevTool:'select',
  // Drag-select (rubber band)
  lasso:false, lassoX0:0, lassoY0:0,

  color:'#6366f1', font:"'Outfit',sans-serif", fs:16,
  fonts:[],
  theme:'dark',

  hist:[], histIdx:-1,
};

/* ══ DOM ════════════════════════════════════════ */
const g = id => document.getElementById(id);

const D = {
  world:g('world'), canvas:g('canvas'), selBox:g('selBox'),
  undoBtn:g('btnUndo'), redoBtn:g('btnRedo'),
  zoomInBtn:g('btnZoomIn'), zoomOutBtn:g('btnZoomOut'),
  zoomLabel:g('btnZoom'), fitBtn:g('btnFit'), themeBtn:g('btnTheme'),
  exportBtn:g('btnExport'), importBtn:g('btnImport'),
  searchIn:g('searchIn'), searchDrop:g('searchDrop'),
  swatches:g('swatches'), colorPick:g('colorPick'),
  fontPick:g('fontPick'), uploadFontBtn:g('btnUploadFont'),
  customFontList:g('customFontList'),
  sizeBtns:g('sizeBtns'), customSz:g('customSz'),
  elCount:g('elCount'), xyPos:g('xyPos'),
  multiSec:g('multiSec'), selCount:g('selCount'),
  btnDeleteAll:g('btnDeleteAll'), btnDeselectAll:g('btnDeselectAll'),
  fmtBar:g('fmtBar'), fmtTxtColor:g('fmtTxtColor'), fmtTxtDot:g('fmtTxtDot'),
  fmtClearBtn:g('fmtClearBtn'),
  ctxMenu:g('ctxMenu'),
  minimap:g('minimap'), mmInner:g('mmInner'), mmVP:g('mmVP'), mmToggle:g('mmToggle'),
  toasts:g('toasts'), fileIn:g('fileIn'), fontIn:g('fontIn'),
  fontModal:g('fontModal'), fontDrop:g('fontDrop'), fmList:g('fmList'),
  mobNav:g('mobNav'), sheetBg:g('sheetBg'),
  addSheet:g('addSheet'), styleSheet:g('styleSheet'),
  multiSheet:g('multiSheet'), mobSelCount:g('mobSelCount'),
  mobSwatches:g('mobSwatches'), mobSizes:g('mobSizes'),
};

/* ══ HISTORY ════════════════════════════════════ */
function snap(){return{els:JSON.parse(JSON.stringify(S.els)),nextId:S.nextId,maxZ:S.maxZ}}
function pushH(){
  S.hist=S.hist.slice(0,S.histIdx+1);
  S.hist.push(snap());
  if(S.hist.length>100)S.hist.shift();else S.histIdx++;
  syncH();
}
function undo(){
  if(S.histIdx<=0)return;
  S.histIdx--;restore(S.hist[S.histIdx]);syncH();toast('Undone');
}
function redo(){
  if(S.histIdx>=S.hist.length-1)return;
  S.histIdx++;restore(S.hist[S.histIdx]);syncH();toast('Redone');
}
function restore(s){
  S.els=JSON.parse(JSON.stringify(s.els));
  S.nextId=s.nextId;S.maxZ=s.maxZ;
  clearSel();D.fmtBar.classList.remove('on');
  rebuildAll();countEls();schedMM();
}
function syncH(){D.undoBtn.disabled=S.histIdx<=0;D.redoBtn.disabled=S.histIdx>=S.hist.length-1;}

/* ══ CREATE ═════════════════════════════════════ */
function gid(){return'e'+(S.nextId++)}
function center(w,h){
  const r=D.canvas.getBoundingClientRect();
  return{x:(r.width/2-S.panX)/S.scale-w/2,y:(r.height/2-S.panY)/S.scale-h/2};
}

function addCard(){
  pushH();const p=center(260,150);const n=Object.keys(S.els).length+1;
  const id=gid();S.maxZ++;
  S.els[id]={id,k:'card',x:p.x,y:p.y,w:260,h:150,
    title:'Card '+n,content:'',color:S.color,font:S.font,fs:S.fs,locked:false,z:S.maxZ};
  render(S.els[id]);countEls();schedMM();
  setTimeout(()=>{sel(id);g(id)?.querySelector('.card-title')?.focus();},40);
}
function addText(){
  pushH();const p=center(180,40);const id=gid();S.maxZ++;
  S.els[id]={id,k:'text',x:p.x,y:p.y,w:180,
    title:'Free Text',content:'',color:S.color,font:S.font,fs:S.fs,z:S.maxZ};
  render(S.els[id]);countEls();schedMM();
  setTimeout(()=>{
    sel(id);const ed=g(id)?.querySelector('.fte');
    if(ed){ed.focus();caretEnd(ed);}
  },40);
}
function addSticky(){
  pushH();const p=center(190,160);const n=Object.keys(S.els).length+1;
  const id=gid();S.maxZ++;
  const cols=['#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa','#a7f3d0'];
  const c=S.color==='#6366f1'?cols[n%cols.length]:S.color;
  S.els[id]={id,k:'sticky',x:p.x,y:p.y,w:190,h:160,
    title:'Note '+n,content:'',color:c,font:S.font,fs:S.fs,locked:false,z:S.maxZ};
  render(S.els[id]);countEls();schedMM();
  setTimeout(()=>{sel(id);g(id)?.querySelector('.sticky-title')?.focus();},40);
}

/* ══ RENDER ═════════════════════════════════════ */
function render(d){
  g(d.id)?.remove();
  const el=d.k==='card'?buildCard(d):d.k==='sticky'?buildSticky(d):buildFText(d);
  el.style.zIndex=d.z||10;D.world.appendChild(el);
}
function rebuildAll(){
  D.world.innerHTML='';
  Object.values(S.els).sort((a,b)=>(a.z||10)-(b.z||10)).forEach(render);
}
function pos(el,d){
  el.style.left=d.x+'px';el.style.top=d.y+'px';
  if(d.w)el.style.width=d.w+'px';
  if(d.h)el.style.minHeight=d.h+'px';
}

/* ── Card ── */
function buildCard(d){
  const el=document.createElement('div');
  el.className='card';el.id=d.id;pos(el,d);
  el.style.setProperty('--c',d.color);
  el.style.fontFamily=d.font;el.style.fontSize=d.fs+'px';
  if(d.locked)el.classList.add('locked');
  el.innerHTML=`
    <div class="card-head" data-dh>
      <div class="card-dot"></div>
      <input class="card-title" type="text" value="${esc(d.title)}" placeholder="Title…" spellcheck="false"/>
      <div class="card-acts">
        <button class="ca${d.locked?' locked-ico':''}" data-a="lock" title="${d.locked?'Unlock':'Lock'}">${d.locked?icoLock():icoUnlock()}</button>
        <button class="ca del" data-a="del" title="Delete">${icoTrash()}</button>
      </div>
    </div>
    <div class="card-body"><div class="ce" contenteditable="${d.locked?'false':'true'}" data-ph="Write something…">${d.content}</div></div>
    <div class="rsz">${icoRsz()}</div>`;
  wireCard(el,d.id);return el;
}
function wireCard(el,id){
  const head=el.querySelector('[data-dh]'),ti=el.querySelector('.card-title'),ed=el.querySelector('.ce'),rsz=el.querySelector('.rsz');
  head.addEventListener('mousedown',e=>{
    if(e.target===ti)return;e.preventDefault();
    if(S.els[id]?.locked||S.tool==='hand')return;
    startDrag(id,e.clientX,e.clientY);
  });
  head.addEventListener('touchstart',e=>{
    if(e.target===ti)return;
    if(S.els[id]?.locked)return;
    startDrag(id,e.touches[0].clientX,e.touches[0].clientY);
  },{passive:true});
  el.addEventListener('mousedown',e=>{
    if(S.tool==='hand')return;
    if(!e.target.closest('.ca')&&!e.target.closest('.rsz')){
      handleElClick(id,e);
    }
    e.stopPropagation();
  });
  el.addEventListener('contextmenu',e=>{e.preventDefault();showCtx(e,id);});
  ti.addEventListener('input',()=>{if(S.els[id])S.els[id].title=ti.value;schedMM();});
  ti.addEventListener('change',pushH);
  ed.addEventListener('focus',()=>{S.editId=id;showFmt();syncFmt();});
  ed.addEventListener('blur',()=>blurEditor(id,ed));
  ed.addEventListener('input',()=>{if(S.els[id])S.els[id].content=ed.innerHTML;schedMM();});
  ed.addEventListener('keyup',syncFmt);ed.addEventListener('mouseup',syncFmt);
  el.querySelector('[data-a="lock"]').addEventListener('click',e=>{e.stopPropagation();toggleLock(id);});
  el.querySelector('[data-a="del"]').addEventListener('click',e=>{e.stopPropagation();delEl(id);});
  rsz.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();if(!S.els[id]?.locked)startRsz(id,e.clientX,e.clientY);});
  rsz.addEventListener('touchstart',e=>{e.stopPropagation();if(!S.els[id]?.locked)startRsz(id,e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
}

/* ── Sticky ── */
function buildSticky(d){
  const el=document.createElement('div');
  el.className='sticky';el.id=d.id;pos(el,d);
  el.style.background=d.color;el.style.fontFamily=d.font;el.style.fontSize=d.fs+'px';
  if(d.locked)el.classList.add('locked');
  el.innerHTML=`
    <div class="sticky-ear"></div>
    <div class="sticky-head" data-dh>
      <input class="sticky-title" type="text" value="${esc(d.title)}" placeholder="Title…" spellcheck="false"/>
      <div class="sticky-acts">
        <button class="sa" data-a="lock" title="${d.locked?'Unlock':'Lock'}">${d.locked?icoLock():icoUnlock()}</button>
        <button class="sa" data-a="del" title="Delete">${icoTrash()}</button>
      </div>
    </div>
    <div class="sticky-body"><div class="se" contenteditable="${d.locked?'false':'true'}" data-ph="Quick note…">${d.content}</div></div>
    <div class="rsz">${icoRsz()}</div>`;
  wireSticky(el,d.id);return el;
}
function wireSticky(el,id){
  const head=el.querySelector('[data-dh]'),ti=el.querySelector('.sticky-title'),ed=el.querySelector('.se'),rsz=el.querySelector('.rsz');
  head.addEventListener('mousedown',e=>{
    if(e.target===ti)return;e.preventDefault();
    if(S.els[id]?.locked||S.tool==='hand')return;
    startDrag(id,e.clientX,e.clientY);
  });
  head.addEventListener('touchstart',e=>{
    if(e.target===ti)return;
    if(S.els[id]?.locked)return;
    startDrag(id,e.touches[0].clientX,e.touches[0].clientY);
  },{passive:true});
  el.addEventListener('mousedown',e=>{
    if(S.tool==='hand')return;
    if(!e.target.closest('.sa')&&!e.target.closest('.rsz')){
      handleElClick(id,e);
    }
    e.stopPropagation();
  });
  el.addEventListener('contextmenu',e=>{e.preventDefault();showCtx(e,id);});
  ti.addEventListener('input',()=>{if(S.els[id])S.els[id].title=ti.value;schedMM();});
  ti.addEventListener('change',pushH);
  ed.addEventListener('focus',()=>{S.editId=id;showFmt();syncFmt();});
  ed.addEventListener('blur',()=>blurEditor(id,ed));
  ed.addEventListener('input',()=>{if(S.els[id])S.els[id].content=ed.innerHTML;schedMM();});
  ed.addEventListener('keyup',syncFmt);ed.addEventListener('mouseup',syncFmt);
  el.querySelector('[data-a="lock"]').addEventListener('click',e=>{e.stopPropagation();toggleLock(id);});
  el.querySelector('[data-a="del"]').addEventListener('click',e=>{e.stopPropagation();delEl(id);});
  rsz.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();if(!S.els[id]?.locked)startRsz(id,e.clientX,e.clientY);});
  rsz.addEventListener('touchstart',e=>{e.stopPropagation();if(!S.els[id]?.locked)startRsz(id,e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
}

/* ── Free Text ── */
function buildFText(d){
  const el=document.createElement('div');
  el.className='ftext';el.id=d.id;
  el.style.left=d.x+'px';el.style.top=d.y+'px';el.style.width=(d.w||180)+'px';
  el.style.fontFamily=d.font;el.style.fontSize=d.fs+'px';el.style.color=d.color;
  el.innerHTML=`
    <div class="ft-bar">
      <button class="ftb" data-a="lock" title="Lock">${icoUnlock()}</button>
      <button class="ftb del" data-a="del" title="Delete">${icoTrash()}</button>
    </div>
    <div class="fte" contenteditable="true" data-ph="Type freely…">${d.content}</div>
    <div class="rsz">${icoRsz()}</div>`;
  wireFText(el,d.id);return el;
}
function wireFText(el,id){
  const ed=el.querySelector('.fte'),rsz=el.querySelector('.rsz');
  el.addEventListener('mousedown',e=>{
    if(S.tool==='hand')return;
    if(e.target.closest('.ftb')||e.target.closest('.rsz'))return;
    if(e.target===ed&&S.selId===id)return;
    handleElClick(id,e);
    if(e.target!==ed){e.preventDefault();startDrag(id,e.clientX,e.clientY);}
    e.stopPropagation();
  });
  el.addEventListener('touchstart',e=>{
    if(e.target.closest('.ftb')||e.target.closest('.rsz'))return;
    if(e.target===ed)return;
    startDrag(id,e.touches[0].clientX,e.touches[0].clientY);
  },{passive:true});
  el.addEventListener('contextmenu',e=>{e.preventDefault();showCtx(e,id);});
  el.querySelector('[data-a="lock"]').addEventListener('click',e=>{e.stopPropagation();toggleLock(id);});
  el.querySelector('[data-a="del"]').addEventListener('click',e=>{e.stopPropagation();delEl(id);});
  ed.addEventListener('focus',()=>{S.editId=id;showFmt();syncFmt();});
  ed.addEventListener('blur',()=>{
    if(S.els[id]){
      S.els[id].content=ed.innerHTML;
      const t=ed.innerText.replace(/\s+/g,' ').trim();
      S.els[id].title=t?(t.length>44?t.slice(0,44)+'…':t):'Free Text';
    }
    pushH();
    setTimeout(()=>{if(!document.activeElement?.closest('#fmtBar')){S.editId=null;hideFmt();}},100);
  });
  ed.addEventListener('input',()=>{
    if(S.els[id]){
      S.els[id].content=ed.innerHTML;
      const t=ed.innerText.replace(/\s+/g,' ').trim();
      S.els[id].title=t?(t.length>44?t.slice(0,44)+'…':t):'Free Text';
    }
    schedMM();
  });
  ed.addEventListener('keyup',syncFmt);ed.addEventListener('mouseup',syncFmt);
  rsz.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();startRsz(id,e.clientX,e.clientY);});
  rsz.addEventListener('touchstart',e=>{e.stopPropagation();startRsz(id,e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
}

function blurEditor(id,ed){
  if(S.els[id])S.els[id].content=ed.innerHTML;
  pushH();
  setTimeout(()=>{if(!document.activeElement?.closest('#fmtBar')){S.editId=null;hideFmt();}},100);
}

/* ══ DRAG ═══════════════════════════════════════ */
function startDrag(id,cx,cy){
  S.drag=true;S.dragId=id;S.dragMoved=false;
  const d=S.els[id],w=c2w(cx,cy);
  S.dragOX=w.x-d.x;S.dragOY=w.y-d.y;
  // If part of multi-select, prep offsets for all
  if(S.multiSel.has(id)&&S.multiSel.size>1){
    S.multiSel.forEach(mid=>{
      const md=S.els[mid];if(!md)return;
      S.multiDragOX[mid]=w.x-md.x;S.multiDragOY[mid]=w.y-md.y;
    });
  }
  if(!S.multiSel.has(id)){sel(id);}
  bringFront(id,false);
  const dom=g(id);
  if(dom){dom.style.transition='none';dom.style.zIndex=S.maxZ+20;}
}
function onDragMove(cx,cy){
  if(!S.drag)return;
  const w=c2w(cx,cy);
  if(S.multiSel.size>1&&S.multiSel.has(S.dragId)){
    S.multiSel.forEach(mid=>{
      const md=S.els[mid];if(!md)return;
      md.x=w.x-(S.multiDragOX[mid]||0);md.y=w.y-(S.multiDragOY[mid]||0);
      const dom=g(mid);if(dom){dom.style.left=md.x+'px';dom.style.top=md.y+'px';}
    });
  } else {
    const d=S.els[S.dragId];if(!d)return;
    d.x=w.x-S.dragOX;d.y=w.y-S.dragOY;
    const dom=g(S.dragId);if(dom){dom.style.left=d.x+'px';dom.style.top=d.y+'px';}
    D.xyPos.textContent=Math.round(d.x)+', '+Math.round(d.y);
  }
  S.dragMoved=true;schedMM();
}
function endDrag(){
  if(!S.drag)return;
  const dom=g(S.dragId);
  if(dom){dom.style.transition='';dom.style.zIndex=S.els[S.dragId]?.z||10;}
  if(S.dragMoved)pushH();
  S.drag=false;S.dragId=null;S.multiDragOX={};S.multiDragOY={};
}

/* ══ RESIZE ═════════════════════════════════════ */
function startRsz(id,cx,cy){
  S.resz=true;S.rszId=id;
  const d=S.els[id];S.rszW0=d.w||200;S.rszH0=d.h||150;S.rszX0=cx;S.rszY0=cy;
}
function onRszMove(cx,cy){
  if(!S.resz)return;
  const d=S.els[S.rszId];if(!d)return;
  const dw=(cx-S.rszX0)/S.scale,dh=(cy-S.rszY0)/S.scale;
  d.w=Math.max(d.k==='text'?60:150,S.rszW0+dw);
  if(d.k!=='text')d.h=Math.max(80,S.rszH0+dh);
  const dom=g(S.rszId);
  if(dom){dom.style.width=d.w+'px';if(d.k!=='text')dom.style.minHeight=d.h+'px';}
  schedMM();
}
function endRsz(){if(!S.resz)return;pushH();S.resz=false;S.rszId=null;}

/* ══ PAN ════════════════════════════════════════ */
function startPan(cx,cy){
  S.pan=true;S.panX0=cx;S.panY0=cy;S.panPX=S.panX;S.panPY=S.panY;
  D.canvas.classList.add('grabbing');
}
function onPanMove(cx,cy){
  if(!S.pan)return;
  S.panX=S.panPX+(cx-S.panX0);S.panY=S.panPY+(cy-S.panY0);applyXform();
}
function endPan(){if(!S.pan)return;S.pan=false;D.canvas.classList.remove('grabbing');setCursor();}

/* ══ LASSO SELECT ═══════════════════════════════ */
function startLasso(cx,cy){
  const r=D.canvas.getBoundingClientRect();
  S.lasso=true;S.lassoX0=cx-r.left;S.lassoY0=cy-r.top;
  D.selBox.style.left=S.lassoX0+'px';D.selBox.style.top=S.lassoY0+'px';
  D.selBox.style.width='0';D.selBox.style.height='0';
  D.selBox.classList.add('show');
}
function onLassoMove(cx,cy){
  if(!S.lasso)return;
  const r=D.canvas.getBoundingClientRect();
  const mx=cx-r.left,my=cy-r.top;
  const x=Math.min(mx,S.lassoX0),y=Math.min(my,S.lassoY0);
  const w=Math.abs(mx-S.lassoX0),h=Math.abs(my-S.lassoY0);
  D.selBox.style.left=x+'px';D.selBox.style.top=y+'px';
  D.selBox.style.width=w+'px';D.selBox.style.height=h+'px';
}
function endLasso(cx,cy){
  if(!S.lasso)return;
  D.selBox.classList.remove('show');S.lasso=false;
  const r=D.canvas.getBoundingClientRect();
  const mx=cx-r.left,my=cy-r.top;
  const lx=Math.min(mx,S.lassoX0),ly=Math.min(my,S.lassoY0);
  const lw=Math.abs(mx-S.lassoX0),lh=Math.abs(my-S.lassoY0);
  if(lw<6&&lh<6)return; // too small = just a click
  // Convert lasso box to world coords
  const wx=(lx-S.panX)/S.scale,wy=(ly-S.panY)/S.scale;
  const ww=lw/S.scale,wh=lh/S.scale;
  const hits=[];
  Object.values(S.els).forEach(d=>{
    const ew=d.w||180,eh=d.h||40;
    if(d.x<wx+ww&&d.x+ew>wx&&d.y<wy+wh&&d.y+eh>wy)hits.push(d.id);
  });
  if(hits.length){
    clearSel();
    hits.forEach(id=>addToMultiSel(id));
    updateMultiUI();
    toast(hits.length+' selected');
  }
}

/* ══ SELECTION ══════════════════════════════════ */
function handleElClick(id,e){
  if(e.shiftKey||e.ctrlKey||e.metaKey){
    // Shift/Ctrl = add to multi-select
    if(S.multiSel.has(id)){
      removeFromMultiSel(id);
    } else {
      if(S.selId&&!S.multiSel.has(S.selId))addToMultiSel(S.selId);
      addToMultiSel(id);
      S.selId=null;
    }
    updateMultiUI();
  } else {
    if(S.multiSel.size>0)clearSel();
    sel(id);
  }
}
function sel(id){
  if(S.selId===id)return;
  desel();S.selId=id;
  g(id)?.classList.add('sel');
  const d=S.els[id];
  if(d){
    S.color=d.color;syncColorUI(d.color);
    if(d.font){S.font=d.font;D.fontPick.value=d.font;}
    if(d.fs){S.fs=d.fs;D.customSz.value=d.fs;syncSzUI(d.fs);}
  }
}
function desel(){
  if(S.selId){g(S.selId)?.classList.remove('sel');S.selId=null;}
}
function clearSel(){
  desel();
  S.multiSel.forEach(id=>g(id)?.classList.remove('sel'));
  S.multiSel.clear();
  updateMultiUI();
}
function addToMultiSel(id){
  S.multiSel.add(id);
  g(id)?.classList.add('sel');
}
function removeFromMultiSel(id){
  S.multiSel.delete(id);
  g(id)?.classList.remove('sel');
}
function updateMultiUI(){
  const n=S.multiSel.size;
  const hasMul=n>0;
  D.multiSec.style.display=hasMul?'block':'none';
  D.selCount.textContent=n;
  D.mobSelCount.textContent=n;
  // show/hide mobile multi-sheet
  if(isMobile()){
    if(hasMul){openSheet(D.multiSheet);}
    else{D.multiSheet.classList.remove('on');}
  }
}
function selectAll(){
  clearSel();
  Object.keys(S.els).forEach(id=>addToMultiSel(id));
  updateMultiUI();
  if(S.multiSel.size>0)toast('All selected ('+S.multiSel.size+')');
}

/* ══ Z-ORDER / LOCK / DELETE / DUP ══════════════ */
function toggleLock(id){
  const d=S.els[id];if(!d)return;
  d.locked=!d.locked;render(d);
  if(S.selId===id)g(id)?.classList.add('sel');
  pushH();toast(d.locked?'Locked':'Unlocked');
}
function delEl(id){
  const dom=g(id);
  if(dom){dom.style.opacity='0';dom.style.transform+=' scale(.82)';dom.style.transition='all .14s';setTimeout(()=>dom.remove(),150);}
  delete S.els[id];
  if(S.selId===id)S.selId=null;
  S.multiSel.delete(id);
  if(S.editId===id){S.editId=null;hideFmt();}
  countEls();schedMM();
}
function deleteSelected(){
  if(S.multiSel.size>0){
    pushH();
    S.multiSel.forEach(id=>delEl(id));
    clearSel();
    toast('Deleted');
  } else if(S.selId){
    pushH();delEl(S.selId);
  }
}
function bringFront(id,doH=true){
  const d=S.els[id];if(!d)return;
  if(doH)pushH();
  S.maxZ++;d.z=S.maxZ;
  const dom=g(id);if(dom)dom.style.zIndex=S.maxZ;
  if(doH)toast('Brought to front');
}
function sendBack(id){
  const d=S.els[id];if(!d)return;
  pushH();
  const minZ=Math.min(...Object.values(S.els).map(e=>e.z||10));
  d.z=minZ-1;const dom=g(id);if(dom)dom.style.zIndex=d.z;
  toast('Sent to back');
}
function dupEl(id){
  const src=S.els[id];if(!src)return;
  pushH();const nid=gid();S.maxZ++;
  S.els[nid]={...JSON.parse(JSON.stringify(src)),id:nid,x:src.x+24,y:src.y+24,z:S.maxZ};
  render(S.els[nid]);countEls();schedMM();
  setTimeout(()=>sel(nid),20);toast('Duplicated');
}
function applyColor(c){
  S.color=c;syncColorUI(c);
  const ids=S.multiSel.size>0?[...S.multiSel]:(S.selId?[S.selId]:[]);
  ids.forEach(id=>{
    const d=S.els[id];if(!d)return;
    d.color=c;const dom=g(id);if(!dom)return;
    if(d.k==='card'){dom.style.setProperty('--c',c);dom.querySelector('.card-dot')&&(dom.querySelector('.card-dot').style.background=c);}
    else if(d.k==='sticky')dom.style.background=c;
    else if(d.k==='text')dom.style.color=c;
  });
  if(ids.length)pushH();schedMM();
}
function applyProp(prop,val){
  if(prop==='font')S.font=val;if(prop==='fs')S.fs=val;
  const ids=S.multiSel.size>0?[...S.multiSel]:(S.selId?[S.selId]:[]);
  ids.forEach(id=>{
    const d=S.els[id];if(!d)return;
    d[prop]=val;const dom=g(id);if(!dom)return;
    if(prop==='font')dom.style.fontFamily=val;
    if(prop==='fs')dom.style.fontSize=val+'px';
  });
  if(ids.length)pushH();
}

/* ══ CONTEXT MENU ═══════════════════════════════ */
let ctxId=null;
function showCtx(e,id){
  ctxId=id;
  const m=D.ctxMenu;m.classList.add('on');
  let x=e.clientX,y=e.clientY;
  m.style.left=x+'px';m.style.top=y+'px';
  requestAnimationFrame(()=>{
    const r=m.getBoundingClientRect();
    if(x+r.width>window.innerWidth-8)x-=r.width;
    if(y+r.height>window.innerHeight-8)y-=r.height;
    m.style.left=x+'px';m.style.top=y+'px';
  });
}
function hideCtx(){D.ctxMenu.classList.remove('on');ctxId=null;}
D.ctxMenu.addEventListener('click',e=>{
  const btn=e.target.closest('[data-a]');if(!btn||!ctxId)return;
  const id=ctxId;hideCtx();
  const a=btn.dataset.a;
  if(a==='duplicate')dupEl(id);
  if(a==='front')bringFront(id);
  if(a==='back')sendBack(id);
  if(a==='delete'){pushH();delEl(id);}
});
document.addEventListener('click',e=>{if(!D.ctxMenu.contains(e.target))hideCtx();});

/* ══ CANVAS TRANSFORM ═══════════════════════════ */
function applyXform(){
  D.world.style.transform=`translate(${S.panX}px,${S.panY}px) scale(${S.scale})`;
  D.zoomLabel.textContent=Math.round(S.scale*100)+'%';schedMM();
}
function c2w(cx,cy){
  const r=D.canvas.getBoundingClientRect();
  return{x:(cx-r.left-S.panX)/S.scale,y:(cy-r.top-S.panY)/S.scale};
}
function zoomAt(f,cx,cy){
  const r=D.canvas.getBoundingClientRect();
  const ox=(cx!==undefined?cx:r.width/2)-r.left;
  const oy=(cy!==undefined?cy:r.height/2)-r.top;
  const ns=Math.min(S.MAX,Math.max(S.MIN,S.scale*f));
  const ratio=ns/S.scale;
  S.panX=ox-(ox-S.panX)*ratio;S.panY=oy-(oy-S.panY)*ratio;
  S.scale=ns;applyXform();
}
function resetView(){S.scale=1;S.panX=0;S.panY=0;applyXform();toast('View reset');}
function fitScreen(){
  const els=Object.values(S.els);if(!els.length){resetView();return;}
  let mnX=1e9,mnY=1e9,mxX=-1e9,mxY=-1e9;
  els.forEach(e=>{mnX=Math.min(mnX,e.x);mnY=Math.min(mnY,e.y);mxX=Math.max(mxX,e.x+(e.w||180));mxY=Math.max(mxY,e.y+(e.h||40));});
  const pad=80,bw=mxX-mnX+pad*2,bh=mxY-mnY+pad*2;
  const r=D.canvas.getBoundingClientRect();
  S.scale=Math.min(1.5,Math.max(S.MIN,Math.min(r.width/bw,r.height/bh)));
  S.panX=r.width/2-(mnX-pad+bw/2)*S.scale;S.panY=r.height/2-(mnY-pad+bh/2)*S.scale;
  applyXform();toast('Fit to screen');
}
function setTool(t){
  S.tool=t;
  document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
  g('mnPan')?.classList.toggle('on',t==='hand');
  setCursor();
}
function setCursor(){
  D.canvas.classList.toggle('hand',S.tool==='hand'&&!S.pan);
}
function goTo(id){
  const d=S.els[id];if(!d)return;
  const r=D.canvas.getBoundingClientRect();
  S.panX=r.width/2-(d.x+(d.w||180)/2)*S.scale;
  S.panY=r.height/2-(d.y+(d.h||40)/2)*S.scale;
  applyXform();sel(id);
  const dom=g(id);if(dom){dom.classList.add('flsh');setTimeout(()=>dom.classList.remove('flsh'),900);}
}

/* ══ FORMAT BAR ═════════════════════════════════ */
function showFmt(){D.fmtBar.classList.add('on');}
function hideFmt(){D.fmtBar.classList.remove('on');}
function syncFmt(){
  ['bold','italic','underline','strikeThrough'].forEach(cmd=>{
    const b=D.fmtBar.querySelector(`[data-cmd="${cmd}"]`);
    if(b)b.classList.toggle('on',document.queryCommandState(cmd));
  });
}
function execFmt(cmd){document.execCommand(cmd,false,null);syncFmt();saveEd();}
function saveEd(){
  const id=S.editId;if(!id||!S.els[id])return;
  const d=S.els[id];
  const sel=d.k==='card'?'.ce':d.k==='sticky'?'.se':'.fte';
  const dom=g(id)?.querySelector(sel);if(dom)d.content=dom.innerHTML;
}

/* ══ SEARCH ═════════════════════════════════════ */
function stripH(h){const t=document.createElement('div');t.innerHTML=h;return t.innerText.replace(/\s+/g,' ').trim();}
function dname(d){
  if(d.k==='text')return(d.title&&d.title!=='Free Text')?d.title:(stripH(d.content).slice(0,44)||'Free Text');
  return d.title||'Untitled';
}
function doSearch(q){
  q=q.trim().toLowerCase();D.searchDrop.innerHTML='';
  if(!q){D.searchDrop.classList.remove('open');return;}
  const hits=Object.values(S.els).filter(d=>dname(d).toLowerCase().includes(q)||stripH(d.content).toLowerCase().includes(q));
  if(!hits.length){D.searchDrop.innerHTML='<div class="sr-empty">No results</div>';}
  else{
    const lbl={card:'Card',sticky:'Sticky',text:'Text'};
    hits.forEach(d=>{
      const item=document.createElement('div');item.className='sr';
      item.innerHTML=`<span class="sr-dot" style="background:${d.color}"></span><span>${esc(dname(d))}</span><span class="sr-kind">${lbl[d.k]||''}</span>`;
      item.addEventListener('click',()=>{goTo(d.id);D.searchDrop.classList.remove('open');D.searchIn.value='';});
      D.searchDrop.appendChild(item);
    });
  }
  D.searchDrop.classList.add('open');
}

/* ══ MINIMAP ════════════════════════════════════ */
let mmT=null;
function schedMM(){if(!mmT)mmT=requestAnimationFrame(()=>{mmT=null;drawMM();});}
function drawMM(){
  D.mmInner.querySelectorAll('.mm-dot').forEach(d=>d.remove());
  const mw=D.mmInner.offsetWidth,mh=D.mmInner.offsetHeight;
  const els=Object.values(S.els);if(!els.length){D.mmVP.style.display='none';return;}
  let mnX=1e9,mnY=1e9,mxX=-1e9,mxY=-1e9;
  els.forEach(e=>{mnX=Math.min(mnX,e.x);mnY=Math.min(mnY,e.y);mxX=Math.max(mxX,e.x+(e.w||180));mxY=Math.max(mxY,e.y+(e.h||40));});
  const pad=50;mnX-=pad;mnY-=pad;mxX+=pad;mxY+=pad;
  const ww=mxX-mnX,wh=mxY-mnY;if(ww<=0||wh<=0)return;
  const sc=Math.min(mw/ww,mh/wh);
  els.forEach(e=>{
    const dot=document.createElement('div');dot.className='mm-dot';
    dot.style.cssText=`left:${(e.x-mnX+(e.w||40)/2)*sc}px;top:${(e.y-mnY+(e.h||16)/2)*sc}px;width:${Math.max(6,(e.w||40)*sc)}px;height:${Math.max(4,(e.h||16)*sc)}px;background:${e.color};opacity:.7`;
    dot.title=dname(e);
    dot.addEventListener('click',ev=>{ev.stopPropagation();goTo(e.id);});
    D.mmInner.appendChild(dot);
  });
  const r=D.canvas.getBoundingClientRect();
  D.mmVP.style.display='block';
  D.mmVP.style.left=(-S.panX/S.scale-mnX)*sc+'px';
  D.mmVP.style.top=(-S.panY/S.scale-mnY)*sc+'px';
  D.mmVP.style.width=(r.width/S.scale)*sc+'px';
  D.mmVP.style.height=(r.height/S.scale)*sc+'px';
}

/* ══ EXPORT / IMPORT ════════════════════════════ */
function exportBoard(){
  const data={v:2,theme:S.theme,panX:S.panX,panY:S.panY,scale:S.scale,
    els:Object.values(S.els),fonts:S.fonts.map(f=>({name:f.name,url:f.url}))};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download='sketchboard_'+Date.now()+'.json';a.click();toast('Exported!');
}
function importBoard(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);if(!data.els)throw 0;
      pushH();S.els={};
      data.els.forEach(d=>S.els[d.id]=d);
      const nums=data.els.map(d=>parseInt((d.id||'').replace(/\D/g,''))).filter(n=>!isNaN(n));
      S.nextId=nums.length?Math.max(...nums)+1:1;
      if(data.panX!==undefined){S.panX=data.panX;S.panY=data.panY;S.scale=data.scale;}
      if(data.theme)setTheme(data.theme);
      if(data.fonts?.length)data.fonts.forEach(f=>loadFont(f.name,f.url));
      rebuildAll();applyXform();countEls();schedMM();clearSel();toast('Imported!');
    }catch{toast('Invalid JSON');}
  };
  reader.readAsText(file);
}

/* ══ FONTS ══════════════════════════════════════ */
function handleFontFiles(files){
  Array.from(files).forEach(f=>{
    if(!/\.(ttf|otf|woff|woff2)$/i.test(f.name)){toast('Unsupported: '+f.name);return;}
    const reader=new FileReader();
    reader.onload=e=>{const name=f.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');loadFont(name,e.target.result);toast('Loaded: '+name);};
    reader.readAsDataURL(f);
  });
}
function loadFont(name,url){
  if(S.fonts.find(f=>f.name===name))return;
  const style=document.createElement('style');
  style.textContent=`@font-face{font-family:'${name}';src:url('${url}')}`;
  document.head.appendChild(style);
  S.fonts.push({name,url});
  const val=`'${name}',sans-serif`;
  if(!Array.from(D.fontPick.options).find(o=>o.value===val))D.fontPick.appendChild(new Option(name,val));
  renderFontList();
}
function removeFont(name){
  S.fonts=S.fonts.filter(f=>f.name!==name);
  const val=`'${name}',sans-serif`;
  Array.from(D.fontPick.options).forEach(o=>{if(o.value===val)o.remove();});
  renderFontList();toast('Removed: '+name);
}
function renderFontList(){
  D.customFontList.innerHTML='';D.fmList.innerHTML='';
  S.fonts.forEach(f=>{
    const val=`'${f.name}',sans-serif`;
    const chip=document.createElement('div');chip.className='cf'+(S.font===val?' on':'');chip.style.fontFamily=val;
    chip.innerHTML=`<span>${f.name}</span><button class="cf-x" data-n="${f.name}">×</button>`;
    chip.addEventListener('click',e=>{if(!e.target.closest('.cf-x')){S.font=val;D.fontPick.value=val;applyProp('font',val);}});
    chip.querySelector('.cf-x').addEventListener('click',()=>removeFont(f.name));
    D.customFontList.appendChild(chip);
    const row=document.createElement('div');row.className='fmr';
    row.innerHTML=`<div><div class="fmr-name" style="font-family:${val}">${f.name}</div><div class="fmr-pre" style="font-family:${val}">AaBbCc 123</div></div><button class="fmr-x" data-n="${f.name}">×</button>`;
    row.querySelector('.fmr-x').addEventListener('click',()=>removeFont(f.name));
    D.fmList.appendChild(row);
  });
}

/* ══ THEME ══════════════════════════════════════ */
function setTheme(t){S.theme=t;document.documentElement.setAttribute('data-theme',t);}
function toggleTheme(){setTheme(S.theme==='dark'?'light':'dark');}

/* ══ TOAST ══════════════════════════════════════ */
function toast(msg){
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  D.toasts.appendChild(t);
  setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),180);},1800);
}

/* ══ UTILS ══════════════════════════════════════ */
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function caretEnd(el){const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r);}
function countEls(){const n=Object.keys(S.els).length;D.elCount.textContent=n+' element'+(n!==1?'s':'');}
function syncColorUI(c){
  D.colorPick.value=c;
  document.querySelectorAll('.sw').forEach(s=>s.classList.toggle('active',s.dataset.c===c));
}
function syncSzUI(sz){document.querySelectorAll('.sz').forEach(b=>b.classList.toggle('active',+b.dataset.sz===sz));}
function isMobile(){return window.innerWidth<=640;}
function icoLock(){return`<svg viewBox="0 0 12 12"><rect x="1.5" y="5.5" width="9" height="6" rx="1.5"/><path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5"/></svg>`;}
function icoUnlock(){return`<svg viewBox="0 0 12 12"><rect x="1.5" y="5.5" width="9" height="6" rx="1.5"/><path d="M3.5 5.5V4A2.5 2.5 0 0 1 8.4 3.5"/></svg>`;}
function icoTrash(){return`<svg viewBox="0 0 12 12"><polyline points="1 2.5 11 2.5"/><path d="M9.5 2.5l-.4 7a1 1 0 0 1-1 .9H3.9a1 1 0 0 1-1-.9l-.4-7"/><path d="M4.5 5v3M7.5 5v3"/><path d="M4.7 2.5V1.7A.7.7 0 0 1 5.4 1h1.2a.7.7 0 0 1 .7.7v.8"/></svg>`;}
function icoRsz(){return`<svg viewBox="0 0 10 10" stroke-width="2"><path d="M2 10L10 2M6 10L10 6"/></svg>`;}

/* ══ MOBILE SHEET ═══════════════════════════════ */
function openSheet(sheet){
  closeSheets();sheet.classList.add('on');D.sheetBg.classList.add('on');
}
function closeSheets(){
  [D.addSheet,D.styleSheet,D.multiSheet].forEach(s=>s.classList.remove('on'));
  D.sheetBg.classList.remove('on');
}

/* ══ EVENT WIRING ════════════════════════════════ */

/* Canvas mouse */
D.canvas.addEventListener('mousedown',e=>{
  if(e.button!==0)return;
  const onBg=e.target===D.canvas||e.target===D.world||e.target===D.selBox;
  if(onBg){
    hideCtx();
    if(S.tool==='hand'||S.spaceDown){startPan(e.clientX,e.clientY);}
    else{clearSel();startLasso(e.clientX,e.clientY);}
  }
});

/* Double-click on canvas bg = select all */
D.canvas.addEventListener('dblclick',e=>{
  const onBg=e.target===D.canvas||e.target===D.world;
  if(onBg&&S.tool==='select')selectAll();
});

document.addEventListener('mousemove',e=>{
  if(S.pan)onPanMove(e.clientX,e.clientY);
  else if(S.drag)onDragMove(e.clientX,e.clientY);
  else if(S.resz)onRszMove(e.clientX,e.clientY);
  else if(S.lasso)onLassoMove(e.clientX,e.clientY);
});
document.addEventListener('mouseup',e=>{
  endPan();endDrag();endRsz();
  if(S.lasso)endLasso(e.clientX,e.clientY);
});

D.canvas.addEventListener('wheel',e=>{
  e.preventDefault();zoomAt(e.deltaY<0?1.1:1/1.1,e.clientX,e.clientY);
},{passive:false});

D.canvas.addEventListener('mousemove',e=>{
  const w=c2w(e.clientX,e.clientY);
  D.xyPos.textContent=Math.round(w.x)+', '+Math.round(w.y);
});

/* Touch */
let t0=null,pinchD=null;
D.canvas.addEventListener('touchstart',e=>{
  if(e.touches.length===1){
    t0=e.touches[0];
    const tgt=t0.target;
    const onBg=tgt===D.canvas||tgt===D.world;
    if(onBg)startPan(t0.clientX,t0.clientY);
  }
  if(e.touches.length===2){
    pinchD=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    endPan();
  }
},{passive:true});
D.canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===2&&pinchD){
    const nd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    const mx=(e.touches[0].clientX+e.touches[1].clientX)/2,my=(e.touches[0].clientY+e.touches[1].clientY)/2;
    zoomAt(nd/pinchD,mx,my);pinchD=nd;
  } else if(e.touches.length===1){
    if(S.pan)onPanMove(e.touches[0].clientX,e.touches[0].clientY);
    else if(S.drag)onDragMove(e.touches[0].clientX,e.touches[0].clientY);
  }
},{passive:false});
D.canvas.addEventListener('touchend',()=>{pinchD=null;endPan();endDrag();endRsz();});

/* Toolbar */
D.undoBtn.addEventListener('click',undo);
D.redoBtn.addEventListener('click',redo);
D.zoomInBtn.addEventListener('click',()=>zoomAt(1.2));
D.zoomOutBtn.addEventListener('click',()=>zoomAt(1/1.2));
D.zoomLabel.addEventListener('click',()=>{S.scale=1;applyXform();});
D.fitBtn.addEventListener('click',fitScreen);
D.themeBtn.addEventListener('click',toggleTheme);
D.exportBtn.addEventListener('click',exportBoard);
D.importBtn.addEventListener('click',()=>D.fileIn.click());
D.fileIn.addEventListener('change',e=>{importBoard(e.target.files[0]);e.target.value='';});

/* Sidebar tools */
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
g('btnAddCard').addEventListener('click',addCard);
g('btnAddText').addEventListener('click',addText);
g('btnAddSticky').addEventListener('click',addSticky);
D.btnDeleteAll.addEventListener('click',deleteSelected);
D.btnDeselectAll.addEventListener('click',clearSel);

/* Search */
D.searchIn.addEventListener('input',()=>doSearch(D.searchIn.value));
D.searchIn.addEventListener('keydown',e=>{
  if(e.key==='Escape'){D.searchDrop.classList.remove('open');D.searchIn.blur();}
  if(e.key==='Enter')doSearch(D.searchIn.value);
});
document.addEventListener('click',e=>{if(!D.searchIn.parentElement.contains(e.target))D.searchDrop.classList.remove('open');});

/* Color */
D.swatches.addEventListener('click',e=>{const sw=e.target.closest('.sw');if(sw)applyColor(sw.dataset.c);});
D.colorPick.addEventListener('input',()=>applyColor(D.colorPick.value));

/* Font */
D.fontPick.addEventListener('change',()=>applyProp('font',D.fontPick.value));

/* Size chips — delegate on document */
document.addEventListener('click',e=>{
  const btn=e.target.closest('.sz');if(!btn)return;
  const sz=+btn.dataset.sz;S.fs=sz;D.customSz.value=sz;syncSzUI(sz);applyProp('fs',sz);
});
D.customSz.addEventListener('change',()=>{
  const sz=Math.max(6,Math.min(300,+D.customSz.value||16));
  S.fs=sz;D.customSz.value=sz;syncSzUI(sz);applyProp('fs',sz);
});

/* Font upload */
D.uploadFontBtn.addEventListener('click',()=>g('fontModal').classList.add('on'));
g('fmClose').addEventListener('click',()=>g('fontModal').classList.remove('on'));
g('fontModal').addEventListener('click',e=>{if(e.target===g('fontModal'))g('fontModal').classList.remove('on');});
g('fmBrowse').addEventListener('click',()=>D.fontIn.click());
D.fontIn.addEventListener('change',e=>{handleFontFiles(e.target.files);e.target.value='';});
D.fontDrop.addEventListener('dragover',e=>{e.preventDefault();D.fontDrop.classList.add('over');});
D.fontDrop.addEventListener('dragleave',()=>D.fontDrop.classList.remove('over'));
D.fontDrop.addEventListener('drop',e=>{e.preventDefault();D.fontDrop.classList.remove('over');handleFontFiles(e.dataTransfer.files);});

/* Format bar */
D.fmtBar.querySelectorAll('[data-cmd]').forEach(btn=>{
  btn.addEventListener('mousedown',e=>{e.preventDefault();execFmt(btn.dataset.cmd);});
  btn.addEventListener('touchstart',e=>{e.preventDefault();execFmt(btn.dataset.cmd);},{passive:false});
});
D.fmtTxtColor.addEventListener('input',()=>{
  document.execCommand('foreColor',false,D.fmtTxtColor.value);
  D.fmtTxtDot.style.background=D.fmtTxtColor.value;saveEd();
});
D.fmtTxtDot.parentElement.addEventListener('click',()=>D.fmtTxtColor.click());
D.fmtClearBtn.addEventListener('click',()=>{document.execCommand('removeFormat',false,null);syncFmt();saveEd();});

/* Minimap */
D.mmToggle.addEventListener('click',()=>{
  D.minimap.classList.toggle('col');
  D.mmToggle.textContent=D.minimap.classList.contains('col')?'+':'−';
});
D.mmInner.addEventListener('click',e=>{
  if(e.target===D.mmVP||e.target.classList.contains('mm-dot'))return;
  const r=D.mmInner.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  const els=Object.values(S.els);if(!els.length)return;
  let mnX=1e9,mnY=1e9,mxX=-1e9,mxY=-1e9;
  els.forEach(e2=>{mnX=Math.min(mnX,e2.x);mnY=Math.min(mnY,e2.y);mxX=Math.max(mxX,e2.x+(e2.w||180));mxY=Math.max(mxY,e2.y+(e2.h||40));});
  const pad=50;mnX-=pad;mnY-=pad;mxX+=pad;mxY+=pad;
  const sc=Math.min(r.width/(mxX-mnX),r.height/(mxY-mnY));
  const wx=mx/sc+mnX,wy=my/sc+mnY;
  const cr=D.canvas.getBoundingClientRect();
  S.panX=cr.width/2-wx*S.scale;S.panY=cr.height/2-wy*S.scale;applyXform();
});

/* Mobile bar */
g('mnAdd').addEventListener('click',()=>D.addSheet.classList.contains('on')?closeSheets():openSheet(D.addSheet));
g('mnStyle').addEventListener('click',()=>D.styleSheet.classList.contains('on')?closeSheets():openSheet(D.styleSheet));
g('mnPan').addEventListener('click',()=>{const t=S.tool==='hand'?'select':'hand';setTool(t);toast(t==='hand'?'Pan mode':'Select mode');});
g('mnUndo').addEventListener('click',undo);
g('mnFit').addEventListener('click',fitScreen);
D.sheetBg.addEventListener('click',closeSheets);

/* Add sheet */
g('shAddCard').addEventListener('click',()=>{closeSheets();addCard();});
g('shAddText').addEventListener('click',()=>{closeSheets();addText();});
g('shAddSticky').addEventListener('click',()=>{closeSheets();addSticky();});

/* Style sheet */
D.mobSwatches.addEventListener('click',e=>{const sw=e.target.closest('.sw');if(sw)applyColor(sw.dataset.c);});
D.mobSizes.addEventListener('click',e=>{
  const btn=e.target.closest('.sz');if(!btn)return;
  const sz=+btn.dataset.sz;S.fs=sz;D.customSz.value=sz;syncSzUI(sz);applyProp('fs',sz);
  toast('Size: '+sz);
});
g('shTheme').addEventListener('click',toggleTheme);
g('shExport').addEventListener('click',()=>{closeSheets();exportBoard();});
g('shImport').addEventListener('click',()=>{closeSheets();D.fileIn.click();});
g('shFonts').addEventListener('click',()=>{closeSheets();g('fontModal').classList.add('on');});

/* Multi-select sheet */
g('shDeleteSel').addEventListener('click',()=>{closeSheets();deleteSelected();});
g('shDeselect').addEventListener('click',()=>{closeSheets();clearSel();});

/* Keyboard */
document.addEventListener('keydown',e=>{
  const editing=document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA'||document.activeElement.isContentEditable;
  if(e.code==='Space'&&!editing){if(!S.spaceDown){S.spaceDown=true;S.prevTool=S.tool;setTool('hand');}e.preventDefault();return;}
  if(editing)return;
  switch(e.key.toLowerCase()){
    case 'v':setTool('select');break;
    case 'h':setTool('hand');break;
    case 'n':addCard();break;
    case 't':addText();break;
    case 's':addSticky();break;
    case 'f':fitScreen();break;
    case 'r':if(!e.ctrlKey&&!e.metaKey)resetView();break;
    case '+':case '=':zoomAt(1.2);break;
    case '-':zoomAt(1/1.2);break;
    case 'a':if(e.ctrlKey||e.metaKey){e.preventDefault();selectAll();}break;
    case 'delete':case 'backspace':deleteSelected();break;
    case 'd':if((e.ctrlKey||e.metaKey)&&S.selId){e.preventDefault();dupEl(S.selId);}break;
    case 'escape':clearSel();hideCtx();D.searchDrop.classList.remove('open');hideFmt();break;
    case 'z':if(e.ctrlKey||e.metaKey){e.preventDefault();e.shiftKey?redo():undo();}break;
    case 'y':if(e.ctrlKey||e.metaKey){e.preventDefault();redo();}break;
  }
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){S.spaceDown=false;setTool(S.prevTool);}});

/* ══ INIT ════════════════════════════════════════ */
function init(){
  setTheme('dark');setCursor();applyXform();

  const demos=[
    {k:'card',x:40,y:40,w:260,h:145,title:'👋 Welcome to Sketchboard Pro',content:'<p>Infinite canvas for your ideas. <strong>Drag</strong> to move, <strong>resize</strong> from corner.</p><p style="margin-top:6px;font-size:11px;opacity:.6">Double-click blank area to select all</p>',color:'#6366f1',font:"'Outfit',sans-serif",fs:13},
    {k:'card',x:330,y:40,w:255,h:145,title:'⌨️ Shortcuts',content:'<p><b>N</b> Card &nbsp;·&nbsp; <b>T</b> Text &nbsp;·&nbsp; <b>S</b> Sticky</p><p><b>H</b> Pan &nbsp;·&nbsp; <b>F</b> Fit &nbsp;·&nbsp; <b>Ctrl+A</b> Select All</p><p><b>Delete</b> Remove &nbsp;·&nbsp; <b>Ctrl+D</b> Duplicate</p><p><b>Shift+Click</b> Multi-select</p>',color:'#10b981',font:"'Outfit',sans-serif",fs:12},
    {k:'sticky',x:40,y:235,w:185,h:140,title:'Quick Idea 💡',content:'<p>Use sticky notes for quick thoughts. Tap to edit.</p>',color:'#fde68a',font:"'Outfit',sans-serif",fs:13,locked:false},
    {k:'sticky',x:245,y:235,w:185,h:140,title:'Colors 🎨',content:'<p>Pick any color from the sidebar or use a custom one!</p>',color:'#bbf7d0',font:"'Outfit',sans-serif",fs:13,locked:false},
    {k:'text',x:460,y:50,w:200,title:'Free Text',content:'<p style="font-size:32px;font-weight:800;color:#a78bfa">Free Text</p><p style="font-size:12px;opacity:.55;margin-top:4px">No box. Pure type on canvas.</p>',color:'#a78bfa',font:"'Outfit',sans-serif",fs:13},
    {k:'text',x:480,y:230,w:180,title:'Ideas',content:'<p style="font-size:50px;font-weight:800;color:#ec4899;line-height:1">Ideas</p>',color:'#ec4899',font:"'Outfit',sans-serif",fs:50},
  ];

  demos.forEach(d=>{
    const id=gid();S.maxZ++;
    S.els[id]={...d,id,locked:d.locked??false,z:S.maxZ};
  });

  rebuildAll();countEls();
  S.hist=[];S.histIdx=-1;pushH();syncH();schedMM();
}

init();
