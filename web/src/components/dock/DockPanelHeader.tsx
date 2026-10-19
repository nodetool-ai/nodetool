import type { ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { FlexRow, SPACING, CONTROL, TYPOGRAPHY, getSpacingPx } from "../ui_primitives";

interface DockPanelHeaderProps {
  /** Panel name. The dock tab already shows it, so it only names the toolbar for assistive technology. */
  title: string;
  /** Leading icon, drawn only with `label`. */
  icon?: ReactNode;
  /** Visible state label at the start of the strip, such as the viewport's "Scene" or "Game" mode. */
  label?: string;
  /** Toolbar controls, right-aligned. */
  children?: ReactNode;
  /** Lets the controls take the strip's full width, so a search field can grow. */
  fill?: boolean;
}

/**
 * Toolbar strip under a docked panel's tab. The tab names the panel, so the
 * strip carries controls only and is not drawn when a panel has none.
 */
export default function DockPanelHeader({ title, icon, label, children, fill = false }: DockPanelHeaderProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!children && !label) { return null; }
  return <FlexRow role="toolbar" aria-label={t("batch2_2.dock.panelToolbar", { panel: title })} align="center" gap={SPACING.xs} sx={{
    flexShrink: 0, minHeight: CONTROL.height.md, boxSizing: "border-box",
    paddingInline: getSpacingPx(SPACING.sm), borderBottom: `1px solid ${theme.vars.palette.divider}`,
    color: "text.secondary", userSelect: "none"
  }}>
    {label && <FlexRow align="center" gap={SPACING.xs} sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0, pl: SPACING.xs,
      "& svg": { flexShrink: 0 } }}>{icon}<span>{label}</span></FlexRow>}
    <FlexRow align="center" gap={SPACING.micro} sx={fill ? { flex: 1, minWidth: 0 } : { marginLeft: "auto", flexShrink: 0 }}>{children}</FlexRow>
  </FlexRow>;
}
