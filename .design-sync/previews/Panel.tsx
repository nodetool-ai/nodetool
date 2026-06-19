import * as React from "react";
import { Panel, Text, NavButton, FlexColumn } from "nodetool";
import AddIcon from "@mui/icons-material/Add";

export const Basic = () => (
  <div style={{ width: 360 }}>
    <Panel title="Run settings" bordered>
      <Text size="small" color="secondary">
        Configure how this workflow executes on the worker.
      </Text>
    </Panel>
  </div>
);

export const WithSubtitleAndAction = () => (
  <div style={{ width: 360 }}>
    <Panel
      title="Models"
      subtitle="Installed local models"
      bordered
      headerAction={<NavButton icon={<AddIcon />} tooltip="Add model" navSize="small" />}
    >
      <FlexColumn gap={0.5}>
        <Text size="small">llama-3.1-8b-instruct</Text>
        <Text size="small">qwen2.5-coder-7b</Text>
      </FlexColumn>
    </Panel>
  </div>
);

export const WithFooter = () => (
  <div style={{ width: 360 }}>
    <Panel
      title="Unsaved changes"
      bordered
      background="paper"
      footer={
        <Text size="small" color="warning">
          3 nodes modified
        </Text>
      }
    >
      <Text size="small" color="secondary">
        Review your changes before running the workflow again.
      </Text>
    </Panel>
  </div>
);

export const Collapsed = () => {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <div style={{ width: 360 }}>
      <Panel
        title="Advanced options"
        bordered
        collapsible
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      >
        <Text size="small" color="secondary">
          Seed, sampler and scheduler overrides.
        </Text>
      </Panel>
    </div>
  );
};
