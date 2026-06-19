import * as React from "react";
import { FlexColumn, FlexRow, Chip, Text } from "nodetool";

export const Stacked = () => (
  <FlexColumn gap={1} sx={{ width: 280 }}>
    <Text weight={500}>Run summary</Text>
    <Text size="small" color="secondary">
      12 nodes executed in 4.2s
    </Text>
    <Text size="small" color="secondary">
      Output: 1 image, 2 text values
    </Text>
  </FlexColumn>
);

export const Centered = () => (
  <FlexColumn gap={1} align="center" justify="center" sx={{ height: 140, width: 280 }}>
    <Chip label="No selection" />
    <Text size="small" color="secondary">
      Pick a node to see its properties
    </Text>
  </FlexColumn>
);

export const Padded = () => (
  <FlexColumn gap={1.5} padding={2} sx={{ width: 280, background: "#0f1112", borderRadius: 8 }}>
    <Text weight={500}>Model card</Text>
    <FlexRow gap={1}>
      <Chip label="anthropic" color="primary" />
      <Chip label="streaming" />
    </FlexRow>
    <Text size="small" color="secondary">
      claude-sonnet-4-6 · 200k context
    </Text>
  </FlexColumn>
);
