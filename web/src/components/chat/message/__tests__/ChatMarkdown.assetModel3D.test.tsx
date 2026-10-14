import React from "react";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const mockUseQuery = jest.fn();

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    storage: {
      signUrl: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args)
      }
    }
  }
}));

jest.mock("../../../../hooks/useResolvedMediaUri", () =>
  jest.requireActual("../../../../hooks/__mocks__/useResolvedMediaUri")
);
import {
  mockAssetUrl,
  resetMockAssetContentTypes
} from "../../../../hooks/__mocks__/useResolvedMediaUri";
import { fireEvent, screen } from "@testing-library/react";

// The map the component sees: `jest.mock` above swapped the module the
// component imports, and reaching the manual mock by its own path hands this
// suite a second copy of it.
const { mockAssetContentTypes } = jest.requireMock(
  "../../../../hooks/useResolvedMediaUri"
) as typeof import("../../../../hooks/__mocks__/useResolvedMediaUri");

jest.mock("react-markdown", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../__mocks__/linkedMarkdownMock")
}));

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: (kind: string) =>
    kind !== "collection" && kind !== "thread"
}));

// The real viewer pulls in three.js and WebGL; the test only needs the URL it
// was handed.
jest.mock("../../../asset_viewer/LazyModel3DViewer", () => ({
  __esModule: true,
  default: ({ url }: { url?: string }) => (
    <div data-testid="model3d-viewer" data-url={url} />
  )
}));

import ChatMarkdown from "../ChatMarkdown";
import { openResource } from "../../../../lib/chat/openResource";

const ASSET_ID = "7e1c0d4b5a6f48e2b9c3d1a0f2e4b6c8";

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown 3D model assets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockAssetContentTypes();
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  const expectPreviewWithEditorLink = (container: HTMLElement): void => {
    const viewer = screen.getByTestId("model3d-viewer");
    expect(viewer).toHaveAttribute("data-url", mockAssetUrl(ASSET_ID));
    expect(container.querySelector("img")).toBeNull();

    fireEvent.click(screen.getByText("Robot"));
    expect(openResource).toHaveBeenCalledWith({
      kind: "model3d",
      id: ASSET_ID
    });
  };

  it("previews a .glb markdown image and links it to the 3D editor", () => {
    const { container } = renderMarkdown(`![Robot](asset://${ASSET_ID}.glb)`);
    expectPreviewWithEditorLink(container);
  });

  it("previews a .glb asset link instead of an inert asset chip", () => {
    const { container } = renderMarkdown(`[Robot](asset://${ASSET_ID}.glb)`);
    expectPreviewWithEditorLink(container);
  });

  it("types an extension-less asset by its glTF content type", () => {
    mockAssetContentTypes.set(ASSET_ID, "model/gltf-binary");
    const { container } = renderMarkdown(`![Robot](asset://${ASSET_ID})`);
    expectPreviewWithEditorLink(container);
  });

  it("previews a model3d:// resource embed", () => {
    const { container } = renderMarkdown(`![Robot](model3d://${ASSET_ID})`);
    expectPreviewWithEditorLink(container);
  });
});
