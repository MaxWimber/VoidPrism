import { bridge } from "./bridge.js";
import { checklistProgress, handleListEnter, plainExcerpt, progressBadgeHtml, renderBody, toggleCheckLine, toggleList } from "./lists.js";
import { getState, update } from "./store.js";
import {
  confirmDialog,
  esc,
  formatDate,
  fromLocalInput,
  icons,
  toLocalInput,
  toneColor,
  toneFor,
  uid,
} from "./ui.js";

const TASK_STATUS = {
  open: "Открыта",
  focus: "В фокусе",
  done: "Готово",
};

const WISH_STATUS = {
  open: "Желаю",
  focus: "Близко",
  done: "Сбылось",
};

const NEXT_STATUS = { open: "focus", focus: "done", done: "open" };
const FILTERS = [
  ["all", "Все"],
  ["note", "Заметки"],
  ["task", "Задачи"],
  ["event", "События"],
  ["wish", "Желания"],
  ["focus", "В фокусе"],
];

function statusLabels(kind) {
  return kind === "wish" ? WISH_STATUS : TASK_STATUS;
}

function kindTitle(kind) {
  if (kind === "task") return "Задача";
  if (kind === "wish") return "Желание";
  if (kind === "event") return "Событие";
  return "Заметка";
}

let root;
let welcomeEl;
let searchEl;
let filterEl;
let railEl;
let cardsEl;
let drawerEl;
let active = false;
let query = "";
let kindFilter = "all";
let tagFilter = "";
let draft = null;
let snapshot = "";

