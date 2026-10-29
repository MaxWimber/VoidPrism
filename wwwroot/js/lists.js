const BULLET_RE = /^(\s*)([-*•])\s+(.*)$/;
const CHECK_RE = /^(\s*)(?:[-*•]\s+)?\[([ xX])\]\s+(.*)$/;
const NUMBER_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;

export function parseLine(line) {
  const check = line.match(CHECK_RE);
  if (check) {
    return { type: "check", indent: check[1], done: check[2].toLowerCase() === "x", text: check[3] };
  }
  const numbered = line.match(NUMBER_RE);
  if (numbered) {
    return { type: "number", indent: numbered[1], n: Number(numbered[2]), text: numbered[3] };
  }
  const bullet = line.match(BULLET_RE);
  if (bullet) {
    return { type: "bullet", indent: bullet[1], text: bullet[3] };
  }
  return { type: "text", indent: "", text: line };
}

export function plainBody(body) {
  const raw = String(body || "");
  if (!/<[a-z!]/i.test(raw)) return raw.replace(/\r\n/g, "\n");
  const box = document.createElement("div");
  box.innerHTML = raw;
  return box.innerText.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
}

function prefixFor(type, n = 1) {
  if (type === "bullet") return "- ";
  if (type === "number") return `${n}. `;
  if (type === "check") return "- [ ] ";
  return "";
}

function stripPrefix(line) {
  const parsed = parseLine(line);
  if (parsed.type === "text") return line;
  return parsed.text;
}

function selectionLines(textarea) {
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd < 0) lineEnd = value.length;
  if (end > lineStart && value[end - 1] === "\n") lineEnd = end - 1;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.length ? block.split("\n") : [""];
  return { value, start, end, lineStart, lineEnd, lines };
}

