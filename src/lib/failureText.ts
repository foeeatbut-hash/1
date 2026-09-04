/**
 * Что записать в журнал, когда сервер отказал.
 *
 * Тело отказа в журнал раньше клали первыми тремястами символами. Для коротких
 * ответов это работало, а для длинных — обманывало: драйвер базы начинает дамп
 * с имени вызова и куска исходника, а ПРИЧИНУ пишет в конце. В журнале сбоев у
 * владельца осталось ровно это:
 *
 *   Invalid `prisma2.role.create()` invocation in …server.cjs:11352:39
 *    11349 if (!code) code = "ROLE_" + …
 *
 * Причина («значение не влезло в колонку») была обрезана. День ушёл на то,
 * чтобы узнать то, что сервер уже сказал.
 *
 * Поэтому длинный текст сохраняется с двух концов: начало — чтобы понять, о чём
 * речь, конец — чтобы прочесть причину.
 */

const HEAD = 160;
const TAIL = 240;

/** Полезное из тела отказа: поле message/error, если это JSON, иначе текст */
function meaningful(body: string): string {
  const text = String(body || '').trim();
  if (!text) return '';
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const j = JSON.parse(text);
      const said = j?.message || j?.error || j?.detail;
      if (typeof said === 'string' && said.trim()) return said.trim();
    } catch (_) { /* не JSON — берём как есть */ }
  }
  return text;
}

/** Отказ сервера одной строкой для журнала: без переносов и без потери причины */
export function failureText(body: string): string {
  const flat = meaningful(body).replace(/\s+/g, ' ').trim();
  if (flat.length <= HEAD + TAIL) return flat;
  return `${flat.slice(0, HEAD)} … ${flat.slice(-TAIL)}`;
}
