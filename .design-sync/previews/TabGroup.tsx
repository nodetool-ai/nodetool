import * as React from "react";
import { TabGroup, TabPanel, Text } from "nodetool";

const tabs = [
  { value: "editor", label: "Editor" },
  { value: "assets", label: "Assets" },
  { value: "logs", label: "Logs" }
];

export const Default = () => {
  const [value, setValue] = React.useState("editor");
  return (
    <div style={{ width: 380 }}>
      <TabGroup tabs={tabs} value={value} onChange={setValue} />
      <TabPanel value="editor" activeValue={value}>
        <Text size="small">Build and connect nodes on the canvas.</Text>
      </TabPanel>
      <TabPanel value="assets" activeValue={value}>
        <Text size="small">Images, audio and files produced by runs.</Text>
      </TabPanel>
      <TabPanel value="logs" activeValue={value}>
        <Text size="small">Execution output streamed from the worker.</Text>
      </TabPanel>
    </div>
  );
};

export const FullWidth = () => {
  const [value, setValue] = React.useState("assets");
  return (
    <div style={{ width: 380 }}>
      <TabGroup tabs={tabs} value={value} onChange={setValue} fullWidth />
    </div>
  );
};

export const Small = () => {
  const [value, setValue] = React.useState("editor");
  return (
    <div style={{ width: 380 }}>
      <TabGroup tabs={tabs} value={value} onChange={setValue} size="small" />
    </div>
  );
};
