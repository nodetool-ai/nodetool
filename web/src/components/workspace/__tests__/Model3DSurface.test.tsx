import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import Model3DSurface from "../Model3DSurface";
import { useDocumentDraftStore } from "../../../stores/DocumentDraftStore";
const mockQuery = jest.fn();
const mockRefetch = jest.fn();
jest.mock("../../../serverState/useAssetById", () => ({ useAssetById: () => mockQuery() }));
jest.mock("../../asset_viewer/LazyModel3DViewer", () => ({ __esModule: true, default: () => <div>Model loaded</div> }));
jest.mock("../../../stores/AssetStore", () => ({ useAssetStore: (select: (s: unknown) => unknown) => select({ update: jest.fn(), invalidateQueries: jest.fn() }) }));
it.each(["404", "403", "network"])("renders a settled %s metadata failure and can retry", async (failure) => {
  mockQuery.mockReturnValue({ data: undefined, isPending: false, isError: true, error: new Error(failure), refetch: mockRefetch });
  const page = render(<ThemeProvider theme={mockTheme}><Model3DSurface refId="model-1" mode="view" active /></ThemeProvider>);
  expect(screen.getByText("Could not load this 3D asset")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(mockRefetch).toHaveBeenCalled();
  mockQuery.mockReturnValue({ data: { id: "model-1", content_type: "model/gltf-binary", name: "Model" }, isPending: false });
  page.rerender(<ThemeProvider theme={mockTheme}><Model3DSurface refId="model-1" mode="view" active /></ThemeProvider>);
  expect(screen.getByText("Model loaded")).toBeInTheDocument();
});

jest.mock("../../model_editor/Model3DEditor", () => ({
  __esModule: true,
  default: ({
    url,
    onDirtyChange,
    externallyChanged
  }: {
    url: string;
    onDirtyChange?: (dirty: boolean) => void;
    externallyChanged?: boolean;
  }) => (
    <>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        {`Editing ${url}`}
      </button>
      {externallyChanged && <span>Changed outside the editor</span>}
    </>
  )
}));

const signedAsset = (signature: string) => ({
  data: {
    id: "model-1",
    content_type: "model/gltf-binary",
    name: "Model.glb",
    get_url: `https://bucket.example/model-1.glb?sig=${signature}`
  },
  isPending: false
});

const renderSurface = (mode: "edit" | "view") => (
  <ThemeProvider theme={mockTheme}>
    <Model3DSurface refId="model-1" mode={mode} active />
  </ThemeProvider>
);

it("keeps the open editor on its first URL when a refetch signs a new one", async () => {
  mockQuery.mockReturnValue(signedAsset("first"));
  const page = render(renderSurface("edit"));
  expect(await screen.findByText(/sig=first/)).toBeInTheDocument();

  mockQuery.mockReturnValue(signedAsset("second"));
  page.rerender(renderSurface("edit"));
  expect(screen.getByText(/sig=first/)).toBeInTheDocument();

  page.rerender(renderSurface("view"));
  page.rerender(renderSurface("edit"));
  expect(await screen.findByText(/sig=second/)).toBeInTheDocument();
});

it("marks the tab dirty while the editor has unsaved edits", async () => {
  mockQuery.mockReturnValue(signedAsset("first"));
  render(renderSurface("edit"));
  await userEvent.click(await screen.findByRole("button", { name: /Editing/ }));
  expect(useDocumentDraftStore.getState().dirtyTabs["model3d:model-1"]).toBe(true);
});

const versionedAsset = (updatedAt: string) => ({
  data: {
    id: "model-1",
    content_type: "model/gltf-binary",
    name: "Model.glb",
    get_url: "https://host.example/model-1.glb",
    updated_at: updatedAt
  },
  isPending: false
});

it("reloads a clean editor when the file is written from elsewhere", async () => {
  mockQuery.mockReturnValue(versionedAsset("t1"));
  const page = render(renderSurface("edit"));
  expect(await screen.findByText("Editing https://host.example/model-1.glb")).toBeInTheDocument();

  mockQuery.mockReturnValue(versionedAsset("t2"));
  page.rerender(renderSurface("edit"));

  expect(
    await screen.findByText("Editing https://host.example/model-1.glb?v=t2")
  ).toBeInTheDocument();
  expect(screen.queryByText("Changed outside the editor")).toBeNull();
});

it("warns instead of reloading when the editor has unsaved edits", async () => {
  mockQuery.mockReturnValue(versionedAsset("t1"));
  const page = render(renderSurface("edit"));
  await userEvent.click(await screen.findByRole("button", { name: /Editing/ }));

  mockQuery.mockReturnValue(versionedAsset("t2"));
  page.rerender(renderSurface("edit"));

  expect(await screen.findByText("Changed outside the editor")).toBeInTheDocument();
  expect(screen.getByText("Editing https://host.example/model-1.glb")).toBeInTheDocument();
});
