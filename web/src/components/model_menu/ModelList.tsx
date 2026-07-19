/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useCallback, useEffect, useMemo, useRef, memo } from "react";

import {
  FlexRow,
  Tooltip,
  EmptyState,
  Box,
  Text,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  ListItemButton,
  ListItemText,
  ListItemIcon
} from "../ui_primitives";
import DownloadIcon from "@mui/icons-material/Download";
import FavoriteStar from "./FavoriteStar";
import DefaultModelPin from "./DefaultModelPin";
import RecommendedDownloadRow from "./shared/RecommendedDownloadRow";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import {
  isLocalProvider,
  isCloudProvider,
  isHuggingFaceInferenceProvider
} from "../../utils/providerDisplay";
import { ModelSelectorModel } from "../../stores/ModelMenuStore";
import type { UnifiedModel } from "../../stores/ApiTypes";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useModelAvailability } from "../../hooks/useModelAvailability";
import { useNavigate } from "react-router-dom";

import type { Theme } from "@mui/material/styles";

const ROW_HEIGHT = 50;
const DOWNLOAD_ROW_HEIGHT = 56;
const SECTION_HEADER_HEIGHT = 36;

export type DownloadableModel = UnifiedModel & {
  downloaded: boolean;
  checking: boolean;
};

type ListRow<TModel> =
  | { kind: "model"; model: TModel; modelIndex: number }
  | { kind: "downloadHeader" }
  | { kind: "download"; model: DownloadableModel };

const LIST_ITEM_BUTTON_SX = { width: "100%", textAlign: "left" } as const;
const LIST_ITEM_ICON_SX = { minWidth: 64, gap: 0.25 } as const;
const FLEX_ROW_SX = { overflow: "hidden", minWidth: 0 } as const;
const MODEL_NAME_STYLE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
  flex: "1 1 auto"
};
const BADGE_PRICE_STYLE: React.CSSProperties = { fontSize: "0.9em", opacity: 0.8 };
const PRIMARY_TYPOGRAPHY_PROPS = { component: "div" as const, noWrap: true };
const SECONDARY_TYPOGRAPHY_PROPS = { component: "div" as const };

