/**
 * Сценарии работы: проходим путь инженера через интерфейс и сверяем результат
 * с базой.
 *
 * Зачем отдельно от остальных проверок. `test-api` проверяет ответы сервера,
 * `test-capture` и прочие — разбор данных. Между ними остаётся дыра: кнопка
 * может быть на месте, сервер — отвечать правильно, а связки между ними нет.
 * Обход «нажмём всё подряд» эту дыру не закрывает: он не знает, что должно
 * произойти, и путает собственные промахи с дефектами программы (проверено —
 * почти все его находки оказались artefact'ами обходчика).
 *
 * Здесь наоборот: короткие сценарии с заранее известным правильным ответом.
 * Завели тег в разделе «Теги» — он обязан появиться в базе, в Менеджменте и
 * в счётчике позиций. Не появился — это дефект, и видно, на каком шаге.
 *
 * Запуск (нужен поднятый сервер и playwright-core):
 *   nohup npx tsx server.ts > /tmp/srv.log 2>&1 &
 *   npx tsx scripts/test-flow.ts
 *
 * За собой убираем: всё созданное удаляется через API в конце, даже при сбое.
 */
const BASE = process.env.FLUX_API || 'http://localhost:3000';
const LOGIN = { symbol: process.env.FLUX_USER || 'RaupovKhKh', password: process.env.FLUX_PASS || '1122' };
const CHROME = process.env.FLUX_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d).slice(0, 220) : ''));

let token = '';
const api = async (method: string, url: string, body?: any) => {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, json: null as any, text }; }
};

