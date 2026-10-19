/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { SPACING, StatusBar, StatusBarItem, ToolbarDivider } from "../ui_primitives";
import type { SceneStats } from "./sceneOps";

const compact = (value: number, locale: string): string => {
  const maximumFractionDigits = value >= 1_000_000
    ? value >= 10_000_000 ? 0 : 1
    : value >= 1_000 ? value >= 10_000 ? 0 : 1 : 0;
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits
  }).format(value);
};

interface EditorStatusBarProps {
  selection: { name: string; type: string } | null;
  hint: string;
  stats: SceneStats;
}

/** Bottom bar: what is selected, what the mouse does now, and scene totals. */
const EditorStatusBar = ({ selection, hint, stats }: EditorStatusBarProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <StatusBar className="editor-status-bar" sx={{ gap: SPACING.md }}>
      <StatusBarItem sx={{ color: "text.primary", overflow: "hidden", textOverflow: "ellipsis" }}>
        {selection
          ? `${selection.name} · ${selection.type}`
          : t("i18n-next38.statusBar.noSelection")}
      </StatusBarItem>
      <ToolbarDivider />
      <StatusBarItem grow>{hint}</StatusBarItem>
      <StatusBarItem aria-label={t("i18n-next38.statusBar.sceneStatistics")}>
        {t("i18n-next38.statusBar.stats", {
          objects: stats.objects,
          meshes: stats.meshes,
          lights: stats.lights,
          vertices: compact(stats.vertices, locale),
          triangles: compact(stats.triangles, locale)
        })}
      </StatusBarItem>
    </StatusBar>
  );
};

export default memo(EditorStatusBar);
