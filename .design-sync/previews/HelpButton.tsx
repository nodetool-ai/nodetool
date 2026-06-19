import * as React from "react";
import { HelpButton, FlexRow } from "nodetool";

const noop = () => {};

export const Variants = () => (
  <FlexRow gap={2} align="center">
    <HelpButton onClick={noop} iconVariant="help" tooltip="Help" />
    <HelpButton onClick={noop} iconVariant="helpOutline" tooltip="Documentation" />
    <HelpButton onClick={noop} iconVariant="question" tooltip="What is this?" />
    <HelpButton onClick={noop} iconVariant="liveHelp" tooltip="Ask the assistant" />
  </FlexRow>
);

export const States = () => (
  <FlexRow gap={2} align="center">
    <HelpButton onClick={noop} tooltip="Default" />
    <HelpButton onClick={noop} active tooltip="Help mode on" />
    <HelpButton onClick={noop} disabled tooltip="Unavailable" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <HelpButton onClick={noop} size="small" />
    <HelpButton onClick={noop} size="medium" />
    <HelpButton onClick={noop} size="large" />
  </FlexRow>
);
