import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../../__mocks__/themeMock";
import EntitySetupHost from "../EntitySetupHost";
import { writeEntitySetupDraft } from "../entitySetupDraft";
import { useWorkspaceTabsStore } from "../../../../stores/WorkspaceTabsStore";

const searchAssets = jest.fn();
const getAsset = jest.fn();
const updateAsset = jest.fn();
const assignDocument = jest.fn();
const rpcRequest = jest.fn();
const mockCreateAsset = jest.fn();
const mockAddNotification = jest.fn();

jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      search: { query: (...args: unknown[]) => searchAssets(...args) },
      get: { query: (...args: unknown[]) => getAsset(...args) },
      update: { mutate: (...args: unknown[]) => updateAsset(...args) }
    },
    projects: {
      assignDocument: {
        mutate: (...args: unknown[]) => assignDocument(...args)
      }
    }
  }
}));

jest.mock("../../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: () => <div aria-hidden />
}));
jest.mock("../../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: ({
    value,
    onChange
  }: {
    value: string;
    onChange: (model: {
      type: "image_model";
      id: string;
      provider: string;
      name: string;
      path: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          type: "image_model",
          id: "image-model-1",
          provider: "openai",
          name: "Reference model",
          path: ""
        })
      }
    >
      {value ? "Reference model selected" : "Select image model"}
    </button>
  )
}));
jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args)
}));
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (state: unknown) => unknown) =>
    selector({ createAsset: mockCreateAsset })
}));
jest.mock("../../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification: mockAddNotification })
}));

const renderHost = (
  onFinish = jest.fn(),
  initialAssetId?: string
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <EntitySetupHost
          projectId="project-1"
          initialDescriptor="A space explorer"
          initialAssetId={initialAssetId}
          onFinish={onFinish}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { onFinish, ...view };
};

