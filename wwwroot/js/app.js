import { bridge } from "./bridge.js";
import * as archive from "./archive.js";
import * as calendar from "./calendar.js";
import * as canvas from "./canvas.js";
import * as constellation from "./constellation.js";
import * as wishlist from "./wishlist.js";
import { isMobileApp } from "./platform.js";
import { bootstrap, clearCosmos, getState, subscribe, update } from "./store.js";
import { syncStatus } from "./sync.js";
import { confirmDialog, icons, initial, isModalOpen, isTyping, startOfDay, toast } from "./ui.js";

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

const profileFields = `
      <label for="profile-name">Имя в центре созвездия</label>
      <input id="profile-name" class="text-input" maxlength="32" />
      <label for="profile-epithet">Подпись</label>
      <input id="profile-epithet" class="text-input" maxlength="80" />
      <div class="drawer-actions" style="margin-top:14px">
        <button type="button" class="btn danger slim" data-clear>Очистить</button>
        <button type="button" class="btn slim" data-save-profile>Сохранить</button>
      </div>`;

function desktopShell() {
  app.innerHTML = `
    <nav class="nav">
      <a class="brand" href="/" aria-label="VoidPrism">
        <span class="brand-mark"></span>
        <small>Void</small>
      </a>
      <button type="button" class="nav-btn" data-view="constellation">${icons.star}<span>Созвездие</span></button>
      <button type="button" class="nav-btn" data-view="archive">${icons.archive}<span>Архив</span></button>
      <button type="button" class="nav-btn" data-view="calendar">${icons.calendar}<span>Календарь</span></button>
      <button type="button" class="nav-btn" data-view="wishlist">${icons.wish}<span>Желания</span></button>
      <button type="button" class="nav-btn" data-view="canvas">${icons.board}<span>Полотно</span></button>
      <div class="nav-spacer"></div>
      <button type="button" class="me" data-me>
        <span class="me-avatar"></span>
        <span class="me-label"></span>
      </button>
    </nav>
    <div class="popover" hidden>
      <h2>Профиль</h2>
      <p class="hint">Записи, задачи, желания и схемы хранятся в базе Django на этом компьютере.</p>
      ${profileFields}
    </div>
    <main class="stage"></main>`;
}

function mobileShell() {
  app.innerHTML = `
    <div class="popover" hidden>
      <h2>Профиль</h2>
      <p class="hint">Данные хранятся на этом телефоне. Сайт и приложение пока не связаны.</p>
      <div class="sync-card" data-sync-card>
        <strong>Синхронизация с сайтом</strong>
        <span class="hint" data-sync-message></span>
        <label class="check is-disabled">
          <input type="checkbox" disabled /> Скоро
        </label>
      </div>
      ${profileFields}
    </div>
    <main class="stage"></main>
    <nav class="nav nav-bottom" aria-label="Разделы">
      <button type="button" class="nav-btn" data-view="constellation">${icons.star}<span>Звёзды</span></button>
      <button type="button" class="nav-btn" data-view="archive">${icons.archive}<span>Архив</span></button>
      <button type="button" class="nav-btn" data-view="calendar">${icons.calendar}<span>Дни</span></button>
      <button type="button" class="nav-btn" data-view="wishlist">${icons.wish}<span>Желания</span></button>
      <button type="button" class="nav-btn" data-view="canvas">${icons.board}<span>Схемы</span></button>
      <button type="button" class="nav-btn nav-me" data-me>
        <span class="me-avatar nav-avatar"></span>
        <span class="me-label">Я</span>
      </button>
    </nav>`;
}

let current = "constellation";

function show(view) {
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
  canvas.setActive(view === "canvas");
}

function paintChrome() {
  const profile = getState().profile;
  const avatar = app.querySelector(".me-avatar");
  const label = app.querySelector("[data-me] .me-label");
  if (avatar) avatar.textContent = initial(profile.name);
  if (label) label.textContent = profile.name || "Я";
  const name = app.querySelector("#profile-name");
  const epithet = app.querySelector("#profile-epithet");
  if (name && document.activeElement !== name) name.value = profile.name || "";
  if (epithet && document.activeElement !== epithet) epithet.value = profile.epithet || "";
  const syncMsg = app.querySelector("[data-sync-message]");
  if (syncMsg) syncMsg.textContent = syncStatus().message;
}

