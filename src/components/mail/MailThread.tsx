import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Star, Archive, Trash2, Paperclip, Download, ImageOff, ChevronDown, AlertTriangle,
  CornerUpLeft, ReplyAll, Forward, UserCheck, MessageSquarePlus, CheckCircle2, Loader2,
  FolderInput, NotebookPen,
} from 'lucide-react';
import {
  mailService, type MailAttachment, type MailMessage,
  type MailThreadState, type MailActivity,
} from '../../services/mailService';
import { parseAddrList, displayName, initialsOf, toneOf, type AvatarTone } from '../../lib/mailAddress';
import { useToastStore } from '../../store/toastStore';
import { useStore } from '../../store/store';
import { useEscapeClose } from '../../lib/useDismiss';
import { sanitizeMailHtml, mailFrameDoc, textToHtml } from '../../lib/mailHtml';

/**
 * Открытая переписка: письма по порядку, последнее раскрыто.
 *
 * Тело каждого письма показывается в отдельном iframe с песочницей. Это не
 * перестраховка: HTML письма пишет посторонний человек, и это самое враждебное
 * содержимое, какое попадёт в программу. Песочница без allow-scripts и без
 * allow-same-origin означает, что выполнить в ней нечего и неоткуда достать
 * наши данные, даже если разбор что-то пропустит.
 */

