import * as React from "react";
import { Autocomplete, FlexColumn } from "nodetool";

const models = [
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "gpt-5.4-mini",
  "gemini-2.5-pro",
  "llama-3.3-70b",
  "mistral-large"
];

export const ModelPicker = () => {
  const [value, setValue] = React.useState<string | null>("claude-sonnet-4-6");
  return (
    <div style={{ width: 320 }}>
      <Autocomplete
        label="Model"
        placeholder="Search models…"
        options={models}
        value={value}
        onChange={(_e: unknown, v: string | null) => setValue(v)}
      />
    </div>
  );
};

export const MultiSelect = () => {
  const [value, setValue] = React.useState<string[]>(["gpt-5.4-mini", "gemini-2.5-pro"]);
  return (
    <div style={{ width: 320 }}>
      <Autocomplete
        multiple
        label="Enabled models"
        placeholder="Add a model…"
        options={models}
        value={value}
        onChange={(_e: unknown, v: string[]) => setValue(v)}
      />
    </div>
  );
};

export const States = () => (
  <FlexColumn gap={2} style={{ width: 320 }}>
    <Autocomplete label="Loading" options={models} loading />
    <Autocomplete
      label="Error"
      options={models}
      error
      helperText="This provider is not configured"
    />
    <Autocomplete label="Disabled" options={models} disabled value="gpt-5.4-mini" />
  </FlexColumn>
);
