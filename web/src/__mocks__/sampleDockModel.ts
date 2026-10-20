import { createDockLayoutModel, type DockLayout } from "../stores/dock/DockLayout";
import { createDockLayoutStore, type DockLayoutScope, type DockLayoutStorage } from "../stores/dock/DockLayoutStore";

export const SAMPLE_PRESETS = ["Default", "Scripting", "Animation", "Wide"] as const;

function createPreset(name: string): DockLayout {
  const layout: DockLayout = {
    version: 1,
    regions: {
      left: [{ id: "left-main", panels: ["hierarchy", "revisions"], activePanelId: "hierarchy" }],
      right: [{ id: "right-main", panels: ["inspector", "assistant"], activePanelId: "inspector" }],
      bottom: [{ id: "bottom-main", panels: ["scripts"], activePanelId: "scripts" }],
      viewport: [{ id: "viewport-main", panels: ["viewport"], activePanelId: "viewport" }]
    },
    hidden: ["assistant"],
    sizes: { left: 280, right: 340, bottom: 240 }
  };
  if (name === "Scripting") { layout.sizes.bottom = 360; }
  if (name === "Animation") { layout.sizes.bottom = 320; }
  if (name === "Wide") { layout.hidden = ["hierarchy", "revisions", "inspector", "assistant", "scripts"]; }
  return layout;
}

/** A dock configuration for the shared dock tests. It mirrors a simple editor with one required panel. */
export const sampleDockModel = createDockLayoutModel({
  editorLabel: "sample",
  persistKeyPrefix: "nodetool.dock-test.v1",
  requiredPanels: ["viewport"],
  presets: SAMPLE_PRESETS,
  createPreset
});

export const createSampleLayout = (name: string = "Default"): DockLayout => sampleDockModel.createLayout(name);
export const sampleLayoutSchema = sampleDockModel.schema;
export const hydrateSampleLayout = sampleDockModel.hydrate;
export const registerMissingSamplePanels = sampleDockModel.registerMissingPanels;
export const transitionSampleLayout = sampleDockModel.transition;
export const createSampleDockStore = (scope: DockLayoutScope, storage: DockLayoutStorage) => createDockLayoutStore(sampleDockModel, scope, storage);
export type SampleDockStorage = DockLayoutStorage;
