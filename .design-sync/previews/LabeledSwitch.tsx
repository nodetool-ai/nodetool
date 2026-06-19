import * as React from "react";
import { LabeledSwitch, FlexColumn } from "nodetool";

export const Default = () => {
  const [checked, setChecked] = React.useState(true);
  return (
    <div style={{ width: 320 }}>
      <LabeledSwitch label="Run on save" checked={checked} onChange={setChecked} />
    </div>
  );
};

export const WithDescription = () => {
  const [autoSave, setAutoSave] = React.useState(true);
  const [gpu, setGpu] = React.useState(false);
  return (
    <FlexColumn gap={2} style={{ width: 320 }}>
      <LabeledSwitch
        label="Auto-save"
        checked={autoSave}
        onChange={setAutoSave}
        description="Persist graph changes every 30 seconds"
      />
      <LabeledSwitch
        label="Use GPU acceleration"
        checked={gpu}
        onChange={setGpu}
        description="Route HuggingFace nodes to the local GPU worker"
      />
    </FlexColumn>
  );
};

export const States = () => {
  const [on, setOn] = React.useState(true);
  return (
    <FlexColumn gap={1.5} style={{ width: 320 }}>
      <LabeledSwitch label="Enabled (on)" checked={on} onChange={setOn} />
      <LabeledSwitch label="Disabled (on)" checked onChange={() => {}} disabled />
      <LabeledSwitch
        label="Disabled (off)"
        checked={false}
        onChange={() => {}}
        disabled
      />
      <LabeledSwitch
        label="Small variant"
        checked
        onChange={() => {}}
        size="small"
      />
    </FlexColumn>
  );
};
