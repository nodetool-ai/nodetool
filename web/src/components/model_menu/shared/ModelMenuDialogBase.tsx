import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo, useState } from "react";
import { isProduction } from "../../../lib/env";
import type { PopoverOrigin } from "@mui/material";
import {
  Tooltip,
  Caption,
  Divider,
  LoadingSpinner,
  ToolbarIconButton,
  FlexRow,
  FlexColumn,
  Box,
  Collapse,
  BORDER_RADIUS,
  ListItemText,
  ListItemIcon,
  List,
  ListItemButton,
  Popover
} from "../../ui_primitives";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RefreshIcon from "@mui/icons-material/Refresh";

import StarIcon from "@mui/icons-material/Star"; // Favorite
import HistoryIcon from "@mui/icons-material/History"; // Recent
import SearchInput from "../../search/SearchInput";
import ModelFiltersBar from "../ModelFiltersBar";
import ProviderList from "../ProviderList";
import ModelList from "../ModelList";
import type { DownloadableModel } from "../ModelList";
import ModelPackCard from "../../hugging_face/ModelPackCard";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { useHfCacheStatusStore } from "../../../stores/HfCacheStatusStore";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey,
  isHfModel
} from "../../../utils/hfCache";
import useModelFiltersStore from "../../../stores/ModelFiltersStore";
import {
  applyAdvancedModelFilters,
  ModelSelectorModel
} from "../../../utils/modelNormalization";
import {
  ModelMenuStoreHook,
  useModelMenuData
} from "../../../stores/ModelMenuStore";
import { useModelAvailability } from "../../../hooks/useModelAvailability";
import {
  firstAvailableIndex,
  nextAvailableIndex
} from "../../../utils/modelMenuNavigation";
import type { ModelPack, UnifiedModel } from "../../../stores/ApiTypes";

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
    providers?: string[];
    refetch?: () => Promise<unknown> | unknown;
  };
  onModelChange?: (model: TModel) => void;
  title?: string;
  searchPlaceholder?: string;
  storeHook: ModelMenuStoreHook<TModel>;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
  /**
   * Modality key (e.g. "language_model") this picker sets defaults for. When
   * provided, each model row shows a "pin as default" toggle wired to
   * ModelPreferencesStore. Omitted for pickers without a default modality.
   */
  modelType?: string;
}

