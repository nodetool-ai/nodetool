import { Card, Caption, FlexColumn, Text } from "../ui_primitives";
import { RealtimeVideoFrameRenderer } from "../node/output/RealtimeVideoFrameRenderer";
import type { RealtimeOutputFrame } from "../../stores/RealtimeSessionStore";

interface RealtimeOutputPreviewCardProps {
  outputFrame: RealtimeOutputFrame | null;
}

export const RealtimeOutputPreviewCard = ({
  outputFrame
}: RealtimeOutputPreviewCardProps) => {
  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={(theme) => ({ borderRadius: theme.rounded.xs })}
    >
      <FlexColumn gap={1.5}>
        <Text weight={600}>Generated Output Preview</Text>
        {outputFrame ? (
          <>
            <RealtimeVideoFrameRenderer frame={outputFrame.frame} />
            <Caption>
              {outputFrame.nodeName || outputFrame.nodeId}.{outputFrame.outputName}{" "}
              received {new Date(outputFrame.receivedAt).toLocaleTimeString()}
            </Caption>
          </>
        ) : (
          <Text color="secondary">
            No generated realtime frame has reached a Video Sink yet.
          </Text>
        )}
      </FlexColumn>
    </Card>
  );
};
