/**
 * Достать список из ответа сервера, каким бы он ни пришёл.
 *
 * Написано по поломке из отдела. Раздел «Оборудование» падал целиком — с
 * предложением «Перезапустить раздел» — при открытии «Истории версий», хотя
 * запрос отвечал 200. Причина была вот такой:
 *
 *     // сервер:  res.json({ history })
 *     setHistoryData(await r.json());   // в состоянии оказался объект
 *     historyData.map(...)              // T.map is not a function
 *
 * Ошибка внутри отрисовки уносит весь раздел, а не одно окно: React снимает
 * поддерево целиком. То есть опечатка в одном месте закрывала человеку работу с
 * оборудованием до перезапуска программы.
 *
 * Поэтому список из ответа достаётся здесь, а не разбирается на месте: снаружи
 * гарантируется массив, и раздел уже не может упасть из-за того, что сервер
 * завернул данные в объект или вернул ошибку вместо списка.
 */

/**
 * `data` — разобранный JSON ответа, `key` — имя поля, в которое сервер обычно
 * заворачивает список. Возвращает массив всегда: не нашли — пустой.
 */
export function listOf<T = any>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  // Сначала поле, которое ждали, потом общепринятые обёртки этого кода
  for (const k of [key, 'items', 'data', 'rows', 'list'].filter(Boolean) as string[]) {
    if (Array.isArray(obj[k])) return obj[k] as T[];
  }
  return [];
}

/** Ответ fetch → массив. Незачем каждый раз писать один и тот же try/catch */
export async function fetchList<T = any>(res: Response, key?: string): Promise<T[]> {
  try {
    return listOf<T>(await res.json(), key);
  } catch (_) {
    return [];
  }
}
