/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { IconForType } from "../../config/data_types";
import { Box, Chip, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";

interface TypeFilterChipsProps {
  selectedInputType: string;
  setSelectedInputType: (value: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (value: string) => void;
}

// Common type categories for quick filtering
const TYPE_CATEGORIES = [
  { value: "image", label: "Image", icon: "image" },
  { value: "text", label: "Text", icon: "text" },
  { value: "audio", label: "Audio", icon: "audio" },
  { value: "video", label: "Video", icon: "video" },
  { value: "tensor", label: "Tensor", icon: "tensor" },
  { value: "float", label: "Number", icon: "float" }
];

const typeFilterChipsStyles = (theme: Theme) =>
  css({
    "&.type-filter-chips": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "0.5em 0.5em 0 0"
    },
    ".filter-section": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexWrap: "wrap"
    },
    ".filter-label": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      minWidth: "50px"
    },
    ".type-chips": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px"
    },
    ".type-chip": {
      height: "24px",
      padding: "0 0.7em",
      fontSize: "0.7rem",
      borderRadius: "12px",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      cursor: "pointer",
      transition: "all 0.15s ease",
      "& .MuiChip-label": {
        padding: "0 8px"
      },
      "& .MuiChip-icon": {
        marginLeft: "6px"
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        borderColor: theme.vars.palette.text.secondary
      },
      "&.selected": {
        backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
        borderColor: "var(--palette-primary-main)",
        color: "var(--palette-primary-main)"
      }
    },
    ".active-filters": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexWrap: "wrap"
    },
    ".active-filter": {
      height: "22px",
      fontSize: "0.65rem",
      borderRadius: "11px",
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.2)",
      border: "1px solid var(--palette-primary-main)",
      color: "var(--palette-primary-main)",
      "& .MuiChip-label": {
        padding: "0 6px 0 8px"
      },
      "& .MuiChip-deleteIcon": {
        fontSize: "14px",
        color: "var(--palette-primary-main)",
        marginRight: "4px",
        "&:hover": {
          color: theme.vars.palette.error.main
        }
      }
    }
  });

const TypeFilterChips: React.FC<TypeFilterChipsProps> = memo(({
  selectedInputType,
  setSelectedInputType,
  selectedOutputType,
  setSelectedOutputType
}) => {
  const theme = useTheme();

  const handleOutputClick = (type: string) => {
    if (selectedOutputType === type) {
      setSelectedOutputType("");
    } else {
      setSelectedOutputType(type);
    }
  };

  const hasActiveFilters = selectedInputType || selectedOutputType;

  return (
    <Box className="type-filter-chips" css={typeFilterChipsStyles(theme)}>
      {/* Active filters display */}
      {hasActiveFilters && (
        <Box className="active-filters">
          {selectedInputType && (
            <Chip
              className="active-filter"
              size="small"
              label={`Input: ${selectedInputType}`}
              deleteIcon={<CloseIcon />}
              onDelete={() => setSelectedInputType("")}
            />
          )}
          {selectedOutputType && (
            <Chip
              className="active-filter"
              size="small"
              label={`Output: ${selectedOutputType}`}
              deleteIcon={<CloseIcon />}
              onDelete={() => setSelectedOutputType("")}
            />
          )}
        </Box>
      )}

      {/* Quick type filters */}
      <Box className="filter-section">
        <span className="filter-label">Type:</span>
        <Box className="type-chips">
          {TYPE_CATEGORIES.map((type) => (
            <Tooltip key={type.value} title={`Filter by ${type.label}`} placement="top">
              <Chip
                className={`type-chip ${
                  selectedInputType === type.value || selectedOutputType === type.value
                    ? "selected"
                    : ""
                }`}
                size="small"
                icon={
                  <IconForType
                    iconName={type.icon}
                    containerStyle={{ width: 14, height: 14 }}
                  />
                }
                label={type.label}
                onClick={() => {
                  // Toggle as output type by default
                  handleOutputClick(type.value);
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </Box>
    </Box>
  );
});

TypeFilterChips.displayName = "TypeFilterChips";

export default TypeFilterChips;
