import type { ComponentType, MouseEvent, ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { GameAnimationGraph3D, GameDocument3D, GameEntityState3D, GameInspection3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, createNative3DGame, validateGame3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../../__mocks__/themeMock";
import AnimationGraphPanel from "../AnimationGraphPanel";

interface MockFlowNode { id: string; type: string; data: Record<string, unknown>; selected?: boolean }
interface MockFlowEdge { id: string; label?: ReactNode; animated?: boolean }
interface MockFlowProps {
  nodes: MockFlowNode[]; edges: MockFlowEdge[]; nodeTypes: Record<string, ComponentType<Record<string, unknown>>>;
  onNodeClick: (event: MouseEvent, node: MockFlowNode) => void; onEdgeClick: (event: MouseEvent, edge: MockFlowEdge) => void;
  onNodesChange: (changes: { type: "select"; id: string; selected: boolean }[]) => void;
  onEdgesChange: (changes: { type: "select"; id: string; selected: boolean }[]) => void;
  onConnect: (connection: { source: string; target: string; sourceHandle: null; targetHandle: null }) => void;
}

// The shared @xyflow/react mock renders nothing. This one draws nodes through their node types so the highlight is visible.
jest.mock("@xyflow/react", () => ({
  // Like ReactFlow, Enter on a focused node or edge reports a select change rather than a click.
  ReactFlow: ({ nodes, edges, nodeTypes, onNodeClick, onEdgeClick, onConnect, onNodesChange, onEdgesChange }: MockFlowProps) => <div>
    {nodes.map((node) => {
      const NodeView = nodeTypes[node.type];
      return <div key={node.id} role="button" tabIndex={0} aria-label={`Open ${node.id}`} onClick={(event) => onNodeClick(event, node)}
        onKeyDown={(event) => { if (event.key === "Enter") { onNodesChange([{ type: "select", id: node.id, selected: true }]); } }}>
        <NodeView id={node.id} data={node.data} selected={Boolean(node.selected)} />
      </div>;
    })}
    {edges.map((edge) => <button key={edge.id} data-animated={String(Boolean(edge.animated))} onClick={(event) => onEdgeClick(event, edge)}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEdgesChange([{ type: "select", id: edge.id, selected: true }]); } }}>{edge.label}</button>)}
    <button onClick={() => onConnect({ source: "run", target: "idle", sourceHandle: null, targetHandle: null })}>Connect run to idle</button>
  </div>,
  Background: () => null,
  BackgroundVariant: { Cross: "cross" },
  Handle: () => null,
  Position: { Left: "left", Right: "right", Bottom: "bottom" },
  applyNodeChanges: (_changes: unknown[], nodes: unknown[]) => nodes
}));

const clip = (name: string) => ({ motion: { kind: "clip" as const, clip: name }, speed: 1, loop: true });
const graph: GameAnimationGraph3D = {
  parameters: { speed: { kind: "float", default: 0 } },
  layers: [{ id: "base", mode: "override", weight: 1, initialState: "idle", states: { idle: clip("idle"), run: clip("run") },
    transitions: [{ from: "idle", to: "run", conditions: [{ parameter: "speed", op: "gt", value: 0.1 }], durationTicks: 6 }] }]
};

function game(): GameDocument3D {
  const document = createNative3DGame("animation-graph-panel");
  document.assets.hero = { mediaKind: "model", assetId: "hero", digest: "hero-digest", required: true, format: "glb", preparationVersion: "1",
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, nodeIds: ["node:0"], clipIds: ["clip:0", "clip:1"],
    geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
  const visual = document.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual) { throw new Error("Fixture visual missing"); }
  delete visual.primitive;
  visual.model = { assetId: "hero", castShadow: true, receiveShadow: true };
  visual.animator3d = { clips: { idle: "clip:0", run: "clip:1" }, playbackRate: 1, loop: true, transitionTicks: 6, graph: "locomotion" };
  return applyGameOps3D(document, [{ op: "set_animation_graph", graph_id: "locomotion", graph }]);
}

function inspection(tick: number, state: string, previousState?: string): Pick<GameInspection3D, "tick" | "entities"> {
  const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };
  const entity: GameEntityState3D = { id: "player-visual", spawnTick: 0, transform, previousTransform: transform, velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 }, active: true, grounded: true,
    animationGraph: { graphId: "locomotion", parameters: { speed: 0.5 },
      layers: [previousState === undefined ? { state, enteredTick: 100 } : { state, enteredTick: 100, previousState, previousEnteredTick: 10, transitionTicks: 6 }] } };
  return { tick, entities: [entity] };
}

