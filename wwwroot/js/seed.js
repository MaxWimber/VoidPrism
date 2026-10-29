function ago(days) {
  return Date.now() - days * 86400 * 1000;
}

function at(days = 0, hour = 0, minute = 0) {
  const moment = new Date();
  moment.setSeconds(0, 0);
  moment.setDate(moment.getDate() + days);
  moment.setHours(hour, minute, 0, 0);
  return moment.getTime();
}

function entry(fields) {
  return {
    status: "open",
    pinned: false,
    ...fields,
  };
}

export function initialState() {
  const now = ago(0);
  return {
    version: 1,
    welcome: true,
    profile: {
      name: "Я",
      epithet: "собираю себя по орбитам",
    },
    activeBoard: "board-seed",
    entries: [
      entry({
        id: "seed-e1",
        kind: "note",
        title: "Зачем мне этот космос",
        body: "Место, где мысли не теряются. Сюда я складываю то, что важно, и смотрю, как оно связано со мной.",
        tags: ["смысл", "цели"],
        pinned: true,
        createdAt: ago(6),
        updatedAt: ago(1),
      }),
      entry({
        id: "seed-e2",
        kind: "note",
        title: "Утренний контур",
        body: "Вода, свет, десять минут тишины. Маленький ритуал, после которого день меньше рассыпается.",
        tags: ["привычки", "тело"],
        createdAt: ago(5),
        updatedAt: ago(3),
      }),
      entry({
        id: "seed-e3",
        kind: "task",
        title: "Назвать три живых проекта",
        body: "Не список всего на свете — только то, что действительно зовёт на этой неделе.",
        tags: ["проекты", "цели"],
        status: "focus",
        when: at(1, 10, 0),
        createdAt: ago(4),
        updatedAt: now,
      }),
      entry({
        id: "seed-e4",
        kind: "note",
        title: "Свои люди",
        body: "Кто меня собирает, а не растаскивает. Хочу помнить не только дела, но и тепло.",
        tags: ["люди", "смысл"],
        createdAt: ago(8),
        updatedAt: ago(4),
      }),
      entry({
        id: "seed-e5",
        kind: "task",
        title: "Вернуть вечер себе",
        body: "Один вечер без чужих лент.\n- [x] Выключить ленты\n- [ ] Чай\n- [ ] Записать, куда ушло внимание",
        tags: ["привычки"],
        status: "open",
        when: at(0, 20, 0),
        createdAt: ago(2),
        updatedAt: ago(2),
      }),
      entry({
        id: "seed-e6",
        kind: "note",
        title: "Чем я пользуюсь уверенно",
        body: "Ясный текст, сборка схем, спокойное внимание к деталям. Это можно усиливать.",
        tags: ["навыки", "проекты"],
        createdAt: ago(9),
        updatedAt: ago(5),
      }),
      entry({
        id: "seed-e7",
        kind: "note",
        title: "Тело просит движения",
        body: "Прогулка быстрее, чем настроение успевает упасть.",
        tags: ["тело"],
        createdAt: ago(3),
        updatedAt: ago(3),
      }),
      entry({
        id: "seed-ev1",
        kind: "event",
        title: "Тихий час с собой",
        body: "Без экрана. Чай, окно, одна мысль на бумаге.",
        tags: ["смысл"],
        when: at(2, 18, 30),
        createdAt: ago(1),
        updatedAt: ago(1),
      }),
      entry({
        id: "seed-ev2",
        kind: "event",
        title: "Прогулка без маршрута",
        body: "Выйти и идти, пока не станет легче.",
        tags: ["тело"],
        when: at(4, 0, 0),
        createdAt: ago(1),
        updatedAt: ago(1),
      }),
      entry({
        id: "seed-ev3",
        kind: "event",
        title: "Созвон с близким человеком",
        body: "Не «как дела», а настоящий разговор.",
        tags: ["люди"],
        when: at(6, 19, 0),
        createdAt: now,
        updatedAt: now,
      }),
      entry({
        id: "seed-w1",
        kind: "wish",
        title: "Увидеть северное сияние",
        body: "Не открытка — живой свет над головой. Холод, тишина, небо в цвете.",
        tags: ["желания", "смысл"],
        status: "open",
        priority: 3,
        createdAt: ago(7),
        updatedAt: ago(2),
      }),
      entry({
        id: "seed-w2",
        kind: "wish",
        title: "Свой маленький ритуал утра",
        body: "Место у окна, чай, десять минут без экрана.",
        tags: ["желания", "привычки"],
        status: "focus",
        priority: 2,
        createdAt: ago(4),
        updatedAt: ago(1),
      }),
      entry({
        id: "seed-w3",
        kind: "wish",
        title: "Научиться играть одну любимую песню",
        body: "Довести до того, чтобы звучало без стыда — хотя бы для себя.",
        tags: ["желания", "навыки"],
        status: "open",
        priority: 2,
        createdAt: ago(10),
        updatedAt: ago(6),
      }),
    ],
    boards: [
      {
        id: "board-seed",
        name: "Первая схема",
        fit: true,
        camera: { x: 0, y: 0, z: 1 },
        nodes: [
          {
            id: "seed-n0",
            type: "text",
            x: 40,
            y: 24,
            w: 460,
            h: 52,
            text: "Пример схемы — сотрите и соберите свою",
            tone: "violet",
          },
          { id: "seed-n1", type: "circle", x: 60, y: 150, w: 120, h: 120, text: "Старт", tone: "cyan" },
          { id: "seed-n2", type: "card", x: 260, y: 146, w: 210, h: 128, text: "Поймать мысль", tone: "violet" },
          { id: "seed-n3", type: "diamond", x: 540, y: 120, w: 168, h: 168, text: "Это важно?", tone: "amber" },
          { id: "seed-n4", type: "card", x: 800, y: 48, w: 200, h: 116, text: "В фокус", tone: "mint" },
          { id: "seed-n5", type: "card", x: 800, y: 250, w: 200, h: 116, text: "В запас", tone: "rose" },
        ],
        links: [
          { id: "seed-l1", from: "seed-n1", to: "seed-n2" },
          { id: "seed-l2", from: "seed-n2", to: "seed-n3" },
          { id: "seed-l3", from: "seed-n3", to: "seed-n4" },
          { id: "seed-l4", from: "seed-n3", to: "seed-n5" },
        ],
      },
    ],
    orbitMap: {},
    entryMap: {},
    orbitCamera: { x: 0, y: 0, z: 1 },
  };
}
