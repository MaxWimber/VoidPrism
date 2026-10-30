import { bridge } from "./bridge.js";
import { feedback } from "./feedback.js";
import {
  RICH_RE,
  RICH_SELECTOR,
  cardBodyHtml,
  checklistHtml,
  checklistProgress,
  isFormatClass,
  listEnterInsert,
  parseLine,
  plainBody,
  plainExcerpt,
  progressBadgeHtml,
  rewriteListLines,
  sanitizeBody,
  unwrapNode,
} from "./lists.js";
import { attachSelection } from "./select.js";
import { getState, update } from "./store.js";
import {
  confirmDialog,
  esc,
  formatDate,
  icons,
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
let textTool = "";
let savedRange = null;
let pickedImage = null;

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
  const haystack = `${entry.title}\n${plainBody(entry.body)}\n${entry.tags.join(" ")}`.toLowerCase();
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
  for (const button of filterEl.querySelectorAll("[data-filter]")) {
    const on = button.dataset.filter === kindFilter;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
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
  const bodyHtml = cardBodyHtml(entry.body);
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
      <div class="card-body body-render face-${esc(entry.textStyle?.family || "sans")} size-${esc(entry.textStyle?.size || "m")}">${bodyHtml || `<p>${esc(fallback)}</p>`}</div>
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
  textTool = "";
  savedRange = null;
  pickedImage = null;
  resetChecklistState();
  whenPick = null;
  drawerEl.classList.remove("is-open");
  drawerEl.querySelector(".drawer")?.classList.remove("is-settings");
}

function syncDraftFields() {
  draft.title = drawerEl.querySelector(".title-input").value;
  const body = drawerEl.querySelector(".body-input");
  draft.body = sanitizeBody(readBody(body));
}

/** Выход из редактора с сохранением: стрелка «назад» в шапке и системный жест «назад». */
function finishEditor() {
  if (editingList) stopChecklistEdit();
  syncDraftFields();
  // Открыли и закрыли без правок — ничего не пишем, дата изменения остаётся прежней.
  if (!isDirty() && getState().entries.some((entry) => entry.id === draft.id)) {
    closeDrawer();
    return;
  }
  if (!draft.title.trim()) {
    const body = bodyEl();
    if (!hasContent(body)) {
      closeDrawer();
      return;
    }
    // Без названия запись не теряем: берём первую строку текста.
    const first = body.innerText.split("\n").map((line) => parseLine(line.trim()).text.trim()).find(Boolean);
    draft.title = (first || "Без названия").slice(0, 60);
    drawerEl.querySelector(".title-input").value = draft.title;
  }
  saveDraft();
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

const TEXT_FACES = ["sans", "display", "serif"];
const TEXT_SIZES = ["s", "m", "l"];

function textStyle() {
  const style = draft?.textStyle || {};
  return {
    family: TEXT_FACES.includes(style.family) ? style.family : "sans",
    size: TEXT_SIZES.includes(style.size) ? style.size : "m",
  };
}

function isChecklist(node) {
  return node?.nodeType === 1 && node.classList.contains("checklist");
}

function hasContent(el) {
  return Boolean(plainBody(el.innerHTML).trim()) || Boolean(el.querySelector("img, .checklist"));
}

function readBody(el) {
  if (!el) return "";
  const html = el.innerHTML.replace(/\u00a0/g, " ").trim();
  if (!html || html === "<br>") return "";
  if (!el.querySelector(RICH_SELECTOR)) {
    return el.innerText.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
  }
  // \u041a\u043d\u043e\u043f\u043a\u0438 \u0438 \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u044f \u0431\u043b\u043e\u043a\u043e\u0432 \u0447\u0435\u043a\u043b\u0438\u0441\u0442\u0430 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u0440\u0435\u0434\u0430\u043a\u0442\u043e\u0440\u0435 \u2014 \u0432 \u0437\u0430\u043f\u0438\u0441\u044c \u043d\u0435 \u043f\u043e\u043f\u0430\u0434\u0430\u044e\u0442.
  const box = el.cloneNode(true);
  box.querySelectorAll("[data-ui]").forEach((node) => node.remove());
  box.querySelectorAll(".checklist, .check-row").forEach((node) => {
    node.removeAttribute("contenteditable");
    node.classList.remove("is-lifted", "is-editing", "is-dragging", "drop-before", "drop-after");
  });
  box.querySelectorAll(".drop-before, .drop-after").forEach((node) => node.classList.remove("drop-before", "drop-after"));
  return box.innerHTML.replace(/\u00a0/g, " ").trim();
}

function writeBody(el, value) {
  const raw = String(value || "");
  if (RICH_RE.test(raw)) el.innerHTML = sanitizeBody(raw);
  else el.innerHTML = raw ? esc(raw).replace(/\n/g, "<br>") : "";
  if (plainBody(raw).split("\n").some((line) => parseLine(line).type === "check")) convertLegacyChecks(el);
  decorateChecklists(el);
  el.classList.toggle("is-empty", !hasContent(el));
}

/** \u0421\u0442\u0440\u043e\u043a\u0438 \u0441\u0442\u0430\u0440\u043e\u0433\u043e \u0444\u043e\u0440\u043c\u0430\u0442\u0430 \u00ab- [x] \u0442\u0435\u043a\u0441\u0442\u00bb \u0441\u043e\u0431\u0438\u0440\u0430\u0435\u043c \u0432 \u0431\u043b\u043e\u043a\u0438 \u0447\u0435\u043a\u043b\u0438\u0441\u0442\u043e\u0432. */
function convertLegacyChecks(el) {
  normalizeBlocks(el);
  const blocks = lineBlocks(el) || [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const holder = document.createElement("div");
    holder.innerHTML = checklistHtml(group.map(({ parsed }) => ({ text: parsed.text, done: parsed.done })));
    group[0].node.before(holder.firstChild);
    group.forEach(({ node }) => node.remove());
    group = [];
  };
  for (const node of blocks) {
    const parsed = isChecklist(node) ? null : parseLine(node.textContent);
    if (parsed?.type === "check") group.push({ node, parsed });
    else flush();
  }
  flush();
}

function decorateChecklists(el) {
  el.querySelectorAll(".checklist").forEach((list) => {
    list.setAttribute("contenteditable", "false");
  });
  const last = el.lastElementChild;
  if (isChecklist(last)) el.append(emptyLine());
}

function emptyLine() {
  const line = document.createElement("div");
  line.append(document.createElement("br"));
  return line;
}

function rememberRange() {
  const el = drawerEl?.querySelector(".body-input");
  const sel = document.getSelection();
  if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return;
  savedRange = sel.getRangeAt(0).cloneRange();
}

function restoreRange() {
  const el = drawerEl.querySelector(".body-input");
  if (!el) return;
  el.focus();
  if (!savedRange) return;
  const sel = document.getSelection();
  sel.removeAllRanges();
  try {
    sel.addRange(savedRange);
  } catch {
    savedRange = null;
  }
}

function commitBody() {
  const el = drawerEl.querySelector(".body-input");
  draft.body = readBody(el);
  el.classList.toggle("is-empty", !hasContent(el));
  paintProgress();
}

function applyExclusive(cls, group) {
  const el = drawerEl.querySelector(".body-input");
  restoreRange();
  const sel = document.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;
  const host = range.commonAncestorContainer.nodeType === 1
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  const existing = host?.closest?.(`.${cls}`);
  if (existing && el.contains(existing)) {
    unwrapNode(existing);
  } else {
    const span = document.createElement("span");
    span.className = cls;
    const frag = range.extractContents();
    frag.querySelectorAll("span").forEach((node) => {
      group.forEach((name) => node.classList.remove(name));
      if (![...node.classList].some(isFormatClass)) unwrapNode(node);
    });
    span.append(frag);
    range.insertNode(span);
    const next = document.createRange();
    next.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(next);
    savedRange = next.cloneRange();
  }
  commitBody();
}

function execFmt(command) {
  const el = drawerEl.querySelector(".body-input");
  restoreRange();
  const sel = document.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed || !el.contains(sel.anchorNode)) return;
  document.execCommand("styleWithCSS", false, false);
  document.execCommand(command, false, null);
  commitBody();
}

function applyCase(mode) {
  const el = drawerEl.querySelector(".body-input");
  restoreRange();
  const sel = document.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed || !el.contains(sel.anchorNode)) return;
  const range = sel.getRangeAt(0);
  const text = range.toString();
  if (!text) return;
  const next = mode === "upper" ? text.toLocaleUpperCase("ru") : text.toLocaleLowerCase("ru");
  range.deleteContents();
  const node = document.createTextNode(next);
  range.insertNode(node);
  const after = document.createRange();
  after.setStart(node, 0);
  after.setEnd(node, node.nodeValue.length);
  sel.removeAllRanges();
  sel.addRange(after);
  savedRange = after.cloneRange();
  commitBody();
}

