import React from 'react';
import { field, swirlAngle, blend, type Stroke } from './strokes';

/**
 * Сами холсты — без рамы и без обстановки вокруг.
 *
 * Каждый рисуется в своём отношении сторон: `aspect` — ширина к высоте. Это и
 * есть главное отличие от первой попытки, где холст растягивали в ленту 4,3:1
 * и «Мона Лиза» превращалась в мазок. Обстановка (стена галереи, мольберт,
 * чертёжный стол) живёт отдельно, в stages.tsx, и подставляет холсту место
 * ровно того формата, который он просит.
 *
 * Рисуем в системе координат 0…100·aspect по горизонтали и 0…100 по вертикали.
 * Сцена масштабирует холст целиком, поэтому пропорции не плывут.
 */

export interface Canvas {
  /** Ширина к высоте: 0.66 — вертикальный портрет, 1.5 — горизонтальный пейзаж */
  aspect: number;
  Draw: React.ComponentType;
}

/** Мазки одной группой: одна анимация вместо сотен. */
function Strokes({ list, palette, cls }: { list: Stroke[]; palette: string[]; cls?: string }) {
  return (
    <g className={cls}>
      {list.map((s, i) => {
        const a = (s.a * Math.PI) / 180;
        return (
          <line key={i}
            x1={s.x - Math.cos(a) * s.len / 2} y1={s.y - Math.sin(a) * s.len / 2}
            x2={s.x + Math.cos(a) * s.len / 2} y2={s.y + Math.sin(a) * s.len / 2}
            stroke={palette[s.c % palette.length]} strokeWidth={s.w} strokeLinecap="round" opacity={s.o} />
        );
      })}
    </g>
  );
}

