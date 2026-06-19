import * as React from "react";
import { SelectField, FlexColumn } from "nodetool";

const providers = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "ollama", label: "Ollama (local)" }
];

export const Basic = () => {
  const [value, setValue] = React.useState("anthropic");
  return (
    <div style={{ width: 280 }}>
      <SelectField label="Provider" value={value} onChange={setValue} options={providers} />
    </div>
  );
};

export const WithDescription = () => {
  const [value, setValue] = React.useState("openai");
  return (
    <div style={{ width: 280 }}>
      <SelectField
        label="Default provider"
        value={value}
        onChange={setValue}
        options={providers}
        description="Used when a node does not specify its own provider."
      />
    </div>
  );
};

export const Outlined = () => {
  const [value, setValue] = React.useState("gemini");
  return (
    <div style={{ width: 280 }}>
      <SelectField
        label="Provider"
        value={value}
        onChange={setValue}
        options={providers}
        variant="outlined"
        size="small"
      />
    </div>
  );
};
