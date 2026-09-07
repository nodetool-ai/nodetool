/**
 * The two server-state hooks the flow reads its shipped data through
 * (game-prd § 6.1, § 5.6).
 *
 * What is asserted: the shape each procedure answers with — both return the
 * array itself, not an envelope around it — so a change on the router side
 * fails here rather than as an empty template grid; and that seeding the style
 * presets invalidates the entity library, because the style the graph pastes
 * into every prompt is read back off an entity row.
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const templatesQuery = jest.fn();
const stylePresetsMutate = jest.fn();
jest.mock("../../../trpc/client", () => ({
  __esModule: true,
  trpcClient: {
    games: {
      templates: { query: () => templatesQuery() },
      stylePresets: { mutate: () => stylePresetsMutate() }
    }
  }
}));

import { templateManifest, useGameTemplates } from "../useGameTemplates";
import { useGameStylePresets } from "../useGameStylePresets";

const PLATFORMER = {
  id: "platformer",
  godot: "4.3",
  slots: [{ id: "player", kind: "spritesheet", cell: [32, 32], animations: { idle: 2 }, fps: 8 }],
  hooks: ["scripts/player.gd"]
};

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useGameTemplates", () => {
  it("reads the array the procedure answers with", async () => {
    templatesQuery.mockResolvedValue([PLATFORMER]);
    const { result } = renderHook(() => useGameTemplates(), {
      wrapper: wrapper(client())
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([PLATFORMER]);
  });
});

describe("templateManifest", () => {
  it("rebuilds the manifest the graph builder takes", () => {
    expect(templateManifest(PLATFORMER as never)).toEqual({
      version: 1,
      template: "platformer",
      godot: "4.3",
      slots: PLATFORMER.slots,
      hooks: PLATFORMER.hooks
    });
  });
});

describe("useGameStylePresets", () => {
  it("seeds the presets and invalidates the entity library", async () => {
    const presets = [
      {
        entityId: "e-8bit",
        presetId: "pixel-8bit",
        name: "8-bit",
        descriptor: "8-bit pixel art",
        thumbnail: "package://nodetool-base/styles/game-pixel-8bit.png"
      }
    ];
    stylePresetsMutate.mockResolvedValue(presets);
    const queryClient = client();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useGameStylePresets(), {
      wrapper: wrapper(queryClient)
    });
    await waitFor(() => expect(result.current.data).toEqual(presets));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["entities"] });
  });
});
