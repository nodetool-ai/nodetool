import * as React from "react";
import { Collapse, Card, FlexColumn, Text, Caption } from "nodetool";

export const Expanded = () => (
  <Card variant="outlined" padding="compact" style={{ width: 300 }}>
    <FlexColumn gap={0.5}>
      <Text size="small" weight={600}>
        Advanced settings
      </Text>
      <Collapse in>
        <FlexColumn gap={0.5} style={{ paddingTop: 8 }}>
          <Caption color="text.secondary">Seed: 42</Caption>
          <Caption color="text.secondary">Steps: 30</Caption>
          <Caption color="text.secondary">Guidance: 7.5</Caption>
        </FlexColumn>
      </Collapse>
    </FlexColumn>
  </Card>
);

export const Collapsed = () => (
  <Card variant="outlined" padding="compact" style={{ width: 300 }}>
    <FlexColumn gap={0.5}>
      <Text size="small" weight={600}>
        Advanced settings
      </Text>
      <Collapse in={false} collapsedSize={0}>
        <Caption color="text.secondary">Hidden until expanded</Caption>
      </Collapse>
      <Caption color="text.secondary">Collapsed — content is hidden</Caption>
    </FlexColumn>
  </Card>
);

export const Toggle = () => {
  const [open, setOpen] = React.useState(true);
  return (
    <Card variant="outlined" padding="compact" style={{ width: 300 }}>
      <FlexColumn gap={0.5}>
        <Text
          size="small"
          weight={600}
          onClick={() => setOpen((o) => !o)}
          style={{ cursor: "pointer" }}
        >
          Execution log {open ? "▾" : "▸"}
        </Text>
        <Collapse in={open}>
          <FlexColumn gap={0.25} style={{ paddingTop: 8 }}>
            <Caption color="text.secondary">[12:01] Worker connected</Caption>
            <Caption color="success.main">[12:02] Run completed in 3.1s</Caption>
          </FlexColumn>
        </Collapse>
      </FlexColumn>
    </Card>
  );
};
