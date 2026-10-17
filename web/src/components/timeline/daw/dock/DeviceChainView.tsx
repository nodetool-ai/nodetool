/** @jsxImportSource @emotion/react */
/**
 * The DAW dock's Devices tab: the focused channel's devices in signal order,
 * left to right. A midi track starts with its instrument, then every channel
 * (audio, midi or the master) shows its inserts and an add card.
 *
 * Each device renders the view registered for it in `deviceViews.ts`; one
 * with no view falls back to the editor the track panels already have.
 */

import React, { Suspense, memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { MidiInstrument, TimelineTrack, TrackEffect } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineIsMobile } from "../../../../hooks/timeline/useTimelineIsMobile";
import PanelErrorBoundary from "../../../common/PanelErrorBoundary";
import {
  BORDER_RADIUS,
  Caption,
  EditorMenu,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  MenuItemPrimitive,
  SelectField,
  SelectableListItem,
  SPACING,
  Text,
  ToolbarIconButton,
  TruncatedText
} from "../../../ui_primitives";
import { TrackInstrumentPanel } from "../../Tracks/TrackInstrumentPanel";
import { TrackEffectParams } from "../../Tracks/TrackEffectsPanel";
import { AUDIO_EFFECT_TYPES, DEVICE_WIDTHS, EFFECT_LABELS } from "../../Tracks/trackEffectsConstants";
import { FABLE_FX_KINDS, FABLE_FX_LABELS, makeFableEffect } from "../fx/fableFxParams";
import { fxView, instrumentView } from "../devices/deviceViews";
import "../devices/registerDeviceViews";
import { DeviceCard } from "./DeviceCard";

/** Which channel the Devices tab shows. */
export type DeviceTarget = { kind: "track"; trackId: string } | { kind: "master" };

export const MASTER_TARGET_VALUE = "__master__";

/** The tracks that carry an audio device chain. */
export function isDeviceTrack(track: TimelineTrack): boolean {
  return track.type === "audio" || track.type === "midi";
}

export const INSTRUMENT_NAMES: Record<MidiInstrument["type"], string> = {
  subtractive: "Synth",
  wavetable: "WT-1 Wavetable",
  bass: "BL-1 Bass",
  drum: "DR-1 Drums",
  sampler: "Sampler"
};

/** The `deviceViews` key of an effect: its type, or `fable:<kind>`. */
export function effectViewKey(effect: TrackEffect): string {
  return effect.type === "fable" ? `fable:${effect.kind}` : effect.type;
}

export function effectTitle(effect: TrackEffect): string {
  if (effect.type === "fable") return FABLE_FX_LABELS[effect.kind];
  return (EFFECT_LABELS as Record<string, string>)[effect.type] ?? effect.type;
}

const NATIVE_TYPES = AUDIO_EFFECT_TYPES.filter((type) => type !== "fable");

/*
 * The FableSynth views lay themselves out by container queries, so they have
 * no width of their own: an instrument takes most of the rack, an effect a
 * share of it, within the sizes their panels were drawn for.
 */
const INSTRUMENT_VIEW_WIDTH = "clamp(340px, 92%, 1180px)";
const FX_VIEW_WIDTH = "clamp(280px, 36%, 480px)";

