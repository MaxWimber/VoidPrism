import { feedback } from "./feedback.js";

export const TONES = ["cyan", "violet", "rose", "amber", "mint"];

const TONE_COLOR = {
  cyan: "#7ee7ff",
  violet: "#c4b5fd",
  rose: "#ff9ec8",
  amber: "#ffd27a",
  mint: "#8ef0c8",
};

export function toneFor(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return TONES[(h >>> 0) % TONES.length];
}

export function toneColor(tone) {
  return TONE_COLOR[tone] || TONE_COLOR.violet;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function formatDate(ts) {
  const date = new Date(ts);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "сегодня";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "вчера";
  const withYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
  }).format(date);
}

export function dayKey(ts) {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfDay(ts) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function parseDayKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

export function toLocalInput(ts) {
  if (!Number.isFinite(ts)) return "";
  const date = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function hasClockTime(ts) {
  if (!Number.isFinite(ts)) return false;
  const date = new Date(ts);
  return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
}

export function formatMonthTitle(ts) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(ts));
}

export function formatDayTitle(ts) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(ts));
}

export function formatTime(ts) {
  if (!hasClockTime(ts)) return "весь день";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

export function initial(name) {
  const glyph = Array.from(String(name || "").trim())[0];
  return glyph ? glyph.toUpperCase() : "Я";
}

export function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

let modalOpen = false;
let modalFinish = null;

export function isModalOpen() {
  return modalOpen;
}

/** Закрывает открытый диалог как «Отмена». */
export function dismissModal() {
  modalFinish?.(false);
}

export function confirmDialog({ title, text, confirmLabel = "Подтвердить", danger = false }) {
  if (modalOpen) return Promise.resolve(false);
  modalOpen = true;
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">${esc(title)}</h3>
        <p>${esc(text)}</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-act="no">Отмена</button>
          <button type="button" class="btn ${danger ? "danger" : ""}" data-act="yes">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const finish = (value) => {
      modalOpen = false;
      modalFinish = null;
      document.removeEventListener("keydown", onKey, true);
      back.remove();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (danger) feedback("remove");
        finish(true);
      }
    };
    back.addEventListener("click", (event) => {
      if (event.target === back) finish(false);
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "no") finish(false);
      if (act === "yes") {
        if (danger) feedback("remove");
        finish(true);
      }
    });
    modalFinish = finish;
    document.addEventListener("keydown", onKey, true);
    document.body.append(back);
    back.querySelector("[data-act='yes']").focus();
  });
}

export function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2800);
}

export const icons = {
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M10.3 3.5h3.4l.5 2.4a6.5 6.5 0 0 1 1.7 1l2.3-.8 1.7 2.9-1.8 1.6a6.6 6.6 0 0 1 0 2l1.8 1.6-1.7 2.9-2.3-.8a6.5 6.5 0 0 1-1.7 1l-.5 2.4h-3.4l-.5-2.4a6.5 6.5 0 0 1-1.7-1l-2.3.8-1.7-2.9 1.8-1.6a6.6 6.6 0 0 1 0-2L3.8 9l1.7-2.9 2.3.8a6.5 6.5 0 0 1 1.7-1z"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  studio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6" stroke-linecap="round"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5 8 12l7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 19h3.5l9.7-9.7a1.8 1.8 0 0 0 0-2.5l-1-1a1.8 1.8 0 0 0-2.5 0L5 15.5V19z" stroke-linejoin="round"/><path d="m13.5 7 3.5 3.5"/></svg>`,
  orbit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="18.6" cy="8.4" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4"/></svg>`,
  compose: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m5 19 9.5-9.5M14.5 9.5l1.6-1.6" stroke-linecap="round"/><path d="M17 3.5v3M15.5 5h3M19.5 10v2M18.5 11h2M10 3.5v2M9 4.5h2" stroke-linecap="round"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V5.5a1 1 0 0 1 1-1z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="16" r="2"/><circle cx="17" cy="7" r="2.2"/><circle cx="18.5" cy="17" r="1.5"/><path d="M8.8 15 15.2 8.7M8.6 17.2l8.2-.1"/></svg>`,
  board: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="4" width="7" height="6" rx="1.5"/><rect x="13.5" y="14" width="7" height="6" rx="1.5"/><path d="M10.5 7h2a3 3 0 0 1 3 3v4"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3.5 14.2 8l5 .7-3.6 3.5.9 5L12 14.8 7.5 17.2l.9-5L4.8 8.7 9.8 8 12 3.5z"/></svg>`,
  select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4.5 6 18l3.6-3.2 2.3 5 2.2-.9-2.3-5.1H17L6 4.5z"/></svg>`,
  hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 11V6.5a1.2 1.2 0 0 1 2.4 0V11M10.4 10.2V5.4a1.2 1.2 0 0 1 2.4 0v5M12.8 10.5V6.6a1.2 1.2 0 0 1 2.4 0V13M15.2 11.2V8.2a1.2 1.2 0 0 1 2.4 0V14c0 3.2-2 6-5.6 6-2.8 0-4.6-1.4-5.5-3.2L5 14.2a1.4 1.4 0 0 1 2.2-1.6L8 13.6"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="16" height="14" rx="3"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="7"/></svg>`,
  diamond: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5z"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6h12M12 6v12M9 18h6"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M8 11.2 15.8 8"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 8H5.5V5.5"/><path d="M6 8.2A7 7 0 1 1 6.8 16"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 8h2.5V5.5"/><path d="M18 8.2A7 7 0 1 0 17.2 16"/></svg>`,
  bullets: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="7" r="1.4" fill="currentColor"/><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="6" cy="17" r="1.4" fill="currentColor"/><path d="M10 7h9M10 12h9M10 17h9"/></svg>`,
  numbers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 7h2M5 12h3M5 17h2"/><path d="M11 7h8M11 12h8M11 17h8"/></svg>`,
  checks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="5" height="5" rx="1"/><path d="M5.5 7.5 6.7 8.7 8.3 6.6"/><path d="M12 7.5h7M4 14h16M4 18h12"/></svg>`,
  wish: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3.8 13.6 9h5.4l-4.3 3.2 1.6 5.2L12 14.4 7.7 17.4l1.6-5.2L5 9h5.4L12 3.8z"/><path d="M18.8 4.5v3M17.3 6h3" stroke-linecap="round"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3.5v3M16 3.5v3M3.5 10h17"/><path d="M8 14h2M12 14h2M16 14h.01M8 17.5h2M12 17.5h2"/></svg>`,
};
