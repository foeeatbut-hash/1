/**
 * Справочник формул документа: список слева, карточка настройки справа.
 *
 * Одна реализация на два места — Настройки и панель вставки в титуле. Второй
 * копии нет намеренно: разошедшиеся карточки настройки означали бы, что
 * формула, собранная в одном месте, ведёт себя иначе в другом.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Copy, GripVertical, X, AlertTriangle } from 'lucide-react';
import {
  renderFormula, resultSegments, DEFAULT_DATE,
  type Formula, type FormulaKind, type FormulaContext, type ComposePart,
  type DateFormat, type NameFormat, type PersonSource,
} from '../lib/docFormula';
import { TITLE_FIELDS } from '../screens/titleTemplate';
import { useToastStore } from '../store/toastStore';
import { useModalStore } from '../store/modalStore';

const KIND_LABEL: Record<FormulaKind, string> = {
  value: 'значение',
  text: 'текст',
  compose: 'сборка',
  expr: 'выражение',
  signature: 'подпись',
};

/** Образец для предпросмотра, когда открытого документа нет */
const SAMPLE: FormulaContext = {
  'doc.name': 'Пояснительная записка',
  'doc.code': 'ПЗ-001',
  'doc.revision': 'B',
  'doc.title': 'Система вентиляции',
  'project.code': 'PRJ-2026',
  'project.name': 'АБК завода',
  'project.customer': 'ООО «Заказчик»',
  'project.contractor': 'ООО «Подрядчик»',
  date: new Date().toISOString(),
  dateTime: new Date().toISOString(),
  year: String(new Date().getFullYear()),
  page: 1,
  pages: 3,
  'person.author.lastName': 'Раупов',
  'person.author.firstName': 'Хусрав',
  'person.author.middleName': 'Хуршедович',
};

interface Props {
  projectId: string;
  /** Настоящий контекст открытого документа; без него показываем образец */
  context?: FormulaContext | null;
  /** Вставить формулу в документ — кнопка появляется только если передан */
  onInsert?: (f: Formula) => void;
  onClose?: () => void;
}

const inp = 'w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

