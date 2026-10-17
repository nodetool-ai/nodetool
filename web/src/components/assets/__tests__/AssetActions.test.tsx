import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useAssetGridStore } from "../../../stores/AssetGridStore";

jest.mock("../../../serverState/useAssets", () => {
  const assets = () => ({ isLoading: false });
  return { __esModule: true, default: assets, useAssets: assets };
});

import AssetActions from "../AssetActions";

const renderActions = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetActions handleSelectAllAssets={jest.fn()} />
    </ThemeProvider>
  );

describe("AssetActions view switch", () => {
  beforeEach(() => {
    useAssetGridStore.setState({ viewMode: "grid" });
  });

  it("is a labelled group with the current view pressed", () => {
    renderActions();
    expect(screen.getByRole("group", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("switches the view and keeps it when the pressed option is clicked again", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(useAssetGridStore.getState().viewMode).toBe("list");
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(useAssetGridStore.getState().viewMode).toBe("list");
  });
});
