import type { ReactNode } from "react";

import { Caption, CONTROL, FlexRow, SPACING } from "../ui_primitives";

interface GameStatusBarProps {
  tick: number;
  score: number;
  won: boolean;
  backend: string;
  hint?: ReactNode;
}

/** Bottom strip with the play session's tick, score and renderer backend. */
export default function GameStatusBar({ tick, score, won, backend, hint }: GameStatusBarProps) {
  return <FlexRow gap={SPACING.lg} align="center" component="footer" sx={{
    flexShrink: 0, minHeight: CONTROL.height.xs, px: SPACING.md,
    bgcolor: "background.paper", borderTop: 1, borderColor: "divider"
  }}>
    <Caption color="muted" sx={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hint}</Caption>
    <Caption sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>Tick {tick} · Score {score} · {won ? "Won" : "Playing"} · {backend}</Caption>
  </FlexRow>;
}
