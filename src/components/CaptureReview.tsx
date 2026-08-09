import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, ArrowLeft, Check, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { recognize, CaptureItem, Recognized, CaptureRow } from '../capture/recognize';
import {
  buildPlan, summarize, PlanRow, Action, ACTION_LABEL, CLASS_LABEL, CLASS_TONE, ExistingTag,
} from '../capture/plan';

/**
 * Окно разбора захвата: слева исходник, справа то, во что программа его
 * разложила. Области связаны подсветкой в обе стороны — без этого разбивку
 * нельзя проверить, а значит и поверить ей.
 *
 * Второй шаг — план: ни одной записи в базу до нажатия «Применить».
 */

const TONE_BADGE: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  bad: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  mute: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

/** Исходник разбитый на куски: подсвеченные фрагменты и текст между ними */
function useSegments(rec: Recognized | null) {
  return useMemo(() => {
    if (!rec) return [];
    type Seg = { text: string; key?: string; junk?: boolean };
    const marks: { start: number; end: number; key?: string; junk?: boolean }[] = [];
    for (const r of rec.rows) for (const s of r.spans) marks.push({ ...s, key: r.key });
    for (const j of rec.junk) marks.push({ start: j.start, end: j.end, junk: true });
    marks.sort((a, b) => a.start - b.start);

    const out: Seg[] = [];
    let pos = 0;
    for (const m of marks) {
      if (m.start < pos) continue;
      if (m.start > pos) out.push({ text: rec.raw.slice(pos, m.start) });
      out.push({ text: rec.raw.slice(m.start, m.end), key: m.key, junk: m.junk });
      pos = m.end;
    }
    if (pos < rec.raw.length) out.push({ text: rec.raw.slice(pos) });
    return out;
  }, [rec]);
}

