/**
 * Отклик на действия: тихие синтезированные звуки и короткая вибрация.
 * В меру: щелчок — на каждое деление циферблата и колёс времени, остальное — только
 * на заметные действия (отметить пункт, сохранить, удалить, зажать для выбора).
 * Звук и вибрацию можно выключить в «Настройках»; выбор хранится на этом устройстве.
 */

const PREFS_KEY = "voidprism-feedback";
const prefs = { sound: true, haptics: true };

try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"));
} catch {
  /* без сохранённых настроек — всё включено */
}

export function getFeedbackPrefs() {
  return { ...prefs };
}

export function setFeedbackPref(key, value) {
  prefs[key] = Boolean(value);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* хранилище недоступно — настройка живёт до перезапуска */
  }
}

// --- звук ---

let audio = null;

function context() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audio = new Ctx();
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

// Браузер разрешает звук только после касания: будим контекст первым же нажатием.
window.addEventListener("pointerdown", () => prefs.sound && context(), { capture: true, passive: true });

/** Короткий тон: частота, длительность (с), громкость, форма волны, сдвиг частоты к концу. */
function tone(ctx, { freq, at = 0, dur = 0.08, gain = 0.06, type = "sine", glide = 1 }) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * glide, start + dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const SOUNDS = {
  // Щелчок механизма: очень короткий и тихий, чуть разный по высоте, чтобы не звенел.
  tick: (ctx) => tone(ctx, { freq: 1900 + Math.random() * 160, dur: 0.018, gain: 0.035, type: "triangle", glide: 0.7 }),
  check: (ctx) => {
    tone(ctx, { freq: 880, dur: 0.07, gain: 0.05 });
    tone(ctx, { freq: 1320, at: 0.055, dur: 0.1, gain: 0.045 });
  },
  uncheck: (ctx) => tone(ctx, { freq: 740, dur: 0.08, gain: 0.04, glide: 0.8 }),
  save: (ctx) => {
    tone(ctx, { freq: 660, dur: 0.09, gain: 0.04 });
    tone(ctx, { freq: 990, at: 0.07, dur: 0.16, gain: 0.04 });
  },
  done: (ctx) => {
    tone(ctx, { freq: 784, dur: 0.08, gain: 0.045 });
    tone(ctx, { freq: 1047, at: 0.06, dur: 0.08, gain: 0.045 });
    tone(ctx, { freq: 1568, at: 0.12, dur: 0.18, gain: 0.035 });
  },
  hold: (ctx) => tone(ctx, { freq: 520, dur: 0.06, gain: 0.04, glide: 1.3 }),
  remove: (ctx) => tone(ctx, { freq: 300, dur: 0.16, gain: 0.07, glide: 0.55 }),
};

// --- вибрация ---

// На Android — системный тактильный отклик (как у штатных часов и клавиатуры), иначе Vibration API.
const VIBRATE_MS = { tick: 4, check: 10, uncheck: 6, save: 12, done: [10, 40, 14], hold: 18, remove: [14, 30, 20] };

function vibrate(kind) {
  const android = window.VoidPrismAndroid;
  if (android?.haptic) {
    android.haptic(kind);
    return;
  }
  navigator.vibrate?.(VIBRATE_MS[kind]);
}

// Частые события (крутим стрелку) не должны сливаться в гул и дребезг.
const MIN_GAP = { tick: 28 };
const last = {};

/** Отклик на действие: tick | check | uncheck | save | done | hold | remove. */
export function feedback(kind) {
  const now = performance.now();
  if (now - (last[kind] || 0) < (MIN_GAP[kind] || 60)) return;
  last[kind] = now;
  if (prefs.haptics) vibrate(kind);
  if (prefs.sound && document.visibilityState === "visible") {
    const ctx = context();
    if (ctx && ctx.state === "running") SOUNDS[kind]?.(ctx);
  }
}
