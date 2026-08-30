/**
 * Project fixtures for the documentation screenshots.
 *
 * A project owns no content — it is a name over the documents that carry its
 * id — so a project view is only as real as what is filed under it. These
 * seeds give three projects the state their surfaces are meant to show: a
 * board with rendered stills and clips, a script with voiced, stale and
 * unvoiced lines, a cut whose tracks the card draws as bars, a ledger split
 * across stills / clips / voice / pipeline, and the agent conversation that
 * built it all.
 *
 * The pictures are the frames the repo already ships — the SCRAPHEART trailer
 * stills and takes behind the marketing site's trailer section, the six deep
 * shots behind its documentary use case, and the SINGULARITY poster. Their
 * bytes are copied into the asset store through the same call an upload makes,
 * so a card renders the frame a real render would leave behind.
 *
 * Two projects are the same `kind` and fully priced on purpose: the
 * new-project surface reads its cost estimate off past projects of the shape
 * being started, and one sample is not a range.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Asset,
  ImageDocument,
  Message,
  Prediction,
  Project,
  Script,
  Storyboard,
  Thread,
  TimelineSequence
} from "@nodetool-ai/models";

import { getAssetFileName } from "./lib/asset-paths.js";
import { storeAssetWithThumbnail } from "./lib/thumbnail.js";

// This file compiles to packages/websocket/dist/, so the repo root is three
// levels up either way (src or dist → websocket → packages → root).
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

/** A seeded asset whose bytes are a file the repo already ships. */
interface RepoAsset {
  id: string;
  /** Repo-relative source file. */
  source: string;
  name: string;
  contentType: string;
  parentId: string;
  durationSeconds?: number;
}

// ── Media ────────────────────────────────────────────────────────────────────

/** The six SCRAPHEART trailer stills, in cut order. */
const SCRAPHEART_STILLS: RepoAsset[] = [
  "convoy-horizon",
  "chain-and-buggy",
  "the-drift",
  "sparks-off-the-wheel",
  "rider-unmasked",
  "wreck-at-dusk"
].map((slug, index) => ({
  id: `still-scrapheart-${index + 1}`,
  source: `marketing/public/trailer-shot-${index + 1}.png`,
  name: `scrapheart_${slug}.png`,
  contentType: "image/png",
  parentId: "folder-images"
}));

/** The takes rendered from those stills. */
const SCRAPHEART_CLIPS: RepoAsset[] = [
  { slug: "rider", take: "take-rider" },
  { slug: "wheel", take: "take-wheel" },
  { slug: "sparks", take: "take-sparks" },
  { slug: "drift", take: "take-drift" }
].map(({ slug, take }, index) => ({
  id: `clip-scrapheart-${index + 1}`,
  source: `demo/public/casts/promo/${take}.webm`,
  name: `scrapheart_${slug}.webm`,
  contentType: "video/webm",
  parentId: "folder-video",
  durationSeconds: 4
}));

/** The six deep-sea frames, in cut order. */
const ABYSS_STILLS: RepoAsset[] = [
  "title-on-the-water",
  "the-descent",
  "bloom",
  "the-trench",
  "the-wreck",
  "surfacing"
].map((slug, index) => ({
  id: `still-abyss-${index + 1}`,
  source: `marketing/public/deep-shot-${index + 1}.jpg`,
  name: `abyss_${slug}.jpg`,
  contentType: "image/jpeg",
  parentId: "folder-images"
}));

const SINGULARITY_KEY_ART: RepoAsset = {
  id: "still-singularity-poster",
  source: "marketing/public/poster-singularity-2.png",
  name: "singularity_poster_v2.png",
  contentType: "image/png",
  parentId: "folder-images"
};

const MEDIA: RepoAsset[] = [
  ...SCRAPHEART_STILLS,
  ...SCRAPHEART_CLIPS,
  ...ABYSS_STILLS,
  SINGULARITY_KEY_ART
];

