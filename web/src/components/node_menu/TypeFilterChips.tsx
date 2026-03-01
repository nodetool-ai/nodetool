/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo, useState } from "react";
import { IconForType } from "../../config/data_types";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Menu,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FilterListIcon from "@mui/icons-material/FilterList";
import useMetadataStore from "../../stores/MetadataStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";

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
  { value: "float", label: "Number", icon: "float" }
];

type TypeOption = {
  value: string;
  label: string;
};

const ALL_INPUT_OPTION: TypeOption = {
  value: "",
  label: "All input types"
};

const ALL_OUTPUT_OPTION: TypeOption = {
  value: "",
  label: "All output types"
};

const typeFilterChipsStyles = (theme: Theme) =>
  css({
    "&.type-filter-chips": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      flex: "1 1 100%",
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
    ".provider-quick": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      marginRight: "6px"
    },
    ".provider-quick-chip": {
      height: "22px",
      fontSize: "0.64rem",
      borderRadius: "11px",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".provider-quick-chip.selected": {
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
      borderColor: "var(--palette-primary-main)",
      color: "var(--palette-primary-main)"
    },
    ".quick-label": {
      fontSize: "0.68rem",
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
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      padding: ".5em 0",
      marginBottom: "1em"
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
    ".filter-actions": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexShrink: 0,
      marginLeft: "auto"
    },
    ".more-filters-button": {
      textTransform: "none",
      borderRadius: "12px",
      fontSize: "0.74rem",
      lineHeight: 1.2,
      padding: "5px 10px",
      minWidth: "unset",
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".menu-header": {
      marginBottom: "12px"
    },
    ".menu-title": {
      fontSize: "0.82rem",
      color: theme.vars.palette.text.primary,
      fontWeight: 600,
      marginBottom: "4px"
    },
    ".menu-section-title": {
      fontSize: "0.72rem",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.55px",
      marginBottom: "8px",
      fontWeight: 600
    },
    ".filter-menu-content": {
      minWidth: "390px",
      maxWidth: "480px",
      padding: "16px"
    },
    ".filter-select": {
      width: "100%",
      marginBottom: "10px",
      "& .MuiInputBase-root": {
        fontSize: theme.fontSizeSmaller,
        padding: ".5em .75em"
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.divider
      },
      "& .MuiAutocomplete-option": {
        minHeight: "30px",
        paddingTop: "2px",
        paddingBottom: "2px",
        fontSize: theme.fontSizeSmaller
      }
    }
  });

const TypeFilterChips: React.FC<TypeFilterChipsProps> = memo(
  ({
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

    const allTypeOptions = useMemo<TypeOption[]>(() => {
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

    const inputTypeOptions = useMemo<TypeOption[]>(
      () => [ALL_INPUT_OPTION, ...allTypeOptions],
      [allTypeOptions]
    );
    const outputTypeOptions = useMemo<TypeOption[]>(
      () => [ALL_OUTPUT_OPTION, ...allTypeOptions],
      [allTypeOptions]
    );

    const selectedInputOption = useMemo<TypeOption>(
      () =>
        inputTypeOptions.find((option) => option.value === selectedInputType) ??
        ALL_INPUT_OPTION,
      [inputTypeOptions, selectedInputType]
    );

    const selectedOutputOption = useMemo<TypeOption>(
      () =>
        outputTypeOptions.find(
          (option) => option.value === selectedOutputType
        ) ?? ALL_OUTPUT_OPTION,
      [outputTypeOptions, selectedOutputType]
    );

    const filterTypeOptions = useCallback(
      (options: TypeOption[], query: string): TypeOption[] => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
          return options;
        }
        return options.filter((option) =>
          `${option.label} ${option.value}`
            .toLowerCase()
            .includes(normalizedQuery)
        );
      },
      []
    );

    const handleOutputClick = useCallback(
      (type: string) => {
        if (selectedOutputType === type) {
          setSelectedOutputType("");
        } else {
          setSelectedOutputType(type);
        }
      },
      [selectedOutputType, setSelectedOutputType]
    );

    const handleTypeChipClick = useCallback(
      (type: string) => () => {
        handleOutputClick(type);
      },
      [handleOutputClick]
    );

    const handleOpenMenu = useCallback(
      (event: React.MouseEvent<HTMLElement>) => {
        setMenuAnchor(event.currentTarget);
      },
      []
    );

    const handleCloseMenu = useCallback(() => {
      setMenuAnchor(null);
    }, []);

    const menuOpen = Boolean(menuAnchor);

    return (
      <Box className="type-filter-chips" css={typeFilterChipsStyles(theme)}>
        <Box className="quick-filters">
          <Box className="provider-quick">
            <Chip
              className={`provider-quick-chip ${selectedProviderType === "local" ? "selected" : ""}`}
              size="small"
              label="Local"
              onClick={() =>
                setSelectedProviderType(
                  selectedProviderType === "local" ? "all" : "local"
                )
              }
            />
            <Chip
              className={`provider-quick-chip ${selectedProviderType === "api" ? "selected" : ""}`}
              size="small"
              label="API"
              onClick={() =>
                setSelectedProviderType(
                  selectedProviderType === "api" ? "all" : "api"
                )
              }
            />
          </Box>
          <span className="quick-label">Output:</span>
          <Box className="type-chips filter-section">
            {TYPE_CATEGORIES.map((type) => (
              <Tooltip
                key={type.value}
                title={`Filter by ${type.label}`}
                placement="top"
              >
                <Chip
                  className={`type-chip ${
                    selectedInputType === type.value ||
                    selectedOutputType === type.value
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
          <Button
            variant="outlined"
            className="more-filters-button"
            startIcon={<FilterListIcon fontSize="small" />}
            onClick={handleOpenMenu}
          >
            Filters
          </Button>
        </Box>

        <Menu
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={handleCloseMenu}
          slotProps={{
            paper: {
              sx: {
                borderRadius: "14px",
                backgroundImage: "none",
                overflow: "visible",
                border: (muiTheme) =>
                  `1px solid ${muiTheme.vars.palette.divider}`
                // boxShadow: "0 18px 36px rgba(0,0,0,0.3)"
              }
            }
          }}
        >
          <Box
            className="filter-menu-content"
            sx={{
              padding: "1em",
              backgroundColor: theme.vars.palette.background.paper,
              fontSize: theme.fontSizeSmaller
            }}
          >
            <Box className="menu-header">
              <Typography
                sx={{
                  fontSize: theme.fontSizeSmaller,
                  color: theme.vars.palette.text.secondary,
                  marginBottom: "1em"
                }}
              >
                Filter nodes by input and output data types
              </Typography>
            </Box>

            <Typography
              sx={{
                marginBottom: "0.25em"
              }}
            >
              Input Type
            </Typography>
            <Autocomplete<TypeOption, false, false, false>
              className="filter-select"
              disablePortal
              options={inputTypeOptions}
              value={selectedInputOption}
              isOptionEqualToValue={(option, value) =>
                option.value === value.value
              }
              getOptionLabel={(option) => option.label}
              filterOptions={(options, state) =>
                filterTypeOptions(options, state.inputValue)
              }
              onChange={(_, option) =>
                setSelectedInputType(option?.value ?? "")
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Search input type..."
                />
              )}
              slotProps={{
                popper: {
                  sx: {
                    zIndex: (muiTheme) => muiTheme.zIndex.modal + 10
                  }
                },
                listbox: {
                  sx: {
                    "& .MuiAutocomplete-option": {
                      minHeight: "30px",
                      py: 0.25
                    }
                  }
                }
              }}
              sx={{ marginBottom: "1em" }}
            />

            <Typography
              sx={{
                marginBottom: "0.25em"
              }}
            >
              Output Type
            </Typography>
            <Autocomplete<TypeOption, false, false, false>
              className="filter-select"
              disablePortal
              options={outputTypeOptions}
              value={selectedOutputOption}
              isOptionEqualToValue={(option, value) =>
                option.value === value.value
              }
              getOptionLabel={(option) => option.label}
              filterOptions={(options, state) =>
                filterTypeOptions(options, state.inputValue)
              }
              onChange={(_, option) =>
                setSelectedOutputType(option?.value ?? "")
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Search output type..."
                />
              )}
              slotProps={{
                popper: {
                  sx: {
                    zIndex: (muiTheme) => muiTheme.zIndex.modal + 10
                  }
                },
                listbox: {
                  sx: {
                    "& .MuiAutocomplete-option": {
                      minHeight: "30px",
                      py: 0.25
                    }
                  }
                }
              }}
            />
          </Box>
        </Menu>
      </Box>
    );
  }
);

TypeFilterChips.displayName = "TypeFilterChips";

export default TypeFilterChips;
