import * as React from "react";
import { Divider, FlexColumn, FlexRow, Text } from "nodetool";

export const Spacing = () => (
  <FlexColumn sx={{ width: 300 }}>
    <Text size="small">Inputs</Text>
    <Divider spacing="normal" />
    <Text size="small">Parameters</Text>
    <Divider spacing="comfortable" />
    <Text size="small">Outputs</Text>
  </FlexColumn>
);

export const Colors = () => (
  <FlexColumn gap={2} sx={{ width: 300 }}>
    <Divider color="subtle" />
    <Divider color="default" />
    <Divider color="strong" />
  </FlexColumn>
);

export const Vertical = () => (
  <FlexRow gap={2} align="center" sx={{ height: 40 }}>
    <Text size="small">Editor</Text>
    <Divider orientation="vertical" flexItem />
    <Text size="small">Assets</Text>
    <Divider orientation="vertical" flexItem />
    <Text size="small">Logs</Text>
  </FlexRow>
);
