import React, { useEffect, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { PAINTINGS, paintingAt, PaintingScene } from '../art/paintings';

const KEY = 'flux_art_index';

interface Props {
  onClose: () => void;
}

/**
 * Полка картин в шапке помощника — на месте, где раньше жил робот.
 *
 * Высота и ширина оставлены прежними, 88 на 380: место в панели не менялось,
 * менялось наполнение.
 *
 * Как выбирается картина. При каждом открытии панели — следующая по кругу, и
 * номер запоминается. Не случайно: случайный выбор время от времени показывает
 * одно и то же дважды подряд, и это читается как поломка. Не само собой по
 * таймеру: полка стоит вплотную к переписке, и картина, меняющаяся сама во
 * время чтения, дёргает взгляд. Хочется другую — нажатие переключает.
 *
 * Подпись — как в музее: название, автор, год. Всегда на месте, приглушённая;
 * цвет берётся от того, светлая сцена или тёмная, иначе на «Звёздной ночи»
 * тёмная подпись пропадает, а на «Витрувианском человеке» — светлая.
 */
export default function ArtShelf({ onClose }: Props) {
  const [i, setI] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem(KEY) || '', 10);
      return Number.isFinite(v) ? v + 1 : 0;
    } catch (_) { return 0; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, String(i)); } catch (_) { /* приватный режим — просто не помним */ }
  }, [i]);

  const p = paintingAt(i);
  const label = `«${p.title}», ${p.artist}, ${p.year}`;

  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-black/[0.06] dark:border-white/[0.07] select-none"
      style={{ height: 88 }}
      role="img"
      aria-label={label}
    >
      {/* Сцена. key — чтобы при смене картины анимации начинались заново,
          а не подхватывались на середине от предыдущей */}
      <div key={p.id} className="absolute inset-0 flux-art-enter">
        <PaintingScene painting={p} />
      </div>

      {/* Подпись музейной табличкой.
          Своя подложка обязательна: сцены разные, и без неё текст то ложился
          на светлую стену, то попадал ровно на тёмный силуэт посетителя и
          пропадал наполовину. Табличка читается на любой из восьми. */}
      <div className="absolute left-2 bottom-2 max-w-[58%] rounded-md px-2 py-1
                      bg-white/82 dark:bg-slate-950/72 backdrop-blur-[2px]
                      border border-black/[0.06] dark:border-white/[0.10] shadow-sm
                      pointer-events-none">
        <div className="text-2xs font-bold leading-tight truncate text-slate-900 dark:text-white">
          {p.title}
        </div>
        <div className="text-2xs leading-tight truncate text-slate-650 dark:text-slate-400">
          {p.artist}, {p.year}
        </div>
      </div>

      {/* Следующая картина */}
      <button
        type="button"
        onClick={() => setI((v) => v + 1)}
        title={`Следующая картина (${((i % PAINTINGS.length) + PAINTINGS.length) % PAINTINGS.length + 1} из ${PAINTINGS.length})`}
        aria-label="Следующая картина"
        className="absolute right-9 top-1.5 p-1 rounded-lg cursor-pointer transition-ui
                   bg-black/25 hover:bg-black/40 text-white/90 backdrop-blur-sm"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Закрыть помощника — кнопка та же, что была у робота */}
      <button
        type="button"
        onClick={onClose}
        title="Закрыть"
        aria-label="Закрыть помощника"
        className="absolute right-1.5 top-1.5 p-1 rounded-lg cursor-pointer transition-ui
                   bg-black/25 hover:bg-black/40 text-white/90 backdrop-blur-sm"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
