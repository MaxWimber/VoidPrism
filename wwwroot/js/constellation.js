import { bridge } from "./bridge.js";
import { aggregateChecklistProgress, checklistProgress, plainBody, progressArc, progressBadgeHtml } from "./lists.js";
import { attachPinch } from "./pinch.js";
import { isMobileApp } from "./platform.js";
import { getState, themesOf, update } from "./store.js";
import { esc, formatDate, icons, toneColor, toneFor, toast } from "./ui.js";

const MAX_THEMES = 22;
const MAX_ZOOM = 4.2;
const MIN_ZOOM = 0.12;

let root;
let sky;
let svg;
let dossier;
let legend;
let zoomLabel;
let active = false;
/** @type {null | { type: 'core' } | { type: 'theme', name: string } | { type: 'entry', id: string }} */
let selected = null;
let sheet = false;
let lastSize = "";
let drag = null;
let pan = null;
let pinchCtl = null;
let spaceDown = false;
let composeRaf = 0;
let composeFrom = null;
let composeStart = 0;
let redrawRaf = 0;
let camTimer = 0;
let cam = { x: 0, y: 0, z: 1 };
let viewW = 800;
let viewH = 600;

function orbitMap() {
  const map = getState().orbitMap;
  return map && typeof map === "object" ? map : {};
}

function entryMap() {
  const map = getState().entryMap;
  return map && typeof map === "object" ? map : {};
}

function loadCamera() {
  const saved = getState().orbitCamera;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.z)) {
    cam = {
      x: saved.x,
      y: saved.y,
      z: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved.z)),
    };
  } else {
    cam = { x: 0, y: 0, z: isMobileApp() ? 1.35 : 1 };
  }
}

function persistCamera() {
  clearTimeout(camTimer);
  camTimer = setTimeout(() => {
    update((state) => {
      state.orbitCamera = { ...cam };
      return state;
    }, { silent: true });
  }, 180);
}

function edgePoint(x, y, tx, ty, radius) {
  const dx = tx - x;
  const dy = ty - y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: x + (dx / len) * radius, y: y + (dy / len) * radius };
}

function centerOf(width, height) {
  return { cx: width / 2, cy: height / 2 + 6 };
}

function scaleOf(width, height) {
  return Math.min(width, height);
}

function clampPos(x, y, width, height) {
  const { cx, cy } = centerOf(width, height);
  const lim = Math.max(width, height) * 2.6;
  return {
    x: Math.min(cx + lim, Math.max(cx - lim, x)),
    y: Math.min(cy + lim, Math.max(cy - lim, y)),
  };
}

function visibleEntries() {
  return getState().entries.filter((entry) => entry.kind === "note" || entry.kind === "task");
}

function primaryTag(entry) {
  return entry.tags?.length ? entry.tags[0] : "без темы";
}

function entryColor(entry) {
  if (entry.kind === "task") return "#ffd27a";
  return "#8ef0c8";
}

function entryRadius(entry) {
  const progress = checklistProgress(entry.body);
  if (progress) return 18;
  return 15;
}

function short(text, max) {
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function shownThemes() {
  const { themes, pairs } = themesOf(getState().entries);
  let shown = themes.slice(0, MAX_THEMES);
  if (selected?.type === "theme" && !shown.some((theme) => theme.name === selected.name)) {
    const extra = themes.find((theme) => theme.name === selected.name);
    if (extra) shown = [...shown.slice(0, MAX_THEMES - 1), extra];
  }
  return { themes, pairs, shown };
}

// --- Раскладка «орбитальная система» ---
// Центр — «Я». Каждая орбита-метка — планета со своими лунами-записями. Размер системы
// считается вместе с подписями, системы ставятся кольцами вокруг центра так, чтобы их
// круги не пересекались. Раскладка в мировых координатах и не зависит от рамки блока:
// камера потом просто вписывает всё в экран.

const CORE_REACH = 92;
const SYSTEM_GAP = 22;
const MOON_GAP = 6;

function themeRadius(theme) {
  return Math.min(46, 24 + Math.sqrt(theme.count) * 9);
}

function themeFont(count) {
  return count > 14 ? 11 : 13;
}

/** Примерная ширина подписи: шрифт интерфейса ~0.62em на символ. */
function labelWidth(text, max, font) {
  return Math.min(String(text).length, max) * font * 0.62;
}

/** Круг, который занимает луна вместе с подписью под ней. */
function moonReach(entry) {
  const radius = entryRadius(entry);
  return Math.max(radius + 20, labelWidth(entry.title, 14, 10) / 2 + 4);
}

/** Не задевает ли круг (x, y, r) прямоугольник подписи планеты. */
function clearOfLabel(x, y, r, box) {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy) >= r;
}

/**
 * Луны вокруг планеты: кольцо с проёмом снизу под подпись планеты. Кольцо растёт,
 * пока все луны не встанут без касаний. Здесь считается только размер системы
 * и свободная дуга; сами углы лун — в moonOffsets, когда известно, где «наружу».
 */
function planetSystem(theme, moons, font) {
  const radius = themeRadius(theme);
  const label = labelWidth(theme.name, 18, font);
  const box = { left: -label / 2 - 4, right: label / 2 + 4, top: radius + 4, bottom: radius + 24 };
  const labelReach = Math.hypot(label / 2 + 4, radius + 24);
  const empty = { radius, moons: [], steps: [], dist: 0, gap: 0, reach: Math.max(radius + 8, labelReach) };
  if (!moons.length) return empty;

  const reaches = moons.map(moonReach);
  const maxReach = Math.max(...reaches);
  const step = (x, y, dist) => 2 * Math.asin(Math.min(1, (x + y + MOON_GAP) / (2 * dist)));
  let dist = radius + maxReach + 10;
  for (let guard = 0; guard < 200; guard += 1) {
    // Половина проёма снизу: крайние луны по обе стороны не должны задеть подпись.
    let gap = 0;
    while (gap < Math.PI && !clearOfLabel(Math.sin(gap) * dist, Math.cos(gap) * dist, maxReach, box)) gap += 0.04;
    // И крайние луны по разные стороны проёма не должны касаться друг друга.
    gap = Math.max(gap, Math.asin(Math.min(1, (maxReach + MOON_GAP / 2) / dist)));
    const steps = reaches.slice(1).map((reach, index) => step(reaches[index], reach, dist));
    if (steps.reduce((sum, value) => sum + value, 0) <= Math.PI * 2 - gap * 2) {
      return { radius, moons: moons.map((moon) => moon.id), steps, dist, gap, reach: Math.max(dist + maxReach, labelReach) };
    }
    dist += 8;
  }
  return empty;
}

