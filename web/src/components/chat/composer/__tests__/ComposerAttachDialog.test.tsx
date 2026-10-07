import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ComposerAttachDialog } from "../ComposerAttachDialog";
import mockTheme from "../../../../__mocks__/themeMock";
import { trpc } from "../../../../trpc/client";
import { useWorkspaceTabsStore } from "../../../../stores/WorkspaceTabsStore";
import type { Asset } from "../../../../stores/ApiTypes";

jest.mock("../../../../trpc/client", () => ({
  trpc: { documents: { index: { useQuery: jest.fn() } } },
  trpcClient: {}
}));

const ASSET = {
  id: "as1",
  name: "beach.png",
  content_type: "image/png",
  thumb_url: "",
  get_url: ""
} as unknown as Asset;

jest.mock(
  "../../../node_types/editing/promptComposer/useAssetMentionSearch",
  () => ({
    ...jest.requireActual(
      "../../../node_types/editing/promptComposer/useAssetMentionSearch"
    ),
    useAssetMentionSearch: () => ({
      activeTab: "saved",
      setActiveTab: jest.fn(),
      entities: [],
      displayedAssets: [ASSET],
      hasMoreSaved: false,
      loadMoreSaved: jest.fn(),
      handleRename: jest.fn()
    })
  })
);

jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({
    isLoading: false,
    data: [
      {
        id: "ent1",
        kind: "character",
        name: "Mara",
        descriptor: "a sailor",
        reference_images: []
      }
    ]
  })
}));

const useIndexQuery = trpc.documents.index.useQuery as unknown as jest.Mock;

const renderDialog = () => {
  const props = {
    open: true,
    onClose: jest.fn(),
    onSelectAsset: jest.fn(),
    onSelectEntity: jest.fn(),
    onSelectDocument: jest.fn(),
    onUploadFiles: jest.fn()
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <ComposerAttachDialog {...props} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return props;
};

describe("ComposerAttachDialog", () => {
  beforeEach(() => {
    useIndexQuery.mockReturnValue({
      data: {
        documents: [
          { id: "wf1", type: "workflow", name: "Upscale", updatedAt: "" },
          { id: "app1", type: "application", name: "Poster app", updatedAt: "" },
          { id: "ent1", type: "entity", name: "Mara", updatedAt: "" }
        ],
        partial: false
      },
      isLoading: false,
      error: null
    });
    useWorkspaceTabsStore.setState({
      activeProjectId: "proj1",
      personalProjectId: "personal"
    });
  });

  it("shows one tab per kind of reference", () => {
    renderDialog();

    for (const name of ["Assets", "Entities", "Documents", "Upload"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("hands a picked asset to the composer and closes", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole("option", { name: /beach\.png/ }));

    expect(props.onSelectAsset).toHaveBeenCalledWith(ASSET);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("hands a picked entity to the composer", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole("tab", { name: "Entities" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search entities" }),
      "mar"
    );
    await user.click(screen.getByRole("button", { name: "Mara" }));

    expect(props.onSelectEntity).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ent1" })
    );
  });

  it("lists project documents without entities and links them by resource URI", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole("tab", { name: "Documents" }));

    expect(useIndexQuery).toHaveBeenCalledWith(
      { projectId: "proj1" },
      expect.anything()
    );
    expect(screen.queryByRole("button", { name: "Mara" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Poster app" }));
    expect(props.onSelectDocument).toHaveBeenCalledWith({
      name: "Poster app",
      uri: "app://app1"
    });
  });

  it("uploads chosen files", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole("tab", { name: "Upload" }));
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(props.onUploadFiles).toHaveBeenCalledWith([file]);
    expect(props.onClose).toHaveBeenCalled();
  });
});
