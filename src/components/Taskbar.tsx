/**
 * Нижняя панель задач: Пуск, закреплённые программы, открытые разделы и трей.
 *
 * Заменяет левое меню в роли «куда пойти»: разделы одного уровня стоят в один
 * ряд, а не столбиком, и по одному нажатию открываются в активной панели.
 *
 * Здесь только разметка и подписки на хранилища. Что на панели стоит, в каком
 * порядке и когда прячутся подписи — считает src/lib/taskbar.ts: это ломается
 * незаметно и потому проверяется скриптом.
 *
 * Ни одна кнопка не нарисована «на будущее»: всё, что видно, работает. Звук,
 * «кто в проекте» и связь появятся вместе со своими механизмами, а не раньше.
 */
import React from 'react';
import { Bell, LayoutGrid, Sun, Moon, Settings, LogOut } from 'lucide-react';
import { SECTIONS } from '../workspace/sections';
import { useWorkspaceStore, visiblePanes, openSectionWindow } from '../store/workspaceStore';
import { useStore } from '../store/store';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/notificationStore';
import { useMailStore } from '../store/mailStore';
import { buildTaskbar, clockLabel, deadlineLabel, badgeLabel } from '../lib/taskbar';
import ContextMenu, { MenuItem } from './ContextMenu';
import StartMenu, { rememberSection } from './StartMenu';

