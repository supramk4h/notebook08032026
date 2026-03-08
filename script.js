/* ================================================================
   SKETCHBOARD PRO — script.js
   Advanced version with free text, sticky notes, custom fonts,
   context menu, duplicate, z-order, and full undo/redo
   ================================================================ */
'use strict';

/* ================================================================
   STATE
   ================================================================ */
const S = {
  elements: {},     // id -> element data
  nextId: 1,
  activeTool: 'select',
  selectedId: null,
  activeEditorId: null,

  panX: 0, panY: 0,
  scale: 1,
  MIN_SCALE: 0.1,
  MAX_SCALE: 5,

  // Interaction
  dragging: false, dragId: null, dragOffX: 0, dragOffY: 0, dragMoved: false,
  resizing: false, resizeId: null, resizeStartW: 0, resizeStartH: 0, resizeStartX: 0, resizeStartY: 0,
  panning: false, panStartX: 0, panStartY: 0, panStartPX: 0, panStartPY: 0,
  spaceHeld: false, prevTool: 'select',

  // Z-order tracker
  maxZ: 10,

  // History
  history: [], histIdx: -1,

  // Selected properties
  selectedColor: '#6366f1',
  selectedFont: "'DM Sans', sans-serif",
  selectedFontSize: 16,

  // Uploaded fonts
  uploadedFonts: [],

  theme: 'dark',
};

/* ================================================================
   DOM REFS
   ================================================================ */
const D = {
  world: document.getElementById('world'),
  canvasWrap: document.getElementById('canvasWrap'),
  toolbar: document.getElementById('toolbar'),

  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  zoomLabel: document.getElementById('zoomLabel'),
  zoomLabelBtn: document.getElementById('zoomLabelBtn'),
  fitBtn: document.getElementById('fitBtn'),
  resetBtn: document.getElementById('resetBtn'),
  importBtn: document.getElementById('importBtn'),
  exportBtn: document.getElementById('exportBtn'),
  themeBtn: document.getElementById('themeBtn'),

  addBoxBtn: document.getElementById('addBoxBtn'),
  addTextBtn: document.getElementById('addTextBtn'),
  addStickyBtn: document.getElementById('addStickyBtn'),
  toolSelect: document.getElementById('toolSelect'),
  toolHand: document.getElementById('toolHand'),

  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),

  presetColors: document.getElementById('presetColors'),
  customColor: document.getElementById('customColor'),
  fontSelector: document.getElementById('fontSelector'),
  uploadFontBtn: document.getElementById('uploadFontBtn'),
  uploadedFontsList: document.getElementById('uploadedFontsList'),

  sizeGrid: document.querySelector('.size-grid'),
  customFontSize: document.getElementById('customFontSize'),

  formatBar: document.getElementById('formatBar'),
  fmtBlock: document.getElementById('fmtBlock'),
  fmtTextColor: document.getElementById('fmtTextColor'),
  fmtTextColorPreview: document.getElementById('fmtTextColorPreview'),
  fmtHighlight: document.getElementById('fmtHighlight'),
  fmtHighlightPreview: document.getElementById('fmtHighlightPreview'),
  fmtClearBtn: document.getElementById('fmtClearBtn'),

  contextMenu: document.getElementById('contextMenu'),

  minimap: document.getElementById('minimap'),
  minimapCanvas: document.getElementById('minimapCanvas'),
  minimapViewport: document.getElementById('minimapViewport'),
  minimapToggle: document.getElementById('minimapToggle'),

  toastContainer: document.getElementById('toastContainer'),
  fileInput: document.getElementById('fileInput'),
  fontFileInput: document.getElementById('fontFileInput'),
  fontModal: document.getElementById('fontModal'),
  fontModalClose: document.getElementById('fontModalClose'),
  fontDropZone: document.getElementById('fontDropZone'),
  fontBrowseBtn: document.getElementById('fontBrowseBtn'),
  loadedFontsList: document.getElementById('loadedFontsList'),

  boxCount: document.getElementById('boxCount'),
  coordInfo: document.getElementById('coordInfo'),
};

/* ================================================================
   HISTORY
   ================================================================ */
function snapshot() {
  return { elements: JSON.parse(JSON.stringify(S.elements)), nextId: S.nextId, maxZ: S.maxZ };
}
function pushHistory() {
  S.history = S.history.slice(0, S.histIdx + 1);
  S.history.push(snapshot());
  if (S.history.length > 100) S.history.shift(); else S.histIdx++;
  updateHistoryBtns();
}
function undo() {
  if (S.histIdx <= 0) return;
  S.histIdx--;
  applySnapshot(S.history[S.histIdx]);
  updateHistoryBtns();
  toast('Undone');
}
function redo() {
  if (S.histIdx >= S.history.length - 1) return;
  S.histIdx++;
  applySnapshot(S.history[S.histIdx]);
  updateHistoryBtns();
  toast('Redone');
}
function applySnapshot(snap) {
  S.elements = JSON.parse(JSON.stringify(snap.elements));
  S.nextId = snap.nextId;
  S.maxZ = snap.maxZ || 10;
  S.selectedId = null;
  S.activeEditorId = null;
  hideFormatBar();
  rebuildAll();
  updateBoxCount();
  scheduleMinimap();
}
function updateHistoryBtns() {
  D.undoBtn.disabled = S.histIdx <= 0;
  D.redoBtn.disabled = S.histIdx >= S.history.length - 1;
}

/* ================================================================
   ELEMENT CREATION
   ================================================================ */
function genId() { return 'el_' + (S.nextId++); }

function centerPos(w, h) {
  const r = D.canvasWrap.getBoundingClientRect();
  return {
    x: (r.width / 2 - S.panX) / S.scale - w / 2,
    y: (r.height / 2 - S.panY) / S.scale - h / 2,
  };
}

function addCard() {
  pushHistory();
  const p = centerPos(260, 150);
  const n = Object.keys(S.elements).length + 1;
  const id = genId();
  S.maxZ++;
  S.elements[id] = {
    id, kind: 'card',
    x: p.x, y: p.y, width: 260, height: 150,
    title: `Card ${n}`, content: '',
    color: S.selectedColor,
    font: S.selectedFont,
    fontSize: S.selectedFontSize,
    locked: false,
    z: S.maxZ,
  };
  renderElement(S.elements[id]);
  updateBoxCount(); scheduleMinimap();
  setTimeout(() => { selectEl(id); getElDOM(id)?.querySelector('.box-title-input')?.focus(); }, 50);
}

function addFreeText() {
  pushHistory();
  const p = centerPos(180, 40);
  const id = genId();
  S.maxZ++;
  S.elements[id] = {
    id, kind: 'text',
    x: p.x, y: p.y, width: 180,
    content: '',
    title: 'Free Text',
    color: S.selectedColor,
    font: S.selectedFont,
    fontSize: S.selectedFontSize,
    z: S.maxZ,
  };
  renderElement(S.elements[id]);
  updateBoxCount(); scheduleMinimap();
  setTimeout(() => {
    selectEl(id);
    const editor = getElDOM(id)?.querySelector('.free-text-editor');
    if (editor) { editor.focus(); placeCaretAtEnd(editor); }
  }, 50);
}

