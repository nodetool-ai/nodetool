/** @jsxImportSource @emotion/react */
/**
 * One mixer channel strip, top to bottom: the channel's name and type, the
 * instrument of a midi track (opens its device), the insert slots, the pan
 * knob, the fader beside its stereo meter, the dB readout (click to type a
 * level) and mute and solo. The master strip is the same strip without
 * pan, instrument, mute or solo.
 *
 * Fader and pan drags write at most once a frame and record one undo entry
 * per gesture (`useBatchedGesture`).
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import type { TimelineTrack, TrackEffect } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useBatchedGesture } from "../../../../hooks/timeline/useBatchedGesture";
import {
  BORDER_RADIUS,
  CONTROL,
  Fader,
  Knob,
  LevelMeter,
  MOTION,
  SPACING,
  TYPOGRAPHY,
  Tooltip
} from "../../../ui_primitives";
import { trackTypeAccent, trackTypeMeta } from "../../Tracks/trackVisuals";
import { INSTRUMENT_NAMES } from "../dock/DeviceChainView";
import {
  FADER_MARKS,
  FADER_MAX_DB,
  FADER_MIN_DB,
  dbToFaderPosition,
  faderPositionToDb,
  formatDb,
  formatPan,
  panValueText,
  parseDb
} from "./faderTaper";
import { InsertSlots } from "./InsertSlots";

/** Strip width, from the spacing scale (88 px). */
const STRIP_UNITS = 22;

const stripStyles = (theme: Theme, accent: string, master: boolean) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    flexShrink: 0,
    width: theme.spacing(STRIP_UNITS),
    height: "100%",
    minHeight: 0,
    boxSizing: "border-box",
    gap: theme.spacing(SPACING.xs),
    padding: theme.spacing(SPACING.xs),
    borderRadius: BORDER_RADIUS.md,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderTop: `3px solid ${accent}`,
    backgroundColor: master
      ? theme.vars.palette.action.hover
      : theme.vars.palette.background.paper,
    ".strip__head": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing(SPACING.xs),
      minWidth: 0,
      color: accent,
      "& svg": { fontSize: TYPOGRAPHY.sans.label.fontSize, flexShrink: 0 }
    },
    ".strip__name": {
      ...TYPOGRAPHY.sans.label,
      color: theme.vars.palette.text.primary,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".strip__device": {
      ...TYPOGRAPHY.sans.caption,
      height: CONTROL.height.xs - 4,
      padding: `0 ${theme.spacing(SPACING.xs)}`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      textAlign: "left",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      cursor: "pointer",
      flexShrink: 0
    },
    ".strip__device[data-static]": { cursor: "default", lineHeight: `${CONTROL.height.xs - 6}px` },
    "button.strip__device:hover": {
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.text.secondary
    },
    ".strip__pan": {
      display: "flex",
      justifyContent: "center",
      flexShrink: 0
    },
    ".strip__level": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing(SPACING.xs),
      flex: "1 1 auto",
      minHeight: theme.spacing(SPACING.xxxl * 2)
    },
    ".strip__readout, .strip__readout-input": {
      ...TYPOGRAPHY.mono.caption,
      height: CONTROL.height.xs - 4,
      width: "100%",
      boxSizing: "border-box",
      padding: `0 ${theme.spacing(SPACING.xs)}`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.background.default,
      color: theme.vars.palette.text.primary,
      textAlign: "center",
      cursor: "text",
      flexShrink: 0
    },
    ".strip__readout-input": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: -2
    },
    ".strip__buttons": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing(SPACING.xs),
      flexShrink: 0
    },
    ".strip__toggle": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: CONTROL.height.xs,
      height: CONTROL.height.xs,
      padding: 0,
      border: "1px solid transparent",
      borderRadius: BORDER_RADIUS.md,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      transition: `${MOTION.background}, ${MOTION.border}`,
      ...TYPOGRAPHY.mono.strong,
      lineHeight: 1,
      "& svg": { fontSize: TYPOGRAPHY.sans.body.fontSize }
    },
    ".strip__toggle:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      borderColor: theme.vars.palette.divider
    },
    ".strip__toggle[data-tone='warning'][aria-pressed='true']": {
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.warning.main
    },
    ".strip__toggle[data-tone='success'][aria-pressed='true']": {
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.success.main
    },
    "button:focus-visible, input:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 1
    }
  });

