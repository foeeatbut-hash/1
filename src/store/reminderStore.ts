/**
 * Напоминания: «напомни завтра в 9 позвонить поставщику».
 *
 * Живут в браузере этого человека, а не в базе, и это осознанно: напоминание —
 * личная памятка, а не событие проекта. Уходить оно должно ровно одному
 * человеку и ровно на его рабочем месте; отправлять его через общую базу
 * значило бы, что памятку видит администратор.
 *
 * Просроченные не теряются: программа, запущенная позже назначенного часа,
 * покажет их при первом же тике — «я должен был напомнить в 9».
 */
import { create } from 'zustand';

export interface Reminder {
  id: string;
  /** Когда напомнить — время в миллисекундах */
  at: number;
  text: string;
  /** Куда вернуться: адрес окна, из которого напоминание поставили */
  href?: string;
  /** Уже показано: остаётся в списке до «Готово», чтобы не потерять мысль */
  fired?: boolean;
}

const KEY = 'flux_reminders';

interface ReminderState {
  list: Reminder[];
  add: (r: Omit<Reminder, 'id'>) => Reminder;
  remove: (id: string) => void;
  /** Что уже пора показать; помечает показанными, чтобы не звонить дважды */
  takeDue: (now?: number) => Reminder[];
  start: () => void;
  stop: () => void;
}

const load = (): Reminder[] => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r: any) => r && typeof r.at === 'number' && typeof r.text === 'string');
  } catch (_) { return []; }
};

const save = (list: Reminder[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* приватный режим */ }
};

let timer: any = null;

export const useReminderStore = create<ReminderState>((set, get) => ({
  list: load(),

  add: (r) => {
    const made: Reminder = { ...r, id: `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
    const list = [...get().list, made].sort((a, b) => a.at - b.at);
    save(list);
    set({ list });
    return made;
  },

  remove: (id) => {
    const list = get().list.filter((r) => r.id !== id);
    save(list);
    set({ list });
  },

  takeDue: (now = Date.now()) => {
    const due = get().list.filter((r) => !r.fired && r.at <= now);
    if (!due.length) return [];
    const ids = new Set(due.map((r) => r.id));
    const list = get().list.map((r) => (ids.has(r.id) ? { ...r, fired: true } : r));
    save(list);
    set({ list });
    return due;
  },

  // Раз в полминуты: точнее не нужно — напоминания ставят на часы и минуты,
  // а не на секунды, а частый тик будит вкладку без дела
  start: () => {
    if (timer) return;
    timer = setInterval(() => {
      const due = get().takeDue();
      for (const r of due) fire(r);
    }, 30000);
  },
  stop: () => { clearInterval(timer); timer = null; },
}));

/** Кому отдавать сработавшее напоминание — назначает оболочка */
let sink: ((r: Reminder) => void) | null = null;
export const onReminder = (fn: (r: Reminder) => void) => { sink = fn; };
const fire = (r: Reminder) => { if (sink) sink(r); };

/** Ближайшее несработавшее — его показывает подпись в строке состояния */
export const nextReminder = (list: Reminder[], now = Date.now()): Reminder | null =>
  list.filter((r) => !r.fired && r.at > now).sort((a, b) => a.at - b.at)[0] || null;