const imageRef = (assetId: string) => ({
  type: "image",
  uri: `asset://${assetId}`,
  asset_id: assetId
});

const videoRef = (assetId: string) => ({
  type: "video",
  uri: `asset://${assetId}`,
  asset_id: assetId
});

// ── Documents ────────────────────────────────────────────────────────────────

interface ShotSpec {
  slug: string;
  action: string;
  motion: string;
  framing: string;
  seconds: number;
  keyframe?: string;
  clip?: string;
}

const shots = (specs: ShotSpec[]) =>
  specs.map((spec, index) => ({
    type: "shot",
    id: `shot-${index + 1}`,
    index,
    slug: spec.slug,
    action: spec.action,
    motion: spec.motion,
    camera: { framing: spec.framing },
    duration_seconds: spec.seconds,
    status: spec.clip ? "clip" : spec.keyframe ? "still" : "planned",
    keyframe: spec.keyframe ? imageRef(spec.keyframe) : null,
    clip: spec.clip ? videoRef(spec.clip) : null
  }));

const SCRAPHEART_BOARD = {
  screenplay: null,
  brief:
    "A ninety-second teaser for SCRAPHEART: a convoy, a chain, and one rider " +
    "who takes the buggy apart from the outside.",
  style:
    "sun-blown desert, practical dust, long lenses, no colour outside rust " +
    "and bone",
  entityIds: [],
  aspectRatio: "21:9",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  shots: shots([
    {
      slug: "Convoy",
      action:
        "The convoy strung out along the ridge, heat haze eating the horizon",
      motion: "slow drone push over the lead truck",
      framing: "extreme wide",
      seconds: 5,
      keyframe: "still-scrapheart-1",
      clip: "clip-scrapheart-1"
    },
    {
      slug: "The chain",
      action:
        "The rider swings a chain across the buggy's grille and holds on",
      motion: "handheld tracking, hard whip at the impact",
      framing: "medium",
      seconds: 4,
      keyframe: "still-scrapheart-2",
      clip: "clip-scrapheart-2"
    },
    {
      slug: "Drift",
      action: "The buggy breaks traction and comes round in its own dust",
      motion: "locked off, the car crossing frame right to left",
      framing: "wide",
      seconds: 4,
      keyframe: "still-scrapheart-3",
      clip: "clip-scrapheart-3"
    },
    {
      slug: "Sparks",
      action: "Chain against the wheel rim, sparks off the tread",
      motion: "macro, 120fps",
      framing: "insert",
      seconds: 3,
      keyframe: "still-scrapheart-4",
      clip: "clip-scrapheart-4"
    },
    {
      slug: "Unmasked",
      action: "The rider pulls the wrap down; the convoy has already gone",
      motion: "slow push to a close-up",
      framing: "close-up",
      seconds: 4,
      keyframe: "still-scrapheart-5"
    },
    {
      slug: "Wreck at dusk",
      action: "What is left of the buggy, burning quietly as the light goes",
      motion: "static, hold to black",
      framing: "wide",
      seconds: 5,
      keyframe: "still-scrapheart-6"
    }
  ])
};

