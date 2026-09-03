/**
 * Экран входа: два разных вопроса — двумя разными кнопками.
 *
 * Проверка написана по случившемуся. В поле «Сервер компании» вписали строку
 * подключения к базе; поле приняло её молча, и программа перестала работать
 * целиком — вместе с этим самым экраном, с которого это можно было бы
 * исправить. Здесь проверяется, что так больше нельзя и что у базы есть своё
 * место.
 *
 * Запуск (нужен поднятый сервер и playwright-core):
 *   npx tsx server.ts > /tmp/srv.log 2>&1 &
 *   npx tsx scripts/test-login-db.ts
 */
const BASE = process.env.FLUX_API || 'http://localhost:3000';
const CHROME = process.env.FLUX_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DSN = 'mysql://Flux:секрет@192.168.120.14:3306/Flux';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d).slice(0, 240) : ''));

(async () => {
  let chromium: any;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.error('playwright-core не установлен.'); process.exit(2); }
  try {
    const h = await fetch(BASE + '/api/health');
    if (!h.ok) throw new Error('health ' + h.status);
  } catch (e: any) {
    console.error(`Сервер на ${BASE} не отвечает (${e?.message || e}).`);
    process.exit(2);
  }

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errs: string[] = [];
  page.on('pageerror', (e: any) => errs.push('исключение: ' + String(e.message).slice(0, 140)));
  await page.route('**/api/license/status', (r: any) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ licensed: true, machineId: 'TEST', expiresAt: Date.now() + 9e8, daysLeft: 30, reason: '' }),
  }));

  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);

    console.log('1. Два вопроса — две кнопки');
    const dbBtn = page.locator('button[title^="Где лежат данные"]').first();
    ok('строка о базе есть на экране входа', await dbBtn.isVisible().catch(() => false));
    ok('в ней сказано, где база',
      /База:/.test(await dbBtn.innerText().catch(() => '')), await dbBtn.innerText().catch(() => ''));
    ok('строка о сервере программы осталась отдельной',
      await page.getByTitle('Настроить подключение к серверу').isVisible().catch(() => false));

    console.log('2. Строку подключения к базе в поле сервера не принимают');
    await page.getByTitle('Настроить подключение к серверу').click();
    await page.waitForTimeout(700);
    await page.locator('input[placeholder^="http://адрес"]').first().fill(DSN);
    await page.getByRole('button', { name: 'Подключиться' }).first().click();
    await page.waitForTimeout(700);
    const body = await page.evaluate(() => document.body.innerText);
    ok('программа объясняет, что это база, а не сервер', body.includes('базе данных'), body.slice(0, 400));
    ok('негодный адрес не сохранён',
      await page.evaluate(() => localStorage.getItem('flux_server_url') || '') === '',
      await page.evaluate(() => localStorage.getItem('flux_server_url')));
    ok('страница жива, а не обездвижена', await dbBtn.isVisible().catch(() => false));

    console.log('3. Окно подключения к базе');
    await dbBtn.click();
    await page.waitForTimeout(900);
    const dialog = page.getByRole('dialog', { name: 'Подключение к базе данных' });
    ok('окно открылось', await dialog.isVisible().catch(() => false));
    ok('спрашивают человеческим языком',
      await page.getByText('Где лежат данные', { exact: false }).first().isVisible().catch(() => false));
    await page.getByText('PostgreSQL', { exact: false }).first().click();
    await page.waitForTimeout(400);
    for (const label of ['Сервер', 'База данных', 'Пользователь', 'Пароль']) {
      ok(`поле «${label}» на месте`,
        await dialog.getByText(label, { exact: true }).first().isVisible().catch(() => false));
    }
    ok('есть «Проверить» до переключения',
      await dialog.getByRole('button', { name: 'Проверить' }).isVisible().catch(() => false));
    ok('пароль вводится скрытым',
      (await dialog.locator('input[type="password"]').count()) === 1);
    ok('в консоли пусто', errs.length === 0, errs.slice(0, 3));

    await page.screenshot({ path: '/tmp/login-db.png' });
  } finally {
    await browser.close();
  }

  console.log(f ? `\nПровалено проверок: ${f}` : '\nПроверка экрана входа пройдена');
  process.exit(f ? 1 : 0);
})();
