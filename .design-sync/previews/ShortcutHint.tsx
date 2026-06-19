import * as React from "react";
import { ShortcutHint, FlexColumn, FlexRow, Text } from "nodetool";

export const Common = () => (
  <FlexColumn gap={1}>
    <FlexRow gap={1} align="center">
      <Text size="small">Save workflow</Text>
      <ShortcutHint shortcut={["cmd", "s"]} />
    </FlexRow>
    <FlexRow gap={1} align="center">
      <Text size="small">Run</Text>
      <ShortcutHint shortcut={["cmd", "enter"]} />
    </FlexRow>
    <FlexRow gap={1} align="center">
      <Text size="small">Command palette</Text>
      <ShortcutHint shortcut={["cmd", "shift", "p"]} />
    </FlexRow>
    <FlexRow gap={1} align="center">
      <Text size="small">Delete node</Text>
      <ShortcutHint shortcut={["delete"]} />
    </FlexRow>
  </FlexColumn>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <ShortcutHint shortcut={["ctrl", "z"]} size="small" />
    <ShortcutHint shortcut={["ctrl", "z"]} size="medium" />
  </FlexRow>
);
