import type { ReactNode } from "react";

import { CONTROL, FlexRow, Label, SPACING } from "../ui_primitives";

interface GamePanelHeaderProps {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}

/** Title strip at the top of a docked game editor panel, with optional trailing actions. */
export default function GamePanelHeader({ title, icon, children }: GamePanelHeaderProps) {
  return <FlexRow gap={SPACING.xs} align="center" sx={{
    flexShrink: 0, minHeight: CONTROL.height.md, pl: SPACING.md, pr: SPACING.xs,
    bgcolor: "action.hover", borderBottom: 1, borderColor: "divider", color: "text.secondary"
  }}>
    {icon}
    <Label component="h2" sx={{ mb: 0, flex: 1, minWidth: 0, color: "text.primary", whiteSpace: "nowrap" }}>{title}</Label>
    {children}
  </FlexRow>;
}
