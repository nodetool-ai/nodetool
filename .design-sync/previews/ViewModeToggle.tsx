import * as React from "react";
import { ViewModeToggle } from "nodetool";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

export const Default = () => {
  const [value, setValue] = React.useState("grid");
  return (
    <ViewModeToggle
      value={value}
      onChange={setValue}
      options={[
        { value: "grid", icon: <GridViewIcon />, tooltip: "Grid view" },
        { value: "cards", icon: <ViewModuleIcon />, tooltip: "Card view" },
        { value: "list", icon: <ViewListIcon />, tooltip: "List view" }
      ]}
    />
  );
};

export const SortModes = () => {
  const [value, setValue] = React.useState("recent");
  return (
    <ViewModeToggle
      value={value}
      onChange={setValue}
      options={[
        { value: "name", icon: <SortByAlphaIcon />, tooltip: "Sort by name" },
        { value: "recent", icon: <AccessTimeIcon />, tooltip: "Sort by recent" }
      ]}
    />
  );
};

export const Sizes = () => {
  const [value, setValue] = React.useState("grid");
  const options = [
    { value: "grid", icon: <GridViewIcon />, tooltip: "Grid view" },
    { value: "list", icon: <ViewListIcon />, tooltip: "List view" }
  ];
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <ViewModeToggle value={value} onChange={setValue} options={options} size="small" />
      <ViewModeToggle value={value} onChange={setValue} options={options} size="large" />
    </div>
  );
};
