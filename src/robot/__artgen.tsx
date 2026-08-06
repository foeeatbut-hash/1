import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Kitten3d, { K3_POSES, K3Refs, applyKitten3d } from './__kitten3d';

/**
 * ЧЕРНОВИК: рисует подставного котёнка, чтобы снять с него PNG.
 *
 * Нужен, пока нет настоящей картинки: на этом кадре проверяется, что оснастка
 * из масок вообще работает на растре. Числа здесь и в __photoMap.ts связаны —
 * 7 пикселей на единицу сцены, пол на 880, холст 700x940.
 */

const W = 790, H = 940, FLOOR = 880, S = 7;

function App() {
  const refs = useRef<K3Refs>({});
  useLayoutEffect(() => {
    applyKitten3d(refs.current, K3_POSES.sit, W / 2, FLOOR, S);
    // Тень на полу рисует оснастка, в самой картинке её быть не должно
    refs.current.shadow?.setAttribute('opacity', '0');
  });
  return (
    <svg id="art" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <Kitten3d refs={refs.current} face="neutral" id="art" />
    </svg>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
