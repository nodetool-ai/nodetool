import React from "react";
import { createPortal } from "react-dom";

interface SpeedDisplayProps {
  speedFactor: number;
  mousePosition: { x: number; y: number };
  isDragging: boolean;
}

const SpeedDisplay: React.FC<SpeedDisplayProps> = ({
  speedFactor = 1,
  mousePosition,
  isDragging
}) => {
  // Hide entirely if not dragging or if slowdown is not active (speedFactor ~ 1)
  if (!isDragging || speedFactor >= 0.999) return null;

  const speedDisplay = (
    <div
      style={{
        position: "fixed",
        left: mousePosition.x - 25,
        top: mousePosition.y + 30,
        backgroundColor: "var(--color-background-paper)",
        color: "white",
        padding: ".5em 1em",
        borderRadius: ".5em",
        fontSize: "var(--fontSizeSmall)",
        pointerEvents: "none",
        zIndex: 999999,
        fontFamily: "var(--fontFamily)",
        textAlign: "center",
        maxWidth: "200px",
        opacity: 0.4,
        transition: "opacity 0.1s ease-in-out"
      }}
    >
      <div>{(speedFactor * 100).toFixed(0)}%</div>
    </div>
  );

  try {
    return createPortal(speedDisplay, document.body);
  } catch (error) {
    // Fallback: render normally if portal fails
    console.warn("Failed to create portal for SpeedDisplay:", error);
    return speedDisplay;
  }
};

export default SpeedDisplay;
