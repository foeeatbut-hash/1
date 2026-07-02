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

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  hasUnreadError: false,
  widgetOpen: false,

  addLog: (type, context, message, stack) => {
    const id = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });

    const newLog: LogItem = {
      id,
      timestamp,
      type,
      context,
      message,
      stack,
    };

    set((state) => {
      const appended = state.logs.length >= MAX_LOGS
        ? [...state.logs.slice(state.logs.length - MAX_LOGS + 1), newLog]
        : [...state.logs, newLog];

      // If error occurs and widget is not open, mark as unread error
      const shouldMarkUnread = type === 'ERROR' && !state.widgetOpen;

      return {
        logs: appended,
        hasUnreadError: shouldMarkUnread ? true : state.hasUnreadError,
      };
    });
  },

  clearLogs: () => {
    set({ logs: [], hasUnreadError: false });
  },

  setWidgetOpen: (open) => {
    set({ 
      widgetOpen: open, 
      ...(open ? { hasUnreadError: false } : {}) // Reset when opened
    });
  },

  setHasUnreadError: (val) => {
    set({ hasUnreadError: val });
  }
}));

// Делаем журнал доступным глобальной обёртке fetch (config/env.ts) для
// подробного логирования запросов/ответов без циклических импортов.
if (typeof window !== 'undefined') {
  (window as any).__pdmLogStore = useLogStore;
}
