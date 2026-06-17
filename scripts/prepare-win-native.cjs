/**
 * Подготовка нативного модуля better-sqlite3 для СБОРКИ ПОД WINDOWS.
 *
 * Сборка идёт на Linux, поэтому в node_modules лежит Linux-версия
 * better_sqlite3.node (ELF). Если её упаковать в .exe, Windows выдаст
 * «... is not a valid Win32 application», и ВСЯ работа с БД падает (500).
 *
 * Скрипт скачивает официальный prebuilt именно под Electron+win32-x64 с
 * нужным ABI и кладёт его в build/Release, чтобы electron-builder
 * (npmRebuild=false) упаковал корректный Windows-бинарник.
 *
 * После сборки Windows-версии восстановите Linux-бинарник:
 *   node scripts/prepare-win-native.cjs --restore
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const bsqDir = path.join(root, 'node_modules', 'better-sqlite3');
const target = path.join(bsqDir, 'build', 'Release', 'better_sqlite3.node');
const linuxBackup = path.join(bsqDir, 'build', 'Release', 'better_sqlite3.linux.node');

function fileKind(p) {
  try { return execSync(`file -b "${p}"`).toString().trim(); } catch { return 'unknown'; }
}

if (process.argv.includes('--restore')) {
  if (fs.existsSync(linuxBackup)) {
    fs.copyFileSync(linuxBackup, target);
    console.log('[win-native] Linux-бинарник восстановлен:', fileKind(target));
  } else {
    console.log('[win-native] Бэкап Linux-бинарника не найден, пропуск.');
  }
  process.exit(0);
}

const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
const bsqVersion = require(path.join(bsqDir, 'package.json')).version;
const abi = require('node-abi').getAbi(electronVersion, 'electron');
const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsqVersion}/better-sqlite3-v${bsqVersion}-electron-v${abi}-win32-x64.tar.gz`;

console.log(`[win-native] electron=${electronVersion} ABI=${abi} better-sqlite3=${bsqVersion}`);
console.log('[win-native] загрузка:', url);

function download(u, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Слишком много редиректов'));
    https.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' для ' + u));
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
    }).on('error', reject);
  });
}

(async () => {
  // Сохраняем Linux-бинарник один раз, чтобы потом восстановить
  if (fs.existsSync(target) && !fs.existsSync(linuxBackup)) {
    if (fileKind(target).includes('ELF')) fs.copyFileSync(target, linuxBackup);
  }
  const tmpTar = path.join(require('os').tmpdir(), `bsq-win-${abi}.tar.gz`);
  await download(url, tmpTar);
  const tmpDir = path.join(require('os').tmpdir(), `bsq-win-${abi}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  execSync(`tar -xzf "${tmpTar}" -C "${tmpDir}"`);
  const extracted = path.join(tmpDir, 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(extracted)) throw new Error('В архиве нет build/Release/better_sqlite3.node');
  fs.copyFileSync(extracted, target);
  const kind = fileKind(target);
  console.log('[win-native] установлен Windows-бинарник:', kind);
  if (!/PE32\+|MS Windows/.test(kind)) throw new Error('Скачанный файл не является Windows-DLL: ' + kind);
  console.log('[win-native] OK');
})().catch((e) => { console.error('[win-native] ОШИБКА:', e.message); process.exit(1); });
