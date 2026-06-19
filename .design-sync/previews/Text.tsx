import * as React from "react";
import { Text, FlexColumn } from "nodetool";

export const Sizes = () => (
  <FlexColumn gap={1}>
    <Text size="giant">Giant — workflow title</Text>
    <Text size="big">Big — section heading</Text>
    <Text size="normal">Normal — body copy used across the editor</Text>
    <Text size="small">Small — field labels and helper text</Text>
    <Text size="smaller">Smaller — captions and metadata</Text>
  </FlexColumn>
);

export const Colors = () => (
  <FlexColumn gap={1}>
    <Text color="primary">Primary — default foreground</Text>
    <Text color="secondary">Secondary — muted foreground</Text>
    <Text color="success">Success — run completed</Text>
    <Text color="warning">Warning — GPU memory low</Text>
    <Text color="error">Error — node execution failed</Text>
  </FlexColumn>
);

export const Weights = () => (
  <FlexColumn gap={1}>
    <Text weight={400}>Regular weight (400)</Text>
    <Text weight={500}>Medium weight (500)</Text>
    <Text weight={600}>Semibold weight (600)</Text>
  </FlexColumn>
);

export const Truncated = () => (
  <div style={{ width: 240 }}>
    <Text truncate>
      This long single line of text is truncated with an ellipsis once it
      overflows the fixed-width container around it.
    </Text>
  </div>
);
