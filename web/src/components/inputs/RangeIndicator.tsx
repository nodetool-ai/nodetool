import { memo } from "react";

const RangeIndicator: React.FC<{
  value: number;
  min: number;
  max: number;
  isDragging: boolean;
  isEditable: boolean;
}> = ({ value, min, max, isDragging, isEditable }) => (
  <div className="range-container-wrapper nodrag">
    <div
      className={`range-container ${isDragging ? "dragging" : ""} ${
        isEditable ? "editable" : ""
      }`}
      tabIndex={-1}
    >
      <div
        className="range-indicator"
        tabIndex={-1}
        style={{
          width: `${((value - min) / (max - min)) * 100}%`
        }}
      />
    </div>
  </div>
);

export default memo(RangeIndicator);
