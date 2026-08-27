/**
 * Помощник окном.
 *
 * Помощник перестал быть панелью-приложением сбоку и стал программой: у него
 * есть окно, кнопка на панели задач, место на столе и доля экрана. Это не
 * украшение — так его можно поставить рядом с ведомостью и разговаривать про
 * неё, не закрывая её собой. В панели шириной 380 таблица ответа помещалась
 * тремя колонками из семи.
 *
 * Разговор тот же самый, что в панели (components/assistant/Chat): одно окно,
 * одна беседа. Два окна показывали бы одно и то же с двух сторон.
 */
import React from 'react';
import { MessageCircleQuestion, Trash2 } from 'lucide-react';
import Chat from '../components/assistant/Chat';
import { useAssistantStore } from '../store/assistantStore';
import { useWindowTitle } from '../lib/paneTitle';

export default function AssistantScreen() {
  const messages = useAssistantStore((s) => s.messages);
  const clear = useAssistantStore((s) => s.clearTalk);

  // Заголовок окна — о чём говорим: последний вопрос человека. Окно «Помощник»
  // среди пяти других окон не отвечает на вопрос «какое из них про что»
  const lastAsked = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i].text;
    return '';
  }, [messages]);
  useWindowTitle(lastAsked ? `Помощник · ${lastAsked.slice(0, 40)}` : 'Помощник');

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 h-10 border-b border-slate-200 dark:border-slate-800">
        <MessageCircleQuestion className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
        <span className="text-xs font-bold text-slate-800 dark:text-slate-150">Помощник</span>
        <span className="text-2xs text-slate-400 dark:text-slate-500 truncate hidden @[560px]:inline">
          работает без сети: отвечает по данным этого проекта и по руководству
        </span>
        <span className="flex-1" />
        <button type="button" onClick={clear} title="Начать разговор заново"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-semibold text-slate-500
                     hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
          <Trash2 className="w-3 h-3" /> Заново
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <Chat />
      </div>
    </div>
  );
}
