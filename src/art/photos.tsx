import React, { useEffect, useState } from 'react';

/**
 * Настоящие репродукции — те, что лежат файлами в src/art/images.
 *
 * Почему файлами, а не из сети. Flux работает офлайн, в закрытом контуре: за
 * картинкой ходить некуда. Поэтому снимки лежат внутри сборки и попадают в exe
 * вместе с остальным. Двадцать четыре файла по сто пятьдесят килобайт — это
 * около трёх мегабайт против ста тридцати двух у самой программы.
 *
 * Почему список файлов собирается сам. Файлы появляются по одному, по мере
 * того как их находят. Если бы каждый надо было ещё и вписать в код, забытая
 * строчка означала бы картину, которая лежит в папке и не показывается.
 * Сборщик читает папку целиком, и достаточно просто положить туда файл.
 *
 * Чего в этом файле нет. Соотношения сторон: оно берётся у самого снимка при
 * загрузке. Иначе пришлось бы держать в коде размеры двух десятков картин и
 * следить, чтобы они совпадали с файлами, — а расхождение проявилось бы
 * растянутой Джокондой, и никто бы не понял почему.
 */

/**
 * Все файлы папки разом. Vite раскрывает это при сборке в готовый список
 * адресов: чего в папке нет, того не окажется и здесь.
 */
const FILES = import.meta.glob('./images/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** mona.jpg → mona */
const idOf = (path: string): string => {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return (dot > 0 ? file.slice(0, dot) : file).toLowerCase();
};

const BY_ID: Record<string, string> = {};
for (const [path, url] of Object.entries(FILES)) BY_ID[idOf(path)] = url;

/** Есть ли снимок этой работы. */
export const photoOf = (id: string): string | undefined => BY_ID[id];

/** Сколько репродукций сейчас лежит в папке — видно в наборе проверок. */
export const photoCount = (): number => Object.keys(BY_ID).length;

/**
 * Соотношение сторон снимка.
 *
 * Меряем один раз на файл и запоминаем: полка перебирает картины по кругу и
 * возвращается к той же не раз, а второй замер того же файла — лишняя работа
 * ради уже известного числа.
 */
const ratios = new Map<string, number>();

export function usePhotoAspect(url: string | undefined): number | null {
  const [aspect, setAspect] = useState<number | null>(() => (url ? ratios.get(url) ?? null : null));

  useEffect(() => {
    if (!url) { setAspect(null); return; }
    const known = ratios.get(url);
    if (known) { setAspect(known); return; }

    let alive = true;
    const img = new Image();
    img.onload = () => {
      const a = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
      ratios.set(url, a);
      if (alive) setAspect(a);
    };
    // Файл лежит внутри программы, но испорченный файл возможен и там.
    // Тогда работа просто не покажется — вместо неё пойдёт следующая.
    img.onerror = () => { if (alive) setAspect(0); };
    img.src = url;
    return () => { alive = false; };
  }, [url]);

  return aspect;
}

/**
 * Снимок внутри рамы.
 *
 * Рисуется в тех же условных единицах, что и нарисованные картины: холст
 * шириной 100·aspect и высотой 100. Обстановка вокруг об этом не знает и
 * работает одинаково с рисунком и со снимком.
 *
 * Медленное приближение — вместо анимаций, которые были у рисованных картин.
 * У снимка нет отдельных звёзд и мазков, которые можно оживить, а совсем
 * неподвижная картина посреди живой сцены выглядит подставленной. Приближение
 * настолько медленное, что заметить его можно, только специально приглядываясь.
 */
export function PhotoCanvas({ url, aspect }: { url: string; aspect: number }) {
  return (
    <g className="flux-art-drift">
      <image
        href={url}
        x="0" y="0"
        width={100 * aspect} height="100"
        preserveAspectRatio="xMidYMid slice"
      />
      {/* Тёплый лак и потемнение к краям — то же, что у нарисованных: без
          него снимок выглядит вставленной фотографией, а не картиной в раме */}
      <rect width={100 * aspect} height="100" fill="#6b4a1e" opacity="0.05" />
    </g>
  );
}