describe("EntitySetupHost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    const asset = {
      id: "asset-7",
      project_id: "default",
      name: "nova.png",
      content_type: "image/png",
      get_url:
        "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
      metadata: {},
      created_at: ""
    };
    const existingEntityAsset = {
      ...asset,
      id: "asset-existing",
      name: "existing.png",
      metadata: {
        nodetool_entity: {
          kind: "character",
          name: "Existing entity",
          descriptor: "Already in use"
        }
      }
    };
    searchAssets.mockResolvedValue({ assets: [asset, existingEntityAsset] });
    getAsset.mockResolvedValue(asset);
    updateAsset.mockImplementation(async (input: { metadata: object }) => ({
      ...asset,
      metadata: input.metadata
    }));
    assignDocument.mockResolvedValue({ ok: true });
    rpcRequest.mockResolvedValue({ asset_ids: ["generated-asset"] });
  });

  it("collects details and a reference before creating the entity", async () => {
    const user = userEvent.setup();
    const { onFinish } = renderHost();

    expect(
      screen.getByRole("button", { name: "Choose a reference" })
    ).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );

    expect(
      screen.getByRole("heading", { name: "Choose a reference image" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose from assets" }));
    expect(
      screen.queryByRole("button", { name: "existing.png" })
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "nova.png" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Review entity" }));

    expect(
      screen.getByRole("heading", { name: "Review your entity" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create entity" }));

    await waitFor(() =>
      expect(updateAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "asset-7",
          metadata: expect.objectContaining({
            nodetool_entity: expect.objectContaining({
              kind: "character",
              name: "Nova",
              descriptor: "A space explorer"
            })
          })
        })
      )
    );
    expect(assignDocument).toHaveBeenCalledWith({
      projectId: "project-1",
      type: "entity",
      ref: "asset-7"
    });
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-7", name: "Nova" })
    );
    expect(
      localStorage.getItem("nodetool-entity-setup-draft:project-1")
    ).toBeNull();
  });

  it("refuses an entity created after the library query", async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    searchAssets.mockResolvedValue({ assets: [] });
    const claimedAsset = {
      id: "asset-7",
      metadata: {
        nodetool_entity: {
          kind: "character",
          name: "Existing entity",
          descriptor: "Already in use"
        }
      }
    };
    renderHost(onFinish, "asset-7");

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );
    await user.click(screen.getByRole("button", { name: "Review entity" }));
    getAsset.mockReset();
    getAsset.mockResolvedValueOnce(claimedAsset);
    await user.click(screen.getByRole("button", { name: "Create entity" }));

    expect(
      await screen.findByText("That image is already used by another entity.")
    ).toBeInTheDocument();
    expect(updateAsset).not.toHaveBeenCalled();
    expect(assignDocument).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("generates a reference image from the entity description", async () => {
    const user = userEvent.setup();
    const { onFinish } = renderHost();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );
    await user.click(screen.getByRole("button", { name: "Generate with AI" }));

    expect(
      screen.getByRole("heading", { name: /Generate a reference image/ })
    ).toBeInTheDocument();
    // A dead button says why it is off.
    expect(
      screen.getByText("Pick an image model to generate the reference.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select image model" }));
    expect(
      screen.queryByText("Pick an image model to generate the reference.")
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Generate reference" })
    );

    await waitFor(() =>
      expect(rpcRequest).toHaveBeenCalledWith(
        "generate_media",
        expect.objectContaining({
          mode: "image",
          provider: "openai",
          model: "image-model-1",
          aspect_ratio: "1:1",
          resolution: "1K",
          variations: 1
        }),
        expect.any(Number),
        expect.any(AbortSignal)
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(
      await screen.findByTestId("entity-reference-preview")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review entity" }));
    await user.click(screen.getByRole("button", { name: "Create entity" }));

    await waitFor(() =>
      expect(updateAsset).toHaveBeenCalledWith(
        expect.objectContaining({ id: "generated-asset" })
      )
    );
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-7", name: "Nova" })
    );
  });

  it("uses a character sheet prompt and keeps it editable", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );
    await user.click(screen.getByRole("button", { name: "Generate with AI" }));
    await user.click(screen.getByRole("button", { name: "Character sheet" }));

    const prompt = screen.getByRole("textbox", { name: "Prompt" });
    expect((prompt as HTMLTextAreaElement).value).toContain("Nova");
    expect((prompt as HTMLTextAreaElement).value).toContain(
      "front, side, and back views"
    );
    await user.type(prompt, " Show the orange flight suit clearly.");
    const selectModel = screen.queryByRole("button", {
      name: "Select image model"
    });
    if (selectModel) {
      await user.click(selectModel);
    }
    await user.click(
      screen.getByRole("button", { name: "Generate reference" })
    );

    await waitFor(() =>
      expect(rpcRequest).toHaveBeenCalledWith(
        "generate_media",
        expect.objectContaining({
          aspect_ratio: "3:2",
          prompt: expect.stringContaining("Show the orange flight suit clearly.")
        }),
        expect.any(Number),
        expect.any(AbortSignal)
      )
    );
  });

  it("offers location views when the entity is a location", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("radio", { name: /Location/ }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Base camp");
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );
    await user.click(screen.getByRole("button", { name: "Generate with AI" }));

    expect(
      screen.getByRole("button", { name: "Establishing view" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Location sheet" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Character sheet" })
    ).not.toBeInTheDocument();
  });

  it("restores draft details, stage, and selected reference after remount", async () => {
    const user = userEvent.setup();
    const first = renderHost();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
    await user.type(
      screen.getByRole("textbox", { name: "Tags (optional)" }),
      "hero, space"
    );
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );
    await user.click(screen.getByRole("button", { name: "Choose from assets" }));
    await user.click(await screen.findByRole("button", { name: "nova.png" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Review entity" }));

    first.unmount();
    renderHost();

    expect(
      screen.getByRole("heading", { name: "Review your entity" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.getByText(/Tags: hero, space/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Nova reference" })
    ).toBeInTheDocument();
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it("starts a blank entity from a plain canvas", async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => ({ fillRect: jest.fn(), fillStyle: "" })
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (done: (blob: Blob | null) => void) => {
        done(new Blob(["png"], { type: "image/png" }));
      }
    });
    mockCreateAsset.mockResolvedValue({ id: "asset-blank" });
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByText("Start with a blank reference"));

    await waitFor(() =>
      expect(mockCreateAsset).toHaveBeenCalledWith(expect.any(File))
    );
    expect(
      screen.getByRole("heading", { name: "Review your entity" })
    ).toBeInTheDocument();
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  const stubBlankCanvas = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => ({ fillRect: jest.fn(), fillStyle: "" })
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (done: (blob: Blob | null) => void) => {
        done(new Blob(["png"], { type: "image/png" }));
      }
    });
  };

  // F17: the blank canvas fills no descriptor, because that sentence would
  // season every prompt the entity appears in. The review waits for one.
  it("leaves the blank entity's descriptor empty and blocks the review", async () => {
    stubBlankCanvas();
    mockCreateAsset.mockResolvedValue({ id: "asset-blank" });
    const user = userEvent.setup();
    renderHost();
    await user.clear(screen.getByRole("textbox", { name: "Descriptor" }));

    await user.click(screen.getByText("Start with a blank reference"));

    expect(
      await screen.findByRole("heading", { name: "Review your entity" })
    ).toBeInTheDocument();
    expect(screen.queryByText("A reusable visual entity.")).toBeNull();
    expect(screen.getByRole("button", { name: "Create entity" })).toBeDisabled();
    expect(
      screen.getByText("Go back and describe the traits to preserve")
    ).toBeInTheDocument();
  });

  // F17: the canvas upload must not pull the creator to the review after
  // they moved on, and Continue waits for it.
  it("holds the details step while the blank canvas uploads", async () => {
    stubBlankCanvas();
    let _finishUpload: () => void = () => {};
    mockCreateAsset.mockImplementation(
      () =>
        new Promise((resolve) => {
          _finishUpload = () => resolve({ id: "asset-blank" });
        })
    );
    const user = userEvent.setup();
    renderHost();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");

    await user.click(screen.getByText("Start with a blank reference"));
    await waitFor(() => expect(mockCreateAsset).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "Choose a reference" })
    ).toBeDisabled();
  });

  // F11: closing the generator mid-render aborts the request, and an answer
  // that still arrives does not replace the reference.
  it("aborts a reference render when the dialog closes", async () => {
    let answer: (value: unknown) => void = () => {};
    rpcRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    const user = userEvent.setup();
    renderHost();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );
    await user.click(screen.getByRole("button", { name: "Generate with AI" }));
    const selectModel = screen.queryByRole("button", {
      name: "Select image model"
    });
    if (selectModel) {
      await user.click(selectModel);
    }
    await user.click(
      screen.getByRole("button", { name: "Generate reference" })
    );
    await waitFor(() => expect(rpcRequest).toHaveBeenCalled());
    const [, , timeoutMs, signal] = rpcRequest.mock.calls[0] as [
      string,
      unknown,
      number | undefined,
      AbortSignal | undefined
    ];
    expect(timeoutMs).toBeGreaterThan(0);
    expect(signal?.aborted).toBe(false);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(signal?.aborted).toBe(true);
    answer({ asset_ids: ["late-asset"] });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId("entity-reference-preview")).toBeNull();
  });

  // A review with no reference says what is missing instead of rendering an
  // empty body over a dead button.
  // The entity is written before the save resolves, so Cancel could only
  // claim an unchanged draft while the entity is created anyway.
  it("offers no Cancel while the entity is being created", async () => {
    const user = userEvent.setup();
    let finishUpdate: () => void = () => {};
    updateAsset.mockImplementationOnce(
      (input: { id: string; metadata: object }) =>
        new Promise((resolve) => {
          finishUpdate = () =>
            resolve({
              id: input.id,
              project_id: "default",
              name: "nova.png",
              content_type: "image/png",
              metadata: input.metadata,
              created_at: ""
            });
        })
    );
    const { onFinish } = renderHost(jest.fn(), "asset-7");

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
    await user.click(
      screen.getByRole("button", { name: "Choose a reference" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Review entity" })
    );
    await user.click(screen.getByRole("button", { name: "Create entity" }));
    await waitFor(() => expect(updateAsset).toHaveBeenCalled());

    expect(
      screen.queryByRole("button", { name: "Cancel" })
    ).not.toBeInTheDocument();
    finishUpdate();
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });

  it("explains a review that has no reference", async () => {
    writeEntitySetupDraft("project-1", {
      version: 1,
      stage: "review",
      details: {
        kind: "character",
        name: "Nova",
        descriptor: "A space explorer",
        tags: ""
      },
      assetId: null
    });
    renderHost();
    expect(
      await screen.findByText("No reference image yet")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create entity" })).toBeDisabled();
  });

  describe("a draft keyed by a guided tab", () => {
    const KEY = "nodetool-entity-setup-draft:flow-1";
    const guidedTab = {
      id: "guided-flow:flow-1",
      type: "guided-flow",
      ref: "flow-1",
      mode: "edit",
      title: "Entity"
    };

    const renderInTab = () => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } }
      });
      return render(
        <QueryClientProvider client={client}>
          <ThemeProvider theme={mockTheme}>
            <EntitySetupHost
              projectId="project-1"
              draftKey="flow-1"
              onFinish={jest.fn()}
            />
          </ThemeProvider>
        </QueryClientProvider>
      );
    };

    it("is kept while its tab stays open", async () => {
      useWorkspaceTabsStore.setState({ tabs: [guidedTab] } as never);
      const user = userEvent.setup();
      const { unmount } = renderInTab();
      await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");

      unmount();

      expect(localStorage.getItem(KEY)).toContain("Nova");
    });

    it("sweeps drafts of guided tabs that closed earlier", () => {
      const open = "11111111-2222-4333-8444-555555555555";
      const closed = "66666666-7777-4888-8999-aaaaaaaaaaaa";
      const draft = JSON.stringify({ version: 1 });
      localStorage.setItem(`nodetool-entity-setup-draft:${open}`, draft);
      localStorage.setItem(`nodetool-entity-setup-draft:${closed}`, draft);
      localStorage.setItem("nodetool-entity-setup-draft:project-2", draft);
      useWorkspaceTabsStore.setState({
        tabs: [guidedTab, { ...guidedTab, id: `guided-flow:${open}`, ref: open }]
      } as never);

      renderInTab();

      expect(
        localStorage.getItem(`nodetool-entity-setup-draft:${closed}`)
      ).toBeNull();
      expect(
        localStorage.getItem(`nodetool-entity-setup-draft:${open}`)
      ).not.toBeNull();
      expect(
        localStorage.getItem("nodetool-entity-setup-draft:project-2")
      ).not.toBeNull();
    });

    it("is removed when its tab closes", async () => {
      useWorkspaceTabsStore.setState({ tabs: [guidedTab] } as never);
      const user = userEvent.setup();
      const { unmount } = renderInTab();
      await user.type(screen.getByRole("textbox", { name: "Name" }), "Nova");
      expect(localStorage.getItem(KEY)).toContain("Nova");

      useWorkspaceTabsStore.setState({ tabs: [] } as never);
      unmount();

      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });
});
