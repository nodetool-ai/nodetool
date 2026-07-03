# @nodetool-ai/code-runners

Streaming code runners for [NodeTool](https://nodetool.ai) — execute Python, JavaScript, Bash, Ruby, and Lua in Docker containers or local subprocesses.

Each runner streams `stdout`/`stderr` line by line as an async generator, with configurable image, memory, CPU, and network limits. A 1:1 TypeScript port of the Python `nodetool-core` code runners.

## Install

```bash
npm install @nodetool-ai/code-runners
```

## Exported symbols

| Symbol | Kind | Description |
|---|---|---|
| `StreamRunnerBase` | class | Base runner — Docker or local subprocess, streaming output |
| `PythonDockerRunner` | class | Run Python in a container |
| `JavaScriptDockerRunner` | class | Run JavaScript in a container |
| `BashDockerRunner` | class | Run Bash in a container |
| `RubyDockerRunner` | class | Run Ruby in a container |
| `LuaRunner` / `LuaSubprocessRunner` | class | Run Lua in a container or local subprocess |
| `CommandDockerRunner` | class | Run an arbitrary command in a container |
| `ServerDockerRunner` / `ServerSubprocessRunner` | class | Long-lived server processes |
| `DockerHijackMultiplexDemuxer` | class | Demultiplex Docker's multiplexed attach stream |
| `ContainerFailureError` | class | Thrown when a container or subprocess exits non-zero |
| `StreamRunnerOptions`, `StreamOptions`, `Slot` | type | Runner configuration and output-slot types |

## Usage

Runners expose `stream(userCode, envLocals, options?)`, an async generator yielding `[slot, text]` pairs where `slot` is `"stdout"` or `"stderr"`.

```ts
import { PythonDockerRunner } from "@nodetool-ai/code-runners";

const runner = new PythonDockerRunner({
  image: "python:3.12-slim",
  timeoutSeconds: 30,
  memLimit: "256m",
  networkDisabled: true
});

for await (const [slot, text] of runner.stream(
  "print('hello from', name)",
  { name: "nodetool" }
)) {
  process[slot === "stderr" ? "stderr" : "stdout"].write(text + "\n");
}
```

Call `runner.stop()` to cooperatively cancel an active run. Docker execution requires a reachable Docker daemon (via `dockerode`).

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
