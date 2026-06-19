import * as React from "react";
import { DrawerPanel, Text, FlexColumn, Divider } from "nodetool";

export const NodeInspector = () => (
  <DrawerPanel open anchor="right" title="Node settings" width={300} onClose={() => {}}>
    <FlexColumn gap={1} padding={2}>
      <Text size="small" color="secondary">Stable Diffusion XL</Text>
      <Divider />
      <Text size="normal" weight={600}>Steps: 30</Text>
      <Text size="normal" weight={600}>CFG scale: 7.5</Text>
      <Text size="normal" weight={600}>Sampler: DPM++ 2M</Text>
      <Divider />
      <Text size="small" color="secondary">Runs on GPU 0 · 8.2 GB VRAM</Text>
    </FlexColumn>
  </DrawerPanel>
);
