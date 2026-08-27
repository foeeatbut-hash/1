/**
 * Предпросмотр файла в правой полосе Проводника.
 *
 * Показывает то, что можно показать без открытия программы: картинку, текст,
 * первую страницу ПДФ. Всё остальное — значок типа и честная надпись, а не
 * пустой прямоугольник: человек должен понимать, что смотреть тут нечего, а
 * не думать, что не загрузилось.
 *
 * Вынесено из Explorer: экран и без того велик, а разбор «чем это показать»
 * самодостаточен и меняется отдельно от списка файлов.
 */
import React from 'react';

/** Текст файла хранится в base64 — декодируем как UTF-8, иначе кириллица бьётся */
function decodeText(content: string): string {
  try {
    const b64 = content.includes(',') ? content.split(',')[1] : content;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch (_) { return ''; }
}

export default function FilePreview({ item, icon }: {
  item: { name: string; type?: string; content?: string | null };
  /** Значок типа: его считает сам Проводник по своим правилам */
  icon: React.ReactNode;
}) {
  const name = item.name || '';
  const isImage = item.type === 'IMAGE' || /\.(jpeg|jpg|gif|png|webp)$/i.test(name);
  const isPdf = item.type === 'PDF' || /\.pdf$/i.test(name);
  const isText = item.type === 'TXT' || /\.(txt|md|json|csv)$/i.test(name);

  return (
    <div className="flex-1 flex items-center justify-center min-h-[240px] max-h-[300px] bg-white dark:bg-dark-panel
                    border border-slate-200 dark:border-dark-border rounded mb-4 overflow-hidden relative">
      {isImage && item.content ? (
        <img src={item.content} alt={name} className="max-w-full max-h-full object-contain" />
      ) : isText && item.content ? (
        // Текст декодируем сами: iframe с data:text без charset давал кракозябры
        <pre className="w-full h-full overflow-auto text-left text-xs leading-relaxed p-3
                        text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words font-mono">
          {decodeText(item.content)}
        </pre>
      ) : isPdf && item.content ? (
        // Пустой sandbox ломал встроенный просмотр ПДФ — оставляем скрипты
        <iframe src={item.content} className="w-full h-full border-0 bg-white dark:bg-dark-panel"
          title={name} sandbox="allow-scripts allow-same-origin" />
      ) : (
        <div className="text-center text-slate-400 flex flex-col items-center">
          {icon}
          <span className="text-xs">{item.type || 'Файл'}</span>
        </div>
      )}
    </div>
  );
}
