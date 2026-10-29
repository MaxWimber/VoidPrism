import { bridge } from "./bridge.js";
import { checklistProgress, listEnterInsert, plainBody, plainExcerpt, progressBadgeHtml, renderBody, rewriteListLines, toggleCheckLine } from "./lists.js";
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
  closeWhenPicker();
  drawerEl.classList.remove("is-open");
  drawerEl.querySelector(".drawer")?.classList.remove("is-settings");
}

function syncDraftFields() {
  draft.title = drawerEl.querySelector(".title-input").value;
  const body = drawerEl.querySelector(".body-input");
  draft.body = sanitizeBody(readBody(body));
}

function finishEditor() {
  syncDraftFields();
  const title = draft.title.trim();
  if (!title) {
    if (!plainBody(draft.body).trim() && !String(draft.body).includes("<img")) {
      closeDrawer();
      return;
    }
    const error = drawerEl.querySelector(".editor-main .field-error");
    if (error) error.textContent = "Добавьте название — так запись найдётся и на карте.";
    return;
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

const FMT_CLASS = /^(fmt-bold|fmt-italic|fmt-strike|fmt-u-solid|fmt-u-dash|fmt-u-wave|fmt-u-double|fmt-sub|fmt-sup|fmt-face-sans|fmt-face-display|fmt-face-serif|fmt-size-s|fmt-size-m|fmt-size-l|fmt-c-cyan|fmt-c-violet|fmt-c-rose|fmt-c-amber|fmt-c-mint|fmt-c-ink)$/;
const KEEP_TAGS = new Set(["SPAN", "IMG", "BR", "DIV", "P", "B", "STRONG", "I", "EM", "S", "STRIKE", "U", "SUB", "SUP"]);
const RICH_RE = /<(span|img|b|i|u|s|strong|em|sub|sup|strike)\b/i;

function cardBodyHtml(body) {
  const raw = String(body || "");
  if (!RICH_RE.test(raw)) return renderBody(raw, { compact: true });
  return sanitizeBody(raw);
}

function readBody(el) {
  if (!el) return "";
  const html = el.innerHTML.replace(/\u00a0/g, " ").trim();
  if (!html || html === "<br>") return "";
  if (!el.querySelector("span, img, b, i, u, s, strong, em, sub, sup, strike")) {
    return el.innerText.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
  }
  return html;
}

function writeBody(el, value) {
  const raw = String(value || "");
  if (RICH_RE.test(raw)) el.innerHTML = sanitizeBody(raw);
  else el.innerHTML = raw ? esc(raw).replace(/\n/g, "<br>") : "";
  el.classList.toggle("is-empty", !plainBody(raw).trim() && !el.querySelector("img"));
}

function sanitizeBody(html) {
  const raw = String(html || "");
  if (!RICH_RE.test(raw) && !/<(div|p|br)\b/i.test(raw)) return raw;
  const box = document.createElement("div");
  box.innerHTML = raw;
  const nodes = [...box.querySelectorAll("*")];
  for (const el of nodes) {
    if (!el.parentNode) continue;
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") || "";
      if (!/^data:image\/(jpeg|png|webp);base64,/i.test(src)) {
        el.remove();
        continue;
      }
      const align = ["align-left", "align-center", "align-right", "align-full"].find((name) => el.classList.contains(name)) || "align-center";
      el.className = `note-img ${align}`;
      [...el.attributes].forEach((attr) => {
        if (attr.name !== "src" && attr.name !== "class" && attr.name !== "alt") el.removeAttribute(attr.name);
      });
      el.setAttribute("alt", "");
      continue;
    }
    if (el.tagName === "BR") continue;
    if (el.tagName === "SPAN") {
      const classes = [...el.classList].filter((name) => FMT_CLASS.test(name));
      if (!classes.length) {
        unwrapNode(el);
        continue;
      }
      el.className = classes.join(" ");
      [...el.attributes].forEach((attr) => {
        if (attr.name !== "class") el.removeAttribute(attr.name);
      });
      continue;
    }
    if (el.tagName === "DIV" || el.tagName === "P") {
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
      continue;
    }
    if (KEEP_TAGS.has(el.tagName)) {
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
      continue;
    }
    unwrapNode(el);
  }
  return box.innerHTML;
}

function unwrapNode(node) {
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  node.remove();
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
  el.classList.toggle("is-empty", !plainBody(draft.body).trim() && !el.querySelector("img"));
  paintPreview();
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
      if (![...node.classList].some((name) => FMT_CLASS.test(name))) unwrapNode(node);
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

function lineSpanFrom(el) {
  const sel = document.getSelection();
  let range = savedRange;
  if (sel?.rangeCount && el.contains(sel.anchorNode)) range = sel.getRangeAt(0);
  const lines = el.innerText.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const last = Math.max(0, lines.length - 1);
  if (!range) return [0, last];
  try {
    const beforeStart = document.createRange();
    beforeStart.selectNodeContents(el);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const beforeEnd = document.createRange();
    beforeEnd.selectNodeContents(el);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    const start = beforeStart.toString().split("\n").length - 1;
    const end = beforeEnd.toString().split("\n").length - 1;
    return [Math.max(0, Math.min(start, end, last)), Math.max(0, Math.min(Math.max(start, end), last))];
  } catch {
    return [0, last];
  }
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
  const el = drawerEl.querySelector(".body-input");
  const before = el.innerText.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const [from, to] = lineSpanFrom(el);
  normalizeBlocks(el);
  const nodes = lineBlocks(el);
  const lines = nodes ? nodes.map((node) => node.innerText.replace(/\n/g, "")) : before;
  const same = nodes && (nodes.length === before.length || nodes.length === lines.length);
  const source = same ? lines : before;
  const start = Math.max(0, Math.min(from, source.length - 1));
  const end = Math.max(start, Math.min(to, source.length - 1));
  const next = rewriteListLines(source, start, end, type);
  if (nodes && nodes.length === source.length) {
    for (let i = start; i <= end; i += 1) setLineText(nodes[i], source[i], next[i]);
  } else {
    writeBody(el, next.join("\n"));
  }
  commitBody();
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

const CHECK_MIN = 72;
const CHECK_MAX = 420;

function clampCheck(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 132;
  return Math.min(CHECK_MAX, Math.max(CHECK_MIN, Math.round(n)));
}

function bindCheckResize() {
  const handle = drawerEl.querySelector("[data-check-split]");
  if (!handle || handle.dataset.bound) return;
  handle.dataset.bound = "1";
  handle.addEventListener("pointerdown", (event) => {
    const main = drawerEl.querySelector(".editor-main");
    const card = drawerEl.querySelector(".check-card");
    if (!main?.classList.contains("has-checks") || !card || document.body.classList.contains("is-keyboard")) return;
    event.preventDefault();
    const startY = event.clientY;
    const startH = card.getBoundingClientRect().height;
    const style = getComputedStyle(main);
    const inner = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const max = Math.max(CHECK_MIN, Math.min(CHECK_MAX, inner - 48 - 140 - 68 - 22 - 32));
    const move = (nextEvent) => {
      const height = Math.round(Math.min(max, Math.max(CHECK_MIN, startH + (startY - nextEvent.clientY))));
      draft.checkHeight = height;
      main.style.setProperty("--check-h", `${height}px`);
    };
    const stop = () => {
      handle.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  });
}

function paintPreview() {
  const preview = drawerEl.querySelector(".body-preview");
  const progressEl = drawerEl.querySelector(".editor-progress");
  if (!preview) return;
  const checks = renderBody(draft.body, { checksOnly: true });
  const hasChecks = Boolean(checks) && !checks.includes("body-empty");
  preview.innerHTML = hasChecks ? checks : "";
  const main = drawerEl.querySelector(".editor-main");
  main?.classList.toggle("has-checks", hasChecks);
  if (main) main.style.setProperty("--check-h", `${clampCheck(draft?.checkHeight)}px`);
  if (!progressEl) return;
  const progress = checklistProgress(draft.body);
  progressEl.hidden = false;
  progressEl.innerHTML = progress ? progressBadgeHtml(progress) : "";
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
  const pin = drawerEl.querySelector("[data-pin-input]");
  title.value = draft.title;
  writeBody(body, draft.body);
  drawerEl.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
  });
  pin.checked = draft.pinned;
  const showStatus = draft.kind === "task" || draft.kind === "wish";
  statusRow.hidden = !showStatus;
  const priorityRow = drawerEl.querySelector(".priority-row");
  if (priorityRow) priorityRow.hidden = draft.kind !== "wish";
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
  paintPreview();
}

export function openEditor(id, preset = {}) {
  const existing = id ? getState().entries.find((entry) => entry.id === id) : null;
  draft = existing ? structuredClone(existing) : blank(preset);
  snapshot = JSON.stringify(draft);
  textTool = "";
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
    openWhenPicker();
    return;
  }
  saved.textStyle = textStyle();
  if (Number.isFinite(Number(saved.checkHeight))) saved.checkHeight = clampCheck(saved.checkHeight);
  else delete saved.checkHeight;
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

let whenPick = null;

function paintDateLabel() {
  const button = drawerEl.querySelector("[data-pick-date]");
  const clear = drawerEl.querySelector("[data-clear-date]");
  if (!button || !draft) return;
  const hidden = draft.kind === "wish";
  button.hidden = hidden;
  const hasWhen = Number.isFinite(draft.when) && !hidden;
  if (clear) clear.hidden = !hasWhen;
  if (!hasWhen) {
    button.textContent = "Дата";
    return;
  }
  const date = new Date(draft.when);
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date).replace(".", "");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  button.textContent = `${day}, ${hh}:${mm}`;
}

function openWhenPicker() {
  const base = Number.isFinite(draft.when) ? new Date(draft.when) : new Date();
  whenPick = {
    cursor: new Date(base.getFullYear(), base.getMonth(), 1).getTime(),
    day: new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime(),
    hour: base.getHours(),
    minute: base.getMinutes(),
    drag: "",
  };
  drawerEl.querySelector(".when-sheet").hidden = false;
  paintWhenPicker();
}

function closeWhenPicker() {
  whenPick = null;
  const sheet = drawerEl.querySelector(".when-sheet");
  if (sheet) sheet.hidden = true;
}

function paintMonth() {
  const cursor = new Date(whenPick.cursor);
  drawerEl.querySelector("[data-month-title]").textContent = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(cursor);
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

function paintClock() {
  const hourAngle = (whenPick.hour % 24) * 15 + whenPick.minute * 0.25;
  drawerEl.querySelector(".clock-hand.hour").style.transform = `rotate(${hourAngle}deg)`;
  drawerEl.querySelector(".clock-hand.minute").style.transform = `rotate(${whenPick.minute * 6}deg)`;
  const hh = String(whenPick.hour).padStart(2, "0");
  const mm = String(whenPick.minute).padStart(2, "0");
  drawerEl.querySelector(".when-clock-readout").textContent = `${hh}:${mm}`;
}

function paintWhenPicker() {
  if (!whenPick) return;
  paintMonth();
  paintClock();
}

function shiftClockHour(delta) {
  let hour = whenPick.hour + delta;
  const day = new Date(whenPick.day);
  while (hour >= 24) {
    hour -= 24;
    day.setDate(day.getDate() + 1);
  }
  while (hour < 0) {
    hour += 24;
    day.setDate(day.getDate() - 1);
  }
  day.setHours(0, 0, 0, 0);
  whenPick.hour = hour;
  whenPick.day = day.getTime();
  whenPick.cursor = new Date(day.getFullYear(), day.getMonth(), 1).getTime();
}

function commitWhen() {
  const date = new Date(whenPick.day);
  date.setHours(whenPick.hour, whenPick.minute, 0, 0);
  draft.when = date.getTime();
  paintDateLabel();
  closeWhenPicker();
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

function bindWhenPicker() {
  const sheet = drawerEl.querySelector(".when-sheet");
  const face = sheet.querySelector("[data-clock]");
  drawerEl.querySelector("[data-pick-date]").addEventListener("click", (event) => {
    event.stopPropagation();
    openWhenPicker();
  });
  sheet.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!whenPick) return;
    if (event.target.closest("[data-when-back]")) {
      commitWhen();
      return;
    }
    const shift = event.target.closest("[data-month]")?.dataset.month;
    if (shift) {
      const date = new Date(whenPick.cursor);
      date.setMonth(date.getMonth() + Number(shift));
      whenPick.cursor = date.getTime();
      paintMonth();
      return;
    }
    const day = event.target.closest("[data-day]")?.dataset.day;
    if (day) {
      whenPick.day = Number(day);
      const picked = new Date(whenPick.day);
      whenPick.cursor = new Date(picked.getFullYear(), picked.getMonth(), 1).getTime();
      paintWhenPicker();
    }
  });
  drawerEl.querySelector("[data-clear-date]").addEventListener("click", (event) => {
    event.stopPropagation();
    delete draft.when;
    paintDateLabel();
  });
  const pickHand = (point) => {
    const hourAngle = (whenPick.hour % 24) * 15 + whenPick.minute * 0.25;
    const minuteAngle = whenPick.minute * 6;
    const nearHour = angleDist(point.deg, hourAngle);
    const nearMinute = angleDist(point.deg, minuteAngle);
    if (point.radius < 0.58 && nearHour <= nearMinute + 10) return "hour";
    if (nearMinute + 6 < nearHour) return "minute";
    return point.radius < 0.62 ? "hour" : "minute";
  };
  const moveHand = (event) => {
    if (!whenPick || !whenPick.drag) return;
    const point = clockPoint(event, face);
    if (whenPick.drag === "hour") {
      const next = Math.round(point.deg / 15) % 24;
      shiftClockHour(shortDelta(next, whenPick.hour, 24));
    } else {
      const next = Math.round(point.deg / 6) % 60;
      const delta = shortDelta(next, whenPick.minute, 60);
      const raw = whenPick.minute + delta;
      if (raw >= 60) shiftClockHour(1);
      else if (raw < 0) shiftClockHour(-1);
      whenPick.minute = (raw + 60) % 60;
    }
    paintWhenPicker();
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
    const checkLine = event.target.closest("[data-check-line]")?.dataset.checkLine;
    if (checkLine != null && event.target.closest(".body-preview")) {
      draft.body = toggleCheckLine(draft.body, Number(checkLine));
      writeBody(drawerEl.querySelector(".body-input"), draft.body);
      paintPreview();
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
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      drawerEl.querySelector(".drawer")?.classList.add("is-settings");
      return;
    }
    if (event.target.closest("[data-settings-back]")) {
      drawerEl.querySelector(".drawer")?.classList.remove("is-settings");
      return;
    }
    if (event.target.closest("[data-done]")) finishEditor();
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
  bindCheckResize();
  drawerEl.querySelector(".text-dock").addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-image-add]")) return;
    if (event.target.closest("button")) event.preventDefault();
  });
  document.addEventListener("selectionchange", rememberRange);
  bodyInput.addEventListener("input", () => {
    draft.body = readBody(bodyInput);
    bodyInput.classList.toggle("is-empty", !plainBody(draft.body).trim() && !bodyInput.querySelector("img"));
    paintPreview();
  });
  bodyInput.addEventListener("click", (event) => {
    bodyInput.querySelectorAll("img.is-picked").forEach((node) => node.classList.remove("is-picked"));
    const img = event.target.closest("img.note-img");
    pickedImage = img || null;
    if (img) img.classList.add("is-picked");
  });
  bodyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveDraft();
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
  drawerEl.querySelector("[data-pin-input]").addEventListener("change", (event) => {
    draft.pinned = event.target.checked;
  });
  bindWhenPicker();
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
    <div class="drawer editor-sheet" role="dialog" aria-modal="true" aria-labelledby="editor-label">
      <div class="editor-main">
        <div class="editor-top">
          <button type="button" class="icon-btn" data-done aria-label="Сохранить и закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5 8 12l7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="editor-top-side">
            <button type="button" class="date-clear" data-clear-date hidden aria-label="Убрать дату">×</button>
            <button type="button" class="date-plain" data-pick-date>Дата</button>
            <button type="button" class="icon-btn" data-settings aria-label="Настройки записи">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3V21M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12H21M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6"/></svg>
            </button>
          </div>
        </div>
        <section class="text-card">
          <input class="title-input" type="text" maxlength="140" placeholder="Название" aria-label="Название" />
          <p class="field-error" id="editor-label"></p>
          <div class="body-input is-empty" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Текст" aria-label="Текст"></div>
          <input type="file" accept="image/*" hidden data-image-file>
          <div class="text-dock" aria-label="Настройки текста">
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
        <div class="check-split" data-check-split role="separator" aria-orientation="horizontal" aria-label="Высота чеклиста"><span></span></div>
        <section class="check-card" aria-label="Чеклист">
          <div class="body-preview body-render" aria-live="polite"></div>
        </section>
        <div class="editor-progress"></div>
      </div>
      <div class="editor-settings">
        <button type="button" class="back" data-settings-back>К записи</button>
        <p class="field-error"></p>
        <p class="hint">Тип</p>
        <div class="segmented">
          <button type="button" class="chip" data-kind="note">Заметка</button>
          <button type="button" class="chip" data-kind="task">Задача</button>
          <button type="button" class="chip" data-kind="event">Событие</button>
          <button type="button" class="chip" data-kind="wish">Желание</button>
        </div>
        <div class="status-row">
          <p class="hint">Активность</p>
          <div class="segmented" aria-label="Статус">
            <button type="button" class="chip" data-status-set="open">Открыта</button>
            <button type="button" class="chip" data-status-set="focus">В фокусе</button>
            <button type="button" class="chip" data-status-set="done">Готово</button>
          </div>
        </div>
        <div class="priority-row" hidden>
          <p class="hint">Сила желания</p>
          <div class="segmented" aria-label="Сила желания">
            <button type="button" class="chip" data-priority="1">Тихо</button>
            <button type="button" class="chip" data-priority="2">Живо</button>
            <button type="button" class="chip" data-priority="3">Сильно</button>
          </div>
        </div>
        <p class="hint">Метки — это орбиты</p>
        <div class="tag-editor">
          <div class="chips"></div>
          <input class="tag-input" type="text" maxlength="32" placeholder="метка и Enter" aria-label="Новая метка" />
        </div>
        <label class="check"><input type="checkbox" data-pin-input /> Закрепить в архиве</label>
        <div class="settings-extra">
          <button type="button" class="btn ghost" data-constellation>В созвездие</button>
          <button type="button" class="btn danger" data-delete>Удалить</button>
        </div>
      </div>
      <div class="when-sheet" hidden>
        <button type="button" class="date-plain when-back" data-when-back>Назад</button>
        <div class="when-day">
          <div class="when-month">
            <button type="button" class="date-plain" data-month="-1" aria-label="Предыдущий месяц">‹</button>
            <span data-month-title></span>
            <button type="button" class="date-plain" data-month="1" aria-label="Следующий месяц">›</button>
          </div>
          <div class="when-week">${["пн","вт","ср","чт","пт","сб","вс"].map((day) => `<span>${day}</span>`).join("")}</div>
          <div class="when-grid"></div>
        </div>
        <div class="when-clock">
          <p class="when-clock-readout">00:00</p>
          <div class="clock-face" data-clock>
            ${Array.from({ length: 24 }, (_, index) => `<span class="clock-tick" style="transform: rotate(${index * 15}deg)"><i></i></span>`).join("")}
            <div class="clock-hand hour"></div>
            <div class="clock-hand minute"></div>
            <i class="clock-cap"></i>
          </div>
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
