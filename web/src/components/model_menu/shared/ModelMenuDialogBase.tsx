import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo, useState } from "react";
import { isProduction } from "../../../lib/env";
import type { PopoverOrigin } from "@mui/material";
import { useMediaQuery } from "@mui/material";
import {
  Tooltip,
  Caption,
  LoadingSpinner,
  ToolbarIconButton,
  FlexRow,
  FlexColumn,
  Box,
  Collapse,
  Popover,
  Text,
  EditorButton,
  EmptyState,
  ListItemButton,
  SPACING,
  menuPaperStyles
} from "../../ui_primitives";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import { getProviderDisplayName } from "../../../utils/providerDisplay";
import { capabilityForModelType, useModelProviderSetup } from "../../../hooks/useModelProviderSetup";
import type { OnboardingCapability } from "../../../stores/ProviderOnboardingStore";
import AddIcon from "@mui/icons-material/Add";
import KeyIcon from "@mui/icons-material/VpnKey";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";

import StarIcon from "@mui/icons-material/StarBorder"; // Favorite
import HistoryIcon from "@mui/icons-material/History"; // Recent
import SearchInput from "../../search/SearchInput";
import ModelFiltersBar from "../ModelFiltersBar";
import ProviderList from "../ProviderList";
import ModelMenuNavItem from "./ModelMenuNavItem";
import ModelList from "../ModelList";
import type { DownloadableModel } from "../ModelList";
import { downloadMatchesProvider } from "./downloadMatchesProvider";
import ModelPackCard from "../../hugging_face/ModelPackCard";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { useHfCacheStatusStore } from "../../../stores/HfCacheStatusStore";
import { useWorkerCachedModelIds } from "../../../hooks/useWorkerCachedModels";
import { useModelDownloadTarget } from "../../../hooks/useModelDownloadTarget";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey,
  isHfModel
} from "../../../utils/hfCache";
import useModelFiltersStore from "../../../stores/ModelFiltersStore";
import {
  applyAdvancedModelFilters,
  modelDownloadTarget,
  ModelSelectorModel
} from "../../../utils/modelNormalization";
import {
  ModelMenuStoreHook,
  requiredSecretForProvider,
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
  setupCapability?: OnboardingCapability;
  setupProviderIds?: readonly string[];
  /** The model the control holds now. Its row is marked in the list. */
  selectedModel?: { id: string; provider?: string };
  /**
   * Show an "Add an API key" row above the list while no API provider has a
   * usable model, so the route to a key is not only the footer link.
   */
  promptForApiKey?: boolean;
}

const EMPTY_MODELS: never[] = [];

const POPOVER_WIDTH = 640;
const POPOVER_HEIGHT = 560;
const SIDEBAR_WIDTH = 176;

const modelKey = (model: ModelSelectorModel): string =>
  `${model.provider ?? ""}:${model.id ?? ""}`;

