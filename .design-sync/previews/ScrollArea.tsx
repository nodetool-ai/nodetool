import * as React from "react";
import { ScrollArea, Surface, Text, FlexColumn, FlexRow } from "nodetool";

const nodes = [
  "Load Image",
  "Resize",
  "Stable Diffusion XL",
  "Upscale 4x",
  "Save Asset",
  "Generate Caption",
  "Whisper Transcribe",
  "Summarize Text",
  "Send Email",
  "Slack Notify"
];

export const Vertical = () => (
  <Surface bordered background="transparent" rounded="small" sx={{ width: 280 }}>
    <ScrollArea maxHeight={180} thin padding={1}>
      <FlexColumn gap={1}>
        {nodes.map((n) => (
          <Text key={n} size="small">
            {n}
          </Text>
        ))}
      </FlexColumn>
    </ScrollArea>
  </Surface>
);

export const Horizontal = () => (
  <Surface bordered background="transparent" rounded="small" sx={{ width: 280 }}>
    <ScrollArea direction="horizontal" thin padding={1}>
      <FlexRow gap={1} sx={{ width: 600 }}>
        {nodes.map((n) => (
          <Surface
            key={n}
            bordered
            background="transparent"
            rounded="small"
            padding={1}
            sx={{ flexShrink: 0 }}
          >
            <Text size="smaller">{n}</Text>
          </Surface>
        ))}
      </FlexRow>
    </ScrollArea>
  </Surface>
);
