/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo, memo } from "react";

import {
  FlexRow,
  Tooltip,
  EmptyState,
  Box,
  Caption,
  Chip,
  CONTROL,
  SectionHeader,
  TYPOGRAPHY,
  selectableRowStyles,
  selectedRowStyles,
  SPACING,
  ListItemButton,
  VirtualList
} from "../ui_primitives";
import DownloadIcon from "@mui/icons-material/Download";
import CheckIcon from "@mui/icons-material/Check";
import FavoriteStar from "./FavoriteStar";
import DefaultModelPin from "./DefaultModelPin";
import RecommendedDownloadRow from "./shared/RecommendedDownloadRow";
import ModelRowDownload from "./shared/ModelRowDownload";
import ModelRowInstall from "./shared/ModelRowInstall";
import type { LocalProviderInstallInfo } from "../../hooks/useLocalProviderInstalls";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { ModelSelectorModel } from "../../stores/ModelMenuStore";
import type { UnifiedModel } from "../../stores/ApiTypes";

import { useModelAvailability } from "../../hooks/useModelAvailability";
import { openSettingsTab } from "../workspace/openPageTab";
import {
  executionForDisplay,
  modelDownloadTargets,
  modelRowKey
} from "../../utils/modelNormalization";
import { getProviderDisplayName } from "../../utils/providerDisplay";

import type { Theme } from "@mui/material/styles";

// Rows are spaced 2px apart so neighbouring hover and selection fills do not
// touch.
const ROW_GAP = 2;
const ROW_HEIGHT = CONTROL.height.md + ROW_GAP;
const DOWNLOAD_ROW_HEIGHT = 48;
const SECTION_HEADER_HEIGHT = 36;
const FULL_HEIGHT_STYLE: React.CSSProperties = { height: "100%" };

export type DownloadableModel = UnifiedModel & {
  downloaded: boolean;
  checking: boolean;
};

type ListRow<TModel> =
  | { kind: "model"; model: TModel; modelIndex: number }
  | { kind: "downloadHeader" }
  | { kind: "download"; model: DownloadableModel };

const ROW_SX = {
  width: "100%",
  height: CONTROL.height.md,
  gap: SPACING.md,
  px: SPACING.md,
  py: 0
} as const;
const NAME_SX = {
  ...TYPOGRAPHY.sans.label,
  color: "text.primary",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
  flex: "0 1 auto"
} as const;
const DETAIL_SX = {
  color: "text.secondary",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
  flex: "1 1 0"
} as const;

const listStyles = (theme: Theme) =>
  css({
    "& .model-menu__model-item": selectableRowStyles(theme),
    "& .model-menu__model-item.is-unavailable": {
      cursor: "not-allowed"
    },
    "& .model-menu__model-item.is-unavailable .model-name, & .model-menu__model-item.is-unavailable .model-detail":
      {
        color: theme.vars.palette.text.disabled
      },
    // Mouse only: the star and pin are revealed on hover or keyboard focus.
    // iOS Safari reads a tap on a row whose content changes on hover as the
    // hover and drops the click, so on touch they stay visible and the row
    // selects on one tap.
    "@media (hover: hover)": {
      "& .model-menu__model-item:hover .favorite-star, & .model-menu__model-item.is-active .favorite-star":
        {
          opacity: 1
        },
      "& .model-menu__model-item:hover .default-pin, & .model-menu__model-item.is-active .default-pin":
        {
          opacity: 1
        }
    },
    "& .model-menu__model-item.is-current .model-name": {
      fontWeight: 600
    },
    "& .model-menu__model-item.is-active": selectedRowStyles(theme)
  });

/**
 * HighlightedModelName - Memoized component for highlighting search term in model name.
 * Uses useMemo to avoid creating RegExp on every render.
 */
