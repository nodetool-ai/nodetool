import { memo } from "react";

const SLIDER_HEIGHT_DRAGGING = "3px";
const SLIDER_HEIGHT = "1px";
const SLIDER_OPACITY = 0.3;
const SLIDER_COLOR = "var(--palette-grey-100)";
const SLIDER_COLOR_DRAGGING = "var(--palette-primary-main)";
const SLIDER_BG_COLOR = "var(--palette-grey-600)";
const SLIDER_BG_COLOR_DRAGGING = "var(--palette-grey-600)";

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
      transition: "background-color 0.3s  ease-in-out, height  .1s ease-in-out",
      height: isDragging || isEditable ? SLIDER_HEIGHT_DRAGGING : SLIDER_HEIGHT,
      opacity: isDragging || isEditable ? 1 : SLIDER_OPACITY + 0.3,
      backgroundColor:
        isDragging || isEditable ? SLIDER_BG_COLOR_DRAGGING : SLIDER_BG_COLOR
    }}
  >
    <div
      className="range-indicator"
      tabIndex={-1}
      style={{
        transition:
          "background-color 0.3s  ease-in-out, height 0.2s  ease-in-out",
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
