import { attachPinch } from "./pinch.js";
import { isMobileApp } from "./platform.js";
import { blankBoard, getState, update } from "./store.js";
import { confirmDialog, icons, uid } from "./ui.js";

const TOOLS = [
  ["select", "Выбор", "V", icons.select],
  ["hand", "Рука", "H", icons.hand],
  ["card", "Карточка", "N", icons.card],
  ["circle", "Круг", "O", icons.circle],
  ["diamond", "Ромб", "G", icons.diamond],
  ["text", "Текст", "T", icons.text],
  ["link", "Связь", "L", icons.link],
];

const DEFAULTS = {
  card: { w: 220, h: 128 },
  circle: { w: 128, h: 128 },
  diamond: { w: 156, h: 156 },
  text: { w: 220, h: 64 },
};

const MIN = {
  card: [120, 72],
  circle: [78, 78],
  diamond: [96, 96],
  text: [96, 40],
};

const TONE_LIST = ["cyan", "violet", "rose", "amber", "mint"];

let root;
let tabsEl;
let viewport;
let gridEl;
let world;
let svg;
let hintEl;
let dockEl;
let contextEl;
let zoomEl;
let helpEl;
let active = false;
let boardId = null;
let model = null;
let cam = { x: -160, y: -110, z: 1 };
let tool = "select";
let selectedId = null;
let selectedLink = null;
let linkFrom = null;
let rubber = null;
let pointer = null;
let pinchCtl = null;
let spaceDown = false;
let undo = [];
let redo = [];
let editingId = null;
let camTimer = 0;

function boardRecord() {
  return getState().boards.find((item) => item.id === boardId) || getState().boards[0];
}

function ensureBoard() {
  const state = getState();
  if (!state.boards.some((item) => item.id === boardId)) {
    boardId = state.activeBoard && state.boards.some((item) => item.id === state.activeBoard)
      ? state.activeBoard
      : state.boards[0].id;
  }
}

function loadModel() {
  ensureBoard();
  const board = boardRecord();
  model = {
    nodes: structuredClone(board.nodes),
    links: structuredClone(board.links),
    fit: Boolean(board.fit),
  };
  cam = { ...board.camera };
  selectedId = null;
  selectedLink = null;
  linkFrom = null;
  rubber = null;
  editingId = null;
}

function persistModel() {
  if (!model || !boardId) return;
  update((state) => {
    const board = state.boards.find((item) => item.id === boardId);
    if (!board) return state;
    board.nodes = structuredClone(model.nodes);
    board.links = structuredClone(model.links);
    board.camera = { ...cam };
    board.fit = false;
    return state;
  }, { silent: true });
}

function rememberCamera() {
  clearTimeout(camTimer);
  camTimer = setTimeout(persistModel, 180);
}

function pushUndo() {
  undo.push(JSON.stringify({ nodes: model.nodes, links: model.links }));
  if (undo.length > 60) undo.shift();
  redo = [];
}

function applySnap(snap) {
  model.nodes = snap.nodes;
  model.links = snap.links;
  if (!model.nodes.some((node) => node.id === selectedId)) selectedId = null;
  if (!model.links.some((link) => link.id === selectedLink)) selectedLink = null;
  persistModel();
  paint();
}

function undoOnce() {
  if (!undo.length) return;
  redo.push(JSON.stringify({ nodes: model.nodes, links: model.links }));
  applySnap(JSON.parse(undo.pop()));
}

function redoOnce() {
  if (!redo.length) return;
  undo.push(JSON.stringify({ nodes: model.nodes, links: model.links }));
  applySnap(JSON.parse(redo.pop()));
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function worldFromEvent(event) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: cam.x + (event.clientX - rect.left) / cam.z,
    y: cam.y + (event.clientY - rect.top) / cam.z,
  };
}

function toScreen(x, y) {
  return { x: (x - cam.x) * cam.z, y: (y - cam.y) * cam.z };
}

