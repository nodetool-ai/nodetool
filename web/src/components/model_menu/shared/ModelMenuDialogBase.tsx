import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo, useState } from "react";
import { isProduction } from "../../../lib/env";
import type { PopoverOrigin } from "@mui/material";
import { useMediaQuery } from "@mui/material";
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
  List,
  ListItemButton,
  Popover,
  Text
} from "../../ui_primitives";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";

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

interface ModelMenuBaseProps<TModel extends ModelSelectorModel> {
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
    /** Re-runs the model query; the menu never reads the result. */
    refetch?: () => void;
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

interface QuickViewButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  horizontal: boolean;
  onClick: () => void;
}

/** Favorites / Recent entry in the model menu's provider rail. */
const QuickViewButton: React.FC<QuickViewButtonProps> = ({
  icon,
  label,
  active,
  horizontal,
  onClick
}) => (
  <ListItemButton
    disableRipple
    selected={active}
    onClick={onClick}
    sx={{
      py: 1,
      px: 0,
      borderRadius: BORDER_RADIUS.xs,
      justifyContent: "center",
      minHeight: 40,
      minWidth: horizontal ? 76 : undefined
    }}
  >
    <Tooltip title={label} placement={horizontal ? "bottom" : "right"}>
      <FlexColumn align="center" gap={0.5}>
        <FlexRow
          align="center"
          justify="center"
          sx={{
            width: 36,
            height: 36,
            borderRadius: BORDER_RADIUS.circle,
            bgcolor: active ? "primary.main" : "action.selected",
            border: (t) =>
              `1px solid ${active ? "transparent" : t.vars.palette.divider}`,
            color: active ? "primary.contrastText" : "text.primary"
          }}
        >
          {icon}
        </FlexRow>
        {horizontal && (
          <Caption
            sx={{
              maxWidth: 76,
              textAlign: "center",
              lineHeight: 1.15,
              fontSize: "var(--fontSizeSmaller)"
            }}
          >
            {label}
          </Caption>
        )}
      </FlexColumn>
    </Tooltip>
  </ListItemButton>
);

const EMPTY_MODELS: never[] = [];

