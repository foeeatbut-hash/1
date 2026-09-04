/**
 * Скачанное браузером: список у каждого свой.
 *
 * Правила имён и подписей — в src/lib/downloads.ts, здесь только хранение.
 * Список лежит в браузере программы и привязан к вошедшему: за одним
 * компьютером в отделе иногда работают двое, и «мои загрузки» должны означать
 * мои, а не всё, что качали на этой машине.
 *
 * Незавершённые не сохраняются: программу закрыли — скачивание оборвалось, и
 * строка «идёт 40 %», пережившая перезапуск, была бы неправдой.
 */
import { create } from 'zustand';
import type { DownloadItem, DownloadState } from '../lib/downloads';

const KEY = (who: string) => `flux_downloads_${who || 'anon'}`;
/** Сколько помним. Дальше это уже не «что я скачал», а архив за год */
const LIMIT = 60;

const read = (who: string): DownloadItem[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(who)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
};

const write = (who: string, list: DownloadItem[]) => {
  try {
    // На диск — только завершённое: прерванное скачивание не продолжится
    localStorage.setItem(KEY(who), JSON.stringify(list.filter((d) => d.state !== 'progress').slice(0, LIMIT)));
  } catch (_) { /* приватный режим */ }
};

interface DownloadsState {
  who: string;
  items: DownloadItem[];
  /** Кто вошёл: список перечитывается под него */
  setWho: (who: string) => void;
  /** Событие от главного процесса: начало, движение или конец */
  apply: (p: any) => void;
  clear: () => void;
}

export const useDownloadStore = create<DownloadsState>((set, get) => ({
  who: '',
  items: [],

  setWho: (who) => {
    if (get().who === who) return;
    set({ who, items: read(who) });
  },

  apply: (p) => {
    const id = String(p?.id || '');
    if (!id) return;
    const next: DownloadItem = {
      id,
      name: String(p.name || 'Файл'),
      url: String(p.url || ''),
      path: String(p.path || ''),
      size: Number(p.size) || 0,
      received: Number(p.received) || 0,
      state: (['progress', 'done', 'failed', 'cancelled'] as DownloadState[]).includes(p.state) ? p.state : 'progress',
      at: get().items.find((d) => d.id === id)?.at || Date.now(),
    };
    const items = [next, ...get().items.filter((d) => d.id !== id)].slice(0, LIMIT);
    set({ items });
    if (next.state !== 'progress') write(get().who, items);
  },

  clear: () => {
    // Чистим список, а не файлы: удалять с диска то, за чем человек приходил,
    // программа не должна — он сам решит
    set({ items: [] });
    write(get().who, []);
  },
}));