// ── Мона Лиза ────────────────────────────────────────────────────────────────
//
// Портрет 2:3, на полке — примерно 50 на 74 точки. Голова из них занимает
// шестнадцать, глаз — полторы. Мелких примет на таком размере не существует,
// и первая попытка это подтвердила: две точки-глаза и дуга-улыбка дали
// смайлик, а не Джоконду. Нарисованная дуга рта — главный виновник: улыбка у
// Леонардо держится не линией, а тенью в углах рта, и стоит эту линию
// провести, как лицо превращается в значок.
//
// Поэтому здесь не рисунок, а живопись: сфумато. У Леонардо нет ни одного
// видимого мазка и ни одного резкого края — всё построено переходами. В SVG
// это делается размытием по Гауссу: каждая тень кладётся мягким пятном
// поверх основы, и край растворяется. Свет — слева сверху, как в оригинале;
// самое тёмное место — обвод лица справа, поэтому голова «поворачивается» в
// пространстве, а не лежит плоской наклейкой.
//
// Что здесь узнаётся с одного взгляда, в порядке важности: тёмная пирамида
// фигуры, светлый овал лица, провалы глазниц, тень под носом, тёмные уголки
// рта, сложенные руки и разная высота горизонта слева и справа — у Леонардо
// правый горизонт заметно выше левого, и это видно даже в напёрсток.
//
// Лак поверх всего и тёмные углы — не украшение: без них любая векторная
// картинка выглядит только что нарисованной, а не пятисотлетней.
const MONA: Canvas = {
  aspect: 0.68,
  Draw: () => (
    <g>
      <defs>
        {/* Небо: холодное вверху, тёплая дымка у горизонта — воздушная перспектива */}
        <linearGradient id="ml-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8ea19b" />
          <stop offset="55%" stopColor="#aeb49b" />
          <stop offset="100%" stopColor="#c8b98f" />
        </linearGradient>
        {/* Кожа: свет слева сверху, к краям уходит в тень */}
        <radialGradient id="ml-skin" cx="0.38" cy="0.32" r="0.78">
          <stop offset="0%" stopColor="#efd7b2" />
          <stop offset="45%" stopColor="#dfbf95" />
          <stop offset="80%" stopColor="#c09a70" />
          <stop offset="100%" stopColor="#9d7850" />
        </radialGradient>
        <linearGradient id="ml-sleeve" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a98a4a" />
          <stop offset="55%" stopColor="#836a35" />
          <stop offset="100%" stopColor="#5c4a24" />
        </linearGradient>
        <linearGradient id="ml-dress" x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#3d3623" />
          <stop offset="60%" stopColor="#2c2718" />
          <stop offset="100%" stopColor="#1d1a10" />
        </linearGradient>
        {/* Лак: к краям темнеет, как у старой картины под стеклом */}
        <radialGradient id="ml-varnish" cx="0.44" cy="0.36" r="0.72">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="62%" stopColor="#2a1b06" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#241505" stopOpacity="0.42" />
        </radialGradient>
        {/* Три степени размытия: тонкая тень, мягкая тень, дымка дали */}
        <filter id="ml-b1" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <filter id="ml-b2" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id="ml-b3" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>

      {/* ── Пейзаж ──────────────────────────────────────────────────────────
          Горизонт слева ниже, справа выше. Это не небрежность Леонардо, а
          приём: взгляд соскальзывает по разнице и не находит покоя, отчего
          лицо кажется живым. Приём читается даже на пятидесяти точках. */}
      <rect width="68" height="100" fill="url(#ml-sky)" />

      {/* Дальняя гряда — почти цвета неба: это даль, а не земля */}
      <g filter="url(#ml-b2)">
        <path d="M0 48C10 44 18 50 26 46S42 33 68 35V70H0z" fill="#7f9298" opacity="0.85" />
      </g>
      {/* Вода справа: озеро с мостом — вторая половина фона */}
      <path d="M40 40C48 36 58 35 68 37v13c-10 2-20 1-28-2-4-2-4-6 0-8z" fill="#9aa9a2" opacity="0.9" />
      <g filter="url(#ml-b1)" opacity="0.75">
        <path d="M50 41h15" stroke="#6d6a52" strokeWidth="1.6" fill="none" />
        <path d="M52 42v2M56 42v2M60 42v2M64 42v2" stroke="#6d6a52" strokeWidth="0.7" />
      </g>
      {/* Ближние склоны */}
      <path d="M0 58C12 53 20 60 30 55S48 46 68 48v24H0z" fill="#6c7362" opacity="0.9" />
      <path d="M0 70C14 63 24 70 34 66S52 58 68 60v20H0z" fill="#585c40" />
      {/* Дорога слева: та самая петля, уходящая за плечо */}
      <g filter="url(#ml-b1)">
        <path d="M2 74c6-6 3-12 8-16s10-2 12-6" stroke="#a99263" strokeWidth="2.2" fill="none"
          strokeLinecap="round" opacity="0.8" />
      </g>

      {/* Парапет и обрубки колонн по краям — Джоконда сидит на лоджии */}
      <rect y="70" width="68" height="2.4" fill="#4a3f2a" opacity="0.55" />
      <rect x="0" y="52" width="4.5" height="20" fill="#6d5c40" opacity="0.55" />
      <rect x="63.5" y="52" width="4.5" height="20" fill="#6d5c40" opacity="0.55" />

      {/* ── Фигура ──────────────────────────────────────────────────────────
          Пирамида: на ней держится вся композиция. Правое плечо (слева от нас)
          вынесено вперёд — фигура развёрнута вполоборота, а лицо смотрит прямо. */}
      <path d="M32 45c15 0 27 12 32 30 3 9 4 17 4 25H0c0-8 1-16 4-25 5-18 15-30 28-30z" fill="url(#ml-dress)" />
      {/* Рукав: единственное светлое пятно одежды, золотистая охра со складками */}
      <path d="M44 60c9 5 15 15 18 27 1 5 2 9 2 13H44c1-14 1-28 0-40z" fill="url(#ml-sleeve)" />
      <g stroke="#6b562a" strokeWidth="0.8" fill="none" opacity="0.7" filter="url(#ml-b1)">
        <path d="M47 66c5 5 8 13 10 22M51 64c4 6 7 14 8 24" />
      </g>
      {/* Вырез платья и грудь. Светлее одежды, но заметно темнее лица: на первой
          попытке грудь была почти цвета лица и читалась нагрудником. */}
      <path d="M23 50c6 6 13 6 19 0 3 5 4 9 4 13-9 5-18 5-27 0 0-4 1-8 4-13z" fill="#a9825c" />
      <g filter="url(#ml-b3)">
        <path d="M22 54c6 7 15 7 21 0 2 4 3 7 3 10-9 5-18 5-27 0 0-3 1-6 3-10z" fill="#6d4e33" opacity="0.75" />
      </g>
      {/* Тесьма по вырезу — деталь, что отличает платье от халата */}
      <path d="M23 50c6 7 14 7 20 0" stroke="#5e4a2c" strokeWidth="1" fill="none" opacity="0.8" />

      {/* ── Голова ──────────────────────────────────────────────────────── */}
      {/* Шея с тенью от подбородка */}
      <path d="M27 36h11v14c-4 3-8 3-11 0z" fill="#c49b71" />
      <g filter="url(#ml-b2)">
        <ellipse cx="32" cy="40" rx="7" ry="3.4" fill="#7d5a3a" opacity="0.65" />
      </g>

      {/* Волосы подковой вокруг лица, а не двумя брусками сбоку и не колоколом
          на всю фигуру. Обе крайности уже проверены: бруски читались наушниками,
          колокол — рясой, под которой пропадали и грудь, и плечи. У Леонардо
          волосы держатся близко к лицу, шириной в палец у висков, и кончаются
          на уровне плеч.
          Наружный край размыт: у Леонардо волосы растворяются в фоне, и резкая
          граница сразу выдаёт рисованную картинку. */}
      <g filter="url(#ml-b2)" opacity="0.8">
        <path d="M32 13.4c-7.6 0-12.6 5.8-13.8 14.6-1 7.6-.9 15.4.3 22.2.4 2.4 1 4.2 1.7 5.4l4.4-1.2
                 c-1.6-4.4-2.5-10.4-2.5-16.4 0-9.4 3.7-16.8 9.9-16.8s9.9 7.4 9.9 16.8c0 6-.9 12-2.5 16.4l4.4 1.2
                 c.7-1.2 1.3-3 1.7-5.4 1.2-6.8 1.3-14.6.3-22.2C44.6 19.2 39.6 13.4 32 13.4z" fill="#241a10" />
      </g>
      <path d="M32 14.6c-6.9 0-11.4 5.4-12.5 13.6-1 7.2-.9 14.6.3 21 .3 1.9.8 3.4 1.3 4.4l3.3-.9
               c-1.5-4.2-2.3-9.9-2.3-15.6 0-9 3.5-16.1 9.9-16.1s9.9 7.1 9.9 16.1c0 5.7-.8 11.4-2.3 15.6l3.3.9
               c.5-1 1-2.5 1.3-4.4 1.2-6.4 1.3-13.8.3-21C43.4 20 38.9 14.6 32 14.6z" fill="#2b1f14" />
      {/* Пряди по внешнему краю — иначе масса читается шапкой */}
      <g filter="url(#ml-b1)" opacity="0.45">
        <path d="M21.4 28c-.8 8-.7 16 .6 22M24.4 26.6c-.8 8-.7 15.6 .3 21.4M42.6 28c.8 8 .7 16-.6 22M39.6 26.6c.8 8 .7 15.6-.3 21.4"
          stroke="#4a3520" strokeWidth="0.7" fill="none" />
      </g>

      {/* Лицо. Шире и короче прежнего: у Джоконды лицо полное, а вытянутый овал
          сразу превращает его в чужое. */}
      <ellipse cx="32" cy="28.5" rx="8.8" ry="10.2" fill="url(#ml-skin)" />

      {/* Лоб и скула слева — свет. Кладём размытым пятном, а не бликом:
          у Леонардо нет ни одного резкого края. */}
      <g filter="url(#ml-b2)">
        <ellipse cx="29" cy="22" rx="4.6" ry="3.4" fill="#f6e2c2" opacity="0.55" />
        <ellipse cx="28" cy="31" rx="3" ry="2.4" fill="#f0d5b0" opacity="0.4" />
      </g>
      {/* Обвод справа — самое тёмное на лице: голова поворачивается в тень */}
      <g filter="url(#ml-b2)">
        <path d="M40 22c2 5 2 11 0 16-2 4-5 6-8 7 5-1 8-4 9-9 1-5 1-10-1-14z" fill="#7a5735" opacity="0.75" />
      </g>

      {/* Волосы надо лбом: пробор посередине, пряди опускаются к вискам */}
      <path d="M23.6 27c-.6-7 3-13 8.4-13s9 6 8.4 13c-1-6-4-9-8.4-9s-7.4 3-8.4 9z" fill="#2f2115" />
      <g filter="url(#ml-b1)">
        <path d="M23.6 26c1-6 4-9 8.4-9s7.4 3 8.4 9" stroke="#4a3520" strokeWidth="0.8" fill="none" opacity="0.6" />
      </g>
      {/* Вуаль: еле различимая, но она есть — по ней Джоконду и узнают вблизи */}
      <g filter="url(#ml-b1)" opacity="0.16">
        <path d="M23 24c2-7 5-10 9-10s7 3 9 10c-1 12-3 22-5 28h-8c-2-6-4-16-5-28z" fill="#f3ead6" />
      </g>

      {/* Глазницы — мягкие тени, а не точки. Именно они читаются на 74 точках */}
      <g filter="url(#ml-b1)">
        <ellipse cx="28.4" cy="26.6" rx="2.6" ry="1.5" fill="#9a7248" opacity="0.6" />
        <ellipse cx="35.6" cy="26.4" rx="2.6" ry="1.5" fill="#8a6440" opacity="0.65" />
      </g>
      {/* Глаза: миндалины с тёмной радужкой и тенью верхнего века */}
      <g>
        <path d="M26.2 26.8c1.4-1.5 3.4-1.5 4.6 0-1.2 1.3-3.2 1.3-4.6 0z" fill="#e9d6ba" />
        <path d="M33.4 26.6c1.3-1.5 3.3-1.5 4.6 0-1.3 1.3-3.3 1.3-4.6 0z" fill="#e2cdb0" />
        {/* Радужка мелкая: крупная делает взгляд вытаращенным, а у Джоконды он
            спокойный. Обе смотрят чуть левее зрителя — как в оригинале. */}
        <circle cx="28.3" cy="26.8" r="0.82" fill="#543d24" />
        <circle cx="35.5" cy="26.6" r="0.78" fill="#4b3520" />
        <circle cx="28.1" cy="26.6" r="0.24" fill="#fff8ea" opacity="0.7" />
        <circle cx="35.3" cy="26.4" r="0.22" fill="#fff8ea" opacity="0.6" />
        {/* Верхнее веко даёт глазу глубину — без него глаз плоский */}
        <path d="M26.2 26.5c1.4-1.7 3.4-1.7 4.7-.1M33.4 26.3c1.3-1.7 3.3-1.7 4.6-.1"
          stroke="#6b4c2e" strokeWidth="0.55" fill="none" strokeLinecap="round" opacity="0.85" />
      </g>
      {/* Бровей у Джоконды нет — это её примета, поэтому здесь их и не рисуем */}

      {/* Нос: тень по правой грани, лёгкий свет на спинке, тень под кончиком */}
      <g filter="url(#ml-b1)">
        <path d="M32.6 27c.9 2.4 1.4 4.4 1.4 5.8 0 .9-.5 1.5-1.4 1.9" fill="none"
          stroke="#9a7047" strokeWidth="1.1" opacity="0.6" />
        <ellipse cx="32" cy="34.2" rx="2" ry="0.8" fill="#8a6340" opacity="0.55" />
      </g>
      <g filter="url(#ml-b1)" opacity="0.5">
        <path d="M31.4 28c-.3 2-.5 3.6-.4 4.8" stroke="#f2dbb8" strokeWidth="0.9" fill="none" />
      </g>

      {/* Рот. Дуги-улыбки здесь нет и не будет: улыбка Джоконды — это две
          размытые тени в углах и мягкий свет на нижней губе. Стоит провести
          линию, и получится смайлик — так и было в первой попытке. */}
      <g filter="url(#ml-b1)">
        <path d="M28.6 36.4c2.2.7 4.6.7 6.8 0" stroke="#9b6a4e" strokeWidth="0.85" fill="none" opacity="0.75" />
      </g>
      <g filter="url(#ml-b2)">
        <ellipse cx="28.3" cy="36.5" rx="1.5" ry="1.1" fill="#7d5236" opacity="0.55" />
        <ellipse cx="35.7" cy="36.3" rx="1.5" ry="1.1" fill="#7d5236" opacity="0.5" />
      </g>
      <g filter="url(#ml-b1)" opacity="0.45">
        <ellipse cx="32" cy="37.6" rx="2.4" ry="0.9" fill="#f0d3ae" />
      </g>
      {/* Тень под нижней губой и мягкий подбородок */}
      <g filter="url(#ml-b2)">
        <ellipse cx="32" cy="39.2" rx="2.6" ry="1.1" fill="#8d6541" opacity="0.45" />
      </g>

      {/* ── Руки ────────────────────────────────────────────────────────────
          Вторая по узнаваемости примета после лица: правая кисть лежит поверх
          левого запястья. Пальцы намечены тремя размытыми ложбинками, а не
          линиями: на первой попытке ровная штриховка превращала кисть в
          плетёную корзину. */}
      <g>
        {/* Предплечье уходит вправо, под рукав */}
        <path d="M14 92c8-4 18-5 27-3 4 1 7 2 9 4v9H14z" fill="#b98f66" />
        <g filter="url(#ml-b3)">
          <path d="M16 94c8-3 18-4 26-2 4 1 7 2 9 4" stroke="#8a6440" strokeWidth="3" fill="none" opacity="0.55" />
        </g>

        {/* Кисть поверх предплечья: тыльная сторона, свет сверху слева */}
        <path d="M19 83c5-2.6 11-2.6 15.6-.2 2.8 1.5 4.2 3.7 4 6-.2 2.2-1.9 3.7-4.3 4.1-5.5 1-11 1-15.6-.5
                 -2.2-.7-3.3-2.4-3.1-4.6.2-2.2 1.5-3.9 3.4-4.8z" fill="#dcb78c" />
        <g filter="url(#ml-b2)">
          <ellipse cx="26" cy="85.4" rx="6.6" ry="1.9" fill="#f4e0c0" opacity="0.5" />
        </g>
        {/* Ложбинки между пальцами — три, размытые и слабые */}
        <g filter="url(#ml-b1)" opacity="0.42">
          <path d="M22.6 85.6c-.3 2.4-.4 4.4-.2 6M26.4 85.2c-.2 2.5-.2 4.6 0 6.2M30.2 85.6c.1 2.4.2 4.4.4 5.8"
            stroke="#9d7148" strokeWidth="0.8" fill="none" />
        </g>
        {/* Костяшки: три светлых точки, тоже размытые */}
        <g filter="url(#ml-b1)" opacity="0.4">
          <ellipse cx="24.5" cy="84.6" rx="1.5" ry="0.7" fill="#f6e6c9" />
          <ellipse cx="28.4" cy="84.3" rx="1.5" ry="0.7" fill="#f6e6c9" />
          <ellipse cx="32.2" cy="84.8" rx="1.3" ry="0.7" fill="#f6e6c9" />
        </g>
        {/* Большой палец сбоку — по нему кисть и опознаётся как кисть */}
        <path d="M17.6 88.4c-1.8.6-3 1.8-3.4 3.2-.3 1.1.4 2 1.6 1.9 1.5-.2 2.9-1.2 3.8-2.6z" fill="#cfa87e" />
        {/* Тень от кисти на предплечье: без неё рука висит в воздухе */}
        <g filter="url(#ml-b2)">
          <ellipse cx="27" cy="94.6" rx="11" ry="2.2" fill="#5a3f24" opacity="0.5" />
        </g>
      </g>

      {/* ── Лак ─────────────────────────────────────────────────────────────
          Тёплая плёнка поверх всего и потемнение к углам. Это то, чем старая
          картина отличается от только что нарисованной: единый тон, съедающий
          разницу между небом, платьем и кожей. */}
      <rect width="68" height="100" fill="#6b4a1e" opacity="0.09" />
      <rect width="68" height="100" fill="url(#ml-varnish)" />
    </g>
  ),
};

