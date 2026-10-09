import type {
  TimelineOp,
  TimelineOpState,
  TimelineOpContext
} from "../ops/index.js";
import { directState } from "./ops.js";
import type {
  TimelineClip,
  TimelineTrack,
  TimelineTempo
} from "../types.js";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  findInstrumentPreset
} from "../index.js";

export interface HostOpFixture {
  name: string;
  initial(): TimelineOpState;
  op: TimelineOp;
  error?: RegExp;
  clips?: Array<Partial<TimelineClip>>;
  tracks?: Array<Partial<TimelineTrack>>;
  tempo?: TimelineTempo;
  clipCount?: number;
  result?: Record<string, unknown>;
  context?: Partial<TimelineOpContext>;
}
function sourceAsset(id: string, durationMs: number) {
  return { id, name: "Source", contentType: "video/mp4", durationMs };
}
function linked(): TimelineOpState {
  const state = directState();
  const first = state.clips[0];
  first.startMs = 2000;
  first.durationMs = 6000;
  first.linkId = "linked_pair";
  const second = structuredClone(first);
  second.id = "linked_audio";
  second.trackId = "track_audio";
  second.mediaType = "audio";
  second.startMs = 1000;
  second.durationMs = 4000;
  state.tracks.push({
    ...state.tracks[0],
    id: "track_audio",
    name: "Audio",
    type: "audio",
    index: state.tracks.length
  });
  state.clips.push(second);
  return state;
}
function snapState(): TimelineOpState {
  const state = directState();
  state.clips[0].startMs = 120;
  state.clips[0].durationMs = 960;
  state.clips[0].inPointMs = 200;
  return state;
}
export const HOST_OP_FIXTURES: readonly HostOpFixture[] = [
  {
    name: "an implicit MIDI track preserves the host voice and existing tempo",
    initial: () => ({
      ...directState(),
      tracks: [],
      clips: [],
      tempo: { ...DEFAULT_TEMPO, bpm: 90 }
    }),
    op: { op: "add_midi_clip", duration_ms: 3000 },
    context: {
      defaultMidiInstrument: findInstrumentPreset("wt1-prime-lead")!.instrument
    },
    tracks: [
      {
        id: "track_1",
        type: "midi",
        instrument: findInstrumentPreset("wt1-prime-lead")!.instrument
      }
    ],
    tempo: { ...DEFAULT_TEMPO, bpm: 90 }
  },
  {
    name: "the first MIDI clip creates a voiced track and stores its tempo",
    initial: () => ({
      ...directState(),
      tracks: [],
      clips: [],
      tempo: undefined
    }),
    op: { op: "add_midi_clip", duration_ms: 3000 },
    context: { defaultMidiInstrument: DEFAULT_MIDI_INSTRUMENT },
    tracks: [
      { id: "track_1", type: "midi", instrument: DEFAULT_MIDI_INSTRUMENT }
    ],
    tempo: DEFAULT_TEMPO,
    clips: [{ id: "clip_1", trackId: "track_1", mediaType: "midi" }]
  },
  {
    name: "generated images prefer the video lane over an earlier overlay",
    initial: () => {
      const state = directState();
      state.tracks = [
        state.tracks[1],
        state.tracks[0],
        ...state.tracks.slice(2)
      ];
      return state;
    },
    op: {
      op: "generate_clip",
      kind: "text-to-image",
      prompt: "A picture",
      autoGenerate: false
    },
    clips: [{ id: "clip_1", trackId: "track_a" }]
  },
  {
    name: "a glTF asset imports as a 3D clip",
    initial: directState,
    op: { op: "add_media_clip", asset: "asset_glb" },
    context: {
      resolveAsset: async () => ({
        id: "asset_glb",
        name: "Scene.glb",
        contentType: "model/gltf-binary"
      })
    },
    clips: [{ id: "clip_1", mediaType: "model3d", currentAssetId: "asset_glb" }]
  },
  {
    name: "a host may use fallback duration for unprobed video",
    initial: directState,
    op: { op: "add_media_clip", asset: "asset_1" },
    context: {
      allowUnknownMediaDuration: true,
      resolveAsset: async () => ({
        id: "asset_1",
        name: "Unprobed.mp4",
        contentType: "video/mp4",
        thumbnailAssetId: "thumb_1"
      })
    },
    clips: [{ id: "clip_1", durationMs: 4000, thumbnailAssetId: "thumb_1" }]
  },
  {
    name: "a compound trim validates the final source window",
    initial: () => {
      const s = directState();
      Object.assign(s.clips[0], {
        durationMs: 1000,
        inPointMs: 0,
        outPointMs: 1000
      });
      return s;
    },
    op: {
      op: "trim_clip",
      target: "clip_a",
      durationMs: 2000,
      inPointMs: 1500
    },
    context: { resolveAsset: async (ref) => sourceAsset(ref, 10000) },
    clips: [
      { id: "clip_a", durationMs: 2000, inPointMs: 1500, outPointMs: 2000 }
    ]
  },
  {
    name: "a trim cannot grow a clip past its known source",
    initial: () => {
      const s = directState();
      Object.assign(s.clips[0], { durationMs: 1000, inPointMs: 0, outPointMs: 1000 });
      return s;
    },
    op: { op: "trim_clip", target: "clip_a", durationMs: 3000 },
    context: { resolveAsset: async (ref) => sourceAsset(ref, 2000) },
    error: /longer than its source/i
  },
  {
    name: "imported media of unknown length cannot grow past its out-point",
    initial: () => {
      const s = directState();
      Object.assign(s.clips[0], { durationMs: 1000, inPointMs: 0, outPointMs: 1000 });
      return s;
    },
    op: { op: "set_clip_params", target: "clip_a", patch: { durationMs: 1500 } },
    error: /longer than its source/i
  },
  {
    name: "snap trim preserves the source in-point",
    initial: snapState,
    op: {
      op: "snap_to_beats",
      targets: ["clip_a"],
      onsets_ms: [0, 1000],
      mode: "both",
      action: "trim",
      tolerance_ms: 200
    },
    clips: [{ id: "clip_a", startMs: 0, durationMs: 1000, inPointMs: 200 }],
    result: { snapped: 1, skipped: 0 }
  },
  {
    name: "failed snap leaves a time-remapped clip unchanged",
    initial: () => {
      const s = snapState();
      s.clips[0].timeRemap = {
        keyframes: [
          { t: 0, sourceMs: 200 },
          { t: 1, sourceMs: 1160 }
        ]
      };
      return s;
    },
    op: {
      op: "snap_to_beats",
      targets: ["clip_a"],
      onsets_ms: [0, 1000],
      mode: "both",
      action: "trim",
      tolerance_ms: 200
    },
    clips: [{ id: "clip_a", startMs: 120, durationMs: 960, inPointMs: 200 }],
    result: { snapped: 0, skipped: 1 }
  },
  {
    name: "3D cannot be placed on an audio lane",
    initial: linked,
    op: {
      op: "add_model3d_clip",
      assetId: "asset_glb",
      trackId: "track_audio"
    },
    error: /video or overlay/i
  },
  {
    name: "video cannot be placed on a MIDI lane",
    initial: directState,
    op: { op: "add_media_clip", asset: "asset_1", trackId: "track_midi" },
    error: /compatible/i
  },
  {
    name: "linked move preserves J-cut against zero",
    initial: linked,
    op: { op: "move_clip", target: "clip_a", startMs: 0 },
    clips: [
      { id: "clip_a", startMs: 1000 },
      { id: "linked_audio", startMs: 0 }
    ]
  },
  {
    name: "linked trim changes both durations by one delta",
    initial: linked,
    op: { op: "trim_clip", target: "clip_a", durationMs: 5000 },
    clips: [
      { id: "clip_a", durationMs: 5000 },
      { id: "linked_audio", durationMs: 3000 }
    ]
  },
  {
    name: "linked split divides both clips",
    initial: linked,
    op: { op: "split_clip", target: "clip_a", atMs: 3000 },
    clipCount: 9
  },
  {
    name: "delete repairs the last linked sibling",
    initial: linked,
    op: { op: "delete_clip", target: "clip_a" },
    clips: [{ id: "linked_audio", linkId: undefined }]
  },
  {
    name: "locked sibling refuses the whole move",
    initial: () => {
      const s = linked();
      s.clips[s.clips.length - 1].locked = true;
      return s;
    },
    op: { op: "move_clip", target: "clip_a", startMs: 3500 },
    error: /locked/i
  },
  {
    name: "locked track refuses trimming",
    initial: () => {
      const s = directState();
      s.tracks[0].locked = true;
      return s;
    },
    op: { op: "trim_clip", target: "clip_a", durationMs: 1000 },
    error: /locked/i
  },
  {
    name: "duplicate clears rendered and locked state",
    initial: () => {
      const s = directState();
      s.clips[0].sourceType = "generated";
      s.clips[0].locked = true;
      s.clips[0].lastGeneratedHash = "render";
      return s;
    },
    op: { op: "duplicate_clip", target: "clip_a" },
    clips: [
      {
        id: "clip_1",
        status: "draft",
        locked: false,
        currentAssetId: undefined,
        lastGeneratedHash: undefined,
        versions: []
      }
    ]
  },
  {
    name: "duplicate of imported media keeps its asset",
    initial: directState,
    op: { op: "duplicate_clip", target: "clip_a", gapMs: 500 },
    clips: [
      {
        id: "clip_1",
        startMs: 4500,
        status: "generated",
        currentAssetId: "asset_take_2"
      }
    ]
  },
  {
    name: "text cannot be placed on an audio lane",
    initial: linked,
    op: { op: "add_text_clip", text: "Caption", trackId: "track_audio" },
    error: /video or overlay/i
  },
  {
    name: "shape cannot be placed on a MIDI lane",
    initial: directState,
    op: {
      op: "add_shape_clip",
      trackId: "track_midi",
      shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 }
    },
    error: /video or overlay/i
  },
  {
    name: "a first manual reframe keyframe creates a path",
    initial: () => {
      const s = directState();
      delete s.clips[0].reframe;
      return s;
    },
    op: {
      op: "add_reframe_keyframe",
      clip_id: "clip_a",
      source_ms: 1000,
      x: 0.4,
      y: 0.6
    },
    clips: [
      {
        id: "clip_a",
        reframe: {
          mode: "auto",
          keyframes: [{ sourceMs: 1000, x: 0.4, y: 0.6 }]
        }
      }
    ]
  },
  {
    name: "partial text style preserves the words and size",
    initial: directState,
    op: {
      op: "set_clip_params",
      target: "clip_b",
      patch: { textStyle: { color: "#00ff00" } }
    },
    clips: [
      {
        id: "clip_b",
        textStyle: { text: "Hello world", fontSizePx: 64, color: "#00ff00" }
      }
    ]
  },
  {
    name: "stagger refuses a non-text clip",
    initial: directState,
    op: {
      op: "animate_clip",
      target: "clip_a",
      animations: [
        { role: "in", preset: "fade", stagger: { unit: "word", offsetMs: 50 } }
      ]
    },
    error: /only.*text/i
  }
];
