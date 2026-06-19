import * as React from "react";
import { Caption, FlexColumn } from "nodetool";

export const Sizes = () => (
  <FlexColumn gap={1}>
    <Caption size="small">Small — last run 2 minutes ago</Caption>
    <Caption size="smaller">Smaller — 1,284 tokens · $0.03</Caption>
    <Caption size="tiny">Tiny — node id a1b2c3d4</Caption>
  </FlexColumn>
);

export const Colors = () => (
  <FlexColumn gap={1}>
    <Caption color="text.primary">Primary metadata</Caption>
    <Caption color="text.secondary">Secondary metadata</Caption>
    <Caption color="success.main">Completed in 4.2s</Caption>
    <Caption color="error.main">Failed: worker timeout</Caption>
  </FlexColumn>
);

export const Italic = () => (
  <Caption italic color="text.secondary">
    Last edited by matti.georgi@gmail.com
  </Caption>
);