/** Минута — самый крупный шаг, который видно на часах без секунд */
function useNow(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Taskbar() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const activeProject = useStore((s) => s.activeProject);
  const navigate = useNavigate();
  const panes = useWorkspaceStore((s) => s.panes);
  const layout = useWorkspaceStore((s) => s.layout);
  const activePath = useWorkspaceStore((s) => {
    const p = s.panes.find((x) => x.id === s.activePaneId);
    return p ? (p.stack.includes(p.active) ? p.active : p.stack[p.stack.length - 1]) : '/';
  });
  const openInActivePane = useWorkspaceStore((s) => s.openInActivePane);
  const notifUnread = useNotificationStore((s) => s.unread);
  const chatUnread = useNotificationStore((s) => s.chatUnread);
  const togglePanel = useNotificationStore((s) => s.togglePanel);
  const unreadByAccount = useMailStore((s) => s.unreadByAccount);
  const now = useNow();
  const [menu, setMenu] = React.useState<{ x: number; y: number; path: string } | null>(null);
  const [userMenu, setUserMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [startOpen, setStartOpen] = React.useState(false);

  // Раздел, открытый с панели или из меню, попадает в «недавние». Здесь, а не в
  // хранилище рабочего стола: список нужен только Пуску и переживает закрытие
  const openSection = React.useCallback((path: string) => {
    rememberSection(path);
    openInActivePane(path);
  }, [openInActivePane]);

  // Открытые разделы — объединение стеков видимых панелей. Скрытые панели
  // (режим «одно окно») своих разделов на панель задач не выносят: человек их
  // сейчас не видит, и кнопка вела бы в пустоту
  const open = React.useMemo(() => {
    const seen: string[] = [];
    for (const p of visiblePanes({ panes, layout })) {
      for (const path of p.stack) if (!seen.includes(path)) seen.push(path);
    }
    return seen;
  }, [panes, layout]);

  const mail = React.useMemo(
    () => Object.values(unreadByAccount).reduce((a, b) => a + (b || 0), 0),
    [unreadByAccount],
  );

  const view = React.useMemo(
    () => buildTaskbar(SECTIONS, {
      open,
      activePath,
      counts: { mail, chat: chatUnread },
      isAdmin: user?.role === 'ADMIN',
    }),
    [open, activePath, mail, chatUnread, user?.role],
  );

  const iconOf = (path: string) => SECTIONS.find((s) => s.path === path)?.icon;

  const menuItems: MenuItem[] = menu ? [
    { label: 'Открыть', onClick: () => openSection(menu.path) },
    { label: 'Открыть в отдельном окне', onClick: () => openSectionWindow(menu.path) },
  ] : [];

  // Всё, что жило в подвале левого меню: без этого спрятать меню было бы нельзя
  const userItems: MenuItem[] = [
    { label: 'Параметры программы', icon: <Settings className="w-3.5 h-3.5" />, onClick: () => openSection('/settings') },
    {
      label: theme === 'dark' ? 'Светлая тема' : 'Тёмная тема',
      icon: theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />,
      onClick: toggleTheme,
    },
    { label: 'Выйти', icon: <LogOut className="w-3.5 h-3.5" />, onClick: () => { setUser(null); navigate('/'); } },
  ];

  const initials = (user?.name || '')
    .split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  return (
    <div
      role="toolbar"
      aria-label="Панель задач"
      /* 52 точки: кнопка 36 плюс по 8 сверху и снизу. Ниже 48 — мажешь мимо,
         выше 56 — панель начинает есть экран */
      className="relative z-30 h-[52px] shrink-0 flex items-center gap-1.5 px-3
                 bg-white dark:bg-dark-surface border-t border-slate-200 dark:border-dark-border"
    >
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}

      {/* Пуск — единственная кнопка с заливкой на всей панели, чтобы её
          находили не глядя */}
      <button
        type="button"
        onClick={() => setStartOpen((v) => !v)}
        aria-expanded={startOpen}
        title="Пуск — все разделы и поиск"
        className="flex items-center gap-2 h-9 px-4 rounded-[10px] shrink-0 cursor-pointer
                   bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
      >
        <LayoutGrid className="w-[18px] h-[18px] shrink-0" />
        <span>Пуск</span>
      </button>

      <div className="w-3 shrink-0" />

      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
        {view.buttons.map((b) => {
          const Icon = iconOf(b.path) as any;
          return (
            <button
              key={b.path}
              type="button"
              onClick={() => openSection(b.path)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, path: b.path }); }}
              title={b.title}
              aria-current={b.active ? 'true' : undefined}
              className={`relative h-9 px-3 rounded-[10px] shrink-0 cursor-pointer flex items-center gap-2
                          text-sm whitespace-nowrap transition-colors border ${
                b.active
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold border-transparent'
                  : b.running
                    ? 'bg-white dark:bg-dark-bg border-slate-200 dark:border-dark-border text-slate-700 dark:text-slate-150'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              {Icon && <Icon className="w-[18px] h-[18px] shrink-0" />}
              {view.labels && <span>{b.title}</span>}
              {b.badge > 0 && (
                <span className="shrink-0 px-1.5 h-[18px] min-w-[18px] rounded-full bg-rose-600 text-white
                                 text-2xs font-bold tabular-nums flex items-center justify-center">
                  {badgeLabel(b.badge)}
                </span>
              )}
              {/* Подчёркивание — «запущена». Видно боковым зрением и не спорит
                  с заливкой активной кнопки */}
              {b.running && (
                <span
                  aria-hidden
                  className={`absolute bottom-[-6px] h-[3px] rounded-sm bg-emerald-600 dark:bg-emerald-400 ${
                    b.active ? 'left-[16%] right-[16%]' : 'left-[24%] right-[24%]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {view.tidy && (
        <span className="shrink-0 text-2xs text-amber-700 dark:text-amber-400 px-2 whitespace-nowrap">
          открыто много — <button type="button" onClick={() => openSection('/')} className="underline cursor-pointer">на Главную</button>
        </span>
      )}

      {/* Трей: проект, часы со сроком, уведомления. Порядок зон не меняется
          никогда — по нему запоминают, куда вести мышь */}
      <div className="shrink-0 flex items-center gap-1">
        {activeProject && (
          <button
            type="button"
            onClick={() => openSection('/projects')}
            title={`Проект «${activeProject.name}» — сменить`}
            className="flex items-center gap-2 h-9 px-3 rounded-[10px] cursor-pointer max-w-[200px]
                       border border-slate-200 dark:border-dark-border text-sm
                       text-slate-700 dark:text-slate-150 hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors"
          >
            <span aria-hidden className="w-2 h-2 rounded-sm bg-emerald-500 shrink-0" />
            <span className="truncate font-semibold">{activeProject.name}</span>
          </button>
        )}

        <div className="flex flex-col items-end leading-tight px-3 tabular-nums select-none">
          <b className="text-sm font-semibold text-slate-800 dark:text-slate-150">{clockLabel(now)}</b>
          <span className="text-2xs text-slate-500 dark:text-slate-400">{deadlineLabel(null, now)}</span>
        </div>

        <button
          type="button"
          onClick={togglePanel}
          title={notifUnread > 0 ? `Уведомления: ${notifUnread} непрочитанных` : 'Уведомления'}
          className="relative w-10 h-9 rounded-[10px] cursor-pointer flex items-center justify-center
                     text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors"
        >
          <Bell className="w-[19px] h-[19px]" />
          {notifUnread > 0 && (
            <span aria-hidden className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-rose-600" />
          )}
        </button>

        <button
          type="button"
          onClick={(e) => setUserMenu({ x: e.clientX, y: e.clientY })}
          title={user?.name || 'Профиль'}
          className="w-9 h-9 rounded-full cursor-pointer flex items-center justify-center shrink-0
                     bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400
                     text-2xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors"
        >
          {initials}
        </button>

        {/* Полоска «показать стол» у самого края: мышь упирается в угол и
            попадает не глядя. Девять точек, которые ничего не стоят */}
        <button
          type="button"
          onClick={() => openSection('/')}
          title="Показать Главную"
          aria-label="Показать Главную"
          className="w-2.5 self-stretch my-1.5 ml-1 rounded-sm cursor-pointer
                     border-l border-slate-200 dark:border-dark-border
                     hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors"
        />
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {userMenu && <ContextMenu x={userMenu.x} y={userMenu.y} items={userItems} onClose={() => setUserMenu(null)} />}
    </div>
  );
}
