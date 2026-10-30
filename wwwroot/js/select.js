/**
 * Выбор записей удержанием и удаление нескольких сразу.
 * Удержание на карточке включает режим выбора и отмечает её, дальше тапы отмечают
 * и снимают карточки. Внизу — панель «отмена · сколько выбрано · удалить».
 * Режим живёт в одном списке за раз; «назад», Escape и смена вкладки его снимают.
 */
import { feedback } from "./feedback.js";
import { update } from "./store.js";
import { confirmDialog, icons, toast } from "./ui.js";

const HOLD_MS = 450;

let session = null;
let bar = null;

function plural(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записей";
}

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement("div");
  bar.className = "select-bar";
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" class="icon-btn" data-select-cancel aria-label="Отменить выбор">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l10 10M17 7 7 17" stroke-linecap="round"/></svg>
    </button>
    <span class="select-count"></span>
    <button type="button" class="icon-btn is-danger" data-select-delete aria-label="Удалить выбранные">${icons.trash}</button>`;
  bar.addEventListener("click", (event) => {
    if (event.target.closest("[data-select-cancel]")) clearSelection();
    else if (event.target.closest("[data-select-delete]")) deleteSelected();
  });
  document.body.append(bar);
  return bar;
}

function markItems() {
  if (!session) return;
  session.container.querySelectorAll(session.item).forEach((el) => {
    el.classList.toggle("is-picked-item", session.ids.has(session.idOf(el)));
  });
}

function paint() {
  ensureBar();
  document.body.classList.toggle("is-selecting", Boolean(session));
  bar.hidden = !session;
  if (!session) return;
  bar.querySelector(".select-count").textContent = `Выбрано: ${session.ids.size}`;
  markItems();
}

function toggle(id) {
  if (!session || !id) return;
  if (session.ids.has(id)) session.ids.delete(id);
  else session.ids.add(id);
  if (!session.ids.size) {
    clearSelection();
    return;
  }
  paint();
}

export function isSelecting() {
  return Boolean(session);
}

export function clearSelection() {
  if (!session) return;
  const { container, item } = session;
  session = null;
  container.querySelectorAll(item).forEach((el) => el.classList.remove("is-picked-item"));
  paint();
}

async function deleteSelected() {
  if (!session) return;
  const ids = new Set(session.ids);
  const ok = await confirmDialog({
    title: `Удалить ${ids.size} ${plural(ids.size)}?`,
    text: "Записи исчезнут из архива, календаря и созвездия.",
    confirmLabel: "Удалить",
    danger: true,
  });
  if (!ok) return;
  clearSelection();
  update((state) => {
    state.entries = state.entries.filter((entry) => !ids.has(entry.id));
    return state;
  });
  toast(`Удалено: ${ids.size}`);
}

/**
 * Подключает выбор к списку. item — селектор карточки, idOf — как достать id записи.
 * Список может перерисовываться: отметки восстанавливаются сами.
 */
export function attachSelection(container, { item, idOf = (el) => el.dataset.id }) {
  let press = null;
  let swallowClick = false;

  container.addEventListener("pointerdown", (event) => {
    const el = event.target.closest(item);
    if (!el || !container.contains(el) || event.button > 0) return;
    const current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, fired: false, timer: 0 };
    current.timer = setTimeout(() => {
      current.fired = true;
      if (session && session.container !== container) clearSelection();
      if (!session) session = { container, item, idOf, ids: new Set() };
      toggle(idOf(el));
      feedback("hold");
    }, HOLD_MS);
    press = current;
  });
  container.addEventListener("pointermove", (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
      clearTimeout(press.timer);
      press = null;
    }
  });
  const release = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    clearTimeout(press.timer);
    if (press.fired) swallowClick = true;
    press = null;
  };
  container.addEventListener("pointerup", release);
  container.addEventListener("pointercancel", release);
  container.addEventListener("contextmenu", (event) => {
    if (event.target.closest(item)) event.preventDefault();
  });
  // В режиме выбора тап отмечает карточку вместо обычного действия (открыть, закрепить…).
  container.addEventListener("click", (event) => {
    if (swallowClick) {
      swallowClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!session || session.container !== container) return;
    const el = event.target.closest(item);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (el) toggle(idOf(el));
  }, true);
  new MutationObserver(() => {
    if (session?.container === container) markItems();
  }).observe(container, { childList: true, subtree: true });
}
