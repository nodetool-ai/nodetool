/**
 * TimelineScriptLinkChip — "Built from script <name>" in the timeline's top
 * bar.
 *
 * A timeline `v.save()` (in `@nodetool-ai/sandbox-timeline`) wrote carries
 * `builtByScriptId` on its document. The chip says which JS script built the
 * cut and opens it, so the source of truth is one click away from the
 * timeline it produced. A timeline nothing scripted wrote has no
 * `builtByScriptId` and the chip renders nothing.
 */

import React, { memo, useCallback } from "react";

import { Chip, Tooltip } from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

export interface TimelineScriptLinkChipProps {
  sequenceId: string;
}

const TimelineScriptLinkChipInner: React.FC<TimelineScriptLinkChipProps> = ({
  sequenceId
}) => {
  const { data: sequence } = trpc.timeline.get.useQuery(
    { id: sequenceId },
    { staleTime: 30_000, retry: false }
  );
  const scriptId = sequence?.builtByScriptId ?? null;
  const { data: script } = trpc.jsScripts.get.useQuery(
    { id: scriptId ?? "" },
    { enabled: !!scriptId, staleTime: 30_000, retry: false }
  );
  const scriptName = script?.name;

  const open = useCallback(() => {
    if (!scriptId) {
      return;
    }
    useWorkspaceTabsStore.getState().openTab({
      type: "jsscript",
      ref: scriptId,
      mode: "edit",
      title: scriptName
    });
  }, [scriptId, scriptName]);

  if (!scriptId) {
    return null;
  }

  return (
    <Tooltip title="Open the script this timeline was built from">
      <Chip
        compact
        label={`Built from script ${scriptName ?? "script"}`}
        onClick={open}
      />
    </Tooltip>
  );
};

export const TimelineScriptLinkChip = memo(TimelineScriptLinkChipInner);
TimelineScriptLinkChip.displayName = "TimelineScriptLinkChip";

export default TimelineScriptLinkChip;
