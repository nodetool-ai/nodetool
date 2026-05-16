import { useCallback } from "react";
import { useWebsocketRunner } from "../stores/WorkflowRunner";

/**
 * Generic streaming hook for workflow input nodes.
 *
 * Stream values to an InputNode by its `name` (node.data.name in the graph).
 * Works with the backend WebSocket `stream_input` / `end_input_stream` commands.
 */
interface InputStreamActions {
  send: (value: unknown, handle?: string) => void;
  end: (handle?: string) => void;
}

export function useInputStream(inputName: string): InputStreamActions {
  const streamInput = useWebsocketRunner((s) => s.streamInput);
  const endInputStream = useWebsocketRunner((s) => s.endInputStream);
  const state = useWebsocketRunner((s) => s.state);

  const send = useCallback(
    (value: unknown, handle?: string) => {
      if (!inputName) {return;}
      if (state !== "running") {
        // Silently drop — workflow not running yet. The send callback
        // reference updates when state changes, which re-triggers the
        // streaming effect so data starts flowing once the workflow runs.
        return;
      }
      streamInput(inputName, value, handle);
    },
    [inputName, streamInput, state]
  );

  const end = useCallback(
    (handle?: string) => {
      if (!inputName) {return;}
      if (state !== "running") {return;}
      endInputStream(inputName, handle);
    },
    [inputName, endInputStream, state]
  );

  return { send, end };
}
