/**
 * The fixed words on a storyboard, ad concept or recipe page: headings,
 * buttons, fact labels and screen-reader text. English is the default. A
 * translated detail page passes its locale's set; the entry's own text comes
 * from i18n/details.ts. `{name}` placeholders are filled by `fmt`.
 */
import type { StoryboardCategory } from "@/data/storyboards";

export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

export type StoryboardViewerLabels = {
  film: string;
  shotsInFilm: string;
  playShot: string;
  stillAlt: string;
  shot: string;
  seconds: string;
  framing: string;
  movement: string;
  playThis: string;
  heading: string;
  summary: string;
};

export type StoryboardLabels = {
  metaTitle: string;
  back: string;
  kind: string;
  length: string;
  shots: string;
  format: string;
  categories: Record<StoryboardCategory, string>;
  brief: string;
  style: string;
  openTitle: string;
  openBody: string;
  /** "See how the {editor} turns the shots into a timeline, or read the {guide}." */
  openLinks: string;
  editor: string;
  guide: string;
  /** Commercials only: "For product spots, see {marketing}." */
  productLinks: string;
  marketing: string;
  download: string;
  more: string;
  seeAll: string;
  viewer: StoryboardViewerLabels;
};

export type AdSequenceLabels = {
  beatsTitle: string;
  beatsSummary: string;
  film: string;
  note: string;
  beat: string;
  motion: string;
  sound: string;
  check: string;
  copySlot: string;
  seconds: string;
  preview: string;
  pause: string;
  play: string;
  showBeat: string;
};

export type AdLabels = {
  metaTitle: string;
  back: string;
  concept: string;
  length: string;
  beats: string;
  frameRate: string;
  complexity: string;
  complexityLevels: Record<string, string>;
  motionPrinciple: string;
  useWhen: string;
  avoidWhen: string;
  need: string;
  consistent: string;
  copyBudget: string;
  copyBudgetNote: string;
  words: string;
  optional: string;
  layerStack: string;
  layerStackNote: string;
  formats: string;
  buildTitle: string;
  buildBody: string;
  /** "Read how {miniApps} work, see {marketing} for spots with generated shots, or cut the ad further in the {editor}." */
  buildLinks: string;
  miniApps: string;
  marketing: string;
  editor: string;
  productionPlan: string;
  review: string;
  reviewHeading: string;
  watchOut: string;
  fallback: string;
  variations: string;
  moreConcepts: string;
  alternative: string;
  next: string;
  /** Beat roles, copy slots and goals by key. A missing key falls back to formatKey. */
  keys: Record<string, string>;
  sequence: AdSequenceLabels;
};

export type RecipeGuideLabels = {
  follow: string;
  bring: string;
  tryScript: string;
  tryBrief: string;
  /** Shown when the brief stays in the language the run used. */
  briefNote?: string;
  copy: string;
  copied: string;
  copiedStatus: string;
  copyError: string;
  about: string;
  steps: string;
  autoplayOff: string;
  pause: string;
  resume: string;
  auto: string;
  paused: string;
  recordedImage: string;
  stepOf: string;
};

export type RecipeLabels = {
  back: string;
  kicker: string;
  download: string;
  seeSteps: string;
  startScript: string;
  startIdea: string;
  startBody: string;
  footnote: string;
  related: string;
  relatedLinks: { href: string; label: string }[];
  guideLink: string;
  another: string;
  /** Shown above the step diagrams when they keep the run's English labels. */
  diagramNote?: string;
  guide: RecipeGuideLabels;
};

export const EN_STORYBOARD_LABELS: StoryboardLabels = {
  metaTitle: "{title} storyboard | NodeTool",
  back: "All storyboards",
  kind: "Storyboard",
  length: "Length",
  shots: "Shots",
  format: "Format",
  categories: { commercial: "Commercials", film: "Film", animation: "Animation", nature: "Nature" },
  brief: "The brief",
  style: "Visual style",
  openTitle: "Change a shot, render again",
  openBody:
    "This storyboard ships as an example in NodeTool. Open it in the Studio, edit the direction for any shot, and render a new take.",
  openLinks: "See how the {editor} turns the shots into a timeline, or read the {guide}.",
  editor: "AI video editor",
  guide: "Storyboard Editor guide",
  productLinks: "For product spots, see {marketing}.",
  marketing: "AI for advertising",
  download: "Download NodeTool",
  more: "More storyboards",
  seeAll: "See all {count}",
  viewer: {
    film: "{title}, the finished film",
    shotsInFilm: "Shots in the film",
    playShot: "Play shot {n}: {title}",
    stillAlt: "Shot {n}, {title}: the storyboard still",
    shot: "Shot {n}",
    seconds: "{n}s",
    framing: "Framing",
    movement: "Camera movement",
    playThis: "Play this shot",
    heading: "The storyboard",
    summary:
      "{shots} shots, {seconds} seconds planned. Each still is the keyframe for its shot. The direction beside it describes the action and the camera.",
  },
};

