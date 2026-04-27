/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useState } from "react";
import { css, keyframes } from "@emotion/react";

interface OnboardingTargetHighlightProps {
  target: HTMLElement | null;
  accent: { from: string; to: string };
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HIGHLIGHT_PADDING = 6;
const HIGHLIGHT_RADIUS = 12;

const pulse = keyframes`
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.4; }
`;

const styles = (accent: { from: string; to: string }) =>
  css({
    position: "fixed",
    pointerEvents: "none",
    zIndex: 20099,
    borderRadius: HIGHLIGHT_RADIUS,
    boxShadow: `0 0 0 2px ${accent.from}, 0 0 22px 6px ${accent.from}55, 0 0 44px 12px ${accent.to}33`,
    animation: `${pulse} 2.4s ease-in-out infinite`,
    transition: "top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease"
  });

const OnboardingTargetHighlight: React.FC<OnboardingTargetHighlightProps> = ({
  target,
  accent
}) => {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }

    const update = (): void => {
      const r = target.getBoundingClientRect();
      setRect({
        top: r.top - HIGHLIGHT_PADDING,
        left: r.left - HIGHLIGHT_PADDING,
        width: r.width + HIGHLIGHT_PADDING * 2,
        height: r.height + HIGHLIGHT_PADDING * 2
      });
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(target);

    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [target]);

  if (!rect) return null;

  return (
    <div
      css={styles(accent)}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }}
      aria-hidden
    />
  );
};

export default memo(OnboardingTargetHighlight);
