/**
 * Convert the open workflow into a JavaScript script.
 *
 * The server does the conversion (`workflows.exportScript`) from the editor's
 * current graph, so unsaved edits are included. The sandbox target lands as a
 * new JS script document opened in a tab; the Node.js target downloads as an
 * `.mjs` file.
 */
import { useCallback, useState } from "react";

import { useNodes } from "../contexts/NodeContext";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";
import { trpc, trpcClient, type RouterOutputs } from "../trpc/client";
import { saveBlobAsFile } from "../utils/downloadResponse";

type ExportedScript = RouterOutputs["workflows"]["exportScript"];

interface WorkflowScriptExport {
  /** Create a JS script document from the workflow and open it. */
  convertToJsScript: () => Promise<void>;
  /** Download the workflow as a standalone Node.js script. */
  downloadNodeScript: () => Promise<void>;
  isExporting: boolean;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function useWorkflowScriptExport(): WorkflowScriptExport {
  const getWorkflow = useNodes((state) => state.getWorkflow);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const utils = trpc.useUtils();
  const [isExporting, setIsExporting] = useState(false);

  const exportScript = useCallback(
    async (target: "sandbox" | "node"): Promise<ExportedScript | null> => {
      const workflow = getWorkflow();
      try {
        const script = await trpcClient.workflows.exportScript.mutate({
          id: workflow.id,
          target,
          graph: workflow.graph
        });
        if (script.unsupported.length > 0) {
          const names = script.unsupported
            .map((issue) => issue.node_type.split(".").pop())
            .join(", ");
          addNotification({
            type: "warning",
            content: `The script stops before it runs: these nodes have no script equivalent: ${names}. The script names each one and why.`,
            alert: true
          });
        }
        return script;
      } catch (error) {
        addNotification({
          type: "error",
          content: `Could not convert the workflow to a script: ${errorMessage(error)}`,
          alert: true
        });
        return null;
      }
    },
    [addNotification, getWorkflow]
  );

  const convertToJsScript = useCallback(async () => {
    setIsExporting(true);
    try {
      const script = await exportScript("sandbox");
      if (!script) {
        return;
      }
      const workflow = getWorkflow();
      const name = `${workflow.name || "Workflow"} (script)`;
      const created = await trpcClient.jsScripts.create.mutate({
        name,
        projectId: creationProjectId(),
        document: {
          schemaVersion: 1,
          description: `Converted from the workflow "${workflow.name}".`,
          code: script.code,
          inputs: script.inputs,
          outputs: script.outputs,
          secrets: [],
          timeoutSeconds: 120,
          tests: []
        }
      });
      void utils.jsScripts.list.invalidate();
      openTab({
        type: "jsscript",
        ref: created.id,
        mode: "edit",
        title: created.name,
        projectId: created.projectId
      });
    } catch (error) {
      addNotification({
        type: "error",
        content: `Could not create the JS script: ${errorMessage(error)}`,
        alert: true
      });
    } finally {
      setIsExporting(false);
    }
  }, [addNotification, exportScript, getWorkflow, openTab, utils]);

  const downloadNodeScript = useCallback(async () => {
    setIsExporting(true);
    try {
      const script = await exportScript("node");
      if (script) {
        saveBlobAsFile(
          new Blob([script.code], { type: "text/javascript" }),
          script.filename
        );
      }
    } finally {
      setIsExporting(false);
    }
  }, [exportScript]);

  return { convertToJsScript, downloadNodeScript, isExporting };
}
