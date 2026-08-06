"""Точка входа.

Без аргументов открывается окно; с аргументами работает консольный режим::

    python -m e3tool                       # окно
    python -m e3tool export --out out.xlsx # консоль
"""

from __future__ import annotations

import sys


def main() -> int:
    if len(sys.argv) > 1:
        from .cli import main as cli_main

        return cli_main(sys.argv[1:])

    from .ui import main as ui_main

    return ui_main()


if __name__ == "__main__":
    raise SystemExit(main())
