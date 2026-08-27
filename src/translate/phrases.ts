/**
 * Узоры деловых писем.
 *
 * Деловая переписка на девять десятых состоит из готовых оборотов, и переводить
 * их пословно — значит получать «пожалуйста найдите приложенным». Узор ловит
 * оборот целиком и оставляет на месте только то, что в нём меняется: документ,
 * дату, номер.
 *
 * Узор сильнее словаря, но слабее памяти: если инженер уже переводил именно эту
 * строку, побеждает его перевод, а не наш оборот.
 */
import type { Lang } from './types';

interface Phrase {
  re: RegExp;
  out: string;
  /** Длина постоянной части: чем длиннее, тем точнее узор */
  weight: number;
}

/**
 * `please find attached {1}` → выражение с группой. Хвостовая точка и лишние
 * пробелы не должны мешать совпадению: письмо пишет человек, а не машина.
 */
function compile(block: string): Phrase[] {
  const out: Phrase[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 0) continue;
    const src = line.slice(0, at).trim();
    const dst = line.slice(at + 1).trim();
    if (!src || !dst) continue;
    const body = src
      .replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === '{' || ch === '}' ? ch : `\\${ch}`))
      .replace(/\s+/g, '\\s+')
      .replace(/\{(\d)\}/g, '(.+?)');
    out.push({
      re: new RegExp(`^\\s*${body}\\s*[.!,;]?\\s*$`, 'i'),
      out: dst,
      weight: src.replace(/\{\d\}/g, '').trim().length,
    });
  }
  // Точный оборот должен побеждать общий: «please find attached the {1}» стоит
  // раньше, чем «please find attached {1}», иначе артикль уедет в перевод
  return out.sort((a, b) => b.weight - a.weight);
}

const EN_RU = `
# ── Обращение и прощание ──
dear {1} = Уважаемый {1}
dear sirs = Уважаемые господа
hello = Здравствуйте
good morning = Доброе утро
good afternoon = Добрый день
best regards = С уважением
kind regards = С уважением
sincerely yours = С уважением
thank you = Спасибо
thank you very much = Большое спасибо
thank you in advance = Заранее благодарим
thanks for your reply = Спасибо за ответ
thank you for your prompt reply = Спасибо за быстрый ответ

# ── Вложения и передача ──
please find attached {1} = Во вложении {1}
please find attached the {1} = Во вложении {1}
attached please find {1} = Во вложении {1}
we are pleased to send you {1} = Направляем вам {1}
we hereby submit {1} = Настоящим направляем {1}
enclosed is {1} = Прилагается {1}
please see attached = Смотрите вложение
for your information = Для сведения
for your review = На рассмотрение
for your approval = На утверждение

# ── Просьбы ──
please confirm receipt = Просим подтвердить получение
please confirm receipt of this email = Просим подтвердить получение письма
please confirm = Просим подтвердить
please advise = Просим сообщить
please advise on {1} = Просим сообщить по {1}
please provide {1} = Просим предоставить {1}
please send us {1} = Просим выслать {1}
please review and comment = Просим рассмотреть и дать замечания
please review {1} = Просим рассмотреть {1}
please note that {1} = Обращаем внимание: {1}
please be informed that {1} = Сообщаем, что {1}
please clarify {1} = Просим уточнить {1}
kindly revert = Просим ответить
we kindly ask you to {1} = Просим вас {1}
could you please {1} = Не могли бы вы {1}
we would appreciate {1} = Будем признательны за {1}
we look forward to your reply = Ждём вашего ответа
awaiting your confirmation = Ожидаем подтверждения

# ── Сроки ──
as soon as possible = Как можно скорее
at your earliest convenience = В ближайшее возможное время
by end of week = До конца недели
by {1} = До {1}
no later than {1} = Не позднее {1}
the deadline is {1} = Срок — {1}
this is urgent = Это срочно
we are still waiting for {1} = Мы всё ещё ждём {1}
the document is overdue = Документ просрочен

# ── Замечания и статусы ──
approved = Утверждено
approved with comments = Утверждено с замечаниями
not approved = Не утверждено
rejected = Отклонено
revise and resubmit = Доработать и выпустить повторно
please find our comments below = Наши замечания ниже
we have no comments = Замечаний нет
we confirm receipt of {1} = Подтверждаем получение {1}
we acknowledge receipt = Получение подтверждаем
the revision {1} is issued = Выпущена ревизия {1}
`;

const RU_EN = `
# ── Обращение и прощание ──
Уважаемый {1} = Dear {1}
Уважаемые господа = Dear Sirs
Здравствуйте = Hello
Добрый день = Good afternoon
С уважением = Best regards
Спасибо = Thank you
Заранее благодарим = Thank you in advance
Спасибо за ответ = Thank you for your reply

# ── Вложения и передача ──
Во вложении {1} = Please find attached {1}
Направляем вам {1} = We are pleased to send you {1}
Настоящим направляем {1} = We hereby submit {1}
Прилагается {1} = Enclosed is {1}
Смотрите вложение = Please see attached
Для сведения = For your information
На рассмотрение = For your review
На утверждение = For your approval

# ── Просьбы ──
Просим подтвердить получение = Please confirm receipt
Просим подтвердить = Please confirm
Просим сообщить = Please advise
Просим предоставить {1} = Please provide {1}
Просим выслать {1} = Please send us {1}
Просим рассмотреть {1} = Please review {1}
Просим рассмотреть и дать замечания = Please review and comment
Просим уточнить {1} = Please clarify {1}
Обращаем внимание: {1} = Please note that {1}
Сообщаем, что {1} = Please be informed that {1}
Будем признательны за {1} = We would appreciate {1}
Ждём вашего ответа = We look forward to your reply

# ── Сроки ──
Как можно скорее = As soon as possible
Не позднее {1} = No later than {1}
До конца недели = By end of week
Срок — {1} = The deadline is {1}
Это срочно = This is urgent

# ── Замечания и статусы ──
Утверждено = Approved
Утверждено с замечаниями = Approved with comments
Не утверждено = Not approved
Отклонено = Rejected
Замечаний нет = We have no comments
Подтверждаем получение {1} = We confirm receipt of {1}
Выпущена ревизия {1} = The revision {1} is issued
`;

const TABLE: Record<string, Phrase[]> = {
  'en>ru': compile(EN_RU),
  'ru>en': compile(RU_EN),
};

/**
 * Перевести сегмент узором. Возвращает null, если ни один не подошёл, — и это
 * нормальный, самый частый исход: узоры покрывают обвязку письма, а не его суть.
 */
export function byPhrase(
  text: string,
  from: Lang,
  to: Lang,
  /**
   * Чем перевести переменную часть узора. Без этого «we kindly ask you to
   * provide your comments» превращалось в «Просим вас provide your comments»:
   * оборот переведён, а то, о чём просят, — нет. Именно эта половина и нужна.
   */
  part?: (text: string) => string,
): string | null {
  const list = TABLE[`${from}>${to}`];
  if (!list) return null;
  for (const p of list) {
    const m = text.match(p.re);
    if (!m) continue;
    return p.out.replace(/\{(\d)\}/g, (whole, n) => {
      const got = m[Number(n)];
      if (got === undefined) return whole;
      const inner = got.trim();
      return part ? (part(inner) || inner) : inner;
    });
  }
  return null;
}

/** Сколько узоров знает программа — показываем в настройках честным числом */
export function phraseCount(): number {
  return TABLE['en>ru'].length + TABLE['ru>en'].length;
}
