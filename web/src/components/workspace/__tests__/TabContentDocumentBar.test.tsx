import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { WorkspaceTab } from "../../../stores/WorkspaceTabsStore";

jest.mock("../ApplicationSurface", () => ({
  __esModule: true,
  default: () => <div>App surface</div>
}));
jest.mock("../ScriptSurface", () => ({
  __esModule: true,
  default: () => <div>Script surface</div>
}));

import TabContent from "../TabContent";

const renderTab = (tab: WorkspaceTab) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TabContent tab={tab} active />
    </ThemeProvider>
  );

describe("TabContent document bar", () => {
  // Every surface draws its own bar, so TabContent adds none.
  it.each<WorkspaceTab>([
    { id: "application:a", type: "application", ref: "a", mode: "view", title: "Notes" },
    { id: "script:a", type: "script", ref: "a", mode: "edit", title: "Lines" }
  ])("leaves the $type bar to its surface", async (tab) => {
    renderTab(tab);

    expect(await screen.findByText(/surface/)).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});
