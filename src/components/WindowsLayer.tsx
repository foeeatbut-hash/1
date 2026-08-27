/**
 * Слой окон: сам стол, окна поверх него и подсветка прилипания.
 *
 * Разделы внутри окон живут тем же keep-alive, что и в панелях: свёрнутое окно
 * остаётся смонтированным и просто скрывается, поэтому вернуться к нему —
 * значит увидеть тот же открытый документ на том же месте.
 *
 * Перетаскивание и размер считает src/lib/windows.ts; здесь только события
 * указателя и разметка.
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Minus, Square, X, Copy } from 'lucide-react';
import { SECTIONS, isKnownSection, sectionForPath } from '../workspace/sections';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useWindowStore } from '../store/windowStore';
import { snapZoneAt, type Edge, type SnapZone, type WinState } from '../lib/windows';
import { deskAction, isTyping, nextInCycle } from '../lib/deskKeys';
import SectionFrame, { asHref } from './SectionFrame';
import Desktop from './Desktop';

/** Восемь краёв: четыре стороны и четыре угла */
const EDGES: { edge: Edge; cls: string }[] = [
  { edge: 'n', cls: 'top-0 left-2 right-2 h-1.5 cursor-ns-resize' },
  { edge: 's', cls: 'bottom-0 left-2 right-2 h-1.5 cursor-ns-resize' },
  { edge: 'w', cls: 'left-0 top-2 bottom-2 w-1.5 cursor-ew-resize' },
  { edge: 'e', cls: 'right-0 top-2 bottom-2 w-1.5 cursor-ew-resize' },
  { edge: 'nw', cls: 'top-0 left-0 w-3 h-3 cursor-nwse-resize' },
  { edge: 'ne', cls: 'top-0 right-0 w-3 h-3 cursor-nesw-resize' },
  { edge: 'sw', cls: 'bottom-0 left-0 w-3 h-3 cursor-nesw-resize' },
  { edge: 'se', cls: 'bottom-0 right-0 w-3 h-3 cursor-nwse-resize' },
];

