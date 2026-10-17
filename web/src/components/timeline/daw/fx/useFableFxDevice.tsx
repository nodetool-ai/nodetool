/**
 * Binds a `fable` track (or master) effect to the upstream FableSynth FX
 * panels: an `FxPanelAdapter` whose params are the effect's resolved params,
 * whose writes go through the timeline store with one undo entry per drag,
 * and whose telemetry engine is the effect's running `fable-fx` worklet.
 */

import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveTempo, type TrackEffect, type TrackFableEffect } from "@nodetool-ai/timeline";

import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useBatchedGesture } from "../../../../hooks/timeline/useBatchedGesture";
import type { FxPanelAdapter, FxTelemetryEngine } from "../fablesynth/components/panels/fxAdapter";
import { PARAMS } from "../fablesynth/params";
import { SC_SOURCES } from "../fablesynth/engine/sidechain";
import { FxKnob, FxPower, FxStepper } from "./FxControls";
import { FABLE_FX_LABELS, FABLE_FX_ON_PARAM, resolvedFableFxParams } from "./fableFxParams";
import type { FableFxHandle } from "./fableFxUnit";

const SILENT: FxTelemetryEngine = {
  ctx: null,
  subscribeDynamics: () => () => {},
  subscribeEcho: () => () => {},
  subscribeReverb: () => () => {}
};

/** How often a view looks for its effect's worklet after a chain rebuild. */
const HANDLE_POLL_MS = 400;

function findEffect(
  effects: readonly TrackEffect[] | undefined,
  effectId: string
): TrackFableEffect | null {
  const effect = effects?.find((e) => e.id === effectId);
  return effect && effect.type === "fable" ? effect : null;
}

export interface FableFxDevice {
  effect: TrackFableEffect | null;
  adapter: FxPanelAdapter | null;
}

export function useFableFxDevice(trackId: string | null, effectId: string): FableFxDevice {
  const effect = useTimelineStore((s) =>
    findEffect(
      trackId === null ? s.master?.effects : s.tracks.find((t) => t.id === trackId)?.effects,
      effectId
    )
  );
  const updateTrackEffect = useTimelineStore((s) => s.updateTrackEffect);
  const updateMasterEffect = useTimelineStore((s) => s.updateMasterEffect);
  const graph = useTimelinePlaybackStore((s) => s.audioGraph);

  const patch = useCallback(
    (next: Partial<TrackFableEffect>) => {
      if (trackId === null) updateMasterEffect(effectId, next);
      else updateTrackEffect(trackId, effectId, next);
    },
    [trackId, effectId, updateTrackEffect, updateMasterEffect]
  );

  // Params written this gesture but not yet in the store, so consecutive
  // ticks build on each other instead of on the last committed record.
  const pendingRef = useRef<Record<string, number> | null>(null);
  const effectRef = useRef(effect);
  effectRef.current = effect;
  const gesture = useBatchedGesture<Record<string, number>>((params) => {
    patch({ params });
  });

  const write = useCallback(
    (id: string, value: number) => {
      const current = effectRef.current;
      if (!current) return;
      const base = pendingRef.current ?? current.params;
      const params = { ...base, [id]: value };
      pendingRef.current = params;
      gesture.schedule(params);
    },
    [gesture]
  );

  const end = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = null;
    gesture.commit();
  }, [gesture]);

  const set = useCallback(
    (id: string, value: number) => {
      write(id, value);
      end();
    },
    [write, end]
  );

  // Panels that drag through `setParam` (EQ nodes) give no gesture end, so
  // the gesture closes on the pointer release; any other write closes now.
  const pointerDown = useRef(false);
  useEffect(() => {
    const down = (): void => {
      pointerDown.current = true;
    };
    const up = (): void => {
      pointerDown.current = false;
      end();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [end]);

  const kind = effect?.kind;
  const onParam = kind ? FABLE_FX_ON_PARAM[kind] : null;
  const enabled = effect?.enabled ?? false;

  const setParam = useCallback(
    (id: string, value: number) => {
      if (id === onParam) {
        patch({ enabled: value > 0.5 });
        return;
      }
      write(id, value);
      if (!pointerDown.current) end();
    },
    [onParam, patch, write, end]
  );

  const handle = useFableFxHandle(effectId);
  const sampleRate = graph?.context?.sampleRate;
  const engine = useMemo<FxTelemetryEngine>(
    () => handle ?? { ...SILENT, ctx: sampleRate ? { sampleRate } : null },
    [handle, sampleRate]
  );

  const stored = effect?.params;
  const params = useMemo(() => {
    if (!effect) return {};
    const resolved = resolvedFableFxParams(effect);
    if (onParam) resolved[onParam] = enabled ? 1 : 0;
    return resolved;
    // `stored` stands for the effect's params; the rest of `effect` is read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, kind, onParam, enabled]);

  const tap = trackId === null ? graph?.getMasterAnalyser() ?? null : graph?.getTrackAnalyser(trackId) ?? null;
  const bpm = useTimelineStore((s) => resolveTempo(s).bpm);

  const adapter = useMemo<FxPanelAdapter | null>(() => {
    if (!effect || !kind) return null;
    const knob = (id: string, key?: string, accent?: string): React.ReactNode => {
      const def = PARAMS[id];
      if (!def) return null;
      return (
        <FxKnob
          def={def}
          value={params[id] ?? def.def}
          onChange={(v) => write(id, v)}
          onSet={(v) => set(id, v)}
          onGestureEnd={end}
          size="sm"
          accent={accent ?? "n"}
          label={id.startsWith("fx.eq.") ? key?.toUpperCase() : undefined}
        />
      );
    };
    const power = (id: string): React.ReactNode => {
      const on = (params[id] ?? 0) > 0.5;
      return (
        <FxPower
          on={on}
          label={id === onParam ? FABLE_FX_LABELS[kind] : id}
          onToggle={() => (id === onParam ? patch({ enabled: !on }) : set(id, on ? 0 : 1))}
        />
      );
    };
    const stepper = (id: string): React.ReactNode => {
      const def = PARAMS[id];
      if (!def) return null;
      return <FxStepper def={def} value={params[id] ?? def.def} accent="f" onSet={(v) => set(id, v)} />;
    };
    return {
      engine,
      params,
      setParam,
      tape: true,
      bpm,
      analysis: { source: tap, reference: trackId === null ? "mix" : "lead", note: "PLAY TO LEARN" },
      liveSpectrum: tap,
      compTap: { source: tap, postComp: true, style: trackId === null ? "glue" : "level", note: "PLAY TO LEARN" },
      sidechain: { sources: SC_SOURCES, hosted: false },
      renderKnob: knob,
      renderPower: power,
      renderStepper: stepper
    };
  }, [effect, kind, params, engine, setParam, write, set, end, patch, onParam, tap, trackId, bpm]);

  return { effect, adapter };
}

/** The running worklet of an effect, re-found after the chain is rebuilt. */
export function useFableFxHandle(effectId: string): FableFxHandle | null {
  const graph = useTimelinePlaybackStore((s) => s.audioGraph);
  const [handle, setHandle] = useState<FableFxHandle | null>(() => graph?.getFableFx(effectId) ?? null);
  useEffect(() => {
    const look = (): void => {
      const next = graph?.getFableFx(effectId) ?? null;
      setHandle((prev) => (prev === next ? prev : next));
    };
    look();
    const timer = window.setInterval(look, HANDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [graph, effectId]);
  return handle;
}
