import React from 'react';
import {
  Inbox, Send, FileEdit, Trash2, ShieldAlert, Archive, Folder, RefreshCw, Star, MailOpen,
} from 'lucide-react';
import type { MailFolder } from '../../services/mailService';
import type { MailFilter } from '../../store/mailStore';

/**
 * Рельс папок.
 *
 * По IMAP ярлык и папка — одно и то же: письмо лежит в одном месте. Поэтому
 * показываем папки и называем их папками. Обещать ярлыки Gmail и дать папки
 * было бы хуже, чем честно дать папки.
 *
 * В тесной панели рельс сжимается до значков — подписи уходят, счётчики
 * остаются: без них непонятно, куда смотреть.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  INBOX: Inbox,
  SENT: Send,
  DRAFTS: FileEdit,
  TRASH: Trash2,
  SPAM: ShieldAlert,
  ARCHIVE: Archive,
  CUSTOM: Folder,
};

interface Props {
  folders: MailFolder[];
  folderId: string;
  filter: MailFilter;
  syncing: boolean;
  onChoose: (id: string) => void;
  onFilter: (f: MailFilter) => void;
  onSync: () => void;
}

export default function MailFolders({ folders, folderId, filter, syncing, onChoose, onFilter, onSync }: Props) {
  return (
    <aside className="shrink-0 w-14 @[900px]:w-52 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 overflow-hidden">
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          title="Проверить почту"
          className="w-full flex items-center justify-center @[900px]:justify-start gap-2 px-2 @[900px]:px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
          <span className="hidden @[900px]:inline">{syncing ? 'Проверяем…' : 'Проверить'}</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-1.5 pb-2 flex flex-col gap-0.5">
        {folders.map((f) => {
          const Icon = ICONS[f.kind] || Folder;
          const active = f.id === folderId;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onChoose(f.id)}
              title={f.name}
              aria-current={active ? 'true' : undefined}
              className={`group relative flex items-center justify-center @[900px]:justify-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left cursor-pointer transition-colors
                ${active
                  ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-850'}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden @[900px]:block flex-1 min-w-0 truncate text-sm">{f.name}</span>
              {f.unread > 0 && (
                <>
                  {/* Широкий рельс: счётчик стоит в строке рядом с названием */}
                  <span className={`hidden @[900px]:block shrink-0 text-2xs font-bold tabular-nums rounded-full px-1.5 py-0.5
                    ${active ? 'bg-emerald-700 text-white' : 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-100'}`}>
                    {f.unread > 999 ? '999+' : f.unread}
                  </span>
                  {/* Узкий: на строку в 56 px значок и счётчик рядом не влезают —
                      вылезали на 12 px. Счётчик садится на угол значка, как в
                      свёрнутом меню Gmail. */}
                  <span className={`@[900px]:hidden absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full flex items-center justify-center text-2xs font-bold tabular-nums
                    ${active ? 'bg-emerald-700 text-white' : 'bg-slate-400 text-white dark:bg-slate-600'}`}>
                    {f.unread > 99 ? '99' : f.unread}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Быстрый отбор — то, за чем чаще всего лезут в поиск */}
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-1.5 flex flex-col gap-0.5">
        {([
          { key: 'all', label: 'Все письма', Icon: MailOpen },
          { key: 'unread', label: 'Непрочитанные', Icon: Inbox },
          { key: 'flagged', label: 'Важные', Icon: Star },
        ] as Array<{ key: MailFilter; label: string; Icon: React.ComponentType<{ className?: string }> }>).map(
          ({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilter(key)}
              title={label}
              aria-pressed={filter === key}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs cursor-pointer transition-colors
                ${filter === key
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-850'}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden @[900px]:block flex-1 min-w-0 truncate">{label}</span>
            </button>
          ),
        )}
      </div>
    </aside>
  );
}