function anchor(node, toward) {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  if (node.type === "circle") {
    const rx = node.w / 2;
    const ry = node.h / 2;
    const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  if (node.type === "diamond") {
    const t = 1 / (Math.abs(dx) / (node.w / 2) + Math.abs(dy) / (node.h / 2));
    return { x: cx + dx * t, y: cy + dy * t };
  }
  const scale = Math.min((node.w / 2) / Math.abs(dx), (node.h / 2) / Math.abs(dy));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function nodeCenter(node) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function shorten(from, to, distance) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  if (len < distance + 4) return to;
  return { x: to.x - (dx / len) * distance, y: to.y - (dy / len) * distance };
}

function elbow(a, b) {
  const c1 = nodeCenter(a);
  const c2 = nodeCenter(b);
  const p1 = anchor(a, c2);
  const p2 = anchor(b, c1);
  const s1 = toScreen(p1.x, p1.y);
  const s2 = toScreen(p2.x, p2.y);
  const midX = (s1.x + s2.x) / 2;
  const end = shorten({ x: midX, y: s2.y }, s2, 10);
  return `M ${s1.x} ${s1.y} L ${midX} ${s1.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
}

function applyCamera() {
  world.style.transform = `translate(${-cam.x * cam.z}px, ${-cam.y * cam.z}px) scale(${cam.z})`;
  const size = 28 * cam.z;
  gridEl.style.backgroundSize = `${size}px ${size}px`;
  gridEl.style.backgroundPosition = `${mod(-cam.x * cam.z, size)}px ${mod(-cam.y * cam.z, size)}px`;
  if (zoomEl) zoomEl.textContent = `${Math.round(cam.z * 100)}%`;
}

function paintLinks() {
  const parts = [`
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 1.2 L 9 5 L 0 8.8 Z" fill="#d5e2ff"></path>
      </marker>
    </defs>`];
  for (const link of model.links) {
    const from = model.nodes.find((node) => node.id === link.from);
    const to = model.nodes.find((node) => node.id === link.to);
    if (!from || !to) continue;
    const d = elbow(from, to);
    const on = selectedLink === link.id ? "is-on" : "";
    parts.push(`<path class="hit" data-link="${link.id}" d="${d}" stroke="transparent" stroke-width="16" fill="none"></path>`);
    parts.push(`<path class="wire ${on}" d="${d}" marker-end="url(#arrow)"></path>`);
  }
  if (rubber && linkFrom) {
    const from = model.nodes.find((node) => node.id === linkFrom);
    if (from) {
      const origin = toScreen(from.x + from.w / 2, from.y + from.h / 2);
      parts.push(`<path class="rubber" d="M ${origin.x} ${origin.y} L ${rubber.x} ${rubber.y}"></path>`);
    }
  }
  svg.innerHTML = parts.join("");
}

function layoutNode(el, node) {
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.w}px`;
  el.style.height = `${node.h}px`;
  el.className = `node node-${node.type} tone-${node.tone} ${selectedId === node.id ? "is-selected" : ""} ${linkFrom === node.id ? "is-link-source" : ""}`;
  if (editingId !== node.id) {
    const label = el.querySelector(".node-label");
    if (label) label.textContent = node.text || "";
  }
}

function buildNode(node) {
  const el = document.createElement("div");
  el.className = "node";
  el.dataset.id = node.id;
  el.innerHTML = `<div class="node-shape"></div><div class="node-label"></div><div class="node-resize" data-resize></div>`;
  el.addEventListener("pointerdown", onNodePointerDown);
  el.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    beginEdit(node.id);
  });
  return el;
}

function paintNodes() {
  const ids = new Set(model.nodes.map((node) => node.id));
  for (const el of [...world.querySelectorAll(".node")]) {
    if (!ids.has(el.dataset.id)) el.remove();
  }
  for (const node of model.nodes) {
    let el = world.querySelector(`[data-id="${CSS.escape(node.id)}"]`);
    if (!el) {
      el = buildNode(node);
      world.append(el);
    }
    layoutNode(el, node);
  }
  hintEl.hidden = model.nodes.length > 0;
}

