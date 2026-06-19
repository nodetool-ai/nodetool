import * as React from "react";
import { WarningBanner, FlexColumn } from "nodetool";

export const Variants = () => (
  <FlexColumn gap={1.5} style={{ width: 460 }}>
    <WarningBanner variant="info" message="A new model version is available." />
    <WarningBanner variant="warning" message="GPU memory is running low." />
    <WarningBanner variant="error" message="The Python worker disconnected." />
  </FlexColumn>
);

export const WithDescription = () => (
  <div style={{ width: 460 }}>
    <WarningBanner
      variant="warning"
      message="Unsaved changes"
      description="Your workflow has edits that have not been saved. Leaving now will discard them."
    />
  </div>
);

export const WithAction = () => (
  <div style={{ width: 460 }}>
    <WarningBanner
      variant="error"
      message="Run failed"
      description="Node 'Generate Image' raised an exception."
      action="View logs"
      onAction={() => {}}
      dismissible
      onDismiss={() => {}}
    />
  </div>
);

export const Compact = () => (
  <div style={{ width: 460 }}>
    <WarningBanner
      variant="info"
      compact
      message="Connected to ws://localhost:7777/ws"
    />
  </div>
);
