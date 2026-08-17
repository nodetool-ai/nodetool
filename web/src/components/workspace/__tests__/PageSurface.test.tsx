import { render, screen } from "@testing-library/react";
import PageSurface from "../PageSurface";

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
  default: () => null
}));
jest.mock("../../hugging_face/model_list/ModelsPage", () => ({
  __esModule: true,
  default: () => null
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

  it("lets document-length pages scroll the tab surface", async () => {
    render(<PageSurface pageKey="settings" />);
    const pane = await screen.findByLabelText("Settings");
    expect(pane).toHaveStyle({ overflow: "auto" });
  });
});
