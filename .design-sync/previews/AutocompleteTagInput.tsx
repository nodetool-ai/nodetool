import * as React from "react";

import { AutocompleteTagInput, FlexColumn } from "nodetool";

const suggestions = [
  "image-generation",
  "text-to-speech",
  "rag",
  "agent",
  "gpu",
  "batch",
  "experimental"
];

export const Tags = () => {
  const [value, setValue] = React.useState<string[]>(["agent", "rag"]);
  return (
    <div style={{ width: 360 }}>
      <AutocompleteTagInput
        label="Workflow tags"
        value={value}
        onChange={setValue}
        suggestions={suggestions}
        placeholder="Add a tag…"
        description="Tags help organize workflows in the library"
      />
    </div>
  );
};

export const Empty = () => {
  const [value, setValue] = React.useState<string[]>([]);
  return (
    <div style={{ width: 360 }}>
      <AutocompleteTagInput
        label="Model labels"
        value={value}
        onChange={setValue}
        suggestions={suggestions}
        placeholder="Type to add labels…"
      />
    </div>
  );
};

export const Disabled = () => (
  <FlexColumn gap={2} style={{ width: 360 }}>
    <AutocompleteTagInput
      label="Locked tags"
      value={["gpu", "experimental"]}
      onChange={() => {}}
      suggestions={suggestions}
      disabled
    />
  </FlexColumn>
);
