/**
 * Рабочий стол: значки под окнами.
 *
 * На столе лежат две разные вещи, и различие видно и на глаз, и в Проводнике:
 *
 *   — программы (разделы Flux) — системные ярлыки. Их нет в Проводнике и нет в
 *     базе: это привычка сотрудника, а не документ проекта;
 *   — файлы и папки — настоящие. Лежат в системной папке «Рабочий стол» — своей
 *     у каждого и одной общей на проект, — и из Проводника видны там же.
 *     Значок из общей папки помечен: по нему сразу видно, что документ видят все.
 *
 * Значки рисуются теми же картинками, что в Проводнике: один документ обязан
 * выглядеть одинаково там и там, иначе человек решит, что это разные файлы.
 *
 * Раскладку (клетки, свободные места, что не поместилось) считает
 * src/lib/desktop.ts — там же и проверки: значок под значком и значок за краем
 * стола глазом неотличимы от пропавшего файла.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder, FileSpreadsheet, FileText, File as FileIcon, StickyNote,
  FolderPlus, Table, Type, Users, Lock, RefreshCw, ArrowDownAZ, Clock, Shapes,
  Pencil, Trash2, FolderOpen, PinOff,
} from 'lucide-react';
import { SECTIONS } from '../workspace/sections';
import { useStore } from '../store/store';
import { useDesktopStore } from '../store/desktopStore';
import { rememberSectionUse } from '../store/workspaceStore';
import { useModalStore } from '../store/modalStore';
import { useToastStore } from '../store/toastStore';
import {
  cellToXY, xyToCell, layout, withApps, CELL_W, CELL_H,
  type DeskItem, type SortBy,
} from '../lib/desktop';
import ContextMenu, { MenuItem } from './ContextMenu';

const iconClass = 'w-9 h-9';

/** Те же картинки, что в Проводнике: один файл — одна картинка везде */
function ItemIcon({ item }: { item: DeskItem }) {
  if (item.kind === 'app') {
    const Icon = SECTIONS.find((s) => s.path === item.path)?.icon as any;
    return Icon ? <Icon className={`${iconClass} text-emerald-600 dark:text-emerald-400`} /> : <Shapes className={iconClass} />;
  }
  if (item.kind === 'folder') return <Folder className={`${iconClass} text-amber-500 fill-amber-200`} />;
  if (item.kind === 'note') return <StickyNote className={`${iconClass} text-amber-500`} />;
  if (item.kind === 'text') return <FileText className={`${iconClass} text-emerald-600`} />;
  if (item.kind === 'doc') return <FileSpreadsheet className={`${iconClass} text-emerald-600`} />;
  return <FileIcon className={`${iconClass} text-slate-400`} />;
}

const titleOf = (item: DeskItem): string =>
  item.kind === 'app' ? (SECTIONS.find((s) => s.path === item.path)?.title || item.path || '') : item.name;