// ── Крик ─────────────────────────────────────────────────────────────────────
// Мунк, 1893. Самая узнаваемая работа набора на маленьком размере: небо
// полосами, мост по диагонали и фигура с ладонями у лица читаются мгновенно.
const SCREAM: Canvas = {
  aspect: 0.78,
  Draw: () => (
    <g>
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8622a" /><stop offset="35%" stopColor="#f08a2e" />
          <stop offset="70%" stopColor="#e0a23c" /><stop offset="100%" stopColor="#9c6a3a" />
        </linearGradient>
      </defs>
      <rect width="78" height="100" fill="url(#sc-sky)" />
      {/* Небо волнами */}
      <g stroke="#c8451f" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" className="flux-art-breathe">
        <path d="M-6 10c16 7 30-6 44 0s24 6 46-2" />
        <path d="M-6 22c18 6 28-7 44-1s26 7 46-3" />
        <path d="M-6 34c16 6 30-6 44 0s26 6 46-2" />
      </g>
      {/* Фьорд */}
      <path d="M0 48c14 6 26 2 38-4s26-8 40-2v34H0z" fill="#1f3f66" />
      <path d="M0 58c14 5 26 1 38-4s26-6 40-2v30H0z" fill="#16305a" opacity="0.85" />
      <g stroke="#2b5a8c" strokeWidth="2" fill="none" opacity="0.6" className="flux-art-breathe-slow">
        <path d="M0 56c14 5 26 1 38-4s26-6 40-2" />
        <path d="M0 66c14 4 26 0 38-5s26-5 40-1" />
      </g>
      {/* Мост по диагонали — вторая опора композиции */}
      <path d="M0 100V72l78-34v10L14 100z" fill="#6b4a2c" />
      <path d="M0 74l78-34" stroke="#3d2a18" strokeWidth="2" fill="none" />
      <path d="M12 100L78 48" stroke="#8a6440" strokeWidth="1.6" fill="none" opacity="0.7" />
      {/* Две фигуры вдали */}
      <g fill="#1c1a20" opacity="0.85">
        <path d="M58 44c2 0 3 2 3 5v9h-6v-9c0-3 1-5 3-5z" /><circle cx="58" cy="42" r="2.4" />
        <path d="M67 40c2 0 3 2 3 4v8h-6v-8c0-2 1-4 3-4z" /><circle cx="67" cy="38" r="2.2" />
      </g>
      {/* Кричащий */}
      <g className="flux-art-scream">
        <path d="M26 56c7 0 12 7 13 16 1 8 2 18 2 28H12c0-10 1-20 2-28 1-9 5-16 12-16z" fill="#2b2436" />
        <ellipse cx="26" cy="50" rx="9" ry="12" fill="#d8c39a" />
        <ellipse cx="22" cy="47" rx="1.6" ry="2.4" fill="#3a2c1c" />
        <ellipse cx="30" cy="47" rx="1.6" ry="2.4" fill="#3a2c1c" />
        <ellipse cx="26" cy="57" rx="2.8" ry="4.4" fill="#3a2c1c" />
        {/* Ладони у лица */}
        <path d="M15 50c-2 2-2 7 0 10 2 2 4 1 4-2s-1-7-4-8zM37 50c2 2 2 7 0 10-2 2-4 1-4-2s1-7 4-8z" fill="#d8c39a" />
      </g>
    </g>
  ),
};