const ABYSS_BOARD = {
  screenplay: null,
  brief:
    "A two-minute teaser for a deep-sea documentary: one boat, one descent, " +
    "and the part of the ocean nobody films.",
  style:
    "available light only, deep teal into black, long slow moves, no score " +
    "under the dive",
  entityIds: [],
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  shots: shots([
    {
      slug: "Title on the water",
      action:
        "The research vessel alone at dusk, a storm cell lit from inside on " +
        "the far horizon",
      motion: "drone, slow orbit",
      framing: "extreme wide",
      seconds: 6,
      keyframe: "still-abyss-1"
    },
    {
      slug: "The descent",
      action: "The submersible drops past the last of the daylight",
      motion: "follow down, camera holding the surface in frame",
      framing: "wide",
      seconds: 5,
      keyframe: "still-abyss-2"
    },
    {
      slug: "Bloom",
      action: "A diver inside a bloom of bioluminescent jellyfish",
      motion: "static, the bloom drifting past the lens",
      framing: "medium",
      seconds: 6,
      keyframe: "still-abyss-3"
    },
    {
      slug: "The trench",
      action: "The trench wall going down past the lights",
      motion: "slow tilt down",
      framing: "wide",
      seconds: 5,
      keyframe: "still-abyss-4"
    },
    {
      slug: "The wreck",
      action: "A hull on the floor, silt lifting where the lights land",
      motion: "slow track along the deck",
      framing: "wide",
      seconds: 5,
      keyframe: "still-abyss-5"
    },
    {
      slug: "Surfacing",
      action: "Light again, and the boat waiting where it was",
      motion: "rise to the surface, hold",
      framing: "wide",
      seconds: 4,
      keyframe: "still-abyss-6"
    }
  ])
};

const SINGULARITY_BOARD = {
  screenplay: null,
  brief:
    "A teaser for SINGULARITY. Nothing shot yet — the key art is the only " +
    "thing that exists.",
  style: "cold monumental scale, one warm source, IMAX framing",
  entityIds: [],
  aspectRatio: "21:9",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  shots: shots([
    {
      slug: "The gate",
      action: "The ring above the city, lit from the inside",
      motion: "slow push",
      framing: "extreme wide",
      seconds: 6
    },
    {
      slug: "The walk",
      action: "One figure crossing the plain toward it",
      motion: "static",
      framing: "wide",
      seconds: 5
    },
    {
      slug: "Title",
      action: "SINGULARITY, letterboxed, over the hum",
      motion: "hold",
      framing: "graphic",
      seconds: 4
    }
  ])
};

/** The narrator's voice — the binding a take is compared against. */
const NARRATOR_VOICE = {
  provider: "elevenlabs",
  model: "eleven_turbo_v2_5",
  voice: "voice-narrator-warm"
};

const take = (id: string, assetId: string, text: string, durationMs: number) => ({
  id,
  assetId,
  durationMs,
  words: [],
  textSnapshot: text,
  voiceSnapshot: NARRATOR_VOICE,
  createdAt: "2025-01-14T11:04:00Z"
});

/**
 * Three states in one script, because the card draws all three: a voiced line
 * (its take matches the text it was voiced from), a stale one (the text moved
 * afterwards), and a draft with no take at all.
 */
const SCRAPHEART_SCRIPT = {
  cast: [
    {
      id: "speaker-narrator",
      name: "Narrator",
      color: "#67E8F9",
      voice: NARRATOR_VOICE
    }
  ],
  sections: [
    {
      id: "section-1",
      title: "Teaser",
      lines: [
        {
          id: "line-1",
          speakerId: "speaker-narrator",
          text: "They said the convoy could not be caught.",
          takes: [
            take(
              "take-1",
              "vo-scrapheart-1",
              "They said the convoy could not be caught.",
              2900
            )
          ],
          currentTakeId: "take-1"
        },
        {
          id: "line-2",
          speakerId: "speaker-narrator",
          text: "They were right, for eleven years.",
          takes: [
            take(
              "take-2",
              "vo-scrapheart-2",
              "They were right, for eleven years.",
              2600
            )
          ],
          currentTakeId: "take-2"
        },
        {
          id: "line-3",
          speakerId: "speaker-narrator",
          text: "Then somebody walked out of the dust with a chain.",
          takes: [
            take(
              "take-3",
              "vo-scrapheart-3",
              "Then someone came out of the dust with a chain.",
              3200
            )
          ],
          currentTakeId: "take-3"
        },
        {
          id: "line-4",
          speakerId: "speaker-narrator",
          text: "No convoy. No road. No way back.",
          takes: [
            take(
              "take-4",
              "vo-scrapheart-4",
              "No convoy. No road. No way back.",
              2800
            )
          ],
          currentTakeId: "take-4"
        },
        {
          id: "line-5",
          speakerId: "speaker-narrator",
          text: "SCRAPHEART. In cinemas this winter.",
          takes: [],
          currentTakeId: null
        }
      ]
    }
  ]
};

