import * as React from "react";
import { InfoTooltip, Text, FlexRow, FlexColumn } from "nodetool";

// InfoTooltip exposes no `open`/`defaultOpen` prop — it opens on hover
// (tooltip mode) or click (popover mode), so the open overlay can't be
// forced statically. We show the labeled trigger affordances instead.
export const FieldHelpTriggers = () => (
  <FlexColumn gap={2} sx={{ p: 1 }}>
    <FlexRow align="center" gap={1}>
      <Text size="small">CFG scale</Text>
      <InfoTooltip content="How strongly the model follows your prompt." />
    </FlexRow>
    <FlexRow align="center" gap={1}>
      <Text size="small">Seed</Text>
      <InfoTooltip
        iconVariant="helpOutlined"
        content="Fix the seed to reproduce identical outputs."
      />
    </FlexRow>
    <FlexRow align="center" gap={1}>
      <Text size="small">GPU device</Text>
      <InfoTooltip iconVariant="info" color="primary" content="Select the GPU for inference." />
    </FlexRow>
  </FlexColumn>
);
