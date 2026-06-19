import * as React from "react";
import { Dialog, Text, FlexColumn } from "nodetool";

export const DeleteWorkflow = () => (
  <Dialog
    open
    title="Delete workflow?"
    onClose={() => {}}
    onConfirm={() => {}}
    confirmText="Delete"
    cancelText="Cancel"
    destructive
  >
    <FlexColumn gap={1}>
      <Text size="normal">
        “Image Upscaler” and its 14 nodes will be permanently removed.
      </Text>
      <Text size="small" color="secondary">
        This action cannot be undone. Generated assets are kept.
      </Text>
    </FlexColumn>
  </Dialog>
);
