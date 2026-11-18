# Phase 6: try the model in NodeTool by hand

Goal: a person uses the fine-tuned model in the real product, which the eval
does not cover: multi-request sessions, real documents, and the UI.

```bash
CTX=65536 NP=1 $S/run-detached.sh serve-v4e3 "$FT_HOME/serve-v4e3.log" \
  $S/serve-local.sh "$FT_HOME/models/v4e3-q4km.gguf" 8090
$S/llama-speed.sh http://127.0.0.1:8090
LLAMA_CTX=65536 $S/try-in-nodetool.sh "$FT_HOME/nodetool-ui"
```

`try-in-nodetool.sh` starts the dev API server on port 7787 with its own SQLite
database under the state directory, and the web UI on port 3007. It points the
llama.cpp provider at the server through `LLAMA_CPP_URL`, and sets
`LLAMA_CPP_CONTEXT_LENGTH` to one slot's context, which is what chat compaction
measures against. Pick the model under the llama.cpp provider in the chat's
model menu. Ctrl-C stops both servers. The llama-server keeps running until its
job is stopped (`systemctl --user stop ft-serve-v4e3`).

To open the UI from another device on the LAN, set `LAN_HOST` to this machine's
address. The UI then listens on all interfaces, and the API accepts that origin
through `NODETOOL_ALLOWED_ORIGINS`. Without that variable the API refuses the
LAN origin. The operator must open `WEB_PORT` in the firewall. Do not change the
firewall yourself.

The dev server reads the repository's `.env`. If it holds paid provider keys,
the model's tool calls can spend with them, so check it with the operator first.

Things to try that the eval does not measure: a session of 20 or more requests
on one document, an edit that refers back to earlier work, an undo, and a
request the model cannot complete, where the right reply says what failed.

## Check before moving on

- The operator has tried the model and their observations are written down
  with the run.
- Both servers and the llama-server are stopped when the trial ends.
