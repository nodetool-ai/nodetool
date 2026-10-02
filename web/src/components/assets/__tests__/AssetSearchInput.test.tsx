import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import mockTheme from "../../../__mocks__/themeMock";
import AssetSearchInput from "../AssetSearchInput";

jest.mock("../../../serverState/useAssetSearch", () => ({
  useAssetSearch: () => ({
    searchAssets: jest.fn().mockResolvedValue({ assets: [] }),
    isSearching: false
  })
}));

beforeEach(() => {
  useAssetGridStore.setState(useAssetGridStore.getInitialState());
});

it("switches search scope with Tab, Enter and Space", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetSearchInput onLocalSearchChange={jest.fn()} />
    </ThemeProvider>
  );

  await user.tab();
  expect(screen.getByRole("button", { name: "Switch to global search" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("textbox", { name: "Search all assets" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Switch to local search" })).toHaveFocus();
  await user.keyboard(" ");
  expect(screen.getByRole("textbox", { name: "Search current folder" })).toBeInTheDocument();
});

it("clears a search by keyboard and returns focus to the input", async () => {
  const user = userEvent.setup();
  const onLocalSearchChange = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetSearchInput onLocalSearchChange={onLocalSearchChange} />
    </ThemeProvider>
  );
  const input = screen.getByRole("textbox", { name: "Search current folder" });
  expect(screen.getByRole("button", { name: "Clear search" })).toBeDisabled();
  await user.tab();
  await user.tab();
  expect(input).toHaveFocus();
  await user.keyboard("flowers");
  await user.tab();
  expect(screen.getByRole("button", { name: "Clear search" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
  expect(onLocalSearchChange).toHaveBeenLastCalledWith("");
  expect(screen.getByRole("button", { name: "Clear search" })).toBeDisabled();
  await user.tab();
  expect(document.body).toHaveFocus();
});
