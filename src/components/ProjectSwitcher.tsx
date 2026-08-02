/**
 * Переключатель активного проекта.
 *
 * Раньше активный проект был подписью в углу под логотипом, а сменить его
 * можно было только со стартового экрана — при том что без выбранного
 * проекта пять разделов не работают вовсе. Теперь он виден всегда и
 * переключается на месте, из любого раздела.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, FolderKanban, Search } from 'lucide-react';
import { useStore } from '../store/store';
import { dataService } from '../services/dataService';

type Project = { id: string; name: string };

export default function ProjectSwitcher({ compact }: { compact: boolean }) {
  const { activeProject, setActiveProject } = useStore();
  const [open, setOpen] = React.useState(false);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await dataService.getProjects();
      setProjects((list || []).map((p: any) => ({ id: p.id, name: p.name })));
    } catch (_) {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.left) });
    setOpen(true);
    setQuery('');
    load();
  };

  // Esc закрывает — как и все остальные всплывающие окна программы
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const shown = projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={activeProject ? `Активный проект: ${activeProject.name}. Сменить` : 'Выбрать проект'}
        className={`w-full flex items-center rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-panel hover:border-emerald-600 dark:hover:border-emerald-400 cursor-pointer ${
          compact ? 'justify-center p-1.5' : 'gap-1 px-1.5 py-1'
        }`}
        title={activeProject ? `Проект: ${activeProject.name}` : 'Проект не выбран'}
      >
        <FolderKanban className={`w-3.5 h-3.5 shrink-0 ${activeProject ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
        {!compact && (
          <>
            <span className={`text-2xs font-semibold leading-tight text-left line-clamp-2 flex-1 min-w-0 ${activeProject ? 'text-slate-700 dark:text-dark-text-main' : 'text-slate-400 dark:text-dark-text-muted'}`}>
              {activeProject?.name || 'Проект не выбран'}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 text-slate-400" />
          </>
        )}
      </button>

      {open && pos && createPortal(
        <div className="fixed inset-0 z-[80]" onMouseDown={() => setOpen(false)}>
          <div
            className="absolute w-72 max-h-[70vh] flex flex-col rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-panel shadow-xl overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={(e) => e.stopPropagation()}
            role="listbox"
            aria-label="Выбор проекта"
          >
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-200 dark:border-dark-border">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти проект"
                className="flex-1 bg-transparent text-xs outline-none text-slate-800 dark:text-dark-text-main placeholder:text-slate-400"
              />
            </div>

            <div className="overflow-y-auto scrollbar-thin py-1">
              {loading && <p className="px-3 py-3 text-xs text-slate-400">Загружаю список проектов…</p>}

              {!loading && shown.length === 0 && (
                <p className="px-3 py-3 text-xs text-slate-500 dark:text-dark-text-muted">
                  {projects.length === 0
                    ? 'Проектов пока нет. Создайте первый в разделе «Проекты».'
                    : 'Ничего не найдено — попробуйте другое название.'}
                </p>
              )}

              {shown.map((p) => {
                const active = activeProject?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { setActiveProject(p); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs cursor-pointer ${
                      active
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold'
                        : 'text-slate-700 dark:text-dark-text-main hover:bg-slate-100 dark:hover:bg-dark-surface'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  </button>
                );
              })}
            </div>

            {activeProject && (
              <button
                type="button"
                onClick={() => { setActiveProject(null); setOpen(false); }}
                className="shrink-0 px-3 py-2 text-2xs text-slate-500 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-surface border-t border-slate-200 dark:border-dark-border text-left cursor-pointer"
              >
                Работать без проекта
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
