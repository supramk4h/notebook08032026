/* ══════════════════════════════════════════════════
   SKETCHBOARD PRO  ·  script.js
   Clean rebuild — mobile responsive + free-text auto-name
══════════════════════════════════════════════════ */
'use strict';

/* ────── State ─────────────────────────────────── */
const S = {
  els: {},
  nextId: 1,
  maxZ: 10,
  tool: 'select',      // 'select' | 'hand'
  selId: null,
  editId: null,

  // canvas transform
  panX: 0, panY: 0, scale: 1,
  MIN_SCALE: 0.1, MAX_SCALE: 5,

  // drag
  dragging: false, dragId: null, dragOX: 0, dragOY: 0, dragMoved: false,
  // resize
  resizing: false, rszId: null, rszW0: 0, rszH0: 0, rszX0: 0, rszY0: 0,
  // pan
  panning: false, panX0: 0, panY0: 0, panPX: 0, panPY: 0,
  // space-to-pan
  spaceDown: false, prevTool: 'select',

  // styles
  color: '#6366f1',
  font: "'DM Sans',sans-serif",
  fontSize: 16,

  // uploaded fonts
  fonts: [],

  theme: 'dark',

  // undo/redo
  hist: [], histIdx: -1,
};

/* ────── DOM helpers ───────────────────────────── */
const $ = id => document.getElementById(id);
const el = id => document.getElementById(id);

const D = {
  world:       $('world'),
  canvasArea:  $('canvasArea'),
  undoBtn:     $('undoBtn'),
  redoBtn:     $('redoBtn'),
  zoomInBtn:   $('zoomInBtn'),
  zoomOutBtn:  $('zoomOutBtn'),
  zoomLabel:   $('zoomLabel'),
  zoomPill:    $('zoomPill'),
  fitBtn:      $('fitBtn'),
  resetBtn:    $('resetBtn'),
  importBtn:   $('importBtn'),
  exportBtn:   $('exportBtn'),
  themeBtn:    $('themeBtn'),
  searchInput: $('searchInput'),
  searchDrop:  $('searchDropdown'),
  sbSwatches:  $('sbSwatches'),
  colorPicker: $('colorPicker'),
  fontPicker:  $('fontPicker'),
  uploadFontBtn:$('uploadFontBtn'),
  sbCustomFonts:$('sbCustomFonts'),
  sbSizes:     $('sbSizes'),
  customSize:  $('customSize'),
  fmtBar:      $('fmtBar'),
  fmtBlock:    $('fmtBlock'),
  fmtColor:    $('fmtColor'),
  fmtColorDot: $('fmtColorDot'),
  fmtHighlight:$('fmtHighlight'),
  fmtHlDot:   $('fmtHighlightDot'),
  fmtClear:    $('fmtClear'),
  ctxMenu:     $('ctxMenu'),
  minimap:     $('minimap'),
  mmCanvas:    $('mmCanvas'),
  mmVP:        $('mmVP'),
  mmToggle:    $('mmToggle'),
  toasts:      $('toasts'),
  fileInput:   $('fileInput'),
  fontInput:   $('fontInput'),
  elemCount:   $('elemCount'),
  xyCoord:     $('xyCoord'),
  fontModalBg: $('fontModalBg'),
  fontDrop:    $('fontDrop'),
  fontList:    $('fontList'),
  // mobile
  mobBar:      $('mobBar'),
  mobAddBtn:   $('mobAddBtn'),
  mobStyleBtn: $('mobStyleBtn'),
  mobPanBtn:   $('mobPanBtn'),
  mobUndoBtn:  $('mobUndoBtn'),
  mobFitBtn:   $('mobFitBtn'),
  sheetOverlay:$('sheetOverlay'),
  addSheet:    $('addSheet'),
  styleSheet:  $('styleSheet'),
  sheetSwatches:$('sheetSwatches'),
  sheetSizes:  $('sheetSizes'),
};

/* ════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════ */
function snap() {
  return { els: JSON.parse(JSON.stringify(S.els)), nextId: S.nextId, maxZ: S.maxZ };
}
function pushHist() {
  S.hist = S.hist.slice(0, S.histIdx + 1);
  S.hist.push(snap());
  if (S.hist.length > 80) S.hist.shift(); else S.histIdx++;
  syncHistBtns();
}
function undo() {
  if (S.histIdx <= 0) return;
  S.histIdx--;
  loadSnap(S.hist[S.histIdx]);
  syncHistBtns(); toast('Undone');
}
function redo() {
  if (S.histIdx >= S.hist.length - 1) return;
  S.histIdx++;
  loadSnap(S.hist[S.histIdx]);
  syncHistBtns(); toast('Redone');
}
function loadSnap(s) {
  S.els = JSON.parse(JSON.stringify(s.els));
  S.nextId = s.nextId; S.maxZ = s.maxZ;
  S.selId = null; S.editId = null;
  hideFmtBar(); rebuildAll(); countEls(); scheduleMM();
}
function syncHistBtns() {
  D.undoBtn.disabled = S.histIdx <= 0;
  D.redoBtn.disabled = S.histIdx >= S.hist.length - 1;
}

/* ════════════════════════════════════════════════
   ELEMENT CREATION
════════════════════════════════════════════════ */
function genId() { return 'e' + (S.nextId++); }
function ctr(w, h) {
  const r = D.canvasArea.getBoundingClientRect();
  return { x: (r.width/2 - S.panX)/S.scale - w/2, y: (r.height/2 - S.panY)/S.scale - h/2 };
}

function addCard() {
  pushHist();
  const p = ctr(260, 150);
  const n = Object.keys(S.els).length + 1;
  const id = genId(); S.maxZ++;
  S.els[id] = { id, kind:'card', x:p.x, y:p.y, w:260, h:150,
    title:`Card ${n}`, content:'', color:S.color, font:S.font, fs:S.fontSize, locked:false, z:S.maxZ };
  renderEl(S.els[id]); countEls(); scheduleMM();
  setTimeout(() => { selectEl(id); domEl(id)?.querySelector('.box-title')?.focus(); }, 40);
}

function addText() {
  pushHist();
  const p = ctr(180, 40);
  const id = genId(); S.maxZ++;
  S.els[id] = { id, kind:'text', x:p.x, y:p.y, w:180,
    title:'Free Text', content:'', color:S.color, font:S.font, fs:S.fontSize, z:S.maxZ };
  renderEl(S.els[id]); countEls(); scheduleMM();
  setTimeout(() => {
    selectEl(id);
    const ed = domEl(id)?.querySelector('.ft-editor');
    if (ed) { ed.focus(); caretEnd(ed); }
  }, 40);
}

