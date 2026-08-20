import React, { useEffect, useState } from 'react';
import { Mail, X, Loader2, CheckCircle2, AlertTriangle, ExternalLink, KeyRound, ChevronDown } from 'lucide-react';
import { mailService, type MailAccount, type MailPreset } from '../../services/mailService';
import { useEscapeClose } from '../../lib/useDismiss';

/**
 * Подключение почтового ящика.
 *
 * Человек знает свой адрес и пароль. Адреса серверов и номера портов он не
 * знает и знать не обязан — их подставляем по домену, а показываем в
 * свёрнутом виде: разворачивать нужно только тем, у кого свой почтовый сервер.
 *
 * Отдельно про пароль: у Gmail, Яндекса и Mail.ru обычный пароль по IMAP не
 * работает, нужен «пароль приложения». Об этом человек узнаёт в момент отказа,
 * поэтому подсказка со ссылкой стоит прямо здесь, а не в документации.
 */

interface Props {
  /** Ящик для правки; пусто — подключаем новый */
  account?: MailAccount | null;
  /** Может ли этот сотрудник заводить общий ящик компании */
  mayShared?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
const label = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1';

export default function MailAccountForm({ account, mayShared = false, onClose, onSaved }: Props) {
  const editing = Boolean(account);
  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [displayNameValue, setDisplayName] = useState(account?.displayName || '');
  const [scope, setScope] = useState<'PERSONAL' | 'SHARED'>(account?.scope || 'PERSONAL');
  const [boxLabel, setBoxLabel] = useState(account?.label || '');
  const [syncDays, setSyncDays] = useState(String(account?.syncDays ?? 90));

  const [imapHost, setImapHost] = useState(account?.imapHost || '');
  const [imapPort, setImapPort] = useState(String(account?.imapPort ?? 993));
  const [smtpHost, setSmtpHost] = useState(account?.smtpHost || '');
  const [smtpPort, setSmtpPort] = useState(String(account?.smtpPort ?? 465));
  const [login, setLogin] = useState(account?.login || '');

  const [preset, setPreset] = useState<MailPreset | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState('');

  useEscapeClose(true, () => { if (!busy) onClose(); });

  // Подставляем настройки, как только адрес похож на адрес. Уже введённое
  // руками не трогаем: человек мог поправить их осознанно.
  useEffect(() => {
    if (!email.includes('@') || email.endsWith('@')) return;
    let alive = true;
    const t = setTimeout(() => {
      mailService.preset(email).then((r) => {
        if (!alive || !r.preset) return;
        setPreset(r.preset);
        setImapHost((v) => v || r.preset!.imapHost);
        setImapPort((v) => (v === '993' || !v ? String(r.preset!.imapPort) : v));
        setSmtpHost((v) => v || r.preset!.smtpHost);
        setSmtpPort((v) => (v === '465' || !v ? String(r.preset!.smtpPort) : v));
        setLogin((v) => v || email);
      }).catch(() => { /* подсказка необязательна */ });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [email]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCheck(null);
    if (!email.includes('@')) { setError('Укажите адрес почты'); return; }
    if (!editing && !password) { setError('Укажите пароль'); return; }

    setBusy(true);
    try {
      const data: Record<string, unknown> = {
        email,
        displayName: displayNameValue,
        scope,
        label: boxLabel,
        syncDays: Number(syncDays) || 90,
        imapHost, imapPort: Number(imapPort) || 993,
        smtpHost, smtpPort: Number(smtpPort) || 465,
        login: login || email,
      };
      // Пустой пароль при правке — «не менять», а не «стереть»
      if (password) data.password = password;

      const saved = editing
        ? await mailService.updateAccount(account!.id, data)
        : await mailService.addAccount(data);

      // Сразу проверяем связь: узнать о неверном пароле лучше здесь, чем
      // потом в пустом списке писем
      const v = await mailService.verify(saved.account.id);
      setCheck({ ok: v.imap.ok, text: v.imap.ok ? `Связь есть, папок на сервере: ${v.imap.folders}` : v.imap.error });
      if (v.imap.ok) {
        onSaved();
        setTimeout(onClose, 900);
      }
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить ящик');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Подключение почтового ящика">
      <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md" onClick={() => !busy && onClose()} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="@container relative w-full max-w-xl max-h-[88vh] overflow-y-auto scrollbar-thin rounded-lg bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 min-w-0 text-emerald-700 dark:text-emerald-400">
              <Mail className="w-5 h-5 shrink-0" />
              <h3 className="flex-1 min-w-0 truncate text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Настройки ящика' : 'Подключить почту'}
              </h3>
            </div>
            <button
              type="button" title="Закрыть" aria-label="Закрыть" onClick={onClose} disabled={busy}
              className="p-1 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={save} className="flex flex-col gap-4">
            {/* Род ящика выбирается один раз при подключении: перевести личный
                ящик в общий значит открыть переписку всей конторе, и делать
                это незаметной галочкой в правке нельзя */}
            {!editing && mayShared && (
              <div className="flex flex-col gap-1.5">
                <span className={label}>Чей это ящик</span>
                <div className="grid grid-cols-1 @[440px]:grid-cols-2 gap-2">
                  {([
                    { key: 'PERSONAL', title: 'Мой личный', text: 'Виден только вам. Таких можно завести несколько.' },
                    { key: 'SHARED', title: 'Общая почта компании', text: 'Видна всем сотрудникам. Настраивается один раз.' },
                  ] as const).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setScope(o.key)}
                      aria-pressed={scope === o.key}
                      className={`flex flex-col gap-0.5 rounded-lg border p-2.5 text-left cursor-pointer transition-colors
                        ${scope === o.key
                          ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-850'}`}
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{o.title}</span>
                      <span className="text-2xs text-slate-500 dark:text-slate-400">{o.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 @[440px]:grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="mail-email">Адрес почты</label>
                <input
                  id="mail-email" type="email" value={email} disabled={editing || busy}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ivanov@yandex.ru" className={field} autoComplete="email"
                />
              </div>
              <div>
                <label className={label} htmlFor="mail-pass">
                  {editing ? 'Новый пароль (пусто — не менять)' : 'Пароль'}
                </label>
                <input
                  id="mail-pass" type="password" value={password} disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editing ? '••••••••' : 'пароль приложения'} className={field}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {preset?.hint && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                <KeyRound className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-800 dark:text-amber-300">{preset.hint}</p>
                  {preset.help && (
                    <a
                      href={preset.help} target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:underline"
                    >
                      Как его получить <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 @[440px]:grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="mail-name">Имя в поле «От кого»</label>
                <input
                  id="mail-name" type="text" value={displayNameValue} disabled={busy}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Иванов И.И." className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor="mail-days">Скачивать письма за, дней</label>
                <input
                  id="mail-days" type="number" min={1} max={3650} value={syncDays} disabled={busy}
                  onChange={(e) => setSyncDays(e.target.value)} className={field}
                />
              </div>
            </div>

            <div>
              <label className={label} htmlFor="mail-label">Название в списке</label>
              <input
                id="mail-label" value={boxLabel} disabled={busy}
                onChange={(e) => setBoxLabel(e.target.value)}
                placeholder={scope === 'SHARED' ? 'Общая почта' : 'Рабочая почта'} className={field}
              />
            </div>

            {/* Адреса серверов нужны только тем, у кого своя почта */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <button
                type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}
                className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer"
              >
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${advanced ? 'rotate-180' : ''}`} />
                <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Адреса серверов {preset && !advanced ? `— подставлены для «${preset.title}»` : ''}
                </span>
              </button>
              {advanced && (
                <div className="grid grid-cols-1 @[440px]:grid-cols-2 gap-3 px-3 pb-3">
                  <div>
                    <label className={label} htmlFor="mail-imap">Сервер IMAP</label>
                    <input id="mail-imap" value={imapHost} disabled={busy} onChange={(e) => setImapHost(e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="mail-imap-port">Порт IMAP</label>
                    <input id="mail-imap-port" type="number" value={imapPort} disabled={busy} onChange={(e) => setImapPort(e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="mail-smtp">Сервер SMTP</label>
                    <input id="mail-smtp" value={smtpHost} disabled={busy} onChange={(e) => setSmtpHost(e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="mail-smtp-port">Порт SMTP</label>
                    <input id="mail-smtp-port" type="number" value={smtpPort} disabled={busy} onChange={(e) => setSmtpPort(e.target.value)} className={field} />
                  </div>
                  <div className="@[440px]:col-span-2">
                    <label className={label} htmlFor="mail-login">Логин, если он не совпадает с адресом</label>
                    <input id="mail-login" value={login} disabled={busy} onChange={(e) => setLogin(e.target.value)} placeholder={email} className={field} />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
              </div>
            )}

            {check && (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${check.ok
                ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30'
                : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30'}`}>
                {check.ok
                  ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />}
                <p className={`text-xs ${check.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                  {check.text}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button" onClick={onClose} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-650 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-850 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit" disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold shadow-md cursor-pointer disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Проверяем связь…' : editing ? 'Сохранить и проверить' : 'Подключить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