/** The level readout: shows the fader in dB, and takes a typed level on click. */
const DbReadout: React.FC<{
  channel: string;
  db: number;
  onCommit: (db: number) => void;
}> = memo(({ channel, db, onCommit }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = useCallback(() => {
    if (draft === null) return;
    const parsed = parseDb(draft);
    if (parsed !== null && !cancelled.current) onCommit(parsed);
    cancelled.current = false;
    setDraft(null);
  }, [draft, onCommit]);
  if (draft === null) {
    return (
      <button
        type="button"
        className="strip__readout"
        aria-label={`${channel} level ${formatDb(db)}, edit`}
        onClick={() => setDraft(db <= FADER_MIN_DB ? "-inf" : (Math.round(db * 10) / 10).toFixed(1))}
      >
        {formatDb(db)}
      </button>
    );
  }
  return (
    <input
      className="strip__readout-input"
      aria-label={`${channel} level in dB`}
      value={draft}
      // The readout was clicked to type a level; the field takes focus.
      autoFocus
      inputMode="decimal"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
});
DbReadout.displayName = "DbReadout";

export interface StripChannel {
  name: string;
  type: TimelineTrack["type"] | "master";
  volumeDb: number;
  pan?: number;
  muted?: boolean;
  solo?: boolean;
  /** Midi track's instrument label. */
  instrument?: string;
  effects: readonly TrackEffect[];
}

export interface ChannelStripViewProps {
  channel: StripChannel;
  readLevels: () => ArrayLike<number> | null;
  onVolumeStart: () => void;
  onVolume: (db: number) => void;
  onVolumeEnd: () => void;
  onVolumeCommit: (db: number) => void;
  onPanStart?: () => void;
  onPan?: (pan: number) => void;
  onPanEnd?: () => void;
  onMute?: () => void;
  onSolo?: () => void;
  onOpenDevice?: () => void;
  onAddEffect: (effect: TrackEffect["type"] | TrackEffect) => void;
  onToggleEffect: (effectId: string, enabled: boolean) => void;
  onOpenEffect: (effectId: string, anchor: HTMLElement) => void;
}

/** The strip itself, from plain values, so the master and tracks share it. */
export const ChannelStripView: React.FC<ChannelStripViewProps> = memo((props) => {
  const { channel } = props;
  const theme = useTheme();
  const master = channel.type === "master";
  const accent = master
    ? theme.vars.palette.text.primary
    : trackTypeAccent(theme, channel.type as TimelineTrack["type"]);
  const styles = useMemo(() => stripStyles(theme, accent, master), [theme, accent, master]);
  const Icon = master ? null : trackTypeMeta(channel.type as TimelineTrack["type"]).Icon;
  const faderMax = Math.max(FADER_MAX_DB, channel.volumeDb);

  return (
    <section
      css={styles}
      aria-label={`${channel.name} channel`}
      data-testid={master ? "mixer-strip-master" : undefined}
    >
      <div className="strip__head">
        {Icon && <Icon aria-hidden="true" />}
        <Tooltip title={channel.name}>
          <span className="strip__name">{channel.name}</span>
        </Tooltip>
      </div>
      {channel.instrument !== undefined ? (
        <button
          type="button"
          className="strip__device"
          onClick={props.onOpenDevice}
          aria-label={`Open ${channel.name} instrument, ${channel.instrument}`}
        >
          {channel.instrument}
        </button>
      ) : (
        <span className="strip__device" data-static="true">
          {master ? "Stereo out" : "Audio"}
        </span>
      )}
      <InsertSlots
        channel={channel.name}
        effects={channel.effects}
        onAdd={props.onAddEffect}
        onToggle={props.onToggleEffect}
        onOpen={props.onOpenEffect}
      />
      {props.onPan && (
        <div className="strip__pan">
          <Knob
            value={channel.pan ?? 0}
            min={-1}
            max={1}
            step={0.01}
            bipolar
            defaultValue={0}
            label={`${channel.name} pan`}
            valueText={panValueText}
            caption={formatPan(channel.pan)}
            onChangeStart={props.onPanStart}
            onChange={props.onPan}
            onChangeEnd={props.onPanEnd}
          />
        </div>
      )}
      <div className="strip__level">
        <Fader
          value={channel.volumeDb}
          min={FADER_MIN_DB}
          max={faderMax}
          toPosition={dbToFaderPosition}
          fromPosition={faderPositionToDb}
          defaultValue={0}
          marks={FADER_MARKS}
          label={`${channel.name} volume`}
          valueText={formatDb}
          onChangeStart={props.onVolumeStart}
          onChange={props.onVolume}
          onChangeEnd={props.onVolumeEnd}
        />
        <LevelMeter read={props.readLevels} toPosition={dbToFaderPosition} label={`${channel.name} level`} />
      </div>
      <DbReadout channel={channel.name} db={channel.volumeDb} onCommit={props.onVolumeCommit} />
      {props.onMute && props.onSolo && (
        <div className="strip__buttons">
          <Tooltip title={channel.muted ? "Unmute" : "Mute"}>
            <button
              type="button"
              className="strip__toggle"
              data-tone="warning"
              aria-pressed={!!channel.muted}
              aria-label={`${channel.muted ? "Unmute" : "Mute"} ${channel.name}`}
              onClick={props.onMute}
            >
              {channel.muted ? <VolumeOffOutlinedIcon /> : <VolumeUpOutlinedIcon />}
            </button>
          </Tooltip>
          <Tooltip title={channel.solo ? "Unsolo" : "Solo"}>
            <button
              type="button"
              className="strip__toggle"
              data-tone="success"
              aria-pressed={!!channel.solo}
              aria-label={`${channel.solo ? "Unsolo" : "Solo"} ${channel.name}`}
              onClick={props.onSolo}
            >
              S
            </button>
          </Tooltip>
        </div>
      )}
    </section>
  );
});
ChannelStripView.displayName = "ChannelStripView";

export interface TrackStripProps {
  trackId: string;
  readLevels: () => ArrayLike<number> | null;
  onOpenDevice: (trackId: string) => void;
  onOpenEffect: (trackId: string | null, effectId: string, anchor: HTMLElement) => void;
}

const NO_EFFECTS: TrackEffect[] = [];

/** A track's strip, bound to the timeline store. */
export const TrackStrip: React.FC<TrackStripProps> = memo(
  ({ trackId, readLevels, onOpenDevice, onOpenEffect }) => {
    const track = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId));
    const setTrackVolume = useTimelineStore((s) => s.setTrackVolume);
    const setTrackPan = useTimelineStore((s) => s.setTrackPan);
    const setTrackMuted = useTimelineStore((s) => s.setTrackMuted);
    const setTrackSolo = useTimelineStore((s) => s.setTrackSolo);
    const addTrackEffect = useTimelineStore((s) => s.addTrackEffect);
    const updateTrackEffect = useTimelineStore((s) => s.updateTrackEffect);

    const volume = useBatchedGesture<number>((db) => setTrackVolume(trackId, db));
    const pan = useBatchedGesture<number>((value) => setTrackPan(trackId, value));

    const channel = useMemo<StripChannel | null>(
      () =>
        track
          ? {
              name: track.name,
              type: track.type,
              volumeDb: track.volumeDb ?? 0,
              pan: track.pan ?? 0,
              muted: track.muted,
              solo: track.solo,
              instrument:
                track.type === "midi"
                  ? INSTRUMENT_NAMES[track.instrument?.type ?? "subtractive"]
                  : undefined,
              effects: track.effects ?? NO_EFFECTS
            }
          : null,
      [track]
    );

    const handlers = useMemo(
      () => ({
        onVolumeStart: volume.begin,
        onVolume: volume.schedule,
        onVolumeEnd: () => volume.commit(),
        onVolumeCommit: (db: number) => setTrackVolume(trackId, db),
        onPanStart: pan.begin,
        onPan: pan.schedule,
        onPanEnd: () => pan.commit(),
        onMute: () => setTrackMuted(trackId, !track?.muted),
        onSolo: () => setTrackSolo(trackId, !track?.solo),
        onOpenDevice: () => onOpenDevice(trackId),
        onAddEffect: (effect: TrackEffect["type"] | TrackEffect) => addTrackEffect(trackId, effect),
        onToggleEffect: (effectId: string, enabled: boolean) =>
          updateTrackEffect(trackId, effectId, { enabled }),
        onOpenEffect: (effectId: string, anchor: HTMLElement) =>
          onOpenEffect(trackId, effectId, anchor)
      }),
      [
        volume,
        pan,
        trackId,
        track?.muted,
        track?.solo,
        setTrackVolume,
        setTrackMuted,
        setTrackSolo,
        onOpenDevice,
        addTrackEffect,
        updateTrackEffect,
        onOpenEffect
      ]
    );

    if (!channel) return null;
    return <ChannelStripView channel={channel} readLevels={readLevels} {...handlers} />;
  }
);
TrackStrip.displayName = "TrackStrip";