function addSticky() {
  pushHist();
  const p = ctr(190, 160);
  const n = Object.keys(S.els).length + 1;
  const id = genId(); S.maxZ++;
  const stickyCols = ['#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa','#99f6e4'];
  const c = (S.color === '#6366f1') ? stickyCols[n % stickyCols.length] : S.color;
  S.els[id] = { id, kind:'sticky', x:p.x, y:p.y, w:190, h:160,
    title:`Note ${n}`, content:'', color:c, font:S.font, fs:S.fontSize, locked:false, z:S.maxZ };
  renderEl(S.els[id]); countEls(); scheduleMM();
  setTimeout(() => { selectEl(id); domEl(id)?.querySelector('.sticky-title')?.focus(); }, 40);
}

/* ════════════════════════════════════════════════
   RENDERING
════════════════════════════════════════════════ */
function renderEl(d) {
  domEl(d.id)?.remove();
  let node;
  if (d.kind === 'card')   node = buildCard(d);
  if (d.kind === 'sticky') node = buildSticky(d);
  if (d.kind === 'text')   node = buildFreeText(d);
  if (node) { node.style.zIndex = d.z || 10; D.world.appendChild(node); }
}
function rebuildAll() {
  D.world.innerHTML = '';
  Object.values(S.els).sort((a,b) => (a.z||10)-(b.z||10)).forEach(renderEl);
}
function domEl(id) { return document.getElementById(id); }

