import { create } from 'zustand';

export type Toast = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  onClick?: () => void;
};

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], onClick?: () => void) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', onClick) => {
    const id = Date.now().toString() + Math.random().toString();
    set((state) => ({ toasts: [...state.toasts, { id, message, type, onClick }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, 6000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));
