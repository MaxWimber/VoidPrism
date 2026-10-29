import { bridge } from "./bridge.js";
import * as archive from "./archive.js";
import * as calendar from "./calendar.js";
import * as canvas from "./canvas.js";
import * as constellation from "./constellation.js";
import * as wishlist from "./wishlist.js";
import { bootstrap, clearCosmos, getState, subscribe, update } from "./store.js";
import { confirmDialog, icons, initial, isModalOpen, isTyping, toast } from "./ui.js";

const app = document.querySelector("#app");

function bootStars() {
  const canvasEl = document.getElementById("stars");
  const ctx = canvasEl.getContext("2d");
  const stars = Array.from({ length: 140 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.3 + 0.2,
    a: Math.random() * 0.55 + 0.2,
    tw: Math.random() * Math.PI * 2,
    s: Math.random() * 0.8 + 0.2,
  }));
  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
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
      ctx.arc(star.x * canvasEl.width, star.y * canvasEl.height, star.r * (window.devicePixelRatio || 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduced) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function shell() {
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
      <label for="profile-name">Имя в центре созвездия</label>
      <input id="profile-name" class="text-input" maxlength="32" />
      <label for="profile-epithet">Подпись</label>
      <input id="profile-epithet" class="text-input" maxlength="80" />
      <div class="drawer-actions" style="margin-top:14px">
        <button type="button" class="btn danger slim" data-clear>Очистить</button>
        <button type="button" class="btn slim" data-save-profile>Сохранить</button>
      </div>
    </div>
    <main class="stage"></main>`;
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
  app.querySelector(".me-avatar").textContent = initial(profile.name);
  app.querySelector(".me-label").textContent = profile.name || "Я";
  const name = app.querySelector("#profile-name");
  const epithet = app.querySelector("#profile-epithet");
  if (document.activeElement !== name) name.value = profile.name || "";
  if (document.activeElement !== epithet) epithet.value = profile.epithet || "";
}

async function clearAll() {
  const ok = await confirmDialog({
    title: "Очистить космос?",
    text: "Заметки, задачи, события, желания и схемы будут стёрты из базы. Имя в центре останется.",
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
    if (view) show(view);
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

bootStars();
shell();
wire();

try {
  await bootstrap();
} catch {
  app.querySelector(".stage").innerHTML = `<div class="empty"><strong>База не ответила</strong><span>Запустите сервер Django и обновите страницу.</span></div>`;
  throw new Error("bootstrap");
}

paintChrome();
show("constellation");