function addSticky() {
  pushHistory();
  const p = centerPos(200, 160);
  const n = Object.keys(S.elements).length + 1;
  const id = genId();
  const stickyColors = ['#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa','#99f6e4'];
  const col = S.selectedColor === '#6366f1' ? stickyColors[n % stickyColors.length] : S.selectedColor;
  S.maxZ++;
  S.elements[id] = {
    id, kind: 'sticky',
    x: p.x, y: p.y, width: 200, height: 160,
    title: `Note ${n}`, content: '',
    color: col,
    font: S.selectedFont,
    fontSize: S.selectedFontSize,
    locked: false,
    z: S.maxZ,
  };
  renderElement(S.elements[id]);
  updateBoxCount(); scheduleMinimap();
  setTimeout(() => { selectEl(id); getElDOM(id)?.querySelector('.sticky-title-input')?.focus(); }, 50);
}

/* ================================================================
   RENDERING
   ================================================================ */
function renderElement(data) {
  const old = getElDOM(data.id);
  if (old) old.remove();

  let el;
  if (data.kind === 'card') el = buildCard(data);
  else if (data.kind === 'sticky') el = buildSticky(data);
  else if (data.kind === 'text') el = buildFreeText(data);

  if (el) {
    el.style.zIndex = data.z || 10;
    D.world.appendChild(el);
  }
}

function rebuildAll() {
  D.world.innerHTML = '';
  // Sort by z so DOM order matches
  Object.values(S.elements)
    .sort((a, b) => (a.z || 10) - (b.z || 10))
    .forEach(renderElement);
}

function getElDOM(id) { return document.getElementById(id); }

/* ---- CARD ---- */
function buildCard(data) {
  const el = document.createElement('div');
  el.className = 'text-box';
  el.id = data.id;
  setPos(el, data);
  el.style.setProperty('--box-accent', data.color);
  el.style.fontFamily = data.font;
  el.style.fontSize = data.fontSize + 'px';
  if (data.locked) el.classList.add('locked');

  el.innerHTML = `
    <div class="box-header" data-drag>
      <div class="box-color-dot"></div>
      <input class="box-title-input" type="text" value="${esc(data.title)}" placeholder="Title…" spellcheck="false" />
      <div class="box-actions">
        <button class="box-action-btn lock-btn${data.locked?' lock-active':''}" title="${data.locked?'Unlock':'Lock'}">
          ${data.locked ? lockSVG() : unlockSVG()}
        </button>
        <button class="box-action-btn delete-btn" title="Delete">${trashSVG()}</button>
      </div>
    </div>
    <div class="box-content">
      <div class="box-editor" contenteditable="${data.locked?'false':'true'}"
        data-placeholder="Write something…">${data.content}</div>
    </div>
    <div class="resize-handle"><svg viewBox="0 0 10 10" stroke-width="2"><path d="M2 10 L10 2 M6 10 L10 6"/></svg></div>
  `;

  wireCard(el, data.id);
  return el;
}

