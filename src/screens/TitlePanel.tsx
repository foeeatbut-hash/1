import React, { useEffect, useState } from 'react';
import { Stamp, X } from 'lucide-react';
import { renderTitleHtml } from './titleTemplate';

// ── Панель «Титул» (общая для Ворда и таблиц) ──
// Выбор шаблона титульного листа + реквизиты конкретного документа.
// Значения хранятся в ConstructorDoc.settings: { titleTemplateId, docMeta }.

export interface TitleSettings {
  titleTemplateId?: string;
  docMeta?: { code?: string; revision?: string; title?: string };
  pageSetup?: { header?: string; footer?: string; pageNumbers?: boolean };
  [k: string]: any;
}

const escHtml = (x: string) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Текст колонтитула → HTML-шаблон Chromium: {page}/{pages} становятся живыми
// счётчиками страниц, {date} и реквизиты — значениями этого документа
function hfLine(text: string, ctx: Record<string, string>): string {
  let out = escHtml(text);
  out = out.replace(/\{page\}/g, '<span class="pageNumber"></span>');
  out = out.replace(/\{pages\}/g, '<span class="totalPages"></span>');
  out = out.replace(/\{(\w[\w.]*)\}/g, (_m, k) => escHtml(ctx[k] ?? ''));
  return out;
}

// Колонтитулы для printToPDF (Electron). Возвращает undefined, если не заданы.
export async function buildPageTemplates(docId: string, settings: TitleSettings):
  Promise<{ headerTemplate?: string; footerTemplate?: string }> {
  const ps = settings.pageSetup || {};
  if (!ps.header && !ps.footer && !ps.pageNumbers) return {};
  let ctx: Record<string, string> = {};
  try {
    const r = await fetch(`/api/constructor/title/context?docId=${docId}`);
    if (r.ok) ctx = (await r.json()).context || {};
  } catch (_) {}
  const wrap = (inner: string) =>
    `<div style="width:100%;font-size:8pt;font-family:'Times New Roman',serif;color:#334155;padding:0 10mm;display:flex;align-items:center;justify-content:space-between">${inner}</div>`;
  const out: { headerTemplate?: string; footerTemplate?: string } = {};
  if (ps.header) out.headerTemplate = wrap(`<span></span><span>${hfLine(ps.header, ctx)}</span><span></span>`);
  if (ps.footer || ps.pageNumbers) {
    const left = ps.footer ? hfLine(ps.footer, ctx) : '';
    const right = ps.pageNumbers ? 'Стр. <span class="pageNumber"></span> из <span class="totalPages"></span>' : '';
    out.footerTemplate = wrap(`<span>${left}</span><span></span><span>${right}</span>`);
  }
  return out;
}

// Титульный лист документа: шаблон + контекст → готовый HTML для печати
export async function fetchTitlePageHtml(docId: string, templateId?: string): Promise<string> {
  if (!templateId) return '';
  try {
    const [tplRes, ctxRes] = await Promise.all([
      fetch(`/api/constructor/docs/${templateId}`),
      fetch(`/api/constructor/title/context?docId=${docId}`),
    ]);
    if (!tplRes.ok || !ctxRes.ok) return '';
    const tpl = (await tplRes.json()).doc;
    const ctx = (await ctxRes.json()).context;
    let html = '';
    try { html = JSON.parse(tpl.bindings || '{}')?.html || ''; } catch (_) {}
    if (!html) return '';
    return `<div style="page-break-after:always;padding:10mm 0">${renderTitleHtml(html, ctx)}</div>`;
  } catch (_) { return ''; }
}

