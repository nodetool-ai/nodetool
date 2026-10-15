import type { ReactNode } from "react";

import { StatusBar, StatusBarItem } from "../../ui_primitives";

interface GameStatusBarProps {
  tick: number;
  score: number;
  won: boolean;
  backend: string;
  hint?: ReactNode;
}

/** Bottom strip with the play session's tick, score and renderer backend. */
export default function GameStatusBar({ tick, score, won, backend, hint }: GameStatusBarProps) {
  return <StatusBar>
    <StatusBarItem grow sx={{ color: "text.disabled" }}>{hint}</StatusBarItem>
    <StatusBarItem sx={{ fontVariantNumeric: "tabular-nums", color: "text.primary" }}>
      Tick {tick} · Score {score} · {won ? "Won" : "Playing"} · {backend}
    </StatusBarItem>
  </StatusBar>;
}