/**
 * Углы лун: блок лун разворачивается «наружу» — от центра созвездия, чтобы луны
 * не висели на линиях к «Я». Проём снизу под подпись планеты не занимается.
 * Углы экранные (y вниз): π/2 — низ.
 */
function moonOffsets(system, outward) {
  if (!system.moons.length) return [];
  const start = Math.PI / 2 + system.gap;
  const free = Math.PI * 2 - system.gap * 2;
  const need = system.steps.reduce((sum, value) => sum + value, 0);
  const count = system.moons.length;
  // Немного воздуха между лунами, но не растягиваем их по всей окружности.
  const air = count > 1 ? Math.min((free - need) / (count - 1), 0.35) : 0;
  const block = need + air * (count - 1);
  let center = start + ((((outward - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
  if (center > start + free) center = center - (start + free) < start + Math.PI * 2 - center ? start + free : start;
  let angle = Math.min(Math.max(center - block / 2, start), start + free - block);
  return system.moons.map((id, index) => {
    if (index > 0) angle += system.steps[index - 1] + air;
    return { id, dx: Math.cos(angle) * system.dist, dy: Math.sin(angle) * system.dist };
  });
}

/** Порядок по кольцу: следующей ставим самую связанную с предыдущей орбиту. */
function chainOrder(themes, pairs) {
  const weight = (a, b) => pairs.get([a, b].sort((x, y) => x.localeCompare(y, "ru")).join("\u0000")) || 0;
  const left = [...themes];
  const order = left.length ? [left.shift()] : [];
  while (left.length) {
    const last = order[order.length - 1].name;
    let best = 0;
    for (let i = 1; i < left.length; i += 1) {
      if (weight(last, left[i].name) > weight(last, left[best].name)) best = i;
    }
    order.push(left.splice(best, 1)[0]);
  }
  return order;
}

/** Сколько радиан кольца радиуса dist занимают системы, стоящие вплотную. */
function ringAngle(list, dist) {
  if (list.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i].reach;
    const b = list[(i + 1) % list.length].reach;
    const sin = (a + b + SYSTEM_GAP) / (2 * dist);
    if (sin >= 1) return Infinity;
    total += 2 * Math.asin(sin);
  }
  return total;
}

/** Системы по кольцам вокруг центра. Возвращает центры систем и радиусы колец. */
function placeSystems(systems) {
  const rings = [];
  const centers = new Map();
  let inner = CORE_REACH;
  let rest = systems;
  while (rest.length) {
    const maxReach = Math.max(...rest.map((item) => item.reach));
    const base = inner + maxReach + SYSTEM_GAP;
    let dist = base;
    while (ringAngle(rest, dist) > Math.PI * 2 && dist < base * 1.5) dist += 8;
    let members = rest;
    if (ringAngle(rest, dist) > Math.PI * 2) {
      // Всем не поместиться без сильного раздувания — берём, сколько влезает, остальное наружу.
      dist = base;
      let count = 1;
      while (count < rest.length && ringAngle(rest.slice(0, count + 1), dist) <= Math.PI * 2) count += 1;
      members = rest.slice(0, count);
      dist = inner + Math.max(...members.map((item) => item.reach)) + SYSTEM_GAP;
      while (ringAngle(members, dist) > Math.PI * 2) dist += 8;
    }
    const spare = (Math.PI * 2 - ringAngle(members, dist)) / Math.max(members.length, 1);
    let angle = -Math.PI / 2 + (rings.length % 2 ? Math.PI / Math.max(members.length, 1) : 0);
    members.forEach((item, index) => {
      if (index > 0) {
        const prev = members[index - 1];
        angle += 2 * Math.asin(Math.min(1, (prev.reach + item.reach + SYSTEM_GAP) / (2 * dist))) + spare;
      }
      centers.set(item.name, { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, angle });
    });
    rings.push(dist);
    inner = dist + Math.max(...members.map((item) => item.reach));
    rest = rest.slice(members.length);
  }
  return { centers, rings, outer: inner };
}

let layoutCache = null;

/** Полная раскладка по умолчанию: планеты, луны, кольца. Зависит только от данных. */
function orbitalLayout(themes) {
  // Перерисовка идёт на каждом кадре перетаскивания — пересчитываем, только когда изменились данные.
  const state = getState();
  const key = themes.map((theme) => `${theme.name}:${theme.count}`).join("|");
  if (layoutCache?.state === state && layoutCache.key === key) return layoutCache.result;
  const result = computeOrbitalLayout(themes);
  layoutCache = { state, key, result };
  return result;
}

function computeOrbitalLayout(themes) {
  const { pairs } = themesOf(getState().entries);
  const font = themeFont(themes.length);
  const entries = visibleEntries();
  const groups = new Map(themes.map((theme) => [theme.name, []]));
  const orphans = [];
  for (const entry of entries) {
    const group = groups.get(primaryTag(entry));
    if (group) group.push(entry);
    else orphans.push(entry);
  }
  const systems = chainOrder(themes, pairs).map((theme) => ({
    name: theme.name,
    ...planetSystem(theme, groups.get(theme.name), font),
  }));
  const { centers, rings, outer } = placeSystems(systems);
  const moons = new Map();
  for (const system of systems) {
    const outward = centers.get(system.name)?.angle ?? -Math.PI / 2;
    for (const offset of moonOffsets(system, outward)) {
      moons.set(offset.id, { theme: system.name, dx: offset.dx, dy: offset.dy });
    }
  }
  // Записи с метками, которых нет на небе, — внешним кольцом вокруг всего.
  if (orphans.length) {
    const reach = Math.max(...orphans.map(moonReach));
    const dist = Math.max(outer + reach + SYSTEM_GAP, (orphans.length * (reach * 2 + MOON_GAP)) / (Math.PI * 2));
    orphans.forEach((entry, index) => {
      const angle = -Math.PI / 2 + (index / orphans.length) * Math.PI * 2;
      moons.set(entry.id, { theme: null, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist });
    });
    rings.push(dist);
  }
  return { centers, moons, rings };
}

function defaultThemes(themes, width, height) {
  const { cx, cy } = centerOf(width, height);
  const { centers } = orbitalLayout(themes);
  return themes.map((theme) => {
    const at = centers.get(theme.name) || { x: 0, y: 0, angle: 0 };
    return { ...theme, angle: at.angle, radius: themeRadius(theme), x: cx + at.x, y: cy + at.y };
  });
}

/** Луны держатся своей планеты: смещение считается от того места, где планета стоит сейчас. */
function defaultEntries(entries, themePlaced, width, height) {
  const { cx, cy } = centerOf(width, height);
  const { moons } = orbitalLayout(themePlaced);
  const themeByName = new Map(themePlaced.map((theme) => [theme.name, theme]));
  return entries.map((entry) => {
    const moon = moons.get(entry.id);
    const planet = moon?.theme ? themeByName.get(moon.theme) : null;
    const x = (planet ? planet.x : cx) + (moon?.dx ?? 0);
    const y = (planet ? planet.y : cy) + (moon?.dy ?? 0);
    const pos = clampPos(x, y, width, height);
    return {
      ...entry,
      radius: entryRadius(entry),
      x: pos.x,
      y: pos.y,
      angle: Math.atan2(pos.y - cy, pos.x - cx),
      homeTag: primaryTag(entry),
    };
  });
}

function layoutThemes(themes, width, height, { saved = orbitMap(), overrides = null, targets = null, t = 1 } = {}) {
  const { cx, cy } = centerOf(width, height);
  const scale = scaleOf(width, height);
  const defaults = defaultThemes(themes, width, height);
  const placed = defaults.map((theme) => {
    let x = theme.x;
    let y = theme.y;
    const custom = saved[theme.name];
    if (custom && Number.isFinite(custom.dx) && Number.isFinite(custom.dy)) {
      x = cx + custom.dx * scale;
      y = cy + custom.dy * scale;
    }
    if (targets && composeFrom?.themes?.[theme.name]) {
      const from = composeFrom.themes[theme.name];
      const to = targets.get(theme.name) || theme;
      x = from.x + (to.x - from.x) * t;
      y = from.y + (to.y - from.y) * t;
    }
    if (overrides?.kind === "theme" && overrides.id === theme.name) {
      x = overrides.x;
      y = overrides.y;
    }
    const pos = clampPos(x, y, width, height);
    return {
      ...theme,
      x: pos.x,
      y: pos.y,
      angle: Math.atan2(pos.y - cy, pos.x - cx),
    };
  });
  return { cx, cy, placed, rings: orbitalLayout(themes).rings };
}

function layoutEntries(entries, themePlaced, width, height, { saved = entryMap(), overrides = null, targets = null, t = 1 } = {}) {
  const { cx, cy } = centerOf(width, height);
  const scale = scaleOf(width, height);
  const defaults = defaultEntries(entries, themePlaced, width, height);
  return defaults.map((entry) => {
    let x = entry.x;
    let y = entry.y;
    const custom = saved[entry.id];
    if (custom && Number.isFinite(custom.dx) && Number.isFinite(custom.dy)) {
      x = cx + custom.dx * scale;
      y = cy + custom.dy * scale;
    }
    if (targets && composeFrom?.entries?.[entry.id]) {
      const from = composeFrom.entries[entry.id];
      const to = targets.get(entry.id) || entry;
      x = from.x + (to.x - from.x) * t;
      y = from.y + (to.y - from.y) * t;
    }
    if (overrides?.kind === "entry" && overrides.id === entry.id) {
      x = overrides.x;
      y = overrides.y;
    }
    const pos = clampPos(x, y, width, height);
    return {
      ...entry,
      x: pos.x,
      y: pos.y,
      angle: Math.atan2(pos.y - cy, pos.x - cx),
    };
  });
}

function pointerToWorld(event) {
  const rect = svg.getBoundingClientRect();
  const sx = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * viewW;
  const sy = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * viewH;
  return {
    x: cam.x + sx / cam.z,
    y: cam.y + sy / cam.z,
  };
}

function applyCamera() {
  const world = svg.querySelector(".sky-world");
  if (world) {
    world.setAttribute("transform", `translate(${-cam.x * cam.z} ${-cam.y * cam.z}) scale(${cam.z})`);
  }
  if (zoomLabel) zoomLabel.textContent = `${Math.round(cam.z * 100)}%`;
}

function saveThemePosition(name, x, y, width, height) {
  const { cx, cy } = centerOf(width, height);
  const scale = scaleOf(width, height) || 1;
  update((state) => {
    state.orbitMap = { ...(state.orbitMap || {}) };
    state.orbitMap[name] = { dx: (x - cx) / scale, dy: (y - cy) / scale };
    return state;
  }, { silent: true });
}

function saveEntryPosition(id, x, y, width, height) {
  const { cx, cy } = centerOf(width, height);
  const scale = scaleOf(width, height) || 1;
  update((state) => {
    state.entryMap = { ...(state.entryMap || {}) };
    state.entryMap[id] = { dx: (x - cx) / scale, dy: (y - cy) / scale };
    return state;
  }, { silent: true });
}

function fitCamera(geo, width, height, animate = false) {
  let minX = geo.cx - 90;
  let minY = geo.cy - 90;
  let maxX = geo.cx + 90;
  let maxY = geo.cy + 90;
  // В рамку попадают и подписи: они бывают шире самих кругов.
  const font = themeFont(geo.placed.length);
  for (const theme of geo.placed) {
    const half = Math.max(theme.radius + 12, labelWidth(theme.name, 18, font) / 2 + 8);
    minX = Math.min(minX, theme.x - half);
    minY = Math.min(minY, theme.y - theme.radius - 16);
    maxX = Math.max(maxX, theme.x + half);
    maxY = Math.max(maxY, theme.y + theme.radius + 30);
  }
  for (const entry of geo.entries || []) {
    const half = Math.max(entry.radius + 10, labelWidth(entry.title, 14, 10) / 2 + 8);
    minX = Math.min(minX, entry.x - half);
    minY = Math.min(minY, entry.y - entry.radius - 12);
    maxX = Math.max(maxX, entry.x + half);
    maxY = Math.max(maxY, entry.y + entry.radius + 24);
  }
  const mobile = isMobileApp();
  const pad = mobile ? 18 : 48;
  const boxW = Math.max(120, maxX - minX);
  const boxH = Math.max(120, maxY - minY);
  const cap = mobile ? 2.8 : 1.6;
  const nextZ = Math.min((width - pad * 2) / boxW, (height - pad * 2) / boxH, cap);
  const z = Math.max(MIN_ZOOM, nextZ);
  const next = {
    z,
    x: minX - (width / z - boxW) / 2,
    y: minY - (height / z - boxH) / 2,
  };
  if (!animate) {
    cam = next;
    applyCamera();
    persistCamera();
    return;
  }
  const from = { ...cam };
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 420);
    const e = 1 - (1 - t) ** 3;
    cam = {
      x: from.x + (next.x - from.x) * e,
      y: from.y + (next.y - from.y) * e,
      z: from.z + (next.z - from.z) * e,
    };
    applyCamera();
    if (t < 1) requestAnimationFrame(step);
    else persistCamera();
  };
  requestAnimationFrame(step);
}

function zoomAt(clientX, clientY, factor) {
  const rect = svg.getBoundingClientRect();
  const sx = ((clientX - rect.left) / Math.max(rect.width, 1)) * viewW;
  const sy = ((clientY - rect.top) / Math.max(rect.height, 1)) * viewH;
  const wx = cam.x + sx / cam.z;
  const wy = cam.y + sy / cam.z;
  cam.z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.z * factor));
  cam.x = wx - sx / cam.z;
  cam.y = wy - sy / cam.z;
  applyCamera();
  persistCamera();
}

