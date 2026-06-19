import * as React from "react";
import { EditButton, FlexRow, FlexColumn, Text } from "nodetool";

const noop = () => {};

export const Variants = () => (
  <FlexRow gap={2} align="center">
    <EditButton onClick={noop} iconVariant="edit" tooltip="Edit" />
    <EditButton onClick={noop} iconVariant="note" tooltip="Edit notes" />
    <EditButton onClick={noop} iconVariant="rename" tooltip="Rename" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <EditButton onClick={noop} buttonSize="small" />
    <EditButton onClick={noop} buttonSize="medium" />
    <EditButton onClick={noop} buttonSize="large" />
    <EditButton onClick={noop} disabled />
  </FlexRow>
);

export const InRow = () => (
  <FlexRow
    gap={1}
    align="center"
    justify="space-between"
    sx={{ width: 300, background: "#0f1112", borderRadius: 8, px: 1.5, py: 0.75 }}
  >
    <Text size="small">Untitled workflow</Text>
    <EditButton onClick={noop} iconVariant="rename" tooltip="Rename workflow" />
  </FlexRow>
);
