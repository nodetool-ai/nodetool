// In-process NodeTool graph runner. One worker thread owns the JavaScript
// engine and the loaded guest bundle, and runs submitted graphs one at a time
// in that context. Every method is thread-safe.
#pragma once

#include "nodetool/context_options.h"
#include "nodetool/host_lanes.h"
#include "nodetool/provider_jobs.h"
#include "nodetool/supervisor_options.h"

#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace nodetool::jobs {
// The counters that bound host jobs across runners
// (native/jobs/include/nodetool/jobs/admission.h). Opaque to embedders.
class AdmissionLedger;
}  // namespace nodetool::jobs

namespace gr {

// The GPU the WebGPU image nodes run their shader modules on
// (src/host/gpu.cpp, through wgpu-native). Without it, or in a build with
// NODETOOL_GRAPH_RUNNER_GPU off, those nodes fail with "WebGPU is not
// available" and the reason.
// A GPU-texture output read back for an embedder that shows it in its own
// process: straight-alpha RGBA8, width * height * 4 bytes.
struct OutputImage {
  // The run label the texture belongs to, the guest's job id.
  std::string run;
  uint32_t width = 0;
  uint32_t height = 0;
  std::vector<uint8_t> rgba;
};

struct GpuOptions {
  bool enabled = false;
  // wgpu-native backends: "primary" (Vulkan, Metal, DX12), "vulkan",
  // "metal", "dx12", "gl" or "all".
  std::string backends = "primary";
  // Use only a software adapter, such as lavapipe or WARP. Otherwise a
  // hardware adapter is preferred and a software one is the fallback.
  bool softwareOnly = false;
  // Takes a GPU-texture output as pixels and returns the URI messages carry
  // in its place, such as a key into the embedder's own image store. Called
  // on the runner thread, once per texture. Unset, or returning "", the
  // output leaves the runner as base64 PNG data.
  std::function<std::string(OutputImage)> outputImages;
};

// Admission limits of native host jobs (docs/plans/graph-runner-async-host.md,
// section 4.7). Every job, its copied inputs, its worst-case output and its
// undrained result count against its run and its admission ledger until the
// result is disposed. A job that exceeds a byte limit fails. One that waits
// for capacity starts later, in submission order. Bytes handed to JavaScript
// without a copy count against the JavaScript limits until the garbage
// collector frees their buffer. 0 keeps a default, and a larger value is
// clamped to it: configuration may only lower a limit.
struct HostJobLimits {
  // Per run: 1 GiB and 64 operations.
  uint64_t runBytes = 0;
  size_t runOperations = 0;
  // Per runner, across its runs: 1 GiB.
  uint64_t runnerJavaScriptBytes = 0;
};

// The limits shared by every runner given the same admission ledger:
// 4 GiB, 256 operations and 4 GiB in JavaScript by default. 0 keeps a
// default, and a larger value is clamped to it.
struct AdmissionLimits {
  uint64_t bytes = 0;
  size_t operations = 0;
  uint64_t javaScriptBytes = 0;
};

// A new admission ledger with `limits`. Give it to every runner that should
// share them through HostOptions::admissionLedger.
std::shared_ptr<nodetool::jobs::AdmissionLedger> newAdmissionLedger(AdmissionLimits limits = {});

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
  // Shipped sample media: `package://<pkg>/<path>` refs read <dir>/<pkg>/<path>,
  // read-only. A path with `..`, a leading `/` or a symlink below the
  // directory is refused. Empty: package:// refs fail with an error.
  std::string packageAssetsDir;
  // Read-only resources the guest build keeps out of the bundle: fonts,
  // tokenizer ranks, encoding tables and WebAssembly modules, which the
  // guest reads on first use through `__host.bundleAssets`. Empty: the
  // runner uses defaultBundleAssetsDir(bundlePath) when that directory
  // exists, and grants none otherwise.
  std::string bundleAssetsDir;
  // After the load, write the node type snapshot of a bundle with lazy node
  // modules to <bundleAssetsDir>/types.json. A later load of the same build
  // then evaluates those modules on first use. Set by the compile command,
  // on a load that must evaluate every module, so remove types.json first.
  bool writeTypeSnapshot = false;
  // Keep a second loaded context while the runner is idle, so a run after a
  // discarded context starts at once instead of after a bundle load. Costs
  // one idle JavaScript heap.
  bool spareContext = true;
  // Every provider id resolves to the runtime's FakeProvider in the guest, one
  // instance per id, and the context's provider:* and prediction:* grants are
  // dropped from both grant maps. Provider calls then reach no grant, secret
  // or network. For running example workflows offline.
  bool fakeProviders = false;
  // Provider endpoint jobs (nodetool/provider_jobs.h). When set, the runner
  // grants provider:<id>:jobs:put, start, next and close for each id in
  // providerJobProviders, next on the asynchronous transport. Each job and
  // upload belongs to the run in progress: the runner creates a RunIdentity
  // for each run, stamps jobs and uploads with it, refuses a request that
  // names another run, and calls retireRun with it after the run's terminal
  // job_update, before the next run starts. Runs with the same job id, in
  // this runner or another sharing the object, stay apart. A ProviderJobs
  // built without a lane runs its jobs on the process network lane, also
  // with inlineHostJobs. Not granted with fakeProviders. Shared: the
  // embedder may keep it to stop jobs or read stats(), share it between
  // runners, and the runner holds it until it is destroyed.
  std::shared_ptr<host::ProviderJobs> providerJobs;
  std::vector<std::string> providerJobProviders;
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
  // Threads of the process-wide lanes that run native host jobs: CPU work,
  // file I/O and network calls. 0 picks the default: min(4, cores - 1) and
  // at least 1 for CPU, 8 for I/O, and ProviderJobs::Limits::maxJobs for the
  // network. The first threaded runner of the process sets the sizes, and
  // later runners share those lanes as they are. A lane starts its threads
  // when it gets jobs. shutdownHostLanes() (nodetool/host_lanes.h) ends them.
  size_t cpuThreads = 0;
  size_t ioThreads = 0;
  size_t networkThreads = 0;
  // Runs native host jobs on the runner thread as they are submitted,
  // instead of on the lanes. Results still settle as macrotasks, but a
  // cancelled run cannot end at its deadline while a job runs.
  bool inlineHostJobs = false;
  // Admission limits of host jobs, threaded and inline alike.
  HostJobLimits hostJobLimits;
  // The guest engine's heap limit in bytes. A guest allocation past it
  // raises an out-of-memory error. 0: the engine default (4 GiB).
  size_t javaScriptHeapBytes = 0;
  // The ledger whose limits this runner shares with every other runner given
  // the same one (newAdmissionLedger). Unset: the runner creates a private
  // ledger with the default limits. Shared: every runner given it, and every
  // reservation and JavaScript buffer charged to it, which can outlive the
  // runner, keep it alive.
  std::shared_ptr<nodetool::jobs::AdmissionLedger> admissionLedger;
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
  // A type whose code reaches an export the native runner lacks (the
  // bundle's node requirements) is not among them.
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

// The resource directory guest/build.mjs writes next to a bundle:
// <dir>/<stem>.assets for <dir>/<stem>.js and <dir>/<stem>.bin alike.
std::string defaultBundleAssetsDir(const std::string& bundlePath);

// Whether `bundle` is bytecode written by compileBundle().
bool isBundleBytecode(const std::vector<uint8_t>& bundle);

}  // namespace gr
