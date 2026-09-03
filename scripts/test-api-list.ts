/**
 * Список из ответа сервера достаётся, а раздел не падает.
 *
 * Проверка написана по поломке из отдела: раздел «Оборудование» уносило целиком
 * при открытии «Истории версий». Сервер отвечал `{ history: [...] }`, экран
 * клал в состояние весь объект и звал по нему `.map` — ошибка внутри отрисовки
 * снимает всё поддерево, и человек оставался с предложением «Перезапустить
 * раздел» вместо работы с оборудованием.
 *
 * Запуск: npx tsx scripts/test-api-list.ts
 */
import { listOf, fetchList } from '../src/lib/apiList';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Список из ответа');
{
  check('голый массив проходит как есть', listOf([1, 2, 3]).length === 3);
  check('обёртка с ожидаемым именем разворачивается',
    listOf({ history: [1, 2] }, 'history').length === 2, listOf({ history: [1, 2] }, 'history'));
  check('общепринятые обёртки этого кода тоже', listOf({ items: [1] }).length === 1);
  check('поле важнее общей обёртки',
    listOf({ items: [1], history: [1, 2] }, 'history').length === 2);
}

console.log('Ответ не по форме раздел не роняет');
{
  // Ровно то, что случилось в «Оборудовании»: в состояние попал объект
  const asState = listOf({ history: [{ id: 'a' }] });
  check('объект без нужного поля даёт пустой массив, а не объект', Array.isArray(asState) && asState.length === 0, asState);
  check('по нему можно звать map', typeof (asState as any).map === 'function');

  check('ошибка сервера вместо списка — пустой массив',
    listOf({ error: 'Не удалось' }).length === 0);
  check('null и строка тоже', listOf(null).length === 0 && listOf('нет' as unknown).length === 0);
  check('число не превращается в список', listOf(42 as unknown).length === 0);
}

(async () => {
  console.log('Ответ fetch');
  {
    const ok = new Response(JSON.stringify({ history: [1, 2, 3] }), { headers: { 'Content-Type': 'application/json' } });
    check('список берётся из тела ответа', (await fetchList(ok, 'history')).length === 3);

    // Сервер ответил 500 и текстом — раздел всё равно не должен падать
    const broken = new Response('<html>500</html>', { status: 500 });
    check('не-JSON не роняет разбор', (await fetchList(broken, 'history')).length === 0);
  }

  if (failed) {
    console.error(`\nПровалено проверок: ${failed}`);
    process.exit(1);
  }
  console.log('\nВсе проверки разбора списков пройдены');
})();