function ModelMenuDialogBase<TModel extends ModelSelectorModel>({
  open,
  onClose,
  anchorEl,
  modelData,
  onModelChange,
  title = "Select Model",
  searchPlaceholder = "Search models...",
  storeHook,
  recommendedModels = [],
  modelPacks = [],
  modelType
}: ModelMenuBaseProps<TModel>) {
  const {
    models,
    isLoading,
    isFetching,
    error: fetchedError,
    providerErrors,
    loadingProgress,
    refetch
  } = modelData;

  const isError = !!fetchedError;
  const theme = useTheme();
  // Below `sm` the 600x560 popover no longer fits, so the menu takes over the
  // whole viewport and the provider rail becomes a horizontal strip.
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const setSearch = storeHook((s) => s.setSearch);
  const search = storeHook((s) => s.search);
  const selectedProvider = storeHook((s) => s.selectedProvider);
  const setSelectedProvider = storeHook((s) => s.setSelectedProvider);

  const [customView, setCustomView] = useState<"favorites" | "recent" | null>(
    null
  );
  const hasDownloads =
    !isProduction && (recommendedModels.length > 0 || modelPacks.length > 0);

  const startDownload = useModelDownloadStore((s) => s.startDownload);
  const cacheStatuses = useHfCacheStatusStore((s) => s.statuses);
  const cachePending = useHfCacheStatusStore((s) => s.pending);
  const cacheVersion = useHfCacheStatusStore((s) => s.version);
  const ensureStatuses = useHfCacheStatusStore((s) => s.ensureStatuses);

  // A fresh `[]` fallback would re-key every memo in useModelMenuData.
  const {
    providers: providersFromModels,
    filteredModels,
    favoriteModels,
    recentModels
  } = useModelMenuData<TModel>(models ?? EMPTY_MODELS, storeHook);

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

  const filteredModelsAdvanced = useMemo(() => {
    const filtered = applyAdvancedModelFilters<TModel>(baseModels, {
      selectedTypes,
      sizeBucket,
      families: []
    });
    return [...filtered].sort((left, right) => {
      const rank = (model: TModel) =>
        model.execution?.state === "unavailable"
          ? 2
          : model.execution?.state === "download_required"
            ? 1
            : 0;
      return rank(left) - rank(right);
    });
  }, [baseModels, selectedTypes, sizeBucket]);

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
      .filter(
        (m) => !selectableIds.has((m.repo_id || m.id || "").toLowerCase())
      )
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

  const quickViews = (
    <List
      dense
      className="model-menu__quick-views"
      sx={{
        py: isMobile ? 0 : 1,
        px: 0.5,
        // Keep the icons aligned with the provider icons when the provider
        // list shows a scrollbar.
        pr: isMobile ? 0.5 : 1.5,
        width: isMobile ? "auto" : "100%",
        display: "flex",
        flexDirection: isMobile ? "row" : "column",
        gap: 0.5,
        flexShrink: 0
      }}
    >
      <QuickViewButton
        icon={
          <StarIcon
            fontSize="small"
            sx={{ fontSize: "var(--fontSizeBig)", color: "inherit" }}
          />
        }
        label="Favorites"
        active={customView === "favorites"}
        horizontal={isMobile}
        onClick={handleSetFavoritesView}
      />
      <QuickViewButton
        icon={
          <HistoryIcon
            fontSize="small"
            sx={{ fontSize: "var(--fontSizeBig)", color: "inherit" }}
          />
        }
        label="Recent"
        active={customView === "recent"}
        horizontal={isMobile}
        onClick={handleSetRecentView}
      />
    </List>
  );

  const providerRail = (
    <Box
      sx={
        isMobile
          ? { flex: 1, minWidth: 0, overflow: "hidden" }
          : { flex: 1, overflow: "hidden", width: "100%" }
      }
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
        iconOnly
        orientation={isMobile ? "horizontal" : "vertical"}
      />
    </Box>
  );

  const modelPane = (
    <FlexColumn
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
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
      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
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
  );

  // Mobile stacks the rail above the list; desktop keeps it as a left sidebar.
  const body = isMobile ? (
    <FlexColumn sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <FlexRow
        align="stretch"
        sx={{
          flexShrink: 0,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          bgcolor: theme.vars.palette.background.default
        }}
      >
        {quickViews}
        <Divider orientation="vertical" flexItem sx={{ my: 1, opacity: 0.6 }} />
        {providerRail}
      </FlexRow>
      {modelPane}
    </FlexColumn>
  ) : (
    <FlexRow sx={{ flex: 1, overflow: "hidden" }}>
      <FlexColumn
        sx={{
          width: 88,
          flexShrink: 0,
          borderRight: `1px solid ${theme.vars.palette.divider}`,
          bgcolor: theme.vars.palette.background.default,
          alignItems: "center"
        }}
      >
        {quickViews}
        <Divider sx={{ mx: 2, mb: 1, opacity: 0.6 }} />
        {providerRail}
      </FlexColumn>
      {modelPane}
    </FlexRow>
  );

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      // Full-screen on mobile: detach from the anchor so the paper fills the
      // modal root instead of being positioned next to the trigger.
      anchorReference={isMobile ? "none" : "anchorEl"}
      marginThreshold={isMobile ? 0 : undefined}
      onClose={onClose}
      anchorOrigin={positionConfig.anchorOrigin}
      transformOrigin={positionConfig.transformOrigin}
      transitionDuration={0}
      slotProps={{
        paper: {
          elevation: 24,
          style: {
            width: isMobile ? "100vw" : "600px",
            height: isMobile ? "100dvh" : "560px",
            maxHeight: isMobile ? "100dvh" : "90vh",
            maxWidth: "100vw",
            borderRadius: isMobile ? 0 : theme.vars.rounded.dialog,
            background: theme.vars.palette.background.paper,
            border: isMobile
              ? "none"
              : `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            paddingTop: isMobile ? "env(safe-area-inset-top, 0px)" : undefined,
            paddingBottom: isMobile
              ? "env(safe-area-inset-bottom, 0px)"
              : undefined
          }
        }
      }}
    >
      {isMobile && (
        <FlexRow
          gap={1}
          align="center"
          justify="space-between"
          sx={{
            px: 2,
            py: 1.5,
            flexShrink: 0,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Text weight={600} truncate>
            {title}
          </Text>
          <ToolbarIconButton
            icon={<CloseIcon fontSize="small" />}
            tooltip="Close"
            onClick={onClose}
            size="small"
            nodrag={false}
          />
        </FlexRow>
      )}

      <FlexRow
        gap={isMobile ? 1 : 2}
        align="center"
        sx={{
          p: 1.5,
          pl: 2,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          flexShrink: 0,
          background: theme.vars.palette.background.paper
        }}
      >
        <FlexRow gap={isMobile ? 1 : 2} align="center" sx={{ flex: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SearchInput
              onSearchChange={setSearch}
              placeholder={searchPlaceholder}
              debounceTime={150}
              // Autofocusing on mobile raises the keyboard over the list.
              focusSearchInput={!isMobile}
              focusOnTyping={!isMobile}
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

      <Collapse
        in={
          !!(
            isLoading ||
            isFetching ||
            (providerErrors && providerErrors.length > 0)
          )
        }
      >
        <FlexRow
          gap={1}
          align="center"
          sx={{
            px: 2,
            py: 1,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            bgcolor:
              providerErrors && providerErrors.length > 0
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
                      • {pe.provider}:{" "}
                      {pe.error instanceof Error
                        ? pe.error.message
                        : "Unknown error"}
                    </Caption>
                  ))}
                </Box>
              }
            >
              <FlexRow gap={0.5} align="center" sx={{ cursor: "help" }}>
                <WarningAmberIcon
                  sx={{ fontSize: 16, color: "warning.main" }}
                />
                <Caption sx={{ color: "warning.main" }}>
                  {providerErrors.length} provider
                  {providerErrors.length > 1 ? "s" : ""} failed to load
                </Caption>
              </FlexRow>
            </Tooltip>
          )}
        </FlexRow>
      </Collapse>

      {body}
    </Popover>
  );
}

export default ModelMenuDialogBase;
