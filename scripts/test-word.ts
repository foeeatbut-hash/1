/**
 * Редактор Ворда: живая проверка через интерфейс.
 *
 * Почему живьём, а не только модулями. `test-doc-export` проверяет сборку HTML
 * на готовом снапшоте — это чистая функция. Но между ней и человеком стоит
 * движок Univer: лента со шрифтами, лист с полями, кнопки выгрузки. Ошибка в
 * этой связке (не подхватился список шрифтов, лист не сменил формат, файл не
 * скачался) на модульных проверках не видна совсем.
 *
 * Запуск (нужен поднятый сервер и playwright-core):
 *   npx tsx server.ts &
 *   npx tsx scripts/test-word.ts
 *
 * Созданный документ удаляется в конце, даже при сбое.
 */
const BASE = process.env.FLUX_API || 'http://localhost:3000';
const LOGIN = { symbol: process.env.FLUX_USER || 'RaupovKhKh', password: process.env.FLUX_PASS || '1122' };
const CHROME = process.env.FLUX_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d).slice(0, 240) : ''));

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
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.error('playwright-core не установлен: npm i --no-save playwright-core'); process.exit(2); }

  try {
    const h = await fetch(BASE + '/api/health');
    if (!h.ok) throw new Error('health ' + h.status);
  } catch (e: any) {
    console.error(`Сервер на ${BASE} не отвечает (${e?.message || e})`); process.exit(2);
  }

  token = (await api('POST', '/api/login', LOGIN)).json?.token || '';
  if (!token) { console.error('Не удалось войти'); process.exit(2); }
  const projectId = (await api('GET', '/api/projects')).json?.projects?.[0]?.id;
  if (!projectId) { console.error('В базе нет проекта'); process.exit(2); }

  // Хвосты прошлых прогонов: одинаковые имена в списке — и сценарий откроет
  // не тот документ (проверено: именно так проверка титула «не видела» настройки)
  const stale = ((await api('GET', `/api/constructor/docs?projectId=${projectId}`)).json?.docs || [])
    .filter((d: any) => /^(Проверка Ворда|Титул проверки)/.test(d.name || ''));
  for (const d of stale) await api('DELETE', `/api/constructor/docs/${d.id}`).catch(() => {});
  if (stale.length) console.log(`  (убрано документов от прошлых прогонов: ${stale.length})`);

  // Документ заводим через API: проверяем редактор, а не создание документа
  const DOC_NAME = `Проверка Ворда ${Date.now().toString(36).slice(-4)}`;
  const made = await api('POST', '/api/constructor/docs', {
    projectId, name: DOC_NAME, kind: 'TEXT', scope: 'SHARED',
  });
  const docId = made.json?.doc?.id;
  if (!docId) { console.error('Не удалось создать документ: ' + JSON.stringify(made.json)); process.exit(2); }

  let tplId = '';                      // шаблон титула, созданный сценарием
  const formulaIds: string[] = [];     // и его формулы

  // Титул с формулами готовим ДО входа: редактор читает настройки документа
  // один раз при открытии, и присваивать титул уже открытому документу значит
  // проверять не выгрузку, а перезаход.
  // Самое важное в задаче: формулы живут в программе, а в файл должны попасть
  // ПОСЧИТАННЫЕ значения — иначе на чужом компьютере вместо шифра и подписи
  // будет пустое место.
  const usersRes = (await api('GET', '/api/users')).json;
  const users: any[] = Array.isArray(usersRes) ? usersRes : (usersRes?.users || []);
  const me = users.find((u: any) => u.symbol === LOGIN.symbol);
  ok('нашли себя в списке сотрудников', !!me?.id, users.map(u => u.symbol));
  ok('картинка подписи в списке не отдаётся', me && !('signatureImage' in me), Object.keys(me || {}));

  // Подпись сотрудника: крошечный PNG — проверяем перенос, а не картинку
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const sigPut = await api('PUT', `/api/users/${me.id}/signature`, { signatureImage: PNG, signatureHeightMm: 10 });
  ok('подпись сотрудника сохранена в общей базе', sigPut.status === 200, sigPut.json);

  // Формулы проекта: дата, инициалы, подпись и сборка «шифр + ревизия»
  const mkF = async (name: string, kind: string, config: any) =>
    (await api('POST', `/api/projects/${projectId}/formulas`, { name, kind, config })).json?.formula;
  const fDate = await mkF('Дата', 'value', { field: 'date', date: { order: 'dmy', month: 'gen', year: 'suffix' } });
  const fIni = await mkF('Инициалы', 'value', { field: 'person', name: 'initialsAfter', person: 'author' });
  const fSig = await mkF('Подпись', 'signature', { person: 'author', heightMm: 10 });
  const fCode = await mkF('Шифр с ревизией', 'compose', { parts: [
    { kind: 'field', value: 'doc.code' },
    { kind: 'field', value: 'doc.revision', sep: ' рев. ' },
  ] });
  ok('формулы созданы', !!(fDate?.id && fIni?.id && fSig?.id && fCode?.id));
  formulaIds.push(fDate.id, fIni.id, fSig.id, fCode.id);

  // Шаблон титула с плашками — ровно так его сохраняет редактор шаблонов
  const chip = (f: any) => `<span data-formula-id="${f.id}" contenteditable="false" class="tt-chip tt-chip-fx">${f.name}</span>`;
  const tplHtml = `<p style="text-align:center">ПОЯСНИТЕЛЬНАЯ ЗАПИСКА</p>`
    + `<p>Шифр: ${chip(fCode)}</p><p>Дата: ${chip(fDate)}</p>`
    + `<p>Разработал: ${chip(fIni)} ${chip(fSig)}</p>`;
  const tpl = (await api('POST', '/api/constructor/docs', {
    projectId, name: 'Титул проверки', kind: 'TEMPLATE', scope: 'SHARED',
    bindings: JSON.stringify({ subtype: 'title', html: tplHtml }),
  })).json?.doc;
  ok('шаблон титула создан', !!tpl?.id, tpl);
  if (tpl?.id) tplId = tpl.id;

  // Присваиваем титул документу и заполняем шифр с ревизией
  await api('PUT', `/api/constructor/docs/${docId}`, {
    settings: JSON.stringify({ titleTemplateId: tpl.id, docMeta: { code: 'ПЗ-042', revision: 'B' } }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errors: string[] = [];
  page.on('pageerror', (e: any) => errors.push('исключение: ' + String(e.message).slice(0, 130)));
  page.on('console', (m: any) => { if (m.type() === 'error') errors.push('консоль: ' + m.text().slice(0, 130)); });

  // Лицензия проверяется подписью, приватного ключа в репозитории нет —
  // подменяем только ответ проверки, код программы не трогаем
  await page.route('**/api/license/status', (r: any) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ licensed: true, machineId: 'TEST', expiresAt: Date.now() + 9e8, daysLeft: 30, reason: '' }),
  }));

  const clickByName = async (name: string | RegExp, timeout = 6000) => {
    const loc = page.getByRole('button', { name });
    const n = await loc.count();
    for (let k = 0; k < n; k++) {
      const el = loc.nth(k);
      if (!(await el.isVisible())) continue;
      if (await el.click({ timeout }).then(() => true).catch(() => false)) return true;
    }
    return false;
  };

  try {
    console.log('1. Вход и открытие документа');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6500);
    const inputs = await page.$$('input');
    await inputs[0].fill(LOGIN.symbol);
    await inputs[1].fill(LOGIN.password);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(9000);
    ok('вход выполнен', await page.evaluate(() => /РАЗДЕЛЫ/.test(document.body.innerText)));

    // Идём прямо в документ: путь через разделы проверяет test-flow
    await page.evaluate((id: string) => {
      window.history.pushState({}, '', `/?doc=${id}`);
    }, docId);
    await page.goto(`${BASE}/?constructorDoc=${docId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);

    // Открываем через раздел «Конструктор»: адресной строки у программы нет
    await clickByName(/Конструктор/i, 8000);
    await page.waitForTimeout(3500);
    // Открываем по точному имени: подстрока может совпасть с чужим документом
    const openDoc = () => page.getByText(DOC_NAME, { exact: true }).first()
      .dblclick({ timeout: 8000 }).then(() => true).catch(() => false);
    ok('документ открыт из списка Конструктора', await openDoc());
    await page.waitForTimeout(9000);   // движок Univer грузится лениво

    console.log('2. Лента как в Ворде');
    const ribbon = await page.evaluate(() => document.body.innerText);
    ok('вкладки ленты движка на месте', /Начало/.test(ribbon) && /Вставка/.test(ribbon), ribbon.slice(-200));

    // Шрифт и размер живут в полях ввода: innerText их не видит.
    // Значение по умолчанию — Arial 11: движок держит его жёстко в коде
    // (DEFAULT_TEXT_STYLE в @univerjs/docs-ui) и documentStyle.textStyle для
    // набора не читает. Человек выбирает шрифт в ленте — это и проверяем.
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map(i => (i as HTMLInputElement).value).filter(Boolean));
    ok('в ленте есть поле шрифта', fields.some(v => /^(Arial|Times New Roman|Calibri)$/.test(v)), fields);
    ok('в ленте есть поле размера', fields.some(v => /^\d{1,2}$/.test(v)), fields);

    // Открываем список шрифтов настоящим кликом мыши: список рисуется в
    // отдельном слое, синтетическое событие его не поднимает
    const fontBox = await page.evaluate(() => {
      const inp = [...document.querySelectorAll('input')]
        .find(i => /^(Arial|Times New Roman|Calibri)$/.test((i as HTMLInputElement).value)) as HTMLInputElement | undefined;
      if (!inp) return null;
      const r = inp.getBoundingClientRect();
      // По самому полю: справа от него уже кнопка цвета текста
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    ok('поле шрифта видно на экране', !!fontBox, fontBox);
    if (fontBox) {
      await page.mouse.click(fontBox.x, fontBox.y);
      await page.waitForTimeout(1500);
      if (process.env.FLUX_DEBUG) {
        await page.screenshot({ path: '/tmp/font-open.png' });
        console.log('    отладка: li =', await page.evaluate(() => document.querySelectorAll('li').length),
          '| Verdana в тексте =', await page.evaluate(() => /Verdana/.test(document.body.innerText)));
      }
      const items = await page.evaluate(() =>
        [...document.querySelectorAll('li button, [role="option"], li')]
          .map(x => (x.textContent || '').trim()).filter(Boolean));
      const listShown = items.some(x => x === 'Verdana') && items.some(x => x === 'Courier New');
      ok('список шрифтов открылся', listShown, items.slice(0, 20));
      if (listShown) {
        ok('в списке шрифты для русских документов',
          items.includes('Times New Roman') && items.includes('Calibri'), items);
        ok('китайских шрифтов больше нет',
          !items.some(x => /SimSun|FangSong|STXingkai|Kaiti/.test(x)), items);
        ok('чертёжный шрифт доступен', items.some(x => x.startsWith('ISOCPEUR')), items);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    console.log('3. Разметка страницы');
    ok('кнопка «Лист» на месте', await clickByName('Лист', 6000));
    await page.waitForTimeout(1200);
    const dlg = await page.evaluate(() => document.body.innerText);
    ok('окно разметки открылось', /Разметка страницы/.test(dlg));
    ok('форматы листа перечислены', /A4 210 × 297 мм/.test(dlg) && /A3 297 × 420 мм/.test(dlg), dlg.slice(0, 300));
    ok('наборы полей перечислены', /Обычные · 2,54 см/.test(dlg) && /ГОСТ/.test(dlg));
    ok('поля показаны в миллиметрах', /Сверху, мм/.test(dlg));

    // Ставим ГОСТ-поля и альбомную ориентацию — и проверяем, что легло в базу
    await clickByName(/ГОСТ · слева 3 см/, 5000);
    await clickByName('Альбомная', 5000);
    await clickByName('Применить', 5000);
    await page.waitForTimeout(6000);

    const after = (await api('GET', `/api/constructor/docs/${docId}`)).json?.doc;
    let snap: any = {};
    try { snap = JSON.parse(after?.workbook || '{}'); } catch (_) {}
    const ds = snap.documentStyle || {};
    ok('поля ГОСТ сохранены в документе', ds.marginLeft === 85 && ds.marginRight === 43, ds);
    ok('лист стал альбомным', ds.pageSize?.width > ds.pageSize?.height, ds.pageSize);
    ok('текст документа при смене разметки не потерялся', typeof snap.body?.dataStream === 'string', Object.keys(snap));

    console.log('4. Выгрузка в Ворд');
    // Перехватываем скачивание и читаем сам файл
    const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    ok('меню выгрузки открылось', await clickByName('Выгрузить', 6000));
    await page.waitForTimeout(900);
    const menu = await page.evaluate(() => document.body.innerText);
    ok('в меню есть выгрузка в Ворд', /В Ворд \(\.doc\)/.test(menu), menu.slice(0, 400));
    ok('и сохранение в Проводник', /Ворд в Проводник/.test(menu));
    await clickByName(/В Ворд \(\.doc\)/, 6000);

    const download = await dl;
    ok('файл скачался', !!download, download ? await download.suggestedFilename() : null);
    if (download) {
      // В контейнере у Chromium не задана локаль (LC_CTYPE=POSIX), и он теряет
      // кириллицу в имени скачиваемого файла — проверено отдельно: латинское
      // имя доходит, русское превращается в «download». На рабочем месте
      // выгрузка идёт не скачиванием, а окном «Сохранить как» (doc:save-word),
      // поэтому здесь проверяем только само содержимое файла.
      const name = await download.suggestedFilename();
      ok('файл получен', !!name, name);
      const path = await download.path();
      const fs = await import('node:fs/promises');
      const text = path ? await fs.readFile(path, 'utf8') : '';
      ok('файл не пустой', text.length > 200, text.length);
      ok('Ворд откроет его как документ', text.includes('WordSection1') && text.includes('urn:schemas-microsoft-com:office:word'));
      ok('поля листа ушли в файл — 30 мм слева', /margin:20\.1mm 15\.2mm 20\.1mm 30mm/.test(text), (text.match(/margin:[^;}]*/) || [])[0]);
      ok('альбомный лист в файле', /size:297mm 210mm/.test(text), (text.match(/size:[^;]*/) || [])[0]);
      ok('кодировка указана — русский текст не поедет', /charset="?utf-8/i.test(text));
      ok('в начале файла BOM — Ворд не покажет кракозябры', text.charCodeAt(0) === 0xFEFF, text.charCodeAt(0));
      // Титул присвоен, поэтому вместо служебного заголовка в файле его текст
      ok('кириллица внутри файла читается', /ПОЯСНИТЕЛЬНАЯ ЗАПИСКА/.test(text), text.slice(0, 200));
      ok('формул в файле нет, только значения', !/data-formula/.test(text) && !/tt-chip/.test(text));
    }

    console.log('5. Титул с формулами: получатель в Windows видит значения');
    // Присвоенный титул виден по кнопке: она зелёная. Не зелёная — редактор не
    // прочитал настройки, и проверять выгрузку бессмысленно
    const titleAssigned = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Титул/.test(x.textContent || ''));
      return b ? b.className.includes('emerald') : null;
    });
    ok('редактор увидел присвоенный титул', titleAssigned === true, titleAssigned);

    const dl2 = page.waitForEvent('download', { timeout: 25000 }).catch(() => null);
    await clickByName('Выгрузить', 6000);
    await page.waitForTimeout(900);
    await clickByName(/В Ворд \(\.doc\)/, 6000);
    const d2 = await dl2;
    ok('файл с титулом скачался', !!d2);
    if (d2) {
      const p2 = await d2.path();
      const fs = await import('node:fs/promises');
      const t2 = p2 ? await fs.readFile(p2, 'utf8') : '';
      ok('титул попал в файл', /ПОЯСНИТЕЛЬНАЯ ЗАПИСКА/.test(t2), t2.length);
      ok('сборка «шифр + ревизия» посчитана', /ПЗ-042 рев\. B/.test(t2), (t2.match(/Шифр:[^<]*/) || [])[0]);
      ok('дата словами, как настроено', /\d{1,2} [а-яё]+ \d{4} г\./.test(t2), (t2.match(/Дата:[\s\S]{0,60}/) || [])[0]);
      // «Раупов Хусрав Хуршедович» → «Раупов Х.Х.», через неразрывный пробел
      ok('инициалы собраны из ФИО', /Раупов(&nbsp;| | )Х\.Х\./.test(t2), (t2.match(/Разработал:[\s\S]{0,140}/) || [])[0]);
      ok('подпись ушла картинкой внутри файла', /<img src="data:image\/png;base64,/.test(t2) && /height:10mm/.test(t2), (t2.match(/<img[^>]*/) || [])[0]);
      ok('названий формул в файле нет — только значения',
        !/data-formula-id/.test(t2) && !/tt-chip/.test(t2) && !/>Дата</.test(t2), (t2.match(/tt-chip[^"]*/) || [])[0]);
      ok('зачёркнутых плашек нет — каталог формул подхватился', !/line-through/.test(t2));
      ok('титул отделён разрывом страницы', /page-break-after:always/.test(t2));
    }

    console.log('6. Ошибок в консоли нет');
    // Свои ошибки движка про отсутствующие шрифты не считаем: их нет в контейнере
    const real = errors.filter(e => !/font|Font|favicon|ResizeObserver/.test(e));
    ok('исключений и ответов 4xx/5xx не было', real.length === 0, real.slice(0, 4));
  } finally {
    await page.screenshot({ path: '/tmp/word-editor.png', fullPage: false }).catch(() => {});
    await browser.close().catch(() => {});
    // За собой убираем: документ, шаблон титула и формулы проекта
    await api('DELETE', `/api/constructor/docs/${docId}`).catch(() => {});
    if (tplId) await api('DELETE', `/api/constructor/docs/${tplId}`).catch(() => {});
    for (const id of formulaIds) await api('DELETE', `/api/formulas/${id}`).catch(() => {});
  }

  console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
  process.exit(f === 0 ? 0 : 1);
})();
