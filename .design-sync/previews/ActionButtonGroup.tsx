import * as React from "react";
import { ActionButtonGroup, CircularActionButton } from "nodetool";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import SaveIcon from "@mui/icons-material/Save";

const noop = () => {};

export const Row = () => (
  <ActionButtonGroup aria-label="Workflow actions">
    <CircularActionButton icon={<PlayArrowIcon />} onClick={noop} tooltip="Run" size={32} />
    <CircularActionButton icon={<StopIcon />} onClick={noop} tooltip="Stop" size={32} />
    <CircularActionButton icon={<SaveIcon />} onClick={noop} tooltip="Save" size={32} />
  </ActionButtonGroup>
);

export const WithDividers = () => (
  <ActionButtonGroup divider spacing={2} aria-label="Editor actions">
    <CircularActionButton icon={<PlayArrowIcon />} onClick={noop} tooltip="Run" size={32} />
    <CircularActionButton icon={<StopIcon />} onClick={noop} tooltip="Stop" size={32} />
    <CircularActionButton icon={<SaveIcon />} onClick={noop} tooltip="Save" size={32} />
  </ActionButtonGroup>
);

export const Column = () => (
  <ActionButtonGroup direction="column" spacing={1} aria-label="Node toolbar">
    <CircularActionButton icon={<PlayArrowIcon />} onClick={noop} tooltip="Run node" size={32} />
    <CircularActionButton icon={<StopIcon />} onClick={noop} tooltip="Cancel" size={32} />
    <CircularActionButton icon={<SaveIcon />} onClick={noop} tooltip="Save node" size={32} />
  </ActionButtonGroup>
);
