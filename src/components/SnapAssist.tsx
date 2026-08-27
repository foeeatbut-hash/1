/**
 * Чем занять оставшиеся доли.
 *
 * Это половина смысла раскладок: разложить одно окно можно и руками, а собрать
 * рабочее место из четырёх — уже нет. Как только окно встало, свободные доли
 * показывают, какие ещё окна открыты, и ставят выбранное на место.
 *
 * Предложение уходит по первому нажатию мимо: незанятая доля — это просто
 * видимый стол, а не незаконченное дело.
 */
import React from 'react';
import { useWindowStore } from '../store/windowStore';
import { shareStyle, type Share } from '../lib/layouts';
import { sectionForPath } from '../workspace/sections';

export default function SnapAssist({ shares, skip, onClose }: {
  shares: Share[];
  /** Окна, уже расставленные этой раскладкой */
  skip: string[];
  onClose: () => void;
}) {
  const windows = useWindowStore((s) => s.windows);
  const titles = useWindowStore((s) => s.titles);
  const area = useWindowStore((s) => s.area);
  const putInShare = useWindowStore((s) => s.putInShare);
  const [taken, setTaken] = React.useState<string[]>([]);

  const free = windows.filter((w) => !skip.includes(w.id) && !taken.includes(w.id));
  const rest = shares.slice(taken.length);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!rest.length || !free.length) return null;
  const share = rest[0];
  const box = shareStyle(share, area);

  return (
    <div
      className="absolute z-[58] rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-500/[0.07]
                 flex flex-wrap items-center justify-center gap-2 p-3 overflow-auto"
      style={box}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {free.map((w) => {
        const def = sectionForPath(w.path);
        const Icon = def.icon as any;
        return (
          <button key={w.id} type="button"
            onClick={() => {
              putInShare(w.id, share);
              setTaken((list) => [...list, w.id]);
            }}
            className="w-44 p-2 rounded-lg cursor-pointer text-left bg-white dark:bg-slate-900
                       border border-slate-200 dark:border-slate-800 hover:border-emerald-500 shadow-sm">
            <span className="flex items-center gap-1.5">
              {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
              <span className="text-2xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                {titles[w.id] || def.title}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