function paintChrome() {
  viewport.dataset.tool = tool;
  viewport.classList.toggle("is-space", spaceDown);
  for (const button of dockEl.querySelectorAll("[data-tool]")) {
    button.classList.toggle("is-on", button.dataset.tool === tool);
  }
  const node = model.nodes.find((item) => item.id === selectedId);
  if (!node && !selectedLink) {
    contextEl.innerHTML = "";
    return;
  }
  const tones = node
    ? `<div class="tones">${TONE_LIST.map((tone) => `<button type="button" class="tone ${tone} ${node.tone === tone ? "is-on" : ""}" data-tone="${tone}" aria-label="${tone}"></button>`).join("")}</div><div class="dock-sep"></div>`
    : "";
  contextEl.innerHTML = `
    ${tones}
    ${node ? `<button type="button" class="tool" data-act="duplicate"><span>Копия</span></button>` : ""}
    <button type="button" class="tool" data-act="delete"><span>Удалить</span></button>`;
}

function paint() {
  if (!model) return;
  applyCamera();
  paintLinks();
  paintNodes();
  paintChrome();
  renderTabs();
}

function renderTabs() {
  const { boards } = getState();
  tabsEl.innerHTML = boards.map((board) => `
    <span class="board-tab ${board.id === boardId ? "is-on" : ""}">
      <button type="button" data-board="${board.id}">${escapeText(board.name)}</button>
      <button type="button" class="x" data-close="${board.id}" aria-label="Закрыть полотно">×</button>
    </span>`).join("") + `<button type="button" class="board-tab" data-add aria-label="Новое полотно">+</button>`;
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function fit() {
  if (!model.nodes.length) {
    cam = { x: -160, y: -110, z: 1 };
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of model.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  const pad = 70;
  const viewWidth = viewport.clientWidth || 800;
  const viewHeight = viewport.clientHeight || 600;
  const zoom = Math.min((viewWidth - pad * 2) / (maxX - minX || 1), (viewHeight - pad * 2) / (maxY - minY || 1), 1.4);
  cam.z = Math.max(0.3, zoom);
  cam.x = minX - (viewWidth / cam.z - (maxX - minX)) / 2;
  cam.y = minY - (viewHeight / cam.z - (maxY - minY)) / 2;
}

function switchBoard(id) {
  if (id === boardId) return;
  persistModel();
  boardId = id;
  undo = [];
  redo = [];
  update((state) => {
    state.activeBoard = id;
    return state;
  }, { silent: true });
  loadModel();
  paint();
}

async function closeBoard(id) {
  const state = getState();
  const board = state.boards.find((item) => item.id === id);
  if (!board) return;
  if (board.nodes.length) {
    const ok = await confirmDialog({
      title: `Удалить «${board.name}»?`,
      text: "Фигуры и связи этого полотна исчезнут.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
  }
  persistModel();
  update((draft) => {
    draft.boards = draft.boards.filter((item) => item.id !== id);
    if (!draft.boards.length) {
      const fresh = blankBoard("Полотно");
      draft.boards = [fresh];
      draft.activeBoard = fresh.id;
    } else if (draft.activeBoard === id) {
      draft.activeBoard = draft.boards[0].id;
    }
    return draft;
  });
  boardId = getState().activeBoard;
  loadModel();
  undo = [];
  redo = [];
  paint();
}

function addBoard() {
  persistModel();
  const board = blankBoard(`Полотно ${getState().boards.length + 1}`);
  update((state) => {
    state.boards.push(board);
    state.activeBoard = board.id;
    return state;
  });
  boardId = board.id;
  undo = [];
  redo = [];
  loadModel();
  paint();
}

function beginRename(id, button) {
  const board = getState().boards.find((item) => item.id === id);
  if (!board) return;
  const input = document.createElement("input");
  input.className = "rename";
  input.value = board.name;
  input.maxLength = 40;
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    const name = input.value.trim() || board.name;
    update((state) => {
      const target = state.boards.find((item) => item.id === id);
      if (target) target.name = name;
      return state;
    });
    renderTabs();
  };
  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") {
      input.value = board.name;
      input.blur();
    }
    event.stopPropagation();
  });
}

