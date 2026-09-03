/**
 * Подпись на документе: строка под росчерком и место на листе.
 *
 * Проверка написана по жалобе «подписи не работают». Работать им было негде:
 * подпись сохранялась в профиль и на этом кончалась. Самое хрупкое место
 * нового штампа — перевод размеров: подпись хранится высотой в МИЛЛИМЕТРАХ
 * (чтобы не зависеть от разрешения скана), а пометки на чертеже живут в долях
 * страницы. На A1 и на A4 одна и та же доля даёт разный размер, и ошибка здесь
 * видна только на печати, когда переделывать поздно.
 *
 * Запуск: npx tsx scripts/test-sign-stamp.ts
 */
import { signCaption, signBox, CAPTION_PART, DEFAULT_AT, NO_SIGNATURE } from '../src/lib/signStamp';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const when = new Date(2026, 8, 3); // 3 сентября 2026

console.log('Строка под подписью');
{
  const line = signCaption(
    { lastName: 'Раупов', firstName: 'Хусрав', middleName: 'Хусравович', position: 'Инженер ОВиК' }, when);
  // Инициалы слитно и с неразрывным пробелом после фамилии — «Раупов Х.Х.»
  check('фамилия с инициалами', line.includes('Раупов\u00A0Х.Х.'), line);
  check('должность на месте', line.includes('Инженер ОВиК'), line);
  check('дата подписания', line.includes('03.09.2026'), line);

  // Должности может не быть — тогда и разделителя быть не должно
  const noPos = signCaption({ lastName: 'Раупов', firstName: 'Хусрав' }, when);
  check('без должности нет пустого разделителя', !noPos.includes('·  ·') && !/·\s*$/.test(noPos), noPos);

  // Профиль, заведённый до раздельного хранения ФИО
  const old = signCaption({ name: 'Иванов Иван Иванович' }, when);
  check('единая строка ФИО тоже разбирается', old.includes('Иванов\u00A0И.И.'), old);
}

console.log('Место на листе');
{
  const a4 = signBox(8, DEFAULT_AT, { wMm: 210, hMm: 297 });
  const a1 = signBox(8, DEFAULT_AT, { wMm: 594, hMm: 841 });
  check('на A4 подпись занимает заметную долю ширины', a4.w > 0.15, a4);
  // Тот же росчерк на большом листе — меньшая доля. Если бы доля не менялась,
  // на A1 подпись вышла бы в три раза крупнее, чем человек её завёл
  check('на A1 доля меньше, чем на A4', a1.w < a4.w, { a1: a1.w, a4: a4.w });
  check('и высота тоже меньше', a1.h < a4.h, { a1: a1.h, a4: a4.h });

  const big = signBox(20, DEFAULT_AT, { wMm: 210, hMm: 297 });
  check('подпись выше — и место больше', big.h > a4.h, { big: big.h, a4: a4.h });
}

console.log('Штамп не вылезает за лист');
{
  const corner = signBox(8, { x: 0.99, y: 0.99 }, { wMm: 210, hMm: 297 });
  check('правый край внутри листа', corner.x + corner.w <= 1.0001, corner);
  check('нижний край внутри листа', corner.y + corner.h <= 1.0001, corner);
  const neg = signBox(8, { x: -1, y: -1 }, { wMm: 210, hMm: 297 });
  check('отрицательное место подтянуто к краю', neg.x >= 0 && neg.y >= 0, neg);
}

console.log('Странные значения не роняют штамп');
{
  const zero = signBox(0, DEFAULT_AT);
  check('нулевая высота даёт видимый штамп', zero.h > 0 && zero.w > 0, zero);
  const huge = signBox(1000, DEFAULT_AT);
  check('великанская высота ограничена листом', huge.h <= 0.5 && huge.w <= 0.9, huge);
  const unknown = signBox(8, DEFAULT_AT, {});
  const a4 = signBox(8, DEFAULT_AT, { wMm: 210, hMm: 297 });
  check('неизвестный лист считается как A4', unknown.w === a4.w && unknown.h === a4.h, { unknown, a4 });
}

console.log('Место под строку');
{
  check('строка занимает часть штампа, а не весь', CAPTION_PART > 0 && CAPTION_PART < 0.6, CAPTION_PART);
}

console.log('Когда подписи нет');
{
  // Молчание здесь хуже отказа: человек нажал и решил, что сломана программа
  check('человеку сказано, где завести подпись', NO_SIGNATURE.includes('профил'), NO_SIGNATURE);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки подписи на документе пройдены');
