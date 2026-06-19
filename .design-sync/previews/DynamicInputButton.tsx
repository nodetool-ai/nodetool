import * as React from "react";
import { DynamicInputButton, FlexColumn, FlexRow } from "nodetool";

const noop = () => {};

export const ItemLabels = () => (
  <FlexColumn gap={1} align="flex-start">
    <DynamicInputButton onAdd={noop} itemLabel="image input" />
    <DynamicInputButton onAdd={noop} itemLabel="text input" />
    <DynamicInputButton onAdd={noop} itemLabel="variable" />
  </FlexColumn>
);

export const States = () => (
  <FlexRow gap={2} align="center">
    <DynamicInputButton onAdd={noop} label="Add field" />
    <DynamicInputButton onAdd={noop} label="Add field" disabled />
  </FlexRow>
);
