/**
 * The BL-1 editor for one bass track: FableSynth's oscillator, sub, filter,
 * envelopes, LFO, accent and slide, FX chain, patch browser and keys, bound
 * to the track's instrument. Knob drags write the document once per frame,
 * with one undo entry per drag; the keys play the track's live device.
 */

import React, { useEffect, useMemo } from "react";

import {
  useTimelinePlaybackStoreApi,
  useTimelineStoreApi
} from "../../../../stores/timeline/TimelineInstance";
import { BassStoreProvider } from "../fablesynth/bass/bassStoreContext";
import { BassDeviceBody } from "../fablesynth/bass/components/BassDeviceBody";
import { Header } from "../fablesynth/bass/components/Header";
import { createBassStore } from "../fablesynth/bass/store";
import type { InstrumentDeviceViewProps } from "./deviceViews";

import "../fablesynth/bass/bl1Base.css";
import "../fablesynth/bass/bass.css";

export default function Bl1DeviceView({ trackId }: InstrumentDeviceViewProps): React.JSX.Element {
  const doc = useTimelineStoreApi();
  const playback = useTimelinePlaybackStoreApi();
  const store = useMemo(
    () => createBassStore({ trackId, doc, playback }),
    [trackId, doc, playback]
  );

  useEffect(() => store.getState().start(), [store]);

  return (
    <BassStoreProvider store={store}>
      <div className="fablesynth fablesynth-bl1" data-device="bl1" data-track-id={trackId}>
        <main className="bass-rack" aria-label="BL-1 bass synth">
          <Header />
          <BassDeviceBody />
        </main>
      </div>
    </BassStoreProvider>
  );
}
