import * as React from "react";
import { SelectionControls, FlexColumn } from "nodetool";

const noop = () => {};

export const Buttons = () => (
  <FlexColumn gap={2}>
    <SelectionControls selectedCount={0} totalCount={24} onSelectAll={noop} onClear={noop} />
    <SelectionControls selectedCount={5} totalCount={24} onSelectAll={noop} onClear={noop} />
    <SelectionControls selectedCount={24} totalCount={24} onSelectAll={noop} onClear={noop} />
  </FlexColumn>
);

export const Toggle = () => (
  <FlexColumn gap={2}>
    <SelectionControls variant="toggle" selectedCount={0} totalCount={24} onSelectAll={noop} onClear={noop} />
    <SelectionControls variant="toggle" selectedCount={8} totalCount={24} onSelectAll={noop} onClear={noop} />
    <SelectionControls variant="toggle" selectedCount={24} totalCount={24} onSelectAll={noop} onClear={noop} />
  </FlexColumn>
);
