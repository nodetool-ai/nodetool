import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import type { GameDocument } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import GameAssetBrowser, { type GameAssetServerEditResult } from "../panels/assets/GameAssetBrowser";

const mockBase = createTopDownRoomGame("asset-browser");
const mockDocument: GameDocument = {
  ...mockBase,
  assets: { ...mockBase.assets, "player.frame.0": { ...mockBase.assets.player, digest: "old-sheet", frame: { x: 0, y: 0, width: 16, height: 16 } } }
};
const mockDigest = "c".repeat(64);
const mockServerData = {
  dimension: "2d", draft_updated_at: "t0", candidate_workspace_id: "workspace-1",
  candidates: [
    { digest: mockDigest, extension: "png", media_kind: "image", path: `games/g/assets/${mockDigest}.png`, size: 10,
      modified_at: "2026-01-01T00:00:00.000Z", bound_slots: [], slot: "player", prompt: "a red fox", source: "generate", recorded: true },
    { digest: "d".repeat(64), extension: "wav", media_kind: "audio", path: "games/g/assets/x.wav", size: 10,
      modified_at: "2026-01-01T00:00:00.000Z", bound_slots: [], recorded: false }
  ],
  slot_requests: {
    player: { kind: "image", prompt: "top-down player", preparation: { sheet: { cols: 4, rows: 2 } }, source: "template" },
    "sfx.collect": { kind: "sfx", prompt: "a bright chime", source: "template" }
  }
};
const mockResult: GameAssetServerEditResult = { document: mockDocument, game: { draftUpdatedAt: "t1" } };
const mockInstall = jest.fn(async (_request: unknown) => mockResult);
const mockGenerate = jest.fn(async (_request: unknown) => mockResult);
const mockInvalidate = jest.fn(async () => undefined);

jest.mock("../../../trpc/client", () => ({
  trpc: {
    games: { assetBrowser: { useQuery: () => ({ data: mockServerData }) } },
    useUtils: () => ({ games: { assetBrowser: { invalidate: mockInvalidate } } })
  },
  trpcClient: { games: {
    installStagedCandidate: { mutate: (request: unknown) => mockInstall(request) },
    generateAsset: { mutate: (request: unknown) => mockGenerate(request) }
  } }
}));
jest.mock("../panels/assets/GameAssetThumbnail", () => ({ __esModule: true,
  default: ({ label, mediaKind }: { label: string; mediaKind: string }) => <span data-testid="thumbnail">{`${mediaKind}:${label}`}</span> }));
jest.mock("../../support/ReportBugButton", () => ({ __esModule: true, default: () => null }));

function setup() {
  const runServerEdit = jest.fn(async (edit: (baseUpdatedAt: string) => Promise<GameAssetServerEditResult>) => { await edit("base-token"); });
  const onOps = jest.fn();
  const onSelectEntity = jest.fn();
  const onAskAssistant = jest.fn();
  render(<ThemeProvider theme={mockTheme}>
    <GameAssetBrowser gameId="game-1" document={mockDocument} runServerEdit={runServerEdit} onOps={onOps}
      onSelectEntity={onSelectEntity} onAskAssistant={onAskAssistant} />
  </ThemeProvider>);
  return { runServerEdit, onOps, onSelectEntity, onAskAssistant, user: userEvent.setup() };
}

beforeEach(() => { jest.clearAllMocks(); });

describe("GameAssetBrowser", () => {
  it("lists assets with their usage and narrows them by search and type", async () => {
    const { user } = setup();
    expect(screen.getByRole("button", { name: "Asset wall" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Assets (5)" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search assets" }), "wall-top");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Asset gem" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Asset wall" })).toBeInTheDocument();
  });

  it("selects the entity a 'used by' row names", async () => {
    const { user, onSelectEntity } = setup();
    await user.click(screen.getByRole("button", { name: "Asset gem" }));
    await user.click(screen.getByRole("button", { name: "Select room/gem · sprite.assetId" }));
    expect(onSelectEntity).toHaveBeenCalledWith("room", "gem");
  });

  it("binds a staged candidate in place through a server edit", async () => {
    const { user, runServerEdit } = setup();
    await user.click(screen.getByRole("button", { name: "Asset player" }));
    expect(screen.getByText("a red fox")).toBeInTheDocument();
    expect(screen.queryByText("image:Candidate dddddddddddd")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use" }));
    await waitFor(() => expect(mockInstall).toHaveBeenCalledWith({ id: "game-1", baseUpdatedAt: "base-token", slot: "player", digest: mockDigest }));
    expect(runServerEdit).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledWith({ id: "game-1" });
  });

  it("generates with the slot prompt, edited, and the slot's sheet preparation", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Asset player" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));
    const dialog = await screen.findByRole("dialog");
    const prompt = within(dialog).getByRole("textbox", { name: "Prompt" });
    expect(prompt).toHaveValue("top-down player");
    await user.clear(prompt);
    await user.type(prompt, "a fox in a cloak");
    await user.click(within(dialog).getByRole("button", { name: "Generate and install" }));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith({ id: "game-1", baseUpdatedAt: "base-token", slot: "player",
      kind: "image", prompt: "a fox in a cloak", preparation: { sheet: { cols: 4, rows: 2 } } }));
  });

  it("hands a sound-effect slot to the assistant with its prompt", async () => {
    const { user, onAskAssistant } = setup();
    await user.click(screen.getByRole("button", { name: "Asset sfx.collect" }));
    await user.click(screen.getByRole("button", { name: "Ask the assistant to generate" }));
    expect(onAskAssistant).toHaveBeenCalledWith(expect.stringContaining("\"sfx.collect\" slot with generate_game_asset"));
    expect(onAskAssistant).toHaveBeenCalledWith(expect.stringContaining("a bright chime"));
  });

  it("moves frame bindings left on old bytes onto the slot's image", async () => {
    const { user, onOps } = setup();
    await user.click(screen.getByRole("button", { name: "Asset player" }));
    await user.click(screen.getByRole("button", { name: "Move frames onto this image" }));
    expect(onOps).toHaveBeenCalledWith([{ op: "bind_asset", slot: "player.frame.0",
      binding: { ...mockDocument.assets["player.frame.0"], digest: mockDocument.assets.player.digest } }]);
  });

  it("shows prefabs and scenes on their own tabs", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Scenes (1)" }));
    expect(screen.getByText("Top-down room")).toBeInTheDocument();
    expect(screen.getByText("Entry")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Prefabs (0)" }));
    expect(screen.getByText("No prefabs")).toBeInTheDocument();
  });
});
