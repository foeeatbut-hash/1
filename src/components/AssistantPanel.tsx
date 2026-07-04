import React, { useState, useRef, useEffect } from 'react';
import { useAssistantStore, AssistantMessage } from '../store/assistantStore';
import { getSection } from '../assistant/sections';
import { Sparkles, Send, X, FileSpreadsheet, FileText, Play, HelpCircle, Loader2, MessageCircleQuestion, Info } from 'lucide-react';

function ActionButton({ msg }: { msg: AssistantMessage }) {
  const runAction = useAssistantStore(s => s.runAction);
  if (!msg.actions || msg.actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {msg.actions.map((a, i) => {
        const icon = a.kind === 'export-excel' ? <FileSpreadsheet className="w-3.5 h-3.5" />
          : a.kind === 'export-word' ? <FileText className="w-3.5 h-3.5" />
          : a.kind === 'tour' ? <Play className="w-3.5 h-3.5" />
          : a.kind === 'ask' ? <MessageCircleQuestion className="w-3.5 h-3.5" />
          : <HelpCircle className="w-3.5 h-3.5" />;
        return (
          <button
            key={i}
            onClick={() => runAction(a)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-600/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            {icon}
            <span>{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DataTable({ table }: { table: NonNullable<AssistantMessage['table']> }) {
  const shown = table.rows.slice(0, 50);
  return (
    <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0">
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {table.columns.map((c, i) => (
                <th key={i} className="px-2 py-1.5 text-left font-bold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, ri) => (
              <tr key={ri} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-950">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 align-top">{String(cell ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.rows.length > shown.length && (
        <div className="px-2 py-1 text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
          Показано {shown.length} из {table.rows.length}. Выгрузите в Excel, чтобы увидеть всё.
        </div>
      )}
    </div>
  );
}

export default function AssistantPanel() {
  const isOpen = useAssistantStore(s => s.isOpen);
  const setOpen = useAssistantStore(s => s.setOpen);
  const messages = useAssistantStore(s => s.messages);
  const loading = useAssistantStore(s => s.loading);
  const ask = useAssistantStore(s => s.ask);
  const currentRoute = useAssistantStore(s => s.currentRoute);
  const runSuggestion = useAssistantStore(s => s.runSuggestion);
  const describeCurrentSection = useAssistantStore(s => s.describeCurrentSection);

  const section = getSection(currentRoute);

  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // История отправленных запросов — листается стрелкой вверх, как в терминале
  const historyRef = useRef<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  useEffect(() => {
    // Прокручиваем ТОЛЬКО контейнер сообщений, а не весь документ:
    // scrollIntoView прокручивал и родительские контейнеры, уводя весь интерфейс вверх
    if (isOpen && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, isOpen, loading]);

  // Ctrl+K / Cmd+K — открыть помощника и сразу поставить фокус в поле ввода
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 60);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const maybeDigest = useAssistantStore(s => s.maybeDigest);
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
      maybeDigest(); // проактивный дайджест при первом открытии за сессию
    }
  }, [isOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    historyRef.current = [text, ...historyRef.current.filter(h => h !== text)].slice(0, 50);
    setHistIdx(-1);
    setInput('');
    ask(text);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Стрелка вверх/вниз — листаем историю запросов (когда поле пустое или уже листаем)
    if (e.key === 'ArrowUp' && historyRef.current.length > 0) {
      if (input === '' || histIdx >= 0) {
        e.preventDefault();
        const next = Math.min(histIdx + 1, historyRef.current.length - 1);
        setHistIdx(next);
        setInput(historyRef.current[next]);
      }
    } else if (e.key === 'ArrowDown' && histIdx >= 0) {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setInput(next < 0 ? '' : historyRef.current[next]);
    }
  };

  return (
    // Раздвижная панель справа — как левый сайдбар: меняет ширину и сдвигает контент
    <aside
      className={`${isOpen ? 'w-[380px] opacity-100' : 'w-0 opacity-0 pointer-events-none'} shrink-0 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 overflow-hidden`}
    >
      <div className="w-[380px] h-full flex flex-col shrink-0">
      {/* Шапка */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-600/10 to-transparent shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Помощник PDM</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">Локальный · работает офлайн</div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer transition-colors" title="Закрыть">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Сообщения */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] ${m.role === 'user' ? 'order-2' : ''}`}>
              <div className={`p-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-none'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none'
              }`}>
                {m.text}
              </div>
              {m.table && <DataTable table={m.table} />}
              {m.role === 'assistant' && <ActionButton msg={m} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 pl-1">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
            <span>Обрабатываю запрос…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Контекст текущего раздела: подсказки и вопросы */}
      {section && (
        <div className="px-3 pt-2 pb-1 border-t border-slate-100 dark:border-slate-850 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <Info className="w-3 h-3" /> {section.emoji} Раздел: {section.title}
            </span>
            <button
              onClick={() => describeCurrentSection()}
              className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Подробнее
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {section.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => runSuggestion(s)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600/15 hover:text-emerald-700 dark:hover:text-emerald-300 text-slate-600 dark:text-slate-300 rounded-full text-[11px] font-medium cursor-pointer transition-colors"
              >
                {s.kind === 'tour' ? <Play className="w-3 h-3" /> : <MessageCircleQuestion className="w-3 h-3" />}
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Поле ввода */}
      <form onSubmit={submit} className="px-3 pb-3 shrink-0 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setHistIdx(-1); }}
          onKeyDown={onInputKeyDown}
          placeholder="Спросите (Ctrl+K) — данные, действия, справка…"
          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg cursor-pointer transition-colors shrink-0"
          title="Отправить"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      </div>
    </aside>
  );
}
