/**
 * Чертёж ПДФ: просмотр и пометки.
 *
 * Раньше присланный чертёж можно было только посмотреть в Проводнике, а
 * замечания писали в письме или на бумаге — и через полгода никто не мог
 * сказать, к чему относилось «поправить узел в осях 3-4».
 *
 * Здесь замечания живут в проекте: пометка знает автора, время и ревизию, на
 * которой поставлена. Сам файл не меняется никогда — это главное свойство
 * присланного документа, и терять его нельзя.
 *
 * Страницу рисует pdf.js в канву, пометки лежат слоем поверх (components/pdf).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Loader2 } from 'lucide-react';
import EditorFrame from '../components/ribbon/EditorFrame';
import MarkupLayer, { type Markup } from '../components/pdf/MarkupLayer';
import MarkupList from '../components/pdf/MarkupList';
import { pdfRibbon, MARKUP_COLORS } from '../lib/ribbonPdf';
import { openPdf } from '../import/pdfShared';
import { useToastStore } from '../store/toastStore';
import { useModalStore } from '../store/modalStore';

const { openPrompt, openConfirm } = useModalStore.getState();

/** Инструмент пометки: какой кнопкой ленты он включается */
const TOOLS: Record<string, Markup['kind']> = {
  'pdf.cloud': 'CLOUD', 'pdf.rect': 'RECT', 'pdf.arrow': 'ARROW', 'pdf.note': 'NOTE',
};

