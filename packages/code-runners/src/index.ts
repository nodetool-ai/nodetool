/**
 * @nodetool/code-runners – Public API
 *
 * Streaming code runners for executing code in Docker containers or local
 * subprocesses. 1:1 port of Python nodetool-core/code_runners.
 */

export {
  StreamRunnerBase,
  ContainerFailureError,
  type StreamRunnerOptions,
  type StreamOptions,
  type Slot
} from "./stream-runner-base.js";

export { DockerHijackMultiplexDemuxer } from "./docker-demuxer.js";

export { PythonDockerRunner } from "./python-runner.js";
export { BashDockerRunner } from "./bash-runner.js";
export { JavaScriptDockerRunner } from "./javascript-runner.js";
export { RubyDockerRunner } from "./ruby-runner.js";
export { LuaRunner, LuaSubprocessRunner } from "./lua-runner.js";
export { CommandDockerRunner } from "./command-runner.js";
export { ServerDockerRunner } from "./server-docker-runner.js";
export { ServerSubprocessRunner } from "./server-subprocess-runner.js";

// Firecracker microVM-based runners
export { FirecrackerClient } from "./firecracker-client.js";
export { FirecrackerVM } from "./firecracker-vm.js";
export { FirecrackerRunner } from "./firecracker-runner.js";
export { FirecrackerPool } from "./firecracker-pool.js";
export type {
  FirecrackerVMConfig,
  FirecrackerNetworkConfig,
  FirecrackerRunnerOptions,
  FirecrackerStreamOptions,
  FirecrackerPoolConfig,
  GuestExecRequest,
  GuestOutputMessage,
  GuestExitMessage,
  GuestMessage
} from "./firecracker-types.js";
