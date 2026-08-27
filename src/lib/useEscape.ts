import { useEffect } from 'react';

/**
 * Esc закрывает то, что открыто поверх.
 *
 * Всплывающая панель ловит нажатие мимо себя подложкой во весь экран — и, пока
 * она открыта, до всего остального не дотянуться. Если такую панель нельзя
 * закрыть с клавиатуры, человек, нажавший Esc по привычке, оказывается в
 * редакторе, который перестал отзываться: кнопки видны, а нажатия уходят в
 * подложку. Проверено на панели интервалов — там это и нашлось.
 */
export function useEscape(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    // На перехвате: иначе Esc сначала достаётся движку внутри полотна
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, close]);
}
