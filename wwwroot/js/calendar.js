import { bridge } from "./bridge.js";
import { getState } from "./store.js";
import {
  dayKey,
  esc,
  formatDayTitle,
  formatMonthTitle,
  formatTime,
  hasClockTime,
  parseDayKey,
  startOfDay,
} from "./ui.js";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const HOUR_START = 6;
const HOUR_END = 22;
const HOUR_PX = 44;

const MODES = [
  ["plan", "План"],
  ["journal", "Журнал"],
  ["events", "События"],
];

const VIEWS = [
  ["month", "Месяц"],
  ["week", "Неделя"],
];

let root;
let boardEl;
let panelEl;
let titleEl;
let active = false;
let mode = "plan";
let view = "month";
let journalField = "createdAt";
let cursor = startOfDay(Date.now());
let selectedDay = dayKey(Date.now());

function kindLabel(kind) {
  if (kind === "task") return "Задача";
  if (kind === "event") return "Событие";
  return "Заметка";
}

function kindTone(kind) {
  if (kind === "task") return "amber";
  if (kind === "event") return "cyan";
  return "mint";
}

function short(text, max = 18) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function mondayOf(ts) {
  const date = new Date(startOfDay(ts));
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.getTime();
}

function addDays(ts, days) {
  const date = new Date(ts);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function stampFor(key, hour = null) {
  const base = parseDayKey(key);
  if (base == null) return Date.now();
  if (hour == null) return startOfDay(base);
  const date = new Date(base);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

function entryStamp(entry) {
  if (mode === "journal") {
    const value = entry[journalField] ?? entry.createdAt;
    return Number.isFinite(value) ? value : null;
  }
  return Number.isFinite(entry.when) ? entry.when : null;
}

function visibleEntries() {
  const entries = getState().entries;
  if (mode === "events") {
    return entries.filter((entry) => entry.kind === "event" && Number.isFinite(entry.when));
  }
  if (mode === "journal") {
    return entries.filter((entry) => entry.kind === "note" || entry.kind === "task");
  }
  return entries.filter((entry) => {
    if (entry.kind === "event") return Number.isFinite(entry.when);
    if (entry.kind === "note" || entry.kind === "task") return Number.isFinite(entry.when);
    return false;
  });
}

function byDay(entries) {
  const map = new Map();
  for (const entry of entries) {
    const stamp = entryStamp(entry);
    if (!Number.isFinite(stamp)) continue;
    const key = dayKey(stamp);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ ...entry, _stamp: stamp });
  }
  for (const list of map.values()) {
    list.sort((a, b) => a._stamp - b._stamp || a.title.localeCompare(b.title, "ru"));
  }
  return map;
}

function monthCells(anchor) {
  const first = new Date(anchor);
  first.setDate(1);
  first.setHours(0, 0, 0, 0);
  const start = mondayOf(first.getTime());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const ts = addDays(start, i);
    cells.push({
      ts,
      key: dayKey(ts),
      day: new Date(ts).getDate(),
      inMonth: new Date(ts).getMonth() === first.getMonth(),
      isToday: dayKey(ts) === dayKey(Date.now()),
    });
  }
  return cells;
}

function weekDays(anchor) {
  const start = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const ts = addDays(start, index);
    return {
      ts,
      key: dayKey(ts),
      label: WEEKDAYS[index],
      day: new Date(ts).getDate(),
      isToday: dayKey(ts) === dayKey(Date.now()),
    };
  });
}

function defaultKind() {
  if (mode === "events") return "event";
  if (mode === "journal") return "note";
  return "task";
}

function createForDay(key, hour = null) {
  selectedDay = key;
  const when = stampFor(key, hour);
  const kind = defaultKind();
  bridge.newEntry?.({ kind, when, tags: kind === "event" ? [] : undefined });
}

function openEntry(id) {
  bridge.openEntry?.(id);
}