function ModelMenuDialogBase<TModel extends ModelSelectorModel>({
  open,
  onClose,
  anchorEl,
  modelData,
  onModelChange,
  title: _title = "Select Model",
  searchPlaceholder = "Search models...",
  storeHook,
  recommendedModels = [],
  modelPacks = [],
  modelType
}: ModelMenuBaseProps<TModel>) {
  const { models, isLoading, isFetching, error: fetchedError, providerErrors, loadingProgress, refetch } = modelData;

  const isError = !!fetchedError;
  const theme = useTheme();

  const setSearch = storeHook((s) => s.setSearch);
  const search = storeHook((s) => s.search);
  const selectedProvider = storeHook((s) => s.selectedProvider);
  const setSelectedProvider = storeHook((s) => s.setSelectedProvider);

  const [customView, setCustomView] = useState<
    "favorites" | "recent" | null
  >(null);
  const hasDownloads = !isProduction && (recommendedModels.length > 0 || modelPacks.length > 0);

  const startDownload = useModelDownloadStore((s) => s.startDownload);
  const cacheStatuses = useHfCacheStatusStore((s) => s.statuses);
  const cachePending = useHfCacheStatusStore((s) => s.pending);
  const cacheVersion = useHfCacheStatusStore((s) => s.version);
  const ensureStatuses = useHfCacheStatusStore((s) => s.ensureStatuses);

  const isIconOnly = true;

  const { providers: providersFromModels, filteredModels, favoriteModels, recentModels } =
    useModelMenuData<TModel>(models || [], storeHook);

  const providers = modelData.providers ?? providersFromModels;

  const selectedTypes = useModelFiltersStore((s) => s.selectedTypes);
  const sizeBucket = useModelFiltersStore((s) => s.sizeBucket);

  const baseModels = useMemo(() => {
    if (customView === "favorites") {
      return favoriteModels;
    }
    if (customView === "recent") {
      return recentModels;
    }
    return filteredModels; // Respects provider selection
  }, [customView, favoriteModels, recentModels, filteredModels]);

  const filteredModelsAdvanced = useMemo(
    () =>
      applyAdvancedModelFilters<TModel>(baseModels, {
        selectedTypes,
        sizeBucket,
        families: []
      }),
    [baseModels, selectedTypes, sizeBucket]
  );

  const handleSelectModel = useCallback(
    (model: TModel) => {
      onModelChange?.(model);
    },
    [onModelChange]
  );

  // Select a downloaded recommended model straight from the list. Recommended
  // entries are UnifiedModel; project the shared fields onto the menu's model
  // shape before handing it to onModelChange.
  const handleSelectRecommended = useCallback(
    (model: UnifiedModel) => {
      if (!model.provider) return;
      const selected: ModelSelectorModel = {
        type: model.type ?? "",
        id: model.id,
        name: model.name,
        provider: model.provider,
        path: model.path ?? undefined
      };
      onModelChange?.(selected as TModel);
    },
    [onModelChange]
  );

  const handleStartDownload = useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      startDownload(
        repoId,
        model.type ?? "",
        model.path ?? undefined,
        model.path ? undefined : (model.allow_patterns ?? undefined),
        model.path ? undefined : (model.ignore_patterns ?? undefined)
      );
    },
    [startDownload]
  );

  // Recommended models that can be downloaded, folded into the main list under
  // an "Available to download" section. Skip ones already selectable (present in
  // the provider list once on disk) and any non-downloadable cloud entries.
  const selectableIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of models ?? []) {
      set.add((m.id || "").toLowerCase());
    }
    return set;
  }, [models]);

  const downloadCandidates = useMemo<UnifiedModel[]>(() => {
    if (!hasDownloads) return [];
    const q = search.trim().toLowerCase();
    return recommendedModels
      .filter((m) => isHfModel(m) || m.type === "llama_model")
      .filter((m) => !selectableIds.has((m.repo_id || m.id || "").toLowerCase()))
      .filter((m) => {
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (m.repo_id?.toLowerCase().includes(q) ?? false) ||
          (m.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false)
        );
      });
  }, [hasDownloads, recommendedModels, selectableIds, search]);

  React.useEffect(() => {
    const requests = downloadCandidates
      .map(buildHfCacheRequest)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (requests.length === 0) return;
    void ensureStatuses(requests);
  }, [ensureStatuses, downloadCandidates, cacheVersion]);

  const downloadModels = useMemo<DownloadableModel[]>(() => {
    return downloadCandidates.map((m) => {
      const key = getHfCacheKey(m);
      const downloaded =
        m.downloaded === true ||
        m.type === "llama_model" ||
        !!cacheStatuses[key];
      const checking =
        canCheckHfCache(m) &&
        (cachePending[key] || cacheStatuses[key] === undefined);
      return { ...m, downloaded, checking };
    });
  }, [downloadCandidates, cacheStatuses, cachePending]);

  const handleDownloadAllFromPack = useCallback(
    (packModels: UnifiedModel[]) => {
      packModels.forEach((m) => handleStartDownload(m));
    },
    [handleStartDownload]
  );

  // Keyboard navigation: the search input forwards arrow/enter keys here so the
  // list can be driven without the mouse. activeIndex points into
  // filteredModelsAdvanced; navigation skips unavailable rows.
  const getAvailability = useModelAvailability();
  const [activeIndex, setActiveIndex] = useState(-1);

  const keyboardEnabled = true;

  const isRowAvailable = useCallback(
    (index: number) => getAvailability(filteredModelsAdvanced[index]).available,
    [filteredModelsAdvanced, getAvailability]
  );

  // Highlight the first available row whenever the visible list changes so that
  // Enter selects the top-ranked match right after typing.
  React.useEffect(() => {
    setActiveIndex(
      keyboardEnabled
        ? firstAvailableIndex(filteredModelsAdvanced.length, isRowAvailable)
        : -1
    );
  }, [filteredModelsAdvanced.length, keyboardEnabled, isRowAvailable]);

  const stepActiveIndex = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((current) =>
        nextAvailableIndex(
          filteredModelsAdvanced.length,
          current,
          dir,
          isRowAvailable
        )
      );
    },
    [filteredModelsAdvanced.length, isRowAvailable]
  );

  const handleArrowDown = useCallback(() => {
    if (keyboardEnabled) {
      stepActiveIndex(1);
    }
  }, [keyboardEnabled, stepActiveIndex]);

  const handleArrowUp = useCallback(() => {
    if (keyboardEnabled) {
      stepActiveIndex(-1);
    }
  }, [keyboardEnabled, stepActiveIndex]);

  const handleEnter = useCallback(() => {
    if (!keyboardEnabled) {
      return;
    }
    const model = filteredModelsAdvanced[activeIndex];
    if (model && getAvailability(model).available) {
      handleSelectModel(model);
    }
  }, [
    keyboardEnabled,
    filteredModelsAdvanced,
    activeIndex,
    getAvailability,
    handleSelectModel
  ]);

  const handleRefresh = useCallback(async () => {
    if (!refetch || isFetching) {
      return;
    }
    await refetch();
  }, [refetch, isFetching]);

  const handleSetFavoritesView = useCallback(() => {
    setCustomView("favorites");
    setSelectedProvider(null);
  }, [setSelectedProvider]);

  const handleSetRecentView = useCallback(() => {
    setCustomView("recent");
    setSelectedProvider(null);
  }, [setSelectedProvider]);

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
    const height = 480; // Height of the menu (popover paper)
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
      transitionDuration={0}
      slotProps={{
        paper: {
          elevation: 24,
          style: {
            width: "600px",
            height: "560px",
            maxHeight: "90vh",
            maxWidth: "100vw",
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.background.paper,
            border: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }
        }
      }}
    >
      <FlexRow
        gap={2}
        align="center"
        sx={{
          p: 1.5,
          pl: 2,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          flexShrink: 0,
          background: theme.vars.palette.background.paper
        }}
      >
        <FlexRow gap={2} align="center" sx={{ flex: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SearchInput
              onSearchChange={setSearch}
              placeholder={searchPlaceholder}
              debounceTime={150}
              focusSearchInput
              focusOnTyping
              onPressArrowDown={handleArrowDown}
              onPressArrowUp={handleArrowUp}
              onPressEnter={handleEnter}
              width="100%"
            />
          </Box>
          <ToolbarIconButton
            icon={<RefreshIcon fontSize="small" />}
            tooltip="Refresh models"
            onClick={handleRefresh}
            disabled={!refetch || !!isFetching}
            size="small"
            nodrag={false}
          />
          <ModelFiltersBar />
        </FlexRow>
      </FlexRow>

      <Collapse in={!!(isLoading || isFetching || (providerErrors && providerErrors.length > 0))}>
        <FlexRow
          gap={1}
          align="center"
          sx={{
            px: 2,
            py: 1,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            bgcolor: providerErrors && providerErrors.length > 0
              ? theme.vars.palette.warning.main + "15"
              : theme.vars.palette.action.hover,
            fontSize: "var(--fontSizeSmall)"
          }}
        >
          {(isLoading || isFetching) && (
            <>
              <LoadingSpinner size="small" />
              <Caption sx={{ color: "text.secondary" }}>
                {loadingProgress
                  ? `Loading models: ${loadingProgress.loaded}/${loadingProgress.total} providers...`
                  : "Loading models..."}
              </Caption>
            </>
          )}
          {providerErrors && providerErrors.length > 0 && !isLoading && (
            <Tooltip
              title={
                <Box sx={{ maxWidth: 300 }}>
                  <Caption sx={{ fontWeight: 600 }}>
                    Failed to load models from:
                  </Caption>
                  {providerErrors.map((pe) => (
                    <Caption key={pe.provider} component="div" sx={{ mt: 0.5 }}>
                      • {pe.provider}: {pe.error instanceof Error ? pe.error.message : "Unknown error"}
                    </Caption>
                  ))}
                </Box>
              }
            >
              <FlexRow gap={0.5} align="center" sx={{ cursor: "help" }}>
                <WarningAmberIcon sx={{ fontSize: 16, color: "warning.main" }} />
                <Caption sx={{ color: "warning.main" }}>
                  {providerErrors.length} provider{providerErrors.length > 1 ? "s" : ""} failed to load
                </Caption>
              </FlexRow>
            </Tooltip>
          )}
        </FlexRow>
      </Collapse>

      <FlexRow sx={{ flex: 1, overflow: "hidden" }}>
        <FlexColumn
          sx={{
            width: isIconOnly ? 88 : 200,
            flexShrink: 0,
            borderRight: `1px solid ${theme.vars.palette.divider}`,
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
              onClick={handleSetFavoritesView}
              sx={{
                py: isIconOnly ? 1 : 0.5,
                borderRadius: BORDER_RADIUS.xs,
                mx: 0,
                mb: 0.5,
                justifyContent: isIconOnly ? "center" : "flex-start",
                minHeight: isIconOnly ? 40 : "auto",
                px: isIconOnly ? 0 : 2
              }}
            >
              {isIconOnly ? (
                <Tooltip title="Favorites" placement="right">
                  <FlexRow
                    align="center"
                    justify="center"
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: BORDER_RADIUS.circle,
                      bgcolor:
                        customView === "favorites"
                          ? "primary.main"
                          : "action.selected",
                      border: `1px solid ${customView === "favorites" ? "transparent" : theme.vars.palette.divider}`
                    }}
                  >
                    <StarIcon
                      fontSize="small"
                      sx={{
                        fontSize: "var(--fontSizeBig)",
                        color:
                          customView === "favorites"
                            ? "primary.contrastText"
                            : "text.primary"
                      }}
                    />
                  </FlexRow>
                </Tooltip>
              ) : (
                <>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FlexRow
                      align="center"
                      justify="center"
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: BORDER_RADIUS.sm,
                        bgcolor: "rgba(0,0,0,0.04)"
                      }}
                    >
                      <StarIcon
                        fontSize="small"
                        sx={{
                          fontSize: "var(--fontSizeBig)",
                          color:
                            customView === "favorites"
                              ? "primary.main"
                              : "text.secondary"
                        }}
                      />
                    </FlexRow>
                  </ListItemIcon>
                  <ListItemText
                    primary="Favorites"
                    primaryTypographyProps={{
                      fontSize: "var(--fontSizeNormal)",
                      fontWeight: customView === "favorites" ? 600 : 400
                    }}
                  />
                </>
              )}
            </ListItemButton>
            <ListItemButton
              disableRipple
              selected={customView === "recent"}
              onClick={handleSetRecentView}
              sx={{
                py: isIconOnly ? 1 : 0.5,
                borderRadius: BORDER_RADIUS.xs,
                mx: 0,
                justifyContent: isIconOnly ? "center" : "flex-start",
                minHeight: isIconOnly ? 40 : "auto",
                px: isIconOnly ? 0 : 2
              }}
            >
              {isIconOnly ? (
                <Tooltip title="Recent" placement="right">
                  <FlexRow
                    align="center"
                    justify="center"
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: BORDER_RADIUS.circle,
                      bgcolor:
                        customView === "recent"
                          ? "primary.main"
                          : "action.selected",
                      border: `1px solid ${customView === "recent" ? "transparent" : theme.vars.palette.divider}`
                    }}
                  >
                    <HistoryIcon
                      fontSize="small"
                      sx={{
                        fontSize: "var(--fontSizeBig)",
                        color:
                          customView === "recent"
                            ? "primary.contrastText"
                            : "text.primary"
                      }}
                    />
                  </FlexRow>
                </Tooltip>
              ) : (
                <>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FlexRow
                      align="center"
                      justify="center"
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: BORDER_RADIUS.sm,
                        bgcolor: "rgba(0,0,0,0.04)"
                      }}
                    >
                      <HistoryIcon
                        fontSize="small"
                        sx={{
                          fontSize: "var(--fontSizeBig)",
                          color:
                            customView === "recent"
                              ? "primary.main"
                              : "text.secondary"
                        }}
                      />
                    </FlexRow>
                  </ListItemIcon>
                  <ListItemText
                    primary="Recent"
                    primaryTypographyProps={{
                      fontSize: "var(--fontSizeNormal)",
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
                fontSize: "var(--fontSizeSmall)",
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
        </FlexColumn>

        <FlexColumn
          sx={{
            flex: 1,
            minWidth: 0,
            bgcolor: "background.paper"
          }}
        >
          {modelPacks.length > 0 && (
            <Box
              sx={{
                px: 2,
                pt: 1.5,
                maxHeight: 180,
                overflowY: "auto",
                flexShrink: 0,
                borderBottom: `1px solid ${theme.vars.palette.divider}`
              }}
            >
              {modelPacks.map((pack) => (
                <ModelPackCard
                  key={pack.id}
                  pack={pack}
                  onDownloadAll={handleDownloadAllFromPack}
                />
              ))}
            </Box>
          )}
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            <ModelList<TModel>
              models={filteredModelsAdvanced}
              onSelect={handleSelectModel}
              searchTerm={search}
              hasDownloads={hasDownloads}
              activeIndex={activeIndex}
              downloadModels={downloadModels}
              onDownloadSelect={handleSelectRecommended}
              onDownloadStart={handleStartDownload}
              modelType={modelType}
            />
          </Box>
        </FlexColumn>
      </FlexRow>
    </Popover>
  );
}

export default ModelMenuDialogBase;