function relatedNames(name, pairs) {
  const found = [];
  for (const [key, weight] of pairs) {
    const [left, right] = key.split("\u0000");
    if (left === name) found.push([right, weight]);
    if (right === name) found.push([left, weight]);
  }
  return found.sort((a, b) => b[1] - a[1]).slice(0, 4);
}

function drawSky(options = {}) {
  const rect = sky.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width < 40 || height < 40) return null;
  viewW = width;
  viewH = height;

  const { themes, pairs, shown } = shownThemes();
  const entries = visibleEntries();
  const geo = layoutThemes(shown, width, height, {
    saved: options.savedThemes ?? (options.targets ? {} : orbitMap()),
    overrides: options.overrides,
    targets: options.themeTargets,
    t: options.t ?? 1,
  });
  const placedEntries = layoutEntries(entries, geo.placed, width, height, {
    saved: options.savedEntries ?? (options.entryTargets ? {} : entryMap()),
    overrides: options.overrides,
    targets: options.entryTargets,
    t: options.t ?? 1,
  });
  geo.entries = placedEntries;

  const byName = new Map(geo.placed.map((theme) => [theme.name, theme]));
  const profile = getState().profile;
  const selectedTheme = selected?.type === "theme" ? selected.name : null;
  const selectedEntry = selected?.type === "entry" ? selected.id : null;
  const selectedEntryObj = selectedEntry
    ? placedEntries.find((entry) => entry.id === selectedEntry) || entries.find((entry) => entry.id === selectedEntry)
    : null;
  const highlightTags = selectedEntryObj
    ? new Set(selectedEntryObj.tags?.length ? selectedEntryObj.tags : ["без темы"])
    : null;

  const chords = [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([key, weight]) => {
      const [left, right] = key.split("\u0000");
      const a = byName.get(left);
      const b = byName.get(right);
      if (!a || !b) return "";
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = mx - geo.cx;
      const dy = my - geo.cy;
      const len = Math.hypot(dx, dy) || 1;
      const cpx = mx + (dx / len) * 28;
      const cpy = my + (dy / len) * 28;
      let dim = 0.55 + Math.min(weight, 3) * 0.12;
      if (selectedTheme && selectedTheme !== a.name && selectedTheme !== b.name) dim = 0.14;
      if (highlightTags && !highlightTags.has(a.name) && !highlightTags.has(b.name)) dim = 0.14;
      return `<path class="chord" d="M ${a.x} ${a.y} Q ${cpx} ${cpy} ${b.x} ${b.y}" opacity="${dim}" />`;
    })
    .join("");

  const themeSpokes = geo.placed.map((theme) => {
    const from = edgePoint(geo.cx, geo.cy, theme.x, theme.y, 62);
    const to = edgePoint(theme.x, theme.y, geo.cx, geo.cy, theme.radius + 2);
    let dim = 0.85;
    if (selectedTheme && selectedTheme !== theme.name) dim = 0.16;
    if (highlightTags && !highlightTags.has(theme.name)) dim = 0.16;
    return `<path class="spoke" d="M ${from.x} ${from.y} L ${to.x} ${to.y}" opacity="${dim}" />`;
  }).join("");

  const entryLinks = placedEntries.map((entry) => {
    const theme = byName.get(entry.homeTag);
    const target = theme || { x: geo.cx, y: geo.cy, radius: 58 };
    const from = edgePoint(target.x, target.y, entry.x, entry.y, (target.radius || 58) + 2);
    const to = edgePoint(entry.x, entry.y, target.x, target.y, entry.radius + 1);
    let dim = 0.42;
    if (selectedTheme && entry.homeTag !== selectedTheme && !(entry.tags || []).includes(selectedTheme)) dim = 0.1;
    if (selectedEntry && entry.id !== selectedEntry) dim = 0.12;
    if (selectedEntry && entry.id === selectedEntry) dim = 0.85;
    return `<path class="entry-link" d="M ${from.x} ${from.y} L ${to.x} ${to.y}" opacity="${dim}" />`;
  }).join("");

  const font = geo.placed.length > 14 ? 11 : 13;
  const nodes = geo.placed.map((theme, index) => {
    const color = theme.name === "без темы" ? "#93a0c4" : toneColor(toneFor(theme.name));
    const dim = (selectedTheme && selectedTheme !== theme.name)
      || (highlightTags && !highlightTags.has(theme.name))
      ? "is-dim"
      : "";
    const picked = selectedTheme === theme.name ? "is-picked" : "";
    const dragging = options.overrides?.kind === "theme" && options.overrides.id === theme.name ? "is-dragging" : "";
    const delay = `${(index % 8) * 0.12}s`;
    const progress = aggregateChecklistProgress(theme.entries);
    const ringR = theme.radius + 7;
    const progressRing = progress
      ? `<g class="orbit-progress ${progress.percent >= 100 ? "is-complete" : ""}">${progressArc(theme.x, theme.y, ringR, progress.percent, { width: 3.2, className: "orbit-arc" })}</g>`
      : "";
    const progressLabel = progress && theme.radius >= 28
      ? `<text class="orbit-progress-label" x="${theme.x}" y="${theme.y + 5}" text-anchor="middle" font-size="11">${progress.percent}%</text>`
      : "";
    const tip = progress
      ? `${theme.name} · ${theme.count} · чеклист ${progress.percent}%`
      : `${theme.name} · ${theme.count}`;
    return `
      <g class="theme ${dim} ${picked} ${dragging} ${progress ? "has-progress" : ""}" data-theme="${esc(theme.name)}" style="color:${color}; --drift-delay:${delay}">
        ${progressRing}
        <circle class="theme-dot" cx="${theme.x}" cy="${theme.y}" r="${theme.radius}" />
        ${progressLabel}
        <text class="theme-label" x="${theme.x}" y="${theme.y + theme.radius + 18}" font-size="${font}">${esc(short(theme.name, 18))}</text>
        <title>${esc(tip)}</title>
      </g>`;
  }).join("");

  const showLabels = placedEntries.length <= 28;
  const stars = placedEntries.map((entry, index) => {
    const color = entryColor(entry);
    const related = selectedTheme
      && (entry.homeTag === selectedTheme || (entry.tags || []).includes(selectedTheme));
    const dim = (selectedTheme && !related) || (selectedEntry && entry.id !== selectedEntry) ? "is-dim" : "";
    const picked = selectedEntry === entry.id ? "is-picked" : "";
    const dragging = options.overrides?.kind === "entry" && options.overrides.id === entry.id ? "is-dragging" : "";
    const progress = checklistProgress(entry.body);
    const moonRing = progress
      ? `<g class="moon-progress ${progress.percent >= 100 ? "is-complete" : ""}">${progressArc(entry.x, entry.y, entry.radius + 6, progress.percent, { width: 2.4, className: "moon-arc" })}</g>`
      : "";
    const tip = progress
      ? `${entry.title} · ${progress.percent}% (${progress.done}/${progress.total})`
      : `${entry.title} · ${entry.kind === "task" ? "задача" : "заметка"}`;
    const delay = `${(index % 10) * 0.08}s`;
    return `
      <g class="star ${dim} ${picked} ${dragging} ${progress ? "has-progress" : ""}" data-entry="${esc(entry.id)}" style="color:${color}; --drift-delay:${delay}">
        ${moonRing}
        <circle class="star-dot" cx="${entry.x}" cy="${entry.y}" r="${entry.radius}" />
        ${progress ? `<text class="moon-progress-label" x="${entry.x}" y="${entry.y + 4}" text-anchor="middle" font-size="9">${progress.percent}</text>` : ""}
        ${showLabels ? `<text class="star-label" x="${entry.x}" y="${entry.y + entry.radius + 14}" font-size="10">${esc(short(entry.title, 14))}</text>` : ""}
        <title>${esc(tip)}</title>
      </g>`;
  }).join("");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.classList.toggle("is-live", !options.overrides && !options.themeTargets && !pan);
  svg.innerHTML = `
    <rect class="sky-hit" width="${width}" height="${height}" fill="transparent"></rect>
    <g class="sky-world">
      ${geo.rings.map((ring) => `<circle class="guide" cx="${geo.cx}" cy="${geo.cy}" r="${ring}"></circle>`).join("")}
      ${chords}
      ${themeSpokes}
      ${entryLinks}
      ${nodes}
      ${stars}
      <g class="core" data-action="core">
        <circle class="core-ring" cx="${geo.cx}" cy="${geo.cy}" r="74"></circle>
        <circle class="core-bg" cx="${geo.cx}" cy="${geo.cy}" r="58"></circle>
        <foreignObject x="${geo.cx - 70}" y="${geo.cy - 36}" width="140" height="72">
          <div xmlns="http://www.w3.org/1999/xhtml" class="core-face">
            <strong>${esc(profile.name || "Я")}</strong>
            <span>${esc(profile.epithet || "")}</span>
          </div>
        </foreignObject>
      </g>
    </g>`;
  applyCamera();

  legend.textContent = entries.length ? "" : "Добавьте заметку или задачу — она появится на созвездии.";

  return { width, height, geo, shown, entries: placedEntries };
}

