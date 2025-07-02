// Debug mode
export const DEBUG = false;

// Drag-tuning constants
export const DRAG_THRESHOLD = 10; // px before drag counts
export const DRAG_SLOWDOWN_DEAD_ZONE_PX = 10; // no-slow band above/below slider
export const DRAG_SLOWDOWN_RAMP_BASE_PX = 450; // ramp half-height in px
export const DRAG_SLOWDOWN_RAMP_PX = DRAG_SLOWDOWN_RAMP_BASE_PX * 2; // full ramp span
export const MIN_SPEED_FACTOR = 0.1; // min speed (normal)
export const SHIFT_MIN_SPEED_FACTOR = 0.01; // min speed with Shift
export const SHIFT_SLOWDOWN_DIVIDER = 5; // Shift divides speed by this
export const REFERENCE_SLIDER_WIDTH = 180; // px - base slider width for zoom calculations

// Zoom mapping constants (moved from constants.ts)
export const ZOOM_DRAG_MIN_SCALE = 0.5; // Drag scaling at MIN_ZOOM (18%)
export const ZOOM_DRAG_MAX_SCALE = 2.0; // Drag scaling at MAX_ZOOM (400%)

export interface InputProps {
  nodeId: string;
  name: string;
  description?: string | null;
  min?: number;
  max?: number;
  value: number;
  onChange: (event: any, value: number) => void;
  id: string;
  size?: "small" | "medium";
  color?: "primary" | "secondary";
  className?: string;
  inputType?: "int" | "float";
  hideLabel?: boolean;
  tabIndex?: number;
  zoomAffectsDragging?: boolean;
}

export interface NumberInputState {
  isDefault: boolean;
  localValue: string;
  originalValue: number;
  dragStartX: number;
  decimalPlaces: number;
  isDragging: boolean;
  hasExceededDragThreshold: boolean;
  dragInitialValue: number;
  currentDragValue: number;
  lastClientX: number;
  dragPointerY: number | null;
  actualSliderWidth: number;
}
