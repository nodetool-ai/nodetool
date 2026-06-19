import * as React from "react";
import { Label, TextInput, FlexColumn } from "nodetool";

export const FormLabels = () => (
  <FlexColumn gap={2} style={{ width: 280 }}>
    <div>
      <Label htmlFor="wf-name">Workflow name</Label>
      <TextInput id="wf-name" placeholder="Untitled workflow" fullWidth />
    </div>
    <div>
      <Label required htmlFor="api-key">
        API key
      </Label>
      <TextInput id="api-key" placeholder="sk-..." fullWidth />
    </div>
  </FlexColumn>
);

export const States = () => (
  <FlexColumn gap={1.5} style={{ width: 280 }}>
    <Label>Default label</Label>
    <Label required>Required field</Label>
    <Label error>Invalid model id</Label>
    <Label disabled>Disabled setting</Label>
  </FlexColumn>
);

export const Sizes = () => (
  <FlexColumn gap={1} style={{ width: 280 }}>
    <Label size="small">Small — caption label</Label>
    <Label size="normal">Normal — field label</Label>
    <Label size="large">Large — section label</Label>
  </FlexColumn>
);
