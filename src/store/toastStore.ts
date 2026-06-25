import { create } from 'zustand';
import { shouldPopup, shouldSound, playNotifSound } from '../lib/notifPrefs';

export type Toast = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  onClick?: () => void;
};

interface ToastState {
  toasts: Toast[];
  // category — категория уведомления для применения персональных настроек
  addToast: (message: string, type?: Toast['type'], onClick?: () => void, category?: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', onClick, category) => {
    // Ошибки показываем всегда (важны), остальное — по настройкам пользователя
    const force = type === 'error';
    if (!force && !shouldPopup(category)) return;
    if (force || shouldSound(category)) {
      try { playNotifSound(); } catch {}
    }
    const id = Date.now().toString() + Math.random().toString();
    set((state) => ({ toasts: [...state.toasts, { id, message, type, onClick }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, 6000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));
