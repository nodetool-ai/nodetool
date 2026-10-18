/**
 * The DR-1 editor for one drum track: FableSynth's pad grid, pad sections,
 * kit mix, FX rack and kit and patch browsers, bound to the track's
 * instrument. Edits reach the live device at once and the document once per
 * frame, with one undo entry per drag.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { DrumMidiInstrument } from "@nodetool-ai/timeline";

import {
  useTimelinePlaybackStore,
  useTimelineStore,
  useTimelineStoreApi
} from "../../../../stores/timeline/TimelineInstance";
import { useBatchedGesture } from "../../../../hooks/timeline/useBatchedGesture";
import {
  createDrumStore,
  DrumStoreProvider,
  type DrumStoreApi,
  type Dr1StoreHost
} from "../fablesynth/drum/dr1Store";
import { Header } from "../fablesynth/drum/components/Header";
import { DrumDeviceBody } from "../fablesynth/drum/components/DrumDeviceBody";
import { loadDrumAssets } from "../fablesynth/drum/engine/drumAssets";
import type { InstrumentDeviceViewProps } from "./deviceViews";
import { Dr1Device } from "./dr1Device";
import { dr1InstrumentFromParams, dr1PadNames, dr1ParamsFromInstrument } from "./dr1Params";

import "../fablesynth/drum/dr1Base.css";
import "../fablesynth/drum/drum.css";

function useDrumInstrument(trackId: string): DrumMidiInstrument | null {
  return useTimelineStore((state) => {
    const instrument = state.tracks.find((track) => track.id === trackId)?.instrument;
    return instrument?.type === "drum" ? instrument : null;
  });
}

/** Keeps the store's device, analyser and transport state in step with the timeline. */
function useDeviceBinding(store: DrumStoreApi, trackId: string): void {
  const audioGraph = useTimelinePlaybackStore((state) => state.audioGraph);
  const playing = useTimelinePlaybackStore((state) => state.isPlaying);
  const docApi = useTimelineStoreApi();

  useEffect(() => {
    store.getState().attach({ playing });
  }, [store, playing]);

  useEffect(() => {
    let cancelled = false;
    loadDrumAssets().then(
      (assets) => {
        if (!cancelled) store.getState().attach({ assets });
      },
      (error: unknown) => console.error("[DR-1] samples failed to load", error)
    );
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    const track = docApi.getState().tracks.find((t) => t.id === trackId);
    if (!audioGraph || !track) {
      store.getState().attach({ device: null, analyser: null });
      return;
    }
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    void audioGraph.ensureTrackDevice(track).then((device) => {
      if (cancelled || !(device instanceof Dr1Device)) return;
      store.getState().attach({ device, analyser: audioGraph.getTrackAnalyser(trackId) });
      cleanups.push(
        device.subscribeHits((pads) => {
          const now = performance.now();
          store.setState((state) => {
            const hitTick = { ...state.hitTick };
            for (const pad of pads) hitTick[pad] = now;
            return { hitTick };
          });
        }),
        device.subscribeViz((viz) =>
          store.setState({ modPosA: viz.a, modPosB: viz.b, envLevel: viz.env })
        )
      );
    });
    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
      store.getState().attach({ device: null, analyser: null });
    };
  }, [store, audioGraph, docApi, trackId]);
}

function Dr1Editor({ trackId, instrument }: { trackId: string; instrument: DrumMidiInstrument }): React.JSX.Element {
  const docApi = useTimelineStoreApi();
  const lastWritten = useRef<DrumMidiInstrument | null>(null);
  const gestureOpen = useRef(false);
  const gesture = useBatchedGesture<DrumMidiInstrument>((next) => {
    lastWritten.current = next;
    docApi.getState().setTrackInstrument(trackId, next);
  });
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;

  const host = useMemo<Dr1StoreHost>(() => ({
    write: (params, padNames) => {
      const track = docApi.getState().tracks.find((t) => t.id === trackId);
      if (track?.instrument?.type !== "drum") return;
      const next = dr1InstrumentFromParams(track.instrument, params, padNames);
      if (gestureOpen.current) {
        gestureRef.current.schedule(next);
      } else {
        gestureRef.current.begin();
        gestureRef.current.commit(next);
      }
    },
    beginGesture: () => {
      gestureOpen.current = true;
      gestureRef.current.begin();
    },
    endGesture: () => {
      gestureOpen.current = false;
      gestureRef.current.commit();
    }
  }), [docApi, trackId]);

  const [store] = useState(() =>
    createDrumStore(host, dr1ParamsFromInstrument(instrument), dr1PadNames(instrument))
  );

  // An outside change (undo, the inspector) replaces what the editor shows.
  useEffect(() => {
    if (instrument === lastWritten.current) return;
    store.getState().syncFromTrack(dr1ParamsFromInstrument(instrument), dr1PadNames(instrument));
  }, [store, instrument]);

  useDeviceBinding(store, trackId);

  return (
    <DrumStoreProvider store={store}>
      <div className="fablesynth dr1-device" data-testid="dr1-device">
        <main className="drum-rack-slot">
          <Header />
          <DrumDeviceBody />
        </main>
      </div>
    </DrumStoreProvider>
  );
}

export default function Dr1DeviceView({ trackId }: InstrumentDeviceViewProps): React.JSX.Element | null {
  const instrument = useDrumInstrument(trackId);
  if (!instrument) return null;
  return <Dr1Editor key={trackId} trackId={trackId} instrument={instrument} />;
}
