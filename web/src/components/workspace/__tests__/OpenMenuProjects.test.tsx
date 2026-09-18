/**
 * The `[+]` menu creates blank documents. Starting a project lives on the
 * project selector.
 */
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
  useGuidedFlowStarters: () => ({ starters: [], starting: null })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: jest.Mock }) => T): T =>
    selector({ openTab: jest.fn() })
}));

import OpenMenu from "../OpenMenu";

const onClose = jest.fn();
const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenMenu anchorEl={document.body} open onClose={onClose} />
    </ThemeProvider>
  );

beforeEach(() => jest.clearAllMocks());

describe("OpenMenu projects", () => {
  it("does not start a project from the New menu", () => {
    renderMenu();
    expect(screen.queryByText("Start a project…")).not.toBeInTheDocument();
  });

  it("creates a blank document from the list", async () => {
    renderMenu();
    await userEvent.click(screen.getByText("New workflow"));
    expect(createDocument).toHaveBeenCalled();
  });
});
