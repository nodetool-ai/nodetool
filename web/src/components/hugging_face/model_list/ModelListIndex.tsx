/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef
} from "react";
import {
  FlexColumn,
  FlexRow,
  Box,
  EmptyState,
  LoadingSpinner,
  Text,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  Z_INDEX
} from "../../ui_primitives";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import DownloadIcon from "@mui/icons-material/Download";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useModels } from "./useModels";
import ModelListHeader from "./ModelListHeader";
import ModelTypeSidebar from "./ModelTypeSidebar";
import DeleteModelDialog from "./DeleteModelDialog";
import { useWorkers } from "../../../hooks/useWorkers";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { IconForType } from "../../../config/IconForType";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import ModelListItem from "./ModelListItem";
import ModelsRightSidebar from "./ModelsRightSidebar";
import ModelFilterBar from "./ModelFilterBar";
import ModelOnboarding from "../onboarding/ModelOnboarding";
import { useHardwareProfile } from "../onboarding/useHardwareProfile";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelCompatibility } from "./useModelCompatibility";
import { isElectron } from "../../../lib/env";
import { useHfCacheStatusStore } from "../../../stores/HfCacheStatusStore";
import { useShallow } from "zustand/react/shallow";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey
} from "../../../utils/hfCache";
import { isString } from "../../../utils/typePredicates";

