import { useCallback } from "react";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
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

  // allowInInputs keeps the window listener's looser gate: it fired regardless
  // of what had focus while the viewer was open.
  const viewerKeys = { active: open, allowInInputs: true } as const;
  useGlobalCombo("arrowleft", () => changeAsset("left", false), viewerKeys);
  useGlobalCombo("arrowright", () => changeAsset("right", false), viewerKeys);
  useGlobalCombo(
    "arrowleft+control",
    () => changeAsset("left", true),
    viewerKeys
  );
  useGlobalCombo(
    "arrowright+control",
    () => changeAsset("right", true),
    viewerKeys
  );

  return { changeAsset, handleChangeAsset } as const;
}










