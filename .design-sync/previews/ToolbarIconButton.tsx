import * as React from "react";
import { ToolbarIconButton, FlexRow } from "nodetool";
import SaveIcon from "@mui/icons-material/Save";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SettingsIcon from "@mui/icons-material/Settings";

const noop = () => {};

export const Toolbar = () => (
  <FlexRow gap={0.5} align="center">
    <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" onClick={noop} />
    <ToolbarIconButton icon={<ContentCopyIcon />} tooltip="Duplicate" onClick={noop} />
    <ToolbarIconButton icon={<SettingsIcon />} tooltip="Settings" onClick={noop} />
    <ToolbarIconButton icon={<DeleteIcon />} tooltip="Delete" onClick={noop} />
  </FlexRow>
);

export const Variants = () => (
  <FlexRow gap={1} align="center">
    <ToolbarIconButton icon={<SaveIcon />} tooltip="Default" onClick={noop} />
    <ToolbarIconButton icon={<PlayArrowIcon />} tooltip="Run" variant="primary" onClick={noop} />
    <ToolbarIconButton icon={<DeleteIcon />} tooltip="Delete" variant="error" onClick={noop} />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={1} align="center">
    <ToolbarIconButton icon={<SettingsIcon />} tooltip="Small" size="small" onClick={noop} />
    <ToolbarIconButton icon={<SettingsIcon />} tooltip="Medium" size="medium" onClick={noop} />
    <ToolbarIconButton icon={<SettingsIcon />} tooltip="Large" size="large" onClick={noop} />
  </FlexRow>
);

export const States = () => (
  <FlexRow gap={1} align="center">
    <ToolbarIconButton icon={<SaveIcon />} tooltip="Active" active onClick={noop} />
    <ToolbarIconButton icon={<PlayArrowIcon />} tooltip="Loading" loading onClick={noop} />
    <ToolbarIconButton icon={<DeleteIcon />} tooltip="Disabled" disabled onClick={noop} />
    <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" shortcut={["Ctrl", "S"]} onClick={noop} />
  </FlexRow>
);
