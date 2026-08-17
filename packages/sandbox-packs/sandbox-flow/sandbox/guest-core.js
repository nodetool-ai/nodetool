// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import {
  invoke_node,
  open_node_stream,
  take_node_stream,
  close_node_stream
} from "@nodetool-ai/sandbox-nodetool/flow";
async function callNode(type, inputs) {
  const outputs = await invoke_node({ type, inputs });
  return outputs;
}
function streamNode(type, inputs) {
  return {
    async *[Symbol.asyncIterator]() {
      const { stream_id } = await open_node_stream({ type, inputs });
      let exhausted = false;
      try {
        while (true) {
          const next = await take_node_stream({ stream_id });
          if (next.done) {
            exhausted = true;
            return;
          }
          yield next.value;
        }
      } finally {
        if (!exhausted) await close_node_stream({ stream_id });
      }
    }
  };
}
export {
  callNode,
  streamNode
};