const SINGULARITY_SCRIPT = {
  cast: [
    {
      id: "speaker-vo",
      name: "Voice",
      color: "#9460FF",
      voice: NARRATOR_VOICE
    }
  ],
  sections: [
    {
      id: "section-1",
      title: "Teaser",
      lines: [
        {
          id: "line-1",
          speakerId: "speaker-vo",
          text: "The end of limits.",
          takes: [],
          currentTakeId: null
        },
        {
          id: "line-2",
          speakerId: "speaker-vo",
          text: "The beginning of everything.",
          takes: [],
          currentTakeId: null
        }
      ]
    }
  ]
};

const timelineClip = (
  id: string,
  name: string,
  trackId: string,
  startMs: number,
  durationMs: number,
  mediaType: "image" | "video" | "audio" | "text",
  overrides: Record<string, unknown> = {}
) => ({
  id,
  trackId,
  name,
  startMs,
  durationMs,
  mediaType,
  sourceType: "generated",
  status: "generated",
  locked: false,
  versions: [],
  ...overrides
});

const SCRAPHEART_CUT_DURATION_MS = 27000;

const SCRAPHEART_CUT = {
  tracks: [
    {
      id: "scrapheart-track-video",
      name: "V1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    },
    {
      id: "scrapheart-track-vo",
      name: "VO",
      type: "audio",
      index: 1,
      visible: true,
      locked: false
    },
    {
      id: "scrapheart-track-music",
      name: "MUS",
      type: "audio",
      index: 2,
      visible: true,
      locked: false
    }
  ],
  clips: [
    timelineClip(
      "scrapheart-clip-01",
      "Convoy",
      "scrapheart-track-video",
      0,
      5000,
      "video"
    ),
    timelineClip(
      "scrapheart-clip-02",
      "The chain",
      "scrapheart-track-video",
      5000,
      4000,
      "video"
    ),
    timelineClip(
      "scrapheart-clip-03",
      "Drift",
      "scrapheart-track-video",
      9000,
      4000,
      "video"
    ),
    timelineClip(
      "scrapheart-clip-04",
      "Sparks",
      "scrapheart-track-video",
      13000,
      3000,
      "video"
    ),
    timelineClip(
      "scrapheart-clip-05",
      "Unmasked",
      "scrapheart-track-video",
      16000,
      4000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "scrapheart-clip-06",
      "Wreck at dusk",
      "scrapheart-track-video",
      20000,
      7000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "scrapheart-vo-01",
      "VO 1",
      "scrapheart-track-vo",
      800,
      2900,
      "audio"
    ),
    timelineClip(
      "scrapheart-vo-02",
      "VO 2",
      "scrapheart-track-vo",
      5200,
      2600,
      "audio"
    ),
    timelineClip(
      "scrapheart-vo-03",
      "VO 3",
      "scrapheart-track-vo",
      9400,
      3200,
      "audio"
    ),
    timelineClip(
      "scrapheart-vo-04",
      "VO 4",
      "scrapheart-track-vo",
      16200,
      2800,
      "audio"
    ),
    timelineClip(
      "scrapheart-music",
      "Bed",
      "scrapheart-track-music",
      0,
      SCRAPHEART_CUT_DURATION_MS,
      "audio",
      { sourceType: "imported" }
    )
  ],
  markers: [{ id: "scrapheart-marker-chain", timeMs: 5000, label: "Chain" }]
};

const ABYSS_CUT_DURATION_MS = 31000;

/** No takes rendered yet, so the cut is the stills held in order. */
const ABYSS_CUT = {
  tracks: [
    {
      id: "abyss-track-video",
      name: "V1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    },
    {
      id: "abyss-track-music",
      name: "MUS",
      type: "audio",
      index: 1,
      visible: true,
      locked: false
    }
  ],
  clips: [
    timelineClip(
      "abyss-clip-01",
      "Title on the water",
      "abyss-track-video",
      0,
      6000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "abyss-clip-02",
      "The descent",
      "abyss-track-video",
      6000,
      5000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "abyss-clip-03",
      "Bloom",
      "abyss-track-video",
      11000,
      6000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "abyss-clip-04",
      "The trench",
      "abyss-track-video",
      17000,
      5000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "abyss-clip-05",
      "The wreck",
      "abyss-track-video",
      22000,
      5000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "abyss-clip-06",
      "Surfacing",
      "abyss-track-video",
      27000,
      4000,
      "image",
      { status: "draft" }
    ),
    timelineClip(
      "abyss-music",
      "Bed",
      "abyss-track-music",
      0,
      ABYSS_CUT_DURATION_MS,
      "audio",
      { sourceType: "imported" }
    )
  ],
  markers: []
};

/** The layers the key-art sketch carries. Pixels are drawn at runtime. */
const keyartLayer = (
  id: string,
  name: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  name,
  type: "raster",
  visible: true,
  opacity: 1,
  locked: false,
  alphaLock: false,
  blendMode: "normal",
  data: null,
  transform: { x: 0, y: 0 },
  contentBounds: { x: 0, y: 0, width: 1024, height: 1536 },
  effects: [],
  ...overrides
});

const KEYART_SKETCH = {
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 1536, backgroundColor: "#07080d" },
    layers: [
      keyartLayer("layer-plate", "Plate"),
      keyartLayer("layer-glow", "Ring glow", {
        opacity: 0.62,
        blendMode: "screen"
      }),
      keyartLayer("layer-type", "Title & billing")
    ],
    activeLayerId: "layer-glow",
    maskLayerId: null,
    activeTool: "brush",
    viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    history: [],
    historyIndex: -1,
    metadata: {
      createdAt: "2025-01-14T11:30:00Z",
      updatedAt: "2025-01-14T11:44:00Z"
    }
  },
  layerBindings: []
};

