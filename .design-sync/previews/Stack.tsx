import * as React from "react";
import { Stack, Surface, Text } from "nodetool";

const Row = ({ children }: { children: React.ReactNode }) => (
  <Surface bordered background="transparent" rounded="small" padding={1.5}>
    <Text size="small">{children}</Text>
  </Surface>
);

export const Spacing = () => (
  <Stack spacing={1} sx={{ width: 280 }}>
    <Row>Load Image</Row>
    <Row>Resize to 1024×1024</Row>
    <Row>Stable Diffusion XL</Row>
    <Row>Save Asset</Row>
  </Stack>
);

export const Tight = () => (
  <Stack spacing={0.5} sx={{ width: 280 }}>
    <Row>Step 1 — Fetch transcript</Row>
    <Row>Step 2 — Summarize</Row>
    <Row>Step 3 — Email digest</Row>
  </Stack>
);
