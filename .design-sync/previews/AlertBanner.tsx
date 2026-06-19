import * as React from "react";
import { AlertBanner, FlexColumn } from "nodetool";

export const Severities = () => (
  <FlexColumn gap={1.5}>
    <AlertBanner severity="info">Workflow saved as a draft.</AlertBanner>
    <AlertBanner severity="success">Model downloaded successfully.</AlertBanner>
    <AlertBanner severity="warning">GPU memory is running low.</AlertBanner>
    <AlertBanner severity="error">Failed to connect to the Python worker.</AlertBanner>
  </FlexColumn>
);

export const WithTitle = () => (
  <AlertBanner severity="error" title="Execution failed">
    Node “Generate Image” raised an exception. Open the logs for the full
    stack trace.
  </AlertBanner>
);

export const Variants = () => (
  <FlexColumn gap={1.5}>
    <AlertBanner severity="info" variant="standard">
      Standard variant
    </AlertBanner>
    <AlertBanner severity="info" variant="outlined">
      Outlined variant
    </AlertBanner>
    <AlertBanner severity="info" variant="filled">
      Filled variant
    </AlertBanner>
  </FlexColumn>
);
