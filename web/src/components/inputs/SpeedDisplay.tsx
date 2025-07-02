import React from "react";
import { createPortal } from "react-dom";

interface SpeedDisplayProps {
  speedFactor: number;
  zoom: number;
  mousePosition: { x: number; y: number };
  isDragging: boolean;
  sliderWidth: number;
}

const SpeedDisplay: React.FC<SpeedDisplayProps> = ({
  speedFactor,
  zoom,
  mousePosition,
  isDragging,
  sliderWidth
}) => {
  if (!isDragging) return null;

  const speedDisplay = (
    <div
      style={{
        position: "fixed",
        left: mousePosition.x - 25,
        top: mousePosition.y + 30,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        color: "white",
        padding: "6px 10px",
        borderRadius: "6px",
        fontSize: "12px",
        pointerEvents: "none",
        zIndex: 999999,
        fontFamily: "monospace",
        whiteSpace: "nowrap",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)"
      }}
    >
      <div>Speed: {(speedFactor * 100).toFixed(1)}%</div>
      <div>Zoom: {(zoom * 100).toFixed(0)}%</div>
      <div>WidthScreen: {(sliderWidth * zoom).toFixed(0)}px</div>
    </div>
  );

  // Render the display as a portal to the document body to avoid clipping
  try {
    return createPortal(speedDisplay, document.body);
  } catch (error) {
    // Fallback: render normally if portal fails
    console.warn("Failed to create portal for SpeedDisplay:", error);
    return speedDisplay;
  }
};

export default SpeedDisplay;
