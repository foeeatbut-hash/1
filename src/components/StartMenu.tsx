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
import { useOverlay } from '../store/overlayStore';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Settings, LogOut, Sun, Moon, ArrowRight, Pin, PinOff, FolderOpen } from 'lucide-react';
import { SECTIONS } from '../workspace/sections';
import { useStore } from '../store/store';
import { rememberSectionUse, recentSections } from '../store/workspaceStore';
import { useDesktopStore } from '../store/desktopStore';
import { useInsightStore } from '../store/insightStore';
import { groupSections, countFound, visibleRecent } from '../lib/startMenu';
import { BAR_H, START_W, TILE_BOX, TILE_ICON } from '../lib/metrics';
import { Z } from '../lib/layers';
import ContextMenu, { MenuItem } from './ContextMenu';
import { can } from '../lib/permissions';

export default function StartMenu({ onClose }: { onClose: () => void }) {
  // Пока это открыто, страница браузера уступает место: родной слой Chromium
  // выше любой разметки, и без этого панель оказалась бы под страницей
  useOverlay(true);
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const togglePalette = useInsightStore((s) => s.togglePalette);
  const navigate = useNavigate();
  const apps = useDesktopStore((s) => s.apps);
  const pinApp = useDesktopStore((s) => s.pinApp);
  const unpinApp = useDesktopStore((s) => s.unpinApp);
  const bar = useDesktopStore((s) => s.bar);
  const pinBar = useDesktopStore((s) => s.pinBar);
  const unpinBar = useDesktopStore((s) => s.unpinBar);
  const [q, setQ] = React.useState('');
  const [menu, setMenu] = React.useState<{ x: number; y: number; path: string } | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Пока значок тянут из меню, закрывать его нельзя: ронять будет некуда */
  const dragging = React.useRef(false);
  const isAdmin = user?.role === 'ADMIN';

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  // Закрытие по Esc и по нажатию мимо меню: и то и другое ожидаемо
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    const onDown = (e: MouseEvent) => {
      if (dragging.current) return;
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

  const groups = React.useMemo(
    // Разделы, закрытые правом, в Пуске не показываются: видный в меню, но
    // закрытый раздел — обещание, которое программа не выполнит
    () => groupSections(SECTIONS as any, isAdmin, q, (f) => can(user as any, f)),
    [isAdmin, q, user],
  );
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
  const onBar = (path: string) => bar.includes(path);
  const menuItems: MenuItem[] = menu ? [
    { label: 'Открыть', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => go(menu.path) },
    pinned(menu.path)
      ? { label: 'Убрать с рабочего стола', icon: <PinOff className="w-3.5 h-3.5" />, onClick: () => unpinApp(menu.path) }
      : { label: 'Закрепить на рабочем столе', icon: <Pin className="w-3.5 h-3.5" />, onClick: () => pinApp(menu.path) },
    onBar(menu.path)
      ? { label: 'Открепить от панели задач', icon: <PinOff className="w-3.5 h-3.5" />, onClick: () => unpinBar(menu.path) }
      : { label: 'Закрепить на панели задач', icon: <Pin className="w-3.5 h-3.5" />, onClick: () => pinBar(menu.path) },
  ] : [];

  const Tile = ({ path, title }: { path: string; title: string }) => {
    const Icon = iconOf(path) as any;
    return (
      <button
        type="button"
        onClick={() => go(path)}
        /* Программу тянут отсюда на стол и на панель задач — это и есть
           «закрепить». Пуск при этом не закрывается по первому нажатию: пока
           тянут, меню обязано остаться, иначе значок ронять некуда */
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'app_pin', path }));
          dragging.current = true;
        }}
        onDragEnd={() => { dragging.current = false; onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, path }); }}
        /* Та же метка, что у пункта меню и кнопки на панели задач: демонстрация
           показывает раздел там, где он есть в этой оболочке, а не там, где его
           когда-то нарисовали */
        data-tour={`nav-${path}`}
        title={pinned(path) ? `${title} — на рабочем столе` : `${title} — потяните на стол или панель, чтобы закрепить`}
        className="flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer min-w-0
                   text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850
                   transition-colors"
      >
        <span
          style={{ width: TILE_BOX, height: TILE_BOX }}
          className="rounded-[10px] bg-slate-100 dark:bg-slate-850 flex items-center justify-center
                     text-emerald-700 dark:text-emerald-400 shrink-0"
        >
          {Icon && <Icon size={TILE_ICON} />}
        </span>
        <span className="text-2xs leading-tight text-center w-full">{title}</span>
      </button>
    );
  };

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Пуск"
      /* Над панелью, у левого края — оттуда же, откуда его позвали.
         Портал в body и слой из lib/layers: раньше меню рисовалось внутри
         панели задач и потому оказывалось ПОД окнами программ — Пуск,
         перекрытый окном, читается как «это не система» вернее всего
         остального */
      style={{ left: 8, bottom: BAR_H + 6, zIndex: Z.start, width: START_W }}
      className="fixed max-w-[calc(100vw-1rem)]
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
        <span
          style={{ width: TILE_BOX, height: TILE_BOX }}
          className="rounded-full shrink-0 flex items-center justify-center text-2xs font-bold
                     bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
        >
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
          style={{ width: TILE_BOX, height: TILE_BOX }}
          className="rounded-lg cursor-pointer flex items-center justify-center text-slate-500
                     hover:bg-slate-200 dark:hover:bg-slate-850 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          type="button" onClick={() => go('/settings')} title="Параметры программы"
          style={{ width: TILE_BOX, height: TILE_BOX }}
          className="rounded-lg cursor-pointer flex items-center justify-center text-slate-500
                     hover:bg-slate-200 dark:hover:bg-slate-850 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          type="button" onClick={() => { onClose(); setUser(null); }} title="Выйти"
          style={{ width: TILE_BOX, height: TILE_BOX }}
          className="rounded-lg cursor-pointer flex items-center justify-center text-slate-500
                     hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>,
    document.body,
  );
}