function syncSheet() {
  root?.classList.toggle("is-sheet", sheet && Boolean(selected));
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function countChip(n, one, few, many) {
  return `<span class="chip is-static"><b>${n}</b> ${plural(n, one, few, many)}</span>`;
}

/**
 * Шапка досье: «Назад» слева (в приложении закрывает шторку, на сайте возвращает
 * к «Карте личности»), справа — иконки действий.
 */
function dossierHead(docked, { back = true, actions = "" } = {}) {
  const showBack = back && (!docked || selected);
  if (!showBack && !actions) return "";
  return `
    <div class="dossier-head">
      ${showBack ? `<button type="button" class="date-plain sheet-back" data-back>Назад</button>` : "<span></span>"}
      <div class="dossier-tools">${actions}</div>
    </div>`;
}

function identityMarkup(state, themes, entries, docked) {
  const openTasks = state.entries.filter((entry) => entry.kind === "task" && entry.status !== "done").length;
  const openWishes = state.entries.filter((entry) => entry.kind === "wish" && entry.status !== "done").length;
  const orbits = themes.filter((theme) => theme.name !== "без темы").length;
  return `
    ${dossierHead(docked, { back: !docked })}
    <h2>${esc(state.profile.name || "Я")}</h2>
    <input class="text-input identity-name" maxlength="32" value="${esc(state.profile.name)}" placeholder="Имя в центре" aria-label="Имя в центре" />
    <input class="text-input identity-epithet" maxlength="80" value="${esc(state.profile.epithet)}" placeholder="Подпись" aria-label="Подпись" />
    <div class="chip-row dossier-chips">
      ${countChip(entries.length, "звезда", "звезды", "звёзд")}
      ${countChip(orbits, "орбита", "орбиты", "орбит")}
      ${countChip(openTasks, "задача", "задачи", "задач")}
      ${countChip(openWishes, "желание", "желания", "желаний")}
    </div>
    <div class="orbit-list">
      ${themes.map((theme) => {
        const progress = aggregateChecklistProgress(theme.entries);
        return `<button type="button" data-pick="${esc(theme.name)}"><i class="dot" style="color:${toneColor(toneFor(theme.name))}"></i><b>${esc(theme.name)}</b> <small>${theme.count}${progress ? ` · ${progress.percent}%` : ""}</small></button>`;
      }).join("") || "<p>Пока нет ни одной орбиты.</p>"}
    </div>`;
}

function drawDossier() {
  const activeEl = document.activeElement;
  if (dossier.contains(activeEl) && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) return;
  const state = getState();
  const { themes, pairs } = themesOf(state.entries);
  const entries = visibleEntries();
  // На сайте досье — постоянная боковая панель: без выбора в ней «Карта личности».
  // В приложении это шторка, которая открывается только по явному выбору.
  const docked = !isMobileApp();
  const reset = () => {
    selected = null;
    sheet = false;
    dossier.innerHTML = docked ? identityMarkup(state, themes, entries, docked) : "";
    syncSheet();
  };

  if (!docked && (!sheet || !selected)) {
    // Выбор сохраняем: первый тап подсвечивает, второй открывает шторку.
    dossier.innerHTML = "";
    syncSheet();
    return;
  }

  if (!selected || selected.type === "core") {
    dossier.innerHTML = identityMarkup(state, themes, entries, docked);
    syncSheet();
    return;
  }

  if (selected.type === "entry") {
    const entry = entries.find((item) => item.id === selected.id) || state.entries.find((item) => item.id === selected.id);
    if (!entry) {
      reset();
      return;
    }
    const progress = checklistProgress(entry.body);
    const homeTag = entry.tags?.[0];
    const actions = `
      <button type="button" class="icon-tool" data-open="${esc(entry.id)}" title="Открыть запись" aria-label="Открыть запись">${icons.edit}</button>
      ${homeTag ? `<button type="button" class="icon-tool" data-pick="${esc(homeTag)}" title="К орбите" aria-label="К орбите">${icons.orbit}</button>` : ""}`;
    dossier.innerHTML = `
      ${dossierHead(docked, { actions })}
      <h2>${esc(entry.title)}</h2>
      <div class="chip-row dossier-chips">
        <span class="chip is-static">${entry.kind === "task" ? "Задача" : "Заметка"}</span>
        <span class="chip is-static">${esc(formatDate(entry.updatedAt))}</span>
        ${(entry.tags || []).map((tag) => `<button type="button" class="chip" data-pick="${esc(tag)}">#${esc(tag)}</button>`).join("")}
      </div>
      ${progress ? progressBadgeHtml(progress) : ""}
      <p class="lede">${esc(short(plainBody(entry.body).replace(/\s+/g, " ").trim() || "Без текста", 220))}</p>`;
    syncSheet();
    return;
  }

  if (selected.type !== "theme" || !themes.some((theme) => theme.name === selected.name)) {
    reset();
    return;
  }

  const theme = themes.find((item) => item.name === selected.name);
  const links = relatedNames(theme.name, pairs);
  const themeProgress = aggregateChecklistProgress(theme.entries);
  const themeEntries = theme.entries.filter((entry) => entry.kind === "note" || entry.kind === "task");
  const actions = `<button type="button" class="icon-tool" data-filter title="Показать в архиве" aria-label="Показать в архиве">${icons.archive}</button>`;
  dossier.innerHTML = `
    ${dossierHead(docked, { actions })}
    <h2>${esc(theme.name)}</h2>
    <div class="chip-row dossier-chips">
      ${countChip(themeEntries.length, "запись", "записи", "записей")}
      ${links.map(([name]) => `<button type="button" class="chip" data-pick="${esc(name)}"><i class="dot" style="color:${toneColor(toneFor(name))}"></i>${esc(name)}</button>`).join("")}
    </div>
    ${themeProgress ? progressBadgeHtml(themeProgress) : ""}
    <div class="orbit-list">
      ${themeEntries.map((entry) => {
        const progress = checklistProgress(entry.body);
        return `
        <button type="button" class="entry-row" data-select-entry="${esc(entry.id)}">
          <small>${entry.kind === "task" ? "Задача" : "Заметка"}${entry.status === "focus" ? " · в фокусе" : ""}${progress ? ` · ${progress.percent}%` : ""}</small>
          <b>${esc(entry.title)}</b>
          ${progress ? `<span class="entry-progress-bar" aria-hidden="true"><i style="width:${progress.percent}%"></i></span>` : ""}
        </button>`;
      }).join("") || "<p>На орбите пока нет заметок и задач.</p>"}
    </div>
    <button type="button" class="fab dossier-fab" data-new title="Запись на эту орбиту" aria-label="Запись на эту орбиту">${icons.plus}</button>`;
  syncSheet();
}
function bindIdentity() {
  const name = dossier.querySelector(".identity-name");
  const epithet = dossier.querySelector(".identity-epithet");
  if (!name || !epithet) return;
  const save = () => {
    const nextName = name.value.trim() || "Я";
    const nextEpithet = epithet.value.trim();
    const profile = getState().profile;
    if (nextName === profile.name && nextEpithet === profile.epithet) return;
    update((state) => {
      state.profile.name = nextName;
      state.profile.epithet = nextEpithet;
      return state;
    });
  };
  name.addEventListener("change", save);
  epithet.addEventListener("change", save);
  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      epithet.focus();
    }
  });
}

function scheduleDragDraw() {
  if (redrawRaf) return;
  redrawRaf = requestAnimationFrame(() => {
    redrawRaf = 0;
    if (!drag) return;
    drawSky({ overrides: drag });
  });
}

function compose() {
  const rect = sky.getBoundingClientRect();
  const { shown } = shownThemes();
  const entries = visibleEntries();
  const currentThemes = layoutThemes(shown, rect.width, rect.height, { saved: orbitMap() });
  const currentEntries = layoutEntries(entries, currentThemes.placed, rect.width, rect.height, { saved: entryMap() });
  composeFrom = {
    themes: Object.fromEntries(currentThemes.placed.map((theme) => [theme.name, { x: theme.x, y: theme.y }])),
    entries: Object.fromEntries(currentEntries.map((entry) => [entry.id, { x: entry.x, y: entry.y }])),
  };
  const themeTargets = new Map(defaultThemes(shown, rect.width, rect.height).map((theme) => [theme.name, theme]));
  const entryTargets = new Map(
    defaultEntries(entries, [...themeTargets.values()], rect.width, rect.height).map((entry) => [entry.id, entry]),
  );

  update((state) => {
    state.orbitMap = {};
    state.entryMap = {};
    return state;
  }, { silent: true });

  if (composeRaf) cancelAnimationFrame(composeRaf);
  composeStart = performance.now();
  sky.classList.add("is-composing");

  const step = (now) => {
    const t = Math.min(1, (now - composeStart) / 560);
    const eased = 1 - (1 - t) ** 3;
    const drawn = drawSky({
      savedThemes: {},
      savedEntries: {},
      themeTargets,
      entryTargets,
      t: eased,
    });
    if (t < 1) {
      composeRaf = requestAnimationFrame(step);
      return;
    }
    composeRaf = 0;
    composeFrom = null;
    sky.classList.remove("is-composing");
    if (drawn) fitCamera(drawn.geo, drawn.width, drawn.height, true);
    else drawSky();
  };
  composeRaf = requestAnimationFrame(step);
  toast("Созвездие собрано");
}

function fitView() {
  const drawn = drawSky();
  if (drawn) fitCamera(drawn.geo, drawn.width, drawn.height, true);
}

export function render() {
  if (!active || drag || pan || pinchCtl?.isPinching()) return;
  const rect = sky.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) {
    requestAnimationFrame(() => {
      if (active) render();
    });
    return;
  }
  lastSize = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  drawSky();
  drawDossier();
  bindIdentity();
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view constellation-view";
  root.innerHTML = `
    <div class="constellation-layout">
      <div class="sky">
        <div class="sky-tools">
          <span class="zoom-group">
            <button type="button" class="mini sky-zoom" data-zoom="out" aria-label="Мельче">−</button>
            <span class="zoom-label sky-zoom-label">100%</span>
            <button type="button" class="mini sky-zoom" data-zoom="in" aria-label="Крупнее">+</button>
          </span>
          <button type="button" class="icon-tool" data-fit title="Показать всё созвездие" aria-label="Показать всё созвездие">${icons.fit}</button>
          <button type="button" class="icon-tool" data-compose title="Собрать орбиты и звёзды" aria-label="Собрать орбиты и звёзды">${icons.compose}</button>
        </div>
        <svg class="sky-map" aria-label="Созвездие личности"></svg>
        <p class="legend"></p>
        <button type="button" class="fab" data-new-star title="Новая запись" aria-label="Новая запись">${icons.plus}</button>
      </div>
      <aside class="dossier"></aside>
    </div>`;
  parent.append(root);
  sky = root.querySelector(".sky");
  svg = root.querySelector(".sky-map");
  dossier = root.querySelector(".dossier");
  legend = root.querySelector(".legend");
  zoomLabel = root.querySelector(".sky-zoom-label");

  // «+» на созвездии: новая запись, а если выбрана орбита — сразу с её меткой.
  root.querySelector("[data-new-star]").addEventListener("click", (event) => {
    event.stopPropagation();
    const tags = selected?.type === "theme" && selected.name !== "без темы" ? [selected.name] : [];
    bridge.newEntry?.({ kind: "note", tags });
  });
  root.querySelector("[data-new-star]").addEventListener("pointerdown", (event) => event.stopPropagation());

  root.querySelector(".sky-tools").addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target.closest("[data-compose]")) {
      compose();
      return;
    }
    if (event.target.closest("[data-fit]")) {
      fitView();
      return;
    }
    const zoom = event.target.closest("[data-zoom]")?.dataset.zoom;
    if (zoom) {
      const box = svg.getBoundingClientRect();
      zoomAt(box.left + box.width / 2, box.top + box.height / 2, zoom === "in" ? 1.12 : 1 / 1.12);
    }
  });

  const startPan = (event, immediate = false) => {
    pan = {
      x: event.clientX,
      y: event.clientY,
      cx: cam.x,
      cy: cam.y,
      pointerId: event.pointerId,
      moved: false,
      armed: immediate,
    };
    if (immediate) {
      sky.classList.add("is-panning");
      svg.classList.remove("is-live");
    }
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const beginDrag = (event, kind, id, circle) => {
    const point = pointerToWorld(event);
    const x = Number(circle.getAttribute("cx"));
    const y = Number(circle.getAttribute("cy"));
    drag = {
      kind,
      id,
      x,
      y,
      offsetX: point.x - x,
      offsetY: point.y - y,
      moved: false,
      pointerId: event.pointerId,
    };
    sky.classList.add("is-dragging");
    svg.classList.remove("is-live");
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  pinchCtl = attachPinch(svg, {
    onPinchStart: () => {
      pan = null;
      drag = null;
      sky.classList.remove("is-panning", "is-dragging");
      svg.classList.remove("is-live");
    },
    onZoom: (x, y, factor) => {
      zoomAt(x, y, factor);
    },
    onPinchEnd: () => {
      persistCamera();
      drawSky();
    },
  });

  svg.addEventListener("pointerdown", (event) => {
    if (pinchCtl?.pointerCount() >= 2 || pinchCtl?.isPinching()) return;
    const onTheme = event.target.closest("[data-theme]");
    const onStar = event.target.closest("[data-entry]");
    const onCore = event.target.closest(".core");

    if (event.button === 1 || (spaceDown && event.button === 0 && !onTheme && !onStar)) {
      startPan(event, true);
      return;
    }

    if (event.button === 0 && !onTheme && !onStar && !onCore && !spaceDown) {
      startPan(event, false);
      return;
    }

    if (event.button !== 0 || spaceDown) return;

    if (onTheme) {
      beginDrag(event, "theme", onTheme.dataset.theme, onTheme.querySelector(".theme-dot"));
      return;
    }
    if (onStar) {
      beginDrag(event, "entry", onStar.dataset.entry, onStar.querySelector(".star-dot"));
    }
  });

  svg.addEventListener("pointermove", (event) => {
    if (pinchCtl?.isPinching()) return;
    if (pan && event.pointerId === pan.pointerId) {
      const dist = Math.hypot(event.clientX - pan.x, event.clientY - pan.y);
      if (!pan.armed && dist < 4) return;
      if (!pan.armed) {
        pan.armed = true;
        pan.moved = true;
        sky.classList.add("is-panning");
        svg.classList.remove("is-live");
      } else if (dist >= 4) {
        pan.moved = true;
      }
      cam.x = pan.cx - (event.clientX - pan.x) / cam.z;
      cam.y = pan.cy - (event.clientY - pan.y) / cam.z;
      applyCamera();
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = pointerToWorld(event);
    const nextX = point.x - drag.offsetX;
    const nextY = point.y - drag.offsetY;
    if (!drag.moved && Math.hypot(nextX - drag.x, nextY - drag.y) < 3) return;
    drag.moved = true;
    drag.x = nextX;
    drag.y = nextY;
    scheduleDragDraw();
  });

  const endPointer = (event) => {
    if (pinchCtl?.isPinching()) return;
    if (pan && (!event || event.pointerId === pan.pointerId)) {
      const finished = pan;
      pan = null;
      sky.classList.remove("is-panning");
      if (finished.moved) {
        persistCamera();
        drawSky();
      } else if (!spaceDown) {
        selected = null;
        sheet = false;
        render();
      } else {
        drawSky();
      }
      return;
    }
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const finished = drag;
    drag = null;
    sky.classList.remove("is-dragging");
    const rect = sky.getBoundingClientRect();
    if (finished.moved) {
      const pos = clampPos(finished.x, finished.y, rect.width, rect.height);
      sheet = false;
      if (finished.kind === "theme") {
        saveThemePosition(finished.id, pos.x, pos.y, rect.width, rect.height);
        selected = { type: "theme", name: finished.id };
      } else {
        saveEntryPosition(finished.id, pos.x, pos.y, rect.width, rect.height);
        selected = { type: "entry", id: finished.id };
      }
      drawSky();
      drawDossier();
      bindIdentity();
    } else if (finished.kind === "theme") {
      const same = selected?.type === "theme" && selected.name === finished.id;
      selected = { type: "theme", name: finished.id };
      sheet = same;
      render();
    } else {
      const same = selected?.type === "entry" && selected.id === finished.id;
      selected = { type: "entry", id: finished.id };
      sheet = same;
      render();
    }
  };

  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.08 : 1 / 1.08);
  }, { passive: false });

  svg.addEventListener("dblclick", (event) => {
    const entryId = event.target.closest("[data-entry]")?.dataset.entry;
    if (entryId) {
      event.preventDefault();
      bridge.openEntry?.(entryId);
    }
  });

  svg.addEventListener("click", (event) => {
    if (spaceDown) return;
    if (event.target.closest("[data-theme]") || event.target.closest("[data-entry]")) return;
    if (event.target.closest("[data-action='core']")) {
      selected = { type: "core" };
      sheet = true;
      render();
      if (!isMobileApp()) dossier.querySelector(".identity-name")?.focus();
    }
  });

  dossier.addEventListener("click", (event) => {
    if (event.target.closest("[data-back]")) {
      selected = null;
      sheet = false;
      render();
      return;
    }
    const pick = event.target.closest("[data-pick]")?.dataset.pick;
    if (pick) {
      selected = { type: "theme", name: pick };
      sheet = true;
      render();
      return;
    }
    const selectEntry = event.target.closest("[data-select-entry]")?.dataset.selectEntry;
    if (selectEntry) {
      selected = { type: "entry", id: selectEntry };
      sheet = true;
      render();
      return;
    }
    const open = event.target.closest("[data-open]")?.dataset.open;
    if (open) bridge.openEntry?.(open);
    if (event.target.closest("[data-new]") && selected?.type === "theme") {
      bridge.newEntry?.({ tags: [selected.name] });
    }
    if (event.target.closest("[data-filter]") && selected?.type === "theme") {
      bridge.filterTag?.(selected.name);
    }
  });

  const observer = new ResizeObserver(() => {
    if (!active || drag || pan) return;
    const box = sky.getBoundingClientRect();
    const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
    if (size === lastSize) return;
    render();
  });
  observer.observe(sky);
}

export function setActive(on) {
  active = on;
  root.classList.toggle("is-on", on);
  if (on) {
    loadCamera();
    render();
  } else {
    drag = null;
    pan = null;
    spaceDown = false;
    sky?.classList.remove("is-space", "is-panning", "is-dragging");
    if (composeRaf) cancelAnimationFrame(composeRaf);
    composeRaf = 0;
    composeFrom = null;
  }
}

export function isSheetOpen() {
  return Boolean(root?.classList.contains("is-sheet"));
}

export function closeSheet() {
  selected = null;
  sheet = false;
  if (active) render();
}

export function focusTheme(name) {
  selected = name ? { type: "theme", name } : null;
  sheet = Boolean(name);
  if (active) render();
}

export function keydown(event) {
  if (!active) return;
  if (event.code === "Space") {
    event.preventDefault();
    spaceDown = true;
    sky.classList.add("is-space");
  }
}

export function keyup(event) {
  if (event.code === "Space") {
    spaceDown = false;
    sky?.classList.remove("is-space");
  }
}
