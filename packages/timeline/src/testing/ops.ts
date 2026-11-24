import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_MODEL3D_STYLE,
  DEFAULT_TEMPO,
  makeClip,
  makeTrack,
  patternFromText,
  type MediaTrack,
  type TimelineClip,
  type TimelineComposition,
  type TimelineMarker,
  type TimelineTrack
} from "../index.js";
import {
  createMemoryPluginHost,
  createMemoryStepPatternLibrary,
  type TimelineOp,
  type TimelineOpContext,
  type TimelineOpIdKind,
  type TimelineOpState
} from "../ops/index.js";

export const COMPOSITION: TimelineComposition = {
  id: "lower_third",
  name: "Lower Third",
  params: {
    name: { type: "string", default: "Ada", path: "/0/textStyle/text" }
  },
  group: makeClip({
    id: "tpl_group",
    trackId: "group",
    name: "Lower Third",
    startMs: 0,
    durationMs: 3000,
    mediaType: "group",
    sourceType: "imported",
    status: "generated"
  }),
  children: [
    makeClip({
      id: "tpl_text",
      trackId: "Name",
      name: "Name",
      startMs: 0,
      durationMs: 3000,
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      textStyle: { text: "Ada", fontSizePx: 64, color: "#ffffff" }
    })
  ]
};

export function seedTracks(): TimelineTrack[] {
  return [
    makeTrack({ id: "track_a", type: "video", name: "Video 1", index: 0 }),
    makeTrack({ id: "track_b", type: "overlay", name: "Overlay 1", index: 1 }),
    makeTrack({
      id: "track_midi",
      type: "midi",
      name: "Music",
      index: 2,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      effects: [
        {
          id: "fx_vst_seed",
          type: "vst",
          enabled: true,
          plugin: {
            uid: "VST3-Gain",
            name: "Seed Gain",
            vendor: "Acme",
            path: "/plugins/SeedGain.vst3",
            format: "vst3"
          },
          state: null,
          wet: 1
        }
      ]
    })
  ];
}

export function seedClips(): TimelineClip[] {
  return [
    makeClip({
      id: "clip_a",
      trackId: "track_a",
      name: "Shot A",
      startMs: 0,
      durationMs: 4000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      // Two finished takes, the second active, so the take ops
      // (list/select/rename/delete_take) have something to work with.
      currentAssetId: "asset_take_2",
      reframe: { mode: "center" },
      animations: [
        { id: "anim_a", role: "in", preset: "fade", durationMs: 500 }
      ],
      activeTakeId: "take_2",
      dependencyHash: "hash_take_2",
      versions: [
        {
          id: "take_1",
          createdAt: "2026-01-01T00:00:00.000Z",
          jobId: "job_1",
          assetId: "asset_take_1",
          workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
          dependencyHash: "hash_take_1",
          paramOverridesSnapshot: {},
          status: "success"
        },
        {
          id: "take_2",
          createdAt: "2026-01-02T00:00:00.000Z",
          jobId: "job_2",
          assetId: "asset_take_2",
          workflowUpdatedAt: "2026-01-02T00:00:00.000Z",
          dependencyHash: "hash_take_2",
          paramOverridesSnapshot: {},
          status: "success"
        }
      ]
    }),
    makeClip({
      id: "clip_b",
      trackId: "track_b",
      name: "Title",
      startMs: 0,
      durationMs: 3000,
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      textStyle: { text: "Hello world", fontSizePx: 64, color: "#ffffff" },
      animations: [
        { id: "anim_b", role: "in", preset: "fade", durationMs: 500 }
      ],
      // Follows the seeded media track, so `unbind_track` has a binding to
      // clear and `delete_track_object` has a referencing clip to unbind.
      trackBinding: { trackId: "mtrack_a", mode: "position" }
    }),
    makeClip({
      id: "clip_c",
      trackId: "track_a",
      name: "Gen",
      startMs: 4000,
      durationMs: 5000,
      mediaType: "video",
      sourceType: "generated",
      status: "generated",
      prompt: "a cat",
      // `set_generated_matte` only adjusts a matte that exists, so one clip
      // carries a finished generation with a version behind it.
      generatedMatte: {
        assetId: "asset_mask_2",
        sourceAssetId: "asset_src",
        sourceRange: { fromMs: 0, toMs: 5000 },
        settings: { model: "Matting" },
        status: "ready",
        versions: [
          {
            assetId: "asset_mask_1",
            sourceAssetId: "asset_src",
            createdAt: "2026-01-01T00:00:00.000Z",
            settings: { model: "General Use (Light)" }
          }
        ]
      }
    }),
    makeClip({
      id: "clip_m",
      trackId: "track_b",
      name: "Model",
      startMs: 0,
      durationMs: 4000,
      mediaType: "model3d",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "asset_glb",
      // Opaque on purpose: a transparent style is refused until the alpha
      // encode lands (T13), and `bake_model3d_clip` has to be drivable here.
      model3dStyle: {
        ...DEFAULT_MODEL3D_STYLE,
        background: { transparent: false, color: "#101010" }
      }
    }),
    makeClip({
      id: "clip_midi",
      trackId: "track_midi",
      name: "Phrase",
      startMs: 1000,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: [
        {
          id: "note_a",
          pitch: 60,
          velocity: 80,
          startTick: 125,
          durationTick: 480
        }
      ]
    }),
    makeClip({
      id: "clip_midi2",
      trackId: "track_midi",
      name: "Answer",
      startMs: 3000,
      durationMs: 1000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: [
        {
          id: "note_b",
          pitch: 64,
          velocity: 80,
          startTick: 0,
          durationTick: 480
        }
      ]
    }),
    makeClip({
      id: "clip_g",
      trackId: "track_b",
      name: "Group",
      startMs: 0,
      durationMs: 3000,
      mediaType: "group",
      sourceType: "imported",
      status: "generated"
    }),
    makeClip({
      id: "clip_pattern",
      trackId: "track_midi",
      name: "Beat",
      startMs: 8000,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: patternFromText(
        "Kick: x... x... x... x...\nSnare: .... x... .... x...",
        { name: "Beat", seed: 7 }
      )
    })
  ];
}

