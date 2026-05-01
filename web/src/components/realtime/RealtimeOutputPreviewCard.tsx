import type { RealtimeMetrics } from "@nodetool/protocol";

import { Card, Caption, FlexColumn, Text } from "../ui_primitives";
import { RealtimeVideoFrameRenderer } from "../node/output/RealtimeVideoFrameRenderer";
import type { RealtimeOutputFrame } from "../../stores/RealtimeSessionStore";
import { realtimeCardSx, realtimePreviewPaneSx } from "./realtimeStyles";

interface RealtimeOutputPreviewCardProps {
  outputFrame: RealtimeOutputFrame | null;
  /** Subscribes canvas rAF path to `realtime_frame_out` media slot (no per-frame React updates). */
  mediaSessionId?: string | null;
  /** Latest server `realtime_metrics` (~1 Hz) for Phase R diagnostics. */
  metrics?: RealtimeMetrics | null;
}

export const RealtimeOutputPreviewCard = ({
  outputFrame,
  mediaSessionId = null,
  metrics = null
}: RealtimeOutputPreviewCardProps) => {
  const outputFps = outputFrame?.outputFps ?? null;
  const frameAgeMs = outputFrame?.frameAgeMs ?? null;

  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={realtimeCardSx}
    >
      <FlexColumn gap={1.5}>
        <Text weight={600}>Generated Output Preview</Text>
        <FlexColumn sx={realtimePreviewPaneSx}>
          {outputFrame ? (
            <RealtimeVideoFrameRenderer
              mediaSessionId={mediaSessionId ?? undefined}
              frame={outputFrame.frame}
            />
          ) : (
            <Text color="secondary" align="center">
              Waiting for a Video Sink frame.
            </Text>
          )}
        </FlexColumn>
        {outputFrame ? (
          <>
            <Caption>
              {outputFrame.nodeName || outputFrame.nodeId}.{outputFrame.outputName}{" "}
              received {new Date(outputFrame.receivedAt).toLocaleTimeString()}
            </Caption>
            <Caption>
              Output fps: {outputFps === null ? "-" : outputFps.toFixed(1)}
              {" | "}Frame age:{" "}
              {frameAgeMs === null ? "-" : `${Math.round(frameAgeMs)} ms`}
            </Caption>
            {metrics ? (
              <Caption color="secondary">
                Server bus (est.): {metrics.rates.inbound_fps.toFixed(1)} in fps ·{" "}
                {metrics.rates.outbound_fps.toFixed(1)} out fps
                {metrics.latency.frame_age_ms_avg != null
                  ? ` · avg slot age ${Math.round(metrics.latency.frame_age_ms_avg)} ms`
                  : ""}
                {metrics.websocket_lanes != null
                  ? ` · WS backlog ctrl ${metrics.websocket_lanes.control_pending}/media ${metrics.websocket_lanes.media_pending}`
                  : ""}
              </Caption>
            ) : null}
          </>
        ) : null}
      </FlexColumn>
    </Card>
  );
};
