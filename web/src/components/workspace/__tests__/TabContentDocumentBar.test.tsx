import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../../stores/WorkspaceTabsStore";

jest.mock("../../../hooks/useRenameDocument", () => ({
  useRenameDocument: () => jest.fn()
}));
jest.mock("../ImageSurface", () => ({
  __esModule: true,
  default: () => <div>Image surface</div>
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
  it("gives a View/Edit type a document bar with the mode switch", async () => {
    const tab: WorkspaceTab = {
      id: "image:a",
      type: "image",
      ref: "a",
      mode: "view",
      title: "Notes"
    };
    useWorkspaceTabsStore.setState({ tabs: [tab], activeTabId: tab.id });
    const user = userEvent.setup();
    renderTab(tab);

    expect(await screen.findByText("Image surface")).toBeInTheDocument();
    expect(
      screen.getByRole("toolbar", { name: "Notes document" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(useWorkspaceTabsStore.getState().tabs[0].mode).toBe("edit");
  });

  it("leaves a view-only type without the generic bar", async () => {
    renderTab({
      id: "script:a",
      type: "script",
      ref: "a",
      mode: "edit",
      title: "Lines"
    });

    expect(await screen.findByText("Script surface")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});
