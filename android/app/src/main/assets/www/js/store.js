import { uid } from "./ui.js";
import { bridge } from "./bridge.js";
import { initialState } from "./seed.js";
import { syncStatus } from "./sync.js";

const STORAGE_KEY = "voidprism.vault";
const listeners = new Set();
let state = null;
let saveTimer = 0;

function valid(data) {
  return Boolean(data && data.profile && Array.isArray(data.entries) && Array.isArray(data.boards) && data.boards.length);
}

function emit() {
  listeners.forEach((listener) => listener(state));
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return valid(data) ? data : null;
  } catch {
    return null;
  }
}

function writeLocal(payload) {
  const json = JSON.stringify(payload);
  localStorage.setItem(STORAGE_KEY, json);
  bridge.pushVault?.(json);
}

function flush() {
  if (!state) return;
  try {
    writeLocal(structuredClone(state));
  } catch {
    bridge.onError?.("Не удалось сохранить данные на устройстве.");
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flush();
  }, 120);
}

export async function bootstrap() {
  const saved = readLocal();
  state = saved || initialState();
  if (!saved) writeLocal(state);
  else bridge.pushVault?.(JSON.stringify(state));
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function update(recipe, opts = {}) {
  const draft = structuredClone(state);
  const next = recipe(draft);
  if (!next || !valid(next)) return;
  state = next;
  scheduleSave();
  if (!opts.silent) emit();
}

export function blankBoard(name = "Полотно") {
  return {
    id: uid(),
    name,
    fit: false,
    camera: { x: -160, y: -110, z: 1 },
    nodes: [],
    links: [],
  };
}

export function clearCosmos() {
  const profile = structuredClone(state.profile);
  const board = blankBoard("Полотно");
  update(() => ({
    version: 1,
    welcome: false,
    profile,
    activeBoard: board.id,
    entries: [],
    boards: [board],
    orbitMap: {},
    entryMap: {},
    orbitCamera: { x: 0, y: 0, z: 1 },
  }));
}

export function themesOf(entries) {
  const map = new Map();
  for (const item of entries) {
    const names = item.tags.length ? item.tags : ["без темы"];
    for (const name of names) {
      if (!map.has(name)) map.set(name, { name, entries: [], count: 0 });
      const theme = map.get(name);
      if (!theme.entries.some((entry) => entry.id === item.id)) {
        theme.entries.push(item);
        theme.count += 1;
      }
    }
  }
  const themes = [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
  const pairs = new Map();
  for (const item of entries) {
    const names = [...new Set(item.tags.length ? item.tags : ["без темы"])];
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const key = [names[i], names[j]].sort((a, b) => a.localeCompare(b, "ru")).join("\u0000");
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  return { themes, pairs };
}

export function getSyncInfo() {
  return syncStatus();
}

window.addEventListener("pagehide", () => {
  clearTimeout(saveTimer);
  flush();
});