export interface MasterStripProps {
  readLevels: () => ArrayLike<number> | null;
  onOpenEffect: (trackId: string | null, effectId: string, anchor: HTMLElement) => void;
}

/** The master channel's strip, bound to the timeline store. */
export const MasterStrip: React.FC<MasterStripProps> = memo(({ readLevels, onOpenEffect }) => {
  const master = useTimelineStore((s) => s.master);
  const setMasterVolume = useTimelineStore((s) => s.setMasterVolume);
  const addMasterEffect = useTimelineStore((s) => s.addMasterEffect);
  const updateMasterEffect = useTimelineStore((s) => s.updateMasterEffect);
  const volume = useBatchedGesture<number>(setMasterVolume);

  const channel = useMemo<StripChannel>(
    () => ({
      name: "Master",
      type: "master",
      volumeDb: master?.volumeDb ?? 0,
      effects: master?.effects ?? NO_EFFECTS
    }),
    [master]
  );
  const handlers = useMemo(
    () => ({
      onVolumeStart: volume.begin,
      onVolume: volume.schedule,
      onVolumeEnd: () => volume.commit(),
      onVolumeCommit: setMasterVolume,
      onAddEffect: addMasterEffect,
      onToggleEffect: (effectId: string, enabled: boolean) =>
        updateMasterEffect(effectId, { enabled }),
      onOpenEffect: (effectId: string, anchor: HTMLElement) => onOpenEffect(null, effectId, anchor)
    }),
    [volume, setMasterVolume, addMasterEffect, updateMasterEffect, onOpenEffect]
  );
  return <ChannelStripView channel={channel} readLevels={readLevels} {...handlers} />;
});
MasterStrip.displayName = "MasterStrip";
