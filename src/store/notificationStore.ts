import { create } from 'zustand';
import { dataService, AppNotification } from '../services/dataService';

// Ключ диалога из targetRoute уведомления ЧАТ: from=<id> или group=<id>
function convKey(n: AppNotification): string | null {
  const m = (n.targetRoute || '').match(/[?&](from|group)=([^&]+)/);
  return m ? `${m[1]}=${m[2]}` : null;
}

interface NotifState {
  personal: AppNotification[];
  unread: number;        // всего непрочитанных
  chatUnread: number;    // от скольких диалогов пришли сообщения
  loading: boolean;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  togglePanel: () => void;
  fetch: (userId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  markConversationRead: (userId: string, key: string) => Promise<void>;
  startPolling: (userId: string) => void;
  stopPolling: () => void;
}

let pollTimer: any = null;

const recompute = (list: AppNotification[]) => {
  const unread = list.filter(n => !n.isRead).length;
  const chatKeys = new Set<string>();
  for (const n of list) {
    if (!n.isRead && n.category === 'ЧАТ') { const k = convKey(n); if (k) chatKeys.add(k); }
  }
  return { unread, chatUnread: chatKeys.size };
};

export const useNotificationStore = create<NotifState>((set, get) => ({
  personal: [],
  unread: 0,
  chatUnread: 0,
  loading: false,
  panelOpen: false,
  setPanelOpen: (v) => set({ panelOpen: v }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  fetch: async (userId) => {
    if (!userId) { set({ personal: [], unread: 0, chatUnread: 0 }); return; }
    set({ loading: true });
    try {
      const list = await dataService.getNotifications(userId);
      set({ personal: list, ...recompute(list), loading: false });
    } catch {
      set({ loading: false });
    }
  },
  markAllRead: async (userId) => {
    if (!userId) return;
    try {
      await dataService.markNotificationsRead(userId);
      const list = get().personal.map(n => ({ ...n, isRead: true }));
      set({ personal: list, ...recompute(list) });
    } catch {}
  },
  // Пометить прочитанными уведомления конкретного диалога (from=X / group=Y)
  markConversationRead: async (userId, key) => {
    if (!userId || !key) return;
    const toMark = get().personal.filter(n => !n.isRead && n.category === 'ЧАТ' && convKey(n) === key);
    if (toMark.length === 0) return;
    try {
      for (const n of toMark) { await dataService.markNotificationsRead(userId, n.id); }
      const ids = new Set(toMark.map(n => n.id));
      const list = get().personal.map(n => ids.has(n.id) ? { ...n, isRead: true } : n);
      set({ personal: list, ...recompute(list) });
    } catch {}
  },
  startPolling: (userId) => {
    if (pollTimer) clearInterval(pollTimer);
    get().fetch(userId);
    pollTimer = setInterval(() => get().fetch(userId), 15000);
  },
  stopPolling: () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } },
}));
