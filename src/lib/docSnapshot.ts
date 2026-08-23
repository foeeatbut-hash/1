/**
 * Снапшот текстового документа: что в нём должно лежать, чтобы движок не
 * развалился на первой же вставке.
 *
 * Почему это отдельный модуль, а не пара строк в редакторе. Univer вставляет
 * колонтитул и таблицу операцией json1 `insert` по пути ['headers', id],
 * ['footers', id], ['tableSource', id]. Операция insert требует, чтобы
 * родительский объект уже существовал: если его нет, json1 бросает
 * «Cannot insert into missing item» прямо внутри мутации. Движок при загрузке
 * достраивает только часть контейнеров (normalizeData добавляет body, drawings
 * и drawingsOrder) — headers, footers и tableSource он не создаёт. Свой пустой
 * снапшот Univer отдаёт со всеми тремя, а наш их не имел: в программе нажатие
 * «верхний колонтитул» или «вставить таблицу» роняло правку, а вместе с ней и
 * вид документа — дальше каждая мутация падала уже в перестроении страницы
 * («Cannot set properties of undefined (setting 'parent')»).
 *
 * Поэтому контейнеры добавляются и новым документам, и всем открываемым: файлы,
 * созданные до этой правки, лежат в базе без них.
 */
import { FLAVOR_WORD, MARGIN_HEADER_PT } from './docExport';

/** Ссылки на колонтитулы в стиле документа — по ним движок ищет сегменты */
const HEADER_REFS = ['defaultHeaderId', 'firstPageHeaderId', 'evenPageHeaderId'];
const FOOTER_REFS = ['defaultFooterId', 'firstPageFooterId', 'evenPageFooterId'];

/**
 * Валидный пустой документ (форма тела — как в getEmptyHeaderFooterBody самого
 * Univer): без корректных body/paragraphs/sectionBreaks движок рисует пустую
 * страницу и сыплет ошибками getDataModel/dirty$
 */
export function emptyDocSnapshot(id: string, title: string): any {
  return normalizeDocSnapshot({
    id,
    title,
    body: {
      dataStream: '\r\n',
      textRuns: [],
      customBlocks: [],
      paragraphs: [{ startIndex: 0 }],
      sectionBreaks: [{ startIndex: 1 }],
    },
    documentStyle: {
      // Разбивка на страницы как в Ворде, а не бесконечная лента
      documentFlavor: FLAVOR_WORD,
      pageSize: { width: 595.3, height: 841.9 },  // А4 в pt
      pageOrient: 0,
      // Поля как у Ворда по умолчанию — 2,54 см. Прежние 45/50 pt (1,6/1,8 см)
      // делали лист непохожим на вордовский и расходились с печатью.
      marginTop: 72, marginBottom: 72, marginLeft: 72, marginRight: 72,
      marginHeader: MARGIN_HEADER_PT, marginFooter: MARGIN_HEADER_PT,
      // Шрифт документа по умолчанию: в КБ пишут Times New Roman 12,
      // а движок без этого ставит свой Arial 11
      textStyle: { ff: 'Times New Roman', fs: 12 },
    },
  });
}

/**
 * Достроить снапшот до того вида, который движок умеет менять.
 *
 * Меняет объект на месте и возвращает его же: вызывается сразу после
 * JSON.parse, копия тут была бы лишней. Пустой или битый снапшот не чинится —
 * такой случай вызывающий разбирает сам (создаёт документ заново).
 */
export function normalizeDocSnapshot(snap: any): any {
  if (!snap || typeof snap !== 'object') return snap;

  if (!snap.headers || typeof snap.headers !== 'object') snap.headers = {};
  if (!snap.footers || typeof snap.footers !== 'object') snap.footers = {};
  if (!snap.tableSource || typeof snap.tableSource !== 'object') snap.tableSource = {};
  if (!snap.drawings || typeof snap.drawings !== 'object') snap.drawings = {};
  if (!Array.isArray(snap.drawingsOrder)) snap.drawingsOrder = [];

  const style = snap.documentStyle;
  if (style && typeof style === 'object') {
    // Висячая ссылка: стиль документа называет колонтитул, а самого сегмента
    // нет. Так остались документы, где вставка колонтитула упала на половине —
    // движок при каждой правке пытается построить несуществующий сегмент и
    // падает. Ссылку убираем: колонтитула у документа и так не было, а без
    // ссылки документ снова открывается и правится.
    for (const [refs, box] of [[HEADER_REFS, snap.headers], [FOOTER_REFS, snap.footers]] as const) {
      for (const key of refs) {
        const id = style[key];
        if (typeof id === 'string' && !box[id]) delete style[key];
      }
    }
  }
  return snap;
}

/**
 * Есть ли в документе то, из-за чего движок упадёт при первой же правке.
 * Отдельно от починки — чтобы проверка могла показать, что именно было не так.
 */
export function docSnapshotProblems(snap: any): string[] {
  const bad: string[] = [];
  if (!snap || typeof snap !== 'object') return ['снапшота нет'];
  if (!snap.headers) bad.push('нет headers — не вставить верхний колонтитул');
  if (!snap.footers) bad.push('нет footers — не вставить нижний колонтитул');
  if (!snap.tableSource) bad.push('нет tableSource — не вставить таблицу');
  const style = snap.documentStyle || {};
  for (const [refs, box] of [[HEADER_REFS, snap.headers], [FOOTER_REFS, snap.footers]] as const) {
    for (const key of refs) {
      const id = style[key];
      if (typeof id === 'string' && !(box || {})[id]) bad.push(`${key} ссылается на несуществующий сегмент`);
    }
  }
  return bad;
}
