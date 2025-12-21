import { useCallback, useEffect } from "react";
import type { Asset } from "../../stores/ApiTypes";

export function useAssetNavigation(params: {
  open: boolean;
  assets: Asset[];
  currentIndex: number | null;
  prevNextAmount?: number;
  onChangeIndex: (index: number) => void;
}) {
  const {
    open,
    assets,
    currentIndex,
    prevNextAmount = 5,
    onChangeIndex
  } = params;

  const handleChangeAsset = useCallback(
    (index: number) => {
      if (index >= 0 && index < assets.length) {
        onChangeIndex(index);
      }
    },
    [assets.length, onChangeIndex]
  );

  const changeAsset = useCallback(
    (direction: "left" | "right", controlKeyPressed: boolean) => {
      if (currentIndex === null) {return;}
      if (direction === "left" && currentIndex > 0) {
        const delta = controlKeyPressed ? prevNextAmount : 1;
        handleChangeAsset(Math.max(0, currentIndex - delta));
      } else if (direction === "right" && currentIndex < assets.length - 1) {
        const delta = controlKeyPressed ? prevNextAmount : 1;
        handleChangeAsset(Math.min(assets.length - 1, currentIndex + delta));
      }
    },
    [assets.length, currentIndex, prevNextAmount, handleChangeAsset]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) {return;}
      if (e.key === "ArrowLeft") {
        changeAsset("left", e.ctrlKey);
      } else if (e.key === "ArrowRight") {
        changeAsset("right", e.ctrlKey);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, changeAsset]);

  return { changeAsset, handleChangeAsset } as const;
}










