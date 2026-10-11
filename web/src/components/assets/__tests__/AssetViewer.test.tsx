import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";
import type { Asset } from "../../../stores/ApiTypes";

const mockOpenTab = jest.fn();
const mockNavigate = jest.fn();
const mockEditVideoAsset = jest.fn();
const mockOpenWorkflow = jest.fn();

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: jest.Mock }) => T) =>
    selector({ openTab: mockOpenTab })
}));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("../../../serverState/useAssets", () => ({
  __esModule: true,
  default: () => ({ folderFiles: [], projectId: "p1" })
}));
jest.mock("../../../hooks/useEditVideoAsset", () => ({
  useEditVideoAsset: () => mockEditVideoAsset
}));
jest.mock("../../../hooks/useOpenAssetWorkflow", () => ({
  useOpenAssetWorkflow: () => ({ openWorkflow: mockOpenWorkflow })
}));
jest.mock("../../../hooks/assets/useAssetDownload", () => ({
  useAssetDownload: () => ({ handleDownload: jest.fn() })
}));
jest.mock("../../../hooks/assets/useAssetDisplay", () => ({
  useAssetDisplay: ({ asset }: { asset?: Asset }) => ({
    component: <div data-testid="media">{asset?.id}</div>
  })
}));
jest.mock("../AssetItem", () => ({
  __esModule: true,
  default: ({ asset }: { asset: Asset }) => (
    <span data-testid="thumb">{asset?.id}</span>
  )
}));
jest.mock("../../context_menus/AssetInfoPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="info-panel" />
}));
jest.mock("../../widgets", () => ({
  ImageComparer: ({ labelA, labelB }: { labelA: string; labelB: string }) => (
    <div data-testid="comparer">{`${labelA} vs ${labelB}`}</div>
  )
}));

import AssetViewer from "../AssetViewer";

const asset = (id: string, overrides: Partial<Asset> = {}): Asset =>
  ({
    id,
    name: `${id}.png`,
    content_type: "image/png",
    get_url: `/${id}.png`,
    user_id: "u1",
    parent_id: "",
    created_at: "",
    workflow_id: null,
    metadata: {},
    ...overrides
  }) as Asset;

const gallery = [asset("a0"), asset("a1"), asset("a2")];

const renderViewer = (
  props: Partial<React.ComponentProps<typeof AssetViewer>> = {}
) => {
  const onClose = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetViewer
        open
        asset={gallery[1]}
        sortedAssets={gallery}
        onClose={onClose}
        {...props}
      />
    </ThemeProvider>
  );
  return { onClose };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
});

describe("AssetViewer", () => {
  it("renders nothing while closed", () => {
    renderViewer({ open: false });
    expect(screen.queryByTestId("media")).not.toBeInTheDocument();
  });

  it("opens an image in the image editor tab and closes", () => {
    const { onClose } = renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Image" }));
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "image",
      ref: "a1",
      mode: "edit",
      title: "a1.png",
      projectId: "p1"
    });
    expect(mockNavigate).toHaveBeenCalledWith("/workspace");
    expect(onClose).toHaveBeenCalled();
  });

  it("hands a video to the timeline editor", () => {
    const video = asset("v1", {
      content_type: "video/mp4",
      get_url: "/v1.mp4"
    });
    renderViewer({ asset: video, sortedAssets: [video] });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Timeline from Video" })
    );
    expect(mockEditVideoAsset).toHaveBeenCalledWith(video);
    expect(mockOpenTab).not.toHaveBeenCalled();
  });

  it("hides edit and info for media outside the library", () => {
    renderViewer({ detachedIds: new Set(["a1"]) });
    expect(
      screen.queryByRole("button", { name: "Edit Image" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show info" })
    ).not.toBeInTheDocument();
  });

  it("opens the workflow that made the asset", () => {
    const made = asset("w1", { workflow_id: "wf1" });
    renderViewer({ asset: made, sortedAssets: [made] });
    fireEvent.click(
      screen.getByRole("button", { name: "Open the workflow that made this" })
    );
    expect(mockOpenWorkflow).toHaveBeenCalledWith(made);
  });

  it("toggles the info panel", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "Show info" }));
    expect(screen.getByTestId("info-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide info" }));
    expect(screen.queryByTestId("info-panel")).not.toBeInTheDocument();
  });

  it("shows the caller's caption for the current asset", () => {
    renderViewer({ captions: { a1: "Shot 2" } });
    expect(screen.getByText("Shot 2")).toBeInTheDocument();
  });

  it("steps through the gallery with the prev and next buttons", () => {
    renderViewer();
    expect(screen.getByTestId("media")).toHaveTextContent("a1");
    fireEvent.click(screen.getByRole("button", { name: "Next asset" }));
    expect(screen.getByTestId("media")).toHaveTextContent("a2");
    expect(screen.getByRole("button", { name: "Next asset" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous asset" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous asset" }));
    expect(screen.getByTestId("media")).toHaveTextContent("a0");
  });

  it("jumps to a thumbnail", () => {
    renderViewer();
    const thumbs = screen.getAllByTestId("thumb");
    act(() => {
      fireEvent.mouseDown(thumbs[thumbs.length - 1].closest("button")!);
    });
    expect(screen.getByTestId("media")).toHaveTextContent("a2");
  });

  it("compares the current image with a picked thumbnail", () => {
    renderViewer();
    fireEvent.click(
      screen.getByRole("button", { name: "Compare with another image" })
    );
    expect(
      screen.getByText(/Select another image from the thumbnails/)
    ).toBeInTheDocument();
    const thumbs = screen.getAllByTestId("thumb");
    fireEvent.mouseDown(thumbs[0].closest("button")!);
    expect(screen.getByTestId("comparer")).toHaveTextContent(
      "a1.png vs a0.png"
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("comparer")).not.toBeInTheDocument();
  });

  it("offers no compare button when the gallery has one image", () => {
    renderViewer({ sortedAssets: [gallery[1]] });
    expect(
      screen.queryByRole("button", { name: "Compare with another image" })
    ).not.toBeInTheDocument();
  });
});
