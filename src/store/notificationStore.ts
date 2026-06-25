import { create } from 'zustand';
import { dataService, AppNotification } from '../services/dataService';

interface NotifState {
  personal: AppNotification[];
  unread: number;
  loading: boolean;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  togglePanel: () => void;
  fetch: (userId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
}

export const useNotificationStore = create<NotifState>((set) => ({
  personal: [],
  unread: 0,
  loading: false,
  panelOpen: false,
  setPanelOpen: (v) => set({ panelOpen: v }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  fetch: async (userId) => {
    if (!userId) { set({ personal: [], unread: 0 }); return; }
    set({ loading: true });
    try {
      const list = await dataService.getNotifications(userId);
      set({ personal: list, unread: list.filter(n => !n.isRead).length, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  markAllRead: async (userId) => {
    if (!userId) return;
    try {
      await dataService.markNotificationsRead(userId);
      set((s) => ({ personal: s.personal.map(n => ({ ...n, isRead: true })), unread: 0 }));
    } catch {}
  },
}));