function paintChrome() {
  const modeBar = root.querySelector("[data-modes]");
  const viewBar = root.querySelector("[data-views]");
  const journalBar = root.querySelector("[data-journal-field]");
  modeBar.innerHTML = MODES.map(([id, label]) => `
    <button type="button" class="chip ${mode === id ? "is-on" : ""}" data-mode="${id}">${label}</button>
  `).join("");
  viewBar.innerHTML = VIEWS.map(([id, label]) => `
    <button type="button" class="chip ${view === id ? "is-on" : ""}" data-view-mode="${id}">${label}</button>
  `).join("");
  journalBar.hidden = mode !== "journal";
  journalBar.innerHTML = `
    <button type="button" class="chip slim ${journalField === "createdAt" ? "is-on" : ""}" data-journal="createdAt">по созданию</button>
    <button type="button" class="chip slim ${journalField === "updatedAt" ? "is-on" : ""}" data-journal="updatedAt">по изменению</button>
  `;
  if (view === "month") {
    titleEl.textContent = formatMonthTitle(cursor);
  } else {
    const start = mondayOf(cursor);
    const end = addDays(start, 6);
    const sameMonth = new Date(start).getMonth() === new Date(end).getMonth();
    const left = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: sameMonth ? undefined : "short" }).format(new Date(start));
    const right = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(end));
    titleEl.textContent = `${left} – ${right}`;
  }
}

function itemChip(entry, { compact = false } = {}) {
  const tone = kindTone(entry.kind);
  const time = mode === "journal" ? "" : formatTime(entry._stamp ?? entry.when);
  return `
    <button type="button" class="cal-item tone-${tone}" data-id="${esc(entry.id)}" title="${esc(entry.title)}">
      ${!compact && time ? `<span class="cal-item-time">${esc(time)}</span>` : ""}
      <span class="cal-item-title">${esc(short(entry.title, compact ? 14 : 28))}</span>
    </button>`;
}

function paintMonth(map) {
  const cells = monthCells(cursor);
  const head = WEEKDAYS.map((name) => `<div class="cal-weekday">${name}</div>`).join("");
  const body = cells.map((cell) => {
    const items = map.get(cell.key) || [];
    const shown = items.slice(0, 3);
    const more = items.length - shown.length;
    const cls = [
      "cal-cell",
      cell.inMonth ? "" : "is-out",
      cell.isToday ? "is-today" : "",
      cell.key === selectedDay ? "is-selected" : "",
    ].filter(Boolean).join(" ");
    return `
      <div class="${cls}" data-day="${esc(cell.key)}">
        <div class="cal-cell-top">
          <span class="cal-daynum">${cell.day}</span>
          ${items.length ? `<span class="cal-count">${items.length}</span>` : ""}
        </div>
        <div class="cal-cell-items">
          ${shown.map((entry) => itemChip(entry, { compact: true })).join("")}
          ${more > 0 ? `<span class="cal-more">+${more}</span>` : ""}
        </div>
      </div>`;
  }).join("");
  boardEl.innerHTML = `
    <div class="cal-month">
      <div class="cal-weekdays">${head}</div>
      <div class="cal-grid">${body}</div>
    </div>`;
}

