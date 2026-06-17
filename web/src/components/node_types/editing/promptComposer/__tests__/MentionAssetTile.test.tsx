import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../../__mocks__/themeMock";
import { MentionAssetTile } from "../MentionAssetTile";
import type { Asset } from "../../../../../stores/ApiTypes";

const imageAsset: Asset = {
  id: "img1",
  name: "character_ref",
  content_type: "image/png",
  get_url: "https://example.com/img1.png",
  thumb_url: "https://example.com/img1_thumb.png"
} as Asset;

const audioAsset: Asset = {
  id: "aud1",
  name: "voiceover",
  content_type: "audio/mpeg",
  get_url: "https://example.com/aud1.mp3"
} as Asset;

const renderTile = (props: Partial<React.ComponentProps<typeof MentionAssetTile>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MentionAssetTile
        asset={imageAsset}
        selected={false}
        onSelect={jest.fn()}
        onRename={jest.fn().mockResolvedValue(undefined)}
        {...props}
      />
    </ThemeProvider>
  );

describe("MentionAssetTile", () => {
  it("renders the reference name and a thumbnail for images", () => {
    const { container } = renderTile();
    expect(screen.getByText("character_ref")).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", imageAsset.thumb_url);
  });

  it("shows a type badge for non-image assets", () => {
    const { container } = renderTile({ asset: audioAsset });
    expect(screen.getByText("voiceover")).toBeInTheDocument();
    // Audio renders an icon instead of an <img> thumbnail.
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("calls onSelect when the tile is clicked", async () => {
    const onSelect = jest.fn();
    renderTile({ onSelect });
    await userEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renames in place on double-click and saves with Enter", async () => {
    const onRename = jest.fn().mockResolvedValue(undefined);
    const onSelect = jest.fn();
    renderTile({ onRename, onSelect });

    await userEvent.dblClick(screen.getByText("character_ref"));
    const input = screen.getByRole("textbox", { name: "Asset name" });
    await userEvent.clear(input);
    await userEvent.type(input, "hero{Enter}");

    expect(onRename).toHaveBeenCalledWith("img1", "hero");
    // Double-click into the name must not also trigger selection.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("cancels rename on Escape without calling onRename", async () => {
    const onRename = jest.fn().mockResolvedValue(undefined);
    renderTile({ onRename });

    await userEvent.dblClick(screen.getByText("character_ref"));
    const input = screen.getByRole("textbox", { name: "Asset name" });
    await userEvent.clear(input);
    await userEvent.type(input, "whatever{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("character_ref")).toBeInTheDocument();
  });

  it("keeps editing and flags an error when onRename rejects", async () => {
    const onRename = jest.fn().mockRejectedValue(new Error("Name already in use"));
    renderTile({ onRename });

    await userEvent.dblClick(screen.getByText("character_ref"));
    const input = screen.getByRole("textbox", { name: "Asset name" });
    await userEvent.clear(input);
    await userEvent.type(input, "dupe{Enter}");

    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("textbox", { name: "Asset name" })).toBeInTheDocument();
  });
});
