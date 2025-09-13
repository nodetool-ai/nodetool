import React from "react";
import { render } from "@testing-library/react";
import { useAssetDisplay } from "../useAssetDisplay";

jest.mock("../../../components/asset_viewer/ImageViewer", () => ({
  __esModule: true,
  default: () => <img data-testid="image-viewer" />
}));
jest.mock("../../../components/asset_viewer/AudioViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="audio-viewer">audio</div>
}));
jest.mock("../../../components/asset_viewer/TextViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="text-viewer">text</div>
}));
jest.mock("../../../components/asset_viewer/VideoViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="video-viewer">video</div>
}));
jest.mock("../../../components/asset_viewer/PDFViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="pdf-viewer">pdf</div>
}));

function HookComponent(props: any) {
  const { component } = useAssetDisplay(props);
  return <div data-testid="out">{component}</div>;
}

describe("useAssetDisplay", () => {
  test("renders ImageViewer for image content type", () => {
    const asset: any = { content_type: "image/png" };
    const { getByTestId } = render(<HookComponent asset={asset} />);
    expect(getByTestId("image-viewer")).toBeInTheDocument();
  });

  test("renders PDFViewer from url document", () => {
    const { getByTestId } = render(
      <HookComponent
        url="https://example.com/file.pdf"
        contentType="document"
      />
    );
    expect(getByTestId("pdf-viewer")).toBeInTheDocument();
  });
});
