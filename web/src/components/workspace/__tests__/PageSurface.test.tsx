import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import PageSurface from "../PageSurface";

const mockIsCloudProfile = jest.fn(() => false);
jest.mock("../../../lib/runtimeConfig", () => ({
  isCloudProfile: () => mockIsCloudProfile()
}));

jest.mock("../../assets/AssetExplorer", () => ({
  __esModule: true,
  default: () => <div>assets page</div>
}));

jest.mock("../../menus/SettingsMenu", () => ({
  __esModule: true,
  default: () => <div>settings page</div>
}));

jest.mock("../../tutorials/TutorialsPage", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../portal/ExamplesPage", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../costs/CostsDashboard", () => ({
  __esModule: true,
  default: () => <div>costs page</div>
}));
jest.mock("../../hugging_face/model_list/ModelsPage", () => ({
  __esModule: true,
  default: () => <div>models page</div>
}));
jest.mock("../../packages/PackagesPage", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../collections/CollectionsExplorer", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../workspaces/WorkspacesPage", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../entities/EntityLibrary", () => ({
  __esModule: true,
  default: () => null
}));

describe("PageSurface", () => {
  it("gives the Assets tab a bounded pane so the grid owns the scroll", async () => {
    render(<PageSurface pageKey="assets" />);
    const pane = await screen.findByLabelText("Assets");
    expect(pane).toHaveStyle({ overflow: "hidden", height: "100%" });
  });

  it("gives the Settings tab a bounded pane so the sidebar stays put", async () => {
    render(<PageSurface pageKey="settings" />);
    const pane = await screen.findByLabelText("Settings");
    expect(pane).toHaveStyle({ overflow: "hidden", height: "100%" });
  });

  it("shows the Model Manager outside the cloud", async () => {
    mockIsCloudProfile.mockReturnValue(false);
    render(<PageSurface pageKey="models" />);
    expect(await screen.findByText("models page")).toBeInTheDocument();
  });

  it("replaces the Model Manager with a notice in the cloud", async () => {
    mockIsCloudProfile.mockReturnValue(true);
    render(
      <ThemeProvider theme={mockTheme}>
        <PageSurface pageKey="models" />
      </ThemeProvider>
    );
    expect(
      screen.getByText("Model Manager is not available on this server")
    ).toBeInTheDocument();
    expect(screen.queryByText("models page")).not.toBeInTheDocument();
  });

  it("lets document-length pages scroll the tab surface", async () => {
    render(<PageSurface pageKey="costs" />);
    const pane = await screen.findByLabelText("Costs");
    expect(pane).toHaveStyle({ overflow: "auto" });
  });
});
