/** @jsxImportSource @emotion/react */
/**
 * ToolToggle — Select / Cut tool buttons for the timeline editor.
 *
 * Pairs with the V (select) / C (cut) keyboard shortcuts handled in
 * TracksRegion. The active button is rendered with primary color and
 * `aria-pressed=true` for screen readers.
 */
import React, { memo } from "react";
import NearMeIcon from "@mui/icons-material/NearMe";
import ContentCutIcon from "@mui/icons-material/ContentCut";

import { FlexRow, ToolbarIconButton } from "../ui_primitives";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";

export const ToolToggle: React.FC = memo(() => {
  const activeTool = useTimelineUIStore((s) => s.activeTool);
  const setActiveTool = useTimelineUIStore((s) => s.setActiveTool);
  return (
    <FlexRow gap={0.25} align="center">
      <ToolbarIconButton
        icon={<NearMeIcon />}
        tooltip="Select tool (V)"
        active={activeTool === "select"}
        onClick={() => setActiveTool("select")}
        aria-label="Select tool"
        aria-pressed={activeTool === "select"}
      />
      <ToolbarIconButton
        icon={<ContentCutIcon />}
        tooltip="Cut tool (C) — click a clip to split"
        active={activeTool === "cut"}
        onClick={() => setActiveTool("cut")}
        aria-label="Cut tool"
        aria-pressed={activeTool === "cut"}
      />
    </FlexRow>
  );
});
ToolToggle.displayName = "ToolToggle";

export default ToolToggle;
