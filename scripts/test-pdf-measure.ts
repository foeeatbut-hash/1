/**
 * Измерения по чертежу.
 *
 * Три ошибки, которых здесь боятся, и все три тихие — видно только неверное
 * число, которое человек перенесёт в расчёт:
 *
 *  • общий множитель вместо двух: лист не квадратный, и по вертикали ошибка
 *    другая, чем по горизонтали;
 *  • забытый масштаб: 1:100 и 1:1 дают одинаковый ответ;
 *  • масштаб в площади не в квадрате — число меньше настоящего в сто раз.
 *
 * Запуск: npx tsx scripts/test-pdf-measure.ts
 */
import {
  lengthMm, areaM2, lengthLabel, areaLabel, scaleLabel, measureLabel, PT_TO_MM,
} from '../src/lib/pdfMeasure';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};
const near = (a: number, b: number, eps = 0.51) => Math.abs(a - b) <= eps;

// A4 книжной: 210 × 297 мм
const a4 = (scale: number) => ({ wMm: 210, hMm: 297, scale });

console.log('Длина');
{
  // Половина ширины листа в натуральную величину — это 105 мм
  check('по горизонтали', near(lengthMm(0.5, 0, a4(1)), 105), lengthMm(0.5, 0, a4(1)));
  // Половина ВЫСОТЫ — это 148.5 мм, а не 105: лист не квадратный
  check('по вертикали считается по высоте листа',
    near(lengthMm(0, 0.5, a4(1)), 148.5), lengthMm(0, 0.5, a4(1)));

  // Прямоугольный треугольник 3-4-5 в миллиметрах листа
  const dx = 30 / 210, dy = 40 / 297;
  check('по диагонали — теорема Пифагора', near(lengthMm(dx, dy, a4(1)), 50), lengthMm(dx, dy, a4(1)));

  // Забытый масштаб — самая дорогая ошибка: число «правильное», но не про то
  check('масштаб 1:50 увеличивает в 50 раз',
    near(lengthMm(0.5, 0, a4(50)), 105 * 50, 1), lengthMm(0.5, 0, a4(50)));
  check('масштаб 1:1 ничего не меняет', near(lengthMm(0.5, 0, a4(1)), 105));
  check('нулевой масштаб считается как 1:1', near(lengthMm(0.5, 0, a4(0)), 105));
}

console.log('Площадь');
{
  // Весь лист A4 в натуральную величину: 0.210 × 0.297 = 0.06237 м²
  check('лист целиком', near(areaM2(1, 1, a4(1)), 0.06237, 0.0001), areaM2(1, 1, a4(1)));

  // Масштаб входит В КВАДРАТЕ. Забудешь — ошибёшься в сто раз и не заметишь
  check('масштаб 1:10 даёт площадь в сто раз больше',
    near(areaM2(1, 1, a4(10)) / areaM2(1, 1, a4(1)), 100, 0.01),
    areaM2(1, 1, a4(10)) / areaM2(1, 1, a4(1)));

  check('отрицательные стороны — та же площадь', near(areaM2(-0.5, -0.5, a4(1)), areaM2(0.5, 0.5, a4(1)), 1e-9));
}

console.log('Число человеку');
{
  check('до метра — миллиметры', lengthLabel(105) === '105 мм', lengthLabel(105));
  check('дальше метры', lengthLabel(5250) === '5.25 м', lengthLabel(5250));
  check('крупное — без лишних цифр', lengthLabel(52500) === '52.5 м', lengthLabel(52500));
  check('мусор не печатается числом', lengthLabel(NaN) === '—');
  check('маленькая площадь — в мм²', areaLabel(0.0005).includes('мм²'), areaLabel(0.0005));
  check('обычная — в м²', areaLabel(12.34) === '12.3 м²', areaLabel(12.34));
}

console.log('Подпись масштаба');
{
  check('1:1 назван словами', scaleLabel(1).includes('натуральная'), scaleLabel(1));
  check('обычный масштаб как в штампе', scaleLabel(50) === '1:50');
}

console.log('Когда лист не измерен');
{
  // Число из ниоткуда хуже отказа: человек перенесёт его в расчёт
  check('говорим, что мерить нечем',
    measureLabel('length', { dx: 0.5, dy: 0 }, null).includes('неизвест'),
    measureLabel('length', { dx: 0.5, dy: 0 }, null));
  check('нулевой лист — тоже отказ',
    measureLabel('area', { dx: 1, dy: 1 }, { wMm: 0, hMm: 0, scale: 50 }).includes('неизвест'));
  check('с листом отвечает числом',
    measureLabel('length', { dx: 0.5, dy: 0 }, a4(1)) === '105 мм',
    measureLabel('length', { dx: 0.5, dy: 0 }, a4(1)));
}

console.log('Точки в миллиметры');
{
  // 595 точек — ширина A4 в ПДФ; должно выйти около 210 мм
  check('ширина A4 из точек', near(595 * PT_TO_MM, 210, 0.5), 595 * PT_TO_MM);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки измерений по чертежу пройдены');
