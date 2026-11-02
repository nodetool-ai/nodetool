import { existsSync } from "fs";
import { resolve } from "path";
import type { Studio } from "@nodetool-ai/presets";

import { useCreateViewStore } from "../../../stores/CreateViewStore";
import { useEffectsGalleryStore } from "../../../stores/EffectsGalleryStore";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import { tabId, useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { openStudio, studioFlow } from "../openStudio";
import { isPageTabKey } from "../../workspace/pageTabs";
import { EFFECT_PRESETS, STUDIOS, presetCatalog } from "../../../lib/presets/catalog";

const mockNavigateTo = jest.fn();
jest.mock("../../../lib/appNavigation", () => ({
  navigateTo: (to: string) => mockNavigateTo(to)
}));

const REPO = resolve(__dirname, "../../../../..");

const studioOf = (type: Studio["target"]["type"]): Studio => {
  const studio = STUDIOS.find((entry) => entry.target.type === type);
  if (!studio) {
    throw new Error(`No ${type} studio ships`);
  }
  return studio;
};

beforeEach(() => {
  mockNavigateTo.mockClear();
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  useMediaGenerationStore.setState({ presetIds: {} });
  useCreateViewStore.setState({ mode: "image" });
  useEffectsGalleryStore.setState({ studio: null, effectId: null });
});

describe("studio catalogue", () => {
  it("resolves every studio's target and preset ids", () => {
    expect(STUDIOS.length).toBeGreaterThanOrEqual(6);
    for (const studio of STUDIOS) {
      const { target } = studio;
      for (const id of studio.preset_ids) {
        expect(presetCatalog.getPreset(id)).toBeDefined();
      }
      switch (target.type) {
        case "create":
          for (const id of studio.preset_ids) {
            expect(presetCatalog.getPreset(id)?.modes).toContain(target.mode);
          }
          break;
        case "effects":
          for (const id of studio.preset_ids) {
            expect(EFFECT_PRESETS.map((preset) => preset.id)).toContain(id);
          }
          expect(isPageTabKey("effects")).toBe(true);
          break;
        case "lipsync":
          expect(isPageTabKey("lipsync")).toBe(true);
          break;
        case "flow":
          expect(studioFlow(target.flow)).toBe(target.flow);
          break;
        case "skill":
          expect(existsSync(resolve(REPO, "packages/system-skills", target.skill, "SKILL.md"))).toBe(true);
          break;
        case "app":
          expect(
            existsSync(resolve(REPO, "packages/base-nodes/nodetool/examples/apps", `${target.app}.app.json`))
          ).toBe(true);
          break;
      }
    }
  });
});

describe("openStudio", () => {
  const hosts = { onSkill: jest.fn(), onFlow: jest.fn() };
  beforeEach(() => {
    hosts.onSkill.mockClear();
    hosts.onFlow.mockClear();
  });

  it("opens the Create view in the studio's mode with its presets chosen", () => {
    const studio = STUDIOS.find(
      (entry) => entry.target.type === "create" && entry.target.mode === "video"
    );
    if (!studio) {
      throw new Error("No video Create studio ships");
    }
    openStudio(studio, "Studio", hosts);
    expect(useCreateViewStore.getState().mode).toBe("video");
    expect(useMediaGenerationStore.getState().presetIds.video).toEqual(studio.preset_ids);
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(tabId("create", "create"));
    expect(mockNavigateTo).toHaveBeenCalledWith("/workspace");
  });

  it("opens the Effects gallery on the studio's effects with the first chosen", () => {
    const studio = studioOf("effects");
    openStudio(studio, "Studio", hosts);
    expect(useEffectsGalleryStore.getState().studio).toEqual({
      studioId: studio.id,
      effectIds: studio.preset_ids
    });
    expect(useEffectsGalleryStore.getState().effectId).toBe(studio.preset_ids[0]);
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(tabId("page", "effects"));
  });

  it("opens the Lipsync studio and an example app in their tabs", () => {
    openStudio(studioOf("lipsync"), "Talking head", hosts);
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(tabId("page", "lipsync"));
    const app = studioOf("app");
    openStudio(app, "Creator testimonial", hosts);
    const appSlug = app.target.type === "app" ? app.target.app : "";
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(tabId("example-app", appSlug));
  });

  it("hands skills and guided flows to the start page", () => {
    const skill = studioOf("skill");
    openStudio(skill, "Studio", hosts);
    expect(hosts.onSkill).toHaveBeenCalledWith(skill.target.type === "skill" ? skill.target.skill : "");
    openStudio(studioOf("flow"), "Studio", hosts);
    expect(hosts.onFlow).toHaveBeenCalledWith("storyboard");
    expect(useWorkspaceTabsStore.getState().tabs).toEqual([]);
  });
});