async function clearAll() {
  const ok = await confirmDialog({
    title: "Очистить космос?",
    text: mobile
      ? "Заметки, задачи, события, желания и схемы будут стёрты с этого телефона. Имя в центре останется."
      : "Заметки, задачи, события, желания и схемы будут стёрты из базы. Имя в центре останется.",
    confirmLabel: "Очистить",
    danger: true,
  });
  if (!ok) return;
  clearCosmos();
  app.querySelector(".popover").hidden = true;
  toast("Космос очищен");
}

function wire() {
  const stage = app.querySelector(".stage");
  constellation.mount(stage);
  archive.mount(stage);
  calendar.mount(stage);
  wishlist.mount(stage);
  canvas.mount(stage);
  app.querySelector(".nav").addEventListener("click", (event) => {
    const view = event.target.closest("[data-view]")?.dataset.view;
    if (!view) return;
    if (view === "constellation") constellation.closeSheet();
    show(view);
  });
  const popover = app.querySelector(".popover");
  app.querySelector("[data-me]").addEventListener("click", () => {
    popover.hidden = !popover.hidden;
    if (!popover.hidden) paintChrome();
  });
  app.querySelector("[data-save-profile]").addEventListener("click", () => {
    saveProfileFromForm();
    popover.hidden = true;
  });
  app.querySelector("[data-clear]").addEventListener("click", clearAll);
  document.addEventListener("click", (event) => {
    if (popover.hidden) return;
    if (event.target.closest(".popover") || event.target.closest("[data-me]")) return;
    popover.hidden = true;
  });
  subscribe(() => {
    paintChrome();
    if (current === "archive") archive.render();
    if (current === "constellation") constellation.render();
    if (current === "calendar") calendar.render();
    if (current === "wishlist") wishlist.render();
    canvas.refreshFromOutside();
  });
  window.addEventListener("keydown", (event) => {
    if (isModalOpen()) return;
    if (archive.isEditorOpen() && event.key === "Escape") {
      archive.keydown(event);
      return;
    }
    if (isTyping(event.target) && event.key !== "Escape") return;
    if (current === "canvas") canvas.keydown(event);
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

function saveProfileFromForm() {
  const name = app.querySelector("#profile-name").value.trim() || "Я";
  const epithet = app.querySelector("#profile-epithet").value.trim();
  const profile = getState().profile;
  if (name === profile.name && epithet === profile.epithet) return;
  update((state) => {
    state.profile.name = name;
    state.profile.epithet = epithet;
    return state;
  });
}

bridge.openEntry = (id) => {
  const entry = getState().entries.find((item) => item.id === id);
  if (entry?.kind === "wish") {
    show("wishlist");
    archive.openEditor(id);
    return;
  }
  if (current === "calendar") {
    archive.openEditor(id);
    return;
  }
  show("archive");
  archive.openEditor(id);
};

bridge.openWish = (id) => {
  show("wishlist");
  archive.openEditor(id);
};

bridge.newWish = () => {
  show("wishlist");
  archive.openEditor(null, { kind: "wish", tags: ["желания"] });
};

bridge.afterWishSave = () => {
  show("wishlist");
};

bridge.newEntry = (preset) => {
  if (preset?.kind === "wish") {
    show("wishlist");
    archive.openEditor(null, preset);
    return;
  }
  if (current === "calendar" || Number.isFinite(preset?.when) || preset?.kind === "event") {
    if (current !== "calendar" && (Number.isFinite(preset?.when) || preset?.kind === "event")) {
      show("calendar");
    }
    archive.openEditor(null, preset);
    return;
  }
  show("archive");
  archive.openEditor(null, preset);
};

bridge.afterCalendarSave = (id) => {
  const entry = getState().entries.find((item) => item.id === id);
  if (Number.isFinite(entry?.when)) calendar.focusDay(entry.when);
  show("calendar");
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

function wireMobile() {
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

paintChrome();
show("constellation");
shellReady = true;
if (window.__voidprismPending) {
  const payload = window.__voidprismPending;
  window.__voidprismPending = null;
  applyWidgetOpen(payload);
}
