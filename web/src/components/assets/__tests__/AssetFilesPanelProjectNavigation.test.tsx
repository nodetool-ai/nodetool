import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

jest.mock("../AssetGridContent", () => ({
  __esModule: true,
  default: () => <div>Project folder contents</div>
}));
jest.mock("../BreadcrumbNav", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../GlobalSearchResults", () => ({
  __esModule: true,
  default: ({
    onNavigateToFolder
  }: {
    onNavigateToFolder?: (
      folderId: string,
      folderPath: string,
      projectId?: string
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onNavigateToFolder?.("folder-b", "Home / Folder B", "project-b")
      }
    >
      Go to project B folder
    </button>
  )
}));

import AssetFilesPanel from "../panels/AssetFilesPanel";

describe("AssetFilesPanel project navigation", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      activeProjectId: "project-a",
      personalProjectId: "personal:user-1"
    });
    useAssetGridStore.setState({
      scopeProjectId: "project-a",
      currentFolderId: "folder-a",
      selectedFolderId: "folder-a",
      isGlobalSearchActive: true,
      isGlobalSearchMode: true,
      globalSearchQuery: "shared asset",
      globalSearchResults: []
    });
  });

  it("switches to the result project before opening its containing folder", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AssetFilesPanel />
      </ThemeProvider>
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Go to project B folder" })
    );

    expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("project-b");
    expect(useAssetGridStore.getState()).toMatchObject({
      scopeProjectId: "project-b",
      currentFolderId: "folder-b",
      isGlobalSearchActive: false,
      isGlobalSearchMode: false
    });
  });
});
