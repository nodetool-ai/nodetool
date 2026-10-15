/** @jsxImportSource @emotion/react */
import { memo } from "react";

import { SPACING, StatusBar, StatusBarItem, ToolbarDivider } from "../ui_primitives";
import type { SceneStats } from "./sceneOps";

const compact = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return String(value);
};

interface EditorStatusBarProps {
  selection: { name: string; type: string } | null;
  hint: string;
  stats: SceneStats;
}

/** Bottom bar: what is selected, what the mouse does now, and scene totals. */
const EditorStatusBar = ({ selection, hint, stats }: EditorStatusBarProps) => {
  return (
    <StatusBar className="editor-status-bar" sx={{ gap: SPACING.md }}>
      <StatusBarItem sx={{ color: "text.primary", overflow: "hidden", textOverflow: "ellipsis" }}>
        {selection ? `${selection.name} · ${selection.type}` : "No selection"}
      </StatusBarItem>
      <ToolbarDivider />
      <StatusBarItem grow>{hint}</StatusBarItem>
      <StatusBarItem aria-label="Scene statistics">
        {`Objects ${stats.objects}  ·  Meshes ${stats.meshes}  ·  Lights ${stats.lights}  ·  Verts ${compact(stats.vertices)}  ·  Tris ${compact(stats.triangles)}`}
      </StatusBarItem>
    </StatusBar>
  );
};

export default memo(EditorStatusBar);