// ── Звёздная ночь ────────────────────────────────────────────────────────────
const SN_SKY = ['#1e3f8f', '#2b56b0', '#16306e', '#4a7ad8', '#0f2455'];
const SN_LIGHT = ['#cfe0ff', '#9dbcff', '#eef4ff'];
const snFlow = blend([
  { cx: 46, cy: 28, angle: swirlAngle(46, 28), power: 700 },
  { cx: 104, cy: 20, angle: swirlAngle(104, 20, 8), power: 560 },
]);
const snSkip = (x: number, y: number) => x < 26 && Math.abs(x - 12) < 12 - (y / 100) * 3;
const STARRY: Canvas = {
  aspect: 1.26,
  Draw: () => {
    const base = field({
      seed: 7, count: 300, x0: -4, y0: -4, x1: 130, y1: 76,
      angle: (x, y, r) => snFlow(x, y) + (r() - 0.5) * 14,
      len: [6, 15], w: [1.8, 3.6], colors: SN_SKY.length, opacity: [0.6, 1], skip: snSkip,
    });
    const hi = field({
      seed: 21, count: 90, x0: -4, y0: -4, x1: 130, y1: 68,
      angle: (x, y, r) => snFlow(x, y) + (r() - 0.5) * 10,
      len: [5, 12], w: [1, 2.2], colors: SN_LIGHT.length, opacity: [0.3, 0.7], skip: snSkip,
    });
    const stars: Array<[number, number, number]> = [
      [34, 14, 2.6], [68, 10, 2.0], [88, 26, 2.2], [112, 16, 1.9], [120, 44, 1.6], [54, 34, 1.7],
    ];
    return (
      <g>
        <defs>
          <radialGradient id="sn-halo">
            <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ffd76a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffd76a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="126" height="100" fill="#0d1f4d" />
        <Strokes list={base} palette={SN_SKY} cls="flux-art-breathe" />
        <Strokes list={hi} palette={SN_LIGHT} cls="flux-art-breathe-slow" />
        {stars.map(([x, y, r], i) => (
          <g key={i} className="flux-art-twinkle" style={{ animationDelay: `${(i % 3) * 0.9}s` }}>
            <circle cx={x} cy={y} r={r * 4} fill="url(#sn-halo)" />
            <circle cx={x} cy={y} r={r} fill="#fff6d5" />
          </g>
        ))}
        <g className="flux-art-pulse">
          <circle cx="112" cy="16" r="13" fill="url(#sn-halo)" />
          <path d="M116 10a7 7 0 1 0 0 12 8 8 0 0 1 0-12z" fill="#ffe9a8" />
        </g>
        {/* Холмы и деревня со шпилем */}
        <path d="M0 72c18-6 34 4 52 0s38-8 74-2v30H0z" fill="#101f42" />
        <path d="M0 80c22-4 44 3 66 1s40-4 60-1v20H0z" fill="#0a1430" />
        <g fill="#060d20">
          <rect x="54" y="76" width="8" height="6" /><rect x="66" y="78" width="6" height="4" />
          <path d="M78 82V68l4-8 4 8v14z" />
        </g>
        <g fill="#f7cf72" className="flux-art-flicker">
          <rect x="56" y="78" width="2" height="2" /><rect x="68" y="79" width="1.6" height="1.6" />
        </g>
        {/* Кипарис */}
        <g className="flux-art-sway" style={{ transformOrigin: '12px 100px' }}>
          <path d="M12 100C4 92 1 74 3 54 4 40 8 28 11 18c1-2 2-2 3 0 4 10 8 22 9 36 2 20-3 38-11 46z" fill="#050a18" />
        </g>
      </g>
    );
  },
};

