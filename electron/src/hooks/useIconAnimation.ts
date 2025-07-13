import { useRef, useCallback, useEffect } from 'react';

interface AnimationIntervals {
  stroke: number | null;
  fill: number | null;
  colorfulStroke: number | null;
  colorfulFill: number | null;
}

export const useIconAnimation = () => {
  const iconRef = useRef<HTMLElement | null>(null);
  const intervals = useRef<AnimationIntervals>({
    stroke: null,
    fill: null,
    colorfulStroke: null,
    colorfulFill: null,
  });

  const getRandomGrayColor = useCallback(() => {
    const grayValue = Math.floor(Math.random() * 100);
    return `#${grayValue.toString(16).padStart(2, '0').repeat(3)}`;
  }, []);

  const getRandomColor = useCallback(() => {
    const randomColor = Math.floor(Math.random() * 16777215).toString(16);
    return `#${randomColor.padStart(6, '0')}`;
  }, []);

  const updateStroke = useCallback((color: string) => {
    if (iconRef.current) {
      iconRef.current.style.setProperty('--stroke-color', color);
    }
  }, []);

  const updateFill = useCallback((color: string) => {
    if (iconRef.current) {
      iconRef.current.style.setProperty('--fill-color', color);
    }
  }, []);

  const clearAllAnimations = useCallback(() => {
    Object.keys(intervals.current).forEach((key) => {
      const intervalKey = key as keyof AnimationIntervals;
      const intervalId = intervals.current[intervalKey];
      if (intervalId) {
        clearInterval(intervalId);
        intervals.current[intervalKey] = null;
      }
    });
  }, []);

  const startAnimations = useCallback(() => {
    // Set icon ref
    iconRef.current = document.querySelector<HTMLElement>('.nodetool-icon');
    
    // Initial stroke update
    updateStroke(getRandomGrayColor());

    // Start stroke animation
    intervals.current.stroke = window.setInterval(() => {
      updateStroke(getRandomGrayColor());
    }, 5000);

    // Start fill animation after 1 minute
    setTimeout(() => {
      intervals.current.fill = window.setInterval(() => {
        updateFill(getRandomGrayColor());
      }, 5000);
    }, 60000 + 2500);

    // Start colorful stroke animation after 5 minutes
    setTimeout(() => {
      if (intervals.current.stroke) {
        clearInterval(intervals.current.stroke);
        intervals.current.stroke = null;
      }
      
      intervals.current.colorfulStroke = window.setInterval(() => {
        updateStroke(getRandomColor());
      }, 5000);
    }, 5 * 60000);

    // Start colorful fill animation after 10 minutes
    setTimeout(() => {
      if (intervals.current.fill) {
        clearInterval(intervals.current.fill);
        intervals.current.fill = null;
      }
      
      intervals.current.colorfulFill = window.setInterval(() => {
        updateFill(getRandomColor());
      }, 5000);
    }, 10 * 60000 + 2500);
  }, [getRandomGrayColor, getRandomColor, updateStroke, updateFill]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllAnimations();
    };
  }, [clearAllAnimations]);

  return {
    startAnimations,
    clearAllAnimations,
  };
};