// normalizeBlocks перекладывает узлы, и живой Range после этого теряется,
// поэтому края выделения отмечаем пустыми span-маркерами — они переезжают вместе с текстом.
function markSelection(el) {
  const sel = document.getSelection();
  let range = savedRange;
  if (sel?.rangeCount && el.contains(sel.anchorNode)) range = sel.getRangeAt(0);
  if (!range || !el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
  const start = document.createElement("span");
  const end = document.createElement("span");
  start.dataset.mark = "start";
  end.dataset.mark = "end";
  try {
    const tail = range.cloneRange();
    tail.collapse(false);
    tail.insertNode(end);
    const head = range.cloneRange();
    head.collapse(true);
    head.insertNode(start);
  } catch {
    start.remove();
    end.remove();
    return null;
  }
  return { start, end };
}

/** Индексы строк-блоков от строки с началом выделения до строки с его концом. */
function pickedBlocks(blocks, marks) {
  if (!marks) return [];
  let from = blocks.findIndex((block) => block.contains(marks.start));
  let to = blocks.findIndex((block) => block.contains(marks.end));
  marks.start.remove();
  marks.end.remove();
  if (from < 0) from = to;
  if (to < 0) to = from;
  if (from < 0) return [];
  const picked = [];
  for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) picked.push(i);
  return picked;
}

function lineBlocks(el) {
  const kids = [...el.childNodes].filter((node) => !(node.nodeType === 3 && !node.textContent));
  if (kids.length && kids.every((node) => node.nodeType === 1 && (node.tagName === "DIV" || node.tagName === "P"))) return kids;
  return null;
}

function removePrefix(node, count) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let left = count;
  let textNode = walker.nextNode();
  while (textNode && left > 0) {
    if (textNode.nodeValue.length <= left) {
      left -= textNode.nodeValue.length;
      const next = walker.nextNode();
      textNode.remove();
      textNode = next;
    } else {
      textNode.nodeValue = textNode.nodeValue.slice(left);
      left = 0;
    }
  }
}

function setLineText(node, before, after) {
  if (before === after) return;
  const formatted = node.querySelector?.("span, img, b, i, u, s, strong, em, sub, sup, strike");
  if (!formatted) {
    node.textContent = after;
    return;
  }
  let shared = 0;
  while (shared < before.length && shared < after.length && before[before.length - 1 - shared] === after[after.length - 1 - shared]) shared += 1;
  removePrefix(node, before.length - shared);
  const prefix = after.slice(0, after.length - shared);
  if (prefix) node.insertBefore(document.createTextNode(prefix), node.firstChild);
}

function normalizeBlocks(el) {
  if (lineBlocks(el)) return;
  const lines = [document.createElement("div")];
  const push = (node) => lines[lines.length - 1].append(node);
  [...el.childNodes].forEach((node) => {
    if (node.nodeType === 3) {
      const parts = node.nodeValue.split("\n");
      parts.forEach((part, index) => {
        if (index > 0) lines.push(document.createElement("div"));
        if (part) push(document.createTextNode(part));
      });
      return;
    }
    if (node.tagName === "BR") {
      lines.push(document.createElement("div"));
      return;
    }
    if (isChecklist(node)) {
      if (lines[lines.length - 1].childNodes.length) lines.push(node);
      else lines[lines.length - 1] = node;
      lines.push(document.createElement("div"));
      return;
    }
    if (node.tagName === "DIV" || node.tagName === "P") {
      if (lines[lines.length - 1].childNodes.length) lines.push(document.createElement("div"));
      while (node.firstChild) push(node.firstChild);
      lines.push(document.createElement("div"));
      return;
    }
    push(node);
  });
  while (lines.length > 1 && !lines[lines.length - 1].childNodes.length) lines.pop();
  if (!lines[0].childNodes.length && lines.length === 1) return;
  el.replaceChildren(...lines);
}

function applyList(type) {
  if (type === "check") {
    createChecklist();
    return;
  }
  const el = drawerEl.querySelector(".body-input");
  const marks = markSelection(el);
  normalizeBlocks(el);
  const all = lineBlocks(el) || [];
  const picked = new Set(pickedBlocks(all, marks).map((index) => all[index]));
  let nodes = all.filter((node) => !isChecklist(node));
  if (!nodes.length) {
    const line = emptyLine();
    el.append(line);
    nodes = [line];
    picked.add(line);
  }
  const indexes = nodes.map((node, index) => (picked.has(node) ? index : -1)).filter((index) => index >= 0);
  const from = indexes.length ? indexes[0] : nodes.length - 1;
  const to = indexes.length ? indexes[indexes.length - 1] : nodes.length - 1;
  const lines = nodes.map((node) => node.textContent.replace(/\n/g, ""));
  const next = rewriteListLines(lines, from, to, type);
  for (let i = from; i <= to; i += 1) setLineText(nodes[i], lines[i], next[i]);
  commitBody();
}

/** Выделенные строки (или строка с кареткой) становятся блоком чеклиста. */
function createChecklist() {
  const el = drawerEl.querySelector(".body-input");
  const marks = markSelection(el);
  normalizeBlocks(el);
  const all = lineBlocks(el) || [];
  const picked = pickedBlocks(all, marks).map((index) => all[index]).filter((node) => !isChecklist(node));
  const items = picked
    .map((node) => {
      const parsed = parseLine(node.textContent.replace(/\n/g, ""));
      return { text: parsed.text.trim(), done: Boolean(parsed.done) };
    })
    .filter((item) => item.text);
  const holder = document.createElement("div");
  holder.innerHTML = checklistHtml(items.length ? items : [{ text: "", done: false }]);
  const list = holder.firstChild;
  if (picked.length) {
    picked[0].before(list);
    picked.forEach((node) => node.remove());
  } else {
    el.append(list);
  }
  decorateChecklists(el);
  commitBody();
  if (!items.length) startChecklistEdit(list);
  else selectChecklist(list);
}

// --- Блок чеклиста в редакторе ---
// Тап по пункту отмечает его. Удержание поднимает блок: справа появляются кнопки,
// и, не отпуская палец, блок можно перетащить между абзацами.

const HOLD_MS = 420;
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 19h3.5l9.7-9.7a1.8 1.8 0 0 0 0-2.5l-1-1a1.8 1.8 0 0 0-2.5 0L5 15.5V19z" stroke-linejoin="round"/><path d="m13.5 7 3.5 3.5"/></svg>`;
const ICON_DONE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m5 12.5 4.2 4.2L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_TEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 7h14M5 12h14M5 17h9" stroke-linecap="round"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let activeList = null;
let editingList = null;
let press = null;

function bodyEl() {
  return drawerEl.querySelector(".body-input");
}

function checklistTools() {
  return drawerEl.querySelector(".checklist-tools");
}