function setTool(next) {
  tool = next;
  if (next !== "link") {
    linkFrom = null;
    rubber = null;
  }
  paintChrome();
  paintLinks();
}

function onNodePointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest("[data-resize]") || event.target.closest(".node-edit")) return;
  const id = event.currentTarget.dataset.id;
  event.stopPropagation();
  event.preventDefault();
  if (tool === "link") {
    connect(id);
    return;
  }
  if (tool === "hand" || spaceDown) {
    startPan(event);
    return;
  }
  const node = model.nodes.find((item) => item.id === id);
  selectedLink = null;
  selectedId = id;
  pointer = { type: "move", id, x: event.clientX, y: event.clientY, ox: node.x, oy: node.y, moved: false };
  event.currentTarget.setPointerCapture(event.pointerId);
  paintChrome();
  paintNodes();
}

function onResizeDown(event) {
  const handle = event.target.closest("[data-resize]");
  if (!handle || event.button !== 0) return;
  event.stopPropagation();
  event.preventDefault();
  const id = handle.parentElement.dataset.id;
  const node = model.nodes.find((item) => item.id === id);
  selectedId = id;
  selectedLink = null;
  pointer = { type: "resize", id, x: event.clientX, y: event.clientY, ow: node.w, oh: node.h, moved: false };
  viewport.setPointerCapture(event.pointerId);
}

function startPan(event) {
  pointer = { type: "pan", x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y };
  viewport.classList.add("is-panning");
  viewport.setPointerCapture?.(event.pointerId);
}

function startCreate(event) {
  pointer = { type: "create", kind: tool, x: event.clientX, y: event.clientY, origin: worldFromEvent(event), moved: false };
  viewport.setPointerCapture(event.pointerId);
}

function connect(id) {
  if (!linkFrom) {
    linkFrom = id;
    selectedId = id;
    paint();
    return;
  }
  if (linkFrom !== id && !model.links.some((link) => link.from === linkFrom && link.to === id)) {
    pushUndo();
    model.links.push({ id: uid(), from: linkFrom, to: id });
    persistModel();
  }
  linkFrom = null;
  rubber = null;
  selectedId = null;
  paint();
}

function placeNode(kind, rect) {
  pushUndo();
  const node = {
    id: uid(),
    type: kind,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    text: kind === "text" ? "Текст" : kind === "diamond" ? "Условие" : kind === "circle" ? "Шаг" : "Карточка",
    tone: kind === "diamond" ? "amber" : kind === "circle" ? "cyan" : "violet",
  };
  model.nodes.push(node);
  selectedId = node.id;
  selectedLink = null;
  persistModel();
  paint();
}

function onPointerMove(event) {
  if (pinchCtl?.isPinching()) return;
  if (linkFrom && !pointer) {
    const rect = viewport.getBoundingClientRect();
    rubber = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    paintLinks();
  }
  if (!pointer) return;
  if (pointer.type === "pan") {
    cam.x = pointer.cx - (event.clientX - pointer.x) / cam.z;
    cam.y = pointer.cy - (event.clientY - pointer.y) / cam.z;
    applyCamera();
    paintLinks();
    return;
  }
  const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
  if (pointer.type === "move") {
    if (!pointer.moved && distance < 4) return;
    if (!pointer.moved) {
      pointer.moved = true;
      pushUndo();
    }
    const node = model.nodes.find((item) => item.id === pointer.id);
    const dx = (event.clientX - pointer.x) / cam.z;
    const dy = (event.clientY - pointer.y) / cam.z;
    node.x = pointer.ox + dx;
    node.y = pointer.oy + dy;
    const el = world.querySelector(`[data-id="${CSS.escape(node.id)}"]`);
    if (el) layoutNode(el, node);
    paintLinks();
    return;
  }
  if (pointer.type === "resize") {
    if (!pointer.moved && distance < 3) return;
    if (!pointer.moved) {
      pointer.moved = true;
      pushUndo();
    }
    const node = model.nodes.find((item) => item.id === pointer.id);
    const [minW, minH] = MIN[node.type];
    const dx = (event.clientX - pointer.x) / cam.z;
    const dy = (event.clientY - pointer.y) / cam.z;
    node.w = Math.max(minW, pointer.ow + dx);
    node.h = Math.max(minH, pointer.oh + dy);
    if (node.type === "circle") {
      const size = Math.max(node.w, node.h);
      node.w = size;
      node.h = size;
    }
    const el = world.querySelector(`[data-id="${CSS.escape(node.id)}"]`);
    if (el) layoutNode(el, node);
    paintLinks();
    return;
  }
  if (pointer.type === "create" && distance > 6) pointer.moved = true;
}

