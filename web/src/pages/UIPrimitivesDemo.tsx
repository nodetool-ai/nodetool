/**
 * UI Primitives Demo
 * 
 * This file demonstrates the usage of new UI primitives for streamlining styling.
 */

import React from "react";
import {
  FlexColumn,
  FlexRow,
  Card,
  Panel,
  Text,
  Caption
} from "../components/ui_primitives";
import { Button, Divider } from "@mui/material";

export const UIPrimitivesDemo: React.FC = () => {
  return (
    <FlexColumn gap={4} padding={4}>
      <FlexColumn gap={0.5}>
        <Text size="giant" weight={600}>UI Primitives Demo</Text>
        <Caption color="secondary">
          New primitives for streamlined styling
        </Caption>
      </FlexColumn>

      <Divider />

      <Panel
        title="Layout Primitives"
        subtitle="FlexColumn, FlexRow, and Card examples"
        bordered
      >
        <FlexColumn gap={2}>
          <Card variant="outlined" padding="normal">
            <FlexColumn gap={1}>
              <Text weight={600}>FlexColumn Example</Text>
              <Caption>Vertical layout with gap spacing</Caption>
            </FlexColumn>
          </Card>

          <Card variant="elevated" elevation={4} padding="normal">
            <FlexColumn gap={1}>
              <Text weight={600}>Elevated Card</Text>
              <Caption>Card with shadow elevation</Caption>
            </FlexColumn>
          </Card>
        </FlexColumn>
      </Panel>

      <Panel
        title="Typography Primitives"
        subtitle="Text and Caption components"
        bordered
        footer={
          <FlexRow gap={1} justify="flex-end">
            <Button variant="outlined">Cancel</Button>
            <Button variant="contained">Save</Button>
          </FlexRow>
        }
      >
        <FlexColumn gap={2}>
          <FlexColumn gap={0.5}>
            <Text size="big" weight={600}>Text Size Variants</Text>
            <Text size="normal">Normal text</Text>
            <Text size="small" color="secondary">Small secondary text</Text>
            <Caption size="tiny" color="muted">Tiny muted caption</Caption>
          </FlexColumn>
        </FlexColumn>
      </Panel>
    </FlexColumn>
  );
};

export default UIPrimitivesDemo;