export function seedMarkers(): TimelineMarker[] {
  return [{ id: "marker_a", timeMs: 1000, label: "One" }];
}

/**
 * One subject/object track on `clip_a`, so the track ops (list_tracks,
 * bind_to_track, delete_track_object) have something to address, and
 * `clip_b` follows it so `unbind_track` has a binding to clear.
 */
export function seedMediaTracks(): MediaTrack[] {
  return [
    {
      id: "mtrack_a",
      clipId: "clip_a",
      sourceAssetId: "asset_take_2",
      name: "Product",
      kind: "box",
      sourceStartMs: 0,
      sourceEndMs: 4000,
      samples: [
        { sourceMs: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        { sourceMs: 4000, x: 0.6, y: 0.6, width: 0.2, height: 0.2 }
      ],
      status: "ready"
    }
  ];
}

export const ASSET = {
  id: "asset_1",
  name: "Clip.mp4",
  contentType: "video/mp4",
  durationMs: 2500
};

/** The bridge's id minting, replayed so the direct run mints the same ids. */
export const SEEDED_STEP_PATTERN_FOLDER_ID =
  "a1b2c3d4e5f600000000000000000001";
export const SEEDED_STEP_PATTERN_ENTRY_ID =
  "b1c2d3e4f5a600000000000000000001";

/** Seeded in-memory step pattern library shared by parity fixtures. */
export function seedStepPatternLibrary() {
  return createMemoryStepPatternLibrary({
    folders: [
      {
        id: SEEDED_STEP_PATTERN_FOLDER_ID,
        kind: "pattern",
        folder: "Step Patterns/Patterns/Seeded"
      }
    ],
    entries: [
      {
        id: SEEDED_STEP_PATTERN_ENTRY_ID,
        name: "Seeded Beat",
        kind: "pattern",
        category: "user",
        tags: ["pattern", "user"],
        folder: "Step Patterns/Patterns/Seeded",
        pattern: patternFromText("Kick: x... x... x... x...", {
          name: "Seeded Beat",
          seed: 1
        })
      }
    ]
  });
}

export function seedPluginHost() {
  return createMemoryPluginHost([
    {
      info: {
        uid: "VST3-Pad",
        name: "Seed Pad",
        vendor: "Acme",
        version: "1.0.0",
        path: "/plugins/SeedPad.vst3",
        format: "vst3",
        isInstrument: true
      },
      presets: [
        { index: 0, name: "Init" },
        { index: 1, name: "Warm Pad" }
      ],
      parameters: [
        {
          id: "cutoff",
          index: 0,
          name: "Cutoff",
          label: "Hz",
          value: 0.5,
          defaultValue: 0.5,
          formatDisplay: (v) => `${Math.round(20 + v * 19980)} Hz`
        }
      ]
    },
    {
      info: {
        uid: "VST3-Gain",
        name: "Seed Gain",
        vendor: "Acme",
        version: "1.0.0",
        path: "/plugins/SeedGain.vst3",
        format: "vst3",
        isInstrument: false
      },
      presets: [
        { index: 0, name: "Unity" },
        { index: 1, name: "Boost" }
      ],
      parameters: [
        {
          id: "gain",
          index: 0,
          name: "Gain",
          label: "dB",
          value: 0.5,
          defaultValue: 0.5,
          formatDisplay: (v) => `${(-24 + v * 48).toFixed(1)} dB`,
          parseDisplay: (text) => {
            const db = Number.parseFloat(text);
            return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 24) / 48)) : null;
          }
        }
      ]
    }
  ]);
}

export function directContext(state: TimelineOpState): TimelineOpContext {
  const used = new Set<string>();
  for (const t of state.tracks) used.add(t.id);
  for (const c of state.clips) {
    used.add(c.id);
    for (const a of c.animations ?? []) used.add(a.id);
  }
  for (const m of state.markers) used.add(m.id);
  const counters: Record<TimelineOpIdKind, number> = {
    track: 0,
    clip: 0,
    anim: 0,
    marker: 0,
    note: 0,
    beat: 0,
    link: 0,
    version: 0,
    lane: 0,
    point: 0,
    folder: 0,
    effect: 0
  };
  return {
    generateFromBeats: async (document) => {
      const clip = makeClip({
        id: "clip_1",
        trackId: "track_a",
        name: "Beat 1",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        bindingKind: "text-to-video",
        prompt: "Opening",
        provider: undefined,
        model: undefined,
        beatId: "beat_a",
        status: "draft"
      });
      return {
        state: {
          ...document,
          clips: [...document.clips, clip],
          setup: {
            stage: "done",
            brief: "A product film",
            format: undefined,
            voiceover: undefined,
            beats: [
              {
                id: "beat_a",
                prompt: "Opening",
                duration_ms: 2000,
                clip_id: "clip_1"
              }
            ]
          }
        },
        changedClipIds: [clip.id],
        result: {
          ok: true,
          videoClipIds: ["clip_1"],
          voiceoverClipIds: [],
          musicClipId: null,
          startedClipIds: [],
          note: "Clips created as drafts — this surface renders nothing."
        }
      };
    },
    newId: (kind) => {
      let id = `${kind}_${++counters[kind]}`;
      while (used.has(id)) id = `${kind}_${++counters[kind]}`;
      used.add(id);
      return id;
    },
    now: () => "2026-01-01T00:00:00.000Z",
    resolveAsset: async (ref) => (ref.includes("asset_1") ? ASSET : null),
    loadComposition: {
      get: async (id) => (id === COMPOSITION.id ? COMPOSITION : null),
      listIds: async () => [COMPOSITION.id]
    },
    retargetFormat: async () => ({ sequenceId: "adapted_1", name: "Adapted" }),
    parseSvgPath: () => ({ ok: true }),
    stepPatternLibrary: seedStepPatternLibrary(),
    pluginHost: seedPluginHost()
  };
}

