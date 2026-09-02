/**
 * Проверки присутствия: кто в сети.
 *
 * Ошибка здесь не падает и не мигает — она врёт. Человек видит зелёную точку у
 * того, кто ушёл час назад, пишет ему и ждёт ответа; или наоборот, не видит
 * точки у того, кто сидит рядом. Поэтому счёт сокетов, подпись «был(а)…» и
 * поведение при обрыве связи проверяются отдельно от разметки.
 *
 * Запуск: npx tsx scripts/test-presence.ts
 */
import { readFileSync } from 'fs';
import { usePresenceStore, presenceLabel } from '../src/store/presenceStore';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const st = () => usePresenceStore.getState();

console.log('Список присутствия');
{
  st().setList(['u1', 'u2', 'u1'], { u3: 1000 });
  check('повторы схлопываются', st().online.length === 2, st().online);
  check('в сети — те, кого прислали', st().isOnline('u1') && st().isOnline('u2'));
  check('остальные не в сети', !st().isOnline('u3'));
  check('когда видели — запомнено', st().seenAt('u3') === 1000);
  check('пустой идентификатор никогда не в сети', !st().isOnline(''));

  st().setOnline('u3');
  check('пришедший добавился', st().isOnline('u3'));
  st().setOnline('u3');
  check('повторное появление не задваивает', st().online.filter((x) => x === 'u3').length === 1);

  st().setOffline('u1', 5000);
  check('ушедший убран из списка', !st().isOnline('u1'));
  check('время ухода записано', st().seenAt('u1') === 5000);
}

console.log('Обрыв связи');
{
  st().setList(['u1', 'u2'], {});
  st().reset();
  check('без связи никто не показан в сети', st().online.length === 0);
  // «Был(а) в …» остаётся: это по-прежнему правда, в отличие от «в сети»
  check('прошлое присутствие не стёрто', st().seenAt('u1') === 5000);
}

console.log('Подпись под именем');
{
  const now = Date.parse('2026-09-02T12:00:00Z');
  check('в сети', presenceLabel(true, null, now) === 'в сети');
  check('неизвестно — не в сети, а не пусто', presenceLabel(false, null, now) === 'не в сети');
  check('только что', presenceLabel(false, now - 30_000, now) === 'был(а) только что');
  check('минуты', presenceLabel(false, now - 12 * 60_000, now) === 'был(а) 12 мин. назад');
  check('часы', presenceLabel(false, now - 3 * 3600_000, now) === 'был(а) 3 ч. назад');
  check('вчера', presenceLabel(false, now - 30 * 3600_000, now) === 'был(а) вчера');
  check('дни', presenceLabel(false, now - 3 * 24 * 3600_000, now) === 'был(а) 3 дн. назад');
  check('давно', presenceLabel(false, now - 40 * 24 * 3600_000, now) === 'давно не заходил(а)');
  check('точного времени не показываем нигде',
    !['12:00', '2026'].some((x) => presenceLabel(false, now - 60_000, now).includes(x)));
}

console.log('Сервер считает сокеты, а не людей');
{
  const src = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  check('присутствие ведётся по набору сокетов', /const online = new Map<string, Set<string>>\(\)/.test(src));
  check('появление объявляется только для первого сокета',
    /online\.set\(uid, new Set\(\[socket\.id\]\)\);\s*[\s\S]{0,400}?io\.emit\('presence:online'/.test(src));
  check('уход объявляется, когда ушёл последний сокет',
    /if \(set && set\.size === 0\)[\s\S]{0,200}?io\.emit\('presence:offline'/.test(src));
  check('вошедшему выдаётся весь список', /socket\.emit\('presence:list'/.test(src));
  check('администратор не исключён из присутствия',
    !/presence[\s\S]{0,200}role\s*!==?\s*'ADMIN'/.test(src));

  const chat = readFileSync(new URL('../src/screens/ChatManagement.tsx', import.meta.url), 'utf8');
  check('чат показывает присутствие', chat.includes('presenceLabel') && chat.includes('onlineIds'));
  const users = readFileSync(new URL('../src/screens/UsersManagement.tsx', import.meta.url), 'utf8');
  check('список сотрудников показывает присутствие', users.includes('onlineIds.includes(emp.id)'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки присутствия пройдены');
