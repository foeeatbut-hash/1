import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService } from '../services/dataService';
import {
  Briefcase, Search, ShoppingCart, ClipboardCheck, PackageCheck, PlusCircle,
  RefreshCw, Database, AlertTriangle, X, ChevronDown, ChevronUp, Filter
} from 'lucide-react';
import { motion } from 'motion/react';

// ── Раздел «Менеджмент» ────────────────────────────────────────────────────────
// Оболочка над той же базой тегов, но под задачи менеджеров по закупкам:
// жизненный цикл позиции «Добавлен → Заказан → Утверждён → Куплен» с датами
// каждого этапа, поставщиком, количеством и примечанием. Данные хранятся
// в metadata тега (ключ procurement) — отдельная таблица не нужна.

type Stage = 'added' | 'ordered' | 'approved' | 'purchased';

interface ProcurementInfo {
  stage?: Stage;
  orderedAt?: string;
  orderedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  purchasedAt?: string;
  purchasedBy?: string;
  supplier?: string;
  qty?: string;
  note?: string;
}

const STAGES: Array<{ id: Stage; label: string; icon: any; color: string; bg: string; border: string }> = [
  { id: 'added', label: 'Добавлен', icon: PlusCircle, color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-900', border: 'border-slate-300 dark:border-slate-700' },
  { id: 'ordered', label: 'Заказан', icon: ShoppingCart, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-300 dark:border-sky-800' },
  { id: 'approved', label: 'Утверждён', icon: ClipboardCheck, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-800' },
  { id: 'purchased', label: 'Куплен', icon: PackageCheck, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-800' },
];

const STAGE_ORDER: Stage[] = ['added', 'ordered', 'approved', 'purchased'];

const ACTUALITY_LABELS: Record<string, { label: string; cls: string }> = {
  actual: { label: 'Актуально', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  warning: { label: 'Проверить', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  critical: { label: 'Критично', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  info: { label: 'В работе', cls: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  draft: { label: 'Устарело', cls: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20' },
};

function parseMeta(tag: any): any {
  try {
    return tag.metadata ? (typeof tag.metadata === 'string' ? JSON.parse(tag.metadata) : tag.metadata) : {};
  } catch {
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

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export default function ProcurementManagement() {
  const { activeProject, user } = useStore();
  const { addToast } = useToastStore();

  const [tags, setTags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [sortKey, setSortKey] = useState<'identifier' | 'stage' | 'purchasedAt' | 'brand'>('identifier');
  const [sortAsc, setSortAsc] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const data = await dataService.getTags(activeProject.id);
      setTags(data.tags || []);
    } catch (err) {
      console.error('Failed to load procurement tags:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const duplicateCodes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tags) {
      const code = (t.identifier || '').trim();
      if (code) counts[code] = (counts[code] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter(c => counts[c] > 1));
  }, [tags]);

  // Строки таблицы: тег + распарсенные закупочные данные
  const rows = useMemo(() => {
    return tags.map(t => {
      const meta = parseMeta(t);
      const proc: ProcurementInfo = meta.procurement || {};
      const stage: Stage = proc.stage && STAGE_ORDER.includes(proc.stage) ? proc.stage : 'added';
      return {
        tag: t,
        meta,
        proc,
        stage,
        actuality: tagActuality(meta),
        isDup: duplicateCodes.has((t.identifier || '').trim()),
        name: meta.mainName || '',
      };
    });
  }, [tags, duplicateCodes]);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { added: 0, ordered: 0, approved: 0, purchased: 0 };
    for (const r of rows) c[r.stage]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (stageFilter !== 'all') list = list.filter(r => r.stage === stageFilter);
    if (onlyDuplicates) list = list.filter(r => r.isDup);
    if (onlyCritical) list = list.filter(r => r.actuality === 'critical' || r.actuality === 'warning');
    if (q) {
      list = list.filter(r =>
        (r.tag.identifier || '').toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.tag.brand || '').toLowerCase().includes(q) ||
        (r.proc.supplier || '').toLowerCase().includes(q) ||
        (r.proc.note || '').toLowerCase().includes(q)
      );
    }
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'identifier') return dir * (a.tag.identifier || '').localeCompare(b.tag.identifier || '', 'ru');
      if (sortKey === 'brand') return dir * (a.tag.brand || '').localeCompare(b.tag.brand || '', 'ru');
      if (sortKey === 'stage') return dir * (STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
      // purchasedAt: последняя достигнутая дата
      const dateOf = (r: typeof a) => new Date(r.proc.purchasedAt || r.proc.approvedAt || r.proc.orderedAt || r.tag.createdAt || 0).getTime();
      return dir * (dateOf(a) - dateOf(b));
    });
  }, [rows, search, stageFilter, onlyDuplicates, onlyCritical, sortKey, sortAsc]);

  // Сохранение закупочных данных в metadata тега (та же БД, PUT /api/tags/:id)
  const saveProc = async (tag: any, meta: any, proc: ProcurementInfo) => {
    const newMeta = { ...meta, procurement: proc };
    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, metadata: JSON.stringify(newMeta), parsedMetadata: undefined } : t));
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

  // Клик по этапу: продвигаем позицию до него (или откатываем, если кликнули текущий)
  const setStage = async (row: any, stage: Stage) => {
    const now = new Date().toISOString();
    const who = user?.name || 'Пользователь';
    const proc: ProcurementInfo = { ...row.proc };
    const targetIdx = STAGE_ORDER.indexOf(stage);
    const currentIdx = STAGE_ORDER.indexOf(row.stage);

    if (stage === row.stage && stage !== 'added') {
      // Повторный клик по текущему этапу — откат на шаг назад
      const prevStage = STAGE_ORDER[currentIdx - 1];
      if (stage === 'ordered') { delete proc.orderedAt; delete proc.orderedBy; }
      if (stage === 'approved') { delete proc.approvedAt; delete proc.approvedBy; }
      if (stage === 'purchased') { delete proc.purchasedAt; delete proc.purchasedBy; }
      proc.stage = prevStage;
      await saveProc(row.tag, row.meta, proc);
      addToast(`«${row.tag.identifier}»: возврат на этап «${STAGES[currentIdx - 1].label}»`, 'info');
      return;
    }

    // Продвижение вперёд: фиксируем даты всех промежуточных этапов
    if (targetIdx >= 1 && !proc.orderedAt) { proc.orderedAt = now; proc.orderedBy = who; }
    if (targetIdx >= 2 && !proc.approvedAt) { proc.approvedAt = now; proc.approvedBy = who; }
    if (targetIdx >= 3 && !proc.purchasedAt) { proc.purchasedAt = now; proc.purchasedBy = who; }
    // Откат назад через клик по более раннему этапу
    if (targetIdx < 1) { delete proc.orderedAt; delete proc.orderedBy; }
    if (targetIdx < 2) { delete proc.approvedAt; delete proc.approvedBy; }
    if (targetIdx < 3) { delete proc.purchasedAt; delete proc.purchasedBy; }
    proc.stage = stage;
    await saveProc(row.tag, row.meta, proc);
    if (targetIdx > currentIdx) {
      addToast(`«${row.tag.identifier}»: этап «${STAGES[targetIdx].label}»`, 'success');
    }
  };

  const saveField = async (row: any, field: 'supplier' | 'qty' | 'note', value: string) => {
    const proc: ProcurementInfo = { ...row.proc, [field]: value };
    await saveProc(row.tag, row.meta, proc);
  };

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl mx-auto p-8 shadow-sm text-center">
        <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Проект не выбран</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-sm">Выберите проект на «Главной», чтобы открыть закупки по его позициям.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-3 text-slate-800 dark:text-slate-100"
    >
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Менеджмент · Закупки</h1>
            <p className="text-xs text-slate-400">Актуальность позиций проекта и жизненный цикл закупки. База данных общая с реестром тегов.</p>
          </div>
        </div>
        <button
          onClick={loadTags}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer self-start lg:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Обновить
        </button>
      </div>

      {/* Счётчики этапов: клик — фильтр */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <button
          onClick={() => setStageFilter('all')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${stageFilter === 'all' ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 hover:border-indigo-300'}`}
        >
          <div className="text-2xl font-black leading-none">{rows.length}</div>
          <div className={`text-xs font-bold mt-1 ${stageFilter === 'all' ? 'text-indigo-100' : 'text-slate-400'}`}>Все позиции</div>
        </button>
        {STAGES.map(s => {
          const Icon = s.icon;
          const active = stageFilter === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setStageFilter(active ? 'all' : s.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${active ? `${s.bg} ${s.border} ring-2 ring-offset-1 dark:ring-offset-slate-950 ring-current ${s.color} shadow-md` : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 hover:shadow-sm'}`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-2xl font-black leading-none ${s.color}`}>{counts[s.id]}</div>
                <Icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="text-xs font-bold mt-1 text-slate-400">{s.label}</div>
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

      {/* Таблица позиций */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-850">
            <tr>
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
              <th className="px-4 py-2.5 cursor-pointer hover:text-slate-800 dark:hover:text-white select-none" onClick={() => toggleSort('purchasedAt')}>
                Даты этапов {sortKey === 'purchasedAt' && (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
              </th>
              <th className="px-4 py-2.5">Поставщик / Кол-во</th>
              <th className="px-4 py-2.5">Примечание</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-16 text-slate-400 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Загрузка позиций…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-16 text-slate-400 text-sm">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                {rows.length === 0 ? 'В проекте нет позиций. Добавьте теги в разделе «Теги».' : 'Ничего не найдено по заданным фильтрам.'}
              </td></tr>
            ) : filtered.map(row => {
              const act = ACTUALITY_LABELS[row.actuality] || ACTUALITY_LABELS.draft;
              const stageIdx = STAGE_ORDER.indexOf(row.stage);
              return (
                <tr
                  key={row.tag.id}
                  data-share-route="/management"
                  data-share-focus={`ptag:${row.tag.id}`}
                  data-share-label={row.tag.identifier}
                  className={`border-b border-slate-100 dark:border-slate-900 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40 ${row.isDup ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''}`}
                >
                  {/* Позиция */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white select-all">{row.tag.identifier}</span>
                      {row.isDup && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 uppercase" title="Дубликат кода тега">дубль</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-[220px] truncate" title={row.name}>
                      {row.name || <span className="italic opacity-60">Без наименования</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">добавлен {fmtDate(row.tag.createdAt)}</div>
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

                  {/* Этап закупки: степпер */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-0.5">
                      {STAGES.map((s, idx) => {
                        const Icon = s.icon;
                        const reached = idx <= stageIdx;
                        return (
                          <React.Fragment key={s.id}>
                            {idx > 0 && <div className={`w-3 h-0.5 ${idx <= stageIdx ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-800'}`} />}
                            <button
                              onClick={() => setStage(row, s.id)}
                              title={`${s.label}${idx === stageIdx && idx > 0 ? ' (клик — откат на шаг назад)' : ''}`}
                              className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                                reached
                                  ? `${s.bg} ${s.border} ${s.color} ${idx === stageIdx ? 'ring-2 ring-offset-1 dark:ring-offset-slate-950 ring-current scale-110' : ''}`
                                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700 hover:border-slate-400'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <div className="text-[10px] font-bold mt-1 text-slate-500 dark:text-slate-400">{STAGES[stageIdx].label}</div>
                  </td>

                  {/* Даты этапов */}
                  <td className="px-4 py-3 align-top">
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5 leading-tight">
                      <div title={row.proc.orderedBy ? `Отметил: ${row.proc.orderedBy}` : ''}>заказан: <strong className={row.proc.orderedAt ? 'text-sky-600 dark:text-sky-400' : ''}>{fmtDate(row.proc.orderedAt)}</strong></div>
                      <div title={row.proc.approvedBy ? `Отметил: ${row.proc.approvedBy}` : ''}>утверждён: <strong className={row.proc.approvedAt ? 'text-amber-600 dark:text-amber-400' : ''}>{fmtDate(row.proc.approvedAt)}</strong></div>
                      <div title={row.proc.purchasedBy ? `Отметил: ${row.proc.purchasedBy}` : ''}>куплен: <strong className={row.proc.purchasedAt ? 'text-emerald-600 dark:text-emerald-400' : ''}>{fmtDate(row.proc.purchasedAt)}</strong></div>
                    </div>
                  </td>

                  {/* Поставщик и количество */}
                  <td className="px-4 py-3 align-top">
                    <input
                      type="text"
                      defaultValue={row.proc.supplier || ''}
                      placeholder="Поставщик…"
                      onBlur={(e) => { if (e.target.value !== (row.proc.supplier || '')) saveField(row, 'supplier', e.target.value); }}
                      className="w-32 px-2 py-1 mb-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs focus:outline-none focus:border-indigo-400 text-slate-800 dark:text-slate-100 block"
                    />
                    <input
                      type="text"
                      defaultValue={row.proc.qty || ''}
                      placeholder="Кол-во…"
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
                        onBlur={(e) => {
                          if (e.target.value !== (row.proc.note || '')) saveField(row, 'note', e.target.value);
                          setEditingNoteId(null);
                        }}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded text-xs focus:outline-none text-slate-800 dark:text-slate-100"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingNoteId(row.tag.id)}
                        className="text-xs text-left text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-text w-full min-h-[24px]"
                        title="Нажмите, чтобы изменить примечание"
                      >
                        {row.proc.note || <span className="italic opacity-50">добавить примечание…</span>}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
