import React from 'react';
import { rng } from './strokes';

/**
 * Пейзаж на полке: время года, время суток и погода.
 *
 * Зачем он рядом с картинами. Полка — лента 380×96, отношение сторон почти
 * 4:1. Картине такое отношение чужое, и её приходится вставлять в обстановку.
 * А пейзажу лента как раз впору: горизонт, небо, полоса земли — именно так и
 * устроен вид из окна. Поэтому здесь холст занимает всё поле, и мелким ничто
 * не выглядит.
 *
 * Что настоящее, а что нет. Месяц и час программа знает, поэтому время года и
 * время суток — сегодняшние: в январе вечером на полке зимние сумерки. Погоду
 * знать неоткуда — программа работает офлайн, в закрытом контуре, и в интернет
 * за прогнозом не ходит. Поэтому погода перебирается по кругу вместе с
 * картинами: ясно, облачно, дождь, снегопад. Снег предлагается только зимой,
 * а зимой не предлагается дождь — иначе подпись «дождь, зимнее утро» читалась
 * бы как ошибка программы, а не как погода.
 *
 * Всё нарисовано кодом и оживает через CSS-анимации (см. flux-sky-* в
 * src/index.css). Ни картинок, ни запросов.
 */

export const W = 380;
export const H = 96;
/** Линия горизонта. Небу отдано две трети: на ленте важно именно небо. */
const HORIZON = 64;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type DayPart = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'clouds' | 'rain' | 'snow';

export const SEASON_RU: Record<Season, string> = {
  spring: 'весна', summer: 'лето', autumn: 'осень', winter: 'зима',
};
export const PART_RU: Record<DayPart, string> = {
  dawn: 'утро', day: 'день', dusk: 'вечер', night: 'ночь',
};
export const WEATHER_RU: Record<Weather, string> = {
  clear: 'Ясно', clouds: 'Облачно', rain: 'Дождь', snow: 'Снегопад',
};

/** Время года по месяцу — по-русски: зима начинается с декабря. */
export function seasonOf(d: Date = new Date()): Season {
  const m = d.getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

/**
 * Время суток по часу. Границы взяты грубо и одинаково круглый год: считать
 * настоящий восход пришлось бы по широте, а полка — не астрономический
 * календарь.
 */
export function partOf(d: Date = new Date()): DayPart {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 8) return 'dawn';
  if (h < 17) return 'day';
  if (h < 21) return 'dusk';
  return 'night';
}

/** Какая погода уместна в это время года. */
export function weathersFor(season: Season): Weather[] {
  if (season === 'winter') return ['clear', 'clouds', 'snow'];
  if (season === 'autumn') return ['clouds', 'rain', 'clear'];
  return ['clear', 'clouds', 'rain'];
}

/** Подпись под пейзажем: «Дождь · осенний вечер». */
export function sceneryLabel(w: Weather, s: Season, p: DayPart): { title: string; sub: string } {
  const adj: Record<Season, string> = { spring: 'весенн', summer: 'летн', autumn: 'осенн', winter: 'зимн' };
  // Утро и день мужского рода, ночь женского, вечер мужского — окончание
  // подбираем по слову, иначе выходит «зимнее ночь».
  const tail: Record<DayPart, string> = { dawn: 'ее утро', day: 'ий день', dusk: 'ий вечер', night: 'яя ночь' };
  return { title: WEATHER_RU[w], sub: `${adj[s]}${tail[p]}` };
}

/** Тёмный ли вид — от этого зависит цвет подписи поверх него. */
export const sceneryIsDark = (p: DayPart): boolean => p === 'night';

/* ── Палитры ─────────────────────────────────────────────────────────────── */

const SKY: Record<DayPart, [string, string, string]> = {
  dawn: ['#20365e', '#e79a6b', '#ffd7a8'],
  day: ['#3f8fd0', '#8dc4ea', '#d3e9f8'],
  dusk: ['#33265a', '#d6613f', '#f7b96b'],
  night: ['#070d24', '#101c42', '#22305e'],
};

