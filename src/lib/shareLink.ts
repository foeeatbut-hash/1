// Кодирование/декодирование «поделиться-ссылки» внутри текста сообщения чата.
// Токен в тексте: [[s:<base64url>]] — декодируется в цель перехода.

export interface ShareTarget {
  r: string;        // маршрут (route), напр. /equipment
  f?: string;       // якорь для точной подсветки (data-share-focus)
  l: string;        // подпись ссылки
  s?: string;       // выделенный текст (для текстового шаринга)
  ty: 'el' | 'text';
  p?: string;       // id проекта цели (для подсказки «перейдите в проект»)
  pn?: string;      // название проекта цели
}

function b64encode(str: string): string {
  const b = btoa(unescape(encodeURIComponent(str)));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

export function encodeShare(t: ShareTarget): string {
  try { return `[[s:${b64encode(JSON.stringify(t))}]]`; } catch { return ''; }
}

export function decodeShare(token: string): ShareTarget | null {
  try {
    // Принимаем как «голый» base64, так и полный токен [[s:...]]
    const inner = token.replace(/^\[\[s:/, '').replace(/\]\]$/, '');
    const obj = JSON.parse(b64decode(inner));
    if (obj && typeof obj.r === 'string') return obj as ShareTarget;
  } catch {}
  return null;
}

export const SHARE_TOKEN_RE = /\[\[s:([A-Za-z0-9_\-]+)\]\]/g;
