import * as React from "react";
import { CreateFab, FlexRow } from "nodetool";

export const Extended = () => (
  <FlexRow gap={2} align="center">
    <CreateFab label="New Workflow" />
    <CreateFab label="New Chat" fabColor="secondary" />
  </FlexRow>
);

export const Circular = () => (
  <FlexRow gap={2} align="center">
    <CreateFab tooltip="Add node" />
    <CreateFab tooltip="Add folder" fabColor="secondary" />
    <CreateFab tooltip="Add collection" fabColor="default" />
  </FlexRow>
);

export const Colors = () => (
  <FlexRow gap={2} align="center">
    <CreateFab label="Primary" fabColor="primary" />
    <CreateFab label="Secondary" fabColor="secondary" />
    <CreateFab label="Default" fabColor="default" />
  </FlexRow>
);
