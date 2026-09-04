/**
 * Переименование тега разговором.
 *
 * Три правила, которые легко «упростить до очевидного» и тем сломать:
 * неверный код не должен выбрасывать человека из диалога; тот же самый код —
 * не ошибка, а «делать нечего»; новый дубль — предупреждение, а не запрет.
 * Каждое из них проверено здесь, потому что каждое проверяется дорого: живым
 * переименованием настоящего тега.
 *
 * Запуск: npx tsx scripts/test-rename-dialog.ts
 */
import { applyRename, type RenameApi } from '../src/assistant/renameDialog';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const validate = (code: string) => {
  const c = code.trim();
  if (!c) return { ok: false, code: c, error: 'Код пустой' };
  if (/\s/.test(c)) return { ok: false, code: c, error: 'В коде тега не должно быть пробелов' };
  return { ok: true, code: c };
};

const api = (over: Partial<RenameApi> = {}): RenameApi & { renamed: string[] } => {
  const renamed: string[] = [];
  return {
    validate,
    countSame: async () => 0,
    rename: async (_id, code) => { renamed.push(code); },
    ...over,
    renamed,
  } as any;
};

const ask = { tagId: 't1', oldCode: 'AHU-1' };

(async () => {
  console.log('Неверный код');
  {
    const a = api();
    const out = await applyRename(ask, 'AHU 1', a);
    check('остаёмся в диалоге', out.kind === 'retry', out);
    check('причина названа', out.text.includes('пробел'), out.text);
    check('и подсказано, как выйти', out.text.includes('отмена'), out.text);
    check('тег не тронут', a.renamed.length === 0, a.renamed);
  }

  console.log('Тот же самый код');
  {
    const a = api();
    const out = await applyRename(ask, 'AHU-1', a);
    check('это не ошибка', out.kind === 'same', out);
    check('и не переименование', a.renamed.length === 0, a.renamed);
  }

  console.log('Обычное переименование');
  {
    const a = api();
    const out = await applyRename(ask, 'AHU-2', a);
    check('сделано', out.kind === 'done', out);
    check('старый и новый код названы', out.text.includes('AHU-1') && out.text.includes('AHU-2'), out.text);
    check('сказано, что связи целы', out.text.includes('вязи'), out.text);
    check('переименован именно он', a.renamed.join() === 'AHU-2', a.renamed);
    check('без лишнего предупреждения', !out.text.includes('дубль'), out.text);
  }

  console.log('Новый дубль — предупреждение, а не запрет');
  {
    const a = api({ countSame: async () => 2 });
    const out = await applyRename(ask, 'AHU-2', a);
    check('всё равно переименовано', out.kind === 'done' && a.renamed.length === 1, { out, r: a.renamed });
    check('но человек предупреждён', out.text.includes('дубль'), out.text);
    check('и названо, сколько их', out.text.includes('2'), out.text);
  }

  console.log('Подсчёт дублей сорвался');
  {
    // Не смогли посчитать — это не повод не переименовывать: человек просил
    // о переименовании, а не о подсчёте
    const a = api({ countSame: async () => { throw new Error('нет сети'); } });
    const out = await applyRename(ask, 'AHU-3', a);
    check('переименование состоялось', out.kind === 'done', out);
    check('о дублях просто промолчали', !out.text.includes('дубль'), out.text);
  }

  console.log('Сервер отказал');
  {
    const a = api({ rename: async () => { throw new Error('тег занят'); } });
    const out = await applyRename(ask, 'AHU-4', a);
    check('отказ назван отказом', out.kind === 'failed', out);
    check('и причина видна человеку', out.text.includes('тег занят'), out.text);
  }

  if (failed) {
    console.error(`\nПровалено проверок: ${failed}`);
    process.exit(1);
  }
  console.log('\nВсе проверки разговора о переименовании пройдены');
})();
