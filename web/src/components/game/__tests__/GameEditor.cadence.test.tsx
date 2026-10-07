import { Profiler } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import type { GameRenderFrame, GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { trpc } from "../../../trpc/client";
import { getGameDraftStore } from "../../../stores/game/GameDraftStore";
import GameEditor from "../GameEditor";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../trpc/client", () => {
  const { createTRPCReact } = jest.requireActual<typeof import("@trpc/react-query")>("@trpc/react-query");
  return {
    ...jest.requireActual<typeof import("../../../__mocks__/trpcClientMock")>("../../../__mocks__/trpcClientMock"),
    trpc: createTRPCReact<AppRouter>()
  };
});

jest.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    target = new (jest.requireActual<typeof import("three")>("three").Vector3)();
    enabled = true;
    update() {}
    addEventListener() {}
    removeEventListener() {}
    dispose() {}
  }
}));
jest.mock("three/addons/controls/TransformControls.js", () => ({
  TransformControls: class {
    dragging = false;
    private helper = new (jest.requireActual<typeof import("three")>("three").Object3D)();
    getHelper() { return this.helper; }
    addEventListener() {}
    removeEventListener() {}
    attach() {}
    detach() {}
    setMode() {}
    setTranslationSnap() {}
    setRotationSnap() {}
    setScaleSnap() {}
    dispose() {}
  }
}));
jest.mock("three/addons/controls/FlyControls.js", () => ({ FlyControls: jest.fn() }));

const mockRenderedTicks: number[] = [];
jest.mock("@nodetool-ai/game-renderer/browser", () => ({
  loadBrowserGameFonts: jest.fn(async () => ({ diagnostics: [], dispose: jest.fn() })),
  createGameRenderer: jest.fn(async ({ canvas }: { canvas: HTMLCanvasElement }) => ({ canvas, backend: "canvas2d", capabilities: { gpuEffects: false },
    render: jest.fn(async (frame: GameRenderFrame) => { mockRenderedTicks.push(frame.tick); }),
    resize: jest.fn(), setEffects: jest.fn(), invalidateAsset: jest.fn(), dispose: jest.fn() }))
}));
jest.mock("@nodetool-ai/game-renderer/browser3d", () => ({
  createGameRenderer3D: jest.fn(async () => {
    const scene = new (jest.requireActual<typeof import("three")>("three").Scene)();
    return { getScene: () => scene, setEditorCamera: jest.fn(), getEntityObject: jest.fn(() => null), pick: jest.fn(() => null),
    render: jest.fn(async (frame: GameRenderFrame3D) => { mockRenderedTicks.push(frame.tick); return {}; }),
    resize: jest.fn(), invalidateAsset: jest.fn(), dispose: jest.fn() };
  })
}), { virtual: true });
jest.mock("@nodetool-ai/game-renderer/audio", () => ({
  GameAudioPlayer: jest.fn().mockImplementation(() => ({ updateAssets: jest.fn(), preload: jest.fn(), sync: jest.fn(),
    resume: jest.fn(), pause: jest.fn(), reset: jest.fn(), handle: jest.fn(), dispose: jest.fn() }))
}));
jest.mock("../../../utils/resolveMediaUri", () => ({
  ...jest.requireActual<typeof import("../../../utils/resolveMediaUri")>("../../../utils/resolveMediaUri"),
  resolveMediaUri: jest.fn(async () => null)
}));

it.each(["2d", "3d"] as const)("commits the actual %s editor at the HUD cadence during steady Play", async (dimension) => {
  const user = userEvent.setup();
  const document = dimension === "2d" ? createTopDownRoomGame(`editor-cadence-${dimension}`) : createNative3DGame(`editor-cadence-${dimension}`);
  if (document.schemaVersion === 3) {
    for (const scene of document.scenes) {
      for (const entity of scene.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); }
    }
    for (const prefab of Object.values(document.prefabs)) {
      for (const entity of prefab.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); }
    }
  }
  const draft = { document, game: { id: document.id, name: "Cadence measurement", revision: document.revision,
    draftUpdatedAt: "loaded", projectId: "cadence-project" } };
  const client = createTRPCClient<AppRouter>({ links: [() => ({ op }) => observable((observer) => {
    if (op.path === "games.getDraft") { observer.next({ result: { data: draft } }); }
    else if (op.path === "games.revisions" || op.path === "games.draftChanges") { observer.next({ result: { data: [] } }); }
    else { observer.error(TRPCClientError.from<AppRouter>(new Error(`Unexpected measured editor request: ${op.path}`))); return; }
    observer.complete();
  })] });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  getGameDraftStore(document.id).getState().load(document, "loaded");
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextRequest = 0;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextRequest; callbacks.set(id, callback); return id;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { callbacks.delete(id); });
  const commits: string[] = [];
  const view = render(<ThemeProvider theme={mockTheme}><QueryClientProvider client={queries}>
    <trpc.Provider client={client} queryClient={queries}><Profiler id="actual-game-editor" onRender={() => {
      commits.push(window.document.querySelector("footer")?.textContent ?? "");
    }}><GameEditor refId={document.id} active /></Profiler></trpc.Provider>
  </QueryClientProvider></ThemeProvider>);
  try {
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeEnabled());
    await waitFor(() => expect(view.container.querySelector("footer")).toHaveTextContent(dimension === "2d" ? "Canvas 2D" : "WebGL2"));
    mockRenderedTicks.length = 0;
    await user.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled());
    await user.unhover(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await waitFor(() => expect(view.container.querySelectorAll(".MuiTouchRipple-ripple")).toHaveLength(0));
    await waitFor(() => expect(mockRenderedTicks.length).toBeGreaterThan(0));
    let now = 0;
    const advance = async (): Promise<void> => {
      const pending = [...callbacks.values()]; callbacks.clear();
      await act(async () => { for (const callback of pending) { callback(now); } });
      now += 1000 / (document.tickRate * 2);
    };
    await advance(); // Establish the clock anchor before the measured interval.
    commits.length = 0;
    mockRenderedTicks.length = 0;
    let previousTick = 0;
    let measuredUpdates = 0;
    for (let callback = 0; callback < 130 && previousTick < 60; callback++) {
      const before = commits.length;
      await advance();
      const tick = mockRenderedTicks.at(-1) ?? previousTick;
      expect(tick - previousTick).toBeLessThanOrEqual(1);
      const boundary = Math.floor(tick / 6) - Math.floor(previousTick / 6);
      expect(commits.length - before).toBe(boundary);
      if (boundary) { expect(view.container.querySelector("footer")).toHaveTextContent(`Tick ${tick} `); }
      measuredUpdates += boundary;
      previousTick = tick;
    }
    expect(previousTick).toBe(60);
    expect(mockRenderedTicks.length).toBeGreaterThanOrEqual(60);
    expect(measuredUpdates).toBe(10);
    expect(commits).toHaveLength(10);
    console.info("K2 editor cadence", JSON.stringify({ dimension, ticks: previousTick, clockAdvanceMs: now, renderedTicks: mockRenderedTicks, commits }));
  } finally {
    view.unmount(); queries.clear(); request.mockRestore(); cancel.mockRestore(); mockRenderedTicks.length = 0;
  }
});
