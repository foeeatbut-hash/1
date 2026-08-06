#!/usr/bin/env python3
"""
Подготовка рисунка котёнка к оживлению.

Что делает: вырезает нужного котёнка из листа, убирает белый фон, обрезает
поля, приводит к рабочей высоте и кладёт PNG туда, откуда его берёт сборка.

    python3 tools/prepare-kitten.py исходник.png --third left
    python3 tools/prepare-kitten.py исходник.png --box 120,60,640,720

Фон убирается заливкой от краёв: белым считается только то, что связано с
рамкой кадра. Белая шёрстка внутри силуэта остаётся на месте — до неё заливка
не дотягивается. Край смягчается по «белизне», чтобы не осталось пилы.
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

# Ниже этого масштаба заливка фона не даёт выигрыша в скорости
FILL_MAX = 600


def parse_box(text):
    parts = [int(v) for v in text.replace(' ', '').split(',')]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError('--box ждёт четыре числа: left,top,right,bottom')
    return tuple(parts)


def pick_third(size, which):
    """Лист с тремя котятами: берём левую, среднюю или правую треть с нахлёстом."""
    w, h = size
    over = int(w * 0.02)
    third = w / 3
    idx = {'left': 0, 'middle': 1, 'right': 2}[which]
    left = max(0, int(third * idx) - over)
    right = min(w, int(third * (idx + 1)) + over)
    return (left, 0, right, h)


def background_mask(img, tolerance):
    """255 там, где фон. Заливка идёт от рамки, поэтому внутренний белый цел."""
    small = img.convert('L')
    scale = 1.0
    if max(small.size) > FILL_MAX:
        scale = FILL_MAX / max(small.size)
        small = small.resize((max(1, int(small.width * scale)),
                              max(1, int(small.height * scale))), Image.BILINEAR)

    # Порог: светлее — кандидат в фон (255), темнее — точно рисунок (0)
    thr = 255 - tolerance
    cand = small.point(lambda v: 255 if v >= thr else 0, mode='L')

    # Рамка в один пиксель, чтобы хватило одной заливки из угла
    framed = Image.new('L', (cand.width + 2, cand.height + 2), 255)
    framed.paste(cand, (1, 1))

    ImageDraw.floodfill(framed, (0, 0), 128, thresh=0)
    filled = framed.point(lambda v: 255 if v == 128 else 0, mode='L')
    filled = filled.crop((1, 1, cand.width + 1, cand.height + 1))

    if scale != 1.0:
        filled = filled.resize(img.size, Image.BILINEAR)
    return filled


def cut_background(img, tolerance, feather):
    bg = background_mask(img, tolerance)
    alpha = bg.point(lambda v: 0 if v > 127 else 255, mode='L')

    # Полупрозрачность по краю: чем светлее пиксель, тем меньше он «шерсть».
    # Работает только рядом с фоном, внутри силуэта ничего не трогаем.
    near = bg.filter(ImageFilter.MaxFilter(5))
    lum = img.convert('L')
    thr = 255 - tolerance
    soft = lum.point(lambda v: 255 if v < thr else max(0, int(255 * (255 - v) / max(1, tolerance))), mode='L')
    alpha = Image.composite(soft, alpha, near.point(lambda v: 255 if v > 127 else 0, mode='1'))

    if feather > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))

    out = img.convert('RGB')
    out.putalpha(alpha)
    return out


def main():
    ap = argparse.ArgumentParser(description='Готовит рисунок котёнка для оживления')
    ap.add_argument('source', help='исходное изображение')
    ap.add_argument('-o', '--out', default='src/robot/kitten.png', help='куда положить результат')
    ap.add_argument('--third', choices=['left', 'middle', 'right'], help='взять одного котёнка с листа из трёх')
    ap.add_argument('--box', type=parse_box, help='свой кадр: left,top,right,bottom')
    ap.add_argument('--height', type=int, default=900, help='высота результата в пикселях')
    ap.add_argument('--tolerance', type=int, default=38, help='насколько светлым считать фон, 0-80')
    ap.add_argument('--feather', type=float, default=0.8, help='смягчение края в пикселях')
    ap.add_argument('--keep-background', action='store_true', help='не убирать фон')
    args = ap.parse_args()

    if not os.path.exists(args.source):
        sys.exit(f'нет файла: {args.source}')

    img = Image.open(args.source).convert('RGB')
    print(f'исходник {img.width}x{img.height}')

    box = args.box or (pick_third(img.size, args.third) if args.third else None)
    if box:
        img = img.crop(box)
        print(f'кадр {box} -> {img.width}x{img.height}')

    out = img.convert('RGBA') if args.keep_background else cut_background(img, args.tolerance, args.feather)

    bbox = out.getbbox() if out.mode == 'RGBA' else None
    if bbox:
        out = out.crop(bbox)
        print(f'обрезка по силуэту -> {out.width}x{out.height}')

    if args.height and out.height != args.height:
        w = max(1, round(out.width * args.height / out.height))
        out = out.resize((w, args.height), Image.LANCZOS)
        print(f'масштаб -> {out.width}x{out.height}')

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    out.save(args.out, 'PNG', optimize=True)
    kb = os.path.getsize(args.out) / 1024
    print(f'готово: {args.out}  {out.width}x{out.height}  {kb:.0f} КБ')
    print('дальше: подогнать карту частей в src/robot/__kittenMap.ts под этот размер')


if __name__ == '__main__':
    main()