function blank(preset = {}) {
  const now = Date.now();
  const kind = preset.kind || "note";
  const entry = {
    id: uid(),
    kind,
    title: "",
    body: "",
    tags: [...(preset.tags || [])],
    status: "open",
    pinned: false,
    priority: kind === "wish" ? (preset.priority || 2) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  if (Number.isFinite(preset.when)) entry.when = preset.when;
  return entry;
}

function matches(entry) {
  if (kindFilter === "note" && entry.kind !== "note") return false;
  if (kindFilter === "task" && entry.kind !== "task") return false;
  if (kindFilter === "event" && entry.kind !== "event") return false;
  if (kindFilter === "wish" && entry.kind !== "wish") return false;
  if (kindFilter === "focus" && !((entry.kind === "task" || entry.kind === "wish") && entry.status === "focus")) return false;
  if (tagFilter && !entry.tags.some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) return false;
  const haystack = `${entry.title}\n${entry.body}\n${entry.tags.join(" ")}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function sorted(entries) {
  return entries.filter(matches).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

function allTags(entries) {
  const counts = new Map();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const key = tag.toLowerCase();
      const current = counts.get(key) || { name: tag, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function renderWelcome() {
  welcomeEl.hidden = !getState().welcome;
}

function renderFilters() {
  for (const button of filterEl.querySelectorAll(".chip")) {
    button.classList.toggle("is-on", button.dataset.filter === kindFilter);
  }
}

function renderRail() {
  const tags = allTags(getState().entries);
  const allCount = getState().entries.length;
  const items = [
    `<button type="button" data-tag="" class="${tagFilter ? "" : "is-on"}"><span class="tag-name">Все записи</span><small>${allCount}</small></button>`,
  ];
  for (const tag of tags) {
    const on = tag.name.toLowerCase() === tagFilter.toLowerCase();
    items.push(`
      <button type="button" data-tag="${esc(tag.name)}" class="${on ? "is-on" : ""}">
        <span class="tag-name"><i class="dot" style="color:${toneColor(toneFor(tag.name))}"></i><em>${esc(tag.name)}</em></span>
        <small>${tag.count}</small>
      </button>`);
  }
  if (!tags.length) items.push(`<p class="hint">Меток пока нет. Они станут орбитами созвездия.</p>`);
  railEl.innerHTML = items.join("");
}

function renderCards() {
  const entries = sorted(getState().entries);
  if (!entries.length) {
    cardsEl.innerHTML = `
      <div class="empty">
        <strong>${query || tagFilter || kindFilter !== "all" ? "Ничего не нашлось" : "Архив ещё тихий"}</strong>
        <span>${query || tagFilter || kindFilter !== "all" ? "Снимите фильтр или сформулируйте иначе." : "Первая заметка или задача зажжёт орбиту на карте."}</span>
      </div>`;
    return;
  }
  cardsEl.innerHTML = `<div class="cards">${entries.map(cardHtml).join("")}</div>`;
}

function cardHtml(entry) {
  const tags = entry.tags.map((tag) => `<button type="button" class="mini-tag" data-tag="${esc(tag)}">#${esc(tag)}</button>`).join("");
  const labels = statusLabels(entry.kind);
  const status = entry.kind === "task" || entry.kind === "wish"
    ? `<button type="button" class="status-orb ${esc(entry.status)} ${entry.kind === "wish" ? "wish-orb" : ""}" data-status aria-label="Статус: ${esc(labels[entry.status] || labels.open)}"></button>`
    : "<span></span>";
  const bodyHtml = renderBody(entry.body, { compact: true });
  const fallback = plainExcerpt(entry.body) || "Пустая запись";
  const done = (entry.kind === "task" || entry.kind === "wish") && entry.status === "done";
  const progress = checklistProgress(entry.body);
  const progressBlock = progress ? progressBadgeHtml(progress) : "";
  const whenLabel = Number.isFinite(entry.when) ? ` · ${formatDate(entry.when)}` : "";
  return `
    <article class="card ${done ? "is-done" : ""} ${entry.kind === "wish" ? "is-wish" : ""} ${entry.kind === "event" ? "is-event" : ""} ${progress ? "has-progress" : ""}" data-id="${esc(entry.id)}">
      <div class="card-top">
        <span>${kindTitle(entry.kind)}</span>
        <span>${esc(formatDate(entry.updatedAt))}${esc(whenLabel)}</span>
      </div>
      <h3>${esc(entry.title)}</h3>
      ${progressBlock}
      <div class="card-body body-render">${bodyHtml || `<p>${esc(fallback)}</p>`}</div>
      <div class="card-tags">${tags}</div>
      <div class="card-foot">
        <button type="button" class="pin ${entry.pinned ? "is-on" : ""}" data-pin aria-label="${entry.pinned ? "Открепить" : "Закрепить"}" aria-pressed="${entry.pinned}">${icons.pin}</button>
        ${status}
      </div>
    </article>`;
}

export function render() {
  if (!root) return;
  renderWelcome();
  renderFilters();
  renderRail();
  renderCards();
  if (document.activeElement !== searchEl) searchEl.value = query;
}

function isDirty() {
  return JSON.stringify(draft) !== snapshot;
}

function closeDrawer() {
  draft = null;
  snapshot = "";
  drawerEl.classList.remove("is-open");
}

async function requestClose() {
  if (draft && isDirty()) {
    const ok = await confirmDialog({
      title: "Закрыть без сохранения?",
      text: "Изменения этой записи пропадут.",
      confirmLabel: "Закрыть",
    });
    if (!ok) return;
  }
  closeDrawer();
}

function addTag(raw) {
  for (const part of String(raw).split(",")) {
    const tag = part.trim().replace(/^#/, "");
    if (!tag) continue;
    if (draft.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) continue;
    draft.tags.push(tag.slice(0, 32));
  }
}

function paintPreview() {
  const preview = drawerEl.querySelector(".body-preview");
  const progressEl = drawerEl.querySelector(".editor-progress");
  if (!preview) return;
  preview.innerHTML = renderBody(draft.body);
  if (!progressEl) return;
  const progress = checklistProgress(draft.body);
  if (!progress) {
    progressEl.hidden = true;
    progressEl.innerHTML = "";
    return;
  }
  progressEl.hidden = false;
  progressEl.innerHTML = progressBadgeHtml(progress);
}

function paintDrawer() {
  const title = drawerEl.querySelector(".title-input");
  const body = drawerEl.querySelector(".body-input");
  const error = drawerEl.querySelector(".field-error");
  const chips = drawerEl.querySelector(".chips");
  const statusRow = drawerEl.querySelector(".status-row");
  const pin = drawerEl.querySelector("[data-pin-input]");
  title.value = draft.title;
  body.value = draft.body;
  error.textContent = "";
  pin.checked = draft.pinned;
  const showStatus = draft.kind === "task" || draft.kind === "wish";
  statusRow.hidden = !showStatus;
  const priorityRow = drawerEl.querySelector(".priority-row");
  if (priorityRow) priorityRow.hidden = draft.kind !== "wish";
  const whenRow = drawerEl.querySelector(".when-row");
  const whenInput = drawerEl.querySelector("[data-when-input]");
  const showWhen = draft.kind === "note" || draft.kind === "task" || draft.kind === "event";
  if (whenRow) whenRow.hidden = !showWhen;
  if (whenInput) whenInput.value = Number.isFinite(draft.when) ? toLocalInput(draft.when) : "";
  const labels = statusLabels(draft.kind);
  drawerEl.querySelectorAll("[data-status-set]").forEach((button) => {
    const key = button.dataset.statusSet;
    button.textContent = labels[key] || key;
    button.classList.toggle("is-on", key === draft.status);
  });
  drawerEl.querySelectorAll("[data-kind]").forEach((button) => {
    button.classList.toggle("is-on", button.dataset.kind === draft.kind);
  });
  drawerEl.querySelectorAll("[data-priority]").forEach((button) => {
    button.classList.toggle("is-on", Number(button.dataset.priority) === Number(draft.priority || 2));
  });
  chips.innerHTML = draft.tags.map((tag, index) => `
    <span class="tag-chip">${esc(tag)}<button type="button" data-drop="${index}" aria-label="Убрать метку">×</button></span>
  `).join("");
  paintPreview();
}

export function openEditor(id, preset = {}) {
  const existing = id ? getState().entries.find((entry) => entry.id === id) : null;
  draft = existing ? structuredClone(existing) : blank(preset);
  snapshot = JSON.stringify(draft);
  drawerEl.classList.add("is-open");
  paintDrawer();
  drawerEl.querySelector(".title-input").focus();
}

function saveDraft() {
  draft.title = drawerEl.querySelector(".title-input").value;
  draft.body = drawerEl.querySelector(".body-input").value;
  const whenInput = drawerEl.querySelector("[data-when-input]");
  if (whenInput && draft.kind !== "wish") {
    const value = fromLocalInput(whenInput.value);
    if (value == null) delete draft.when;
    else draft.when = value;
  }
  const title = draft.title.trim();
  const error = drawerEl.querySelector(".field-error");
  if (!title) {
    error.textContent = "Добавьте название — так запись найдётся и на карте.";
    drawerEl.querySelector(".title-input").focus();
    return;
  }
  const saved = { ...draft, title, updatedAt: Date.now() };
  if (saved.kind === "wish") {
    saved.priority = Math.min(3, Math.max(1, Number(saved.priority) || 2));
    delete saved.when;
  } else {
    delete saved.priority;
  }
  if (saved.kind === "note" || saved.kind === "task" || saved.kind === "event") {
    if (Number.isFinite(saved.when)) saved.when = Number(saved.when);
    else delete saved.when;
  }
  if (saved.kind === "event" && !Number.isFinite(saved.when)) {
    error.textContent = "Укажите дату и время события.";
    drawerEl.querySelector("[data-when-input]")?.focus();
    return;
  }
  update((state) => {
    const index = state.entries.findIndex((entry) => entry.id === saved.id);
    if (index >= 0) state.entries[index] = saved;
    else state.entries.unshift(saved);
    return state;
  });
  closeDrawer();
  if (saved.kind === "wish") {
    bridge.afterWishSave?.(saved.id);
    return;
  }
  if (Number.isFinite(saved.when) || saved.kind === "event") {
    bridge.afterCalendarSave?.(saved.id);
  }
  requestAnimationFrame(() => {
    cardsEl.querySelector(`[data-id="${CSS.escape(saved.id)}"]`)?.scrollIntoView({ block: "nearest" });
  });
}

async function deleteDraft() {
  const ok = await confirmDialog({
    title: "Удалить запись?",
    text: "Она исчезнет из архива и с созвездия.",
    confirmLabel: "Удалить",
    danger: true,
  });
  if (!ok || !draft) return;
  const id = draft.id;
  update((state) => {
    state.entries = state.entries.filter((entry) => entry.id !== id);
    return state;
  });
  closeDrawer();
}

function bindDrawer() {
  drawerEl.addEventListener("click", (event) => {
    if (event.target === drawerEl) {
      requestClose();
      return;
    }
    const kind = event.target.closest("[data-kind]")?.dataset.kind;
    if (kind) {
      draft.kind = kind;
      if (kind === "wish" && !draft.priority) draft.priority = 2;
      if (kind !== "wish") delete draft.priority;
      if (kind === "wish") delete draft.when;
      paintDrawer();
      return;
    }
    const status = event.target.closest("[data-status-set]")?.dataset.statusSet;
    if (status) {
      draft.status = status;
      paintDrawer();
      return;
    }
    const priority = event.target.closest("[data-priority]")?.dataset.priority;
    if (priority) {
      draft.priority = Number(priority);
      paintDrawer();
      return;
    }
    const drop = event.target.closest("[data-drop]")?.dataset.drop;
    if (drop != null) {
      draft.tags.splice(Number(drop), 1);
      paintDrawer();
      return;
    }
    const list = event.target.closest("[data-list]")?.dataset.list;
    if (list) {
      const body = drawerEl.querySelector(".body-input");
      toggleList(body, list);
      return;
    }
    const checkLine = event.target.closest("[data-check-line]")?.dataset.checkLine;
    if (checkLine != null && event.target.closest(".body-preview")) {
      draft.body = toggleCheckLine(draft.body, Number(checkLine));
      drawerEl.querySelector(".body-input").value = draft.body;
      paintPreview();
      return;
    }
    if (event.target.closest("[data-save]")) saveDraft();
    if (event.target.closest("[data-cancel]")) requestClose();
    if (event.target.closest("[data-delete]")) deleteDraft();
    if (event.target.closest("[data-constellation]")) {
      if (!draft.tags.length) {
        drawerEl.querySelector(".field-error").textContent = "Добавьте метку — она станет орбитой.";
        return;
      }
      const theme = draft.tags[0];
      if (isDirty() || !getState().entries.some((entry) => entry.id === draft.id)) saveDraft();
      else closeDrawer();
      if (!drawerEl.classList.contains("is-open")) bridge.focusTheme?.(theme);
    }
  });
  drawerEl.querySelector(".title-input").addEventListener("input", (event) => {
    draft.title = event.target.value;
  });
  const bodyInput = drawerEl.querySelector(".body-input");
  bodyInput.addEventListener("input", (event) => {
    draft.body = event.target.value;
    paintPreview();
  });
  bodyInput.addEventListener("keydown", (event) => {
    if (handleListEnter(bodyInput, event)) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveDraft();
    }
  });
  drawerEl.querySelector("[data-pin-input]").addEventListener("change", (event) => {
    draft.pinned = event.target.checked;
  });
  drawerEl.querySelector("[data-when-input]")?.addEventListener("change", (event) => {
    const value = fromLocalInput(event.target.value);
    if (value == null) delete draft.when;
    else draft.when = value;
  });
  drawerEl.querySelector("[data-when-clear]")?.addEventListener("click", () => {
    delete draft.when;
    paintDrawer();
  });
  const tagInput = drawerEl.querySelector(".tag-input");
  tagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput.value);
      tagInput.value = "";
      paintDrawer();
      drawerEl.querySelector(".tag-input").focus();
    } else if (event.key === "Backspace" && !tagInput.value && draft.tags.length) {
      draft.tags.pop();
      paintDrawer();
      drawerEl.querySelector(".tag-input").focus();
    }
  });
  tagInput.addEventListener("blur", () => {
    if (!tagInput.value.trim()) return;
    addTag(tagInput.value);
    tagInput.value = "";
    paintDrawer();
  });
  drawerEl.querySelector(".title-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveDraft();
    } else if (event.key === "Enter") {
      event.preventDefault();
      bodyInput.focus();
    }
  });
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view archive-view";
  root.innerHTML = `
    <header class="view-head">
      <div>
        <p class="eyebrow">Личный космос</p>
        <h1>Архив</h1>
        <p class="lede">Заметки и задачи. Метки потом становятся орбитами созвездия.</p>
      </div>
      <button type="button" class="btn" data-new title="Новая запись (N)">Новая запись</button>
    </header>
    <div class="welcome">
      <p>Стартовая вселенная уже размечена. Перепишите записи под себя или очистите их в профиле — созвездие соберётся заново из ваших меток.</p>
      <button type="button" class="btn ghost slim" data-dismiss>Понятно</button>
    </div>
    <div class="toolbar">
      <input class="search" type="search" placeholder="Искать по словам и меткам" aria-label="Поиск" />
      <div class="filters"></div>
    </div>
    <div class="archive-layout">
      <aside class="tag-rail" aria-label="Метки"></aside>
      <div class="cards-scroll"><div class="cards"></div></div>
    </div>`;
  parent.append(root);
  welcomeEl = root.querySelector(".welcome");
  searchEl = root.querySelector(".search");
  filterEl = root.querySelector(".filters");
  railEl = root.querySelector(".tag-rail");
  cardsEl = root.querySelector(".cards");
  filterEl.innerHTML = FILTERS.map(([id, label]) => `<button type="button" class="chip" data-filter="${id}">${label}</button>`).join("");

  drawerEl = document.createElement("div");
  drawerEl.className = "drawer-back";
  drawerEl.innerHTML = `
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="editor-label">
      <div class="drawer-head">
        <div class="segmented">
          <button type="button" class="chip" data-kind="note">Заметка</button>
          <button type="button" class="chip" data-kind="task">Задача</button>
          <button type="button" class="chip" data-kind="event">Событие</button>
          <button type="button" class="chip" data-kind="wish">Желание</button>
        </div>
        <button type="button" class="btn ghost slim" data-cancel>Закрыть</button>
      </div>
      <input class="title-input" type="text" maxlength="140" placeholder="Название" aria-label="Название" />
      <p class="field-error" id="editor-label"></p>
      <div class="when-row">
        <label class="hint" for="entry-when">Когда — день или время в календаре</label>
        <div class="when-fields">
          <input id="entry-when" class="text-input when-input" type="datetime-local" data-when-input aria-label="Дата и время" />
          <button type="button" class="btn ghost slim" data-when-clear>Сбросить</button>
        </div>
      </div>
      <div class="list-toolbar" role="toolbar" aria-label="Списки">
        <button type="button" class="list-btn" data-list="bullet" title="Блочный список">
          ${icons.bullets}<span>Блочный</span>
        </button>
        <button type="button" class="list-btn" data-list="number" title="Построчный список">
          ${icons.numbers}<span>Построчный</span>
        </button>
        <button type="button" class="list-btn" data-list="check" title="Чеклист">
          ${icons.checks}<span>Чеклист</span>
        </button>
      </div>
      <textarea class="body-input" placeholder="Мысль, список, наблюдение…&#10;- пункт блочного списка&#10;1. построчный пункт" aria-label="Текст"></textarea>
      <div class="editor-progress" hidden></div>
      <div class="body-preview body-render" aria-live="polite"></div>
      <div class="status-row">
        <div class="segmented" aria-label="Статус">
          <button type="button" class="chip" data-status-set="open">Открыта</button>
          <button type="button" class="chip" data-status-set="focus">В фокусе</button>
          <button type="button" class="chip" data-status-set="done">Готово</button>
        </div>
      </div>
      <div class="priority-row" hidden>
        <label class="hint">Сила желания</label>
        <div class="segmented" aria-label="Сила желания">
          <button type="button" class="chip" data-priority="1">Тихо</button>
          <button type="button" class="chip" data-priority="2">Живо</button>
          <button type="button" class="chip" data-priority="3">Сильно</button>
        </div>
      </div>
      <label class="hint">Метки — это орбиты. Enter добавляет.</label>
      <div class="tag-editor">
        <div class="chips"></div>
        <input class="tag-input" type="text" maxlength="32" placeholder="метка и Enter" aria-label="Новая метка" />
      </div>
      <label class="check"><input type="checkbox" data-pin-input /> Закрепить в архиве</label>
      <div class="drawer-actions">
        <button type="button" class="btn ghost" data-delete>Удалить</button>
        <div>
          <button type="button" class="btn ghost" data-constellation>В созвездие</button>
          <button type="button" class="btn" data-save>Сохранить</button>
        </div>
      </div>
    </div>`;
  document.body.append(drawerEl);
  bindDrawer();

  root.querySelector("[data-new]").addEventListener("click", () => openEditor(null));
  root.querySelector("[data-dismiss]").addEventListener("click", () => {
    update((state) => {
      state.welcome = false;
      return state;
    });
  });
  searchEl.addEventListener("input", () => {
    query = searchEl.value;
    renderCards();
  });
  filterEl.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-filter]")?.dataset.filter;
    if (!filter) return;
    kindFilter = filter;
    renderFilters();
    renderCards();
  });
  railEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tag]");
    if (!button) return;
    tagFilter = button.dataset.tag || "";
    renderRail();
    renderCards();
  });
  cardsEl.addEventListener("click", (event) => {
    const card = event.target.closest(".card");
    if (!card) return;
    const id = card.dataset.id;
    const checkLine = event.target.closest("[data-check-line]")?.dataset.checkLine;
    if (checkLine != null) {
      event.preventDefault();
      event.stopPropagation();
      update((state) => {
        const entry = state.entries.find((item) => item.id === id);
        if (entry) {
          entry.body = toggleCheckLine(entry.body, Number(checkLine));
          entry.updatedAt = Date.now();
        }
        return state;
      });
      return;
    }
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
        if (entry) entry.status = NEXT_STATUS[entry.status] || "open";
        return state;
      });
      return;
    }
    const tag = event.target.closest("[data-tag]")?.dataset.tag;
    if (tag) {
      tagFilter = tag;
      renderRail();
      renderCards();
      return;
    }
    openEditor(id);
  });
}

export function setActive(on) {
  active = on;
  root.classList.toggle("is-on", on);
  if (on) render();
}

export function filterTag(name) {
  tagFilter = name || "";
  kindFilter = "all";
  query = "";
}

export function keydown(event) {
  if (!active || drawerEl.classList.contains("is-open")) {
    if (event.key === "Escape" && drawerEl.classList.contains("is-open")) {
      event.preventDefault();
      requestClose();
    }
    return;
  }
  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    openEditor(null);
  } else if (event.key === "/") {
    event.preventDefault();
    searchEl.focus();
  }
}

export function isEditorOpen() {
  return drawerEl?.classList.contains("is-open");
}
