import * as React from "react";
import { Overlay, Text, FlexColumn, ProgressBar } from "nodetool";

export const RunningWorkflow = () => (
  <div style={{ position: "relative", height: 280 }}>
    <Overlay open centered opacity={0.6} blur={3} sx={{ position: "absolute" }}>
      <FlexColumn gap={1.5} align="center" sx={{ p: 3, minWidth: 240 }}>
        <Text size="big" weight={600}>
          Running workflow…
        </Text>
        <Text size="small" color="secondary">
          Node 4 of 9 · Generate Image
        </Text>
        <div style={{ width: 200 }}>
          <ProgressBar value={45} />
        </div>
      </FlexColumn>
    </Overlay>
  </div>
);
