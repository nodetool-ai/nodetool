import { useMemo, useRef } from "react";

type DebouncedCallback<T extends (...args: unknown[]) => unknown> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
};

export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): DebouncedCallback<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useMemo(() => {
    const cancel = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const debounced = (...args: Parameters<T>) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delay);
    };
    debounced.cancel = cancel;
    return debounced as DebouncedCallback<T>;
  }, [delay]);
}
