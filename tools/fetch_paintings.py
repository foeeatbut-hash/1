#!/usr/bin/env python3
"""Скачивает репродукции картин с Викисклада и готовит их для настольной программы.

Ничего не дорисовывает и не генерирует: берёт подлинные снимки оригиналов,
уменьшает до 900 точек по большей стороне, жмёт в JPEG q85 до 150 КБ и кладёт в zip.
Кадрируется только «Сотворение Адама» — фрагмент с руками.

Запуск:  python3 tools/fetch_paintings.py [папка-назначения] [--zip]
По умолчанию кладёт в public/paintings, откуда их отдаёт сборка.
Нужен Pillow:  pip install pillow

Нужен доступ к commons.wikimedia.org и upload.wikimedia.org: в окружении с
уровнем сети Trusted они закрыты, потребуется Custom с этими двумя доменами.
"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile

from PIL import Image

API = "https://commons.wikimedia.org/w/api.php"
UA = "PaintingFetcher/1.0 (desktop art app; contact: forestf715@gmail.com)"
MAX_SIDE = 900          # верхняя граница диапазона 500–900
MAX_BYTES = 150 * 1024

# name — имя выходного файла; titles — точные названия файлов на Викискладе
# (пробуются по порядку); search — запасной поиск, если ни одно не нашлось.
ITEMS = [
    dict(name="mona", search="Mona Lisa Leonardo da Vinci C2RMF",
         titles=["Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg"]),
    dict(name="scream", search="Edvard Munch The Scream National Gallery Norway 1893",
         titles=["Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg",
                 "The Scream by Edvard Munch, 1893 - Nasjonalgalleriet.png"]),
    dict(name="starry", search="Van Gogh Starry Night Google Art Project",
         titles=["Van Gogh - Starry Night - Google Art Project.jpg"]),
    dict(name="wave", search="Great Wave off Kanagawa Hokusai",
         titles=["Tsunami by hokusai 19th century.jpg",
                 "The Great Wave off Kanagawa.jpg"]),
    # Лондонская версия «Подсолнухов» (National Gallery), 15 цветков на жёлтом фоне.
    # Прежний запасной вариант — VGM F458 — это амстердамская версия из музея Ван
    # Гога, то есть не та работа; убран. Первым идёт файл, у которого музей и год
    # прямо в названии: по опознанному имени видно, что взято, а «Vincent Willem
    # van Gogh 127.jpg» об этом молчит и оставлен вторым.
    dict(name="sunflowers", search="Van Gogh Sunflowers National Gallery London 1888",
         titles=["Vincent van Gogh - Sunflowers (1888, National Gallery London).jpg",
                 "Van Gogh Vase with Fifteen Sunflowers.jpg",
                 "Vincent Willem van Gogh 127.jpg"]),
    dict(name="adam", search="Michelangelo Creation of Adam Sistine Chapel",
         titles=["Michelangelo - Creation of Adam (cropped).jpg",
                 "Michelangelo, Creation of Adam 04.jpg"],
         # доля ширины/высоты: фрагмент с двумя тянущимися друг к другу руками
         crop=(0.30, 0.28, 0.78, 0.80)),
    dict(name="vitruvian", search="Vitruvian Man Leonardo da Vinci",
         titles=["Da Vinci Vitruve Luc Viatour.jpg"]),
    dict(name="ninth", search="Aivazovsky The Ninth Wave",
         titles=["Hovhannes Aivazovsky - The Ninth Wave - Google Art Project.jpg"]),
    dict(name="pearl", search="Girl with a Pearl Earring Vermeer Mauritshuis",
         titles=["Meisje met de parel.jpg",
                 "1665 Girl with a Pearl Earring.jpg"]),
    dict(name="kiss", search="Gustav Klimt The Kiss Belvedere",
         titles=["The Kiss - Gustav Klimt - Google Cultural Institute.jpg",
                 "Gustav Klimt 016.jpg"]),
    dict(name="venus", search="Botticelli Birth of Venus Uffizi",
         titles=["Sandro Botticelli - La nascita di Venere - Google Art Project - edited.jpg"]),
    dict(name="supper", search="Leonardo da Vinci Last Supper",
         titles=["Última Cena - Da Vinci 5.jpg",
                 "The Last Supper - Leonardo Da Vinci - High Resolution 32x16.jpg"]),
    dict(name="watch", search="Rembrandt Night Watch Rijksmuseum",
         titles=["The Night Watch - HD.jpg",
                 "Rembrandt van Rijn-De Nachtwacht-1642.jpg"]),
    dict(name="impression", search="Monet Impression Sunrise",
         titles=["Monet - Impression, Sunrise.jpg",
                 "Claude Monet, Impression, soleil levant.jpg"]),
    dict(name="gothic", search="Grant Wood American Gothic Art Institute Chicago",
         titles=["Grant Wood - American Gothic - Google Art Project.jpg"]),
    dict(name="school", search="Raphael School of Athens Stanza della Segnatura",
         titles=['"La scuola di Atene" di Raffaello Sanzio da Urbino.jpg',
                 "Sanzio 01.jpg"]),
    dict(name="morning", search="Shishkin Morning in a Pine Forest",
         titles=["Ivan Shishkin - Morning in a Pine Forest - Google Art Project.jpg",
                 "Shishkin, Ivan - Morning in a Pine Forest.jpg"]),
    dict(name="bogatyrs", search="Vasnetsov Bogatyrs Tretyakov",
         titles=["Victor Vasnetsov - Богатыри - Google Art Project.jpg",
                 "Vasnetsov Bogatyrs.jpg"]),
    dict(name="rooks", search="Savrasov The Rooks Have Come Back",
         titles=["Alexei Savrasov - Грачи прилетели - Google Art Project.jpg",
                 "Savrasov roocks.jpg"]),
    # «Неизвестная» Крамского. Оба названия говорят просто «портрет женщины», а
    # таких у Крамского несколько — при первом же удачном прогоне этот файл надо
    # открыть глазами и убедиться, что это она, а не «Читающая» или автопортрет
    # чьей-то жены. Первым поставлен тот, чьё существование подтверждено поиском.
    dict(name="stranger", search="Kramskoi Unknown Woman 1883 Tretyakov Неизвестная",
         titles=["Kramskoy Portrait of a Woman.jpg",
                 "Ivan Kramskoi - Portrait of a Woman - Google Art Project.jpg"]),
    dict(name="courtyard", search="Polenov Moscow Courtyard Tretyakov",
         titles=["Vasily Polenov - Московский дворик - Google Art Project.jpg",
                 "Polenov Moskovsky dvorik.jpg"]),
    dict(name="redhorse", search="Petrov-Vodkin Bathing of a Red Horse",
         titles=["Kuzma Petrov-Vodkin - Купание красного коня - Google Art Project.jpg",
                 "Petrov-Vodkin Kupanije krasnogo konja.jpg"]),
    dict(name="barge", search="Repin Barge Haulers on the Volga",
         titles=["Ilia Efimovich Repin (1844-1930) - Volga Boatmen (1870-1873).jpg",
                 "Repin Barge Haulers on the Volga.jpg"]),
    dict(name="alyonushka", search="Vasnetsov Alyonushka Tretyakov",
         titles=["Vasnetsov Alenushka.jpg",
                 "Viktor Vasnetsov - Алёнушка - Google Art Project.jpg"]),
]


def api(params):
    params = dict(params, format="json", formatversion=2)
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def thumb_url(title):
    """Ссылка на уменьшенный до MAX_SIDE снимок — сервер Викисклада масштабирует сам."""
    data = api({"action": "query", "titles": title, "prop": "imageinfo",
                "iiprop": "url|size|extmetadata", "iiurlwidth": MAX_SIDE * 2})
    pages = data.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return None
    info = pages[0].get("imageinfo", [{}])[0]
    return info.get("thumburl") or info.get("url")


def find(item):
    for t in item["titles"]:
        t = t if t.startswith("File:") else "File:" + t
        try:
            u = thumb_url(t)
        except Exception as e:
            print(f"   ! {t}: {e}")
            continue
        if u:
            return t, u
    # запасной путь — поиск по Викискладу среди файлов-изображений
    try:
        res = api({"action": "query", "list": "search", "srsearch": item["search"],
                   "srnamespace": 6, "srlimit": 5})
        for hit in res.get("query", {}).get("search", []):
            title = hit["title"]
            if not title.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff")):
                continue
            u = thumb_url(title)
            if u:
                return title, u
    except Exception as e:
        print(f"   ! поиск не удался: {e}")
    return None, None


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def prepare(raw, crop=None):
    """Уменьшает, при надобности кадрирует и жмёт до 150 КБ. Ничего не подрисовывает."""
    im = Image.open(io.BytesIO(raw))
    im = im.convert("RGB")
    if crop:
        w, h = im.size
        l, t, r, b = crop
        im = im.crop((int(w * l), int(h * t), int(w * r), int(h * b)))
    side = max(im.size)
    if side > MAX_SIDE:                       # меньшие исходники не увеличиваем
        k = MAX_SIDE / side
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))),
                       Image.LANCZOS)
    for quality in (85, 80, 75, 70):
        for shrink in (1.0, 0.9, 0.8, 0.7):
            cur = im
            if shrink < 1.0:
                cur = im.resize((round(im.width * shrink), round(im.height * shrink)),
                                Image.LANCZOS)
            if max(cur.size) < 500 and max(im.size) >= 500:
                continue                      # не опускаемся ниже 500 точек
            buf = io.BytesIO()
            cur.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
            if buf.tell() <= MAX_BYTES:
                return buf.getvalue(), cur.size, quality
    return buf.getvalue(), cur.size, quality


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    make_zip = "--zip" in sys.argv
    outdir = args[0] if args else os.path.join("public", "paintings")
    os.makedirs(outdir, exist_ok=True)
    done, missing, credits = [], [], []
    for item in ITEMS:
        print(f"-> {item['name']}")
        title, url = find(item)
        if not url:
            missing.append(item["name"])
            print("   пропущено: не найдено на Викискладе")
            continue
        try:
            data, size, q = prepare(download(url), item.get("crop"))
        except Exception as e:
            missing.append(item["name"])
            print(f"   пропущено: {e}")
            continue
        path = os.path.join(outdir, item["name"] + ".jpg")
        with open(path, "wb") as f:
            f.write(data)
        done.append(path)
        credits.append(f"{item['name']}.jpg — {title} (Wikimedia Commons, public domain)")
        print(f"   {size[0]}x{size[1]}, {len(data)//1024} КБ, q{q}, {title}")
        time.sleep(0.5)                        # вежливо к серверам Викисклада

    with open(os.path.join(outdir, "SOURCES.txt"), "w", encoding="utf-8") as f:
        f.write("Источник — Wikimedia Commons. Все картины в общественном достоянии.\n\n")
        f.write("\n".join(credits) + "\n")

    # Zip нужен, только когда файлы отдают наружу, а не кладут в репозиторий
    if make_zip:
        zip_path = outdir.rstrip("/") + ".zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for p in done + [os.path.join(outdir, "SOURCES.txt")]:
                z.write(p, os.path.join(os.path.basename(outdir.rstrip("/")), os.path.basename(p)))
        print(f"\nСобрано в {zip_path}")
    print(f"\nГотово: {len(done)} файлов в {outdir}")
    if missing:
        print("Пропущены: " + ", ".join(missing))


if __name__ == "__main__":
    main()
