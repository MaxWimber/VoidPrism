/**
 * Раздел «Настройки» (шестерёнка в навигации): вкладки «Настройки» и «Профиль».
 * Профиль — обычный раздел, не всплывающее окно; имя и подпись сохраняются сами.
 */
import { isMobileApp } from "./platform.js";
import { clearCosmos, getState, update } from "./store.js";
import { confirmDialog, initial, toast } from "./ui.js";

const TABS = [
  ["settings", "Настройки"],
  ["profile", "Профиль"],
];

let root;
let active = false;
let tab = "settings";

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function countChip(n, one, few, many) {
  return `<span class="chip is-static"><b>${n}</b> ${plural(n, one, few, many)}</span>`;
}

function paintProfile() {
  const state = getState();
  const { profile, entries } = state;
  root.querySelector(".profile-avatar").textContent = initial(profile.name);
  root.querySelector(".profile-title").textContent = profile.name || "Я";
  root.querySelector(".profile-subtitle").textContent = profile.epithet || "";
  for (const input of root.querySelectorAll("[data-profile]")) {
    if (document.activeElement !== input) input.value = profile[input.dataset.profile] || "";
  }
  const open = (kind) => entries.filter((entry) => entry.kind === kind && entry.status !== "done").length;
  const notes = entries.filter((entry) => entry.kind === "note").length;
  root.querySelector(".profile-chips").innerHTML = `
    ${countChip(notes, "заметка", "заметки", "заметок")}
    ${countChip(open("task"), "задача", "задачи", "задач")}
    ${countChip(open("wish"), "желание", "желания", "желаний")}
    <span class="chip is-static">${isMobileApp() ? "Хранится на телефоне" : "Хранится в базе на компьютере"}</span>
    ${isMobileApp() ? `<span class="chip is-static">Синхронизация с сайтом — скоро</span>` : ""}`;
}

export function render() {
  if (!root || !active) return;
  root.querySelectorAll("[data-settings-tab]").forEach((button) => {
    const on = button.dataset.settingsTab === tab;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
  });
  root.querySelectorAll("[data-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== tab;
  });
  if (tab === "profile") paintProfile();
}

function saveField(input) {
  const key = input.dataset.profile;
  const value = key === "name" ? input.value.trim() || "Я" : input.value.trim();
  if (getState().profile[key] === value) return;
  update((state) => {
    state.profile[key] = value;
    return state;
  });
}

async function clearAll() {
  const ok = await confirmDialog({
    title: "Очистить космос?",
    text: isMobileApp()
      ? "Заметки, задачи, события, желания и схемы будут стёрты с этого телефона. Имя в центре останется."
      : "Заметки, задачи, события, желания и схемы будут стёрты из базы. Имя в центре останется.",
    confirmLabel: "Очистить",
    danger: true,
  });
  if (!ok) return;
  clearCosmos();
  toast("Космос очищен");
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view settings-view";
  root.innerHTML = `
    <header class="view-head">
      <h1>Настройки</h1>
    </header>
    <div class="seg settings-tabs" role="group" aria-label="Разделы настроек">
      ${TABS.map(([id, label]) => `<button type="button" data-settings-tab="${id}">${label}</button>`).join("")}
    </div>
    <div class="settings-pane" data-pane="settings">
      <div class="empty slim"><strong>Пока пусто</strong><span>Здесь появятся настройки приложения.</span></div>
    </div>
    <div class="settings-pane profile-pane" data-pane="profile" hidden>
      <div class="profile-card">
        <span class="profile-avatar" aria-hidden="true"></span>
        <div class="profile-names">
          <strong class="profile-title"></strong>
          <span class="profile-subtitle"></span>
        </div>
      </div>
      <input class="text-input" data-profile="name" maxlength="32" placeholder="Имя в центре созвездия" aria-label="Имя в центре созвездия" />
      <input class="text-input" data-profile="epithet" maxlength="80" placeholder="Подпись" aria-label="Подпись" />
      <div class="chip-row profile-chips"></div>
      <button type="button" class="btn danger slim profile-clear" data-clear>Очистить космос</button>
    </div>`;
  parent.append(root);

  root.querySelector(".settings-tabs").addEventListener("click", (event) => {
    const next = event.target.closest("[data-settings-tab]")?.dataset.settingsTab;
    if (!next || next === tab) return;
    tab = next;
    render();
  });
  for (const input of root.querySelectorAll("[data-profile]")) {
    input.addEventListener("change", () => saveField(input));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  }
  root.querySelector("[data-clear]").addEventListener("click", clearAll);
}

export function setActive(on) {
  active = on;
  root.classList.toggle("is-on", on);
  if (on) render();
}
