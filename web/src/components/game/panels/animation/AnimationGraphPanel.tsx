import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  applyNodeChanges, Background, BackgroundVariant, ReactFlow, type Connection, type Edge, type NodeChange, type NodeTypes
} from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import type { GameAnimationGraph3D, GameDocument3D, GameEntity3D, GameInspection3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, validateGame3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import GamePanelHeader from "../../GamePanelHeader";
import {
  Box, Caption, Divider, EditorButton, EmptyState, FlexColumn, FlexRow, InspectorSelect, Label, ScrollArea, SPACING, ToolbarIconButton
} from "../../../ui_primitives";
import { useIsDarkMode } from "../../../../hooks/useIsDarkMode";
import AnimationStateNode from "./AnimationStateNode";
import { AnimationParameterList, AnimationStateInspector, AnimationTransitionInspector, type AnimationGraphCommit } from "./AnimationGraphInspector";
import {
  addAnimationLayer, addAnimationState, ANY_ANIMATION_STATE, connectAnimationStates, createAnimationGraph, removeAnimationLayer,
  removeAnimationState, removeAnimationTransition, renameAnimationState, setAnimationLayerBlend, setAnimationState, setAnimationTransition,
  setInitialAnimationState, uniqueAnimationName
} from "./animationGraphEdits";
import {
  ANIMATION_STATE_NODE_TYPE, animationGraphClipAliases, animationGraphDiagnostics, animationGraphEdges, animationGraphLiveState,
  animationGraphNodes, transitionIndexOfEdge, type AnimationGraphPosition, type AnimationGraphSelection, type AnimationStateFlowNode
} from "./animationGraphFlow";

const NODE_TYPES: NodeTypes = { [ANIMATION_STATE_NODE_TYPE]: AnimationStateNode };
const SIDE_COLUMN_WIDTH = 260;
const FIT_VIEW_OPTIONS = { padding: 0.2 };
const NO_POSITIONS: Readonly<Record<string, AnimationGraphPosition>> = {};

interface AnimationGraphPanelProps {
  readonly document: GameDocument3D;
  readonly sceneId: string;
  readonly selectedEntityId?: string;
  /** The play session's latest inspection. The session publishes it a few times a second, not every tick. */
  readonly inspection: Pick<GameInspection3D, "tick" | "entities"> | null;
  readonly onOps: (ops: GameDocumentOp3D[], label: string) => void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function animatorEntities(document: GameDocument3D): GameEntity3D[] {
  return [...document.scenes.flatMap((scene) => scene.entities), ...Object.values(document.prefabs).flatMap((prefab) => prefab.entities)]
    .filter((entity) => entity.animator3d);
}

/** Clip aliases offered for a graph: those every animator using it maps, else those of any animator, plus the graph's own. */
function clipOptions(document: GameDocument3D, graphId: string, graph: GameAnimationGraph3D | undefined): string[] {
  const animators = animatorEntities(document).map((entity) => entity.animator3d).filter((animator) => animator !== undefined);
  const users = animators.filter((animator) => animator.graph === graphId);
  const shared = users.length > 0
    ? Object.keys(users[0].clips).filter((clip) => users.every((animator) => Object.hasOwn(animator.clips, clip)))
    : animators.flatMap((animator) => Object.keys(animator.clips));
  return [...new Set([...shared, ...animationGraphClipAliases(graph)])];
}

/** Bottom-dock editor for document animation graphs: states and transitions on a canvas, parameters, an inspector, and the live state while a session plays. */
export default function AnimationGraphPanel({ document, sceneId, selectedEntityId, inspection, onOps }: AnimationGraphPanelProps) {
  const theme = useTheme();
  const dark = useIsDarkMode();
  const graphs = useMemo(() => document.animationGraphs ?? {}, [document.animationGraphs]);
  const graphIds = Object.keys(graphs);
  const selectedEntity = document.scenes.find((scene) => scene.id === sceneId)?.entities.find((entity) => entity.id === selectedEntityId);
  const entityGraph = selectedEntity?.animator3d?.graph;
  const [chosen, setChosen] = useState<{ readonly graphId: string; readonly entityId?: string } | null>(null);
  const chosenValid = chosen !== null && Object.hasOwn(graphs, chosen.graphId);
  const graphId = chosenValid && chosen.entityId === selectedEntityId ? chosen.graphId
    : entityGraph && Object.hasOwn(graphs, entityGraph) ? entityGraph : chosenValid ? chosen.graphId : graphIds[0];
  const graph = graphId === undefined ? undefined : graphs[graphId];
  const [layerChoice, setLayerChoice] = useState(0);
  const layerIndex = graph && layerChoice < graph.layers.length ? layerChoice : 0;
  const layer = graph?.layers[layerIndex];
  const [selection, setSelection] = useState<AnimationGraphSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Readonly<Record<string, Readonly<Record<string, AnimationGraphPosition>>>>>({});
  const positionKey = graphId && layer ? `${graphId}/${layer.id}` : "";
  const layerPositions = positions[positionKey] ?? NO_POSITIONS;

  const live = graphId === undefined ? null : animationGraphLiveState(inspection, graphId, selectedEntityId);
  const liveLayerState = live?.layers[layerIndex];
  const liveCurrent = liveLayerState?.state;
  const livePrevious = liveLayerState?.previousState;
  const liveBlending = liveLayerState?.blending ?? false;
  // Inspections arrive several times a second. The canvas re-derives only when the highlighted states change.
  const liveLayer = useMemo(() => liveCurrent === undefined ? null : { state: liveCurrent, previousState: livePrevious, blending: liveBlending },
    [liveCurrent, livePrevious, liveBlending]);
  const liveEntityName = live ? animatorEntities(document).find((entity) => entity.id === live.entityId)?.name || live.entityId : null;

  const diagnostics = useMemo(() => graphId === undefined ? [] : animationGraphDiagnostics(validateGame3D(document).diagnostics, graphId), [document, graphId]);
  const clips = useMemo(() => graphId === undefined ? [] : clipOptions(document, graphId, graph), [document, graphId, graph]);

  const apply = useCallback((ops: GameDocumentOp3D[], label: string): boolean => {
    try {
      applyGameOps3D(document, ops);
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
    setError(null);
    onOps(ops, label);
    return true;
  }, [document, onOps]);

  const commit = useCallback<AnimationGraphCommit>((edit, label) => {
    if (!graph || graphId === undefined) { return; }
    let next: GameAnimationGraph3D;
    try { next = edit(graph); } catch (cause) { setError(errorMessage(cause)); return; }
    if (next !== graph) { apply([{ op: "set_animation_graph", graph_id: graphId, graph: next }], label); }
  }, [apply, graph, graphId]);

  const derivedNodes = useMemo(() => layer ? animationGraphNodes(layer, layerPositions, liveLayer, selection, true) : [],
    [layer, layerPositions, liveLayer, selection]);
  const edges = useMemo(() => layer ? animationGraphEdges(layer, liveLayer, selection,
    Object.fromEntries(derivedNodes.map((node) => [node.id, node.position]))) : [], [layer, liveLayer, selection, derivedNodes]);
  // ReactFlow measures nodes through change events, so the canvas keeps its own copy and carries measurements across re-derivations.
  const [nodes, setNodes] = useState<AnimationStateFlowNode[]>(derivedNodes);
  useEffect(() => {
    setNodes((previous) => {
      const measured = new Map(previous.map((node) => [node.id, node.measured]));
      return derivedNodes.map((node) => measured.get(node.id) ? { ...node, measured: measured.get(node.id) } : node);
    });
  }, [derivedNodes]);
  const onNodesChange = useCallback((changes: NodeChange<AnimationStateFlowNode>[]): void => {
    const kept = changes.filter((change) => change.type === "dimensions" || change.type === "position");
    if (kept.length === 0) { return; }
    setNodes((current) => applyNodeChanges(kept, current));
    const dropped = kept.flatMap((change) => change.type === "position" && change.dragging === false && change.position ? [change] : []);
    if (dropped.length > 0 && positionKey) {
      setPositions((current) => ({ ...current, [positionKey]: { ...current[positionKey],
        ...Object.fromEntries(dropped.map((change) => [change.id, change.position as AnimationGraphPosition])) } }));
    }
  }, [positionKey]);

  const selectGraph = (id: string): void => {
    setChosen({ graphId: id, entityId: selectedEntityId });
    setLayerChoice(0);
    setSelection(null);
    setError(null);
  };
  const newGraph = (): void => {
    const id = uniqueAnimationName(graphIds, "locomotion");
    const clip = Object.keys(selectedEntity?.animator3d?.clips ?? {})[0] ?? "idle";
    if (apply([{ op: "set_animation_graph", graph_id: id, graph: createAnimationGraph(clip) }], "Add Animation Graph")) { selectGraph(id); }
  };
  const removeGraph = (): void => {
    if (graphId !== undefined && apply([{ op: "remove_animation_graph", graph_id: graphId }], "Remove Animation Graph")) {
      setChosen(null);
      setSelection(null);
    }
  };
  const assignToEntity = (): void => {
    if (!selectedEntity || graphId === undefined) { return; }
    apply([{ op: "update_entity", scene_id: sceneId, entity_id: selectedEntity.id, set: { animator3d: { graph: graphId } } }], "Use Animation Graph");
  };
  const addState = (): void => {
    if (!layer) { return; }
    const stateId = uniqueAnimationName(Object.keys(layer.states), "state");
    const initial = layer.states[layer.initialState];
    const clip = initial?.motion.kind === "clip" ? initial.motion.clip : clips[0] ?? "idle";
    commit((current) => addAnimationState(current, layerIndex, stateId, { motion: { kind: "clip", clip }, speed: 1, loop: true }), "Add Animation State");
    setSelection({ kind: "state", stateId });
  };
  const removeSelection = (): void => {
    if (selection?.kind === "state" && selection.stateId !== ANY_ANIMATION_STATE) {
      commit((current) => removeAnimationState(current, layerIndex, selection.stateId), "Remove Animation State");
    } else if (selection?.kind === "transition") {
      commit((current) => removeAnimationTransition(current, layerIndex, selection.index), "Remove Animation Transition");
    }
    setSelection(null);
  };
  const onConnect = (connection: Connection): void => {
    if (!layer || connection.target === ANY_ANIMATION_STATE) { return; }
    const index = layer.transitions.length;
    commit((current) => connectAnimationStates(current, layerIndex, connection.source, connection.target), "Add Animation Transition");
    setSelection({ kind: "transition", index });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if ((event.key === "Delete" || event.key === "Backspace") && !target.closest("input, textarea, [contenteditable='true']") && selection) {
      event.preventDefault();
      removeSelection();
    }
  };

  const selectedState = selection?.kind === "state" && layer && Object.hasOwn(layer.states, selection.stateId) ? selection.stateId : null;
  const selectedTransition = selection?.kind === "transition" ? layer?.transitions[selection.index] : undefined;
  const canAssignToEntity = Boolean(selectedEntity?.animator3d && graphId !== undefined && entityGraph !== graphId);

  if (!graph || graphId === undefined || !layer) {
    return <FlexColumn sx={{ height: "100%", minHeight: 0 }} align="center" justify="center">
      <EmptyState size="small" title="No animation graphs" description="A graph plays an animator's clips as states, switched by transitions that scripts drive with parameters."
        actionText="New graph" onAction={newGraph} />
      {error && <Caption color="error" role="alert">{error}</Caption>}
    </FlexColumn>;
  }

  let inspector = <FlexColumn gap={SPACING.xs}>
    <Label sx={{ mb: 0 }}>Layer {layer.id}</Label>
    {layerIndex === 0
      ? <Caption color="secondary">The base layer overrides the pose at full weight. Select a state or transition to edit it, or drag from a state&apos;s right edge to another state to add a transition.</Caption>
      : <>
        <InspectorSelect grow label="Layer mode" value={layer.mode} options={[{ value: "override", label: "Override" }, { value: "additive", label: "Additive" }]}
          onChange={(mode) => commit((current) => setAnimationLayerBlend(current, layerIndex, { mode: mode as "override" | "additive" }), "Change Animation Layer")} />
        <EditorButton variant="outlined" color="error" onClick={() => {
          commit((current) => removeAnimationLayer(current, layerIndex), "Remove Animation Layer");
          setLayerChoice(0);
        }}>Remove layer</EditorButton>
      </>}
  </FlexColumn>;
  if (selectedState) {
    inspector = <AnimationStateInspector key={`${positionKey}/${selectedState}`} graph={graph} stateId={selectedState} node={layer.states[selectedState]}
      initial={layer.initialState === selectedState} clips={clips} onError={setError}
      onRename={(name) => {
        commit((current) => renameAnimationState(current, layerIndex, selectedState, name), "Rename Animation State");
        const to = name.trim();
        if (to && to !== selectedState) {
          setSelection({ kind: "state", stateId: to });
          setPositions((current) => {
            const { [selectedState]: moved, ...rest } = current[positionKey] ?? {};
            return moved ? { ...current, [positionKey]: { ...rest, [to]: moved } } : current;
          });
        }
      }}
      onChange={(node, label) => commit((current) => setAnimationState(current, layerIndex, selectedState, node), label)}
      onMakeInitial={() => commit((current) => setInitialAnimationState(current, layerIndex, selectedState), "Set Initial Animation State")}
      onRemove={removeSelection} />;
  } else if (selectedTransition && selection?.kind === "transition") {
    const index = selection.index;
    inspector = <AnimationTransitionInspector key={`${positionKey}/transition-${index}`} graph={graph} stateIds={Object.keys(layer.states)}
      transition={selectedTransition} onRemove={removeSelection}
      onChange={(transition, label) => commit((current) => setAnimationTransition(current, layerIndex, index, transition), label)} />;
  }

  return <FlexColumn sx={{ height: "100%", minHeight: 0 }}>
    <GamePanelHeader title="Animation graph" fill>
      <Box sx={{ width: SIDE_COLUMN_WIDTH, minWidth: 0 }}>
        <InspectorSelect grow label="Animation graph" value={graphId} options={graphIds.map((id) => ({ value: id, label: id }))} onChange={selectGraph} />
      </Box>
      <ToolbarIconButton icon={<AddIcon />} tooltip="New graph" ariaLabel="New animation graph" onClick={newGraph} />
      <ToolbarIconButton icon={<DeleteOutlineIcon />} tooltip="Remove graph" ariaLabel="Remove animation graph" onClick={removeGraph} />
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      {graph.layers.length > 1 && <Box sx={{ minWidth: 0 }}>
        <InspectorSelect label="Animation layer" value={String(layerIndex)} options={graph.layers.map((entry, index) => ({ value: String(index), label: entry.id }))}
          onChange={(value) => { setLayerChoice(Number(value)); setSelection(null); }} />
      </Box>}
      <ToolbarIconButton icon={<LayersOutlinedIcon />} tooltip="Add layer" ariaLabel="Add animation layer"
        onClick={() => { commit(addAnimationLayer, "Add Animation Layer"); setLayerChoice(graph.layers.length); setSelection(null); }} />
      <EditorButton startIcon={<AddIcon />} onClick={addState}>State</EditorButton>
      {canAssignToEntity && <EditorButton onClick={assignToEntity}>Use on {selectedEntity?.name || selectedEntity?.id}</EditorButton>}
      <Caption role="status" color={live ? "success" : "secondary"} sx={{ marginLeft: "auto", whiteSpace: "nowrap", pr: SPACING.xs }}>
        {live ? `Live: ${liveEntityName} · ${liveCurrent ?? "none"}${livePrevious ? ` from ${livePrevious}` : ""}` : "Play to see the live state"}
      </Caption>
    </GamePanelHeader>
    {error && <Caption color="error" role="alert" sx={{ px: SPACING.md, py: SPACING.xs }}>{error}</Caption>}
    <FlexRow sx={{ flex: 1, minHeight: 0 }}>
      <ScrollArea role="region" aria-label="Animation parameters" sx={{ width: SIDE_COLUMN_WIDTH, flexShrink: 0, borderRight: 1, borderColor: "divider", p: SPACING.sm }}>
        <Label sx={{ mb: SPACING.xs }}>Parameters</Label>
        <AnimationParameterList graph={graph} live={live?.parameters ?? null} commit={commit} />
      </ScrollArea>
      {/* Delete and Backspace remove the selected state or transition while focus is on the canvas. */}
      <Box role="group" onKeyDown={onKeyDown} aria-label="Animation state graph" sx={{ flex: 1, minWidth: 0, position: "relative",
        "& .animation-transition-live .react-flow__edge-path": { stroke: theme.vars.palette.success.main } }}>
        <ReactFlow<AnimationStateFlowNode, Edge> key={positionKey} nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange} onConnect={onConnect}
          isValidConnection={(connection) => connection.target !== ANY_ANIMATION_STATE && connection.source !== connection.target}
          onNodeClick={(_event, node) => setSelection(node.id === ANY_ANIMATION_STATE ? null : { kind: "state", stateId: node.id })}
          onEdgeClick={(_event, edge) => { const index = transitionIndexOfEdge(edge); setSelection(index === null ? null : { kind: "transition", index }); }}
          onPaneClick={() => setSelection(null)}
          fitView fitViewOptions={FIT_VIEW_OPTIONS} minZoom={0.2} maxZoom={1.5} deleteKeyCode={null} zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }} colorMode={dark ? "dark" : "light"}>
          <Background gap={25} offset={1} size={3} color={theme.vars.palette.c_editor_grid_color} lineWidth={1}
            style={{ backgroundColor: theme.vars.palette.c_editor_bg_color }} variant={BackgroundVariant.Cross} />
        </ReactFlow>
      </Box>
      <ScrollArea role="region" aria-label="Animation inspector" sx={{ width: SIDE_COLUMN_WIDTH, flexShrink: 0, borderLeft: 1, borderColor: "divider", p: SPACING.sm }}>
        <FlexColumn gap={SPACING.sm}>
          {inspector}
          {diagnostics.length > 0 && <FlexColumn gap={SPACING.micro} role="list" aria-label="Graph problems">
            {diagnostics.map((message) => <Caption key={message} role="listitem" color="error">{message}</Caption>)}
          </FlexColumn>}
        </FlexColumn>
      </ScrollArea>
    </FlexRow>
  </FlexColumn>;
}
