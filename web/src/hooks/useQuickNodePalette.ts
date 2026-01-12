/**
 * useQuickNodePalette
 *
 * Hook to manage keyboard shortcuts for the Quick Node Palette.
 * Listens for Ctrl+P (or Cmd+P on Mac) to open/close the palette.
 */

import { useCallback } from "react";
import { useCombo } from "../stores/KeyPressedStore";
import { isMac } from "../utils/platform";
import useQuickNodePaletteStore from "../stores/QuickNodePaletteStore";

export const useQuickNodePalette = () => {
  const { togglePalette } = useQuickNodePaletteStore();

  const handleQuickPalette = useCallback(() => {
    togglePalette();
  }, [togglePalette]);

  const keyCombo = isMac() ? ["meta", "p"] : ["control", "p"];

  useCombo(keyCombo, handleQuickPalette, true);

  return {
    togglePalette
  };
};

export default useQuickNodePalette;
