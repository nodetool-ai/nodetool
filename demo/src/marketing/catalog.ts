export const MARKETING_FPS = 30;

/** Crop coordinates in the accepted 1920 × 1080 source, excluding baked titles. */
export type Crop = readonly [
  x: number,
  y: number,
  width: number,
  height: number
];

export interface MarketingShot {
  readonly title: string;
  readonly detail: string;
  readonly start: number;
  readonly end: number;
  readonly crop: Crop;
  readonly durationFrames?: number;
}

export interface MarketingEdit {
  readonly slug: string;
  readonly category: string;
  readonly shots: readonly MarketingShot[];
  readonly posterFrame: number;
}

export const MARKETING_EDITS: readonly MarketingEdit[] = [
  {
    slug: "conversation-project",
    category: "ONE CONVERSATION. ONE PROJECT.",
    posterFrame: 700,
    shots: [
      {
        title: "Pitch the impossible.",
        detail: "Describe the film you want to make.",
        start: 0,
        end: 5,
        crop: [100, 390, 1730, 300]
      },
      {
        title: "Watch it take shape.",
        detail: "The agent turns your brief into a storyboard.",
        start: 5,
        end: 9,
        crop: [180, 275, 1500, 420]
      },
      {
        title: "One idea. Six shots.",
        detail: "Review the images as they arrive.",
        start: 9,
        end: 13,
        crop: [70, 270, 1780, 730]
      },
      {
        title: "Open your storyboard.",
        detail: "Keep every shot available to edit.",
        start: 13,
        end: 17,
        crop: [70, 300, 1780, 520]
      },
      {
        title: "Own the cut.",
        detail: "Arrange the shots on your timeline.",
        start: 17,
        end: 21,
        crop: [140, 375, 1640, 300]
      },
      {
        title: "Keep the whole project.",
        detail: "The board, the assets, and the edit stay yours.",
        start: 21,
        end: 26,
        crop: [340, 275, 1260, 670]
      }
    ]
  },
  {
    slug: "hero-project",
    category: "FROM BRIEF TO CAMPAIGN",
    posterFrame: 1070,
    shots: [
      {
        title: "Start with an idea.",
        detail: "A product. A brief. One creative workspace.",
        start: 0,
        end: 4,
        crop: [80, 240, 1740, 560]
      },
      {
        title: "See the story take shape.",
        detail: "The agent builds your storyboard.",
        start: 4,
        end: 7,
        crop: [180, 150, 1510, 790]
      },
      {
        title: "Make the cut yours.",
        detail: "Take control of the timeline.",
        start: 7,
        end: 10,
        crop: [110, 365, 1690, 390]
      },
      {
        title: "Direct the next take.",
        detail: "Ask the agent to replace one shot.",
        start: 10,
        end: 15,
        crop: [200, 370, 1510, 400]
      },
      {
        title: "One shot changes.",
        detail: "The rest of your edit stays in place.",
        start: 15,
        end: 18,
        crop: [50, 450, 1810, 290]
      },
      {
        title: "Refine the timing.",
        detail: "Trim the shot yourself.",
        start: 18,
        end: 21,
        crop: [120, 470, 1680, 200]
      },
      {
        title: "Build it once.",
        detail: "Keep the workflow for the next product.",
        start: 21,
        end: 24,
        crop: [0, 160, 1920, 920]
      },
      {
        title: "Make it an app.",
        detail: "Turn your workflow into a tool you can reuse.",
        start: 24,
        end: 27,
        crop: [0, 160, 1920, 920]
      },
      {
        title: "Add your product.",
        detail: "Upload a product image.",
        start: 27,
        end: 28.3,
        crop: [280, 230, 1320, 720]
      },
      {
        title: "Choose the look.",
        detail: "Set the studio background.",
        start: 28.3,
        end: 29.5,
        crop: [100, 400, 1720, 360]
      },
      {
        title: "Run your workflow.",
        detail: "One action starts the generation.",
        start: 29.5,
        end: 31,
        crop: [100, 420, 1720, 360]
      },
      {
        title: "Your campaign, ready.",
        detail: "Review the generated assets together.",
        start: 31,
        end: 34,
        crop: [0, 160, 1920, 920]
      },
      {
        title: "Your assets. Your edit.",
        detail: "Your workflow, ready for the next idea.",
        start: 34,
        end: 40,
        crop: [0, 160, 1920, 920]
      }
    ]
  },
  {
    slug: "surface-storyboard",
    category: "STORYBOARD",
    posterFrame: 166,
    shots: [
      {
        title: "See the story before you shoot.",
        detail: "Build the board. Review every frame.",
        start: 0.5,
        end: 5.5,
        durationFrames: 180,
        crop: [0, 130, 1180, 590]
      }
    ]
  },
  {
    slug: "surface-script",
    category: "SCRIPT & VOICE",
    posterFrame: 125,
    shots: [
      {
        title: "Give every line a voice.",
        detail: "Write the dialogue. Cast the performance.",
        start: 0.5,
        end: 5.5,
        durationFrames: 180,
        crop: [250, 25, 970, 475]
      }
    ]
  },
  {
    slug: "surface-timeline",
    category: "TIMELINE",
    posterFrame: 120,
    shots: [
      {
        title: "Find the rhythm of the edit.",
        detail: "Arrange video and sound on one timeline.",
        start: 0.5,
        end: 5.5,
        durationFrames: 180,
        crop: [0, 670, 1920, 270]
      }
    ]
  },
  {
    slug: "surface-sketch",
    category: "SKETCH",
    posterFrame: 120,
    shots: [
      {
        title: "Shape the image, layer by layer.",
        detail: "Paint, blend, and generate on the same canvas.",
        start: 0.5,
        end: 5.5,
        durationFrames: 180,
        crop: [0, 0, 1380, 855]
      }
    ]
  },
  {
    slug: "surface-3d",
    category: "3D COMPOSITION",
    posterFrame: 100,
    shots: [
      {
        title: "Direct the scene in three dimensions.",
        detail: "Compose objects, lighting, and camera.",
        start: 0.75,
        end: 5.5,
        durationFrames: 180,
        crop: [435, 50, 1200, 1030]
      }
    ]
  }
];

export const shotFrames = (shot: MarketingShot): number =>
  shot.durationFrames ??
  Math.round(shot.end * MARKETING_FPS) - Math.round(shot.start * MARKETING_FPS);

export const editFrames = (edit: MarketingEdit): number =>
  edit.shots.reduce((total, shot) => total + shotFrames(shot), 0);