/** Переключатель из нескольких кнопок — одна строка вместо выпадающего списка */
function Seg<T extends string | number>({ value, options, onChange }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
      {options.map((o, i) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${i > 0 ? 'border-l border-slate-200 dark:border-slate-800' : ''} ${
            o.v === value
              ? 'bg-emerald-600 text-white font-medium'
              : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function FormulaManager({ projectId, context, onInsert, onClose }: Props) {
  const [list, setList] = useState<Formula[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Formula | null>(null);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToastStore();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/formulas`);
      const j = await res.json();
      setList(j.formulas || []);
    } catch (e: any) {
      addToast('Не удалось загрузить формулы: ' + (e?.message || e), 'error');
    }
  }, [projectId, addToast]);

  useEffect(() => { load(); }, [load]);

  const catalog = useMemo(() => Object.fromEntries(list.map((x) => [x.id, x])), [list]);
  const ctx = context || SAMPLE;

  // Предпросмотр считаем по черновику, а не по сохранённому: человек должен
  // видеть, что получится, до того как нажмёт «Сохранить»
  const preview = useMemo(() => {
    if (!draft) return null;
    const cat = { ...catalog, [draft.id]: draft };
    return renderFormula(draft, ctx, cat as any);
  }, [draft, catalog, ctx]);

  // Части значения одним списком: сборка с подписью внутри показывается так же,
  // как встанет в документ
  const segs = useMemo(() => resultSegments(preview), [preview]);

  const select = (f: Formula) => { setSelId(f.id); setDraft(JSON.parse(JSON.stringify(f))); };

  const create = async (kind: FormulaKind = 'value') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/formulas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Новая формула', kind, config: kind === 'compose' ? { parts: [] } : { field: 'date' } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'не удалось создать');
      await load();
      select(j.formula);
    } catch (e: any) {
      addToast('Не удалось создать формулу: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { addToast('Укажите название формулы', 'error'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/formulas/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), kind: draft.kind, config: draft.config }),
      });
      const j = await res.json();
      // Кольцо ловится на сервере и приходит сюда цепочкой «A → B → A»
      if (!res.ok) throw new Error(j?.error || 'не удалось сохранить');
      await load();
      addToast('Формула сохранена', 'success');
    } catch (e: any) {
      addToast(String(e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const remove = async (f: Formula) => {
    // Сколько документов пострадает — показываем ДО удаления, а не после
    let where = '';
    try {
      const u = await (await fetch(`/api/formulas/${f.id}/usage`)).json();
      const t = (u.templates || []).length;
      const fo = (u.formulas || []).length;
      if (t || fo) {
        where = `\n\nОна стоит в шаблонах: ${t}. Используется в других формулах: ${fo}.` +
          '\nВ документах на её месте останется зачёркнутая метка.';
      }
    } catch (_) {}
    const yes = await useModalStore.getState().openConfirm(
      'Удалить формулу?',
      `«${f.name}» будет удалена без возможности вернуть.${where}`,
    );
    if (!yes) return;
    await fetch(`/api/formulas/${f.id}`, { method: 'DELETE' });
    if (selId === f.id) { setSelId(null); setDraft(null); }
    await load();
  };

  const duplicate = async (f: Formula) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/formulas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${f.name} (копия)`, kind: f.kind, config: f.config }),
      });
      const j = await res.json();
      await load();
      if (j?.formula) select(j.formula);
    } finally { setBusy(false); }
  };

  const patchConfig = (patch: any) =>
    setDraft((d) => (d ? { ...d, config: { ...(d.config as any), ...patch } } : d));

  const dateFmt: DateFormat = { ...DEFAULT_DATE, ...(((draft?.config as any)?.date) || {}) };
  const parts: ComposePart[] = ((draft?.config as any)?.parts || []) as ComposePart[];

  const setParts = (next: ComposePart[]) => patchConfig({ parts: next });
  const movePart = (i: number, dir: -1 | 1) => {
    const next = [...parts];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setParts(next);
  };

  return (
    <div className="flex h-full min-h-0 text-slate-800 dark:text-slate-100">
      {/* Список */}
      <div className="zone w-64 shrink-0 flex flex-col min-h-0">
        <div className="stamp">
          <span className="stamp-title">Формулы</span>
          <div className="stamp-right">
            <button type="button" onClick={() => create()} disabled={busy} title="Новая формула"
              className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50">
              <Plus className="w-3.5 h-3.5 inline -mt-0.5" /> Новая
            </button>
            {onClose && (
              <button type="button" onClick={onClose} title="Закрыть справочник"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && (
            <div className="blank">
              <div className="blank-title">Формул пока нет</div>
              <div className="blank-text">
                Формула — это именованное значение для документа: дата в нужном виде,
                инициалы, подпись, шифр с ревизией. Заведите первую кнопкой «Новая».
              </div>
            </div>
          )}
          {list.map((f) => (
            <div key={f.id}
              onClick={() => select(f)}
              className={`flex items-center gap-2 px-3 py-2 rule-b cursor-pointer ${
                f.id === selId ? 'bg-emerald-50 dark:bg-emerald-950/40 shadow-[inset_2px_0_0_var(--flux-accent)]' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              <span className="text-xs font-medium truncate">{f.name}</span>
              <span className="ml-auto text-2xs text-slate-400 shrink-0">{KIND_LABEL[f.kind]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Карточка */}
      <div className="zone flex-1 min-w-0 flex flex-col min-h-0">
        {!draft ? (
          <div className="blank">
            <div className="blank-title">Формула не выбрана</div>
            <div className="blank-text">Выберите формулу слева или заведите новую.</div>
          </div>
        ) : (
          <>
            <div className="stamp">
              <span className="stamp-title truncate">{draft.name || 'Без названия'}</span>
              <span className="graf">{KIND_LABEL[draft.kind]}</span>
              <div className="stamp-right">
                {onInsert && (
                  <button type="button" onClick={() => onInsert(draft)}
                    className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900">
                    Вставить в документ
                  </button>
                )}
                <button type="button" onClick={() => duplicate(draft)} title="Сделать копию"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => remove(draft)} title="Удалить формулу"
                  className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={save} disabled={busy}
                  className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50">
                  Сохранить
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="graf block mb-1.5">Название — его видно в документе</label>
                <input type="text" className={inp} value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>

              <div>
                <label className="graf block mb-1.5">Что это</label>
                <Seg<FormulaKind>
                  value={draft.kind}
                  onChange={(k) => setDraft({
                    ...draft, kind: k,
                    config: k === 'compose' ? { parts: [] } : k === 'text' ? { text: '' }
                      : k === 'expr' ? { expr: '' } : k === 'signature' ? { person: 'author' } : { field: 'date' },
                  })}
                  options={[
                    { v: 'value', label: 'Значение' }, { v: 'text', label: 'Текст' },
                    { v: 'compose', label: 'Сборка' }, { v: 'signature', label: 'Подпись' },
                    { v: 'expr', label: 'Выражение' },
                  ]}
                />
              </div>

              {draft.kind === 'text' && (
                <div>
                  <label className="graf block mb-1.5">Надпись</label>
                  <input type="text" className={inp} value={(draft.config as any)?.text || ''}
                    onChange={(e) => patchConfig({ text: e.target.value })} />
                </div>
              )}

              {draft.kind === 'expr' && (
                <div>
                  <label className="graf block mb-1.5">Выражение</label>
                  <input type="text" className={`${inp} font-mono`} value={(draft.config as any)?.expr || ''}
                    onChange={(e) => patchConfig({ expr: e.target.value })}
                    placeholder='pages - page & " осталось"' />
                  <p className="text-2xs text-slate-400 mt-1">
                    Действия: + − × ÷ и &amp; для склейки. Поля пишутся как в списке: doc.code, pages.
                  </p>
                </div>
              )}

              {draft.kind === 'value' && (
                <>
                  <div>
                    <label className="graf block mb-1.5">Откуда значение</label>
                    <select className={inp} value={(draft.config as any)?.field || 'date'}
                      onChange={(e) => patchConfig({ field: e.target.value })}>
                      <option value="person">Сотрудник (ФИО)</option>
                      {TITLE_FIELDS.map((x) => (
                        <option key={x.key} value={x.key}>{x.group} · {x.title}</option>
                      ))}
                    </select>
                  </div>

                  {(draft.config as any)?.field === 'person' ? (
                    <>
                      <div>
                        <label className="graf block mb-1.5">Чей</label>
                        <Seg<PersonSource> value={(draft.config as any)?.person || 'author'}
                          onChange={(v) => patchConfig({ person: v })}
                          options={[
                            { v: 'author', label: 'Автор документа' },
                            { v: 'current', label: 'Кто открыл' },
                            { v: 'user', label: 'Выбранный' },
                          ]} />
                      </div>
                      <div>
                        <label className="graf block mb-1.5">Как показать</label>
                        <Seg<NameFormat> value={(draft.config as any)?.name || 'full'}
                          onChange={(v) => patchConfig({ name: v })}
                          options={[
                            { v: 'full', label: 'Раупов Хусрав Хуршедович' },
                            { v: 'initialsAfter', label: 'Раупов Х.Х.' },
                            { v: 'initialsBefore', label: 'Х.Х. Раупов' },
                            { v: 'last', label: 'Раупов' },
                          ]} />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="graf block mb-1.5">Порядок</label>
                        <Seg<DateFormat['order']> value={dateFmt.order}
                          onChange={(v) => patchConfig({ date: { ...dateFmt, order: v } })}
                          options={[{ v: 'dmy', label: 'Д · М · Г' }, { v: 'mdy', label: 'М · Д · Г' }, { v: 'ymd', label: 'Г · М · Д' }]} />
                      </div>
                      <div>
                        <label className="graf block mb-1.5">Месяц</label>
                        <Seg<DateFormat['month']> value={dateFmt.month}
                          onChange={(v) => patchConfig({ date: { ...dateFmt, month: v } })}
                          options={[{ v: 'num', label: '08' }, { v: 'gen', label: 'августа' }, { v: 'nom', label: 'Август' }, { v: 'roman', label: 'VIII' }]} />
                      </div>
                      <div>
                        <label className="graf block mb-1.5">Год</label>
                        <Seg<DateFormat['year']> value={dateFmt.year}
                          onChange={(v) => patchConfig({ date: { ...dateFmt, year: v } })}
                          options={[{ v: 'full', label: '2026' }, { v: 'short', label: '26' }, { v: 'suffix', label: '2026 г.' }]} />
                      </div>
                      <div>
                        <label className="graf block mb-1.5">Разделитель</label>
                        <Seg<string> value={dateFmt.sep}
                          onChange={(v) => patchConfig({ date: { ...dateFmt, sep: v } })}
                          options={[{ v: '.', label: '.' }, { v: '/', label: '/' }, { v: '-', label: '−' }, { v: ' ', label: 'пробел' }]} />
                        <p className="text-2xs text-slate-400 mt-1">
                          Действует, когда месяц числом: «16.августа.2026» никто не пишет.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {draft.kind === 'signature' && (
                <>
                  <div>
                    <label className="graf block mb-1.5">Чья подпись</label>
                    <Seg<PersonSource> value={(draft.config as any)?.person || 'author'}
                      onChange={(v) => patchConfig({ person: v })}
                      options={[
                        { v: 'author', label: 'Автор документа' },
                        { v: 'current', label: 'Кто открыл' },
                        { v: 'user', label: 'Выбранный' },
                      ]} />
                  </div>
                  <p className="text-2xs text-slate-400">
                    Картинка и её высота берутся из профиля сотрудника. Подписи нет —
                    в документе останется пустое место: ФИО вместо подписи не подставляется.
                  </p>
                </>
              )}

              {draft.kind === 'compose' && (
                <div>
                  <label className="graf block mb-1.5">Из чего собрано</label>
                  <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {parts.length === 0 && (
                      <div className="px-3 py-3 text-xs text-slate-400">Пока пусто — добавьте первую часть.</div>
                    )}
                    {parts.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rule-b">
                        <span className="flex flex-col">
                          <button type="button" onClick={() => movePart(i, -1)} disabled={i === 0}
                            title="Выше" className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer leading-none">▲</button>
                          <button type="button" onClick={() => movePart(i, 1)} disabled={i === parts.length - 1}
                            title="Ниже" className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer leading-none">▼</button>
                        </span>
                        <input type="text" value={p.sep || ''} placeholder="разделитель"
                          title="Ставится перед частью и только если слева уже что-то есть"
                          onChange={(e) => { const n = [...parts]; n[i] = { ...p, sep: e.target.value }; setParts(n); }}
                          className={`${inp} w-24 font-mono`} />
                        <select value={p.kind}
                          onChange={(e) => { const n = [...parts]; n[i] = { ...p, kind: e.target.value as any, value: '' }; setParts(n); }}
                          className={`${inp} w-24`}>
                          <option value="field">поле</option>
                          <option value="text">текст</option>
                          <option value="formula">формула</option>
                        </select>
                        {p.kind === 'text' ? (
                          <input type="text" value={p.value}
                            onChange={(e) => { const n = [...parts]; n[i] = { ...p, value: e.target.value }; setParts(n); }}
                            className={`${inp} flex-1`} />
                        ) : (
                          <select value={p.value}
                            onChange={(e) => { const n = [...parts]; n[i] = { ...p, value: e.target.value }; setParts(n); }}
                            className={`${inp} flex-1`}>
                            <option value="">— выберите —</option>
                            {p.kind === 'field'
                              ? TITLE_FIELDS.map((x) => <option key={x.key} value={x.key}>{x.group} · {x.title}</option>)
                              : list.filter((x) => x.id !== draft.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        )}
                        <button type="button" title="Убрать часть"
                          onClick={() => setParts(parts.filter((_, k) => k !== i))}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => setParts([...parts, { kind: 'field', value: '', sep: '' }])}
                      className="w-full text-left px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer">
                      ＋ добавить часть
                    </button>
                  </div>
                  <p className="text-2xs text-slate-400 mt-1.5">
                    Разделитель стоит перед частью и печатается, только если слева уже что-то
                    есть. Нет ревизии — выпадает и она, и её « рев. ».
                  </p>
                </div>
              )}

              {/* Предпросмотр — по черновику, до сохранения */}
              <div>
                <label className="graf block mb-1.5">
                  Предпросмотр {context ? 'на этом документе' : '— на примере'}
                </label>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  {preview?.kind === 'missing' ? (
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> формула не найдена
                    </span>
                  ) : segs.length ? (
                    // Сборка с подписью внутри показывается так же, как встанет
                    // в документ: текст и картинка в одну строку
                    segs.map((s, i) => s.kind === 'image' ? (
                      <img key={i} src={s.src} alt="подпись" style={{ height: `${s.heightMm * 3.78}px` }} />
                    ) : (
                      <span key={i} className="text-sm font-medium whitespace-pre">{s.text}</span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">пусто при нынешних данных</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
