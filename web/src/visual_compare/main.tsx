/** @jsxImportSource @emotion/react */
import { ReactFlow, type Node, type Edge } from "@xyflow/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextMenuProvider } from "../providers/ContextMenuProvider";
import { WorkflowManagerProvider } from "../contexts/WorkflowManagerContext";
import BaseNode from "../components/node/BaseNode";
import CustomEdge from "../components/node_editor/CustomEdge";
import NodeItem from "../components/node_menu/NodeItem";
import { NodeContext } from "../contexts/NodeContext";
import { createReadOnlyNodeStore } from "../stores/readOnlyNodeStore";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeMetadata, Workflow } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";
import { generateCSS } from "../components/themes/GenerateCSS";
import { colorForType } from "../config/data_types";
import "@xyflow/react/dist/style.css";
import "../styles/base.css";
import "../styles/nodes.css";
import "../styles/properties.css";
import "../styles/special_nodes.css";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useColorScheme } from "@mui/material/styles";
import { useEffect } from "react";
import TranslationProvider from "../contexts/TranslationProvider";
import ThemeNodetool from "../components/themes/ThemeNodetool";
import { ThemeRoot, FlexColumn, Surface, Label, Caption, InspectorFieldRow, SPACING } from "../components/ui_primitives";
import { EditorButton } from "../components/editor_ui/EditorButton";
import { NodeTextField } from "../components/editor_ui/NodeTextField";
import { EditorUiProvider } from "../components/editor_ui/EditorUiContext";
import "../styles/vars.css";
import "../styles/index.css";

const metadata: NodeMetadata = {
  title: "Text", description: "Pass text through a workflow.",
  namespace: "nodetool.text", node_type: "nodetool.text.VisualCompare",
  layout: "default", properties: [{ name: "text", title: "Text", type: { type: "str", optional: false, type_args: [] }, required: false }],
  input_fields: ["text"], outputs: [{ name: "text", type: { type: "str", optional: false, type_args: [] }, stream: false }],
  recommended_models: [], required_settings: [], supports_dynamic_inputs: false,
  supports_dynamic_outputs: false, is_streaming_output: false
};
useMetadataStore.getState().setMetadata({ [metadata.node_type]: metadata });
const workflow: Workflow = {
  id: "visual-compare", name: "Visual comparison", description: "", access: "private",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  graph: { nodes: [], edges: [] }
};
const nodes: Node<NodeData>[] = [false, true].map((selected, index) => ({
  id: index === 0 ? "source" : "target", type: metadata.node_type,
  position: { x: 40 + index * 370, y: 40 + index * 40 }, selected,
  width: 280,
  data: { workflow_id: workflow.id, properties: { text: "Sample text" },
    dynamic_properties: {}, selectable: true }
}));
const edges: Edge[] = [{ id: "connection", source: "source", target: "target",
  sourceHandle: "text", targetHandle: "text", type: "default",
  data: { sourceTypeColor: colorForType("str"), targetTypeColor: colorForType("str") }
}];
const graphStore = createReadOnlyNodeStore(nodes, edges, workflow);
const nodeTypes = { [metadata.node_type]: BaseNode };
const edgeTypes = { default: CustomEdge };
const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
function GraphFixture() {
  const { mode } = useColorScheme();
  return <div data-case="graph" className="node-editor" css={generateCSS} style={{ width: 760, height: 320 }}>
    <NodeContext.Provider value={graphStore}>
      <ContextMenuProvider active={false}><ReactFlow colorMode={mode === "light" ? "light" : "dark"} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }} nodesDraggable={false}
        nodesConnectable={false} elementsSelectable={false} panOnDrag={false}
        zoomOnScroll={false} zoomOnDoubleClick={false} preventScrolling={false}/></ContextMenuProvider>
    </NodeContext.Provider>
  </div>;
}

function Case({ id, children }: { id: string; children: ReactNode }) {
  return <div data-case={id}>{children}</div>;
}
function Fixture() {
  const { setMode, mode } = useColorScheme();
  const scheme = new URLSearchParams(location.search).get("scheme") === "light" ? "light" : "dark";
  useEffect(() => { setMode(scheme); }, [scheme, setMode]);
  return <FlexColumn data-fixture-ready={mode === scheme ? scheme : undefined} gap={SPACING.xl} sx={{ p: SPACING.xl, alignItems: "flex-start" }}>
    <GraphFixture/>
    <Case id="catalog-row"><NodeItem node={metadata} onDragStart={() => {}} onClick={() => {}}/></Case>
    <EditorUiProvider scope="node">
      <Case id="button-default"><EditorButton variant="outlined">Run</EditorButton></Case>
      <Case id="button-primary"><EditorButton variant="contained" color="primary">Run</EditorButton></Case>
      <Case id="button-disabled"><EditorButton variant="outlined" disabled>Run</EditorButton></Case>
      <Case id="text-field"><NodeTextField defaultValue="Sample text" inputProps={{ "aria-label": "Prompt" }}/></Case>
      <Case id="text-field-focus"><NodeTextField defaultValue="Sample text" inputProps={{ "aria-label": "Prompt" }}/></Case>
      <Case id="text-field-disabled"><NodeTextField defaultValue="Sample text" disabled inputProps={{ "aria-label": "Prompt" }}/></Case>
    </EditorUiProvider>
    <Case id="text-label"><Label>Prompt</Label></Case>
    <Case id="text-caption"><Caption>Sample text</Caption></Case>
    <Case id="surface-panel"><Surface bordered padding={SPACING.md}><Label>Text</Label></Surface></Case>
    <EditorUiProvider scope="inspector"><Case id="inspector-field"><InspectorFieldRow label="Prompt" htmlFor="inspector-prompt"><NodeTextField id="inspector-prompt" defaultValue="Sample text"/></InspectorFieldRow></Case></EditorUiProvider>
  </FlexColumn>;
}
const root = document.getElementById("root");
if (!root) { throw new Error("Missing fixture root"); }
createRoot(root).render(<QueryClientProvider client={queryClient}><WorkflowManagerProvider queryClient={queryClient}><TranslationProvider><ThemeRoot theme={ThemeNodetool}><Fixture/></ThemeRoot></TranslationProvider></WorkflowManagerProvider></QueryClientProvider>);
