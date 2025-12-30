/**
 * Workflow Execution Module
 *
 * This module handles the execution of workflows in both headless and UI modes.
 * It provides functionality for:
 * - Reading inputs from system clipboard (images and text)
 * - Writing outputs back to system clipboard
 * - Managing workflow execution flow
 * - Handling input/output nodes
 *
 * The module supports two execution modes:
 * 1. Headless mode: Automatically reads from clipboard and executes without UI
 * 2. UI mode: Opens a workflow window for interactive execution
 */

import { clipboard, nativeImage } from "electron";
import { Workflow } from "./types";
import { logMessage } from "./logger";
import { createWorkflowRunner } from "./WorkflowRunner";
import { createWorkflowWindow } from "./workflowWindow";

/**
 * Retrieves nodes of a specific input type from the workflow
 * @param {Workflow} workflow - The workflow to search through
 * @param {string} type - The input type to filter for (e.g., 'ImageInput', 'StringInput')
 * @returns {Array} Array of nodes matching the input type
 */
function getInputNodes(workflow: Workflow, type: string) {
  return workflow.graph.nodes.filter((node) =>
    node.type.startsWith(`nodetool.input.${type}`)
  );
}

/**
 * Retrieves all output nodes from the workflow
 * @param {Workflow} workflow - The workflow to search through
 * @returns {Array} Array of output nodes
 */
function getOutputNodes(workflow: Workflow) {
  return workflow.graph.nodes.filter((node) =>
    node.type.startsWith(`nodetool.output`)
  );
}

/**
 * Attempts to read an image from the clipboard and prepare it for workflow input
 * @param {Workflow} workflow - The workflow to process
 * @returns {Record<string, any>} Object containing image parameters if found, empty object otherwise
 */
function tryReadClipboardImage(workflow: Workflow): Record<string, any> {
  const params: Record<string, any> = {};
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
  }
  return params;
}

/**
 * Attempts to read text from the clipboard and prepare it for workflow input
 * @param {Workflow} workflow - The workflow to process
 * @returns {Record<string, any>} Object containing text parameters if found, empty object otherwise
 */
function tryReadClipboardText(workflow: Workflow): Record<string, any> {
  const params: Record<string, any> = {};
  const clipboardText = clipboard.readText();

  if (clipboardText) {
    logMessage("Found text in clipboard");
    const stringInputNodes = getInputNodes(workflow, "StringInput");
    logMessage(`Found ${stringInputNodes.length} string input nodes`);
    if (stringInputNodes.length > 0) {
      const inputNode = stringInputNodes[0];
      logMessage(`Using string input node: ${inputNode.data.name}`);
      params[inputNode.data.name] = clipboardText;
    }
  }
  return params;
}

/**
 * Writes the workflow results to the system clipboard
 * @param {Workflow} workflow - The workflow containing output configuration
 * @param {any[]} results - Array of workflow results
 */
function writeResultToClipboard(workflow: Workflow, results: any[]) {
  if (results.length > 0) {
    const outputNode = getOutputNodes(workflow)[0];
    if (outputNode) {
      const outputValue = results[results.length - 1];
      if (outputNode.data?.type === "image" || outputValue?.type === "image") {
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

/**
 * Executes a workflow either in headless mode or with UI
 * @param {Workflow} workflow - The workflow to execute
 * @returns {Promise<void>}
 */
export async function runWorkflow(workflow: Workflow) {
  logMessage(
    `Starting workflow execution: ${workflow.name} (ID: ${workflow.id})`
  );
  let params: Record<string, any> = {};

  if (workflow.settings?.run_mode === "headless") {
    logMessage(`Running headless workflow: ${workflow.name}`);
    // Try both clipboard inputs for headless workflows
    params = {
      ...tryReadClipboardImage(workflow),
      ...tryReadClipboardText(workflow),
    };

    const workflowRunner = createWorkflowRunner();
    workflowRunner.setState({
      onComplete: (results: any[]) => {
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
