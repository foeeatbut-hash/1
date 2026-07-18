import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Простое контекстное меню (ПКМ) в стиле Windows: портал поверх всего,
// закрывается по клику вне, Escape и прокрутке.
export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number; items: MenuItem[]; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    return () => {
      window.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  // Не выезжаем за края окна
  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 230),
    top: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - items.length * 34 - 16),
  };

  return createPortal(
    <div ref={ref} className="fixed z-[95] min-w-52 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl select-none" style={style} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => (
        <button
          key={i}
          disabled={it.disabled}
          onClick={() => { onClose(); it.onClick(); }}
          className={`w-full flex items-center gap-2.5 px-3.5 py-1.5 text-left text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default ${
            it.danger
              ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {it.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{it.icon}</span>}
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
