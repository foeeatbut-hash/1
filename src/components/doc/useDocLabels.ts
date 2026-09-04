/**
 * Метки документа: хранение, запись и обновление — в одном месте.
 *
 * Правила меток (что считать оторвавшейся, что заменять, как отчитаться) лежат
 * в src/lib/docLabels.ts и проверяются отдельно. Здесь — их жизнь внутри
 * открытого документа: где метки лежат между сохранениями, когда
 * перерисовывается панель и чем метка отличается от обычного текста.
 *
 * Отдельно от редактора, потому что редактор и так самый крупный экран
 * программы, а метки — законченная мысль: их видно целиком.
 */
import { useRef, useState, useMemo } from 'react';
import {
  readLabels, addLabel, labelTitle, planRefresh, refreshReport,
  type DocLabel, type LabelsBinding,
} from '../../lib/docLabels';

export interface DocLabelsHost {
  /** Проект, из которого берутся значения */
  projectId: string;
  /** Текст документа целиком — по нему видно, на месте ли ещё значение метки */
  plainText: () => string;
  /** Замена в документе: движок редактора, а не строки */
  replaceText: (from: string, to: string) => Promise<unknown>;
  /** Сохранить документ вместе с привязками */
  save: (bindings: string) => void;
  say: (message: string, kind: 'success' | 'error' | 'info') => void;
}

export interface DocLabels {
  labels: DocLabel[];
  /** Прочитать метки открытого документа */
  load: (raw: string | null | undefined) => void;
  /** Запомнить вставленное значение как метку */
  record: (value: string, source: { fn: string; args: string[] }) => void;
  /** Перечитать значения из проекта и подставить их в документ */
  refresh: () => Promise<void>;
  /** Привязки строкой — для сохранения документа */
  bindings: () => string;
}

export function useDocLabels(host: DocLabelsHost): DocLabels {
  const ref = useRef<LabelsBinding>({ schemaVersion: 1, labels: [] });
  // Метки живут в ref: их читают обработчики, которым нельзя пересоздаваться.
  // Перерисовку панели поэтому просим явно
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labels = useMemo(() => ref.current.labels, [tick]);

  const bindings = () => JSON.stringify(ref.current);

  const load = (raw: string | null | undefined) => {
    ref.current = readLabels(raw);
    setTick((n) => n + 1);
  };

  const record = (value: string, source: { fn: string; args: string[] }) => {
    ref.current = addLabel(ref.current, {
      id: `lb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fn: source.fn,
      args: source.args,
      value,
      title: labelTitle(source.fn, source.args),
    });
    setTick((n) => n + 1);
  };

  const refresh = async () => {
    const list = ref.current.labels;
    if (!list.length) { host.say('В документе нет меток данных.', 'info'); return; }
    try {
      // Те же серверные функции, что и у формул таблиц: иначе шифр проекта в
      // записке и шифр в ведомости однажды разойдутся
      const r = await fetch('/api/constructor/fn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: host.projectId,
          calls: list.map((l) => ({ fn: l.fn, args: l.args })),
        }),
      });
      const results = r.ok ? ((await r.json()).results || []) : [];
      const fresh: Record<string, string> = {};
      list.forEach((l, i) => { fresh[l.id] = String(results[i] ?? l.value); });

      const plan = planRefresh(host.plainText(), list, fresh);
      for (const item of plan) {
        if (item.state !== 'changed') continue;
        try { await host.replaceText(item.label.value, item.next); } catch (_) { continue; }
        // Метка помнит то, что стоит в документе сейчас: иначе следующее
        // обновление не найдёт себя и решит, что её оторвали
        item.label.value = item.next;
      }
      ref.current = { ...ref.current, labels: list };
      setTick((n) => n + 1);
      host.save(bindings());
      host.say(refreshReport(plan), 'success');
    } catch (_) {
      host.say('Не удалось обновить метки', 'error');
    }
  };

  return { labels, load, record, refresh, bindings };
}