export function toggleList(textarea, type) {
  const { value, lineStart, lineEnd, lines } = selectionLines(textarea);
  const allSame = lines.every((line) => parseLine(line).type === type);
  let nextN = 1;
  const before = value.slice(0, lineStart);
  const numberedBefore = before.split("\n").reverse().find((line) => parseLine(line).type === "number");
  if (numberedBefore) nextN = parseLine(numberedBefore).n + 1;

  const nextLines = lines.map((line, index) => {
    if (allSame) return stripPrefix(line);
    const text = stripPrefix(line);
    if (type === "number") return `${prefixFor("number", nextN + index)}${text}`;
    return `${prefixFor(type)}${text}`;
  });

  const joined = nextLines.join("\n");
  textarea.value = value.slice(0, lineStart) + joined + value.slice(lineEnd);
  const cursor = lineStart + joined.length;
  textarea.setSelectionRange(cursor, cursor);
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function rewriteListLines(allLines, from, to, type) {
  const start = Math.max(0, from);
  const end = Math.min(allLines.length - 1, to);
  const lines = allLines.slice(start, end + 1);
  const allSame = lines.length > 0 && lines.every((line) => parseLine(line).type === type);
  let nextN = 1;
  const numberedBefore = allLines.slice(0, start).reverse().find((line) => parseLine(line).type === "number");
  if (numberedBefore) nextN = parseLine(numberedBefore).n + 1;
  const next = lines.map((line, index) => {
    if (allSame) return stripPrefix(line);
    const text = stripPrefix(line);
    if (type === "number") return `${prefixFor("number", nextN + index)}${text}`;
    return `${prefixFor(type)}${text}`;
  });
  return allLines.slice(0, start).concat(next, allLines.slice(end + 1));
}

export function listEnterInsert(line) {
  const parsed = parseLine(line);
  if (parsed.type === "text") return null;
  if (!parsed.text.trim()) return "";
  if (parsed.type === "bullet") return `${parsed.indent}- `;
  if (parsed.type === "check") return `${parsed.indent}- [ ] `;
  if (parsed.type === "number") return `${parsed.indent}${parsed.n + 1}. `;
  return null;
}

export function handleListEnter(textarea, event) {
  if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const line = value.slice(lineStart, start);
  const parsed = parseLine(line);
  if (parsed.type === "text") return false;

  event.preventDefault();

  if (!parsed.text.trim()) {
    textarea.value = value.slice(0, lineStart) + value.slice(start);
    textarea.setSelectionRange(lineStart, lineStart);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  let insert = "\n";
  if (parsed.type === "bullet") insert += `${parsed.indent}- `;
  else if (parsed.type === "check") insert += `${parsed.indent}- [ ] `;
  else if (parsed.type === "number") insert += `${parsed.indent}${parsed.n + 1}. `;

  textarea.value = value.slice(0, start) + insert + value.slice(start);
  const pos = start + insert.length;
  textarea.setSelectionRange(pos, pos);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function isListType(type) {
  return type === "bullet" || type === "check" || type === "number";
}

function sameListFamily(a, b) {
  if (a === "number") return b === "number";
  return (a === "bullet" || a === "check") && (b === "bullet" || b === "check");
}

export function renderBody(body, { compact = false, checksOnly = false } = {}) {
  const lines = plainBody(body).split("\n");
  if (!lines.length || (lines.length === 1 && !lines[0].trim())) {
    return compact ? "" : `<p class="body-empty">Пустая запись</p>`;
  }

  const parts = [];
  let i = 0;
  let plainBudget = compact ? 3 : Infinity;
  let listBudget = compact ? 4 : Infinity;

  while (i < lines.length) {
    const parsed = parseLine(lines[i]);
    if (checksOnly && parsed.type !== "check") {
      i += 1;
      continue;
    }
    if (isListType(parsed.type)) {
      if (listBudget <= 0) {
        parts.push(`<p class="body-more">…</p>`);
        break;
      }
      const kind = parsed.type === "number" ? "ol" : "ul";
      const collected = [];
      while (i < lines.length) {
        const item = parseLine(lines[i]);
        if (checksOnly && item.type !== "check") break;
        if (!isListType(item.type) || !sameListFamily(parsed.type, item.type)) break;
        collected.push({ ...item, lineIndex: i });
        i += 1;
      }
      const hasCheck = collected.some((item) => item.type === "check");
      const cls = parsed.type === "number" ? " body-numbers" : hasCheck ? " body-checklist" : " body-bullets";
      const limit = Number.isFinite(listBudget) ? listBudget : collected.length;
      const visible = collected.slice(0, limit);
      if (Number.isFinite(listBudget)) listBudget -= visible.length;
      const items = visible.map((item) => {
        if (item.type === "check") {
          return `<li class="check-item ${item.done ? "is-done" : ""}" data-check-line="${item.lineIndex}"><span class="check-box" aria-hidden="true"></span><span>${esc(item.text)}</span></li>`;
        }
        return `<li>${esc(item.text)}</li>`;
      });
      if (collected.length > visible.length) items.push(`<li class="body-more">…</li>`);
      parts.push(`<${kind} class="body-list${cls}">${items.join("")}</${kind}>`);
      continue;
    }

    const chunk = [];
    while (i < lines.length && parseLine(lines[i]).type === "text") {
      chunk.push(lines[i]);
      i += 1;
    }
    const text = chunk.join("\n").trimEnd();
    if (!text.trim()) continue;
    if (plainBudget <= 0) {
      parts.push(`<p class="body-more">…</p>`);
      break;
    }
    plainBudget -= 1;
    parts.push(`<p>${esc(text).replace(/\n/g, "<br>")}</p>`);
  }

  return parts.join("") || (compact ? "" : `<p class="body-empty">Пустая запись</p>`);
}

export function plainExcerpt(body) {
  return plainBody(body)
    .replace(/^(\s*)(?:[-*•]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toggleCheckLine(body, lineIndex) {
  const lines = plainBody(body).split("\n");
  const line = lines[lineIndex];
  if (line == null) return body;
  const parsed = parseLine(line);
  if (parsed.type !== "check") return body;
  const next = `${parsed.indent}- [${parsed.done ? " " : "x"}] ${parsed.text}`;
  if (!/<[a-z!]/i.test(String(body || ""))) {
    lines[lineIndex] = next;
    return lines.join("\n");
  }
  const box = document.createElement("div");
  box.innerHTML = body;
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue.includes(line)) {
      node.nodeValue = node.nodeValue.replace(line, next);
      return box.innerHTML;
    }
    node = walker.nextNode();
  }
  lines[lineIndex] = next;
  return lines.join("\n");
}

// --- Блоки чеклистов внутри текста заметки ---
// Хранятся так: <div class="checklist"><div class="check-row is-done">текст</div>…</div>.
// Старый формат строк «- [x] текст» по-прежнему читается (карточки, прогресс),
// а в редакторе превращается в блок.

const CHECKLIST_RE = /class="checklist"/i;

export function hasChecklistBlocks(body) {
  return CHECKLIST_RE.test(String(body || ""));
}

export function checklistHtml(items) {
  const rows = items.map((item) => `<div class="check-row${item.done ? " is-done" : ""}">${esc(item.text)}</div>`);
  return `<div class="checklist">${rows.join("")}</div>`;
}

export function toggleCheckRow(body, rowIndex) {
  const box = document.createElement("div");
  box.innerHTML = String(body || "");
  const row = box.querySelectorAll(".checklist .check-row")[rowIndex];
  if (!row) return body;
  row.classList.toggle("is-done");
  return box.innerHTML;
}

export function checklistProgress(body) {
  let total = 0;
  let done = 0;
  let text = plainBody(body);
  if (hasChecklistBlocks(body)) {
    const box = document.createElement("div");
    box.innerHTML = String(body);
    for (const row of box.querySelectorAll(".checklist .check-row")) {
      total += 1;
      if (row.classList.contains("is-done")) done += 1;
    }
    box.querySelectorAll(".checklist").forEach((list) => list.remove());
    text = box.textContent;
  }
  for (const line of text.split("\n")) {
    const parsed = parseLine(line);
    if (parsed.type !== "check") continue;
    total += 1;
    if (parsed.done) done += 1;
  }
  if (!total) return null;
  const ratio = done / total;
  return {
    total,
    done,
    ratio,
    percent: Math.round(ratio * 100),
  };
}

export function aggregateChecklistProgress(entries) {
  let total = 0;
  let done = 0;
  for (const entry of entries || []) {
    const progress = checklistProgress(entry.body);
    if (!progress) continue;
    total += progress.total;
    done += progress.done;
  }
  if (!total) return null;
  const ratio = done / total;
  return {
    total,
    done,
    ratio,
    percent: Math.round(ratio * 100),
  };
}

// --- Форматированный текст заметки (HTML из редактора) ---

const FMT_CLASS = /^(fmt-bold|fmt-italic|fmt-strike|fmt-u-solid|fmt-u-dash|fmt-u-wave|fmt-u-double|fmt-sub|fmt-sup|fmt-face-sans|fmt-face-display|fmt-face-serif|fmt-size-s|fmt-size-m|fmt-size-l|fmt-c-cyan|fmt-c-violet|fmt-c-rose|fmt-c-amber|fmt-c-mint|fmt-c-ink)$/;
const KEEP_TAGS = new Set(["SPAN", "IMG", "BR", "DIV", "P", "B", "STRONG", "I", "EM", "S", "STRIKE", "U", "SUB", "SUP"]);
export const RICH_RE = /<(span|img|b|i|u|s|strong|em|sub|sup|strike)\b|class="checklist"/i;
export const RICH_SELECTOR = "span, img, b, i, u, s, strong, em, sub, sup, strike, .checklist";

export function isFormatClass(name) {
  return FMT_CLASS.test(name);
}

export function unwrapNode(node) {
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  node.remove();
}

function stripAttributes(el, keep = []) {
  [...el.attributes].forEach((attr) => {
    if (!keep.includes(attr.name)) el.removeAttribute(attr.name);
  });
}

export function sanitizeBody(html) {
  const raw = String(html || "");
  if (!RICH_RE.test(raw) && !/<(div|p|br)\b/i.test(raw)) return raw;
  const box = document.createElement("div");
  box.innerHTML = raw;
  box.querySelectorAll("[data-ui]").forEach((el) => el.remove());
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
      stripAttributes(el, ["src", "class", "alt"]);
      el.setAttribute("alt", "");
      continue;
    }
    if (el.tagName === "BR") continue;
    if (el.tagName === "SPAN") {
      const classes = [...el.classList].filter(isFormatClass);
      if (!classes.length) {
        unwrapNode(el);
        continue;
      }
      el.className = classes.join(" ");
      stripAttributes(el, ["class"]);
      continue;
    }
    if (el.tagName === "DIV" && el.classList.contains("checklist")) {
      el.className = "checklist";
      stripAttributes(el, ["class"]);
      continue;
    }
    if (el.tagName === "DIV" && el.classList.contains("check-row")) {
      el.className = el.classList.contains("is-done") ? "check-row is-done" : "check-row";
      stripAttributes(el, ["class"]);
      continue;
    }
    if (KEEP_TAGS.has(el.tagName)) {
      stripAttributes(el);
      continue;
    }
    unwrapNode(el);
  }
  box.querySelectorAll(".checklist .check-row").forEach((row) => {
    if (!row.textContent.trim() && !row.querySelector("img")) row.remove();
  });
  box.querySelectorAll(".checklist").forEach((list) => {
    if (!list.querySelector(".check-row")) list.remove();
  });
  return box.innerHTML;
}

/** HTML тела заметки для карточек: форматированный текст как есть, обычный — через renderBody. */
export function cardBodyHtml(body) {
  const raw = String(body || "");
  if (!RICH_RE.test(raw)) return renderBody(raw, { compact: true });
  return sanitizeBody(raw);
}

function polar(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/** SVG-дуга прогресса (0–100). angle от -90° (сверху). */
export function progressArc(cx, cy, radius, percent, { width = 3, className = "progress-arc" } = {}) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const start = polar(cx, cy, radius, -Math.PI / 2);
  if (value <= 0) {
    return `<circle class="${className}-track" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke-width="${width}" />`;
  }
  if (value >= 100) {
    return `
      <circle class="${className}-track" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke-width="${width}" />
      <circle class="${className}" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke-width="${width}" />`;
  }
  const angle = -Math.PI / 2 + (value / 100) * Math.PI * 2;
  const end = polar(cx, cy, radius, angle);
  const large = value > 50 ? 1 : 0;
  return `
    <circle class="${className}-track" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke-width="${width}" />
    <path class="${className}" d="M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}" fill="none" stroke-width="${width}" stroke-linecap="round" />`;
}

export function progressBadgeHtml(progress, { compact = false } = {}) {
  if (!progress) return "";
  const r = compact ? 16 : 20;
  const size = r * 2 + 8;
  const cx = size / 2;
  const cy = size / 2;
  const tone = progress.percent >= 100 ? "is-complete" : progress.percent >= 50 ? "is-mid" : "is-low";
  return `
    <div class="progress-badge ${tone}" title="${progress.done} из ${progress.total}">
      <svg class="progress-badge-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        ${progressArc(cx, cy, r, progress.percent, { width: compact ? 3 : 3.5, className: "badge-arc" })}
      </svg>
      <div class="progress-badge-copy">
        <strong>${progress.percent}%</strong>
        ${compact ? "" : `<span>${progress.done}/${progress.total}</span>`}
      </div>
      <div class="progress-bar" aria-hidden="true"><i style="width:${progress.percent}%"></i></div>
    </div>`;
}
