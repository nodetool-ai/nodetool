// @ts-expect-error types not available
import WebSocket from "ws";
import { updateTrayMenu } from "./tray";
import { WebSocketUpdate, Workflow } from "./types";
import { globalShortcut } from "electron";
import { createWorkflowWindow } from "./workflow-window";
import { clipboard } from "electron";
import { logMessage } from "./logger";
import { registerWorkflowShortcut } from "./shortcuts";
import { Notification } from "electron";

export let wsConnection: WebSocket | null = null;
export let isConnected = false;

function getInputNodes(workflow: Workflow, type: string) {
  return workflow.graph.nodes.filter((node) =>
    node.type.startsWith(`nodetool.input.${type}`)
  );
}

export async function runWorkflow(workflow: Workflow) {
  logMessage(
    `Starting workflow execution: ${workflow.name} (ID: ${workflow.id})`
  );
  const params: Record<string, any> = {};

  if (workflow.settings?.receive_clipboard) {
    logMessage("Checking clipboard for workflow input...");
    // Check for image in clipboard first
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      logMessage("Found image in clipboard");
      // Look for image input nodes
      const imageInputNodes = getInputNodes(workflow, "ImageInput");
      logMessage(`Found ${imageInputNodes.length} image input nodes`);
      if (imageInputNodes.length > 0) {
        const inputNode = imageInputNodes[0];
        logMessage(`Using image input node: ${inputNode.data.name}`);
        const dataUri = `data:image/png;base64,${image
          .toPNG()
          .toString("base64")}`;
        params[inputNode.data.name] = dataUri;
      }
    } else {
      // Fallback to text
      const clipboardText = clipboard.readText();
      logMessage("Found text in clipboard");
      const stringInputNodes = getInputNodes(workflow, "StringInput");
      logMessage(`Found ${stringInputNodes.length} string input nodes`);
      if (stringInputNodes.length > 0) {
        const inputNode = stringInputNodes[0];
        logMessage(`Using string input node: ${inputNode.data.name}`);
        params[inputNode.data.name] = clipboardText;
      }
    }
  }

  if (workflow.settings?.hide_ui) {
    logMessage(`Running headless workflow: ${workflow.name}`);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/api/workflows/${workflow.id}/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ params }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        logMessage(result);
        logMessage(`Workflow completed successfully: ${workflow.name}`, "info");
        new Notification({
          title: "Workflow Complete",
          body: `Workflow executed successfully: ${result}`,
        });
      } else {
        logMessage(
          `Workflow execution failed: ${response.statusText}`,
          "error"
        );
        new Notification({
          title: "Workflow Error",
          body: `Failed to execute workflow: ${response.statusText}`,
        });
      }
    } catch (error) {
      logMessage(
        `Workflow execution error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    }
  } else {
    logMessage(`Opening workflow window for: ${workflow.name}`);
    createWorkflowWindow(workflow.id);
  }
}

export async function fetchWorkflows(): Promise<Workflow[]> {
  logMessage("Fetching workflows from server...");
  try {
    const response = await fetch("http://127.0.0.1:8000/api/workflows/", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    logMessage(`Successfully fetched ${data.workflows?.length || 0} workflows`);
    return data.workflows || [];
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to fetch workflows: ${error.message}`, "error");
    }
    return [];
  }
}

export async function connectToWebSocketUpdates(): Promise<void> {
  logMessage("Initializing WebSocket connection...");
  if (wsConnection) {
    logMessage("Closing existing WebSocket connection");
    wsConnection.close();
  }

  wsConnection = new WebSocket("ws://127.0.0.1:8000/updates");

  wsConnection.on("open", () => {
    isConnected = true;
    logMessage("WebSocket connection established successfully");
  });

  wsConnection.on("message", (data: WebSocket.Data) => {
    try {
      const update = JSON.parse(data.toString()) as WebSocketUpdate;
      if (update.type === "delete_workflow") {
        logMessage(`Deleting workflow: ${update.workflow?.name}`);
        if (update.workflow?.settings?.shortcut) {
          globalShortcut.unregister(update.workflow.settings.shortcut);
        }
      } else if (update.type === "update_workflow") {
        logMessage(`Updating workflow: ${update.workflow?.name}`);
        registerWorkflowShortcut(update.workflow);
        updateTrayMenu();
      } else if (update.type === "create_workflow") {
        logMessage(`Creating workflow: ${update.workflow?.name}`);
        registerWorkflowShortcut(update.workflow);
        updateTrayMenu();
      }
    } catch (error) {
      if (error instanceof Error) {
        logMessage(`WebSocket message parse error: ${error.message}`, "error");
      }
    }
  });

  wsConnection.on("close", () => {
    isConnected = false;
    logMessage(
      "WebSocket connection closed, attempting to reconnect...",
      "warn"
    );
    setTimeout(connectToWebSocketUpdates, 5000);
  });

  wsConnection.on("error", (error: WebSocket.ErrorEvent) => {
    logMessage(`WebSocket error: ${error.message}`, "error");
    logMessage("Attempting to reconnect...", "warn");
    isConnected = false;
    setTimeout(connectToWebSocketUpdates, 5000);
  });
}