(async () => {
  let chromium: any;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error('playwright-core не установлен. Поставьте: npm i --no-save playwright-core');
    process.exit(2);
  }
  try {
    const h = await fetch(BASE + '/api/health');
    if (!h.ok) throw new Error('health ' + h.status);
  } catch (e: any) {
    console.error(`Сервер на ${BASE} не отвечает (${e?.message || e}). Поднимите: npx tsx server.ts`);
    process.exit(2);
  }

  token = (await api('POST', '/api/login', LOGIN)).json?.token || '';
  if (!token) { console.error('Не удалось войти администратором.'); process.exit(2); }
  const projectId = (await api('GET', '/api/projects')).json?.projects?.[0]?.id;
  if (!projectId) { console.error('В базе нет проекта.'); process.exit(2); }

  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  const CODE = `PRV-${stamp}`;              // код тега для сценария
  const BRAND = `ВИР-${stamp}`;
  const NAME = 'Приточный вентилятор проверки';
  const created: string[] = [];             // теги, которые надо убрать
  const createdNotes: string[] = [];        // заметки
  const createdFolders: string[] = [];      // и папки Проводника

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errors: string[] = [];
  page.on('pageerror', (e: any) => errors.push('исключение: ' + String(e.message).slice(0, 110)));
  page.on('console', (m: any) => { if (m.type() === 'error') errors.push('консоль: ' + m.text().slice(0, 110)); });
  page.on('response', (r: any) => { if (r.status() >= 400 && /\/api\//.test(r.url())) errors.push(`ответ ${r.status()} ${new URL(r.url()).pathname}`); });

  // Лицензия проверяется подписью, приватного ключа в репозитории нет —
  // подменяем только ответ проверки, код программы не трогаем
  await page.route('**/api/license/status', (r: any) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ licensed: true, machineId: 'TEST', expiresAt: Date.now() + 9e8, daysLeft: 30, reason: '' }),
  }));

  /** Нажать первую видимую кнопку с таким именем. Невидимые — свёрнутое меню. */
  const clickByName = async (name: string, timeout = 6000) => {
    const loc = page.getByRole('button', { name, exact: true });
    const n = await loc.count();
    for (let k = 0; k < n; k++) {
      const el = loc.nth(k);
      if (!(await el.isVisible())) continue;
      if (await el.click({ timeout }).then(() => true).catch(() => false)) return true;
    }
    return false;
  };

  /** Первое видимое поле по селектору: скрытые разделы остаются в разметке */
  const firstVisible = async (selector: string) => {
    const loc = page.locator(selector);
    const n = await loc.count();
    for (let k = 0; k < n; k++) {
      const el = loc.nth(k);
      if (await el.isVisible()) return el;
    }
    return null;
  };

  try {
    console.log('1. Вход и выбор проекта');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6500);
    const inputs = await page.$$('input');
    await inputs[0].fill(LOGIN.symbol);
    await inputs[1].fill(LOGIN.password);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(9000);
    ok('вход выполнен, открылся рабочий стол', await page.evaluate(() => /РАЗДЕЛЫ/.test(document.body.innerText)));

    await page.locator('button', { hasText: /Технологический\s+Проект\s+Альфа/i }).last().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    ok('проект выбран', !(await page.evaluate(() => /Проект не выбран/.test(document.body.innerText))));

    console.log('2. Теги: создание позиции');
    ok('раздел «Теги» открылся', await clickByName('Теги'));
    await page.waitForTimeout(4000);

    const codeInput = page.locator('[data-tour="tag-code-input"]');
    ok('поле кода тега на месте', (await codeInput.count()) > 0);
    await codeInput.fill(CODE);
    await page.waitForTimeout(900);
    ok('код показан свободным', await page.evaluate(() => /Свободен/.test(document.body.innerText)));

    await page.locator('input[placeholder="ВИР800-340"]').fill(BRAND);
    await page.locator('input[placeholder="Приточный вентилятор"]').fill(NAME);
    await page.waitForTimeout(400);

    const createBtn = page.locator('[data-tour="tag-create-btn"]');
    ok('кнопка «Создать» стала доступной', await createBtn.isEnabled());
    await createBtn.click();
    await page.waitForTimeout(2500);

    // Главное: то, что нажали в интерфейсе, доехало до базы
    const tags = (await api('GET', `/api/projects/${projectId}/tags`)).json;
    const list: any[] = Array.isArray(tags) ? tags : (tags?.tags || []);
    const mine = list.find((t: any) => t.identifier === CODE);
    ok('тег записан в базу', !!mine, { код: CODE, всего: list.length });
    if (mine) created.push(mine.id);
    ok('марка сохранена', mine?.brand === BRAND || mine?.equipmentBrand === BRAND, mine && Object.keys(mine));
    ok('тег виден на экране', await page.evaluate((c: string) => document.body.innerText.includes(c), CODE));

    console.log('3. Менеджмент: позиция попала в закупки');
    ok('раздел «Менеджмент» открылся', await clickByName('Менеджмент'));
    await page.waitForTimeout(4500);
    ok('позиция видна в списке закупок', await page.evaluate((c: string) => document.body.innerText.includes(c), CODE));
    const tally = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.tally-item')].find((x) => /Все позиции/.test(x.textContent || ''));
      return Number((el?.querySelector('.tally-num')?.textContent || '0').trim());
    });
    ok('счётчик «Все позиции» посчитал её', tally >= 1, tally);

    console.log('4. Поиск в закупках отбирает по коду');
    const search = await firstVisible('input[type="search"]');
    if (search) {
      await search.fill(CODE);
      await page.waitForTimeout(1200);
      ok('по коду позиция находится', await page.evaluate((c: string) => document.body.innerText.includes(c), CODE));
      await search.fill('заведомо-нет-такого');
      await page.waitForTimeout(1200);
      ok('по чужому запросу список пуст', await page.evaluate(() => /Ничего не найдено/.test(document.body.innerText)));
      await search.fill('');
      await page.waitForTimeout(800);
    } else {
      ok('поле поиска в закупках найдено', false);
    }

    console.log('5. Выгрузка закупок в Excel отдаёт непустой файл');
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    const pressedExcel = await clickByName('В Excel', 5000);
    ok('кнопка «В Excel» на месте', pressedExcel);
    const file = await dl;
    ok('файл выгрузки начал скачиваться', !!file, file ? await file.suggestedFilename() : null);
    if (file) {
      const fs = await import('fs');
      const path = await file.path();
      const size = path ? fs.statSync(path).size : 0;
      ok('файл не пустой', size > 1000, { байт: size });
      const head = path ? fs.readFileSync(path).subarray(0, 2).toString('latin1') : '';
      ok('это настоящая книга Excel (сигнатура PK)', head === 'PK', head);
    }

    console.log('6. Удаление тега убирает позицию отовсюду');
    await api('DELETE', `/api/tags/${created[0]}`);
    created.length = 0;
    await page.waitForTimeout(600);
    ok('раздел «Менеджмент» открылся заново', await clickByName('Менеджмент'));
    await page.waitForTimeout(1200);
    const refresh = await clickByName('Обновить', 4000);
    await page.waitForTimeout(2000);
    ok('кнопка «Обновить» на месте', refresh);
    ok('позиции больше нет в закупках', !(await page.evaluate((c: string) => document.body.innerText.includes(c), CODE)));

    console.log('7. Блокнот: заметка создаётся и её текст доходит до базы');
    ok('раздел «Блокнот» открылся', await clickByName('Блокнот'));
    await page.waitForTimeout(4000);
    const notesBefore = ((await api('GET', '/api/notes')).json?.notes || []).length;

    const noteBtn = page.locator('[data-tour="note-create-btn"]');
    ok('кнопка создания заметки на месте', (await noteBtn.count()) > 0);
    await noteBtn.first().click({ timeout: 6000 });
    await page.waitForTimeout(2500);

    const notesAfter = (await api('GET', '/api/notes')).json?.notes || [];
    ok('заметка появилась в базе', notesAfter.length === notesBefore + 1, { было: notesBefore, стало: notesAfter.length });
    const note = notesAfter.find((n: any) => !((n.content || '').trim()) || /Новая заметка/.test(n.title || ''));
    if (note) createdNotes.push(note.id);

    // Текст печатаем в редакторе и ждём автосохранения
    const editor = await firstVisible('[contenteditable="true"]');
    ok('поле заметки доступно для ввода', !!editor);
    if (editor) {
      const MARK = `запись проверки ${stamp}`;
      await editor.click();
      await page.keyboard.type(MARK, { delay: 12 });
      await page.waitForTimeout(4000);       // автосохранение
      const saved = (await api('GET', '/api/notes')).json?.notes || [];
      ok('текст заметки сохранён на сервере', saved.some((n: any) => (n.content || '').includes(MARK)),
         saved.map((n: any) => (n.content || '').slice(0, 40)).slice(0, 3));
    }

    console.log('8. Проводник: папка, корзина и восстановление');
    ok('раздел «Проводник» открылся', await clickByName('Проводник'));
    await page.waitForTimeout(4000);

    // Папку можно создать только внутри раздела «Общий» или «Личный»
    const shared = page.locator('button,[role="button"],div').filter({ hasText: /^Общий$/ }).first();
    await shared.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const FOLDER = `Папка проверки ${stamp}`;
    ok('кнопка «Новая папка» на месте', await clickByName('Новая папка', 5000));
    await page.waitForTimeout(1500);
    const promptOpen = await page.evaluate(() => /Имя папки/i.test(document.body.innerText)
      && document.activeElement?.tagName === 'INPUT');
    ok('окно запроса имени открылось и поле в фокусе', promptOpen);
    if (promptOpen) {
      await page.keyboard.type(FOLDER, { delay: 10 });
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const folders = (await api('GET', `/api/projects/${projectId}/folders`)).json?.folders || [];
    const made = folders.find((x: any) => x.name === FOLDER);
    ok('папка записана в базу', !!made, { имя: FOLDER, всего: folders.length });
    if (made) {
      createdFolders.push(made.id);
      ok('папка видна на экране', await page.evaluate((n: string) => document.body.innerText.includes(n), FOLDER));

      // Удаление кладёт в корзину, а не стирает — это опора всей защиты данных
      await api('DELETE', `/api/folders/${made.id}`);
      await page.waitForTimeout(500);
      const listAfter = (await api('GET', `/api/projects/${projectId}/folders`)).json?.folders || [];
      ok('из обычного списка папка ушла', !listAfter.some((x: any) => x.id === made.id));
      const trash = (await api('GET', `/api/projects/${projectId}/trash`)).json;
      const inTrash = JSON.stringify(trash || {}).includes(made.id);
      ok('папка лежит в корзине, а не стёрта', inTrash, Object.keys(trash || {}));

      const restored = await api('POST', `/api/folders/${made.id}/restore`);
      ok('восстановление из корзины отвечает успехом', restored.status === 200, restored.status);
      const back = (await api('GET', `/api/projects/${projectId}/folders`)).json?.folders || [];
      ok('папка вернулась в список', back.some((x: any) => x.id === made.id));
    }

    console.log('9. Тишина в консоли за весь сценарий');
    const noisy = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
    ok('ни исключений, ни ошибок ответа', noisy.length === 0, noisy.slice(0, 4));
  } catch (e: any) {
    f++;
    console.error('  ✗ сценарий прерван:', String(e?.message || e).split('\n')[0].slice(0, 200));
  } finally {
    // Сначала закрываем браузер, потом убираем данные: редактор заметки
    // досохраняет текст с задержкой, и запись, удалённая при живой странице,
    // тут же появлялась снова.
    await browser.close();
    for (const id of created) await api('DELETE', `/api/tags/${id}`).catch(() => {});
    for (const id of createdNotes) await api('DELETE', `/api/notes/${id}`).catch(() => {});
    for (const id of createdFolders) await api('DELETE', `/api/folders/${id}`).catch(() => {});
  }

  console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
  process.exit(f === 0 ? 0 : 1);
})();