function endPointer() {
  if (pinchCtl?.isPinching()) {
    pointer = null;
    return;
  }
  if (!pointer) return;
  const current = pointer;
  pointer = null;
  viewport.classList.remove("is-panning");
  if (current.type === "pan") {
    rememberCamera();
    return;
  }
  if (current.type === "move" || current.type === "resize") {
    if (current.moved) persistModel();
    else paint();
    return;
  }
  if (current.type === "create") {
    const kind = current.kind;
    if (!current.moved) {
      const size = DEFAULTS[kind];
      placeNode(kind, {
        x: current.origin.x - size.w / 2,
        y: current.origin.y - size.h / 2,
        w: size.w,
        h: size.h,
      });
      return;
    }
    const end = worldFromEvent(current.last || { clientX: current.x, clientY: current.y });
    placeNode(kind, bounds(kind, current.origin, end));
  }
}

function bounds(kind, origin, end) {
  let x = Math.min(origin.x, end.x);
  let y = Math.min(origin.y, end.y);
  let w = Math.abs(end.x - origin.x);
  let h = Math.abs(end.y - origin.y);
  const [minW, minH] = MIN[kind];
  if (kind === "circle") {
    const size = Math.max(w, h, minW);
    return { x, y, w: size, h: size };
  }
  return { x, y, w: Math.max(w, minW), h: Math.max(h, minH) };
}

function onPointerUp(event) {
  if (pointer?.type === "create") pointer.last = event;
  endPointer();
}

function deleteSelection() {
  if (!selectedLink && !selectedId) return;
  pushUndo();
  if (selectedLink) {
    model.links = model.links.filter((link) => link.id !== selectedLink);
    selectedLink = null;
  } else {
    const id = selectedId;
    model.nodes = model.nodes.filter((node) => node.id !== id);
    model.links = model.links.filter((link) => link.from !== id && link.to !== id);
    selectedId = null;
  }
  persistModel();
  paint();
}

function duplicate() {
  const node = model.nodes.find((item) => item.id === selectedId);
  if (!node) return;
  pushUndo();
  const copy = { ...node, id: uid(), x: node.x + 32, y: node.y + 32 };
  model.nodes.push(copy);
  selectedId = copy.id;
  persistModel();
  paint();
}

function setTone(tone) {
  const node = model.nodes.find((item) => item.id === selectedId);
  if (!node || node.tone === tone) return;
  pushUndo();
  node.tone = tone;
  persistModel();
  paint();
}

function beginEdit(id) {
  const node = model.nodes.find((item) => item.id === id);
  const el = world.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!node || !el || editingId) return;
  editingId = id;
  selectedId = id;
  const label = el.querySelector(".node-label");
  const area = document.createElement("textarea");
  area.className = "node-edit";
  area.value = node.text;
  label.replaceWith(area);
  area.focus();
  area.select();
  const original = node.text;
  let done = false;
  const finish = (cancel) => {
    if (done) return;
    done = true;
    editingId = null;
    const text = cancel ? original : area.value;
    if (text !== node.text) {
      pushUndo();
      node.text = text;
      persistModel();
    }
    paint();
  };
  area.addEventListener("blur", () => finish(false));
  area.addEventListener("pointerdown", (event) => event.stopPropagation());
  area.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      area.blur();
    }
  });
}

function zoomAt(clientX, clientY, factor) {
  const rect = viewport.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const wx = cam.x + sx / cam.z;
  const wy = cam.y + sy / cam.z;
  const maxZ = isMobileApp() ? 4 : 2.4;
  cam.z = Math.min(maxZ, Math.max(0.25, cam.z * factor));
  cam.x = wx - sx / cam.z;
  cam.y = wy - sy / cam.z;
  applyCamera();
  paintLinks();
  rememberCamera();
}

