/**
 * Обмен памятью переводов: формат TMX.
 *
 * Зачем он нужен, если память и так лежит в базе программы. Затем, что она не
 * должна быть в ней заперта. TMX понимают все переводческие программы, и это
 * единственный способ отдать накопленное подрядчику-переводчику, забрать у него
 * готовое и не потерять его при переезде. Своего формата тут нет намеренно:
 * свой формат означал бы, что уйти нельзя.
 *
 * Разбор написан руками, а не через общий разборщик XML: TMX прост, а лишняя
 * зависимость в слое, который проверяется скриптом без браузера, дороже.
 */
import type { Lang, TmEntry } from './types';

const LANG_TAG: Record<string, Lang> = {
  ru: 'ru', 'ru-ru': 'ru', rus: 'ru',
  en: 'en', 'en-us': 'en', 'en-gb': 'en', eng: 'en',
  zh: 'zh', 'zh-cn': 'zh', 'zh-hans': 'zh', chi: 'zh',
};

function langOf(tag: string): Lang {
  const t = String(tag || '').toLowerCase();
  return LANG_TAG[t] || (LANG_TAG[t.split('-')[0]] || 'und');
}

function unescapeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function escapeXml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Прочитать TMX. Единица без нужной пары языков пропускается молча: чужие файлы
 * почти всегда содержат больше языков, чем нам надо, и падать на этом незачем.
 */
export function parseTmx(xml: string): TmEntry[] {
  const out: TmEntry[] = [];
  const text = String(xml || '');
  const tuRe = /<tu\b[^>]*>([\s\S]*?)<\/tu>/gi;
  const tuvRe = /<tuv\b([^>]*)>([\s\S]*?)<\/tuv>/gi;
  const segRe = /<seg\b[^>]*>([\s\S]*?)<\/seg>/i;
  let tu: RegExpExecArray | null;
  while ((tu = tuRe.exec(text))) {
    const byLang: { lang: Lang; seg: string }[] = [];
    tuvRe.lastIndex = 0;
    let tuv: RegExpExecArray | null;
    while ((tuv = tuvRe.exec(tu[1]))) {
      const attr = tuv[1] || '';
      const tag = (attr.match(/(?:xml:)?lang\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
      const seg = (tuv[2].match(segRe) || [])[1];
      if (seg === undefined) continue;
      const lang = langOf(tag);
      if (lang === 'und') continue;
      byLang.push({ lang, seg: unescapeXml(seg).trim() });
    }
    for (let i = 0; i < byLang.length; i++) {
      for (let j = 0; j < byLang.length; j++) {
        if (i === j) continue;
        const a = byLang[i]; const b = byLang[j];
        if (!a.seg || !b.seg || a.lang === b.lang) continue;
        out.push({ src: a.seg, dst: b.seg, from: a.lang, to: b.lang });
      }
    }
  }
  return out;
}

/**
 * Записать TMX. Пары складываются в одну единицу перевода на исходную строку:
 * так файл читается чужой программой как память, а не как список строк.
 */
export function buildTmx(entries: TmEntry[], tool = 'Flux'): string {
  const rows: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.src || !e.dst) continue;
    const key = `${e.from}>${e.to}>${e.src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(
      `    <tu>\n`
      + `      <tuv xml:lang="${e.from}"><seg>${escapeXml(e.src)}</seg></tuv>\n`
      + `      <tuv xml:lang="${e.to}"><seg>${escapeXml(e.dst)}</seg></tuv>\n`
      + `    </tu>`,
    );
  }
  const first = entries.find((e) => e.src && e.dst);
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<tmx version="1.4">\n`
    + `  <header creationtool="${escapeXml(tool)}" segtype="sentence" adminlang="ru" `
    + `srclang="${first?.from || 'ru'}" datatype="plaintext"/>\n`
    + `  <body>\n${rows.join('\n')}\n  </body>\n</tmx>\n`;
}