export const EN_AD_LABELS: AdLabels = {
  metaTitle: "{title} video ad template | NodeTool",
  back: "Video ad templates",
  concept: "Concept {n}",
  length: "Length",
  beats: "Beats",
  frameRate: "Frame rate",
  complexity: "Complexity",
  complexityLevels: {},
  motionPrinciple: "Motion principle",
  useWhen: "Use it when",
  avoidWhen: "Pick another concept when",
  need: "What you need",
  consistent: "Keep this consistent",
  copyBudget: "Copy budget",
  copyBudgetNote: "Word counts are a starting point. Keep required qualifications.",
  words: "{n} words",
  optional: " · optional",
  layerStack: "Layer stack",
  layerStackNote: "Top of the frame first.",
  formats: "Adapt the format",
  buildTitle: "Build this ad in NodeTool",
  buildBody:
    "This concept ships with NodeTool as a mini app. It builds an editable {seconds}-second vertical ad from your images, logo, and copy. AI can suggest options from a website to fill the fields with its copy and images. It uses no generated video.",
  buildLinks:
    "Read how {miniApps} work, see {marketing} for spots with generated shots, or cut the ad further in the {editor}.",
  miniApps: "mini apps",
  marketing: "AI for advertising",
  editor: "AI video editor",
  productionPlan: "Production plan",
  review: "Review",
  reviewHeading: "Review the finished ad",
  watchOut: "Watch out",
  fallback: "Fallback. ",
  variations: "Variations",
  moreConcepts: "More ad concepts",
  alternative: "Another approach to the brief",
  next: "Next concept",
  keys: {},
  sequence: {
    beatsTitle: "Beat sheet",
    beatsSummary: "{count} beats · {duration}",
    film: "{title}, rendered from a NodeTool timeline",
    note: "Rendered from a NodeTool timeline at these beat times. The brand, copy and numbers are fictional.",
    beat: "Beat {n} · ",
    motion: "Motion",
    sound: "Sound",
    check: "Check",
    copySlot: "Copy slot:",
    seconds: "{n}s",
    preview: "Sequence preview",
    pause: "Pause preview",
    play: "Play preview",
    showBeat: "Show beat {n}: {role}",
  },
};

export const EN_RECIPE_LABELS: RecipeLabels = {
  back: "All recipes",
  kicker: "NodeTool example project",
  download: "Download NodeTool Studio",
  seeSteps: "See every step",
  startScript: "Start with your own script",
  startIdea: "Start with your own idea",
  startBody:
    "Install NodeTool Studio, create a project, and choose {entry}. Add your brief and references, then connect your provider keys before generating media.",
  footnote:
    "Studio is free and open source. You pay providers directly for media generation. Set up your own project using the guide above.",
  related: "Related pages",
  relatedLinks: [
    { href: "/storyboards", label: "AI storyboard generator" },
    { href: "/ai-video-editor", label: "AI video editor" },
    { href: "/marketing", label: "AI for advertising" },
    { href: "/ad-library", label: "Video ad templates" },
  ],
  guideLink: "Storyboard Editor guide",
  another: "Try another recipe",
  guide: {
    follow: "Follow the {entry} guide",
    bring: "Bring to this recipe",
    tryScript: "Try the example script",
    tryBrief: "Try the example brief",
    copy: "Copy",
    copied: "Copied",
    copiedStatus: "Copied to clipboard.",
    copyError: "Select the text above and copy it to use this example.",
    about: "About this example",
    steps: "Recipe steps",
    autoplayOff: "Autoplay disabled by reduced motion preference",
    pause: "Pause step autoplay",
    resume: "Resume step autoplay",
    auto: "Auto",
    paused: "Paused",
    recordedImage: "Open the recorded image for this step",
    stepOf: "Step {n} of {total} · {phase}",
  },
};