// ── Большая волна в Канагаве ─────────────────────────────────────────────────
const WAVE: Canvas = {
  aspect: 1.46,
  Draw: () => (
    <g>
      <defs>
        <linearGradient id="gw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efe6cf" /><stop offset="100%" stopColor="#dbcba6" />
        </linearGradient>
        <linearGradient id="gw-deep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#245a8c" /><stop offset="100%" stopColor="#0a2440" />
        </linearGradient>
      </defs>
      <rect width="146" height="100" fill="url(#gw-sky)" />
      {/* Фудзи */}
      <g>
        <path d="M92 74l22-22 22 22z" fill="#3d5772" />
        <path d="M106 60l8-8 8 8c-5 2-11 2-16 0z" fill="#f4f1e8" />
      </g>
      {/* Дальняя волна */}
      <path d="M60 78c22-12 44-8 60 2 12 7 22 9 26 6v14H60z" fill="#2a5b86" opacity="0.6" className="flux-art-wave-far" />
      {/* Главный вал */}
      <g className="flux-art-wave">
        <path d="M-14 100C-8 44 16 8 60 4c40-4 70 22 82 52 4 12 6 30 5 44z" fill="url(#gw-deep)" />
        <path d="M-6 100C0 52 20 18 60 15c36-3 62 22 72 48 4 10 6 24 5 37z" fill="#245a8c" />
        <path d="M2 100c4-40 20-68 58-71 32-2 54 22 62 46 3 8 5 17 4 25z" fill="#3572a8" opacity="0.8" />
        <g fill="#f7f4ea">
          <g className="flux-art-foam">
            <path d="M60 4c16-5 32-2 44 8-12-2-22 3-28 13-4-9-9-17-16-21z" />
            <path d="M112 22c14 4 24 14 30 27-9-8-19-9-29-4-1-8-1-16-1-23z" />
            <path d="M22 12c12-7 26-10 40-9-13 5-22 13-28 25-4-6-8-11-12-16z" />
          </g>
          <g className="flux-art-foam" style={{ animationDelay: '1.2s' }}>
            <path d="M4 40c9-10 21-16 34-18-12 7-20 18-24 32-4-5-7-9-10-14z" opacity="0.9" />
          </g>
        </g>
      </g>
      {/* Лодки */}
      <g fill="#2f3f55" className="flux-art-bob"><path d="M74 86c11-4 30-4 40 0-6 5-34 5-40 0z" /></g>
      <path d="M0 96c26-4 50 3 78 1s44-3 68-1v4H0z" fill="#0a2440" />
    </g>
  ),
};

