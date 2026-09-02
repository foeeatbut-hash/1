/**
 * Раскрытая папка рабочего стола.
 *
 * Не окно: полотно поверх стола, как в системе на телефоне. Окно пришлось бы
 * двигать, разворачивать и закрывать — а папку открывают на две секунды, чтобы
 * достать из неё один значок.
 *
 * Закрывается по Esc, по нажатию мимо и сразу после запуска программы изнутри:
 * оставлять её открытой поверх того, что человек только что открыл, — значит
 * заставлять закрывать её отдельно.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Z } from '../../lib/layers';
import { deskMetric, type DeskScale } from '../../lib/metrics';
import type { DeskItem } from '../../lib/desktop';
import type { DeskGroup } from '../../lib/deskGroups';
import DeskIcon, { titleOf } from './DeskIcon';

export default function DeskFolder({ group, items, scale, onOpen, onOut, onRename, onClose }: {
  group: DeskGroup;
  /** Значки папки в том порядке, в каком их складывали */
  items: DeskItem[];
  scale: DeskScale;
  onOpen: (item: DeskItem) => void;
  /** Вынуть значок обратно на стол */
  onOut: (item: DeskItem) => void;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const metric = deskMetric(scale);
  const [name, setName] = React.useState(group.name);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commit = () => {
    const clean = name.trim();
    if (clean && clean !== group.name) onRename(clean);
    else setName(group.name);
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px]"
      style={{ zIndex: Z.modal }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label={`Папка «${group.name}»`}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-white/20 dark:border-slate-700
                   bg-white/90 dark:bg-dark-surface/95 shadow-2xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { e.stopPropagation(); setName(group.name); (e.target as HTMLInputElement).blur(); }
            }}
            aria-label="Имя папки"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-bold
                       text-slate-800 dark:text-slate-100 border-b border-transparent focus:border-emerald-400"
          />
          <button type="button" onClick={onClose} aria-label="Закрыть папку"
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer
                       text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex flex-wrap gap-1" style={{ minHeight: metric.h }}>
          {items.map((item, i) => (
            <div key={item.id} className="relative" style={{ width: metric.w, height: metric.h }}>
              <DeskIcon
                item={item}
                metric={metric}
                x={0}
                y={0}
                selected={false}
                dragged={false}
                renaming={null}
                onRenameChange={() => {}}
                onRenameCommit={() => {}}
                onRenameCancel={() => {}}
                onDoubleClick={() => { onOpen(item); onClose(); }}
                onContextMenu={(e) => { e.preventDefault(); onOut(item); }}
              />
            </div>
          ))}
        </div>

        <p className="mt-3 text-2xs text-slate-500 dark:text-slate-400">
          Двойное нажатие открывает, правая кнопка возвращает значок на стол.
          В папке из одного значка смысла нет — она распустится сама.
        </p>
      </div>
    </div>,
    document.body,
  );
}
