/** @jsxImportSource @emotion/react */
/**
 * SourceViewerPanel — the source monitor: the asset selected in the explorer,
 * an in and out point on it, and Append / Insert / Overwrite into the
 * sequence at the playhead. Three-point editing, the Premiere source monitor
 * and the Final Cut browser range in one panel.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import KeyboardTabOutlinedIcon from "@mui/icons-material/KeyboardTabOutlined";
import FlipToFrontOutlinedIcon from "@mui/icons-material/FlipToFrontOutlined";

import {
  useAssetsSelectedAsset,
  useLibrarySelectedAsset
} from "../../stores/AssetGridStore";
import { usePanelStore } from "../../stores/PanelStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore, useTimelineUIStoreApi } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import {
  AudioPlayback,
  Button,
  Caption,
  FlexColumn,
  FlexRow,
  FONT_WEIGHT,
  ResponsiveImage,
  ShortcutHint,
  SPACING,
  Text,
  Tooltip,
  TruncatedText,
  VideoPlayer,
  getSpacingPx
} from "../ui_primitives";
import { InspectorPillInput, InspectorRow } from "./Inspector/InspectorPrimitives";
import { parseSeconds } from "./Inspector/InspectorPrimitives.helpers";
import { assetMediaType } from "./dnd/assetToClipAdapter";
import { performSourceEdit, sourceRangeFor, type SourceEditKind } from "./sourceEdit";
import { TIMELINE_KEYMAPS, bindingKeys } from "./timelineKeymap";
import { useSettingsStore } from "../../stores/SettingsStore";

const panelStyles = (theme: Theme) =>
  css({
    padding: getSpacingPx(SPACING.md),
    overflowY: "auto",
    color: theme.vars.palette.text.primary
  });

const mediaBoxStyles = (theme: Theme) =>
  css({
    background: theme.vars.palette.c_scrim,
    borderRadius: theme.shape.borderRadius,
    overflow: "hidden",
    "& video": { width: "100%", display: "block" }
  });

const formatSeconds = (ms: number): string => (ms / 1000).toFixed(2);

export const SourceViewerPanel: React.FC = memo(() => {
  const { t } = useTranslation();
  const theme = useTheme();
  const activeExplorer = usePanelStore((s) =>
    s.panel.activeView === "library" || s.panel.activeView === "assets"
      ? s.panel.activeView
      : null
  );
  const assetsAsset = useAssetsSelectedAsset();
  const libraryAsset = useLibrarySelectedAsset();
  const asset = activeExplorer === "library" ? libraryAsset : activeExplorer === "assets" ? assetsAsset : null;
  const assetId = asset?.id;
  const sourceRange = useTimelineUIStore((s) => s.sourceRange);
  const setSourceRange = useTimelineUIStore((s) => s.setSourceRange);
  const sourceCue = useTimelineUIStore((s) => s.sourceCue);
  const cueSeconds =
    sourceCue && sourceCue.assetId === assetId
      ? sourceCue.timeMs / 1000
      : undefined;
  const docApi = useTimelineStoreApi();
  const uiApi = useTimelineUIStoreApi();
  const playbackApi = useTimelinePlaybackStoreApi();
  const preset = useSettingsStore((s) => s.settings.timelineKeyboardPreset);

  // The player's own time, so "mark in/out here" reads where it is parked.
  const playerTimeRef = useRef(0);
  const [sourceDurationMs, setSourceDurationMs] = useState<number | null>(null);
  const onDurationChange = useCallback(
    (seconds: number) => {
      const durationMs = Math.round(seconds * 1000);
      setSourceDurationMs(durationMs);
      if (durationMs > 0 && assetId && sourceRange?.assetId !== assetId) {
        setSourceRange({ assetId, inMs: 0, outMs: durationMs });
      }
    },
    [assetId, setSourceRange, sourceRange]
  );
  const onTimeUpdate = useCallback((sec: number) => {
    playerTimeRef.current = Math.round(sec * 1000);
  }, []);

  // A new asset starts with no range. Marks on the same asset survive a
  // remount, such as switching explorer tabs and back.
  useEffect(() => {
    if (assetId && uiApi.getState().sourceRange?.assetId !== assetId) {
      setSourceRange(null);
    }
    setSourceDurationMs(null);
    playerTimeRef.current = 0;
  }, [assetId, setSourceRange, uiApi]);

  const run = useCallback(
    (kind: SourceEditKind) => {
      const id = performSourceEdit(kind, {
        doc: docApi.getState(),
        ui: uiApi.getState(),
        playheadMs: playbackApi.getState().currentTimeMs,
        asset: asset ?? undefined
      });
      if (id) uiApi.getState().selectClip(id);
    },
    [asset, docApi, uiApi, playbackApi]
  );

  if (!asset) {
    return (
      <div css={panelStyles(theme)}>
        <Text size="small">
          {t("timeline.source.selectAsset")}
        </Text>
      </div>
    );
  }

  const mediaType = assetMediaType(asset.content_type);
  const range = sourceRangeFor(asset, sourceRange);
  const locator = `asset://${asset.id}`;
  const keys = (action: "sourceAppend" | "sourceInsert" | "sourceOverwrite") =>
    bindingKeys(TIMELINE_KEYMAPS[preset][action][0]);

  const markSource = (edge: "in" | "out") => {
    const currentRange = sourceRangeFor(asset, uiApi.getState().sourceRange);
    const timeMs = Math.max(
      0, Math.min(playerTimeRef.current, sourceDurationMs ?? Infinity)
    );
    setSourceRange(
      edge === "in"
        ? { assetId: asset.id, inMs: timeMs, outMs: Math.max(timeMs, currentRange.outMs) }
        : { assetId: asset.id, inMs: Math.min(timeMs, currentRange.inMs), outMs: timeMs }
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) return;
    if (mediaType === "video" && (event.key === "i" || event.key === "o")) {
      event.preventDefault();
      event.stopPropagation();
      markSource(event.key === "i" ? "in" : "out");
    }
  };

  return (
    <div
      css={panelStyles(theme)}
      data-testid="source-viewer"
      role="region"
      aria-label={t("timeline.source.monitor")}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <FlexColumn gap={SPACING.md}>
        <TruncatedText variant="body2" sx={{ fontWeight: FONT_WEIGHT.medium }} showTooltip>
          {asset.name}
        </TruncatedText>
        <div css={mediaBoxStyles(theme)}>
          {mediaType === "video" && (
            <VideoPlayer
              locator={locator}
              label={asset.name}
              onTimeUpdate={onTimeUpdate}
              onDurationChange={onDurationChange}
              seekToSeconds={cueSeconds}
            />
          )}
          {mediaType === "audio" && <AudioPlayback locator={locator} label={asset.name} />}
          {mediaType === "image" && (
            <ResponsiveImage locator={locator} alt={asset.name} fit="contain" />
          )}
          {!mediaType && <Caption>{t("timeline.source.unsupportedAsset")}</Caption>}
        </div>

        <InspectorRow label={t("timeline.source.in") }>
          <FlexRow gap={SPACING.xs} align="center">
            <InspectorPillInput
              value={formatSeconds(range.inMs)}
              unit="s"
              ariaLabel={t("timeline.source.inPoint")}
              onCommit={(raw) => {
                const inMs = parseSeconds(raw);
                if (inMs !== null) {
                  const boundedInMs = Math.min(inMs, sourceDurationMs ?? Number.POSITIVE_INFINITY);
                  setSourceRange({ assetId: asset.id, inMs: Math.min(boundedInMs, range.outMs), outMs: range.outMs });
                }
              }}
            />
            {mediaType === "video" && (
              <Tooltip title={<ShortcutHint shortcut={["I"]} />}>
                <Button size="small" variant="text" onClick={() => markSource("in")} aria-keyshortcuts="I">
                  {t("timeline.source.markIn")}
                </Button>
              </Tooltip>
            )}
          </FlexRow>
        </InspectorRow>
        <InspectorRow label={t("timeline.source.out") }>
          <FlexRow gap={SPACING.xs} align="center">
            <InspectorPillInput
              value={formatSeconds(range.outMs)}
              unit="s"
              ariaLabel={t("timeline.source.outPoint")}
              onCommit={(raw) => {
                const outMs = parseSeconds(raw);
                if (outMs !== null) {
                  const boundedOutMs = Math.min(outMs, sourceDurationMs ?? Number.POSITIVE_INFINITY);
                  setSourceRange({ assetId: asset.id, inMs: range.inMs, outMs: Math.max(range.inMs, boundedOutMs) });
                }
              }}
            />
            {mediaType === "video" && (
              <Tooltip title={<ShortcutHint shortcut={["O"]} />}>
                <Button size="small" variant="text" onClick={() => markSource("out")} aria-keyshortcuts="O">
                  {t("timeline.source.markOut")}
                </Button>
              </Tooltip>
            )}
          </FlexRow>
        </InspectorRow>
        <Caption sx={{ opacity: 0.7 }}>
          {t("timeline.source.rangeSummary", { duration: formatSeconds(range.outMs - range.inMs) })}
        </Caption>

        <FlexRow gap={SPACING.sm} sx={{ flexWrap: "wrap" }}>
          <Tooltip title={<ShortcutHint shortcut={keys("sourceAppend")} />}>
            <Button size="small" variant="outlined" startIcon={<PlaylistAddOutlinedIcon />} onClick={() => run("append")} disabled={!mediaType}>
              {t("timeline.source.append")}
            </Button>
          </Tooltip>
          <Tooltip title={<ShortcutHint shortcut={keys("sourceInsert")} />}>
            <Button size="small" variant="outlined" startIcon={<KeyboardTabOutlinedIcon />} onClick={() => run("insert")} disabled={!mediaType}>
              {t("timeline.source.insert")}
            </Button>
          </Tooltip>
          <Tooltip title={<ShortcutHint shortcut={keys("sourceOverwrite")} />}>
            <Button size="small" variant="outlined" startIcon={<FlipToFrontOutlinedIcon />} onClick={() => run("overwrite")} disabled={!mediaType}>
              {t("timeline.source.overwrite")}
            </Button>
          </Tooltip>
        </FlexRow>
      </FlexColumn>
    </div>
  );
});
SourceViewerPanel.displayName = "SourceViewerPanel";

export default SourceViewerPanel;