// ── Подсолнухи ───────────────────────────────────────────────────────────────
// Жёлтое на жёлтом — то, чем эта работа и знаменита. Цветы покачиваются.
const SUNFLOWERS: Canvas = {
  aspect: 0.8,
  Draw: () => {
    const heads = [
      { x: 24, y: 26, r: 9, t: 0 }, { x: 44, y: 20, r: 8, t: 0.6 }, { x: 60, y: 30, r: 8.5, t: 1.2 },
      { x: 16, y: 42, r: 7, t: 0.3 }, { x: 38, y: 38, r: 9.5, t: 0.9 }, { x: 58, y: 48, r: 7, t: 1.5 },
      { x: 28, y: 52, r: 6.5, t: 0.4 },
    ];
    return (
      <g>
        <rect width="80" height="100" fill="#d8b35a" />
        <rect y="70" width="80" height="30" fill="#b98f3c" />
        <line x1="0" y1="70" x2="80" y2="70" stroke="#8d6a26" strokeWidth="1.2" />
        {/* Стебли */}
        <g stroke="#7d8a3a" strokeWidth="2" fill="none" strokeLinecap="round" className="flux-art-sway" style={{ transformOrigin: '40px 88px' }}>
          {heads.map((h, i) => <path key={i} d={`M40 84C${(40 + h.x) / 2} ${(84 + h.y) / 2} ${h.x} ${h.y + 14} ${h.x} ${h.y + h.r}`} />)}
        </g>
        {/* Цветы */}
        <g className="flux-art-sway" style={{ transformOrigin: '40px 88px' }}>
          {heads.map((h, i) => (
            <g key={i} className="flux-art-bloom" style={{ animationDelay: `${h.t}s` }}>
              {Array.from({ length: 12 }, (_, k) => {
                const a = (k / 12) * Math.PI * 2;
                return <ellipse key={k} cx={h.x + Math.cos(a) * h.r * 0.95} cy={h.y + Math.sin(a) * h.r * 0.95}
                  rx={h.r * 0.42} ry={h.r * 0.2} fill={k % 2 ? '#f0c33c' : '#e8a92a'}
                  transform={`rotate(${(a * 180) / Math.PI} ${h.x + Math.cos(a) * h.r * 0.95} ${h.y + Math.sin(a) * h.r * 0.95})`} />;
              })}
              <circle cx={h.x} cy={h.y} r={h.r * 0.52} fill="#7a5518" />
              <circle cx={h.x} cy={h.y} r={h.r * 0.3} fill="#5c3d10" />
            </g>
          ))}
        </g>
        {/* Ваза */}
        <path d="M28 84c0-8 1-14 2-18h20c1 4 2 10 2 18 0 6-24 6-24 0z" fill="#dcae4e" />
        <path d="M30 74h20" stroke="#a8802c" strokeWidth="1.4" />
        <path d="M30 66h20c1 4 2 10 2 18" fill="none" stroke="#a8802c" strokeWidth="0.9" opacity="0.6" />
      </g>
    );
  },
};

