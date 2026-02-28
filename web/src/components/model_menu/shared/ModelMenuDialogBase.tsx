import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo, useState } from "react";
import {
  Popover,
  PopoverOrigin,
  Box,
  Divider,
  ListItemText,
  ListItemIcon,
  List,
  ListItemButton,
  Tooltip,
  CircularProgress,
  Typography,
  Collapse
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import StarIcon from "@mui/icons-material/Star"; // Favorite
import HistoryIcon from "@mui/icons-material/History"; // Recent
import SearchInput from "../../search/SearchInput";
import ModelFiltersBar from "../ModelFiltersBar";
import ProviderList from "../ProviderList";
import ModelList from "../ModelList";
import ProviderApiKeyWarningBanner from "./ProviderApiKeyWarningBanner";
import useModelFiltersStore from "../../../stores/ModelFiltersStore";
import {
  applyAdvancedModelFilters,
  ModelSelectorModel
} from "../../../utils/modelNormalization";
import {
  ModelMenuStoreHook,
  useModelMenuData
} from "../../../stores/ModelMenuStore";

export interface ModelMenuBaseProps<TModel extends ModelSelectorModel> {
  open: boolean;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
  modelData: {
    models: TModel[] | undefined;
    isLoading: boolean;
    isFetching?: boolean;
    error: unknown;
    providerErrors?: Array<{ provider: string; error: unknown }>;
    loadingProgress?: { total: number; loaded: number; loading: number };
  };
  onModelChange?: (model: TModel) => void;
  title?: string;
  searchPlaceholder?: string;
  storeHook: ModelMenuStoreHook<TModel>;
}

function ModelMenuDialogBase<TModel extends ModelSelectorModel>({
  open,
  onClose,
  anchorEl,
  modelData,
  onModelChange,
  title: _title = "Select Model",
  searchPlaceholder = "Search models...",
  storeHook
}: ModelMenuBaseProps<TModel>) {
  const { models, isLoading, isFetching, error: fetchedError, providerErrors, loadingProgress } = modelData;

  const isError = !!fetchedError;
  const theme = useTheme();
  // isSmall logic removed as Popover usually not full screen on mobile, but we can keep it if needed.
  // Let's assume desktop-centric for "next to trigger".

  const setSearch = storeHook((s) => s.setSearch);
  const search = storeHook((s) => s.search);
  const selectedProvider = storeHook((s) => s.selectedProvider);
  const setSelectedProvider = storeHook((s) => s.setSelectedProvider);

  const [customView, setCustomView] = useState<"favorites" | "recent" | null>(
    null
  );

  const isIconOnly = true;

  const { providers, filteredModels, favoriteModels, recentModels } =
    useModelMenuData<TModel>(models || [], storeHook);

  // Advanced filters state snapshot
  const selectedTypes = useModelFiltersStore((s) => s.selectedTypes);
  const sizeBucket = useModelFiltersStore((s) => s.sizeBucket);

  // Determine the base list of models to display
  const baseModels = useMemo(() => {
    if (customView === "favorites") {
      return favoriteModels;
    }
    if (customView === "recent") {
      return recentModels;
    }
    return filteredModels; // Respects provider selection
  }, [customView, favoriteModels, recentModels, filteredModels]);

  const filteredModelsAdvanced = useMemo(() => {
    const result = applyAdvancedModelFilters<TModel>(baseModels, {
      selectedTypes,
      sizeBucket,
      families: []
    });
    return result;
  }, [baseModels, selectedTypes, sizeBucket]);

  const handleSelectModel = useCallback(
    (model: TModel) => {
      onModelChange?.(model);
    },
    [onModelChange]
  );

  // Reset custom view when provider changes
  React.useEffect(() => {
    if (selectedProvider !== null && customView !== null) {
      setCustomView(null);
    }
  }, [selectedProvider, customView]);

  // Positioning logic mimicking Select.tsx
  const [positionConfig, setPositionConfig] = useState<{
    anchorOrigin: PopoverOrigin;
    transformOrigin: PopoverOrigin;
  }>({
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" }
  });

  const updatePosition = useCallback(() => {
    if (!anchorEl) {
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const height = 420; // Height of the menu
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < height && rect.top > height) {
      // Flip to top
      setPositionConfig({
        anchorOrigin: { vertical: "top", horizontal: "left" },
        transformOrigin: { vertical: "bottom", horizontal: "left" }
      });
    } else {
      // Default bottom
      setPositionConfig({
        anchorOrigin: { vertical: "bottom", horizontal: "left" },
        transformOrigin: { vertical: "top", horizontal: "left" }
      });
    }
  }, [anchorEl]);

  React.useLayoutEffect(() => {
    if (open) {
      updatePosition();
      setSearch("");
      window.addEventListener("resize", updatePosition);
      return () => window.removeEventListener("resize", updatePosition);
    }
  }, [open, updatePosition, setSearch]);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={positionConfig.anchorOrigin}
      transformOrigin={positionConfig.transformOrigin}
      slotProps={{
        paper: {
          elevation: 24,
          style: {
            width: "520px",
            height: "500px",
            maxHeight: "90vh",
            maxWidth: "100vw", // Allow shrinkage
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.background.paper, // No transparency
            border: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }
        }
      }}
    >
      {/* Compact Header */}
      <Box
        sx={{
          p: 1.5,
          pl: 2,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexShrink: 0,
          background: theme.vars.palette.background.paper // No transparency
        }}
      >
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SearchInput
              onSearchChange={setSearch}
              placeholder={searchPlaceholder}
              debounceTime={150}
              focusSearchInput
              focusOnTyping
              width="100%"
            />
          </Box>
          <ModelFiltersBar />
        </Box>
      </Box>

      {/* Status Banner - shows loading progress and errors */}
      <Collapse in={!!(isLoading || isFetching || (providerErrors && providerErrors.length > 0))}>
        <Box
          sx={{
            px: 2,
            py: 0.75,
            display: "flex",
            alignItems: "center",
            gap: 1,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            bgcolor: providerErrors && providerErrors.length > 0
              ? theme.vars.palette.warning.main + "15"
              : theme.vars.palette.action.hover,
            fontSize: "0.8rem"
          }}
        >
          {(isLoading || isFetching) && (
            <>
              <CircularProgress size={14} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {loadingProgress
                  ? `Loading models: ${loadingProgress.loaded}/${loadingProgress.total} providers...`
                  : "Loading models..."}
              </Typography>
            </>
          )}
          {providerErrors && providerErrors.length > 0 && !isLoading && (
            <Tooltip
              title={
                <Box sx={{ maxWidth: 300 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Failed to load models from:
                  </Typography>
                  {providerErrors.map((pe) => (
                    <Typography key={pe.provider} variant="caption" component="div" sx={{ mt: 0.5 }}>
                      • {pe.provider}: {pe.error instanceof Error ? pe.error.message : "Unknown error"}
                    </Typography>
                  ))}
                </Box>
              }
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "help" }}>
                <WarningAmberIcon sx={{ fontSize: 16, color: "warning.main" }} />
                <Typography variant="caption" sx={{ color: "warning.main" }}>
                  {providerErrors.length} provider{providerErrors.length > 1 ? "s" : ""} failed to load
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
      </Collapse>

      {/* Main Content Grid */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Sidebar: Navigation */}
        <Box
          sx={{
            width: isIconOnly ? 64 : 200,
            flexShrink: 0,
            borderRight: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            flexDirection: "column",
            bgcolor: theme.vars.palette.background.default,
            alignItems: isIconOnly ? "center" : "stretch"
          }}
        >
          <List
            dense
            sx={{
              py: 1,
              width: "100%",
              px: isIconOnly ? 0.5 : 0,
              // Keep top icon-only actions aligned with provider icons when provider list shows a vertical scrollbar.
              pr: isIconOnly ? 1.5 : 0
            }}
          >
            <ListItemButton
              disableRipple
              selected={customView === "favorites"}
              onClick={() => {
                setCustomView("favorites");
                setSelectedProvider(null);
              }}
              sx={{
                py: isIconOnly ? 1 : 0.25,
                borderRadius: 1,
                mx: 0,
                mb: 0.5,
                justifyContent: isIconOnly ? "center" : "flex-start",
                minHeight: isIconOnly ? 40 : "auto",
                px: isIconOnly ? 0 : 2
              }}
            >
              {isIconOnly ? (
                <Tooltip title="Favorites" placement="right">
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor:
                        customView === "favorites"
                          ? "primary.main"
                          : "action.selected",
                      border: `1px solid ${customView === "favorites" ? "transparent" : theme.vars.palette.divider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <StarIcon
                      fontSize="small"
                      sx={{
                        fontSize: "1.25rem",
                        color:
                          customView === "favorites"
                            ? "primary.contrastText"
                            : "text.primary"
                      }}
                    />
                  </Box>
                </Tooltip>
              ) : (
                <>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: "4px",
                        bgcolor: "rgba(0,0,0,0.04)"
                      }}
                    >
                      <StarIcon
                        fontSize="small"
                        sx={{
                          fontSize: "1.2rem",
                          color:
                            customView === "favorites"
                              ? "primary.main"
                              : "text.secondary"
                        }}
                      />
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary="Favorites"
                    primaryTypographyProps={{
                      fontSize: "0.85rem",
                      fontWeight: customView === "favorites" ? 600 : 400
                    }}
                  />
                </>
              )}
            </ListItemButton>
            <ListItemButton
              disableRipple
              selected={customView === "recent"}
              onClick={() => {
                setCustomView("recent");
                setSelectedProvider(null);
              }}
              sx={{
                py: isIconOnly ? 1 : 0.25,
                borderRadius: 1,
                mx: 0,
                justifyContent: isIconOnly ? "center" : "flex-start",
                minHeight: isIconOnly ? 40 : "auto",
                px: isIconOnly ? 0 : 2
              }}
            >
              {isIconOnly ? (
                <Tooltip title="Recent" placement="right">
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor:
                        customView === "recent"
                          ? "primary.main"
                          : "action.selected",
                      border: `1px solid ${customView === "recent" ? "transparent" : theme.vars.palette.divider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <HistoryIcon
                      fontSize="small"
                      sx={{
                        fontSize: "1.25rem",
                        color:
                          customView === "recent"
                            ? "primary.contrastText"
                            : "text.primary"
                      }}
                    />
                  </Box>
                </Tooltip>
              ) : (
                <>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: "4px",
                        bgcolor: "rgba(0,0,0,0.04)"
                      }}
                    >
                      <HistoryIcon
                        fontSize="small"
                        sx={{
                          fontSize: "1.2rem",
                          color:
                            customView === "recent"
                              ? "primary.main"
                              : "text.secondary"
                        }}
                      />
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary="Recent"
                    primaryTypographyProps={{
                      fontSize: "0.85rem",
                      fontWeight: customView === "recent" ? 600 : 400
                    }}
                  />
                </>
              )}
            </ListItemButton>
          </List>

          <Divider sx={{ mx: 2, mb: 1, opacity: 0.6 }} />

          {!isIconOnly && (
            <Box
              sx={{
                px: 2,
                pb: 0.5,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.5
              }}
            >
              Providers
            </Box>
          )}
          <Box
            sx={{ flex: 1, overflow: "hidden", width: "100%" }}
            onClickCapture={() => {
              // If user clicks anywhere in provider list, we assume they want to stick to filtered view
              if (customView) {
                setCustomView(null);
              }
            }}
          >
            <ProviderList
              providers={providers}
              isLoading={!!isLoading}
              isError={!!isError}
              storeHook={storeHook}
              forceUnselect={!!customView}
              iconOnly={isIconOnly}
            />
          </Box>
          <ProviderApiKeyWarningBanner providers={providers} />
        </Box>

        {/* Center: Model List */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            bgcolor: "background.paper"
          }}
        >
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            <ModelList<TModel>
              models={filteredModelsAdvanced}
              onSelect={handleSelectModel}
              searchTerm={search}
            />
          </Box>
          {/* Footer removed */}
        </Box>
      </Box>
    </Popover>
  );
}

export default ModelMenuDialogBase;
