import * as React from "react";
import { RunWorkflowButton, FlexRow, FlexColumn } from "nodetool";

const noop = () => {};

export const RunAndStop = () => (
  <FlexRow gap={2} align="center">
    <RunWorkflowButton isRunning={false} onRun={noop} onStop={noop} showLabel />
    <RunWorkflowButton isRunning onRun={noop} onStop={noop} showLabel />
    <RunWorkflowButton isRunning={false} onRun={noop} onStop={noop} isLoading showLabel />
  </FlexRow>
);

export const IconOnly = () => (
  <FlexRow gap={2} align="center">
    <RunWorkflowButton isRunning={false} onRun={noop} onStop={noop} />
    <RunWorkflowButton isRunning onRun={noop} onStop={noop} />
    <RunWorkflowButton isRunning={false} onRun={noop} onStop={noop} disabled />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <RunWorkflowButton size="small" isRunning={false} onRun={noop} onStop={noop} showLabel />
    <RunWorkflowButton size="medium" isRunning={false} onRun={noop} onStop={noop} showLabel />
    <RunWorkflowButton size="large" isRunning={false} onRun={noop} onStop={noop} showLabel />
  </FlexRow>
);

export const Fab = () => (
  <FlexRow gap={2} align="center">
    <RunWorkflowButton variant="fab" isRunning={false} onRun={noop} onStop={noop} />
    <RunWorkflowButton variant="fab" isRunning onRun={noop} onStop={noop} />
  </FlexRow>
);
