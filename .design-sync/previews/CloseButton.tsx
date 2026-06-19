import * as React from "react";
import { CloseButton, FlexRow, Card, Text } from "nodetool";

const noop = () => {};

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <CloseButton onClick={noop} buttonSize="small" tooltip="Close (small)" />
    <CloseButton onClick={noop} buttonSize="medium" tooltip="Close (medium)" />
    <CloseButton onClick={noop} buttonSize="large" tooltip="Close (large)" />
  </FlexRow>
);

export const Variants = () => (
  <FlexRow gap={2} align="center">
    <CloseButton onClick={noop} iconVariant="close" tooltip="Close panel" />
    <CloseButton onClick={noop} iconVariant="clear" tooltip="Clear input" />
    <CloseButton onClick={noop} disabled tooltip="Disabled" />
  </FlexRow>
);

export const InPanelHeader = () => (
  <Card variant="outlined" padding="compact" style={{ width: 300 }}>
    <FlexRow justify="space-between" align="center">
      <Text size="small" weight={600}>
        Node Inspector
      </Text>
      <CloseButton onClick={noop} buttonSize="small" tooltip="Close inspector" />
    </FlexRow>
  </Card>
);
