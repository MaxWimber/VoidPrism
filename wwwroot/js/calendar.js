import { bridge } from "./bridge.js";
import { attachSelection } from "./select.js";
import { getState } from "./store.js";
import {
  dayKey,
  esc,
  formatDayTitle,
  formatMonthTitle,
  formatTime,
  hasClockTime,
  icons,
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
  ["day", "День"],
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
// Откуда пришли в «День» тапом по дню месяца/недели — туда вернёт системный «назад».
let dayFrom = null;

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

/** Показан ли сейчас период, в который попадает сегодняшний день. */
function showsToday() {
  const today = startOfDay(Date.now());
  if (view === "day") return cursor === today;
  if (view === "week") return mondayOf(cursor) === mondayOf(today);
  const a = new Date(cursor);
  const b = new Date(today);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function paintChrome() {
  const modeBar = root.querySelector("[data-modes]");
  const viewBar = root.querySelector("[data-views]");
  const sort = root.querySelector("[data-journal-toggle]");
  modeBar.innerHTML = MODES.map(([id, label]) => `
    <button type="button" class="chip ${mode === id ? "is-on" : ""}" data-mode="${id}">${label}</button>
  `).join("");
  viewBar.innerHTML = VIEWS.map(([id, label]) => `
    <button type="button" class="${view === id ? "is-on" : ""}" data-view-mode="${id}" aria-pressed="${view === id}">${label}</button>
  `).join("");
  sort.hidden = mode !== "journal";
  sort.innerHTML = `<span aria-hidden="true">⇅</span> ${journalField === "createdAt" ? "по созданию" : "по изменению"}`;
  root.querySelector("[data-today]").hidden = showsToday();
  if (view === "day") {
    titleEl.textContent = formatDayTitle(cursor);
  } else if (view === "month") {
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
  panelEl.innerHTML = `
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
      `).join("") : `<div class="empty slim"><strong>Тишина</strong><span>Плюсик внизу добавит запись на этот день.</span></div>`}
    </div>`;
}

export function render() {
  if (!root || !active) return;
  root.classList.toggle("is-day", view === "day");
  root.classList.toggle("is-month", view === "month");
  root.classList.toggle("is-week", view === "week");
  paintChrome();
  const map = byDay(visibleEntries());
  // В «Месяце» и «Неделе» только сетка, в «Дне» — только список записей дня.
  boardEl.hidden = view === "day";
  panelEl.hidden = view !== "day";
  if (view === "month") paintMonth(map);
  else if (view === "week") paintWeek(map);
  else boardEl.innerHTML = "";
  if (view === "day") paintPanel(map);
  else panelEl.innerHTML = "";
}

function goToDay(key, from = view) {
  const ts = parseDayKey(key);
  if (ts == null) return;
  dayFrom = from === "day" ? dayFrom : from;
  view = "day";
  cursor = startOfDay(ts);
  selectedDay = key;
  render();
}

/** Перелистывание на шаг: день, неделя или месяц — смотря что открыто. */
function shift(step) {
  if (view === "month") {
    const date = new Date(cursor);
    date.setDate(1);
    date.setMonth(date.getMonth() + step);
    cursor = startOfDay(date.getTime());
  } else if (view === "day") {
    cursor = addDays(cursor, step);
  } else {
    cursor = addDays(mondayOf(cursor), step * 7);
  }
  // День для «плюсика»: сегодня, если он в показанном периоде, иначе первый день периода.
  selectedDay = dayKey(showsToday() ? Date.now() : cursor);
  render();
}

export function openDay(ts) {
  mode = "plan";
  view = "day";
  dayFrom = null;
  cursor = startOfDay(ts || Date.now());
  selectedDay = dayKey(cursor);
  if (active) render();
}

/** Системный «назад»: из «Дня», открытого тапом по дате, — обратно в месяц/неделю. */
export function handleBack() {
  if (!active || view !== "day" || !dayFrom) return false;
  view = dayFrom;
  dayFrom = null;
  render();
  return true;
}

// --- Перелистывание жестами ---
// «День» и «Неделя» листаются горизонтальным свайпом, «Месяц» — вертикальным.
// Содержимое едет за пальцем; отпустили дальше порога — показываем соседний период.

const SWIPE_COMMIT = 56;

function swipeAxis() {
  return view === "month" ? "y" : "x";
}

function swipeTarget() {
  return view === "day" ? panelEl : boardEl.firstElementChild;
}

function offset(axis, value) {
  return axis === "x" ? `translateX(${value})` : `translateY(${value})`;
}

/** Анимированно листает на шаг: текущее уезжает, соседний период въезжает с другой стороны. */
function slideTo(step) {
  const axis = swipeAxis();
  const leaving = swipeTarget();
  const sign = step > 0 ? -1 : 1;
  if (leaving) {
    leaving.style.transition = "transform 0.16s ease, opacity 0.16s ease";
    leaving.style.transform = offset(axis, `${sign * 30}%`);
    leaving.style.opacity = "0";
  }
  setTimeout(() => {
    shift(step);
    const entering = swipeTarget();
    if (!entering) return;
    entering.style.transition = "none";
    entering.style.transform = offset(axis, `${-sign * 30}%`);
    entering.style.opacity = "0";
    void entering.offsetWidth;
    entering.style.transition = "transform 0.2s ease, opacity 0.2s ease";
    entering.style.transform = "";
    entering.style.opacity = "";
  }, leaving ? 150 : 0);
}

function bindSwipes(area) {
  let swipe = null;
  let swallowClick = false;
  area.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
  });
  area.addEventListener("pointermove", (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      swipe.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (swipe.axis !== swipeAxis()) {
        swipe = null;
        return;
      }
    }
    swipe.last = swipe.axis === "x" ? dx : dy;
    const target = swipeTarget();
    if (!target) return;
    const delta = swipe.last;
    target.style.transition = "none";
    target.style.transform = offset(swipe.axis, `${delta * 0.6}px`);
  });
  const finish = (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const current = swipe;
    swipe = null;
    if (!current.axis) return;
    // При pointercancel координаты события ненадёжны — берём последний сдвиг из pointermove.
    const delta = event.type === "pointerup"
      ? (current.axis === "x" ? event.clientX - current.x : event.clientY - current.y)
      : (current.last || 0);
    swallowClick = true;
    setTimeout(() => {
      swallowClick = false;
    }, 300);
    if (Math.abs(delta) >= SWIPE_COMMIT) {
      // Палец влево/вверх — следующий период, вправо/вниз — предыдущий.
      slideTo(delta < 0 ? 1 : -1);
      return;
    }
    const target = swipeTarget();
    if (!target) return;
    target.style.transition = "transform 0.18s ease";
    target.style.transform = "";
  };
  area.addEventListener("pointerup", finish);
  area.addEventListener("pointercancel", finish);
  // После свайпа палец отпускается над днём или записью — этот клик не должен ничего открывать.
  area.addEventListener("click", (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  // На компьютере: колесо листает месяцы, горизонтальная прокрутка — недели и дни.
  let wheelLock = 0;
  let wheelSum = 0;
  area.addEventListener("wheel", (event) => {
    const axis = swipeAxis();
    if (axis === "y") {
      const board = boardEl;
      if (board.scrollHeight > board.clientHeight + 2) return;
    }
    const delta = axis === "y" ? event.deltaY : (event.deltaX || (event.shiftKey ? event.deltaY : 0));
    if (!delta) return;
    event.preventDefault();
    if (Date.now() < wheelLock) return;
    wheelSum += delta;
    if (Math.abs(wheelSum) < 40) return;
    wheelLock = Date.now() + 420;
    const step = wheelSum > 0 ? 1 : -1;
    wheelSum = 0;
    slideTo(step);
  }, { passive: false });
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view calendar-view";
  root.innerHTML = `
    <header class="view-head cal-head">
      <h1>Календарь</h1>
    </header>
    <div class="cal-controls">
      <div class="cal-views" data-views role="group" aria-label="Вид календаря"></div>
      <div class="cal-modes">
        <div class="filters" data-modes></div>
        <button type="button" class="chip cal-sort" data-journal-toggle hidden></button>
      </div>
      <div class="cal-period">
        <strong class="cal-title"></strong>
        <button type="button" class="chip" data-today hidden>Сегодня</button>
      </div>
    </div>
    <div class="cal-layout">
      <div class="cal-board"></div>
      <section class="cal-panel" aria-label="Записи дня" hidden></section>
    </div>
    <button type="button" class="fab" data-new title="Новая запись на день (N)" aria-label="Новая запись на день">${icons.plus}</button>`;
  parent.append(root);
  boardEl = root.querySelector(".cal-board");
  panelEl = root.querySelector(".cal-panel");
  attachSelection(panelEl, { item: ".cal-panel-card" });
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
    dayFrom = null;
    if (view === "day") cursor = startOfDay(parseDayKey(selectedDay) ?? Date.now());
    render();
  });
  root.querySelector("[data-journal-toggle]").addEventListener("click", () => {
    journalField = journalField === "createdAt" ? "updatedAt" : "createdAt";
    render();
  });
  root.querySelector("[data-today]").addEventListener("click", () => {
    cursor = startOfDay(Date.now());
    selectedDay = dayKey(cursor);
    render();
  });
  root.querySelector("[data-new]").addEventListener("click", () => createForDay(selectedDay));

  const layout = root.querySelector(".cal-layout");
  bindSwipes(layout);

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
    // Тап по дню месяца или недели открывает этот день целиком.
    const day = event.target.closest("[data-day]")?.dataset.day;
    if (day) goToDay(day);
  });

  panelEl.addEventListener("click", (event) => {
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
  } else if ((event.key === "ArrowLeft" || event.key === "ArrowUp") && (event.altKey || event.metaKey)) {
    event.preventDefault();
    slideTo(-1);
  } else if ((event.key === "ArrowRight" || event.key === "ArrowDown") && (event.altKey || event.metaKey)) {
    event.preventDefault();
    slideTo(1);
  }
}

export function focusDay(ts) {
  cursor = startOfDay(ts || Date.now());
  selectedDay = dayKey(cursor);
  if (active) render();
}
