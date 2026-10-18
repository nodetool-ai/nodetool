/**
 * The views the DAW lab page can show (`?view=<name>`). Each DAW feature adds
 * its view here so it can be checked in a browser without a backend.
 */

import React, { Suspense, useEffect, useState } from "react";

import { PreviewArea } from "../../preview/PreviewArea";
import { TimelineInspector } from "../../Inspector/TimelineInspector";
import { TracksRegion } from "../../Tracks/TracksRegion";
import { HarmonyPanel } from "../harmony/HarmonyPanel";
import { MixerView } from "../mixer/MixerView";
import { instrumentView } from "../devices/deviceViews";
import "../devices/registerDeviceViews";
import { DawWorkspace } from "../dock/DawWorkspace";
import { useTimelineLayoutStore, type DawDockTab } from "../../../../stores/timeline/TimelineLayoutStore";
import { useTimelineStoreApi } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../../../stores/timeline/TimelineUIStore";
import {
  FABLE_EFFECT_KINDS,
  makeClip,
  makeTrack,
  setKeyframes,
  type FableEffectKind
} from "@nodetool-ai/timeline";
import { useTimelinePlaybackStoreApi } from "../../../../stores/timeline/TimelinePlaybackStore";
import { FABLE_FX_LABELS, makeFableEffect } from "../fx/fableFxParams";
import { FABLE_FX_VIEWS } from "../fx/FableFxDeviceView";

export interface LabView {
  title: string;
  render: () => React.ReactNode;
}

function InstrumentLabView({ type, trackId }: { type: "drum" | "bass" | "wavetable"; trackId: string }): React.JSX.Element {
  const View = instrumentView(type);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Suspense fallback={null}>{View ? <View trackId={trackId} /> : null}</Suspense>
      </div>
      <div style={{ height: 96, flex: "none" }}>
        <PreviewArea fps={30} sequenceWidth={1920} sequenceHeight={1080} />
      </div>
    </div>
  );
}

/** Chord track, arp clip and the harmony panel, with a clip selected (`&clip=`). */
function HarmonyLabView(): React.JSX.Element {
  const uiApi = useTimelineUIStoreApi();
  useEffect(() => {
    const clip = new URLSearchParams(window.location.search).get("clip") ?? "lab-arp-clip";
    uiApi.getState().selectClip(clip);
  }, [uiApi]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TracksRegion heightPx={420} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <HarmonyPanel />
      </div>
    </div>
  );
}

/**
 * A shape on a picture track with Position and Opacity keyframed, selected,
 * beside the inspector: the Premiere-style keyframe rows and the clip's
 * diamonds. `&at=<ms>` parks the playhead.
 */
function KeyframesLabView(): React.JSX.Element {
  const docApi = useTimelineStoreApi();
  const uiApi = useTimelineUIStoreApi();
  const playbackApi = useTimelinePlaybackStoreApi();
  useState(() => {
    const track = makeTrack({ type: "overlay", name: "Graphics" });
    let clip = makeClip({
      name: "Title card",
      sourceType: "imported",
      mediaType: "shape",
      trackId: track.id,
      startMs: 1000,
      durationMs: 4000,
      shapeStyle: { kind: "rect", fill: "#3b82f6", x: 0.35, y: 0.35, width: 0.3, height: 0.3, cornerRadius: 0.02 }
    });
    const key = (atMs: number, x: number, opacity: number) => {
      clip = {
        ...clip,
        animations: setKeyframes(
          clip,
          [
            { property: "offsetX", value: x },
            { property: "offsetY", value: 0 },
            { property: "opacity", value: opacity }
          ],
          atMs
        )
      };
    };
    key(0, -400, 0);
    key(1500, 0, 1);
    key(3000, 300, 1);
    const doc = docApi.getState();
    docApi.setState({ tracks: [track, ...doc.tracks], clips: [clip, ...doc.clips] });
    uiApi.getState().selectClip(clip.id);
    const at = Number(new URLSearchParams(window.location.search).get("at") ?? 2500);
    playbackApi.getState().seek(at);
    return null;
  });
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PreviewArea fps={30} sequenceWidth={1920} sequenceHeight={1080} />
        </div>
        <TracksRegion heightPx={300} />
      </div>
      <div style={{ width: 340, flex: "none", overflow: "auto" }}>
        <TimelineInspector />
      </div>
    </div>
  );
}

