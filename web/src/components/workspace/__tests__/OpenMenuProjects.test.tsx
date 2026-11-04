/**
 * The `[+]` menu creates blank documents. Starting a project lives on the
 * project selector.
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const createDocument = jest.fn(async () => undefined);
jest.mock("../newDocumentCatalog", () => ({
  TEXT_FILE_TEMPLATES: [],
  useNewDocumentCatalog: () => ({
    entries: [
      {
        key: "workflow",
        label: "Workflow",
        menuLabel: "New workflow",
        type: "workflow",
        icon: null,
        create: createDocument
      }
    ],
    createTextFile: jest.fn(),
    createBlankStoryboard: jest.fn(),
    installStoryboardExample: jest.fn(),
    creating: null
  })
}));

jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: undefined, isLoading: false })
}));

jest.mock("../useGuidedFlowStarters", () => ({
  useGuidedFlowStarters: () => ({
    starters: [],
    starting: null
  })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: jest.Mock }) => T): T =>
    selector({ openTab: jest.fn() })
}));

jest.mock("../../workflows/CreateTorchWorkflowDialog", () => ({
  __esModule: true,
  default: () => (
    <div role="dialog" aria-label="New Torch workflow">
      Torch templates
    </div>
  )
}));

import OpenMenu from "../OpenMenu";

const onClose = jest.fn();
const MenuHost = () => {
  const [open, setOpen] = useState(true);
  return (
    <ThemeProvider theme={mockTheme}>
      <OpenMenu
        anchorEl={document.body}
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </ThemeProvider>
  );
};
const renderMenu = () => render(<MenuHost />);

beforeEach(() => jest.clearAllMocks());

describe("OpenMenu projects", () => {
  it("does not start a project from the New menu", () => {
    renderMenu();
    expect(screen.queryByText("Start a project…")).not.toBeInTheDocument();
  });

  it("offers Torch creation from the workspace New menu", async () => {
    renderMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /New Torch workflow/ })
    );
    expect(
      await screen.findByRole("dialog", { name: "New Torch workflow" })
    ).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("creates a blank document from the list", async () => {
    renderMenu();
    await userEvent.click(screen.getByText("New workflow"));
    expect(createDocument).toHaveBeenCalled();
  });
});