const listStyles = (theme: Theme) =>
  css({
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: 600,
    "& .MuiListItemButton-root": { py: 0.5 },
    "& .MuiListItemText-primary": {
      fontSize: theme.vars.fontSizeNormal,
      color: theme.vars.palette.text.primary,
      fontWeight: 500
    },
    "& .MuiListItemText-secondary": {
      color: theme.vars.palette.text.secondary,
      fontSize: theme.vars.fontSizeSmall
    },
    "& .model-menu__model-item.is-unavailable": {
      opacity: 0.55,
      cursor: "not-allowed"
    },
    "& .model-menu__model-item.is-unavailable .MuiListItemText-primary": {
      color: theme.vars.palette.text.disabled
    },
    "& .model-menu__model-item.is-unavailable .MuiListItemText-secondary": {
      color: theme.vars.palette.text.disabled
    },
    "& .MuiListItemButton-root:hover .favorite-star": {
      opacity: 1
    },
    "& .MuiListItemButton-root:hover .default-pin": {
      opacity: 1
    },
    "& .model-menu__model-item.is-active": {
      background: theme.vars.palette.action.selected,
      boxShadow: `inset 3px 0 0 ${theme.vars.palette.primary.main}`
    }
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

    // Split the name by search term, creating a RegExp only when searchTerm changes
    const parts = name.split(new RegExp(`(${searchTerm})`, "gi"));
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
          <span key={`${name}-${i}-${part.text}`} style={{ color: primaryColor, fontWeight: 600 }}>
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

export interface ModelListProps<TModel extends ModelSelectorModel> {
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
  /**
   * Modality key (e.g. "language_model") this picker sets defaults for. When
   * provided, each row shows a "pin as default" toggle next to the favorite
   * star. Omitted for pickers with no per-modality default (e.g. raw HF).
   */
  modelType?: string;
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
  modelType
}: ModelListProps<TModel>) {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const getAvailability = useModelAvailability();
  const theme = useTheme();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings?tab=1");
  }, [navigate]);

  const badgeStyle = useMemo<React.CSSProperties>(() => ({
    flex: "0 0 auto",
    padding: `0 ${getSpacingPx(SPACING.sm)}`,
    fontSize: "var(--fontSizeSmaller)",
    lineHeight: 1.4,
    borderRadius: BORDER_RADIUS.xs,
    background: theme.vars.palette.action.hover,
    color: theme.vars.palette.text.secondary,
    letterSpacing: 0.2,
    border: "none"
  }), [theme.vars.palette.action.hover, theme.vars.palette.text.secondary]);

  const badgeWithIconStyle = useMemo<React.CSSProperties>(() => ({
    ...badgeStyle,
    display: "inline-flex",
    alignItems: "center",
    gap: 2
  }), [badgeStyle]);

  const secondaryTextStyle = useMemo<React.CSSProperties>(() => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: theme.vars.fontSizeSmaller,
    color: theme.vars.palette.text.secondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }), [theme.vars.fontSizeSmaller, theme.vars.palette.text.secondary]);

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

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = flatRows[index];
      if (row.kind === "downloadHeader") return SECTION_HEADER_HEIGHT;
      if (row.kind === "download") return DOWNLOAD_ROW_HEIGHT;
      return ROW_HEIGHT;
    },
    overscan: theme.virtualScroll.overscan.large,
    getItemKey: (index) => {
      const row = flatRows[index];
      if (row.kind === "downloadHeader") return "download-header";
      if (row.kind === "download") {
        return `download:${row.model.provider ?? ""}:${row.model.id}:${row.model.path ?? ""}`;
      }
      return `${row.model.provider}:${row.model.id}`;
    }
  });

  // Keep the keyboard-highlighted row scrolled into view.
  useEffect(() => {
    if (activeIndex >= 0 && activeIndex < models.length) {
      virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    }
  }, [activeIndex, models.length, virtualizer]);

  // Stable handler for model selection using data attributes
  const handleModelClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const index = Number(target.dataset.index);
    const available = target.dataset.available === "true";
    if (available && models[index]) {
      onSelect(models[index]);
    }
  }, [models, onSelect]);

  const renderRow = useCallback(
    ({
      m,
      index,
      style
    }: {
      m: TModel;
      index: number;
      style: React.CSSProperties;
    }) => {
      const fav = isFavorite(m.provider || "", m.id || "");
      const { available, providerEnabled, hasKey } = getAvailability(m);
      const isActive = index === activeIndex;
      const tooltipTitle =
        !providerEnabled && !hasKey
          ? "Enable provider and add API key in Settings to use this model"
          : !providerEnabled
            ? "Enable provider in the left sidebar to use this model"
            : !hasKey
              ? "Add API key in Settings to use this model"
              : "";
      return (
        <div role="listitem" style={style}>
          <Tooltip disableInteractive title={tooltipTitle}>
            <ListItemButton
              className={`model-menu__model-item ${available ? "" : "is-unavailable"
                } ${fav ? "is-favorite" : ""} ${isActive ? "is-active" : ""}`}
              aria-disabled={!available}
              aria-selected={isActive}
              data-index={index}
              data-available={available}
              onClick={handleModelClick}
              sx={LIST_ITEM_BUTTON_SX}
            >
              <ListItemIcon sx={LIST_ITEM_ICON_SX}>
                <FavoriteStar provider={m.provider} id={m.id} size="small" />
                <DefaultModelPin
                  modelType={modelType}
                  provider={m.provider}
                  id={m.id}
                  name={m.name}
                  size="small"
                />
              </ListItemIcon>
              <ListItemText
                primary={
                  <FlexRow
                    gap={1}
                    align="center"
                    justify="space-between"
                    fullWidth
                    sx={FLEX_ROW_SX}
                  >
                    <span
                      className="model-name"
                      style={MODEL_NAME_STYLE}
                    >
                      <HighlightedModelName
                        name={m.path || m.name}
                        searchTerm={searchTerm}
                        primaryColor={theme.vars.palette.primary.main}
                      />
                    </span>
                    {available && isLocalProvider(m.provider) && (
                      <Tooltip
                        title="Runs locally on your device"
                        placement="top"
                      >
                        <span
                          className="badge-local"
                          style={badgeStyle}
                        >
                          Local
                        </span>
                      </Tooltip>
                    )}
                    {available &&
                      isHuggingFaceInferenceProvider(m.provider) && (
                        <Tooltip
                          title="Hugging Face Inference API (Paid)"
                          placement="top"
                        >
                          <span
                            className="badge-hf-api"
                            style={badgeWithIconStyle}
                          >
                            HF API
                            <span style={BADGE_PRICE_STYLE}>
                              $
                            </span>
                          </span>
                        </Tooltip>
                      )}
                    {available &&
                      isCloudProvider(m.provider) &&
                      !isHuggingFaceInferenceProvider(m.provider) && (
                        <Tooltip
                          title="Paid API service (Remote)"
                          placement="top"
                        >
                          <span
                            className="badge-api"
                            style={badgeWithIconStyle}
                          >
                            API
                            <span style={BADGE_PRICE_STYLE}>
                              $
                            </span>
                          </span>
                        </Tooltip>
                      )}
                  </FlexRow>
                }
                secondary={
                  <span style={secondaryTextStyle}>
                    {m.path ? m.name : m.provider ? `Provider: ${m.provider}` : ""}
                  </span>
                }
                primaryTypographyProps={PRIMARY_TYPOGRAPHY_PROPS}
                secondaryTypographyProps={SECONDARY_TYPOGRAPHY_PROPS}
              />
            </ListItemButton>
          </Tooltip>
        </div>
      );
    },
    [
      isFavorite,
      getAvailability,
      activeIndex,
      handleModelClick,
      badgeStyle,
      badgeWithIconStyle,
      secondaryTextStyle,
      searchTerm,
      theme.vars.palette.primary.main,
      modelType
    ]
  );

  const renderFlatRow = useCallback(
    (rowIndex: number, style: React.CSSProperties) => {
      const row = flatRows[rowIndex];
      if (row.kind === "model") {
        return renderRow({ m: row.model, index: row.modelIndex, style });
      }
      if (row.kind === "downloadHeader") {
        return (
          <div style={style}>
            <FlexRow
              align="flex-end"
              sx={{
                px: 1.5,
                pt: 1.5,
                pb: 0.5,
                height: "100%"
              }}
            >
              <Text
                sx={{
                  fontSize: "var(--fontSizeSmall)",
                  fontWeight: 600,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: 0.5
                }}
              >
                Available to download
              </Text>
            </FlexRow>
          </div>
        );
      }
      return (
        <RecommendedDownloadRow
          model={row.model}
          downloaded={row.model.downloaded}
          checking={row.model.checking}
          onSelect={() => onDownloadSelect?.(row.model)}
          onDownload={() => onDownloadStart?.(row.model)}
          style={style}
        />
      );
    },
    [flatRows, renderRow, onDownloadSelect, onDownloadStart]
  );

  return (
    <Box sx={{ height: "100%", minHeight: 320, overflow: "hidden" }}>
      {flatRows.length === 0 ? (
        searchTerm.trim().length > 0 ? (
          <EmptyState
            variant="no-results"
            size="small"
            title="No models found"
            description={`No models match "${searchTerm}". Try a different term or enable more providers.`}
          />
        ) : hasDownloads ? (
          <EmptyState
            variant="empty"
            size="small"
            icon={<DownloadIcon className="empty-icon" />}
            title="No models yet — let's get started"
            description={
              <>
                Download a local model or add an API key for a cloud provider to get going.
                {" "}
                <Box
                  component="span"
                  sx={{
                    color: "primary.main",
                    cursor: "pointer",
                    textDecoration: "underline",
                    "&:hover": { opacity: 0.8 }
                  }}
                  onClick={handleOpenSettings}
                >
                  Open Settings
                </Box>
              </>
            }
            actionText="Open Settings"
            onAction={handleOpenSettings}
          />
        ) : (
          <EmptyState
            variant="empty"
            size="small"
            title="No models available"
            description={
              <>
                Enable a provider in the left sidebar or add an API key in{" "}
                <Box
                  component="span"
                  sx={{
                    color: "primary.main",
                    cursor: "pointer",
                    textDecoration: "underline",
                    "&:hover": { opacity: 0.8 }
                  }}
                  onClick={handleOpenSettings}
                >
                  Settings
                </Box>
                .
              </>
            }
            actionText="Open Settings"
            onAction={handleOpenSettings}
          />
        )
      ) : (
        <div
          ref={scrollRef}
          css={listStyles(theme)}
          className="model-menu__models-list"
          style={{
            height: "100%",
            width: "100%",
            minHeight: 320,
            overflow: "auto",
          }}
        >
          <div
            role="list"
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => (
              <React.Fragment key={vi.key}>
                {renderFlatRow(vi.index, {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </Box>
  );
}

export default ModelList;