const layoutStyles = (theme: Theme, mobile: boolean) =>
  css({
    display: "flex",
    flexDirection: mobile ? "column" : "row",
    width: "100%",
    height: "100%",
    minHeight: 0,
    ".device-chain__picker": {
      flexShrink: 0,
      width: mobile ? "100%" : theme.spacing(SPACING.xxxl * 5),
      borderRight: mobile ? "none" : `1px solid ${theme.vars.palette.divider}`,
      borderBottom: mobile ? `1px solid ${theme.vars.palette.divider}` : "none",
      padding: theme.spacing(SPACING.xs),
      overflowY: "auto",
      boxSizing: "border-box"
    },
    ".device-chain__rack": {
      flex: "1 1 auto",
      minWidth: 0,
      minHeight: 0,
      display: "flex",
      flexDirection: "row",
      alignItems: "stretch",
      gap: theme.spacing(SPACING.md),
      padding: theme.spacing(SPACING.md),
      overflowX: "auto",
      overflowY: "hidden",
      overscrollBehaviorX: "contain"
    },
    ".device-chain__add": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: theme.spacing(SPACING.xxxl + SPACING.lg),
      border: `1px dashed ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.md
    },
  });

interface ChainOps {
  effects: TrackEffect[];
  add: (effect: TrackEffect["type"] | TrackEffect) => void;
  update: (effectId: string, patch: Partial<TrackEffect>) => void;
  remove: (effectId: string) => void;
  move: (from: number, to: number) => void;
}

const NO_EFFECTS: TrackEffect[] = [];

function useChainOps(target: DeviceTarget | null): ChainOps {
  const trackId = target?.kind === "track" ? target.trackId : null;
  const trackEffects = useTimelineStore((s) =>
    trackId ? s.tracks.find((t) => t.id === trackId)?.effects : undefined
  );
  const masterEffects = useTimelineStore((s) => s.master?.effects);
  const addTrackEffect = useTimelineStore((s) => s.addTrackEffect);
  const updateTrackEffect = useTimelineStore((s) => s.updateTrackEffect);
  const removeTrackEffect = useTimelineStore((s) => s.removeTrackEffect);
  const moveTrackEffect = useTimelineStore((s) => s.moveTrackEffect);
  const addMasterEffect = useTimelineStore((s) => s.addMasterEffect);
  const updateMasterEffect = useTimelineStore((s) => s.updateMasterEffect);
  const removeMasterEffect = useTimelineStore((s) => s.removeMasterEffect);
  const moveMasterEffect = useTimelineStore((s) => s.moveMasterEffect);
  return useMemo(() => {
    if (target?.kind === "master") {
      return {
        effects: masterEffects ?? NO_EFFECTS,
        add: addMasterEffect,
        update: updateMasterEffect,
        remove: removeMasterEffect,
        move: moveMasterEffect
      };
    }
    const id = trackId ?? "";
    return {
      effects: trackEffects ?? NO_EFFECTS,
      add: (effect) => addTrackEffect(id, effect),
      update: (effectId, patch) => updateTrackEffect(id, effectId, patch),
      remove: (effectId) => removeTrackEffect(id, effectId),
      move: (from, to) => moveTrackEffect(id, from, to)
    };
  }, [
    target?.kind,
    trackId,
    trackEffects,
    masterEffects,
    addTrackEffect,
    updateTrackEffect,
    removeTrackEffect,
    moveTrackEffect,
    addMasterEffect,
    updateMasterEffect,
    removeMasterEffect,
    moveMasterEffect
  ]);
}

const DeviceFallback: React.FC<{ label: string }> = ({ label }) => (
  <FlexColumn align="center" justify="center" sx={{ minHeight: 0, flex: 1, p: SPACING.md }}>
    <LoadingSpinner size="small" text={`Loading ${label}`} />
  </FlexColumn>
);

const EffectDevice: React.FC<{
  target: DeviceTarget;
  effect: TrackEffect;
  index: number;
  ops: ChainOps;
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
}> = memo(({ target, effect, index, ops, collapsed, onToggleCollapsed }) => {
  const View = fxView(effectViewKey(effect));
  const title = effectTitle(effect);
  const trackId = target.kind === "track" ? target.trackId : null;
  const patch = useCallback(
    (p: Partial<TrackEffect>) => ops.update(effect.id, p),
    [ops, effect.id]
  );
  const width = View
    ? FX_VIEW_WIDTH
    : (DEVICE_WIDTHS as Record<string, number>)[effect.type] ?? "max-content";
  return (
    <DeviceCard
      title={title}
      kind={effect.type === "fable" ? "FableSynth FX" : "Audio effect"}
      collapsed={collapsed}
      onToggleCollapsed={() => onToggleCollapsed(effect.id)}
      enabled={effect.enabled}
      onEnabledChange={(enabled) => ops.update(effect.id, { enabled })}
      onRemove={() => ops.remove(effect.id)}
      index={index}
      onMove={ops.move}
      width={width}
      testId={`device-effect-${effect.id}`}
    >
      {View ? (
        <PanelErrorBoundary panelName={`${title} device`}>
          <Suspense fallback={<DeviceFallback label={title} />}>
            <View trackId={trackId} effectId={effect.id} />
          </Suspense>
        </PanelErrorBoundary>
      ) : effect.type === "fable" ? (
        <Caption color="secondary">This effect has no editor yet.</Caption>
      ) : (
        <TrackEffectParams effect={effect} onPatch={patch} disabled={!effect.enabled} />
      )}
    </DeviceCard>
  );
});
EffectDevice.displayName = "EffectDevice";

const InstrumentDevice: React.FC<{
  track: TimelineTrack;
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
}> = memo(({ track, collapsed, onToggleCollapsed }) => {
  const type = track.instrument?.type;
  const View = instrumentView(type);
  const title = type ? INSTRUMENT_NAMES[type] : "Instrument";
  return (
    <DeviceCard
      title={title}
      kind="Instrument"
      collapsed={collapsed}
      onToggleCollapsed={() => onToggleCollapsed("instrument")}
      width={View ? INSTRUMENT_VIEW_WIDTH : 360}
      testId={`device-instrument-${track.id}`}
    >
      {View ? (
        <PanelErrorBoundary panelName={`${title} device`}>
          <Suspense fallback={<DeviceFallback label={title} />}>
            <View trackId={track.id} />
          </Suspense>
        </PanelErrorBoundary>
      ) : (
        <TrackInstrumentPanel trackId={track.id} />
      )}
    </DeviceCard>
  );
});
InstrumentDevice.displayName = "InstrumentDevice";

const AddEffectCard: React.FC<{ onAdd: (effect: TrackEffect["type"] | TrackEffect) => void }> = memo(
  ({ onAdd }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const close = useCallback(() => setAnchor(null), []);
    return (
      <div className="device-chain__add">
        <ToolbarIconButton
          icon={<AddIcon />}
          tooltip="Add an effect"
          aria-label="Add an effect"
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          onClick={(event) => setAnchor(event.currentTarget)}
        />
        <EditorMenu anchorEl={anchor} open={!!anchor} onClose={close}>
          {NATIVE_TYPES.map((type) => (
            <MenuItemPrimitive
              key={type}
              label={(EFFECT_LABELS as Record<string, string>)[type] ?? type}
              onClick={() => {
                close();
                onAdd(type);
              }}
            />
          ))}
          {FABLE_FX_KINDS.map((kind) => (
            <MenuItemPrimitive
              key={`fable:${kind}`}
              label={`FableSynth ${FABLE_FX_LABELS[kind]}`}
              onClick={() => {
                close();
                onAdd(makeFableEffect(kind));
              }}
            />
          ))}
        </EditorMenu>
      </div>
    );
  }
);
AddEffectCard.displayName = "AddEffectCard";

export interface DeviceChainViewProps {
  target: DeviceTarget | null;
  onTargetChange: (target: DeviceTarget) => void;
}

export const DeviceChainView: React.FC<DeviceChainViewProps> = memo(({ target, onTargetChange }) => {
  const theme = useTheme();
  const isMobile = useTimelineIsMobile();
  const tracks = useTimelineStore((s) => s.tracks);
  const deviceTracks = useMemo(() => tracks.filter(isDeviceTrack), [tracks]);
  const track =
    target?.kind === "track" ? deviceTracks.find((t) => t.id === target.trackId) ?? null : null;
  const resolved: DeviceTarget | null =
    target?.kind === "master" ? target : track ? { kind: "track", trackId: track.id } : null;
  const ops = useChainOps(resolved);

  // Collapsed devices, by channel and device id, for this session.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const channelKey = resolved?.kind === "master" ? MASTER_TARGET_VALUE : track?.id ?? "";
  const toggleCollapsed = useCallback(
    (deviceId: string) =>
      setCollapsed((prev) => {
        const key = `${channelKey}:${deviceId}`;
        return { ...prev, [key]: !prev[key] };
      }),
    [channelKey]
  );
  const isCollapsed = (deviceId: string): boolean => !!collapsed[`${channelKey}:${deviceId}`];

  const pickerValue = resolved?.kind === "master" ? MASTER_TARGET_VALUE : track?.id ?? "";
  const pick = useCallback(
    (value: string) =>
      onTargetChange(value === MASTER_TARGET_VALUE ? { kind: "master" } : { kind: "track", trackId: value }),
    [onTargetChange]
  );
  const layoutCss = useMemo(() => layoutStyles(theme, isMobile), [theme, isMobile]);

  const picker = isMobile ? (
    <SelectField
      label="Channel"
      hideLabel
      size="small"
      value={pickerValue || MASTER_TARGET_VALUE}
      options={[
        ...deviceTracks.map((t) => ({ value: t.id, label: t.name })),
        { value: MASTER_TARGET_VALUE, label: "Master" }
      ]}
      onChange={pick}
    />
  ) : (
    <FlexColumn gap={SPACING.micro} role="listbox" aria-label="Channel">
      {deviceTracks.map((t) => (
        <SelectableListItem
          key={t.id}
          selected={pickerValue === t.id}
          onClick={() => pick(t.id)}
          role="option"
          aria-selected={pickerValue === t.id}
        >
          <FlexColumn sx={{ minWidth: 0 }}>
            <TruncatedText>{t.name}</TruncatedText>
            <Caption color="secondary">
              {t.type === "midi" ? INSTRUMENT_NAMES[t.instrument?.type ?? "subtractive"] : "Audio"}
            </Caption>
          </FlexColumn>
        </SelectableListItem>
      ))}
      <SelectableListItem
        selected={pickerValue === MASTER_TARGET_VALUE}
        onClick={() => pick(MASTER_TARGET_VALUE)}
        role="option"
        aria-selected={pickerValue === MASTER_TARGET_VALUE}
      >
        <Text size="small">Master</Text>
      </SelectableListItem>
    </FlexColumn>
  );

  return (
    <div css={layoutCss} data-testid="daw-device-chain">
      <div className="device-chain__picker">{picker}</div>
      {resolved === null ? (
        <EmptyState
          title="No channel selected"
          description="Select an audio or MIDI track, or the master, to see its devices."
        />
      ) : (
        <div className="device-chain__rack" aria-label="Device chain">
          {track?.type === "midi" && (
            <InstrumentDevice
              track={track}
              collapsed={isCollapsed("instrument")}
              onToggleCollapsed={toggleCollapsed}
            />
          )}
          {ops.effects.map((effect, index) => (
            <EffectDevice
              key={effect.id}
              target={resolved}
              effect={effect}
              index={index}
              ops={ops}
              collapsed={isCollapsed(effect.id)}
              onToggleCollapsed={toggleCollapsed}
            />
          ))}
          <AddEffectCard onAdd={ops.add} />
        </div>
      )}
    </div>
  );
});

DeviceChainView.displayName = "DeviceChainView";
