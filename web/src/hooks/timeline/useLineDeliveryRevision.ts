import { useCallback } from "react";
import {
  createLineDeliveryRequest,
  ensureBaselineTake,
  lineDeliveryGenerateMediaData
} from "@nodetool-ai/timeline";
import type { LineDeliveryRequest } from "@nodetool-ai/timeline";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import {
  durationBucketKey,
  PENDING_TTL_MS,
  useDirectGenPendingStore
} from "./directGenPending";
import { subscribeDirectGen } from "./useTimelineDirectGenJob";

interface UseLineDeliveryRevisionApi {
  reviseLine: (input: {
    clipId: string;
    instructions?: string;
    speed?: number;
  }) => Promise<string | null>;
}

/** Submit a Script-linked audio revision as an inactive timeline candidate. */
export function useLineDeliveryRevision(): UseLineDeliveryRevisionApi {
  const timeline = useTimelineStoreApi();

  const reviseLine = useCallback(
    async (input: {
      clipId: string;
      instructions?: string;
      speed?: number;
    }): Promise<string | null> => {
      const sequenceId = timeline.getState().sequenceId;
      const clip = timeline
        .getState()
        .clips.find((candidate) => candidate.id === input.clipId);
      if (!sequenceId || !clip || clip.mediaType !== "audio") return null;
      if (!clip.scriptId || !clip.scriptLineId) return null;

      const script = useScriptStore.getState().getScript(clip.scriptId);
      const line = script?.sections
        .flatMap((section) => section.lines)
        .find((candidate) => candidate.id === clip.scriptLineId);
      if (!script || !line) return null;
      const speaker = script.cast.find((candidate) => candidate.id === line.speakerId);
      const requestResult = createLineDeliveryRequest({
        scriptId: script.id,
        line: {
          id: line.id,
          speakerId: line.speakerId,
          text: line.text,
          direction: line.direction,
          targetDurationMs: line.targetDurationMs,
          voiceOverride: line.voiceOverride
        },
        castMember: speaker
          ? { id: speaker.id, voice: speaker.voice }
          : undefined,
        language: script.setup?.language,
        pace: script.setup?.pace,
        speed: input.speed,
        instructions: input.instructions
      });
      if (!requestResult.ok) return null;
      const request: LineDeliveryRequest = requestResult.request;

      const baseline = ensureBaselineTake(clip);
      if (baseline !== clip) {
        timeline.getState().patchClip(input.clipId, {
          versions: baseline.versions,
          activeTakeId: baseline.activeTakeId
        });
      }

      const requestId = crypto.randomUUID();
      const cleanup = subscribeDirectGen(
        timeline,
        input.clipId,
        requestId,
        sequenceId,
        Date.now() + PENDING_TTL_MS,
        undefined,
        undefined,
        true,
        request
      );
      useDirectGenPendingStore.getState().remember(sequenceId, {
        clipId: input.clipId,
        requestId,
        startedAt: Date.now(),
        bucket: durationBucketKey("change_line_delivery", request.sourceContext.voice.model),
        lineDelivery: request,
        candidateOnly: true
      });

      try {
        await globalWebSocketManager.send({
          command: "generate_media",
          request_id: requestId,
          data: lineDeliveryGenerateMediaData(request)
        });
        return requestId;
      } catch {
        cleanup();
        useDirectGenPendingStore.getState().settle(sequenceId, input.clipId);
        return null;
      }
    },
    [timeline]
  );

  return { reviseLine };
}

export default useLineDeliveryRevision;
