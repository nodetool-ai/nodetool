/** @jsxImportSource @emotion/react */
/**
 * One mixer channel strip, top to bottom: the channel's name and type, the
 * instrument of a midi track (opens its device), the insert slots, the pan
 * knob, mute and solo, the fader beside its stereo meter and the dB readout
 * (click to type a level). The master strip is the same strip without
 * instrument, pan, mute or solo; a spacer keeps its fader level with the
 * tracks' faders.
 *
 * Fader and pan drags write at most once a frame and record one undo entry
 * per gesture (`useBatchedGesture`).
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
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

/** Strip width on a roomy mixer, from the spacing scale (120 px). */
const STRIP_UNITS = 30;
/** Width of the pan, mute and solo column beside the fader. */
const SIDE_PX = CONTROL.height.lg;
/**
 * Below this mixer width (the `daw-mixer` container) the strip stacks pan,
 * mute and solo above the fader instead of beside it.
 */
export const MIXER_PHONE_MAX_PX = 520;
/** Pan knob diameter. */
const KNOB_PX = CONTROL.height.sm;
/** Mute and solo button height. */
const TOGGLE_PX = CONTROL.height.xs - 4;
/**
 * The fader's travel is inset by half a cap at each end; the meter's bars are
 * inset by the same amount (less its clip light above them) so both share
 * one scale.
 */
const FADER_INSET_PX = (CONTROL.height.xs - 4) / 2;
const METER_CLIP_PX = 6 + 2;

/** The class every strip carries, for the mixer's phone layout. */
export const STRIP_CLASS = "mixer-strip";

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
    backgroundColor: master ? theme.vars.palette.action.hover : theme.vars.palette.background.paper,
    ".strip__head": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing(SPACING.xs),
      minWidth: 0,
      flexShrink: 0,
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
      display: "block",
      height: CONTROL.height.xs - 4,
      lineHeight: `${CONTROL.height.xs - 6}px`,
      boxSizing: "border-box",
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
      flexShrink: 0,
      transition: `color ${MOTION.fast}, ${MOTION.border}`
    },
    ".strip__device[data-static]": { cursor: "default", borderStyle: "dashed" },
    "button.strip__device:hover": {
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.text.secondary
    },
    // Beside the fader: the pan knob over its value, then mute over solo.
    ".strip__body": {
      display: "flex",
      flexDirection: "row",
      gap: theme.spacing(SPACING.xs),
      flex: "1 1 auto",
      minHeight: theme.spacing(SPACING.xxxl * 3)
    },
    ".strip__side": {
      order: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: theme.spacing(SPACING.md),
      width: SIDE_PX,
      flexShrink: 0
    },
    ".strip__pan": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: theme.spacing(SPACING.micro),
      flexShrink: 0
    },
    ".strip__pan-value": {
      ...TYPOGRAPHY.mono.caption,
      lineHeight: 1,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      userSelect: "none"
    },
    ".strip__buttons": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(SPACING.xs),
      flexShrink: 0
    },
    ".strip__spacer": { display: "none" },
    [`@container daw-mixer (max-width: ${MIXER_PHONE_MAX_PX}px)`]: {
      ".strip__body": {
        flexDirection: "column",
        minHeight: 0
      },
      ".strip__side": {
        order: 0,
        width: "auto",
        gap: theme.spacing(SPACING.xs)
      },
      ".strip__pan": {
        flexDirection: "row",
        justifyContent: "center",
        gap: theme.spacing(SPACING.xs),
        height: KNOB_PX
      },
      ".strip__buttons": {
        display: "grid",
        gridTemplateColumns: "1fr 1fr"
      },
      // The master has no pan, mute or solo; this keeps its fader level with
      // the tracks' faders so every scale lines up across the mixer.
      ".strip__spacer": {
        display: "block",
        height: KNOB_PX + TOGGLE_PX + 4,
        flexShrink: 0
      }
    },
    ".strip__level": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing(SPACING.xs),
      flex: "1 1 auto",
      minWidth: 0,
      minHeight: theme.spacing(SPACING.xxxl + SPACING.xl)
    },
    ".strip__meter": {
      height: "100%",
      boxSizing: "border-box",
      paddingTop: FADER_INSET_PX - METER_CLIP_PX,
      paddingBottom: FADER_INSET_PX
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
      flexShrink: 0,
      transition: MOTION.border
    },
    ".strip__readout:hover": {
      borderColor: theme.vars.palette.text.secondary
    },
    ".strip__readout-input": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: -2
    },
    ".strip__toggle": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 0,
      height: TOGGLE_PX,
      padding: 0,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      transition: `${MOTION.background}, ${MOTION.border}, color ${MOTION.fast}`,
      ...TYPOGRAPHY.mono.strong,
      lineHeight: 1
    },
    ".strip__toggle:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      borderColor: theme.vars.palette.text.secondary,
      color: theme.vars.palette.text.primary
    },
    ".strip__toggle[data-tone='warning'][aria-pressed='true']": {
      backgroundColor: theme.vars.palette.warning.main,
      borderColor: theme.vars.palette.warning.main,
      color: theme.vars.palette.warning.contrastText
    },
    ".strip__toggle[data-tone='success'][aria-pressed='true']": {
      backgroundColor: theme.vars.palette.success.main,
      borderColor: theme.vars.palette.success.main,
      color: theme.vars.palette.success.contrastText
    },
    // A muted channel's name reads as off at a glance.
    "&[data-muted='true'] .strip__name": {
      color: theme.vars.palette.text.disabled
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
        onClick={() =>
          setDraft(db <= FADER_MIN_DB ? "-inf" : (Math.round(db * 10) / 10).toFixed(1))
        }
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
      className={STRIP_CLASS}
      aria-label={`${channel.name} channel`}
      data-testid={master ? "mixer-strip-master" : undefined}
      data-muted={channel.muted ? "true" : undefined}
    >
      <div className="strip__head">
        {Icon && <Icon aria-hidden="true" />}
        <Tooltip title={channel.name}>
          <span className="strip__name">{channel.name}</span>
        </Tooltip>
      </div>
      {channel.instrument !== undefined ? (
        <Tooltip title={`Open ${channel.instrument}`}>
          <button
            type="button"
            className="strip__device"
            onClick={props.onOpenDevice}
            aria-label={`Open ${channel.name} instrument, ${channel.instrument}`}
          >
            {channel.instrument}
          </button>
        </Tooltip>
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
      <div className="strip__body">
        {props.onPan || props.onMute ? (
          <div className="strip__side">
            {props.onPan ? (
              <div className="strip__pan">
                <Knob
                  value={channel.pan ?? 0}
                  min={-1}
                  max={1}
                  step={0.01}
                  bipolar
                  defaultValue={0}
                  size={KNOB_PX}
                  label={`${channel.name} pan`}
                  valueText={panValueText}
                  onChangeStart={props.onPanStart}
                  onChange={props.onPan}
                  onChangeEnd={props.onPanEnd}
                />
                <span className="strip__pan-value" aria-hidden="true">
                  {formatPan(channel.pan)}
                </span>
              </div>
            ) : null}
            {props.onMute && props.onSolo ? (
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
                    M
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
            ) : null}
          </div>
        ) : (
          <div className="strip__spacer" aria-hidden="true" />
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
          <div className="strip__meter">
            <LevelMeter
              read={props.readLevels}
              toPosition={dbToFaderPosition}
              label={`${channel.name} level`}
            />
          </div>
        </div>
      </div>
      <DbReadout channel={channel.name} db={channel.volumeDb} onCommit={props.onVolumeCommit} />
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