// ── Ledger ───────────────────────────────────────────────────────────────────

interface SpendSpec {
  documentId: string;
  nodeType: string;
  capability: string;
  provider: string;
  model: string;
  cost: number | null;
  at: string;
}

const spendRows = (
  documentId: string,
  count: number,
  row: Omit<SpendSpec, "documentId" | "at">,
  startMinute: number
): SpendSpec[] =>
  Array.from({ length: count }, (_, index) => ({
    ...row,
    documentId,
    at: new Date(
      Date.parse("2025-01-14T10:00:00Z") + (startMinute + index) * 60_000
    ).toISOString()
  }));

const SCRAPHEART_SPEND: SpendSpec[] = [
  ...spendRows(
    "sb-scrapheart",
    6,
    {
      nodeType: "nodetool.image.TextToImage",
      capability: "text_to_image",
      provider: "fal_ai",
      model: "fal-ai/flux-pro/v1.1",
      cost: 0.24
    },
    12
  ),
  ...spendRows(
    "sb-scrapheart",
    4,
    {
      nodeType: "nodetool.video.ImageToVideo",
      capability: "image_to_video",
      provider: "fal_ai",
      model: "fal-ai/kling-video/v2/master",
      cost: 1.4
    },
    41
  ),
  ...spendRows(
    "script-scrapheart",
    4,
    {
      nodeType: "nodetool.audio.TextToSpeech",
      capability: "text_to_speech",
      provider: "elevenlabs",
      model: "eleven_turbo_v2_5",
      cost: 0.043
    },
    64
  ),
  ...spendRows(
    "sb-scrapheart",
    1,
    {
      nodeType: "nodetool.agents.Agent",
      capability: "generate_message",
      provider: "anthropic",
      model: "claude-sonnet-5",
      cost: 0.212
    },
    2
  ),
  ...spendRows(
    "tl-scrapheart",
    1,
    {
      nodeType: "nodetool.agents.Agent",
      capability: "generate_message",
      provider: "anthropic",
      model: "claude-sonnet-5",
      cost: 0.104
    },
    80
  )
];

