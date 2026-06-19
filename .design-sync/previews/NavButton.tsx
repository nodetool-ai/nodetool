import * as React from "react";
import { NavButton, FlexColumn, FlexRow } from "nodetool";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ImageIcon from "@mui/icons-material/Image";
import SettingsIcon from "@mui/icons-material/Settings";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export const Sidebar = () => (
  <FlexColumn gap={0.5} style={{ width: 200 }}>
    <NavButton icon={<DashboardIcon />} label="Dashboard" active />
    <NavButton icon={<AccountTreeIcon />} label="Workflows" />
    <NavButton icon={<ImageIcon />} label="Assets" />
    <NavButton icon={<SettingsIcon />} label="Settings" />
  </FlexColumn>
);

export const IconOnly = () => (
  <FlexRow gap={1} align="center">
    <NavButton icon={<DashboardIcon />} tooltip="Dashboard" active />
    <NavButton icon={<AccountTreeIcon />} tooltip="Workflows" />
    <NavButton icon={<ImageIcon />} tooltip="Assets" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexColumn gap={1} align="flex-start">
    <NavButton icon={<ArrowBackIcon />} label="Back" navSize="small" />
    <NavButton icon={<ArrowBackIcon />} label="Back" navSize="medium" />
    <NavButton icon={<ArrowBackIcon />} label="Back" navSize="large" />
  </FlexColumn>
);
