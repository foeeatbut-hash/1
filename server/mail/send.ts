import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { getPrisma } from '../context.js';
import { unseal } from './secret.js';
import * as imap from './imap.js';
import { credsOf } from './sync.js';

/**
 * Отправка письма.
 *
 * Три вещи, без которых отправка выглядит работающей, но таковой не является:
 *
 *  1. Копия в «Отправленные». SMTP только передаёт письмо дальше и ничего не
 *     кладёт в ящик. Без отдельного APPEND по IMAP отправленное письмо не
 *     увидит ни телефон, ни веб-почта — человек решит, что письмо пропало.
 *
 *  2. Заголовки цепочки. In-Reply-To и References связывают ответ с исходным
 *     письмом. Без них ответ уедет отдельной веткой и у получателя, и у нас.
 *
 *  3. Картинки подписи частями письма. Ссылка на наш сервер снаружи не
 *     откроется, а картинку в data: почтовые службы вырезают как подозрительную.
 *     Поэтому логотип уходит вложением с Content-ID, а в разметке остаётся
 *     ссылка cid: — так делают все почтовые клиенты.
 */

export interface OutFile {
  fileName: string;
  filePath: string;
  mimeType?: string;
}

export interface SendInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  files?: OutFile[];
  /** Письмо, на которое отвечаем — из него берутся заголовки цепочки */
  replyTo?: { messageId: string; refs: string; subject: string } | null;
}

export interface SendResult {
  ok: boolean;
  error: string;
  messageId: string;
  /** Удалось ли положить копию в «Отправленные» */
  appended: boolean;
}

/**
 * Разбор строки адресов «Имя <адрес>, второй@адрес» в список для nodemailer.
 *
 * Разделитель считается разделителем только вне угловых скобок и вне кавычек.
 * Иначе `"Иванов, Иван" <i@x.ru>` разваливается по запятой внутри имени на два
 * куска, и письмо уходит на выдуманный адрес — а виден этот случай только на
 * живой переписке, где кто-то подписался фамилией с запятой.
 */
export function splitAddrs(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = '';
  for (const ch of String(raw || '')) {
    if (ch === '"') quoted = !quoted;
    if (!quoted) {
      if (ch === '<') depth++;
      if (ch === '>') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';') && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((a) => a.includes('@'));
}

/**
 * Картинки подписи — во вложения с Content-ID.
 * Возвращает переписанную разметку и список частей письма.
 */
export function inlineImages(html: string, resolve: (id: string) => OutFile | null): {
  html: string; parts: Array<OutFile & { cid: string }>;
} {
  const parts: Array<OutFile & { cid: string }> = [];
  const seen = new Map<string, string>();
  // Наши картинки лежат по /mail_sig/<id>/<имя>; чужие ссылки не трогаем
  const out = String(html || '').replace(/src="\/mail_sig\/([0-9a-fA-F-]{6,})\/[^"]*"/g, (whole, id: string) => {
    let cid = seen.get(id) || '';
    if (!cid) {
      const file = resolve(id);
      if (!file) return whole;
      cid = `sig-${id}@flux`;
      seen.set(id, cid);
      parts.push({ ...file, cid });
    }
    return `src="cid:${cid}"`;
  });
  return { html: out, parts };
}

