import * as React from "react";
import { UndoRedoButtons, FlexRow, FlexColumn, Text } from "nodetool";

const noop = () => {};

export const Default = () => (
  <UndoRedoButtons canUndo canRedo onUndo={noop} onRedo={noop} />
);

export const States = () => (
  <FlexColumn gap={1.5}>
    <FlexRow gap={2} align="center">
      <Text size="small" color="secondary" style={{ width: 110 }}>both enabled</Text>
      <UndoRedoButtons canUndo canRedo onUndo={noop} onRedo={noop} />
    </FlexRow>
    <FlexRow gap={2} align="center">
      <Text size="small" color="secondary" style={{ width: 110 }}>undo only</Text>
      <UndoRedoButtons canUndo canRedo={false} onUndo={noop} onRedo={noop} />
    </FlexRow>
    <FlexRow gap={2} align="center">
      <Text size="small" color="secondary" style={{ width: 110 }}>nothing yet</Text>
      <UndoRedoButtons canUndo={false} canRedo={false} onUndo={noop} onRedo={noop} />
    </FlexRow>
  </FlexColumn>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <UndoRedoButtons canUndo canRedo size="small" onUndo={noop} onRedo={noop} />
    <UndoRedoButtons canUndo canRedo size="medium" onUndo={noop} onRedo={noop} />
    <UndoRedoButtons canUndo canRedo size="large" onUndo={noop} onRedo={noop} />
  </FlexRow>
);

export const Vertical = () => (
  <UndoRedoButtons
    canUndo
    canRedo
    direction="vertical"
    showDivider
    onUndo={noop}
    onRedo={noop}
  />
);
