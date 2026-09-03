/**
 * Проверки создания таблиц под три движка базы.
 *
 * Живой MariaDB в контейнере нет, а ошибка в диалекте не видна ничем: запрос
 * падает, ошибку глотают, таблицы нет — и раздел отвечает 500 у того
 * единственного заказчика, у кого общая база на MariaDB. Ровно так и вышло с
 * календарём. Поэтому SQL проверяется здесь, до того как его увидит база.
 *
 * Запуск: npx tsx scripts/test-ddl.ts
 */
import {
  createTableSql, createIndexSql, columnSql, dialectOf, isDuplicateIndex, type Col,
} from '../server/ddl';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const cols: Col[] = [
  { name: 'id', kind: 'text', pk: true },
  { name: 'projectId', kind: 'text', notNull: true, def: '', indexed: true },
  { name: 'title', kind: 'text', notNull: true, def: '' },
  { name: 'body', kind: 'longtext', notNull: true },
  { name: 'allDay', kind: 'bool', notNull: true, def: false },
  { name: 'remindMin', kind: 'int', notNull: true, def: 0 },
  { name: 'createdAt', kind: 'time', notNull: true, def: 'now' },
];

console.log('Определение движка по адресу');
{
  check('локальная база — SQLite', dialectOf('LOCAL', 'file:x.sqlite') === 'sqlite');
  check('mysql:// — MariaDB', dialectOf('REMOTE', 'mysql://u:p@h:3306/db') === 'mysql');
  check('mariadb:// — тоже MariaDB', dialectOf('REMOTE', 'mariadb://u:p@h:3306/db') === 'mysql');
  check('postgresql:// — PostgreSQL', dialectOf('REMOTE', 'postgresql://u:p@h/db') === 'postgresql');
  check('общий режим без адреса считается PostgreSQL', dialectOf('REMOTE', '') === 'postgresql');
}

console.log('Кавычки вокруг имён');
{
  const my = createTableSql('mysql', 'CalEvent', cols);
  const pg = createTableSql('postgresql', 'CalEvent', cols);
  check('у MySQL имена в обратных кавычках', my.includes('`CalEvent`'), my.slice(0, 60));
  check('у MySQL двойных кавычек нет вовсе', !my.includes('"'), my.slice(0, 120));
  check('у PostgreSQL имена в двойных кавычках', pg.includes('"CalEvent"'), pg.slice(0, 60));
}

console.log('Типы под движок');
{
  const my = createTableSql('mysql', 'T', cols);
  const pg = createTableSql('postgresql', 'T', cols);
  const lite = createTableSql('sqlite', 'T', cols);

  check('время у MySQL — DATETIME(3)', my.includes('DATETIME(3)'), my);
  check('время у PostgreSQL — TIMESTAMP(3)', pg.includes('TIMESTAMP(3)'), pg);
  // Смотрим объявление колонки, а не всю строку: CURRENT_TIMESTAMP в умолчании
  // содержит слово TIMESTAMP и делает поиск по подстроке бессмысленным
  check('время у SQLite — DATETIME',
    columnSql('sqlite', { name: 'a', kind: 'time' }) === '"a" DATETIME',
    columnSql('sqlite', { name: 'a', kind: 'time' }));

  check('да/нет у MySQL — TINYINT(1)', my.includes('TINYINT(1)'), my);
  check('да/нет у PostgreSQL — BOOLEAN', pg.includes('BOOLEAN'), pg);
  check('умолчание false у MySQL числом', my.includes('DEFAULT 0'), my);
  check('умолчание false у PostgreSQL словом', pg.includes('DEFAULT false'), pg);
}

console.log('Засады MySQL');
{
  const my = createTableSql('mysql', 'T', cols);
  check('первичный ключ не TEXT, а VARCHAR', /`id` VARCHAR\(191\) NOT NULL/.test(my), my);
  check('колонка под индексом — VARCHAR', /`projectId` VARCHAR\(191\)/.test(my), my);
  check('колонка с умолчанием — VARCHAR', /`title` VARCHAR\(191\)/.test(my), my);
  check('длинный текст остаётся LONGTEXT', my.includes('`body` LONGTEXT'), my);
  // Тоже по колонке, а не по всей таблице: в хвосте стоит DEFAULT CHARSET
  check('у длинного текста нет умолчания',
    columnSql('mysql', { name: 'body', kind: 'longtext', notNull: true, def: '' }) === '`body` LONGTEXT NOT NULL',
    columnSql('mysql', { name: 'body', kind: 'longtext', notNull: true, def: '' }));
  check('движок и кодировка заданы', my.includes('ENGINE=InnoDB') && my.includes('utf8mb4'), my.slice(-90));
  check('у PostgreSQL ничего про движок не пишется', !createTableSql('postgresql', 'T', cols).includes('ENGINE'));
}

console.log('Первичный ключ и NOT NULL');
{
  const pg = createTableSql('postgresql', 'T', cols);
  check('первичный ключ объявлен', pg.includes('PRIMARY KEY ("id")'), pg);
  check('ключ — NOT NULL', /"id" TEXT NOT NULL/.test(pg), pg);
  check('необязательная колонка без NOT NULL',
    columnSql('postgresql', { name: 'x', kind: 'text' }) === '"x" TEXT');
}

console.log('Значения по умолчанию с кавычками');
{
  const c: Col = { name: 'kind', kind: 'text', notNull: true, def: "мет'ка" };
  check('одинарная кавычка в умолчании экранируется',
    columnSql('postgresql', c).includes("'мет''ка'"), columnSql('postgresql', c));
  check('время по умолчанию у MySQL с долями секунды',
    columnSql('mysql', { name: 'a', kind: 'time', notNull: true, def: 'now' }).includes('CURRENT_TIMESTAMP(3)'));
}

console.log('Индексы');
{
  check('у PostgreSQL индекс создаётся мягко',
    createIndexSql('postgresql', 'T', 'T_idx', ['a', 'b']).includes('IF NOT EXISTS'));
  check('у MySQL мягкого создания нет',
    !createIndexSql('mysql', 'T', 'T_idx', ['a']).includes('IF NOT EXISTS'),
    createIndexSql('mysql', 'T', 'T_idx', ['a']));
  check('уникальный индекс назван уникальным',
    createIndexSql('sqlite', 'T', 'T_key', ['a'], true).includes('UNIQUE INDEX'));
  check('повтор индекса у MySQL считается успехом',
    isDuplicateIndex("Duplicate key name 'T_idx'"));
  check('чужая ошибка успехом не считается', !isDuplicateIndex('Table does not exist'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки создания таблиц пройдены');