function positionChecklistTools() {
  const tools = checklistTools();
  if (!activeList?.isConnected || press?.dragging) {
    tools.hidden = true;
    return;
  }
  const card = drawerEl.querySelector(".text-card").getBoundingClientRect();
  const body = bodyEl().getBoundingClientRect();
  const rect = activeList.getBoundingClientRect();
  tools.hidden = rect.bottom < body.top + 8 || rect.top > body.bottom - 8;
  if (tools.hidden) return;
  const top = Math.max(body.top + 4, Math.min(rect.top + 4, body.bottom - tools.offsetHeight - 4));
  tools.style.top = `${top - card.top}px`;
  tools.style.right = `${card.right - rect.right + 6}px`;
}

function selectChecklist(list) {
  if (activeList && activeList !== list) clearChecklistSelection();
  activeList = list;
  list.classList.add("is-lifted");
  const edit = checklistTools().querySelector('[data-cl="edit"]');
  const editing = list === editingList;
  edit.innerHTML = editing ? ICON_DONE : ICON_EDIT;
  edit.setAttribute("aria-label", editing ? "Готово" : "Редактировать список");
  positionChecklistTools();
}

function clearChecklistSelection() {
  if (editingList) stopChecklistEdit();
  activeList?.classList.remove("is-lifted");
  activeList = null;
  checklistTools().hidden = true;
}

function resetChecklistState() {
  activeList = null;
  editingList = null;
  if (press) clearTimeout(press.timer);
  press = null;
  const tools = checklistTools();
  if (tools) tools.hidden = true;
}

function focusRow(row) {
  if (!row) return;
  row.focus();
  const range = document.createRange();
  range.selectNodeContents(row);
  range.collapse(false);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function makeRow(text = "") {
  const row = document.createElement("div");
  row.className = "check-row";
  row.textContent = text;
  row.setAttribute("contenteditable", "true");
  return row;
}

function startChecklistEdit(list) {
  if (editingList && editingList !== list) stopChecklistEdit();
  editingList = list;
  list.classList.add("is-editing");
  list.querySelectorAll(".check-row").forEach((row) => row.setAttribute("contenteditable", "true"));
  if (!list.querySelector(".check-add")) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "check-add";
    add.dataset.ui = "1";
    add.textContent = "+ пункт";
    list.append(add);
  }
  selectChecklist(list);
  const rows = [...list.querySelectorAll(".check-row")];
  focusRow(rows.find((row) => !row.textContent.trim()) || rows[rows.length - 1]);
}

function stopChecklistEdit() {
  const list = editingList;
  editingList = null;
  if (!list) return;
  list.classList.remove("is-editing");
  list.querySelectorAll("[data-ui]").forEach((node) => node.remove());
  list.querySelectorAll(".check-row").forEach((row) => {
    row.removeAttribute("contenteditable");
    if (!row.textContent.trim()) row.remove();
  });
  if (!list.querySelector(".check-row")) {
    if (activeList === list) activeList = null;
    checklistTools().hidden = true;
    list.remove();
  } else if (activeList === list) {
    selectChecklist(list);
  }
  commitBody();
}

function addRowAfter(row) {
  const next = makeRow();
  row.after(next);
  focusRow(next);
  commitBody();
  positionChecklistTools();
}

function addRowAtEnd(list) {
  const rows = list.querySelectorAll(".check-row");
  const last = rows[rows.length - 1];
  if (last) addRowAfter(last);
  else {
    const row = makeRow();
    list.prepend(row);
    focusRow(row);
  }
}

function onRowKey(event) {
  const row = event.target.closest?.(".check-row");
  if (!row || !editingList?.contains(row)) return false;
  if (event.key === "Enter") {
    event.preventDefault();
    addRowAfter(row);
    return true;
  }
  if (event.key === "Backspace" && !row.textContent) {
    event.preventDefault();
    const rows = [...editingList.querySelectorAll(".check-row")];
    if (rows.length <= 1) return true;
    const index = rows.indexOf(row);
    row.remove();
    focusRow(rows[index - 1] || rows[index + 1]);
    commitBody();
    positionChecklistTools();
    return true;
  }
  return false;
}

function checkSound(row, done) {
  if (!done) return "uncheck";
  const rows = row.closest(".checklist")?.querySelectorAll(".check-row") || [];
  return [...rows].every((item) => item.classList.contains("is-done")) ? "complete" : "check";
}

function toggleRow(row) {
  feedback(checkSound(row, row.classList.toggle("is-done")));
  commitBody();
}

function checklistToText(list) {
  const lines = [...list.querySelectorAll(".check-row")].map((row) => row.textContent.trim()).filter(Boolean);
  const nodes = lines.map((text) => {
    const line = document.createElement("div");
    line.textContent = text;
    return line;
  });
  if (editingList === list) editingList = null;
  activeList = null;
  checklistTools().hidden = true;
  list.replaceWith(...(nodes.length ? nodes : [emptyLine()]));
  commitBody();
}

function deleteChecklist(list) {
  if (editingList === list) editingList = null;
  activeList = null;
  checklistTools().hidden = true;
  list.remove();
  commitBody();
}

function clearDropMarks() {
  bodyEl().querySelectorAll(".drop-before, .drop-after").forEach((node) => node.classList.remove("drop-before", "drop-after"));
}

function dropTarget(list, y) {
  const blocks = [...bodyEl().children].filter((node) => node !== list && !node.dataset.ui);
  for (const node of blocks) {
    const rect = node.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { node, before: true };
  }
  const last = blocks[blocks.length - 1];
  return last ? { node: last, before: false } : null;
}

function onChecklistPointerDown(event) {
  const list = event.target.closest?.(".checklist");
  if (!list || event.button > 0) return;
  if (list === editingList) return;
  event.preventDefault();
  if (activeList && activeList !== list) clearChecklistSelection();
  press = {
    list,
    row: event.target.closest(".check-row"),
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lifted: list === activeList,
    held: false,
    dragging: false,
    target: null,
    timer: 0,
  };
  press.timer = setTimeout(() => {
    if (!press || press.list !== list) return;
    press.held = true;
    press.lifted = true;
    selectChecklist(list);
    feedback("hold");
  }, HOLD_MS);
}

function onChecklistPointerMove(event) {
  if (!press || event.pointerId !== press.id) return;
  const dist = Math.hypot(event.clientX - press.x, event.clientY - press.y);
  if (!press.lifted) {
    if (dist > 8) {
      clearTimeout(press.timer);
      press = null;
    }
    return;
  }
  if (!press.dragging) {
    if (dist < 6) return;
    clearTimeout(press.timer);
    press.dragging = true;
    normalizeBlocks(bodyEl());
    press.list.classList.add("is-dragging");
    checklistTools().hidden = true;
    try {
      bodyEl().setPointerCapture(press.id);
    } catch {
      /* указатель уже отпущен */
    }
  }
  event.preventDefault();
  const body = bodyEl();
  const rect = body.getBoundingClientRect();
  if (event.clientY < rect.top + 36) body.scrollTop -= 12;
  else if (event.clientY > rect.bottom - 36) body.scrollTop += 12;
  clearDropMarks();
  press.target = dropTarget(press.list, event.clientY);
  press.target?.node.classList.add(press.target.before ? "drop-before" : "drop-after");
}

function onChecklistPointerUp(event) {
  if (!press || event.pointerId !== press.id) return;
  const current = press;
  press = null;
  clearTimeout(current.timer);
  if (current.dragging) {
    clearDropMarks();
    current.list.classList.remove("is-dragging");
    const { target } = current;
    if (target) {
      if (target.before) target.node.before(current.list);
      else target.node.after(current.list);
    }
    decorateChecklists(bodyEl());
    commitBody();
    selectChecklist(current.list);
    return;
  }
  if (event.type === "pointerup" && !current.held && current.row) toggleRow(current.row);
}

