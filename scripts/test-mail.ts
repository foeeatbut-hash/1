/**
 * Проверки почтовых разборов: адреса и цепочки.
 *
 * Оба модуля чистые, поэтому проверяются без сервера и без браузера. Ловят они
 * ровно то, на чём почтовые клиенты ошибаются чаще всего: запятую внутри
 * имени, приставку «Re:» на двух языках подряд и рассыпание цепочки, когда
 * письмо-предок пришло позже ответа.
 */
import {
  parseAddr, parseAddrList, formatAddrList, displayName, initialsOf, toneOf, listHas,
} from '../src/lib/mailAddress.js';
import {
  normalizeSubject, parseRefs, threadKeyOf, assignThreadKeys, threadParticipants,
} from '../src/lib/mailThread.js';
import { isSafeUrl, isRemoteImage, cidOf, textToHtml, mailFrameDoc } from '../src/lib/mailHtml.js';
import {
  splitAddrs, inlineImages, htmlToText, replySubject, forwardSubject, explainSmtp,
} from '../server/mail/send.js';
import { msgKeyOf } from '../server/mail/access.js';

let ok = 0;
let fail = 0;
const eq = (name: string, got: any, want: any) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { ok++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      получили: ${g}\n      ожидали:  ${w}`); }
};

console.log('\n1. Разбор адресов');
eq('голый адрес', parseAddr('ivanov@example.ru'), { name: '', addr: 'ivanov@example.ru' });
eq('имя и адрес в углах', parseAddr('Иванов И.И. <Ivanov@Example.RU>'), { name: 'Иванов И.И.', addr: 'ivanov@example.ru' });
eq('адрес приводится к нижнему регистру', parseAddr('<ПОЧТА@Example.COM>').addr, 'почта@example.com');
eq('кавычки вокруг имени снимаются', parseAddr('"Отдел закупок" <zakup@ex.ru>').name, 'Отдел закупок');
eq('пустая строка не даёт мусора', parseAddr('   '), { name: '', addr: '' });

console.log('\n2. Список адресов');
eq('два адреса через запятую',
  parseAddrList('a@ex.ru, Пётр <b@ex.ru>').map((x) => x.addr),
  ['a@ex.ru', 'b@ex.ru']);
eq('запятая внутри имени не рвёт список',
  parseAddrList('"Иванов, Иван" <i@ex.ru>, p@ex.ru').length, 2);
eq('и имя при этом целое',
  parseAddrList('"Иванов, Иван" <i@ex.ru>, p@ex.ru')[0].name, 'Иванов, Иван');
eq('точка с запятой тоже разделитель',
  parseAddrList('a@ex.ru; b@ex.ru').length, 2);
eq('запятая внутри углов не считается',
  parseAddrList('<a,b@ex.ru>').length, 1);

console.log('\n3. Сборка обратно');
eq('имя с запятой уходит в кавычки',
  formatAddrList([{ name: 'Иванов, Иван', addr: 'i@ex.ru' }]), '"Иванов, Иван" <i@ex.ru>');
eq('простое имя без кавычек',
  formatAddrList([{ name: 'Пётр', addr: 'p@ex.ru' }]), 'Пётр <p@ex.ru>');
eq('разбор и сборка не теряют адресов',
  parseAddrList(formatAddrList(parseAddrList('"Иванов, И" <i@ex.ru>, p@ex.ru'))).length, 2);

console.log('\n4. Как показываем отправителя');
eq('имя важнее адреса', displayName({ name: 'Пётр', addr: 'p@ex.ru' }), 'Пётр');
eq('без имени — часть до собаки', displayName({ name: '', addr: 'zakup@ex.ru' }), 'zakup');
eq('инициалы из двух слов', initialsOf({ name: 'Иван Петров', addr: '' }), 'ИП');
eq('инициалы из адреса с точкой', initialsOf({ name: '', addr: 'ivan.petrov@ex.ru' }), 'IP');
eq('пустой отправитель даёт вопрос', initialsOf({ name: '', addr: '' }), '?');
eq('цвет кружка постоянен для адреса',
  toneOf({ addr: 'a@ex.ru' }) === toneOf({ addr: 'a@ex.ru' }), true);
eq('цвет берётся только из палитры системы',
  ['emerald', 'sky', 'amber', 'rose', 'slate'].includes(toneOf({ addr: 'кто-то@ex.ru' })), true);
eq('адресовано лично мне', listHas('a@ex.ru, Я <me@ex.ru>', 'ME@ex.ru'), true);
eq('не адресовано', listHas('a@ex.ru', 'me@ex.ru'), false);

console.log('\n5. Тема без приставок');
eq('Re снимается', normalizeSubject('Re: Заявка'), 'заявка');
eq('Fwd снимается', normalizeSubject('Fwd: Заявка'), 'заявка');
eq('русская приставка снимается', normalizeSubject('Ответ: Заявка'), 'заявка');
eq('несколько приставок подряд', normalizeSubject('Re: Fwd: Ответ: Заявка'), 'заявка');
eq('приставка с номером', normalizeSubject('RE[2]: Заявка'), 'заявка');
eq('лишние пробелы схлопываются', normalizeSubject('Re:   Заявка   на   насос'), 'заявка на насос');
eq('слово Response внутри темы не режется', normalizeSubject('Resource на складе'), 'resource на складе');

console.log('\n6. References');
eq('разбор ссылок', parseRefs('<a@x> <b@x>'), ['<a@x>', '<b@x>']);
eq('мусор без углов отбрасывается', parseRefs('a@x <b@x>'), ['<b@x>']);

console.log('\n7. Ключ цепочки');
const base = { sentAt: '2026-08-20T10:00:00Z' };
eq('корень берётся из первой ссылки',
  threadKeyOf({ ...base, messageId: '<c@x>', inReplyTo: '<b@x>', refs: '<a@x> <b@x>', subject: 'Re: Тема' }),
  '<a@x>');
eq('без References берём In-Reply-To',
  threadKeyOf({ ...base, messageId: '<c@x>', inReplyTo: '<b@x>', refs: '', subject: 'Re: Тема' }),
  '<b@x>');
eq('совсем без ссылок — по теме',
  threadKeyOf({ ...base, messageId: '<c@x>', inReplyTo: '', refs: '', subject: 'Заявка' }).startsWith('subj:'),
  true);
eq('одинаковая тема в одну неделю — одна цепочка',
  threadKeyOf({ messageId: '<1@x>', inReplyTo: '', refs: '', subject: 'Заявка', sentAt: '2026-08-20T10:00:00Z' })
  === threadKeyOf({ messageId: '<2@x>', inReplyTo: '', refs: '', subject: 'Re: Заявка', sentAt: '2026-08-21T10:00:00Z' }),
  true);
eq('та же тема через год — разные цепочки',
  threadKeyOf({ messageId: '<1@x>', inReplyTo: '', refs: '', subject: 'Заявка', sentAt: '2025-01-10T10:00:00Z' })
  === threadKeyOf({ messageId: '<2@x>', inReplyTo: '', refs: '', subject: 'Заявка', sentAt: '2026-08-20T10:00:00Z' }),
  false);

console.log('\n8. Пачка писем');
const chain = assignThreadKeys([
  { messageId: '<c@x>', inReplyTo: '<b@x>', refs: '<b@x>', subject: 'Re: Re: Тема', sentAt: '2026-08-20T12:00:00Z' },
  { messageId: '<a@x>', inReplyTo: '', refs: '', subject: 'Тема', sentAt: '2026-08-20T10:00:00Z' },
  { messageId: '<b@x>', inReplyTo: '<a@x>', refs: '<a@x>', subject: 'Re: Тема', sentAt: '2026-08-20T11:00:00Z' },
]);
eq('вся переписка в одной цепочке', new Set(chain.map((m) => m.threadKey)).size, 1);
eq('порядок в пачке не важен — ответ пришёл раньше предка',
  new Set(assignThreadKeys([
    { messageId: '<b@x>', inReplyTo: '<a@x>', refs: '<a@x>', subject: 'Re: Тема', sentAt: '2026-08-20T11:00:00Z' },
    { messageId: '<a@x>', inReplyTo: '', refs: '', subject: 'Тема', sentAt: '2026-08-20T10:00:00Z' },
  ]).map((m) => m.threadKey)).size,
  1);
eq('чужая переписка не приклеивается',
  new Set(assignThreadKeys([
    { messageId: '<a@x>', inReplyTo: '', refs: '', subject: 'Тема', sentAt: '2026-08-20T10:00:00Z' },
    { messageId: '<z@x>', inReplyTo: '', refs: '', subject: 'Другая тема', sentAt: '2026-08-20T10:05:00Z' },
  ]).map((m) => m.threadKey)).size,
  2);

console.log('\n9. Подпись цепочки');
eq('один собеседник', threadParticipants(['Смирнов']), 'Смирнов');
eq('«вы» уходит в конец', threadParticipants(['вы', 'Смирнов']), 'Смирнов, вы');
eq('повторы не дублируются', threadParticipants(['Смирнов', 'Смирнов', 'вы']), 'Смирнов, вы');
eq('длинный список сокращается', threadParticipants(['А', 'Б', 'В', 'Г', 'вы']), 'А, .., вы');

console.log('\n10. Тело письма: что считаем безопасным');
eq('обычная ссылка проходит', isSafeUrl('https://example.ru/a'), true);
eq('mailto проходит', isSafeUrl('mailto:a@ex.ru'), true);
eq('javascript: не проходит', isSafeUrl('javascript:alert(1)'), false);
eq('javascript с пробелами не проходит', isSafeUrl('java script:alert(1)'), false);
eq('javascript в верхнем регистре не проходит', isSafeUrl('JaVaScRiPt:alert(1)'), false);
eq('data:text/html не проходит', isSafeUrl('data:text/html;base64,PHNjcmlwdD4='), false);
eq('vbscript не проходит', isSafeUrl('vbscript:msgbox'), false);
eq('файловая схема не проходит', isSafeUrl('file:///etc/passwd'), false);
eq('якорь внутри письма проходит', isSafeUrl('#верх'), true);

console.log('\n11. Картинки');
eq('внешняя картинка распознана', isRemoteImage('https://следилка.ру/pixel.gif'), true);
eq('картинка без схемы тоже внешняя', isRemoteImage('//следилка.ру/p.gif'), true);
eq('вложенная картинка не внешняя', isRemoteImage('cid:logo@mail'), false);
eq('data-картинка не внешняя', isRemoteImage('data:image/png;base64,iVBOR'), false);
eq('cid разбирается', cidOf('cid:<logo@mail>'), 'logo@mail');
eq('не cid даёт пустоту', cidOf('https://ex.ru/a.png'), '');

console.log('\n12. Простой текст в разметку');
eq('угловые скобки экранируются', textToHtml('<script>').includes('&lt;script&gt;'), true);
eq('скрипт не остаётся тегом', textToHtml('<script>alert(1)</script>').includes('<script'), false);
eq('ссылка становится ссылкой', textToHtml('см. https://ex.ru/a').includes('href="https://ex.ru/a"'), true);
eq('ссылка открывается снаружи', textToHtml('https://ex.ru').includes('rel="noopener noreferrer nofollow"'), true);
eq('перенос строки сохраняется', textToHtml('раз\nдва').includes('<br>'), true);
eq('цитата становится цитатой', textToHtml('> так писали раньше').includes('<blockquote>'), true);

console.log('\n13. Политика содержимого для окна письма');
const strict = mailFrameDoc('<p>тело</p>', { allowRemoteImages: false, dark: false });
eq('всё запрещено по умолчанию', strict.includes("default-src 'none'"), true);
eq('внешние картинки закрыты', strict.includes("img-src 'self' data: blob:;"), true);
eq('скрипты не разрешены нигде', /script-src/.test(strict), false);
const loose = mailFrameDoc('<p>тело</p>', { allowRemoteImages: true, dark: true });
eq('по кнопке картинки открываются', loose.includes('img-src * data: blob:;'), true);
eq('и только картинки', loose.includes("default-src 'none'"), true);

console.log('\n14. Отправка: разбор получателей');
eq('простой список', splitAddrs('a@x.ru, b@y.ru'), ['a@x.ru', 'b@y.ru']);
eq('точка с запятой тоже разделяет', splitAddrs('a@x.ru; b@y.ru'), ['a@x.ru', 'b@y.ru']);
// Запятая внутри имени — то, на чём ломается наивное split(',')
eq('запятая в имени не разрывает адрес',
  splitAddrs('"Иванов, Иван" <i@x.ru>, b@y.ru'),
  ['"Иванов, Иван" <i@x.ru>', 'b@y.ru']);
eq('мусор без собаки отбрасывается', splitAddrs('иванов, b@y.ru'), ['b@y.ru']);
eq('пустая строка — пустой список', splitAddrs(''), []);

console.log('\n15. Тема ответа и пересылки');
eq('Re: добавляется', replySubject('Замечания'), 'Re: Замечания');
// Иначе выходит «Re: Re: Re: Re: Замечания» — так растёт тема в переписке
eq('второе Re: не добавляется', replySubject('Re: Замечания'), 'Re: Замечания');
eq('регистр не важен', replySubject('RE: Замечания'), 'RE: Замечания');
eq('Fwd: добавляется', forwardSubject('Смета'), 'Fwd: Смета');
eq('второе Fwd: не добавляется', forwardSubject('Fwd: Смета'), 'Fwd: Смета');
eq('Fw: тоже считается пересылкой', forwardSubject('Fw: Смета'), 'Fw: Смета');

console.log('\n16. Картинки подписи уходят частями письма');
const found: string[] = [];
const one = inlineImages(
  '<p>С уважением</p><img src="/mail_sig/abc123/logo.png" width="180">',
  (id) => { found.push(id); return { fileName: 'logo.png', filePath: '/tmp/logo.png', mimeType: 'image/png' }; },
);
eq('картинка нашлась по ссылке', found, ['abc123']);
// Ссылка на наш сервер снаружи не откроется — в письме должен быть cid:
eq('ссылка заменена на cid', one.html.includes('src="cid:sig-abc123@flux"'), true);
eq('в письме не осталось нашего адреса', one.html.includes('/mail_sig/'), false);
eq('часть письма собрана', one.parts.length, 1);
eq('и у неё тот же Content-ID', one.parts[0].cid, 'sig-abc123@flux');

const twice = inlineImages(
  '<img src="/mail_sig/aabbccdd/l.png"><img src="/mail_sig/aabbccdd/l.png">',
  () => ({ fileName: 'l.png', filePath: '/tmp/l.png', mimeType: 'image/png' }),
);
eq('одна картинка дважды — одна часть письма', twice.parts.length, 1);

const foreign = inlineImages('<img src="https://чужой.ру/pixel.gif">', () => null);
eq('чужие ссылки не трогаем', foreign.html.includes('https://чужой.ру/pixel.gif'), true);
eq('и во вложения их не тянем', foreign.parts.length, 0);

console.log('\n17. Текстовый вариант письма');
eq('теги убраны', htmlToText('<p>Здравствуйте</p>'), 'Здравствуйте');
eq('перенос строки из <br>', htmlToText('раз<br>два'), 'раз\nдва');
eq('стили выкидываются целиком', htmlToText('<style>p{color:red}</style><p>текст</p>'), 'текст');
eq('мнемоники разворачиваются', htmlToText('<p>&lt;тег&gt;</p>'), '<тег>');

console.log('\n18. Отказ SMTP по-русски');
eq('неверный пароль объясняется',
  explainSmtp({ code: 'EAUTH', response: '535 Authentication failed' }).includes('пароль приложения'), true);
eq('закрытый порт объясняется',
  explainSmtp({ code: 'ETIMEDOUT' }).includes('не отвечает'), true);
eq('чужой отказ не теряется',
  explainSmtp({ message: 'Что-то своё' }), 'Что-то своё');

console.log('\n19. Ключ письма переживает пересинхронизацию');
// Наши id создаются заново при смене uidValidity — личные отметки прочтения
// в общем ящике слетали бы вместе с ними
eq('берётся Message-ID', msgKeyOf({ messageId: '<a@b>', id: 'uuid-1' }), '<a@b>');
eq('без Message-ID — свой ключ', msgKeyOf({ messageId: '', id: 'uuid-1' }), 'local:uuid-1');
eq('null тоже считается пустым', msgKeyOf({ messageId: null, id: 'uuid-2' }), 'local:uuid-2');

console.log(`\n${ok} проверок пройдено, ${fail} провалено`);
process.exit(fail ? 1 : 0);
