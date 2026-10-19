/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconForType } from "../../config/IconForType";
import {
  Tooltip,
  Text,
  Chip,
  EditorButton,
  Box,
  Popover,
  MOTION,
  BORDER_RADIUS,
  ICON_SIZE,
  FONT_WEIGHT,
  SPACING,
  getSpacingPx,
  TextField,
  MuiAutocomplete as Autocomplete
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FilterListIcon from "@mui/icons-material/FilterList";
import useMetadataStore from "../../stores/MetadataStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useShallow } from "zustand/react/shallow";

interface TypeFilterChipsProps {
  selectedInputType: string;
  setSelectedInputType: (value: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (value: string) => void;
}

const TYPE_CATEGORIES = [
  { value: "image", key: "image", icon: "image" },
  { value: "text", key: "text", icon: "text" },
  { value: "audio", key: "audio", icon: "audio" },
  { value: "video", key: "video", icon: "video" },
  { value: "float", key: "number", icon: "float" }
];

const TYPE_CHIP_ICON_CONTAINER_STYLE = { width: 14, height: 14 } as const;

/** One height for every control in the toolbar row so their edges line up. */
const CONTROL_HEIGHT = "28px";

type TypeOption = {
  value: string;
  label: string;
  key?: string;
};

const ALL_INPUT_OPTION: TypeOption = {
  value: "",
  key: "allInputTypes"
};

const ALL_OUTPUT_OPTION: TypeOption = {
  value: "",
  key: "allOutputTypes"
};

const typeFilterChipsStyles = (theme: Theme) =>
  css({
    "&.type-filter-chips": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      width: "100%",
      flex: "1 1 100%",
      gap: getSpacingPx(SPACING.md),
      minWidth: 0
    },
    ".quick-filters": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      minWidth: 0,
      flex: "0 1 auto",
      marginLeft: "auto",
      overflow: "visible"
    },
    ".provider-quick": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.micro),
      paddingRight: getSpacingPx(SPACING.md),
      borderRight: `1px solid ${theme.vars.palette.divider}`
    },
    ".provider-quick-chip": {
      height: CONTROL_HEIGHT,
      fontSize: theme.fontSizeSmall,
      fontWeight: FONT_WEIGHT.medium,
      borderRadius: BORDER_RADIUS.md,
      border: "1px solid transparent",
      backgroundColor: "transparent",
      color: theme.vars.palette.text.secondary,
      transition: MOTION.all,
      "& .MuiChip-label": {
        paddingInline: getSpacingPx(SPACING.md)
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      }
    },
    ".provider-quick-chip.selected": {
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
      color: "var(--palette-primary-main)"
    },
    ".quick-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      whiteSpace: "nowrap",
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: 1,
      marginLeft: getSpacingPx(SPACING.xs)
    },
    ".filter-section": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.micro),
      flexWrap: "nowrap"
    },
    ".filter-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      padding: `${getSpacingPx(SPACING.md)} 0`,
      marginBottom: getSpacingPx(SPACING.xl),
      fontWeight: FONT_WEIGHT.medium
    },
    ".type-chips": {
      display: "flex",
      flexWrap: "nowrap"
    },
    ".type-chip": {
      height: CONTROL_HEIGHT,
      padding: 0,
      fontSize: theme.fontSizeSmall,
      fontWeight: FONT_WEIGHT.medium,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: "transparent",
      border: "1px solid transparent",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      transition: MOTION.all,
      "& .MuiChip-label": {
        paddingLeft: getSpacingPx(SPACING.xs),
        paddingRight: getSpacingPx(SPACING.sm)
      },
      "& .MuiChip-icon": {
        marginLeft: getSpacingPx(SPACING.sm),
        marginRight: 0,
        color: "inherit",
        display: "inline-flex",
        alignItems: "center"
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&.selected": {
        backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
        color: "var(--palette-primary-main)"
      }
    },
    ".filter-actions": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      paddingLeft: getSpacingPx(SPACING.md),
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0
    },
    ".node-count": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      userSelect: "none"
    },
    ".more-filters-button": {
      textTransform: "none",
      height: CONTROL_HEIGHT,
      borderRadius: BORDER_RADIUS.md,
      fontSize: theme.fontSizeSmall,
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: 1.2,
      padding: `0 ${getSpacingPx(SPACING.md)}`,
      minWidth: "unset",
      color: theme.vars.palette.text.secondary,
      borderColor: theme.vars.palette.divider,
      "& .MuiButton-startIcon": {
        marginRight: getSpacingPx(SPACING.xs),
        "& svg": { fontSize: ICON_SIZE.sm }
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.text.secondary,
        color: theme.vars.palette.text.primary
      }
    },
    ".menu-header": {
      marginBottom: getSpacingPx(SPACING.lg)
    },
    ".menu-title": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary,
      fontWeight: FONT_WEIGHT.semibold,
      marginBottom: getSpacingPx(SPACING.xs)
    },
    ".menu-section-title": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.55px",
      marginBottom: getSpacingPx(SPACING.md),
      fontWeight: FONT_WEIGHT.semibold
    },
    ".filter-menu-content": {
      // Clamped to the viewport: a flat 390px overflows a phone screen.
      minWidth: "min(390px, calc(100vw - 32px))",
      maxWidth: "480px",
      padding: getSpacingPx(SPACING.xl)
    },
    ".filter-select": {
      width: "100%",
      marginBottom: getSpacingPx(SPACING.lg), // was 10px
      "& .MuiInputBase-root": {
        fontSize: theme.fontSizeSmaller,
        padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.divider
      },
      "& .MuiAutocomplete-option": {
        minHeight: "30px",
        paddingTop: getSpacingPx(SPACING.micro),
        paddingBottom: getSpacingPx(SPACING.micro),
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
    const { t } = useTranslation();
    const theme = useTheme();
    const chipsStyles = useMemo(() => typeFilterChipsStyles(theme), [theme]);
    const { selectedProviderType, setSelectedProviderType } = useNodeMenuStore(
      useShallow((state) => ({
        selectedProviderType: state.selectedProviderType,
        setSelectedProviderType: state.setSelectedProviderType
      }))
    );
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const metadata = useMetadataStore((state) => state.metadata);
    const totalNodeCount = useMemo(
      () => Object.keys(metadata).length,
      [metadata]
    );

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
        label: value === "float" ? t("typeFilters.number") : value
      }));
    }, [metadata, t]);

    const inputTypeOptions = useMemo<TypeOption[]>(
      () => [{ value: "", label: t(`typeFilters.${ALL_INPUT_OPTION.key}`) }, ...allTypeOptions],
      [allTypeOptions, t]
    );
    const outputTypeOptions = useMemo<TypeOption[]>(
      () => [{ value: "", label: t(`typeFilters.${ALL_OUTPUT_OPTION.key}`) }, ...allTypeOptions],
      [allTypeOptions, t]
    );

    const selectedInputOption = useMemo<TypeOption>(
      () =>
        inputTypeOptions.find((option) => option.value === selectedInputType) ??
        { value: "", label: t(`typeFilters.${ALL_INPUT_OPTION.key}`) },
      [inputTypeOptions, selectedInputType, t]
    );

    const selectedOutputOption = useMemo<TypeOption>(
      () =>
        outputTypeOptions.find(
          (option) => option.value === selectedOutputType
        ) ?? { value: "", label: t(`typeFilters.${ALL_OUTPUT_OPTION.key}`) },
      [outputTypeOptions, selectedOutputType, t]
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
      (event: React.MouseEvent<HTMLElement>) => {
        const type = event.currentTarget.dataset.type;
        if (type) {
          handleOutputClick(type);
        }
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

    const handleLocalProviderClick = useCallback(() => {
      setSelectedProviderType(
        selectedProviderType === "local" ? "all" : "local"
      );
    }, [selectedProviderType, setSelectedProviderType]);

    const handleApiProviderClick = useCallback(() => {
      setSelectedProviderType(
        selectedProviderType === "api" ? "all" : "api"
      );
    }, [selectedProviderType, setSelectedProviderType]);

    const menuOpen = Boolean(menuAnchor);

    return (
      <Box className="type-filter-chips" css={chipsStyles}>
        <Box className="quick-filters">
          <Box className="provider-quick">
            <Chip
              className={`provider-quick-chip ${selectedProviderType === "local" ? "selected" : ""}`}
              size="small"
              label={t("typeFilters.local")}
              onClick={handleLocalProviderClick}
            />
            <Chip
              className={`provider-quick-chip ${selectedProviderType === "api" ? "selected" : ""}`}
              size="small"
              label={t("typeFilters.api")}
              onClick={handleApiProviderClick}
            />
          </Box>
          <span className="quick-label">{t("typeFilters.output")}</span>
          <Box className="type-chips filter-section">
            {TYPE_CATEGORIES.map((type) => (
              <Tooltip
                key={type.value}
                title={t("typeFilters.filterBy", { type: t(`typeFilters.${type.key}`) })}
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
                      containerStyle={TYPE_CHIP_ICON_CONTAINER_STYLE}
                    />
                  }
                  label={t(`typeFilters.${type.key}`)}
                  data-type={type.value}
                  onClick={handleTypeChipClick}
                />
              </Tooltip>
            ))}
          </Box>
        </Box>

        <Box className="filter-actions">
          <EditorButton
            variant="outlined"
            className="more-filters-button"
            startIcon={<FilterListIcon />}
            onClick={handleOpenMenu}
          >
            {t("typeFilters.filters")}
          </EditorButton>
          <span className="node-count">
            {t("typeFilters.nodeCount", { count: totalNodeCount })}
          </span>
        </Box>

        <Popover
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={handleCloseMenu}
          placement="bottom-left"
          paperSx={{ overflow: "visible" }}
        >
          <Box
            className="filter-menu-content"
            sx={{ padding: getSpacingPx(SPACING.xl) }}
          >
            <Box className="menu-header">
              <Text
                size="smaller"
                color="secondary"
                sx={{
                  marginBottom: getSpacingPx(SPACING.xl)
                }}
              >
              {t("typeFilters.description")}
              </Text>
            </Box>

            <Text
              sx={{
                marginBottom: getSpacingPx(SPACING.xs)
              }}
            >
              {t("typeFilters.inputType")}
            </Text>
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
                  placeholder={t("typeFilters.searchInputType")}
                  inputProps={{
                    ...params.inputProps,
                    "aria-label": t("typeFilters.searchInputType")
                  }}
                />
              )}
              slotProps={{
                popper: {
                  sx: {
                    zIndex: (muiTheme) => muiTheme.zIndex.modal + 10
                  }
                }
              }}
              sx={{ marginBottom: getSpacingPx(SPACING.xl) }}
            />

            <Text
              sx={{
                marginBottom: getSpacingPx(SPACING.xs)
              }}
            >
              {t("typeFilters.outputType")}
            </Text>
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
                  placeholder={t("typeFilters.searchOutputType")}
                  inputProps={{
                    ...params.inputProps,
                    "aria-label": t("typeFilters.searchOutputType")
                  }}
                />
              )}
              slotProps={{
                popper: {
                  sx: {
                    zIndex: (muiTheme) => muiTheme.zIndex.modal + 10
                  }
                }
              }}
            />
          </Box>
        </Popover>
      </Box>
    );
  }
);

TypeFilterChips.displayName = "TypeFilterChips";

export default TypeFilterChips;
