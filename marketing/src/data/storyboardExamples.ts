// The example storyboards that ship with NodeTool. The text and stills come
// from packages/base-nodes/nodetool/examples/storyboards/<slug>.storyboard.json
// and its package assets. The stills are copied to public/storyboards/<slug>/
// as 960x540 WebP.

export interface StoryboardExampleShot {
  readonly slug: string;
  readonly action: string;
  readonly framing: string;
  readonly lens: string;
  readonly movement: string;
  readonly durationSeconds: number;
  readonly image: string;
}

export interface StoryboardExample {
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly brief: string;
  readonly shots: readonly StoryboardExampleShot[];
}

export const STORYBOARD_STILL = { width: 960, height: 540 } as const;

export const storyboardExamples: readonly StoryboardExample[] = [
  {
    slug: "lighthouse-keeper",
    name: "Lighthouse Keeper",
    category: "Short film opening",
    brief:
      "Open a short film about the last keeper of a coastal light. Twenty seconds, no dialogue, the sea doing the talking.",
    shots: [
      {
        slug: "Headland at dusk",
        action:
          "Wide on the headland: the tower standing over black cliffs, the last band of amber lying flat on the horizon, the sea already dark.",
        framing: "Extreme wide",
        lens: "50mm",
        movement: "Slow push in",
        durationSeconds: 5,
        image: "/storyboards/lighthouse-keeper/headland-at-dusk.webp"
      },
      {
        slug: "The lamp turns",
        action:
          "Close on the lamp housing as the optic turns, the glass throwing one hard edge of light straight past camera into the fog.",
        framing: "Close-up",
        lens: "85mm",
        movement: "Locked off",
        durationSeconds: 4,
        image: "/storyboards/lighthouse-keeper/the-lamp-turns.webp"
      },
      {
        slug: "The stair",
        action:
          "The keeper climbs the spiral stair with a lantern held low, shoulder against the curved wall, the treads falling away below.",
        framing: "Medium",
        lens: "35mm",
        movement: "Tilt up the stairwell",
        durationSeconds: 5,
        image: "/storyboards/lighthouse-keeper/the-stair.webp"
      },
      {
        slug: "Beam over water",
        action:
          "From the water, looking back: the beam sweeps across black swell, the tower reduced to a mark on the cliff line.",
        framing: "Wide",
        lens: "135mm",
        movement: "Slow pull back",
        durationSeconds: 6,
        image: "/storyboards/lighthouse-keeper/beam-over-water.webp"
      }
    ]
  },
  {
    slug: "sneaker-drop",
    name: "Sneaker Drop",
    category: "15-second product spot",
    brief:
      "Fifteen seconds for a running-shoe launch. Studio reveal, one texture beat, then out into the street at first light.",
    shots: [
      {
        slug: "Plinth reveal",
        action:
          "The shoe alone on a low plinth against a swept studio wall, one hard key raking in from the left and a long shadow off to the right.",
        framing: "Medium",
        lens: "85mm",
        movement: "Slow push in",
        durationSeconds: 5,
        image: "/storyboards/sneaker-drop/plinth-reveal.webp"
      },
      {
        slug: "Sole macro",
        action:
          "Hard macro across the sole: tread blocks running out of focus at both edges, the accent orange picked out in the channels.",
        framing: "Extreme close-up",
        lens: "100mm macro",
        movement: "Pan left across the tread",
        durationSeconds: 4,
        image: "/storyboards/sneaker-drop/sole-macro.webp"
      },
      {
        slug: "Street run-out",
        action:
          "Out of the studio: a runner cuts across an empty street at first light, skyline flat behind, the shoe the only warm thing in frame.",
        framing: "Wide",
        lens: "35mm",
        movement: "Whip pan right with the runner",
        durationSeconds: 6,
        image: "/storyboards/sneaker-drop/street-run-out.webp"
      }
    ]
  },
  {
    slug: "first-light",
    name: "First Light",
    category: "Travel teaser",
    brief:
      "Ten seconds of travel teaser. Dune at pre-dawn, a canyon road catching the first sun, then a lit tent under the Milky Way.",
    shots: [
      {
        slug: "Dunes before sunrise",
        action:
          "Dune ridges stacked back to the horizon in flat pre-dawn light, the near crest cutting a clean diagonal across the frame.",
        framing: "Extreme wide",
        lens: "70mm",
        movement: "Slow pan right along the ridge",
        durationSeconds: 4,
        image: "/storyboards/first-light/dunes-before-sunrise.webp"
      },
      {
        slug: "Canyon switchback",
        action:
          "Looking down a canyon switchback: the road folding back on itself between two walls, first sun catching only the upper rim.",
        framing: "Wide",
        lens: "24mm",
        movement: "Tilt up the canyon wall",
        durationSeconds: 3,
        image: "/storyboards/first-light/canyon-switchback.webp"
      },
      {
        slug: "Camp under stars",
        action:
          "Night: a single lit tent on the flat, the sky opening above it, one cold ridge line holding the bottom of frame.",
        framing: "Wide",
        lens: "35mm",
        movement: "Very slow push in",
        durationSeconds: 3,
        image: "/storyboards/first-light/camp-under-stars.webp"
      }
    ]
  }
];
