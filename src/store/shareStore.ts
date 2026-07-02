import { create } from 'zustand';
import type { ShareTarget } from '../lib/shareLink';

export interface ShareCandidate {
  route: string;
  focus?: string;
  label: string;
  sel?: string;
  type: 'el' | 'text';
  // Готовая строка вставки в чат (несколько токенов [[s:...]] в одном сообщении).
  // Если задана — используется вместо кодирования route/focus/label.
  insert?: string;
}

interface ShareState {
  // Контекстное мини-меню «Поделиться»
  menu: { x: number; y: number; candidate: ShareCandidate } | null;
  openMenu: (x: number, y: number, c: ShareCandidate) => void;
  closeMenu: () => void;

  // Открыт ли выбор пользователя
  pickerCandidate: ShareCandidate | null;
  openPicker: (c: ShareCandidate) => void;
  closePicker: () => void;

  // Цель перехода у получателя (для подсветки)
  focusTarget: (ShareTarget & { ts: number }) | null;
  setFocusTarget: (t: ShareTarget) => void;
  clearFocus: () => void;
}

export const useShareStore = create<ShareState>((set) => ({
  menu: null,
  openMenu: (x, y, candidate) => set({ menu: { x, y, candidate } }),
  closeMenu: () => set({ menu: null }),

  pickerCandidate: null,
  openPicker: (c) => set({ pickerCandidate: c, menu: null }),
  closePicker: () => set({ pickerCandidate: null }),

  focusTarget: null,
  setFocusTarget: (t) => set({ focusTarget: { ...t, ts: Date.now() } }),
  clearFocus: () => set({ focusTarget: null }),
}));
