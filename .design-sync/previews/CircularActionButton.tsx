import * as React from "react";
import { CircularActionButton, FlexRow } from "nodetool";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import AddIcon from "@mui/icons-material/Add";
import StopIcon from "@mui/icons-material/Stop";

const noop = () => {};

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <CircularActionButton icon={<AddIcon />} onClick={noop} tooltip="Small" size={28} />
    <CircularActionButton icon={<AddIcon />} onClick={noop} tooltip="Medium" size={40} />
    <CircularActionButton icon={<AddIcon />} onClick={noop} tooltip="Large" size={56} />
  </FlexRow>
);

export const Colors = () => (
  <FlexRow gap={2} align="center">
    <CircularActionButton
      icon={<PlayArrowIcon />}
      onClick={noop}
      tooltip="Run"
      size={40}
      backgroundColor="primary"
    />
    <CircularActionButton
      icon={<AddIcon />}
      onClick={noop}
      tooltip="Create"
      size={40}
      backgroundColor="success.main"
      color="common.white"
    />
    <CircularActionButton
      icon={<StopIcon />}
      onClick={noop}
      tooltip="Stop"
      size={40}
      backgroundColor="error.main"
      color="common.white"
    />
  </FlexRow>
);

export const States = () => (
  <FlexRow gap={2} align="center">
    <CircularActionButton
      icon={<PlayArrowIcon />}
      onClick={noop}
      tooltip="Running"
      size={40}
      isLoading
      backgroundColor="primary"
    />
    <CircularActionButton
      icon={<PlayArrowIcon />}
      onClick={noop}
      tooltip="Disabled"
      size={40}
      disabled
    />
  </FlexRow>
);
