/**
 * Снимок экрана с пометками → вложение сообщения.
 *
 * Вынесено из экрана Мессенджера: превращение холста в файл — законченное
 * действие со своим именем файла и своим порядком шагов, и в обработчике
 * кнопки ему тесно.
 */

export interface Attachment {
  fileName: string;
  filePath: string;
  fileSize: number;
}

/** `upload` — загрузка файла на сервер: она разная у разных разделов */
export async function canvasAttachment(
  canvas: HTMLCanvasElement,
  upload: (name: string, base64: string) => Promise<Attachment>,
): Promise<Attachment> {
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  // Имя со временем: два снимка подряд не должны затирать друг друга
  return upload(`screenshot_${Date.now()}.png`, base64);
}
