import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .models import Vault
from .seed import initial_state


def _valid(data):
    if not isinstance(data, dict):
        return False
    profile = data.get("profile")
    if not isinstance(profile, dict):
        return False
    if not isinstance(profile.get("name"), str) or not isinstance(profile.get("epithet"), str):
        return False
    entries = data.get("entries")
    boards = data.get("boards")
    if not isinstance(entries, list) or not isinstance(boards, list) or not boards:
        return False
    return True


def _ensure_wish_seeds(data):
    """Добавляет стартовые желания в старые вселенные без kind=wish."""
    entries = data.get("entries")
    if not isinstance(entries, list):
        return data, False
    if any(isinstance(item, dict) and item.get("kind") == "wish" for item in entries):
        return data, False
    ids = {item.get("id") for item in entries if isinstance(item, dict)}
    if "seed-e1" not in ids:
        return data, False
    wishes = [item for item in initial_state()["entries"] if item.get("kind") == "wish"]
    data = {**data, "entries": [*wishes, *entries]}
    return data, True


def _ensure_calendar_seeds(data):
    """Добавляет демо-события и сроки задачам в старые вселенные без календаря."""
    entries = data.get("entries")
    if not isinstance(entries, list):
        return data, False
    ids = {item.get("id") for item in entries if isinstance(item, dict)}
    if "seed-e1" not in ids:
        return data, False
    changed = False
    fresh = {item["id"]: item for item in initial_state()["entries"] if isinstance(item, dict)}
    next_entries = []
    for item in entries:
        if not isinstance(item, dict):
            next_entries.append(item)
            continue
        copy = dict(item)
        seed = fresh.get(copy.get("id"))
        if seed and seed.get("when") and not copy.get("when"):
            copy["when"] = seed["when"]
            changed = True
        next_entries.append(copy)
    if not any(isinstance(item, dict) and item.get("kind") == "event" for item in next_entries):
        events = [item for item in fresh.values() if item.get("kind") == "event"]
        next_entries = [*events, *next_entries]
        changed = True
    if not changed:
        return data, False
    return {**data, "entries": next_entries}, True


def get_vault():
    vault, created = Vault.objects.get_or_create(pk=1, defaults={"data": initial_state()})
    if not created:
        data = vault.data
        changed = False
        data, wish_changed = _ensure_wish_seeds(data)
        changed = changed or wish_changed
        data, cal_changed = _ensure_calendar_seeds(data)
        changed = changed or cal_changed
        if changed:
            vault.data = data
            vault.save(update_fields=["data", "updated_at"])
    return vault


@ensure_csrf_cookie
def home(request):
    return render(request, "cosmos/index.html")


@require_http_methods(["GET", "PUT"])
def state_view(request):
    vault = get_vault()
    if request.method == "GET":
        return JsonResponse(vault.data)
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return JsonResponse({"error": "Некорректный JSON"}, status=400)
    if not _valid(payload):
        return JsonResponse({"error": "Некорректное состояние"}, status=400)
    vault.data = payload
    vault.save(update_fields=["data", "updated_at"])
    return JsonResponse({"ok": True})
