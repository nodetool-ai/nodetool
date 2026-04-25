import { useEffect, useMemo, useRef } from "react";

type DebouncedCallback<TArgs extends unknown[]> = {
  (...args: TArgs): void;
  cancel: () => void;
};

export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => unknown,
  delay: number
): DebouncedCallback<TArgs> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useMemo(() => {
    const cancel = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const debounced = (...args: TArgs) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delay);
    };
    debounced.cancel = cancel;
    return debounced as DebouncedCallback<TArgs>;
  }, [delay]);
}