// ── Сотворение Адама ─────────────────────────────────────────────────────────
// Микеланджело, свод Сикстинской капеллы. Из всей фрески узнают две руки —
// их и берём: формат 2:1 сам просится в раму на стене.
//
// Первая попытка дала бежевое пятно: руки телесного цвета на телесном фоне
// при высоте 58 точек не читались вовсе. Поэтому фон уведён в тень, руки
// обведены и повёрнуты так, чтобы силуэт узнавался с одного взгляда, а зазор
// между пальцами — самое светлое место картины.
const ADAM: Canvas = {
  aspect: 2.0,
  Draw: () => (
    <g>
      <defs>
        <linearGradient id="ad-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d5b41" /><stop offset="55%" stopColor="#8a7454" />
          <stop offset="100%" stopColor="#5d4c36" />
        </linearGradient>
        <radialGradient id="ad-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff7e2" stopOpacity="1" />
          <stop offset="55%" stopColor="#ffe9b8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffe9b8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ad-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f2d9b6" /><stop offset="100%" stopColor="#d0a97e" />
        </linearGradient>
      </defs>
      <rect width="200" height="100" fill="url(#ad-bg)" />
      {/* Плащ Бога справа — красная масса, вторая опора композиции */}
      <path d="M200 4c-30 1-54 12-70 28-8 8-11 20-6 30 8 16 28 26 50 30 9 2 18 3 26 3z" fill="#9c4436" opacity="0.75" />
      <path d="M200 14c-24 1-44 10-57 23-7 7-9 16-5 24 7 13 23 21 41 25 7 1 14 2 21 2z" fill="#b0574a" opacity="0.5" />
      {/* Тело Адама слева — тёмная масса, на её фоне рука светится */}
      <path d="M0 100c4-30 22-52 48-58 12-3 22-1 30 4v54z" fill="#3b3226" />

      {/* Рука Адама: плечо слева внизу, кисть тянется вправо и вверх */}
      <g fill="url(#ad-skin)" stroke="#6b4a2c" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M6 92c6-14 18-24 34-28 10-3 20-3 28 0l-4 14c-8-2-16-2-24 1-10 3-18 9-24 17z" />
        <path d="M68 64c10-3 20-3 28 1 3 2 3 6 0 8-8 4-18 4-27 1-4-2-4-8-1-10z" />
        {/* Указательный палец — вся картина держится на нём */}
        <path d="M94 66c6-1 12 0 16 2 2 1 2 4 0 5-5 2-11 2-16 1-3-1-3-7 0-8z" />
      </g>
      {/* Рука Бога: сверху справа навстречу */}
      <g fill="url(#ad-skin)" stroke="#6b4a2c" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M194 44c-10-4-24-3-38 2-9 3-17 8-23 13l8 12c6-4 13-8 21-10 9-3 18-3 26-1z" />
        <path d="M133 59c-9 1-17 4-22 8-3 2-2 6 1 7 8 2 18 1 26-3 4-2 3-9-1-10z" />
        <path d="M112 68c-6 0-11 2-14 4-2 1-2 4 1 5 5 1 11 0 15-2 3-1 2-7-2-7z" />
      </g>
      {/* Искра между пальцами — самое светлое место */}
      <g className="flux-art-spark">
        <circle cx="105" cy="70" r="17" fill="url(#ad-glow)" />
        <circle cx="105" cy="70" r="3" fill="#fffdf4" />
      </g>
    </g>
  ),
};

