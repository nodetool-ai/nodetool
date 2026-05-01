/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { EditorButton } from "../ui_primitives";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SettingsIcon from "@mui/icons-material/Settings";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import { hintPop } from "./animations";
import type { OnboardingStepDefinition } from "./steps";

interface OnboardingHintProps {
  step: OnboardingStepDefinition;
  target: HTMLElement | null;
  /** Dismiss this hint (marks the step complete so it won't reappear). */
  onDismiss: () => void;
  onOpenSettings?: () => void;
  onOpenModels?: () => void;
}

type Side = "top" | "bottom" | "left" | "right" | "center";

interface Layout {
  /** Hint card position (viewport coords). */
  top: number;
  left: number;
  side: Side;
  /** Tail offset from the hint's leading edge along the layout axis. */
  tailOffset: number;
}

const HINT_OFFSET = 14;
const HINT_WIDTH = 360;
const VIEWPORT_GUTTER = 16;
const TAIL_GUTTER = 18;

const opposite = (s: Side): Side =>
  s === "top" ? "bottom"
  : s === "bottom" ? "top"
  : s === "left" ? "right"
  : s === "right" ? "left"
  : "center";

const candidateOrder = (preferred: Side): Side[] => {
  if (preferred === "center") return ["center"];
  const opp = opposite(preferred);
  const perp: Side[] =
    preferred === "top" || preferred === "bottom"
      ? ["right", "left"]
      : ["bottom", "top"];
  return [preferred, opp, ...perp];
};

interface PlaceArgs {
  rect: DOMRect;
  hintW: number;
  hintH: number;
}

const place = ({ rect, hintW, hintH }: PlaceArgs, side: Side): Layout => {
  switch (side) {
    case "top":
      return {
        side,
        top: rect.top - hintH - HINT_OFFSET,
        left: rect.left + rect.width / 2 - hintW / 2,
        tailOffset: hintW / 2
      };
    case "bottom":
      return {
        side,
        top: rect.bottom + HINT_OFFSET,
        left: rect.left + rect.width / 2 - hintW / 2,
        tailOffset: hintW / 2
      };
    case "left":
      return {
        side,
        top: rect.top + rect.height / 2 - hintH / 2,
        left: rect.left - hintW - HINT_OFFSET,
        tailOffset: hintH / 2
      };
    case "right":
      return {
        side,
        top: rect.top + rect.height / 2 - hintH / 2,
        left: rect.right + HINT_OFFSET,
        tailOffset: hintH / 2
      };
    case "center":
      return {
        side,
        top: window.innerHeight / 2 - hintH / 2,
        left: window.innerWidth / 2 - hintW / 2,
        tailOffset: hintW / 2
      };
  }
};

const fits = (l: Layout, hintW: number, hintH: number): boolean => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    l.top >= VIEWPORT_GUTTER &&
    l.left >= VIEWPORT_GUTTER &&
    l.top + hintH <= vh - VIEWPORT_GUTTER &&
    l.left + hintW <= vw - VIEWPORT_GUTTER
  );
};

const clampLayout = (l: Layout, hintW: number, hintH: number): Layout => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    ...l,
    top: Math.max(
      VIEWPORT_GUTTER,
      Math.min(l.top, vh - hintH - VIEWPORT_GUTTER)
    ),
    left: Math.max(
      VIEWPORT_GUTTER,
      Math.min(l.left, vw - hintW - VIEWPORT_GUTTER)
    )
  };
};

/**
 * Re-anchor the tail to the target's center along the layout axis so it
 * still points at the anchor — even after viewport clamping shifted the
 * hint off-axis.
 */
const adjustTail = (
  l: Layout,
  rect: DOMRect,
  hintW: number,
  hintH: number
): Layout => {
  if (l.side === "top" || l.side === "bottom") {
    const cx = rect.left + rect.width / 2;
    return {
      ...l,
      tailOffset: Math.max(
        TAIL_GUTTER,
        Math.min(cx - l.left, hintW - TAIL_GUTTER)
      )
    };
  }
  if (l.side === "left" || l.side === "right") {
    const cy = rect.top + rect.height / 2;
    return {
      ...l,
      tailOffset: Math.max(
        TAIL_GUTTER,
        Math.min(cy - l.top, hintH - TAIL_GUTTER)
      )
    };
  }
  return l;
};

const computeLayout = (
  rect: DOMRect | null,
  preferred: OnboardingStepDefinition["hintPlacement"],
  hintW: number,
  hintH: number
): Layout => {
  if (!rect) return place({ rect: {} as DOMRect, hintW, hintH }, "center");

  const order = candidateOrder(preferred ?? "bottom");
  const args = { rect, hintW, hintH };
  for (const side of order) {
    const l = place(args, side);
    if (fits(l, hintW, hintH)) return adjustTail(l, rect, hintW, hintH);
  }
  return adjustTail(
    clampLayout(place(args, preferred ?? "bottom"), hintW, hintH),
    rect,
    hintW,
    hintH
  );
};

