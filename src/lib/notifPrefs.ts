// Настройки уведомлений (персональные, хранятся локально по пользователю).
// Используются всплывашками (тосты), разделом «Уведомления» и настройками профиля.

export type NotifCategory = 'СИСТЕМА' | 'ОБОРУДОВАНИЕ' | 'ЧАТ' | 'ПРОЕКТЫ' | 'ДОСТУП';

export const NOTIF_CATEGORIES: { id: NotifCategory; label: string }[] = [
  { id: 'СИСТЕМА',     label: 'Система и изменения' },
  { id: 'ОБОРУДОВАНИЕ', label: 'Оборудование и конфликты' },
  { id: 'ЧАТ',          label: 'Чат' },
  { id: 'ПРОЕКТЫ',      label: 'Проекты' },
  { id: 'ДОСТУП',       label: 'Доступ' },
];

export interface NotifPrefs {
  popups: boolean;                 // показывать всплывашки справа
  sound: boolean;                  // звук уведомлений
  categories: Record<string, { show: boolean; sound: boolean }>;
}

export function defaultPrefs(): NotifPrefs {
  const categories: NotifPrefs['categories'] = {};
  for (const c of NOTIF_CATEGORIES) categories[c.id] = { show: true, sound: true };
  return { popups: true, sound: true, categories };
}

let currentUserId = '';
export function setNotifUser(userId: string | undefined | null) { currentUserId = userId || ''; }

const keyFor = (uid: string) => `notif_prefs_${uid || 'default'}`;

export function getPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(keyFor(currentUserId));
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw);
    const base = defaultPrefs();
    return {
      popups: parsed.popups !== false,
      sound: parsed.sound !== false,
      categories: { ...base.categories, ...(parsed.categories || {}) },
    };
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(p: NotifPrefs) {
  try { localStorage.setItem(keyFor(currentUserId), JSON.stringify(p)); } catch {}
  try { window.dispatchEvent(new CustomEvent('notif-prefs-changed')); } catch {}
}

// Можно ли показать всплывашку этой категории
export function shouldPopup(category?: string): boolean {
  const p = getPrefs();
  if (!p.popups) return false;
  if (!category) return true;
  const c = p.categories[category];
  return c ? c.show : true;
}

// Нужно ли звучать для этой категории
export function shouldSound(category?: string): boolean {
  const p = getPrefs();
  if (!p.sound) return false;
  if (!category) return true;
  const c = p.categories[category];
  return c ? c.sound : true;
}

// Короткий мягкий сигнал через WebAudio (без файлов)
let audioCtx: AudioContext | null = null;
export function playNotifSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.26);
  } catch {}
}
