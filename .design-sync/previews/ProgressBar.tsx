import * as React from "react";
import { ProgressBar, FlexColumn } from "nodetool";

export const WithLabel = () => (
  <div style={{ width: 320 }}>
    <ProgressBar value={64} label="Downloading sd-xl-base-1.0" />
  </div>
);

export const Values = () => (
  <FlexColumn gap={2.5} style={{ width: 320 }}>
    <ProgressBar value={15} label="Loading model" />
    <ProgressBar value={50} label="Generating" />
    <ProgressBar value={92} label="Encoding video" />
  </FlexColumn>
);

export const Colors = () => (
  <FlexColumn gap={2.5} style={{ width: 320 }}>
    <ProgressBar value={70} label="Primary" color="primary" />
    <ProgressBar value={70} label="Success" color="success" />
    <ProgressBar value={70} label="Warning" color="warning" />
    <ProgressBar value={70} label="Error" color="error" />
  </FlexColumn>
);

export const Indeterminate = () => (
  <div style={{ width: 320 }}>
    <ProgressBar
      value={0}
      label="Connecting to worker…"
      progressVariant="indeterminate"
      showValue={false}
    />
  </div>
);
