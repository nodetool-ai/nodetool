import * as React from "react";
import { TextLink, FlexColumn, FlexRow, Text } from "nodetool";

export const Default = () => (
  <Text size="normal">
    Read the{" "}
    <TextLink href="#" external>
      workflow documentation
    </TextLink>{" "}
    to get started.
  </Text>
);

export const Underlines = () => (
  <FlexColumn gap={1}>
    <TextLink href="#" underline="hover">
      Hover underline (default)
    </TextLink>
    <TextLink href="#" underline="always">
      Always underline
    </TextLink>
    <TextLink href="#" underline="none">
      No underline
    </TextLink>
  </FlexColumn>
);

export const Colors = () => (
  <FlexColumn gap={1}>
    <TextLink href="#" color="primary">Primary — open node reference</TextLink>
    <TextLink href="#" color="secondary">Secondary — view changelog</TextLink>
    <TextLink href="#" color="success">Success — download complete, open asset</TextLink>
    <TextLink href="#" color="error">Error — retry failed run</TextLink>
  </FlexColumn>
);

export const AsButton = () => (
  <FlexRow gap={2} align="center">
    <TextLink asButton onClick={() => {}}>
      Clear cache
    </TextLink>
    <TextLink asButton onClick={() => {}} color="error">
      Disconnect worker
    </TextLink>
  </FlexRow>
);
