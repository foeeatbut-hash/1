import { create } from 'zustand';

type ModalType = 'alert' | 'confirm' | 'prompt' | 'select';

export interface ConfirmOptions {
  /** Надпись на кнопке действия: всегда глагол — «Удалить», «Восстановить». */
  confirmLabel?: string;
  /** danger — необратимое действие: кнопка красная. */
  tone?: 'default' | 'danger';
}

interface ModalOptions {
  type: ModalType;
  title: string;
  message?: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string, label: string }[];
  resolve: (value: any) => void;
  reject: () => void;
}

interface ModalState {
  currentModal: ModalOptions | null;
  openAlert: (title: string, message?: string) => Promise<void>;
  openConfirm: (title: string, message?: string, opts?: ConfirmOptions) => Promise<boolean>;
  openPrompt: (title: string, message?: string, placeholder?: string, defaultValue?: string) => Promise<string | null>;
  openSelect: (title: string, message?: string, options?: { value: string, label: string }[], defaultValue?: string) => Promise<string | null>;
  closeModal: (value?: any) => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  currentModal: null,
  
  openAlert: (title, message) => 
    new Promise<void>((resolve) => {
      set({ currentModal: { type: 'alert', title, message, resolve: () => resolve(), reject: () => resolve() } });
    }),

  openConfirm: (title, message, opts) =>
    new Promise<boolean>((resolve) => {
      set({ currentModal: { type: 'confirm', title, message, confirmLabel: opts?.confirmLabel, tone: opts?.tone, resolve, reject: () => resolve(false) } });
    }),

  openPrompt: (title, message, placeholder, defaultValue) =>
    new Promise<string | null>((resolve) => {
      set({ currentModal: { type: 'prompt', title, message, placeholder, defaultValue, resolve, reject: () => resolve(null) } });
    }),

  openSelect: (title, message, options, defaultValue) =>
    new Promise<string | null>((resolve) => {
      set({ currentModal: { type: 'select', title, message, options, defaultValue, resolve, reject: () => resolve(null) } });
    }),

  closeModal: (value?: any) => {
    const { currentModal } = get();
    if (currentModal) {
      if (value !== undefined) {
          currentModal.resolve(value);
      } else {
          currentModal.reject();
      }
      set({ currentModal: null });
    }
  }
}));
