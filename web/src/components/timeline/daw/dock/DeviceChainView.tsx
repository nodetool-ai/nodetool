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
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddOutlined";
import type {
  FableEffectKind,
  MidiInstrument,
  TimelineTrack,
  TrackEffect
} from "@nodetool-ai/timeline";

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
  MOTION,
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
import { DeviceCard, type DeviceCardProps } from "./DeviceCard";

type DeviceCardLayout = NonNullable<DeviceCardProps["layout"]>;

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
  sampler: "Sampler",
  vst: "VST"
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
 * no width of their own: an instrument fills the rack beside the add card, up
 * to the width its panels were drawn for. An effect panel has a fixed drawn
 * width (`fxBase.css`), so its card fits it: that width plus the card body's
 * padding and scrollbar gutter. The Lab row of five takes a share of the rack.
 */
// 44px: the add card (36px) and the rack gap (8px).
const INSTRUMENT_VIEW_WIDTH = "clamp(340px, calc(100% - 44px), 1420px)";
const FX_CARD_EXTRA = 20;
const FX_VIEW_WIDTHS: Record<FableEffectKind, number | string> = {
  eq: 420 + FX_CARD_EXTRA,
  ott: 420 + FX_CARD_EXTRA,
  comp: 420 + FX_CARD_EXTRA,
  drive: 300 + FX_CARD_EXTRA,
  chorus: 300 + FX_CARD_EXTRA,
  echo: 300 + FX_CARD_EXTRA,
  reverb: 300 + FX_CARD_EXTRA,
  lab: "clamp(560px, 70%, 1120px)"
};
const FX_VIEW_WIDTH = 480;

/**
 * The width a registered effect view is drawn for. A view sizes itself by
 * container queries, so its container must set this width: at `max-content`
 * the view collapses to its narrowest control.
 */
