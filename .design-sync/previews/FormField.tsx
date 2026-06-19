import * as React from "react";
import { FormField, TextInput, FlexColumn } from "nodetool";

export const Basic = () => {
  const [name, setName] = React.useState("Image upscaler");
  return (
    <div style={{ width: 340 }}>
      <FormField label="Workflow name" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
    </div>
  );
};

export const WithHelper = () => {
  const [key, setKey] = React.useState("");
  return (
    <div style={{ width: 340 }}>
      <FormField
        label="OpenAI API key"
        helperText="Stored encrypted on this device only."
      >
        <TextInput
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-..."
          type="password"
        />
      </FormField>
    </div>
  );
};

export const WithError = () => {
  const [email, setEmail] = React.useState("not-an-email");
  return (
    <div style={{ width: 340 }}>
      <FormField label="Notification email" error="Enter a valid email address.">
        <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
    </div>
  );
};

export const HorizontalGroup = () => {
  const [steps, setSteps] = React.useState("28");
  const [seed, setSeed] = React.useState("42");
  return (
    <FlexColumn gap={1.5} sx={{ width: 360 }}>
      <FormField label="Steps" direction="row" labelWidth={100} compact>
        <TextInput value={steps} onChange={(e) => setSteps(e.target.value)} />
      </FormField>
      <FormField label="Seed" direction="row" labelWidth={100} compact>
        <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} />
      </FormField>
    </FlexColumn>
  );
};