/**
 * Земля в четырёх планах. Дальний светлее и голубее ближнего — так работает
 * воздушная перспектива, и без неё три зелёные полосы читаются как полосы, а
 * не как даль.
 */
const LAND: Record<Season, {
  ridge: string; hill: string; far: string; near: string; tree: string; crown: string; water: string;
}> = {
  spring: { ridge: '#9fb8c4', hill: '#7fb45f', far: '#6ba844', near: '#59993a', tree: '#5b432c', crown: '#8fc95f', water: '#8fbcd6' },
  summer: { ridge: '#93aebd', hill: '#6aa845', far: '#57993a', near: '#427f2e', tree: '#54402a', crown: '#5da33f', water: '#7cb2d2' },
  autumn: { ridge: '#a9aeb0', hill: '#c2a25c', far: '#a98849', near: '#8d6f37', tree: '#4f3a24', crown: '#c9762c', water: '#84a6bb' },
  winter: { ridge: '#c6d4e2', hill: '#eef4fa', far: '#e2eaf3', near: '#f3f8fc', tree: '#4a3e33', crown: '#cfdbe8', water: '#bfd4e4' },
};

/* ── Части картины ───────────────────────────────────────────────────────── */

function Sky({ part }: { part: DayPart }) {
  const [a, b, c] = SKY[part];
  const id = `sky-${part}`;
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="62%" stopColor={b} />
          <stop offset="100%" stopColor={c} />
        </linearGradient>
      </defs>
      <rect width={W} height={HORIZON + 2} fill={`url(#${id})`} />
    </>
  );
}

function Stars() {
  const r = rng(7717);
  const pts = Array.from({ length: 46 }, () => ({
    x: r() * W, y: r() * (HORIZON - 12), s: 0.5 + r() * 0.9, d: r() * 4,
  }));
  return (
    <g>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.s} fill="#fdfbf0"
          className="flux-sky-star" style={{ animationDelay: `${p.d}s` }} />
      ))}
    </g>
  );
}

/** Солнце или луна: высота и место зависят от времени суток. */
function Luminary({ part }: { part: DayPart }) {
  if (part === 'night') {
    return (
      <g className="flux-sky-glow">
        <circle cx={306} cy={20} r={11} fill="#fdf6d8" />
        {/* Тень месяца — вырезаем кругом фона, а не маской: маски в свёрнутой
            панели иногда не пересчитываются и луна остаётся полной */}
        <circle cx={301} cy={17} r={9.5} fill="#0b1230" opacity="0.92" />
      </g>
    );
  }
  const pos: Record<Exclude<DayPart, 'night'>, { x: number; y: number; fill: string }> = {
    dawn: { x: 78, y: 44, fill: '#ffe6a8' },
    day: { x: 300, y: 20, fill: '#fff6cf' },
    dusk: { x: 312, y: 46, fill: '#ffb066' },
  };
  const s = pos[part];
  return (
    <g className="flux-sky-glow">
      <circle cx={s.x} cy={s.y} r={22} fill={s.fill} opacity="0.20" />
      <circle cx={s.x} cy={s.y} r={13} fill={s.fill} opacity="0.42" />
      <circle cx={s.x} cy={s.y} r={8.5} fill={s.fill} />
    </g>
  );
}

/** Облако одной формы, но разного размера — плывёт слева направо. */
function Cloud({ x, y, s, tone, dur, delay }: {
  x: number; y: number; s: number; tone: string; dur: number; delay: number;
}) {
  return (
    <g className="flux-sky-drift" style={{ animationDuration: `${dur}s`, animationDelay: `-${delay}s` }}>
      <g transform={`translate(${x} ${y}) scale(${s})`} fill={tone}>
        <ellipse cx="0" cy="0" rx="17" ry="7" />
        <ellipse cx="-11" cy="2" rx="11" ry="5.5" />
        <ellipse cx="9" cy="2.5" rx="12" ry="6" />
        <ellipse cx="-2" cy="-5" rx="10" ry="6.5" />
      </g>
    </g>
  );
}