function WindowFrame({
  win, isTop, liveLocation, globalNavigate,
}: {
  win: WinState;
  isTop: boolean;
  liveLocation: ReturnType<typeof useLocation>;
  globalNavigate: ReturnType<typeof useNavigate>;
}) {
  const def = sectionForPath(win.path);
  const Icon = SECTIONS.find((s) => s.path === win.path)?.icon as any;
  const st = useWindowStore;
  // Имя окну даёт содержимое: «Ведомость В-1», а не «Конструктор». Нет
  // открытого документа — остаётся имя программы
  const title = useWindowStore((s) => s.titles[win.id]) || def.title;
  // На это окно навели в списке на панели задач — обводим, чтобы было понятно,
  // какое из трёх поднимется
  const peeked = useWindowStore((s) => s.peeked === win.id);

  /**
   * Перетаскивание и размер на указателе, а не на мыши: одним кодом работают
   * мышь, тачпад и перо. Захват указателя обязателен — без него окно
   * «срывается», как только курсор обгонит перерисовку.
   */
  const drag = (e: React.PointerEvent, edge: Edge | null) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    st.getState().focus(win.id);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let last = { x: e.clientX, y: e.clientY };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      if (edge) { st.getState().resize(win.id, edge, dx, dy); return; }
      st.getState().move(win.id, dx, dy);
      // Подсветка считается от курсора, а не от края окна: человек целится
      // курсором, и попадание должно совпадать с тем, что он видит
      const box = el.closest('[data-desk]')?.getBoundingClientRect();
      if (box) {
        st.getState().setSnapping(snapZoneAt(ev.clientX - box.left, ev.clientY - box.top, {
          w: box.width, h: box.height,
        }));
      }
    };
    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      const zone = st.getState().snapping;
      if (!edge && zone) st.getState().applySnap(win.id, zone);
      else st.getState().setSnapping(null);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const btn = 'w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors';

  return (
    <div
      role="dialog"
      aria-label={title}
      onPointerDownCapture={() => { if (!isTop) st.getState().focus(win.id); }}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: 10 + win.z, display: win.minimized ? 'none' : undefined }}
      className={`absolute flex flex-col rounded-xl overflow-hidden bg-white dark:bg-dark-bg border transition-shadow ${
        peeked
          ? 'border-emerald-500 shadow-2xl ring-2 ring-emerald-500/40'
          : isTop
            ? 'border-emerald-500/70 shadow-2xl'
            : 'border-slate-200 dark:border-dark-border shadow-lg'
      }`}
    >
      <div
        onPointerDown={(e) => drag(e, null)}
        onDoubleClick={() => st.getState().maximize(win.id)}
        /* 34 точки: попасть можно, и не жалко экрана при четырёх окнах */
        className={`h-[34px] shrink-0 flex items-center gap-2 px-2.5 select-none cursor-grab active:cursor-grabbing
                    border-b border-slate-200 dark:border-dark-border ${
          isTop ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-50 dark:bg-dark-surface'
        }`}
      >
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${isTop ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`} />}
        <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-150"
          title={title === def.title ? title : `${title} · ${def.title}`}>{title}</span>
        <button type="button" title="Свернуть" aria-label="Свернуть"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => st.getState().minimize(win.id)}
          className={`${btn} text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-850`}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button type="button" title={win.maximized ? 'Вернуть размер' : 'Развернуть'} aria-label="Развернуть"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => st.getState().maximize(win.id)}
          className={`${btn} text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-850`}>
          {win.maximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3 h-3" />}
        </button>
        <button type="button" title="Закрыть" aria-label="Закрыть"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => st.getState().close(win.id)}
          className={`${btn} text-slate-500 hover:bg-rose-600 hover:text-white`}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Панель объявляет себя мерой ширины: разделы спрашивают её, а не окно */}
      <div className="@container relative flex-1 min-h-0">
        <SectionFrame
          paneId={`win:${win.id}`}
          path={win.path}
          href={win.href}
          visible
          isLive={isTop}
          liveLocation={liveLocation}
          globalNavigate={globalNavigate}
        />
      </div>

      {!win.maximized && EDGES.map(({ edge, cls }) => (
        <span
          key={edge}
          onPointerDown={(e) => drag(e, edge)}
          /* Полоса захвата 6 точек снаружи содержимого: попасть можно,
             случайно потянуть — нет */
          className={`absolute ${cls} z-10`}
        />
      ))}
    </div>
  );
}

export default function WindowsLayer() {
  const windows = useWindowStore((s) => s.windows);
  const snapping = useWindowStore((s) => s.snapping);
  const setArea = useWindowStore((s) => s.setArea);
  const location = useLocation();
  const navigate = useNavigate();
  const deskRef = React.useRef<HTMLDivElement>(null);

  // Стол меряем сами и сообщаем геометрии: она не должна знать про DOM
  React.useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setArea({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setArea]);

  const topWin = React.useMemo(() => {
    const vis = windows.filter((w) => !w.minimized);
    return vis.length ? vis.reduce((a, b) => (b.z > a.z ? b : a)) : null;
  }, [windows]);
  const top = topWin?.id || null;

  /**
   * Верхнее окно и общий адрес — одно и то же. Раздел верхнего окна «живой»:
   * его location берётся из адреса программы. Разойдясь, они дали бы живому
   * разделу чужой адрес — открытый Конструктор получил бы параметры Тегов.
   *
   * Панели держат ту же связь (см. Workspace), окнам она нужна ровно так же:
   * без неё не работают ни ссылка на документ, ни кнопка «назад».
   */
  React.useEffect(() => {
    if (!topWin) return;
    const here = asHref(location);
    if (here === topWin.href) return;
    const remembered = useWorkspaceStore.getState().frozenHrefs[`win:${topWin.id}::${topWin.path}`];
    navigate(remembered || topWin.href);
  }, [topWin?.id, topWin?.href]);

  /**
   * Живое окно ушло на другой адрес (открыли документ из библиотеки, зашли в
   * папку) — окно обязано это запомнить. Иначе оно потеряет себя: следующее
   * открытие того же документа заведёт ещё одно окно рядом.
   */
  React.useEffect(() => {
    if (!topWin) return;
    const here = asHref(location);
    // Только собственный переход окна. Тот же адрес, пришедший снаружи, — это
    // просьба открыть документ, и решать её должно следующее правило: иначе
    // окно молча забирало бы себе чужой адрес, и второе окно не появлялось
    if ((location.state as any)?.__pane !== `win:${topWin.id}`) return;
    if (here.split('?')[0] !== topWin.path) return;
    useWindowStore.getState().setHref(topWin.id, here);
  }, [location, topWin?.id]);

  /**
   * Обратная сторона той же связи: адрес пришёл извне (ссылка, помощник,
   * двойное нажатие по документу на столе) — поднимаем нужное окно.
   *
   * Именно layout-эффект, а не обычный: решение принимается до показа кадра.
   * Обычный эффект успевал показать чужой адрес в прежнем верхнем окне — и то
   * запоминало его себе. Два окна оказывались на одном документе и начинали
   * спорить автосохранением.
   */
  React.useLayoutEffect(() => {
    if (!isKnownSection(location.pathname)) return;
    // «/» — начальный адрес программы, а не просьба открыть Главную. Открывали
    // бы — поверх пустого стола всплывало бы окно, которого не просили, и
    // закрыть его насовсем было бы нельзя: вход, выход из раздела и просто
    // перезапуск снова приводят сюда. Главная открывается со стола, из Пуска
    // и с панели задач — там нажатие сказано вслух
    if (location.pathname === '/') return;
    const st = useWindowStore.getState();
    const here = asHref(location);
    const cur = st.windows.filter((w) => !w.minimized);
    const now = cur.length ? cur.reduce((a, b) => (b.z > a.z ? b : a)) : null;
    // Переход внутри самого окна и по тому же разделу — это оно и перешло:
    // человек открыл документ из библиотеки Конструктора и остался в своём
    // окне. Адрес запоминает следующий эффект, открывать нечего
    const from = (location.state as any)?.__pane;
    if (now && from === `win:${now.id}` && now.path === location.pathname) return;
    st.open(here);
  }, [location]);

  /**
   * Клавиши окон: Alt+Tab по кругу, Ctrl+F4 закрыть, Ctrl+Alt+D показать стол.
   * Alt+Tab работает и во время набора — это переключение между окнами, а не
   * правка содержимого, и отбирать его у человека нельзя (см. src/lib/deskKeys).
   */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = deskAction(e, { typing: isTyping(document.activeElement as any), hasSelection: false });
      if (act !== 'nextWindow' && act !== 'prevWindow' && act !== 'closeWindow'
        && act !== 'minimizeAll' && act !== 'newWindow') return;
      const st = useWindowStore.getState();
      if (!st.windows.length) return;
      e.preventDefault();
      if (act === 'minimizeAll') { st.minimizeAll(); return; }
      const cur = st.windows.filter((w) => !w.minimized).reduce<typeof st.windows[number] | null>(
        (a, b) => (!a || b.z > a.z ? b : a), null,
      );
      if (act === 'closeWindow') { if (cur) st.close(cur.id); return; }
      if (act === 'newWindow') {
        // Ещё одно окно той же программы: у единичных разделов второго не бывает
        if (cur && sectionForPath(cur.path).multi) st.openAnother(cur.href);
        return;
      }
      const next = nextInCycle(st.windows, cur?.id || null, act === 'prevWindow');
      if (next) st.focus(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = windows.filter((w) => !w.minimized).length;

  return (
    <div
      ref={deskRef}
      data-desk
      className="relative w-full h-full overflow-hidden bg-slate-100 dark:bg-dark-bg"
    >
      {/* Значки живут под окнами: стол — это фон, а не ещё одно окно */}
      <Desktop />

      {windows.map((w) => (
        <WindowFrame
          key={w.id}
          win={w}
          isTop={w.id === top}
          liveLocation={location}
          globalNavigate={navigate}
        />
      ))}

      {/* Куда встанет окно, если отпустить: показываем до того, как отпустили */}
      {snapping && (
        <div
          aria-hidden
          style={
            snapping === 'top' ? { left: 0, top: 0, right: 0, bottom: 0 }
              : snapping === 'left' ? { left: 0, top: 0, bottom: 0, width: '50%' }
                : { right: 0, top: 0, bottom: 0, width: '50%' }
          }
          className="absolute z-[9] rounded-xl border-2 border-emerald-500 bg-emerald-500/10 pointer-events-none"
        />
      )}
    </div>
  );
}