function wireCard(el, id) {
  const header = el.querySelector('[data-drag]');
  const titleInput = el.querySelector('.box-title-input');
  const editor = el.querySelector('.box-editor');
  const lockBtn = el.querySelector('.lock-btn');
  const deleteBtn = el.querySelector('.delete-btn');
  const resize = el.querySelector('.resize-handle');

  header.addEventListener('mousedown', e => {
    if (e.target === titleInput) return;
    e.preventDefault();
    if (S.elements[id]?.locked || S.activeTool === 'hand') return;
    startDrag(id, e.clientX, e.clientY);
  });
  header.addEventListener('touchstart', e => {
    if (e.target === titleInput) return;
    if (S.elements[id]?.locked) return;
    startDrag(id, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  el.addEventListener('mousedown', e => {
    if (S.activeTool === 'hand') return;
    if (!e.target.closest('.box-action-btn') && !e.target.closest('.resize-handle')) selectEl(id);
    e.stopPropagation();
  });
  el.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, id); });

  titleInput.addEventListener('input', () => { if (S.elements[id]) S.elements[id].title = titleInput.value; scheduleMinimap(); });
  titleInput.addEventListener('change', pushHistory);

  editor.addEventListener('focus', () => { S.activeEditorId = id; showFormatBar(); syncFmtState(); });
  editor.addEventListener('blur', () => {
    if (S.elements[id]) S.elements[id].content = editor.innerHTML;
    pushHistory();
    setTimeout(() => {
      if (!document.activeElement?.closest?.('.format-bar')) { S.activeEditorId = null; hideFormatBar(); }
    }, 100);
  });
  editor.addEventListener('input', () => { if (S.elements[id]) S.elements[id].content = editor.innerHTML; scheduleMinimap(); });
  editor.addEventListener('keyup', syncFmtState);
  editor.addEventListener('mouseup', syncFmtState);

  lockBtn.addEventListener('click', e => { e.stopPropagation(); toggleLock(id); });
  deleteBtn.addEventListener('click', e => { e.stopPropagation(); deleteEl(id); });

  resize.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    if (S.elements[id]?.locked) return;
    startResize(id, e.clientX, e.clientY);
  });
  resize.addEventListener('touchstart', e => {
    if (S.elements[id]?.locked) return;
    startResize(id, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
}

/* ---- STICKY ---- */
function buildSticky(data) {
  const el = document.createElement('div');
  el.className = 'sticky-box';
  el.id = data.id;
  setPos(el, data);
  el.style.background = data.color;
  el.style.fontFamily = data.font;
  el.style.fontSize = data.fontSize + 'px';
  if (data.locked) el.classList.add('locked');

  el.innerHTML = `
    <div class="sticky-dog-ear"></div>
    <div class="sticky-header" data-drag>
      <input class="sticky-title-input" type="text" value="${esc(data.title)}" placeholder="Title…" spellcheck="false" />
      <div class="sticky-actions">
        <button class="sticky-action-btn lock-btn" title="${data.locked?'Unlock':'Lock'}">${data.locked?lockSVG():unlockSVG()}</button>
        <button class="sticky-action-btn delete-btn" title="Delete">${trashSVG()}</button>
      </div>
    </div>
    <div class="sticky-content">
      <div class="sticky-editor" contenteditable="${data.locked?'false':'true'}"
        data-placeholder="Quick note…">${data.content}</div>
    </div>
    <div class="resize-handle"><svg viewBox="0 0 10 10" stroke-width="2"><path d="M2 10 L10 2 M6 10 L10 6"/></svg></div>
  `;

  wireSticky(el, data.id);
  return el;
}

function wireSticky(el, id) {
  const header = el.querySelector('[data-drag]');
  const titleInput = el.querySelector('.sticky-title-input');
  const editor = el.querySelector('.sticky-editor');
  const lockBtn = el.querySelector('.lock-btn');
  const deleteBtn = el.querySelector('.delete-btn');
  const resize = el.querySelector('.resize-handle');

  header.addEventListener('mousedown', e => {
    if (e.target === titleInput) return;
    e.preventDefault();
    if (S.elements[id]?.locked || S.activeTool === 'hand') return;
    startDrag(id, e.clientX, e.clientY);
  });
  header.addEventListener('touchstart', e => {
    if (e.target === titleInput) return;
    if (S.elements[id]?.locked) return;
    startDrag(id, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  el.addEventListener('mousedown', e => {
    if (S.activeTool === 'hand') return;
    if (!e.target.closest('.sticky-action-btn') && !e.target.closest('.resize-handle')) selectEl(id);
    e.stopPropagation();
  });
  el.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, id); });

  titleInput.addEventListener('input', () => { if (S.elements[id]) S.elements[id].title = titleInput.value; scheduleMinimap(); });
  titleInput.addEventListener('change', pushHistory);

  editor.addEventListener('focus', () => { S.activeEditorId = id; showFormatBar(); syncFmtState(); });
  editor.addEventListener('blur', () => {
    if (S.elements[id]) S.elements[id].content = editor.innerHTML;
    pushHistory();
    setTimeout(() => {
      if (!document.activeElement?.closest?.('.format-bar')) { S.activeEditorId = null; hideFormatBar(); }
    }, 100);
  });
  editor.addEventListener('input', () => { if (S.elements[id]) S.elements[id].content = editor.innerHTML; scheduleMinimap(); });
  editor.addEventListener('keyup', syncFmtState);
  editor.addEventListener('mouseup', syncFmtState);

  lockBtn.addEventListener('click', e => { e.stopPropagation(); toggleLock(id); });
  deleteBtn.addEventListener('click', e => { e.stopPropagation(); deleteEl(id); });

  resize.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    if (S.elements[id]?.locked) return;
    startResize(id, e.clientX, e.clientY);
  });
  resize.addEventListener('touchstart', e => {
    if (S.elements[id]?.locked) return;
    startResize(id, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
}

/* ---- FREE TEXT ---- */
function buildFreeText(data) {
  const el = document.createElement('div');
  el.className = 'free-text';
  el.id = data.id;
  setPos(el, data);
  el.style.width = (data.width || 180) + 'px';
  el.style.fontFamily = data.font;
  el.style.fontSize = data.fontSize + 'px';
  el.style.color = data.color;

  el.innerHTML = `
    <div class="free-text-handle">
      <button class="free-text-handle-btn" data-action="lock" title="Lock">${unlockSVG()}</button>
      <button class="free-text-handle-btn delete-btn" data-action="delete" title="Delete">${trashSVG()}</button>
    </div>
    <div class="free-text-editor" contenteditable="true"
      data-placeholder="Type freely…">${data.content}</div>
    <div class="resize-handle"><svg viewBox="0 0 10 10" stroke-width="2"><path d="M2 10 L10 2 M6 10 L10 6"/></svg></div>
  `;

  wireFreeText(el, data.id);
  return el;
}

function wireFreeText(el, id) {
  const editor = el.querySelector('.free-text-editor');
  const resize = el.querySelector('.resize-handle');

  // Drag on the element itself (when not editing)
  el.addEventListener('mousedown', e => {
    if (S.activeTool === 'hand') return;
    if (e.target.closest('.free-text-handle-btn') || e.target.closest('.resize-handle')) return;
    if (e.target === editor && S.selectedId === id) return; // allow cursor in text
    selectEl(id);
    if (e.target !== editor) {
      e.preventDefault();
      startDrag(id, e.clientX, e.clientY);
    }
    e.stopPropagation();
  });
  el.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, id); });
  el.addEventListener('touchstart', e => {
    if (e.target.closest('.free-text-handle-btn') || e.target.closest('.resize-handle')) return;
    if (e.target === editor) return;
    startDrag(id, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // Handle bar buttons
  el.querySelector('[data-action="lock"]').addEventListener('click', e => { e.stopPropagation(); toggleLock(id); });
  el.querySelector('[data-action="delete"]').addEventListener('click', e => { e.stopPropagation(); deleteEl(id); });

  editor.addEventListener('focus', () => { S.activeEditorId = id; showFormatBar(); syncFmtState(); });
  editor.addEventListener('blur', () => {
    if (S.elements[id]) {
      S.elements[id].content = editor.innerHTML;
      const plain = editor.innerText.replace(/\s+/g, ' ').trim();
      S.elements[id].title = plain ? plain.slice(0, 40) + (plain.length > 40 ? '…' : '') : 'Free Text';
    }
    pushHistory();
    setTimeout(() => {
      if (!document.activeElement?.closest?.('.format-bar')) { S.activeEditorId = null; hideFormatBar(); }
    }, 100);
  });
  editor.addEventListener('input', () => {
    if (S.elements[id]) {
      S.elements[id].content = editor.innerHTML;
      const plain = editor.innerText.replace(/\s+/g, ' ').trim();
      S.elements[id].title = plain ? plain.slice(0, 40) + (plain.length > 40 ? '…' : '') : 'Free Text';
    }
    scheduleMinimap();
  });
  editor.addEventListener('keyup', syncFmtState);
  editor.addEventListener('mouseup', syncFmtState);

  resize.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    startResize(id, e.clientX, e.clientY);
  });
  resize.addEventListener('touchstart', e => {
    startResize(id, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
}

/* ================================================================
   DRAG
   ================================================================ */
function startDrag(id, cx, cy) {
  S.dragging = true; S.dragId = id; S.dragMoved = false;
  const el = S.elements[id];
  const wp = clientToWorld(cx, cy);
  S.dragOffX = wp.x - el.x;
  S.dragOffY = wp.y - el.y;
  selectEl(id);
  bringToFront(id, false);
  const dom = getElDOM(id);
  if (dom) { dom.style.transition = 'none'; dom.style.zIndex = S.maxZ + 10; }
}

function onDragMove(cx, cy) {
  if (!S.dragging || !S.dragId) return;
  const id = S.dragId;
  const el = S.elements[id];
  const wp = clientToWorld(cx, cy);
  el.x = wp.x - S.dragOffX;
  el.y = wp.y - S.dragOffY;
  const dom = getElDOM(id);
  if (dom) { dom.style.left = el.x + 'px'; dom.style.top = el.y + 'px'; }
  S.dragMoved = true;
  scheduleMinimap();
  D.coordInfo.textContent = `${Math.round(el.x)}, ${Math.round(el.y)}`;
}

function endDrag() {
  if (!S.dragging) return;
  const dom = getElDOM(S.dragId);
  if (dom) { dom.style.transition = ''; dom.style.zIndex = S.elements[S.dragId]?.z || 10; }
  if (S.dragMoved) pushHistory();
  S.dragging = false; S.dragId = null; S.dragMoved = false;
}

/* ================================================================
   RESIZE
   ================================================================ */
function startResize(id, cx, cy) {
  S.resizing = true; S.resizeId = id;
  const el = S.elements[id];
  S.resizeStartW = el.width || 200;
  S.resizeStartH = el.height || 150;
  S.resizeStartX = cx; S.resizeStartY = cy;
}

function onResizeMove(cx, cy) {
  if (!S.resizing) return;
  const id = S.resizeId;
  const el = S.elements[id];
  const dw = (cx - S.resizeStartX) / S.scale;
  const dh = (cy - S.resizeStartY) / S.scale;
  el.width = Math.max(el.kind === 'text' ? 60 : 160, S.resizeStartW + dw);
  if (el.kind !== 'text') el.height = Math.max(90, S.resizeStartH + dh);
  const dom = getElDOM(id);
  if (dom) {
    dom.style.width = el.width + 'px';
    if (el.kind !== 'text') dom.style.minHeight = el.height + 'px';
  }
  scheduleMinimap();
}

function endResize() {
  if (!S.resizing) return;
  pushHistory();
  S.resizing = false; S.resizeId = null;
}

/* ================================================================
   SELECTION
   ================================================================ */
function selectEl(id) {
  if (S.selectedId === id) return;
  deselectAll();
  S.selectedId = id;
  const dom = getElDOM(id);
  if (dom) dom.classList.add('selected');
  // Sync sidebar to element properties
  const el = S.elements[id];
  if (el) {
    S.selectedColor = el.color;
    syncColorUI(el.color);
    if (el.font) { S.selectedFont = el.font; D.fontSelector.value = el.font; }
    if (el.fontSize) {
      S.selectedFontSize = el.fontSize;
      D.customFontSize.value = el.fontSize;
      syncSizeBtns(el.fontSize);
    }
  }
}

function deselectAll() {
  if (S.selectedId) {
    const dom = getElDOM(S.selectedId);
    if (dom) dom.classList.remove('selected');
    S.selectedId = null;
  }
}

function syncColorUI(color) {
  D.customColor.value = color;
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === color);
  });
}

function syncSizeBtns(size) {
  document.querySelectorAll('.size-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.size) === size);
  });
}

