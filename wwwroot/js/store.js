import { uid } from "./ui.js";
import { isMobileApp } from "./platform.js";
import * as localVault from "./vault-local.js";
import * as serverVault from "./vault-server.js";

const vault = isMobileApp() ? localVault : serverVault;
const listeners = new Set();
let state = null;
let saveTimer = 0;
let dirty = false;

function valid(data) {
  return Boolean(data && data.profile && Array.isArray(data.entries) && Array.isArray(data.boards) && data.boards.length);
}

function emit() {
  listeners.forEach((listener) => listener(state));
}

function scheduleSave() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    dirty = false;
    void vault.save(state);
  }, vault.SAVE_DELAY);
}

export async function bootstrap() {
  const data = await vault.load(valid);
  if (!valid(data)) throw new Error("shape");
  state = data;
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

window.addEventListener("pagehide", () => {
  if (!state || !dirty) return;
  clearTimeout(saveTimer);
  dirty = false;
  vault.saveOnExit(state);
});
