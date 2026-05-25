import { create } from 'zustand';

type ModalType = 'alert' | 'confirm' | 'prompt' | 'select';

interface ModalOptions {
  type: ModalType;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string, label: string }[];
  resolve: (value: any) => void;
  reject: () => void;
}

interface ModalState {
  currentModal: ModalOptions | null;
  openAlert: (title: string, message?: string) => Promise<void>;
  openConfirm: (title: string, message?: string) => Promise<boolean>;
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

  openConfirm: (title, message) =>
    new Promise<boolean>((resolve) => {
      set({ currentModal: { type: 'confirm', title, message, resolve, reject: () => resolve(false) } });
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
