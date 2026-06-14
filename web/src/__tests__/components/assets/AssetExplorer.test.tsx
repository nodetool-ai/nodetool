import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ThemeNodetool from "../../../components/themes/ThemeNodetool";
import AssetExplorer from "../../../components/assets/AssetExplorer";

// Mock child components and hooks to isolate AssetExplorer behavior
jest.mock("../../../components/assets/AssetGrid", () => ({
  __esModule: true,
  default: ({ sortedAssets }: { sortedAssets: any[] }) => (
    <div data-testid="asset-grid">asset-grid:{sortedAssets?.length ?? 0}</div>
  )
}));

jest.mock("../../../serverState/useAssets", () => ({
  __esModule: true,
  default: () => ({ folderFiles: [{ id: "a1" }, { id: "a2" }] })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (sel: any) => sel({ currentWorkflowId: "wf-1" })
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn()
}));

describe("AssetExplorer", () => {
  it("renders AssetGrid with provided assets", () => {
    render(
      <ThemeProvider theme={ThemeNodetool}>
        <AssetExplorer />
      </ThemeProvider>
    );
    const grid = screen.getByTestId("asset-grid");
    expect(grid).toHaveTextContent("asset-grid:2");
  });
});