export function effectViewWidth(effect: TrackEffect): number | string {
  return effect.type === "fable" ? FX_VIEW_WIDTHS[effect.kind] : FX_VIEW_WIDTH;
}

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
    // On a phone the devices stack and the rack scrolls down; on a wider
    // screen they run left to right and the rack scrolls across.
    ".device-chain__rack": {
      flex: "1 1 auto",
      minWidth: 0,
      minHeight: 0,
      display: "flex",
      flexDirection: mobile ? "column" : "row",
      alignItems: "stretch",
      gap: theme.spacing(SPACING.md),
      padding: theme.spacing(SPACING.md),
      overflowX: mobile ? "hidden" : "auto",
      overflowY: mobile ? "auto" : "hidden",
      overscrollBehavior: "contain",
      scrollbarWidth: "thin"
    },
    ".device-chain__add": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: mobile ? "100%" : theme.spacing(SPACING.xxxl + SPACING.xs),
      minHeight: mobile ? theme.spacing(SPACING.xxxl + SPACING.md) : undefined,
      boxSizing: "border-box",
      border: `1px dashed ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.md,
      transition: MOTION.border,
      "&:hover, &:focus-within": { borderColor: theme.vars.palette.text.secondary }
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

const DeviceFallback: React.FC<{ label: string }> = ({ label }) => {
  const { t } = useTranslation();
  return (
  <FlexColumn align="center" justify="center" sx={{ minHeight: 0, flex: 1, p: SPACING.md }}>
    <LoadingSpinner size="small" text={t("batch2_26.daw.devices.loading", { label })} />
  </FlexColumn>
  );
};

const EffectDevice: React.FC<{
  target: DeviceTarget;
  effect: TrackEffect;
  index: number;
  ops: ChainOps;
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  layout: DeviceCardLayout;
}> = memo(({ target, effect, index, ops, collapsed, onToggleCollapsed, layout }) => {
  const { t } = useTranslation();
  const View = fxView(effectViewKey(effect));
  const title = effectTitle(effect);
  const trackId = target.kind === "track" ? target.trackId : null;
  const patch = useCallback(
    (p: Partial<TrackEffect>) => ops.update(effect.id, p),
    [ops, effect.id]
  );
  const width = View
    ? effectViewWidth(effect)
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
      layout={layout}
      testId={`device-effect-${effect.id}`}
    >
      {View ? (
        <PanelErrorBoundary panelName={`${title} device`}>
          <Suspense fallback={<DeviceFallback label={title} />}>
            <View trackId={trackId} effectId={effect.id} />
          </Suspense>
        </PanelErrorBoundary>
      ) : effect.type === "fable" ? (
        <Caption color="secondary">{t("batch2_26.daw.effects.noEditor")}</Caption>
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
  layout: DeviceCardLayout;
}> = memo(({ track, collapsed, onToggleCollapsed, layout }) => {
  const type = track.instrument?.type;
  const View = instrumentView(type);
  const vstPlugin = track.instrument?.type === "vst" ? track.instrument.plugin : null;
  const title = vstPlugin ? vstPlugin.name : type ? INSTRUMENT_NAMES[type] : "Instrument";
  return (
    <DeviceCard
      title={title}
      kind={type === "vst" ? "VST3 instrument" : "Instrument"}
      collapsed={collapsed}
      onToggleCollapsed={() => onToggleCollapsed("instrument")}
      // The VST view is a plug-in picker; the plug-in draws in its own window.
      width={View && type !== "vst" ? INSTRUMENT_VIEW_WIDTH : 360}
      layout={layout}
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
    const { t } = useTranslation();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const close = useCallback(() => setAnchor(null), []);
    return (
      <div className="device-chain__add">
        <ToolbarIconButton
          icon={<AddIcon />}
          tooltip={t("batch2_26.daw.effects.add")}
          aria-label={t("batch2_26.daw.effects.add")}
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
  const { t } = useTranslation();
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
  const cardLayout: DeviceCardLayout = isMobile ? "stack" : "row";

  const picker = isMobile ? (
    <SelectField
      label={t("batch2_26.daw.devices.channel")}
      hideLabel
      size="small"
      value={pickerValue || MASTER_TARGET_VALUE}
      options={[
      ...deviceTracks.map((trackItem) => ({ value: trackItem.id, label: trackItem.name })),
        { value: MASTER_TARGET_VALUE, label: t("batch2_26.daw.transport.master") }
      ]}
      onChange={pick}
    />
  ) : (
    <FlexColumn gap={SPACING.micro} role="listbox" aria-label={t("batch2_26.daw.devices.channel")}>
      {deviceTracks.map((trackItem) => (
        <SelectableListItem
          key={trackItem.id}
          selected={pickerValue === trackItem.id}
          onClick={() => pick(trackItem.id)}
          role="option"
          aria-selected={pickerValue === trackItem.id}
        >
          <FlexColumn sx={{ minWidth: 0 }}>
            <TruncatedText>{trackItem.name}</TruncatedText>
            <Caption color="secondary">
              {trackItem.type === "midi" ? INSTRUMENT_NAMES[trackItem.instrument?.type ?? "subtractive"] : t("batch2_26.daw.devices.audio")}
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
        <Text size="small">{t("batch2_26.daw.transport.master")}</Text>
      </SelectableListItem>
    </FlexColumn>
  );

  return (
    <div css={layoutCss} data-testid="daw-device-chain">
      <div className="device-chain__picker">{picker}</div>
      {resolved === null ? (
        <EmptyState
          title={t("batch2_26.daw.devices.noChannelSelected")}
          description={t("batch2_26.daw.devices.noChannelSelectedDescription")}
        />
      ) : (
        <div className="device-chain__rack" aria-label={t("batch2_26.daw.devices.deviceChain")}>
          {track?.type === "midi" && (
            <InstrumentDevice
              track={track}
              collapsed={isCollapsed("instrument")}
              onToggleCollapsed={toggleCollapsed}
              layout={cardLayout}
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
              layout={cardLayout}
            />
          ))}
          <AddEffectCard onAdd={ops.add} />
        </div>
      )}
    </div>
  );
});

DeviceChainView.displayName = "DeviceChainView";
