import * as React from "react";
import { SectionHeader, Button, FlexColumn } from "nodetool";

export const Sizes = () => (
  <FlexColumn gap={1} sx={{ width: 360 }}>
    <SectionHeader title="Workflows" size="large" />
    <SectionHeader title="Recent runs" size="medium" />
    <SectionHeader title="Filters" size="small" uppercase />
  </FlexColumn>
);

export const WithSubtitle = () => (
  <div style={{ width: 360 }}>
    <SectionHeader
      title="Models"
      subtitle="Locally downloaded checkpoints and LoRAs"
    />
  </div>
);

export const WithAction = () => (
  <div style={{ width: 360 }}>
    <SectionHeader
      title="Assets"
      action={<Button size="small" variant="outlined">Upload</Button>}
    />
  </div>
);
