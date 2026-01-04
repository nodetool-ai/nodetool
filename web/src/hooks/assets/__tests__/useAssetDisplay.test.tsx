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
jest.mock("../../../components/asset_viewer/Model3DViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="model3d-viewer">3d model</div>
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

  test("renders Model3DViewer for glb file URL", () => {
    const { getByTestId } = render(
      <HookComponent url="https://example.com/model.glb" contentType="" />
    );
    expect(getByTestId("model3d-viewer")).toBeInTheDocument();
  });

  test("renders Model3DViewer for gltf file URL", () => {
    const { getByTestId } = render(
      <HookComponent url="https://example.com/model.gltf" contentType="" />
    );
    expect(getByTestId("model3d-viewer")).toBeInTheDocument();
  });

  test("renders Model3DViewer for model/ content type", () => {
    const asset: any = {
      content_type: "model/gltf-binary",
      get_url: "https://example.com/model.glb"
    };
    const { getByTestId } = render(<HookComponent asset={asset} />);
    expect(getByTestId("model3d-viewer")).toBeInTheDocument();
  });

  test("renders Model3DViewer for URL with query params", () => {
    const { getByTestId } = render(
      <HookComponent
        url="https://example.com/model.glb?token=abc123"
        contentType=""
      />
    );
    expect(getByTestId("model3d-viewer")).toBeInTheDocument();
  });
});
