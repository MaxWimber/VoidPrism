import time
from datetime import datetime, timedelta


def _ago(days):
    return int((time.time() - days * 86400) * 1000)


def _at(days=0, hour=0, minute=0):
    moment = datetime.now().replace(second=0, microsecond=0) + timedelta(days=days)
    moment = moment.replace(hour=hour, minute=minute)
    return int(moment.timestamp() * 1000)


def _entry(**fields):
    return {
        "status": "open",
        "pinned": False,
        **fields,
    }


def initial_state():
    now = _ago(0)
    return {
        "version": 1,
        "welcome": True,
        "profile": {
            "name": "Я",
            "epithet": "собираю себя по орбитам",
        },
        "activeBoard": "board-seed",
        "entries": [
            _entry(
                id="seed-e1",
                kind="note",
                title="Зачем мне этот космос",
                body="Место, где мысли не теряются. Сюда я складываю то, что важно, и смотрю, как оно связано со мной.",
                tags=["смысл", "цели"],
                pinned=True,
                createdAt=_ago(6),
                updatedAt=_ago(1),
            ),
            _entry(
                id="seed-e2",
                kind="note",
                title="Утренний контур",
                body="Вода, свет, десять минут тишины. Маленький ритуал, после которого день меньше рассыпается.",
                tags=["привычки", "тело"],
                createdAt=_ago(5),
                updatedAt=_ago(3),
            ),
            _entry(
                id="seed-e3",
                kind="task",
                title="Назвать три живых проекта",
                body="Не список всего на свете — только то, что действительно зовёт на этой неделе.",
                tags=["проекты", "цели"],
                status="focus",
                when=_at(1, 10, 0),
                createdAt=_ago(4),
                updatedAt=now,
            ),
            _entry(
                id="seed-e4",
                kind="note",
                title="Свои люди",
                body="Кто меня собирает, а не растаскивает. Хочу помнить не только дела, но и тепло.",
                tags=["люди", "смысл"],
                createdAt=_ago(8),
                updatedAt=_ago(4),
            ),
            _entry(
                id="seed-e5",
                kind="task",
                title="Вернуть вечер себе",
                body="Один вечер без чужих лент.\n- [x] Выключить ленты\n- [ ] Чай\n- [ ] Записать, куда ушло внимание",
                tags=["привычки"],
                status="open",
                when=_at(0, 20, 0),
                createdAt=_ago(2),
                updatedAt=_ago(2),
            ),
            _entry(
                id="seed-e6",
                kind="note",
                title="Чем я пользуюсь уверенно",
                body="Ясный текст, сборка схем, спокойное внимание к деталям. Это можно усиливать.",
                tags=["навыки", "проекты"],
                createdAt=_ago(9),
                updatedAt=_ago(5),
            ),
            _entry(
                id="seed-e7",
                kind="note",
                title="Тело просит движения",
                body="Прогулка быстрее, чем настроение успевает упасть.",
                tags=["тело"],
                createdAt=_ago(3),
                updatedAt=_ago(3),
            ),
            _entry(
                id="seed-ev1",
                kind="event",
                title="Тихий час с собой",
                body="Без экрана. Чай, окно, одна мысль на бумаге.",
                tags=["смысл"],
                when=_at(2, 18, 30),
                createdAt=_ago(1),
                updatedAt=_ago(1),
            ),
            _entry(
                id="seed-ev2",
                kind="event",
                title="Прогулка без маршрута",
                body="Выйти и идти, пока не станет легче.",
                tags=["тело"],
                when=_at(4, 0, 0),
                createdAt=_ago(1),
                updatedAt=_ago(1),
            ),
            _entry(
                id="seed-ev3",
                kind="event",
                title="Созвон с близким человеком",
                body="Не «как дела», а настоящий разговор.",
                tags=["люди"],
                when=_at(6, 19, 0),
                createdAt=now,
                updatedAt=now,
            ),
            _entry(
                id="seed-w1",
                kind="wish",
                title="Увидеть северное сияние",
                body="Не открытка — живой свет над головой. Холод, тишина, небо в цвете.",
                tags=["желания", "смысл"],
                status="open",
                priority=3,
                createdAt=_ago(7),
                updatedAt=_ago(2),
            ),
            _entry(
                id="seed-w2",
                kind="wish",
                title="Свой маленький ритуал утра",
                body="Место у окна, чай, десять минут без экрана.",
                tags=["желания", "привычки"],
                status="focus",
                priority=2,
                createdAt=_ago(4),
                updatedAt=_ago(1),
            ),
            _entry(
                id="seed-w3",
                kind="wish",
                title="Научиться играть одну любимую песню",
                body="Довести до того, чтобы звучало без стыда — хотя бы для себя.",
                tags=["желания", "навыки"],
                status="open",
                priority=2,
                createdAt=_ago(10),
                updatedAt=_ago(6),
            ),
        ],
        "boards": [
            {
                "id": "board-seed",
                "name": "Первая схема",
                "fit": True,
                "camera": {"x": 0, "y": 0, "z": 1},
                "nodes": [
                    {
                        "id": "seed-n0",
                        "type": "text",
                        "x": 40,
                        "y": 24,
                        "w": 460,
                        "h": 52,
                        "text": "Пример схемы — сотрите и соберите свою",
                        "tone": "violet",
                    },
                    {"id": "seed-n1", "type": "circle", "x": 60, "y": 150, "w": 120, "h": 120, "text": "Старт", "tone": "cyan"},
                    {"id": "seed-n2", "type": "card", "x": 260, "y": 146, "w": 210, "h": 128, "text": "Поймать мысль", "tone": "violet"},
                    {"id": "seed-n3", "type": "diamond", "x": 540, "y": 120, "w": 168, "h": 168, "text": "Это важно?", "tone": "amber"},
                    {"id": "seed-n4", "type": "card", "x": 800, "y": 48, "w": 200, "h": 116, "text": "В фокус", "tone": "mint"},
                    {"id": "seed-n5", "type": "card", "x": 800, "y": 250, "w": 200, "h": 116, "text": "В запас", "tone": "rose"},
                ],
                "links": [
                    {"id": "seed-l1", "from": "seed-n1", "to": "seed-n2"},
                    {"id": "seed-l2", "from": "seed-n2", "to": "seed-n3"},
                    {"id": "seed-l3", "from": "seed-n3", "to": "seed-n4"},
                    {"id": "seed-l4", "from": "seed-n3", "to": "seed-n5"},
                ],
            }
        ],
        "orbitMap": {},
        "entryMap": {},
        "orbitCamera": {"x": 0, "y": 0, "z": 1},
    }
