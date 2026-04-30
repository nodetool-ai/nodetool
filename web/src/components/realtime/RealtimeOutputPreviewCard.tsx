import { Card, Caption, FlexColumn, Text } from "../ui_primitives";
import { RealtimeVideoFrameRenderer } from "../node/output/RealtimeVideoFrameRenderer";
import type { RealtimeOutputFrame } from "../../stores/RealtimeSessionStore";
import { realtimeCardSx, realtimePreviewPaneSx } from "./realtimeStyles";

interface RealtimeOutputPreviewCardProps {
  outputFrame: RealtimeOutputFrame | null;
}

export const RealtimeOutputPreviewCard = ({
  outputFrame
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
            <RealtimeVideoFrameRenderer frame={outputFrame.frame} />
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
          </>
        ) : null}
      </FlexColumn>
    </Card>
  );
};