/* ================================================================
   LOCK / DELETE / Z-ORDER / DUPLICATE
   ================================================================ */
function toggleLock(id) {
  const el = S.elements[id];
  if (!el) return;
  el.locked = !el.locked;
  renderElement(el); // re-render to update state
  if (S.selectedId === id) getElDOM(id)?.classList.add('selected');
  pushHistory();
  toast(el.locked ? 'Locked' : 'Unlocked');
}

function deleteEl(id) {
  pushHistory();
  const dom = getElDOM(id);
  if (dom) {
    dom.style.transition = 'opacity 0.15s, transform 0.15s';
    dom.style.opacity = '0';
    dom.style.transform = dom.style.transform + ' scale(0.85)';
    setTimeout(() => dom.remove(), 160);
  }
  delete S.elements[id];
  if (S.selectedId === id) { S.selectedId = null; }
  if (S.activeEditorId === id) { S.activeEditorId = null; hideFormatBar(); }
  updateBoxCount(); scheduleMinimap();
}

function duplicateEl(id) {
  const src = S.elements[id];
  if (!src) return;
  pushHistory();
  const newId = genId();
  S.maxZ++;
  S.elements[newId] = {
    ...JSON.parse(JSON.stringify(src)),
    id: newId,
    x: src.x + 28,
    y: src.y + 28,
    z: S.maxZ,
  };
  renderElement(S.elements[newId]);
  updateBoxCount(); scheduleMinimap();
  setTimeout(() => selectEl(newId), 20);
  toast('Duplicated');
}

function bringToFront(id, doHistory = true) {
  const el = S.elements[id];
  if (!el) return;
  if (doHistory) pushHistory();
  S.maxZ++;
  el.z = S.maxZ;
  const dom = getElDOM(id);
  if (dom) dom.style.zIndex = S.maxZ;
  if (doHistory) toast('Brought to front');
}

function sendToBack(id) {
  const el = S.elements[id];
  if (!el) return;
  pushHistory();
  const minZ = Math.min(...Object.values(S.elements).map(e => e.z || 10));
  el.z = minZ - 1;
  const dom = getElDOM(id);
  if (dom) dom.style.zIndex = el.z;
  toast('Sent to back');
}

/* ================================================================
   CONTEXT MENU
   ================================================================ */
let ctxTargetId = null;

function showContextMenu(e, id) {
  ctxTargetId = id;
  const menu = D.contextMenu;
  menu.classList.add('show');
  // Position
  let x = e.clientX, y = e.clientY;
  const mr = menu.getBoundingClientRect();
  // Temporarily show to measure
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  requestAnimationFrame(() => {
    const mr2 = menu.getBoundingClientRect();
    if (x + mr2.width > window.innerWidth - 10) x -= mr2.width;
    if (y + mr2.height > window.innerHeight - 10) y -= mr2.height;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  });
}

function hideContextMenu() {
  D.contextMenu.classList.remove('show');
  ctxTargetId = null;
}

D.contextMenu.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn || !ctxTargetId) return;
  const id = ctxTargetId;
  hideContextMenu();
  const action = btn.dataset.action;
  if (action === 'duplicate') duplicateEl(id);
  else if (action === 'bringFront') bringToFront(id);
  else if (action === 'sendBack') sendToBack(id);
  else if (action === 'delete') deleteEl(id);
});

document.addEventListener('click', e => {
  if (!D.contextMenu.contains(e.target)) hideContextMenu();
});

/* ================================================================
   CANVAS TRANSFORM
   ================================================================ */
