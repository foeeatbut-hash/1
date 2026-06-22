#!/usr/bin/env python3
"""Извлечение текста из PDF-каталогов ВЕЗА (и любых текстовых PDF).

Использует pdfminer.six (корректно разбирает встроенные шрифты/ToUnicode,
кириллицу и числа). Применяется при наполнении базы знаний оборудования.

Примеры:
  python3 scripts/pdf_extract.py "catalogs/klapany/Воздушные клапаны.pdf"
  python3 scripts/pdf_extract.py FILE.pdf --pages 6-12
  python3 scripts/pdf_extract.py FILE.pdf --out out.txt
"""
import sys, argparse
from pdfminer.high_level import extract_text

def parse_pages(s):
    if not s: return None
    out=[]
    for part in s.split(','):
        if '-' in part:
            a,b=part.split('-'); out += list(range(int(a)-1, int(b)))  # 0-based
        else:
            out.append(int(part)-1)
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--pages', help='напр. 6-12 или 1,3,5 (1-based)')
    ap.add_argument('--out')
    a=ap.parse_args()
    txt=extract_text(a.pdf, page_numbers=parse_pages(a.pages)) or ''
    if a.out:
        open(a.out,'w',encoding='utf-8').write(txt)
        print(f"OK: {len(txt)} символов → {a.out}")
    else:
        sys.stdout.write(txt)

if __name__=='__main__':
    main()
