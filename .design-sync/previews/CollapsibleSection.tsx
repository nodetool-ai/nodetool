import * as React from "react";
import { CollapsibleSection, FlexColumn, Caption } from "nodetool";

export const Open = () => (
  <div style={{ width: 320 }}>
    <CollapsibleSection title="Model parameters" defaultOpen>
      <FlexColumn gap={0.5}>
        <Caption color="text.secondary">Temperature: 0.7</Caption>
        <Caption color="text.secondary">Max tokens: 4096</Caption>
        <Caption color="text.secondary">Top-p: 0.9</Caption>
      </FlexColumn>
    </CollapsibleSection>
  </div>
);

export const Closed = () => (
  <div style={{ width: 320 }}>
    <CollapsibleSection title="Advanced output settings">
      <Caption color="text.secondary">Hidden until expanded</Caption>
    </CollapsibleSection>
  </div>
);

export const Stacked = () => (
  <FlexColumn gap={1} style={{ width: 320 }}>
    <CollapsibleSection title="Inputs" defaultOpen compact>
      <Caption color="text.secondary">prompt, image, seed</Caption>
    </CollapsibleSection>
    <CollapsibleSection title="Outputs" compact>
      <Caption color="text.secondary">image, metadata</Caption>
    </CollapsibleSection>
  </FlexColumn>
);
