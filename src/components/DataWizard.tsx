/**
 * Мастер «Собрать данные»: из чего собрать умный блок таблицы.
 *
 * Три шага — что берём (теги или оборудование), какие колонки, по какому
 * отбору. Предпросмотр показывает настоящие строки проекта до вставки: блок
 * попадает в книгу вместе со своим запросом и потом обновляется по кнопке.
 *
 * Вынесен из ConstructorScreen: экран редактора и без него велик, а мастер
 * самодостаточен — знает только про каталог проекта и про то, что отдать
 * наружу.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ChevronRight, Database, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { countOf } from '../lib/plural';
import { useToastStore } from '../store/toastStore';
import { useModalStore } from '../store/modalStore';
import type { CatalogData, WizardResult } from '../lib/constructorTypes';

// Диалоги программы вместо системных окон Windows
const { openPrompt } = useModalStore.getState();

export default function DataWizard({ projectId, onInsert, onClose }: {
  projectId: string;
  onInsert: (r: WizardResult) => void;
  onClose: () => void;
}) {
  const { addToast } = useToastStore();
  const [step, setStep] = useState(1);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [entity, setEntity] = useState<'tag' | 'element'>('tag');
  const [selected, setSelected] = useState<{ path: string; title: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterOp, setFilterOp] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [preview, setPreview] = useState<{ rows: any[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCatalog = () => {
    fetch(`/api/constructor/catalog?projectId=${projectId}`)
      .then(r => r.json())
      .then(setCatalog)
      .catch(() => addToast('Не удалось загрузить каталог полей', 'error'));
  };
  useEffect(() => { loadCatalog(); }, [projectId]);

  // Объединить выбранные сырые параметры в один алиас (сшивает разные названия
  // из бланков). Право проверяет сервер; после — обновляем каталог.
  const mergeSelectedIntoAlias = async () => {
    const members = selected
      .filter(s => s.path.startsWith('param:') && !s.path.startsWith('param:@'))
      .map(s => s.path.slice(6));
    if (members.length < 2) return;
    const name = await openPrompt('Объединить поля', 'Как назвать общее поле?', 'Например: Расход воздуха', selected[0]?.title?.split(',')[0] || '');
    if (!name || !name.trim()) return;
    try {
      const existing = catalog?.aliases?.map(a => ({ name: a.title, unit: a.unit, members: a.members })) || [];
      const r = await fetch('/api/constructor/aliases', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, aliases: [...existing, { name: name.trim(), members }] }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); addToast(d.error || 'Не удалось создать поле', 'error'); return; }
      addToast(`Поле «${name.trim()}» объединяет ${members.length} параметра`, 'success');
      // Снимаем сырые параметры, выбираем новый алиас
      setSelected(prev => [...prev.filter(s => !members.includes(s.path.slice(6))), { path: `param:@${name.trim()}`, title: name.trim() }]);
      loadCatalog();
    } catch (_) { addToast('Ошибка сети', 'error'); }
  };

  const toggle = (path: string, title: string) => {
    setSelected(prev => prev.find(s => s.path === path)
      ? prev.filter(s => s.path !== path)
      : [...prev, { path, title }]);
  };

  const buildFilters = () => (filterField && (filterValue || filterOp === 'empty' || filterOp === 'nempty'))
    ? [{ field: filterField, op: filterOp, value: filterValue }]
    : [];

  const runQuery = async (limit: number) => {
    const res = await fetch('/api/constructor/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, entity, columns: selected.map(s => s.path), filters: buildFilters(), limit }),
    });
    if (!res.ok) throw new Error('query failed');
    return res.json();
  };

  const loadPreview = async () => {
    setBusy(true);
    try { setPreview(await runQuery(8)); }
    catch (_) { addToast('Ошибка запроса данных', 'error'); }
    finally { setBusy(false); }
  };

  const insert = async () => {
    setBusy(true);
    try {
      const data = await runQuery(50000);
      const entityName = entity === 'tag' ? 'Теги' : 'Оборудование';
      onInsert({
        headers: selected.map(s => s.title),
        rows: data.rows.map((r: any) => r.cells),
        keys: data.rows.map((r: any) => r.key),
        query: { entity, columns: selected, filters: buildFilters() },
        suggestedName: filterValue ? `${entityName}: ${filterValue}` : `${entityName} проекта`,
      });
    } catch (_) { addToast('Ошибка запроса данных', 'error'); }
    finally { setBusy(false); }
  };

  // Дерево доступных колонок для выбранной сущности
  const fields = useMemo(() => {
    if (!catalog) return [] as { path: string; title: string; note?: string; alias?: boolean }[];
    const base = entity === 'tag' ? catalog.tagFields : catalog.elementFields;
    const meta = entity === 'tag' ? catalog.metaKeys.map(m => ({ path: m.path, title: m.key, note: `${m.count}` })) : [];
    // Объединённые поля (алиасы) — сверху, с пометкой
    const aliasFields = (catalog.aliases || []).map(a => ({
      path: a.path,
      title: `${a.title}${a.unit ? `, ${a.unit}` : ''}`,
      note: `объединённое · есть у ${a.count}`,
      alias: true,
    }));
    const params = catalog.params.map(p => ({
      path: `param:${p.group}|${p.key}`,
      title: `${p.key}${p.unit ? `, ${p.unit}` : ''}`,
      note: `${p.group} · есть у ${p.count}`,
      alias: false,
    }));
    const all = [...aliasFields, ...base, ...meta, ...params];
    const q = search.trim().toLowerCase();
    return q ? all.filter(f => f.title.toLowerCase().includes(q) || (f as any).note?.toLowerCase?.().includes(q)) : all;
  }, [catalog, entity, search]);

  const rawSelectedCount = selected.filter(s => s.path.startsWith('param:') && !s.path.startsWith('param:@')).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Database className="w-4.5 h-4.5 text-emerald-600" /> Собрать данные — шаг {step} из 3
          </h3>
          <button type="button" title="Закрыть сборку данных" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer"><X className="w-4.5 h-4.5" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'tag' as const, title: 'Теги', desc: 'Реестр тегов проекта: идентификаторы, марки, отделы + параметры связанного оборудования', count: catalog?.counts.tags },
                { key: 'element' as const, title: 'Оборудование', desc: 'Элементы оборудования: позиции, типы, системы + все параметры из бланков', count: catalog?.counts.elements },
              ].map(c => (
                <button type="button" key={c.key} onClick={() => { setEntity(c.key); setSelected([]); }}
                  className={`text-left p-5 rounded-xl border-2 transition-ui cursor-pointer ${entity === c.key ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                  <div className="font-bold text-slate-800 dark:text-white text-lg">{c.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{c.desc}</div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-3">{c.count ?? '…'} в проекте</div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск поля или параметра…"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <span className="text-xs font-bold text-slate-500 shrink-0">Выбрано: {selected.length}</span>
              </div>
              {rawSelectedCount >= 2 && (
                <button type="button" onClick={mergeSelectedIntoAlias}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/50 cursor-pointer">
                  ⚭ Объединить выбранные {rawSelectedCount} параметра в одно поле
                </button>
              )}
              <div className="max-h-[46vh] overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-850">
                {fields.map(f => {
                  const on = !!selected.find(s => s.path === f.path);
                  return (
                    <label key={f.path} className={`flex items-center gap-3 px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer ${(f as any).alias ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(f.path, f.title)} className="w-4 h-4 accent-emerald-500" />
                      <span className="text-sm text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
                        {(f as any).alias && <span className="text-emerald-500" title="Объединённое поле (алиас)">⚭</span>}
                        {f.title}
                      </span>
                      {(f as any).note && <span className="text-xs text-slate-400 ml-auto shrink-0">{(f as any).note}</span>}
                    </label>
                  );
                })}
                {fields.length === 0 && <div className="p-6 text-center text-sm text-slate-400">Ничего не найдено</div>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Фильтр строк:</span>
                <select value={filterField} onChange={e => setFilterField(e.target.value)}
                  className="text-sm px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
                  <option value="">— без фильтра (все строки) —</option>
                  {selected.map(s => <option key={s.path} value={s.path}>{s.title}</option>)}
                </select>
                {filterField && (
                  <>
                    <select value={filterOp} onChange={e => setFilterOp(e.target.value)}
                      className="text-sm px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
                      <option value="contains">содержит</option>
                      <option value="eq">равно</option>
                      <option value="neq">не равно</option>
                      <option value="nempty">не пусто</option>
                      <option value="empty">пусто</option>
                    </select>
                    {filterOp !== 'empty' && filterOp !== 'nempty' && (
                      <input value={filterValue} onChange={e => setFilterValue(e.target.value)} placeholder="значение…"
                        className="text-sm px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white w-44" />
                    )}
                  </>
                )}
                <button type="button" onClick={loadPreview} disabled={busy}
                  className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer flex items-center gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Предпросмотр
                </button>
              </div>

              {preview && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-auto max-h-[40vh]">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-850 sticky top-0">
                      <tr>{selected.map(s => <th key={s.path} className="text-left px-3 py-2 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{s.title}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {preview.rows.map((r: any, i: number) => (
                        <tr key={i}>{r.cells.map((c: any, j: number) => <td key={j} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">{String(c)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 text-xs text-slate-400 bg-slate-50 dark:bg-slate-850 sticky bottom-0">
                    Показаны первые {preview.rows.length} из {countOf(preview.total, 'строка')} — вставятся все
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800">
          <button type="button" onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
            {step > 1 ? '← Назад' : 'Отмена'}
          </button>
          {step < 3 ? (
            <button type="button" onClick={() => { setStep(step + 1); if (step === 2 && selected.length === 0) return; }}
              disabled={step === 2 && selected.length === 0}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5">
              Далее <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={insert} disabled={busy || selected.length === 0}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Вставить таблицу
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
