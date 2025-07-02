import {
  DRAG_SLOWDOWN_RAMP_PX,
  MIN_SPEED_FACTOR,
  SHIFT_MIN_SPEED_FACTOR,
  SHIFT_SLOWDOWN_DIVIDER
} from "./NumberInput";

export const calculateStep = (
  min: number,
  max: number,
  inputType: "int" | "float"
): number => {
  const range = max - min;
  let baseStep: number;

  if (inputType === "float") {
    if (range <= 1) baseStep = 0.01;
    else if (range <= 20) baseStep = 0.5;
    else if (range > 20 && range <= 100) baseStep = 0.5;
    else baseStep = Math.pow(6, Math.floor(Math.log10(range)) - 2);
  } else {
    if (range <= 20) baseStep = 0.1;
    else if (range <= 1000) baseStep = 1;
    else if (range > 1000 && range <= 5000) baseStep = 16;
    else if (range > 5000 && range <= 10000) baseStep = 32;
    else if (range > 10000) baseStep = 64;
    else baseStep = Math.pow(6, Math.floor(Math.log10(range)) - 1);
  }

  return baseStep;
};

export const calculateDecimalPlaces = (baseStep: number): number => {
  return Math.max(0, Math.ceil(Math.log10(1 / baseStep)));
};

export const calculateSpeedFactor = (
  distanceOutside: number,
  shiftKey: boolean
): number => {
  // t is 0 when the mouse is at the slider; 1 once it has moved the full ramp distance.
  const t = Math.min(distanceOutside / DRAG_SLOWDOWN_RAMP_PX, 1);

  // Interpolate exponentially between 1 (no slowdown) and MIN_SPEED_FACTOR (full slowdown).
  // Using MIN_SPEED_FACTOR as the base ensures we can go below 10 % when the constant is set smaller.
  let speedFactor = Math.pow(MIN_SPEED_FACTOR, t);

  // Numerical stability guard (shouldn't be needed, but keeps us safe from NaNs).
  speedFactor = Math.max(speedFactor, MIN_SPEED_FACTOR);

  if (shiftKey) {
    speedFactor = Math.max(
      speedFactor / SHIFT_SLOWDOWN_DIVIDER,
      SHIFT_MIN_SPEED_FACTOR
    );
  }

  return speedFactor;
};

export const getEffectiveSliderWidth = (
  zoomEnabled: boolean,
  zoom: number,
  actualSliderWidth: number
): number => {
  // The visible width of the slider on-screen is its layout width multiplied by the current canvas zoom.
  // If zoom adjustments are disabled, we simply return the layout width so horizontal dragging maps 1-to-1.
  return zoomEnabled && zoom > 0 ? actualSliderWidth * zoom : actualSliderWidth;
};

export const applyValueConstraints = (
  value: number,
  min: number,
  max: number,
  inputType: "int" | "float",
  decimalPlaces: number
): number => {
  let constrainedValue = value;

  if (inputType === "float") {
    constrainedValue = parseFloat(value.toFixed(decimalPlaces));
  } else {
    constrainedValue = Math.round(value);
  }

  return Math.max(min, Math.min(max, constrainedValue));
};