function Clouds({ part, heavy }: { part: DayPart; heavy: boolean }) {
  const tone = heavy
    ? (part === 'night' ? '#39415e' : '#8e97a6')
    : (part === 'night' ? '#2a3357' : '#ffffff');
  const op = heavy ? 0.95 : (part === 'night' ? 0.7 : 0.85);
  const set = heavy
    ? [{ x: 60, y: 16, s: 1.5, d: 150 }, { x: 190, y: 11, s: 1.9, d: 190 }, { x: 300, y: 19, s: 1.6, d: 165 }, { x: 130, y: 26, s: 1.2, d: 210 }]
    : [{ x: 90, y: 18, s: 1.0, d: 175 }, { x: 250, y: 13, s: 1.3, d: 220 }, { x: 340, y: 27, s: 0.8, d: 195 }];
  return (
    <g opacity={op}>
      {set.map((c, i) => <Cloud key={i} x={c.x} y={c.y} s={c.s} tone={tone} dur={c.d} delay={i * 37} />)}
    </g>
  );
}

/** Дождь: наклонные штрихи двумя слоями — ближний быстрее дальнего. */
function Rain() {
  const r = rng(3121);
  const layer = (n: number, op: number, wd: number, dur: string) => (
    <g opacity={op} stroke="#b9d6ea" strokeWidth={wd} strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => {
        const x = r() * (W + 40) - 20;
        const y = r() * (HORIZON + 20);
        return (
          <line key={i} x1={x} y1={y} x2={x - 3.5} y2={y + 11}
            className="flux-sky-rain" style={{ animationDuration: dur, animationDelay: `-${(r() * 1.2).toFixed(2)}s` }} />
        );
      })}
    </g>
  );
  return (
    <>
      {layer(46, 0.5, 0.8, '1.1s')}
      {layer(26, 0.8, 1.2, '0.75s')}
    </>
  );
}

/** Снег: хлопья падают и покачиваются. */
function Snow() {
  const r = rng(9043);
  const flakes = Array.from({ length: 54 }, () => ({
    x: r() * W, y: r() * (HORIZON + 24), s: 0.7 + r() * 1.5,
    dur: 5 + r() * 6, delay: r() * 9,
  }));
  return (
    <g fill="#ffffff" opacity="0.92">
      {flakes.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={f.s}
          className="flux-sky-snow"
          style={{ animationDuration: `${f.dur}s`, animationDelay: `-${f.delay}s` }} />
      ))}
    </g>
  );
}

/** Осенние листья — только осенью и только в ясную или облачную погоду. */
function Leaves() {
  const r = rng(5501);
  const items = Array.from({ length: 14 }, () => ({
    x: r() * W, y: 20 + r() * 50, s: 1.6 + r() * 1.6,
    dur: 7 + r() * 6, delay: r() * 10,
    fill: ['#c9762c', '#b4532a', '#d29a3a'][Math.floor(r() * 3)],
  }));
  return (
    <g>
      {items.map((l, i) => (
        <ellipse key={i} cx={l.x} cy={l.y} rx={l.s} ry={l.s * 0.55} fill={l.fill}
          className="flux-sky-leaf"
          style={{ animationDuration: `${l.dur}s`, animationDelay: `-${l.delay}s` }} />
      ))}
    </g>
  );
}

