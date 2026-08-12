---
name: flux-release
description: >
  Сборка портативного exe Flux и обход поломок контейнера. Применять, когда
  просят собрать программу, поднять версию, выпустить сборку, а также если
  git-push обрывается, пропали node_modules или репозиторий откатился на старую
  ревизию.
---

# Выпуск сборки

## Как собирается exe

Сборку делает GitHub Actions, не контейнер. Порядок:

1. Поднять версию в `package.json` (только это поле, диф должен быть в одну
   строку — проверить `git diff package.json`).
2. Закоммитить с `[build-exe]` в сообщении — по этой метке срабатывает
   `.github/workflows/build-portable.yml`.
3. Запушить в рабочую ветку.
4. Actions собирает и **пушит результат обратно в ту же ветку**:
   `portable/Flux-<версия>.exe.00.part`, `.01.part` и `СОБРАТЬ-EXE.bat`
   (около 125 МБ двумя частями — целиком exe в git не помещается).
5. Дождаться и синхронизироваться: ветка уедет вперёд на коммит бота.

Ожидание оформлять фоновой командой, а не опросом в цикле:

```bash
until [ "$(git ls-remote origin <ветка> | cut -c1-7)" != "<мой-коммит>" ]; do sleep 60; done
```

Без `[build-exe]` сборка не запускается — прогон завершится со статусом
`skipped`. Это нормальное поведение для правок без выпуска.

## Что проверить до коммита

```bash
npx tsc --noEmit          # база: ноль ошибок, любая новая — своя
npx tsx scripts/test-*.ts # наборы проверок, см. skill flux-verify
npx vite build            # фронт
npm run build:electron    # главный процесс
```

## Поломки контейнера, которые здесь случаются

Это не редкость, а регулярность. Признаки и обход:

**Репозиторий откатился на старую ревизию.** Локальный `HEAD` вдруг указывает на
давний коммит, свежих файлов нет. Работа цела на origin:

```bash
git fetch origin <ветка> && git reset --hard origin/<ветка>
```

Если свои коммиты уже легли на старую базу — переставить их, а не переделывать:

```bash
git rebase --onto origin/<ветка> <старая-база> HEAD
```

**`git push` обрывается, `pack-objects died of signal 7`.** Повреждено хранилище
git в контейнере (SIGBUS на чтении своих же паков). Повторять пуш бесполезно.
Обход — свежий клон и патчи:

```bash
git format-patch -N -o /tmp/patches
git clone --depth 3 --branch <ветка> <url> /tmp/fresh
cd /tmp/fresh && git am /tmp/patches/*.patch && git push origin HEAD:<ветка>
```

После этого локальную ветку перевести на origin: содержимое то же, хеши другие.
Сверить перед этим `git diff <локальный> origin/<ветка>` — должно быть пусто.

**Пропал `node_modules`.** Признак — `tsc` сыплет «Cannot find module
@types/node», «@prisma/client». Лечится:

```bash
npm ci --no-audit --no-fund
npx prisma generate --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.postgresql.prisma
```

`playwright-core` в зависимостях нет — для снимков экрана ставить отдельно
(`npm i --no-save playwright-core`), браузер уже лежит в `/opt/pw-browsers`.

**Файлы в рабочей копии побились** (`EIO`, нечитаемые `public/ocr/*`):

```bash
rm -f <файлы> && git checkout -- <путь>
```

## Чего не делать

- Не собирать exe без явной просьбы: сборка занимает время и коммитит 125 МБ.
- Не поднимать версию «на глаз» — сначала прочитать текущую из `package.json`.
- Не пушить в другую ветку, кроме рабочей.
