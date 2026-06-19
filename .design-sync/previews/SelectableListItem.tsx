import * as React from "react";
import { SelectableListItem, Text, FlexColumn } from "nodetool";

export const States = () => (
  <FlexColumn gap={0.5} sx={{ width: 320 }}>
    <SelectableListItem onClick={() => {}}>
      <Text size="small">Image Captioning</Text>
    </SelectableListItem>
    <SelectableListItem selected onClick={() => {}}>
      <Text size="small">Stable Diffusion XL (selected)</Text>
    </SelectableListItem>
    <SelectableListItem secondary onClick={() => {}}>
      <Text size="small">Upscale 4x (compare target)</Text>
    </SelectableListItem>
    <SelectableListItem disabled onClick={() => {}}>
      <Text size="small">Whisper Transcribe (busy)</Text>
    </SelectableListItem>
  </FlexColumn>
);

export const VersionList = () => (
  <FlexColumn gap={0.5} sx={{ width: 320 }}>
    {[
      { v: "v4 — current", sel: true },
      { v: "v3 — 2 hours ago", sel: false },
      { v: "v2 — yesterday", sel: false },
      { v: "v1 — initial", sel: false }
    ].map((row) => (
      <SelectableListItem key={row.v} selected={row.sel} onClick={() => {}}>
        <Text size="small">{row.v}</Text>
      </SelectableListItem>
    ))}
  </FlexColumn>
);
