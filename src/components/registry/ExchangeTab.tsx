/**
 * Вкладка «Экспорт и импорт» раздела «Теги».
 *
 * Всё, чем теги попадают в программу и уходят из неё, собрано на одной
 * вкладке. Раньше это было раскидано: мастер импорта и захват с экрана лежали
 * внутри «Подбора» — вкладки про разбор кодов, где их никто не искал, — а
 * выгрузка была не вкладкой, а кнопкой в одном ряду со вкладками и оттого
 * читалась как вкладка, которая не открывается.
 *
 * Вкладка стоит после «Спецификации» — последней в ряду, как в любой
 * программе: сначала работа, потом обмен с внешним миром.
 */
import React from 'react';
import { FileSpreadsheet, Upload, Scissors, Download } from 'lucide-react';

/** Есть ли захват экрана: он живёт в оболочке, в браузере его нет */
export const hasCapture = (): boolean => !!(window as any).electron?.capture;

export default function ExchangeTab({ total, onImport, onExport }: {
  /** Сколько тегов в проекте — чтобы человек видел, что именно уйдёт */
  total: number;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-col @[560px]:flex-row @[560px]:items-center justify-between gap-3 p-5 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-950 border border-emerald-200/70 dark:border-emerald-900/50 rounded-xl shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Импорт тегов из таблицы</h3>
            <p className="text-xs text-slate-500 mt-0.5 max-w-lg">Загрузите Excel в Проводник или вставьте данные и отметьте колонки.</p>
          </div>
        </div>
        <button type="button" data-tour="tag-import-btn"
          onClick={onImport}
          className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-ui cursor-pointer shrink-0"
        >
          <Upload className="w-4 h-4" />
          <span>Открыть мастер импорта</span>
        </button>
      </div>

      <div className="flex flex-col @[560px]:flex-row @[560px]:items-center justify-between gap-3 p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Выгрузка тегов</h3>
            <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
              Файл или буфер обмена, выбранные колонки, все теги или только отмеченные.
              Сейчас в проекте {total}.
            </p>
          </div>
        </div>
        <button type="button"
          onClick={onExport}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-ui cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Выгрузить</span>
        </button>
      </div>

      {/* Захвата нет в браузере: обещать кнопкой то, чего не будет, нельзя */}
      {hasCapture() && (
        <div className="flex flex-col @[560px]:flex-row @[560px]:items-center justify-between gap-3 p-5 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/30 dark:to-slate-950 border border-sky-200/70 dark:border-sky-900/50 rounded-xl shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Захват с экрана</h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
                Программа свернётся в угол экрана. Выделите теги в любом окне — письме, бланке, PDF —
                и скопируйте: пульт увидит буфер сам. Дальше разбор с проверкой, что именно распозналось.
                Горячая клавиша <b>Ctrl+Shift+X</b>.
              </p>
            </div>
          </div>
          <button type="button"
            onClick={() => (window as any).electron?.capture?.start()}
            className="px-5 py-2.5 bg-sky-700 hover:bg-sky-600 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-ui cursor-pointer shrink-0"
          >
            <Scissors className="w-4 h-4" />
            <span>Свернуть и захватить</span>
          </button>
        </div>
      )}
    </div>
  );
}
