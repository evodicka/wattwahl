import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The width of an element, kept up to date. `fallback` is used before the
 * first measurement and where there is no layout (tests).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 480) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth || fallback);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}
