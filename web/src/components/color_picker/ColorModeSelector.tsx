import React, { memo } from "react";
import { TabGroup } from "../ui_primitives";
import { ColorMode } from "./ColorInputs";

interface ColorModeSelectorProps {
  mode: ColorMode;
  onChange: (mode: ColorMode) => void;
  showAllModes?: boolean;
}

/**
 * ColorModeSelector
 *
 * A tab selector for choosing color input modes (hex, rgb, hsl, etc.).
 * Uses the TabGroup primitive for consistent tab rendering.
 */
const ColorModeSelector: React.FC<ColorModeSelectorProps> = memo(({
  mode,
  onChange,
  showAllModes = true
}) => {
  const allModes: ColorMode[] = showAllModes
    ? ["hex", "rgb", "hsl", "hsb", "cmyk", "lab"]
    : ["hex", "rgb", "hsl"];

  const tabs = allModes.map((m) => ({ value: m, label: m.toUpperCase() }));

  return (
    <TabGroup
      tabs={tabs}
      value={mode}
      onChange={(value) => onChange(value as ColorMode)}
      size="small"
    />
  );
});

ColorModeSelector.displayName = 'ColorModeSelector';

export default ColorModeSelector;
