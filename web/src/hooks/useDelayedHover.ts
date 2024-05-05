import { useState, useEffect, useRef } from "react";

export function useDelayedHover(callback: () => void, delay: number) {
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleMouseEnter = () => {
    setTimer(setTimeout(() => callbackRef.current(), delay));
  };

  const handleMouseLeave = () => {
    if (timer) {
      clearTimeout(timer);
      setTimer(null);
    }
  };

  useEffect(() => {
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [timer]);

  return { handleMouseEnter, handleMouseLeave };
}