// «Второй лист» документа — RECORD OF REVISIONS / Учёт ревизий.
// Собирается из истории ревизий строки ВДР (settings.vdrItemId); вставляется
// отдельной страницей после титула при печати/PDF. Пустая история → ''.
export async function fetchRevisionsSheetHtml(settings: TitleSettings): Promise<string> {
  const itemId = settings?.vdrItemId;
  if (!itemId) return '';
  try {
    const r = await fetch(`/api/vdr/items/${itemId}/revisions`);
    if (!r.ok) return '';
    const revisions: any[] = (await r.json()).revisions || [];
    if (!revisions.length) return '';
    const esc = (x: any) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmtD = (d: any) => { const x = d ? new Date(d) : null; return x && !isNaN(x.getTime()) ? x.toLocaleDateString('ru-RU') : ''; };
    const td = 'border:0.5pt solid #0f172a;padding:3px 8px;font-size:9pt;vertical-align:top';
    const rows = revisions.map(v =>
      `<tr><td style="${td};text-align:center;font-weight:bold">${esc(v.revision)}</td><td style="${td};text-align:center">${fmtD(v.date)}</td><td style="${td}">${esc(v.place)}</td><td style="${td}">${esc(v.description || v.reason)}</td></tr>`).join('');
    return `<div style="page-break-after:always;font-family:'Times New Roman',serif;color:#0f172a;padding:10mm 0">
      <p style="text-align:center;font-size:13pt;font-weight:bold;margin:0 0 4px">RECORD OF REVISIONS</p>
      <p style="text-align:center;font-size:12pt;font-weight:bold;margin:0 0 14px">УЧЁТ РЕВИЗИЙ</p>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <th style="${td};width:12%;background:#f1f5f9">Rev. /<br>Ревизия</th>
          <th style="${td};width:16%;background:#f1f5f9">Date /<br>Дата</th>
          <th style="${td};width:28%;background:#f1f5f9">Location of Change /<br>Место изменения</th>
          <th style="${td};background:#f1f5f9">Change description /<br>Описание изменения</th>
        </tr>${rows}
      </table></div>`;
  } catch (_) { return ''; }
}

export default function TitlePanel({ projectId, settings, onChange, onClose }: {
  projectId: string;
  settings: TitleSettings;
  onChange: (next: TitleSettings, persist: boolean) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch(`/api/constructor/title/templates?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {});
  }, [projectId]);

  return (
    <div className="absolute right-4 top-14 z-40 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <span className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5"><Stamp className="w-4 h-4 text-emerald-600" /> Титульный лист</span>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Шаблон титула</label>
          <select
            value={settings.titleTemplateId || ''}
            onChange={(e) => onChange({ ...settings, titleTemplateId: e.target.value || undefined }, true)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white cursor-pointer">
            <option value="">— без титула —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {templates.length === 0 && (
            <p className="text-[11px] text-slate-400 mt-1">Шаблоны титула создаются в Конструкторе кнопкой «Шаблон титула».</p>
          )}
        </div>
        <div className="pt-1 border-t border-slate-100 dark:border-slate-850 space-y-2">
          <p className="text-[11px] text-slate-400">Реквизиты этого документа — подставятся в титул:</p>
          {([['code', 'Номер / шифр'], ['revision', 'Ревизия'], ['title', 'Наименование']] as const).map(([k, label]) => (
            <div key={k}>
              <label className="block text-[11px] font-bold text-slate-500 uppercase">{label}</label>
              <input
                value={settings.docMeta?.[k] || ''}
                onChange={(e) => onChange({ ...settings, docMeta: { ...settings.docMeta, [k]: e.target.value } }, false)}
                onBlur={() => onChange(settings, true)}
                className="w-full mt-0.5 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500" />
            </div>
          ))}
        </div>
        <div className="pt-1 border-t border-slate-100 dark:border-slate-850 space-y-2">
          <p className="text-[11px] text-slate-400">Колонтитулы (PDF). Подстановки: {'{page} {pages} {date} {doc.code} {doc.revision} {project.code}'}</p>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase">Верхний колонтитул</label>
            <input
              value={settings.pageSetup?.header || ''}
              onChange={(e) => onChange({ ...settings, pageSetup: { ...settings.pageSetup, header: e.target.value } }, false)}
              onBlur={() => onChange(settings, true)}
              placeholder="напр. {doc.code} · Рев. {doc.revision}"
              className="w-full mt-0.5 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase">Нижний колонтитул</label>
            <input
              value={settings.pageSetup?.footer || ''}
              onChange={(e) => onChange({ ...settings, pageSetup: { ...settings.pageSetup, footer: e.target.value } }, false)}
              onBlur={() => onChange(settings, true)}
              placeholder="напр. {project.code} · {date}"
              className="w-full mt-0.5 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.pageSetup?.pageNumbers}
              onChange={(e) => onChange({ ...settings, pageSetup: { ...settings.pageSetup, pageNumbers: e.target.checked } }, true)}
              className="w-4 h-4 accent-emerald-500" />
            Нумерация страниц (Стр. N из M)
          </label>
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">Титул добавится первой страницей при печати и экспорте в PDF.</p>
      </div>
    </div>
  );
}