function paintWeek(map) {
  const days = weekDays(cursor);
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const height = hours.length * HOUR_PX;
  const allDayRow = days.map((day) => {
    const items = (map.get(day.key) || []).filter((entry) => !hasClockTime(entry._stamp));
    return `
      <div class="cal-allday-col ${day.isToday ? "is-today" : ""} ${day.key === selectedDay ? "is-selected" : ""}" data-day="${esc(day.key)}">
        ${items.map((entry) => itemChip(entry, { compact: true })).join("") || `<span class="cal-allday-empty">—</span>`}
      </div>`;
  }).join("");
  const timedCols = days.map((day) => {
    const timed = (map.get(day.key) || []).filter((entry) => hasClockTime(entry._stamp));
    const blocks = timed.map((entry) => {
      const date = new Date(entry._stamp);
      const minutes = date.getHours() * 60 + date.getMinutes();
      const startMin = HOUR_START * 60;
      const endMin = HOUR_END * 60;
      const clamped = Math.min(endMin - 30, Math.max(startMin, minutes));
      const top = ((clamped - startMin) / 60) * HOUR_PX;
      return `
        <button type="button" class="cal-block tone-${kindTone(entry.kind)}" data-id="${esc(entry.id)}" style="top:${top}px">
          <strong>${esc(formatTime(entry._stamp))}</strong>
          <span>${esc(short(entry.title, 20))}</span>
        </button>`;
    }).join("");
    const slots = hours.map((hour) => `
      <button type="button" class="cal-slot" data-day="${esc(day.key)}" data-hour="${hour}" style="height:${HOUR_PX}px" aria-label="${esc(day.key)} ${hour}:00"></button>
    `).join("");
    return `
      <div class="cal-day-col ${day.isToday ? "is-today" : ""} ${day.key === selectedDay ? "is-selected" : ""}" data-day="${esc(day.key)}" style="height:${height}px">
        <div class="cal-slots">${slots}</div>
        <div class="cal-blocks">${blocks}</div>
      </div>`;
  }).join("");
  const hourLabels = hours.map((hour) => `
    <div class="cal-hour" style="height:${HOUR_PX}px">${String(hour).padStart(2, "0")}:00</div>
  `).join("");
  boardEl.innerHTML = `
    <div class="cal-week">
      <div class="cal-week-head">
        <div class="cal-corner"></div>
        ${days.map((day) => `
          <button type="button" class="cal-week-day ${day.isToday ? "is-today" : ""} ${day.key === selectedDay ? "is-selected" : ""}" data-day="${esc(day.key)}">
            <span>${day.label}</span>
            <strong>${day.day}</strong>
          </button>
        `).join("")}
      </div>
      <div class="cal-week-allday">
        <div class="cal-corner-label">день</div>
        ${allDayRow}
      </div>
      <div class="cal-week-body">
        <div class="cal-hours">${hourLabels}</div>
        <div class="cal-week-cols">${timedCols}</div>
      </div>
    </div>`;
}

