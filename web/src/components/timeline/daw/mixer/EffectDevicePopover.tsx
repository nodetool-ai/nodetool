/**
 * The device of one insert, opened from a mixer strip: the effect's
 * registered device view (the FableSynth FX panels), or the built-in
 * effect's parameter editor when it has none.
 */

import React, { Suspense, memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PopoverActions } from "@mui/material/Popover";
import type { TrackEffect } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import PanelErrorBoundary from "../../../common/PanelErrorBoundary";
import {
  Caption,
  Dialog,
  FlexColumn,
  LoadingSpinner,
  PanelHeader,
  Popover,
  SPACING
} from "../../../ui_primitives";
import { TrackEffectParams } from "../../Tracks/TrackEffectsPanel";
import { fxView } from "../devices/deviceViews";
import "../devices/registerDeviceViews";
import { effectTitle, effectViewKey, effectViewWidth } from "../dock/DeviceChainView";

export interface OpenEffect {
  /** The track carrying the effect, or null for the master. */
  trackId: string | null;
  effectId: string;
  anchor: HTMLElement;
}

export interface EffectDevicePopoverProps {
  open: OpenEffect | null;
  onClose: () => void;
}

const NO_EFFECTS: TrackEffect[] = [];

/** D67: a popover holds a device with at most this many parameters. */
export const POPOVER_MAX_PARAMS = 3;

/** The number of parameters an insert's editor shows. */
export function effectParamCount(effect: TrackEffect): number {
  switch (effect.type) {
    case "gain":
      return 1;
    case "filter":
      return 3;
    case "fable":
      // A FableSynth stage is a full device panel, never a popover.
      return Math.max(POPOVER_MAX_PARAMS + 1, Object.keys(effect.params).length);
    default:
      // Every other field of the effect besides id, type and enabled.
      return Object.keys(effect).length - 3;
  }
}

/** True when the anchor sits in the lower half of the window. */
function opensUpward(anchor: HTMLElement): boolean {
  if (typeof window === "undefined") return false;
  const rect = anchor.getBoundingClientRect();
  return rect.top + rect.height / 2 > window.innerHeight / 2;
}

export const EffectDevicePopover: React.FC<EffectDevicePopoverProps> = memo(
  ({ open, onClose }) => {
    const { t } = useTranslation();
    const trackId = open?.trackId ?? null;
    const effects = useTimelineStore((s) =>
      trackId === null
        ? s.master?.effects ?? NO_EFFECTS
        : s.tracks.find((t) => t.id === trackId)?.effects ?? NO_EFFECTS
    );
    const effect = open ? effects.find((e) => e.id === open.effectId) ?? null : null;
    const updateTrackEffect = useTimelineStore((s) => s.updateTrackEffect);
    const updateMasterEffect = useTimelineStore((s) => s.updateMasterEffect);
    const patch = useCallback(
      (p: Partial<TrackEffect>) => {
        if (!open) return;
        if (open.trackId === null) updateMasterEffect(open.effectId, p);
        else updateTrackEffect(open.trackId, open.effectId, p);
      },
      [open, updateMasterEffect, updateTrackEffect]
    );

    // The device view loads lazily and grows after the popover has measured
    // itself; re-place it whenever its content changes size.
    const actions = useRef<PopoverActions | null>(null);
    const [content, setContent] = useState<HTMLDivElement | null>(null);
    useEffect(() => {
      if (!content || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => actions.current?.updatePosition());
      observer.observe(content);
      return () => observer.disconnect();
    }, [content]);

    if (!open || !effect) return null;
    const View = fxView(effectViewKey(effect));
    const title = effectTitle(effect);
    // Open toward the roomier side of the window, so the device sits beside
    // its strip instead of being pushed back over it.
    const vertical = opensUpward(open.anchor) ? "top" : "bottom";
    const horizontal = open.trackId === null ? "right" : "left";
    const deviceBody = (
      <FlexColumn ref={setContent} sx={{ minWidth: 0 }}>
        {/* A device view gets the dock card's body padding, which its
            width allows for. */}
        <FlexColumn sx={{ p: View ? SPACING.xs : SPACING.md, overflow: "auto" }}>
          {View ? (
            <PanelErrorBoundary panelName={`${title} device`}>
              <Suspense fallback={<LoadingSpinner size="small" text={`Loading ${title}`} />}>
                <View trackId={open.trackId} effectId={effect.id} />
              </Suspense>
            </PanelErrorBoundary>
          ) : effect.type === "fable" ? (
            <Caption color="secondary">{t("batch2_26.daw.effects.noEditor")}</Caption>
          ) : (
            <TrackEffectParams effect={effect} onPatch={patch} disabled={!effect.enabled} />
          )}
        </FlexColumn>
      </FlexColumn>
    );
    // D67: a device with more than 3 parameters opens in a window, never a
    // popover over the strips.
    if (effectParamCount(effect) > POPOVER_MAX_PARAMS) {
      return (
        <Dialog
          open
          onClose={onClose}
          title={title}
          hideBackdrop
          disableScrollLock
          maxWidth={false}
          aria-label={`${title} device`}
          data-testid="mixer-effect-window"
        >
          <FlexColumn sx={{ width: View ? effectViewWidth(effect) : "max-content", maxWidth: "100%" }}>
            {deviceBody}
          </FlexColumn>
        </Dialog>
      );
    }
    return (
      <Popover
        open
        action={actions}
        anchorEl={open.anchor}
        onClose={onClose}
        placement={`${vertical}-${horizontal}`}
        // A device view has no intrinsic width; give it the width it was
        // drawn for, as the dock's device chain does.
        paperSx={{ width: View ? effectViewWidth(effect) : "max-content" }}
        maxWidth="100vw"
        maxHeight="90vh"
        aria-label={`${title} device`}
      >
        <PanelHeader title={title} onClose={onClose} />
        {deviceBody}
      </Popover>
    );
  }
);
EffectDevicePopover.displayName = "EffectDevicePopover";
