import * as React from "react";
import { UploadButton, FlexRow } from "nodetool";

const noop = () => {};

export const IconVariants = () => (
  <FlexRow gap={2} align="center">
    <UploadButton onFileSelect={noop} iconVariant="upload" tooltip="Upload" />
    <UploadButton onFileSelect={noop} iconVariant="file" tooltip="Choose file" />
    <UploadButton onFileSelect={noop} iconVariant="cloud" tooltip="Upload to cloud" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <UploadButton onFileSelect={noop} buttonSize="small" tooltip="Small" />
    <UploadButton onFileSelect={noop} buttonSize="medium" tooltip="Medium" />
    <UploadButton onFileSelect={noop} buttonSize="large" tooltip="Large" />
  </FlexRow>
);

export const WithLabel = () => (
  <FlexRow gap={2} align="center">
    <UploadButton onFileSelect={noop} label="Upload image" accept="image/*" />
    <UploadButton onFileSelect={noop} label="Add files" multiple iconVariant="file" />
  </FlexRow>
);

export const Disabled = () => (
  <FlexRow gap={2} align="center">
    <UploadButton onFileSelect={noop} disabled tooltip="Disabled" />
    <UploadButton onFileSelect={noop} disabled label="Upload image" />
  </FlexRow>
);
