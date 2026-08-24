// The curated example storyboards, one entry per shipped board.
// `scripts/build-example-storyboards.mjs` turns each entry into
// `packages/base-nodes/nodetool/examples/storyboards/<slug>.storyboard.json`
// plus the shot media under
// `packages/base-nodes/nodetool/assets/nodetool-base/storyboards/<slug>/`.
//
// A shot carries the text a director writes (slug, action, motion, camera,
// duration) and a `frame` — the scene the still renderer draws. The frame is a
// list of layers painted back to front in a 1600x900 space:
//
//   { kind: "sky",      colors: [top, middle, bottom] }
//   { kind: "glow",     x, y, r, color, opacity }        radial falloff
//   { kind: "disc",     x, y, r, color, opacity }
//   { kind: "band",     y, h, color, opacity }
//   { kind: "ridge",    y, amp, color, opacity }         silhouette to the floor
//   { kind: "poly",     points: [[x, y], …], color, opacity }
//   { kind: "beam",     x, y, angle, length, spread, color, opacity }
//   { kind: "vignette", opacity }
//
// `motion` on the shot is both the director's line and the camera move the
// clip renders: push-in, pull-back, pan-left, pan-right, tilt-up, hold.

const NIGHT = "#050a12";
const INK = "#070d16";

export const EXAMPLE_STORYBOARDS = [
  {
    slug: "lighthouse-keeper",
    name: "Lighthouse Keeper — Opening",
    description:
      "A four-shot opening for a short film about the last keeper of a coastal light. Every shot arrives with its still and clip already rendered.",
    tags: ["film", "narrative", "atmosphere"],
    brief:
      "Open a short film about the last keeper of a coastal light. Twenty seconds, no dialogue, the sea doing the talking.",
    style:
      "Dusk coastal palette — deep blues into a single band of amber. Long lenses, heavy air, silhouettes over detail, 35mm grain.",
    aspectRatio: "16:9",
    shots: [
      {
        slug: "headland at dusk",
        action:
          "Wide on the headland: the tower standing over black cliffs, the last band of amber lying flat on the horizon, the sea already dark.",
        motion: "push-in",
        camera: { framing: "extreme wide", lens: "50mm", movement: "slow push in" },
        durationSeconds: 5,
        frame: [
          { kind: "sky", colors: ["#0a1626", "#2b4a6b", "#e0a25c"] },
          { kind: "glow", x: 1180, y: 590, r: 420, color: "#f3b970", opacity: 0.5 },
          { kind: "disc", x: 1180, y: 596, r: 46, color: "#ffdca6", opacity: 0.9 },
          { kind: "band", y: 612, h: 288, color: "#10233a", opacity: 0.96 },
          { kind: "ridge", y: 646, amp: 54, color: INK, opacity: 1 },
          {
            kind: "poly",
            points: [[402, 292], [456, 292], [474, 660], [384, 660]],
            color: NIGHT,
            opacity: 1
          },
          {
            kind: "poly",
            points: [[396, 258], [462, 258], [456, 292], [402, 292]],
            color: NIGHT,
            opacity: 1
          },
          { kind: "beam", x: 429, y: 274, angle: -6, length: 1180, spread: 7, color: "#ffe7c2", opacity: 0.16 },
          { kind: "vignette", opacity: 0.45 }
        ]
      },
      {
        slug: "the lamp turns",
        action:
          "Close on the lamp housing as the optic turns, the glass throwing one hard edge of light straight past camera into the fog.",
        motion: "hold",
        camera: { framing: "close-up", lens: "85mm", movement: "locked off" },
        durationSeconds: 4,
        frame: [
          { kind: "sky", colors: ["#050a12", "#0d1a2a", "#132539"] },
          { kind: "glow", x: 700, y: 430, r: 520, color: "#ffd79a", opacity: 0.42 },
          { kind: "disc", x: 700, y: 430, r: 168, color: "#f7e3bd", opacity: 0.9 },
          { kind: "disc", x: 700, y: 430, r: 96, color: "#fff6e2", opacity: 0.95 },
          { kind: "beam", x: 700, y: 430, angle: 4, length: 1200, spread: 13, color: "#ffeccb", opacity: 0.3 },
          {
            kind: "poly",
            points: [[470, 214], [930, 214], [930, 268], [470, 268]],
            color: NIGHT,
            opacity: 1
          },
          {
            kind: "poly",
            points: [[470, 640], [930, 640], [930, 900], [470, 900]],
            color: NIGHT,
            opacity: 1
          },
          { kind: "vignette", opacity: 0.5 }
        ]
      },
      {
        slug: "the stair",
        action:
          "The keeper climbs the spiral stair with a lantern held low, shoulder against the curved wall, the treads falling away below.",
        motion: "tilt-up",
        camera: { framing: "medium", lens: "35mm", movement: "tilt up the stairwell" },
        durationSeconds: 5,
        frame: [
          { kind: "sky", colors: ["#0b0d12", "#1b1a1e", "#2b2320"] },
          { kind: "glow", x: 660, y: 610, r: 300, color: "#e8a45a", opacity: 0.5 },
          {
            kind: "poly",
            points: [[0, 260], [360, 190], [360, 900], [0, 900]],
            color: "#141318",
            opacity: 1
          },
          {
            kind: "poly",
            points: [[1240, 150], [1600, 240], [1600, 900], [1240, 900]],
            color: "#141318",
            opacity: 1
          },
          { kind: "poly", points: [[360, 764], [1240, 690], [1240, 752], [360, 826]], color: "#2a2327", opacity: 1 },
          { kind: "poly", points: [[360, 596], [1240, 536], [1240, 590], [360, 650]], color: "#211c21", opacity: 1 },
          { kind: "poly", points: [[360, 440], [1240, 396], [1240, 444], [360, 488]], color: "#1a171c", opacity: 1 },
          { kind: "glow", x: 872, y: 560, r: 240, color: "#ffcf88", opacity: 0.5 },
          {
            kind: "poly",
            points: [[672, 300], [790, 300], [818, 470], [830, 716], [636, 716], [648, 470]],
            color: NIGHT,
            opacity: 1
          },
          { kind: "disc", x: 872, y: 560, r: 30, color: "#ffd79b", opacity: 0.95 },
          { kind: "vignette", opacity: 0.55 }
        ]
      },
      {
        slug: "beam over water",
        action:
          "From the water, looking back: the beam sweeps across black swell, the tower reduced to a mark on the cliff line.",
        motion: "pull-back",
        camera: { framing: "wide", lens: "135mm", movement: "slow pull back" },
        durationSeconds: 6,
        frame: [
          { kind: "sky", colors: ["#060d1a", "#0f2035", "#1b3550"] },
          { kind: "disc", x: 320, y: 210, r: 40, color: "#dfe8f5", opacity: 0.8 },
          { kind: "glow", x: 320, y: 210, r: 190, color: "#cddcf0", opacity: 0.28 },
          { kind: "band", y: 520, h: 380, color: "#08111d", opacity: 0.97 },
          { kind: "band", y: 604, h: 12, color: "#2c4a6a", opacity: 0.35 },
          { kind: "band", y: 688, h: 10, color: "#26425f", opacity: 0.3 },
          { kind: "band", y: 792, h: 8, color: "#1f3752", opacity: 0.25 },
          { kind: "ridge", y: 500, amp: 26, color: "#050a12", opacity: 1 },
          {
            kind: "poly",
            points: [[1206, 404], [1232, 404], [1240, 496], [1198, 496]],
            color: "#03070d",
            opacity: 1
          },
          { kind: "beam", x: 1219, y: 396, angle: 172, length: 1180, spread: 6, color: "#ffe7c2", opacity: 0.2 },
          { kind: "vignette", opacity: 0.5 }
        ]
      }
    ]
  },
  {
    slug: "sneaker-drop",
    name: "Sneaker Drop — 15s Spot",
    description:
      "A three-shot product spot: studio reveal, sole macro, street run-out. Stills and clips are prefilled, so the board is a working example the moment it installs.",
    tags: ["advertising", "product", "short-form"],
    brief:
      "Fifteen seconds for a running-shoe launch. Studio reveal, one texture beat, then out into the street at first light.",
    style:
      "High-key studio graduating to cold street blue. Single hard key light, long shadows, saturated accent on the shoe only.",
    aspectRatio: "16:9",
    shots: [
      {
        slug: "plinth reveal",
        action:
          "The shoe alone on a low plinth against a swept studio wall, one hard key raking in from the left and a long shadow off to the right.",
        motion: "push-in",
        camera: { framing: "medium", lens: "85mm", movement: "slow push in" },
        durationSeconds: 5,
        frame: [
          { kind: "sky", colors: ["#1c1f26", "#2b3038", "#3d434d"] },
          { kind: "glow", x: 520, y: 380, r: 520, color: "#e9edf5", opacity: 0.24 },
          { kind: "band", y: 600, h: 300, color: "#171a20", opacity: 1 },
          { kind: "poly", points: [[520, 600], [1080, 600], [1020, 726], [580, 726]], color: "#0f1217", opacity: 1 },
          { kind: "poly", points: [[900, 600], [1460, 648], [1460, 686], [900, 638]], color: "#0b0e12", opacity: 0.75 },
          {
            kind: "poly",
            points: [[556, 576], [624, 448], [840, 424], [986, 484], [1036, 566], [1030, 600], [562, 600]],
            color: "#ff5a3c",
            opacity: 1
          },
          {
            kind: "poly",
            points: [[562, 574], [1030, 574], [1036, 606], [556, 606]],
            color: "#f4f6fa",
            opacity: 1
          },
          { kind: "vignette", opacity: 0.4 }
        ]
      },
      {
        slug: "sole macro",
        action:
          "Hard macro across the sole: tread blocks running out of focus at both edges, the accent orange picked out in the channels.",
        motion: "pan-left",
        camera: { framing: "extreme close-up", lens: "100mm macro", movement: "pan left across the tread" },
        durationSeconds: 4,
        frame: [
          { kind: "sky", colors: ["#101318", "#191d24", "#23282f"] },
          { kind: "glow", x: 900, y: 450, r: 560, color: "#ffb59c", opacity: 0.18 },
          { kind: "poly", points: [[120, 900], [420, 120], [620, 120], [320, 900]], color: "#2b3038", opacity: 1 },
          { kind: "poly", points: [[420, 900], [720, 120], [860, 120], [560, 900]], color: "#ff5a3c", opacity: 0.9 },
          { kind: "poly", points: [[700, 900], [1000, 120], [1200, 120], [900, 900]], color: "#2b3038", opacity: 1 },
          { kind: "poly", points: [[1000, 900], [1300, 120], [1440, 120], [1140, 900]], color: "#ff5a3c", opacity: 0.75 },
          { kind: "vignette", opacity: 0.55 }
        ]
      },
      {
        slug: "street run out",
        action:
          "Out of the studio: a runner cuts across an empty street at first light, skyline flat behind, the shoe the only warm thing in frame.",
        motion: "pan-right",
        camera: { framing: "wide", lens: "35mm", movement: "whip pan right with the runner" },
        durationSeconds: 6,
        frame: [
          { kind: "sky", colors: ["#101d33", "#27476d", "#f0a96a"] },
          { kind: "glow", x: 1240, y: 520, r: 400, color: "#ffc98a", opacity: 0.45 },
          { kind: "poly", points: [[0, 560], [180, 560], [180, 700], [340, 700], [340, 500], [520, 500], [520, 700], [760, 700], [760, 600], [900, 600], [900, 700], [1180, 700], [1180, 540], [1330, 540], [1330, 700], [1600, 700], [1600, 900], [0, 900]], color: "#0b1422", opacity: 1 },
          { kind: "band", y: 700, h: 200, color: "#0d1826", opacity: 1 },
          { kind: "band", y: 806, h: 8, color: "#33506f", opacity: 0.5 },
          {
            kind: "poly",
            points: [[700, 596], [736, 566], [762, 596], [744, 660], [782, 726], [744, 738], [706, 682], [664, 730], [636, 714], [686, 650]],
            color: "#060c16",
            opacity: 1
          },
          { kind: "poly", points: [[744, 726], [790, 742], [780, 758], [734, 742]], color: "#ff5a3c", opacity: 1 },
          { kind: "vignette", opacity: 0.42 }
        ]
      }
    ]
  },
  {
    slug: "first-light",
    name: "First Light — Travel Teaser",
    description:
      "A three-shot travel teaser cut from dune to canyon to camp. Prefilled text, stills, and clips — open it to see a finished board before rendering anything of your own.",
    tags: ["travel", "teaser", "landscape"],
    brief:
      "A ten-second teaser for a desert trip: dunes before sunrise, a switchback in the canyon, and a camp under the stars.",
    style:
      "Wide, quiet, no people in the first two frames. Sand pinks into cold blue, high horizon lines, one warm source per shot.",
    aspectRatio: "16:9",
    shots: [
      {
        slug: "dunes before sunrise",
        action:
          "Dune ridges stacked back to the horizon in flat pre-dawn light, the near crest cutting a clean diagonal across the frame.",
        motion: "pan-right",
        camera: { framing: "extreme wide", lens: "70mm", movement: "slow pan right along the ridge" },
        durationSeconds: 4,
        frame: [
          { kind: "sky", colors: ["#1f2b52", "#5b5a7e", "#e6a98d"] },
          { kind: "glow", x: 400, y: 520, r: 420, color: "#ffd0ab", opacity: 0.4 },
          { kind: "ridge", y: 520, amp: 34, color: "#b98570", opacity: 1 },
          { kind: "ridge", y: 620, amp: 52, color: "#8d5f52", opacity: 1 },
          { kind: "ridge", y: 740, amp: 70, color: "#5b3a36", opacity: 1 },
          { kind: "vignette", opacity: 0.38 }
        ]
      },
      {
        slug: "canyon switchback",
        action:
          "Looking down a canyon switchback: the road folding back on itself between two walls, first sun catching only the upper rim.",
        motion: "tilt-up",
        camera: { framing: "wide", lens: "24mm", movement: "tilt up the canyon wall" },
        durationSeconds: 3,
        frame: [
          { kind: "sky", colors: ["#2b1c22", "#6b3a30", "#d98b56"] },
          { kind: "glow", x: 860, y: 180, r: 320, color: "#ffca8e", opacity: 0.4 },
          { kind: "poly", points: [[0, 0], [520, 0], [700, 900], [0, 900]], color: "#2a1a1c", opacity: 1 },
          { kind: "poly", points: [[1100, 0], [1600, 0], [1600, 900], [940, 900]], color: "#33201f", opacity: 1 },
          { kind: "poly", points: [[700, 900], [820, 520], [900, 520], [940, 900]], color: "#c9a184", opacity: 0.9 },
          { kind: "poly", points: [[820, 520], [1060, 470], [1080, 512], [846, 560]], color: "#c9a184", opacity: 0.8 },
          { kind: "vignette", opacity: 0.5 }
        ]
      },
      {
        slug: "camp under stars",
        action:
          "Night: a single lit tent on the flat, the sky opening above it, one cold ridge line holding the bottom of frame.",
        motion: "push-in",
        camera: { framing: "wide", lens: "35mm", movement: "very slow push in" },
        durationSeconds: 3,
        frame: [
          { kind: "sky", colors: ["#030713", "#0b1730", "#16294a"] },
          { kind: "glow", x: 800, y: 300, r: 620, color: "#5f7bb5", opacity: 0.22 },
          { kind: "disc", x: 470, y: 180, r: 4, color: "#ffffff", opacity: 0.9 },
          { kind: "disc", x: 1180, y: 140, r: 5, color: "#ffffff", opacity: 0.85 },
          { kind: "disc", x: 980, y: 300, r: 3, color: "#dfe8ff", opacity: 0.8 },
          { kind: "disc", x: 300, y: 380, r: 3, color: "#dfe8ff", opacity: 0.7 },
          { kind: "disc", x: 1420, y: 330, r: 4, color: "#ffffff", opacity: 0.7 },
          { kind: "ridge", y: 700, amp: 30, color: "#050a16", opacity: 1 },
          { kind: "poly", points: [[740, 720], [830, 610], [920, 720]], color: "#0d1526", opacity: 1 },
          { kind: "glow", x: 830, y: 690, r: 120, color: "#ffb774", opacity: 0.55 },
          { kind: "vignette", opacity: 0.55 }
        ]
      }
    ]
  }
];
