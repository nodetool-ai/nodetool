import { memo } from "react";
import ThemeNodes from "../themes/ThemeNodes";

const SLIDER_HEIGHT_DRAGGING = "3px";
const SLIDER_HEIGHT = "3px";
const SLIDER_OPACITY = 0.4;
const SLIDER_COLOR = ThemeNodes.palette.c_gray3;
const SLIDER_COLOR_DRAGGING = ThemeNodes.palette.c_hl1;
const SLIDER_BG_COLOR = "var(--c_gray0)";
const SLIDER_BG_COLOR_DRAGGING = ThemeNodes.palette.c_gray2;

const RangeIndicator: React.FC<{
  value: number;
  min: number;
  max: number;
  isDragging: boolean;
  isEditable: boolean;
}> = ({ value, min, max, isDragging, isEditable }) => (
  <div
    className="range-container nodrag"
    tabIndex={-1}
    style={{
      opacity: isDragging || isEditable ? 1 : SLIDER_OPACITY + 0.3,
      backgroundColor:
        isDragging || isEditable ? SLIDER_BG_COLOR_DRAGGING : SLIDER_BG_COLOR
    }}
  >
    <div
      className="range-indicator"
      tabIndex={-1}
      style={{
        opacity: isDragging || isEditable ? 1 : SLIDER_OPACITY,
        backgroundColor:
          isDragging || isEditable ? SLIDER_COLOR_DRAGGING : SLIDER_COLOR,
        width: `${((value - min) / (max - min)) * 100}%`,
        height:
          isDragging || isEditable ? SLIDER_HEIGHT_DRAGGING : SLIDER_HEIGHT
      }}
    />
  </div>
);

export default memo(RangeIndicator);