/* ── Card ── */
function buildCard(d) {
  const el = document.createElement('div');
  el.className = 'card-box'; el.id = d.id;
  posEl(el, d); el.style.setProperty('--box-ac', d.color);
  el.style.fontFamily = d.font; el.style.fontSize = d.fs + 'px';
  if (d.locked) el.classList.add('locked');
  el.innerHTML = `
    <div class="box-head" data-drag>
      <div class="box-dot"></div>
      <input class="box-title" type="text" value="${esc(d.title)}" placeholder="Title…" spellcheck="false"/>
      <div class="box-btns">
        <button class="box-btn lock-btn${d.locked?' is-locked':''}" title="${d.locked?'Unlock':'Lock'}">${d.locked?svgLock():svgUnlock()}</button>
        <button class="box-btn del" title="Delete">${svgTrash()}</button>
      </div>
    </div>
    <div class="box-body"><div class="box-editor" contenteditable="${d.locked?'false':'true'}" data-ph="Write something…">${d.content}</div></div>
    <div class="rsz"><svg viewBox="0 0 10 10" stroke-width="2"><path d="M2 10L10 2M6 10L10 6"/></svg></div>
  `;
  wireCard(el, d.id);
  return el;
}
function wireCard(el, id) {
  const head = el.querySelector('[data-drag]');
  const titleIn = el.querySelector('.box-title');
  const editor = el.querySelector('.box-editor');
  const lockBtn = el.querySelector('.lock-btn');
  const delBtn = el.querySelector('.del');
  const rsz = el.querySelector('.rsz');

  head.addEventListener('mousedown', e => {
    if (e.target === titleIn) return;
    e.preventDefault();
    if (S.els[id]?.locked || S.tool === 'hand') return;
    startDrag(id, e.clientX, e.clientY);
  });
  head.addEventListener('touchstart', e => {
    if (e.target === titleIn) return;
    if (S.els[id]?.locked) return;
    startDrag(id, e.touches[0].clientX, e.touches[0].clientY);
  }, {passive:true});

  el.addEventListener('mousedown', e => {
    if (S.tool === 'hand') return;
    if (!e.target.closest('.box-btn') && !e.target.closest('.rsz')) selectEl(id);
    e.stopPropagation();
  });
  el.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e, id); });

  titleIn.addEventListener('input', () => { if (S.els[id]) S.els[id].title = titleIn.value; scheduleMM(); });
  titleIn.addEventListener('change', pushHist);

  editor.addEventListener('focus', () => { S.editId = id; showFmtBar(); syncFmt(); });
  editor.addEventListener('blur', () => {
    if (S.els[id]) S.els[id].content = editor.innerHTML;
    pushHist();
    setTimeout(() => { if (!document.activeElement?.closest('.fmt-bar')) { S.editId = null; hideFmtBar(); } }, 100);
  });
  editor.addEventListener('input', () => { if (S.els[id]) S.els[id].content = editor.innerHTML; scheduleMM(); });
  editor.addEventListener('keyup', syncFmt);
  editor.addEventListener('mouseup', syncFmt);

  lockBtn.addEventListener('click', e => { e.stopPropagation(); toggleLock(id); });
  delBtn.addEventListener('click', e => { e.stopPropagation(); deleteEl(id); });

  rsz.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); if (!S.els[id]?.locked) startRsz(id, e.clientX, e.clientY); });
  rsz.addEventListener('touchstart', e => { if (!S.els[id]?.locked) startRsz(id, e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
}

/* ── Sticky ── */
function buildSticky(d) {
  const el = document.createElement('div');
  el.className = 'sticky-box'; el.id = d.id;
  posEl(el, d); el.style.background = d.color;
  el.style.fontFamily = d.font; el.style.fontSize = d.fs + 'px';
  if (d.locked) el.classList.add('locked');
  el.innerHTML = `
    <div class="sticky-ear"></div>
    <div class="sticky-head" data-drag>
      <input class="sticky-title" type="text" value="${esc(d.title)}" placeholder="Title…" spellcheck="false"/>
      <div class="sticky-btns">
        <button class="sticky-btn lock-btn" title="${d.locked?'Unlock':'Lock'}">${d.locked?svgLock():svgUnlock()}</button>
        <button class="sticky-btn del" title="Delete">${svgTrash()}</button>
      </div>
    </div>
    <div class="sticky-body"><div class="sticky-editor" contenteditable="${d.locked?'false':'true'}" data-ph="Quick note…">${d.content}</div></div>
    <div class="rsz"><svg viewBox="0 0 10 10" stroke-width="2"><path d="M2 10L10 2M6 10L10 6"/></svg></div>
  `;
  wireSticky(el, d.id);
  return el;
}
function wireSticky(el, id) {
  const head = el.querySelector('[data-drag]');
  const titleIn = el.querySelector('.sticky-title');
  const editor = el.querySelector('.sticky-editor');
  const lockBtn = el.querySelector('.lock-btn');
  const delBtn = el.querySelector('.del');
  const rsz = el.querySelector('.rsz');

  head.addEventListener('mousedown', e => {
    if (e.target === titleIn) return;
    e.preventDefault();
    if (S.els[id]?.locked || S.tool === 'hand') return;
    startDrag(id, e.clientX, e.clientY);
  });
  head.addEventListener('touchstart', e => {
    if (e.target === titleIn) return;
    if (S.els[id]?.locked) return;
    startDrag(id, e.touches[0].clientX, e.touches[0].clientY);
  }, {passive:true});

  el.addEventListener('mousedown', e => {
    if (S.tool === 'hand') return;
    if (!e.target.closest('.sticky-btn') && !e.target.closest('.rsz')) selectEl(id);
    e.stopPropagation();
  });
  el.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e, id); });

  titleIn.addEventListener('input', () => { if (S.els[id]) S.els[id].title = titleIn.value; scheduleMM(); });
  titleIn.addEventListener('change', pushHist);

  editor.addEventListener('focus', () => { S.editId = id; showFmtBar(); syncFmt(); });
  editor.addEventListener('blur', () => {
    if (S.els[id]) S.els[id].content = editor.innerHTML;
    pushHist();
    setTimeout(() => { if (!document.activeElement?.closest('.fmt-bar')) { S.editId = null; hideFmtBar(); } }, 100);
  });
  editor.addEventListener('input', () => { if (S.els[id]) S.els[id].content = editor.innerHTML; scheduleMM(); });
  editor.addEventListener('keyup', syncFmt);
  editor.addEventListener('mouseup', syncFmt);

  lockBtn.addEventListener('click', e => { e.stopPropagation(); toggleLock(id); });
  delBtn.addEventListener('click', e => { e.stopPropagation(); deleteEl(id); });

  rsz.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); if (!S.els[id]?.locked) startRsz(id, e.clientX, e.clientY); });
  rsz.addEventListener('touchstart', e => { if (!S.els[id]?.locked) startRsz(id, e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
}

/* ── Free Text ── */
function buildFreeText(d) {
  const el = document.createElement('div');
  el.className = 'free-text'; el.id = d.id;
  posEl(el, d); el.style.width = (d.w || 180) + 'px';
  el.style.fontFamily = d.font; el.style.fontSize = d.fs + 'px';
  el.style.color = d.color;
  el.innerHTML = `
    <div class="ft-toolbar">
      <button class="ft-tb-btn" data-a="lock" title="Lock">${svgUnlock()}</button>
      <button class="ft-tb-btn del" data-a="delete" title="Delete">${svgTrash()}</button>
    </div>
    <div class="ft-editor" contenteditable="true" data-ph="Type freely…">${d.content}</div>
    <div class="rsz"><svg viewBox="0 0 10 10" stroke-width="2"><path d="M2 10L10 2M6 10L10 6"/></svg></div>
  `;
  wireFT(el, d.id);
  return el;
}
function wireFT(el, id) {
  const editor = el.querySelector('.ft-editor');
  const rsz = el.querySelector('.rsz');

  el.addEventListener('mousedown', e => {
    if (S.tool === 'hand') return;
    if (e.target.closest('.ft-tb-btn') || e.target.closest('.rsz')) return;
    if (e.target === editor && S.selId === id) return;
    selectEl(id);
    if (e.target !== editor) { e.preventDefault(); startDrag(id, e.clientX, e.clientY); }
    e.stopPropagation();
  });
  el.addEventListener('touchstart', e => {
    if (e.target.closest('.ft-tb-btn') || e.target.closest('.rsz')) return;
    if (e.target === editor) return;
    startDrag(id, e.touches[0].clientX, e.touches[0].clientY);
  }, {passive:true});
  el.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e, id); });

  el.querySelector('[data-a="lock"]').addEventListener('click', e => { e.stopPropagation(); toggleLock(id); });
  el.querySelector('[data-a="delete"]').addEventListener('click', e => { e.stopPropagation(); deleteEl(id); });

  editor.addEventListener('focus', () => { S.editId = id; showFmtBar(); syncFmt(); });
  editor.addEventListener('blur', () => {
    if (S.els[id]) {
      S.els[id].content = editor.innerHTML;
      // ── Auto-title from typed content ──
      const plain = editor.innerText.replace(/\s+/g,' ').trim();
      S.els[id].title = plain ? (plain.length > 42 ? plain.slice(0,42)+'…' : plain) : 'Free Text';
    }
    pushHist();
    setTimeout(() => { if (!document.activeElement?.closest('.fmt-bar')) { S.editId = null; hideFmtBar(); } }, 100);
  });
  editor.addEventListener('input', () => {
    if (S.els[id]) {
      S.els[id].content = editor.innerHTML;
      // Live title update
      const plain = editor.innerText.replace(/\s+/g,' ').trim();
      S.els[id].title = plain ? (plain.length > 42 ? plain.slice(0,42)+'…' : plain) : 'Free Text';
    }
    scheduleMM();
  });
  editor.addEventListener('keyup', syncFmt);
  editor.addEventListener('mouseup', syncFmt);

  rsz.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); startRsz(id, e.clientX, e.clientY); });
  rsz.addEventListener('touchstart', e => { startRsz(id, e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
}

/* ════════════════════════════════════════════════
   DRAG
════════════════════════════════════════════════ */
function startDrag(id, cx, cy) {
  S.dragging = true; S.dragId = id; S.dragMoved = false;
  const d = S.els[id];
  const w = c2w(cx, cy);
  S.dragOX = w.x - d.x; S.dragOY = w.y - d.y;
  selectEl(id); bringFront(id, false);
  const dom = domEl(id);
  if (dom) { dom.style.transition = 'none'; dom.style.zIndex = S.maxZ + 20; }
}
function onDragMove(cx, cy) {
  if (!S.dragging) return;
  const d = S.els[S.dragId];
  const w = c2w(cx, cy);
  d.x = w.x - S.dragOX; d.y = w.y - S.dragOY;
  const dom = domEl(S.dragId);
  if (dom) { dom.style.left = d.x + 'px'; dom.style.top = d.y + 'px'; }
  S.dragMoved = true;
  scheduleMM();
  D.xyCoord.textContent = `${Math.round(d.x)}, ${Math.round(d.y)}`;
}
function endDrag() {
  if (!S.dragging) return;
  const dom = domEl(S.dragId);
  if (dom) { dom.style.transition = ''; dom.style.zIndex = S.els[S.dragId]?.z || 10; }
  if (S.dragMoved) pushHist();
  S.dragging = false; S.dragId = null;
}

/* ════════════════════════════════════════════════
   RESIZE
════════════════════════════════════════════════ */
function startRsz(id, cx, cy) {
  S.resizing = true; S.rszId = id;
  const d = S.els[id];
  S.rszW0 = d.w || 200; S.rszH0 = d.h || 150;
  S.rszX0 = cx; S.rszY0 = cy;
}
function onRszMove(cx, cy) {
  if (!S.resizing) return;
  const d = S.els[S.rszId];
  const dw = (cx - S.rszX0) / S.scale;
  const dh = (cy - S.rszY0) / S.scale;
  d.w = Math.max(d.kind === 'text' ? 60 : 150, S.rszW0 + dw);
  if (d.kind !== 'text') d.h = Math.max(80, S.rszH0 + dh);
  const dom = domEl(S.rszId);
  if (dom) {
    dom.style.width = d.w + 'px';
    if (d.kind !== 'text') dom.style.minHeight = d.h + 'px';
  }
  scheduleMM();
}
function endRsz() {
  if (!S.resizing) return;
  pushHist(); S.resizing = false; S.rszId = null;
}

/* ════════════════════════════════════════════════
   SELECTION
════════════════════════════════════════════════ */
function selectEl(id) {
  if (S.selId === id) return;
  deselect();
  S.selId = id;
  domEl(id)?.classList.add('sel');
  // Sync sidebar to element props
  const d = S.els[id];
  if (d) {
    S.color = d.color; syncColorUI(d.color);
    if (d.font) { S.font = d.font; D.fontPicker.value = d.font; }
    if (d.fs) { S.fontSize = d.fs; D.customSize.value = d.fs; syncSizeUI(d.fs); }
  }
}
function deselect() {
  if (S.selId) { domEl(S.selId)?.classList.remove('sel'); S.selId = null; }
}
function syncColorUI(c) {
  D.colorPicker.value = c;
  document.querySelectorAll('#sbSwatches .swatch,#sheetSwatches .swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === c);
  });
}
function syncSizeUI(sz) {
  document.querySelectorAll('.size-chip').forEach(b => b.classList.toggle('active', +b.dataset.size === sz));
}

/* ════════════════════════════════════════════════
   LOCK / DELETE / Z-ORDER / DUPLICATE
════════════════════════════════════════════════ */
function toggleLock(id) {
  const d = S.els[id]; if (!d) return;
  d.locked = !d.locked;
  renderEl(d);
  if (S.selId === id) domEl(id)?.classList.add('sel');
  pushHist(); toast(d.locked ? 'Locked' : 'Unlocked');
}
function deleteEl(id) {
  pushHist();
  const dom = domEl(id);
  if (dom) { dom.style.opacity='0'; dom.style.transform += ' scale(.85)'; dom.style.transition='opacity .15s,transform .15s'; setTimeout(()=>dom.remove(),160); }
  delete S.els[id];
  if (S.selId === id) S.selId = null;
  if (S.editId === id) { S.editId = null; hideFmtBar(); }
  countEls(); scheduleMM();
}
function duplicateEl(id) {
  const src = S.els[id]; if (!src) return;
  pushHist();
  const nid = genId(); S.maxZ++;
  S.els[nid] = { ...JSON.parse(JSON.stringify(src)), id:nid, x:src.x+24, y:src.y+24, z:S.maxZ };
  renderEl(S.els[nid]); countEls(); scheduleMM();
  setTimeout(() => selectEl(nid), 20);
  toast('Duplicated');
}
function bringFront(id, doHist=true) {
  const d = S.els[id]; if (!d) return;
  if (doHist) pushHist();
  S.maxZ++; d.z = S.maxZ;
  const dom = domEl(id); if (dom) dom.style.zIndex = S.maxZ;
  if (doHist) toast('Brought to front');
}
function sendBack(id) {
  const d = S.els[id]; if (!d) return;
  pushHist();
  const minZ = Math.min(...Object.values(S.els).map(e=>e.z||10));
  d.z = minZ - 1;
  const dom = domEl(id); if (dom) dom.style.zIndex = d.z;
  toast('Sent to back');
}
function applyColor(color) {
  S.color = color; syncColorUI(color);
  if (!S.selId) return;
  const d = S.els[S.selId]; if (!d) return;
  d.color = color;
  const dom = domEl(S.selId); if (!dom) return;
  if (d.kind === 'card') { dom.style.setProperty('--box-ac', color); dom.querySelector('.box-dot').style.background = color; }
  else if (d.kind === 'sticky') dom.style.background = color;
  else if (d.kind === 'text') dom.style.color = color;
  scheduleMM(); pushHist();
}
function applyProp(prop, val) {
  if (prop === 'font') S.font = val;
  if (prop === 'fs') S.fontSize = val;
  if (!S.selId) return;
  const d = S.els[S.selId]; if (!d) return;
  d[prop] = val;
  const dom = domEl(S.selId); if (!dom) return;
  if (prop === 'font') dom.style.fontFamily = val;
  if (prop === 'fs') dom.style.fontSize = val + 'px';
  pushHist();
}

/* ════════════════════════════════════════════════
   CONTEXT MENU
════════════════════════════════════════════════ */
let ctxId = null;
function showCtx(e, id) {
  ctxId = id;
  const m = D.ctxMenu; m.classList.add('on');
  let x = e.clientX, y = e.clientY;
  m.style.left = x + 'px'; m.style.top = y + 'px';
  requestAnimationFrame(() => {
    const r = m.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x -= r.width;
    if (y + r.height > window.innerHeight - 8) y -= r.height;
    m.style.left = x + 'px'; m.style.top = y + 'px';
  });
}
function hideCtx() { D.ctxMenu.classList.remove('on'); ctxId = null; }

D.ctxMenu.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]'); if (!btn || !ctxId) return;
  const id = ctxId; hideCtx();
  const a = btn.dataset.action;
  if (a === 'duplicate') duplicateEl(id);
  if (a === 'bringFront') bringFront(id);
  if (a === 'sendBack') sendBack(id);
  if (a === 'delete') deleteEl(id);
});
document.addEventListener('click', e => { if (!D.ctxMenu.contains(e.target)) hideCtx(); });

