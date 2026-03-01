/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo, useState } from "react";
import { IconForType } from "../../config/data_types";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  Menu,
  MenuItem,
  Select,
  Tooltip,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import FilterListIcon from "@mui/icons-material/FilterList";
import useMetadataStore from "../../stores/MetadataStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import type { ProviderFilterType } from "../../stores/NodeMenuStore";

interface TypeFilterChipsProps {
  selectedInputType: string;
  setSelectedInputType: (value: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (value: string) => void;
}

// Fixed quick filters requested by UX
const TYPE_CATEGORIES = [
  { value: "image", label: "Image", icon: "image" },
  { value: "text", label: "Text", icon: "text" },
  { value: "audio", label: "Audio", icon: "audio" },
  { value: "video", label: "Video", icon: "video" },
  { value: "enum", label: "Enum", icon: "enum" },
  { value: "float", label: "Number", icon: "float" }
];

const typeFilterChipsStyles = (theme: Theme) =>
  css({
    "&.type-filter-chips": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "auto",
      flex: "1 1 auto",
      gap: "8px",
      minWidth: 0
    },
    ".quick-filters": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      minWidth: 0,
      flex: "1 1 auto",
      overflow: "hidden"
    },
    ".quick-label": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      marginRight: "2px"
    },
    ".filter-section": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexWrap: "nowrap"
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
      flexWrap: "nowrap",
      gap: "4px"
    },
    ".type-chip": {
      height: "23px",
      padding: "0 0.7em",
      fontSize: "0.65rem",
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
      flexWrap: "wrap",
      justifyContent: "flex-end"
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
    },
    ".filter-actions": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexShrink: 0,
      marginLeft: "auto"
    },
    ".more-filters-button": {
      textTransform: "none",
      borderRadius: "10px",
      fontSize: "0.72rem",
      lineHeight: 1.2,
      padding: "4px 8px",
      minWidth: "unset",
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".menu-section-title": {
      fontSize: "0.68rem",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.45px",
      marginBottom: "6px"
    },
    ".provider-choices": {
      display: "flex",
      gap: "6px",
      flexWrap: "wrap",
      marginBottom: "10px"
    },
    ".provider-chip": {
      height: "24px",
      fontSize: "0.7rem",
      borderRadius: "12px",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".provider-chip.selected": {
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
      borderColor: "var(--palette-primary-main)",
      color: "var(--palette-primary-main)"
    },
    ".filter-menu-content": {
      minWidth: "300px",
      maxWidth: "360px",
      padding: "10px"
    },
    ".filter-select": {
      width: "100%",
      "& .MuiSelect-select": {
        fontSize: "0.78rem",
        padding: "6px 10px"
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
  const { selectedProviderType, setSelectedProviderType } = useNodeMenuStore(
    (state) => ({
      selectedProviderType: state.selectedProviderType,
      setSelectedProviderType: state.setSelectedProviderType
    })
  );
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const metadata = useMetadataStore((state) => state.metadata);

  const allTypeOptions = useMemo(() => {
    const allTypes = new Set<string>();
    Object.values(metadata).forEach((node) => {
      node.properties.forEach((prop) => {
        if (prop.type?.type) {
          allTypes.add(prop.type.type);
        }
      });
      node.outputs.forEach((output) => {
        if (output.type?.type) {
          allTypes.add(output.type.type);
        }
      });
    });

    const sorted = Array.from(allTypes).sort((a, b) => a.localeCompare(b));
    return sorted.map((value) => ({
      value,
      label: value === "float" ? "Number" : value
    }));
  }, [metadata]);

  const providerOptions = useMemo<
    Array<{ value: ProviderFilterType; label: string }>
  >(
    () => [
      { value: "all", label: "All" },
      { value: "local", label: "Local" },
      { value: "api", label: "API" }
    ],
    []
  );

  const handleOutputClick = useCallback((type: string) => {
    if (selectedOutputType === type) {
      setSelectedOutputType("");
    } else {
      setSelectedOutputType(type);
    }
  }, [selectedOutputType, setSelectedOutputType]);

  const handleClearInput = useCallback(() => {
    setSelectedInputType("");
  }, [setSelectedInputType]);

  const handleClearOutput = useCallback(() => {
    setSelectedOutputType("");
  }, [setSelectedOutputType]);

  const handleClearProvider = useCallback(() => {
    setSelectedProviderType("all");
  }, [setSelectedProviderType]);

  const handleTypeChipClick = useCallback((type: string) => () => {
    handleOutputClick(type);
  }, [handleOutputClick]);

  const handleOpenMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const hasActiveFilters =
    selectedProviderType !== "all" || selectedInputType || selectedOutputType;
  const menuOpen = Boolean(menuAnchor);

  return (
    <Box className="type-filter-chips" css={typeFilterChipsStyles(theme)}>
      <Box className="quick-filters">
        <span className="quick-label">Quick:</span>
        <Box className="type-chips filter-section">
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
                onClick={handleTypeChipClick(type.value)}
              />
            </Tooltip>
          ))}
        </Box>
      </Box>

      <Box className="filter-actions">
        {hasActiveFilters && (
          <Box className="active-filters">
            {selectedProviderType !== "all" && (
              <Chip
                className="active-filter"
                size="small"
                label={`Provider: ${selectedProviderType === "api" ? "API" : "Local"}`}
                deleteIcon={<CloseIcon />}
                onDelete={handleClearProvider}
              />
            )}
            {selectedInputType && (
              <Chip
                className="active-filter"
                size="small"
                label={`Input: ${selectedInputType}`}
                deleteIcon={<CloseIcon />}
                onDelete={handleClearInput}
              />
            )}
            {selectedOutputType && (
              <Chip
                className="active-filter"
                size="small"
                label={`Output: ${selectedOutputType}`}
                deleteIcon={<CloseIcon />}
                onDelete={handleClearOutput}
              />
            )}
          </Box>
        )}
        <Button
          variant="outlined"
          className="more-filters-button"
          startIcon={<FilterListIcon fontSize="small" />}
          onClick={handleOpenMenu}
        >
          Filters
        </Button>
      </Box>

      <Menu anchorEl={menuAnchor} open={menuOpen} onClose={handleCloseMenu}>
        <Box className="filter-menu-content">
          <Typography className="menu-section-title">Provider</Typography>
          <Box className="provider-choices">
            {providerOptions.map((provider) => (
              <Chip
                key={provider.value}
                className={`provider-chip ${selectedProviderType === provider.value ? "selected" : ""}`}
                size="small"
                label={provider.label}
                onClick={() => setSelectedProviderType(provider.value)}
              />
            ))}
          </Box>

          <Divider sx={{ my: 1 }} />

          <Typography className="menu-section-title">Input Type</Typography>
          <FormControl className="filter-select" size="small">
            <Select
              value={selectedInputType}
              onChange={(e) => setSelectedInputType(e.target.value)}
            >
              <MenuItem value="">All input types</MenuItem>
              {allTypeOptions.map((option) => (
                <MenuItem key={`input-${option.value}`} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography className="menu-section-title" sx={{ mt: 1.2 }}>
            Output Type
          </Typography>
          <FormControl className="filter-select" size="small">
            <Select
              value={selectedOutputType}
              onChange={(e) => setSelectedOutputType(e.target.value)}
            >
              <MenuItem value="">All output types</MenuItem>
              {allTypeOptions.map((option) => (
                <MenuItem key={`output-${option.value}`} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Menu>
    </Box>
  );
});

TypeFilterChips.displayName = "TypeFilterChips";

export default TypeFilterChips;