export default function CaptureReview() {
  const navigate = useNavigate();
  const activeProject = useStore((s) => s.activeProject);
  const { addToast } = useToastStore();

  const [items, setItems] = useState<CaptureItem[] | null>(null);
  const [step, setStep] = useState<'parse' | 'plan'>('parse');
  const [rec, setRec] = useState<Recognized | null>(null);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [lit, setLit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const existingRef = useRef<ExistingTag[]>([]);

  const segments = useSegments(rec);

  // Захват приходит из главного процесса
  useEffect(() => {
    const api = (window as any).electron?.capture;
    if (!api) return;
    return api.onPayload((data: { items: CaptureItem[] }) => {
      if (!data?.items?.length) return;
      setItems(data.items);
      setStep('parse');
      setPlan([]);
      setLit(null);
    });
  }, []);

  // Разбираем: образец кода снимается с тегов проекта, поэтому их надо прочитать
  useEffect(() => {
    if (!items) return;
    let cancelled = false;
    setLoading(true);
    const pid = activeProject?.id;
    const load = pid ? dataService.getTags(pid) : Promise.resolve([]);
    load
      .then((res: any) => {
        if (cancelled) return;
        const tags: ExistingTag[] = Array.isArray(res) ? res : (res?.tags || []);
        existingRef.current = tags;
        setRec(recognize(items, tags.map((t) => t.identifier || '')));
      })
      .catch(() => {
        if (cancelled) return;
        existingRef.current = [];
        setRec(recognize(items, []));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [items, activeProject?.id]);

  const close = () => { setItems(null); setRec(null); setPlan([]); setStep('parse'); };

  const goPlan = () => {
    if (!rec) return;
    setPlan(buildPlan(rec.rows.filter((r) => r.verdict !== 'junk'), existingRef.current, rec.shape));
    setStep('plan');
  };

  const setRowAction = (key: string, action: Action) =>
    setPlan((p) => p.map((r) => (r.key === key ? { ...r, action } : r)));
  const toggleRow = (key: string) =>
    setPlan((p) => p.map((r) => (r.key === key ? { ...r, on: !r.on } : r)));
  /** Одно решение на весь класс: иначе при двадцати похожих строках это пытка */
  const applyToClass = (cls: string, action: Action) =>
    setPlan((p) => p.map((r) => (r.cls === cls && r.options.includes(action) ? { ...r, action } : r)));

  const dropRow = (key: string) => {
    setPlan((p) => p.filter((r) => r.key !== key));
    setRec((r) => (r ? { ...r, rows: r.rows.filter((x) => x.key !== key) } : r));
  };

  const summary = useMemo(() => summarize(plan), [plan]);

  const apply = async () => {
    if (!activeProject?.id) { addToast('Сначала выберите проект', 'error'); return; }
    setBusy(true);
    try {
      const rows = plan.filter((r) => r.on).map((r) => ({
        identifier: r.identifier,
        brand: r.row.brand,
        name: r.row.name,
        department: r.row.department,
        fluid: r.row.fluid,
        wbs: r.row.wbs,
        actuality: r.row.actuality,
        action: r.action,
        targetId: r.existing?.id,
      }));
      const res = await dataService.applyCapturedTags(activeProject.id, rows);
      const total = res.created.length + res.filled.length + res.duplicated.length;
      addToast(
        total
          ? `Добавлено ${res.created.length}, дополнено ${res.filled.length}`
          : 'Ничего не изменилось',
        total ? 'success' : 'info',
      );
      // Реестр подсветит добавленное: волной, а потом плашкой «последний захват»
      window.dispatchEvent(new CustomEvent('flux:capture-applied', {
        detail: {
          created: res.created.map((t) => t.id),
          filled: res.filled.map((t) => t.id),
          duplicated: res.duplicated.map((t) => t.id),
          at: Date.now(),
        },
      }));
      close();
      navigate('/registry');
    } catch (e: any) {
      addToast(`Не удалось применить: ${e?.message || 'ошибка сервера'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!items) return null;

  const junkCount = rec?.junk.length || 0;
  const fitCount = rec?.rows.filter((r) => r.verdict === 'fits').length || 0;
  const confidence = rec && rec.rows.length ? Math.round((fitCount / rec.rows.length) * 100) : 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="capture"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ scale: 0.97, y: 8 }} animate={{ scale: 1, y: 0 }}
          className="w-full max-w-5xl max-h-full flex flex-col rounded-2xl overflow-hidden
                     bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800
                          bg-slate-50 dark:bg-slate-800/60">
            <span className="w-3.5 h-3.5 rounded bg-emerald-600" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {step === 'parse' ? 'Разбор захвата' : 'План захвата: теги'}
            </span>
            <span className="flex-1" />
            <button onClick={close} className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Разбираю захват…
            </div>
          )}

          {!loading && step === 'parse' && rec && (
            <>
              <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2">
                {/* Исходник */}
                <div className="min-w-0 flex flex-col border-r border-slate-200 dark:border-slate-800">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800
                                  bg-slate-50 dark:bg-slate-800/40 flex items-center gap-2">
                    <span className="text-xs font-bold">Захват</span>
                    <span className="ml-auto text-2xs font-semibold px-2 py-0.5 rounded-full
                                     bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                      {items.length > 1 ? `${items.length} захвата` : rec.mode === 'table' ? 'таблица' : 'текст'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap
                                  text-slate-600 dark:text-slate-300">
                    {segments.map((s, i) =>
                      s.key || s.junk ? (
                        <span
                          key={i}
                          onMouseEnter={() => s.key && setLit(s.key)}
                          onClick={() => s.key && setLit(s.key)}
                          className={`rounded px-0.5 cursor-pointer ${
                            s.junk
                              ? 'line-through text-slate-400'
                              : lit === s.key
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {s.text}
                        </span>
                      ) : (
                        <span key={i}>{s.text}</span>
                      ),
                    )}
                  </div>
                </div>

                {/* Разбор */}
                <div className="min-w-0 flex flex-col">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800
                                  bg-slate-50 dark:bg-slate-800/40 flex items-center gap-2">
                    <span className="text-xs font-bold">Разобрано: теги</span>
                    <span className="ml-auto text-2xs font-semibold px-2 py-0.5 rounded-full
                                     bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {rec.rows.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
                    {rec.rows.map((r) => (
                      <div
                        key={r.key}
                        onMouseEnter={() => setLit(r.key)}
                        onClick={() => setLit(r.key)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border ${
                          lit === r.key
                            ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-950/40'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="font-mono text-xs font-bold flex-1 truncate">{r.identifier}</span>
                        {r.spans.length > 1 && (
                          <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full
                                           bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            в захвате {r.spans.length}×
                          </span>
                        )}
                        {r.verdict === 'doubt' && (
                          <span className="text-2xs text-slate-400">сомнительный</span>
                        )}
                      </div>
                    ))}
                    {!rec.rows.length && (
                      <div className="text-center text-xs text-slate-400 py-10 px-4">
                        Кодов не нашлось. Похоже, это не список тегов — попробуйте выделить иначе.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 border-t border-slate-200 dark:border-slate-800
                              bg-slate-50 dark:bg-slate-800/60">
                <span className="text-2xs text-slate-500">Это:</span>
                <span className="text-2xs font-bold px-2.5 py-1 rounded-md bg-emerald-600 text-white">Теги</span>
                <span className="text-2xs font-semibold px-2.5 py-1 rounded-md border border-slate-200
                                 dark:border-slate-700 text-slate-400" title="Следующим этапом">
                  Данные оборудования
                </span>
                {rec.rows.length > 0 && (
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded-full
                                   bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    по образцу проекта {confidence}%
                  </span>
                )}
                <span className="flex-1" />
                {junkCount > 0 && (
                  <span className="text-2xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                    Отброшено {junkCount}
                  </span>
                )}
                {rec.collapsed > 0 && (
                  <span className="text-2xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700
                                   dark:bg-amber-950/60 dark:text-amber-300">
                    Свёрнуто дублей {rec.collapsed}
                  </span>
                )}
                <button
                  onClick={goPlan}
                  disabled={!rec.rows.length}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700
                             disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                >
                  Далее <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {!loading && step === 'plan' && (
            <>
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-50 dark:bg-slate-800/80">
                      {['', 'Код', 'Класс', 'Что делаем', 'Почему', ''].map((h, i) => (
                        <th key={i} className="text-left text-2xs uppercase tracking-wide font-bold text-slate-400
                                               px-3 py-2 border-b border-slate-200 dark:border-slate-700">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((r) => (
                      <tr key={r.key} className="border-b border-slate-100 dark:border-slate-800/70">
                        <td className="px-3 py-1.5">
                          <button
                            onClick={() => toggleRow(r.key)}
                            className={`w-4 h-4 rounded grid place-items-center border cursor-pointer ${
                              r.on ? 'bg-emerald-600 border-emerald-600 text-white'
                                   : 'border-slate-300 dark:border-slate-600'}`}
                          >
                            {r.on && <Check className="w-2.5 h-2.5" />}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs font-bold whitespace-nowrap">{r.identifier}</td>
                        <td className="px-3 py-1.5">
                          <span
                            onClick={() => applyToClass(r.cls, r.action)}
                            title="Применить это решение ко всем строкам класса"
                            className={`text-2xs font-semibold px-2 py-0.5 rounded-full cursor-pointer whitespace-nowrap
                                        ${TONE_BADGE[CLASS_TONE[r.cls]]}`}
                          >
                            {CLASS_LABEL[r.cls]}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={r.action}
                            onChange={(e) => setRowAction(r.key, e.target.value as Action)}
                            className="text-2xs font-semibold px-2 py-1 rounded-md border border-slate-200
                                       dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer"
                          >
                            {r.options.map((o) => <option key={o} value={o}>{ACTION_LABEL[o]}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-2xs text-slate-500 dark:text-slate-400">{r.why}</td>
                        <td className="px-3 py-1.5">
                          <button onClick={() => dropRow(r.key)} title="Убрать из захвата"
                                  className="p-1 text-slate-300 hover:text-rose-500 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 border-t border-slate-200 dark:border-slate-800
                              bg-slate-50 dark:bg-slate-800/60">
                <button onClick={() => setStep('parse')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200
                                   dark:border-slate-700 text-xs font-bold cursor-pointer">
                  <ArrowLeft className="w-3.5 h-3.5" /> Назад
                </button>
                <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-emerald-700 dark:text-emerald-400">
                  <AlertTriangle className="w-3 h-3" /> Удалений в плане: 0
                </span>
                <span className="flex-1" />
                {([['create', 'создать', 'ok'], ['fill', 'дополнить', 'warn'], ['link', 'привязать', 'warn'],
                   ['duplicate', 'дубль', 'bad'], ['skip', 'пропустить', 'mute']] as const)
                  .filter(([k]) => (summary as any)[k] > 0)
                  .map(([k, label, tone]) => (
                    <span key={k} className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${TONE_BADGE[tone]}`}>
                      {label} {(summary as any)[k]}
                    </span>
                  ))}
                <button
                  onClick={apply}
                  disabled={busy || !plan.some((r) => r.on)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700
                             disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Применить
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
