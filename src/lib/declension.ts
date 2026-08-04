/**
 * Склонение ФИО по падежам.
 *
 * В документах фамилия и имя почти никогда не стоят в именительном падеже:
 * «от Раупова Х. Х.», «выдать Раупову Х. Х.», «подготовлено Рауповым Х. Х.».
 * Поэтому программа хранит ФИО по частям в именительном падеже и пол, а
 * нужную форму получает правилами — человеку не приходится вписывать одно
 * и то же имя пять раз.
 *
 * Правила покрывают обычные русские, тюркские и таджикские имена. Когда
 * уверенности нет (иностранная фамилия на гласную, женская на согласную),
 * слово остаётся без изменений: не склонить — простительно, исказить —
 * нет, потому что документ уходит заказчику.
 */

export type GrammCase = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'pre';
export type Gender = 'M' | 'F';

export interface NameParts {
  lastName?: string;
  firstName?: string;
  middleName?: string;
}

export const CASE_LABELS: { id: GrammCase; label: string; question: string }[] = [
  { id: 'nom', label: 'Именительный', question: 'кто?' },
  { id: 'gen', label: 'Родительный', question: 'кого?' },
  { id: 'dat', label: 'Дательный', question: 'кому?' },
  { id: 'acc', label: 'Винительный', question: 'кого?' },
  { id: 'ins', label: 'Творительный', question: 'кем?' },
  { id: 'pre', label: 'Предложный', question: 'о ком?' },
];

const VOWELS = 'аеёиоуыэюя';
const HUSH = 'жчшщ';        // после шипящих в творительном пишем «ем», а не «ом»
const VELAR = 'гкхжчшщ';    // после заднеязычных и шипящих «ы» переходит в «и»

const lower = (s: string) => s.toLowerCase();
const last = (s: string, n = 1) => lower(s).slice(-n);
const cut = (s: string, n: number) => s.slice(0, s.length - n);
const isVowel = (ch: string) => VOWELS.includes(lower(ch));

/** Слово неизменяемо: -о, -е, -у, -ю, -ы, -и, -ко, -енко, -ых, -их. */
function indeclinable(word: string, gender: Gender): boolean {
  const w = lower(word);
  if (w.length < 2) return true;
  if (/(ых|их|аго|ово|ко)$/.test(w)) return true;
  if (/[оеэуюы]$/.test(w)) return true;
  // Женская фамилия на согласный не склоняется: «у Марии Ким», «с Анной Шмидт»
  if (gender === 'F' && !isVowel(w.slice(-1)) && w.slice(-1) !== 'ь') return true;
  return false;
}

// ── Прилагательные-фамилии: Достоевский, Толстой, Синий, Донская ──
function adjectiveEnding(word: string, gender: Gender, c: GrammCase): string | null {
  const w = lower(word);
  if (gender === 'F') {
    if (/(ая)$/.test(w)) {
      const stem = cut(word, 2);
      return stem + ({ nom: 'ая', gen: 'ой', dat: 'ой', acc: 'ую', ins: 'ой', pre: 'ой' }[c]);
    }
    if (/(яя)$/.test(w)) {
      const stem = cut(word, 2);
      return stem + ({ nom: 'яя', gen: 'ей', dat: 'ей', acc: 'юю', ins: 'ей', pre: 'ей' }[c]);
    }
    return null;
  }
  if (/(ый|ой)$/.test(w)) {
    const stem = cut(word, 2);
    const nom = word.slice(-2);
    return stem + ({ nom, gen: 'ого', dat: 'ому', acc: 'ого', ins: 'ым', pre: 'ом' }[c]);
  }
  if (/(ий)$/.test(w)) {
    const stem = cut(word, 2);
    // Твёрдый вариант после заднеязычных и шипящих: Достоевский → Достоевского,
    // мягкий в остальных: Синий → Синего.
    const hard = VELAR.includes(last(stem));
    return stem + (hard
      ? ({ nom: 'ий', gen: 'ого', dat: 'ому', acc: 'ого', ins: 'им', pre: 'ом' }[c])
      : ({ nom: 'ий', gen: 'его', dat: 'ему', acc: 'его', ins: 'им', pre: 'ем' }[c]));
  }
  return null;
}

