/**
 * ComfyUI Execution Bridge
 * 
 * Handles execution of workflows containing ComfyUI nodes by routing to ComfyUI backend.
 */

import { Graph } from "../stores/ApiTypes";
import { getComfyUIService } from "../services/ComfyUIService";
import { nodeToolGraphToComfyPrompt, graphHasComfyUINodes } from "./comfyWorkflowConverter";
import log from "loglevel";

/**
 * Check if a graph should be executed via ComfyUI
 */
export function shouldUseComfyUIExecution(graph: Graph): boolean {
  return graphHasComfyUINodes(graph);
}

/**
 * Execute a graph via ComfyUI backend
 */
export async function executeViaComfyUI(
  graph: Graph,
  onProgress?: (progress: {
    type: string;
    data: any;
  }) => void
): Promise<{
  success: boolean;
  promptId?: string;
  error?: string;
}> {
  const service = getComfyUIService();

  try {
    // Convert graph to ComfyUI prompt format
    const prompt = nodeToolGraphToComfyPrompt(graph);

    log.info("Executing via ComfyUI:", prompt);

    // Submit prompt to ComfyUI
    const response = await service.submitPrompt(prompt);

    log.info("ComfyUI execution started:", response);

    // Connect to WebSocket for progress updates if callback provided
    if (onProgress) {
      service.connectWebSocket(
        (data) => {
          onProgress({
            type: data.type,
            data: data.data
          });
        },
        (error) => {
          log.error("ComfyUI WebSocket error:", error);
        },
        (event) => {
          log.info("ComfyUI WebSocket closed:", event);
        }
      );
    }

    return {
      success: true,
      promptId: response.prompt_id
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Failed to execute via ComfyUI:", error);
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Cancel ComfyUI execution
 */
export async function cancelComfyUIExecution(promptId: string): Promise<void> {
  const service = getComfyUIService();
  await service.cancelPrompt(promptId);
}