/* ════════════════════════════════════════════════
   CANVAS TRANSFORM
════════════════════════════════════════════════ */
function applyXform() {
  D.world.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.scale})`;
  D.zoomLabel.textContent = Math.round(S.scale * 100) + '%';
  scheduleMM();
}
function c2w(cx, cy) {
  const r = D.canvasArea.getBoundingClientRect();
  return { x:(cx-r.left-S.panX)/S.scale, y:(cy-r.top-S.panY)/S.scale };
}
function zoomAt(factor, cx, cy) {
  const r = D.canvasArea.getBoundingClientRect();
  const ox = (cx !== undefined ? cx : r.width/2) - r.left;
  const oy = (cy !== undefined ? cy : r.height/2) - r.top;
  const ns = Math.min(S.MAX_SCALE, Math.max(S.MIN_SCALE, S.scale*factor));
  const ratio = ns/S.scale;
  S.panX = ox - (ox - S.panX)*ratio;
  S.panY = oy - (oy - S.panY)*ratio;
  S.scale = ns; applyXform();
}
function resetView() { S.scale=1; S.panX=0; S.panY=0; applyXform(); toast('View reset'); }
function fitScreen() {
  const els = Object.values(S.els);
  if (!els.length) { resetView(); return; }
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  els.forEach(e => { mnX=Math.min(mnX,e.x); mnY=Math.min(mnY,e.y); mxX=Math.max(mxX,e.x+(e.w||180)); mxY=Math.max(mxY,e.y+(e.h||40)); });
  const pad=80, bw=mxX-mnX+pad*2, bh=mxY-mnY+pad*2;
  const r = D.canvasArea.getBoundingClientRect();
  S.scale = Math.min(1.5, Math.max(S.MIN_SCALE, Math.min(r.width/bw, r.height/bh)));
  S.panX = r.width/2 - (mnX-pad+bw/2)*S.scale;
  S.panY = r.height/2 - (mnY-pad+bh/2)*S.scale;
  applyXform(); toast('Fit to screen');
}

/* ════════════════════════════════════════════════
   PAN
════════════════════════════════════════════════ */
function startPan(cx, cy) {
  S.panning=true; S.panX0=cx; S.panY0=cy; S.panPX=S.panX; S.panPY=S.panY;
  D.canvasArea.classList.add('cur-grabbing');
}
function onPanMove(cx, cy) {
  if (!S.panning) return;
  S.panX = S.panPX+(cx-S.panX0); S.panY = S.panPY+(cy-S.panY0); applyXform();
}
function endPan() {
  if (!S.panning) return;
  S.panning=false; D.canvasArea.classList.remove('cur-grabbing'); setCursor();
}

/* ════════════════════════════════════════════════
   TOOL / CURSOR
════════════════════════════════════════════════ */
function setTool(t) {
  S.tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  D.mobPanBtn?.classList.toggle('active', t === 'hand');
  setCursor();
}
function setCursor() {
  D.canvasArea.classList.toggle('cur-hand', S.tool === 'hand');
  D.canvasArea.classList.toggle('cur-default', S.tool !== 'hand');
}

/* ════════════════════════════════════════════════
   FORMAT BAR
════════════════════════════════════════════════ */
function showFmtBar() { D.fmtBar.classList.add('on'); }
function hideFmtBar() { D.fmtBar.classList.remove('on'); }
function syncFmt() {
  ['bold','italic','underline','strikeThrough'].forEach(cmd => {
    const b = D.fmtBar.querySelector(`[data-cmd="${cmd}"]`);
    if (b) b.classList.toggle('on', document.queryCommandState(cmd));
  });
}
function execFmt(cmd) { document.execCommand(cmd,false,null); syncFmt(); saveEditor(); }
function saveEditor() {
  const id = S.editId; if (!id || !S.els[id]) return;
  const d = S.els[id];
  const sel = d.kind==='card' ? '.box-editor' : d.kind==='sticky' ? '.sticky-editor' : '.ft-editor';
  const dom = domEl(id)?.querySelector(sel);
  if (dom) d.content = dom.innerHTML;
}

/* ════════════════════════════════════════════════
   SEARCH
════════════════════════════════════════════════ */
function stripHTML(h) { const t=document.createElement('div'); t.innerHTML=h; return t.innerText.replace(/\s+/g,' ').trim(); }
function displayName(d) {
  if (d.kind==='text') return (d.title && d.title!=='Free Text') ? d.title : (stripHTML(d.content).slice(0,42)||'Free Text');
  return d.title || 'Untitled';
}
function doSearch(q) {
  q = q.trim().toLowerCase();
  D.searchDrop.innerHTML = '';
  if (!q) { D.searchDrop.classList.remove('open'); return; }
  const hits = Object.values(S.els).filter(d => displayName(d).toLowerCase().includes(q) || stripHTML(d.content).toLowerCase().includes(q));
  if (!hits.length) {
    D.searchDrop.innerHTML = '<div class="s-empty">No results</div>';
  } else {
    const labels = {card:'Card',sticky:'Sticky',text:'Text'};
    hits.forEach(d => {
      const item = document.createElement('div');
      item.className = 's-item';
      item.innerHTML = `<span class="s-dot" style="background:${d.color}"></span><span>${esc(displayName(d))}</span><span class="s-kind">${labels[d.kind]||''}</span>`;
      item.addEventListener('click', () => { goTo(d.id); D.searchDrop.classList.remove('open'); D.searchInput.value=''; });
      D.searchDrop.appendChild(item);
    });
  }
  D.searchDrop.classList.add('open');
}
function goTo(id) {
  const d = S.els[id]; if (!d) return;
  const r = D.canvasArea.getBoundingClientRect();
  S.panX = r.width/2 - (d.x+(d.w||180)/2)*S.scale;
  S.panY = r.height/2 - (d.y+(d.h||40)/2)*S.scale;
  applyXform(); selectEl(id);
  const dom = domEl(id);
  if (dom) { dom.classList.add('flash'); setTimeout(()=>dom.classList.remove('flash'),900); }
}

/* ════════════════════════════════════════════════
   MINIMAP
════════════════════════════════════════════════ */
let mmTimer = null;
function scheduleMM() { if (!mmTimer) mmTimer = requestAnimationFrame(()=>{ mmTimer=null; drawMM(); }); }
function drawMM() {
  const mc = D.mmCanvas; mc.querySelectorAll('.mm-dot').forEach(d=>d.remove());
  const mw = mc.offsetWidth, mh = mc.offsetHeight;
  const els = Object.values(S.els);
  if (!els.length) { D.mmVP.style.display='none'; return; }
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  els.forEach(e => { mnX=Math.min(mnX,e.x); mnY=Math.min(mnY,e.y); mxX=Math.max(mxX,e.x+(e.w||180)); mxY=Math.max(mxY,e.y+(e.h||40)); });
  const pad=50; mnX-=pad; mnY-=pad; mxX+=pad; mxY+=pad;
  const ww=mxX-mnX, wh=mxY-mnY; if(ww<=0||wh<=0) return;
  const sc = Math.min(mw/ww, mh/wh);
  els.forEach(e => {
    const dot = document.createElement('div');
    dot.className = 'mm-dot';
    dot.style.cssText=`left:${(e.x-mnX+(e.w||40)/2)*sc}px;top:${(e.y-mnY+(e.h||16)/2)*sc}px;width:${Math.max(6,(e.w||40)*sc)}px;height:${Math.max(4,(e.h||16)*sc)}px;background:${e.color};opacity:.72`;
    dot.title = displayName(e);
    dot.addEventListener('click', ev => { ev.stopPropagation(); goTo(e.id); });
    mc.appendChild(dot);
  });
  const r = D.canvasArea.getBoundingClientRect();
  D.mmVP.style.display='block';
  D.mmVP.style.left=(-S.panX/S.scale-mnX)*sc+'px';
  D.mmVP.style.top=(-S.panY/S.scale-mnY)*sc+'px';
  D.mmVP.style.width=(r.width/S.scale)*sc+'px';
  D.mmVP.style.height=(r.height/S.scale)*sc+'px';
}

/* ════════════════════════════════════════════════
   EXPORT / IMPORT
════════════════════════════════════════════════ */
function exportBoard() {
  const data = { v:2, theme:S.theme, panX:S.panX, panY:S.panY, scale:S.scale,
    els:Object.values(S.els), fonts:S.fonts.map(f=>({name:f.name,url:f.url})) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download = 'sketchboard_'+Date.now()+'.json'; a.click(); toast('Exported!');
}
function importBoard(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.els) throw 0;
      pushHist(); S.els={};
      data.els.forEach(d => S.els[d.id]=d);
      const nums = data.els.map(d=>parseInt(d.id.replace('e',''))).filter(n=>!isNaN(n));
      S.nextId = nums.length ? Math.max(...nums)+1 : 1;
      if (data.panX!==undefined) { S.panX=data.panX; S.panY=data.panY; S.scale=data.scale; }
      if (data.theme) setTheme(data.theme);
      if (data.fonts?.length) data.fonts.forEach(f => loadFont(f.name, f.url));
      rebuildAll(); applyXform(); countEls(); scheduleMM(); toast('Imported!');
    } catch { toast('Invalid JSON'); }
  };
  reader.readAsText(file);
}

/* ════════════════════════════════════════════════
   CUSTOM FONTS
════════════════════════════════════════════════ */
function handleFontFiles(files) {
  Array.from(files).forEach(f => {
    if (!/\.(ttf|otf|woff|woff2)$/i.test(f.name)) { toast('Unsupported: '+f.name); return; }
    const reader = new FileReader();
    reader.onload = e => { const name = f.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' '); loadFont(name, e.target.result); toast('Font loaded: '+name); };
    reader.readAsDataURL(f);
  });
}
function loadFont(name, url) {
  if (S.fonts.find(f=>f.name===name)) return;
  const style = document.createElement('style');
  style.textContent = `@font-face{font-family:'${name}';src:url('${url}')}`;
  document.head.appendChild(style);
  S.fonts.push({name, url});
  // Add to select
  const val = `'${name}',sans-serif`;
  if (!Array.from(D.fontPicker.options).find(o=>o.value===val)) D.fontPicker.appendChild(new Option(name,val));
  renderFonts();
}
function removeFont(name) {
  S.fonts = S.fonts.filter(f=>f.name!==name);
  const val = `'${name}',sans-serif`;
  Array.from(D.fontPicker.options).forEach(o=>{ if(o.value===val) o.remove(); });
  renderFonts(); toast('Removed: '+name);
}
function renderFonts() {
  D.sbCustomFonts.innerHTML='';
  D.fontList.innerHTML='';
  S.fonts.forEach(f => {
    const val=`'${f.name}',sans-serif`;
    // Sidebar chip
    const chip = document.createElement('div');
    chip.className='cf-item'+(S.font===val?' active':'');
    chip.style.fontFamily=val;
    chip.innerHTML=`<span>${f.name}</span><button class="cf-del" data-n="${f.name}">×</button>`;
    chip.addEventListener('click',e=>{ if(!e.target.closest('.cf-del')){ S.font=val; D.fontPicker.value=val; applyProp('font',val); } });
    chip.querySelector('.cf-del').addEventListener('click',()=>removeFont(f.name));
    D.sbCustomFonts.appendChild(chip);
    // Modal row
    const row=document.createElement('div'); row.className='font-row';
    row.innerHTML=`<div><div class="font-row-name" style="font-family:${val}">${f.name}</div><div class="font-row-pre" style="font-family:${val}">AaBbCc 123</div></div><button class="font-row-del" data-n="${f.name}">×</button>`;
    row.querySelector('.font-row-del').addEventListener('click',()=>removeFont(f.name));
    D.fontList.appendChild(row);
  });
}

/* ════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════ */
function setTheme(t) {
  S.theme=t; document.documentElement.setAttribute('data-theme',t);
  D.fmtColor.value = t==='dark'?'#ffffff':'#000000';
  D.fmtColorDot.style.background = D.fmtColor.value;
}
function toggleTheme() { setTheme(S.theme==='dark'?'light':'dark'); }

/* ════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════ */
function toast(msg) {
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  D.toasts.appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),200); },1900);
}

/* ════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════ */
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function posEl(el, d) { el.style.left=d.x+'px'; el.style.top=d.y+'px'; if(d.w) el.style.width=d.w+'px'; if(d.h) el.style.minHeight=d.h+'px'; }
function svgLock() { return `<svg viewBox="0 0 14 14"><rect x="2" y="6" width="10" height="7" rx="1.5"/><path d="M4 6V4.5a3 3 0 0 1 6 0V6"/></svg>`; }
function svgUnlock() { return `<svg viewBox="0 0 14 14"><rect x="2" y="6" width="10" height="7" rx="1.5"/><path d="M4 6V4.5A3 3 0 0 1 9.9 4"/></svg>`; }
function svgTrash() { return `<svg viewBox="0 0 14 14"><polyline points="1 3 2 3 13 3"/><path d="M11 3l-.6 8a1.5 1.5 0 0 1-1.5 1.4H5.1A1.5 1.5 0 0 1 3.6 11L3 3"/><path d="M5 6v3M9 6v3"/><path d="M5.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1"/></svg>`; }
function caretEnd(el) { const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }
function countEls() { const n=Object.keys(S.els).length; D.elemCount.textContent=`${n} element${n!==1?'s':''}`; }

/* ════════════════════════════════════════════════
   MOBILE SHEET LOGIC
════════════════════════════════════════════════ */
function openSheet(sheet) {
  closeSheets();
  sheet.classList.add('on');
  D.sheetOverlay.classList.add('on');
}
function closeSheets() {
  D.addSheet.classList.remove('on');
  D.styleSheet.classList.remove('on');
  D.sheetOverlay.classList.remove('on');
}

/* ════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════ */

/* Canvas */
D.canvasArea.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const onBg = e.target === D.canvasArea || e.target === D.world;
  if (onBg) { deselect(); hideCtx(); }
  if (onBg && (S.tool === 'hand' || S.spaceDown)) startPan(e.clientX, e.clientY);
  else if (S.tool === 'hand' && !e.target.closest('[id]')) startPan(e.clientX, e.clientY);
});
document.addEventListener('mousemove', e => {
  if (S.panning) onPanMove(e.clientX, e.clientY);
  else if (S.dragging) onDragMove(e.clientX, e.clientY);
  else if (S.resizing) onRszMove(e.clientX, e.clientY);
});
document.addEventListener('mouseup', () => { endPan(); endDrag(); endRsz(); });

D.canvasArea.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.deltaY < 0 ? 1.1 : 1/1.1, e.clientX, e.clientY);
}, {passive:false});

D.canvasArea.addEventListener('mousemove', e => {
  const w = c2w(e.clientX, e.clientY);
  D.xyCoord.textContent = `${Math.round(w.x)}, ${Math.round(w.y)}`;
});

/* Touch */
let lastDist = null;
D.canvasArea.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    if (t.target === D.canvasArea || t.target === D.world) startPan(t.clientX, t.clientY);
  }
  if (e.touches.length === 2) {
    lastDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    endPan();
  }
}, {passive:true});
D.canvasArea.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2 && lastDist) {
    const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    const mx=(e.touches[0].clientX+e.touches[1].clientX)/2, my=(e.touches[0].clientY+e.touches[1].clientY)/2;
    zoomAt(d/lastDist, mx, my); lastDist=d;
  } else if (e.touches.length===1) {
    if (S.panning) onPanMove(e.touches[0].clientX, e.touches[0].clientY);
    else if (S.dragging) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}, {passive:false});
D.canvasArea.addEventListener('touchend', () => { lastDist=null; endPan(); endDrag(); endRsz(); });

/* Toolbar buttons */
D.undoBtn.addEventListener('click', undo);
D.redoBtn.addEventListener('click', redo);
D.zoomInBtn.addEventListener('click', () => zoomAt(1.2));
D.zoomOutBtn.addEventListener('click', () => zoomAt(1/1.2));
D.zoomPill.addEventListener('click', () => { S.scale=1; applyXform(); });
D.fitBtn.addEventListener('click', fitScreen);
D.resetBtn.addEventListener('click', resetView);
D.themeBtn.addEventListener('click', toggleTheme);
D.importBtn.addEventListener('click', () => D.fileInput.click());
D.exportBtn.addEventListener('click', exportBoard);
D.fileInput.addEventListener('change', e => { importBoard(e.target.files[0]); e.target.value=''; });

/* Sidebar tool buttons */
document.querySelectorAll('[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

/* Sidebar add buttons */
$('addCardBtn').addEventListener('click', addCard);
$('addTextBtn').addEventListener('click', addText);
$('addStickyBtn').addEventListener('click', addSticky);

/* Search */
D.searchInput.addEventListener('input', () => doSearch(D.searchInput.value));
D.searchInput.addEventListener('keydown', e => {
  if (e.key==='Enter') doSearch(D.searchInput.value);
  if (e.key==='Escape') { D.searchDrop.classList.remove('open'); D.searchInput.blur(); }
});
document.addEventListener('click', e => { if (!D.searchInput.closest('.search-wrap').contains(e.target)) D.searchDrop.classList.remove('open'); });

/* Colors */
D.sbSwatches.addEventListener('click', e => {
  const sw = e.target.closest('.swatch'); if (!sw) return;
  applyColor(sw.dataset.color);
});
D.colorPicker.addEventListener('input', () => applyColor(D.colorPicker.value));

/* Font */
D.fontPicker.addEventListener('change', () => applyProp('font', D.fontPicker.value));

/* Size chips */
document.addEventListener('click', e => {
  const btn = e.target.closest('.size-chip'); if (!btn) return;
  const sz = +btn.dataset.size;
  S.fontSize = sz; D.customSize.value = sz; syncSizeUI(sz);
  applyProp('fs', sz);
});
D.customSize.addEventListener('change', () => {
  const sz = Math.max(6, Math.min(300, +D.customSize.value||16));
  S.fontSize=sz; D.customSize.value=sz; syncSizeUI(sz); applyProp('fs',sz);
});

/* Font upload */
D.uploadFontBtn.addEventListener('click', () => D.fontModalBg.classList.add('on'));
$('fontModalClose').addEventListener('click', () => D.fontModalBg.classList.remove('on'));
D.fontModalBg.addEventListener('click', e => { if(e.target===D.fontModalBg) D.fontModalBg.classList.remove('on'); });
$('fontBrowse').addEventListener('click', () => D.fontInput.click());
D.fontInput.addEventListener('change', e => { handleFontFiles(e.target.files); e.target.value=''; });
D.fontDrop.addEventListener('dragover', e => { e.preventDefault(); D.fontDrop.classList.add('over'); });
D.fontDrop.addEventListener('dragleave', () => D.fontDrop.classList.remove('over'));
D.fontDrop.addEventListener('drop', e => { e.preventDefault(); D.fontDrop.classList.remove('over'); handleFontFiles(e.dataTransfer.files); });

/* Format bar */
D.fmtBar.querySelectorAll('[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => { e.preventDefault(); execFmt(btn.dataset.cmd); });
});
D.fmtBlock.addEventListener('change', () => { document.execCommand('formatBlock',false,'<'+D.fmtBlock.value+'>'); saveEditor(); });
D.fmtColor.addEventListener('input', () => { document.execCommand('foreColor',false,D.fmtColor.value); D.fmtColorDot.style.background=D.fmtColor.value; saveEditor(); });
D.fmtColorDot.addEventListener('click', () => D.fmtColor.click());
D.fmtHighlight.addEventListener('input', () => { document.execCommand('hiliteColor',false,D.fmtHighlight.value+'55'); D.fmtHlDot.style.background=D.fmtHighlight.value+'44'; saveEditor(); });
D.fmtHlDot.addEventListener('click', () => D.fmtHighlight.click());
D.fmtClear.addEventListener('click', () => { document.execCommand('removeFormat',false,null); syncFmt(); saveEditor(); });

/* Minimap */
D.mmToggle.addEventListener('click', () => {
  D.minimap.classList.toggle('collapsed');
  D.mmToggle.textContent = D.minimap.classList.contains('collapsed') ? '+' : '−';
});
D.mmCanvas.addEventListener('click', e => {
  if (e.target===D.mmVP || e.target.classList.contains('mm-dot')) return;
  const r=D.mmCanvas.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  const els=Object.values(S.els); if(!els.length) return;
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  els.forEach(e2=>{ mnX=Math.min(mnX,e2.x); mnY=Math.min(mnY,e2.y); mxX=Math.max(mxX,e2.x+(e2.w||180)); mxY=Math.max(mxY,e2.y+(e2.h||40)); });
  const pad=50; mnX-=pad; mnY-=pad; mxX+=pad; mxY+=pad;
  const sc=Math.min(r.width/(mxX-mnX), r.height/(mxY-mnY));
  const wx=mx/sc+mnX, wy=my/sc+mnY;
  const cr=D.canvasArea.getBoundingClientRect();
  S.panX=cr.width/2-wx*S.scale; S.panY=cr.height/2-wy*S.scale; applyXform();
});

/* ── Mobile bar ── */
D.mobAddBtn.addEventListener('click', () => {
  D.addSheet.classList.contains('on') ? closeSheets() : openSheet(D.addSheet);
});
D.mobStyleBtn.addEventListener('click', () => {
  D.styleSheet.classList.contains('on') ? closeSheets() : openSheet(D.styleSheet);
});
D.mobPanBtn.addEventListener('click', () => {
  const t = S.tool === 'hand' ? 'select' : 'hand';
  setTool(t); toast(t==='hand' ? 'Pan mode' : 'Select mode');
});
D.mobUndoBtn.addEventListener('click', undo);
D.mobFitBtn.addEventListener('click', fitScreen);
D.sheetOverlay.addEventListener('click', closeSheets);

/* Sheet — Add */
$('sheetAddCard').addEventListener('click', () => { closeSheets(); addCard(); });
$('sheetAddText').addEventListener('click', () => { closeSheets(); addText(); });
$('sheetAddSticky').addEventListener('click', () => { closeSheets(); addSticky(); });

/* Sheet — Style swatches */
D.sheetSwatches.addEventListener('click', e => {
  const sw=e.target.closest('.swatch'); if(!sw) return;
  applyColor(sw.dataset.color);
  syncColorUI(sw.dataset.color);
});

/* Sheet — actions */
$('sheetExport').addEventListener('click', () => { closeSheets(); exportBoard(); });
$('sheetImport').addEventListener('click', () => { closeSheets(); D.fileInput.click(); });
$('sheetTheme').addEventListener('click', () => { toggleTheme(); toast(S.theme==='dark'?'Dark mode':'Light mode'); });
$('sheetFonts').addEventListener('click', () => { closeSheets(); D.fontModalBg.classList.add('on'); });

/* Keyboard */
document.addEventListener('keydown', e => {
  const editing = document.activeElement.tagName==='INPUT' || document.activeElement.tagName==='TEXTAREA' || document.activeElement.isContentEditable;
  if (e.code==='Space' && !editing) { if(!S.spaceDown){ S.spaceDown=true; S.prevTool=S.tool; setTool('hand'); } e.preventDefault(); return; }
  if (editing) return;
  switch(e.key.toLowerCase()) {
    case 'v': setTool('select'); break;
    case 'h': setTool('hand'); break;
    case 'n': addCard(); break;
    case 't': addText(); break;
    case 's': addSticky(); break;
    case 'f': fitScreen(); break;
    case 'r': if(!e.ctrlKey&&!e.metaKey) resetView(); break;
    case '+': case '=': zoomAt(1.2); break;
    case '-': zoomAt(1/1.2); break;
    case 'delete': case 'backspace': if(S.selId) deleteEl(S.selId); break;
    case 'd': if((e.ctrlKey||e.metaKey)&&S.selId){ e.preventDefault(); duplicateEl(S.selId); } break;
    case 'z': if(e.ctrlKey||e.metaKey){ e.preventDefault(); e.shiftKey?redo():undo(); } break;
    case 'y': if(e.ctrlKey||e.metaKey){ e.preventDefault(); redo(); } break;
    case 'escape': deselect(); hideCtx(); D.searchDrop.classList.remove('open'); break;
  }
});
document.addEventListener('keyup', e => { if(e.code==='Space'){ S.spaceDown=false; setTool(S.prevTool); } });

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
function init() {
  setTheme('dark');
  setCursor();
  applyXform();

  const demos = [
    { kind:'card',  x:60,  y:60,  w:270, h:150, title:'👋 Welcome', content:'<p>Your <strong>visual idea canvas</strong>. Create cards, sticky notes, and free text on the infinite board.</p>', color:'#6366f1', font:"'Syne',sans-serif", fs:13 },
    { kind:'card',  x:360, y:60,  w:260, h:150, title:'⌨️ Shortcuts', content:'<p><strong>N</strong> Card &nbsp;·&nbsp; <strong>T</strong> Text &nbsp;·&nbsp; <strong>S</strong> Sticky<br><strong>H</strong> Pan &nbsp;·&nbsp; <strong>F</strong> Fit &nbsp;·&nbsp; <strong>Ctrl+Z</strong> Undo<br><strong>Ctrl+D</strong> Duplicate &nbsp;·&nbsp; Right-click menu</p>', color:'#10b981', font:"'DM Sans',sans-serif", fs:13 },
    { kind:'sticky', x:60,  y:265, w:190, h:145, title:'Idea 💡', content:'<p>Sticky notes for quick thoughts. Drag by the header.</p>', color:'#fde68a', font:"'DM Sans',sans-serif", fs:13, locked:false },
    { kind:'sticky', x:270, y:265, w:190, h:145, title:'Upload fonts 🎨', content:'<p>Use the font panel to upload .ttf, .otf, .woff files!</p>', color:'#bbf7d0', font:"'DM Sans',sans-serif", fs:13, locked:false },
    { kind:'text',   x:490, y:80,  w:210, title:'Free Text', content:'<p style="font-size:30px;font-weight:800;font-family:\'Syne\',sans-serif;color:#a78bfa">Free Text</p><p style="font-size:12px;opacity:.65;margin-top:4px">No box. Pure type on canvas.<br>Click to edit, drag to move.</p>', color:'#a78bfa', font:"'Syne',sans-serif", fs:13 },
    { kind:'text',   x:510, y:280, w:170, title:'Ideas', content:'<p style="font-size:44px;font-weight:800;color:#ec4899;font-family:\'Syne\',sans-serif">Ideas</p>', color:'#ec4899', font:"'Syne',sans-serif", fs:44 },
  ];

  demos.forEach(d => {
    const id = genId(); S.maxZ++;
    S.els[id] = { ...d, id, locked:d.locked??false, z:S.maxZ };
  });

  rebuildAll(); countEls();
  S.hist=[]; S.histIdx=-1; pushHist(); syncHistBtns(); scheduleMM();
}

init();
