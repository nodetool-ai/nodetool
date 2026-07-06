import React, { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@mui/material/styles";
import { MOTION } from "../ui_primitives";

interface SpeedDisplayProps {
  speedFactor: number;
  isDragging: boolean;
}

const SpeedDisplay: React.FC<SpeedDisplayProps> = ({
  speedFactor = 1,
  isDragging
}) => {
  const theme = useTheme();
  const elRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging || speedFactor >= 0.999) {
      return;
    }
    const el = elRef.current;
    if (!el) {
      return;
    }
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        el.style.left = `${e.clientX - 25}px`;
        el.style.top = `${e.clientY + 30}px`;
      });
    };
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isDragging, speedFactor]);

  if (!isDragging || speedFactor >= 0.999) {
    return null;
  }

  const speedDisplay = (
    <div
      ref={elRef}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        backgroundColor: "var(--color-background-paper)",
        color: "white",
        padding: ".5em 1em",
        borderRadius: ".5em",
        fontSize: "var(--fontSizeSmall)",
        pointerEvents: "none",
        zIndex: theme.zIndex.highest,
        fontFamily: "var(--fontFamily)",
        textAlign: "center",
        maxWidth: "200px",
        opacity: 0.4,
        transition: `opacity ${MOTION.fast}`
      }}
    >
      <div>{(speedFactor * 100).toFixed(0)}%</div>
    </div>
  );

  try {
    return createPortal(speedDisplay, document.body);
  } catch (error) {
    console.warn("Failed to create portal for SpeedDisplay:", error);
    return speedDisplay;
  }
};

export default memo(SpeedDisplay);
export { SpeedDisplay };