function bindChecklists() {
  const body = bodyEl();
  body.addEventListener("pointerdown", onChecklistPointerDown);
  body.addEventListener("pointermove", onChecklistPointerMove);
  body.addEventListener("pointerup", onChecklistPointerUp);
  body.addEventListener("pointercancel", onChecklistPointerUp);
  // Пока блок поднят, палец двигает его, а не прокручивает текст.
  body.addEventListener("touchmove", (event) => {
    if (press?.lifted) event.preventDefault();
  }, { passive: false });
  body.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".checklist")) event.preventDefault();
  });
  body.addEventListener("scroll", positionChecklistTools);
  window.addEventListener("resize", () => {
    if (activeList) positionChecklistTools();
  });
  drawerEl.addEventListener("pointerdown", (event) => {
    if (!activeList) return;
    if (event.target.closest(".checklist") || event.target.closest(".checklist-tools")) return;
    clearChecklistSelection();
  });
  const tools = checklistTools();
  tools.querySelector('[data-cl="text"]').innerHTML = ICON_TEXT;
  tools.querySelector('[data-cl="delete"]').innerHTML = ICON_TRASH;
  tools.addEventListener("pointerdown", (event) => event.preventDefault());
  tools.addEventListener("click", (event) => {
    event.stopPropagation();
    const action = event.target.closest("[data-cl]")?.dataset.cl;
    const list = activeList;
    if (!action || !list) return;
    if (action === "edit") {
      if (editingList === list) stopChecklistEdit();
      else startChecklistEdit(list);
    } else if (action === "text") {
      checklistToText(list);
    } else if (action === "delete") {
      deleteChecklist(list);
    }
  });
}

function lineBlockAt(root, node) {
  let el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el || !root.contains(el)) return root;
  while (el.parentElement && el.parentElement !== root) el = el.parentElement;
  if (el !== root && (el.tagName === "DIV" || el.tagName === "P")) return el;
  return root;
}

function currentLineBeforeCaret(el) {
  const sel = document.getSelection();
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const block = lineBlockAt(el, range.startContainer);
  const pre = document.createRange();
  pre.selectNodeContents(block);
  pre.setEnd(range.startContainer, range.startOffset);
  return { line: pre.toString().split("\n").pop() };
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let url = canvas.toDataURL("image/jpeg", quality);
        while (url.length > 350000 && quality > 0.42) {
          quality -= 0.12;
          url = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(url);
      };
      image.onerror = () => reject(new Error("image"));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function insertImage(src) {
  const el = drawerEl.querySelector(".body-input");
  restoreRange();
  const img = document.createElement("img");
  img.className = "note-img align-center";
  img.alt = "";
  img.src = src;
  const sel = document.getSelection();
  if (sel?.rangeCount && el.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.collapse(false);
    range.insertNode(img);
  } else {
    el.append(img);
  }
  el.querySelectorAll("img.is-picked").forEach((node) => node.classList.remove("is-picked"));
  img.classList.add("is-picked");
  pickedImage = img;
  commitBody();
}

function alignImage(mode) {
  const el = drawerEl.querySelector(".body-input");
  const img = (pickedImage && el.contains(pickedImage) && pickedImage) || el.querySelector("img.note-img.is-picked") || el.querySelector("img.note-img");
  if (!img) return;
  img.classList.remove("align-left", "align-center", "align-right", "align-full");
  img.classList.add("note-img", `align-${mode}`);
  pickedImage = img;
  commitBody();
}

function paintProgress() {
  const progressEl = drawerEl.querySelector(".editor-progress");
  const main = drawerEl.querySelector(".editor-main");
  const progress = checklistProgress(draft?.body);
  main?.classList.toggle("has-checks", Boolean(progress));
  if (progressEl) progressEl.innerHTML = progress ? progressBadgeHtml(progress) : "";
}

function paintTools() {
  const masters = drawerEl.querySelector(".text-dock-masters");
  if (masters) masters.hidden = Boolean(textTool);
  drawerEl.querySelectorAll(".text-dock-panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== textTool;
  });
  drawerEl.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("is-on", button.dataset.tool === textTool);
  });
}

function paintDrawer() {
  const title = drawerEl.querySelector(".title-input");
  const body = drawerEl.querySelector(".body-input");
  const chips = drawerEl.querySelector(".chips");
  const statusRow = drawerEl.querySelector(".status-row");
  const pin = drawerEl.querySelector("[data-pin-toggle]");
  title.value = draft.title;
  resetChecklistState();
  writeBody(body, draft.body);
  drawerEl.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
  });
  pin.classList.toggle("is-on", Boolean(draft.pinned));
  pin.setAttribute("aria-pressed", String(Boolean(draft.pinned)));
  const showStatus = draft.kind === "task" || draft.kind === "wish";
  statusRow.hidden = !showStatus;
  const priorityRow = drawerEl.querySelector(".priority-row");
  if (priorityRow) priorityRow.hidden = draft.kind !== "wish";
  if (!whenPick) initWhen();
  paintDateLabel();
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
  paintTools();
  paintProgress();
}

export function openEditor(id, preset = {}) {
  const existing = id ? getState().entries.find((entry) => entry.id === id) : null;
  draft = existing ? structuredClone(existing) : blank(preset);
  snapshot = JSON.stringify(draft);
  textTool = "";
  whenPick = null;
  drawerEl.classList.add("is-open");
  drawerEl.querySelector(".drawer")?.classList.remove("is-settings");
  paintDrawer();
}