// ── Витрувианский человек ────────────────────────────────────────────────────
const VITRUVIAN: Canvas = {
  aspect: 1.0,
  Draw: () => {
    const c = 50, R = 42, S = 38, ink = '#5f4128';
    return (
      <g>
        <rect width="100" height="100" fill="#e2d3b0" />
        <g stroke={ink} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx={c} cy={c} r={R} strokeWidth="1.1" opacity="0.7"
            className="flux-art-draw" style={{ strokeDasharray: 2 * Math.PI * R }} />
          <rect x={c - S} y={c - S + 5} width={S * 2} height={S * 2} strokeWidth="1.1" opacity="0.7"
            className="flux-art-draw-late" style={{ strokeDasharray: S * 8 }} />
          <g strokeWidth="1.8">
            <circle cx={c} cy={c - 30} r="8" />
            <line x1={c} y1={c - 22} x2={c} y2={c + 16} />
            <g className="flux-art-pose-a">
              <line x1={c} y1={c + 16} x2={c - 9} y2={c + 42} />
              <line x1={c} y1={c + 16} x2={c + 9} y2={c + 42} />
              <line x1={c - 38} y1={c - 10} x2={c + 38} y2={c - 10} />
            </g>
            <g className="flux-art-pose-b">
              <line x1={c} y1={c + 16} x2={c - 28} y2={c + 37} />
              <line x1={c} y1={c + 16} x2={c + 28} y2={c + 37} />
              <line x1={c} y1={c - 16} x2={c - 37} y2={c - 33} />
              <line x1={c} y1={c - 16} x2={c + 37} y2={c - 33} />
            </g>
          </g>
        </g>
      </g>
    );
  },
};

// ── Девятый вал ──────────────────────────────────────────────────────────────
const NW_SKY = ['#e0a75f', '#c98a4c', '#f0c284', '#a96f42'];
const NW_SEA = ['#2f6f7a', '#1c505c', '#3d8a91', '#123a45'];
const NINTH: Canvas = {
  aspect: 1.4,
  Draw: () => {
    const sky = field({
      seed: 17, count: 170, x0: -4, y0: -4, x1: 144, y1: 60,
      angle: (x, y, r) => 4 + (r() - 0.5) * 14, len: [8, 22], w: [2, 4.2],
      colors: NW_SKY.length, opacity: [0.45, 0.95],
    });
    const sea = field({
      seed: 18, count: 190, x0: -4, y0: 52, x1: 144, y1: 104,
      angle: (x, y, r) => Math.cos(x / 22) * 22 + (r() - 0.5) * 14, len: [7, 20], w: [1.8, 3.8],
      colors: NW_SEA.length, opacity: [0.55, 1],
    });
    return (
      <g>
        <defs>
          <radialGradient id="nw-sun" cx="0.5" cy="0.9" r="0.9">
            <stop offset="0%" stopColor="#ffd88f" /><stop offset="45%" stopColor="#f2a24e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#b56a3a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="140" height="100" fill="#c98a4c" />
        <Strokes list={sky} palette={NW_SKY} cls="flux-art-breathe-slow" />
        <g className="flux-art-rays" style={{ transformOrigin: '70px 62px' }} opacity="0.3">
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d={`M70 62L${70 + Math.cos((i / 8) * Math.PI - Math.PI) * 150} ${62 + Math.sin((i / 8) * Math.PI - Math.PI) * 150}`}
              stroke="#ffe6ba" strokeWidth="7" strokeLinecap="round" />
          ))}
        </g>
        <ellipse cx="70" cy="60" rx="40" ry="20" fill="url(#nw-sun)" className="flux-art-pulse" />
        <path d="M0 56c14 3 26 8 40 6s24-8 40-6 26 10 40 6 16-4 20-3v41H0z" fill="#1c505c" />
        <Strokes list={sea} palette={NW_SEA} cls="flux-art-swell" />
        <g className="flux-art-swell">
          <path d="M-6 100C2 72 22 54 48 56c24 2 40 18 46 44z" fill="#164751" />
          <g fill="#eef8f6" className="flux-art-foam">
            <path d="M46 56c8-2 15 0 20 6-6-2-11 0-15 5-1-4-3-8-5-11z" />
            <path d="M16 66c6-5 13-7 20-7-6 3-11 8-13 14-2-3-4-5-7-7z" />
          </g>
        </g>
        {/* Обломок мачты с людьми — сюжет картины */}
        <g fill="#3a2a1c" className="flux-art-bob">
          <path d="M96 74l14-16 2 2-12 16z" />
          <circle cx="99" cy="76" r="2" /><circle cx="104" cy="74" r="1.8" />
        </g>
      </g>
    );
  },
};

export const CANVASES: Record<string, Canvas> = {
  mona: MONA,
  scream: SCREAM,
  starry: STARRY,
  wave: WAVE,
  sunflowers: SUNFLOWERS,
  adam: ADAM,
  vitruvian: VITRUVIAN,
  ninth: NINTH,
};
