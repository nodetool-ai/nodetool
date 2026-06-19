import * as React from "react";
import { RefreshButton, FlexRow } from "nodetool";

export const Variants = () => (
  <FlexRow gap={3} align="center">
    <RefreshButton tooltip="Refresh models" iconVariant="refresh" />
    <RefreshButton tooltip="Reset parameters" iconVariant="reset" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={3} align="center">
    <RefreshButton buttonSize="small" />
    <RefreshButton buttonSize="medium" />
    <RefreshButton buttonSize="large" />
  </FlexRow>
);

export const States = () => (
  <FlexRow gap={3} align="center">
    <RefreshButton tooltip="Refresh" />
    <RefreshButton tooltip="Refreshing" isLoading />
    <RefreshButton tooltip="Disabled" disabled />
  </FlexRow>
);
