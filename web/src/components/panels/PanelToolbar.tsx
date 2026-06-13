/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import { FlexRow, Text } from "../ui_primitives";

const PANEL_TOOLBAR_HEIGHT = 36;

interface PanelToolbarProps {
  title: string;
  /** Item count shown next to the title (omit to hide). */
  count?: number;
  /** Filters and other controls, rendered after the title. */
  children?: React.ReactNode;
  /** Right-aligned action buttons. */
  actions?: React.ReactNode;
}

const styles = (theme: Theme) =>
  css({
    height: PANEL_TOOLBAR_HEIGHT,
    minHeight: PANEL_TOOLBAR_HEIGHT,
    flexShrink: 0,
    padding: "0 8px 0 12px",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    userSelect: "none",
    ".toolbar-title": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      lineHeight: 1,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap"
    },
    ".toolbar-count": {
      fontSize: "var(--fontSizeSmaller)",
      fontVariantNumeric: "tabular-nums",
      lineHeight: 1,
      color: theme.vars.palette.text.disabled
    },
    ".toolbar-actions": {
      marginLeft: "auto"
    }
  });

/**
 * Shared toolbar for bottom-panel views (Logs, Trace, Versions, Sandboxes).
 * Keeps height, spacing, font, and divider consistent across panels.
 */
const PanelToolbar: React.FC<PanelToolbarProps> = ({
  title,
  count,
  children,
  actions
}) => {
  const theme = useTheme();

  return (
    <FlexRow
      css={styles(theme)}
      className="panel-toolbar"
      align="center"
      gap={1.5}
      fullWidth
    >
      <Text component="span" className="toolbar-title">
        {title}
      </Text>
      {count !== undefined && (
        <Text component="span" className="toolbar-count">
          {count}
        </Text>
      )}
      {children}
      {actions && (
        <FlexRow className="toolbar-actions" align="center" gap={0.5}>
          {actions}
        </FlexRow>
      )}
    </FlexRow>
  );
};

export default memo(PanelToolbar);
