import React, { useMemo } from 'react';

/**
 * Живой фон главного экрана: время года и время суток.
 *
 * Программой пользуются весь день и весь год, и главный экран — первое, что
 * видит человек утром. Поэтому за плитками идёт небо: зимой снег, весной
 * лепестки, летом тёплая дымка и светлячки ночью, осенью листья и дождь.
 * В день рождения сотрудника вместо времени года — шарики и конфетти.
 *
 * Правила, которые здесь соблюдаются:
 * • фон не мешает работе — низкая насыщенность, никаких резких движений,
 *   плитки всегда впереди и всегда читаемы;
 * • анимация только через transform и opacity, без перерисовки разметки;
 * • при «уменьшить движение» остаётся статичное небо без частиц;
 * • раскладка частиц детерминирована — фон не «прыгает» при перерисовке.
 */

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type DayPart = 'night' | 'dawn' | 'morning' | 'day' | 'evening' | 'dusk';

export function seasonOf(d: Date): Season {
  const m = d.getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export function dayPartOf(d: Date): DayPart {
  const h = d.getHours();
  if (h >= 22 || h < 5) return 'night';
  if (h < 8) return 'dawn';       // рассвет: небо тёплое, солнце низко
  if (h < 11) return 'morning';
  if (h < 17) return 'day';
  if (h < 20) return 'evening';
  return 'dusk';                  // сумерки: солнце село, звёзды ещё не видны
}

export const SEASON_LABEL: Record<Season, string> = {
  winter: 'зима', spring: 'весна', summer: 'лето', autumn: 'осень',
};

/** Одинаковая раскладка при каждой перерисовке: фон не должен «прыгать». */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Небо: пары цветов для светлой и тёмной темы. Держим зелёную ноту программы
// даже в «холодных» сценах — иначе фон выглядит чужим.
const SKY: Record<Season, Record<DayPart, [string, string]>> = {
  winter: {
    night:   ['oklch(0.30 0.05 250)', 'oklch(0.22 0.03 200)'],
    morning: ['oklch(0.93 0.03 230)', 'oklch(0.97 0.02 170)'],
    day:     ['oklch(0.95 0.03 220)', 'oklch(0.98 0.02 165)'],
    evening: ['oklch(0.78 0.06 280)', 'oklch(0.88 0.04 200)'],
    dawn:    ['oklch(0.72 0.07 300)', 'oklch(0.90 0.03 200)'],
    dusk:    ['oklch(0.45 0.06 275)', 'oklch(0.60 0.04 210)'],
  },
  spring: {
    night:   ['oklch(0.32 0.05 260)', 'oklch(0.26 0.04 170)'],
    morning: ['oklch(0.95 0.04 130)', 'oklch(0.97 0.03 165)'],
    day:     ['oklch(0.94 0.05 140)', 'oklch(0.98 0.03 160)'],
    evening: ['oklch(0.84 0.06 60)',  'oklch(0.92 0.04 150)'],
    dawn:    ['oklch(0.88 0.06 45)',  'oklch(0.95 0.04 150)'],
    dusk:    ['oklch(0.52 0.07 285)', 'oklch(0.68 0.05 170)'],
  },
  summer: {
    night:   ['oklch(0.30 0.06 265)', 'oklch(0.24 0.04 200)'],
    morning: ['oklch(0.95 0.05 95)',  'oklch(0.97 0.03 160)'],
    day:     ['oklch(0.93 0.06 100)', 'oklch(0.98 0.03 165)'],
    evening: ['oklch(0.82 0.08 55)',  'oklch(0.93 0.04 130)'],
    dawn:    ['oklch(0.90 0.07 55)',  'oklch(0.96 0.04 155)'],
    dusk:    ['oklch(0.50 0.08 290)', 'oklch(0.66 0.05 180)'],
  },
  autumn: {
    night:   ['oklch(0.30 0.05 280)', 'oklch(0.24 0.03 160)'],
    morning: ['oklch(0.94 0.05 75)',  'oklch(0.97 0.03 150)'],
    day:     ['oklch(0.94 0.05 80)',  'oklch(0.98 0.02 160)'],
    evening: ['oklch(0.80 0.08 50)',  'oklch(0.90 0.04 120)'],
    dawn:    ['oklch(0.86 0.08 40)',  'oklch(0.94 0.04 140)'],
    dusk:    ['oklch(0.48 0.07 300)', 'oklch(0.63 0.05 160)'],
  },
};

const BIRTHDAY_SKY: [string, string] = ['oklch(0.94 0.06 340)', 'oklch(0.97 0.04 165)'];
const BIRTHDAY_SKY_DARK: [string, string] = ['oklch(0.32 0.07 330)', 'oklch(0.24 0.04 180)'];

interface Props {
  /** Точка отсчёта; по умолчанию — сейчас. Параметр нужен для проверок. */
  now?: Date;
  /** День рождения сотрудника: вместо времени года — праздник. */
  birthday?: boolean;
  className?: string;
}

export default function SeasonalBackdrop({ now, birthday, className }: Props) {
  const date = now || new Date();
  const season = seasonOf(date);
  const part = dayPartOf(date);
  const night = part === 'night';

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Частицы считаем один раз на смену сцены
  const particles = useMemo(() => {
    const rnd = seeded(birthday ? 7777 : season.length * 31 + part.length);
    const make = (n: number, fn: (r: () => number, i: number) => React.CSSProperties) =>
      Array.from({ length: n }, (_, i) => fn(rnd, i));

    if (birthday) {
      return {
        kind: 'birthday' as const,
        balloons: make(7, (r, i) => ({
          left: `${6 + i * 13 + r() * 5}%`,
          animationDuration: `${16 + r() * 10}s`,
          animationDelay: `${-r() * 18}s`,
          ['--flux-hue' as any]: `${Math.round(r() * 360)}`,
          transform: `scale(${0.7 + r() * 0.5})`,
        })),
        confetti: make(22, (r) => ({
          left: `${r() * 100}%`,
          width: `${4 + r() * 4}px`,
          height: `${6 + r() * 6}px`,
          animationDuration: `${7 + r() * 7}s`,
          animationDelay: `${-r() * 12}s`,
          ['--flux-hue' as any]: `${Math.round(r() * 360)}`,
        })),
      };
    }
    if (season === 'winter') {
      return {
        kind: 'snow' as const,
        items: make(30, (r) => ({
          left: `${r() * 100}%`,
          width: `${2 + r() * 4}px`,
          height: `${2 + r() * 4}px`,
          opacity: 0.25 + r() * 0.45,
          animationDuration: `${10 + r() * 12}s`,
          animationDelay: `${-r() * 20}s`,
        })),
      };
    }
    if (season === 'spring') {
      return {
        kind: 'petal' as const,
        items: make(18, (r) => ({
          left: `${r() * 100}%`,
          width: `${5 + r() * 5}px`,
          height: `${4 + r() * 3}px`,
          opacity: 0.3 + r() * 0.4,
          animationDuration: `${12 + r() * 12}s`,
          animationDelay: `${-r() * 22}s`,
        })),
      };
    }
    if (season === 'summer') {
      return {
        kind: night ? ('firefly' as const) : ('spark' as const),
        items: make(night ? 14 : 12, (r) => ({
          left: `${r() * 100}%`,
          top: `${15 + r() * 70}%`,
          width: `${3 + r() * 3}px`,
          height: `${3 + r() * 3}px`,
          animationDuration: `${6 + r() * 8}s`,
          animationDelay: `${-r() * 10}s`,
        })),
      };
    }
    // Осень: ноябрь — дождливый месяц, в остальные — листья
    const rainy = date.getMonth() === 10;
    return rainy
      ? {
        kind: 'rain' as const,
        items: make(34, (r) => ({
          left: `${r() * 100}%`,
          height: `${10 + r() * 14}px`,
          opacity: 0.15 + r() * 0.25,
          animationDuration: `${0.9 + r() * 0.9}s`,
          animationDelay: `${-r() * 2}s`,
        })),
      }
      : {
        kind: 'leaf' as const,
        items: make(16, (r) => ({
          left: `${r() * 100}%`,
          width: `${7 + r() * 7}px`,
          height: `${6 + r() * 5}px`,
          opacity: 0.35 + r() * 0.4,
          animationDuration: `${11 + r() * 12}s`,
          animationDelay: `${-r() * 20}s`,
        })),
      };
  }, [season, part, night, birthday, date.getMonth()]);

  const [c1, c2] = birthday ? BIRTHDAY_SKY : SKY[season][part];
  const [d1, d2] = birthday ? BIRTHDAY_SKY_DARK : SKY[season].night;

  const stars = useMemo(() => {
    if (!night || birthday) return [];
    const rnd = seeded(4242);
    return Array.from({ length: 22 }, () => ({
      left: `${rnd() * 100}%`, top: `${rnd() * 55}%`,
      animationDuration: `${2.5 + rnd() * 4}s`, animationDelay: `${-rnd() * 6}s`,
      width: `${1 + rnd() * 2}px`,
    }));
  }, [night, birthday]);

  return (
    <div className={`pointer-events-none select-none overflow-hidden ${className || ''}`} aria-hidden="true">
      {/* Небо: два слоя — для светлой и тёмной темы */}
      <div className="absolute inset-0 dark:hidden opacity-70"
        style={{ background: `linear-gradient(160deg, ${c1} 0%, ${c2} 55%, transparent 100%)` }} />
      <div className="absolute inset-0 hidden dark:block opacity-60"
        style={{ background: `linear-gradient(160deg, ${d1} 0%, ${d2} 55%, transparent 100%)` }} />

      {/* Солнце или луна — у самого края, чтобы не спорить с полем поиска.
          На рассвете и в сумерках светило стоит ниже: так время суток
          читается даже без часов. */}
      {!birthday && (
        <div className="absolute" style={{
          right: '2.5%',
          top: night || part === 'dusk' ? '7%' : part === 'dawn' || part === 'evening' ? '9%' : '3%',
        }}>
          {night ? <Moon /> : <Sun warm={part !== 'day' && part !== 'morning'} />}
        </div>
      )}

      {/* Туман осенним утром и ранней зимой — низкая полоса у горизонта */}
      {!reduced && !birthday && (part === 'dawn' || part === 'morning')
        && (season === 'autumn' || season === 'winter') && (
        <span className="flux-fog" style={{ animationDuration: '70s' }} />
      )}

      {/* Облака: днём небо без них выглядит пустым */}
      {!reduced && !birthday && !night && part !== 'dusk' && (season === 'summer' || season === 'spring') && (
        <>
          <span className="flux-cloud" style={{ top: '12%', width: 170, height: 46, animationDuration: '90s' }} />
          <span className="flux-cloud" style={{ top: '30%', width: 120, height: 34, animationDuration: '130s', animationDelay: '-40s', opacity: 0.5 }} />
        </>
      )}

      {/* Звёзды ночью */}
      {!reduced && stars.map((st, i) => (
        <span key={`star-${i}`} className="flux-star" style={st as React.CSSProperties} />
      ))}

      {/* Частицы времени года */}
      {!reduced && particles.kind === 'snow' && particles.items.map((st, i) => (
        <span key={i} className="flux-snow" style={st} />
      ))}
      {!reduced && particles.kind === 'rain' && particles.items.map((st, i) => (
        <span key={i} className="flux-rain" style={st} />
      ))}
      {!reduced && particles.kind === 'petal' && particles.items.map((st, i) => (
        <span key={i} className="flux-petal" style={st} />
      ))}
      {!reduced && particles.kind === 'leaf' && particles.items.map((st, i) => (
        <span key={i} className="flux-leaf" style={st} />
      ))}
      {!reduced && (particles.kind === 'firefly' || particles.kind === 'spark') && particles.items.map((st, i) => (
        <span key={i} className={particles.kind === 'firefly' ? 'flux-firefly' : 'flux-spark'} style={st} />
      ))}

      {/* День рождения: шарики и конфетти */}
      {!reduced && particles.kind === 'birthday' && (
        <>
          {particles.confetti.map((st, i) => (
            <span key={`c-${i}`} className="flux-confetti" style={st} />
          ))}
          {particles.balloons.map((st, i) => (
            <span key={`b-${i}`} className="flux-balloon" style={st} />
          ))}
        </>
      )}
    </div>
  );
}

function Sun({ warm }: { warm?: boolean }) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="flux-sun">
      <defs>
        <radialGradient id="fluxSunG">
          <stop offset="0%" stopColor={warm ? 'oklch(0.92 0.16 75)' : 'oklch(0.95 0.12 95)'} stopOpacity="0.9" />
          <stop offset="45%" stopColor={warm ? 'oklch(0.88 0.14 70)' : 'oklch(0.93 0.10 100)'} stopOpacity="0.35" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#fluxSunG)" />
      <circle cx="60" cy="60" r="19" fill={warm ? 'oklch(0.90 0.15 72)' : 'oklch(0.95 0.11 98)'} opacity="0.75" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" className="flux-moon">
      <defs>
        <radialGradient id="fluxMoonG">
          <stop offset="0%" stopColor="oklch(0.92 0.03 230)" stopOpacity="0.55" />
          <stop offset="50%" stopColor="oklch(0.80 0.04 250)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
        <mask id="fluxMoonMask">
          <rect width="110" height="110" fill="white" />
          <circle cx="68" cy="42" r="19" fill="black" />
        </mask>
      </defs>
      <circle cx="55" cy="55" r="54" fill="url(#fluxMoonG)" />
      <circle cx="55" cy="52" r="18" fill="oklch(0.94 0.02 240)" opacity="0.8" mask="url(#fluxMoonMask)" />
    </svg>
  );
}