function ModelMenuDialogBase<TModel extends ModelSelectorModel>({
  open,
  onClose,
  anchorEl,
  modelData,
  onModelChange,
  title = "Select model",
  searchPlaceholder = "Search models",
  storeHook,
  recommendedModels = [],
  modelPacks = [],
  modelType,
  setupCapability,
  setupProviderIds,
  selectedModel,
  promptForApiKey = false
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

  const { openSetup } = useModelProviderSetup({
    open,
    onClose,
    capability: setupCapability ?? capabilityForModelType(modelType),
    providerIds: setupProviderIds ?? modelData.providers,
    isLoading: isLoading || isFetching
  });
  const isError = !!fetchedError;
  const theme = useTheme();
  // Below `sm` the 640x560 popover no longer fits, so the menu takes over the
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
  // Downloads land where execution happens: on the attached worker when one
  // is connected, otherwise this machine. The worker's cache is also the
  // authoritative "already downloaded" source while it is attached.
  const { scope: downloadScope, label: downloadTargetLabel } =
    useModelDownloadTarget();
  const workerCachedIds = useWorkerCachedModelIds();

  // A fresh `[]` fallback would re-key every memo in useModelMenuData.
  const {
    providers: providersFromModels,
    filteredModels,
    favoriteModels,
    recentModels
  } = useModelMenuData<TModel>(models ?? EMPTY_MODELS, storeHook);

  const providers = modelData.providers ?? providersFromModels;

  // Providers that list at least one model. A provider chip with no models
  // gets an empty state instead of a list, and a change in this set clears a
  // stale provider filter.
  const providersWithModels = useMemo(
    () => new Set((models ?? EMPTY_MODELS).map((m) => m.provider ?? "")),
    [models]
  );
  const providerSetKey = useMemo(
    () => [...providersWithModels].sort().join("|"),
    [providersWithModels]
  );

  const storedSizeBucket = useModelFiltersStore((s) => s.sizeBucket);
  // The cloud version hides the size filter, so a bucket persisted from a
  // local session must not silently filter its list.
  const sizeBucket = isProduction ? null : storedSizeBucket;

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
  }, [baseModels, sizeBucket]);

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
        model.path ? undefined : (model.ignore_patterns ?? undefined),
        downloadScope
      );
    },
    [startDownload, downloadScope]
  );

  // A listed model whose files are missing downloads them in place; the model
  // list refreshes when the download completes and the row turns selectable.
  const handleModelDownload = useCallback(
    (model: TModel) => {
      const target = modelDownloadTarget(model);
      if (!target) return;
      startDownload(
        target.repoId,
        target.modelType ?? model.type ?? "",
        target.path,
        target.allowPatterns,
        target.ignorePatterns,
        downloadScope
      );
    },
    [startDownload, downloadScope]
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

  // A provider filter or the Favorites and Recent views show only their own
  // models, so downloads from other providers stay out of them.
  const downloadCandidates = useMemo<UnifiedModel[]>(() => {
    if (!hasDownloads || customView !== null) return [];
    const q = search.trim().toLowerCase();
    return recommendedModels
      .filter((m) => isHfModel(m) || m.type === "llama_model")
      .filter(
        (m) =>
          selectedProvider === null ||
          downloadMatchesProvider(m, selectedProvider)
      )
      .filter(
        (m) =>
          !selectableIds.has((m.repo_id || m.id || "").toLowerCase()) &&
          !selectableIds.has(m.id.toLowerCase())
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
  }, [
    hasDownloads,
    customView,
    recommendedModels,
    selectableIds,
    search,
    selectedProvider
  ]);

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
      // With a worker attached, its cache is where the model is needed; a
      // repo cached there counts as downloaded even when this machine's
      // local cache check says otherwise.
      const inWorkerCache = workerCachedIds.has(key);
      const downloaded =
        m.downloaded === true ||
        m.type === "llama_model" ||
        !!cacheStatuses[key] ||
        inWorkerCache;
      const checking =
        !inWorkerCache &&
        canCheckHfCache(m) &&
        (cachePending[key] || cacheStatuses[key] === undefined);
      return { ...m, downloaded, checking };
    });
  }, [downloadCandidates, cacheStatuses, cachePending, workerCachedIds]);

  const handleDownloadAllFromPack = useCallback(
    (packModels: UnifiedModel[]) => {
      packModels.forEach((m) => handleStartDownload(m));
    },
    [handleStartDownload]
  );

  // Keyboard navigation: the search input forwards arrow/enter keys here so the
  // list can be driven without the mouse. The highlight is held by
  // `provider:id` so it survives the list re-sorting or refetching; with no
  // highlighted model (or one no longer listed) the first available row is
  // highlighted, so Enter selects the top-ranked match right after typing.
  const getAvailability = useModelAvailability();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const isRowAvailable = useCallback(
    (index: number) => getAvailability(filteredModelsAdvanced[index]).available,
    [filteredModelsAdvanced, getAvailability]
  );

  const activeIndex = useMemo(() => {
    if (activeKey !== null) {
      const index = filteredModelsAdvanced.findIndex(
        (model) => modelKey(model) === activeKey
      );
      if (index >= 0 && isRowAvailable(index)) {
        return index;
      }
    }
    return firstAvailableIndex(filteredModelsAdvanced.length, isRowAvailable);
  }, [activeKey, filteredModelsAdvanced, isRowAvailable]);

  const stepActiveIndex = useCallback(
    (dir: 1 | -1) => {
      const next = nextAvailableIndex(
        filteredModelsAdvanced.length,
        activeIndex,
        dir,
        isRowAvailable
      );
      const model = filteredModelsAdvanced[next];
      if (model) {
        setActiveKey(modelKey(model));
      }
    },
    [filteredModelsAdvanced, activeIndex, isRowAvailable]
  );

  // A new search term re-highlights the top match, and typing leaves the
  // Favorites or Recent view, which does not filter by the term.
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      setActiveKey(null);
      if (value.trim() !== "") {
        setCustomView(null);
      }
    },
    [setSearch]
  );

  const handleArrowDown = useCallback(() => {
    stepActiveIndex(1);
  }, [stepActiveIndex]);

  const handleArrowUp = useCallback(() => {
    stepActiveIndex(-1);
  }, [stepActiveIndex]);

  const handleEnter = useCallback(() => {
    const model = filteredModelsAdvanced[activeIndex];
    if (model && getAvailability(model).available) {
      handleSelectModel(model);
    }
  }, [filteredModelsAdvanced, activeIndex, getAvailability, handleSelectModel]);

  // Footer "Add providers" and the empty-state button share this path. A
  // provider with a known key name highlights that key in the dialog.
  const handleConnectProvider = useCallback(
    (provider: string | null) => {
      const secret = provider ? requiredSecretForProvider(provider) : null;
      onClose();
      openProviderOnboarding({
        capability: setupCapability ?? capabilityForModelType(modelType),
        highlightSecretKey: secret ?? undefined
      });
    },
    [onClose, setupCapability, modelType]
  );

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
    const height = POPOVER_HEIGHT;
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

  React.useEffect(() => {
    if (open) {
      setCustomView(null);
      setActiveKey(null);
    }
  }, [open]);

  // The provider filter is remembered between openings. Connecting a key
  // changes which providers have models, and a filter left on one provider
  // would hide the new one, so a changed provider set starts on All models.
  // A filter whose provider has no models is cleared as well.
  const lastProviderSetKey = React.useRef<string | null>(null);
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (isLoading || models === undefined) {
      return;
    }
    const justOpened = !wasOpen.current;
    wasOpen.current = true;
    const changed =
      lastProviderSetKey.current !== null &&
      lastProviderSetKey.current !== providerSetKey;
    lastProviderSetKey.current = providerSetKey;
    // Only the opening moment checks for an empty provider: clicking one while
    // the menu is open must keep showing its empty state.
    const emptyFilter =
      justOpened &&
      selectedProvider !== null &&
      !providersWithModels.has(selectedProvider);
    if (changed || emptyFilter) {
      setSelectedProvider(null);
    }
  }, [
    open,
    isLoading,
    models,
    providerSetKey,
    providersWithModels,
    selectedProvider,
    setSelectedProvider
  ]);

  React.useLayoutEffect(() => {
    if (open) {
      updatePosition();
      setSearch("");
      window.addEventListener("resize", updatePosition);
      return () => window.removeEventListener("resize", updatePosition);
    }
  }, [open, updatePosition, setSearch]);

  const railOrientation = isMobile ? "horizontal" : "vertical";
  // Runs before an entry's own click, so picking All models or a provider
  // leaves Favorites or Recent, and picking Favorites or Recent sets it again.
  const handleRailClickCapture = useCallback(() => {
    setCustomView(null);
  }, []);
  const quickViews = (
    <>
      <ModelMenuNavItem
        className="model-menu__quick-view model-menu__quick-view--favorites"
        orientation={railOrientation}
        label="Favorites"
        icon={<StarIcon />}
        selected={customView === "favorites"}
        onClick={handleSetFavoritesView}
        count={favoriteModels.length}
      />
      <ModelMenuNavItem
        className="model-menu__quick-view model-menu__quick-view--recent"
        orientation={railOrientation}
        label="Recent"
        icon={<HistoryIcon />}
        selected={customView === "recent"}
        onClick={handleSetRecentView}
        count={recentModels.length}
      />
    </>
  );

  const providerRail = (
    <ProviderList
      providers={providers}
      models={models ?? EMPTY_MODELS}
      isLoading={!!isLoading}
      isError={!!isError}
      storeHook={storeHook}
      forceUnselect={!!customView}
      orientation={railOrientation}
      quickViews={quickViews}
    />
  );

  const providerLabel = selectedProvider
    ? getProviderDisplayName(selectedProvider)
    : "";
  const showProviderEmpty =
    !isLoading &&
    !customView &&
    selectedProvider !== null &&
    !providersWithModels.has(selectedProvider);

  // Any ready API model means a key or sign-in is already connected.
  const hasApiModel = (models ?? EMPTY_MODELS).some(
    (m) => m.execution?.state === "ready" && m.execution.kind === "api"
  );
  const showAddKeyRow =
    promptForApiKey &&
    !hasApiModel &&
    !isLoading &&
    !isError &&
    models !== undefined;

  const modelPane = (
    <FlexColumn
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0
      }}
    >
      {modelPacks.length > 0 && (
        <Box
          sx={{
            px: SPACING.lg,
            pt: SPACING.md,
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
        {showProviderEmpty ? (
          <EmptyState
            variant="empty"
            size="small"
            title={`${providerLabel} has no models yet`}
            description={`Connect ${providerLabel} to see its models here.`}
            actionText={`Connect ${providerLabel}`}
            onAction={() => handleConnectProvider(selectedProvider)}
          />
        ) : (
        <ModelList<TModel>
          models={filteredModelsAdvanced}
          onSelect={handleSelectModel}
          searchTerm={search}
          hasDownloads={hasDownloads}
          activeIndex={activeIndex}
          downloadModels={downloadModels}
          onDownloadSelect={handleSelectRecommended}
          onDownloadStart={handleStartDownload}
          onModelDownload={handleModelDownload}
          modelType={modelType}
          downloadTargetLabel={downloadTargetLabel}
          onClose={onClose}
          selectedModel={selectedModel}
        />
        )}
      </Box>
    </FlexColumn>
  );

  // Mobile stacks a chip strip above the list; desktop keeps a sidebar. A
  // click in either leaves the Favorites or Recent view for the provider.
  const body = isMobile ? (
    <FlexColumn sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Box
        onClickCapture={handleRailClickCapture}
        sx={{
          flexShrink: 0,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        {providerRail}
      </Box>
      {modelPane}
    </FlexColumn>
  ) : (
    <FlexRow sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <FlexColumn
        onClickCapture={handleRailClickCapture}
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          minHeight: 0,
          borderRight: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        {providerRail}
      </FlexColumn>
      {modelPane}
    </FlexRow>
  );

  const hasProviderErrors = !!providerErrors && providerErrors.length > 0;

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
          // The picker is a menu with a search box: it shares the menu
          // surface, frame and shadow.
          sx: isMobile
            ? { borderRadius: 0, backgroundImage: "none" }
            : menuPaperStyles(theme),
          style: {
            width: isMobile ? "100vw" : `${POPOVER_WIDTH}px`,
            height: isMobile ? "100dvh" : `${POPOVER_HEIGHT}px`,
            maxHeight: isMobile ? "100dvh" : "90vh",
            maxWidth: "100vw",
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
          gap={SPACING.md}
          align="center"
          justify="space-between"
          sx={{
            px: SPACING.lg,
            py: SPACING.md,
            flexShrink: 0,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Text weight={500} truncate>
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
        gap={SPACING.xs}
        align="center"
        sx={{
          px: SPACING.lg,
          py: SPACING.md,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          flexShrink: 0
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, mr: SPACING.sm }}>
          <SearchInput
            onSearchChange={handleSearchChange}
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

      <Collapse in={!!(isLoading || isFetching || hasProviderErrors)}>
        <FlexRow
          gap={SPACING.md}
          align="center"
          sx={{
            px: SPACING.lg,
            py: SPACING.sm,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          {(isLoading || isFetching) && (
            <LoadingSpinner
              size="small"
              text={
                loadingProgress
                  ? `Loading models from ${loadingProgress.loaded} of ${loadingProgress.total} providers`
                  : "Loading models"
              }
            />
          )}
          {hasProviderErrors && !isLoading && (
            <Tooltip
              title={
                <FlexColumn gap={SPACING.xs}>
                  <Caption>Failed to load models from:</Caption>
                  {providerErrors.map((pe) => (
                    <Caption key={pe.provider} component="div">
                      {pe.provider}:{" "}
                      {pe.error instanceof Error
                        ? pe.error.message
                        : "Unknown error"}
                    </Caption>
                  ))}
                </FlexColumn>
              }
            >
              <FlexRow
                gap={SPACING.xs}
                align="center"
                tabIndex={0}
                sx={{ cursor: "help" }}
              >
                <WarningAmberIcon
                  fontSize="small"
                  sx={{ color: "warning.main" }}
                />
                <Caption sx={{ color: "warning.main" }}>
                  {providerErrors.length === 1
                    ? "1 provider failed to load"
                    : `${providerErrors.length} providers failed to load`}
                </Caption>
              </FlexRow>
            </Tooltip>
          )}
        </FlexRow>
      </Collapse>

      {showAddKeyRow && (
        <ListItemButton
          className="model-menu__add-key"
          onClick={() => handleConnectProvider(null)}
          sx={{
            flexShrink: 0,
            gap: SPACING.md,
            px: SPACING.lg,
            py: SPACING.sm,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <KeyIcon fontSize="small" sx={{ color: "primary.main" }} />
          <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
            <Text weight={500}>Add an API key</Text>
            <Caption sx={{ color: "text.secondary" }}>
              Use cloud models from OpenAI, Anthropic, Google and others.
            </Caption>
          </FlexColumn>
        </ListItemButton>
      )}

      {body}
      <FlexRow
        justify="space-between"
        align="center"
        sx={{
          px: SPACING.lg,
          py: SPACING.sm,
          flexShrink: 0,
          borderTop: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Caption sx={{ color: "text.secondary" }}>Missing a provider?</Caption>
        <EditorButton
          variant="text"
          size="small"
          startIcon={<AddIcon />}
          onClick={openSetup}
        >
          Add providers
        </EditorButton>
      </FlexRow>
    </Popover>
  );
}

export default ModelMenuDialogBase;