function saveDraft() {
  syncDraftFields();
  const title = draft.title.trim();
  drawerEl.querySelector(".drawer")?.classList.remove("is-settings");
  const error = drawerEl.querySelector(".editor-main .field-error");
  if (!title) {
    error.textContent = "Добавьте название — так запись найдётся и на карте.";
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
    openSettings("date");
    const error = drawerEl.querySelector(".editor-settings .field-error");
    if (error) error.textContent = "Выберите дату события.";
    return;
  }
  saved.textStyle = textStyle();
  delete saved.checkHeight;
  update((state) => {
    const index = state.entries.findIndex((entry) => entry.id === saved.id);
    if (index >= 0) state.entries[index] = saved;
    else state.entries.unshift(saved);
    return state;
  });
  feedback("save");
  closeDrawer();
  if (Number.isFinite(saved.when)) {
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

// Дата и время — часть настроек записи, и только у задач и событий.
// Выбор дня, движение стрелок и ввод времени сразу записываются в черновик.
let whenPick = null;

function hasDate() {
  return draft?.kind === "task" || draft?.kind === "event";
}

function formatWhen(ts) {
  const date = new Date(ts);
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date).replace(".", "");
  return `${day}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function paintDateLabel() {
  const button = drawerEl.querySelector("[data-pick-date]");
  if (!button || !draft) return;
  button.hidden = !hasDate();
  button.textContent = Number.isFinite(draft.when) ? formatWhen(draft.when) : "Дата";
  const block = drawerEl.querySelector(".when-block");
  if (block) block.hidden = !hasDate();
  const clear = drawerEl.querySelector("[data-clear-date]");
  if (clear) clear.hidden = !Number.isFinite(draft.when);
  // Скрытое колесо не прокрутить — выставляем его, как только блок даты показан.
  if (hasDate()) paintWheels();
}

/** Календарь и часы по черновику. Без даты — текущий месяц и час, день не отмечен. */
function initWhen() {
  const has = Number.isFinite(draft?.when);
  const base = has ? new Date(draft.when) : new Date();
  whenPick = {
    cursor: new Date(base.getFullYear(), base.getMonth(), 1).getTime(),
    day: has ? new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime() : null,
    hour: base.getHours(),
    minute: has ? base.getMinutes() : 0,
    drag: "",
    zoom: "days",
  };
  paintWhenPicker();
}

function openSettings(focus) {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  drawerEl.querySelector(".drawer")?.classList.add("is-settings");
  paintWheels();
  if (focus === "date") drawerEl.querySelector(".when-block")?.scrollIntoView({ block: "start" });
}

const MONTH_NAMES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/** Сетка месяцев или лет вместо дней — по тапу на заголовок (дни → месяцы → годы → дни). */
function paintZoom(cursor) {
  const grid = drawerEl.querySelector(".when-grid");
  const year = cursor.getFullYear();
  const now = new Date();
  const picked = whenPick.day != null ? new Date(whenPick.day) : null;
  let cells;
  if (whenPick.zoom === "months") {
    cells = MONTH_NAMES.map((name, index) => {
      const on = picked && picked.getFullYear() === year && picked.getMonth() === index ? " is-on" : "";
      const today = now.getFullYear() === year && now.getMonth() === index ? " is-today" : "";
      return `<button type="button" class="when-zoom-cell${on}${today}" data-pick-month="${index}">${name}</button>`;
    });
  } else {
    const first = year - (year % 12);
    cells = Array.from({ length: 12 }, (_, index) => {
      const value = first + index;
      const on = picked && picked.getFullYear() === value ? " is-on" : "";
      const today = now.getFullYear() === value ? " is-today" : "";
      return `<button type="button" class="when-zoom-cell${on}${today}" data-pick-year="${value}">${value}</button>`;
    });
  }
  grid.innerHTML = cells.join("");
}

function paintMonth() {
  const cursor = new Date(whenPick.cursor);
  const zoomed = whenPick.zoom !== "days";
  const title = drawerEl.querySelector("[data-month-title]");
  const year = cursor.getFullYear();
  if (whenPick.zoom === "months") title.textContent = String(year);
  else if (whenPick.zoom === "years") title.textContent = `${year - (year % 12)} – ${year - (year % 12) + 11}`;
  else title.textContent = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(cursor);
  drawerEl.querySelector(".when-week").hidden = zoomed;
  drawerEl.querySelector(".when-grid").classList.toggle("is-zoom", zoomed);
  if (zoomed) {
    paintZoom(cursor);
    return;
  }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    date.setHours(0, 0, 0, 0);
    const ts = date.getTime();
    const out = date.getMonth() !== cursor.getMonth() ? " is-out" : "";
    const on = ts === whenPick.day ? " is-on" : "";
    const isToday = ts === today.getTime() ? " is-today" : "";
    cells.push(`<button type="button" class="when-cell${out}${on}${isToday}" data-day="${ts}">${date.getDate()}</button>`);
  }
  drawerEl.querySelector(".when-grid").innerHTML = cells.join("");
}

// Циферблат обычный, 12-часовой: 60 минутных делений и 12 часовых.
// Время всегда остаётся внутри выбранного дня (00:00–23:59).
function hourAngle() {
  return (whenPick.hour % 12) * 30 + whenPick.minute * 0.5;
}

function paintClock() {
  drawerEl.querySelector(".clock-hand.hour").style.transform = `rotate(${hourAngle()}deg)`;
  drawerEl.querySelector(".clock-hand.minute").style.transform = `rotate(${whenPick.minute * 6}deg)`;
  paintWheels();
}

// --- Колёса часов и минут ---
// Прокрутка с привязкой к значению; тап по соседнему значению докручивает к нему,
// тап по выбранному открывает поле ввода с клавиатуры. Колёса и стрелки синхронны.

const WHEEL_ITEM = 32;

function wheelValue(kind) {
  return kind === "hour" ? whenPick.hour : whenPick.minute;
}

/** Ставит колёса на текущее время. Сама эта прокрутка не считается выбором пользователя. */
function paintWheels() {
  if (!whenPick) return;
  drawerEl.querySelectorAll("[data-wheel]").forEach((wheel) => {
    const value = wheelValue(wheel.dataset.wheel);
    wheel.querySelectorAll(".wheel-item").forEach((item) => {
      item.classList.toggle("is-on", Number(item.dataset.value) === value);
    });
    if (wheel.clientHeight === 0) return;
    const top = value * WHEEL_ITEM;
    if (Math.abs(wheel.scrollTop - top) < 1) return;
    wheel.quietUntil = performance.now() + 250;
    wheel.lastTick = value;
    wheel.scrollTop = top;
  });
}

function setWheelValue(kind, value) {
  if (!whenPick) return;
  const max = kind === "hour" ? 23 : 59;
  const next = Math.min(max, Math.max(0, Math.round(value)));
  if (wheelValue(kind) === next && whenPick.day != null) return;
  if (kind === "hour") whenPick.hour = next;
  else whenPick.minute = next;
  paintClock();
  commitWhen();
}

function openWheelInput(box) {
  const wheel = box.querySelector("[data-wheel]");
  const input = box.querySelector(".wheel-input");
  input.hidden = false;
  input.value = String(wheelValue(wheel.dataset.wheel)).padStart(2, "0");
  input.focus();
  input.select();
}

function closeWheelInput(input) {
  if (input.hidden) return;
  const kind = input.closest(".wheel-box").querySelector("[data-wheel]").dataset.wheel;
  input.hidden = true;
  const digits = input.value.replace(/\D/g, "");
  if (digits) setWheelValue(kind, Number(digits));
  else paintWheels();
}

function bindWheels(block) {
  block.querySelectorAll(".wheel-box").forEach((box) => {
    const wheel = box.querySelector("[data-wheel]");
    const input = box.querySelector(".wheel-input");
    let settle = 0;
    // Выбором считается только прокрутка видимого колеса пользователем: когда настройки
    // скрываются, браузер сам сбрасывает прокрутку в 0 — это не «00».
    const userScroll = () => wheel.clientHeight > 0 && performance.now() >= (wheel.quietUntil || 0);
    wheel.addEventListener("scroll", () => {
      clearTimeout(settle);
      if (!userScroll()) return;
      // Щелчок на каждом делении, которое проходит мимо центра, — как у механического колеса.
      const passing = Math.round(wheel.scrollTop / WHEEL_ITEM);
      if (passing !== wheel.lastTick) {
        wheel.lastTick = passing;
        feedback("tick");
      }
      settle = setTimeout(() => {
        if (!userScroll()) return;
        setWheelValue(wheel.dataset.wheel, wheel.scrollTop / WHEEL_ITEM);
      }, 120);
    });
    wheel.addEventListener("click", (event) => {
      const item = event.target.closest(".wheel-item");
      if (!item) return;
      const value = Number(item.dataset.value);
      if (value === wheelValue(wheel.dataset.wheel)) openWheelInput(box);
      else wheel.scrollTo({ top: value * WHEEL_ITEM, behavior: "smooth" });
    });
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 2);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") input.value = "";
        input.blur();
      }
    });
    input.addEventListener("blur", () => closeWheelInput(input));
  });
}

function paintWhenPicker() {
  if (!whenPick) return;
  paintMonth();
  paintClock();
}

/** Сдвигает час, не выходя за пределы дня. Возвращает true, если сдвиг удался целиком. */
function shiftClockHour(delta) {
  const hour = Math.min(23, Math.max(0, whenPick.hour + delta));
  const moved = hour - whenPick.hour === delta;
  whenPick.hour = hour;
  return moved;
}

/** Записывает выбранные день и время в черновик. День не выбран — берём сегодня. */
function commitWhen() {
  if (!whenPick || !draft) return;
  if (whenPick.day == null) {
    const now = new Date();
    whenPick.day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  const date = new Date(whenPick.day);
  date.setHours(whenPick.hour, whenPick.minute, 0, 0);
  draft.when = date.getTime();
  const error = drawerEl.querySelector(".editor-settings .field-error");
  if (error) error.textContent = "";
  paintDateLabel();
  paintMonth();
}

function clockPoint(event, face) {
  const rect = face.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  const radius = Math.hypot(dx, dy) / (rect.width / 2);
  return { deg, radius };
}

function angleDist(a, b) {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function shortDelta(next, prev, span) {
  let delta = next - prev;
  if (delta > span / 2) delta -= span;
  if (delta < -span / 2) delta += span;
  return delta;
}

/** Листает то, что сейчас видно в календаре даты: месяц, год или двенадцать лет. */
function shiftWhen(step) {
  if (!whenPick) return;
  const date = new Date(whenPick.cursor);
  if (whenPick.zoom === "years") date.setFullYear(date.getFullYear() + step * 12);
  else if (whenPick.zoom === "months") date.setFullYear(date.getFullYear() + step);
  else date.setMonth(date.getMonth() + step);
  whenPick.cursor = date.getTime();
  paintMonth();
}

// Календарь даты листается свайпом влево/вправо, как «Дни»: сетка едет за пальцем.
function bindWhenSwipes(block) {
  const grid = block.querySelector(".when-grid");
  let swipe = null;
  let swallowClick = false;
  // Флаг гасит только клик, который браузер шлёт сразу после жеста. После касания пальцем
  // такого клика нет — флаг не должен дожить до следующего нажатия (иначе съест тап по заголовку).
  document.addEventListener("pointerdown", () => {
    swallowClick = false;
  }, true);
  // Мышью тоже можно перетащить — на сайте стрелок больше нет.
  grid.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, last: 0 };
  });
  grid.addEventListener("pointermove", (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      swipe.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (swipe.axis !== "x") {
        swipe = null;
        return;
      }
    }
    swipe.last = dx;
    grid.style.transition = "none";
    grid.style.transform = `translateX(${dx * 0.6}px)`;
  });
  const finish = (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const current = swipe;
    swipe = null;
    if (!current.axis) return;
    const delta = event.type === "pointerup" ? event.clientX - current.x : current.last;
    swallowClick = true;
    if (Math.abs(delta) < 48) {
      grid.style.transition = "transform 0.18s ease";
      grid.style.transform = "";
      return;
    }
    // Палец влево — следующий месяц, вправо — предыдущий; новый въезжает с другой стороны.
    const step = delta < 0 ? 1 : -1;
    shiftWhen(step);
    grid.style.transition = "none";
    grid.style.transform = `translateX(${step * 40}%)`;
    grid.style.opacity = "0";
    void grid.offsetWidth;
    grid.style.transition = "transform 0.2s ease, opacity 0.2s ease";
    grid.style.transform = "";
    grid.style.opacity = "";
  };
  grid.addEventListener("pointerup", finish);
  grid.addEventListener("pointercancel", finish);
  grid.addEventListener("click", (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);
}

function bindWhenPicker() {
  const block = drawerEl.querySelector(".when-block");
  const face = block.querySelector("[data-clock]");
  bindWhenSwipes(block);
  drawerEl.querySelector("[data-pick-date]").addEventListener("click", (event) => {
    event.stopPropagation();
    openSettings("date");
  });
  block.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!whenPick) return;
    if (event.target.closest("[data-clear-date]")) {
      delete draft.when;
      whenPick.day = null;
      paintDateLabel();
      paintMonth();
      return;
    }
    if (event.target.closest("[data-month-title]")) {
      whenPick.zoom = whenPick.zoom === "days" ? "months" : whenPick.zoom === "months" ? "years" : "days";
      paintMonth();
      return;
    }
    const pickMonth = event.target.closest("[data-pick-month]")?.dataset.pickMonth;
    if (pickMonth != null) {
      const date = new Date(whenPick.cursor);
      whenPick.cursor = new Date(date.getFullYear(), Number(pickMonth), 1).getTime();
      whenPick.zoom = "days";
      paintMonth();
      return;
    }
    const pickYear = event.target.closest("[data-pick-year]")?.dataset.pickYear;
    if (pickYear != null) {
      const date = new Date(whenPick.cursor);
      whenPick.cursor = new Date(Number(pickYear), date.getMonth(), 1).getTime();
      whenPick.zoom = "months";
      paintMonth();
      return;
    }
    const day = event.target.closest("[data-day]")?.dataset.day;
    if (day) {
      whenPick.day = Number(day);
      const picked = new Date(whenPick.day);
      whenPick.cursor = new Date(picked.getFullYear(), picked.getMonth(), 1).getTime();
      commitWhen();
    }
  });
  const pickHand = (point) => {
    const nearHour = angleDist(point.deg, hourAngle());
    const nearMinute = angleDist(point.deg, whenPick.minute * 6);
    if (point.radius < 0.58 && nearHour <= nearMinute + 10) return "hour";
    if (nearMinute + 6 < nearHour) return "minute";
    return point.radius < 0.62 ? "hour" : "minute";
  };
  const moveHand = (event) => {
    if (!whenPick || !whenPick.drag) return;
    const point = clockPoint(event, face);
    const before = whenPick.hour * 60 + whenPick.minute;
    if (whenPick.drag === "hour") {
      // Стрелка крутится по кругу: переход через 12 меняет первую половину дня на вторую.
      const next = Math.round(point.deg / 30) % 12;
      shiftClockHour(shortDelta(next, whenPick.hour % 12, 12));
    } else {
      const next = Math.round(point.deg / 6) % 60;
      const raw = whenPick.minute + shortDelta(next, whenPick.minute, 60);
      if (raw >= 60) whenPick.minute = shiftClockHour(1) ? raw - 60 : 59;
      else if (raw < 0) whenPick.minute = shiftClockHour(-1) ? raw + 60 : 0;
      else whenPick.minute = raw;
    }
    if (whenPick.hour * 60 + whenPick.minute === before) return;
    feedback("tick");
    paintClock();
    commitWhen();
  };
  face.addEventListener("pointerdown", (event) => {
    if (!whenPick) return;
    event.stopPropagation();
    event.preventDefault();
    face.setPointerCapture(event.pointerId);
    whenPick.drag = pickHand(clockPoint(event, face));
  });
  face.addEventListener("pointermove", (event) => {
    if (!face.hasPointerCapture(event.pointerId)) return;
    moveHand(event);
  });
  const releaseHand = () => {
    if (whenPick) whenPick.drag = "";
  };
  face.addEventListener("pointerup", releaseHand);
  face.addEventListener("pointercancel", releaseHand);
  bindWheels(block);
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
      // У заметок и желаний даты нет — при смене типа она снимается.
      if (kind === "wish" || kind === "note") {
        delete draft.when;
        whenPick = null;
      }
      paintDrawer();
      return;
    }
    const status = event.target.closest("[data-status-set]")?.dataset.statusSet;
    if (status) {
      if (status === "done" && draft.status !== "done") feedback("done");
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
    const tool = event.target.closest("[data-tool]")?.dataset.tool;
    if (tool) {
      textTool = textTool === tool ? "" : tool;
      paintTools();
      return;
    }
    if (event.target.closest("[data-tool-close]")) {
      textTool = "";
      paintTools();
      return;
    }
    const list = event.target.closest("[data-list]")?.dataset.list;
    if (list) {
      applyList(list);
      return;
    }
    const face = event.target.closest("[data-font]")?.dataset.font;
    if (face) {
      applyExclusive(`fmt-face-${face}`, ["fmt-face-sans", "fmt-face-display", "fmt-face-serif"]);
      return;
    }
    const size = event.target.closest("[data-size]")?.dataset.size;
    if (size) {
      applyExclusive(`fmt-size-${size}`, ["fmt-size-s", "fmt-size-m", "fmt-size-l"]);
      return;
    }
    const fmt = event.target.closest("[data-fmt]")?.dataset.fmt;
    if (fmt) {
      execFmt(fmt);
      return;
    }
    const lineStyle = event.target.closest("[data-line]")?.dataset.line;
    if (lineStyle) {
      applyExclusive(`fmt-u-${lineStyle}`, ["fmt-u-solid", "fmt-u-dash", "fmt-u-wave", "fmt-u-double"]);
      return;
    }
    const letter = event.target.closest("[data-case]")?.dataset.case;
    if (letter) {
      applyCase(letter);
      return;
    }
    const color = event.target.closest("[data-color]")?.dataset.color;
    if (color) {
      applyExclusive(`fmt-c-${color}`, ["fmt-c-cyan", "fmt-c-violet", "fmt-c-rose", "fmt-c-amber", "fmt-c-mint", "fmt-c-ink"]);
      return;
    }
    if (event.target.closest("[data-image-add]")) {
      drawerEl.querySelector("[data-image-file]")?.click();
      return;
    }
    const align = event.target.closest("[data-align]")?.dataset.align;
    if (align) {
      alignImage(align);
      return;
    }
    if (event.target.closest("[data-settings]")) {
      openSettings();
      return;
    }
    if (event.target.closest("[data-settings-back]")) {
      drawerEl.querySelector(".drawer")?.classList.remove("is-settings");
      return;
    }
    if (event.target.closest("[data-done]")) finishEditor();
    if (event.target.closest("[data-save]")) finishEditor();
    if (event.target.closest("[data-cancel]")) requestClose();
    if (event.target.closest("[data-delete]")) deleteDraft();
    if (event.target.closest("[data-constellation]")) {
      if (!draft.tags.length) {
        drawerEl.querySelector(".drawer")?.classList.add("is-settings");
        const settingsError = drawerEl.querySelector(".editor-settings .field-error");
        if (settingsError) settingsError.textContent = "Добавьте метку — она станет орбитой.";
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
  bindChecklists();
  drawerEl.querySelector(".text-dock").addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-image-add]")) return;
    if (event.target.closest("button")) event.preventDefault();
  });
  document.addEventListener("selectionchange", rememberRange);
  bodyInput.addEventListener("input", () => {
    draft.body = readBody(bodyInput);
    bodyInput.classList.toggle("is-empty", !hasContent(bodyInput));
    paintProgress();
    if (activeList) positionChecklistTools();
  });
  bodyInput.addEventListener("click", (event) => {
    if (event.target.closest(".check-add") && editingList) {
      addRowAtEnd(editingList);
      return;
    }
    const row = event.target.closest(".check-row");
    if (row && editingList?.contains(row)) {
      // В режиме правки тап по квадратику отмечает пункт, тап по тексту — ставит каретку.
      if (event.clientX < row.getBoundingClientRect().left + 30) toggleRow(row);
      return;
    }
    bodyInput.querySelectorAll("img.is-picked").forEach((node) => node.classList.remove("is-picked"));
    const img = event.target.closest("img.note-img");
    pickedImage = img || null;
    if (img) img.classList.add("is-picked");
  });
  bodyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      finishEditor();
      return;
    }
    if (event.target.closest?.(".checklist")) {
      onRowKey(event);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey) return;
    const info = currentLineBeforeCaret(bodyInput);
    if (!info) return;
    const insert = listEnterInsert(info.line);
    if (insert == null) return;
    event.preventDefault();
    if (insert === "") {
      for (let i = 0; i < info.line.length; i += 1) document.execCommand("delete", false, null);
    } else {
      document.execCommand("insertText", false, `\n${insert}`);
    }
  });
  drawerEl.querySelector("[data-image-file]").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      insertImage(await resizeImage(file));
    } catch {
      const error = drawerEl.querySelector(".editor-main .field-error");
      if (error) error.textContent = "Не удалось добавить изображение.";
    }
  });
  drawerEl.querySelector("[data-pin-toggle]").addEventListener("click", (event) => {
    event.stopPropagation();
    draft.pinned = !draft.pinned;
    const pin = event.currentTarget;
    pin.classList.toggle("is-on", draft.pinned);
    pin.setAttribute("aria-pressed", String(draft.pinned));
  });
  bindWhenPicker();
  const tagInput = drawerEl.querySelector(".tag-input");
  // Пока вводят метку — все метки видны целиком; после — сворачиваются в строку с прокруткой.
  const tagEditor = drawerEl.querySelector(".tag-editor");
  tagInput.addEventListener("focus", () => tagEditor.classList.add("is-editing"));
  tagInput.addEventListener("blur", () => tagEditor.classList.remove("is-editing"));
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
    <button type="button" class="fab" data-new title="Новая запись (N)" aria-label="Новая запись">${icons.plus}</button>
    <div class="welcome">
      <p>Стартовая вселенная уже размечена. Перепишите записи под себя или очистите их в профиле — созвездие соберётся заново из ваших меток.</p>
      <button type="button" class="btn ghost slim" data-dismiss>Понятно</button>
    </div>
    <div class="toolbar">
      <input class="search" type="search" placeholder="Искать по словам и меткам" aria-label="Поиск" />
    </div>
    <div class="archive-layout">
      <aside class="tag-rail" aria-label="Метки"></aside>
      <div class="cards-scroll"><div class="cards"></div></div>
    </div>
    <div class="tab-bar archive-tabs" role="group" aria-label="Тип записей"></div>`;
  parent.append(root);
  welcomeEl = root.querySelector(".welcome");
  searchEl = root.querySelector(".search");
  filterEl = root.querySelector(".archive-tabs");
  railEl = root.querySelector(".tag-rail");
  cardsEl = root.querySelector(".cards");
  attachSelection(cardsEl, { item: ".card" });
  filterEl.innerHTML = FILTERS.map(([id, label]) => `<button type="button" data-filter="${id}">${label}</button>`).join("");

  drawerEl = document.createElement("div");
  drawerEl.className = "drawer-back";
  drawerEl.innerHTML = `
    <div class="drawer editor-sheet" role="dialog" aria-modal="true" aria-labelledby="editor-label">
      <div class="editor-main">
        <div class="editor-top">
          <button type="button" class="icon-btn" data-done aria-label="Сохранить и закрыть">${icons.back}</button>
          <div class="editor-top-side">
            <button type="button" class="date-plain" data-pick-date>Дата</button>
            <button type="button" class="icon-btn" data-settings aria-label="Настройки записи">${icons.settings}</button>
          </div>
        </div>
        <section class="text-card">
          <input class="title-input" type="text" maxlength="140" placeholder="Название" aria-label="Название" />
          <p class="field-error" id="editor-label"></p>
          <div class="body-input is-empty" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Текст" aria-label="Текст"></div>
          <input type="file" accept="image/*" hidden data-image-file>
          <div class="checklist-tools" hidden>
            <button type="button" data-cl="edit" aria-label="Редактировать список"></button>
            <button type="button" data-cl="text" aria-label="Превратить в текст"></button>
            <button type="button" data-cl="delete" aria-label="Удалить список"></button>
          </div>
          <div class="text-dock" aria-label="Настройки текста">
            <button type="button" class="dock-btn dock-save" data-save aria-label="Сохранить" title="Сохранить">${icons.save}</button>
            <div class="text-dock-masters">
              <button type="button" class="dock-btn" data-tool="list" aria-label="Тип списка">${icons.bullets}</button>
              <button type="button" class="dock-btn dock-aa" data-tool="format" aria-label="Формат текста">Aa</button>
              <button type="button" class="dock-btn" data-tool="image" aria-label="Изображение">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="m7 16 3.2-3.2a1 1 0 0 1 1.4 0L16 17"/><path d="m14 14 1.2-1.2a1 1 0 0 1 1.4 0L19 15"/></svg>
              </button>
            </div>
            <div class="text-dock-panel" data-panel="list" hidden>
              <button type="button" class="dock-btn" data-list="bullet" aria-label="Блочный список">${icons.bullets}</button>
              <button type="button" class="dock-btn" data-list="number" aria-label="Построчный список">${icons.numbers}</button>
              <button type="button" class="dock-btn" data-list="check" aria-label="Чеклист">${icons.checks}</button>
              <button type="button" class="dock-btn dock-close" data-tool-close aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l10 10M17 7 7 17" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="text-dock-panel" data-panel="format" hidden>
              <button type="button" class="dock-btn" data-fmt="bold" aria-label="Жирный"><span class="dock-glyph fmt-bold">Ж</span></button>
              <button type="button" class="dock-btn" data-fmt="italic" aria-label="Наклонный"><span class="dock-glyph fmt-italic">К</span></button>
              <button type="button" class="dock-btn" data-fmt="strikeThrough" aria-label="Перечёркивание"><span class="dock-glyph fmt-strike">А</span></button>
              <button type="button" class="dock-btn" data-line="solid" aria-label="Подчёркивание"><span class="dock-glyph fmt-u-solid">А</span></button>
              <button type="button" class="dock-btn" data-line="dash" aria-label="Штриховое подчёркивание"><span class="dock-glyph fmt-u-dash">А</span></button>
              <button type="button" class="dock-btn" data-line="wave" aria-label="Волнистое подчёркивание"><span class="dock-glyph fmt-u-wave">А</span></button>
              <button type="button" class="dock-btn" data-line="double" aria-label="Двойное подчёркивание"><span class="dock-glyph fmt-u-double">А</span></button>
              <span class="dock-sep"></span>
              <button type="button" class="dock-btn" data-case="upper" aria-label="На заглавные"><span class="dock-glyph">АБ</span></button>
              <button type="button" class="dock-btn" data-case="lower" aria-label="На строчные"><span class="dock-glyph">аб</span></button>
              <button type="button" class="dock-btn" data-fmt="superscript" aria-label="Верхний подтекст"><span class="dock-glyph">x<sup>2</sup></span></button>
              <button type="button" class="dock-btn" data-fmt="subscript" aria-label="Нижний подтекст"><span class="dock-glyph">x<sub>2</sub></span></button>
              <span class="dock-sep"></span>
              <button type="button" class="dock-color cyan" data-color="cyan" aria-label="Бирюзовый"></button>
              <button type="button" class="dock-color violet" data-color="violet" aria-label="Фиолетовый"></button>
              <button type="button" class="dock-color rose" data-color="rose" aria-label="Розовый"></button>
              <button type="button" class="dock-color amber" data-color="amber" aria-label="Янтарный"></button>
              <button type="button" class="dock-color mint" data-color="mint" aria-label="Мятный"></button>
              <button type="button" class="dock-color ink" data-color="ink" aria-label="Светлый"></button>
              <span class="dock-sep"></span>
              <button type="button" class="dock-btn" data-font="sans" aria-label="Обычный шрифт"><span class="dock-glyph face-sans">A</span></button>
              <button type="button" class="dock-btn" data-font="display" aria-label="Акцентный шрифт"><span class="dock-glyph face-display">A</span></button>
              <button type="button" class="dock-btn" data-font="serif" aria-label="Шрифт с засечками"><span class="dock-glyph face-serif">A</span></button>
              <button type="button" class="dock-btn" data-size="s" aria-label="Мелкий размер"><span class="dock-glyph dock-size-s">A</span></button>
              <button type="button" class="dock-btn" data-size="m" aria-label="Обычный размер"><span class="dock-glyph dock-size-m">A</span></button>
              <button type="button" class="dock-btn" data-size="l" aria-label="Крупный размер"><span class="dock-glyph dock-size-l">A</span></button>
              <button type="button" class="dock-btn dock-close" data-tool-close aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l10 10M17 7 7 17" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="text-dock-panel" data-panel="image" hidden>
              <button type="button" class="dock-btn" data-image-add aria-label="Добавить изображение">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="dock-btn" data-align="left" aria-label="Слева">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="6" width="8" height="8" rx="1"/><path d="M14 8h6M14 12h6M14 16h4" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="dock-btn" data-align="center" aria-label="По центру">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="7" y="6" width="10" height="8" rx="1"/><path d="M5 17h14" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="dock-btn" data-align="right" aria-label="Справа">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="12" y="6" width="8" height="8" rx="1"/><path d="M4 8h6M4 12h6M6 16h4" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="dock-btn" data-align="full" aria-label="На всю ширину">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="7" width="16" height="10" rx="1"/><path d="M4 5h16M4 19h16" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="dock-btn dock-close" data-tool-close aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l10 10M17 7 7 17" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
        </section>
        <div class="editor-progress" aria-live="polite"></div>
      </div>
      <div class="editor-settings">
        <div class="settings-head">
          <button type="button" class="icon-btn" data-settings-back aria-label="Назад">${icons.back}</button>
          <div class="settings-tools">
            <button type="button" class="icon-tool" data-pin-toggle aria-pressed="false" title="Закрепить в архиве" aria-label="Закрепить в архиве">${icons.pin}</button>
            <button type="button" class="icon-tool" data-constellation title="В созвездие" aria-label="В созвездие">${icons.orbit}</button>
            <button type="button" class="icon-tool is-danger" data-delete title="Удалить запись" aria-label="Удалить запись">${icons.trash}</button>
          </div>
        </div>
        <p class="field-error"></p>
        <div class="seg seg-4" role="group" aria-label="Тип записи">
          <button type="button" data-kind="note">Заметка</button>
          <button type="button" data-kind="task">Задача</button>
          <button type="button" data-kind="event">Событие</button>
          <button type="button" data-kind="wish">Желание</button>
        </div>
        <div class="status-row">
          <div class="seg" role="group" aria-label="Статус">
            <button type="button" data-status-set="open">Открыта</button>
            <button type="button" data-status-set="focus">В фокусе</button>
            <button type="button" data-status-set="done">Готово</button>
          </div>
        </div>
        <div class="priority-row" hidden>
          <div class="seg" role="group" aria-label="Сила желания">
            <button type="button" data-priority="1">Тихо</button>
            <button type="button" data-priority="2">Живо</button>
            <button type="button" data-priority="3">Сильно</button>
          </div>
        </div>
        <div class="tag-editor">
          <div class="chips"></div>
          <input class="tag-input" type="text" maxlength="32" placeholder="Метка и Enter" aria-label="Новая метка" />
        </div>
        <div class="when-block" hidden>
          <div class="when-month">
            <button type="button" class="date-plain when-title" data-month-title aria-label="Выбрать месяц и год"></button>
          </div>
          <div class="when-week">${["пн","вт","ср","чт","пт","сб","вс"].map((day) => `<span>${day}</span>`).join("")}</div>
          <div class="when-grid"></div>
          <div class="when-clock">
            <div class="time-wheels">
              <div class="wheel-box">
                <div class="wheel" data-wheel="hour" aria-label="Часы">
                  ${Array.from({ length: 24 }, (_, value) => `<button type="button" class="wheel-item" data-value="${value}">${String(value).padStart(2, "0")}</button>`).join("")}
                </div>
                <input class="wheel-input" type="text" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="Часы" hidden />
              </div>
              <span class="wheel-colon">:</span>
              <div class="wheel-box">
                <div class="wheel" data-wheel="minute" aria-label="Минуты">
                  ${Array.from({ length: 60 }, (_, value) => `<button type="button" class="wheel-item" data-value="${value}">${String(value).padStart(2, "0")}</button>`).join("")}
                </div>
                <input class="wheel-input" type="text" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="Минуты" hidden />
              </div>
            </div>
            <div class="clock-face" data-clock>
              ${Array.from({ length: 60 }, (_, index) => `<span class="clock-tick${index % 5 ? "" : " is-hour"}" style="transform: rotate(${index * 6}deg)"><i></i></span>`).join("")}
              <div class="clock-hand hour"></div>
              <div class="clock-hand minute"></div>
              <i class="clock-cap"></i>
            </div>
          </div>
          <button type="button" class="chip when-clear" data-clear-date hidden>Без даты</button>
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
        if (entry?.status === "done") feedback("done");
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
      if (!closeEditorLayer()) requestClose();
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

/** Закрывает верхний слой редактора (дата, настройки, правка чеклиста). false — слоёв нет. */
function closeEditorLayer() {
  const drawer = drawerEl.querySelector(".drawer");
  if (drawer?.classList.contains("is-settings")) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    drawer.classList.remove("is-settings");
    return true;
  }
  if (activeList) {
    clearChecklistSelection();
    return true;
  }
  return false;
}

/** Системный «назад»: снимает слой редактора, а из самой записи выходит с сохранением. */
export function handleBack() {
  if (!isEditorOpen()) return false;
  if (!closeEditorLayer()) finishEditor();
  return true;
}
