import * as React from "react";
import { LoadingSpinner, FlexRow, FlexColumn } from "nodetool";

export const Variants = () => (
  <FlexRow gap={6} align="center">
    <LoadingSpinner variant="circular" />
    <LoadingSpinner variant="dots" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={6} align="center">
    <LoadingSpinner size="small" />
    <LoadingSpinner size="medium" />
    <LoadingSpinner size="large" />
  </FlexRow>
);

export const WithText = () => (
  <FlexColumn gap={4} align="center">
    <LoadingSpinner text="Loading models…" />
    <LoadingSpinner variant="dots" text="Generating image…" />
  </FlexColumn>
);

export const Colors = () => (
  <FlexRow gap={6} align="center">
    <LoadingSpinner color="primary" />
    <LoadingSpinner color="secondary" />
  </FlexRow>
);
