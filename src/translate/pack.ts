/**
 * Словарный пакет: открытые данные рядом с программой.
 *
 * Написанный руками инженерный словарь покрывает термины, но не прозу: письмо
 * с «shall be confirmed» превращалось в «следует be confirmed». Общую лексику
 * взять неоткуда, кроме открытых источников, — и она едет отдельным файлом, а
 * не внутри программы.
 *
 * Отдельным файлом по трём причинам. Он весит мегабайт и не должен утяжелять
 * запуск. Он под чужой лицензией (CC BY-SA), и его надо уметь заменить или
 * убрать, не трогая программу. И он ниже всех в старшинстве: словарь проекта и
 * инженерный словарь всегда важнее — иначе общий словарь переименует «расход»
 * в «consumption» посреди ведомости.
 *
 * Сборка и происхождение — scripts/build-dict.ts и public/dict/SOURCES.md.
 */
import type { TermPair } from './types';

/** Адрес пакета относительно страницы: программа живёт и на file://, и на localhost */
export const PACK_URL = 'dict/ru-en.tsv.gz';

export interface PackInfo {
  pairs: TermPair[];
  /** Сколько пар пришло из словаря и сколько из энциклопедии — видно в настройках */
  fromDict: number;
  fromWiki: number;
}

/**
 * Разбор пакета: `русское<таб>english<таб>источник`.
 *
 * Порядок строк — это порядок старшинства, а не алфавит: программа оставляет
 * первое занявшее ключ значение, и с русской стороны, и с английской. Поэтому
 * файл не переупорядочивают «для красоты».
 */
export function parsePack(text: string): PackInfo {
  const pairs: TermPair[] = [];
  let fromDict = 0;
  let fromWiki = 0;
  for (const line of String(text || '').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const ru = line.slice(0, tab).trim();
    const rest = line.slice(tab + 1);
    const tab2 = rest.indexOf('\t');
    const en = (tab2 < 0 ? rest : rest.slice(0, tab2)).trim();
    if (!ru || !en) continue;
    const src = tab2 < 0 ? '' : rest.slice(tab2 + 1).trim();
    if (src === 'wd') fromWiki++; else fromDict++;
    pairs.push({ ru, en });
  }
  return { pairs, fromDict, fromWiki };
}

/**
 * Прочитать пакет с диска программы. Ошибки не бросаются наружу: пакета может
 * не быть (его убрали, сборка без него), и это не повод ломать перевод —
 * программа просто работает своим словарём и говорит об этом в настройках.
 */
export async function loadPack(
  url: string = PACK_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<PackInfo | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok || !res.body) return null;
    const gz = /\.gz$/i.test(url);
    if (gz && typeof DecompressionStream === 'undefined') return null;
    const text = gz
      ? await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text()
      : await res.text();
    const info = parsePack(text);
    return info.pairs.length ? info : null;
  } catch (_) {
    return null;
  }
}