const TONE_CLASS: Record<AvatarTone, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  slate: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const fullDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const humanSize = (bytes: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

interface BodyState { text: string; html: string; error: string; loading: boolean }

/** Одно письмо в переписке. */
function Letter({
  msg, files, dark, expanded, onToggle, myAddr, onToExplorer,
}: {
  msg: MailMessage;
  files: MailAttachment[];
  dark: boolean;
  expanded: boolean;
  onToggle: () => void;
  myAddr: string;
  onToExplorer: (f: MailAttachment) => void;
}) {
  const [body, setBody] = useState<BodyState>({ text: '', html: '', error: '', loading: false });
  const [showRemote, setShowRemote] = useState(false);
  const [height, setHeight] = useState(120);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Тело запрашиваем один раз на письмо. Признак «уже просили» держим в ref, а
  // не в состоянии: состояние в зависимостях эффекта означало бы, что эффект
  // сам себя перезапускает — очистка срабатывала раньше ответа, ответ
  // отбрасывался как устаревший, и письмо навсегда оставалось «загружающимся».
  const asked = useRef('');
  useEffect(() => {
    if (!expanded || asked.current === msg.id) return;
    asked.current = msg.id;
    setBody({ text: '', html: '', error: '', loading: true });
    mailService.body(msg.id)
      .then((r) => { if (asked.current === msg.id) setBody({ text: r.text, html: r.html, error: r.error, loading: false }); })
      .catch((err) => {
        if (asked.current === msg.id) setBody({ text: '', html: '', error: err?.message || 'Письмо не загрузилось', loading: false });
      });
    // Флага «жив ли эффект» здесь намеренно нет. React в режиме строгой
    // проверки монтирует эффект дважды: с флагом первый запрос помечался
    // устаревшим при очистке, второй не начинался из-за ref, и письмо
    // навсегда оставалось «загружающимся». Сверяемся по письму, а не по
    // жизни эффекта: ответ на нужное письмо годится всегда.
  }, [expanded, msg.id]);

  // Картинки, приложенные к самому письму, подставляем по cid — иначе
  // подпись и логотип отправителя не отрисуются
  const inlineMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of files) if (f.contentId) map[f.contentId] = mailService.attachmentUrl(f.id);
    return map;
  }, [files]);

  const prepared = useMemo(() => {
    if (body.html) return sanitizeMailHtml(body.html, { allowRemoteImages: showRemote, inlineImages: inlineMap, dark });
    if (body.text) return { html: textToHtml(body.text), blockedImages: 0 };
    return { html: '', blockedImages: 0 };
  }, [body.html, body.text, showRemote, inlineMap, dark]);

  const srcDoc = useMemo(
    () => (prepared.html ? mailFrameDoc(prepared.html, { allowRemoteImages: showRemote, dark }) : ''),
    [prepared.html, showRemote, dark],
  );

  // Высоту письма узнаём у самого документа: iframe своей высоты не имеет,
  // и без замера письмо показалось бы в окошке с прокруткой внутри прокрутки
  const measure = () => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (!doc?.body) return;
      const h = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight || 0);
      if (h > 0) setHeight(Math.min(h + 8, 20000));
    } catch (_) { /* песочница не пустила — оставляем прежнюю высоту */ }
  };

  const visible = files.filter((f) => !f.inline);
  const sender = { name: msg.fromName, addr: msg.fromAddr };
  const isMine = msg.fromAddr === myAddr;

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer"
      >
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${TONE_CLASS[toneOf(sender)]}`}>
          {initialsOf(sender)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
              {isMine ? 'вы' : displayName(sender)}
            </span>
            <span className="hidden @[700px]:inline text-2xs text-slate-400 dark:text-slate-500 truncate">
              {msg.fromAddr}
            </span>
          </div>
          {expanded ? (
            <div className="mt-0.5 text-2xs text-slate-500 dark:text-slate-400">
              кому: {parseAddrList(msg.toAddrs).map((a) => displayName(a)).join(', ') || '—'}
              {msg.ccAddrs ? ` · копия: ${parseAddrList(msg.ccAddrs).map((a) => displayName(a)).join(', ')}` : ''}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 truncate">{msg.snippet}</div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {visible.length > 0 && <Paperclip className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />}
          <span className="text-2xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{fullDate(msg.sentAt)}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-850">
          {body.loading && (
            <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Загружаем письмо…</p>
          )}

          {body.error && (
            <div className="m-3 flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <p className="text-xs text-rose-700 dark:text-rose-300">{body.error}</p>
            </div>
          )}

          {prepared.blockedImages > 0 && !showRemote && (
            <div className="m-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              <ImageOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="flex-1 min-w-[12rem] text-xs text-amber-800 dark:text-amber-300">
                Картинки не загружены: {prepared.blockedImages} шт. Загрузка сообщит отправителю, что вы открыли письмо.
              </p>
              <button
                type="button"
                onClick={() => setShowRemote(true)}
                className="px-2.5 py-1 rounded-md text-2xs font-semibold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              >
                Показать картинки
              </button>
            </div>
          )}

          {srcDoc && (
            <iframe
              ref={frameRef}
              title={`Письмо: ${msg.subject || 'без темы'}`}
              srcDoc={srcDoc}
              onLoad={measure}
              // Песочница без allow-scripts и без allow-same-origin: выполнить
              // в ней нечего, и до наших данных из неё не дотянуться
              sandbox=""
              referrerPolicy="no-referrer"
              className="w-full block border-0 bg-white dark:bg-slate-950"
              style={{ height }}
            />
          )}

          {!body.loading && !body.error && !srcDoc && (
            <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Письмо пустое.</p>
          )}

          {visible.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-850 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Вложения: {visible.length}
              </p>
              <div className="flex flex-wrap gap-2">
                {visible.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-1 min-w-0 max-w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 pl-2.5 pr-1 py-1"
                  >
                    <a
                      href={mailService.attachmentUrl(f.id)}
                      download={f.fileName}
                      title={`Скачать ${f.fileName}`}
                      className="flex items-center gap-2 min-w-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <span className="flex-1 min-w-0 truncate text-xs text-slate-700 dark:text-slate-300">{f.fileName}</span>
                      <span className="shrink-0 text-2xs font-mono text-slate-400 dark:text-slate-500">{humanSize(f.size)}</span>
                    </a>
                    {/* Смета из письма должна лечь в проект, а не остаться в
                        почте, откуда её потом не найдут */}
                    <button
                      type="button"
                      title="Сохранить в Проводник проекта"
                      aria-label={`Сохранить ${f.fileName} в Проводник`}
                      onClick={() => onToExplorer(f)}
                      className="shrink-0 p-1 rounded text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  accountId: string;
  threadKey: string;
  subject: string;
  flagged: boolean;
  myAddr: string;
  dark: boolean;
  onBack: () => void;
  onStar: (on: boolean) => void;
  onArchive: () => void;
  onTrash: () => void;
  /** Прочитанное отмечаем при открытии — как в любом почтовом клиенте */
  onSeen: (ids: string[]) => void;
  /** Написать ответ, ответить всем или переслать последнее письмо */
  onReply: (mode: 'REPLY' | 'REPLY_ALL' | 'FORWARD', messageId: string) => void;
  /** Мой id — чтобы отличить свои действия от чужих в ленте общего ящика */
  meId: string;
}

export default function MailThread({
  accountId, threadKey, subject, flagged, myAddr, dark,
  onBack, onStar, onArchive, onTrash, onSeen, onReply, meId,
}: Props) {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [shared, setShared] = useState(false);
  const [state, setState] = useState<MailThreadState | null>(null);
  const [activity, setActivity] = useState<MailActivity[]>([]);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  /** Вложение, которое кладём в Проводник; окно выбора папки открыто, пока оно задано */
  const [toExplorer, setToExplorer] = useState<MailAttachment | null>(null);
  const { addToast } = useToastStore();
  const [files, setFiles] = useState<MailAttachment[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    mailService.thread(accountId, threadKey)
      .then((r) => {
        if (!alive) return;
        setMessages(r.messages);
        setFiles(r.attachments);
        setShared(Boolean(r.shared));
        setState(r.state);
        setActivity(r.activity || []);
        // Раскрыто последнее письмо: именно его человек и хотел прочитать
        const last = r.messages[r.messages.length - 1];
        setOpenIds(last ? [last.id] : []);
        setLoading(false);
        const unread = r.messages.filter((m) => !m.seen).map((m) => m.id);
        if (unread.length) onSeen(unread);
      })
      .catch((err) => { if (alive) { setError(err?.message || 'Переписка не загрузилась'); setLoading(false); } });
    return () => { alive = false; };
    // onSeen намеренно вне зависимостей: он пересоздаётся на каждой отрисовке
    // и заново запускал бы загрузку
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, threadKey]);

  const filesOf = (id: string) => files.filter((f) => f.messageId === id);

  /** Письмо → запись в Блокноте, с шапкой «от кого и когда». */
  const onToNote = async (messageId: string) => {
    try {
      const r = await mailService.toNote(messageId);
      addToast(`Заметка «${r.note.title}» создана в Блокноте`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Не удалось создать заметку', 'error');
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <button
          type="button" title="Назад к списку" aria-label="Назад к списку" onClick={onBack}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="flex-1 min-w-0 truncate text-sm font-bold text-slate-900 dark:text-white">
          {subject || '(без темы)'}
        </h2>
        <button
          type="button" title={flagged ? 'Снять важность' : 'Пометить важным'} aria-label="Важное"
          onClick={() => onStar(!flagged)}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Star className={`w-4 h-4 ${flagged ? 'text-amber-500 fill-amber-400' : 'text-slate-400'}`} />
        </button>
        <button
          type="button" title="В архив" aria-label="В архив" onClick={onArchive}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Archive className="w-4 h-4" />
        </button>
        <button
          type="button" title="Удалить" aria-label="Удалить" onClick={onTrash}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 flex flex-col gap-2">
        {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Загружаем переписку…</p>}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}
        {messages.map((m) => (
          <Letter
            key={m.id}
            msg={m}
            files={filesOf(m.id)}
            dark={dark}
            myAddr={myAddr}
            expanded={openIds.includes(m.id)}
            onToExplorer={setToExplorer}
            onToggle={() => setOpenIds((prev) => (
              prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
            ))}
          />
        ))}

        {/* ── Общий ящик: что уже сделали коллеги ──────────────────────────
            Без этого десять сотрудников отвечают на одно письмо вслепую:
            двое напишут одно и то же, а третье письмо не возьмёт никто. */}
        {shared && (
          <section className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/25 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sky-200 dark:border-sky-900">
              <span className="text-2xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Общая почта
              </span>
              {state?.repliedByName && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  Ответил {state.repliedByName}
                </span>
              )}
              {state?.claimedByName && !state?.repliedByName && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  <UserCheck className="w-3 h-3 shrink-0" />
                  В работе у {state.claimedById === meId ? 'вас' : state.claimedByName}
                </span>
              )}
              <button
                type="button"
                onClick={async () => {
                  const on = state?.claimedById !== meId;
                  try {
                    const r = await mailService.claim(accountId, threadKey, on);
                    setState(r.state);
                    const a = await mailService.thread(accountId, threadKey);
                    setActivity(a.activity || []);
                  } catch (err: any) { setError(err?.message || 'Не удалось изменить состояние'); }
                }}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-sky-300 dark:border-sky-800 text-2xs font-semibold text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/50 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {state?.claimedById === meId ? 'Отпустить' : 'Взять в работу'}
              </button>
            </div>

            {activity.length > 0 && (
              <ul className="flex flex-col gap-1 px-3 py-2">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-baseline gap-2 text-2xs">
                    <span className="shrink-0 font-mono tabular-nums text-slate-400 dark:text-slate-500">
                      {new Date(a.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex-1 min-w-0 text-slate-600 dark:text-slate-400">
                      <b className="font-semibold text-slate-800 dark:text-slate-300">{a.userName || 'Сотрудник'}</b>
                      {' '}{actionText(a)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2 px-3 py-2 border-t border-sky-200 dark:border-sky-900">
              <MessageSquarePlus className="w-4 h-4 shrink-0 text-sky-700 dark:text-sky-400" />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !note.trim() || noteBusy) return;
                  setNoteBusy(true);
                  try {
                    const r = await mailService.addNote(accountId, threadKey, note.trim());
                    setActivity(r.activity);
                    setNote('');
                  } catch (err: any) { setError(err?.message || 'Пометка не сохранилась'); }
                  finally { setNoteBusy(false); }
                }}
                placeholder="Пометка коллегам — её увидят все, кто работает с этим ящиком"
                aria-label="Пометка коллегам"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {noteBusy && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-sky-600" />}
            </div>
          </section>
        )}
      </div>

      {/* Ответить — там, где заканчивается чтение, как в Gmail */}
      {messages.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => onReply('REPLY', messages[messages.length - 1].id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm cursor-pointer"
          >
            <CornerUpLeft className="w-3.5 h-3.5" /> Ответить
          </button>
          <button
            type="button"
            onClick={() => onReply('REPLY_ALL', messages[messages.length - 1].id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer"
          >
            <ReplyAll className="w-3.5 h-3.5" /> Всем
          </button>
          <button
            type="button"
            onClick={() => onReply('FORWARD', messages[messages.length - 1].id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer"
          >
            <Forward className="w-3.5 h-3.5" /> Переслать
          </button>

          {/* Договорённость из переписки должна оказаться в Блокноте рядом с
              остальными записями по проекту, а не теряться в почте */}
          <button
            type="button"
            onClick={() => void onToNote(messages[messages.length - 1].id)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer"
          >
            <NotebookPen className="w-3.5 h-3.5" /> В Блокнот
          </button>
        </div>
      )}

      {toExplorer && (
        <FolderPicker
          attachment={toExplorer}
          onClose={() => setToExplorer(null)}
          onDone={() => setToExplorer(null)}
        />
      )}
    </div>
  );
}

/**
 * Куда положить вложение.
 *
 * Папку спрашиваем, а не кладём в корень: в Проводнике у проекта своя
 * раскладка, и файл, упавший в общую кучу, теряется так же надёжно, как в
 * почте. Список — плоский, с пометкой личных папок: дерево на два уровня
 * здесь только мешало бы выбирать.
 */
function FolderPicker({ attachment, onClose, onDone }: {
  attachment: MailAttachment;
  onClose: () => void;
  onDone: () => void;
}) {
  const { addToast } = useToastStore();
  const activeProject = useStore((s) => s.activeProject);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; scope: string }>>([]);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEscapeClose(true, () => { if (!busy) onClose(); });

  useEffect(() => {
    let alive = true;
    mailService.linkFolders(activeProject?.id || '')
      .then((r) => { if (alive) { setFolders(r.folders); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeProject?.id]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await mailService.toExplorer(attachment.id, picked);
      addToast(`«${r.file.name}» сохранён в Проводник`, 'success');
      onDone();
    } catch (err: any) {
      addToast(err?.message || 'Не удалось сохранить вложение', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[85] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Куда сохранить вложение">
      <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md" onClick={() => !busy && onClose()} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Сохранить в Проводник</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
            {attachment.fileName} · {humanSize(attachment.size)}
          </p>
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Загружаем папки…</p>
          ) : (
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="Папка"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white cursor-pointer"
            >
              <option value="">Общий раздел, без папки</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}{f.scope === 'PERSONAL' ? ' (личная)' : ''}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-650 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-850 cursor-pointer">
              Отмена
            </button>
            <button type="button" onClick={save} disabled={busy || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold cursor-pointer disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Что человек сделал — по-русски и без служебных слов. */
function actionText(a: MailActivity): string {
  if (a.kind === 'CLAIMED') return 'взял переписку в работу';
  if (a.kind === 'RELEASED') return 'отпустил переписку';
  if (a.kind === 'REPLIED') return 'ответил на письмо';
  if (a.kind === 'FORWARDED') return 'переслал письмо';
  if (a.kind === 'STATUS') {
    if (a.note === 'ANSWERED') return 'отметил переписку отвеченной';
    if (a.note === 'CLOSED') return 'закрыл переписку';
    if (a.note === 'IN_PROGRESS') return 'взял переписку в работу';
    return 'вернул переписку в новые';
  }
  return `оставил пометку: ${a.note}`;
}
