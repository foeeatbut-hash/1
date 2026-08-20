import React from 'react';
import {
  Inbox, Send, FileEdit, Trash2, ShieldAlert, Archive, Folder, RefreshCw, Star, MailOpen,
  Building2, AtSign, Plus, PenSquare, Settings2, AlertTriangle,
} from 'lucide-react';
import type { MailAccount, MailFolder } from '../../services/mailService';
import type { MailFilter } from '../../store/mailStore';

/**
 * Левая колонка: ящики, а под открытым — его папки.
 *
 * Ящиков у сотрудника несколько: общая почта компании и сколько угодно своих.
 * Поэтому строкой первого уровня стоит ящик, а не папка — иначе непонятно,
 * чьи «Входящие» перед тобой. Папки раскрыты только у выбранного ящика:
 * четыре ящика по семь папок — это тридцать строк, в которых теряешься.
 *
 * По IMAP ярлык и папка — одно и то же: письмо лежит в одном месте. Поэтому
 * показываем папки и называем их папками, а не ярлыками, как в Gmail.
 *
 * В тесной панели колонка сжимается до значков — подписи уходят, счётчики
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
  accounts: MailAccount[];
  accountId: string;
  folders: MailFolder[];
  folderId: string;
  filter: MailFilter;
  syncing: boolean;
  /** Непрочитанные по ящикам — считает раздел, здесь только показываем */
  unreadByAccount: Record<string, number>;
  onChooseAccount: (id: string) => void;
  onChooseFolder: (id: string) => void;
  onFilter: (f: MailFilter) => void;
  onSync: () => void;
  onCompose: () => void;
  onAddAccount: () => void;
  onSettings: () => void;
}

/** Как назвать ящик в списке: своё название, иначе адрес. */
export function accountTitle(a: MailAccount): string {
  if (a.label) return a.label;
  if (a.scope === 'SHARED') return 'Общая почта';
  return a.email;
}

export default function MailSidebar({
  accounts, accountId, folders, folderId, filter, syncing, unreadByAccount,
  onChooseAccount, onChooseFolder, onFilter, onSync, onCompose, onAddAccount, onSettings,
}: Props) {
  return (
    <aside className="shrink-0 w-14 @[900px]:w-56 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 overflow-hidden">
      {/* Написать — первое действие в почте, поэтому первая кнопка */}
      <div className="shrink-0 p-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onCompose}
          disabled={!accountId}
          title="Написать письмо"
          className="w-full flex items-center justify-center @[900px]:justify-start gap-2 px-2 @[900px]:px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-60"
        >
          <PenSquare className="w-4 h-4 shrink-0" />
          <span className="hidden @[900px]:inline">Написать</span>
        </button>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing || !accountId}
          title="Проверить почту"
          className="w-full flex items-center justify-center @[900px]:justify-start gap-2 px-2 @[900px]:px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-850 text-xs font-semibold cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
          <span className="hidden @[900px]:inline">{syncing ? 'Проверяем…' : 'Проверить'}</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-1.5 pb-2 flex flex-col gap-0.5">
        {accounts.map((a) => {
          const open = a.id === accountId;
          const shared = a.scope === 'SHARED';
          const Icon = shared ? Building2 : AtSign;
          const unread = unreadByAccount[a.id] || 0;
          return (
            <div key={a.id} className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onChooseAccount(a.id)}
                title={`${accountTitle(a)} — ${a.email}`}
                aria-current={open ? 'true' : undefined}
                className={`group relative flex items-center justify-center @[900px]:justify-start gap-2 rounded-lg px-2 py-1.5 text-left cursor-pointer transition-colors
                  ${open
                    ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-850'}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${shared ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className="hidden @[900px]:flex flex-1 min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold">{accountTitle(a)}</span>
                  <span className="truncate text-2xs text-slate-500 dark:text-slate-400">{a.email}</span>
                </span>
                {a.lastError ? (
                  <AlertTriangle className="hidden @[900px]:block w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : unread > 0 ? (
                  <span className="hidden @[900px]:block shrink-0 text-2xs font-bold tabular-nums rounded-full px-1.5 py-0.5 bg-emerald-700 text-white">
                    {unread > 999 ? '999+' : unread}
                  </span>
                ) : null}
                {/* Узкая колонка: на 56 px подпись не влезает, счётчик садится
                    на угол значка — как в свёрнутом меню Gmail */}
                {unread > 0 && (
                  <span className="@[900px]:hidden absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full flex items-center justify-center text-2xs font-bold tabular-nums bg-emerald-700 text-white">
                    {unread > 99 ? '99' : unread}
                  </span>
                )}
              </button>

              {/* Папки — только у открытого ящика */}
              {open && folders.map((f) => {
                const FIcon = ICONS[f.kind] || Folder;
                const active = f.id === folderId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChooseFolder(f.id)}
                    title={f.name}
                    aria-current={active ? 'true' : undefined}
                    className={`group relative flex items-center justify-center @[900px]:justify-start gap-2.5 rounded-lg py-1.5 pr-2 pl-2 @[900px]:pl-7 text-left cursor-pointer transition-colors
                      ${active
                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-850'}`}
                  >
                    <FIcon className="w-4 h-4 shrink-0" />
                    <span className="hidden @[900px]:block flex-1 min-w-0 truncate text-sm">{f.name}</span>
                    {f.unread > 0 && (
                      <>
                        <span className={`hidden @[900px]:block shrink-0 text-2xs font-bold tabular-nums rounded-full px-1.5 py-0.5
                          ${active ? 'bg-emerald-700 text-white' : 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-100'}`}>
                          {f.unread > 999 ? '999+' : f.unread}
                        </span>
                        <span className={`@[900px]:hidden absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full flex items-center justify-center text-2xs font-bold tabular-nums
                          ${active ? 'bg-emerald-700 text-white' : 'bg-slate-400 text-white dark:bg-slate-600'}`}>
                          {f.unread > 99 ? '99' : f.unread}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddAccount}
          title="Добавить ящик"
          className="mt-1 flex items-center justify-center @[900px]:justify-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs cursor-pointer text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-850"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden @[900px]:block flex-1 min-w-0 truncate">Добавить ящик</span>
        </button>
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
        <button
          type="button"
          onClick={onSettings}
          title="Настройки почты и подписи"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs cursor-pointer text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-850"
        >
          <Settings2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden @[900px]:block flex-1 min-w-0 truncate">Настройки и подпись</span>
        </button>
      </div>
    </aside>
  );
}