function renderPanel(document: GameDocument3D, live: Pick<GameInspection3D, "tick" | "entities"> | null, onOps = jest.fn()) {
  const view = render(<ThemeProvider theme={mockTheme}>
    <AnimationGraphPanel document={document} diagnostics={validateGame3D(document).diagnostics} sceneId={document.entrySceneId}
      selectedEntityId="player-visual" inspection={live} onOps={onOps} />
  </ThemeProvider>);
  const rerender = (next: GameDocument3D, nextLive: Pick<GameInspection3D, "tick" | "entities"> | null): void => view.rerender(<ThemeProvider theme={mockTheme}>
    <AnimationGraphPanel document={next} diagnostics={validateGame3D(next).diagnostics} sceneId={next.entrySceneId}
      selectedEntityId="player-visual" inspection={nextLive} onOps={onOps} />
  </ThemeProvider>);
  return { onOps, rerender };
}

function lastGraph(onOps: jest.Mock): GameAnimationGraph3D {
  const ops = onOps.mock.calls.at(-1)?.[0] as GameDocumentOp3D[];
  const op = ops[0];
  if (op.op !== "set_animation_graph") { throw new Error(`Unexpected ${op.op}`); }
  return op.graph as GameAnimationGraph3D;
}

describe("AnimationGraphPanel", () => {
  it("highlights the live state and the transition blending into it, and clears it when play stops", () => {
    const document = game();
    const { rerender } = renderPanel(document, inspection(103, "run", "idle"));
    expect(screen.getByTestId("animation-state-run")).toHaveAttribute("data-live", "current");
    expect(screen.getByTestId("animation-state-idle")).toHaveAttribute("data-live", "previous");
    expect(screen.getByRole("button", { name: "speed > 0.1" })).toHaveAttribute("data-animated", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Live: player-visual · run from idle");
    expect(screen.getByText("speed = 0.5")).toBeInTheDocument();
    rerender(document, inspection(200, "run", "idle"));
    expect(screen.getByTestId("animation-state-idle")).not.toHaveAttribute("data-live");
    expect(screen.getByRole("button", { name: "speed > 0.1" })).toHaveAttribute("data-animated", "false");
    rerender(document, null);
    expect(screen.getByTestId("animation-state-run")).not.toHaveAttribute("data-live");
    expect(screen.getByRole("status")).toHaveTextContent("Play to see the live state");
  });

  it("adds a state and a transition through set_animation_graph ops", async () => {
    const user = userEvent.setup();
    const document = game();
    const { onOps } = renderPanel(document, null);
    await user.click(screen.getByRole("button", { name: "State" }));
    expect(onOps).toHaveBeenLastCalledWith([expect.objectContaining({ op: "set_animation_graph", graph_id: "locomotion" })], "Add Animation State");
    expect(Object.keys(lastGraph(onOps).layers[0].states)).toEqual(["idle", "run", "state"]);
    await user.click(screen.getByRole("button", { name: "Connect run to idle" }));
    expect(onOps).toHaveBeenLastCalledWith(expect.any(Array), "Add Animation Transition");
    expect(lastGraph(onOps).layers[0].transitions[1]).toEqual({ from: "run", to: "idle", conditions: [{ parameter: "idle", op: "set" }], durationTicks: 6 });
  });

  it("removes the selected state with the Delete key and reports refused edits", async () => {
    const user = userEvent.setup();
    const document = game();
    const { onOps } = renderPanel(document, null);
    await user.click(screen.getByRole("button", { name: "Open run" }));
    expect(screen.getByRole("textbox", { name: "State name" })).toHaveValue("run");
    fireEvent.keyDown(screen.getByRole("group", { name: "Animation state graph" }), { key: "Delete" });
    expect(onOps).toHaveBeenLastCalledWith(expect.any(Array), "Remove Animation State");
    expect(lastGraph(onOps).layers[0].transitions).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Remove parameter speed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Parameter speed is used by transition idle → run");
    expect(onOps).toHaveBeenCalledTimes(1);
  });

  it("edits a transition's conditions in the inspector", async () => {
    const user = userEvent.setup();
    const document = game();
    const { onOps } = renderPanel(document, null);
    await user.click(screen.getByRole("button", { name: "speed > 0.1" }));
    const inspector = screen.getByRole("region", { name: "Animation inspector" });
    const value = within(inspector).getByRole("textbox", { name: "Value" });
    await user.clear(value);
    await user.type(value, "0.25{Enter}");
    expect(onOps).toHaveBeenLastCalledWith(expect.any(Array), "Change Animation Condition");
    expect(lastGraph(onOps).layers[0].transitions[0].conditions).toEqual([{ parameter: "speed", op: "gt", value: 0.25 }]);
  });

  it("offers a new graph when the document has none", async () => {
    const user = userEvent.setup();
    const document = createNative3DGame("animation-graph-empty");
    const { onOps } = renderPanel(document, null);
    await user.click(screen.getByRole("button", { name: "New graph" }));
    expect(onOps).toHaveBeenLastCalledWith([{ op: "set_animation_graph", graph_id: "locomotion", graph: expect.objectContaining({ layers: expect.any(Array) }) }],
      "Add Animation Graph");
  });

  it("keeps the selection and layout when a rename is refused, and notes scripts after a rename", async () => {
    const user = userEvent.setup();
    const { onOps } = renderPanel(game(), null);
    await user.click(screen.getByRole("button", { name: "Open run" }));
    const name = screen.getByRole("textbox", { name: "State name" });
    await user.clear(name);
    await user.type(name, "idle{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("State idle already exists");
    expect(onOps).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Make initial" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "State name" }));
    await user.type(screen.getByRole("textbox", { name: "State name" }), "sprint{Enter}");
    expect(onOps).toHaveBeenLastCalledWith(expect.any(Array), "Rename Animation State");
    expect(screen.getByRole("note")).toHaveTextContent('Scripts that call playAnimation("run") are not updated.');
  });

  it("does not select a state that could not be added", async () => {
    const user = userEvent.setup();
    const document = game();
    const graphWithStates = document.animationGraphs?.locomotion;
    if (!graphWithStates) { throw new Error("Fixture graph missing"); }
    graphWithStates.layers[0].states = Object.fromEntries(Array.from({ length: 64 }, (_value, index) => [index === 0 ? "idle" : index === 1 ? "run" : `s${index}`, clip("idle")]));
    const { onOps } = renderPanel(document, null);
    await user.click(screen.getByRole("button", { name: "State" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A layer holds at most 64 states");
    expect(onOps).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "State name" })).not.toBeInTheDocument();
  });

  it("lets an already invalid graph be repaired one edit at a time but refuses new problems", async () => {
    const user = userEvent.setup();
    const document = game();
    const broken = document.animationGraphs?.locomotion;
    if (!broken) { throw new Error("Fixture graph missing"); }
    broken.layers[0].transitions = [{ from: "idle", to: "run", conditions: [], durationTicks: 6 }, { from: "run", to: "idle", conditions: [], durationTicks: 6 }];
    expect(validateGame3D(document).diagnostics.map((entry) => entry.code)).toEqual(["unconditional_animation_transition", "unconditional_animation_transition"]);
    const { onOps } = renderPanel(document, null);
    expect(screen.getByRole("list", { name: "Graph problems" }).children).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "" })[0]);
    await user.type(within(screen.getByRole("region", { name: "Animation inspector" })).getByRole("textbox", { name: "Exit after ticks" }), "10{Enter}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onOps).toHaveBeenLastCalledWith(expect.any(Array), "Change Animation Transition");
    expect(lastGraph(onOps).layers[0].transitions[0]).toMatchObject({ from: "idle", to: "run", exitTicks: 10 });
    await user.click(screen.getByRole("button", { name: "Open idle" }));
    const speed = screen.getByRole("textbox", { name: "Speed" });
    await user.clear(speed);
    await user.type(speed, "20{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onOps).toHaveBeenCalledTimes(1);
  });

  it("opens states and transitions from the keyboard and adds a transition without dragging", async () => {
    const user = userEvent.setup();
    const { onOps } = renderPanel(game(), null);
    screen.getByRole("button", { name: "Open run" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "State name" })).toHaveValue("run");
    await user.click(screen.getByRole("button", { name: "Transition to idle" }));
    expect(onOps).toHaveBeenLastCalledWith(expect.any(Array), "Add Animation Transition");
    expect(lastGraph(onOps).layers[0].transitions[1]).toMatchObject({ from: "run", to: "idle" });
    screen.getByRole("button", { name: "speed > 0.1" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("combobox", { name: "From state" })).toBeInTheDocument();
    await user.keyboard("{Delete}");
    expect(onOps).toHaveBeenLastCalledWith(expect.any(Array), "Remove Animation Transition");
  });

  it("clears initialClip in the same command when it assigns the graph to an entity", async () => {
    const user = userEvent.setup();
    const document = game();
    const visual = document.scenes[0].entities.find((entity) => entity.id === "player-visual");
    if (!visual?.animator3d) { throw new Error("Fixture animator missing"); }
    delete visual.animator3d.graph;
    visual.animator3d.initialClip = "idle";
    const { onOps } = renderPanel(document, null);
    await user.click(screen.getByRole("button", { name: "Use on player-visual" }));
    const ops = onOps.mock.calls.at(-1)?.[0] as GameDocumentOp3D[];
    expect(onOps.mock.calls.at(-1)?.[1]).toBe("Use Animation Graph");
    const animator = applyGameOps3D(document, ops).scenes[0].entities.find((entity) => entity.id === "player-visual")?.animator3d;
    expect(animator).toEqual({ clips: { idle: "clip:0", run: "clip:1" }, playbackRate: 1, loop: true, transitionTicks: 6, graph: "locomotion" });
  });
});
