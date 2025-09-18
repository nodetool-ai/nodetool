import { useCallback } from "react";
import { useWebsocketRunner } from "../stores/WorkflowRunner";

/**
 * Generic streaming hook for workflow input nodes.
 *
 * Stream values to an InputNode by its `name` (node.data.name in the graph).
 * Works with the backend WebSocket `stream_input` / `end_input_stream` commands.
 */
export function useInputStream(inputName: string) {
  const streamInput = useWebsocketRunner((s) => s.streamInput);
  const endInputStream = useWebsocketRunner((s) => s.endInputStream);
  const state = useWebsocketRunner((s) => s.state);

  const send = useCallback(
    (value: any, handle?: string) => {
      if (!inputName) return;
      if (state !== "running") return;
      streamInput(inputName, value, handle);
    },
    [inputName, streamInput, state]
  );

  const end = useCallback(
    (handle?: string) => {
      if (!inputName) return;
      if (state !== "running") return;
      endInputStream(inputName, handle);
    },
    [inputName, endInputStream, state]
  );

  return { send, end };
}

/**
 * Convenience helpers for chunked streaming (text/audio) via a dedicated
 * downstream handle like "chunk" on the consumer node.
 *
 * The graph should connect this InputNode to the target node's handle
 * (e.g., RealtimeAgent's "chunk"). This hook sends chunk objects; the
 * consumer decides how to interpret them.
 */
export function useChunkedInputStream(
  inputName: string,
  handle: string = "chunk"
) {
  const { send, end } = useInputStream(inputName);

  const appendText = useCallback(
    (content: string, done: boolean = false) => {
      send({ type: "chunk", content, done }, handle);
    },
    [send, handle]
  );

  const appendAudioBase64 = useCallback(
    (base64Pcm16: string, done: boolean = false) => {
      send(
        { type: "chunk", content: base64Pcm16, done, content_type: "audio" },
        handle
      );
    },
    [send, handle]
  );

  return { appendText, appendAudioBase64, end: () => end(handle) };
}
