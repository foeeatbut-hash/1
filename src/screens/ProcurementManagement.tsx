import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService } from '../services/dataService';
import {
  Briefcase, Search, RefreshCw, Database, AlertTriangle, X, ChevronDown, ChevronUp,
  ChevronRight, Filter, List, FolderTree, Settings2, CheckSquare
} from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import {
  ProcurementStage, loadProcurementStages, stageIcon, stageColor
} from '../lib/procurementStages';

// ── Раздел «Менеджмент» ────────────────────────────────────────────────────────
// Оболочка над той же базой тегов под задачи менеджеров по закупкам.
// Этапы закупки настраиваются в «Настройки → Менеджмент» (название/значок/цвет).
// Отметки этапов хранятся в metadata тега: procurement.stage + stageLog.

interface ProcurementInfo {
  stage?: string;
  stageLog?: Record<string, { at: string; by: string }>;
  // Старый формат (v0.21.0) — переносится в stageLog при чтении
  orderedAt?: string; orderedBy?: string;
  approvedAt?: string; approvedBy?: string;
  purchasedAt?: string; purchasedBy?: string;
  supplier?: string;
  qty?: string;
  note?: string;
}

const ACTUALITY_LABELS: Record<string, { label: string; cls: string }> = {
  actual: { label: 'Актуально', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  warning: { label: 'Проверить', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  critical: { label: 'Критично', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  info: { label: 'В работе', cls: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  draft: { label: 'Устарело', cls: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20' },
};

function parseMeta(tag: any): any {
  // Кэш на объекте тега: JSON.parse для сотен позиций на каждый рендер — источник лагов
  if (tag.__procMeta) return tag.__procMeta;
  try {
    const meta = tag.metadata ? (typeof tag.metadata === 'string' ? JSON.parse(tag.metadata) : tag.metadata) : {};
    tag.__procMeta = meta;
    return meta;
  } catch {
    tag.__procMeta = {};
    return {};
  }
}

function tagActuality(meta: any): string {
  const descriptions = Array.isArray(meta?.descriptions) ? meta.descriptions : [];
  if (descriptions.length === 0) return 'draft';
  if (descriptions.some((d: any) => d.status === 'critical')) return 'critical';
  if (descriptions.some((d: any) => d.status === 'warning')) return 'warning';
  if (descriptions.some((d: any) => d.status === 'info')) return 'info';
  if (descriptions.some((d: any) => d.status === 'actual')) return 'actual';
  return 'draft';
}

// Перенос отметок старого формата (orderedAt/approvedAt/purchasedAt) в stageLog
function normalizeProc(proc: ProcurementInfo): ProcurementInfo {
  const out: ProcurementInfo = { ...proc, stageLog: { ...(proc.stageLog || {}) } };
  if (proc.orderedAt && !out.stageLog!['ordered']) out.stageLog!['ordered'] = { at: proc.orderedAt, by: proc.orderedBy || '' };
  if (proc.approvedAt && !out.stageLog!['approved']) out.stageLog!['approved'] = { at: proc.approvedAt, by: proc.approvedBy || '' };
  if (proc.purchasedAt && !out.stageLog!['purchased']) out.stageLog!['purchased'] = { at: proc.purchasedAt, by: proc.purchasedBy || '' };
  return out;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

interface Row {
  tag: any;
  meta: any;
  proc: ProcurementInfo;
  stageIdx: number;
  actuality: string;
  isDup: boolean;
  name: string;
  qtyNum: number;
}

export default function ProcurementManagement() {
  const { activeProject, user } = useStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [tags, setTags] = useState<any[]>([]);
  const [stages, setStages] = useState<ProcurementStage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Дебаунс поиска: фильтрация и сортировка всех строк на каждый символ фризили ввод
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);
  // Порционный рендер: DOM из тысяч строк тормозил прокрутку — рисуем частями
  const [renderLimit, setRenderLimit] = useState(120);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [sortKey, setSortKey] = useState<'identifier' | 'stage' | 'lastDate' | 'brand' | 'qty'>('identifier');
  const [sortAsc, setSortAsc] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedTree, setExpandedTree] = useState<Record<string, boolean>>({});

  const loadAll = useCallback(async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const [data, loadedStages] = await Promise.all([
        dataService.getTags(activeProject.id),
        loadProcurementStages()
      ]);
      const tagsList = data.tags || [];
      setTags(tagsList);
      setStages(loadedStages);
      const liveIds = new Set(tagsList.map((t: any) => t.id));
      setSelectedIds(prev => new Set(Array.from(prev).filter(id => liveIds.has(id))));
    } catch (err) {
      console.error('Failed to load procurement data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Глубокая ссылка от ИИ-помощника: /management?focus=<tagId> — прокрутить и подсветить строку
  const focusHandledRef = React.useRef(false);
  useEffect(() => {
    if (focusHandledRef.current || tags.length === 0) return;
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const focus = params.get('focus');
    if (!focus) return;
    focusHandledRef.current = true;
    setTimeout(() => {
      const el = document.getElementById(`mgmt-row-${focus}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('share-pulse');
        setTimeout(() => el.classList.remove('share-pulse'), 2500);
      }
      window.history.replaceState(null, '', window.location.hash.split('?')[0]);
    }, 250);
  }, [tags]);

  const stageIds = useMemo(() => stages.map(s => s.id), [stages]);

  const duplicateCodes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tags) {
      const code = (t.identifier || '').trim();
      if (code) counts[code] = (counts[code] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter(c => counts[c] > 1));
  }, [tags]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const t of tags) if (t.department) set.add(t.department);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [tags]);

  // Строки: тег + распарсенные закупочные данные с учётом настроенных этапов
  const rows = useMemo<Row[]>(() => {
    return tags.map(t => {
      const meta = parseMeta(t);
      const proc = normalizeProc(meta.procurement || {});
      let stageIdx = proc.stage ? stageIds.indexOf(proc.stage) : 0;
      if (stageIdx < 0) stageIdx = 0; // этап удалили из настроек — позиция на первом
      return {
        tag: t,
        meta,
        proc,
        stageIdx,
        actuality: tagActuality(meta),
        isDup: duplicateCodes.has((t.identifier || '').trim()),
        name: meta.mainName || '',
        qtyNum: parseFloat(String(proc.qty || '').replace(',', '.')) || 0,
      };
    });
  }, [tags, duplicateCodes, stageIds]);

  const rowsById = useMemo(() => {
    const m: Record<string, Row> = {};
    for (const r of rows) m[r.tag.id] = r;
    return m;
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of stages) c[s.id] = 0;
    for (const r of rows) {
      const id = stages[r.stageIdx]?.id;
      if (id) c[id] = (c[id] || 0) + 1;
    }
    return c;
  }, [rows, stages]);

  const rowMatchesFilters = useCallback((r: Row): boolean => {
    if (stageFilter !== 'all' && stages[r.stageIdx]?.id !== stageFilter) return false;
    if (deptFilter && r.tag.department !== deptFilter) return false;
    if (onlyDuplicates && !r.isDup) return false;
    if (onlyCritical && r.actuality !== 'critical' && r.actuality !== 'warning') return false;
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      const hit = (r.tag.identifier || '').toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.tag.brand || '').toLowerCase().includes(q) ||
        (r.proc.supplier || '').toLowerCase().includes(q) ||
        (r.proc.note || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  }, [stageFilter, deptFilter, onlyDuplicates, onlyCritical, debouncedSearch, stages]);

  // Смена фильтров возвращает порционный рендер к началу
  useEffect(() => {
    setRenderLimit(120);
  }, [stageFilter, deptFilter, onlyDuplicates, onlyCritical, debouncedSearch, viewMode]);

  const lastDateOf = (r: Row): number => {
    let max = new Date(r.tag.createdAt || 0).getTime();
    for (const id of stageIds) {
      const rec = r.proc.stageLog?.[id];
      if (rec?.at) max = Math.max(max, new Date(rec.at).getTime());
    }
    return max;
  };

  const filtered = useMemo(() => {
    const list = rows.filter(rowMatchesFilters);
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'identifier') return dir * (a.tag.identifier || '').localeCompare(b.tag.identifier || '', 'ru');
      if (sortKey === 'brand') return dir * (a.tag.brand || '').localeCompare(b.tag.brand || '', 'ru');
      if (sortKey === 'stage') return dir * (a.stageIdx - b.stageIdx);
      if (sortKey === 'qty') return dir * (a.qtyNum - b.qtyNum);
      return dir * (lastDateOf(a) - lastDateOf(b));
    });
  }, [rows, rowMatchesFilters, sortKey, sortAsc, stageIds]);

  // ── Дерево: родитель → дочерние (по связям тегов на холсте) ────────────────
  const tree = useMemo(() => {
    if (viewMode !== 'tree') return [];
    const idSet = new Set(tags.map(t => t.id));
    const childrenMap: Record<string, string[]> = {};
    const hasParent: Record<string, boolean> = {};
    for (const t of tags) {
      const meta = parseMeta(t);
      const kids = (Array.isArray(meta.connections) ? meta.connections : []).filter((id: string) => idSet.has(id));
      childrenMap[t.id] = kids;
      kids.forEach((k: string) => { hasParent[k] = true; });
    }
    const visible = new Set<string>();
    // Узел показываем, если он или любой его потомок проходит фильтры
    const passes = (id: string, seen: Set<string>): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      const row = rowsById[id];
      let ok = row ? rowMatchesFilters(row) : false;
      for (const k of (childrenMap[id] || [])) {
        if (passes(k, seen)) ok = true;
      }
      if (ok) visible.add(id);
      return ok;
    };
    const roots = tags.filter(t => !hasParent[t.id]);
    for (const r of roots) passes(r.id, new Set());
    return roots
      .filter(r => visible.has(r.id))
      .sort((a, b) => (a.identifier || '').localeCompare(b.identifier || '', 'ru'))
      .map(r => ({ id: r.id, childrenMap, visible }));
  }, [viewMode, tags, rowsById, rowMatchesFilters]);

  // ── Сохранение и смена этапов ───────────────────────────────────────────────
  const saveProc = async (tag: any, meta: any, proc: ProcurementInfo) => {
    const newMeta = { ...meta, procurement: proc };
    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, metadata: JSON.stringify(newMeta), parsedMetadata: undefined, __procMeta: undefined } : t));
    try {
      await fetch(`/api/tags/${tag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: JSON.stringify(newMeta) })
      });
    } catch (err) {
      console.error('Failed to save procurement info:', err);
      addToast('Не удалось сохранить изменения', 'error');
    }
  };

  // Установка этапа одной позиции (с датами промежуточных этапов)
  const applyStage = (row: Row, targetIdx: number): ProcurementInfo => {
    const now = new Date().toISOString();
    const who = user?.name || 'Пользователь';
    const proc = normalizeProc(row.proc);
    const log = { ...(proc.stageLog || {}) };
    for (let i = 1; i < stages.length; i++) {
      const sid = stages[i].id;
      if (i <= targetIdx) {
        if (!log[sid]) log[sid] = { at: now, by: who };
      } else {
        delete log[sid];
      }
    }
    // Старые поля больше не используем — вычищаем, чтобы не было двух источников
    delete proc.orderedAt; delete proc.orderedBy;
    delete proc.approvedAt; delete proc.approvedBy;
    delete proc.purchasedAt; delete proc.purchasedBy;
    proc.stageLog = log;
    proc.stage = stages[targetIdx]?.id;
    return proc;
  };

  const setStage = async (row: Row, targetIdx: number) => {
    // Повторный клик по текущему этапу — откат на шаг назад
    const finalIdx = (targetIdx === row.stageIdx && targetIdx > 0) ? targetIdx - 1 : targetIdx;
    await saveProc(row.tag, row.meta, applyStage(row, finalIdx));
    if (finalIdx !== row.stageIdx) {
      addToast(`«${row.tag.identifier}»: этап «${stages[finalIdx]?.label}»`, finalIdx > row.stageIdx ? 'success' : 'info');
    }
  };

  // Массовая установка этапа всем выбранным — одним запросом
  // (последовательные PUT по каждой позиции заметно фризили интерфейс)
  const setStageBulk = async (targetIdx: number) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const updates: { id: string; metadata: string }[] = [];
    for (const id of ids) {
      const row = rowsById[id];
      if (!row) continue;
      const newMeta = { ...row.meta, procurement: applyStage(row, targetIdx) };
      updates.push({ id, metadata: JSON.stringify(newMeta) });
    }
    // Мгновенное локальное обновление
    const metaById = new Map(updates.map(u => [u.id, u.metadata]));
    setTags(prev => prev.map(t => metaById.has(t.id)
      ? { ...t, metadata: metaById.get(t.id), parsedMetadata: undefined, __procMeta: undefined }
      : t));
    try {
      const res = await fetch('/api/tags/bulk-metadata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error('bulk update failed');
      addToast(`Этап «${stages[targetIdx]?.label}» установлен для позиций: ${updates.length}`, 'success');
    } catch (err) {
      console.error('Bulk stage update failed:', err);
      addToast('Не удалось сохранить массовое изменение — обновите страницу', 'error');
      loadAll();
    }
  };

  const saveField = async (row: Row, field: 'supplier' | 'qty' | 'note', value: string) => {
    await saveProc(row.tag, row.meta, { ...normalizeProc(row.proc), [field]: value });
  };

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.tag.id));

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl mx-auto p-8 shadow-sm text-center">
        <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Проект не выбран</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-sm">Выберите проект на «Главной», чтобы открыть закупки по его позициям.</p>
      </div>
    );
  }

  // ── Строка позиции (общая для списка и дерева) ──────────────────────────────
  const renderRow = (row: Row, treeLevel: number | null, treeHasChildren?: boolean, treeExpanded?: boolean, onTreeToggle?: () => void) => {
    const act = ACTUALITY_LABELS[row.actuality] || ACTUALITY_LABELS.draft;
    const isSelected = selectedIds.has(row.tag.id);
    return (
      <tr
        key={row.tag.id}
        id={`mgmt-row-${row.tag.id}`}
        data-share-route="/management"
        data-share-focus={`ptag:${row.tag.id}`}
        data-share-label={row.tag.identifier}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleSelect(row.tag.id);
          }
        }}
        className={`border-b border-slate-100 dark:border-slate-900 transition-colors ${
          isSelected
            ? 'bg-indigo-50 dark:bg-indigo-950/30'
            : row.isDup
              ? 'bg-rose-50/40 dark:bg-rose-950/10 hover:bg-rose-50/70 dark:hover:bg-rose-950/20'
              : 'hover:bg-slate-50/60 dark:hover:bg-slate-900/40'
        }`}
      >
        {/* Галочка мультивыбора */}
        <td className="px-3 py-3 align-top w-8">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(row.tag.id)}
            onClick={(e) => e.stopPropagation()}
            className="accent-indigo-500 cursor-pointer"
            title="Выбрать для массовых действий (или Ctrl+клик по строке)"
          />
        </td>

        {/* Позиция */}
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-1.5" style={treeLevel !== null ? { paddingLeft: `${treeLevel * 22}px` } : undefined}>
            {treeLevel !== null && (
              treeHasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onTreeToggle && onTreeToggle(); }}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  title={treeExpanded ? 'Свернуть дочерние' : 'Развернуть дочерние'}
                >
                  {treeExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                </button>
              ) : <span className="w-4.5 inline-block shrink-0" style={{ width: 18 }} />
            )}
            <span className="font-mono font-bold text-xs text-slate-900 dark:text-white select-all">{row.tag.identifier}</span>
            {row.isDup && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 uppercase" title="Дубликат кода тега">дубль</span>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-[220px] truncate" title={row.name} style={treeLevel !== null ? { paddingLeft: `${treeLevel * 22 + 18}px` } : undefined}>
            {row.name || <span className="italic opacity-60">Без наименования</span>}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5" style={treeLevel !== null ? { paddingLeft: `${treeLevel * 22 + 18}px` } : undefined}>
            {row.tag.department || '—'} · добавлен {fmtDate(row.tag.createdAt)}
          </div>
        </td>

        {/* Марка */}
        <td className="px-4 py-3 align-top">
          {row.tag.brand ? (
            <span className="font-mono text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 inline-block max-w-[150px] truncate" title={row.tag.brand}>
              {row.tag.brand}
            </span>
          ) : <span className="text-xs text-slate-400 italic">—</span>}
        </td>

        {/* Актуальность */}
        <td className="px-4 py-3 align-top">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${act.cls}`}>
            {(row.actuality === 'critical' || row.actuality === 'warning') && <AlertTriangle className="w-3 h-3" />}
            {act.label}
          </span>
        </td>

        {/* Этап закупки: настроенный степпер */}
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-0.5 flex-wrap">
            {stages.map((s, idx) => {
              const Icon = stageIcon(s.icon);
              const c = stageColor(s.color);
              const reached = idx <= row.stageIdx;
              return (
                <React.Fragment key={s.id}>
                  {idx > 0 && <div className={`w-3 h-0.5 ${idx <= row.stageIdx ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-800'}`} />}
                  <button
                    onClick={(e) => { e.stopPropagation(); setStage(row, idx); }}
                    title={`${s.label}${idx === row.stageIdx && idx > 0 ? ' (клик — откат на шаг назад)' : ''}`}
                    className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                      reached
                        ? `${c.bg} ${c.border} ${c.color} ${idx === row.stageIdx ? 'ring-2 ring-offset-1 dark:ring-offset-slate-950 ring-current scale-110' : ''}`
                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <div className="text-[10px] font-bold mt-1 text-slate-500 dark:text-slate-400">{stages[row.stageIdx]?.label || '—'}</div>
        </td>

        {/* Даты этапов */}
        <td className="px-4 py-3 align-top">
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5 leading-tight">
            {stages.slice(1).map(s => {
              const rec = row.proc.stageLog?.[s.id];
              const c = stageColor(s.color);
              return (
                <div key={s.id} title={rec?.by ? `Отметил: ${rec.by}` : ''}>
                  {s.label.toLowerCase()}: <strong className={rec?.at ? c.color : ''}>{fmtDate(rec?.at)}</strong>
                </div>
              );
            })}
          </div>
        </td>

        {/* Поставщик и количество */}
        <td className="px-4 py-3 align-top">
          <input
            type="text"
            defaultValue={row.proc.supplier || ''}
            placeholder="Поставщик…"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { if (e.target.value !== (row.proc.supplier || '')) saveField(row, 'supplier', e.target.value); }}
            className="w-32 px-2 py-1 mb-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs focus:outline-none focus:border-indigo-400 text-slate-800 dark:text-slate-100 block"
          />
          <input
            type="text"
            defaultValue={row.proc.qty || ''}
            placeholder="Кол-во…"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { if (e.target.value !== (row.proc.qty || '')) saveField(row, 'qty', e.target.value); }}
            className="w-32 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs focus:outline-none focus:border-indigo-400 text-slate-800 dark:text-slate-100 block"
          />
        </td>

        {/* Примечание */}
        <td className="px-4 py-3 align-top min-w-[180px]">
          {editingNoteId === row.tag.id ? (
            <textarea
              autoFocus
              defaultValue={row.proc.note || ''}
              rows={2}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                if (e.target.value !== (row.proc.note || '')) saveField(row, 'note', e.target.value);
                setEditingNoteId(null);
              }}
              className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded text-xs focus:outline-none text-slate-800 dark:text-slate-100"
            />
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingNoteId(row.tag.id); }}
              className="text-xs text-left text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-text w-full min-h-[24px]"
              title="Нажмите, чтобы изменить примечание"
            >
              {row.proc.note || <span className="italic opacity-50">добавить примечание…</span>}
            </button>
          )}
        </td>
      </tr>
    );
  };

  // Рекурсивный рендер дерева в строки таблицы
  const renderTreeRows = (id: string, childrenMap: Record<string, string[]>, visible: Set<string>, level: number, seen: Set<string>): React.ReactNode[] => {
    if (seen.has(id) || !visible.has(id)) return [];
    seen.add(id);
    const row = rowsById[id];
    if (!row) return [];
    const kids = (childrenMap[id] || []).filter(k => visible.has(k) && !seen.has(k));
    const expanded = expandedTree[id] !== false; // по умолчанию раскрыто
    const out: React.ReactNode[] = [
      renderRow(row, level, kids.length > 0, expanded, () => setExpandedTree(prev => ({ ...prev, [id]: !(prev[id] !== false) })))
    ];
    if (expanded) {
      for (const k of kids) out.push(...renderTreeRows(k, childrenMap, visible, level + 1, seen));
    }
    return out;
  };

  // Без входной анимации: на большом списке она добавляла заметный фриз при открытии раздела
  return (
    <div className="flex flex-col gap-3 text-slate-800 dark:text-slate-100">
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Менеджмент · Закупки</h1>
            <p className="text-xs text-slate-400">Жизненный цикл позиций проекта. Этапы настраиваются в «Настройки → Менеджмент».</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${viewMode === 'list' ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs' : 'text-slate-500'}`}
            >
              <List className="w-3.5 h-3.5" /> Список
            </button>
            <button
              onClick={() => setViewMode('tree')}
              title="Группировка: родительский тег → дочерние"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${viewMode === 'tree' ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs' : 'text-slate-500'}`}
            >
              <FolderTree className="w-3.5 h-3.5" /> Дерево
            </button>
          </div>
          <button
            onClick={() => navigate('/settings?section=management')}
            title="Настроить этапы закупки"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" /> Этапы
          </button>
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Обновить
          </button>
        </div>
      </div>

      {/* Счётчики этапов: клик — фильтр */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <button
          onClick={() => setStageFilter('all')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${stageFilter === 'all' ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 hover:border-indigo-300'}`}
        >
          <div className="text-2xl font-black leading-none">{rows.length}</div>
          <div className={`text-xs font-bold mt-1 ${stageFilter === 'all' ? 'text-indigo-100' : 'text-slate-400'}`}>Все позиции</div>
        </button>
        {stages.map(s => {
          const Icon = stageIcon(s.icon);
          const c = stageColor(s.color);
          const active = stageFilter === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setStageFilter(active ? 'all' : s.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${active ? `${c.bg} ${c.border} ring-2 ring-offset-1 dark:ring-offset-slate-950 ring-current ${c.color} shadow-md` : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 hover:shadow-sm'}`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-2xl font-black leading-none ${c.color}`}>{counts[s.id] || 0}</div>
                <Icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <div className="text-xs font-bold mt-1 text-slate-400 truncate">{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* Поиск и фильтры */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2 text-slate-400" />
          <input
            type="search"
            placeholder="Поиск: тег, наименование, марка, поставщик, примечание…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="w-44">
          <CustomSelect
            value={deptFilter}
            onChange={setDeptFilter}
            placeholder="Все отделы"
            options={[{ value: '', label: 'Все отделы' }, ...departments.map(d => ({ value: d, label: d }))]}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900">
          <input type="checkbox" checked={onlyDuplicates} onChange={(e) => setOnlyDuplicates(e.target.checked)} className="accent-rose-500" />
          Только дубли
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900">
          <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} className="accent-amber-500" />
          Требуют внимания
        </label>
        <span className="text-xs text-slate-400 flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Показано: {filtered.length}</span>
      </div>

      {/* Панель массовых действий */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-xl">
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4" /> Выбрано: {selectedIds.size}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Установить этап:</span>
          {stages.map((s, idx) => {
            const Icon = stageIcon(s.icon);
            const c = stageColor(s.color);
            return (
              <button
                key={s.id}
                onClick={() => setStageBulk(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all hover:scale-105 ${c.bg} ${c.border} ${c.color}`}
              >
                <Icon className="w-3.5 h-3.5" /> {s.label}
              </button>
            );
          })}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-slate-900 text-slate-400 cursor-pointer"
            title="Снять выделение"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Таблица позиций */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[980px]">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-850">
            <tr>
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() => {
                    if (allVisibleSelected) setSelectedIds(new Set());
                    else setSelectedIds(new Set(filtered.map(r => r.tag.id)));
                  }}
                  className="accent-indigo-500 cursor-pointer"
                  title="Выбрать все показанные"
                />
              </th>
              <th className="px-4 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-white select-none" onClick={() => toggleSort('identifier')}>
                Позиция {sortKey === 'identifier' && (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
              </th>
              <th className="px-4 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-white select-none" onClick={() => toggleSort('brand')}>
                Марка {sortKey === 'brand' && (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
              </th>
              <th className="px-4 py-2.5">Актуальность</th>
              <th className="px-4 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-white select-none" onClick={() => toggleSort('stage')}>
                Этап закупки {sortKey === 'stage' && (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
              </th>
              <th className="px-4 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-white select-none" onClick={() => toggleSort('lastDate')}>
                Даты этапов {sortKey === 'lastDate' && (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
              </th>
              <th className="px-4 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-white select-none" onClick={() => toggleSort('qty')}>
                Поставщик / Кол-во {sortKey === 'qty' && (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
              </th>
              <th className="px-4 py-2.5">Примечание</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-slate-400 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Загрузка позиций…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-slate-400 text-sm">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                {rows.length === 0 ? 'В проекте нет позиций. Добавьте теги в разделе «Теги».' : 'Ничего не найдено по заданным фильтрам.'}
              </td></tr>
            ) : viewMode === 'list' ? (
              filtered.slice(0, renderLimit).map(row => renderRow(row, null))
            ) : (
              tree.flatMap(({ id, childrenMap, visible }) => renderTreeRows(id, childrenMap, visible, 0, new Set()))
            )}
            {viewMode === 'list' && filtered.length > renderLimit && (
              <tr>
                <td colSpan={8} className="p-0">
                  <button
                    onClick={() => setRenderLimit(l => l + 300)}
                    className="w-full py-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 cursor-pointer"
                  >
                    Показать ещё ({filtered.length - renderLimit} позиций скрыто)
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
