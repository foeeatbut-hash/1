import { create } from 'zustand';

export interface LogItem {
  id: string;
  timestamp: string; // Formatting or ISO string
  type: 'INFO' | 'WARN' | 'ERROR';
  context: string;
  message: string;
  stack?: string;
}

interface LogState {
  logs: LogItem[];
  hasUnreadError: boolean;
  widgetOpen: boolean;
  addLog: (type: 'INFO' | 'WARN' | 'ERROR', context: string, message: string, stack?: string) => void;
  clearLogs: () => void;
  setWidgetOpen: (open: boolean) => void;
  setHasUnreadError: (val: boolean) => void;
}

// Журнал ограничен по размеру: без лимита каждый клик/запрос копил записи
// бесконечно, массив копировался целиком и программа начинала фризить
const MAX_LOGS = 800;

// Буфер накопленных записей и таймер сброса живут вне хранилища:
// пока запись лежит здесь, подписчики не перерисовываются.
let pending: LogItem[] = [];
let flushTimer: any = null;
const FLUSH_MS = 700;

let flushLogs = () => {};
let scheduleFlush = () => {};

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  hasUnreadError: false,
  widgetOpen: false,

  addLog: (type, context, message, stack) => {
    const id = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });

    const newLog: LogItem = { id, timestamp, type, context, message, stack };

    // Ошибки и предупреждения показываем сразу — их ждут. Обычные записи
    // (а это каждый клик и каждый запрос) копим и отдаём пачкой: раньше
    // любой клик по интерфейсу копировал весь массив журнала и
    // перерисовывал всех подписчиков, отсюда ощущение вязкости.
    pending.push(newLog);
    if (type === 'ERROR' || type === 'WARN') {
      flushLogs();
    } else {
      scheduleFlush();
    }
  },

  clearLogs: () => {
    pending = [];
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    set({ logs: [], hasUnreadError: false });
  },

  setWidgetOpen: (open) => {
    if (open) flushLogs();
    set({ 
      widgetOpen: open, 
      ...(open ? { hasUnreadError: false } : {}) // Reset when opened
    });
  },

  setHasUnreadError: (val) => {
    set({ hasUnreadError: val });
  }
}));

flushLogs = () => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  useLogStore.setState((state) => {
    const merged = [...state.logs, ...batch];
    const trimmed = merged.length > MAX_LOGS ? merged.slice(merged.length - MAX_LOGS) : merged;
    const hasError = batch.some((l) => l.type === 'ERROR');
    return {
      logs: trimmed,
      hasUnreadError: hasError && !state.widgetOpen ? true : state.hasUnreadError,
    };
  });
};

scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(flushLogs, FLUSH_MS);
};

// Делаем журнал доступным глобальной обёртке fetch (config/env.ts) для
// подробного логирования запросов/ответов без циклических импортов.
if (typeof window !== 'undefined') {
  (window as any).__pdmLogStore = useLogStore;
}
