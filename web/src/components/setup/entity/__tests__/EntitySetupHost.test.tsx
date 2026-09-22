import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../../__mocks__/themeMock";
import EntitySetupHost from "../EntitySetupHost";

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
    await user.click(screen.getByRole("button", { name: "Select image model" }));
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
        })
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
});
