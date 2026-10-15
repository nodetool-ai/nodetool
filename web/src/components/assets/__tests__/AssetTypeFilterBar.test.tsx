import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useAssetGridStore } from "../../../stores/AssetGridStore";

let mockTypeCounts: Record<string, number> = {};

jest.mock("../../../serverState/useAssets", () => {
  const assets = () => ({ typeCounts: mockTypeCounts });
  return { __esModule: true, default: assets, useAssets: assets };
});

import AssetTypeFilterBar from "../AssetTypeFilterBar";

const counts = (overrides: Record<string, number>) => ({
  image: 0,
  video: 0,
  audio: 0,
  model_3d: 0,
  text: 0,
  application: 0,
  other: 0,
  ...overrides
});

const renderBar = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetTypeFilterBar />
    </ThemeProvider>
  );

describe("AssetTypeFilterBar", () => {
  beforeEach(() => {
    useAssetGridStore.setState({ typeFilter: "all", collapsedAssetGroups: [] });
  });

  it("lists the types in the folder with their counts", () => {
    mockTypeCounts = counts({ image: 56, audio: 5 });
    renderBar();

    expect(screen.getByRole("button", { name: /All types\s*61/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Images\s*56/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Audio\s*5/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Videos/ })).not.toBeInTheDocument();
  });

  it("filters to one type, and a second click shows all types again", async () => {
    mockTypeCounts = counts({ image: 56, audio: 5 });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: /Audio/ }));
    expect(useAssetGridStore.getState().typeFilter).toBe("audio");

    await userEvent.click(screen.getByRole("button", { name: /Audio/ }));
    expect(useAssetGridStore.getState().typeFilter).toBe("all");
  });

  it("collapses and expands every group at once", async () => {
    mockTypeCounts = counts({ image: 56, audio: 5 });
    useAssetGridStore.setState({ collapsedAssetGroups: ["model_3d"] });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(useAssetGridStore.getState().collapsedAssetGroups).toEqual([
      "model_3d",
      "image",
      "audio"
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(useAssetGridStore.getState().collapsedAssetGroups).toEqual([
      "model_3d"
    ]);
  });

  it("keeps a picked type listed at zero so it can be cleared", () => {
    mockTypeCounts = counts({ image: 3 });
    useAssetGridStore.setState({ typeFilter: "video" });
    renderBar();

    expect(screen.getByRole("button", { name: /Videos\s*0/ })).toBeInTheDocument();
  });

  it("stays hidden when the folder holds one type", () => {
    mockTypeCounts = counts({ image: 3 });
    const { container } = renderBar();

    expect(container).toBeEmptyDOMElement();
  });
});
