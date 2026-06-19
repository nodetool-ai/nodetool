import * as React from "react";
import { FlexRow, Chip, Text } from "nodetool";

export const Gaps = () => (
  <FlexRow gap={2} align="center">
    <Text size="small">Gap 2:</Text>
    <Chip label="image" />
    <Chip label="text" />
    <Chip label="audio" />
  </FlexRow>
);

export const SpaceBetween = () => (
  <FlexRow gap={1} align="center" justify="space-between" sx={{ width: 320 }}>
    <Text weight={500}>Generate Image</Text>
    <Text size="small" color="secondary">
       flux-dev
    </Text>
  </FlexRow>
);

export const Wrapping = () => (
  <FlexRow gap={1} wrap sx={{ width: 260 }}>
    {["sdxl", "flux", "kontext", "qwen", "wan", "hidream"].map((m) => (
      <Chip key={m} label={m} />
    ))}
  </FlexRow>
);

export const Alignment = () => (
  <FlexRow gap={2} align="center" sx={{ height: 64 }}>
    <Chip label="GPU 0" color="success" />
    <Chip label="24 GB" />
    <Text size="small" color="secondary">
      centered vertically in a 64px row
    </Text>
  </FlexRow>
);
