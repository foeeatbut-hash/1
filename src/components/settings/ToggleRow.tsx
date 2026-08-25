/**
 * Строка-переключатель в Параметрах: хранит своё значение в localStorage и
 * сообщает об изменении событием, чтобы слушатели не тянули сюда импорт.
 *
 * Отдельным файлом по той же причине, что и лист «Общие»: экран Параметров
 * упирался в потолок размера.
 */
import React, { useState, useEffect } from 'react';

export default function ToggleRow({ storageKey, event, title, desc }: {
  storageKey: string; event: string; title: string; desc: string;
}) {
  const [on, setOn] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) !== '0'; } catch { return true; }
  });
  const flip = () => {
    const next = !on;
    setOn(next);
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent(event)); } catch (_) {}
  };
  return (
    <button type="button" onClick={flip} role="switch" aria-checked={on}
      className="w-full flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-left hover:border-emerald-500 transition-ui cursor-pointer">
      <span className={`mt-0.5 shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words text-pretty">{desc}</span>
      </span>
    </button>
  );
}