const DOCK_TABS: readonly DawDockTab[] = ["mixer", "devices", "pianoRoll", "harmony"];

/** DAW mode as the editor shows it. `&tab=` picks the dock tab. */
function DawLabView(): React.JSX.Element {
  const docApi = useTimelineStoreApi();
  const uiApi = useTimelineUIStoreApi();
  useState(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    useTimelineLayoutStore.setState({
      dawMode: true,
      dawDockTab: DOCK_TABS.find((t) => t === tab) ?? "devices"
    });
    return null;
  });
  useEffect(() => {
    if (useTimelineLayoutStore.getState().dawDockTab !== "pianoRoll") return;
    const clip = docApi.getState().clips.find((c) => c.mediaType === "midi");
    if (clip) uiApi.getState().openPianoRoll(clip.id);
  }, [docApi, uiApi]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <DawWorkspace />
    </div>
  );
}

/** A FableSynth insert on the keys track (added on first mount), its device view and the transport. */
function FxLabView({ kind }: { kind: FableEffectKind }): React.JSX.Element {
  const docApi = useTimelineStoreApi();
  const effectId = `lab-fx-${kind}`;
  useState(() => {
    const keys = docApi.getState().tracks.find((t) => t.id === "lab-keys");
    if (keys && !keys.effects?.some((e) => e.id === effectId)) {
      docApi.getState().addTrackEffect("lab-keys", { ...makeFableEffect(kind), id: effectId });
    }
    return null;
  });
  const View = FABLE_FX_VIEWS[kind];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }} className="fablesynth">
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <View trackId="lab-keys" effectId={effectId} />
      </div>
      <div style={{ height: 96, flex: "none" }}>
        <PreviewArea fps={30} sequenceWidth={1920} sequenceHeight={1080} />
      </div>
    </div>
  );
}

const FX_LAB_VIEWS: Record<string, LabView> = Object.fromEntries(
  FABLE_EFFECT_KINDS.map((kind) => [
    `fx-${kind}`,
    { title: `${FABLE_FX_LABELS[kind]} insert`, render: () => <FxLabView kind={kind} /> }
  ])
);

/** Compact tracks, the mixer, and a transport so the meters have a graph to read. */
function MixerLabView(): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TracksRegion heightPx={180} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <MixerView />
      </div>
      <div style={{ height: 96, flex: "none" }}>
        <PreviewArea fps={30} sequenceWidth={1920} sequenceHeight={1080} />
      </div>
    </div>
  );
}

export const LAB_VIEWS: Record<string, LabView> = {
  mixer: {
    title: "Mixer",
    render: () => <MixerLabView />
  },
  ...FX_LAB_VIEWS,
  daw: {
    title: "DAW mode",
    render: () => <DawLabView />
  },
  "device-bl1": {
    title: "BL-1 device",
    render: () => <InstrumentLabView type="bass" trackId="lab-bass" />
  },
  "device-wt1": {
    title: "WT-1 device",
    render: () => <InstrumentLabView type="wavetable" trackId="lab-keys" />
  },
  "device-wt1-pair": {
    title: "Two WT-1 editors (lab-keys and lab-keys-2, which a driver adds)",
    render: () => {
      const View = instrumentView("wavetable");
      return (
        <div style={{ height: "100%", overflow: "auto" }}>
          <Suspense fallback={null}>
            {View ? <View trackId="lab-keys" /> : null}
            {View ? <View trackId="lab-keys-2" /> : null}
          </Suspense>
          <div style={{ height: 96 }}>
            <PreviewArea fps={30} sequenceWidth={1920} sequenceHeight={1080} />
          </div>
        </div>
      );
    }
  },
  "device-dr1": {
    title: "DR-1 device",
    render: () => <InstrumentLabView type="drum" trackId="lab-drums" />
  },
  tracks: {
    title: "Preview and tracks",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PreviewArea fps={30} sequenceWidth={1920} sequenceHeight={1080} />
        </div>
        <TracksRegion heightPx={360} />
      </div>
    )
  },
  harmony: {
    title: "Chord track and harmony panel",
    render: () => <HarmonyLabView />
  },
  keyframes: {
    title: "Keyframe rows and clip keyframes",
    render: () => <KeyframesLabView />
  }
};
