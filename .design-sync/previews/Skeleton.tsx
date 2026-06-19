import * as React from "react";
import { Skeleton, FlexColumn, FlexRow } from "nodetool";

export const Presets = () => (
  <FlexColumn gap={1.5} sx={{ width: 320 }}>
    <Skeleton preset="text" />
    <Skeleton preset="text" width="70%" />
    <FlexRow gap={2} align="center">
      <Skeleton preset="avatar" />
      <Skeleton preset="thumbnail" />
      <Skeleton preset="button" />
    </FlexRow>
    <Skeleton preset="card" />
  </FlexColumn>
);

export const AssetCard = () => (
  <FlexRow gap={2} align="flex-start">
    <Skeleton preset="thumbnail" />
    <FlexColumn gap={1} sx={{ flex: 1 }}>
      <Skeleton preset="text" width="60%" />
      <Skeleton preset="text" width="90%" />
      <Skeleton preset="text" width="40%" />
    </FlexColumn>
  </FlexRow>
);

export const Animations = () => (
  <FlexColumn gap={1.5} sx={{ width: 320 }}>
    <Skeleton preset="card" animation="pulse" />
    <Skeleton preset="card" animation="wave" />
  </FlexColumn>
);
