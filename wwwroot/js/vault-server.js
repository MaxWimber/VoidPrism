/** Хранение на сайте: состояние живёт в базе Django, ходим в /api/state/. */
import { bridge } from "./bridge.js";

export const SAVE_DELAY = 200;

let saving = false;
let pending = null;

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || "";
}

function put(payload, opts = {}) {
  return fetch("/api/state/", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken(),
    },
    body: JSON.stringify(payload),
    ...opts,
  });
}

export async function load() {
  const response = await fetch("/api/state/");
  if (!response.ok) throw new Error("state");
  return response.json();
}

export async function save(state) {
  if (saving) {
    pending = state;
    return;
  }
  saving = true;
  pending = null;
  try {
    const response = await put(structuredClone(state));
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    bridge.onError?.("Не удалось записать изменения в базу VoidPrism.");
    saving = false;
    return;
  }
  saving = false;
  if (pending) void save(pending);
}

export function saveOnExit(state) {
  put(state, { keepalive: true });
}
