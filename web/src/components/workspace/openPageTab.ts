// Open an app page (Settings, Costs, Model Manager, …) as a workspace tab.
// Works from any context — including components mounted outside the router
// tree — because it drives the tab store and the router singleton directly.

import { navigateTo } from "../../lib/appNavigation";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  useSettingsPageStore,
  type SettingsSection
} from "../../stores/SettingsPageStore";
import {
  useExamplesPageStore,
  type ExampleTab
} from "../../stores/ExamplesPageStore";
import { PAGE_TAB_TITLES, type PageTabKey } from "./pageTabs";

export const openPageTab = (key: PageTabKey): void => {
  useWorkspaceTabsStore.getState().openTab({
    type: "page",
    ref: key,
    mode: "view",
    title: PAGE_TAB_TITLES[key]
  });
  navigateTo("/workspace");
};

/** Open Settings, optionally on a given section. */
export const openSettingsTab = (
  section: SettingsSection = "general"
): void => {
  useSettingsPageStore.getState().setSection(section);
  openPageTab("settings");
};

/** Open Examples, optionally on a given kind of example. */
export const openExamplesTab = (tab: ExampleTab = "apps"): void => {
  useExamplesPageStore.getState().setTab(tab);
  openPageTab("examples");
};
