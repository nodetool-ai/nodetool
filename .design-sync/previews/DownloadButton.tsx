import * as React from "react";
import { DownloadButton, FlexRow } from "nodetool";

const noop = () => {};

export const IconSizes = () => (
  <FlexRow gap={2} align="center">
    <DownloadButton onClick={noop} buttonSize="small" />
    <DownloadButton onClick={noop} buttonSize="medium" />
    <DownloadButton onClick={noop} buttonSize="large" />
  </FlexRow>
);

export const States = () => (
  <FlexRow gap={2} align="center">
    <DownloadButton onClick={noop} tooltip="Download image" />
    <DownloadButton onClick={noop} iconVariant="file" tooltip="Save file" />
    <DownloadButton onClick={noop} isLoading />
    <DownloadButton onClick={noop} disabled />
  </FlexRow>
);

export const WithLabel = () => (
  <FlexRow gap={2} align="center">
    <DownloadButton onClick={noop} label="Download output" />
    <DownloadButton onClick={noop} label="Saving…" isLoading />
  </FlexRow>
);
