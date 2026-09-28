export interface TimelineExample {
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly durationSeconds: number;
}

export const timelineExamples: readonly TimelineExample[] = [
  {
    slug: "serein",
    name: "Serein",
    category: "Software launch film",
    description: "An inbox becomes a product story through animated scenes, type, and interface details.",
    durationSeconds: 26
  },
  {
    slug: "kite",
    name: "Kite",
    category: "App motion graphics",
    description: "A savings app brought to life with kinetic type, a growing chart, and an animated goal ring.",
    durationSeconds: 15
  },
  {
    slug: "tidewater",
    name: "Tidewater",
    category: "Animated event poster",
    description: "A jazz festival poster in motion, with layered inks, cut-paper shapes, and a swing score.",
    durationSeconds: 16
  },
  {
    slug: "prism",
    name: "Prism",
    category: "Running-shoe campaign",
    description: "A shoe launch built from product stills, colour trails, and orbiting type.",
    durationSeconds: 18
  },
  {
    slug: "voltra",
    name: "Voltra",
    category: "Motorcycle launch ad",
    description: "An electric motorcycle campaign with parallax, animated gauges, and a cut timed to the beat.",
    durationSeconds: 23
  }
];