const ABYSS_SPEND: SpendSpec[] = [
  ...spendRows(
    "sb-abyss",
    6,
    {
      nodeType: "nodetool.image.TextToImage",
      capability: "text_to_image",
      provider: "fal_ai",
      model: "fal-ai/flux/dev",
      cost: 0.075
    },
    10
  ),
  ...spendRows(
    "sb-abyss",
    1,
    {
      nodeType: "nodetool.agents.Agent",
      capability: "generate_message",
      provider: "anthropic",
      model: "claude-sonnet-5",
      cost: 0.168
    },
    2
  ),
  ...spendRows(
    "tl-abyss",
    1,
    {
      nodeType: "nodetool.agents.Agent",
      capability: "generate_message",
      provider: "anthropic",
      model: "claude-sonnet-5",
      cost: 0.086
    },
    50
  )
];

/**
 * SINGULARITY carries two unpriced calls — a model no catalog prices. Its
 * total is a lower bound, which is what the card's `unpriced` count says and
 * why the new-project estimate leaves it out.
 */
const SINGULARITY_SPEND: SpendSpec[] = [
  ...spendRows(
    "sk-singularity-keyart",
    2,
    {
      nodeType: "lib.image.Upscale",
      capability: "upscale_image",
      provider: "replicate",
      model: "nightmareai/real-esrgan",
      cost: null
    },
    20
  ),
  ...spendRows(
    "sk-singularity-keyart",
    3,
    {
      nodeType: "nodetool.image.TextToImage",
      capability: "text_to_image",
      provider: "fal_ai",
      model: "fal-ai/flux-pro/v1.1",
      cost: 0.24
    },
    14
  ),
  ...spendRows(
    "sb-singularity",
    1,
    {
      nodeType: "nodetool.agents.Agent",
      capability: "generate_message",
      provider: "anthropic",
      model: "claude-sonnet-5",
      cost: 0.121
    },
    3
  )
];

// ── The project agent's conversation ─────────────────────────────────────────

const SCRAPHEART_THREAD_ID = "thread-project-scrapheart";

const SCRAPHEART_TURNS: Array<{ role: "user" | "assistant"; text: string }> = [
  {
    role: "user",
    text:
      "A 90-second teaser for SCRAPHEART — a convoy chase in the desert, one " +
      "rider against a buggy, no dialogue.\n\nSet this up as a trailer: a " +
      "storyboard of shots, a voiceover script, and a cut assembled from the " +
      "rendered clips."
  },
  {
    role: "assistant",
    text:
      "Six shots, all on long lenses so the dust stays in the frame:\n\n" +
      "1. **Convoy** — the ridge, heat haze eating the horizon (5s)\n" +
      "2. **The chain** — the rider swings across the grille (4s)\n" +
      "3. **Drift** — the buggy comes round in its own dust (4s)\n" +
      "4. **Sparks** — chain against the rim, 120fps (3s)\n" +
      "5. **Unmasked** — the convoy has already gone (4s)\n" +
      "6. **Wreck at dusk** — hold to black (5s)\n\n" +
      "Board saved as **SCRAPHEART — shot board**. Render stills for all six?"
  },
  { role: "user", text: "Yes. Then animate whatever holds up." },
  {
    role: "assistant",
    text:
      "Six stills rendered on flux-pro at 21:9 — $1.44. Shots 1–4 animated " +
      "into takes; 5 and 6 read better as held frames, so the cut carries " +
      "them that way.\n\nThe voiceover is **SCRAPHEART — voiceover**, four of " +
      "its five lines voiced. Line 3 reads *\"Then somebody walked out of the " +
      "dust with a chain.\"* — you changed it after it was voiced, so its " +
      "take is stale."
  },
  { role: "user", text: "Assemble what we have so I can watch it end to end." },
  {
    role: "assistant",
    text:
      "**SCRAPHEART — cut v3** is assembled: 27 seconds, four takes on V1 " +
      "with the last two shots held as frames, the four voiced lines under " +
      "them, and the bed running full length.\n\nNext: re-voice line 3, then " +
      "the tail card — about $1.50 at the rates this project has been running."
  }
];