function nudge(dx, dy) {
  const node = model.nodes.find((item) => item.id === selectedId);
  if (!node) return;
  pushUndo();
  node.x += dx;
  node.y += dy;
  persistModel();
  paint();
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view canvas-view";
  root.innerHTML = `
    <header class="canvas-bar">
      <div class="board-tabs"></div>
      <div class="bar-actions">
        <span class="zoom-group">
          <button type="button" class="mini" data-zoom="out" aria-label="Мельче">−</button>
          <span class="zoom-label">100%</span>
          <button type="button" class="mini" data-zoom="in" aria-label="Крупнее">+</button>
        </span>
        <button type="button" class="mini" data-fit title="Показать всю схему" aria-label="Показать всю схему">${icons.fit}</button>
        <button type="button" class="mini" data-undo aria-label="Отменить">${icons.undo}</button>
        <button type="button" class="mini" data-redo aria-label="Повторить">${icons.redo}</button>
        <button type="button" class="mini" data-help aria-label="Подсказки">?</button>
      </div>
    </header>
    <div class="board-view" data-tool="select">
      <div class="board-grid"></div>
      <div class="board-world"></div>
      <svg class="board-links"></svg>
      <div class="board-hint">
        <div>
          <strong>Пустое полотно</strong>
          Выберите фигуру снизу и поставьте её на полотно.
        </div>
      </div>
    </div>
    <div class="tool-dock"></div>
    <div class="help" hidden>
      <h3>Полотно</h3>
      <p><kbd>V</kbd> выбор, <kbd>H</kbd> рука, <kbd>N</kbd> карточка, <kbd>O</kbd> круг, <kbd>G</kbd> ромб, <kbd>T</kbd> текст, <kbd>L</kbd> связь.</p>
      <p>Двойной клик пишет текст. Потяните угол, чтобы изменить размер.</p>
      <p><kbd>Delete</kbd> удаляет. <kbd>Ctrl</kbd>+<kbd>Z</kbd> отменяет, <kbd>Ctrl</kbd>+<kbd>D</kbd> копирует.</p>
      <p>Пробел и перетаскивание двигают обзор. Стрелки сдвигают фигуру.</p>
    </div>`;
  parent.append(root);
  tabsEl = root.querySelector(".board-tabs");
  viewport = root.querySelector(".board-view");
  gridEl = root.querySelector(".board-grid");
  world = root.querySelector(".board-world");
  svg = root.querySelector(".board-links");
  hintEl = root.querySelector(".board-hint");
  helpEl = root.querySelector(".help");
  zoomEl = root.querySelector(".zoom-label");
  dockEl = root.querySelector(".tool-dock");
  dockEl.innerHTML = `
    ${TOOLS.map(([id, label, key, icon]) => `<button type="button" class="tool ${id === "select" ? "is-on" : ""}" data-tool="${id}" title="${label} (${key})" aria-label="${label}">${icon}</button>`).join("")}
    <div class="dock-sep"></div>
    <div class="tool-context"></div>`;
  contextEl = dockEl.querySelector(".tool-context");

  dockEl.addEventListener("click", (event) => {
    const next = event.target.closest("[data-tool]")?.dataset.tool;
    if (next) setTool(next);
    const tone = event.target.closest("[data-tone]")?.dataset.tone;
    if (tone) setTone(tone);
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "delete") deleteSelection();
    if (act === "duplicate") duplicate();
  });

  root.querySelector(".canvas-bar").addEventListener("click", (event) => {
    const board = event.target.closest("[data-board]")?.dataset.board;
    if (board) switchBoard(board);
    const close = event.target.closest("[data-close]")?.dataset.close;
    if (close) closeBoard(close);
    if (event.target.closest("[data-add]")) addBoard();
    const zoom = event.target.closest("[data-zoom]")?.dataset.zoom;
    if (zoom) {
      const rect = viewport.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, zoom === "in" ? 1.12 : 1 / 1.12);
    }
    if (event.target.closest("[data-fit]")) {
      fit();
      persistModel();
      paint();
    }
    if (event.target.closest("[data-undo]")) undoOnce();
    if (event.target.closest("[data-redo]")) redoOnce();
    if (event.target.closest("[data-help]")) helpEl.hidden = !helpEl.hidden;
  });

  tabsEl.addEventListener("dblclick", (event) => {
    const button = event.target.closest("[data-board]");
    if (button) beginRename(button.dataset.board, button);
  });

  pinchCtl = attachPinch(viewport, {
    onPinchStart: () => {
      pointer = null;
      viewport.classList.remove("is-panning");
    },
    onZoom: (x, y, factor) => {
      zoomAt(x, y, factor);
    },
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (pinchCtl?.pointerCount() >= 2 || pinchCtl?.isPinching()) return;
    if (event.target.closest(".node") || event.target.closest(".hit")) return;
    if (event.button === 1 || tool === "hand" || spaceDown) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (DEFAULTS[tool]) {
      startCreate(event);
      return;
    }
    if (tool === "link") {
      linkFrom = null;
      rubber = null;
      paint();
      return;
    }
    if (event.pointerType === "touch") {
      event.preventDefault();
      startPan(event);
      return;
    }
    selectedId = null;
    selectedLink = null;
    paint();
  });
  viewport.addEventListener("pointerdown", onResizeDown);
  viewport.addEventListener("dblclick", (event) => {
    if (tool !== "select" || event.target.closest(".node")) return;
    const point = worldFromEvent(event);
    const size = DEFAULTS.card;
    placeNode("card", { x: point.x - size.w / 2, y: point.y - size.h / 2, w: size.w, h: size.h });
    beginEdit(selectedId);
  });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });
  svg.addEventListener("pointerdown", (event) => {
    const link = event.target.closest(".hit")?.dataset.link;
    if (!link) return;
    event.stopPropagation();
    event.preventDefault();
    selectedLink = link;
    selectedId = null;
    linkFrom = null;
    rubber = null;
    paint();
  });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

