// In-process NodeTool graph runner. One worker thread owns the JavaScript
// engine and the loaded guest bundle, and runs submitted graphs one at a time
// in that context. Every method is thread-safe.
#pragma once

#include "nodetool/context_options.h"
#include "nodetool/supervisor_options.h"

#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace gr {

// The GPU the WebGPU image nodes run their shader modules on
// (src/host/gpu.cpp, through wgpu-native). Without it, or in a build with
// NODETOOL_GRAPH_RUNNER_GPU off, those nodes fail with "WebGPU is not
// available" and the reason.
struct GpuOptions {
  bool enabled = false;
  // wgpu-native backends: "primary" (Vulkan, Metal, DX12), "vulkan",
  // "metal", "dx12", "gl" or "all".
  std::string backends = "primary";
  // Use only a software adapter, such as lavapipe or WARP. Otherwise a
  // hardware adapter is preferred and a software one is the fallback.
  bool softwareOnly = false;
};

// What the embedder lets node code reach: storage, files, secrets and
// devices. Each host capability (src/host/) reads its own fields. The
// defaults grant nothing.
struct HostOptions {
  host::ContextOptions context;
  // The run's workspace directory. Node code reads and writes files here
  // through context.workspace and node:fs, context.workspaceDir names it,
  // and relative paths resolve against it. Empty: the run has no workspace
  // and relative file operations are unavailable. Must exist.
  std::string workspaceDir;
  // Directory where node code may keep SQLite database files
  // (better-sqlite3, sqlite-vec). Relative database paths resolve inside it,
  // and a path that leaves it, through `..` or a symbolic link, is refused.
  // Also writable through node:fs. Empty grants in-memory databases only.
  std::string sqliteDirectory;
  // Directories node code may read but not write: absolute paths and
  // file:// media refs below them load. Paths outside the workspace and
  // these directories are refused, symlinks included.
  std::vector<std::string> readRoots;
  // The asset store: `asset://<id>` and `/api/storage/<key>` refs read from
  // it, and context.createAsset writes `<id>.<ext>` into it. Empty: those
  // refs do not resolve and createAsset fails as it does without a database.
  std::string assetDir;
  // What context.getSecret(key) returns. Keys not listed read as null.
  std::map<std::string, std::string> secrets;
  // Let media refs load http(s) URLs. Only https to a public address is
  // fetched, every redirect and connected address is checked, as
  // safeFetch does in @nodetool-ai/runtime. Off: such refs load no bytes.
  bool allowHttpFetch = false;
  GpuOptions gpu;
  // Native media requires explicit file and encoder grants.
  bool allowMedia = false;
  std::vector<std::string> mediaEncoders;
  // Kernel result cache and durable deliveries. Empty keeps state in memory.
  // Persistence grants access only to execution-state.sqlite in this directory.
  std::string executionStateDirectory;
  std::vector<std::string> cacheNodeTypes;
  bool durableInboxes = false;
  // No decide callback grants no supervision. Effects are unknown by default.
  SupervisorOptions supervisor;
};

class GraphRunner {
public:
  // One ProcessingMessage as a JSON object. Called on the worker thread.
  // Every submitted job gets one job_update whose status is completed,
  // failed or cancelled. When the run collected outputs, a second job_update
  // with the same status follows it, as from the server: the job summary,
  // whose `result.outputs` lists the values of every node without outgoing
  // data edges, keyed by node name.
  // `last` is true on the job's final message, after which the handler is
  // not called again.
  using MessageHandler = std::function<void(const std::string& message, bool last)>;

  // Starts the worker, which loads the bundle (guest.js source or guest.bin
  // bytecode) in the background.
  explicit GraphRunner(std::string bundlePath, HostOptions options = {});
  // Cancels queued and running jobs, whose handlers receive their cancelled
  // job_update, and joins the worker.
  ~GraphRunner();
  GraphRunner(const GraphRunner&) = delete;
  GraphRunner& operator=(const GraphRunner&) = delete;

  // True once the bundle is loaded. False while loading, after a failed
  // load, and while a discarded context reloads.
  bool ready() const;
  // Why the last load failed, or empty.
  std::string loadError() const;
  // Waits until the first load finishes or `timeoutMs` passes. Returns ready().
  bool waitUntilLoaded(int timeoutMs) const;
  // Node types the loaded guest runs. Empty until the first load succeeds.
  std::vector<std::string> supportedNodeTypes() const;
  // Empty when the runner is ready and can run every node and edge of
  // `graphJson` ({nodes, edges}). Otherwise the reason it cannot.
  std::string unsupportedReason(const std::string& graphJson) const;
  bool canRun(const std::string& graphJson) const { return unsupportedReason(graphJson).empty(); }

  // Queues a run. paramsJson and triggerEventJson may be empty.
  // triggerEventJson carries {node_id, payload} for one delivered event.
  // Jobs run in submission order.
  void submit(std::string jobId, std::string workflowId, std::string graphJson,
              std::string paramsJson, MessageHandler onMessage, std::string triggerEventJson = {});
  // Cancels a queued or running job. Returns false for an unknown or
  // finished job.
  bool cancel(const std::string& jobId);

  // How many times a context was loaded. A run that leaves the context in an
  // unknown state replaces it, which increments this.
  int contextLoads() const;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

// Compiles guest bundle source to bytecode for this build's engine. The
// result is valid only for the same engine build. Throws std::runtime_error.
std::vector<uint8_t> compileBundle(const std::string& source, const std::string& filename);

// Whether `bundle` is bytecode written by compileBundle().
bool isBundleBytecode(const std::vector<uint8_t>& bundle);

}  // namespace gr
