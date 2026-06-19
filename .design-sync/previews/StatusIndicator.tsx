import * as React from "react";
import { StatusIndicator, FlexColumn } from "nodetool";

export const Statuses = () => (
  <FlexColumn gap={1}>
    <StatusIndicator status="success" label="Run completed" />
    <StatusIndicator status="error" label="Execution failed" />
    <StatusIndicator status="warning" label="GPU memory low" />
    <StatusIndicator status="info" label="Queued" />
    <StatusIndicator status="pending" label="Initializing worker" pulse />
    <StatusIndicator status="default" label="Idle" />
  </FlexColumn>
);

export const FilledIcons = () => (
  <FlexColumn gap={1}>
    <StatusIndicator status="success" label="Saved" filledIcon />
    <StatusIndicator status="error" label="Disconnected" filledIcon />
    <StatusIndicator status="warning" label="Deprecated node" filledIcon />
    <StatusIndicator status="pending" label="Downloading model" filledIcon pulse />
  </FlexColumn>
);

export const DotsOnly = () => (
  <FlexColumn gap={1}>
    <StatusIndicator status="success" showIcon />
    <StatusIndicator status="error" showIcon />
    <StatusIndicator status="pending" showIcon pulse />
  </FlexColumn>
);
