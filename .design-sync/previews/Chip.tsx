import * as React from "react";
import { Chip, FlexRow } from "nodetool";
import DoneIcon from "@mui/icons-material/Done";

export const Colors = () => (
  <FlexRow gap={1} style={{ flexWrap: "wrap" }}>
    <Chip label="default" color="default" />
    <Chip label="primary" color="primary" />
    <Chip label="success" color="success" />
    <Chip label="warning" color="warning" />
    <Chip label="error" color="error" />
    <Chip label="info" color="info" />
  </FlexRow>
);

export const Variants = () => (
  <FlexRow gap={1}>
    <Chip label="filled" variant="filled" color="primary" />
    <Chip label="outlined" variant="outlined" color="primary" />
    <Chip label="active" color="primary" active />
  </FlexRow>
);

export const States = () => (
  <FlexRow gap={1}>
    <Chip label="with icon" color="success" icon={<DoneIcon />} />
    <Chip label="deletable" color="default" onDelete={() => {}} />
    <Chip label="disabled" disabled />
    <Chip label="compact" compact color="info" />
  </FlexRow>
);

export const ModelTags = () => (
  <FlexRow gap={1} style={{ flexWrap: "wrap" }}>
    <Chip label="claude-sonnet-4-6" color="primary" size="small" />
    <Chip label="gpt-5.4-mini" color="info" size="small" />
    <Chip label="gemini-2.5-pro" color="success" size="small" />
  </FlexRow>
);
