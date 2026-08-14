import { memo, useCallback, useMemo } from "react";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";

const TimelineAgentPanel = () => {
  const sequenceId = useTimelineStore((s) => s.sequenceId);

  const focused = useMemo<UiDocumentRef | null>(
    () => (sequenceId ? { type: "timeline", id: sequenceId } : null),
    [sequenceId]
  );

  const getSelection = useCallback(() => {
    const ids = [...useTimelineUIStore.getState().selectedClipIds];
    return ids.length > 0 ? { clip_ids: ids } : null;
  }, []);

  return (
    <AssistantChatPanel
      chatSource="timeline_assistant"
      focused={focused}
      getSelection={getSelection}
      workflowId={sequenceId}
      docsTopic="timelines"
      docsLabel="Video editor"
      welcomeTitle="Editor Assistant"
      welcomeBody='Ask me to edit the timeline — e.g. "generate a 5-second clip of a city at night", "split the selected clip at the playhead", or "fade out the last clip".'
    />
  );
};

export default memo(TimelineAgentPanel);
