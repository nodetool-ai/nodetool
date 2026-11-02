/**
 * Opens a studio's target with its presets chosen. A studio adds no surface of
 * its own: the Create view opens in the studio's mode with its camera and look
 * presets on the preset chip, the Effects gallery shows only the studio's
 * effects, and the rest open the Lipsync studio, an example app, a starter
 * skill or a guided flow as they open from anywhere else.
 */

import type { Studio } from "@nodetool-ai/presets";

import { useCreateViewStore } from "../../stores/CreateViewStore";
import { useEffectsGalleryStore } from "../../stores/EffectsGalleryStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import { CREATE_REF, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { navigateTo } from "../../lib/appNavigation";
import { openPageTab } from "../workspace/openPageTab";
import { ENTRY_CARDS, type EntryFlowId } from "../setup/entryCards";

/** The start page owns its prompt and its guided flows, so it handles these. */
export interface StudioHosts {
  /** Put `/<skill>` in the start page prompt. */
  onSkill: (skill: string) => void;
  /** Start a guided flow, as its creation card does. */
  onFlow: (flow: EntryFlowId) => void;
}

/** The guided flow a flow target names, or null when no such flow exists. */
export const studioFlow = (flow: string): EntryFlowId | null =>
  ENTRY_CARDS.find((card) => card.id === flow)?.id ?? null;

/** Open `studio`'s target. `title` names a tab the target opens without one. */
export const openStudio = (studio: Studio, title: string, hosts: StudioHosts): void => {
  const { target } = studio;
  const tabs = useWorkspaceTabsStore.getState();
  switch (target.type) {
    case "create":
      useCreateViewStore.getState().setMode(target.mode);
      useMediaGenerationStore.getState().setPresetIds(target.mode, studio.preset_ids);
      tabs.openTab({ type: "create", ref: CREATE_REF, mode: "view", title: "Create" });
      navigateTo("/workspace");
      return;
    case "effects":
      useEffectsGalleryStore.getState().openStudio(studio.id, studio.preset_ids);
      openPageTab("effects");
      return;
    case "lipsync":
      openPageTab("lipsync");
      return;
    case "app":
      tabs.openTab({ type: "example-app", ref: target.app, mode: "view", title });
      navigateTo("/workspace");
      return;
    case "skill":
      hosts.onSkill(target.skill);
      return;
    case "flow": {
      const flow = studioFlow(target.flow);
      if (flow) {
        hosts.onFlow(flow);
      }
      return;
    }
  }
};
