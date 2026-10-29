/** Хранение в Android-приложении: localStorage + копия в SharedPreferences для виджетов. */
import { bridge } from "./bridge.js";
import { initialState } from "./seed.js";

const STORAGE_KEY = "voidprism.vault";

export const SAVE_DELAY = 120;

function write(state) {
  const json = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, json);
  bridge.pushVault?.(json);
}

export async function load(valid) {
  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    saved = valid(data) ? data : null;
  } catch {
    saved = null;
  }
  if (saved) {
    bridge.pushVault?.(JSON.stringify(saved));
    return saved;
  }
  const fresh = initialState();
  write(fresh);
  return fresh;
}

export function save(state) {
  try {
    write(structuredClone(state));
  } catch {
    bridge.onError?.("Не удалось сохранить данные на устройстве.");
  }
}

export function saveOnExit(state) {
  save(state);
}