export default function Desktop() {
  const activeProject = useStore((s) => s.activeProject);
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const {
    items, apps, cells, sortBy, selected, error, personalFolderId,
    load, select, setCell, arrangeBy, unpinApp, createFolder, createDoc, rename, remove, share,
  } = useDesktopStore();
  const openConfirm = useModalStore((s) => s.openConfirm);
  const addToast = useToastStore((s) => s.addToast);

  const ref = React.useRef<HTMLDivElement>(null);
  const [area, setArea] = React.useState({ w: 1280, h: 720 });
  const [menu, setMenu] = React.useState<{ x: number; y: number; id: string | null } | null>(null);
  const [renaming, setRenaming] = React.useState<{ id: string; value: string } | null>(null);
  const [band, setBand] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dragging, setDragging] = React.useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);

  const projectId = activeProject?.id || '';
  React.useEffect(() => { load(projectId); }, [projectId, load]);

  // Меряем стол сами: сетка считается в точках, а сколько их — знает только DOM
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setArea({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = React.useMemo(() => withApps(items, apps), [items, apps]);
  const view = React.useMemo(() => layout(all, cells, area), [all, cells, area]);

  /**
   * Открыть — значит только перейти по адресу. Окно (в оконной оболочке) или
   * вкладку панели (в панельной) заводит сама оболочка, увидев новый адрес.
   *
   * Раньше здесь и окно открывалось, и адрес менялся — и оболочка, увидев
   * новое окно, тут же уводила адрес на голый раздел: документ открывался
   * пустым, потому что «?doc=…» стирался на полпути. Одно действие — один
   * механизм.
   */
  const go = (to: string) => { rememberSectionUse(to.split('?')[0]); navigate(to); };

  const openItem = (item: DeskItem) => {
    if (item.kind === 'app' && item.path) return go(item.path);
    // Папка стола открывается в Проводнике: второго проводника у программы нет,
    // и заводить его ради стола — значит развести два разных дерева одних папок
    if (item.kind === 'folder') return go(`/explorer?folder=${encodeURIComponent(item.id)}`);
    if (item.refId) return go(`/constructor?doc=${encodeURIComponent(item.refId)}`);
    // Файл без своего редактора (чертёж, бланк, картинка) открывается там, где
    // его и смотрят, — в Проводнике, выделенным, с просмотром сбоку. Заводить
    // ради этого второй просмотрщик значит развести два разных вида одного
    // файла: в Проводнике он выглядел бы так, а со стола — иначе
    if (item.folderId) {
      return go(`/explorer?file=${encodeURIComponent(item.id)}&folder=${encodeURIComponent(item.folderId)}`);
    }
    go('/explorer');
  };

  // ── Перетаскивание значка ────────────────────────────────────────────────
  /**
   * Слушаем окно, а не сам значок. Захват указателя на значке выглядит короче,
   * но держится, только пока цел его узел, — а стол перерисовывается от любого
   * обновления списка (создали файл, коллега выложил документ на общий стол).
   * Перерисовка посреди переноса рвала захват: значок замирал под курсором и
   * оставался на месте, будто перенос не начинали. Окно живёт всегда.
   */
  const startDrag = (e: React.PointerEvent, item: DeskItem) => {
    if (e.button !== 0 || renaming) return;
    const cell = view.cells.get(item.id);
    const box = ref.current?.getBoundingClientRect();
    if (!cell || !box) return;
    e.preventDefault();
    const at = cellToXY(cell);
    // Смещение внутри значка запоминаем, иначе значок «прыгает» под курсор
    const dx = e.clientX - box.left - at.x;
    const dy = e.clientY - box.top - at.y;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX - box.left - dx;
      const y = ev.clientY - box.top - dy;
      // Четыре точки: дрожание руки при нажатии не должно считаться переносом,
      // иначе значки разъезжаются от простых нажатий
      if (!moved && Math.abs(x - at.x) < 4 && Math.abs(y - at.y) < 4) return;
      moved = true;
      setDragging({ id: item.id, dx, dy, x, y });
    };
    const finish = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setDragging(null);
      if (!moved || cancelled) return;
      const x = ev.clientX - box.left - dx + CELL_W / 2;
      const y = ev.clientY - box.top - dy + CELL_H / 2;
      setCell(item.id, xyToCell(x, y, area), area);
    };
    const onUp = (ev: PointerEvent) => finish(ev, false);
    // Перенос отменили (Esc, системный жест) — значок обязан вернуться, а не
    // остаться там, где его бросили на полпути
    const onCancel = (ev: PointerEvent) => finish(ev, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // ── Выделение рамкой по пустому месту ────────────────────────────────────
  const startBand = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x1 = e.clientX - box.left;
    const y1 = e.clientY - box.top;
    select([]);
    setRenaming(null);

    const onMove = (ev: PointerEvent) => {
      const x2 = ev.clientX - box.left;
      const y2 = ev.clientY - box.top;
      setBand({ x1, y1, x2, y2 });
      const l = Math.min(x1, x2); const r = Math.max(x1, x2);
      const t = Math.min(y1, y2); const b = Math.max(y1, y2);
      const hit: string[] = [];
      view.cells.forEach((cell, id) => {
        const p = cellToXY(cell);
        if (p.x < r && p.x + CELL_W > l && p.y < b && p.y + CELL_H > t) hit.push(id);
      });
      select(hit);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setBand(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const doRemove = async (item: DeskItem) => {
    if (item.kind === 'app') { unpinApp(item.path || ''); return; }
    const ok = await openConfirm(
      item.kind === 'folder' ? 'Убрать папку со стола?' : 'Убрать файл со стола?',
      'Со стола он уйдёт в корзину Проводника — оттуда его можно вернуть.',
      { confirmLabel: 'Убрать', tone: 'danger' },
    );
    if (!ok) return;
    try { await remove(item.id, projectId); } catch (e: any) { addToast(e?.message || 'Не удалось убрать', 'error'); }
  };

  const doShare = async (item: DeskItem) => {
    try {
      await share(item.id, item.shared ? 'PERSONAL' : 'SHARED', projectId);
      addToast(item.shared ? 'Вернулось на ваш стол' : 'Теперь лежит на общем столе — видят все', 'success');
    } catch (e: any) { addToast(e?.message || 'Не удалось перенести', 'error'); }
  };

  const create = async (what: 'folder' | 'DOC' | 'TEXT' | 'NOTE', scope: 'SHARED' | 'PERSONAL') => {
    try {
      if (what === 'folder') { await createFolder(projectId, scope); return; }
      const id = await createDoc(projectId, what, scope);
      if (id) go(`/constructor?doc=${encodeURIComponent(id)}`);
    } catch (e: any) { addToast(e?.message || 'Не удалось создать', 'error'); }
  };

  const target = menu?.id ? all.find((i) => i.id === menu.id) || null : null;
  const canPersonal = !!personalFolderId && !!user;

  const itemMenu = (item: DeskItem): MenuItem[] => item.kind === 'app'
    ? [
      { label: 'Открыть', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => openItem(item) },
      { label: 'Убрать со стола', icon: <PinOff className="w-3.5 h-3.5" />, onClick: () => unpinApp(item.path || '') },
    ]
    : [
      { label: 'Открыть', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => openItem(item) },
      { label: 'Переименовать', icon: <Pencil className="w-3.5 h-3.5" />, onClick: () => setRenaming({ id: item.id, value: item.name }) },
      {
        label: item.shared ? 'Убрать с общего стола' : 'Положить на общий стол',
        icon: item.shared ? <Lock className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />,
        disabled: item.shared && !canPersonal,
        onClick: () => doShare(item),
      },
      { label: 'Убрать со стола', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: () => doRemove(item) },
    ];

  // Куда кладём новое: на свой стол, если он есть. «Создать общим» — отдельным
  // пунктом, а не переключателем: положить документ на общий стол случайно
  // нельзя, это должно быть отдельным осознанным нажатием
  const deskMenu: MenuItem[] = [
    { label: 'Создать таблицу', icon: <Table className="w-3.5 h-3.5" />, onClick: () => create('DOC', canPersonal ? 'PERSONAL' : 'SHARED') },
    { label: 'Создать документ', icon: <Type className="w-3.5 h-3.5" />, onClick: () => create('TEXT', canPersonal ? 'PERSONAL' : 'SHARED') },
    { label: 'Создать заметку', icon: <StickyNote className="w-3.5 h-3.5" />, onClick: () => create('NOTE', 'PERSONAL') },
    { label: 'Создать папку', icon: <FolderPlus className="w-3.5 h-3.5" />, onClick: () => create('folder', canPersonal ? 'PERSONAL' : 'SHARED') },
    { label: 'Создать таблицу на общем столе', icon: <Users className="w-3.5 h-3.5" />, onClick: () => create('DOC', 'SHARED') },
    { label: sortBy === 'name' ? 'Упорядочить по имени ✓' : 'Упорядочить по имени', icon: <ArrowDownAZ className="w-3.5 h-3.5" />, onClick: () => arrangeBy('name', area) },
    { label: sortBy === 'date' ? 'Упорядочить по дате ✓' : 'Упорядочить по дате', icon: <Clock className="w-3.5 h-3.5" />, onClick: () => arrangeBy('date', area) },
    { label: sortBy === 'kind' ? 'Упорядочить по типу ✓' : 'Упорядочить по типу', icon: <Shapes className="w-3.5 h-3.5" />, onClick: () => arrangeBy('kind', area) },
    { label: 'Обновить', icon: <RefreshCw className="w-3.5 h-3.5" />, onClick: () => load(projectId) },
    { label: 'Открыть в Проводнике', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => go('/explorer') },
  ];

  return (
    <div
      ref={ref}
      onPointerDown={startBand}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: null }); }}
      className="absolute inset-0 overflow-hidden select-none"
    >
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg text-2xs font-semibold
                        bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
          Стол не прочитан: {error}
        </div>
      )}

      {all.map((item) => {
        const cell = view.cells.get(item.id);
        if (!cell) return null;
        const at = cellToXY(cell);
        const isDragged = dragging?.id === item.id;
        const pos = isDragged ? { left: dragging.x, top: dragging.y } : { left: at.x, top: at.y };
        const isSelected = selected.includes(item.id);
        return (
          <div
            key={item.id}
            style={{ ...pos, width: CELL_W, height: CELL_H, zIndex: isDragged ? 5 : 1 }}
            onPointerDown={(e) => { e.stopPropagation(); select([item.id]); startDrag(e, item); }}
            onDoubleClick={() => openItem(item)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); select([item.id]); setMenu({ x: e.clientX, y: e.clientY, id: item.id }); }}
            title={titleOf(item)}
            className={`absolute flex flex-col items-center gap-1 pt-2 px-1 rounded-lg cursor-default
                        ${isDragged ? 'opacity-70' : ''}
                        ${isSelected ? 'bg-emerald-500/15 ring-1 ring-emerald-500/50' : 'hover:bg-slate-500/10'}`}
          >
            <span className="relative shrink-0">
              <ItemIcon item={item} />
              {/* Метка общего доступа: по значку сразу видно, что документ видят
                  все. Без неё «положил на стол» и «выложил всем» неразличимы */}
              {item.shared && item.kind !== 'app' && (
                <span
                  aria-label="Лежит на общем столе"
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center
                             bg-sky-600 text-white border-2 border-slate-100 dark:border-dark-bg"
                >
                  <Users className="w-2 h-2" />
                </span>
              )}
            </span>
            {renaming?.id === item.id ? (
              <input
                autoFocus
                value={renaming.value}
                onChange={(e) => setRenaming({ id: item.id, value: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={() => { rename(item.id, renaming.value, projectId); setRenaming(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { rename(item.id, renaming.value, projectId); setRenaming(null); }
                  if (e.key === 'Escape') setRenaming(null);
                }}
                className="w-full text-2xs text-center rounded border border-emerald-500 outline-none px-1
                           bg-white dark:bg-slate-900 text-slate-900 dark:text-white select-text"
              />
            ) : (
              <span
                /* Две строки и обрыв: «Ведомость оборудования системы В-1» не
                   должна наезжать на соседний значок */
                className={`w-full text-center text-2xs leading-tight line-clamp-2 break-words ${
                  isSelected ? 'text-emerald-900 dark:text-emerald-100 font-semibold' : 'text-slate-700 dark:text-slate-150'
                }`}
              >
                {titleOf(item)}
              </span>
            )}
          </div>
        );
      })}

      {band && (
        <div
          aria-hidden
          style={{
            left: Math.min(band.x1, band.x2), top: Math.min(band.y1, band.y2),
            width: Math.abs(band.x2 - band.x1), height: Math.abs(band.y2 - band.y1),
          }}
          className="absolute z-[4] rounded border border-emerald-500 bg-emerald-500/10 pointer-events-none"
        />
      )}

      {/* Что не поместилось — сказано вслух. Молча спрятать значок значит
          показать человеку пустое место там, где лежит его документ */}
      {view.overflow.length > 0 && (
        <button
          type="button"
          onClick={() => go('/explorer')}
          className="absolute bottom-3 right-3 z-[6] px-2.5 py-1 rounded-lg cursor-pointer text-2xs font-semibold
                     bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400
                     border border-amber-200 dark:border-amber-900 hover:brightness-95"
        >
          ещё {view.overflow.length} не поместилось — открыть в Проводнике
        </button>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={target ? itemMenu(target) : deskMenu}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
