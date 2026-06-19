import * as React from "react";
import { Checkbox, FlexColumn } from "nodetool";

export const States = () => (
  <FlexColumn gap={0.5}>
    <Checkbox label="Run on save" />
    <Checkbox label="Cache results" defaultChecked />
    <Checkbox label="Disabled option" disabled />
    <Checkbox label="Disabled (checked)" disabled defaultChecked />
  </FlexColumn>
);

export const Colors = () => (
  <FlexColumn gap={0.5}>
    <Checkbox label="Primary" defaultChecked color="primary" />
    <Checkbox label="Success" defaultChecked color="success" />
    <Checkbox label="Warning" defaultChecked color="warning" />
    <Checkbox label="Error" defaultChecked color="error" />
  </FlexColumn>
);

export const Sizes = () => (
  <FlexColumn gap={0.5}>
    <Checkbox label="Small" size="small" defaultChecked />
    <Checkbox label="Medium" size="medium" defaultChecked />
  </FlexColumn>
);