/** base64 из data:URL, которым Проводник хранит содержимое файла */
function dataUrlToBytes(content: string): ArrayBuffer | null {
  try {
    const b64 = content.includes(',') ? content.split(',')[1] : content;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch (_) { return null; }
}

export default function PdfEditor() {
  const [params, setParams] = useSearchParams();
  const fileId = params.get('file') || '';
  const { addToast } = useToastStore();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);

  const [file, setFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [rotate, setRotate] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [invert, setInvert] = useState(false);
  const [thumbs, setThumbs] = useState(false);

  const [markups, setMarkups] = useState<Markup[]>([]);
  const [scope, setScope] = useState<'current' | 'all'>('all');
  const [tool, setTool] = useState<Markup['kind'] | null>(null);
  const [color, setColor] = useState(MARKUP_COLORS[0]);
  const [stroke, setStroke] = useState(2);
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const [tab, setTab] = useState('Главная');
  const [folded, setFolded] = useState(false);

  const tabs = React.useMemo(() => pdfRibbon(), []);
  const revision = String(file?.revision || '1');

  // ── Загрузка файла и его пометок ──
  useEffect(() => {
    if (!fileId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/files/${fileId}`);
        if (!r.ok) throw new Error('файл не найден');
        const f = (await r.json()).file || (await r.json());
        if (!alive) return;
        setFile(f);
        const bytes = f?.content ? dataUrlToBytes(f.content) : null;
        if (!bytes) { addToast('У файла нет содержимого', 'error'); setLoading(false); return; }
        const pdf = await openPdf(bytes);
        if (!alive) return;
        pdfRef.current = pdf;
        setPages(pdf.numPages || 1);
        setLoading(false);
      } catch (e) {
        if (alive) { addToast('Не удалось открыть чертёж', 'error'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [fileId]);

  const loadMarkups = async () => {
    if (!fileId) return;
    try {
      const r = await fetch(`/api/files/${fileId}/markups`);
      if (r.ok) setMarkups((await r.json()).markups || []);
    } catch (_) { /* сеть отвалилась — список останется прежним */ }
  };
  useEffect(() => { loadMarkups(); }, [fileId]);

  // ── Отрисовка страницы ──
  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await pdf.getPage(Math.min(Math.max(1, page), pdf.numPages));
        if (cancelled) return;
        const viewport = p.getViewport({ scale: zoom / 100, rotation: rotate });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        setSize({ w: canvas.width, h: canvas.height });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await p.render({ canvasContext: ctx, viewport }).promise;
      } catch (e: any) {
        // Отмену рендера новым масштабом молчим — она штатная; остальное видно
        if (e?.name !== 'RenderingCancelledException') console.error('[ПДФ] Страница не отрисована:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [page, zoom, rotate, loading]);

  /** Вписать лист: по ширине окна или целиком */
  const fit = (mode: 'width' | 'page') => {
    const pdf = pdfRef.current;
    const box = wrapRef.current;
    if (!pdf || !box) return;
    pdf.getPage(page).then((p: any) => {
      const v = p.getViewport({ scale: 1, rotation: rotate });
      const kw = (box.clientWidth - 48) / v.width;
      const kh = (box.clientHeight - 48) / v.height;
      setZoom(Math.round(100 * (mode === 'width' ? kw : Math.min(kw, kh))));
    }).catch(() => {});
  };

  // ── Пометки: постановка мышью ──
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const rel = (e: React.MouseEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onDown = (e: React.MouseEvent) => {
    if (!tool) return;
    startRef.current = rel(e);
    setDraft({ ...startRef.current, w: 0, h: 0, kind: tool, color });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!tool || !startRef.current) return;
    const p = rel(e);
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, p.x), y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y),
      kind: tool, color,
    });
  };
  const onUp = async (e: React.MouseEvent) => {
    if (!tool || !startRef.current) return;
    const s = startRef.current;
    const p = rel(e);
    startRef.current = null;
    setDraft(null);
    const box = {
      x: Math.min(s.x, p.x), y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y),
    };
    // Записка и стрелка ставятся одним щелчком, обводка — рамкой. Случайный
    // щелчок обводкой не превращаем в пометку размером в точку
    if ((tool === 'CLOUD' || tool === 'RECT') && (box.w < 0.01 || box.h < 0.01)) return;
    const text = await openPrompt('Замечание', 'Коротко: что не так и что сделать',
      'например: уточнить отметку низа воздуховода');
    if (text === null) return;
    await addMarkup(tool, box, text || '');
  };

  const addMarkup = async (kind: Markup['kind'], box: any, text: string) => {
    try {
      const r = await fetch(`/api/files/${fileId}/markups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...box, kind, page, color, strokeWidth: stroke, text }),
      });
      if (!r.ok) { addToast('Не удалось поставить пометку', 'error'); return; }
      const { markup } = await r.json();
      setMarkups((list) => [...list, markup]);
      setSelected(markup.id);
    } catch (_) { addToast('Не удалось поставить пометку', 'error'); }
  };

  const patchMarkup = async (id: string, data: any) => {
    try {
      const r = await fetch(`/api/pdf-markups/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (!r.ok) return;
      const { markup } = await r.json();
      setMarkups((list) => list.map((m) => (m.id === id ? markup : m)));
    } catch (_) { /* молча: список перечитается при следующем открытии */ }
  };

  const removeMarkup = async (id: string) => {
    if (!await openConfirm('Снять пометку?', 'Замечание уйдёт из списка. Историю переписки это не меняет.', { confirmLabel: 'Снять' })) return;
    try {
      await fetch(`/api/pdf-markups/${id}`, { method: 'DELETE' });
      setMarkups((list) => list.filter((m) => m.id !== id));
      if (selected === id) setSelected(null);
    } catch (_) { addToast('Не удалось снять пометку', 'error'); }
  };

  /** Штамп на лист: то же замечание, только с готовым текстом и в углу */
  const stamp = (text: string) =>
    addMarkup('STAMP', { x: 0.72, y: 0.04, w: 0.24, h: 0.06 }, text);

  /** Замечания текстом — вставить в письмо поставщику */
  const copyRemarks = async () => {
    const lines = shown
      .filter((m) => m.text)
      .map((m, i) => `${i + 1}. Стр. ${m.page}, ред. ${m.revision} — ${m.text} (${m.createdBy?.name || 'автор неизвестен'})`);
    if (!lines.length) { addToast('Замечаний с текстом пока нет', 'error'); return; }
    const text = `Замечания по чертежу «${file?.name || ''}»\n\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      addToast(`Скопировано замечаний: ${lines.length}`, 'success');
    } catch (_) { addToast('Буфер обмена недоступен', 'error'); }
  };

  const shown = markups.filter((m) => m.page === page && (scope === 'all' || m.revision === revision));

  const runCommand = (id: string, value?: string) => {
    if (TOOLS[id]) { setTool((t) => (t === TOOLS[id] ? null : TOOLS[id])); return; }
    switch (id) {
      case 'pdf.prev': return setPage((p) => Math.max(1, p - 1));
      case 'pdf.next': return setPage((p) => Math.min(pages, p + 1));
      case 'pdf.zoom': return setZoom((z) => Math.min(400, Math.max(25, z + (value === '+' ? 10 : -10))));
      case 'pdf.fitWidth': return fit('width');
      case 'pdf.fitPage': return fit('page');
      case 'pdf.rotateLeft': return setRotate((r) => (r + 270) % 360);
      case 'pdf.rotateRight': return setRotate((r) => (r + 90) % 360);
      case 'pdf.download': {
        if (!file?.content) return;
        const a = document.createElement('a');
        a.href = file.content; a.download = file.name || 'чертёж.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        return;
      }
      case 'pdf.print': {
        const w = window.open('', '_blank');
        if (!w) { addToast('Всплывающее окно заблокировано', 'error'); return; }
        w.document.write(`<iframe src="${file?.content}" style="border:0;width:100%;height:100%"></iframe>`);
        w.document.close();
        setTimeout(() => { try { w.print(); } catch (_) {} }, 800);
        return;
      }
      case 'pdf.color': { if (value) setColor(value); return; }
      case 'pdf.width': return setStroke((s) => Math.min(12, Math.max(1, s + (value === '+' ? 1 : -1))));
      case 'pdf.stampOk': return stamp('Проверено');
      case 'pdf.stampWork': return stamp('В работу');
      case 'pdf.stampNo': return stamp('Отменено');
      case 'pdf.list': return setListOpen((v) => !v);
      case 'pdf.copy': return copyRemarks();
      case 'pdf.scope': return setScope(value === 'current' ? 'current' : 'all');
      case 'pdf.status': return addToast('Стадия меняется в Проводнике — там же, где у остальных файлов', 'info');
      case 'pdf.thumbs': return setThumbs((v) => !v);
      case 'pdf.invert': return setInvert((v) => !v);
      default: return undefined;
    }
  };

  const organState: Record<string, boolean | string> = {
    'pdf.zoom': `${zoom} %`,
    'pdf.width': `${stroke} пт`,
    'pdf.color': color,
    'pdf.scope': scope,
    'pdf.list': listOpen,
    'pdf.thumbs': thumbs,
    'pdf.invert': invert,
    'pdf.cloud': tool === 'CLOUD',
    'pdf.rect': tool === 'RECT',
    'pdf.arrow': tool === 'ARROW',
    'pdf.note': tool === 'NOTE',
  };
  const organDisabled: Record<string, string> = {};
  if (page <= 1) organDisabled['pdf.prev'] = 'Это первая страница';
  if (page >= pages) organDisabled['pdf.next'] = 'Это последняя страница';
  if (!shown.some((m) => m.text)) organDisabled['pdf.copy'] = 'Замечаний с текстом на этой странице нет';

  if (!fileId) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        Откройте чертёж из Проводника — двойным нажатием по файлу PDF.
      </div>
    );
  }

  return (
    <div className="h-full">
      <EditorFrame
        doc={{
          icon: <FileText className="w-3.5 h-3.5 text-rose-600" />,
          name: file?.name || '',
          onRename: () => {},
          onClose: () => { window.location.hash = '#/explorer'; },
          revision,
          tag: null,
          saveState: 'saved',
          menu: [
            { label: 'Открыть в Проводнике', hint: 'Карточка файла, стадия и ревизии', run: () => { window.location.hash = '#/explorer'; } },
          ],
        }}
        tabs={tabs} active={tab} onActive={setTab}
        state={organState} disabled={organDisabled} onCommand={runCommand}
        folded={folded} onFold={setFolded}
        fileOpen={fileOpen} onFileOpen={setFileOpen}
        statusLeft={<>страница {page} из {pages || 1} · пометок {shown.length}
          {tool ? ' · обведите место на чертеже' : ''}</>}
        statusRight={<>{zoom} %</>}
      >
        <div ref={wrapRef} className="absolute inset-0 overflow-auto bg-slate-200 dark:bg-slate-950 flex">
          {thumbs && (
            <div className="w-28 shrink-0 border-r border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-auto py-2">
              {Array.from({ length: pages }).map((_, i) => (
                <button key={i} type="button" onClick={() => setPage(i + 1)}
                  className={`w-full px-2 py-1.5 text-2xs font-semibold cursor-pointer
                    ${page === i + 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'}`}>
                  Стр. {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-w-0 flex items-start justify-center p-6">
            <div className="relative shadow-2xl" style={{ width: size.w, height: size.h }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}>
              <canvas ref={canvasRef}
                className="block bg-white"
                style={{ filter: invert ? 'invert(1) hue-rotate(180deg)' : undefined, cursor: tool ? 'crosshair' : 'default' }} />
              {size.w > 0 && (
                <MarkupLayer
                  markups={shown} width={size.w} height={size.h}
                  currentRevision={revision} selectedId={selected} onSelect={setSelected} draft={draft}
                />
              )}
            </div>
          </div>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-950/70">
              <div className="flex items-center gap-3 text-slate-500 text-sm">
                <Loader2 className="w-5 h-5 animate-spin" /> Открываю чертёж…
              </div>
            </div>
          )}
          {listOpen && (
            <MarkupList
              markups={markups.filter((m) => scope === 'all' || m.revision === revision)}
              currentRevision={revision}
              selectedId={selected}
              onSelect={(id) => {
                const m = markups.find((x) => x.id === id);
                if (m) setPage(m.page);
                setSelected(id);
              }}
              onState={(id, state) => patchMarkup(id, { state })}
              onRemove={removeMarkup}
              onClose={() => setListOpen(false)}
            />
          )}
        </div>
      </EditorFrame>
    </div>
  );
}
