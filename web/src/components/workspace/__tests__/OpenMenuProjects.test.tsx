/**
 * The `[+]` menu leads with a project and keeps the blank documents below it.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const openNewProject = jest.fn();
jest.mock("../../../hooks/useProjects", () => ({
  useOpenNewProjectTab: () => openNewProject
}));

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
  it("opens the new-project surface and closes the menu", async () => {
    renderMenu();
    await userEvent.click(screen.getByText("Start a project…"));
    expect(openNewProject).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("still creates a blank document from the list below", async () => {
    renderMenu();
    await userEvent.click(screen.getByText("New workflow"));
    expect(createDocument).toHaveBeenCalled();
  });
});