// ── Существительные 1 склонения: -а/-я (Глоба, Никита, Анна, Илья) ──
function firstDeclension(word: string, c: GrammCase): string {
  const w = lower(word);
  if (/ия$/.test(w)) {            // Мария, Наталия, Виктория
    const stem = cut(word, 1);    // «Мари»
    return stem + ({ nom: 'я', gen: 'и', dat: 'и', acc: 'ю', ins: 'ей', pre: 'и' }[c]);
  }
  if (/я$/.test(w)) {             // Илья, Наталья, Ксения
    const stem = cut(word, 1);
    return stem + ({ nom: 'я', gen: 'и', dat: 'е', acc: 'ю', ins: 'ей', pre: 'е' }[c]);
  }
  // -а: Анна, Ольга, Никита, Глоба
  const stem = cut(word, 1);
  const genEnding = VELAR.includes(last(stem)) ? 'и' : 'ы';   // Ольги, но Анны
  const insEnding = HUSH.includes(last(stem)) ? 'ей' : 'ой';  // Дашей, но Анной
  return stem + ({ nom: 'а', gen: genEnding, dat: 'е', acc: 'у', ins: insEnding, pre: 'е' }[c]);
}

// ── Существительные 2 склонения: мужские на согласный, -й, -ь ──
function secondDeclension(word: string, c: GrammCase): string {
  const w = lower(word);
  if (/й$/.test(w)) {             // Андрей, Сергей, Николай
    const stem = cut(word, 1);
    return stem + ({ nom: 'й', gen: 'я', dat: 'ю', acc: 'я', ins: 'ем', pre: 'е' }[c]);
  }
  if (/ь$/.test(w)) {             // Игорь, Виталь
    const stem = cut(word, 1);
    return stem + ({ nom: 'ь', gen: 'я', dat: 'ю', acc: 'я', ins: 'ем', pre: 'е' }[c]);
  }
  // На согласный: Иван, Хусрав, Кузнец, Ким
  const insEnding = HUSH.includes(last(word)) || last(word) === 'ц' ? 'ем' : 'ом';
  return word + ({ nom: '', gen: 'а', dat: 'у', acc: 'а', ins: insEnding, pre: 'е' }[c]);
}

/** Фамилия: Раупов → Раупова, Раупову, Рауповым, Раупове. */
export function declineLastName(name: string, gender: Gender, c: GrammCase): string {
  const word = (name || '').trim();
  if (!word || c === 'nom') return word;
  // Двойная фамилия склоняется по частям: Петров-Водкин → Петрова-Водкина
  if (word.includes('-')) {
    return word.split('-').map((part) => declineLastName(part, gender, c)).join('-');
  }
  if (indeclinable(word, gender)) return word;
  const w = lower(word);

  const adj = adjectiveEnding(word, gender, c);
  if (adj) return adj;

  if (gender === 'F') {
    // Иванова, Кузнецова, Гагарина — склоняются как прилагательные
    if (/(ова|ева|ёва|ина|ына)$/.test(w)) {
      const stem = cut(word, 1);
      return stem + ({ nom: 'а', gen: 'ой', dat: 'ой', acc: 'у', ins: 'ой', pre: 'ой' }[c]);
    }
    if (/[ая]$/.test(w)) return firstDeclension(word, c);
    return word;
  }

  // Мужские -ов/-ев/-ёв/-ин/-ын: смешанное склонение (тв. -ым, предл. -е)
  if (/(ов|ев|ёв|ин|ын)$/.test(w)) {
    return word + ({ nom: '', gen: 'а', dat: 'у', acc: 'а', ins: 'ым', pre: 'е' }[c]);
  }
  if (/[ая]$/.test(w)) return firstDeclension(word, c);
  return secondDeclension(word, c);
}

/** Имя: Хусрав → Хусрава, Мария → Марии, Андрей → Андрея. */
export function declineFirstName(name: string, gender: Gender, c: GrammCase): string {
  const word = (name || '').trim();
  if (!word || c === 'nom') return word;
  const w = lower(word);
  if (word.includes('-')) {
    return word.split('-').map((p) => declineFirstName(p, gender, c)).join('-');
  }
  if (gender === 'F') {
    if (/ь$/.test(w)) {
      // Любовь → Любови (беглая «о»), но творительный её сохраняет: Любовью.
      // Нинель → Нинели, Нинелью.
      if (c === 'acc') return word;
      if (/овь$/.test(w)) return c === 'ins' ? word + 'ю' : cut(word, 2) + 'ви';
      return cut(word, 1) + (c === 'ins' ? 'ью' : 'и');
    }
    if (/[ая]$/.test(w)) return firstDeclension(word, c);
    return word;                                  // Кармен, Джейн — не склоняем
  }
  if (/[ая]$/.test(w)) return firstDeclension(word, c);   // Никита, Илья
  if (/[оеуыэю]$/.test(w)) return word;                    // Отто, Леонардо
  return secondDeclension(word, c);
}

