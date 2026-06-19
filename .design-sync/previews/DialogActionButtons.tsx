import * as React from "react";
import { DialogActionButtons, FlexColumn, Text } from "nodetool";

const noop = () => {};

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: 360, background: "#0f1112", borderRadius: 8, padding: 4 }}>
    {children}
  </div>
);

export const Default = () => (
  <Frame>
    <FlexColumn gap={0.5} sx={{ px: 2, pt: 1.5 }}>
      <Text weight={500}>Save workflow?</Text>
      <Text size="small" color="secondary">
        Your changes will be written to the local library.
      </Text>
    </FlexColumn>
    <DialogActionButtons onConfirm={noop} onCancel={noop} confirmText="Save" />
  </Frame>
);

export const Destructive = () => (
  <Frame>
    <FlexColumn gap={0.5} sx={{ px: 2, pt: 1.5 }}>
      <Text weight={500}>Delete this workflow?</Text>
      <Text size="small" color="secondary">
        This action cannot be undone.
      </Text>
    </FlexColumn>
    <DialogActionButtons
      onConfirm={noop}
      onCancel={noop}
      confirmText="Delete"
      destructive
    />
  </Frame>
);

export const Loading = () => (
  <Frame>
    <FlexColumn gap={0.5} sx={{ px: 2, pt: 1.5 }}>
      <Text weight={500}>Downloading model…</Text>
    </FlexColumn>
    <DialogActionButtons onConfirm={noop} onCancel={noop} confirmText="Download" isLoading />
  </Frame>
);