function applyTransform() {
  D.world.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.scale})`;
  D.zoomLabel.textContent = Math.round(S.scale * 100) + '%';
  scheduleMinimap();
}

function clientToWorld(cx, cy) {
  const r = D.canvasWrap.getBoundingClientRect();
  return { x: (cx - r.left - S.panX) / S.scale, y: (cy - r.top - S.panY) / S.scale };
}

function zoomAt(factor, cx, cy) {
  const r = D.canvasWrap.getBoundingClientRect();
  const ox = (cx !== undefined ? cx : r.width / 2) - r.left;
  const oy = (cy !== undefined ? cy : r.height / 2) - r.top;
  const ns = Math.min(S.MAX_SCALE, Math.max(S.MIN_SCALE, S.scale * factor));
  const ratio = ns / S.scale;
  S.panX = ox - (ox - S.panX) * ratio;
  S.panY = oy - (oy - S.panY) * ratio;
  S.scale = ns;
  applyTransform();
}

function resetView() { S.scale = 1; S.panX = 0; S.panY = 0; applyTransform(); toast('View reset'); }

function fitToScreen() {
  const els = Object.values(S.elements);
  if (!els.length) { resetView(); return; }
  let mn = {x:Infinity,y:Infinity}, mx = {x:-Infinity,y:-Infinity};
  els.forEach(e => {
    mn.x = Math.min(mn.x, e.x); mn.y = Math.min(mn.y, e.y);
    mx.x = Math.max(mx.x, e.x + (e.width||200)); mx.y = Math.max(mx.y, e.y + (e.height||150));
  });
  const pad = 80;
  const bw = mx.x - mn.x + pad * 2, bh = mx.y - mn.y + pad * 2;
  const r = D.canvasWrap.getBoundingClientRect();
  S.scale = Math.min(1.5, Math.max(S.MIN_SCALE, Math.min(r.width / bw, r.height / bh)));
  S.panX = r.width / 2 - (mn.x - pad + bw / 2) * S.scale;
  S.panY = r.height / 2 - (mn.y - pad + bh / 2) * S.scale;
  applyTransform(); toast('Fit to screen');
}

/* ================================================================
   PAN
   ================================================================ */
function startPan(cx, cy) {
  S.panning = true;
  S.panStartX = cx; S.panStartY = cy;
  S.panStartPX = S.panX; S.panStartPY = S.panY;
  D.canvasWrap.classList.add('cursor-grabbing');
}

function onPanMove(cx, cy) {
  if (!S.panning) return;
  S.panX = S.panStartPX + (cx - S.panStartX);
  S.panY = S.panStartPY + (cy - S.panStartY);
  applyTransform();
}

function endPan() {
  if (!S.panning) return;
  S.panning = false;
  D.canvasWrap.classList.remove('cursor-grabbing');
  updateCursor();
}

/* ================================================================
   TOOL & CURSOR
   ================================================================ */
function setTool(tool) {
  S.activeTool = tool;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === tool)
  );
  updateCursor();
}

function updateCursor() {
  D.canvasWrap.classList.toggle('cursor-hand', S.activeTool === 'hand');
  D.canvasWrap.classList.toggle('cursor-select', S.activeTool === 'select');
}

/* ================================================================
   FORMAT BAR
   ================================================================ */
function showFormatBar() { D.formatBar.classList.add('visible'); }
function hideFormatBar() { D.formatBar.classList.remove('visible'); }

function execFmt(cmd, val) {
  document.execCommand(cmd, false, val || null);
  syncFmtState();
  saveActiveContent();
}

function syncFmtState() {
  ['bold','italic','underline','strikeThrough'].forEach(cmd => {
    const btn = D.formatBar.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

function saveActiveContent() {
  const id = S.activeEditorId;
  if (!id || !S.elements[id]) return;
  const el = S.elements[id];
  const editorSel = el.kind === 'card' ? '.box-editor' : el.kind === 'sticky' ? '.sticky-editor' : '.free-text-editor';
  const dom = getElDOM(id)?.querySelector(editorSel);
  if (dom) el.content = dom.innerHTML;
}

/* ================================================================
   SEARCH & NAVIGATION
   ================================================================ */
function getDisplayName(e) {
  if (e.kind === 'text') {
    // For free text, title is auto-set from content — show it directly
    return e.title && e.title !== 'Free Text' ? e.title : (stripHtml(e.content).slice(0, 40) || 'Free Text');
  }
  return e.title || 'Untitled';
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.innerText.replace(/\s+/g, ' ').trim();
}

function doSearch(q) {
  q = q.trim().toLowerCase();
  D.searchResults.innerHTML = '';
  if (!q) { D.searchResults.classList.remove('show'); return; }

  const matches = Object.values(S.elements).filter(e => {
    const name = getDisplayName(e).toLowerCase();
    const content = stripHtml(e.content || '').toLowerCase();
    return name.includes(q) || content.includes(q);
  });

  if (!matches.length) {
    D.searchResults.innerHTML = `<div class="search-result-item" style="color:var(--text-faint)">No results found</div>`;
  } else {
    matches.forEach(e => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      const kindLabel = { card: 'Card', sticky: 'Sticky', text: 'Text' };
      const displayName = getDisplayName(e);
      item.innerHTML = `
        <span class="search-result-dot" style="background:${e.color}"></span>
        <span>${esc(displayName)}</span>
        <span class="search-result-type">${kindLabel[e.kind] || ''}</span>
      `;
      item.addEventListener('click', () => { navigateTo(e.id); D.searchResults.classList.remove('show'); D.searchInput.value = ''; });
      D.searchResults.appendChild(item);
    });
  }
  D.searchResults.classList.add('show');
}

function navigateTo(id) {
  const el = S.elements[id];
  if (!el) return;
  const r = D.canvasWrap.getBoundingClientRect();
  const w = el.width || 180, h = el.height || 40;
  S.panX = r.width / 2 - (el.x + w / 2) * S.scale;
  S.panY = r.height / 2 - (el.y + h / 2) * S.scale;
  applyTransform();
  selectEl(id);
  const dom = getElDOM(id);
  if (dom) {
    dom.classList.add('highlight-flash');
    setTimeout(() => dom.classList.remove('highlight-flash'), 900);
  }
}

/* ================================================================
   MINIMAP
   ================================================================ */
let minimapFrame = null;
function scheduleMinimap() {
  if (minimapFrame) return;
  minimapFrame = requestAnimationFrame(() => { minimapFrame = null; drawMinimap(); });
}

function drawMinimap() {
  const mc = D.minimapCanvas;
  const mw = mc.offsetWidth, mh = mc.offsetHeight;
  mc.querySelectorAll('.minimap-dot').forEach(d => d.remove());

  const els = Object.values(S.elements);
  if (!els.length) { D.minimapViewport.style.display = 'none'; return; }

  let mn = {x:Infinity,y:Infinity}, mx = {x:-Infinity,y:-Infinity};
  els.forEach(e => {
    mn.x = Math.min(mn.x, e.x); mn.y = Math.min(mn.y, e.y);
    mx.x = Math.max(mx.x, e.x + (e.width||180)); mx.y = Math.max(mx.y, e.y + (e.height||40));
  });
  const pad = 50;
  mn.x -= pad; mn.y -= pad; mx.x += pad; mx.y += pad;
  const ww = mx.x - mn.x, wh = mx.y - mn.y;
  if (ww <= 0 || wh <= 0) return;
  const sc = Math.min(mw / ww, mh / wh);

  els.forEach(e => {
    const dot = document.createElement('div');
    dot.className = 'minimap-dot';
    const dw = Math.max(6, (e.width || 40) * sc);
    const dh = Math.max(4, (e.height || 16) * sc);
    dot.style.cssText = `
      left:${(e.x - mn.x + (e.width||40)/2) * sc}px;
      top:${(e.y - mn.y + (e.height||16)/2) * sc}px;
      width:${dw}px; height:${dh}px;
      background:${e.color}; opacity:0.7;
    `;
    dot.title = getDisplayName(e);
    dot.addEventListener('click', ev => { ev.stopPropagation(); navigateTo(e.id); });
    mc.appendChild(dot);
  });

  const r = D.canvasWrap.getBoundingClientRect();
  const vp = D.minimapViewport;
  vp.style.display = 'block';
  vp.style.left = (-S.panX / S.scale - mn.x) * sc + 'px';
  vp.style.top = (-S.panY / S.scale - mn.y) * sc + 'px';
  vp.style.width = (r.width / S.scale) * sc + 'px';
  vp.style.height = (r.height / S.scale) * sc + 'px';
}

/* ================================================================
   EXPORT / IMPORT
   ================================================================ */
function exportBoard() {
  const data = {
    version: 2, theme: S.theme,
    panX: S.panX, panY: S.panY, scale: S.scale,
    elements: Object.values(S.elements),
    uploadedFonts: S.uploadedFonts.map(f => ({ name: f.name, dataUrl: f.dataUrl })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'sketchboard_' + Date.now() + '.json';
  a.click(); URL.revokeObjectURL(url);
  toast('Board exported!');
}

function importBoard(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.elements) throw new Error('Invalid');
      pushHistory();
      S.elements = {};
      data.elements.forEach(el => { S.elements[el.id] = el; });
      // Fix nextId
      const nums = data.elements.map(e => parseInt(e.id.replace('el_',''))).filter(n => !isNaN(n));
      S.nextId = nums.length ? Math.max(...nums) + 1 : 1;
      if (data.panX !== undefined) { S.panX = data.panX; S.panY = data.panY; S.scale = data.scale; }
      if (data.theme) setTheme(data.theme);
      // Restore fonts
      if (data.uploadedFonts?.length) {
        data.uploadedFonts.forEach(f => loadFontFromDataUrl(f.name, f.dataUrl));
      }
      rebuildAll(); applyTransform(); updateBoxCount(); scheduleMinimap();
      toast('Board imported!');
    } catch { toast('Invalid JSON file'); }
  };
  reader.readAsText(file);
}

/* ================================================================
   CUSTOM FONTS
   ================================================================ */
function handleFontFiles(files) {
  Array.from(files).forEach(file => {
    const validExts = ['.ttf','.otf','.woff','.woff2'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) { toast(`Unsupported: ${file.name}`); return; }

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const fontName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      loadFontFromDataUrl(fontName, dataUrl);
      toast(`Font loaded: ${fontName}`);
    };
    reader.readAsDataURL(file);
  });
}

function loadFontFromDataUrl(fontName, dataUrl) {
  // Avoid duplicates
  if (S.uploadedFonts.find(f => f.name === fontName)) return;

  // Inject @font-face
  const style = document.createElement('style');
  style.textContent = `@font-face { font-family: '${fontName}'; src: url('${dataUrl}'); }`;
  document.head.appendChild(style);

  S.uploadedFonts.push({ name: fontName, dataUrl });
  addFontToSelectors(fontName);
  renderUploadedFontsList();
}

function addFontToSelectors(fontName) {
  const val = `'${fontName}', sans-serif`;
  // Main font selector
  if (!Array.from(D.fontSelector.options).find(o => o.value === val)) {
    const opt = new Option(fontName, val);
    D.fontSelector.appendChild(opt);
  }
  renderUploadedFontsList();
}

function renderUploadedFontsList() {
  D.uploadedFontsList.innerHTML = '';
  D.loadedFontsList.innerHTML = '';

  S.uploadedFonts.forEach(f => {
    // Sidebar list
    const item = document.createElement('div');
    item.className = 'uploaded-font-item';
    item.style.fontFamily = `'${f.name}', sans-serif`;
    const isActive = S.selectedFont === `'${f.name}', sans-serif`;
    if (isActive) item.classList.add('active');
    item.innerHTML = `
      <span>${f.name}</span>
      <button class="font-item-del" data-name="${f.name}">×</button>
    `;
    item.addEventListener('click', e => {
      if (e.target.closest('.font-item-del')) return;
      selectFont(`'${f.name}', sans-serif`);
    });
    item.querySelector('.font-item-del').addEventListener('click', e => {
      e.stopPropagation(); removeFont(f.name);
    });
    D.uploadedFontsList.appendChild(item);

    // Modal list
    const row = document.createElement('div');
    row.className = 'loaded-font-row';
    row.innerHTML = `
      <div>
        <div class="loaded-font-name" style="font-family:'${f.name}',sans-serif">${f.name}</div>
        <div class="loaded-font-preview" style="font-family:'${f.name}',sans-serif">AaBbCc 123</div>
      </div>
      <button class="loaded-font-del" data-name="${f.name}">×</button>
    `;
    row.querySelector('.loaded-font-del').addEventListener('click', () => removeFont(f.name));
    D.loadedFontsList.appendChild(row);
  });
}

function removeFont(name) {
  S.uploadedFonts = S.uploadedFonts.filter(f => f.name !== name);
  // Remove from selector
  const val = `'${name}', sans-serif`;
  Array.from(D.fontSelector.options).forEach(o => { if (o.value === val) o.remove(); });
  renderUploadedFontsList();
  toast(`Removed: ${name}`);
}

function selectFont(fontVal) {
  S.selectedFont = fontVal;
  D.fontSelector.value = fontVal;
  // Highlight in sidebar
  document.querySelectorAll('.uploaded-font-item').forEach(item => {
    const fn = item.querySelector('span')?.textContent;
    item.classList.toggle('active', `'${fn}', sans-serif` === fontVal);
  });
  // Apply to selected element
  if (S.selectedId) applyPropToSelected('font', fontVal);
}

/* ================================================================
   APPLY PROPERTIES TO SELECTED ELEMENT
   ================================================================ */
function applyColorToSelected(color) {
  S.selectedColor = color;
  syncColorUI(color);
  if (!S.selectedId) return;
  const el = S.elements[S.selectedId];
  if (!el) return;
  el.color = color;
  const dom = getElDOM(S.selectedId);
  if (!dom) return;
  if (el.kind === 'card') { dom.style.setProperty('--box-accent', color); dom.querySelector('.box-color-dot').style.background = color; }
  else if (el.kind === 'sticky') dom.style.background = color;
  else if (el.kind === 'text') { dom.style.color = color; }
  scheduleMinimap(); pushHistory();
}

function applyPropToSelected(prop, val) {
  if (!S.selectedId) return;
  const el = S.elements[S.selectedId];
  if (!el) return;
  el[prop] = val;
  const dom = getElDOM(S.selectedId);
  if (!dom) return;
  if (prop === 'font') dom.style.fontFamily = val;
  if (prop === 'fontSize') dom.style.fontSize = val + 'px';
  pushHistory();
}

/* ================================================================
   THEME
   ================================================================ */
function setTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
}
function toggleTheme() {
  setTheme(S.theme === 'dark' ? 'light' : 'dark');
  // Update fmtTextColor default
  D.fmtTextColor.value = S.theme === 'dark' ? '#ffffff' : '#000000';
  D.fmtTextColorPreview.style.background = D.fmtTextColor.value;
}

/* ================================================================
   TOAST
   ================================================================ */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  D.toastContainer.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, 1900);
}

/* ================================================================
   UTILS
   ================================================================ */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setPos(el, data) {
  el.style.left = data.x + 'px';
  el.style.top = data.y + 'px';
  if (data.width) el.style.width = data.width + 'px';
  if (data.height) el.style.minHeight = data.height + 'px';
}
function lockSVG() { return `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`; }
function unlockSVG() { return `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`; }
function trashSVG() { return `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`; }
function updateBoxCount() {
  const n = Object.keys(S.elements).length;
  D.boxCount.textContent = `${n} element${n !== 1 ? 's' : ''}`;
}
function placeCaretAtEnd(el) {
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}

/* ================================================================
   EVENT LISTENERS
   ================================================================ */

// Canvas interaction
D.canvasWrap.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const onCanvas = e.target === D.canvasWrap || e.target.id === 'world' || e.target.id === 'viewport';
  if (onCanvas) {
    deselectAll(); hideContextMenu();
    if (S.activeTool === 'hand' || S.spaceHeld) startPan(e.clientX, e.clientY);
  } else if (S.activeTool === 'hand') {
    startPan(e.clientX, e.clientY);
  }
});

document.addEventListener('mousemove', e => {
  if (S.panning) onPanMove(e.clientX, e.clientY);
  else if (S.dragging) onDragMove(e.clientX, e.clientY);
  else if (S.resizing) onResizeMove(e.clientX, e.clientY);
});
document.addEventListener('mouseup', () => { endPan(); endDrag(); endResize(); });

// Wheel zoom
D.canvasWrap.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.11 : 1 / 1.11;
  zoomAt(factor, e.clientX, e.clientY);
}, { passive: false });

// Touch
let lastTouchDist = null;
D.canvasWrap.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    if (t.target === D.canvasWrap || t.target.id === 'world') startPan(t.clientX, t.clientY);
  }
  if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    endPan();
  }
}, { passive: true });

D.canvasWrap.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2 && lastTouchDist) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    zoomAt(d / lastTouchDist, mx, my);
    lastTouchDist = d;
  } else if (e.touches.length === 1) {
    if (S.panning) onPanMove(e.touches[0].clientX, e.touches[0].clientY);
    else if (S.dragging) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: false });
D.canvasWrap.addEventListener('touchend', () => { lastTouchDist = null; endPan(); endDrag(); endResize(); });

// Toolbar
D.addBoxBtn.addEventListener('click', addCard);
D.addTextBtn.addEventListener('click', addFreeText);
D.addStickyBtn.addEventListener('click', addSticky);
D.toolSelect.addEventListener('click', () => setTool('select'));
D.toolHand.addEventListener('click', () => setTool('hand'));

D.undoBtn.addEventListener('click', undo);
D.redoBtn.addEventListener('click', redo);
D.zoomInBtn.addEventListener('click', () => zoomAt(1.2));
D.zoomOutBtn.addEventListener('click', () => zoomAt(1 / 1.2));
D.zoomLabelBtn.addEventListener('click', () => { S.scale = 1; applyTransform(); });
D.fitBtn.addEventListener('click', fitToScreen);
D.resetBtn.addEventListener('click', resetView);
D.themeBtn.addEventListener('click', toggleTheme);
D.importBtn.addEventListener('click', () => D.fileInput.click());
D.exportBtn.addEventListener('click', exportBoard);
D.fileInput.addEventListener('change', e => { importBoard(e.target.files[0]); e.target.value = ''; });

// Search
D.searchInput.addEventListener('input', () => doSearch(D.searchInput.value));
D.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch(D.searchInput.value);
  if (e.key === 'Escape') { D.searchResults.classList.remove('show'); D.searchInput.blur(); }
});
document.addEventListener('click', e => {
  if (!D.searchInput.closest('.search-wrap').contains(e.target)) D.searchResults.classList.remove('show');
});

// Colors
D.presetColors.querySelectorAll('.color-swatch').forEach(sw => {
  sw.addEventListener('click', () => applyColorToSelected(sw.dataset.color));
});
D.customColor.addEventListener('input', () => applyColorToSelected(D.customColor.value));

// Font
D.fontSelector.addEventListener('change', () => {
  S.selectedFont = D.fontSelector.value;
  if (S.selectedId) applyPropToSelected('font', S.selectedFont);
});

// Font size buttons
D.sizeGrid.addEventListener('click', e => {
  const btn = e.target.closest('.size-btn');
  if (!btn) return;
  const size = parseInt(btn.dataset.size);
  S.selectedFontSize = size;
  D.customFontSize.value = size;
  syncSizeBtns(size);
  if (S.selectedId) applyPropToSelected('fontSize', size);
});
D.customFontSize.addEventListener('change', () => {
  const size = Math.max(6, Math.min(300, parseInt(D.customFontSize.value) || 16));
  S.selectedFontSize = size;
  D.customFontSize.value = size;
  syncSizeBtns(size);
  if (S.selectedId) applyPropToSelected('fontSize', size);
});

// Format bar
D.formatBar.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => { e.preventDefault(); execFmt(btn.dataset.cmd); });
});
D.fmtBlock.addEventListener('change', () => {
  document.execCommand('formatBlock', false, '<' + D.fmtBlock.value + '>');
  syncFmtState(); saveActiveContent();
});

D.fmtTextColor.addEventListener('input', () => {
  document.execCommand('foreColor', false, D.fmtTextColor.value);
  D.fmtTextColorPreview.style.background = D.fmtTextColor.value;
  saveActiveContent();
});
D.fmtTextColor.addEventListener('change', () => {
  D.fmtTextColorPreview.style.background = D.fmtTextColor.value;
});
D.fmtTextColorPreview.addEventListener('click', () => D.fmtTextColor.click());

D.fmtHighlight.addEventListener('input', () => {
  document.execCommand('hiliteColor', false, D.fmtHighlight.value + '60');
  D.fmtHighlightPreview.style.background = D.fmtHighlight.value + '40';
  saveActiveContent();
});
D.fmtHighlightPreview.addEventListener('click', () => D.fmtHighlight.click());

D.fmtClearBtn.addEventListener('click', () => {
  document.execCommand('removeFormat', false, null);
  syncFmtState(); saveActiveContent();
});

// Minimap
D.minimapToggle.addEventListener('click', () => {
  D.minimap.classList.toggle('collapsed');
  D.minimapToggle.textContent = D.minimap.classList.contains('collapsed') ? '+' : '−';
});
D.minimapCanvas.addEventListener('click', e => {
  if (e.target === D.minimapViewport || e.target.classList.contains('minimap-dot')) return;
  const r = D.minimapCanvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const els = Object.values(S.elements);
  if (!els.length) return;
  let mn = {x:Infinity,y:Infinity}, mxE = {x:-Infinity,y:-Infinity};
  els.forEach(e2 => {
    mn.x = Math.min(mn.x, e2.x); mn.y = Math.min(mn.y, e2.y);
    mxE.x = Math.max(mxE.x, e2.x + (e2.width||180)); mxE.y = Math.max(mxE.y, e2.y + (e2.height||40));
  });
  const pad = 50;
  mn.x -= pad; mn.y -= pad; mxE.x += pad; mxE.y += pad;
  const sc = Math.min(r.width / (mxE.x - mn.x), r.height / (mxE.y - mn.y));
  const wx = mx / sc + mn.x, wy = my / sc + mn.y;
  const cr = D.canvasWrap.getBoundingClientRect();
  S.panX = cr.width / 2 - wx * S.scale;
  S.panY = cr.height / 2 - wy * S.scale;
  applyTransform();
});

// Font upload
D.uploadFontBtn.addEventListener('click', () => D.fontModal.classList.add('show'));
D.fontModalClose.addEventListener('click', () => D.fontModal.classList.remove('show'));
D.fontModal.addEventListener('click', e => { if (e.target === D.fontModal) D.fontModal.classList.remove('show'); });

D.fontBrowseBtn.addEventListener('click', () => D.fontFileInput.click());
D.fontFileInput.addEventListener('change', e => { handleFontFiles(e.target.files); e.target.value = ''; });

// Font drag & drop
D.fontDropZone.addEventListener('dragover', e => { e.preventDefault(); D.fontDropZone.classList.add('drag-over'); });
D.fontDropZone.addEventListener('dragleave', () => D.fontDropZone.classList.remove('drag-over'));
D.fontDropZone.addEventListener('drop', e => {
  e.preventDefault(); D.fontDropZone.classList.remove('drag-over');
  handleFontFiles(e.dataTransfer.files);
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const editing = document.activeElement.tagName === 'INPUT' ||
                  document.activeElement.tagName === 'TEXTAREA' ||
                  document.activeElement.isContentEditable;

  if (e.code === 'Space' && !editing) {
    if (!S.spaceHeld) { S.spaceHeld = true; S.prevTool = S.activeTool; setTool('hand'); }
    e.preventDefault(); return;
  }
  if (editing) return;

  switch (e.key.toLowerCase()) {
    case 'h': setTool('hand'); break;
    case 'v': setTool('select'); break;
    case 'n': addCard(); break;
    case 't': addFreeText(); break;
    case 's': addSticky(); break;
    case 'f': fitToScreen(); break;
    case 'r': if (!e.ctrlKey && !e.metaKey) resetView(); break;
    case '+': case '=': zoomAt(1.2); break;
    case '-': zoomOut(); break;
    case 'delete': case 'backspace': if (S.selectedId) deleteEl(S.selectedId); break;
    case 'd': if ((e.ctrlKey || e.metaKey) && S.selectedId) { e.preventDefault(); duplicateEl(S.selectedId); } break;
    case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.shiftKey ? redo() : undo(); } break;
    case 'y': if (e.ctrlKey || e.metaKey) { e.preventDefault(); redo(); } break;
    case 'escape': deselectAll(); hideContextMenu(); D.searchResults.classList.remove('show'); break;
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'Space') { S.spaceHeld = false; setTool(S.prevTool); }
});

// Update coords on mousemove
D.canvasWrap.addEventListener('mousemove', e => {
  const w = clientToWorld(e.clientX, e.clientY);
  D.coordInfo.textContent = `${Math.round(w.x)}, ${Math.round(w.y)}`;
});

function zoomOut() { zoomAt(1 / 1.2); }

/* ================================================================
   INIT
   ================================================================ */
function init() {
  setTheme('dark');
  updateCursor();
  applyTransform();

  // Demo elements
  const demos = [
    { kind: 'card', x: 80, y: 80, width: 270, height: 155, title: '👋 Welcome to Sketchboard Pro', content: '<p>A powerful visual canvas for organizing your ideas. Fully keyboard-driven and responsive.</p>', color: '#6366f1', font: "'Syne', sans-serif", fontSize: 14 },
    { kind: 'card', x: 400, y: 80, width: 260, height: 155, title: '⌨️ Keyboard Shortcuts', content: '<p><strong>N</strong> Card &nbsp;·&nbsp; <strong>T</strong> Text &nbsp;·&nbsp; <strong>S</strong> Sticky</p><p><strong>H</strong> Pan &nbsp;·&nbsp; <strong>V</strong> Select &nbsp;·&nbsp; <strong>F</strong> Fit</p><p><strong>Ctrl+D</strong> Duplicate &nbsp;·&nbsp; <strong>Ctrl+Z</strong> Undo</p>', color: '#10b981', font: "'DM Sans', sans-serif", fontSize: 13 },
    { kind: 'sticky', x: 80, y: 295, width: 200, height: 145, title: 'Quick Idea 💡', content: '<p>Use sticky notes for quick thoughts that don\'t need structure.</p>', color: '#fde68a', font: "'DM Sans', sans-serif", fontSize: 13 },
    { kind: 'sticky', x: 300, y: 295, width: 200, height: 145, title: 'Custom Fonts 🎨', content: '<p>Upload your own fonts via the panel on the left!</p>', color: '#bbf7d0', font: "'DM Sans', sans-serif", fontSize: 13 },
    { kind: 'text', x: 540, y: 130, width: 220, title: 'Free Text — transparent type', content: '<p style="font-size:28px; font-weight:800; font-family:\'Syne\',sans-serif">Free Text</p><p style="font-size:13px; opacity:.7">Transparent, no box.<br/>Just pure type on canvas.</p>', color: '#a78bfa', font: "'Syne', sans-serif", fontSize: 13 },
    { kind: 'text', x: 555, y: 310, width: 190, title: 'Ideas', content: '<p style="font-size:40px; font-weight:800; color:#ec4899; font-family:\'Syne\',sans-serif">Ideas</p>', color: '#ec4899', font: "'Syne', sans-serif", fontSize: 40 },
  ];

  demos.forEach(d => {
    const id = genId();
    S.maxZ++;
    S.elements[id] = { ...d, id, locked: false, z: S.maxZ };
  });

  // Fix demo free-text titles from content
  Object.values(S.elements).forEach(el => {
    if (el.kind === 'text' && el.content && !el.title) {
      const tmp = document.createElement('div');
      tmp.innerHTML = el.content;
      const plain = tmp.innerText.replace(/\s+/g, ' ').trim();
      el.title = plain ? plain.slice(0, 40) + (plain.length > 40 ? '…' : '') : 'Free Text';
    }
  });

  rebuildAll();
  updateBoxCount();

  // Push clean history
  S.history = []; S.histIdx = -1;
  pushHistory();
  updateHistoryBtns();
  scheduleMinimap();

  // Wire mobile bottom bar
  wireMobileBar();
}

/* ================================================================
   MOBILE BAR LOGIC
   ================================================================ */
function wireMobileBar() {
  const mobileBar       = document.getElementById('mobileBar');
  const mobileAddBtn    = document.getElementById('mobileAddBtn');
  const mobileToolsBtn  = document.getElementById('mobileToolsBtn');
  const mobileUndoBtn   = document.getElementById('mobileUndoBtn');
  const mobileZoomFitBtn= document.getElementById('mobileZoomFitBtn');
  const mobilePanBtn    = document.getElementById('mobilePanBtn');
  const mobileAddPanel  = document.getElementById('mobileAddPanel');
  const mobileToolsPanel= document.getElementById('mobileToolsPanel');
  const mobileOverlay   = document.getElementById('mobilePanelOverlay');

  if (!mobileBar) return;

  function openPanel(panel) {
    closeAllPanels();
    panel.classList.add('show');
    mobileOverlay.classList.add('show');
  }
  function closeAllPanels() {
    mobileAddPanel.classList.remove('show');
    mobileToolsPanel.classList.remove('show');
    mobileOverlay.classList.remove('show');
  }

  mobileAddBtn.addEventListener('click', () => {
    mobileAddPanel.classList.contains('show') ? closeAllPanels() : openPanel(mobileAddPanel);
  });
  mobileToolsBtn.addEventListener('click', () => {
    mobileToolsPanel.classList.contains('show') ? closeAllPanels() : openPanel(mobileToolsPanel);
  });
  mobileOverlay.addEventListener('click', closeAllPanels);

  mobileUndoBtn.addEventListener('click', undo);
  mobileZoomFitBtn.addEventListener('click', fitToScreen);
  mobilePanBtn.addEventListener('click', () => {
    const newTool = S.activeTool === 'hand' ? 'select' : 'hand';
    setTool(newTool);
    mobilePanBtn.classList.toggle('active', newTool === 'hand');
    toast(newTool === 'hand' ? 'Pan mode' : 'Select mode');
  });

  // Add element buttons in mobile panel
  document.getElementById('mobileAddCard').addEventListener('click', () => { closeAllPanels(); addCard(); });
  document.getElementById('mobileAddText').addEventListener('click', () => { closeAllPanels(); addFreeText(); });
  document.getElementById('mobileAddSticky').addEventListener('click', () => { closeAllPanels(); addSticky(); });

  // Tools panel buttons
  document.getElementById('mobileExport').addEventListener('click', () => { closeAllPanels(); exportBoard(); });
  document.getElementById('mobileImport').addEventListener('click', () => { closeAllPanels(); D.fileInput.click(); });
  document.getElementById('mobileTheme').addEventListener('click', () => { toggleTheme(); toast(S.theme === 'dark' ? 'Dark mode' : 'Light mode'); });

  // Mobile color swatches
  const mobileColors = document.getElementById('mobileColors');
  if (mobileColors) {
    mobileColors.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        mobileColors.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        applyColorToSelected(sw.dataset.color);
      });
    });
  }
}

init();
