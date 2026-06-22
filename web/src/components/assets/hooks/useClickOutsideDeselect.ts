import { useCallback, useEffect } from "react";

export function useClickOutsideDeselect(
  classNames: string[],
  isSelected: boolean,
  onDeselect: () => void
) {
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      if (
        !target.classList.contains("selected-asset-info") &&
        classNames.some((cn) => target.classList.contains(cn))
      ) {
        if (isSelected) {onDeselect();}
      }
    },
    [classNames, isSelected, onDeselect]
  );

  useEffect(() => {
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [handleClickOutside]);
}

export default useClickOutsideDeselect;
