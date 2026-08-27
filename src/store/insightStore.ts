import { create } from 'zustand';
import type { UsageKind } from '../lib/insight';

/**
 * Панель связей: что сейчас открыто.
 *
 * Одна панель на три режима, а не три разных окна: они отвечают на соседние
 * вопросы про один и тот же проект, и человек ходит между ними — из замечания в
 * связи объекта, из связей в историю его правок. Отдельные окна пришлось бы
 * закрывать по одному.
 */
export type InsightMode = 'where' | 'check' | 'changes';

interface Target { kind: UsageKind; id: string }

interface InsightState {
  mode: InsightMode | null;
  target: Target | null;
  /** Куда вернуться по «назад»: панель связей открывается из проверки */
  back: { mode: InsightMode; target: Target | null } | null;
  /** Открыта ли строка «Спросить или найти» (Ctrl+K, components/CommandBar) */
  paletteOpen: boolean;
  /** Счётчик замечаний для значка на Главной; null — ещё не считали */
  checkTotal: number | null;
  checkCritical: number;

  openWhere: (kind: UsageKind, id: string, fromCurrent?: boolean) => void;
  openCheck: () => void;
  openChanges: () => void;
  goBack: () => void;
  close: () => void;

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  setCheckCounts: (total: number, critical: number) => void;
}

export const useInsightStore = create<InsightState>((set, get) => ({
  mode: null,
  target: null,
  back: null,
  paletteOpen: false,
  checkTotal: null,
  checkCritical: 0,

  openWhere: (kind, id, fromCurrent = false) => {
    const { mode, target } = get();
    set({
      mode: 'where', target: { kind, id },
      // «Назад» помним только при переходе из другой панели: иначе кнопка
      // возвращала бы в то, что человек уже закрыл
      back: fromCurrent && mode ? { mode, target } : null,
      paletteOpen: false,
    });
  },
  openCheck: () => set({ mode: 'check', target: null, back: null, paletteOpen: false }),
  openChanges: () => set({ mode: 'changes', target: null, back: null, paletteOpen: false }),
  goBack: () => {
    const b = get().back;
    if (b) set({ mode: b.mode, target: b.target, back: null });
    else set({ mode: null, target: null, back: null });
  },
  close: () => set({ mode: null, target: null, back: null }),

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set({ paletteOpen: !get().paletteOpen }),

  setCheckCounts: (checkTotal, checkCritical) => set({ checkTotal, checkCritical }),
}));
