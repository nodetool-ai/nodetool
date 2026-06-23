/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";

import { BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
interface GhostNodeProps {
  position: { x: number; y: number };
  label: string | null;
  nodeType: string;
  theme: {
    textColor: string;
    accentColor: string;
    badgeBackground: string;
    badgeBorder: string;
    badgeShadow: string;
    labelBackground: string;
    hintColor: string;
  };
}

const GhostNode = memo(function GhostNode({
  position,
  label,
  nodeType,
  theme
}: GhostNodeProps) {
  const styles = useMemo(
    () => ({
      container: {
        position: "fixed" as const,
        top: position.y,
        left: position.x,
        transform: "translate(-50%, -60%)",
        pointerEvents: "none" as const,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        gap: getSpacingPx(SPACING.sm),
        zIndex: 4000,
        color: theme.textColor,
        textShadow: "0 6px 20px rgba(15, 23, 42, 0.35)"
      },
      badge: {
        width: "56px",
        height: "56px",
        borderRadius: BORDER_RADIUS.xxl,
        border: `1.6px solid ${theme.badgeBorder}`,
        background: theme.badgeBackground,
        boxShadow: theme.badgeShadow,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--fontSizeBig)",
        fontWeight: 500,
        backdropFilter: "blur(10px)",
        color: theme.accentColor
      },
      labelContainer: {
        padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
        borderRadius: BORDER_RADIUS.xl,
        background: theme.labelBackground,
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.25)",
        fontSize: "var(--fontSizeSmall)",
        fontWeight: 600,
        letterSpacing: "0.02em"
      },
      hint: {
        fontSize: "var(--fontSizeSmaller)",
        fontWeight: 500,
        letterSpacing: "0.04em",
        color: theme.hintColor
      }
    }),
    [position.x, position.y, theme]
  );

  return (
    <div style={styles.container}>
      <div style={styles.badge}>+</div>
      <div style={styles.labelContainer}>
        {label ?? nodeType.split(".").pop()}
      </div>
      <div style={styles.hint}>Click to place · Esc to cancel</div>
    </div>
  );
});

// Custom comparison to minimize re-renders during node placement
const arePropsEqual = (
  prevProps: GhostNodeProps,
  nextProps: GhostNodeProps
) => {
  return (
    prevProps.position.x === nextProps.position.x &&
    prevProps.position.y === nextProps.position.y &&
    prevProps.label === nextProps.label &&
    prevProps.nodeType === nextProps.nodeType
  );
};

export default memo(GhostNode, arePropsEqual);
