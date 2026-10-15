import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import {
  ALL_PROJECTS,
  useAssetGridStore
} from "../../../stores/AssetGridStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

jest.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({
    data: [
      { id: "personal:user-1", name: "Personal", isPersonal: true },
      { id: "project-a", name: "Launch film", isPersonal: false },
      { id: "project-b", name: "Brand kit", isPersonal: false }
    ],
    isPending: false,
    error: null
  })
}));

import AssetProjectFilter from "../AssetProjectFilter";

const renderFilter = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetProjectFilter />
    </ThemeProvider>
  );

const openMenu = async (label: string) =>
  userEvent.click(screen.getByRole("button", { name: `Project: ${label}` }));

describe("AssetProjectFilter", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      activeProjectId: "project-a",
      personalProjectId: "personal:user-1"
    });
    useAssetGridStore.setState({ projectFilter: null });
  });

  it("starts on the workspace's project", () => {
    renderFilter();
    expect(
      screen.getByRole("button", { name: "Project: Launch film" })
    ).toBeInTheDocument();
  });

  it("lists every project without switching the workspace", async () => {
    renderFilter();
    await openMenu("Launch film");
    await userEvent.click(screen.getByText("All projects"));

    expect(useAssetGridStore.getState().projectFilter).toBe(ALL_PROJECTS);
    expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("project-a");
    expect(
      screen.getByRole("button", { name: "Project: All projects" })
    ).toBeInTheDocument();
  });

  it("pins another project, and picking the workspace's project unpins it", async () => {
    renderFilter();
    await openMenu("Launch film");
    await userEvent.click(screen.getByText("Brand kit"));
    expect(useAssetGridStore.getState().projectFilter).toBe("project-b");

    await openMenu("Brand kit");
    await userEvent.click(screen.getByText("Launch film"));
    expect(useAssetGridStore.getState().projectFilter).toBeNull();
  });

  it("names the personal project", async () => {
    useAssetGridStore.setState({ projectFilter: "personal:user-1" });
    renderFilter();
    expect(
      screen.getByRole("button", { name: "Project: Personal" })
    ).toBeInTheDocument();
  });
});
