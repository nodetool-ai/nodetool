import * as React from "react";
import { ToggleGroup, ToggleOption, FlexColumn, Text } from "nodetool";

export const Default = () => {
  const [value, setValue] = React.useState("cpu");
  return (
    <ToggleGroup
      exclusive
      value={value}
      onChange={(_e: unknown, v: string | null) => v && setValue(v)}
    >
      <ToggleOption value="cpu">CPU</ToggleOption>
      <ToggleOption value="gpu">GPU</ToggleOption>
      <ToggleOption value="mps">MPS</ToggleOption>
    </ToggleGroup>
  );
};

export const Colors = () => {
  const [value, setValue] = React.useState("running");
  return (
    <FlexColumn gap={1.5}>
      <Text size="small" color="secondary">primary</Text>
      <ToggleGroup
        exclusive
        color="primary"
        value={value}
        onChange={(_e: unknown, v: string | null) => v && setValue(v)}
      >
        <ToggleOption value="queued">Queued</ToggleOption>
        <ToggleOption value="running">Running</ToggleOption>
        <ToggleOption value="done">Done</ToggleOption>
      </ToggleGroup>
      <Text size="small" color="secondary">success</Text>
      <ToggleGroup
        exclusive
        color="success"
        value={value}
        onChange={(_e: unknown, v: string | null) => v && setValue(v)}
      >
        <ToggleOption value="queued">Queued</ToggleOption>
        <ToggleOption value="running">Running</ToggleOption>
        <ToggleOption value="done">Done</ToggleOption>
      </ToggleGroup>
    </FlexColumn>
  );
};

export const Sizes = () => {
  const [value, setValue] = React.useState("md");
  const onChange = (_e: unknown, v: string | null) => v && setValue(v);
  return (
    <FlexColumn gap={1.5} align="start">
      <ToggleGroup exclusive size="small" value={value} onChange={onChange}>
        <ToggleOption value="sm">Small</ToggleOption>
        <ToggleOption value="md">Medium</ToggleOption>
        <ToggleOption value="lg">Large</ToggleOption>
      </ToggleGroup>
      <ToggleGroup exclusive size="large" value={value} onChange={onChange}>
        <ToggleOption value="sm">Small</ToggleOption>
        <ToggleOption value="md">Medium</ToggleOption>
        <ToggleOption value="lg">Large</ToggleOption>
      </ToggleGroup>
    </FlexColumn>
  );
};

export const FullWidth = () => {
  const [value, setValue] = React.useState("edit");
  return (
    <div style={{ width: 380 }}>
      <ToggleGroup
        exclusive
        fullWidth
        value={value}
        onChange={(_e: unknown, v: string | null) => v && setValue(v)}
      >
        <ToggleOption value="view">View</ToggleOption>
        <ToggleOption value="edit">Edit</ToggleOption>
        <ToggleOption value="run">Run</ToggleOption>
      </ToggleGroup>
    </div>
  );
};
