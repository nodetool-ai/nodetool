import { clipboard, nativeImage } from "electron";
import { Workflow } from "./types";
import { logMessage } from "./logger";
import { createWorkflowRunner } from "./WorkflowRunner";
import { createWorkflowWindow } from "./workflowWindow";

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

  const clipboardText = clipboard.readText();
  logMessage(`Clipboard text: ${clipboardText}`);

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
    await workflowRunner.getState().run(workflow, params);
  } else {
    logMessage(`Opening workflow window for: ${workflow.name}`);
    createWorkflowWindow(workflow.id);
  }
}
