/**
 * Помощник в списке разговоров Мессенджера.
 *
 * Закреплён первым и выглядит как собеседник, а не как программа, в которую
 * надо идти: просьба владельца была именно такой — «по умолчанию в чате
 * мессенджера есть с ней диалог». История разговоров у него та же, что в
 * разделе «Помощник», — один список, одно хранилище: разговор, начатый здесь,
 * находится там и наоборот.
 */
import React from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { useAssistantStore } from '../../store/assistantStore';

export default function AssistantEntry() {
  const open = useAssistantStore((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => open(true)}
      title="Спросить помощника. В группе его можно позвать, начав сообщение с «@помощник»"
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                 hover:bg-slate-100 dark:hover:bg-slate-850 text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
        <MessageCircleQuestion className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-slate-800 dark:text-white truncate">Помощник</div>
        <div className="text-2xs text-slate-400 truncate">В группе зовите через «@помощник»</div>
      </div>
    </button>
  );
}
