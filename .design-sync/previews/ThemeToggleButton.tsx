import * as React from "react";
import { ThemeToggleButton, FlexRow, FlexColumn, Text } from "nodetool";

export const Variants = () => (
  <FlexColumn gap={2}>
    <FlexRow gap={2} align="center">
      <Text size="small" color="secondary" style={{ width: 60 }}>icon</Text>
      <ThemeToggleButton variant="icon" />
    </FlexRow>
    <FlexRow gap={2} align="center">
      <Text size="small" color="secondary" style={{ width: 60 }}>switch</Text>
      <ThemeToggleButton variant="switch" />
    </FlexRow>
    <FlexRow gap={2} align="center">
      <Text size="small" color="secondary" style={{ width: 60 }}>labeled</Text>
      <ThemeToggleButton variant="labeled" />
    </FlexRow>
  </FlexColumn>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <ThemeToggleButton variant="icon" buttonSize="small" />
    <ThemeToggleButton variant="icon" buttonSize="medium" />
    <ThemeToggleButton variant="icon" buttonSize="large" />
  </FlexRow>
);

export const CustomLabels = () => (
  <ThemeToggleButton
    variant="labeled"
    lightLabel="Light canvas"
    darkLabel="Dark canvas"
  />
);
