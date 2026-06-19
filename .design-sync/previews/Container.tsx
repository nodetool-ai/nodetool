import * as React from "react";
import { Container, FlexColumn, Text, Caption } from "nodetool";

export const Padding = () => (
  <Container
    padding="comfortable"
    maxWidth={360}
    sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
  >
    <FlexColumn gap={0.5}>
      <Text size="big" weight={600}>
        Run summary
      </Text>
      <Caption color="text.secondary">
        A bounded content container with comfortable padding.
      </Caption>
    </FlexColumn>
  </Container>
);

export const Centered = () => (
  <Container
    centered
    maxWidth={320}
    padding="spacious"
    sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
  >
    <Text size="small">Horizontally centered content</Text>
  </Container>
);

export const Scrollable = () => (
  <Container
    scrollable
    maxWidth={320}
    padding="normal"
    sx={{ height: 140, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
  >
    <FlexColumn gap={0.75}>
      {Array.from({ length: 12 }).map((_, i) => (
        <Caption key={i} color="text.secondary">
          [12:0{i}] node.process completed
        </Caption>
      ))}
    </FlexColumn>
  </Container>
);
