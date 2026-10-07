import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "zustand";
import { ThemeProvider } from "@mui/material/styles";
import { applyAnyGameOps, applyGameOps3D, createNative3DGame, validateGame3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { gameAuthoring, type GameDocument3D } from "@nodetool-ai/protocol";
import { getGameDraftStore } from "../../../stores/game/GameDraftStore";
import mockTheme from "../../../__mocks__/themeMock";
import GameInspector3D from "../panels/inspector/GameInspector3D";

function Fixture({ onDocument, onOperations, entityId = "player-visual", music = false }: {
  onDocument: (document: GameDocument3D) => void;
  onOperations?: (ops: GameDocumentOp3D[], label?: string) => void;
  entityId?: string | null;
  music?: boolean;
}) {
  const [document, setDocument] = useState(() => {
    const initial = createNative3DGame("inspector");
    const visual = initial.scenes[0].entities.find((entity) => entity.id === "player-visual");
    if (!visual?.primitive) { throw new Error("Visual primitive missing"); }
    visual.primitive.material.emissive = "#112233";
    initial.scenes[0].environment.fog = { color: "#112233", near: 1, far: 20 };
    if (music) {
      initial.assets.music = { mediaKind: "audio", required: true, assetId: "music-source", digest: "0".repeat(64) };
      initial.scenes[0].music = { assetId: "music", volume: 1, fadeInTicks: 0, fadeOutTicks: 0 };
    }
    return initial;
  });
  const apply = (ops: GameDocumentOp3D[], label?: string): void => {
    onOperations?.(ops, label);
    const next = applyGameOps3D(document, ops);
    setDocument(next);
    onDocument(next);
  };
  return <ThemeProvider theme={mockTheme}><GameInspector3D document={document}
    sceneId={document.entrySceneId} entityId={entityId ?? undefined} onOps={apply} onOperationError={(message) => { throw new Error(message); }} onScript={() => undefined} /></ThemeProvider>;
}

function CommandFixture({ entityId, nearLimit = false }: { entityId: string; nearLimit?: boolean }) {
  const [store] = useState(() => {
    const document = createNative3DGame(`inspector-command-${entityId}${nearLimit ? "-limit" : ""}`);
    if (nearLimit) {
      const authoring = gameAuthoring.parse({ version: 1, baseline: structuredClone(document),
        program: { source: "return inputs.document", inputs: { padding: "x".repeat(7_999_000) }, seed: 1 },
        parameters: { padding: { type: "string", default: "" } } });
      const padding = authoring.parameters.padding;
      if (padding.type !== "string") { throw new Error("String parameter missing"); }
      padding.default = "x".repeat(16_000_000 - JSON.stringify(authoring).length - 20);
      document.authoring = gameAuthoring.parse(authoring);
    }
    const owned = getGameDraftStore(document.id);
    owned.getState().load(document, "first");
    return owned;
  });
  const document = useStore(store, (state) => state.document);
  if (!document || document.schemaVersion !== 3) { throw new Error("Expected 3D inspector document"); }
  return <ThemeProvider theme={mockTheme}>
    <GameInspector3D document={document} sceneId={document.entrySceneId} entityId={entityId}
      onOps={(ops, label) => store.getState().apply(ops, label === undefined ? undefined : { label })}
      onOperationError={(message) => store.getState().reportOperationError(message)} onScript={() => undefined} />
    <button onClick={() => store.getState().undo()}>Undo command</button>
    <button onClick={() => store.getState().redo()}>Redo command</button>
  </ThemeProvider>;
}

it.each([{ entityId: "player", field: "position x", value: "4", label: "Move Player" },
  { entityId: "sun", field: "Intensity", value: "3", label: "Change Light Intensity" }])(
  "labels and reverses an ordinary $label inspector command", async ({ entityId, field, value, label }) => {
    const user = userEvent.setup();
    render(<CommandFixture entityId={entityId} />);
    const store = getGameDraftStore(`inspector-command-${entityId}`);
    const before = structuredClone(store.getState().document);
    const input = screen.getByRole("textbox", { name: field });
    await user.clear(input);
    await user.type(input, value);
    await user.tab();
    expect(store.getState().error).toBeNull();
    expect(store.getState().commandHistory.past).toHaveLength(1);
    expect(store.getState().commandHistory.past[0].label).toBe(label);
    const after = structuredClone(store.getState().document);
    expect(after).not.toEqual(before);
    expect(store.getState().pendingOps.every((op) => op.op !== "set_document")).toBe(true);
    if (!before) { throw new Error("Initial document missing"); }
    expect(applyAnyGameOps(before, store.getState().pendingOps)).toEqual(after);
    await user.click(screen.getByRole("button", { name: "Undo command" }));
    expect(store.getState().document).toEqual(before);
    await user.click(screen.getByRole("button", { name: "Redo command" }));
    expect(store.getState().document).toEqual(after);
  });

it("reports invalid active-camera removal without changing commands or the save queue", async () => {
  const user = userEvent.setup();
  render(<CommandFixture entityId="camera" />);
  const store = getGameDraftStore("inspector-command-camera");
  act(() => store.getState().apply([{ op: "update_entity", entity_id: "player", set: { name: "Earlier Edit" } }], { label: "Rename Player" }));
  const before = structuredClone({ document: store.getState().document, pendingOps: store.getState().pendingOps,
    commandHistory: store.getState().commandHistory, saveStatus: store.getState().saveStatus });
  expect(before.commandHistory.past.length).toBeGreaterThan(0);
  expect(before.pendingOps.length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Remove Camera 3D" }));
  expect(store.getState().error).toMatch(/camera/i);
  expect({ document: store.getState().document, pendingOps: store.getState().pendingOps,
    commandHistory: store.getState().commandHistory, saveStatus: store.getState().saveStatus }).toEqual(before);
});

it("reports a retained-authoring size rejection without changing commands or the save queue", async () => {
  const user = userEvent.setup();
  render(<CommandFixture entityId="player" nearLimit />);
  const store = getGameDraftStore("inspector-command-player-limit");
  const before = structuredClone({ document: store.getState().document, pendingOps: store.getState().pendingOps,
    commandHistory: store.getState().commandHistory, saveStatus: store.getState().saveStatus });
  expect(before.document?.authoring).toBeDefined();
  expect(validateGame3D(before.document).valid).toBe(true);
  expect(JSON.stringify(before.document?.authoring).length).toBeLessThan(16_000_000);
  await user.type(screen.getByRole("textbox", { name: "Name" }), "X");
  expect(store.getState().error).toMatch(/serialized size limit/i);
  expect({ document: store.getState().document, pendingOps: store.getState().pendingOps,
    commandHistory: store.getState().commandHistory, saveStatus: store.getState().saveStatus }).toEqual(before);
});

const visual = (document: GameDocument3D) => document.scenes[0].entities.find((entity) => entity.id === "player-visual");

describe("granular 3D inspector producers", () => {
  it("submits entity component removals as granular operations", async () => {
    const user = userEvent.setup();
    const operations = jest.fn();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} onOperations={operations} />);
    await user.click(screen.getByRole("button", { name: "Remove Emissive" }));
    const ops: GameDocumentOp3D[] = operations.mock.lastCall?.[0];
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((op) => op.op !== "set_document")).toBe(true);
    expect(visual(changed.mock.lastCall?.[0])?.primitive?.material.emissive).toBeUndefined();
  });
  it("submits scene music removal as granular operations", async () => {
    const user = userEvent.setup();
    const operations = jest.fn();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} onOperations={operations} entityId={null} music />);
    await user.click(screen.getByRole("button", { name: "Remove Music" }));
    const ops: GameDocumentOp3D[] = operations.mock.lastCall?.[0];
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((op) => op.op !== "set_document")).toBe(true);
    expect(changed.mock.lastCall?.[0].scenes[0].music).toBeUndefined();
  });
});

