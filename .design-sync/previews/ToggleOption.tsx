import * as React from "react";
import { ToggleGroup, ToggleOption, FlexColumn, Text } from "nodetool";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";

export const InGroup = () => {
  const [value, setValue] = React.useState("png");
  return (
    <ToggleGroup
      exclusive
      value={value}
      onChange={(_e: unknown, v: string | null) => v && setValue(v)}
    >
      <ToggleOption value="png">PNG</ToggleOption>
      <ToggleOption value="jpg">JPEG</ToggleOption>
      <ToggleOption value="webp">WebP</ToggleOption>
    </ToggleGroup>
  );
};

export const WithIcons = () => {
  const [value, setValue] = React.useState("grid");
  return (
    <ToggleGroup
      exclusive
      value={value}
      onChange={(_e: unknown, v: string | null) => v && setValue(v)}
    >
      <ToggleOption value="grid" icon={<GridViewIcon />}>
        Grid
      </ToggleOption>
      <ToggleOption value="cards" icon={<ViewModuleIcon />}>
        Cards
      </ToggleOption>
      <ToggleOption value="list" icon={<ViewListIcon />}>
        List
      </ToggleOption>
    </ToggleGroup>
  );
};

export const States = () => {
  const [value, setValue] = React.useState("auto");
  return (
    <FlexColumn gap={1}>
      <Text size="small" color="secondary">
        Third option disabled
      </Text>
      <ToggleGroup
        exclusive
        value={value}
        onChange={(_e: unknown, v: string | null) => v && setValue(v)}
      >
        <ToggleOption value="auto">Auto</ToggleOption>
        <ToggleOption value="manual">Manual</ToggleOption>
        <ToggleOption value="off" disabled>
          Off
        </ToggleOption>
      </ToggleGroup>
    </FlexColumn>
  );
};
