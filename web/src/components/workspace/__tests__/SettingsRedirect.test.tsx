import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { SettingsRedirect } from "../RouteRedirects";
import { useWorkspaceTabsStore, tabId } from "../../../stores/WorkspaceTabsStore";
import { useSettingsPageStore } from "../../../stores/SettingsPageStore";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsRedirect />} />
        <Route path="/workspace" element={<div>workspace</div>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  useSettingsPageStore.setState({ section: "general" });
});

it("opens the settings tab and lands in the workspace", () => {
  renderAt("/settings");

  expect(screen.getByText("workspace")).toBeInTheDocument();
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe(
    tabId("page", "settings")
  );
  expect(useSettingsPageStore.getState().section).toBe("general");
});

it("maps the legacy tab index onto a section", () => {
  renderAt("/settings?tab=1");

  expect(useSettingsPageStore.getState().section).toBe("providers");
});

it("falls back to general for an out-of-range tab index", () => {
  renderAt("/settings?tab=5");

  expect(useSettingsPageStore.getState().section).toBe("general");
});
