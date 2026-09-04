/**
 * Помощник сбоку: рама вокруг общего разговора.
 *
 * Сам разговор — components/assistant/Chat: он же стоит в окне программы
 * (screens/AssistantScreen). Панель нужна там, где окон нет вовсе (панельная
 * оболочка), и когда спросить надо на секунду, не заводя окна.
 *
 * Панель всегда лежит поверх содержимого и никогда не отжимает его. Сначала
 * она отжимала всегда (при окне 1024 разделу оставалось 492 точки, и таблицы
 * уходили в прокрутку), потом — только на широком окне; но и тогда открытый
 * помощник менял ширину панели задач под собой. Опора оболочки не двигается от
 * того, что рядом что-то открыли.
 */
import React, { useEffect, useState } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { useAssistantStore } from '../store/assistantStore';
import { useWindowStore } from '../store/windowStore';
import ArtShelf from './ArtShelf';
import Chat from './assistant/Chat';

export default function AssistantPanel() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const setOpen = useAssistantStore((s) => s.setOpen);

  // Робота можно выключить в настройках — тогда шапка сжимается в узкую полосу
  const [artOn, setArtOn] = useState<boolean>(() => {
    try { return localStorage.getItem('flux_art') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    const onChange = () => {
      try { setArtOn(localStorage.getItem('flux_art') !== '0'); } catch (_) { /* приватный режим */ }
    };
    window.addEventListener('flux:art-changed', onChange);
    return () => window.removeEventListener('flux:art-changed', onChange);
  }, []);

  /** Разговор переезжает в окно: тот же разговор, просто ему стало тесно */
  const toWindow = () => {
    setOpen(false);
    useWindowStore.getState().open('/assistant');
  };

  // Где стоит панель и сколько ей места — решает правая колонка
  // (components/RightDock): панелей две, и делить колонку они обязаны вместе,
  // а не каждая по-своему. Здесь остаётся только содержимое
  if (!isOpen) return null;

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-slate-900">
      <div className="h-full flex flex-col">
        {artOn
          ? <ArtShelf onClose={() => setOpen(false)} onExpand={toWindow} />
          : (
            <div className="shrink-0 h-9 flex items-center justify-end gap-1 px-2 border-b border-slate-200 dark:border-slate-800">
              <button type="button" onClick={toWindow} title="Открыть окном" aria-label="Открыть окном"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white
                           hover:bg-black/[0.06] dark:hover:bg-white/[0.08] cursor-pointer transition-ui">
                <Maximize2 className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} title="Закрыть" aria-label="Закрыть помощника"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white
                           hover:bg-black/[0.06] dark:hover:bg-white/[0.08] cursor-pointer transition-ui">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

        <div className="flex-1 min-h-0">
          <Chat compact />
        </div>
      </div>
    </div>
  );
}
