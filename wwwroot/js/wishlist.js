import { bridge } from "./bridge.js";
import { cardBodyHtml, plainExcerpt } from "./lists.js";
import { getState, update } from "./store.js";
import { esc, formatDate, icons } from "./ui.js";

const STATUS = {
  open: "Желаю",
  focus: "Близко",
  done: "Сбылось",
};

const NEXT = { open: "focus", focus: "done", done: "open" };

const FILTERS = [
  ["alive", "Живые"],
  ["open", "Желаю"],
  ["focus", "Близко"],
  ["done", "Сбылось"],
  ["all", "Все"],
];

let root;
let listEl;
let filterEl;
let statsEl;
let active = false;
let filter = "alive";

function wishes() {
  return getState().entries.filter((entry) => entry.kind === "wish");
}

function matches(entry) {
  if (filter === "all") return true;
  if (filter === "alive") return entry.status !== "done";
  return entry.status === filter;
}

function sorted(items) {
  const rank = { focus: 0, open: 1, done: 2 };
  return items
    .filter(matches)
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
      || Number(b.pinned) - Number(a.pinned)
      || (b.priority || 2) - (a.priority || 2)
      || b.updatedAt - a.updatedAt);
}

function kindLabel() {
  return "Желание";
}

function cardHtml(entry) {
  const tags = entry.tags.map((tag) => `<span class="mini-tag">#${esc(tag)}</span>`).join("");
  const bodyHtml = cardBodyHtml(entry.body);
  const fallback = plainExcerpt(entry.body) || "Без описания";
  const priority = Math.min(3, Math.max(1, entry.priority || 2));
  const stars = "✦".repeat(priority) + "✧".repeat(3 - priority);
  return `
    <article class="wish-card status-${esc(entry.status)} ${entry.pinned ? "is-pinned" : ""}" data-id="${esc(entry.id)}">
      <div class="wish-glow" aria-hidden="true"></div>
      <div class="wish-top">
        <span class="wish-kind">${kindLabel()}</span>
        <span class="wish-stars" title="Сила желания">${stars}</span>
      </div>
      <h3>${esc(entry.title)}</h3>
      <div class="wish-body body-render">${bodyHtml || `<p>${esc(fallback)}</p>`}</div>
      <div class="card-tags">${tags}</div>
      <div class="wish-foot">
        <button type="button" class="pin ${entry.pinned ? "is-on" : ""}" data-pin aria-label="${entry.pinned ? "Открепить" : "Закрепить"}">${icons.pin}</button>
        <span class="wish-date">${esc(formatDate(entry.updatedAt))}</span>
        <button type="button" class="wish-status" data-status aria-label="Статус: ${esc(STATUS[entry.status])}">${esc(STATUS[entry.status] || "Желаю")}</button>
      </div>
    </article>`;
}

function paintStats(items) {
  const open = items.filter((item) => item.status === "open").length;
  const near = items.filter((item) => item.status === "focus").length;
  const done = items.filter((item) => item.status === "done").length;
  statsEl.innerHTML = `
    <div class="stat"><b>${open}</b><span>желаю</span></div>
    <div class="stat"><b>${near}</b><span>близко</span></div>
    <div class="stat"><b>${done}</b><span>сбылось</span></div>`;
}

function paintFilters() {
  filterEl.innerHTML = FILTERS.map(([id, label]) => `
    <button type="button" class="chip ${filter === id ? "is-on" : ""}" data-filter="${id}">${label}</button>
  `).join("");
}

export function render() {
  if (!root) return;
  const items = wishes();
  paintStats(items);
  paintFilters();
  const shown = sorted(items);
  if (!shown.length) {
    listEl.innerHTML = `
      <div class="empty">
        <strong>${items.length ? "В этом срезе пусто" : "Список желаний открыт"}</strong>
        <span>${items.length ? "Смените фильтр или отметьте желание иначе." : "Запишите то, к чему тянет — даже если пока далеко."}</span>
      </div>`;
    return;
  }
  listEl.innerHTML = `<div class="wish-grid">${shown.map(cardHtml).join("")}</div>`;
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view wishlist-view";
  root.innerHTML = `
    <header class="view-head">
      <div>
        <p class="eyebrow">Орбита желаний</p>
        <h1>Желания</h1>
        <p class="lede">Не задачи и не заметки — то, чего хочется. От «желаю» до «сбылось».</p>
      </div>
      <button type="button" class="btn" data-new>Новое желание</button>
    </header>
    <div class="stats wish-stats"></div>
    <div class="toolbar">
      <div class="filters"></div>
    </div>
    <div class="wish-scroll"></div>`;
  parent.append(root);
  statsEl = root.querySelector(".wish-stats");
  filterEl = root.querySelector(".filters");
  listEl = root.querySelector(".wish-scroll");

  root.querySelector("[data-new]").addEventListener("click", () => {
    bridge.newWish?.();
  });
  filterEl.addEventListener("click", (event) => {
    const next = event.target.closest("[data-filter]")?.dataset.filter;
    if (!next) return;
    filter = next;
    render();
  });
  listEl.addEventListener("click", (event) => {
    const card = event.target.closest(".wish-card");
    if (!card) return;
    const id = card.dataset.id;
    if (event.target.closest("[data-pin]")) {
      update((state) => {
        const entry = state.entries.find((item) => item.id === id);
        if (entry) entry.pinned = !entry.pinned;
        return state;
      });
      return;
    }
    if (event.target.closest("[data-status]")) {
      update((state) => {
        const entry = state.entries.find((item) => item.id === id);
        if (entry) {
          entry.status = NEXT[entry.status] || "open";
          entry.updatedAt = Date.now();
        }
        return state;
      });
      return;
    }
    bridge.openWish?.(id);
  });
}

export function setActive(on) {
  active = on;
  root.classList.toggle("is-on", on);
  if (on) render();
}

export function keydown(event) {
  if (!active) return;
  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    bridge.newWish?.();
  }
}
