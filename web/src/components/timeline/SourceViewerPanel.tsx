/** @jsxImportSource @emotion/react */
/**
 * SourceViewerPanel — the source monitor: the asset selected in the explorer,
 * an in and out point on it, and Append / Insert / Overwrite into the
 * sequence at the playhead. Three-point editing, the Premiere source monitor
 * and the Final Cut browser range in one panel.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import KeyboardTabOutlinedIcon from "@mui/icons-material/KeyboardTabOutlined";
import FlipToFrontOutlinedIcon from "@mui/icons-material/FlipToFrontOutlined";

import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore, useTimelineUIStoreApi } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import {
  AudioPlayback,
  Button,
  Caption,
  FlexColumn,
  FlexRow,
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
  const theme = useTheme();
  const asset = useAssetGridStore((s) => s.selectedAssets.at(-1));
  const sourceRange = useTimelineUIStore((s) => s.sourceRange);
  const setSourceRange = useTimelineUIStore((s) => s.setSourceRange);
  const docApi = useTimelineStoreApi();
  const uiApi = useTimelineUIStoreApi();
  const playbackApi = useTimelinePlaybackStoreApi();
  const preset = useSettingsStore((s) => s.settings.timelineKeyboardPreset);

  // The player's own time, so "mark in/out here" reads where it is parked.
  const playerTimeRef = useRef(0);
  const [playerTimeMs, setPlayerTimeMs] = useState(0);
  const onTimeUpdate = useCallback((sec: number) => {
    playerTimeRef.current = Math.round(sec * 1000);
    setPlayerTimeMs(playerTimeRef.current);
  }, []);

  // A new asset starts with no range.
  const assetId = asset?.id;
  useEffect(() => {
    setSourceRange(null);
    setPlayerTimeMs(0);
    playerTimeRef.current = 0;
  }, [assetId, setSourceRange]);

  const run = useCallback(
    (kind: SourceEditKind) => {
      const id = performSourceEdit(kind, {
        doc: docApi.getState(),
        ui: uiApi.getState(),
        playheadMs: playbackApi.getState().currentTimeMs,
        asset
      });
      if (id) uiApi.getState().selectClip(id);
    },
    [asset, docApi, uiApi, playbackApi]
  );

  if (!asset) {
    return (
      <div css={panelStyles(theme)}>
        <Text size="small">
          Select an asset in the explorer to preview it here and mark the part
          to use.
        </Text>
      </div>
    );
  }

  const mediaType = assetMediaType(asset.content_type);
  const range = sourceRangeFor(asset, sourceRange);
  const locator = `asset://${asset.id}`;
  const keys = (action: "sourceAppend" | "sourceInsert" | "sourceOverwrite") =>
    bindingKeys(TIMELINE_KEYMAPS[preset][action][0]);

  return (
    <div css={panelStyles(theme)} data-testid="source-viewer">
      <FlexColumn gap={SPACING.md}>
        <TruncatedText variant="body2" sx={{ fontWeight: 500 }} showTooltip>
          {asset.name}
        </TruncatedText>
        <div css={mediaBoxStyles(theme)}>
          {mediaType === "video" && (
            <VideoPlayer locator={locator} label={asset.name} onTimeUpdate={onTimeUpdate} />
          )}
          {mediaType === "audio" && <AudioPlayback locator={locator} label={asset.name} />}
          {mediaType === "image" && (
            <ResponsiveImage locator={locator} alt={asset.name} fit="contain" />
          )}
          {!mediaType && <Caption>This asset type cannot go on the timeline.</Caption>}
        </div>

        <InspectorRow label="In">
          <FlexRow gap={SPACING.xs} align="center">
            <InspectorPillInput
              value={formatSeconds(range.inMs)}
              unit="s"
              ariaLabel="Source in point"
              onCommit={(raw) => {
                const sec = parseSeconds(raw);
                if (sec !== null) setSourceRange({ inMs: Math.round(sec * 1000), outMs: range.outMs });
              }}
            />
            {mediaType === "video" && (
              <Button size="small" variant="text" onClick={() => setSourceRange({ inMs: playerTimeMs, outMs: range.outMs })}>
                Mark here
              </Button>
            )}
          </FlexRow>
        </InspectorRow>
        <InspectorRow label="Out">
          <FlexRow gap={SPACING.xs} align="center">
            <InspectorPillInput
              value={formatSeconds(range.outMs)}
              unit="s"
              ariaLabel="Source out point"
              onCommit={(raw) => {
                const sec = parseSeconds(raw);
                if (sec !== null) setSourceRange({ inMs: range.inMs, outMs: Math.round(sec * 1000) });
              }}
            />
            {mediaType === "video" && (
              <Button size="small" variant="text" onClick={() => setSourceRange({ inMs: range.inMs, outMs: playerTimeMs })}>
                Mark here
              </Button>
            )}
          </FlexRow>
        </InspectorRow>
        <Caption sx={{ opacity: 0.7 }}>
          Range {formatSeconds(range.outMs - range.inMs)} s. Insert and Overwrite
          land at the playhead on the first unlocked track that fits the media.
        </Caption>

        <FlexRow gap={SPACING.sm} sx={{ flexWrap: "wrap" }}>
          <Tooltip title={<ShortcutHint shortcut={keys("sourceAppend")} />}>
            <Button size="small" variant="outlined" startIcon={<PlaylistAddOutlinedIcon />} onClick={() => run("append")} disabled={!mediaType}>
              Append
            </Button>
          </Tooltip>
          <Tooltip title={<ShortcutHint shortcut={keys("sourceInsert")} />}>
            <Button size="small" variant="outlined" startIcon={<KeyboardTabOutlinedIcon />} onClick={() => run("insert")} disabled={!mediaType}>
              Insert
            </Button>
          </Tooltip>
          <Tooltip title={<ShortcutHint shortcut={keys("sourceOverwrite")} />}>
            <Button size="small" variant="outlined" startIcon={<FlipToFrontOutlinedIcon />} onClick={() => run("overwrite")} disabled={!mediaType}>
              Overwrite
            </Button>
          </Tooltip>
        </FlexRow>
      </FlexColumn>
    </div>
  );
});
SourceViewerPanel.displayName = "SourceViewerPanel";

export default SourceViewerPanel;
