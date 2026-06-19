import * as React from "react";
import { ConfirmButton, FlexRow } from "nodetool";

const noop = () => {};

export const Colors = () => (
  <FlexRow gap={2} align="center">
    <ConfirmButton onClick={noop} color="default" tooltip="Confirm" />
    <ConfirmButton onClick={noop} color="primary" tooltip="Apply changes" />
    <ConfirmButton onClick={noop} color="success" tooltip="Accept" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <ConfirmButton onClick={noop} size="small" color="success" tooltip="Small" />
    <ConfirmButton onClick={noop} size="medium" color="success" tooltip="Medium" />
    <ConfirmButton onClick={noop} size="large" color="success" tooltip="Large" />
  </FlexRow>
);

export const IconVariants = () => (
  <FlexRow gap={2} align="center">
    <ConfirmButton onClick={noop} iconVariant="check" color="success" tooltip="Check" />
    <ConfirmButton onClick={noop} iconVariant="done" color="success" tooltip="Done" />
    <ConfirmButton onClick={noop} iconVariant="doneAll" color="success" tooltip="Done all" />
    <ConfirmButton onClick={noop} iconVariant="circle" color="primary" tooltip="Circle" />
    <ConfirmButton onClick={noop} disabled tooltip="Disabled" />
  </FlexRow>
);
