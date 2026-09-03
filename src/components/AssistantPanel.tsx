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
import { Z } from '../lib/layers';
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

  return (
    <aside style={{ zIndex: Z.tray }}
      className={`${isOpen ? 'w-[380px] opacity-100' : 'w-0 opacity-0 pointer-events-none'} shrink-0 h-full
                  bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col
                  transition-ui duration-300 overflow-hidden absolute top-0 bottom-0 right-[var(--flux-rail-w)]
                  shadow-2xl`}
    >
      <div className="w-[380px] h-full flex flex-col shrink-0">
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
    </aside>
  );
}
