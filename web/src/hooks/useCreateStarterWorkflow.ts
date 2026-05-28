import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Connection } from "@xyflow/react";
import { useWorkflowManagerStore } from "../contexts/WorkflowManagerContext";
import useMetadataStore from "../stores/MetadataStore";
import {
  WELCOME_TRACKS,
  STRING_NODE_TYPE,
  PREVIEW_NODE_TYPE,
  type WelcomeTrackId
} from "../components/portal/welcomeTracks";

/**
 * Builds a three-node starter graph (String -> model node -> Preview) for a
 * welcome-flow track and opens it in the editor. Node defaults — including
 * the user's default model — are applied through the same NodeStore.createNode
 * path used when dragging a node from the menu, so the resulting graph is a
 * real, runnable workflow rather than a serialized fixture.
 */
export const useCreateStarterWorkflow = () => {
  const store = useWorkflowManagerStore();
  const navigate = useNavigate();

  return useCallback(
    (trackId: WelcomeTrackId) => {
      const track = WELCOME_TRACKS.find((t) => t.id === trackId);
      if (!track) {
        return;
      }

      const manager = store.getState();
      const workflow = { ...manager.newWorkflow(), name: track.workflowName };
      manager.addWorkflow(workflow);
      manager.setCurrentWorkflowId(workflow.id);

      const goToEditor = () => navigate(`/editor/${workflow.id}`);

      const nodeStore = manager.getNodeStore(workflow.id);
      const meta = useMetadataStore.getState();
      const stringMeta = meta.getMetadata(STRING_NODE_TYPE);
      const modelMeta = meta.getMetadata(track.modelType);
      const previewMeta = meta.getMetadata(PREVIEW_NODE_TYPE);

      // The model node comes from an optional node pack. If it (or the core
      // String/Preview nodes) isn't registered in this deployment, open the
      // fresh editor instead of wiring a graph with unknown nodes.
      if (!nodeStore || !stringMeta || !modelMeta || !previewMeta) {
        goToEditor();
        return;
      }

      const ns = nodeStore.getState();
      const stringNode = ns.createNode(
        stringMeta,
        { x: 40, y: 160 },
        { value: track.samplePrompt }
      );
      const modelNode = ns.createNode(modelMeta, { x: 440, y: 120 });
      const previewNode = ns.createNode(previewMeta, { x: 880, y: 160 });

      ns.addNode(stringNode);
      ns.addNode(modelNode);
      ns.addNode(previewNode);

      const promptConnection: Connection = {
        source: stringNode.id,
        sourceHandle: "output",
        target: modelNode.id,
        targetHandle: track.promptInput
      };
      const outputConnection: Connection = {
        source: modelNode.id,
        sourceHandle: track.outputHandle,
        target: previewNode.id,
        targetHandle: "value"
      };
      ns.onConnect(promptConnection);
      ns.onConnect(outputConnection);

      goToEditor();
    },
    [store, navigate]
  );
};
