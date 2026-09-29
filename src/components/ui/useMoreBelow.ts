'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "n more below": how many children of `list` are not fully visible in the `scroller`
 * viewport. Attach both refs; the count follows scrolling and resizing.
 */
export function useMoreBelow<S extends HTMLElement = HTMLDivElement, L extends HTMLElement = HTMLDivElement>() {
  const scroller = useRef<S>(null);
  const list = useRef<L>(null);
  const [moreBelow, setMoreBelow] = useState(0);

  useEffect(() => {
    const box = scroller.current;
    const inner = list.current;
    if (!box || !inner) return;
    const measure = () => {
      const bottom = box.scrollTop + box.clientHeight + 1;
      const kids = Array.from(inner.children) as HTMLElement[];
      setMoreBelow(kids.filter((el) => el.offsetTop + el.offsetHeight > bottom).length);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    box.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      box.removeEventListener('scroll', measure);
    };
  }, []);

  return { scroller, list, moreBelow };
}
