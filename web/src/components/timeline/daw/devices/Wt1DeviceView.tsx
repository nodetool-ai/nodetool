/**
 * The WT-1 editor for one wavetable track: FableSynth's oscillators, sub,
 * noise, filters, envelopes, LFOs, mod matrix, FX chain, LAB, preset browser,
 * wavetable editor and keys, bound to the track's instrument.
 *
 * Edits reach the live device at once and the document once per frame, with
 * one undo entry per pointer gesture (a knob drag, a ring drag) and one per
 * burst of wheel or key edits. Undo and edits made elsewhere flow back into
 * the editor from the document.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { WavetableMidiInstrument } from "@nodetool-ai/timeline";

import { useBatchedGesture } from "../../../../hooks/timeline/useBatchedGesture";
import {
  useTimelinePlaybackStore,
  useTimelineStore,
  useTimelineStoreApi
} from "../../../../stores/timeline/TimelineInstance";
import { KeyboardBar } from "../fablesynth/components/panels/KeyboardBar";
import { TopBar } from "../fablesynth/components/panels/TopBar";
import { WavetableEditor } from "../fablesynth/components/WavetableEditor";
import { WtDeviceBody } from "../fablesynth/components/WtDeviceBody";
import { useComputerKeys } from "../fablesynth/hooks/useComputerKeys";
import type { ParamValues } from "../fablesynth/params";
import { createWt1Store, Wt1StoreProvider, type Wt1StoreApi } from "../fablesynth/store";
import type { InstrumentDeviceViewProps } from "./deviceViews";
import { Wt1Device } from "./wt1Device";
import { wt1InstrumentWithParams, wt1ParamsFromInstrument } from "./wt1Params";

import "@fontsource/michroma/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "../fablesynth/index.css";

/** Wheel and key edits closer together than this share one undo entry. */
const QUIET_MS = 400;

function wavetableOf(
  tracks: ReadonlyArray<{ id: string; instrument?: { type: string } }>,
  trackId: string
): WavetableMidiInstrument | null {
  const instrument = tracks.find((t) => t.id === trackId)?.instrument;
  return instrument?.type === "wavetable" ? (instrument as WavetableMidiInstrument) : null;
}

function Wt1Rack({ store }: { store: Wt1StoreApi }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  return (
    <Wt1StoreProvider store={store}>
      <Wt1Keys root={root} />
      <div ref={root} className="fablesynth fablesynth-wt1" data-device="wt1" tabIndex={-1}>
        <WavetableEditor />
        <main className="fs-rack" aria-label="WT-1 wavetable synth">
          <TopBar />
          <WtDeviceBody />
          <KeyboardBar />
        </main>
      </div>
    </Wt1StoreProvider>
  );
}

// Inside the provider, so the keys reach this editor's store.
function Wt1Keys({ root }: { root: React.RefObject<HTMLDivElement | null> }): null {
  useComputerKeys(root);
  return null;
}

export default function Wt1DeviceView({ trackId }: InstrumentDeviceViewProps): React.JSX.Element {
  const doc = useTimelineStoreApi();
  const isWavetable = useTimelineStore((s) => wavetableOf(s.tracks, trackId) !== null);
  const audioGraph = useTimelinePlaybackStore((s) => s.audioGraph);

  // The instrument this editor last wrote, so its own echo is not synced back.
  const lastWritten = useRef<WavetableMidiInstrument | null>(null);
  const pointerDown = useRef(false);
  const quietTimer = useRef<number | null>(null);

  const gesture = useBatchedGesture<ParamValues>((params) => {
    const state = doc.getState();
    const current = wavetableOf(state.tracks, trackId);
    if (!current) return;
    const next = wt1InstrumentWithParams(current, params);
    lastWritten.current = next;
    state.setTrackInstrument(trackId, next);
  });
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;

  const store = useMemo(() => {
    const instrument = wavetableOf(doc.getState().tracks, trackId);
    return createWt1Store({
      params: instrument ? wt1ParamsFromInstrument(instrument) : undefined,
      commit: (params) => {
        const g = gestureRef.current;
        g.schedule(params);
        if (pointerDown.current) return;
        if (quietTimer.current !== null) window.clearTimeout(quietTimer.current);
        quietTimer.current = window.setTimeout(() => {
          quietTimer.current = null;
          gestureRef.current.commit();
        }, QUIET_MS);
      }
    });
  }, [doc, trackId]);

  // Pointer gestures: everything between press and release is one undo entry.
  useEffect(() => {
    const release = () => {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      gestureRef.current.commit();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      if (quietTimer.current !== null) window.clearTimeout(quietTimer.current);
      quietTimer.current = null;
      gestureRef.current.commit();
      store.getState().dispose();
    };
  }, [store]);

  // The document is the source of truth: undo, redo and edits from elsewhere.
  useEffect(
    () =>
      doc.subscribe((state, prev) => {
        if (state.tracks === prev.tracks) return;
        const instrument = wavetableOf(state.tracks, trackId);
        if (!instrument || instrument === lastWritten.current) return;
        store.getState().syncParams(wt1ParamsFromInstrument(instrument));
      }),
    [doc, trackId, store]
  );

  // Follow the track's live device. The graph owns it and may replace it;
  // a detach asks for the current one again.
  const [deviceEpoch, setDeviceEpoch] = useState(0);
  useEffect(() => {
    const link = store.getState().engine;
    return link.onChange(() => {
      if (!link.current) setDeviceEpoch((n) => n + 1);
    });
  }, [store]);
  useEffect(() => {
    const link = store.getState().engine;
    const track = doc.getState().tracks.find((t) => t.id === trackId);
    if (!audioGraph || !track || !isWavetable) {
      link.attach(null);
      return;
    }
    let cancelled = false;
    void audioGraph.ensureTrackDevice(track).then((device) => {
      if (!cancelled && device instanceof Wt1Device && !device.isDisposed) link.attach(device);
    });
    return () => {
      cancelled = true;
    };
  }, [audioGraph, doc, trackId, isWavetable, store, deviceEpoch]);

  if (!isWavetable) {
    return (
      <div className="fablesynth fablesynth-wt1" data-device="wt1">
        <p className="fs-empty">This track does not play WT-1.</p>
      </div>
    );
  }

  return (
    <div
      data-track-id={trackId}
      onPointerDownCapture={() => {
        pointerDown.current = true;
        if (quietTimer.current !== null) {
          window.clearTimeout(quietTimer.current);
          quietTimer.current = null;
        }
      }}
    >
      <Wt1Rack store={store} />
    </div>
  );
}