export function directState(): TimelineOpState {
  return {
    tempo: DEFAULT_TEMPO,
    setup: {
      stage: "review",
      brief: "A product film",
      beats: [{ id: "beat_a", prompt: "Opening", duration_ms: 2000 }]
    },
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: seedTracks(),
    clips: seedClips(),
    markers: seedMarkers(),
    mediaTracks: seedMediaTracks(),
    playheadMs: 0,
    selectedClipIds: []
  };
}

interface Fixture {
  /** The `ui_timeline_*` tool name, minus the prefix. */
  tool: string;
  args: Record<string, unknown>;
  op: TimelineOp;
}

export const FIXTURES: Fixture[] = [
  { tool: "generate_from_beats", args: {}, op: { op: "generate_from_beats" } },
  {
    tool: "add_midi_clip",
    args: {
      track: "track_midi",
      start_ms: 0,
      duration_ms: 2000,
      notes: [{ id: "note_new", pitch: 64, start_tick: 0, duration_tick: 960 }]
    },
    op: {
      op: "add_midi_clip",
      track: "track_midi",
      start_ms: 0,
      duration_ms: 2000,
      notes: [{ id: "note_new", pitch: 64, start_tick: 0, duration_tick: 960 }]
    }
  },
  {
    tool: "set_notes",
    args: {
      clip: "clip_midi",
      notes: [{ id: "note_new", pitch: 67, start_tick: 0, duration_tick: 480 }]
    },
    op: {
      op: "set_notes",
      clip: "clip_midi",
      notes: [{ id: "note_new", pitch: 67, start_tick: 0, duration_tick: 480 }]
    }
  },
  { tool: "set_tempo", args: { bpm: 100 }, op: { op: "set_tempo", bpm: 100 } },
  {
    tool: "set_track_instrument",
    args: { track: "track_midi", instrument: { preset: "bass" } },
    op: {
      op: "set_track_instrument",
      track: "track_midi",
      instrument: { preset: "bass" }
    }
  },
  {
    tool: "transpose_clip",
    args: { clip: "clip_midi", semitones: 7 },
    op: { op: "transpose_clip", clip: "clip_midi", semitones: 7 }
  },
  {
    tool: "quantize_notes",
    args: { clip: "clip_midi", division: "1/16" },
    op: { op: "quantize_notes", clip: "clip_midi", division: "1/16" }
  },
  {
    tool: "scale_velocity",
    args: { clip: "clip_midi", factor: 1.5 },
    op: { op: "scale_velocity", clip: "clip_midi", factor: 1.5 }
  },
  {
    tool: "set_notes",
    args: { clip: "clip_midi", function: "legato" },
    op: { op: "set_notes", clip: "clip_midi", function: "legato" }
  },
  {
    tool: "set_notes",
    args: {
      clip: "clip_midi",
      controllers: [{ kind: "cc", cc: 1, points: [{ tick: 0, value: 40 }] }]
    },
    op: {
      op: "set_notes",
      clip: "clip_midi",
      controllers: [{ kind: "cc", cc: 1, points: [{ tick: 0, value: 40 }] }]
    }
  },
  {
    tool: "set_track",
    args: {
      track: "track_midi",
      automationMode: "touch",
      automation: [
        {
          target: { kind: "mixer", param: "volumeDb" },
          points: [{ timeMs: 0, value: -6 }]
        }
      ]
    },
    op: {
      op: "set_track",
      track: "track_midi",
      automationMode: "touch",
      automation: [
        {
          target: { kind: "mixer", param: "volumeDb" },
          points: [{ timeMs: 0, value: -6 }]
        }
      ]
    }
  },
  {
    tool: "set_track",
    args: { track: "master", volumeDb: -2, pan: -0.25 },
    op: { op: "set_track", track: "master", volumeDb: -2, pan: -0.25 }
  },
  {
    tool: "set_track",
    args: {
      track: "track_midi",
      folder: "Synths",
      musicRole: "synth",
      effects: [{ id: "fx_gain", type: "gain", enabled: true, gainDb: 2 }]
    },
    op: {
      op: "set_track",
      track: "track_midi",
      folder: "Synths",
      musicRole: "synth",
      effects: [{ id: "fx_gain", type: "gain", enabled: true, gainDb: 2 }]
    }
  },
  {
    tool: "set_tempo",
    args: { key: { tonic: "D", mode: "minor" } },
    op: { op: "set_tempo", key: { tonic: "D", mode: "minor" } }
  },
  {
    tool: "get_state",
    args: { clip: "clip_midi", track: "track_midi" },
    op: { op: "get_state", clip: "clip_midi", track: "track_midi" }
  },
  {
    tool: "set_chords",
    args: { chart: "| Am | F | C G |" },
    op: { op: "set_chords", chart: "| Am | F | C G |" }
  },
  { tool: "clear_chords", args: {}, op: { op: "clear_chords" } },
  {
    tool: "loop_clip",
    args: { clip: "clip_midi", times: 4 },
    op: { op: "loop_clip", clip: "clip_midi", times: 4 }
  },
  {
    tool: "join_clips",
    args: { clips: ["clip_midi", "clip_midi2"] },
    op: { op: "join_clips", clips: ["clip_midi", "clip_midi2"] }
  },
  {
    tool: "insert_time",
    args: { atBar: 3, bars: 2, trackIds: ["track_a"] },
    op: { op: "insert_time", atBar: 3, bars: 2, trackIds: ["track_a"] }
  },
  {
    tool: "delete_time",
    args: { fromBar: 2, toBar: 4 },
    op: { op: "delete_time", fromBar: 2, toBar: 4 }
  },
  {
    tool: "duplicate_range",
    args: { fromMs: 0, toMs: 4000 },
    op: { op: "duplicate_range", fromMs: 0, toMs: 4000 }
  },
  {
    tool: "paste_range",
    args: {
      atMs: 4000,
      mode: "insert",
      content: { lengthMs: 2000, clips: [] }
    },
    op: {
      op: "paste_range",
      atMs: 4000,
      mode: "insert",
      content: { lengthMs: 2000, clips: [] }
    }
  },
  { tool: "list_progressions", args: {}, op: { op: "list_progressions" } },
  {
    tool: "apply_progression",
    args: { progression: "I-V-vi-IV", key: "A minor" },
    op: { op: "apply_progression", progression: "I-V-vi-IV", key: "A minor" }
  },
  {
    tool: "transpose_chords",
    args: { semitones: 2, includeNotes: true },
    op: { op: "transpose_chords", semitones: 2, includeNotes: true }
  },
  {
    tool: "detect_chords",
    args: { clipIds: ["clip_midi"], write: false },
    op: { op: "detect_chords", clipIds: ["clip_midi"], write: false }
  },
  {
    tool: "set_clip_harmony",
    args: { clipId: "clip_midi", style: "arp" },
    op: { op: "set_clip_harmony", clipId: "clip_midi", style: "arp" }
  },
  { tool: "list_harmony_presets", args: {}, op: { op: "list_harmony_presets" } },
  {
    tool: "fit_notes_to_chords",
    args: { clipIds: ["clip_midi"] },
    op: { op: "fit_notes_to_chords", clipIds: ["clip_midi"] }
  },
  {
    tool: "set_reframe_subject",
    args: { clip_id: "clip_a", track_id: "mtrack_a", safe_margin: 0.2 },
    op: {
      op: "set_reframe_subject",
      clip_id: "clip_a",
      track_id: "mtrack_a",
      safe_margin: 0.2
    }
  },
  {
    tool: "add_reframe_keyframe",
    args: { clip_id: "clip_a", source_ms: 1000, x: 0.4, y: 0.6 },
    op: {
      op: "add_reframe_keyframe",
      clip_id: "clip_a",
      source_ms: 1000,
      x: 0.4,
      y: 0.6
    }
  },
  {
    tool: "clear_reframe",
    args: { clip_id: "clip_a" },
    op: { op: "clear_reframe", clip_id: "clip_a" }
  },
  {
    tool: "retarget_format",
    args: { aspect_ratio: "9:16", strategy: "center" },
    op: { op: "retarget_format", aspect_ratio: "9:16", strategy: "center" }
  },
  {
    tool: "stagger_animations",
    args: { clip_ids: ["clip_a", "clip_b"], offset_ms: 200 },
    op: {
      op: "stagger_animations",
      clip_ids: ["clip_a", "clip_b"],
      offset_ms: 200
    }
  },
  {
    tool: "set_setup",
    args: { brief: "Updated brief", voiceover: false },
    op: { op: "set_setup", brief: "Updated brief", voiceover: false }
  },
  {
    tool: "plan_beats",
    args: { beats: [{ prompt: "Hero shot", durationMs: 3000 }] },
    op: { op: "plan_beats", beats: [{ prompt: "Hero shot", durationMs: 3000 }] }
  },
  {
    tool: "update_beat",
    args: { beat: "beat_a", prompt: "Updated shot", transition: null },
    op: {
      op: "update_beat",
      beat: "beat_a",
      prompt: "Updated shot",
      transition: null
    }
  },
  {
    tool: "remove_beat",
    args: { beat: "1" },
    op: { op: "remove_beat", beat: "1" }
  },

  { tool: "get_state", args: {}, op: { op: "get_state" } },
  {
    tool: "add_track",
    args: { type: "audio", name: "Score" },
    op: { op: "add_track", type: "audio", name: "Score" }
  },
  {
    tool: "move_track",
    args: { target: "track_b", toIndex: 0 },
    op: { op: "move_track", target: "track_b", toIndex: 0 }
  },
  {
    tool: "delete_track",
    args: { target: "track_a", deleteClips: true },
    op: { op: "delete_track", target: "track_a", deleteClips: true }
  },
  {
    tool: "set_track",
    args: { track: "Music", muted: true, volumeDb: -6 },
    op: { op: "set_track", track: "Music", muted: true, volumeDb: -6 }
  },
  {
    tool: "ripple_delete",
    args: { targets: ["clip_a"] },
    op: { op: "ripple_delete", targets: ["clip_a"] }
  },
  {
    tool: "close_gap",
    args: { track: "Music", atMs: 500 },
    op: { op: "close_gap", track: "Music", atMs: 500 }
  },
  {
    tool: "cut_transcript",
    args: { startMs: 3000, endMs: 4000 },
    op: { op: "cut_transcript", startMs: 3000, endMs: 4000 }
  },
  {
    tool: "add_text_clip",
    args: { text: "New title", fontSizePx: 48 },
    op: {
      op: "add_text_clip",
      text: "New title",
      loose: { fontSizePx: 48 }
    }
  },
  {
    tool: "add_media_clip",
    args: { asset: "asset://asset_1.mp4" },
    op: { op: "add_media_clip", asset: "asset://asset_1.mp4" }
  },
  {
    tool: "add_shape_clip",
    args: { kind: "rect", width: 0.5 },
    op: { op: "add_shape_clip", loose: { kind: "rect", width: 0.5 } }
  },
  {
    tool: "add_model3d_clip",
    args: { assetId: "asset_glb", durationMs: 6000 },
    op: { op: "add_model3d_clip", assetId: "asset_glb", durationMs: 6000 }
  },
  {
    tool: "set_model3d_style",
    args: {
      target: "clip_m",
      patch: { camera: { azimuthDeg: 120 }, lighting: "soft" }
    },
    op: {
      op: "set_model3d_style",
      target: "clip_m",
      patch: { camera: { azimuthDeg: 120 }, lighting: "soft" }
    }
  },
  {
    tool: "bake_model3d_clip",
    args: { target: "clip_m" },
    op: { op: "bake_model3d_clip", target: "clip_m" }
  },
  {
    tool: "add_group",
    args: {
      name: "Band",
      startMs: 0,
      durationMs: 2000,
      children: ["clip_b"]
    },
    op: {
      op: "add_group",
      name: "Band",
      startMs: 0,
      durationMs: 2000,
      children: ["clip_b"]
    }
  },
  {
    tool: "generate_clip",
    args: { kind: "text-to-image", prompt: "a fox" },
    op: { op: "generate_clip", kind: "text-to-image", prompt: "a fox" }
  },
  {
    tool: "split_clip",
    args: { target: "clip_a", atBar: 2, crossing: "split" },
    op: { op: "split_clip", target: "clip_a", atBar: 2, crossing: "split" }
  },
  {
    tool: "trim_clip",
    args: { target: "clip_a", durationMs: 2500 },
    op: { op: "trim_clip", target: "clip_a", durationMs: 2500 }
  },
  {
    tool: "move_clip",
    args: { target: "clip_a", atBar: 1, beat: 2, trackId: "track_b" },
    op: {
      op: "move_clip",
      target: "clip_a",
      atBar: 1,
      beat: 2,
      trackId: "track_b"
    }
  },
  {
    tool: "delete_clip",
    args: { target: "clip_a" },
    op: { op: "delete_clip", target: "clip_a" }
  },
  {
    tool: "duplicate_clip",
    args: { target: "clip_a", gapMs: 100, count: 2 },
    op: { op: "duplicate_clip", target: "clip_a", gapMs: 100, count: 2 }
  },
  {
    tool: "set_clip_params",
    args: { target: "clip_a", name: "Chorus", labelColor: "#3e63dd" },
    op: {
      op: "set_clip_params",
      target: "clip_a",
      patch: { name: "Chorus", labelColor: "#3e63dd" }
    }
  },
  {
    tool: "set_clip_params",
    args: {
      target: "clip_midi",
      transpose: -7,
      velocityOffset: 10,
      quantize: { grid: "1/16", strength: 80 }
    },
    op: {
      op: "set_clip_params",
      target: "clip_midi",
      patch: {
        transpose: -7,
        velocityOffset: 10,
        quantize: { grid: "1/16", strength: 80 }
      }
    }
  },
  {
    tool: "set_clip_params",
    args: { target: "clip_a", labelColor: null },
    op: { op: "set_clip_params", target: "clip_a", patch: { labelColor: null } }
  },
  {
    tool: "set_clip_params",
    args: {
      target: "clip_b",
      startMs: 1200,
      durationMs: 2000,
      fontSizePx: 80,
      opacity: 0.5
    },
    op: {
      op: "set_clip_params",
      target: "clip_b",
      patch: {
        startMs: 1200,
        durationMs: 2000,
        fontSizePx: 80,
        opacity: 0.5
      }
    }
  },
  {
    tool: "set_parent",
    args: { target: "clip_b", parentId: "clip_g" },
    op: { op: "set_parent", target: "clip_b", parentId: "clip_g" }
  },
  {
    tool: "set_transition",
    args: {
      target: "clip_a",
      transition: { type: "crossfade", durationMs: 500 }
    },
    op: {
      op: "set_transition",
      target: "clip_a",
      transition: { type: "crossfade", durationMs: 500 }
    }
  },
  {
    tool: "apply_transition_at_cut",
    args: {
      outgoingClipId: "clip_a",
      incomingClipId: "clip_c",
      durationMs: 500,
      type: "wipe",
      direction: "right",
      softness: 0.2
    },
    op: {
      op: "apply_transition_at_cut",
      outgoingClipId: "clip_a",
      incomingClipId: "clip_c",
      durationMs: 500,
      type: "wipe",
      direction: "right",
      softness: 0.2
    }
  },
  {
    tool: "set_mask",
    args: { target: "clip_a", mask: { kind: "ellipse", featherPx: 4 } },
    op: {
      op: "set_mask",
      target: "clip_a",
      mask: { kind: "ellipse", featherPx: 4 }
    }
  },
  {
    tool: "set_matte",
    args: { target: "clip_a", matte: { source: "clip_b", mode: "luma" } },
    op: {
      op: "set_matte",
      target: "clip_a",
      matte: { source: "clip_b", mode: "luma" }
    }
  },
  {
    tool: "set_time_remap",
    args: {
      target: "clip_a",
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    },
    op: {
      op: "set_time_remap",
      target: "clip_a",
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    }
  },
  {
    tool: "set_effects",
    args: { target: "clip_a", effects: [{ type: "blur", radius: 6 }] },
    op: {
      op: "set_effects",
      target: "clip_a",
      effects: [{ type: "blur", radius: 6 }]
    }
  },
  {
    tool: "set_clip_binding",
    args: { target: "clip_c", prompt: "a dog", regenerate: true },
    op: {
      op: "set_clip_binding",
      target: "clip_c",
      prompt: "a dog",
      regenerate: true
    }
  },
  {
    tool: "animate_clip",
    args: {
      target: "clip_b",
      animations: [{ role: "in", preset: "fade" }]
    },
    op: {
      op: "animate_clip",
      target: "clip_b",
      animations: [{ role: "in", preset: "fade" }]
    }
  },
  {
    tool: "clear_animations",
    args: { target: "clip_b" },
    op: { op: "clear_animations", target: "clip_b" }
  },
  {
    tool: "list_animation_presets",
    args: {},
    op: { op: "list_animation_presets" }
  },
  {
    tool: "list_instruments",
    args: {},
    op: { op: "list_instruments" }
  },
  {
    tool: "select_clip",
    args: { target: "clip_a" },
    op: { op: "select_clip", target: "clip_a" }
  },
  { tool: "seek", args: { timeMs: 900 }, op: { op: "seek", timeMs: 900 } },
  {
    tool: "add_marker",
    args: { timeMs: 2000, label: "Two" },
    op: { op: "add_marker", timeMs: 2000, label: "Two" }
  },
  {
    tool: "delete_marker",
    args: { target: "One" },
    op: { op: "delete_marker", target: "One" }
  },
  {
    tool: "set_markers_from_beats",
    args: { bpm: 120, count: 4 },
    op: { op: "set_markers_from_beats", bpm: 120, count: 4 }
  },
  {
    tool: "snap_to_beats",
    args: { bpm: 120, targets: ["clip_a"] },
    op: { op: "snap_to_beats", bpm: 120, targets: ["clip_a"] }
  },
  {
    tool: "set_baked_animation",
    args: {
      target: "clip_a",
      animation: {
        property: "scale",
        keyframes: [
          { sourceMs: 0, value: 1 },
          { sourceMs: 400, value: 1.3 }
        ],
        bakedFrom: { kind: "audio", assetId: "asset_1" }
      }
    },
    op: {
      op: "set_baked_animation",
      target: "clip_a",
      animation: {
        property: "scale",
        keyframes: [
          { sourceMs: 0, value: 1 },
          { sourceMs: 400, value: 1.3 }
        ],
        bakedFrom: { kind: "audio", assetId: "asset_1" }
      }
    }
  },
  {
    tool: "set_generated_matte",
    args: {
      target: "clip_c",
      invert: true,
      strength: 0.75,
      featherPx: 3,
      selectVersionAssetId: "asset_mask_1"
    },
    op: {
      op: "set_generated_matte",
      target: "clip_c",
      invert: true,
      strength: 0.75,
      featherPx: 3,
      selectVersionAssetId: "asset_mask_1"
    }
  },
  {
    tool: "insert_composition",
    args: { composition_id: "lower_third", startMs: 1000 },
    op: {
      op: "insert_composition",
      composition_id: "lower_third",
      startMs: 1000
    }
  },
  {
    tool: "list_takes",
    args: { target: "clip_a" },
    op: { op: "list_takes", target: "clip_a" }
  },
  {
    tool: "select_take",
    args: { target: "clip_a", takeId: "take_1" },
    op: { op: "select_take", target: "clip_a", takeId: "take_1" }
  },
  {
    tool: "rename_take",
    args: { target: "clip_a", takeId: "take_1", label: "Wide" },
    op: { op: "rename_take", target: "clip_a", takeId: "take_1", label: "Wide" }
  },
  {
    tool: "delete_take",
    args: { target: "clip_a", takeId: "take_1" },
    op: { op: "delete_take", target: "clip_a", takeId: "take_1" }
  },
  {
    tool: "list_tracks",
    args: { target: "clip_a" },
    op: { op: "list_tracks", target: "clip_a" }
  },
  {
    tool: "delete_track_object",
    args: { trackId: "mtrack_a" },
    op: { op: "delete_track_object", trackId: "mtrack_a" }
  },
  {
    tool: "bind_to_track",
    args: {
      target: "clip_b",
      trackId: "mtrack_a",
      mode: "position_scale",
      offset: { x: 12, y: -8 },
      scale: 1.25,
      smoothing: 0.3
    },
    op: {
      op: "bind_to_track",
      target: "clip_b",
      trackId: "mtrack_a",
      mode: "position_scale",
      offset: { x: 12, y: -8 },
      scale: 1.25,
      smoothing: 0.3
    }
  },
  {
    tool: "unbind_track",
    args: { target: "clip_b" },
    op: { op: "unbind_track", target: "clip_b" }
  },
  // ── Step Sequencer (SQ48–SQ54) ───────────────────────────────────────────
  {
    tool: "get_pattern",
    args: { clipId: "clip_pattern", modes: ["velocity"] },
    op: { op: "get_pattern", clipId: "clip_pattern", modes: ["velocity"] }
  },
  {
    tool: "create_pattern_region",
    args: {
      trackId: "track_midi",
      atBar: 6,
      bars: 2,
      text: "Kick: x... x... x... x..."
    },
    op: {
      op: "create_pattern_region",
      trackId: "track_midi",
      atBar: 6,
      bars: 2,
      text: "Kick: x... x... x... x..."
    }
  },
  {
    tool: "convert_pattern_to_midi",
    args: { clipIds: ["clip_pattern"] },
    op: { op: "convert_pattern_to_midi", clipIds: ["clip_pattern"] }
  },
  {
    tool: "convert_midi_to_pattern",
    args: { clipIds: ["clip_midi"], stepRate: "1/16" },
    op: {
      op: "convert_midi_to_pattern",
      clipIds: ["clip_midi"],
      stepRate: "1/16"
    }
  },
  {
    tool: "separate_pattern_rows",
    args: { clipId: "clip_pattern" },
    op: { op: "separate_pattern_rows", clipId: "clip_pattern" }
  },
  {
    tool: "set_pattern",
    args: {
      clipId: "clip_pattern",
      lengthSteps: 32,
      swing: 40,
      mono: true
    },
    op: {
      op: "set_pattern",
      clipId: "clip_pattern",
      lengthSteps: 32,
      swing: 40,
      mono: true
    }
  },
  {
    tool: "set_pattern_seed",
    args: { clipId: "clip_pattern", seed: 1234 },
    op: { op: "set_pattern_seed", clipId: "clip_pattern", seed: 1234 }
  },
  {
    tool: "add_pattern_rows",
    args: {
      clipId: "clip_pattern",
      rows: [{ cc: 74, name: "Cutoff" }]
    },
    op: {
      op: "add_pattern_rows",
      clipId: "clip_pattern",
      rows: [{ cc: 74, name: "Cutoff" }]
    }
  },
  {
    tool: "set_pattern_row",
    args: {
      clipId: "clip_pattern",
      row: "Kick",
      mute: true,
      playback: "pingPong"
    },
    op: {
      op: "set_pattern_row",
      clipId: "clip_pattern",
      row: "Kick",
      mute: true,
      playback: "pingPong"
    }
  },
  {
    tool: "remove_pattern_rows",
    args: { clipId: "clip_pattern", rows: ["Snare"] },
    op: { op: "remove_pattern_rows", clipId: "clip_pattern", rows: ["Snare"] }
  },
  {
    tool: "move_pattern_row",
    args: { clipId: "clip_pattern", row: "Snare", toIndex: 0 },
    op: { op: "move_pattern_row", clipId: "clip_pattern", row: "Snare", toIndex: 0 }
  },
  {
    tool: "sort_pattern_rows",
    args: { clipId: "clip_pattern", by: "typeAndName" },
    op: { op: "sort_pattern_rows", clipId: "clip_pattern", by: "typeAndName" }
  },
  {
    tool: "set_pattern_row_sort",
    args: { clipId: "clip_pattern", rowSort: "typeAndNameAsc" },
    op: {
      op: "set_pattern_row_sort",
      clipId: "clip_pattern",
      rowSort: "typeAndNameAsc"
    }
  },
  {
    tool: "copy_pattern_row",
    args: { clipId: "clip_pattern", row: "Kick", toRow: "Snare" },
    op: {
      op: "copy_pattern_row",
      clipId: "clip_pattern",
      row: "Kick",
      toRow: "Snare"
    }
  },
  {
    tool: "set_steps",
    args: {
      clipId: "clip_pattern",
      row: "Kick",
      steps: "1-4",
      ramp: { field: "velocity", from: 20, to: 80 }
    },
    op: {
      op: "set_steps",
      clipId: "clip_pattern",
      row: "Kick",
      steps: "1-4",
      ramp: { field: "velocity", from: 20, to: 80 }
    }
  },
  {
    tool: "set_pattern_text",
    args: {
      clipId: "clip_pattern",
      text: "Clap: .... X... .... X...",
      mode: "merge"
    },
    op: {
      op: "set_pattern_text",
      clipId: "clip_pattern",
      text: "Clap: .... X... .... X...",
      mode: "merge"
    }
  },
  {
    tool: "clear_pattern",
    args: {
      clipId: "clip_pattern",
      scope: "row",
      row: "Snare",
      mode: "velocity"
    },
    op: {
      op: "clear_pattern",
      clipId: "clip_pattern",
      scope: "row",
      row: "Snare",
      mode: "velocity"
    }
  },
  {
    tool: "copy_steps",
    args: {
      clipId: "clip_pattern",
      row: "Kick",
      steps: "1-4",
      toRow: "Snare",
      toStep: 5
    },
    op: {
      op: "copy_steps",
      clipId: "clip_pattern",
      row: "Kick",
      steps: "1-4",
      toRow: "Snare",
      toStep: 5
    }
  },
  {
    tool: "repeat_step",
    args: { clipId: "clip_pattern", row: "Kick", step: 1 },
    op: { op: "repeat_step", clipId: "clip_pattern", row: "Kick", step: 1 }
  },
  {
    tool: "rotate_pattern",
    args: { clipId: "clip_pattern", row: "Kick", by: 1, mode: "velocity" },
    op: {
      op: "rotate_pattern",
      clipId: "clip_pattern",
      row: "Kick",
      by: 1,
      mode: "velocity"
    }
  },
  {
    tool: "transpose_pattern",
    args: { clipId: "clip_pattern", row: "Kick", semitones: 2 },
    op: { op: "transpose_pattern", clipId: "clip_pattern", row: "Kick", semitones: 2 }
  },
  {
    tool: "randomize_pattern",
    args: { clipId: "clip_pattern", mode: "onOff", seed: 77, density: 50 },
    op: {
      op: "randomize_pattern",
      clipId: "clip_pattern",
      mode: "onOff",
      seed: 77,
      density: 50
    }
  },
  {
    tool: "nudge_pattern_values",
    args: { clipId: "clip_pattern", row: "Kick", mode: "velocity", delta: -10 },
    op: {
      op: "nudge_pattern_values",
      clipId: "clip_pattern",
      row: "Kick",
      mode: "velocity",
      delta: -10
    }
  },
  {
    tool: "tie_steps",
    args: { clipId: "clip_pattern", row: "Kick", from: 1, to: 3, tie: true },
    op: {
      op: "tie_steps",
      clipId: "clip_pattern",
      row: "Kick",
      from: 1,
      to: 3,
      tie: true
    }
  },
  {
    tool: "list_step_patterns",
    args: { query: "Boom Bap" },
    op: { op: "list_step_patterns", query: "Boom Bap" }
  },
  {
    tool: "apply_step_pattern",
    args: { clipId: "clip_pattern", pattern: "Boom Bap" },
    op: { op: "apply_step_pattern", clipId: "clip_pattern", pattern: "Boom Bap" }
  },
  {
    tool: "save_step_pattern",
    args: {
      clipId: "clip_pattern",
      name: "Saved Beat",
      kind: "pattern",
      folder: "Custom"
    },
    op: {
      op: "save_step_pattern",
      clipId: "clip_pattern",
      name: "Saved Beat",
      kind: "pattern",
      folder: "Custom"
    }
  },
  {
    tool: "set_track_step_template",
    args: { trackId: "track_midi", fromClipId: "clip_pattern" },
    op: {
      op: "set_track_step_template",
      trackId: "track_midi",
      fromClipId: "clip_pattern"
    }
  },
  {
    tool: "create_step_pattern_folder",
    args: { kind: "pattern", name: "New Folder" },
    op: {
      op: "create_step_pattern_folder",
      kind: "pattern",
      name: "New Folder"
    }
  },
  {
    tool: "rename_step_pattern_folder",
    args: {
      folder: SEEDED_STEP_PATTERN_FOLDER_ID.slice(0, 12),
      newName: "Renamed"
    },
    op: {
      op: "rename_step_pattern_folder",
      folder: SEEDED_STEP_PATTERN_FOLDER_ID.slice(0, 12),
      newName: "Renamed"
    }
  },
  {
    tool: "delete_step_pattern_folder",
    args: { folder: SEEDED_STEP_PATTERN_FOLDER_ID.slice(0, 12) },
    op: {
      op: "delete_step_pattern_folder",
      folder: SEEDED_STEP_PATTERN_FOLDER_ID.slice(0, 12)
    }
  },
  {
    tool: "move_step_pattern",
    args: {
      pattern: SEEDED_STEP_PATTERN_ENTRY_ID.slice(0, 12),
      folder: "Moved"
    },
    op: {
      op: "move_step_pattern",
      pattern: SEEDED_STEP_PATTERN_ENTRY_ID.slice(0, 12),
      folder: "Moved"
    }
  },
  {
    tool: "list_plugins",
    args: {},
    op: { op: "list_plugins" }
  },
  {
    tool: "load_plugin",
    args: { track: "track_midi", plugin: "Seed Pad" },
    op: { op: "load_plugin", track: "track_midi", plugin: "Seed Pad" }
  },
  {
    tool: "list_plugin_presets",
    args: { track: "track_midi", effectId: "fx_vst_seed" },
    op: { op: "list_plugin_presets", track: "track_midi", effectId: "fx_vst_seed" }
  },
  {
    tool: "select_plugin_preset",
    args: { track: "track_midi", effectId: "fx_vst_seed", preset: "Boost" },
    op: {
      op: "select_plugin_preset",
      track: "track_midi",
      effectId: "fx_vst_seed",
      preset: "Boost"
    }
  },
  {
    tool: "get_plugin_parameters",
    args: { track: "track_midi", effectId: "fx_vst_seed" },
    op: { op: "get_plugin_parameters", track: "track_midi", effectId: "fx_vst_seed" }
  },
  {
    tool: "set_plugin_parameters",
    args: {
      track: "track_midi",
      effectId: "fx_vst_seed",
      parameters: [{ parameter: "Gain", value: 0.75 }]
    },
    op: {
      op: "set_plugin_parameters",
      track: "track_midi",
      effectId: "fx_vst_seed",
      parameters: [{ parameter: "Gain", value: 0.75 }]
    }
  }
];
