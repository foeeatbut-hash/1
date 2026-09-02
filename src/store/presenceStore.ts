/**
 * Кто сейчас в сети.
 *
 * Нужно ровно там, где человек пишет другому человеку: в чате видно, дойдёт ли
 * сообщение сейчас или будет прочитано завтра. Без этого чат — почта: пишешь и
 * ждёшь, не понимая, ждать ли ответа.
 *
 * Состояние приходит сокетом и живёт только в памяти вкладки: присутствие —
 * это «прямо сейчас», хранить его негде и незачем. Список целиком выдаётся при
 * подключении (`presence:list`), дальше — по одному событию на вход и выход.
 *
 * Правило одно для всех, включая администратора: скрытое присутствие
 * начальства — не приватность, а неравенство. Кто-то один видит, кому можно
 * писать, а остальные пишут в пустоту.
 */
import { create } from 'zustand';

interface PresenceState {
  /** Идентификаторы тех, кто в сети прямо сейчас */
  online: string[];
  /** Когда человека видели последний раз, мс; нет записи — неизвестно */
  lastSeen: Record<string, number>;
  isOnline: (userId: string) => boolean;
  seenAt: (userId: string) => number | null;
  setList: (online: string[], lastSeen?: Record<string, number>) => void;
  setOnline: (userId: string) => void;
  setOffline: (userId: string, at: number) => void;
  /** Связь пропала — про чужое присутствие мы больше ничего не знаем */
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  online: [],
  lastSeen: {},

  isOnline: (userId) => !!userId && get().online.includes(userId),
  seenAt: (userId) => get().lastSeen[userId] ?? null,

  setList: (online, lastSeen) => set({
    online: Array.from(new Set(online.filter(Boolean))),
    lastSeen: { ...get().lastSeen, ...(lastSeen || {}) },
  }),

  setOnline: (userId) => {
    if (!userId || get().online.includes(userId)) return;
    set({ online: [...get().online, userId] });
  },

  setOffline: (userId, at) => set({
    online: get().online.filter((id) => id !== userId),
    lastSeen: { ...get().lastSeen, [userId]: at || Date.now() },
  }),

  // Список чистим, а «был в сети» оставляем: он и без связи остаётся правдой
  reset: () => set({ online: [] }),
}));

/**
 * Подпись под именем: «в сети» или когда видели.
 *
 * Точного времени не показываем — оно тут не нужно и выглядит слежкой.
 * Незнакомое время — «не в сети», а не пустая строка: пустое место человек
 * читает как поломку.
 */
export function presenceLabel(isOnline: boolean, seenAt: number | null, now = Date.now()): string {
  if (isOnline) return 'в сети';
  if (!seenAt) return 'не в сети';
  const min = Math.floor((now - seenAt) / 60000);
  if (min < 1) return 'был(а) только что';
  if (min < 60) return `был(а) ${min} мин. назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `был(а) ${h} ч. назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'был(а) вчера';
  if (d < 7) return `был(а) ${d} дн. назад`;
  return 'давно не заходил(а)';
}
