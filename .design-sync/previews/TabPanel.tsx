import * as React from "react";
import { TabPanel, Surface, Text, FlexColumn } from "nodetool";

export const ActivePanel = () => (
  <Surface bordered background="transparent" rounded="small" padding={2} sx={{ width: 360 }}>
    <TabPanel value="logs" activeValue="logs">
      <FlexColumn gap={0.5}>
        <Text size="small">[12:04:01] Worker connected</Text>
        <Text size="small">[12:04:02] Running node “Stable Diffusion XL”</Text>
        <Text size="small">[12:04:09] Saved asset output.png</Text>
      </FlexColumn>
    </TabPanel>
  </Surface>
);

export const Switching = () => {
  const active = "assets";
  return (
    <Surface bordered background="transparent" rounded="small" padding={2} sx={{ width: 360 }}>
      <TabPanel value="editor" activeValue={active}>
        <Text size="small">Editor content (hidden)</Text>
      </TabPanel>
      <TabPanel value="assets" activeValue={active}>
        <Text size="small">
          Assets panel — images, audio and files produced by runs.
        </Text>
      </TabPanel>
      <TabPanel value="logs" activeValue={active}>
        <Text size="small">Logs content (hidden)</Text>
      </TabPanel>
    </Surface>
  );
};
