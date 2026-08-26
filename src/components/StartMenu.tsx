/**
 * Меню «Пуск»: строка поиска, все программы, недавние и подвал с профилем.
 *
 * Раньше кнопка «Пуск» открывала общий поиск — это отвечало на «найди мне», но
 * не на «что тут вообще есть». Меню отвечает на второй вопрос: разделы видно
 * списком, включая те, что не влезли на панель задач.
 *
 * Отбор по правам, поиск по названию и список недавних считает
 * src/lib/startMenu.ts — там же они и проверяются.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Settings, LogOut, Sun, Moon, ArrowRight, Pin, PinOff, FolderOpen } from 'lucide-react';
import { SECTIONS } from '../workspace/sections';
import { useStore } from '../store/store';
import { rememberSectionUse, recentSections } from '../store/workspaceStore';
import { useDesktopStore } from '../store/desktopStore';
import { useInsightStore } from '../store/insightStore';
import { groupSections, countFound, visibleRecent } from '../lib/startMenu';
import ContextMenu, { MenuItem } from './ContextMenu';

export default function StartMenu({ onClose }: { onClose: () => void }) {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const togglePalette = useInsightStore((s) => s.togglePalette);
  const navigate = useNavigate();
  const apps = useDesktopStore((s) => s.apps);
  const pinApp = useDesktopStore((s) => s.pinApp);
  const unpinApp = useDesktopStore((s) => s.unpinApp);
  const [q, setQ] = React.useState('');
  const [menu, setMenu] = React.useState<{ x: number; y: number; path: string } | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === 'ADMIN';

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  // Закрытие по Esc и по нажатию мимо меню: и то и другое ожидаемо
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // capture: иначе кнопка «Пуск» успеет закрыть и тут же открыть меню заново
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [onClose]);

  const groups = React.useMemo(() => groupSections(SECTIONS as any, isAdmin, q), [isAdmin, q]);
  const found = countFound(groups);
  // Список ведёт рабочий стол; здесь только убираем недоступное по правам
  const recent = React.useMemo(
    () => (q ? [] : visibleRecent(recentSections(), SECTIONS as any, isAdmin)),
    [q, isAdmin],
  );

  // Открыть — только перейти по адресу. Окно или вкладку панели заводит сама
  // оболочка: она одна знает, в каком виде сейчас показываются разделы, и
  // меню не должно об этом гадать. Раньше здесь звали панели напрямую, и в
  // оконной оболочке нажатие в Пуске не открывало ничего
  const go = (path: string) => { rememberSectionUse(path); navigate(path); onClose(); };
  const iconOf = (path: string) => SECTIONS.find((s) => s.path === path)?.icon;

  // Значок программы можно снять со стола — значит, его надо уметь вернуть.
  // Место возврата очевидное: там же, где программы и перечислены
  const pinned = (path: string) => apps.includes(path);
  const menuItems: MenuItem[] = menu ? [
    { label: 'Открыть', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => go(menu.path) },
    pinned(menu.path)
      ? { label: 'Убрать с рабочего стола', icon: <PinOff className="w-3.5 h-3.5" />, onClick: () => unpinApp(menu.path) }
      : { label: 'Закрепить на рабочем столе', icon: <Pin className="w-3.5 h-3.5" />, onClick: () => pinApp(menu.path) },
  ] : [];

  const Tile = ({ path, title }: { path: string; title: string }) => {
    const Icon = iconOf(path) as any;
    return (
      <button
        type="button"
        onClick={() => go(path)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, path }); }}
        title={pinned(path) ? `${title} — на рабочем столе` : title}
        className="flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer min-w-0
                   text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850
                   transition-colors"
      >
        <span className="w-9 h-9 rounded-[10px] bg-slate-100 dark:bg-slate-850 flex items-center justify-center
                         text-emerald-700 dark:text-emerald-400 shrink-0">
          {Icon && <Icon className="w-[19px] h-[19px]" />}
        </span>
        <span className="text-2xs leading-tight text-center w-full">{title}</span>
      </button>
    );
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Пуск"
      /* Над панелью, у левого края — оттуда же, откуда его позвали */
      className="absolute left-2 bottom-[56px] z-50 w-[520px] max-w-[calc(100vw-1rem)]
                 rounded-2xl border border-slate-200 dark:border-dark-border
                 bg-white dark:bg-dark-surface shadow-2xl overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-dark-border">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter с запросом уводит в общий поиск: там ищется не только по
            // названиям разделов, но и по тегам, оборудованию и письмам
            if (e.key === 'Enter' && q.trim()) { onClose(); togglePalette(); }
          }}
          placeholder="Найти раздел, а по Enter — искать везде"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm
                     text-slate-800 dark:text-slate-150 placeholder:text-slate-400"
        />
        {q && (
          <button
            type="button"
            onClick={() => { onClose(); togglePalette(); }}
            className="shrink-0 flex items-center gap-1 text-2xs text-emerald-700 dark:text-emerald-400 cursor-pointer"
          >
            искать везде <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="max-h-[52vh] overflow-y-auto">
        {found === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Раздела с таким названием нет. Enter — искать по тегам, оборудованию и письмам.
          </p>
        )}

        {recent.length > 0 && (
          <section>
            <h3 className="px-4 pt-3 pb-1 text-2xs font-bold uppercase tracking-wider text-slate-400">Недавние</h3>
            <div className="px-2 pb-2">
              {recent.map((s) => {
                const Icon = iconOf(s.path) as any;
                return (
                  <button
                    key={s.path}
                    type="button"
                    onClick={() => go(s.path)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-left
                               text-sm text-slate-600 dark:text-slate-300
                               hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors"
                  >
                    {Icon && <Icon className="w-4 h-4 shrink-0 text-slate-400" />}
                    <span className="truncate">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {groups.map((g) => (
          <section key={g.id} className={g.id === 'project' && recent.length > 0 ? 'border-t border-slate-200 dark:border-dark-border' : undefined}>
            <h3 className="px-4 pt-3 pb-1 text-2xs font-bold uppercase tracking-wider text-slate-400">{g.title}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1 px-2 pb-2">
              {g.items.map((s) => <Tile key={s.path} path={s.path} title={s.title} />)}
            </div>
          </section>
        ))}

      </div>

      {/* Подвал: кто вошёл и то, что раньше жило в подвале левого меню */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-200 dark:border-dark-border
                      bg-slate-50 dark:bg-dark-bg">
        <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-2xs font-bold
                         bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
          {(user?.name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-sm font-semibold text-slate-800 dark:text-slate-150 truncate">{user?.name || 'Профиль'}</b>
          <span className="block text-2xs text-slate-500 dark:text-slate-400 truncate">
            {isAdmin ? 'Администратор' : 'Сотрудник'}
          </span>
        </span>
        <button
          type="button" onClick={toggleTheme} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          className="w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center text-slate-500
                     hover:bg-slate-200 dark:hover:bg-slate-850 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          type="button" onClick={() => go('/settings')} title="Параметры программы"
          className="w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center text-slate-500
                     hover:bg-slate-200 dark:hover:bg-slate-850 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          type="button" onClick={() => { onClose(); setUser(null); }} title="Выйти"
          className="w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center text-slate-500
                     hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}
