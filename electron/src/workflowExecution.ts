/** Workflow Execution Module */

import { clipboard, nativeImage } from "electron";
import { Workflow } from "./types";
import { logMessage } from "./logger";
import { createWorkflowRunner } from "./WorkflowRunner";
import { createWorkflowWindow } from "./workflowWindow";

/** Retrieves nodes of a specific input type from the workflow */
function getInputNodes(workflow: Workflow, type: string) {
  return workflow.graph.nodes.filter((node) =>
    node.type.startsWith(`nodetool.input.${type}`)
  );
}

/** Retrieves all output nodes from the workflow */
function getOutputNodes(workflow: Workflow) {
  return workflow.graph.nodes.filter((node) =>
    node.type.startsWith(`nodetool.output`)
  );
}

/** Attempts to read an image from the clipboard and prepare it for workflow input */
function tryReadClipboardImage(workflow: Workflow): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const image = clipboard.readImage();

  if (!image.isEmpty()) {
    logMessage("Found image in clipboard");
    const imageInputNodes = getInputNodes(workflow, "ImageInput");
    logMessage(`Found ${imageInputNodes.length} image input nodes`);
    if (imageInputNodes.length > 0) {
      const inputNode = imageInputNodes[0];
      const nodeName = inputNode.data.name as string;
      logMessage(`Using image input node: ${nodeName}`);
      const dataUri = `data:image/png;base64,${image
        .toPNG()
        .toString("base64")}`;
      params[nodeName] = {
        type: "image",
        uri: dataUri,
      };
    }
  }
  return params;
}

/**
 * Attempts to read text from the clipboard and prepare it for workflow input
 * @param {Workflow} workflow - The workflow to process
 * @returns {Record<string, unknown>} Object containing text parameters if found, empty object otherwise
 */
function tryReadClipboardText(workflow: Workflow): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const clipboardText = clipboard.readText();

  if (clipboardText) {
    logMessage("Found text in clipboard");
    const stringInputNodes = getInputNodes(workflow, "StringInput");
    logMessage(`Found ${stringInputNodes.length} string input nodes`);
    if (stringInputNodes.length > 0) {
      const inputNode = stringInputNodes[0];
      const nodeName = inputNode.data.name as string;
      logMessage(`Using string input node: ${nodeName}`);
      params[nodeName] = clipboardText;
    }
  }
  return params;
}

/**
 * Writes the workflow results to the system clipboard
 * @param {Workflow} workflow - The workflow containing output configuration
 * @param {unknown[]} results - Array of workflow results
 */
function writeResultToClipboard(workflow: Workflow, results: unknown[]) {
  if (results.length > 0) {
    const outputNode = getOutputNodes(workflow)[0];
    if (outputNode) {
      const outputValue = results[results.length - 1];
      if (outputNode.data?.type === "image" || typeof outputValue === "object" && outputValue !== null && "type" in outputValue && outputValue.type === "image") {
        const uri = typeof outputValue === "object" && outputValue !== null && "uri" in outputValue && typeof outputValue.uri === "string" ? outputValue.uri : "";
        const image = nativeImage.createFromBuffer(
          Buffer.from(uri, "base64")
        );
        clipboard.writeImage(image);
      } else {
        clipboard.writeText(String(outputValue ?? ""));
      }
    }
  }
}

/**
 * Executes a workflow either in headless mode or with UI
 * @param {Workflow} workflow - The workflow to execute
 * @returns {Promise<void>}
 */
export async function runWorkflow(workflow: Workflow) {
  logMessage(
    `Starting workflow execution: ${workflow.name} (ID: ${workflow.id})`
  );
  let params: Record<string, unknown> = {};

  if (workflow.settings?.run_mode === "headless") {
    logMessage(`Running headless workflow: ${workflow.name}`);
    // Try both clipboard inputs for headless workflows
    params = {
      ...tryReadClipboardImage(workflow),
      ...tryReadClipboardText(workflow),
    };

    const workflowRunner = createWorkflowRunner();
    workflowRunner.setState({
      onComplete: (results: unknown[]) => {
        logMessage(`Results: ${results}`);
        if (workflow.settings?.run_mode === "headless") {
          writeResultToClipboard(workflow, results);
        }
      },
    });
    await workflowRunner.getState().connect();
    await workflowRunner.getState().run(workflow, params);
  } else {
    logMessage(`Opening workflow window for: ${workflow.name}`);
    createWorkflowWindow(workflow.id);
  }
}