/** Дерево: ствол и крона по времени года. Зимой — голые ветви. */
function Tree({ x, base, h, season, tone }: {
  x: number; base: number; h: number; season: Season; tone: { tree: string; crown: string };
}) {
  const top = base - h;
  if (season === 'winter') {
    return (
      <g stroke={tone.tree} strokeWidth={h * 0.055} strokeLinecap="round" fill="none">
        <line x1={x} y1={base} x2={x} y2={top + h * 0.1} />
        <path d={`M${x} ${top + h * 0.4}l${-h * 0.22} ${-h * 0.2}M${x} ${top + h * 0.55}l${h * 0.24} ${-h * 0.22}`
          + `M${x} ${top + h * 0.22}l${-h * 0.16} ${-h * 0.14}M${x} ${top + h * 0.3}l${h * 0.17} ${-h * 0.16}`} />
      </g>
    );
  }
  const crownR = h * 0.34;
  return (
    <g className="flux-sky-sway" style={{ transformOrigin: `${x}px ${base}px` }}>
      <rect x={x - h * 0.035} y={base - h * 0.62} width={h * 0.07} height={h * 0.62} fill={tone.tree} rx={h * 0.02} />
      <circle cx={x} cy={top + crownR * 1.05} r={crownR} fill={tone.crown} />
      <circle cx={x - crownR * 0.7} cy={top + crownR * 1.55} r={crownR * 0.72} fill={tone.crown} />
      <circle cx={x + crownR * 0.7} cy={top + crownR * 1.5} r={crownR * 0.68} fill={tone.crown} />
      {season === 'spring' && (
        <g fill="#f6c8d8" opacity="0.85">
          <circle cx={x - crownR * 0.5} cy={top + crownR * 0.8} r={crownR * 0.18} />
          <circle cx={x + crownR * 0.45} cy={top + crownR * 1.25} r={crownR * 0.15} />
          <circle cx={x} cy={top + crownR * 1.7} r={crownR * 0.16} />
        </g>
      )}
    </g>
  );
}

/** Кромка леса на дальнем плане — пила из ёлочек, а не ровная линия. */
function TreeLine({ y, tone }: { y: number; tone: string }) {
  const r = rng(4409);
  let d = `M0 ${y + 8}`;
  for (let x = 0; x <= W; x += 7) {
    const h = 3 + r() * 4.5;
    d += `L${x + 3.5} ${y - h}L${x + 7} ${y}`;
  }
  return <path d={`${d}L${W} ${y + 8}z`} fill={tone} opacity="0.55" />;
}

/** Птицы — две-три «галочки» в небе. Только в ясную погоду и не ночью. */
function Birds() {
  return (
    <g stroke="#3f4b57" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.5" className="flux-sky-sway">
      <path d="M196 22c2.5-2.5 4-2.5 6 0M204 20.5c2.5-2.5 4-2.5 6 0" />
      <path d="M228 30c2-2 3.2-2 4.8 0" />
    </g>
  );
}

/**
 * Насколько темнеет земля. Ночью зелень полудня читалась бы как ошибка
 * отрисовки, а не как ночь. Зимой темнеет вдвое слабее: снег отдаёт обратно
 * почти весь свет, и ночное поле под ним остаётся светлее ночного луга —
 * это видно любому, кто выходил зимой во двор.
 */
function dimOf(part: DayPart, season: Season): number {
  if (part === 'night') return season === 'winter' ? 0.68 : 0.42;
  if (part === 'dusk') return season === 'winter' ? 0.88 : 0.78;
  return 1;
}

