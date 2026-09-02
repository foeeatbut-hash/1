/**
 * Проверки совместной работы в документе.
 *
 * Тут проверяется не «показались ли аватары», а единственное, что по-настоящему
 * дорого: не затирается ли чужая работа, когда связь оборвалась и вернулась.
 * Такую ошибку глазами не поймать — она выглядит как успешное сохранение.
 *
 * Запуск: npx tsx scripts/test-collab.ts
 */
import {
  normalizePeers, withSelection, coauthors, holdSave, afterReconnect, linkNote,
  initial, peersLabel, extraPeers, MAX_AVATARS, RESYNC_AFTER, type Peer,
} from '../src/lib/collab';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const peer = (socketId: string, name: string, userId = socketId): Peer =>
  ({ socketId, userId, name, color: '#111', selection: null });

console.log('Список участников');
{
  const roster = [
    { socketId: 's1', userId: 'u1', name: 'Петров', color: '#a00' },
    { socketId: 'me', userId: 'u0', name: 'Я', color: '#0a0' },
    { socketId: 's2', userId: 'u2', name: 'Иванов', color: '#00a' },
  ];
  const list = normalizePeers(roster, 'me');
  check('себя в списке нет', list.every((p) => p.socketId !== 'me'), list);
  check('порядок по имени, а не по приходу', list.map((p) => p.name).join(',') === 'Иванов,Петров', list.map((p) => p.name));

  const twice = normalizePeers([...roster, { socketId: 's1', userId: 'u1', name: 'Петров', color: '#a00' }], 'me');
  check('один сокет не считается дважды', twice.length === 2, twice.length);

  const junk = normalizePeers([null, 'мусор', { userId: 'u9' }, { socketId: 's9' }], 'me');
  check('запись без сокета отбрасывается', junk.length === 1, junk);
  check('участник без имени всё равно назван', junk[0].name === 'Сотрудник', junk[0]);
  check('участник без цвета получает цвет', !!junk[0].color, junk[0]);
  check('не список — пустой список', normalizePeers(undefined, 'me').length === 0);
}

console.log('Выделение участника');
{
  const list = [peer('s1', 'Иванов'), peer('s2', 'Петров')];
  const moved = withSelection(list, 's2', { row: 3, col: 4 });
  check('выделение попало тому, кому адресовано', (moved[1].selection as any)?.row === 3, moved[1]);
  check('соседа не задело', moved[0].selection === null, moved[0]);

  const ghost = withSelection(list, 's7', { row: 1, col: 1 });
  check('выделение от ушедшего не заводит участника', ghost.length === 2, ghost);
  check('ушедший не меняет список вовсе', ghost === list);
}

console.log('Сколько людей рядом');
{
  check('два окна одного человека — один человек',
    coauthors([peer('s1', 'Иванов', 'u1'), peer('s2', 'Иванов', 'u1')]) === 1);
  check('двое разных — двое', coauthors([peer('s1', 'Иванов', 'u1'), peer('s2', 'Петров', 'u2')]) === 2);
  check('никого — ноль', coauthors([]) === 0);
}

console.log('Обрыв связи');
{
  check('связь есть — сохраняем', !holdSave('live', 3));
  check('связи нет, но я один — сохраняем', !holdSave('lost', 0));
  check('связи нет и есть коллеги — останавливаемся', holdSave('lost', 1));
}

console.log('Возвращение связи');
{
  check('своё несохранённое — только через запись и разбор',
    afterReconnect(true, { at: 0, peers: 0 }) === 'resolve');
  check('своё несохранённое при коллегах — тоже запись, а не перечитывание',
    afterReconnect(true, { at: 0, peers: 2 }) === 'resolve');
  check('чужого не было и своего нет — работаем дальше',
    afterReconnect(false, null) === 'resume');
  check('коллеги были — перечитываем документ',
    afterReconnect(false, { at: 1000, peers: 1 }, 1200) === 'resync');
  check('рябь сети без коллег — ничего не делаем',
    afterReconnect(false, { at: 1000, peers: 0 }, 1200) === 'resume');
  check('долгое молчание без коллег — всё равно перечитываем',
    afterReconnect(false, { at: 1000, peers: 0 }, 1000 + RESYNC_AFTER) === 'resync');
}

console.log('Что сказано человеку');
{
  check('пока связь есть — молчим', linkNote('live', 2) === '');
  check('обрыв при коллегах объясняет последствие', linkNote('lost', 2).includes('не уходят'), linkNote('lost', 2));
  check('обрыв в одиночестве не пугает последствием', !linkNote('lost', 0).includes('не уходят'), linkNote('lost', 0));
}

console.log('Аватары');
{
  check('буква на аватаре заглавная', initial('иванов') === 'И');
  check('пустое имя не ломает аватар', initial('   ') === '?');
  const many = Array.from({ length: MAX_AVATARS + 2 }, (_, i) => peer(`s${i}`, `Имя${i}`));
  check('лишние считаются числом', extraPeers(many) === 2, extraPeers(many));
  check('когда все помещаются, лишних нет', extraPeers(many.slice(0, MAX_AVATARS)) === 0);
  check('подсказка перечисляет имена', peersLabel([peer('s1', 'Иванов')]) === 'В документе: Иванов');
  check('одно имя дважды не повторяется',
    peersLabel([peer('s1', 'Иванов', 'u1'), peer('s2', 'Иванов', 'u1')]) === 'В документе: Иванов');
  check('без участников подсказки нет', peersLabel([]) === '');
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки совместной работы пройдены');
