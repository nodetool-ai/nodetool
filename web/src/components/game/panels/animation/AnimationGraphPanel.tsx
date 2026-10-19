import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Background, BackgroundVariant, ReactFlow, type Connection, type Edge, type EdgeChange, type NodeChange, type NodeTypes
} from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import type { GameAnimationGraph3D, GameDiagnostic, GameDocument3D, GameEntity3D, GameInspection3D } from "@nodetool-ai/protocol";
import type { GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import DockPanelHeader from "../../../dock/DockPanelHeader";
import {
  Box, Caption, Divider, EditorButton, EmptyState, FlexColumn, FlexRow, InspectorSelect, Label, ScrollArea, SPACING, ToolbarIconButton
} from "../../../ui_primitives";
import { useIsDarkMode } from "../../../../hooks/useIsDarkMode";
import AnimationStateNode from "./AnimationStateNode";
import {
  AnimationParameterList, AnimationStateInspector, AnimationTransitionAdder, AnimationTransitionInspector, type AnimationGraphCommit
} from "./AnimationGraphInspector";
import { introducedAnimationGraphProblem } from "./animationGraphPreflight";
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
type Size = { readonly width: number; readonly height: number };

interface AnimationGraphPanelProps {
  readonly document: GameDocument3D;
  /** The editor's validation of `document`, reused so the panel does not validate it again. */
  readonly diagnostics: readonly GameDiagnostic[];
  readonly sceneId: string;
  readonly selectedEntityId?: string;
  /** The play session's latest inspection. The session publishes it a few times a second, not every tick. */
  readonly inspection: Pick<GameInspection3D, "tick" | "entities"> | null;
  readonly onOps: (ops: GameDocumentOp3D[], label: string) => boolean | void;
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
export default function AnimationGraphPanel({ document, diagnostics: documentDiagnostics, sceneId, selectedEntityId, inspection, onOps }: AnimationGraphPanelProps) {
  const { t } = useTranslation();
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
  const [notice, setNotice] = useState<string | null>(null);
  const [positions, setPositions] = useState<Readonly<Record<string, Readonly<Record<string, AnimationGraphPosition>>>>>({});
  const positionKey = graphId && layer ? `${graphId}/${layer.id}` : "";
  const layerPositions = positions[positionKey] ?? NO_POSITIONS;

  const live = graphId === undefined ? null : animationGraphLiveState(inspection, graphId, selectedEntityId);
  const liveLayerState = live?.layers[layerIndex];
  const liveCurrent = liveLayerState?.state;
  const livePrevious = liveLayerState?.previousState;
  const liveTransitionIndex = liveLayerState?.transitionIndex;
  const liveBlending = liveLayerState?.blending ?? false;
  // Inspections arrive several times a second. The canvas re-derives only when the highlighted states change.
  const liveLayer = useMemo(() => liveCurrent === undefined ? null : { state: liveCurrent, previousState: livePrevious, transitionIndex: liveTransitionIndex, blending: liveBlending },
    [liveCurrent, livePrevious, liveTransitionIndex, liveBlending]);
  const liveEntityName = live ? animatorEntities(document).find((entity) => entity.id === live.entityId)?.name || live.entityId : null;

  const diagnostics = useMemo(() => graphId === undefined ? [] : animationGraphDiagnostics(documentDiagnostics, graphId), [documentDiagnostics, graphId]);
  const clips = useMemo(() => graphId === undefined ? [] : clipOptions(document, graphId, graph), [document, graphId, graph]);

  const apply = useCallback((ops: GameDocumentOp3D[], label: string): boolean => {
    const problem = introducedAnimationGraphProblem(document, documentDiagnostics, ops);
    if (problem !== null) {
      setError(problem);
      return false;
    }
    setError(null);
    setNotice(null);
    return onOps(ops, label) !== false;
  }, [document, documentDiagnostics, onOps]);

  const commit = useCallback<AnimationGraphCommit>((edit, label) => {
    if (!graph || graphId === undefined) { return false; }
    let next: GameAnimationGraph3D;
    try { next = edit(graph); } catch (cause) { setError(errorMessage(cause)); return false; }
    return next !== graph && apply([{ op: "set_animation_graph", graph_id: graphId, graph: next }], label);
  }, [apply, graph, graphId]);

  const derivedNodes = useMemo(() => layer ? animationGraphNodes(layer, layerPositions, liveLayer, selection, true) : [],
    [layer, layerPositions, liveLayer, selection]);
  const edges = useMemo(() => layer ? animationGraphEdges(layer, liveLayer, selection,
    Object.fromEntries(derivedNodes.map((node) => [node.id, node.position]))) : [], [layer, liveLayer, selection, derivedNodes]);
  // ReactFlow reports measurements and drag positions as changes. They are kept beside the derived nodes and merged in the same render.
  const [measured, setMeasured] = useState<Readonly<Record<string, Size>>>({});
  const [dragging, setDragging] = useState<Readonly<Record<string, AnimationGraphPosition>>>({});
  const nodes = useMemo(() => derivedNodes.map((node) => {
    const size = measured[node.id];
    const position = dragging[node.id];
    return size || position ? { ...node, measured: size ?? node.measured, position: position ?? node.position } : node;
  }), [derivedNodes, measured, dragging]);
  const onNodesChange = useCallback((changes: NodeChange<AnimationStateFlowNode>[]): void => {
    const sizes: Record<string, Size> = {};
    const moving: Record<string, AnimationGraphPosition> = {};
    const dropped: Record<string, AnimationGraphPosition> = {};
    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) { sizes[change.id] = change.dimensions; }
      else if (change.type === "position" && change.position) { (change.dragging === false ? dropped : moving)[change.id] = change.position; }
      // Enter or Space on a focused node selects it, the same as a click.
      else if (change.type === "select" && change.selected) { setSelection(change.id === ANY_ANIMATION_STATE ? null : { kind: "state", stateId: change.id }); }
    }
    if (Object.keys(sizes).length > 0) { setMeasured((current) => ({ ...current, ...sizes })); }
    if (Object.keys(moving).length > 0) { setDragging((current) => ({ ...current, ...moving })); }
    if (Object.keys(dropped).length > 0 && positionKey) {
      setPositions((current) => ({ ...current, [positionKey]: { ...current[positionKey], ...dropped } }));
      setDragging((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !Object.hasOwn(dropped, id))));
    }
  }, [positionKey]);
  const onEdgesChange = useCallback((changes: EdgeChange[]): void => {
    for (const change of changes) {
      if (change.type === "select" && change.selected) {
        const index = transitionIndexOfEdge(change);
        if (index !== null) { setSelection({ kind: "transition", index }); }
      }
    }
  }, []);

  const selectGraph = (id: string): void => {
    setChosen({ graphId: id, entityId: selectedEntityId });
    setLayerChoice(0);
    setSelection(null);
    setError(null);
  };
  const newGraph = (): void => {
    const id = uniqueAnimationName(graphIds, "locomotion");
    const clip = Object.keys(selectedEntity?.animator3d?.clips ?? {})[0] ?? "idle";
    if (apply([{ op: "set_animation_graph", graph_id: id, graph: createAnimationGraph(clip) }], t("i18n-cont-game-06.animation.edits.addGraph"))) { selectGraph(id); }
  };
  const removeGraph = (): void => {
    if (graphId !== undefined && apply([{ op: "remove_animation_graph", graph_id: graphId }], t("i18n-cont-game-06.animation.edits.removeGraph"))) {
      setChosen(null);
      setSelection(null);
    }
  };
  const assignToEntity = (): void => {
    const animator = selectedEntity?.animator3d;
    if (!selectedEntity || !animator || graphId === undefined) { return; }
    const target = { scene_id: sceneId, entity_id: selectedEntity.id };
    // A graph starts from its own initial states, so initialClip goes. A patch cannot null it, so the animator is replaced in the same command.
    const { initialClip, ...rest } = animator;
    const ops: GameDocumentOp3D[] = initialClip === undefined
      ? [{ op: "update_entity", ...target, set: { animator3d: { graph: graphId } } }]
      : [{ op: "update_entity", ...target, set: { animator3d: null } }, { op: "update_entity", ...target, set: { animator3d: { ...rest, graph: graphId } } }];
    apply(ops, t("i18n-cont-game-06.animation.edits.useGraph"));
  };
  const addState = (): void => {
    if (!layer) { return; }
    const stateId = uniqueAnimationName(Object.keys(layer.states), "state");
    const initial = layer.states[layer.initialState];
    const clip = initial?.motion.kind === "clip" ? initial.motion.clip : clips[0] ?? "idle";
    if (commit((current) => addAnimationState(current, layerIndex, stateId, { motion: { kind: "clip", clip }, speed: 1, loop: true }), t("i18n-cont-game-06.animation.edits.addState"))) {
      setSelection({ kind: "state", stateId });
    }
  };
  const removeSelection = (): void => {
    let removed = false;
    if (selection?.kind === "state" && selection.stateId !== ANY_ANIMATION_STATE) {
      removed = commit((current) => removeAnimationState(current, layerIndex, selection.stateId), t("i18n-cont-game-06.animation.edits.removeState"));
    } else if (selection?.kind === "transition") {
      removed = commit((current) => removeAnimationTransition(current, layerIndex, selection.index), t("i18n-cont-game-06.animation.edits.removeTransition"));
    }
    if (removed) { setSelection(null); }
  };
  const connect = (from: string, to: string): void => {
    if (!layer || to === ANY_ANIMATION_STATE) { return; }
    const index = layer.transitions.length;
    if (commit((current) => connectAnimationStates(current, layerIndex, from, to), t("i18n-cont-game-06.animation.edits.addTransition"))) {
      setSelection({ kind: "transition", index });
    }
  };
  const onConnect = (connection: Connection): void => connect(connection.source, connection.target);
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
      <EmptyState size="small" title={t("i18n-cont-game-06.animation.noGraphs")} description={t("i18n-cont-game-06.animation.noGraphsDescription")}
        actionText={t("i18n-cont-game-06.animation.newGraph")} onAction={newGraph} />
      {error && <Caption color="error" role="alert">{error}</Caption>}
    </FlexColumn>;
  }

  let inspector = <FlexColumn gap={SPACING.xs}>
    <Label sx={{ mb: 0 }}>{t("i18n-cont-game-06.animation.layer", { id: layer.id })}</Label>
    {layerIndex === 0
      ? <Caption color="secondary">{t("i18n-cont-game-06.animation.baseLayerHelp")}</Caption>
      : <>
        <InspectorSelect grow label={t("i18n-cont-game-06.animation.layerMode")} value={layer.mode} options={[{ value: "override", label: t("i18n-cont-game-06.animation.layerModes.override") }, { value: "additive", label: t("i18n-cont-game-06.animation.layerModes.additive") }]}
          onChange={(mode) => commit((current) => setAnimationLayerBlend(current, layerIndex, { mode: mode as "override" | "additive" }), t("i18n-cont-game-06.animation.edits.changeLayer"))} />
        <EditorButton variant="outlined" color="error" onClick={() => {
          if (commit((current) => removeAnimationLayer(current, layerIndex), t("i18n-cont-game-06.animation.edits.removeLayer"))) { setLayerChoice(0); }
        }}>{t("i18n-cont-game-06.animation.removeLayer")}</EditorButton>
      </>}
    <AnimationTransitionAdder label={t("i18n-cont-game-06.animation.anyStateTo")} targets={Object.keys(layer.states)} onAdd={(to) => connect(ANY_ANIMATION_STATE, to)} />
  </FlexColumn>;
  if (selectedState) {
    inspector = <AnimationStateInspector key={`${positionKey}/${selectedState}`} graph={graph} stateId={selectedState} node={layer.states[selectedState]}
      initial={layer.initialState === selectedState} clips={clips} onError={setError}
      transitionTargets={Object.keys(layer.states).filter((id) => id !== selectedState)} onAddTransition={(to) => connect(selectedState, to)}
      onRename={(name) => {
        const to = name.trim();
        if (to === selectedState || !commit((current) => renameAnimationState(current, layerIndex, selectedState, name), t("i18n-cont-game-06.animation.edits.renameState"))) { return; }
        setSelection({ kind: "state", stateId: to });
        setNotice(t("i18n-cont-game-06.animation.stateRenamedNotice", { from: selectedState, to, call: `playAnimation("${selectedState}")` }));
        setPositions((current) => {
          const { [selectedState]: moved, ...rest } = current[positionKey] ?? {};
          return moved ? { ...current, [positionKey]: { ...rest, [to]: moved } } : current;
        });
      }}
      onChange={(node, label) => commit((current) => setAnimationState(current, layerIndex, selectedState, node), label)}
      onMakeInitial={() => commit((current) => setInitialAnimationState(current, layerIndex, selectedState), t("i18n-cont-game-06.animation.edits.setInitialState"))}
      onRemove={removeSelection} />;
  } else if (selectedTransition && selection?.kind === "transition") {
    const index = selection.index;
    inspector = <AnimationTransitionInspector key={`${positionKey}/transition-${index}`} graph={graph} stateIds={Object.keys(layer.states)}
      transition={selectedTransition} onRemove={removeSelection}
      onChange={(transition, label) => commit((current) => setAnimationTransition(current, layerIndex, index, transition), label)} />;
  }

  return <FlexColumn sx={{ height: "100%", minHeight: 0 }}>
    <DockPanelHeader title={t("i18n-cont-game-06.animation.title")} fill>
      <Box sx={{ width: SIDE_COLUMN_WIDTH, minWidth: 0 }}>
        <InspectorSelect grow label={t("i18n-cont-game-06.animation.graphLabel")} value={graphId} options={graphIds.map((id) => ({ value: id, label: id }))} onChange={selectGraph} />
      </Box>
      <ToolbarIconButton icon={<AddIcon />} tooltip={t("i18n-cont-game-06.animation.newGraph")} ariaLabel={t("i18n-cont-game-06.animation.newGraphAria")} onClick={newGraph} />
      <ToolbarIconButton icon={<DeleteOutlineIcon />} tooltip={t("i18n-cont-game-06.animation.removeGraph")} ariaLabel={t("i18n-cont-game-06.animation.removeGraphAria")} onClick={removeGraph} />
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      {graph.layers.length > 1 && <Box sx={{ minWidth: 0 }}>
        <InspectorSelect label={t("i18n-cont-game-06.animation.layerLabel")} value={String(layerIndex)} options={graph.layers.map((entry, index) => ({ value: String(index), label: entry.id }))}
          onChange={(value) => { setLayerChoice(Number(value)); setSelection(null); }} />
      </Box>}
      <ToolbarIconButton icon={<LayersOutlinedIcon />} tooltip={t("i18n-cont-game-06.animation.addLayer")} ariaLabel={t("i18n-cont-game-06.animation.addLayerAria")}
        onClick={() => { if (commit(addAnimationLayer, t("i18n-cont-game-06.animation.edits.addLayer"))) { setLayerChoice(graph.layers.length); setSelection(null); } }} />
      <EditorButton startIcon={<AddIcon />} onClick={addState}>{t("i18n-cont-game-06.animation.state")}</EditorButton>
      {canAssignToEntity && <EditorButton onClick={assignToEntity}>{t("i18n-cont-game-06.animation.useOn", { entity: selectedEntity?.name || selectedEntity?.id })}</EditorButton>}
      <Caption role="status" color={live ? "success" : "secondary"} sx={{ marginLeft: "auto", whiteSpace: "nowrap", pr: SPACING.xs }}>
        {live ? t("i18n-cont-game-06.animation.liveState", { entity: liveEntityName, state: liveCurrent ?? t("i18n-cont-game-06.common.none"), previous: livePrevious ? ` ${t("i18n-cont-game-06.animation.fromPrevious", { state: livePrevious })}` : "" }) : t("i18n-cont-game-06.animation.playToSeeState")}
      </Caption>
    </DockPanelHeader>
    {error && <Caption color="error" role="alert" sx={{ px: SPACING.md, py: SPACING.xs }}>{error}</Caption>}
    {notice && <Caption color="warning" role="note" sx={{ px: SPACING.md, py: SPACING.xs }}>{notice}</Caption>}
    <FlexRow sx={{ flex: 1, minHeight: 0 }}>
      <ScrollArea role="region" aria-label={t("i18n-cont-game-06.animation.parametersRegion")} sx={{ width: SIDE_COLUMN_WIDTH, flexShrink: 0, borderRight: 1, borderColor: "divider", p: SPACING.sm }}>
        <Label sx={{ mb: SPACING.xs }}>{t("i18n-cont-game-06.animation.parameters")}</Label>
        <AnimationParameterList graph={graph} live={live?.parameters ?? null} commit={commit}
          onRenamed={(from, to) => setNotice(t("i18n-cont-game-06.animation.parameterRenamedNotice", { from, to, call: `setAnimParam("${from}", …)` }))} />
      </ScrollArea>
      {/* Delete and Backspace remove the selected state or transition while focus is on the canvas. */}
      <Box role="group" onKeyDown={onKeyDown} aria-label={t("i18n-cont-game-06.animation.stateGraphAria")} sx={{ flex: 1, minWidth: 0, position: "relative",
        "& .animation-transition-live .react-flow__edge-path": { stroke: theme.vars.palette.success.main } }}>
        <ReactFlow<AnimationStateFlowNode, Edge> key={positionKey} nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
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
      <ScrollArea role="region" aria-label={t("i18n-cont-game-06.animation.inspectorRegion")} sx={{ width: SIDE_COLUMN_WIDTH, flexShrink: 0, borderLeft: 1, borderColor: "divider", p: SPACING.sm }}>
        <FlexColumn gap={SPACING.sm}>
          {inspector}
          {diagnostics.length > 0 && <FlexColumn gap={SPACING.micro} role="list" aria-label={t("i18n-cont-game-06.animation.graphProblems")}>
            {diagnostics.map((message) => <Caption key={message} role="listitem" color="error">{message}</Caption>)}
          </FlexColumn>}
        </FlexColumn>
      </ScrollArea>
    </FlexRow>
  </FlexColumn>;
}
