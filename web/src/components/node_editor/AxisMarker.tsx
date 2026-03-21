import React, { memo } from "react";
import { Viewport, useOnViewportChange } from "@xyflow/react";

const AxisMarker: React.FC = memo(function AxisMarker() {
  const horizontalLineRef = React.useRef<HTMLDivElement>(null);
  const verticalLineRef = React.useRef<HTMLDivElement>(null);

  useOnViewportChange({
    onChange: (viewport: Viewport) => {
      if (horizontalLineRef.current && verticalLineRef.current) {
        horizontalLineRef.current.style.top = viewport.y + "px";
        horizontalLineRef.current.style.left = viewport.x + "px";
        verticalLineRef.current.style.top = viewport.y + "px";
        verticalLineRef.current.style.left = viewport.x + "px";
      }
    }
  });

  const lineStyle: React.CSSProperties = {
    position: "absolute",
    backgroundColor: "var(--palette-c_editor_axis_color)"
  };

  return (
    <>
      <div
        ref={horizontalLineRef}
        style={{
          ...lineStyle,
          width: "80000px",
          height: "1px"
        }}
      />
      <div
        ref={verticalLineRef}
        style={{
          ...lineStyle,
          width: "1px",
          height: "80000px"
        }}
      />
    </>
  );
});

AxisMarker.displayName = "AxisMarker";

export default AxisMarker;
