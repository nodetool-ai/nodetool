/** @jsxImportSource @emotion/react */
/**
 * The mixer: one channel strip per audio and midi track in track order, then
 * the master strip right after them. When the strips outgrow the mixer they
 * scroll sideways and the master stays pinned at the right; at phone width
 * the strips keep their 72 px width (D67) and scrolling snaps strip by strip.
 *
 * Meters read the editor's live audio graph (`TimelinePlaybackStore.
 * audioGraph`) on their own animation frames; nothing here re-renders while
 * audio plays. Opening an instrument goes to the DAW dock's Devices tab
 * (through `expandedInstrumentTrackId`) unless `onOpenDevice` is given; an
 * insert opens its device unless `onOpenEffect` is given: a popover for 3 or
 * fewer parameters, else a window (D67).
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStoreApi } from "../../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { EmptyState, SPACING, thinScrollbarStyles } from "../../../ui_primitives";
import { MasterStrip, MIXER_PHONE_MAX_PX, STRIP_CLASS, TrackStrip } from "./ChannelStrip";
import { EffectDevicePopover, type OpenEffect } from "./EffectDevicePopover";
import { stereoTapReader } from "./meterLevels";

export interface MixerViewProps {
  /** Open a midi track's instrument. Default: the dock's Devices tab. */
  onOpenDevice?: (trackId: string) => void;
  /** Open an insert's device. Default: a popover for 3 or fewer parameters, else a window (D67). */
  onOpenEffect?: (trackId: string | null, effectId: string) => void;
}

const mixerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "row",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    boxSizing: "border-box",
    backgroundColor: theme.vars.palette.background.default,
    containerType: "inline-size",
    containerName: "daw-mixer",
    // The channels take only the width their strips need, so the master sits
    // right after the last strip; past the mixer's width they scroll and the
    // master stays pinned at the right.
    ".mixer__channels": {
      display: "flex",
      flexDirection: "row",
      flex: "0 1 auto",
      minWidth: 0,
      gap: theme.spacing(SPACING.xs),
      padding: theme.spacing(SPACING.xs),
      overflowX: "auto",
      overflowY: "hidden",
      overscrollBehaviorX: "contain",
      scrollSnapType: "x proximity",
      scrollPaddingInline: theme.spacing(SPACING.xs),
      WebkitOverflowScrolling: "touch",
      ...thinScrollbarStyles(theme)
    },
    [`.mixer__channels > .${STRIP_CLASS}`]: {
      scrollSnapAlign: "start"
    },
    ".mixer__master": {
      display: "flex",
      flexShrink: 0,
      padding: theme.spacing(SPACING.xs),
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    ".mixer__empty": {
      display: "flex",
      flex: "1 1 auto",
      alignItems: "center",
      justifyContent: "center"
    },
    "&:has(.mixer__empty) .mixer__channels": {
      flex: "1 1 auto"
    },
    // Phone width: a swipe snaps to the next strip, never half of one.
    [`@container daw-mixer (max-width: ${MIXER_PHONE_MAX_PX}px)`]: {
      ".mixer__channels": {
        flex: "1 1 auto",
        containerType: "inline-size",
        scrollSnapType: "x mandatory"
      }
    }
  });

/** The audio and midi track ids, in track order; stable while they are unchanged. */
function useMixerTrackIds(): string[] {
  const key = useTimelineStore((s) =>
    s.tracks
      .filter((t) => t.type === "audio" || t.type === "midi")
      .map((t) => t.id)
      .join("\u0000")
  );
  return useMemo(() => (key ? key.split("\u0000") : []), [key]);
}

const TrackStripSlot: React.FC<{
  trackId: string;
  onOpenDevice: (trackId: string) => void;
  onOpenEffect: (trackId: string | null, effectId: string, anchor: HTMLElement) => void;
}> = memo(({ trackId, onOpenDevice, onOpenEffect }) => {
  const playbackApi = useTimelinePlaybackStoreApi();
  const read = useMemo(
    () => stereoTapReader(() => playbackApi.getState().audioGraph?.getTrackMeter(trackId) ?? null),
    [playbackApi, trackId]
  );
  return (
    <TrackStrip
      trackId={trackId}
      readLevels={read}
      onOpenDevice={onOpenDevice}
      onOpenEffect={onOpenEffect}
    />
  );
});
TrackStripSlot.displayName = "TrackStripSlot";

export const MixerView: React.FC<MixerViewProps> = memo(({ onOpenDevice, onOpenEffect }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => mixerStyles(theme), [theme]);
  const trackIds = useMixerTrackIds();
  const playbackApi = useTimelinePlaybackStoreApi();
  const toggleExpandedInstrument = useTimelineUIStore((s) => s.toggleExpandedInstrument);
  const [openEffect, setOpenEffect] = useState<OpenEffect | null>(null);

  const readMaster = useMemo(
    () => stereoTapReader(() => playbackApi.getState().audioGraph?.getMasterMeter() ?? null),
    [playbackApi]
  );
  const openDevice = useCallback(
    (trackId: string) => {
      if (onOpenDevice) onOpenDevice(trackId);
      else toggleExpandedInstrument(trackId);
    },
    [onOpenDevice, toggleExpandedInstrument]
  );
  const openInsert = useCallback(
    (trackId: string | null, effectId: string, anchor: HTMLElement) => {
      if (onOpenEffect) onOpenEffect(trackId, effectId);
      else setOpenEffect({ trackId, effectId, anchor });
    },
    [onOpenEffect]
  );
  const closeInsert = useCallback(() => setOpenEffect(null), []);

  return (
    <div css={styles} data-testid="daw-mixer" role="region" aria-label={t("batch2_26.daw.mixer.title")}>
      <div className="mixer__channels" role="group" aria-label={t("batch2_26.daw.mixer.channels")}>
        {trackIds.length === 0 ? (
          <div className="mixer__empty">
            <EmptyState
              title={t("batch2_26.daw.mixer.emptyTitle")}
              description={t("batch2_26.daw.mixer.emptyDescription")}
            />
          </div>
        ) : (
          trackIds.map((id) => (
            <TrackStripSlot
              key={id}
              trackId={id}
              onOpenDevice={openDevice}
              onOpenEffect={openInsert}
            />
          ))
        )}
      </div>
      <div className="mixer__master">
        <MasterStrip readLevels={readMaster} onOpenEffect={openInsert} />
      </div>
      <EffectDevicePopover open={openEffect} onClose={closeInsert} />
    </div>
  );
});
MixerView.displayName = "MixerView";
