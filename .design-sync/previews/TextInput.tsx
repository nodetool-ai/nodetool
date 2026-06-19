import * as React from "react";
import { TextInput, FlexColumn } from "nodetool";

export const Default = () => {
  const [value, setValue] = React.useState("Image upscaler");
  return (
    <div style={{ width: 360 }}>
      <TextInput
        label="Workflow name"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setValue(e.target.value)
        }
      />
    </div>
  );
};

export const Variants = () => {
  const [value, setValue] = React.useState("claude-sonnet-4-6");
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setValue(e.target.value);
  return (
    <FlexColumn gap={2} style={{ width: 360 }}>
      <TextInput label="Outlined" variant="outlined" value={value} onChange={onChange} />
      <TextInput label="Filled" variant="filled" value={value} onChange={onChange} />
      <TextInput label="Standard" variant="standard" value={value} onChange={onChange} />
    </FlexColumn>
  );
};

export const States = () => {
  const [value, setValue] = React.useState("gpt-5.4-mini");
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setValue(e.target.value);
  return (
    <FlexColumn gap={2} style={{ width: 360 }}>
      <TextInput label="With helper" value={value} onChange={onChange} helperText="Model id used by the provider." />
      <TextInput label="Error" value="" onChange={onChange} errorMessage="API key is required." />
      <TextInput label="Disabled" value="localhost:7777" onChange={onChange} disabled />
      <TextInput label="Required" value={value} onChange={onChange} required />
    </FlexColumn>
  );
};

export const Multiline = () => {
  const [value, setValue] = React.useState(
    "Summarize the transcript and extract action items as a bulleted list."
  );
  return (
    <div style={{ width: 360 }}>
      <TextInput
        label="System prompt"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setValue(e.target.value)
        }
        multiline
        rows={4}
      />
    </div>
  );
};
