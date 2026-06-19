import * as React from "react";
import { SearchInput, FlexColumn } from "nodetool";

export const Empty = () => {
  const [value, setValue] = React.useState("");
  return (
    <div style={{ width: 300 }}>
      <SearchInput value={value} onChange={setValue} placeholder="Search nodes…" />
    </div>
  );
};

export const WithValue = () => {
  const [value, setValue] = React.useState("Stable Diffusion");
  return (
    <div style={{ width: 300 }}>
      <SearchInput value={value} onChange={setValue} placeholder="Search models…" />
    </div>
  );
};

export const States = () => {
  const [a, setA] = React.useState("whisper");
  const [b, setB] = React.useState("");
  return (
    <FlexColumn gap={2} sx={{ width: 300 }}>
      <SearchInput value={a} onChange={setA} placeholder="Search assets…" />
      <SearchInput value={b} onChange={setB} placeholder="Disabled search" disabled />
    </FlexColumn>
  );
};
