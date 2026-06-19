import * as React from "react";
import { SkipLinks, Text, FlexColumn } from "nodetool";

// SkipLinks is visually hidden until focused (top: -100px). For the preview we
// render it inside a relatively-positioned box and reveal the link so the
// styled badge is visible.
export const Default = () => (
  <FlexColumn
    gap={1}
    sx={{
      position: "relative",
      width: 360,
      minHeight: 120,
      paddingTop: 5,
      ".skip-link": { top: "0 !important" }
    }}
  >
    <SkipLinks />
    <Text size="small" color="secondary">
      The skip link appears at the top-left on keyboard focus.
    </Text>
  </FlexColumn>
);