/** Отчество: Хусравович → Хусравовича; Хусравовна → Хусравовны. */
export function declineMiddleName(name: string, gender: Gender, c: GrammCase): string {
  const word = (name || '').trim();
  if (!word || c === 'nom') return word;
  const w = lower(word);
  if (gender === 'F') {
    if (/(овна|евна|ична|инична|кызы|қизи)$/.test(w)) {
      if (/(кызы|қизи)$/.test(w)) return word;    // тюркское «кызы» не склоняется
      const stem = cut(word, 1);
      const genEnding = VELAR.includes(last(stem)) ? 'и' : 'ы';
      return stem + ({ nom: 'а', gen: genEnding, dat: 'е', acc: 'у', ins: 'ой', pre: 'е' }[c]);
    }
    if (/[ая]$/.test(w)) return firstDeclension(word, c);
    return word;
  }
  if (/(углы|уулу|оглы)$/.test(w)) return word;   // тюркское «оглы» не склоняется
  if (/ич$/.test(w)) {
    return word + ({ nom: '', gen: 'а', dat: 'у', acc: 'а', ins: 'ем', pre: 'е' }[c]);
  }
  return secondDeclension(word, c);
}

/** «Раупов Хусрав Хусравович» в нужном падеже. */
export function declineFullName(parts: NameParts, gender: Gender, c: GrammCase): string {
  return [
    declineLastName(parts.lastName || '', gender, c),
    declineFirstName(parts.firstName || '', gender, c),
    declineMiddleName(parts.middleName || '', gender, c),
  ].filter(Boolean).join(' ').trim();
}

/** «Раупов Х. Х.» — для подписи в штампе. */
export function initials(parts: NameParts): string {
  const f = (parts.firstName || '').trim();
  const m = (parts.middleName || '').trim();
  const tail = [f, m].filter(Boolean).map((p) => `${p.charAt(0).toUpperCase()}.`).join(' ');
  return [(parts.lastName || '').trim(), tail].filter(Boolean).join(' ').trim();
}

/** «Раупова Х. Х.» — фамилия в падеже, инициалы не меняются. */
export function initialsDeclined(parts: NameParts, gender: Gender, c: GrammCase): string {
  return initials({ ...parts, lastName: declineLastName(parts.lastName || '', gender, c) });
}

/** «Х. Х. Раупов» — порядок для титульных листов. */
export function initialsFirst(parts: NameParts): string {
  const f = (parts.firstName || '').trim();
  const m = (parts.middleName || '').trim();
  const head = [f, m].filter(Boolean).map((p) => `${p.charAt(0).toUpperCase()}.`).join(' ');
  return [head, (parts.lastName || '').trim()].filter(Boolean).join(' ').trim();
}

/** Пол по отчеству — чтобы не заставлять выбирать вручную, когда и так ясно. */
export function guessGender(middleName?: string): Gender | null {
  const w = lower((middleName || '').trim());
  if (!w) return null;
  if (/(овна|евна|ична|инична|кызы|қизи)$/.test(w)) return 'F';
  if (/(ович|евич|ич|углы|уулу|оглы)$/.test(w)) return 'M';
  return null;
}

/** Полное ФИО одной строкой — то, что показываем в списках и шапке. */
export function fullNameOf(parts: NameParts): string {
  return [parts.lastName, parts.firstName, parts.middleName]
    .map((p) => (p || '').trim()).filter(Boolean).join(' ');
}

/**
 * Разбор старой единой строки ФИО на части. Нужен один раз — при переносе
 * баз, где ФИО хранилось как «Раупов Хусрав Хусравович». Порядок слов
 * считаем принятым в документах: фамилия, имя, отчество.
 */
export function splitFullName(full: string): NameParts & { gender: Gender | null } {
  const clean = String(full || '').replace(/\s*\(.*\)\s*$/, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const out: NameParts = {
    lastName: parts[0] || '',
    firstName: parts[1] || '',
    middleName: parts.slice(2).join(' ') || '',
  };
  return { ...out, gender: guessGender(out.middleName) };
}
