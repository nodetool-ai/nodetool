import { createHash } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { gameAuthoring, gameDocument3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { createGameSession3D, decodePreparedGameCollider3D } from "@nodetool-ai/game-runtime";
import { useGamePlaySession3D } from "../useGamePlaySession3D";
import { asResolvedMediaUrl, resolveMediaUri } from "../../../utils/resolveMediaUri";

const mockRenderers: { render: jest.Mock; dispose: jest.Mock }[] = [];

jest.mock("@nodetool-ai/game-renderer/browser3d", () => ({
  createGameRenderer3D: jest.fn(async () => {
    const renderer = { render: jest.fn(async () => ({})), resize: jest.fn(), dispose: jest.fn() };
    mockRenderers.push(renderer);
    return renderer;
  })
}), { virtual: true });
jest.mock("@nodetool-ai/game-renderer/audio", () => ({
  GameAudioPlayer: jest.fn().mockImplementation(() => ({ preload: jest.fn(), sync: jest.fn(), resume: jest.fn(), pause: jest.fn(),
    reset: jest.fn(), handle: jest.fn(), dispose: jest.fn() }))
}));
jest.mock("../../../utils/resolveMediaUri", () => ({
  ...jest.requireActual<typeof import("../../../utils/resolveMediaUri")>("../../../utils/resolveMediaUri"), resolveMediaUri: jest.fn()
}));

const colliderBytes = new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }));
const installedId = "b".repeat(32);
function fixture(): GameDocument3D {
  return gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "hook3d", revision: "saved", entrySceneId: "level",
    tickRate: 60, inputActions: [], presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 },
    assets: { ground: { mediaKind: "collider", assetId: installedId, digest: createHash("sha256").update(colliderBytes).digest("hex"), required: true,
      shape: "triangleMesh", preparationVersion: "1", vertices: 4, triangles: 4, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } } },
    scenes: ["level", "alternate"].map((id) => ({ id, name: id, activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
      { id: "floor", transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "triangleMesh", assetId: "ground" } }
    ] })) });
}

function Harness({ document, sceneId = "level" }: { document: GameDocument3D; sceneId?: string }) {
  const session = useGamePlaySession3D({ refId: "hook3d", document, active: true, editorSceneId: sceneId });
  return <>
    <canvas ref={session.canvasRef} tabIndex={0} />
    <button onClick={session.beginPlay}>{session.playing ? "Pause" : "Play"}</button>
    <button onClick={session.stop}>Stop</button>
    <button onClick={() => session.step()}>Step</button>
    <button onClick={session.save}>Save</button>
    <button onClick={() => void session.load()}>Restore</button>
    <button onClick={() => session.step({ pressed: [], justPressed: [], axes: { moveX: 2 }, look: { x: 0, y: 0 } })}>Fail tick</button>
    <output data-testid="backend">{session.backend}</output>
    <output data-testid="scene">{session.inspection?.sceneId}</output>
    <output data-testid="tick">{session.inspection?.tick}</output>
    <output data-testid="frame-tick">{session.frame?.tick}</output>
    <output data-testid="error">{session.error}</output>
  </>;
}

// Await the real WASM cold start outside the hook polling assertion.
beforeAll(async () => {
  const session = await createGameSession3D(fixture(), 1, undefined, {
    resolveCollider: async (binding) => decodePreparedGameCollider3D(colliderBytes, binding)
  });
  session.dispose();
});

const originalFetch = global.fetch;
const originalClone = global.structuredClone;
beforeEach(() => {
  mockRenderers.length = 0;
  localStorage.clear();
  // The shared Jest JSON clone cannot restore optional snapshot fields.
  global.structuredClone = (value) => deserialize(serialize(value));
  jest.mocked(resolveMediaUri).mockResolvedValue(asResolvedMediaUrl("https://owned.example/ground.json") ?? "");
  global.fetch = jest.fn(async () => {
    if ("Response" in globalThis) { return new Response(colliderBytes.slice()); }
    return { ok: true, arrayBuffer: async () => colliderBytes.slice().buffer } as Response;
  });
});
afterEach(() => { global.fetch = originalFetch; global.structuredClone = originalClone; jest.clearAllMocks(); });

it("loads installed collider bytes after the runtime parses and clones document bindings", async () => {
  const document = fixture();
  const view = render(<Harness document={document} />);
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  expect(screen.getByTestId("scene")).toHaveTextContent("level");
  expect(resolveMediaUri).toHaveBeenCalledWith(`asset://${installedId}`);
  expect(fetch).toHaveBeenCalledWith("https://owned.example/ground.json", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(2));
  expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  expect(fetch).toHaveBeenCalledTimes(2);
  view.unmount();
});

it("pins a retained definition and its collider binding until play restarts", async () => {
  const baseline = fixture();
  const document: GameDocument3D = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline,
    overrides: [], detached: [], suppressions: [] }) };
  const view = render(<Harness document={document} />);
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(2));
  await user.click(screen.getByRole("button", { name: "Pause" }));
  const calls = jest.mocked(resolveMediaUri).mock.calls.length;
  const replacementId = "c".repeat(32);
  const changed = { ...document, assets: { ...document.assets, ground: { ...document.assets.ground, assetId: replacementId } } };
  view.rerender(<Harness document={changed} />);
  await user.click(screen.getByRole("button", { name: "Step" }));
  expect(mockRenderers).toHaveLength(2);
  expect(jest.mocked(resolveMediaUri).mock.calls).toHaveLength(calls);
  expect(resolveMediaUri).not.toHaveBeenCalledWith(`asset://${replacementId}`);
  await user.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(3));
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(4));
  expect(resolveMediaUri).toHaveBeenCalledWith(`asset://${replacementId}`);
  view.unmount();
});

it.each([false, true])("retains the immutable play session when the editor scene changes, running=%s", async (running) => {
  const document = fixture();
  const view = render(<Harness document={document} />);
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(2));
  if (!running) { await user.click(screen.getByRole("button", { name: "Pause" })); }
  for (let index = 0; index < 6; index++) { await user.click(screen.getByRole("button", { name: "Step" })); }
  const previousTick = Number(screen.getByTestId("tick").textContent);
  expect(previousTick).toBeGreaterThan(0);
  const activeRenderer = mockRenderers[1];
  view.rerender(<Harness document={document} sceneId="alternate" />);
  expect(screen.getByTestId("scene")).toHaveTextContent("level");
  expect(Number(screen.getByTestId("tick").textContent)).toBeGreaterThanOrEqual(previousTick);
  expect(mockRenderers).toHaveLength(2);
  expect(activeRenderer.dispose).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: running ? "Pause" : "Play" })).toBeInTheDocument();
  view.unmount();
});

it("keeps the restored committed frame when the following tick fails", async () => {
  const view = render(<Harness document={fixture()} />);
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  await user.click(screen.getByRole("button", { name: "Step" }));
  await user.click(screen.getByRole("button", { name: "Step" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(screen.getByRole("button", { name: "Step" }));
  expect(screen.getByTestId("frame-tick")).toHaveTextContent("3");
  await user.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(screen.getByTestId("frame-tick")).toHaveTextContent("2"));
  await user.click(screen.getByRole("button", { name: "Fail tick" }));
  expect(screen.getByTestId("error")).not.toBeEmptyDOMElement();
  expect(screen.getByTestId("tick")).toHaveTextContent("2");
  expect(screen.getByTestId("frame-tick")).toHaveTextContent("2");
  view.unmount();
});
