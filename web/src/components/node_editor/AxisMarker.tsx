import React from "react";
import { Viewport, useOnViewportChange } from "reactflow";

const AxisMarker: React.FC = () => {
  let horizontalLineRef = React.useRef<HTMLDivElement>(null);
  let verticalLineRef = React.useRef<HTMLDivElement>(null);

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
    backgroundColor: "#333"
  };

  return (
    <>
      <div
        ref={horizontalLineRef}
        style={{ ...lineStyle, width: "10000px", height: "1px" }}
      />
      <div
        ref={verticalLineRef}
        style={{ ...lineStyle, width: "1px", height: "10000px" }}
      />
    </>
  );
};

export default AxisMarker;
