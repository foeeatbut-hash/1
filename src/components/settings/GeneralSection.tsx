/**
 * Лист «Общие» в Параметрах: тема, плотность, где искать разделы, живой фон.
 *
 * Вынесен из SettingsScreen отдельным файлом, а не оставлен там: экран уже
 * упирался в потолок размера, и добавить в него ещё один блок значило бы
 * поднять потолок вместо того, чтобы разгрузить файл.
 */
import React from 'react';
import { Sun, Moon } from 'lucide-react';
import SectionShell from './SectionShell';
import ToggleRow from './ToggleRow';
import FluxLogo from '../FluxLogo';

export default function GeneralSection({ theme, toggleTheme, density, setDensity, taskbar, toggleTaskbar }: any) {
  return (
    <SectionShell title="Общие" desc="Внешний вид программы.">
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Тема интерфейса</div>
          {/* Переключатель, а не две залитые кнопки: выбранное состояние
              показывается плашкой, а не полным фирменным цветом. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <button
              type="button"
              onClick={() => { if (theme === 'dark') toggleTheme(); }}
              aria-pressed={theme !== 'dark'}
              className={`py-2 px-2 min-w-0 rounded-lg text-sm font-semibold transition-colors duration-[120ms] flex items-center justify-center gap-2 cursor-pointer ${
                theme !== 'dark' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <Sun className="w-4 h-4" /> Светлая
            </button>
            <button
              type="button"
              onClick={() => { if (theme !== 'dark') toggleTheme(); }}
              aria-pressed={theme === 'dark'}
              className={`py-2 px-2 min-w-0 rounded-lg text-sm font-semibold transition-colors duration-[120ms] flex items-center justify-center gap-2 cursor-pointer ${
                theme === 'dark' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <Moon className="w-4 h-4" /> Тёмная
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Плотность</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Сколько строк помещается на экране. Влияет на таблицы и списки во всех разделах.
          </p>
          {/* Три равные доли ширины вместо ряда по содержимому. Было inline-flex:
              ряд считался по самым длинным подписям, не переносился и не сжимался —
              при узком окне он вылезал за карточку на 47 px, и «Компактно»
              обрезалось. Сетка не может стать шире родителя. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            {([
              { key: 'comfortable', label: 'Просторно' },
              { key: 'standard', label: 'Стандарт' },
              { key: 'compact', label: 'Компактно' },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDensity(opt.key)}
                aria-pressed={density === opt.key}
                title={opt.label}
                className={`min-w-0 truncate py-2 px-2 rounded-lg text-sm font-semibold transition-colors duration-[120ms] cursor-pointer ${
                  density === opt.key ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Где искать разделы</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Панель задач внизу или меню слева. Два одинаковых списка на экране хуже одного,
            поэтому включено что-то одно.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            {([
              { on: true, label: 'Панель задач внизу' },
              { on: false, label: 'Меню слева' },
            ] as const).map((opt) => (
              <button
                key={String(opt.on)}
                type="button"
                onClick={() => { if (taskbar !== opt.on) toggleTaskbar(); }}
                aria-pressed={taskbar === opt.on}
                title={opt.label}
                className={`min-w-0 truncate py-2 px-2 rounded-lg text-sm font-semibold transition-colors duration-[120ms] cursor-pointer ${
                  taskbar === opt.on ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Главный экран и помощник</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Живой фон по времени года и картины в шапке помощника. Если отвлекают — выключите.
          </p>
          <div className="space-y-2">
            <ToggleRow
              storageKey="flux_backdrop"
              event="flux:backdrop-changed"
              title="Фон главного экрана"
              desc="Снег зимой, листья осенью, солнце и луна по времени суток. В день рождения — шарики."
            />
            <ToggleRow
              storageKey="flux_art"
              event="flux:art-changed"
              title="Картины в шапке помощника"
              desc="Ван Гог, Хокусай, да Винчи, Моне, Айвазовский — нарисованы кодом и оживают. Нажатие на полке меняет картину."
            />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">О программе</div>
          <div className="flex items-center gap-3.5">
            <FluxLogo size={46} radius={13} />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Flux
                <span className="font-mono text-xs font-normal text-slate-400 dark:text-slate-500">v{__APP_VERSION__}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Разработка <span className="font-semibold text-slate-600 dark:text-slate-300">Раупова Хусрава</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

// ── Менеджмент: редактор этапов закупки и шаблонов ─────────────────────────────
// Стандартный набор этапов — общий по умолчанию. Дополнительно можно завести
// именованные шаблоны со своими этапами и правилами применения: отделы (классы),
// типы оборудования, категории установок, подстроки обозначения. Отдельным
// тегам шаблон назначается вручную в разделе «Менеджмент».

// Переиспользуемый редактор списка этапов (для стандартного набора и шаблонов)