describe("3D inspector removal", () => {
  it("removes a complete optional component through real document operations", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} />);
    expect(screen.getByRole("button", { name: "Primitive" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Primitive" }));
    expect(visual(changed.mock.lastCall?.[0])?.primitive).toBeUndefined();
    expect(screen.getByRole("button", { name: "Add Primitive" })).toBeVisible();
  });

  it("removes a nested optional value without preserving the old merged value", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} />);
    expect(screen.getByRole("button", { name: "Primitive" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Material" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Emissive" }));
    expect(visual(changed.mock.lastCall?.[0])?.primitive?.material.emissive).toBeUndefined();
    expect(visual(changed.mock.lastCall?.[0])?.primitive?.material.color).toBe("#47dfb5");
  });

  it("removes top-level optional scene music", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} entityId={null} music />);
    expect(screen.getByRole("button", { name: "Music" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Music" }));
    expect(changed.mock.lastCall?.[0].scenes[0].music).toBeUndefined();
    expect(changed.mock.lastCall?.[0].assets.music.mediaKind).toBe("audio");
  });

  it("removes nested optional scene settings", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} entityId={null} />);
    expect(screen.getByRole("button", { name: "Environment" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Fog" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Fog" }));
    expect(changed.mock.lastCall?.[0].scenes[0].environment.fog).toBeUndefined();
  });
});
