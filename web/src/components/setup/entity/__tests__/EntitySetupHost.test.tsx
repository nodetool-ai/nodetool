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

const renderHost = (
  onFinish = jest.fn(),
  initialAssetId?: string
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
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
  return onFinish;
};

describe("EntitySetupHost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  it("collects details and a reference before creating the entity", async () => {
    const user = userEvent.setup();
    const onFinish = renderHost();

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
});
