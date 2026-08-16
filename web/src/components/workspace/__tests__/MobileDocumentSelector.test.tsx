import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import type {
  WorkspaceTab,
  WorkspaceTabType
} from "../../../stores/WorkspaceTabsStore";

jest.mock("../../../hooks/useWorkflowDirty", () => ({
  useWorkflowDirty: () => false
}));
jest.mock("../../../hooks/useWorkflowRunnerState", () => ({
  useIsWorkflowRunning: () => false
}));
jest.mock("../../../stores/SettingsStore", () => ({
  useSettingsStore: <T,>(
    selector: (s: { settings: { instantUpdate: boolean } }) => T
  ) => selector({ settings: { instantUpdate: false } })
}));

import MobileDocumentSelector from "../MobileDocumentSelector";

const tab = (ref: string, title: string): WorkspaceTab => ({
  id: `workflow:${ref}`,
  type: "workflow",
  ref,
  mode: "edit",
  title
});

const TABS = [tab("a", "Alpha"), tab("b", "Beta")];

const COLOR = { workflow: "#fff" } as Record<WorkspaceTabType, string>;
const GLYPH = { workflow: "⬡" } as Record<WorkspaceTabType, string>;

const renderSelector = (
  overrides: Partial<React.ComponentProps<typeof MobileDocumentSelector>> = {}
) => {
  const props = {
    tabs: TABS,
    activeTabId: "workflow:a",
    typeColor: COLOR,
    typeGlyph: GLYPH,
    onActivate: jest.fn(),
    onClose: jest.fn(),
    onCloseAll: jest.fn(),
    ...overrides
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <MobileDocumentSelector {...props} />
    </ThemeProvider>
  );
  return props;
};

const openSheet = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Open document: Alpha/ }));
  await waitFor(() => expect(screen.getByText("Open documents")).toBeInTheDocument());
  return user;
};

describe("MobileDocumentSelector", () => {
  it("names the active document and its sibling count", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("switches documents from the sheet", async () => {
    const props = renderSelector();
    const user = await openSheet();
    await user.click(screen.getByRole("button", { name: "Beta workflow" }));
    expect(props.onActivate).toHaveBeenCalledWith("workflow:b");
  });

  it("closes a single document without switching to it", async () => {
    const props = renderSelector();
    const user = await openSheet();
    await user.click(screen.getByRole("button", { name: "Close Beta" }));
    expect(props.onClose).toHaveBeenCalledWith(TABS[1]);
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("closes every document at once", async () => {
    const props = renderSelector();
    const user = await openSheet();
    await user.click(screen.getByRole("button", { name: "Close all documents" }));
    expect(props.onCloseAll).toHaveBeenCalled();
  });

  it("says so when nothing is open", () => {
    renderSelector({ tabs: [], activeTabId: null });
    expect(screen.getByText("No document open")).toBeInTheDocument();
  });
});
