import * as React from "react";
import { ButtonGroup, FlexColumn } from "nodetool";
import Button from "@mui/material/Button";

export const Variants = () => (
  <FlexColumn gap={2}>
    <ButtonGroup variant="contained">
      <Button>Run</Button>
      <Button>Stop</Button>
      <Button>Reset</Button>
    </ButtonGroup>
    <ButtonGroup variant="outlined">
      <Button>Run</Button>
      <Button>Stop</Button>
      <Button>Reset</Button>
    </ButtonGroup>
    <ButtonGroup variant="text">
      <Button>Run</Button>
      <Button>Stop</Button>
      <Button>Reset</Button>
    </ButtonGroup>
  </FlexColumn>
);

export const Sizes = () => (
  <FlexColumn gap={2}>
    <ButtonGroup variant="outlined" size="small">
      <Button>Day</Button>
      <Button>Week</Button>
      <Button>Month</Button>
    </ButtonGroup>
    <ButtonGroup variant="outlined" size="medium">
      <Button>Day</Button>
      <Button>Week</Button>
      <Button>Month</Button>
    </ButtonGroup>
    <ButtonGroup variant="outlined" size="large">
      <Button>Day</Button>
      <Button>Week</Button>
      <Button>Month</Button>
    </ButtonGroup>
  </FlexColumn>
);

export const Vertical = () => (
  <ButtonGroup variant="outlined" orientation="vertical">
    <Button>Export JSON</Button>
    <Button>Export DSL</Button>
    <Button>Export Bundle</Button>
  </ButtonGroup>
);

export const Colors = () => (
  <FlexColumn gap={2}>
    <ButtonGroup variant="contained" color="primary">
      <Button>Save</Button>
      <Button>Publish</Button>
    </ButtonGroup>
    <ButtonGroup variant="contained" color="error">
      <Button>Delete</Button>
      <Button>Purge</Button>
    </ButtonGroup>
  </FlexColumn>
);
