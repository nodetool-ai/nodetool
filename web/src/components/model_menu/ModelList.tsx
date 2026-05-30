/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useCallback, useMemo, useRef, memo } from "react";
import {
  ListItemButton,
  ListItemText,
  ListItemIcon
} from "@mui/material";
import { FlexRow, Tooltip, EmptyState, Box } from "../ui_primitives";
import DownloadIcon from "@mui/icons-material/Download";
import FavoriteStar from "./FavoriteStar";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import {
  isLocalProvider,
  isCloudProvider,
  isHuggingFaceInferenceProvider
} from "../../utils/providerDisplay";
import {
  requiredSecretForProvider,
  ModelSelectorModel
} from "../../stores/ModelMenuStore";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useSecrets } from "../../hooks/useSecrets";
import { useNavigate } from "react-router-dom";

import type { Theme } from "@mui/material/styles";

const ROW_HEIGHT = 50;

const LIST_ITEM_BUTTON_SX = { width: "100%", textAlign: "left" } as const;
const LIST_ITEM_ICON_SX = { minWidth: 30 } as const;
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
  /** Called when the user clicks the "Browse Downloads" CTA in the empty state */
  onGoToDownloads?: () => void;
  /** Whether the dialog has recommended downloads available */
  hasDownloads?: boolean;
}

function ModelList<TModel extends ModelSelectorModel>({
  models,
  onSelect,
  searchTerm = "",
  onGoToDownloads,
  hasDownloads = false
}: ModelListProps<TModel>) {
  const isFavorite = useModelPreferencesStore((s) => s.isFavorite);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const { isApiKeySet } = useSecrets();
  const theme = useTheme();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings?tab=1");
  }, [navigate]);

  const badgeStyle = useMemo<React.CSSProperties>(() => ({
    flex: "0 0 auto",
    padding: "0px 6px",
    fontSize: "11px",
    lineHeight: 1.4,
    borderRadius: 4,
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
    fontSize: theme.vars.fontSizeTiny,
    color: theme.vars.palette.text.secondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }), [theme.vars.fontSizeTiny, theme.vars.palette.text.secondary]);

  const virtualizer = useVirtualizer({
    count: models.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: theme.virtualScroll.overscan.large,
    getItemKey: (index) => `${models[index].provider}:${models[index].id}`,
  });

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
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const m = models[index];
      const fav = isFavorite(m.provider || "", m.id || "");
      const env = requiredSecretForProvider(m.provider);
      const normKey = /gemini|google/i.test(m.provider || "")
        ? "gemini"
        : m.provider || "";
      const providerEnabled = enabledProviders?.[normKey] !== false;
      const hasKey = env ? isApiKeySet(env) : true;
      const available = providerEnabled && hasKey;
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
                } ${fav ? "is-favorite" : ""}`}
              aria-disabled={!available}
              data-index={index}
              data-available={available}
              onClick={handleModelClick}
              sx={LIST_ITEM_BUTTON_SX}
            >
              <ListItemIcon sx={LIST_ITEM_ICON_SX}>
                <FavoriteStar provider={m.provider} id={m.id} size="small" />
              </ListItemIcon>
              <ListItemText
                primary={
                  <FlexRow
                    gap={0.75}
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
      models,
      isFavorite,
      enabledProviders,
      isApiKeySet,
      handleModelClick,
      badgeStyle,
      badgeWithIconStyle,
      secondaryTextStyle,
      searchTerm,
      theme.vars.palette.primary.main
    ]
  );

  return (
    <Box sx={{ height: "100%", minHeight: 320, overflow: "hidden" }}>
      {models.length === 0 ? (
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
            actionText="Browse Recommended Downloads"
            onAction={onGoToDownloads}
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
            {virtualizer.getVirtualItems().map((vi) =>
              renderRow({
                index: vi.index,
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                },
              })
            )}
          </div>
        </div>
      )}
    </Box>
  );
}

export default ModelList;
