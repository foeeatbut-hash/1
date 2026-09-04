/**
 * Метки данных в документе: обновление и то, что человек правил руками.
 *
 * Проверка написана по жалобе «умные блоки не работают». Их было два: в
 * таблице — живая связь с данными проекта, в текстовом документе — вставка
 * готового значения ТЕКСТОМ. Шифр проекта в записке застывал, в ведомости жил,
 * и два документа расходились.
 *
 * Самое хрупкое место новой общей метки — обновление поверх текста, который
 * человек мог переписать. Затереть написанное нарочно хуже, чем не обновить:
 * поэтому «оторвавшаяся» метка обязана быть отдельным случаем, а не тихой
 * заменой.
 *
 * Запуск: npx tsx scripts/test-doc-labels.ts
 */
import {
  readLabels, labelTitle, planRefresh, applyRefresh, refreshReport, addLabel,
  type DocLabel,
} from '../src/lib/docLabels';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const label = (id: string, value: string, fn = 'project', args: string[] = ['code']): DocLabel =>
  ({ id, fn, args, value, title: labelTitle(fn, args) });

console.log('Чтение привязок');
{
  check('пусто читается как пусто', readLabels(null).labels.length === 0);
  check('мусор не роняет разбор', readLabels('{не json').labels.length === 0);
  check('чужое содержимое не выдаётся за метки', readLabels('{"importText":"привет"}').labels.length === 0);
  check('настоящие метки читаются',
    readLabels('{"schemaVersion":1,"labels":[{"id":"a"}]}').labels.length === 1);
}

console.log('Имя метки');
{
  check('поле проекта', labelTitle('project', ['code']).includes('Проект'));
  check('поле тега', labelTitle('tag', ['AHU-2', 'brand']).includes('AHU-2'));
  check('параметр назван полностью',
    labelTitle('param', ['AHU-2', 'Аэродинамика', 'Расход']).includes('Расход'));
  check('незнакомая функция не выдумывается', labelTitle('чтото', ['x']).includes('чтото'));
}

console.log('Что произойдёт при обновлении');
{
  const text = 'Шифр проекта: П-100. Заказчик: ООО «Ромашка».';
  const labels = [label('l1', 'П-100'), label('l2', 'ООО «Ромашка»', 'project', ['customer'])];

  const same = planRefresh(text, labels, { l1: 'П-100', l2: 'ООО «Ромашка»' });
  check('ничего не изменилось — и метки это знают', same.every((p) => p.state === 'same'), same.map((p) => p.state));

  const plan = planRefresh(text, labels, { l1: 'П-200', l2: 'ООО «Ромашка»' });
  check('изменившаяся метка помечена', plan[0].state === 'changed', plan[0]);
  check('неизменившаяся — нет', plan[1].state === 'same', plan[1]);

  const out = applyRefresh(text, plan);
  check('значение подставилось', out.text.includes('П-200'), out.text);
  check('соседний текст не тронут', out.text.includes('ООО «Ромашка»'));
  check('счётчик честный', out.changed === 1, out.changed);
}

console.log('Метку, которую переписали руками, не затираем');
{
  const text = 'Шифр проекта: уточняется у заказчика.';
  const labels = [label('l1', 'П-100')];
  const plan = planRefresh(text, labels, { l1: 'П-200' });
  check('метка признана оторвавшейся', plan[0].state === 'detached', plan[0]);

  const out = applyRefresh(text, plan);
  check('текст остался как был', out.text === text, out.text);
  check('и это не считается обновлением', out.changed === 0, out.changed);
  check('человеку про это сказано', refreshReport(plan).includes('оторвал'), refreshReport(plan));
}

console.log('Одинаковое значение в тексте встречается не только у метки');
{
  const text = 'Отдел ОВ. Шифр: ОВ. Примечание: ОВ.';
  const labels = [label('l1', 'ОВ', 'tag', ['AHU-2', 'department'])];
  const out = applyRefresh(text, planRefresh(text, labels, { l1: 'АТХ' }));
  // Заменяется одно вхождение: затирать все — значит переписать чужой текст
  check('заменено одно вхождение', out.text === 'Отдел АТХ. Шифр: ОВ. Примечание: ОВ.', out.text);
}

console.log('Итог словами');
{
  check('без меток так и сказано', refreshReport([]).includes('нет меток'));
  const plan = planRefresh('А', [label('l1', 'А')], { l1: 'А' });
  check('нечего обновлять — тоже ответ', refreshReport(plan).includes('уже с текущими'), refreshReport(plan));
}

console.log('Список меток документа');
{
  const one = addLabel({ schemaVersion: 1, labels: [] }, label('l1', 'А'));
  check('метка добавлена', one.labels.length === 1);
  const twice = addLabel(one, label('l1', 'Б'));
  check('повторная не двоится, а заменяет', twice.labels.length === 1 && twice.labels[0].value === 'Б', twice.labels);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки меток документа пройдены');
