import * as React from "react";
import { HoverActionGroup, FlexRow, Text, EditButton } from "nodetool";

const noop = () => {};

export const Revealed = () => (
  <FlexRow
    gap={1}
    align="center"
    justify="space-between"
    sx={{ width: 320, background: "#0f1112", borderRadius: 2, px: 1.5, py: 1 }}
  >
    <Text size="small">image_upscaler.json</Text>
    <HoverActionGroup alwaysVisible>
      <EditButton onClick={noop} tooltip="Rename" />
    </HoverActionGroup>
  </FlexRow>
);

export const Pinned = () => (
  <FlexRow
    gap={1}
    align="center"
    justify="space-between"
    sx={{ width: 320, background: "#0f1112", borderRadius: 2, px: 1.5, py: 1 }}
  >
    <Text size="small">captioner.json (pinned)</Text>
    <HoverActionGroup alwaysVisible>
      <Text size="smaller" color="secondary">
        always shown
      </Text>
    </HoverActionGroup>
  </FlexRow>
);