/** Простой текстовый вариант письма: без него часть служб метит письмо как спам. */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Тема ответа: «Re:» добавляем один раз, а не по разу на каждый ответ. */
export function replySubject(subject: string): string {
  const s = String(subject || '').trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export function forwardSubject(subject: string): string {
  const s = String(subject || '').trim();
  return /^(fwd|fw):/i.test(s) ? s : `Fwd: ${s}`;
}

/**
 * Проверка отправки: сервер SMTP отвечает и пускает с этим паролем.
 *
 * Раньше проверка связи спрашивала только IMAP, хотя обещала оба — так и было
 * написано в её пояснении. Из-за этого неверный сервер исходящих обнаруживался
 * не при подключении ящика, а в тот момент, когда человек нажимал «Отправить»
 * на готовом письме и терял его.
 */
export async function verifySmtp(
  c: { smtpHost: string; smtpPort: number; smtpSecure: boolean; login: string; password: string },
): Promise<{ ok: boolean; error: string }> {
  if (!c.smtpHost) return { ok: false, error: 'Не указан сервер исходящей почты (SMTP)' };
  const transport = nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort || 465,
    secure: c.smtpSecure !== false,
    auth: { user: c.login, pass: c.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  try {
    await transport.verify();
    return { ok: true, error: '' };
  } catch (err: any) {
    return { ok: false, error: explainSmtpError(err) };
  } finally {
    try { transport.close(); } catch (_) { /* уже закрыт */ }
  }
}

/** Отказ SMTP словами: человеку нужно знать, что делать, а не текст сервера */
export function explainSmtpError(err: any): string {
  const raw = String(err?.response || err?.message || err || '');
  const low = raw.toLowerCase();
  if (low.includes('enotfound') || low.includes('getaddrinfo') || low.includes('eai_again')) {
    return 'Сервер исходящей почты не найден. Проверьте адрес SMTP.';
  }
  if (low.includes('econnrefused')) return 'Сервер исходящей почты отказал в соединении. Проверьте порт: обычно 465 или 587.';
  if (low.includes('etimedout') || low.includes('timeout')) {
    return 'Сервер исходящей почты не ответил вовремя — возможно, порт закрыт межсетевым экраном.';
  }
  if (low.includes('invalid login') || low.includes('authentication') || low.includes('535')) {
    return 'Логин или пароль для отправки не подошли. У Gmail, Яндекса и Mail.ru нужен отдельный пароль приложения.';
  }
  if (low.includes('certificate') || low.includes('self-signed')) {
    return 'Не сошёлся сертификат сервера исходящей почты — проверьте адрес.';
  }
  return raw || 'Не удалось соединиться с сервером исходящей почты.';
}

export async function sendMail(accountId: string, input: SendInput, sigDir: string): Promise<SendResult> {
  const prisma = getPrisma();
  const acc = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!acc) return { ok: false, error: 'Ящик не найден', messageId: '', appended: false };

  const password = unseal(acc.secret, acc.secretNonce);
  if (!password) return { ok: false, error: 'Пароль ящика не читается — задайте его заново', messageId: '', appended: false };

  const to = splitAddrs(input.to);
  if (!to.length) return { ok: false, error: 'Укажите хотя бы одного получателя', messageId: '', appended: false };

  // Картинки подписи забираем с диска и вкладываем в письмо
  const images = await prisma.mailSignatureImage.findMany({ where: {} }).catch(() => [] as any[]);
  const byId = new Map((images as any[]).map((i) => [i.id, i]));
  const { html, parts } = inlineImages(input.html, (id) => {
    const img = byId.get(id);
    if (!img) return null;
    const p = path.isAbsolute(img.filePath) ? img.filePath : path.join(sigDir, img.filePath);
    if (!fs.existsSync(p)) return null;
    return { fileName: img.fileName, filePath: p, mimeType: img.mimeType };
  });

  const transport = nodemailer.createTransport({
    host: acc.smtpHost,
    port: acc.smtpPort,
    secure: acc.smtpSecure,
    auth: { user: acc.login, pass: password },
    // Дальше ждать бесполезно: человеку нужен внятный отказ, а не «крутится»
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 40000,
  });

  const attachments = [
    ...parts.map((p) => ({ filename: p.fileName, path: p.filePath, cid: p.cid, contentType: p.mimeType })),
    ...(input.files || []).map((f) => ({ filename: f.fileName, path: f.filePath, contentType: f.mimeType })),
  ];

  const headers: Record<string, string> = {};
  if (input.replyTo?.messageId) {
    headers['In-Reply-To'] = input.replyTo.messageId;
    // References — вся цепочка: к прежним добавляем то, на что отвечаем
    const chain = `${input.replyTo.refs || ''} ${input.replyTo.messageId}`.trim().split(/\s+/).filter(Boolean);
    headers.References = Array.from(new Set(chain)).join(' ');
  }

  let info: any;
  try {
    info = await transport.sendMail({
      from: acc.displayName ? { name: acc.displayName, address: acc.email } : acc.email,
      to,
      cc: splitAddrs(input.cc || ''),
      bcc: splitAddrs(input.bcc || ''),
      subject: input.subject || '(без темы)',
      html,
      text: htmlToText(html),
      attachments,
      headers,
    });
  } catch (err: any) {
    return { ok: false, error: explainSmtp(err), messageId: '', appended: false };
  } finally {
    try { transport.close(); } catch (_) { /* соединение уже закрыто */ }
  }

  // Копия в «Отправленные». Отказ здесь не отменяет отправки: письмо уже ушло,
  // и говорить «не отправилось» было бы неправдой
  let appended = false;
  try {
    const sent = await prisma.mailFolder.findFirst({ where: { accountId: acc.id, kind: 'SENT' } });
    if (sent && info?.message) {
      const raw = Buffer.isBuffer(info.message) ? info.message : Buffer.from(String(info.message));
      await imap.appendMessage({ ...credsOf(acc), password }, sent.path, raw, ['\\Seen']);
      appended = true;
    }
  } catch (_) { /* письмо ушло, копия не легла — скажем об этом отдельно */ }

  return { ok: true, error: '', messageId: String(info?.messageId || ''), appended };
}

/** Отказ SMTP по-русски: человеку нужно понять, что делать. */
export function explainSmtp(err: any): string {
  const code = String(err?.code || '');
  const text = String(err?.response || err?.message || err || '');
  if (code === 'EAUTH' || /535|534|authentication/i.test(text)) {
    return 'Сервер не принял логин или пароль. Для Gmail, Яндекса и Mail.ru нужен пароль приложения, а не обычный.';
  }
  if (code === 'ECONNREFUSED') return 'Сервер отправки отказал в соединении — проверьте адрес и порт SMTP.';
  if (code === 'ETIMEDOUT' || code === 'ESOCKET') return 'Сервер отправки не отвечает. Часто порт закрыт брандмауэром или сетью конторы.';
  if (/5\.7\.\d+|not allowed|spam/i.test(text)) return 'Сервер отклонил письмо: адрес отправителя не разрешён или письмо принято за спам.';
  if (/no recipients|550/i.test(text)) return 'Сервер не принял адрес получателя — проверьте, нет ли опечатки.';
  return text.slice(0, 300) || 'Не удалось отправить письмо';
}
