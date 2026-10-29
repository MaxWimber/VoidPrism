/**
 * Заготовка синхронизации с сайтом VoidPrism.
 * Сейчас выключена: приложение хранит данные локально и отдельно от веба.
 * Позже pull/push смогут ходить на /api/state/ того же аккаунта.
 */

export const syncConfig = {
  enabled: false,
  endpoint: "",
  lastSyncAt: null,
  status: "idle",
};

export function syncStatus() {
  return {
    enabled: syncConfig.enabled,
    status: syncConfig.enabled ? syncConfig.status : "offline-local",
    lastSyncAt: syncConfig.lastSyncAt,
    message: syncConfig.enabled
      ? "Синхронизация активна"
      : "Синхронизация с сайтом — скоро. Пока данные только на этом устройстве.",
  };
}

export async function pull() {
  if (!syncConfig.enabled || !syncConfig.endpoint) {
    return { ok: false, reason: "disabled" };
  }
  syncConfig.status = "pulling";
  throw new Error("Sync endpoint ещё не подключён");
}

export async function push(_state) {
  if (!syncConfig.enabled || !syncConfig.endpoint) {
    return { ok: false, reason: "disabled" };
  }
  syncConfig.status = "pushing";
  throw new Error("Sync endpoint ещё не подключён");
}

export function enableSync(endpoint) {
  syncConfig.enabled = Boolean(endpoint);
  syncConfig.endpoint = endpoint || "";
  syncConfig.status = syncConfig.enabled ? "ready" : "idle";
}