/** Width of the category rail. */
const SIDEBAR_WIDTH = 260;
/** Initial row heights for the virtualizer; real heights come from measurement. */
const ESTIMATED_HEADER_HEIGHT = 48;
const ESTIMATED_ROW_HEIGHT = 152;

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative",
      background: "transparent",
      overflow: "hidden"
    },
    ".main": {
      display: "flex",
      flexDirection: "row",
      flexGrow: 1,
      overflow: "hidden",
      minHeight: 0
    },
    ".sidebar": {
      width: SIDEBAR_WIDTH,
      minWidth: SIDEBAR_WIDTH,
      flexShrink: 0,
      height: "100%",
      padding: getSpacingPx(SPACING.lg),
      overflowY: "auto",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.action.hover
    },
    // Scroll container for the virtualized rows; the padding keeps the last
    // card off the bottom edge.
    ".model-list": {
      paddingBottom: getSpacingPx(SPACING.xl)
    },
    ".model-list-header": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing(SPACING.md),
      padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)}`,
      width: "100%",
      background: theme.vars.palette.background.paper,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".content": {
      flexGrow: 1,
      height: "100%",
      overflow: "hidden",
      padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xl)} 0`,
      position: "relative",
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".right-sidebar": {
      flexShrink: 0,
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    // Phone width: the category rail plus the info rail leave the model list
    // nothing to occupy, and the header row overflows sideways. Stack the
    // rails, cap the category list, and drop the purely informational one.
    [theme.breakpoints.down("sm")]: {
      ".model-list-header": {
        flexWrap: "wrap",
        padding: getSpacingPx(SPACING.lg)
      },
      ".main": {
        flexDirection: "column"
      },
      ".sidebar": {
        width: "100%",
        minWidth: 0,
        height: "auto",
        maxHeight: "35vh",
        borderRight: "none",
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      },
      ".content": {
        height: "auto",
        flex: "1 1 auto",
        minHeight: 0,
        padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.lg)} 0`
      },
      ".right-sidebar": {
        display: "none"
      }
    }
  });

type ListItem =
  | { type: "header"; modelType: string }
  | { type: "model"; model: UnifiedModel };

const ModelListIndex: React.FC = () => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const {
    selectedModelType,
    setSelectedModelType,
    modelSearchTerm,
    setModelSearchTerm,
    scope,
    setScope,
    source,
    setSource,
    sourceInitialized,
    setSourceInitialized,
    setSelectedGoal,
    setSelectedFormat,
    setSelectedAvailability
  } = useModelManagerStore(
    useShallow((state) => ({
      selectedModelType: state.selectedModelType,
      setSelectedModelType: state.setSelectedModelType,
      modelSearchTerm: state.modelSearchTerm,
      setModelSearchTerm: state.setModelSearchTerm,
      scope: state.scope,
      setScope: state.setScope,
      source: state.source,
      setSource: state.setSource,
      sourceInitialized: state.sourceInitialized,
      setSourceInitialized: state.setSourceInitialized,
      setSelectedGoal: state.setSelectedGoal,
      setSelectedFormat: state.setSelectedFormat,
      setSelectedAvailability: state.setSelectedAvailability
    }))
  );
  const hardwareProfile = useHardwareProfile();
  const { activeWorker } = useWorkers();
  const workerName = activeWorker?.profile_name ?? activeWorker?.id ?? null;
  const { cacheStatuses, cachePending, cacheVersion, ensureStatuses } =
    useHfCacheStatusStore(
      useShallow((state) => ({
        cacheStatuses: state.statuses,
        cachePending: state.pending,
        cacheVersion: state.version,
        ensureStatuses: state.ensureStatuses
      }))
    );

  const {
    modelTypes,
    filteredModels,
    availabilityCounts,
    allModels,
    isLoading,
    isFetching,
    error,
    handleShowInExplorer
  } = useModels(scope);

  const startDownload = useModelDownloadStore((state) => state.startDownload);
  const openDialog = useModelDownloadStore((state) => state.openDialog);
  const { getModelCompatibility } = useModelCompatibility();

  const handleDeleteClick = useCallback((modelId: string) => {
    setModelToDelete(modelId);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setModelToDelete(null);
  }, []);

  const handleStartDownload = useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      const path = model.path ?? null;
      const allowPatterns = path ? null : (model.allow_patterns ?? null);
      const ignorePatterns = path ? null : (model.ignore_patterns ?? null);
      // Route to the attached worker whenever one is attached — that's where
      // the model is needed (execution runs there). The Local/Worker view
      // toggle only changes what you SEE, not where downloads land.
      const downloadScope = activeWorker ? "worker" : "local";
      startDownload(
        repoId,
        model.type ?? "",
        path ?? undefined,
        allowPatterns,
        ignorePatterns,
        downloadScope
      );
      openDialog();
    },
    [startDownload, openDialog, activeWorker]
  );

  const handleScopeChange = useCallback(
    (nextScope: typeof scope) => {
      if (nextScope === scope) {
        return;
      }
      // Filters and search are scope-specific; reset them so the new view
      // does not inherit stale cross-scope state.
      setScope(nextScope);
      setModelSearchTerm("");
      setSelectedModelType("All");
      setSelectedGoal(null);
      setSelectedFormat(null);
      setSelectedAvailability("all");
    },
    [
      scope,
      setScope,
      setModelSearchTerm,
      setSelectedModelType,
      setSelectedGoal,
      setSelectedFormat,
      setSelectedAvailability
    ]
  );

  const handleSourceChange = useCallback(
    (nextSource: typeof source) => {
      if (nextSource === source) {
        return;
      }
      // The installed and recommended catalogs are different datasets; reset the
      // view filters so the new one starts clean instead of inheriting stale
      // type/status selections.
      setSource(nextSource);
      // An explicit choice settles the source: don't auto-default afterwards.
      setSourceInitialized(true);
      setModelSearchTerm("");
      setSelectedModelType("All");
      setSelectedGoal(null);
      setSelectedFormat(null);
      setSelectedAvailability("all");
    },
    [
      source,
      setSource,
      setSourceInitialized,
      setModelSearchTerm,
      setSelectedModelType,
      setSelectedGoal,
      setSelectedFormat,
      setSelectedAvailability
    ]
  );

  const flattenedList = useMemo(() => {
    if (selectedModelType !== "All") {
      return filteredModels.map(
        (model): ListItem => ({ type: "model", model })
      );
    }

    const grouped = new Map<string, UnifiedModel[]>();
    for (const model of filteredModels) {
      const key = model.type ?? "";
      const list = grouped.get(key);
      if (list) {
        list.push(model);
      } else {
        grouped.set(key, [model]);
      }
    }

    const items: ListItem[] = [];
    for (const modelType of modelTypes.slice(1)) {
      const models = grouped.get(modelType);
      if (models && models.length > 0) {
        items.push({ type: "header", modelType });
        for (const model of models) {
          items.push({ type: "model", model });
        }
      }
    }
    return items;
  }, [selectedModelType, modelTypes, filteredModels]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flattenedList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      flattenedList[index]?.type === "header"
        ? ESTIMATED_HEADER_HEIGHT
        : ESTIMATED_ROW_HEIGHT,
    overscan: theme.virtualScroll.overscan.small,
    getItemKey: (index) => {
      const item = flattenedList[index];
      return item.type === "header"
        ? `header-${item.modelType}`
        : `model-${item.model.id}`;
    }
  });

  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualIndex = virtualItems[0]?.index ?? 0;
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  const visibleModels = useMemo(() => {
    if (lastVirtualIndex < firstVirtualIndex) {
      return [];
    }
    const models: UnifiedModel[] = [];
    for (let i = firstVirtualIndex; i <= lastVirtualIndex; i += 1) {
      const item = flattenedList[i];
      if (item?.type === "model") {
        models.push(item.model);
      }
    }
    return models;
  }, [flattenedList, firstVirtualIndex, lastVirtualIndex]);

  useEffect(() => {
    // The HF cache store scans the LOCAL filesystem; for the worker scope the
    // list already carries authoritative downloaded flags, so skip it.
    if (scope === "worker") {
      return;
    }
    const requests = visibleModels
      .map((model) => buildHfCacheRequest(model))
      .filter(
        (request): request is NonNullable<typeof request> => request !== null
      );

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, visibleModels, cacheVersion, scope]);

  // If the attached worker goes away (detach / instance gone) while the Worker
  // scope is active, fall back to Local. Otherwise the toggle is hidden and the
  // worker-scoped query keeps erroring with no in-session way back.
  useEffect(() => {
    if (scope === "worker" && workerName == null) {
      setScope("local");
    }
  }, [scope, workerName, setScope]);

  // First-run onboarding: when the local install is confirmed empty, open the
  // "Get Started" guide instead of a blank Installed list. One-shot per session
  // (sourceInitialized) so opening the still-empty Installed tab doesn't bounce
  // back. Only for the plain local view — a worker or a non-default source means
  // the user is already somewhere deliberate.
  useEffect(() => {
    if (
      !sourceInitialized &&
      source === "installed" &&
      scope === "local" &&
      workerName == null &&
      !isLoading &&
      !isFetching &&
      Array.isArray(allModels) &&
      allModels.length === 0
    ) {
      setSource("onboarding");
      setSourceInitialized(true);
    }
  }, [
    sourceInitialized,
    source,
    scope,
    workerName,
    isLoading,
    isFetching,
    allModels,
    setSource,
    setSourceInitialized
  ]);

  const emptyState = useMemo(() => {
    if (modelSearchTerm) {
      return {
        searchOff: true,
        title: `No models found for \u201C${modelSearchTerm}\u201D`,
        description: "Try a different search term or adjust your filters."
      };
    }
    if (source === "hub") {
      return {
        searchOff: false,
        title: "Search the HuggingFace Hub",
        description:
          "Type a name above, or pick a category, to browse and download any public model from huggingface.co."
      };
    }
    if (source === "recommended") {
      return {
        searchOff: false,
        title: "No recommended models",
        description:
          "Recommended models are gathered from the nodes you have installed. Add nodes that run models to see suggestions here."
      };
    }
    if (scope === "worker") {
      return {
        searchOff: false,
        title: "No models cached on this worker yet",
        description:
          "While this worker is attached, any model you download lands on its volume."
      };
    }
    return {
      searchOff: true,
      title: "No models available",
      description:
        "Try adjusting the size filter or selecting a different category."
    };
  }, [modelSearchTerm, source, scope]);

  if (isLoading) {
    return (
      <Box
        className="loading-container"
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center"
        }}
      >
        <LoadingSpinner size="medium" text="Loading models" />
      </Box>
    );
  }

  if (error) {
    // Extract error message - API returns {detail: "..."} or {detail: [{msg: "..."}]}
    interface ApiErrorShape {
      detail?: string | Array<{ msg: string }>;
      message?: string;
    }
    const err = error as ApiErrorShape;
    const errorMessage = isString(err?.detail)
      ? err.detail
      : (err?.detail as Array<{ msg: string }>)?.[0]?.msg ||
        err?.message ||
        "Unknown error";

    const isOllamaError = errorMessage.toLowerCase().includes("ollama");

    return (
      <FlexColumn
        gap={2}
        align="center"
        justify="center"
        fullHeight
        padding={4}
        sx={{ textAlign: "center" }}
      >
        <Text size="big" color="error">
          Could not load models
        </Text>
        <Text size="normal" color="secondary" sx={{ maxWidth: 600 }}>
          {errorMessage}
        </Text>
        {isOllamaError && (
          <FlexColumn gap={1} sx={{ mt: 1 }}>
            {isElectron ? (
              <Text size="small" color="warning">
                Ollama should be running automatically. Please try restarting
                the application.
              </Text>
            ) : (
              <Text
                size="small"
                component="a"
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ textDecoration: "underline" }}
                color="primary"
              >
                Download Ollama →
              </Text>
            )}
          </FlexColumn>
        )}
      </FlexColumn>
    );
  }

  return (
    <Box className="model-list-container" css={cssStyles}>
      <Box className="model-list-header">
        <ModelListHeader
          totalCount={allModels?.length || 0}
          filteredCount={filteredModels.length}
          scope={scope}
          onScopeChange={handleScopeChange}
          source={source}
          onSourceChange={handleSourceChange}
          workerName={workerName}
          workerSupported={workerName != null}
        />
      </Box>
      <Box className="main">
        {source === "onboarding" ? (
          <Box className="content">
            <ModelOnboarding onDownload={handleStartDownload} />
          </Box>
        ) : (
          <>
            <Box className="sidebar">
              <ModelTypeSidebar />
            </Box>

            <Box className="content">
              <ModelFilterBar
                source={source}
                availabilityCounts={availabilityCounts}
              />
              {isFetching && (
                <Box
                  sx={{
                    position: "absolute",
                    top: SPACING.xl,
                    right: SPACING.xl,
                    zIndex: Z_INDEX.raised
                  }}
                >
                  <LoadingSpinner size="small" />
                </Box>
              )}
              {(selectedModelType !== "All" || modelSearchTerm) && (
                <FlexRow
                  gap={SPACING.md}
                  align="center"
                  sx={{ pb: SPACING.md, mb: SPACING.md }}
                >
                  {selectedModelType !== "All" && (
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 32,
                        height: 32,
                        borderRadius: BORDER_RADIUS.md,
                        background:
                          "rgba(var(--palette-primary-main-channel) / 0.12)",
                        flexShrink: 0
                      }}
                    >
                      <IconForType
                        iconName={
                          selectedModelType.replace(/^hf\./, "") || "model"
                        }
                        containerStyle={{ display: "flex" }}
                        svgProps={{
                          style: {
                            width: 18,
                            height: 18,
                            color: theme.vars.palette.primary.main
                          }
                        }}
                        showTooltip={false}
                      />
                    </Box>
                  )}
                  <Text size="big" weight={600} sx={{ minWidth: 0 }}>
                    {selectedModelType !== "All"
                      ? prettifyModelType(selectedModelType)
                      : `Results for \u201C${modelSearchTerm}\u201D`}
                  </Text>
                </FlexRow>
              )}
              {flattenedList.length > 0 ? (
                <div
                  ref={scrollRef}
                  className="model-list"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    overflow: "auto"
                  }}
                >
                  <div
                    style={{
                      height: virtualizer.getTotalSize(),
                      width: "100%",
                      position: "relative"
                    }}
                  >
                    {virtualItems.map((vi) => {
                      const item = flattenedList[vi.index];
                      // No fixed height: rows are measured, so a card whose chips
                      // wrap to a second line is never clipped.
                      const itemStyle: React.CSSProperties = {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vi.start}px)`
                      };
                      if (item.type === "header") {
                        return (
                          <Box
                            key={vi.key}
                            data-index={vi.index}
                            ref={virtualizer.measureElement}
                            style={itemStyle}
                            sx={{ pt: SPACING.lg, pb: SPACING.md }}
                          >
                            <Text size="big" weight={600}>
                              {prettifyModelType(item.modelType)}
                            </Text>
                          </Box>
                        );
                      }
                      const compatibility = getModelCompatibility(item.model);
                      const cacheKey = getHfCacheKey(item.model);
                      const isCacheableHf = canCheckHfCache(item.model);
                      // Worker scope: the local cache store is irrelevant — trust
                      // the list's downloaded flag and never show a cache spinner.
                      const isCheckingCache =
                        scope !== "worker" &&
                        isCacheableHf &&
                        (cachePending[cacheKey] ||
                          cacheStatuses[cacheKey] === undefined);
                      const isDownloaded =
                        item.model.type === "llama_model" || scope === "worker"
                          ? !!item.model.downloaded
                          : cacheStatuses[cacheKey] !== undefined
                            ? !!cacheStatuses[cacheKey]
                            : !!item.model.downloaded;
                      const displayModel = {
                        ...item.model,
                        downloaded: isDownloaded
                      };
                      return (
                        <Box
                          key={vi.key}
                          data-index={vi.index}
                          ref={virtualizer.measureElement}
                          style={itemStyle}
                        >
                          <ModelListItem
                            model={displayModel}
                            handleModelDelete={
                              displayModel.downloaded
                                ? handleDeleteClick
                                : undefined
                            }
                            onDownload={
                              !displayModel.downloaded
                                ? () => handleStartDownload(item.model)
                                : undefined
                            }
                            handleShowInExplorer={
                              displayModel.downloaded
                                ? handleShowInExplorer
                                : undefined
                            }
                            showModelStats={true}
                            compatibility={compatibility}
                            isCheckingCache={isCheckingCache}
                            fitBudgetGb={hardwareProfile.budgetGb}
                          />
                        </Box>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <FlexColumn justify="center" sx={{ flex: 1, minHeight: 0 }}>
                  <EmptyState
                    icon={
                      emptyState.searchOff ? (
                        <SearchOffIcon className="empty-icon" />
                      ) : (
                        <DownloadIcon className="empty-icon" />
                      )
                    }
                    title={emptyState.title}
                    description={emptyState.description}
                  />
                </FlexColumn>
              )}

              <DeleteModelDialog
                modelId={modelToDelete}
                onClose={handleCancelDelete}
                scope={scope}
              />
            </Box>

            <Box className="right-sidebar">
              <ModelsRightSidebar
                models={allModels ?? []}
                hardwareProfile={hardwareProfile}
              />
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(ModelListIndex);