// ── Seeding ──────────────────────────────────────────────────────────────────

/** An ISO timestamp `hours` before the seed ran, so the fixture never ages. */
const agoIso = (hours: number): string =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

/**
 * A project row keeping the timestamps it was seeded with. The list card shows
 * a project's relative time, and `Project.beforeSave` stamps every write with
 * the current one — so without this every card in the fixture reads "just now"
 * and the list says nothing about how a real one accumulates.
 */
class SeededProject extends Project {
  override beforeSave(): void {}
}

const prediction = (
  id: string,
  projectId: string,
  spec: SpendSpec,
  userId: string
) =>
  new Prediction({
    id,
    user_id: userId,
    node_id: `node-${id}`,
    node_type: spec.nodeType,
    provider: spec.provider,
    model: spec.model,
    workflow_id: null,
    project_id: projectId,
    document_id: spec.documentId,
    status: "completed",
    cost: spec.cost,
    billing_unit: spec.capability,
    created_at: spec.at,
    completed_at: spec.at,
    metadata: { capability: spec.capability }
  });

async function saveLedger(
  projectId: string,
  specs: SpendSpec[],
  userId: string
): Promise<void> {
  let index = 0;
  for (const spec of specs) {
    index += 1;
    await prediction(
      `pred-${projectId}-${index}`,
      projectId,
      spec,
      userId
    ).save();
  }
}

/**
 * Copy a shipped frame into the asset store through the same call an upload
 * makes, so the row, the object key and the thumbnail match what the API
 * expects to find. A clip's thumbnail needs ffmpeg and warns without it, the
 * same way it does on an install that has none; nothing in the project views
 * reads one.
 */
async function seedMedia(asset: RepoAsset, userId: string): Promise<void> {
  const bytes = readFileSync(join(REPO_ROOT, asset.source));
  await Asset.create({
    id: asset.id,
    user_id: userId,
    parent_id: asset.parentId,
    name: asset.name,
    content_type: asset.contentType,
    size: bytes.byteLength,
    duration: asset.durationSeconds ?? null,
    metadata: null,
    workflow_id: null,
    node_id: null,
    job_id: null,
    created_at: agoIso(7),
    updated_at: agoIso(7)
  });
  await storeAssetWithThumbnail(
    userId,
    asset.id,
    getAssetFileName(asset.id, asset.contentType),
    bytes,
    asset.contentType
  );
}

/**
 * Seed the projects the documentation screenshots show, and copy the frames
 * their cards render into the asset store. Returns how many projects landed.
 */
