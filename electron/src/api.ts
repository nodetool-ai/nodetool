// @ts-expect-error types not available
import WebSocket from "ws";
import { updateTrayMenu } from "./tray";
import { WebSocketUpdate, Workflow } from "./types";
import { globalShortcut } from "electron";
import { createWorkflowWindow } from "./workflow-window";
import { clipboard, nativeImage } from "electron";
import { logMessage } from "./logger";
import { registerWorkflowShortcut } from "./shortcuts";
import { createWorkflowRunner } from "./WorkflowRunner";

export let wsConnection: WebSocket | null = null;
export let isConnected = false;

function getInputNodes(workflow: Workflow, type: string) {
  return workflow.graph.nodes.filter((node) =>
    node.type.startsWith(`nodetool.input.${type}`)
  );
}

function getOutputNodes(workflow: Workflow) {
  return workflow.graph.nodes.filter((node) =>
    node.type.startsWith(`nodetool.output`)
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
      const imageInputNodes = getInputNodes(workflow, "ImageInput");
      logMessage(`Found ${imageInputNodes.length} image input nodes`);
      if (imageInputNodes.length > 0) {
        const inputNode = imageInputNodes[0];
        logMessage(`Using image input node: ${inputNode.data.name}`);
        const dataUri = `data:image/png;base64,${image
          .toPNG()
          .toString("base64")}`;
        params[inputNode.data.name] = {
          type: "image",
          uri: dataUri,
        };
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
    const workflowRunner = createWorkflowRunner();

    // The results will be handled through the WebSocket notifications
    // If we need to write to clipboard, we can access the results from the store
    workflowRunner.setState({
      onComplete: (results: any[]) => {
        logMessage(`Results: ${results}`);

        if (workflow.settings?.write_clipboard) {
          if (results.length > 0) {
            const outputNode = getOutputNodes(workflow)[0];
            if (outputNode) {
              const outputValue = results[results.length - 1];
              if (outputNode.type === "nodetool.output.ImageOutput") {
                const image = nativeImage.createFromBuffer(
                  Buffer.from(outputValue.uri, "base64")
                );
                clipboard.writeImage(image);
              } else {
                clipboard.writeText(outputValue);
              }
            }
          }
        }
      },
    });
    await workflowRunner.getState().connect();
    await workflowRunner.getState().run(workflow.id, params);
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
