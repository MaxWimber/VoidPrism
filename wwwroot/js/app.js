import { bridge } from "./bridge.js";
import * as archive from "./archive.js";
import * as calendar from "./calendar.js";
import * as canvas from "./canvas.js";
import * as constellation from "./constellation.js";
import * as settings from "./settings.js";
import * as studio from "./studio.js";
import * as wishlist from "./wishlist.js";
import { isMobileApp } from "./platform.js";
import { clearSelection, isSelecting } from "./select.js";
import { bootstrap, getState, subscribe } from "./store.js";
import { dismissModal, icons, isModalOpen, isTyping, startOfDay, toast } from "./ui.js";

const app = document.querySelector("#app");
const mobile = isMobileApp();

function bootStars() {
  const canvasEl = document.getElementById("stars");
  const ctx = canvasEl.getContext("2d");
  const dpr = () => (mobile ? Math.min(window.devicePixelRatio || 1, 2) : window.devicePixelRatio || 1);
  const stars = Array.from({ length: mobile ? 80 : 140 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * (mobile ? 1.2 : 1.3) + 0.2,
    a: Math.random() * (mobile ? 0.5 : 0.55) + 0.2,
    tw: Math.random() * Math.PI * 2,
    s: Math.random() * 0.8 + 0.2,
  }));
  const resize = () => {
    const ratio = dpr();
    canvasEl.width = window.innerWidth * ratio;
    canvasEl.height = window.innerHeight * ratio;
  };
  resize();
  window.addEventListener("resize", resize);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frame = (time) => {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    for (const star of stars) {
      const twinkle = reduced ? 1 : 0.55 + Math.sin(time / 1000 * star.s + star.tw) * 0.45;
      ctx.globalAlpha = star.a * twinkle;
      ctx.fillStyle = "#e7eeff";
      ctx.beginPath();
      ctx.arc(star.x * canvasEl.width, star.y * canvasEl.height, star.r * dpr(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduced) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function desktopShell() {
  app.innerHTML = `
    <nav class="nav">
      <a class="brand" href="/" aria-label="VoidPrism">
        <span class="brand-mark"></span>
        <small>Void</small>
      </a>
      <button type="button" class="nav-btn" data-view="constellation" aria-label="Созвездие" title="Созвездие">${icons.star}</button>
      <button type="button" class="nav-btn" data-view="archive" aria-label="Архив" title="Архив">${icons.archive}</button>
      <button type="button" class="nav-btn" data-view="calendar" aria-label="Календарь" title="Календарь">${icons.calendar}</button>
      <button type="button" class="nav-btn" data-view="wishlist" aria-label="Желания" title="Желания">${icons.wish}</button>
      <button type="button" class="nav-btn" data-view="studio" aria-label="Студия" title="Студия">${icons.studio}</button>
      <div class="nav-spacer"></div>
      <button type="button" class="nav-btn" data-view="settings" aria-label="Настройки" title="Настройки">${icons.gear}</button>
    </nav>
    <main class="stage"></main>`;
}

function mobileShell() {
  app.innerHTML = `
    <main class="stage"></main>
    <nav class="nav nav-bottom" aria-label="Разделы">
      <button type="button" class="nav-btn" data-view="constellation" aria-label="Звёзды" title="Звёзды">${icons.star}</button>
      <button type="button" class="nav-btn" data-view="archive" aria-label="Архив" title="Архив">${icons.archive}</button>
      <button type="button" class="nav-btn" data-view="calendar" aria-label="Дни" title="Дни">${icons.calendar}</button>
      <button type="button" class="nav-btn" data-view="wishlist" aria-label="Желания" title="Желания">${icons.wish}</button>
      <button type="button" class="nav-btn" data-view="studio" aria-label="Студия" title="Студия">${icons.studio}</button>
      <button type="button" class="nav-btn" data-view="settings" aria-label="Настройки" title="Настройки">${icons.gear}</button>
    </nav>`;
}

let current = "constellation";
// Вкладки, по которым ходили: системный «назад» возвращает на предыдущую.
const visited = [];

function show(view, { fromBack = false } = {}) {
  clearSelection();
  if (!fromBack && shellReady && view !== current) {
    visited.push(current);
    if (visited.length > 30) visited.shift();
  }
  current = view;
  for (const button of app.querySelectorAll(".nav-btn")) {
    const on = button.dataset.view === view;
    button.classList.toggle("is-on", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  archive.setActive(view === "archive");
  constellation.setActive(view === "constellation");
  calendar.setActive(view === "calendar");
  wishlist.setActive(view === "wishlist");
  studio.setActive(view === "studio");
  settings.setActive(view === "settings");
}

function wire() {
  const stage = app.querySelector(".stage");
  constellation.mount(stage);
  archive.mount(stage);
  calendar.mount(stage);
  wishlist.mount(stage);
  studio.mount(stage);
  settings.mount(stage);
  app.querySelector(".nav").addEventListener("click", (event) => {
    const view = event.target.closest("[data-view]")?.dataset.view;
    if (!view) return;
    if (view === "constellation") constellation.closeSheet();
    show(view);
  });
  subscribe(() => {
    if (current === "archive") archive.render();
    if (current === "constellation") constellation.render();
    if (current === "calendar") calendar.render();
    if (current === "wishlist") wishlist.render();
    if (current === "settings") settings.render();
    canvas.refreshFromOutside();
  });
  window.addEventListener("keydown", (event) => {
    if (isModalOpen()) return;
    if (event.key === "Escape" && isSelecting()) {
      clearSelection();
      return;
    }
    if (archive.isEditorOpen() && event.key === "Escape") {
      archive.keydown(event);
      return;
    }
    if (isTyping(event.target) && event.key !== "Escape") return;
    if (current === "studio") studio.keydown(event);
    else if (current === "constellation") constellation.keydown(event);
    else if (current === "archive") archive.keydown(event);
    else if (current === "calendar") calendar.keydown(event);
    else if (current === "wishlist") wishlist.keydown(event);
  });
  window.addEventListener("keyup", (event) => {
    canvas.keyup(event);
    constellation.keyup(event);
  });
}

// Редактор записи — слой поверх текущего экрана: открывается там, где вы сейчас,
// и после закрытия вы остаётесь там же. Так «назад» проходит путь в обратном порядке.
bridge.openEntry = (id) => {
  archive.openEditor(id);
};

bridge.openWish = (id) => {
  archive.openEditor(id);
};

bridge.newWish = () => {
  archive.openEditor(null, { kind: "wish", tags: ["желания"] });
};

bridge.newEntry = (preset) => {
  archive.openEditor(null, preset);
};

bridge.afterCalendarSave = (id) => {
  if (current !== "calendar") return;
  const entry = getState().entries.find((item) => item.id === id);
  if (Number.isFinite(entry?.when)) calendar.focusDay(entry.when);
};

bridge.filterTag = (name) => {
  archive.filterTag(name);
  show("archive");
};

bridge.focusTheme = (name) => {
  constellation.focusTheme(name);
  show("constellation");
};

bridge.onError = (message) => toast(message);

// --- Android: открытие из виджетов, нижняя навигация, клавиатура ---

let shellReady = false;

function taskStampForDay(ts) {
  const base = new Date(ts || Date.now());
  const stamp = new Date(base.getFullYear(), base.getMonth(), base.getDate(), new Date().getHours(), 0, 0, 0);
  if (stamp.getTime() <= Date.now()) stamp.setHours(stamp.getHours() + 1);
  if (stamp.getDate() !== base.getDate()) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 0, 0, 0).getTime();
  }
  return stamp.getTime();
}

function applyWidgetOpen(payload) {
  if (!payload?.open) return;
  if (payload.open === "day") {
    show("calendar");
    calendar.openDay(payload.when || Date.now());
    return;
  }
  if (payload.open === "edit" && payload.id) {
    const entry = getState().entries.find((item) => item.id === payload.id);
    if (entry?.kind === "wish") show("wishlist");
    else show("archive");
    archive.openEditor(payload.id);
    return;
  }
  if (payload.open === "new-task") {
    show("archive");
    archive.openEditor(null, { kind: "task", when: taskStampForDay(payload.when || startOfDay(Date.now())) });
  }
}

function syncNavHeight() {
  const nav = app.querySelector(".nav-bottom");
  if (!nav) return;
  const height = Math.ceil(nav.getBoundingClientRect().height);
  if (height <= 0) return;
  const next = `${height}px`;
  if (document.documentElement.style.getPropertyValue("--nav-block").trim() === next) return;
  document.documentElement.style.setProperty("--nav-block", next);
}

function syncKeyboard() {
  const view = window.visualViewport;
  const ime = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ime")) || 0;
  const fromView = view ? Math.max(0, window.innerHeight - view.height - view.offsetTop) : 0;
  const keyboard = Math.max(ime, fromView);
  const next = `${Math.round(keyboard)}px`;
  if (document.documentElement.style.getPropertyValue("--keyboard").trim() !== next) {
    document.documentElement.style.setProperty("--keyboard", next);
  }
  document.body.classList.toggle("is-keyboard", keyboard > 72);
}

/**
 * Системный «назад» (жест или кнопка Android). Снимает верхний слой — диалог, редактор,
 * профиль, шторку созвездия — или возвращает на прошлую вкладку.
 * false — возвращаться некуда, приложение можно закрыть.
 */
function handleBack() {
  if (!shellReady) return false;
  if (isModalOpen()) {
    dismissModal();
    return true;
  }
  if (isSelecting()) {
    clearSelection();
    return true;
  }
  if (archive.handleBack()) return true;
  if (current === "calendar" && calendar.handleBack()) return true;
  if (current === "constellation" && constellation.handleBack()) return true;
  const previous = visited.pop();
  if (previous) {
    show(previous, { fromBack: true });
    return true;
  }
  return false;
}

function wireMobile() {
  window.VoidPrismBack = handleBack;
  window.VoidPrismOpen = (payload) => {
    if (!shellReady) {
      window.__voidprismPending = payload;
      return;
    }
    applyWidgetOpen(payload);
  };
  syncNavHeight();
  syncKeyboard();
  window.addEventListener("resize", syncKeyboard);
  window.addEventListener("voidprism-ime", syncKeyboard);
  window.visualViewport?.addEventListener("resize", syncKeyboard);
  window.visualViewport?.addEventListener("scroll", syncKeyboard);
  window.addEventListener("resize", syncNavHeight);
  new ResizeObserver(syncNavHeight).observe(app.querySelector(".nav-bottom"));
  new MutationObserver(syncNavHeight).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
  });
}

bootStars();
if (mobile) {
  mobileShell();
  wireMobile();
} else {
  desktopShell();
}
wire();

try {
  await bootstrap();
} catch {
  app.querySelector(".stage").innerHTML = mobile
    ? `<div class="empty"><strong>Не удалось открыть космос</strong><span>Перезапустите приложение.</span></div>`
    : `<div class="empty"><strong>База не ответила</strong><span>Запустите сервер Django и обновите страницу.</span></div>`;
  throw new Error("bootstrap");
}

show("constellation");
shellReady = true;
if (window.__voidprismPending) {
  const payload = window.__voidprismPending;
  window.__voidprismPending = null;
  applyWidgetOpen(payload);
}