function Land({ season, part }: { season: Season; part: DayPart }) {
  const c = LAND[season];
  const dim = dimOf(part, season);
  return (
    <g style={{ filter: dim < 1 ? `brightness(${dim})` : undefined }}>
      {/* Дальний хребет — почти цвета неба: это даль, а не земля */}
      <path d={`M0 ${HORIZON - 2}l52-13 34 9 40-14 46 15 52-11 58 13 42-7 26 8v${H}H0z`} fill={c.ridge} opacity="0.7" />
      {/* Кромка леса под хребтом */}
      <TreeLine y={HORIZON} tone={c.hill} />
      {/* Гряда холмов */}
      <path d={`M0 ${HORIZON + 3}q64-13 124-2t128-8 128 7v${H}H0z`} fill={c.hill} />
      {/* Средний план */}
      <path d={`M0 ${HORIZON + 11}q92-8 178 3t202-6v${H}H0z`} fill={c.far} />
      {/* Река уходит к горизонту: она и даёт глубину, и разбивает
          три одинаковые полосы, из-за которых пейзаж читался плоским */}
      <path d={`M158 ${HORIZON + 6}c-6 8-22 13-40 18s-40 8-52 12h132c-8-6-14-12-16-20s-14-14-24-10z`}
        fill={c.water} opacity="0.9" />
      <path d={`M158 ${HORIZON + 6}c-6 8-22 13-40 18s-40 8-52 12`} stroke="#ffffff" strokeWidth="0.7" fill="none" opacity="0.35" />
      {/* Ближний луг */}
      <path d={`M0 ${HORIZON + 22}q70 5 150 1t230 4v${H}H0z`} fill={c.near} />
      {/* Деревья: чем ближе, тем крупнее */}
      <Tree x={214} base={HORIZON + 9} h={13} season={season} tone={c} />
      <Tree x={44} base={HORIZON + 13} h={19} season={season} tone={c} />
      <Tree x={332} base={HORIZON + 19} h={27} season={season} tone={c} />
      <Tree x={278} base={HORIZON + 28} h={34} season={season} tone={c} />
    </g>
  );
}

/** Лужи с рябью — только под дождём. */
function Puddles() {
  return (
    <g fill="#9fc4dc" opacity="0.55">
      <ellipse cx="96" cy={HORIZON + 24} rx="24" ry="3.4" className="flux-sky-ripple" />
      <ellipse cx="262" cy={HORIZON + 28} rx="30" ry="4" className="flux-sky-ripple" style={{ animationDelay: '1.1s' }} />
    </g>
  );
}

/** Сугробы — только когда идёт снег или стоит зима. */
function Drifts() {
  return (
    <g fill="#f6fafd" opacity="0.9">
      <ellipse cx="70" cy={HORIZON + 26} rx="46" ry="7" />
      <ellipse cx="250" cy={HORIZON + 30} rx="58" ry="8" />
      <ellipse cx="360" cy={HORIZON + 24} rx="34" ry="6" />
    </g>
  );
}

export interface SceneryProps {
  season: Season;
  part: DayPart;
  weather: Weather;
}

/** Весь вид целиком. */
export function Scenery({ season, part, weather }: SceneryProps) {
  const overcast = weather === 'rain' || weather === 'snow';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <Sky part={part} />
      {part === 'night' && weather !== 'snow' && weather !== 'rain' && <Stars />}
      {!overcast && <Luminary part={part} />}
      {(weather !== 'clear' || part === 'day') && <Clouds part={part} heavy={overcast} />}
      {weather === 'clear' && part !== 'night' && <Birds />}
      <Land season={season} part={part} />
      {/* Сугробы и лужи лежат на земле, значит и темнеют вместе с ней. Раньше
          они рисовались поверх и ночью светились белыми пятнами. */}
      <g style={{ filter: dimOf(part, season) < 1 ? `brightness(${dimOf(part, season)})` : undefined }}>
        {(season === 'winter' || weather === 'snow') && <Drifts />}
        {weather === 'rain' && <Puddles />}
      </g>
      {weather === 'rain' && <Rain />}
      {weather === 'snow' && <Snow />}
      {season === 'autumn' && !overcast && <Leaves />}
      {/* Мягкое затемнение по краям: лента шире экрана внимания, и без него
          края спорят с текстом переписки под полкой */}
      <rect width={W} height={H} fill="url(#scenery-vig)" />
      <defs>
        <radialGradient id="scenery-vig" cx="50%" cy="45%" r="72%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.16" />
        </radialGradient>
      </defs>
    </svg>
  );
}