function paintPanel(map) {
  const items = map.get(selectedDay) || [];
  const dayTs = parseDayKey(selectedDay) ?? Date.now();
  panelEl.innerHTML = `
    <div class="cal-panel-head">
      <p class="eyebrow">День</p>
      <h2>${esc(formatDayTitle(dayTs))}</h2>
      <p class="hint">${items.length ? `${items.length} на орбите` : "Пустой день — можно зажечь запись"}</p>
    </div>
    <div class="cal-panel-actions">
      <button type="button" class="btn slim" data-new-day>На день</button>
      ${mode !== "journal" ? `<button type="button" class="btn ghost slim" data-new-event>Событие</button>` : ""}
    </div>
    <div class="cal-panel-list">
      ${items.length ? items.map((entry) => `
        <article class="cal-panel-card tone-${kindTone(entry.kind)}" data-id="${esc(entry.id)}">
          <div class="cal-panel-meta">
            <span>${esc(kindLabel(entry.kind))}</span>
            <span>${esc(mode === "journal" && !hasClockTime(entry._stamp) ? "запись дня" : formatTime(entry._stamp))}</span>
          </div>
          <h3>${esc(entry.title)}</h3>
          ${entry.tags?.length ? `<div class="card-tags">${entry.tags.map((tag) => `<span class="mini-tag">#${esc(tag)}</span>`).join("")}</div>` : ""}
        </article>
      `).join("") : `<div class="empty slim"><strong>Тишина</strong><span>Создайте задачу, заметку или событие на этот день.</span></div>`}
    </div>`;
}

export function render() {
  if (!root || !active) return;
  paintChrome();
  const map = byDay(visibleEntries());
  if (view === "month") paintMonth(map);
  else paintWeek(map);
  paintPanel(map);
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view calendar-view";
  root.innerHTML = `
    <header class="view-head cal-head">
      <div>
        <p class="eyebrow">Орбита времени</p>
        <h1>Календарь</h1>
        <p class="lede">План со сроками, журнал по датам и отдельные события — в одной сетке.</p>
      </div>
      <div class="cal-head-tools">
        <div class="segmented" data-views></div>
        <button type="button" class="btn" data-new>На день</button>
      </div>
    </header>
    <div class="cal-toolbar">
      <div class="filters" data-modes></div>
      <div class="cal-nav">
        <button type="button" class="btn ghost slim" data-shift="-1" aria-label="Назад">←</button>
        <button type="button" class="btn ghost slim" data-today>Сегодня</button>
        <button type="button" class="btn ghost slim" data-shift="1" aria-label="Вперёд">→</button>
        <strong class="cal-title"></strong>
      </div>
      <div class="filters" data-journal-field></div>
    </div>
    <div class="cal-layout">
      <div class="cal-board"></div>
      <aside class="cal-panel" aria-label="Выбранный день"></aside>
    </div>`;
  parent.append(root);
  boardEl = root.querySelector(".cal-board");
  panelEl = root.querySelector(".cal-panel");
  titleEl = root.querySelector(".cal-title");

  root.querySelector("[data-modes]").addEventListener("click", (event) => {
    const next = event.target.closest("[data-mode]")?.dataset.mode;
    if (!next || next === mode) return;
    mode = next;
    render();
  });
  root.querySelector("[data-views]").addEventListener("click", (event) => {
    const next = event.target.closest("[data-view-mode]")?.dataset.viewMode;
    if (!next || next === view) return;
    view = next;
    render();
  });
  root.querySelector("[data-journal-field]").addEventListener("click", (event) => {
    const next = event.target.closest("[data-journal]")?.dataset.journal;
    if (!next || next === journalField) return;
    journalField = next;
    render();
  });
  root.querySelector(".cal-nav").addEventListener("click", (event) => {
    if (event.target.closest("[data-today]")) {
      cursor = startOfDay(Date.now());
      selectedDay = dayKey(cursor);
      render();
      return;
    }
    const shift = event.target.closest("[data-shift]")?.dataset.shift;
    if (!shift) return;
    const step = Number(shift);
    if (view === "month") {
      const date = new Date(cursor);
      date.setMonth(date.getMonth() + step);
      cursor = startOfDay(date.getTime());
    } else {
      cursor = addDays(mondayOf(cursor), step * 7);
    }
    selectedDay = dayKey(cursor);
    render();
  });
  root.querySelector("[data-new]").addEventListener("click", () => createForDay(selectedDay));

  boardEl.addEventListener("click", (event) => {
    const item = event.target.closest("[data-id]");
    if (item) {
      openEntry(item.dataset.id);
      return;
    }
    const slot = event.target.closest(".cal-slot");
    if (slot) {
      selectedDay = slot.dataset.day;
      createForDay(slot.dataset.day, Number(slot.dataset.hour));
      return;
    }
    const day = event.target.closest("[data-day]")?.dataset.day;
    if (!day) return;
    selectedDay = day;
    if (event.target.closest(".cal-cell") && event.detail === 2) {
      createForDay(day);
      return;
    }
    render();
  });

  panelEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-new-day]")) {
      createForDay(selectedDay);
      return;
    }
    if (event.target.closest("[data-new-event]")) {
      bridge.newEntry?.({ kind: "event", when: stampFor(selectedDay) });
      return;
    }
    const id = event.target.closest("[data-id]")?.dataset.id;
    if (id) openEntry(id);
  });
}

export function setActive(on) {
  active = on;
  root.classList.toggle("is-on", on);
  if (on) render();
}

export function keydown(event) {
  if (!active) return;
  const key = event.key.toLowerCase();
  if (key === "n") {
    event.preventDefault();
    createForDay(selectedDay);
  } else if (key === "t") {
    event.preventDefault();
    cursor = startOfDay(Date.now());
    selectedDay = dayKey(cursor);
    render();
  } else if (event.key === "ArrowLeft" && (event.altKey || event.metaKey)) {
    event.preventDefault();
    root.querySelector('[data-shift="-1"]')?.click();
  } else if (event.key === "ArrowRight" && (event.altKey || event.metaKey)) {
    event.preventDefault();
    root.querySelector('[data-shift="1"]')?.click();
  }
}

export function focusDay(ts) {
  cursor = startOfDay(ts || Date.now());
  selectedDay = dayKey(cursor);
  if (active) render();
}
