import { parseRuNumber, canonicalUnit, isPlainNumber, normalizeKey, wordStem } from '../server/normalize.js';
let f = 0;
const ok = (n: string, c: boolean, d?: any) => c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d) : ''));

console.log('1. parseRuNumber');
ok('«1 250,5» → 1250.5', parseRuNumber('1 250,5') === 1250.5);
ok('«1250 мм» → 1250', parseRuNumber('1250 мм') === 1250);
ok('число → как есть', parseRuNumber(500) === 500);
ok('«230/400 В» → 230 (первое)', parseRuNumber('230/400 В') === 230);
ok('«н/д» → null', parseRuNumber('н/д') === null);

console.log('2. isPlainNumber');
ok('«1250» plain', isPlainNumber('1250') === true);
ok('«1 250,5» plain', isPlainNumber('1 250,5') === true);
ok('«230/400» НЕ plain', isPlainNumber('230/400') === false);
ok('«АИР80» НЕ plain', isPlainNumber('АИР80') === false);

console.log('3. canonicalUnit');
ok('«м3/ч» → «м³/ч»', canonicalUnit('м3/ч') === 'м³/ч', canonicalUnit('м3/ч'));
ok('«m3/h» → «м³/ч»', canonicalUnit('m3/h') === 'м³/ч', canonicalUnit('m3/h'));
ok('«куб.м/ч» → «м³/ч»', canonicalUnit('куб.м/ч') === 'м³/ч', canonicalUnit('куб.м/ч'));
ok('«Pa» → «Па»', canonicalUnit('Pa') === 'Па', canonicalUnit('Pa'));
ok('«кпа» → «кПа» (НЕ конвертируется в Па)', canonicalUnit('кпа') === 'кПа');
ok('«kw» → «кВт»', canonicalUnit('kw') === 'кВт');
ok('«об/мин» → «об/мин»', canonicalUnit('об/мин') === 'об/мин');
ok('«дб(а)» → «дБ(А)»', canonicalUnit('дб(а)') === 'дБ(А)');
ok('незнакомая «попугаи» → как есть', canonicalUnit('попугаи') === 'попугаи');
ok('пустая → пустая', canonicalUnit('') === '');

console.log('4. wordStem / normalizeKey (похожесть ключей)');
ok('«воздуха»→«воздух»', wordStem('воздуха') === 'воздух', wordStem('воздуха'));
ok('«Расход воздуха» == «Воздуха расход»', normalizeKey('Расход воздуха') === normalizeKey('Воздуха расход'), [normalizeKey('Расход воздуха'), normalizeKey('Воздуха расход')]);

console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
process.exit(f === 0 ? 0 : 1);