const HighlightedModelName = memo<{
  name: string;
  searchTerm: string;
  primaryColor: string;
}>(({ name, searchTerm, primaryColor }) => {
  const highlightedName = useMemo(() => {
    if (!searchTerm || !name) {
      return { parts: [{ text: name, isMatch: false }] };
    }

    // Escape the term: typed text such as "gpt (" is not a valid pattern.
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = name.split(new RegExp(`(${escapedTerm})`, "gi"));
    return {
      parts: parts.map((part) => ({
        text: part,
        isMatch: part.toLowerCase() === searchTerm.toLowerCase()
      }))
    };
  }, [name, searchTerm]);

  return (
    <>
      {highlightedName.parts.map((part, i) =>
        part.isMatch ? (
          <span
            key={`${name}-${i}-${part.text}`}
            style={{ color: primaryColor, fontWeight: 600 }}
          >
            {part.text}
          </span>
        ) : (
          part.text
        )
      )}
    </>
  );
});

HighlightedModelName.displayName = "HighlightedModelName";

type ExecutionDisplay = ReturnType<typeof executionForDisplay>;

/** The chip colour of a model's execution state. */
const executionColor = (
  execution: ExecutionDisplay
): "info" | "success" | "warning" | "default" => {
  if (execution.state === "download_required") {
    return "warning";
  }
  if (execution.state !== "ready") {
    return "default";
  }
  return execution.kind === "api" ? "info" : "success";
};

interface ModelListProps<TModel extends ModelSelectorModel> {
  models: TModel[];
  onSelect: (m: TModel) => void;
  searchTerm?: string;
  /** Whether the dialog has recommended downloads available */
  hasDownloads?: boolean;
  /** Index of the keyboard-highlighted row (-1 when none). */
  activeIndex?: number;
  /**
   * Recommended models that can be downloaded, folded into the same list under
   * an "Available to download" section. Downloaded ones are selectable in place.
   */
  downloadModels?: DownloadableModel[];
  /** Select an already-downloaded recommended model. */
  onDownloadSelect?: (m: UnifiedModel) => void;
  /** Start downloading a recommended model. */
  onDownloadStart?: (m: UnifiedModel) => void;
  /** Download the files of a listed model that needs them before it runs. */
  onModelDownload?: (m: TModel) => void;
  /**
   * Modality key (e.g. "language_model") this picker sets defaults for. When
   * provided, each row shows a "pin as default" toggle next to the favorite
   * star. Omitted for pickers with no per-modality default (e.g. raw HF).
   */
  modelType?: string;
  /**
   * Human-readable download destination (worker name or "this computer"),
   * shown on the download section header and each download button.
   */
  downloadTargetLabel?: string;
  /** Close the picker. Called after Open Settings opens the Settings tab. */
  onClose?: () => void;
  /**
   * Local providers whose package is not installed, by provider id. Their
   * rows offer the install instead of a download.
   */
  pendingInstalls?: ReadonlyMap<string, LocalProviderInstallInfo>;
  /**
   * The model the control currently holds. Its row is marked with a check.
   * Without a provider, any provider's model of that id matches.
   */
  selectedModel?: { id: string; provider?: string };
}

