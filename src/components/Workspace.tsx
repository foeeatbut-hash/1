/**
 * Рабочий стол: держит разделы «живыми» и раскладывает их по 1/2/4 панелям.
 *
 * Ключевая механика keep-alive: каждый когда-либо открытый в панели раздел
 * остаётся смонтированным — мы лишь скрываем его (display:none). Чтобы скрытые
 * разделы не реагировали на смену глобального URL, каждый экземпляр обёрнут в
 * собственные контексты react-router с «замороженным» location. Активный
 * раздел активной панели — «живой»: его location = глобальный URL, а его
 * навигация уходит в общий navigate (deep-link, кнопка назад, восстановление).
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, SquareSplitHorizontal, SquareSplitVertical, Grid2x2, Square, ExternalLink, XCircle } from 'lucide-react';
import { useWorkspaceStore, paneCountFor, openSectionWindow } from '../store/workspaceStore';
import { SECTIONS, isKnownSection } from '../workspace/sections';
import { useStore } from '../store/store';
import ContextMenu, { MenuItem } from './ContextMenu';
import SectionFrame, { asHref } from './SectionFrame';

const iconFor = (path: string) => SECTIONS.find((s) => s.path === path);

// Одна панель рабочего стола
function PaneView({ paneId }: { paneId: string }) {
  const pane = useWorkspaceStore((s) => s.panes.find((p) => p.id === paneId));
  const layout = useWorkspaceStore((s) => s.layout);
  const activePaneId = useWorkspaceStore((s) => s.activePaneId);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const openInPane = useWorkspaceStore((s) => s.openInPane);
  const closeInPane = useWorkspaceStore((s) => s.closeInPane);
  const closeOthersInPane = useWorkspaceStore((s) => s.closeOthersInPane);
  const location = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = React.useState<{ x: number; y: number; path: string } | null>(null);

  if (!pane) return null;
  // Активный раздел панели — отдельное поле, а не «последний в списке»:
  // порядок вкладок от переключения не меняется
  const activePath = pane.stack.includes(pane.active) ? pane.active : pane.stack[pane.stack.length - 1];
  const isActivePane = paneId === activePaneId;
  // Вкладки внутри панели показываем, когда открыто больше одного раздела
  const showTabs = pane.stack.length > 1;

  const menuItems: MenuItem[] = menu ? [
    { label: 'Закрыть вкладку', icon: <X className="w-3.5 h-3.5" />, onClick: () => closeInPane(paneId, menu.path) },
    { label: 'Закрыть остальные', icon: <XCircle className="w-3.5 h-3.5" />, disabled: pane.stack.length < 2, onClick: () => closeOthersInPane(paneId, menu.path) },
    { label: 'Вынести в отдельное окно', icon: <ExternalLink className="w-3.5 h-3.5" />, onClick: () => { openSectionWindow(useWorkspaceStore.getState().frozenHrefs[`${paneId}::${menu.path}`] || menu.path); closeInPane(paneId, menu.path); } },
  ] : [];

  return (
    <div
      data-pane={paneId}
      onMouseDownCapture={() => { if (!isActivePane) setActivePane(paneId); }}
      className={`relative flex flex-col min-w-0 min-h-0 h-full bg-slate-100 dark:bg-dark-bg ${
        layout !== 'single' ? `rounded-xl overflow-hidden border ${isActivePane ? 'border-emerald-500/70 ring-1 ring-emerald-500/30' : 'border-slate-200 dark:border-dark-border'}` : ''
      }`}
    >
      {showTabs && (
        <div
          role="tablist"
          aria-label="Открытые разделы"
          /* Полоса прокрутки видимая, а не убранная. Раньше стояло scrollbar-none:
             вкладки, не поместившиеся по ширине, просто отсутствовали на экране —
             ни полосы, ни стрелок, и найти их было нельзя. Теперь до прокрутки
             дело почти не доходит (вкладки сжимаются, см. ниже), а если дойдёт —
             это видно. */
          className="shrink-0 flex items-stretch gap-px px-1.5 pt-1 overflow-x-auto scrollbar-thin border-b border-slate-200 dark:border-dark-border bg-white/60 dark:bg-dark-surface/50"
        >
          {pane.stack.map((p) => {
            const def = iconFor(p);
            const active = p === activePath;
            const Icon = def?.icon as any;
            return (
              <div
                key={p}
                role="tab"
                aria-selected={active}
                onMouseDown={(e) => {
                  // Средняя кнопка мыши закрывает вкладку — привычка из браузера
                  if (e.button === 1) { e.preventDefault(); e.stopPropagation(); closeInPane(paneId, p); return; }
                  if (e.button !== 0) return;
                  e.stopPropagation(); setActivePane(paneId); openInPane(paneId, p);
                }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, path: p }); }}
                title={def?.title || p}
                /* Вкладки делят ширину полосы и сжимаются до 76 px — столько
                   нужно значку, обрывку названия и крестику. Раньше ширина
                   считалась по содержимому: шесть вкладок требовали 1140 px и
                   при окне 1280 последние уезжали за край. */
                className={`group relative flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-t-lg text-xs cursor-pointer select-none flex-1 min-w-[76px] max-w-[190px] transition-colors duration-[120ms] ${
                  active
                    // Активная вкладка — язычок листа: та же поверхность, что у
                    // раздела, боковые линии, полоса акцента во всю ширину и
                    // тень, отрезающая её от полосы. Соседние — тише по цвету.
                    ? 'bg-slate-100 dark:bg-dark-bg text-slate-900 dark:text-white font-semibold border-x border-t border-slate-200 dark:border-dark-border -mb-px shadow-[0_1px_0_0_var(--flux-bg)] after:absolute after:left-0 after:right-0 after:top-0 after:h-[3px] after:rounded-b-sm after:bg-emerald-600 dark:after:bg-emerald-400'
                    : 'text-slate-500 dark:text-dark-text-muted border-x border-t border-transparent hover:bg-slate-100/70 dark:hover:bg-dark-bg/50 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-700 dark:text-emerald-400' : 'opacity-60'}`} />}
                <span className="flex-1 min-w-0 truncate">{def?.title || p}</span>
                <button
                  type="button"
                  onMouseDown={(e) => { e.stopPropagation(); closeInPane(paneId, p); }}
                  aria-label={`Закрыть вкладку «${def?.title || p}»`}
                  /* 20×20 вместо 16×16: в крестик надо попасть мышью, а не
                     целиться. Место под него занято всегда, даже когда он
                     невидим, — иначе название дёргается при наведении. */
                  className={`w-5 h-5 shrink-0 rounded flex items-center justify-center hover:bg-slate-300 dark:hover:bg-dark-border cursor-pointer ${
                    active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title="Закрыть вкладку"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {/* Панель объявляет себя мерой ширины для всего, что внутри.
          Раньше разделы спрашивали ширину окна (md:, lg:), а живут они в
          панели: на мониторе 1920 в режиме четырёх панелей каждая панель —
          940 px, и ни одна контрольная точка не срабатывала. Одна строка
          здесь — и разделы получают, что спрашивать: @[900px]: и подобные. */}
      <div className="@container relative flex-1 min-h-0">
        {pane.stack.map((p) => (
          <SectionFrame
            key={p}
            paneId={paneId}
            path={p}
            visible={p === activePath}
            isLive={isActivePane && p === activePath}
            liveLocation={location}
            globalNavigate={navigate}
          />
        ))}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}

export default function Workspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const layout = useWorkspaceStore((s) => s.layout);
  const allPanes = useWorkspaceStore((s) => s.panes);
  // Видимые панели считаем через useMemo: селектор, возвращающий новый массив,
  // зациклил бы useSyncExternalStore (getSnapshot должен быть стабильным)
  const panes = React.useMemo(() => allPanes.slice(0, paneCountFor(layout)), [allPanes, layout]);
  const activePaneId = useWorkspaceStore((s) => s.activePaneId);
  const activePath = useWorkspaceStore((s) => {
    const p = s.panes.find((x) => x.id === s.activePaneId);
    return p ? (p.stack.includes(p.active) ? p.active : p.stack[p.stack.length - 1]) : '/';
  });

  // URL → активная панель: внешняя навигация (deep-link, «назад», ассистент)
  React.useEffect(() => {
    if (!isKnownSection(location.pathname)) return;
    const st = useWorkspaceStore.getState();
    const ap = st.activePathOf(st.activePaneId);
    st.setFrozenHref(st.activePaneId, location.pathname, asHref(location));
    if (location.pathname !== ap) st.openInPane(st.activePaneId, location.pathname);
  }, [location]);

  // Активная панель → URL: клик по меню сменил активный раздел — двигаем URL
  React.useEffect(() => {
    if (location.pathname === activePath) return;
    const remembered = useWorkspaceStore.getState().frozenHrefs[`${activePaneId}::${activePath}`];
    navigate(remembered || activePath);
  }, [activePaneId, activePath]);

  const gridClass =
    layout === 'single' ? 'grid-cols-1 grid-rows-1'
      : layout === 'dual' ? 'grid-cols-2 grid-rows-1'
        : layout === 'dualh' ? 'grid-cols-1 grid-rows-2'
          : 'grid-cols-2 grid-rows-2';

  return (
    <div className={`w-full h-full grid ${gridClass} ${layout === 'single' ? '' : 'gap-2 p-2'}`}>
      {panes.map((p) => (
        <PaneView key={p.id} paneId={p.id} />
      ))}
    </div>
  );
}

// Кнопки раскладки: 1 / 2 столбца / 2 строки / 4 + вынос активного раздела в
// отдельное окно. Живут в правом рельсе (RightRail) — ничего не перекрывают.
export function WorkspaceRailControls({ horizontal = false }: { horizontal?: boolean } = {}) {
  const layout = useWorkspaceStore((s) => s.layout);
  const setLayout = useWorkspaceStore((s) => s.setLayout);
  const activePath = useWorkspaceStore((s) => {
    const p = s.panes.find((x) => x.id === s.activePaneId);
    return p ? (p.stack.includes(p.active) ? p.active : p.stack[p.stack.length - 1]) : '/';
  });

  const popOut = () => {
    const st = useWorkspaceStore.getState();
    openSectionWindow(st.frozenHrefs[`${st.activePaneId}::${activePath}`] || activePath);
  };

  const Btn = ({ mode, title, children }: { mode: any; title: string; children: React.ReactNode }) => (
    <button type="button"
      onClick={() => setLayout(mode)}
      title={title}
      className={`w-9 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
        layout === mode ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );

  // Столбиком в правом рельсе, строкой — в трее панели задач: кнопки те же,
  // а место у них разное, и заводить ради этого второй набор незачем
  return (
    <div className={`flex items-center gap-0.5 ${horizontal ? '' : 'flex-col'}`}>
      <Btn mode="single" title="Одно окно"><Square className="w-4 h-4" /></Btn>
      <Btn mode="dual" title="Две панели рядом"><SquareSplitHorizontal className="w-4 h-4" /></Btn>
      <Btn mode="dualh" title="Две панели одна над другой"><SquareSplitVertical className="w-4 h-4" /></Btn>
      <Btn mode="quad" title="Четыре панели"><Grid2x2 className="w-4 h-4" /></Btn>
      <button type="button" onClick={popOut} title="Вынести раздел в отдельное окно" className="w-9 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
        <ExternalLink className="w-4 h-4" />
      </button>
    </div>
  );
}
