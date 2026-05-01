/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import ImageIcon from "@mui/icons-material/Image";
import VideocamIcon from "@mui/icons-material/Videocam";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import DescriptionIcon from "@mui/icons-material/Description";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import { useTheme } from "@mui/material/styles";
import { ToggleGroup, ToggleOption, Tooltip } from "../ui_primitives";
import { TYPE_FILTERS, TypeFilterKey } from "../../utils/formatUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const ICONS: Record<TypeFilterKey, React.ReactNode> = {
  all: <FilterAltOffIcon />,
  image: <ImageIcon />,
  video: <VideocamIcon />,
  audio: <AudiotrackIcon />,
  model_3d: <ViewInArIcon />,
  text: <DescriptionIcon />,
  application: <InsertDriveFileIcon />,
  other: <MoreHorizIcon />
};

interface AssetTypeFilterProps {
  value: TypeFilterKey;
  onChange: (value: TypeFilterKey) => void;
  /** Render compact icon-only buttons (default) or icon + label */
  showLabels?: boolean;
}

/**
 * AssetTypeFilter - one-click filter row for asset categories.
 * Selecting an option filters the visible assets to that media type;
 * "All" clears the filter.
 */
const AssetTypeFilter: React.FC<AssetTypeFilterProps> = ({
  value,
  onChange,
  showLabels = false
}) => {
  const theme = useTheme();

  const handleChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, next: unknown) => {
      // Re-clicking the active option falls back to "all" so the row
      // never ends up in an empty state.
      onChange((next as TypeFilterKey | null) ?? "all");
    },
    [onChange]
  );

  return (
    <ToggleGroup
      className="asset-type-filter"
      value={value}
      exclusive
      compact
      onChange={handleChange}
      aria-label="Filter assets by type"
      sx={{
        "& .MuiToggleButton-root": {
          color: theme.vars.palette.grey[400],
          border: `1px solid ${theme.vars.palette.grey[600]}`,
          padding: "0.25em 0.4em",
          minWidth: 0,
          "& .MuiSvgIcon-root": {
            fontSize: "16px"
          },
          "&:hover": {
            color: "var(--palette-primary-main)",
            borderColor: "var(--palette-primary-main)"
          },
          "&.Mui-selected": {
            color: "var(--palette-primary-main)",
            backgroundColor: theme.vars.palette.action.selected,
            "&:hover": {
              backgroundColor: theme.vars.palette.action.selected
            }
          }
        }
      }}
    >
      {TYPE_FILTERS.map((filter) => (
        <ToggleOption
          key={filter.key}
          value={filter.key}
          aria-label={filter.label}
        >
          <Tooltip
            title={filter.label}
            placement="bottom"
            delay={TOOLTIP_ENTER_DELAY}
            disableInteractive
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {ICONS[filter.key]}
              {showLabels && <span>{filter.label}</span>}
            </span>
          </Tooltip>
        </ToggleOption>
      ))}
    </ToggleGroup>
  );
};

export default memo(AssetTypeFilter);