function ModelList<TModel extends ModelSelectorModel>({
  models,
  onSelect,
  searchTerm = "",
  hasDownloads = false,
  activeIndex = -1,
  downloadModels = [],
  onDownloadSelect,
  onDownloadStart,
  onModelDownload,
  modelType,
  downloadTargetLabel,
  onClose,
  selectedModel,
  pendingInstalls
}: ModelListProps<TModel>) {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const getAvailability = useModelAvailability();
  const theme = useTheme();

  const handleOpenSettings = useCallback(() => {
    openSettingsTab("providers");
    onClose?.();
  }, [onClose]);

  // Flatten selectable models + recommended downloads into one virtualized
  // list. Model rows stay first and 1:1 with `models`, so a model's flat index
  // equals its array index — keyboard navigation (activeIndex) maps directly.
  const flatRows = useMemo<ListRow<TModel>[]>(() => {
    const rows: ListRow<TModel>[] = models.map((model, modelIndex) => ({
      kind: "model",
      model,
      modelIndex
    }));
    if (downloadModels.length > 0) {
      rows.push({ kind: "downloadHeader" });
      for (const model of downloadModels) {
        rows.push({ kind: "download", model });
      }
    }
    return rows;
  }, [models, downloadModels]);

  const estimateSize = useCallback(
    (index: number) => {
      const row = flatRows[index];
      if (row.kind === "downloadHeader") return SECTION_HEADER_HEIGHT;
      if (row.kind === "download") return DOWNLOAD_ROW_HEIGHT;
      return ROW_HEIGHT;
    },
    [flatRows]
  );

  const getItemKey = useCallback((row: ListRow<TModel>) => {
    if (row.kind === "downloadHeader") return "download-header";
    if (row.kind === "download") {
      return `download:${row.model.provider ?? ""}:${row.model.id}:${row.model.path ?? ""}`;
    }
    return `${row.model.provider}:${row.model.id}`;
  }, []);

  const getItemProps = useCallback(
    (row: ListRow<TModel>) =>
      row.kind === "model" ? { role: "listitem" } : {},
    []
  );

  // Keep the keyboard-highlighted row scrolled into view.
  const scrollToIndex =
    activeIndex >= 0 && activeIndex < models.length ? activeIndex : null;

  // Stable handler for model selection using data attributes
  const handleModelClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.currentTarget;
      const index = Number(target.dataset.index);
      const available = target.dataset.available === "true";
      if (available && models[index]) {
        onSelect(models[index]);
      }
    },
    [models, onSelect]
  );

  const renderRow = useCallback(
    ({ m, index }: { m: TModel; index: number }) => {
      const fav = isFavorite(m.provider || "", m.id || "");
      const pendingInstall = pendingInstalls?.get(m.provider ?? "");
      const availability = getAvailability(m);
      const { providerEnabled, hasKey } = availability;
      // A model whose provider package is missing cannot run yet.
      const available = availability.available && !pendingInstall;
      const execution = executionForDisplay(m);
      const downloadTargets =
        onModelDownload && !pendingInstall ? modelDownloadTargets(m) : [];
      const needsDownload = downloadTargets.length > 0;
      const isActive = index === activeIndex;
      const isCurrent =
        !!selectedModel &&
        m.id === selectedModel.id &&
        (!selectedModel.provider || m.provider === selectedModel.provider);
      const tooltipTitle = pendingInstall
        ? `Install ${pendingInstall.spec.installLabel} to use this model.`
        : needsDownload
        ? ""
        : execution.state !== "ready"
          ? (execution.reason ?? "This model is not ready to use.")
          : !providerEnabled && !hasKey
            ? "Enable provider and add API key in Settings to use this model"
            : !providerEnabled
              ? "Enable provider in the left sidebar to use this model"
              : !hasKey
                ? "Add API key in Settings to use this model"
                : "";
      // A file inside a repository shows the file, then the model it belongs
      // to. Any other model shows its name, then its provider.
      const detail = m.path ? m.name : getProviderDisplayName(m.provider);
      return (
        <Tooltip disableInteractive title={tooltipTitle}>
          <ListItemButton
            disableRipple
            className={`model-menu__model-item ${
              available ? "" : "is-unavailable"
            } ${fav ? "is-favorite" : ""} ${isActive ? "is-active" : ""} ${
              isCurrent ? "is-current" : ""
            }`}
            aria-current={isCurrent ? "true" : undefined}
            aria-disabled={!available}
            aria-selected={isActive}
            data-index={index}
            data-available={available}
            onClick={handleModelClick}
            sx={ROW_SX}
          >
            <FlexRow
              gap={SPACING.md}
              align="baseline"
              sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}
            >
              {isCurrent && (
                <CheckIcon
                  className="model-current-check"
                  titleAccess="Current model"
                  fontSize="small"
                  sx={{
                    color: "primary.main",
                    flexShrink: 0,
                    alignSelf: "center"
                  }}
                />
              )}
              <Box component="span" className="model-name" sx={NAME_SX}>
                <HighlightedModelName
                  name={m.path || m.name}
                  searchTerm={searchTerm}
                  primaryColor={theme.vars.palette.primary.main}
                />
              </Box>
              {detail && (
                <Caption className="model-detail" sx={DETAIL_SX}>
                  {detail}
                </Caption>
              )}
            </FlexRow>
            <FlexRow gap={0} align="center" sx={{ flexShrink: 0 }}>
              <FavoriteStar provider={m.provider} id={m.id} size="small" />
              <DefaultModelPin
                modelType={modelType}
                provider={m.provider}
                id={m.id}
                name={m.name}
                supportedTasks={
                  "supported_tasks" in m && Array.isArray(m.supported_tasks)
                    ? m.supported_tasks
                    : undefined
                }
                size="small"
              />
            </FlexRow>
            {pendingInstall ? (
              <ModelRowInstall info={pendingInstall} />
            ) : needsDownload ? (
              <ModelRowDownload
                targets={downloadTargets}
                modelKey={modelRowKey(m)}
                onDownload={() => onModelDownload?.(m)}
                targetLabel={downloadTargetLabel}
              />
            ) : (
              <Tooltip
                title={execution.reason ?? execution.label}
                placement="top"
              >
                <Chip
                  className={`badge-execution badge-${execution.kind}`}
                  label={execution.label}
                  compact
                  color={executionColor(execution)}
                  tabIndex={0}
                  aria-label={`${execution.label}: ${execution.reason ?? execution.label}`}
                  sx={{ flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </ListItemButton>
        </Tooltip>
      );
    },
    [
      isFavorite,
      getAvailability,
      activeIndex,
      handleModelClick,
      searchTerm,
      theme.vars.palette.primary.main,
      modelType,
      onModelDownload,
      downloadTargetLabel,
      selectedModel,
      pendingInstalls
    ]
  );

  const renderFlatRow = useCallback(
    (row: ListRow<TModel>) => {
      if (row.kind === "model") {
        return renderRow({ m: row.model, index: row.modelIndex });
      }
      if (row.kind === "downloadHeader") {
        return (
          <SectionHeader
            title="Available to download"
            size="small"
            action={
              downloadTargetLabel && (
                <Tooltip
                  title={`Downloads land on ${downloadTargetLabel}, where models run in this session`}
                >
                  <Caption sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                    To {downloadTargetLabel}
                  </Caption>
                </Tooltip>
              )
            }
            sx={{ px: SPACING.md, height: "100%", alignItems: "flex-end" }}
          />
        );
      }
      return (
        <RecommendedDownloadRow
          model={row.model}
          downloaded={row.model.downloaded}
          checking={row.model.checking}
          onSelect={() => onDownloadSelect?.(row.model)}
          onDownload={() => onDownloadStart?.(row.model)}
          targetLabel={downloadTargetLabel}
          style={FULL_HEIGHT_STYLE}
        />
      );
    },
    [renderRow, onDownloadSelect, onDownloadStart, downloadTargetLabel]
  );

  return (
    <Box sx={{ height: "100%", minHeight: 320, overflow: "hidden" }}>
      {flatRows.length === 0 ? (
        searchTerm.trim().length > 0 ? (
          <EmptyState
            variant="no-results"
            size="small"
            title="No models found"
            description={`No models match "${searchTerm}". Try another term or enable more providers.`}
          />
        ) : hasDownloads ? (
          <EmptyState
            variant="empty"
            size="small"
            icon={<DownloadIcon className="empty-icon" />}
            title="No models yet"
            description="Download a local model or add an API key for a cloud provider."
            actionText="Open settings"
            onAction={handleOpenSettings}
          />
        ) : (
          <EmptyState
            variant="empty"
            size="small"
            title="No models available"
            description="Enable a provider in the sidebar or add an API key in settings."
            actionText="Open settings"
            onAction={handleOpenSettings}
          />
        )
      ) : (
        <VirtualList
          css={listStyles(theme)}
          className="model-menu__models-list"
          direction="both"
          sx={{
            height: "100%",
            width: "100%",
            minHeight: 320,
            px: SPACING.sm,
            py: SPACING.xs
          }}
          items={flatRows}
          estimateSize={estimateSize}
          overscan={theme.virtualScroll.overscan.large}
          getItemKey={getItemKey}
          getItemProps={getItemProps}
          scrollToIndex={scrollToIndex}
          ariaLabel="Models"
          renderItem={renderFlatRow}
        />
      )}
    </Box>
  );
}

export default ModelList;
