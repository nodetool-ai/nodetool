import * as React from "react";
import { CopyButton, FlexRow, FlexColumn, Text } from "nodetool";

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <CopyButton value="workflow-id-7f3a" buttonSize="small" />
    <CopyButton value="workflow-id-7f3a" buttonSize="medium" />
    <CopyButton value="workflow-id-7f3a" buttonSize="large" />
  </FlexRow>
);

export const States = () => (
  <FlexRow gap={2} align="center">
    <CopyButton value="ws://localhost:7777/ws" tooltip="Copy endpoint" />
    <CopyButton value="" tooltip="Nothing to copy" />
    <CopyButton value="sk-..." disabled />
  </FlexRow>
);

export const InContext = () => (
  <FlexColumn gap={0.5} sx={{ width: 320 }}>
    <Text size="small" color="secondary">
      API endpoint
    </Text>
    <FlexRow
      gap={1}
      align="center"
      justify="space-between"
      sx={{ background: "#0f1112", borderRadius: 8, px: 1.5, py: 0.5 }}
    >
      <Text size="small">http://localhost:7777</Text>
      <CopyButton value="http://localhost:7777" tooltip="Copy URL" />
    </FlexRow>
  </FlexColumn>
);
