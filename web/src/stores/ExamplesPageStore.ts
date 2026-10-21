// ExamplesPageStore.ts
// -----------------------------------------------------------------
// Which tab the Examples page shows. The page is a workspace tab, so
// a caller that wants a specific kind of example (the start page's
// "Video examples" card) sets the tab here before opening the page.
// -----------------------------------------------------------------

import { create } from "zustand";

export const EXAMPLE_TABS = [
  "apps",
  "workflows",
  "storyboards",
  "timelines",
  "sketches",
  "models",
  "games"
] as const;

export type ExampleTab = (typeof EXAMPLE_TABS)[number];

export const isExampleTab = (value: string): value is ExampleTab =>
  (EXAMPLE_TABS as readonly string[]).includes(value);

interface ExamplesPageState {
  tab: ExampleTab;
  setTab: (tab: ExampleTab) => void;
}

export const useExamplesPageStore = create<ExamplesPageState>((set) => ({
  tab: "apps",
  setTab: (tab) => set({ tab })
}));
