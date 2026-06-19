import * as React from "react";
import { MobileBottomSheet, Text, FlexColumn } from "nodetool";

export const RunOptions = () => (
  <MobileBottomSheet open onClose={() => {}} title="Run workflow" maxHeight="80vh">
    <FlexColumn gap={1.5} sx={{ p: 2 }}>
      <Text size="normal" weight={600}>
        Background Remover
      </Text>
      <Text size="small" color="secondary">
        3 input images · estimated 12s on GPU
      </Text>
      <Text size="small">Output format: PNG with alpha</Text>
      <Text size="small">Batch size: 3</Text>
    </FlexColumn>
  </MobileBottomSheet>
);
