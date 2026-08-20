/**
 * Общий ящик компании: проверки правил на живом сервере.
 *
 * Здесь проверяется то, ради чего общий ящик и отличается от личного:
 *
 *  - «прочитано» у каждого своё. Флаг \Seen в IMAP один на всех, и без
 *    отдельного хранения открытое одним письмо пропадало бы из непрочитанных
 *    у остальных девяти;
 *  - переписку нельзя молча перехватить у того, кто её ведёт;
 *  - чужой личный ящик не виден никому, включая администратора.
 *
 * Нужен поднятый сервер: `npx tsx server.ts`.
 */
const BASE = process.env.FLUX_API || 'http://localhost:3000';
const ADMIN = { symbol: process.env.FLUX_USER || 'RaupovKhKh', password: process.env.FLUX_PASS || '1122' };

let ok = 0;
let fail = 0;
const eq = (name: string, got: any, want: any) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { ok++; console.log(`  ✓ ${name}`); } else {
    fail++;
    console.log(`  ✗ ${name}\n      получили: ${g}\n      ожидали:  ${w}`);
  }
};

async function call(method: string, path: string, token: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as any };
}

async function login(symbol: string, password: string): Promise<string> {
  const r = await call('POST', '/api/login', '', { symbol, password });
  return r.json?.token || '';
}

const run = async () => {
  console.log('1. Вход');
  const admin = await login(ADMIN.symbol, ADMIN.password);
  eq('администратор вошёл', Boolean(admin), true);
  if (!admin) { console.log('\nСервер не отвечает или пароль не тот'); process.exit(1); }

  console.log('\n2. Список ящиков');
  const accounts = await call('GET', '/api/mail/accounts', admin);
  const list: any[] = accounts.json?.accounts || [];
  const shared = list.find((a) => a.scope === 'SHARED');
  const personal = list.find((a) => a.scope === 'PERSONAL');
  eq('общий ящик виден', Boolean(shared), true);
  eq('личный ящик виден', Boolean(personal), true);
  eq('пароль наружу не отдаётся', list.every((a) => a.secret === undefined && a.secretNonce === undefined), true);
  if (!shared) { console.log('\nОбщий ящик не подключён — остальные проверки пропущены'); process.exit(fail ? 1 : 0); }

  console.log('\n3. Второй сотрудник');
  // Нужен кто-то ещё: смысл общего ящика виден только вдвоём
  const users = await call('GET', '/api/users', admin);
  const others: any[] = (users.json?.users || users.json || []).filter?.((u: any) => u.symbol !== ADMIN.symbol) || [];
  const mate = others[0];
  eq('в конторе есть второй сотрудник', Boolean(mate), true);
  if (!mate) { console.log('\nНекому проверять общий доступ'); process.exit(fail ? 1 : 0); }

  // Задаём ему известный пароль, чтобы войти от его имени
  const pass = 'проверка-общего-ящика';
  await call('PUT', `/api/users/${mate.id}`, admin, { password: pass, isActive: true });
  const mateToken = await login(mate.symbol, pass);
  eq('второй сотрудник вошёл', Boolean(mateToken), true);
  if (!mateToken) process.exit(1);

  console.log('\n4. Общий ящик виден обоим, личный — только владельцу');
  const mateAccounts = await call('GET', '/api/mail/accounts', mateToken);
  const mateList: any[] = mateAccounts.json?.accounts || [];
  eq('общий ящик виден второму', mateList.some((a) => a.id === shared.id), true);
  eq('чужой личный ящик не виден', mateList.some((a) => a.id === personal?.id), false);

  console.log('\n5. Прочитано — у каждого своё');
  const t1 = await call('GET', `/api/mail/threads?accountId=${shared.id}`, admin);
  const threads: any[] = t1.json?.threads || [];
  eq('в общем ящике есть переписки', threads.length > 0, true);
  if (!threads.length) process.exit(fail ? 1 : 0);

  const target = threads.find((t) => t.unread) || threads[0];
  await call('POST', '/api/mail/flag', admin, { ids: target.ids, flag: 'seen', on: true });

  const afterMe = await call('GET', `/api/mail/threads?accountId=${shared.id}`, admin);
  const mineNow = (afterMe.json?.threads || []).find((t: any) => t.threadKey === target.threadKey);
  eq('у меня письмо стало прочитанным', mineNow?.unread, false);

  const afterMate = await call('GET', `/api/mail/threads?accountId=${shared.id}`, mateToken);
  const mateNow = (afterMate.json?.threads || []).find((t: any) => t.threadKey === target.threadKey);
  // Ради этого и заведена отдельная таблица: иначе флаг IMAP погасил бы
  // непрочитанное сразу у всех
  eq('у коллеги оно осталось непрочитанным', mateNow?.unread, true);

  console.log('\n6. Переписку не перехватывают молча');
  const claim = await call('POST', '/api/mail/shared/claim', admin, {
    accountId: shared.id, threadKey: target.threadKey, on: true,
  });
  eq('взял в работу', claim.json?.state?.claimedById ? true : false, true);

  const steal = await call('POST', '/api/mail/shared/claim', mateToken, {
    accountId: shared.id, threadKey: target.threadKey, on: true,
  });
  eq('коллега получает отказ, а не молчаливый перехват', steal.status, 409);
  eq('и в отказе сказано, кто ведёт', String(steal.json?.error || '').includes('уже ведёт'), true);

  const release = await call('POST', '/api/mail/shared/claim', mateToken, {
    accountId: shared.id, threadKey: target.threadKey, on: false,
  });
  eq('и отпустить чужое тоже нельзя', release.status, 403);

  console.log('\n7. Пометка коллегам');
  const note = await call('POST', '/api/mail/shared/note', admin, {
    accountId: shared.id, threadKey: target.threadKey, note: 'Проверка ленты',
  });
  eq('пометка записана', (note.json?.activity || []).some((a: any) => a.note === 'Проверка ленты'), true);
  const seenByMate = await call('GET', `/api/mail/thread?accountId=${shared.id}&threadKey=${encodeURIComponent(target.threadKey)}`, mateToken);
  eq('и видна коллеге', (seenByMate.json?.activity || []).some((a: any) => a.note === 'Проверка ленты'), true);

  console.log('\n8. Настройки общего ящика — не всякому');
  const meddle = await call('PUT', `/api/mail/accounts/${shared.id}`, mateToken, { label: 'Переименовал' });
  eq('сотрудник без права не меняет общий ящик', meddle.status, 403);

  console.log('\n9. Чужой личный ящик недоступен по прямому обращению');
  if (personal) {
    const peek = await call('GET', `/api/mail/threads?accountId=${personal.id}`, mateToken);
    eq('писем не отдаёт', (peek.json?.threads || []).length, 0);
    const edit = await call('PUT', `/api/mail/accounts/${personal.id}`, mateToken, { label: 'Чужое' });
    eq('и править не даёт', edit.status, 404);
  }

  // Прибираем за собой: отпускаем переписку
  await call('POST', '/api/mail/shared/claim', admin, {
    accountId: shared.id, threadKey: target.threadKey, on: false,
  });

  console.log(`\n${ok} проверок пройдено, ${fail} провалено`);
  process.exit(fail ? 1 : 0);
};

run().catch((err) => {
  console.error('\nСбой прогона:', err?.message || err);
  process.exit(1);
});
