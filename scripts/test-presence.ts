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


// ── Присутствие в общей базе ────────────────────────────────────────────────
// Добавлено по случаю у заказчика: в отделе база одна, а сервер у каждого свой,
// встроенный. Пока присутствие жило в памяти сервера, каждый сидел в своей
// комнате один и все были для него «не в сети». Теперь свежесть отметки решает
// всё, и числа здесь важнее кода.
import { isFresh, rosterOf, mergeLocal, BEAT_MS, FRESH_MS } from '../src/lib/presenceTime';

console.log('Свежесть отметки');
{
  const now = 1_700_000_000_000;
  check('только что отмеченный — в сети', isFresh(now - 1000, now));
  check('один пропущенный удар не гасит', isFresh(now - BEAT_MS - 500, now));
  check('два пропущенных подряд гасят', !isFresh(now - BEAT_MS * 3 - 1, now));
  check('срок свежести втрое больше удара', FRESH_MS === BEAT_MS * 3);
  check('отметки нет — не в сети', !isFresh(null, now) && !isFresh(undefined, now));
  check('мусор вместо времени не роняет проверку', !isFresh('не дата', now));
  check('строка времени понимается', isFresh(new Date(now - 1000).toISOString(), now));
  check('спешащие часы соседа не гасят человека', isFresh(now + 60_000, now));
}

console.log('Список из отметок базы');
{
  const now = 1_700_000_000_000;
  const r = rosterOf([
    { userId: 'a', at: now - 2000 },
    { userId: 'b', at: now - FRESH_MS - 1000 },
    { userId: '', at: now },
    { userId: 'c', at: 'не дата' },
  ], now);
  check('свежий попал в «в сети»', r.online.includes('a'), r.online);
  check('давний не попал', !r.online.includes('b'), r.online);
  check('про давнего известно, когда его видели', r.lastSeen.b === now - FRESH_MS - 1000);
  check('запись без человека отброшена', !r.online.includes(''), r.online);
  check('битое время не создаёт записи', !('c' in r.lastSeen), r.lastSeen);
  check('пустая база — пустой список', rosterOf([], now).online.length === 0);
}

console.log('Свои и чужие вместе');
{
  check('свои добавляются к тем, кто виден по базе',
    mergeLocal(['a'], ['b']).sort().join() === 'a,b');
  check('повтор не удваивает', mergeLocal(['a'], ['a']).join() === 'a');
  check('пустые не попадают', mergeLocal([], ['']).length === 0);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки присутствия пройдены');