export async function seedProjects(userId: string): Promise<number> {
  for (const asset of MEDIA) {
    await seedMedia(asset, userId);
  }

  await Thread.create({
    id: SCRAPHEART_THREAD_ID,
    user_id: userId,
    title: "SCRAPHEART — Trailer",
    created_at: agoIso(5),
    updated_at: agoIso(2)
  });
  let turnIndex = 0;
  for (const turn of SCRAPHEART_TURNS) {
    turnIndex += 1;
    await Message.create({
      id: `msg-scrapheart-${turnIndex}`,
      user_id: userId,
      thread_id: SCRAPHEART_THREAD_ID,
      role: turn.role,
      content: turn.text,
      created_at: agoIso(5 - turnIndex * 0.4),
      model: turn.role === "assistant" ? "claude-sonnet-5" : null,
      provider: turn.role === "assistant" ? "anthropic" : null
    });
  }

  const projects = [
    {
      id: "proj-scrapheart",
      name: "SCRAPHEART — Trailer",
      kind: "trailer",
      thread_id: SCRAPHEART_THREAD_ID,
      hoursAgo: 2
    },
    {
      id: "proj-abyss",
      name: "The Silent Abyss",
      kind: "trailer",
      thread_id: null,
      hoursAgo: 24 * 6
    },
    {
      id: "proj-singularity",
      name: "SINGULARITY — Key art",
      kind: "spot",
      thread_id: null,
      hoursAgo: 20
    }
  ];
  for (const row of projects) {
    await new SeededProject({
      id: row.id,
      user_id: userId,
      name: row.name,
      kind: row.kind,
      thread_id: row.thread_id,
      created_at: agoIso(row.hoursAgo + 3),
      updated_at: agoIso(row.hoursAgo)
    }).save();
  }

  // Every document model stamps `updated_at` on save and the overview lists
  // documents newest first, so the save order below is the display order
  // reversed: key art, cut, script, board — which puts the board at the top of
  // the project, where the work starts.
  await new ImageDocument({
    id: "sk-singularity-keyart",
    user_id: userId,
    project_id: "proj-singularity",
    name: "SINGULARITY — key art",
    width: 1024,
    height: 1536,
    background_color: "#07080d",
    document: JSON.stringify(KEYART_SKETCH),
    thumbnail_asset_id: SINGULARITY_KEY_ART.id,
    created_at: agoIso(21)
  }).save();

  const cuts = [
    {
      id: "tl-scrapheart",
      project_id: "proj-scrapheart",
      name: "SCRAPHEART — cut v3",
      document: SCRAPHEART_CUT,
      duration_ms: SCRAPHEART_CUT_DURATION_MS
    },
    {
      id: "tl-abyss",
      project_id: "proj-abyss",
      name: "Abyss — assembly",
      document: ABYSS_CUT,
      duration_ms: ABYSS_CUT_DURATION_MS
    }
  ];
  for (const cut of cuts) {
    await new TimelineSequence({
      id: cut.id,
      user_id: userId,
      project_id: cut.project_id,
      name: cut.name,
      fps: 24,
      width: 1920,
      height: 1080,
      duration_ms: cut.duration_ms,
      document: JSON.stringify(cut.document),
      created_at: agoIso(5)
    }).save();
  }

  const scripts = [
    {
      id: "script-scrapheart",
      project_id: "proj-scrapheart",
      name: "SCRAPHEART — voiceover",
      document: SCRAPHEART_SCRIPT
    },
    {
      id: "script-singularity",
      project_id: "proj-singularity",
      name: "SINGULARITY — voiceover",
      document: SINGULARITY_SCRIPT
    }
  ];
  for (const script of scripts) {
    await new Script({
      id: script.id,
      user_id: userId,
      project_id: script.project_id,
      name: script.name,
      document: JSON.stringify(script.document),
      created_at: agoIso(6)
    }).save();
  }

  const boards = [
    {
      id: "sb-scrapheart",
      project_id: "proj-scrapheart",
      name: "SCRAPHEART — shot board",
      document: SCRAPHEART_BOARD
    },
    {
      id: "sb-abyss",
      project_id: "proj-abyss",
      name: "Abyss — shot board",
      document: ABYSS_BOARD
    },
    {
      id: "sb-singularity",
      project_id: "proj-singularity",
      name: "SINGULARITY — shot board",
      document: SINGULARITY_BOARD
    }
  ];
  for (const board of boards) {
    await new Storyboard({
      id: board.id,
      user_id: userId,
      project_id: board.project_id,
      name: board.name,
      document: JSON.stringify(board.document),
      created_at: agoIso(7)
    }).save();
  }

  await saveLedger("proj-scrapheart", SCRAPHEART_SPEND, userId);
  await saveLedger("proj-abyss", ABYSS_SPEND, userId);
  await saveLedger("proj-singularity", SINGULARITY_SPEND, userId);

  return projects.length;
}
