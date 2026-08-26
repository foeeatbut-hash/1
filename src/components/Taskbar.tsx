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
import { Bell, LayoutGrid, Sun, Moon, Settings, LogOut, MessageCircleQuestion, LifeBuoy, AppWindow, Columns2, PanelLeft } from 'lucide-react';
import { SECTIONS } from '../workspace/sections';
import { useWorkspaceStore, visiblePanes, openSectionWindow, rememberSectionUse } from '../store/workspaceStore';
import { useStore, type ShellMode } from '../store/store';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/notificationStore';
import { useAssistantStore } from '../store/assistantStore';
import { useMailStore } from '../store/mailStore';
import { useWindowStore, openPaths, activeWindowPath } from '../store/windowStore';
import { buildTaskbar, clockLabel, deadlineLabel, badgeLabel, trayFit } from '../lib/taskbar';
import ContextMenu, { MenuItem } from './ContextMenu';
import StartMenu from './StartMenu';
import { WorkspaceRailControls } from './Workspace';

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
  const shell = useStore((s) => s.shell);
  const setShell = useStore((s) => s.setShell);
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
  const windows = useWindowStore((s) => s.windows);
  const toggleWindow = useWindowStore((s) => s.toggle);
  const minimizeAll = useWindowStore((s) => s.minimizeAll);
  const tileAll = useWindowStore((s) => s.tileAll);
  const notifUnread = useNotificationStore((s) => s.unread);
  const chatUnread = useNotificationStore((s) => s.chatUnread);
  const togglePanel = useNotificationStore((s) => s.togglePanel);
  const notifOpen = useNotificationStore((s) => s.panelOpen);
  const setNotifOpen = useNotificationStore((s) => s.setPanelOpen);
  const assistantOpen = useAssistantStore((s) => s.isOpen);
  const setAssistantOpen = useAssistantStore((s) => s.setOpen);
  const unreadByAccount = useMailStore((s) => s.unreadByAccount);
  const now = useNow();
  const [menu, setMenu] = React.useState<{ x: number; y: number; path: string } | null>(null);
  const [userMenu, setUserMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [startOpen, setStartOpen] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [barWidth, setBarWidth] = React.useState(0);

  // Ширина всей панели решает, что из необязательного показывать в трее
  React.useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarWidth(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = trayFit(barWidth);

  // Ширину полосы кнопок меряем сами: влезут ли подписи, знает только экран.
  // Полоса тянется по остатку и от своего содержимого не зависит — поэтому
  // измерение устойчиво и подписи не мигают
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Раздел, открытый с панели или из меню, попадает в «недавние». Здесь, а не в
  // хранилище рабочего стола: список нужен только Пуску и переживает закрытие
  const windowed = shell === 'windows';
  const openSection = React.useCallback((path: string) => {
    rememberSectionUse(path);
    if (windowed) toggleWindow(path); else openInActivePane(path);
  }, [windowed, toggleWindow, openInActivePane]);

  /**
   * Что считать «открытым». В окнах — открытые окна, включая свёрнутые: у
   * свёрнутого есть кнопка, за ней его и возвращают. В панелях — стеки видимых
   * панелей; скрытая панель своих разделов не выносит, кнопка вела бы в пустоту.
   */
  const open = React.useMemo(() => {
    if (windowed) return openPaths(windows);
    const seen: string[] = [];
    for (const p of visiblePanes({ panes, layout })) {
      for (const path of p.stack) if (!seen.includes(path)) seen.push(path);
    }
    return seen;
  }, [windowed, windows, panes, layout]);

  // Активная кнопка — раздел верхнего окна, а не активной панели
  const highlighted = windowed ? activeWindowPath(windows) : activePath;

  const mail = React.useMemo(
    () => Object.values(unreadByAccount).reduce((a, b) => a + (b || 0), 0),
    [unreadByAccount],
  );

  const view = React.useMemo(
    () => buildTaskbar(SECTIONS, {
      open,
      activePath: highlighted,
      counts: { mail, chat: chatUnread },
      isAdmin: user?.role === 'ADMIN',
      width,
    }),
    [open, highlighted, mail, chatUnread, user?.role, width],
  );

  const iconOf = (path: string) => SECTIONS.find((s) => s.path === path)?.icon;

  const menuItems: MenuItem[] = menu ? [
    { label: 'Открыть', onClick: () => openSection(menu.path) },
    { label: 'Открыть в отдельном окне', onClick: () => openSectionWindow(menu.path) },
  ] : [];

  /**
   * Вид оболочки — прямо здесь, а не только в Параметрах.
   *
   * Настройка меняет всё устройство экрана, но на самом экране никак не
   * подписана: попав не в ту оболочку, человек видит «почему-то вкладки» и не
   * знает, где это переключить. Место для такого — меню профиля: то же, где
   * лежат тема и выход.
   */
  const SHELLS: { key: ShellMode; label: string; icon: React.ReactNode }[] = [
    { key: 'windows', label: 'Разделы — окнами', icon: <AppWindow className="w-3.5 h-3.5" /> },
    { key: 'panes', label: 'Разделы — панелями', icon: <Columns2 className="w-3.5 h-3.5" /> },
    { key: 'menu', label: 'Разделы — меню слева', icon: <PanelLeft className="w-3.5 h-3.5" /> },
  ];

  // Всё, что жило в подвале левого меню: без этого спрятать меню было бы нельзя
  const userItems: MenuItem[] = [
    ...SHELLS.map((s): MenuItem => ({
      label: shell === s.key ? `${s.label} ✓` : s.label,
      icon: s.icon,
      disabled: shell === s.key,
      onClick: () => setShell(s.key),
    })),
    { label: 'Параметры программы', icon: <Settings className="w-3.5 h-3.5" />, onClick: () => openSection('/settings') },
    {
      label: theme === 'dark' ? 'Светлая тема' : 'Тёмная тема',
      icon: theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />,
      onClick: toggleTheme,
    },
    { label: 'Выйти', icon: <LogOut className="w-3.5 h-3.5" />, onClick: () => { setUser(null); navigate('/'); } },
  ];

  // Обе панели выезжают справа и заняли бы одно место — открываем по одной
  const openAssistant = () => { setNotifOpen(false); setAssistantOpen(!assistantOpen); };

  /**
   * Справка по тому разделу, где человек стоит, — то же, что F1. Помощник
   * отвечает на вопрос словами, руководство объясняет раздел целиком: это
   * разные нужды, поэтому и кнопки разные.
   */
  const openHandbook = () => {
    const path = highlighted || '/';
    if (path === '/handbook') return;
    const href = `/handbook?for=${encodeURIComponent(path)}`;
    useWorkspaceStore.getState().setFrozenHref(useWorkspaceStore.getState().activePaneId, '/handbook', href);
    rememberSectionUse('/handbook');
    navigate(href);
  };

  const trayBtn = (active: boolean) =>
    `relative w-10 h-9 rounded-[10px] cursor-pointer flex items-center justify-center transition-colors ${
      active
        ? 'bg-emerald-600 text-white'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850'
    }`;

  const initials = (user?.name || '')
    .split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Панель задач"
      /* 52 точки: кнопка 36 плюс по 8 сверху и снизу. Ниже 48 — мажешь мимо,
         выше 56 — панель начинает есть экран */
      /* Справа без отступа: последняя в ряду полоска «показать стол» обязана
         доходить до самого края окна, иначе угол экрана перестаёт быть целью */
      className="relative z-30 h-[52px] shrink-0 flex items-center gap-1.5 pl-3
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

      {/* Прокрутка видимая, а не убранная: при полутора десятках открытых
          разделов кнопки не помещаются ни при каких подписях, и обрезать их
          по краю — значит потерять их без следа. Так же сделаны вкладки
          внутри панели (см. Workspace) */}
      <div ref={rowRef} className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
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

      {view.tidy && fit.hint && (
        <span className="shrink-0 flex items-center gap-1.5 text-2xs text-amber-700 dark:text-amber-400 px-2 whitespace-nowrap">
          открыто много —
          {/* Настоящая кнопка, а не подчёркнутая строчка: в текст высотой в
              четырнадцать точек надо целиться, и мимо попадают чаще, чем в него */}
          <button
            type="button"
            onClick={() => (windowed ? tileAll() : openSection('/'))}
            className="h-7 px-2 rounded-lg cursor-pointer font-semibold
                       border border-amber-300 dark:border-amber-800
                       hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
          >
            {windowed ? 'разложить' : 'на Главную'}
          </button>
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
            style={{ maxWidth: fit.projectMax }}
            className="flex items-center gap-2 h-9 px-3 rounded-[10px] cursor-pointer
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

        {/* Раскладка панелей — только там, где панели и есть: в оконной
            оболочке раскладку задают сами окна */}
        {shell === 'panes' && fit.layout && (
          <div className="flex items-center">
            <WorkspaceRailControls horizontal />
          </div>
        )}

        <button
          type="button"
          onClick={openAssistant}
          title="Помощник: вопросы по проекту"
          data-tour="assistant-btn"
          className={trayBtn(assistantOpen)}
        >
          <MessageCircleQuestion className="w-[19px] h-[19px]" />
        </button>

        <button
          type="button"
          onClick={openHandbook}
          title="Руководство по этому разделу (F1)"
          className={trayBtn(false)}
        >
          <LifeBuoy className="w-[19px] h-[19px]" />
        </button>

        <button
          type="button"
          onClick={togglePanel}
          title={notifUnread > 0 ? `Уведомления: ${notifUnread} непрочитанных` : 'Уведомления'}
          data-tour="notif-btn"
          className={trayBtn(notifOpen)}
        >
          <Bell className="w-[19px] h-[19px]" />
          {notifUnread > 0 && (
            <span aria-hidden className={`absolute top-1.5 right-2 w-2 h-2 rounded-full ${chatUnread > 0 ? 'bg-emerald-500' : 'bg-rose-600'}`} />
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
          onClick={() => (windowed ? minimizeAll() : openSection('/'))}
          title={windowed ? 'Показать стол — свернуть все окна' : 'Показать Главную'}
          aria-label={windowed ? 'Свернуть все окна' : 'Показать Главную'}
          /* Во всю высоту панели и вплотную к краю окна: в угол экрана мышь
             упирается и попадает не глядя — тем полоска и берёт, а не
             размером. Отступы сверху и снизу этот угол отрезали */
          className="w-3 self-stretch ml-1 cursor-pointer
                     border-l border-slate-200 dark:border-dark-border
                     hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors"
        />
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {userMenu && <ContextMenu x={userMenu.x} y={userMenu.y} items={userItems} onClose={() => setUserMenu(null)} />}
    </div>
  );
}