export function setActive(on) {
  if (active && !on) persistModel();
  active = on;
  root.classList.toggle("is-on", on);
  if (!on) return;
  const previous = boardId;
  ensureBoard();
  if (!model || previous !== boardId) loadModel();
  requestAnimationFrame(() => {
    if (!active) return;
    if (model.fit) {
      fit();
      model.fit = false;
      persistModel();
    }
    paint();
  });
}

export function keydown(event) {
  if (!active) return;
  if (event.code === "Space") {
    event.preventDefault();
    spaceDown = true;
    viewport.classList.add("is-space");
    return;
  }
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
    event.preventDefault();
    undoOnce();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (key === "y" || (key === "z" && event.shiftKey))) {
    event.preventDefault();
    redoOnce();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "d") {
    event.preventDefault();
    duplicate();
    return;
  }
  if (event.key === "Escape") {
    linkFrom = null;
    rubber = null;
    selectedId = null;
    selectedLink = null;
    helpEl.hidden = true;
    setTool("select");
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelection();
    return;
  }
  const step = event.shiftKey ? 16 : 6;
  if (event.key === "ArrowLeft") nudge(-step, 0);
  if (event.key === "ArrowRight") nudge(step, 0);
  if (event.key === "ArrowUp") nudge(0, -step);
  if (event.key === "ArrowDown") nudge(0, step);
  if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) event.preventDefault();
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const map = { v: "select", h: "hand", n: "card", o: "circle", g: "diamond", t: "text", l: "link" };
  if (map[key]) setTool(map[key]);
}

export function keyup(event) {
  if (event.code === "Space") {
    spaceDown = false;
    viewport?.classList.remove("is-space");
  }
}

export function refreshFromOutside() {
  if (!active || pointer || editingId) return;
  const state = getState();
  if (!state.boards.some((item) => item.id === boardId)) {
    boardId = state.activeBoard;
    loadModel();
    undo = [];
    redo = [];
    paint();
  }
}