const styles = (theme: Theme, accent: { from: string; to: string }) =>
  css({
    position: "fixed",
    width: HINT_WIDTH,
    zIndex: 20100,
    pointerEvents: "auto",
    animation: `${hintPop} 280ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,

    ".hint-card": {
      position: "relative",
      borderRadius: 12,
      padding: "14px 16px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      boxShadow: "0 14px 36px rgba(0,0,0,0.48)",
      backdropFilter: "blur(10px)"
    },
    ".hint-accent": {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: 3,
      borderRadius: "12px 0 0 12px",
      background: `linear-gradient(180deg, ${accent.from}, ${accent.to})`
    },
    ".hint-tail": {
      position: "absolute",
      width: 10,
      height: 10,
      backgroundColor: theme.vars.palette.grey[900],
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      borderLeft: `1px solid ${theme.vars.palette.grey[800]}`,
      pointerEvents: "none"
    },
    ".hint-row": {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 6
    },
    ".hint-title": {
      flex: 1,
      margin: 0,
      fontSize: 16,
      fontWeight: 600,
      lineHeight: 1.35,
      color: theme.vars.palette.text.primary
    },
    ".hint-close": {
      width: 26,
      height: 26,
      borderRadius: "50%",
      border: "none",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[500],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      flexShrink: 0,
      transition: "background 150ms ease, color 150ms ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      }
    },
    ".hint-body": {
      fontSize: 14,
      lineHeight: 1.5,
      color: theme.vars.palette.grey[300],
      margin: 0
    },
    ".hint-actions": {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12
    },
    ".hint-cta": {
      fontSize: 13,
      textTransform: "none",
      padding: "5px 12px",
      borderRadius: 8,
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      backgroundColor: "rgba(255,255,255,0.05)",
      gap: 4,
      minWidth: 0,
      whiteSpace: "nowrap",
      "&:hover": {
        backgroundImage: `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
        color: "#fff"
      }
    }
  });

/** Inline style for the tail given the chosen side and offset. */
const tailStyle = (
  side: Side,
  offset: number,
  hintH: number
): React.CSSProperties => {
  // Base shape: 10x10 with border-top + border-left. Rotation chooses
  // which corner becomes the "point". We then translate so the point
  // sits exactly on the hint's edge.
  switch (side) {
    case "bottom":
      return {
        top: -5,
        left: offset,
        transform: "translateX(-50%) rotate(45deg)"
      };
    case "top":
      return {
        top: hintH - 5,
        left: offset,
        transform: "translateX(-50%) rotate(225deg)"
      };
    case "right":
      return {
        top: offset,
        left: -5,
        transform: "translateY(-50%) rotate(-45deg)"
      };
    case "left":
      return {
        top: offset,
        left: HINT_WIDTH - 5,
        transform: "translateY(-50%) rotate(135deg)"
      };
    case "center":
      return { display: "none" };
  }
};

const OnboardingHint: React.FC<OnboardingHintProps> = ({
  step,
  target,
  onDismiss,
  onOpenSettings,
  onOpenModels
}) => {
  const theme = useTheme();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>({
    top: 0,
    left: 0,
    side: "center",
    tailOffset: HINT_WIDTH / 2
  });

  useEffect(() => {
    if (!target) return;

    const card = cardRef.current;

    const update = (): void => {
      const r = target.getBoundingClientRect();
      const hintW = card?.offsetWidth ?? HINT_WIDTH;
      const hintH = card?.offsetHeight ?? 140;
      setLayout(computeLayout(r, step.hintPlacement, hintW, hintH));
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(target);
    if (card) ro.observe(card);

    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [target, step.hintPlacement]);

  const hasAction =
    (step.settingsTab !== undefined && !!onOpenSettings) ||
    (step.modelsRoute && !!onOpenModels);

  const cardH = cardRef.current?.offsetHeight ?? 140;

  return (
    <div
      css={styles(theme, step.accent)}
      style={{ top: layout.top, left: layout.left }}
      data-side={layout.side}
      role="dialog"
      aria-label={step.hintTitle}
    >
      <div className="hint-card" ref={cardRef}>
        <span
          className="hint-tail"
          style={tailStyle(layout.side, layout.tailOffset, cardH)}
          aria-hidden
        />
        <span className="hint-accent" />
        <div className="hint-row">
          <h3 className="hint-title">{step.hintTitle}</h3>
          <button
            type="button"
            className="hint-close"
            onClick={onDismiss}
            aria-label="Dismiss hint"
          >
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
          </button>
        </div>
        <p className="hint-body">{step.hintBody}</p>
        {hasAction && (
          <div className="hint-actions">
            {step.settingsTab !== undefined && onOpenSettings && (
              <EditorButton
                className="hint-cta"
                size="small"
                onClick={onOpenSettings}
                startIcon={<SettingsIcon sx={{ fontSize: 13 }} />}
                disableElevation
              >
                Open Settings
              </EditorButton>
            )}
            {step.modelsRoute && onOpenModels && (
              <EditorButton
                className="hint-cta"
                size="small"
                onClick={onOpenModels}
                startIcon={<CloudDownloadIcon sx={{ fontSize: 13 }} />}
                disableElevation
              >
                Download Models
              </EditorButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(OnboardingHint);
