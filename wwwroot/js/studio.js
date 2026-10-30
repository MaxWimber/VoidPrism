/**
 * Раздел «Студия» — дополнительные инструменты: вкладки «Схемы» (полотно) и «Таблицы» внизу.
 * Полотно схем — прежний модуль canvas.js, он просто живёт внутри студии.
 */
import * as canvas from "./canvas.js";

const TABS = [
  ["schemes", "Схемы"],
  ["tables", "Таблицы"],
];

let root;
let tablesEl;
let active = false;
let tab = "schemes";

function paint() {
  root.querySelectorAll("[data-studio-tab]").forEach((button) => {
    const on = button.dataset.studioTab === tab;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
  });
  canvas.setActive(active && tab === "schemes");
  tablesEl.classList.toggle("is-on", active && tab === "tables");
}

export function mount(parent) {
  root = document.createElement("section");
  root.className = "view studio-view";
  root.innerHTML = `
    <div class="studio-body"></div>
    <div class="tab-bar studio-tabs" role="group" aria-label="Инструменты студии">
      ${TABS.map(([id, label]) => `<button type="button" data-studio-tab="${id}">${label}</button>`).join("")}
    </div>`;
  parent.append(root);
  const body = root.querySelector(".studio-body");
  canvas.mount(body);
  tablesEl = document.createElement("section");
  tablesEl.className = "view tables-view";
  tablesEl.innerHTML = `<div class="empty slim"><strong>Таблицы — скоро</strong><span>Здесь появятся таблицы.</span></div>`;
  body.append(tablesEl);

  root.querySelector(".studio-tabs").addEventListener("click", (event) => {
    const next = event.target.closest("[data-studio-tab]")?.dataset.studioTab;
    if (!next || next === tab) return;
    tab = next;
    paint();
  });
}

export function setActive(on) {
  active = on;
  root.classList.toggle("is-on", on);
  paint();
}

export function keydown(event) {
  if (active && tab === "schemes") canvas.keydown(event);
}
