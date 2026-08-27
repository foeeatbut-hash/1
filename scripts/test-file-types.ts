/**
 * Проверки сопоставлений: чем открывается файл.
 *
 * Ошибка здесь тихая: файл открывается — просто не тем. Двойное нажатие по
 * чертежу уводит в предпросмотр вместо редактора пометок, и человек решает, что
 * пометки «не работают».
 *
 * Запуск: npx tsx scripts/test-file-types.ts
 */
import { appsFor, openHref, hasChoice, isPdf, isConstructorDoc, FILE_APPS } from '../src/lib/fileTypes';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Кого чем открываем');
{
  const pdf = { id: 'f1', name: 'АР-01.pdf', type: 'PDF', folderId: 'd1' };
  check('чертёж открывает Чертёж', appsFor(pdf)[0].id === 'pdf', appsFor(pdf).map((a) => a.id));
  check('и предлагает Проводник вторым', appsFor(pdf)[1]?.id === 'explorer');
  check('у чертежа есть выбор', hasChoice(pdf));

  const oldPdf = { id: 'f2', name: 'Схема.PDF' };
  check('чертёж без типа узнаётся по имени', isPdf(oldPdf) && appsFor(oldPdf)[0].id === 'pdf');
  check('«pdf» посреди имени не делает файл чертежом', !isPdf({ id: 'f3', name: 'pdf-инструкция.docx' }));

  const doc = { id: 'f4', name: 'Ведомость', type: 'CONSTRUCTOR', refId: 'doc-9' };
  check('документ Конструктора открывает Конструктор', appsFor(doc)[0].id === 'docs');
  check('и выбора для него нет', !hasChoice(doc), appsFor(doc).map((a) => a.id));
  check('документ узнаётся и по одной ссылке', isConstructorDoc({ id: 'f5', refId: 'doc-1' }));

  const any = { id: 'f6', name: 'Фото.jpg', folderId: 'd2' };
  check('всё остальное открывает Проводник', appsFor(any)[0].id === 'explorer');
  check('и выбора там нет', !hasChoice(any));
}

console.log('Адреса');
{
  check('чертёж открывается по своему файлу',
    openHref({ id: 'f1', type: 'PDF' }) === '/pdf?file=f1', openHref({ id: 'f1', type: 'PDF' }));
  check('документ — по ссылке на документ, а не по файлу',
    openHref({ id: 'f4', refId: 'doc-9' }) === '/constructor?doc=doc-9');
  check('в Проводнике открывается вместе с папкой',
    openHref({ id: 'f6', folderId: 'd2' }) === '/explorer?file=f6&folder=d2');
  check('без папки — просто файлом',
    openHref({ id: 'f7' }) === '/explorer?file=f7', openHref({ id: 'f7' }));
  check('опасные знаки в имени папки не ломают адрес',
    openHref({ id: 'a b', folderId: 'п/п' }) === '/explorer?file=a%20b&folder=%D0%BF%2F%D0%BF',
    openHref({ id: 'a b', folderId: 'п/п' }));
}

console.log('Список программ опрятен');
{
  for (const [key, app] of Object.entries(FILE_APPS)) {
    check(`${key}: ключ совпадает с именем`, app.id === key);
    check(`${key}: у программы есть раздел`, app.path.startsWith('/'));
    check(`${key}: адрес ведёт в её же раздел`,
      app.href({ id: 'x', refId: 'y', folderId: 'z' }).startsWith(app.path + '?'),
      app.href({ id: 'x', refId: 'y', folderId: 'z' }));
  }
}

console.log(failed === 0 ? '\nВсе проверки сопоставлений пройдены' : `\nПровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
