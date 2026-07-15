/**
 * Рабочий стол: держит разделы «живыми» и раскладывает их по 1/2/4 панелям.
 *
 * Ключевая механика keep-alive: каждый когда-либо открытый в панели раздел
 * остаётся смонтированным — мы лишь скрываем его (display:none). Чтобы скрытые
 * разделы не реагировали на смену глобального URL, каждый экземпляр обёрнут в
 * собственный низкоуровневый <Router> с «замороженным» location. Активный
 * раздел активной панели — «живой»: его location = глобальный URL, а его
 * навигация уходит в общий navigate (deep-link, кнопка назад, восстановление).
 */
import React, { Suspense } from 'react';
import {
  useLocation,
  useNavigate,
  Navigate,
  NavigationType,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
} from 'react-router-dom';
import type { Location, To } from 'react-router-dom';
import { X, SquareSplitHorizontal, Grid2x2, Square, ExternalLink } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { SECTIONS, sectionForPath, isKnownSection } from '../workspace/sections';
import { useStore } from '../store/store';

const iconFor = (path: string) => SECTIONS.find((s) => s.path === path);

const asHref = (l: Location | { pathname: string; search?: string; hash?: string }) =>
  `${l.pathname}${l.search || ''}${l.hash || ''}`;

function makeLocation(to: To, state: any = null): Location {
  if (typeof to === 'string') {
    const url = new URL(to, 'http://x');
    return { pathname: url.pathname, search: url.search, hash: url.hash, state, key: Math.random().toString(36).slice(2) };
  }
  return { pathname: to.pathname || '/', search: to.search || '', hash: to.hash || '', state, key: Math.random().toString(36).slice(2) };
}

// Один смонтированный экземпляр раздела в панели: замороженный или живой роутер
function SectionFrame({
  path,
  isLive,
  visible,
  liveLocation,
  globalNavigate,
}: {
  path: string;
  isLive: boolean;
  visible: boolean;
  liveLocation: Location;
  globalNavigate: (to: To, opts?: any) => void;
}) {
  const def = sectionForPath(path);
  const user = useStore((s) => s.user);
  const [frozenLoc, setFrozenLoc] = React.useState<Location>(() => makeLocation(path));

  // Пока раздел живой — запоминаем его location, чтобы при возврате открыть там же
  React.useEffect(() => {
    if (isLive && liveLocation.pathname === path) setFrozenLoc(liveLocation);
  }, [isLive, liveLocation, path]);

  const location = isLive ? liveLocation : frozenLoc;

  const navigator = React.useMemo(
    () => ({
      createHref: (to: To) => (typeof to === 'string' ? to : asHref({ pathname: to.pathname || '/', search: to.search, hash: to.hash })),
      encodeLocation: (to: To) => makeLocation(to),
      go: () => {},
      push: (to: To, state?: any) => (isLive ? globalNavigate(to, { state }) : setFrozenLoc(makeLocation(to, state))),
      replace: (to: To, state?: any) => (isLive ? globalNavigate(to, { state, replace: true }) : setFrozenLoc(makeLocation(to, state))),
    }),
    [isLive, globalNavigate],
  );

  if (def.adminOnly && user?.role !== 'ADMIN') {
    return visible ? <Navigate to="/" replace /> : null;
  }

  const Comp = def.Component;
  // Собственный контекст роутера для этого экземпляра раздела: нельзя вкладывать
  // <Router> в <Router>, поэтому подменяем location/navigator напрямую через
  // контексты react-router (ровно то, что делает <Router> внутри, но без запрета
  // на вложенность). Так скрытый раздел «заморожен» и не реагирует на смену URL.
  const navContext = React.useMemo(() => ({ basename: '', navigator: navigator as any, static: false }), [navigator]);
  const locContext = React.useMemo(() => ({ location, navigationType: NavigationType.Pop }), [location]);
  return (
    <div
      className={`absolute inset-0 ${def.pad ? 'p-6' : ''} ${def.scroll === 'fixed' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      style={{ display: visible ? 'block' : 'none' }}
      aria-hidden={!visible}
    >
      <UNSAFE_NavigationContext.Provider value={navContext}>
        <UNSAFE_LocationContext.Provider value={locContext}>
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" /></div>}>
            <Comp />
          </Suspense>
        </UNSAFE_LocationContext.Provider>
      </UNSAFE_NavigationContext.Provider>
    </div>
  );
}

// Одна панель рабочего стола
function PaneView({ paneId }: { paneId: string }) {
  const pane = useWorkspaceStore((s) => s.panes.find((p) => p.id === paneId));
  const layout = useWorkspaceStore((s) => s.layout);
  const activePaneId = useWorkspaceStore((s) => s.activePaneId);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const openInPane = useWorkspaceStore((s) => s.openInPane);
  const closeInPane = useWorkspaceStore((s) => s.closeInPane);
  const location = useLocation();
  const navigate = useNavigate();

  if (!pane) return null;
  const activePath = pane.stack[pane.stack.length - 1];
  const isActivePane = paneId === activePaneId;
  // Вкладки внутри панели показываем, когда открыто больше одного раздела
  const showTabs = pane.stack.length > 1;

  return (
    <div
      data-pane={paneId}
      onMouseDownCapture={() => { if (!isActivePane) setActivePane(paneId); }}
      className={`relative flex flex-col min-w-0 min-h-0 h-full bg-gradient-to-br from-slate-100 to-slate-200/70 dark:from-dark-bg dark:to-dark-surface ${
        layout !== 'single' ? `rounded-xl overflow-hidden border ${isActivePane ? 'border-emerald-500/70 ring-1 ring-emerald-500/30' : 'border-slate-200 dark:border-dark-border'}` : ''
      }`}
    >
      {showTabs && (
        <div className="shrink-0 flex items-stretch gap-1 px-2 pt-1.5 overflow-x-auto scrollbar-none bg-white/40 dark:bg-dark-surface/40">
          {pane.stack.map((p) => {
            const def = iconFor(p);
            const active = p === activePath;
            return (
              <div
                key={p}
                onMouseDown={(e) => { e.stopPropagation(); setActivePane(paneId); openInPane(paneId, p); }}
                className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-t-lg text-xs font-semibold cursor-pointer select-none ${
                  active ? 'bg-slate-100 dark:bg-dark-bg text-slate-900 dark:text-white' : 'text-slate-500 dark:text-dark-text-muted hover:bg-slate-100/60 dark:hover:bg-dark-bg/50'
                }`}
              >
                <span>{def?.title || p}</span>
                <button
                  onMouseDown={(e) => { e.stopPropagation(); closeInPane(paneId, p); }}
                  className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-300 dark:hover:bg-dark-border"
                  title="Закрыть вкладку"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        {pane.stack.map((p) => (
          <SectionFrame
            key={p}
            path={p}
            visible={p === activePath}
            isLive={isActivePane && p === activePath}
            liveLocation={location}
            globalNavigate={navigate}
          />
        ))}
      </div>
    </div>
  );
}

