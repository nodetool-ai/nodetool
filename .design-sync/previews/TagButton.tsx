import * as React from "react";
import { TagButton, FlexRow, FlexColumn, Text } from "nodetool";

const noop = () => {};

export const Selection = () => (
  <FlexRow gap={1} align="center">
    <TagButton label="image" selected onClick={noop} />
    <TagButton label="text" onClick={noop} />
    <TagButton label="audio" onClick={noop} />
    <TagButton label="video" onClick={noop} />
  </FlexRow>
);

export const WithCounts = () => (
  <FlexRow gap={1} align="center">
    <TagButton label="LLM" count={42} onClick={noop} />
    <TagButton label="Diffusion" count={18} selected onClick={noop} />
    <TagButton label="Audio" count={7} onClick={noop} />
  </FlexRow>
);

export const Variants = () => (
  <FlexColumn gap={1.5}>
    <Text size="small" color="secondary">button</Text>
    <FlexRow gap={1} align="center">
      <TagButton label="huggingface" variant="button" onClick={noop} />
      <TagButton label="ollama" variant="button" selected onClick={noop} />
    </FlexRow>
    <Text size="small" color="secondary">chip</Text>
    <FlexRow gap={1} align="center">
      <TagButton label="huggingface" variant="chip" onClick={noop} />
      <TagButton label="ollama" variant="chip" selected onClick={noop} />
    </FlexRow>
  </FlexColumn>
);

export const Sizes = () => (
  <FlexRow gap={1} align="center">
    <TagButton label="small" size="small" selected onClick={noop} />
    <TagButton label="medium" size="medium" selected onClick={noop} />
  </FlexRow>
);

export const Disabled = () => (
  <FlexRow gap={1} align="center">
    <TagButton label="deprecated" disabled onClick={noop} />
    <TagButton label="locked" disabled selected onClick={noop} />
  </FlexRow>
);
