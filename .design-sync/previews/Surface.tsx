import * as React from "react";
import { Surface, Text, FlexColumn, FlexRow } from "nodetool";

export const Backgrounds = () => (
  <FlexColumn gap={2} sx={{ width: 320 }}>
    <Surface background="paper" padding={2} rounded="medium">
      <Text size="small">background="paper" (default surface)</Text>
    </Surface>
    <Surface background="default" padding={2} rounded="medium">
      <Text size="small">background="default" (app canvas)</Text>
    </Surface>
    <Surface bordered background="transparent" padding={2} rounded="medium">
      <Text size="small">background="transparent" + bordered</Text>
    </Surface>
  </FlexColumn>
);

export const Elevation = () => (
  <FlexRow gap={2} align="flex-start" wrap sx={{ width: 360 }}>
    {([0, 1, 2, 4] as const).map((e) => (
      <Surface key={e} elevation={e} padding={2} rounded="medium" sx={{ width: 150 }}>
        <Text size="small">elevation={e}</Text>
      </Surface>
    ))}
  </FlexRow>
);

export const Rounding = () => (
  <FlexRow gap={2} align="flex-start" wrap>
    {(["none", "small", "medium", "large"] as const).map((r) => (
      <Surface key={r} bordered padding={2} rounded={r} sx={{ width: 120 }}>
        <Text size="small">{r}</Text>
      </Surface>
    ))}
  </FlexRow>
);

export const AsContainer = () => (
  <Surface elevation={1} padding={3} rounded="medium" sx={{ width: 320 }}>
    <FlexColumn gap={1}>
      <Text size="big">Run summary</Text>
      <Text size="small" color="secondary">
        Stable Diffusion XL — completed in 8.2s
      </Text>
      <Text size="small" color="secondary">
        3 nodes executed · 1 asset saved
      </Text>
    </FlexColumn>
  </Surface>
);
