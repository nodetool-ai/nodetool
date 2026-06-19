import * as React from "react";
import { Card, FlexColumn, FlexRow, Text, Caption, Chip } from "nodetool";

export const Variants = () => (
  <FlexColumn gap={2} style={{ width: 320 }}>
    <Card variant="default">
      <Text size="small">Default card</Text>
    </Card>
    <Card variant="outlined">
      <Text size="small">Outlined card</Text>
    </Card>
    <Card variant="elevated" elevation={8}>
      <Text size="small">Elevated card</Text>
    </Card>
  </FlexColumn>
);

export const Padding = () => (
  <FlexColumn gap={2} style={{ width: 320 }}>
    <Card variant="outlined" padding="compact">
      <Text size="small">Compact padding</Text>
    </Card>
    <Card variant="outlined" padding="normal">
      <Text size="small">Normal padding</Text>
    </Card>
    <Card variant="outlined" padding="spacious">
      <Text size="small">Spacious padding</Text>
    </Card>
  </FlexColumn>
);

export const WorkflowCard = () => (
  <Card variant="elevated" elevation={4} padding="comfortable" style={{ width: 320 }}>
    <FlexColumn gap={1.5}>
      <FlexRow justify="space-between" align="center">
        <Text size="big" weight={600}>
          Upscale + Caption
        </Text>
        <Chip color="success" label="Ready" size="small" />
      </FlexRow>
      <Caption color="text.secondary">
        Upscales an image 4x and generates an alt-text caption.
      </Caption>
      <FlexRow gap={1}>
        <Chip label="image" size="small" />
        <Chip label="gpu" size="small" />
        <Chip label="agent" size="small" />
      </FlexRow>
    </FlexColumn>
  </Card>
);

export const Clickable = () => (
  <Card clickable hoverable variant="outlined" style={{ width: 320 }}>
    <Text size="small" weight={500}>
      New blank workflow
    </Text>
    <Caption color="text.secondary">Start from an empty canvas</Caption>
  </Card>
);
