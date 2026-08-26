/**
 * Строка документа — верхний ряд всех четырёх редакторов.
 *
 * Порядок слева направо неизменен: он отвечает на вопросы в том порядке, в
 * каком их задают — куда я вернусь → что это → в каком оно состоянии → кто ещё
 * тут → цело ли оно. Одинаковый порядок и есть то, ради чего рама общая:
 * человек, перешедший из таблицы в чертёж, ничего не ищет заново.
 */
import React, { useState } from 'react';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { DOC_ROW_H } from '../../lib/ribbon';

export interface DocRowMenuItem {
  label: string;
  hint?: string;
  run: () => void;
}

export interface DocRowPeer { socketId: string; name: string; color: string }

export interface DocRowProps {
  icon: React.ReactNode;
  name: string;
  onRename: (v: string) => void;
  onClose: () => void;
  /** Стадия документа: чип того же цвета, что в Проводнике */
  stage?: { label: string; tone: 'draft' | 'check' | 'agreed' | 'issued' } | null;
  onStage?: () => void;
  revision?: string | null;
  onRevision?: () => void;
  scope?: 'SHARED' | 'PERSONAL';
  onScope?: (v: string) => void;
  /** К чему документ относится. Пусто — «Привязать» */
  tag?: string | null;
  onTag?: () => void;
  peers?: DocRowPeer[];
  /** «сохранено» / «сохраняю…» / «не сохранено — разберите правку» */
  saveState: 'saved' | 'saving' | 'idle' | 'conflict';
  menu?: DocRowMenuItem[];
}

const STAGE_TONE: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-350',
  check: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  agreed: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400',
  issued: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
};

export default function DocRow(p: DocRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const saved = p.saveState === 'saving' ? 'сохраняю…'
    : p.saveState === 'conflict' ? 'не сохранено — разберите правку'
      : p.saveState === 'saved' ? 'сохранено' : '';

  return (
    <div className="flex items-center gap-2 px-3 shrink-0 bg-white dark:bg-slate-900
                    border-b border-slate-200 dark:border-slate-800"
      style={{ height: DOC_ROW_H }}>
      <button type="button" onClick={p.onClose} title="Вернуться туда, откуда открыли"
        className="flex items-center gap-1 text-2xs font-semibold text-slate-500 hover:text-slate-800
                   dark:hover:text-slate-150 cursor-pointer shrink-0">
        <ArrowLeft className="w-3.5 h-3.5" /> Закрыть
      </button>
      <span className="shrink-0">{p.icon}</span>
      <input
        value={p.name}
        onChange={(e) => p.onRename(e.target.value)}
        title="Имя документа — то же, что на значке стола"
        className="text-2xs font-bold text-slate-800 dark:text-slate-150 bg-transparent min-w-32 max-w-72
                   border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700
                   focus:border-emerald-500 focus:outline-none px-1 py-0.5"
      />
      {p.stage && (
        <button type="button" onClick={p.onStage} disabled={!p.onStage}
          title="Стадия документа"
          className={`shrink-0 px-2 h-5 rounded-full text-[10px] font-bold ${STAGE_TONE[p.stage.tone]}
                      ${p.onStage ? 'cursor-pointer' : 'cursor-default'}`}>
          {p.stage.label}
        </button>
      )}
      {p.revision && (
        <button type="button" onClick={p.onRevision} disabled={!p.onRevision}
          title="История версий этой ревизии и выпуск следующей"
          className={`shrink-0 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400
                      ${p.onRevision ? 'cursor-pointer hover:text-emerald-600' : 'cursor-default'}`}>
          ред. {p.revision}
        </button>
      )}
      {p.scope && p.onScope && (
        <select value={p.scope} onChange={(e) => p.onScope?.(e.target.value)}
          title="Общий — виден всем; Личный — только вам"
          className="shrink-0 h-5 text-[10px] font-semibold px-1.5 rounded-md border border-slate-200
                     dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-350 cursor-pointer">
          <option value="SHARED">Общий</option>
          <option value="PERSONAL">Личный</option>
        </select>
      )}
      {p.onTag && (
        <button type="button" onClick={p.onTag}
          title="К чему относится документ. Отсюда он попадает в связи проекта"
          className="shrink-0 h-5 px-2 rounded-md text-[10px] font-bold text-emerald-700 dark:text-emerald-400
                     hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer">
          ◆ {p.tag || 'Привязать'}
        </button>
      )}

      <div className="flex-1 min-w-2" />

      {!!p.peers?.length && (
        <div className="flex items-center shrink-0" title={`В документе: ${p.peers.map((x) => x.name).join(', ')}`}>
          <div className="flex -space-x-1.5">
            {p.peers.slice(0, 5).map((x) => (
              <div key={x.socketId} title={x.name}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white
                           ring-2 ring-white dark:ring-slate-900"
                style={{ background: x.color }}>
                {x.name.trim().charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      )}
      <span className={`shrink-0 text-[10px] ${p.saveState === 'conflict'
        ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-400 dark:text-slate-455'}`}>
        {saved}
      </span>
      {!!p.menu?.length && (
        <div className="relative shrink-0">
          <button type="button" onClick={() => setMenuOpen((v) => !v)} title="Ещё о документе"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-150
                       hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-64 py-1 rounded-xl shadow-2xl
                              bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {p.menu.map((m) => (
                  <button key={m.label} type="button"
                    onClick={() => { setMenuOpen(false); m.run(); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer">
                    <span className="block text-2xs font-bold text-slate-700 dark:text-slate-300">{m.label}</span>
                    {m.hint && <span className="block text-[10px] text-slate-400 dark:text-slate-455 leading-snug">{m.hint}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
