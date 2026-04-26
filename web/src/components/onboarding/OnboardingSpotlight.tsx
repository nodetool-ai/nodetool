/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useState } from "react";
import { css, keyframes } from "@emotion/react";
import { fadeInBackdrop } from "./animations";

interface OnboardingSpotlightProps {
  /** Element to cut a hole around. If null/undefined, renders a full backdrop. */
  target: HTMLElement | null;
  /** Padding around the target rect, in px. */
  padding?: number;
  /** Backdrop opacity (0-1). */
  opacity?: number;
}

const expandRing = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(123, 168, 255, 0.55); }
  100% { box-shadow: 0 0 0 18px rgba(123, 168, 255, 0); }
`;

const styles = (opacity: number) =>
  css({
    position: "fixed",
    inset: 0,
    zIndex: 1900,
    pointerEvents: "none",
    animation: `${fadeInBackdrop} 280ms ease both`,
    "& .spotlight-veil": {
      position: "absolute",
      inset: 0,
      backgroundColor: `rgba(8, 12, 22, ${opacity})`,
      backdropFilter: "blur(2px)",
      WebkitBackdropFilter: "blur(2px)",
      transition: "clip-path 320ms cubic-bezier(0.22, 0.61, 0.36, 1)"
    },
    "& .spotlight-ring": {
      position: "absolute",
      borderRadius: 14,
      border: "2px solid rgba(123, 168, 255, 0.85)",
      boxShadow:
        "0 0 0 9999px rgba(0,0,0,0), 0 0 24px rgba(123, 168, 255, 0.45)",
      animation: `${expandRing} 1.6s ease-out infinite`,
      transition:
        "top 320ms cubic-bezier(0.22, 0.61, 0.36, 1), " +
        "left 320ms cubic-bezier(0.22, 0.61, 0.36, 1), " +
        "width 320ms cubic-bezier(0.22, 0.61, 0.36, 1), " +
        "height 320ms cubic-bezier(0.22, 0.61, 0.36, 1)"
    }
  });

const useTargetRect = (target: HTMLElement | null): DOMRect | null => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const update = (): void => setRect(target.getBoundingClientRect());
    update();

    const ro = new ResizeObserver(update);
    ro.observe(target);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    const interval = window.setInterval(update, 500);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.clearInterval(interval);
    };
  }, [target]);

  return rect;
};

const OnboardingSpotlight: React.FC<OnboardingSpotlightProps> = ({
  target,
  padding = 8,
  opacity = 0.65
}) => {
  const rect = useTargetRect(target);

  const clipPath = rect
    ? `polygon(
        0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.top - padding}px,
        ${rect.left - padding}px ${rect.top - padding}px,
        ${rect.left - padding}px ${rect.bottom + padding}px,
        ${rect.right + padding}px ${rect.bottom + padding}px,
        ${rect.right + padding}px ${rect.top - padding}px,
        0 ${rect.top - padding}px
      )`
    : undefined;

  return (
    <div css={styles(opacity)} aria-hidden>
      <div
        className="spotlight-veil"
        style={clipPath ? { clipPath, WebkitClipPath: clipPath } : undefined}
      />
      {rect && (
        <div
          className="spotlight-ring"
          style={{
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2
          }}
        />
      )}
    </div>
  );
};

export default memo(OnboardingSpotlight);
