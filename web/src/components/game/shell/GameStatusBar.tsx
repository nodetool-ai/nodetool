import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
  const { t, i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.resolvedLanguage);
  return <StatusBar>
    <StatusBarItem grow sx={{ color: "text.disabled" }}>{hint}</StatusBarItem>
    <StatusBarItem sx={{ fontVariantNumeric: "tabular-nums", color: "text.primary" }}>
      {t("screen_game.statusBar.tick", { count: tick, formattedCount: numberFormat.format(tick) })} · {t("screen_game.statusBar.score", { score: numberFormat.format(score) })} · {won ? t("screen_game.statusBar.won") : t("screen_game.statusBar.playing")} · {backend}
    </StatusBarItem>
  </StatusBar>;
}
