import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Link2, ShieldCheck, History, ArrowUp, ArrowDown } from 'lucide-react';
import { useStore } from '../store/store';
import { useInsightStore } from '../store/insightStore';
import { SECTIONS } from '../workspace/sections';
import { fetchSearch, type SearchHit, type UsageKind } from '../lib/insight';
import { useAssistantStore } from '../store/assistantStore';
import { KindIcon } from './insight/parts';

/**
 * Общий поиск и переходы: Ctrl+Shift+F — «найти везде».
 *
 * Зачем поверх существующих поисков в разделах. Их четыре, они ищут каждый по
 * своему списку, и чтобы найти файл, надо сначала догадаться пойти в Проводник.
 * Здесь один ввод на весь проект: теги, оборудование, документы, файлы, ВДР,
 * заметки, проекты и сами разделы.
 *
 * Ctrl+K намеренно не занимаем: он давно вызывает помощника, про это написано и
 * в его приветствии, и в справочнике. Отобрать привычное сочетание ради нового
 * окна — худшее, что можно сделать с тем, кто уже привык. Помощник вместо этого
 * доступен отсюда последней строкой: набранный вопрос уходит прямо ему.
 *
 * Сочетание ловим по коду клавиши, а не по букве: на русской раскладке Ctrl+F
 * даёт «а», и проверка по символу не срабатывала бы ровно там, где программой и
 * пользуются.
 */

type Item = {
  key: string;
  kind: string;
  title: string;
  subtitle: string;
  route: string;
  /** Объект, у которого есть связи — открываются по Tab */
  usage?: { kind: UsageKind; id: string };
  action?: () => void;
};

export default function CommandPalette() {
  const { paletteOpen, closePalette, togglePalette, openWhere, openCheck, openChanges } = useInsightStore();
  const { activeProject, user } = useStore();
  const askAssistant = useAssistantStore(s => s.ask);
  const openAssistant = useAssistantStore(s => s.setOpen);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Открытие/закрытие сочетанием — слушаем всегда, даже когда окно закрыто
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePalette]);

  useEffect(() => {
    if (paletteOpen) {
      setQ(''); setHits([]); setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  // Запрос уходит с задержкой: иначе на каждое нажатие уходил бы срез проекта
  useEffect(() => {
    if (!paletteOpen) return;
    const text = q.trim();
    if (text.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      fetchSearch(text, activeProject?.id).then(h => { setHits(h); setBusy(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [q, paletteOpen, activeProject?.id]);

  const sections = useMemo(() => SECTIONS.filter(s => !s.adminOnly || user?.role === 'ADMIN'), [user?.role]);

  const items: Item[] = useMemo(() => {
    const text = q.trim().toLowerCase();
    const out: Item[] = [];

    // Действия — всегда сверху, когда подходят: за ними ходят чаще всего
    const actions: Item[] = [
      { key: 'a-check', kind: 'section', title: 'Проверка проекта', subtitle: 'что стоит поправить до выпуска', route: '', action: openCheck },
      { key: 'a-changes', kind: 'section', title: 'Что изменилось', subtitle: 'лист изменений по оборудованию', route: '', action: openChanges },
    ];
    for (const a of actions) {
      if (!text || a.title.toLowerCase().includes(text)) out.push(a);
    }

    for (const s of sections) {
      if (text && !s.title.toLowerCase().includes(text)) continue;
      out.push({ key: `s-${s.path}`, kind: 'section', title: s.title, subtitle: 'раздел программы', route: s.path });
    }

    for (const h of hits) {
      out.push({
        key: `${h.kind}-${h.id}`, kind: h.kind, title: h.title, subtitle: h.subtitle, route: h.route,
        usage: ['tag', 'element', 'doc', 'file', 'vdr'].includes(h.kind)
          ? { kind: h.kind as UsageKind, id: h.id } : undefined,
      });
    }

    // Помощник — всегда последней строкой, а не первой: иначе Enter означал бы
    // то одно, то другое в зависимости от того, нашлось ли что-нибудь
    if (text.length >= 2) {
      out.push({
        key: 'a-ask', kind: 'section', title: `Спросить помощника: «${q.trim()}»`,
        subtitle: 'он ищет по данным проекта и умеет отвечать словами', route: '',
        action: () => { openAssistant(true); askAssistant(q.trim()); },
      });
    }
    return out;
  }, [q, hits, sections, openCheck, openChanges, askAssistant, openAssistant]);

  useEffect(() => { setCursor(0); }, [q, hits.length]);

  // Держим выбранную строку в поле зрения — иначе стрелками «уезжаешь» вслепую
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!paletteOpen) return null;

  const run = (it: Item) => {
    if (it.action) { it.action(); return; }
    if (it.route) { navigate(it.route); closePalette(); }
  };

  const showUsage = (it: Item) => {
    if (!it.usage) return;
    openWhere(it.usage.kind, it.usage.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return; }
    if (e.key === 'Tab') {
      const it = items[cursor];
      if (it?.usage) { e.preventDefault(); showUsage(it); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[cursor];
      if (it) run(it);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4">
      <button type="button" aria-label="Закрыть поиск" onClick={closePalette}
        className="absolute inset-0 bg-slate-950/30 dark:bg-slate-950/55 cursor-default" />

      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-850">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Тег, оборудование, документ, файл или раздел…"
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {busy && <span className="w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />}
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-slate-400">
              {q.trim().length < 2 ? 'Наберите хотя бы две буквы' : 'Ничего не нашлось в этом проекте'}
            </p>
          ) : items.map((it, i) => (
            <button
              key={it.key}
              data-idx={i}
              type="button"
              onMouseEnter={() => setCursor(i)}
              onClick={() => run(it)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-left cursor-pointer ${
                i === cursor ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''
              }`}
            >
              {it.key === 'a-check' ? <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                : it.key === 'a-changes' ? <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  : <KindIcon kind={it.kind} />}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-150 truncate">{it.title}</span>
                <span className="block text-2xs text-slate-500 dark:text-slate-400 truncate">{it.subtitle}</span>
              </span>
              {it.usage && i === cursor && (
                <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-bold
                                 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                  <Link2 className="w-3 h-3" /> Tab
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 dark:border-slate-850 text-2xs text-slate-400">
          <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> выбор</span>
          <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> открыть</span>
          <span className="flex items-center gap-1"><Link2 className="w-3 h-3" /> Tab — связи</span>
          <div className="flex-1" />
          <span>Esc — закрыть</span>
        </div>
      </div>
    </div>
  );
}
