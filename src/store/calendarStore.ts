/**
 * Календарь: события, сроки и напоминания.
 *
 * Хранилище держит два разных списка и не смешивает их. События — записи в
 * базе, их правят. Сроки ВДР — срез реестра, их только показывают: подвинуть
 * срок из календаря нельзя, иначе о сроке появилось бы два мнения (см.
 * docs/os-design.md §15.2).
 *
 * Повторы здесь не раскрываются: этим занимается чистый модуль
 * src/lib/calendar.ts, который проверяется скриптом. Хранилище только приносит
 * события и отдаёт их окну.
 */
import { create } from 'zustand';
import { ENV_CONFIG, getAuthToken } from '../config/env';
import { deadlineEvent, DAY, type CalEvent, type VdrRow } from '../lib/calendar';

const authHeaders = (): Record<string, string> => {
  const t = getAuthToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

/** Какие календари включены слева: выбор человека, живёт на этой машине */
export interface Shown { project: boolean; deadlines: boolean; private: boolean }

const SHOWN_KEY = 'flux_calendar_shown';

const readShown = (): Shown => {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') {
      return { project: v.project !== false, deadlines: v.deadlines !== false, private: v.private !== false };
    }
  } catch (_) { /* приватный режим */ }
  return { project: true, deadlines: true, private: true };
};

interface CalendarState {
  loading: boolean;
  error: string;
  projectId: string;
  /** События из базы: встречи, напоминания, заметки */
  events: CalEvent[];
  /** Сроки ВДР, собранные из реестра */
  deadlines: CalEvent[];
  shown: Shown;
  /** Уже показанные напоминания: одно напоминание — один звонок */
  fired: string[];
  /**
   * Событие, заведённое со стороны: строкой «/встреча» или из письма. Окно
   * забирает черновик при открытии и гасит — иначе следующий приход в раздел
   * снова открыл бы то же окно события.
   */
  draft: any | null;
  setDraft: (d: any | null) => void;

  load: (projectId: string) => Promise<void>;
  setShown: (next: Partial<Shown>) => void;
  save: (ev: Partial<CalEvent> & { guests?: string[] }) => Promise<CalEvent | null>;
  remove: (id: string) => Promise<boolean>;
  answer: (id: string, state: 'yes' | 'no' | 'maybe') => Promise<void>;
  markFired: (key: string) => void;
  /** Всё, что рисуется на сетке, с учётом включённых календарей */
  visible: () => CalEvent[];
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  loading: false,
  error: '',
  projectId: '',
  events: [],
  deadlines: [],
  shown: readShown(),
  fired: [],
  draft: null,

  setDraft: (d) => set({ draft: d }),

  load: async (projectId) => {
    set({ loading: true, error: '', projectId });
    // Окно с запасом назад и вперёд: событие, начавшееся в прошлом месяце и
    // повторяющееся до сих пор, обязано попасть в выдачу — иначе раскрывать
    // будет нечего
    const from = Date.now() - 120 * DAY;
    const to = Date.now() + 400 * DAY;
    const q = `projectId=${encodeURIComponent(projectId)}&from=${from}&to=${to}`;
    try {
      const [eRes, dRes] = await Promise.all([
        fetch(`${ENV_CONFIG.apiUrl}/calendar/events?${q}`, { headers: authHeaders() }),
        fetch(`${ENV_CONFIG.apiUrl}/calendar/deadlines?${q}`, { headers: authHeaders() }),
      ]);
      const eJson = eRes.ok ? await eRes.json() : { items: [] };
      const dJson = dRes.ok ? await dRes.json() : { items: [] };
      set({
        events: (eJson.items || []) as CalEvent[],
        deadlines: ((dJson.items || []) as VdrRow[]).map(deadlineEvent),
        loading: false,
      });
    } catch (err: any) {
      // Пустой календарь и нечитаемый календарь — разные вещи, и человек
      // должен видеть, какая из них перед ним
      set({ loading: false, error: err?.message || 'Календарь не прочитан' });
    }
  },

  setShown: (next) => {
    const shown = { ...get().shown, ...next };
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify(shown)); } catch (_) { /* приватный режим */ }
    set({ shown });
  },

  save: async (ev) => {
    const isNew = !ev.id;
    try {
      const res = await fetch(
        `${ENV_CONFIG.apiUrl}/calendar/events${isNew ? '' : `/${ev.id}`}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ ...ev, projectId: ev.projectId ?? get().projectId }),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      await get().load(get().projectId);
      return data.item as CalEvent;
    } catch (_) { return null; }
  },

  remove: async (id) => {
    try {
      const res = await fetch(`${ENV_CONFIG.apiUrl}/calendar/events/${id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!res.ok) return false;
      set({ events: get().events.filter((e) => e.id !== id) });
      return true;
    } catch (_) { return false; }
  },

  answer: async (id, state) => {
    try {
      await fetch(`${ENV_CONFIG.apiUrl}/calendar/events/${id}/answer`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ state }),
      });
      await get().load(get().projectId);
    } catch (_) { /* ответ не ушёл — состояние перечитается при обновлении */ }
  },

  markFired: (key) => set({ fired: [...get().fired.slice(-200), key] }),

  visible: () => {
    const { events, deadlines, shown } = get();
    const out: CalEvent[] = [];
    for (const e of events) {
      if (e.visibility === 'private') { if (shown.private) out.push(e); continue; }
      if (shown.project) out.push(e);
    }
    if (shown.deadlines) out.push(...deadlines);
    return out;
  },
}));