export default function Workspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const layout = useWorkspaceStore((s) => s.layout);
  const panes = useWorkspaceStore((s) => s.panes);
  const activePaneId = useWorkspaceStore((s) => s.activePaneId);
  const activePath = useWorkspaceStore((s) => {
    const p = s.panes.find((x) => x.id === s.activePaneId);
    return p ? p.stack[p.stack.length - 1] : '/';
  });
  const frozen = React.useRef<Map<string, Location>>(new Map());

  // URL → активная панель: внешняя навигация (deep-link, «назад», ассистент)
  React.useEffect(() => {
    if (!isKnownSection(location.pathname)) return;
    const st = useWorkspaceStore.getState();
    const ap = st.activePathOf(st.activePaneId);
    const key = `${st.activePaneId}::${location.pathname}`;
    if (location.pathname === ap) {
      frozen.current.set(key, location); // в синхроне — запоминаем живой location
      return;
    }
    frozen.current.set(key, location); // подхватываем с учётом ?search= из ссылки
    st.openInPane(st.activePaneId, location.pathname);
  }, [location]);

  // Активная панель → URL: клик по меню сменил активный раздел — двигаем URL
  React.useEffect(() => {
    if (location.pathname === activePath) return;
    const key = `${activePaneId}::${activePath}`;
    const remembered = frozen.current.get(key);
    navigate(remembered ? asHref(remembered) : activePath);
  }, [activePaneId, activePath]);

  const gridClass =
    layout === 'single'
      ? 'grid-cols-1 grid-rows-1'
      : layout === 'dual'
        ? 'grid-cols-2 grid-rows-1'
        : 'grid-cols-2 grid-rows-2';

  return (
    <div className={`w-full h-full grid ${gridClass} ${layout === 'single' ? '' : 'gap-2 p-2'}`}>
      {panes.map((p) => (
        <PaneView key={p.id} paneId={p.id} />
      ))}
    </div>
  );
}

// Панель управления раскладкой (кнопки 1/2/4 и вынос в отдельное окно).
// Выносим отдельным компонентом, чтобы разместить в шапке main.
export function WorkspaceToolbar() {
  const layout = useWorkspaceStore((s) => s.layout);
  const setLayout = useWorkspaceStore((s) => s.setLayout);
  const activePath = useWorkspaceStore((s) => {
    const p = s.panes.find((x) => x.id === s.activePaneId);
    return p ? p.stack[p.stack.length - 1] : '/';
  });

  const popOut = () => {
    const wc = (window as any).electron?.windowControls;
    if (wc?.openWindow) wc.openWindow(activePath);
    else window.open(`${window.location.origin}${window.location.pathname}#${activePath}`, '_blank', 'width=1280,height=800');
  };

  const Btn = ({ mode, title, children }: { mode: any; title: string; children: React.ReactNode }) => (
    <button
      onClick={() => setLayout(mode)}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
        layout === mode ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-dark-panel'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-xl bg-white/70 dark:bg-dark-surface/70 border border-slate-200 dark:border-dark-border shadow-sm">
      <Btn mode="single" title="Одно окно"><Square className="w-4 h-4" /></Btn>
      <Btn mode="dual" title="Две панели"><SquareSplitHorizontal className="w-4 h-4" /></Btn>
      <Btn mode="quad" title="Четыре панели"><Grid2x2 className="w-4 h-4" /></Btn>
      <div className="w-px h-4 bg-slate-200 dark:bg-dark-border mx-0.5" />
      <button onClick={popOut} title="Вынести раздел в отдельное окно" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-dark-panel">
        <ExternalLink className="w-4 h-4" />
      </button>
    </div>
  );
}
