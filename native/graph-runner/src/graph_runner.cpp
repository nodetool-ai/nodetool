#include "nodetool/graph_runner.h"

#include "host/capabilities.h"
#include "host/provider_job_grants.h"
#include "js/engine.h"
#include "kernel/actor.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/guest.h"
#include "kernel/host_lanes.h"
#include "kernel/normalize.h"
#include "kernel/public_supervisor.h"
#include "kernel/run_control.h"
#include "kernel/runner.h"
#include "kernel/task.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iterator>
#include <map>
#include <mutex>
#include <set>
#include <thread>

#if !defined(_WIN32)
#include <pthread.h>
#endif

using nodetool::jobs::AdmissionLedger;

namespace gr {
namespace {

using Clock = std::chrono::steady_clock;

const char* kLog = "graph-runner";

// Runs `body` on a new thread with a stack of `bytes` and waits for it. The
// calling thread only waits. Without pthreads the body runs on the caller.
void runWithStack(size_t bytes, const std::function<void()>& body) {
#if defined(_WIN32)
  (void)bytes;
  body();
#else
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, bytes);
  pthread_t thread;
  auto entry = [](void* arg) -> void* {
    (*static_cast<const std::function<void()>*>(arg))();
    return nullptr;
  };
  const bool started = pthread_create(&thread, &attr, entry, const_cast<std::function<void()>*>(&body)) == 0;
  pthread_attr_destroy(&attr);
  if (started) pthread_join(thread, nullptr);
  else body();
#endif
}

// The runner's account on the embedder's ledger, or on a private ledger with
// the default limits, which the account keeps alive.
std::shared_ptr<nodetool::jobs::RunnerAccount> openRunnerAccount(const HostOptions& options) {
  const HostJobLimits& limits = options.hostJobLimits;
  nodetool::jobs::RunnerLimits runner;
  runner.runBytes = limits.runBytes;
  runner.runOperations = limits.runOperations;
  runner.javaScriptBytes = limits.runnerJavaScriptBytes;
  runner.runDeferredBytes = 0;
  runner.runDeferredEntries = 0;
  const auto ledger = options.admissionLedger ? options.admissionLedger : std::make_shared<AdmissionLedger>();
  return ledger->openRunner(runner);
}
// A cancelled run gets this long to unwind before running JavaScript is
// interrupted. Cancellation normally lands at the next kernel step.
constexpr auto kCancelGrace = std::chrono::milliseconds(500);
// A spare context loads only after the queue stays empty this long. A job
// sent right after a load or a run then starts at once instead of waiting
// for the whole spare load.
constexpr auto kSpareIdleDelay = std::chrono::milliseconds(1000);
// Types the guest has but the kernel rejects (README: what A1 does not
// support). Controlled node classes are excluded at load time.
const std::set<std::string> kRejectedTypes = {};

// native-rules #9: shared by caller and worker thread, no affinity comment
struct Job {
  std::string id;
  std::string workflowId;
  std::string graph;
  std::string params;
  std::string triggerEvent;
  GraphRunner::MessageHandler handler;
  std::atomic<bool> cancelRequested{false};
  // Set before the terminal job_update reaches the handler.
  std::atomic<bool> finished{false};
  // The CancelState generation of the run. Guarded by Impl::mutex.
  uint64_t generation = 0;
};

// One live property change on its way from updateNodeProperties() to the
// worker. A plain value: the caller thread builds it and the worker takes
// it out of Impl::liveUpdates.
struct LiveUpdate {
  std::string nodeId;
  Json properties;
};

// One loaded engine with its guest. Members are destroyed in reverse order,
// so the catalog and the guest release their engine values first.
struct Context {
  // Pending timers hold engine values, so they go before the engine does.
  ~Context() { Loop::current().clearTimers(); }

  std::unique_ptr<js::Engine> engine;
  std::unique_ptr<Guest> guest;
  std::unique_ptr<GuestCatalog> catalog;
};

Json jobUpdate(const Job& job, const char* status, const std::string& error) {
  Json msg = Json::object();
  msg["type"] = "job_update";
  msg["status"] = status;
  msg["job_id"] = job.id;
  msg["workflow_id"] = job.workflowId;
  if (!error.empty()) msg["error"] = error;
  return msg;
}

// The job summary the server sends after the kernel's terminal job_update
// (JobExecution._streamJobMessagesInner in packages/websocket): the run's
// status and error with RunResult.outputs.
Json jobSummary(const Job& job, const Json& terminal, const Json& outputs) {
  Json msg = Json::object();
  msg["type"] = "job_update";
  msg["status"] = terminal.value("status", std::string());
  msg["job_id"] = job.id;
  msg["workflow_id"] = job.workflowId;
  if (terminal.contains("error") && terminal["error"].is_string()) msg["error"] = terminal["error"];
  msg["result"] = Json{{"outputs", outputs}};
  return msg;
}

bool isTerminal(const Json& msg) {
  if (msg.value("type", std::string()) != "job_update") return false;
  const std::string status = msg.value("status", std::string());
  return status == "completed" || status == "failed" || status == "cancelled";
}

double msSince(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

// The identity of the run in progress, which the provider job grants stamp
// on every job and upload. Empty between runs.
//
// Thread affinity: thread-safe, `mutex_` guards `run_`. The worker sets it
// and the grants read it, both on the worker.
class CurrentRun {
public:
  void set(host::RunIdentity run) {
    std::lock_guard lock(mutex_);
    run_ = std::move(run);
  }
  host::RunIdentity get() const {
    std::lock_guard lock(mutex_);
    return run_;
  }

private:
  mutable std::mutex mutex_;
  host::RunIdentity run_;
};

}  // namespace

// native-rules #9: used by caller threads and the worker, no affinity comment
struct GraphRunner::Impl {
  Impl(std::string path, HostOptions hostOptions)
      : bundlePath(std::move(path)),
        options(std::move(hostOptions)),
        lanes(options.inlineHostJobs
                  ? HostLanes::inlined()
                  : processHostLanes({options.cpuThreads, options.ioThreads, options.networkThreads})),
        account(openRunnerAccount(options)) {
    // native-rules #12: lambda captures raw this and runs on the worker thread
    // The worker runs on a thread with an explicit stack, so the JS stack
    // limit (js::kWorkerStackBytes minus C++ headroom) is reached first.
    worker = std::thread([this] { runWithStack(js::kWorkerStackBytes, [this] { work(); }); });
  }

  void work();
  // Loads a context. A spare one (PT8) is kept in `spare` without touching
  // the published state, and a later load() adopts it at once.
  void load(bool asSpare = false);
  void runJob(Job& job);
  bool interruptRequested();

  const std::string bundlePath;
  const HostOptions options;

  mutable std::mutex mutex;
  mutable std::condition_variable changed;
  // native-rules #1: Job shared by caller and worker, no comment explains why unique fails
  std::deque<std::shared_ptr<Job>> queue;
  std::shared_ptr<Job> active;
  // Live property changes for `active`, in arrival order: queued by
  // updateNodeProperties() on any thread, taken by the worker, and dropped
  // when the run ends. Guarded by `mutex`.
  std::deque<LiveUpdate> liveUpdates;
  // Mirrors !liveUpdates.empty(), so the worker's loop reads it without the
  // lock on every idle turn. Written under `mutex`.
  std::atomic<bool> liveUpdatesPending{false};
  bool stopping = false;
  bool loadFinished = false;
  bool isReady = false;
  std::string error;
  std::set<std::string> runnable;
  // Node types the guest has but whose code reaches an export the native
  // runner lacks (the guest's `requires` flag), with the reason.
  std::map<std::string, std::string> unavailable;
  int loads = 0;
  // The worker thread's loop while the worker runs. cancel() and teardown
  // wake it when it sleeps until a timer is due.
  Loop* workerLoop = nullptr;

  // Cancellation of the running job, read by the loop and by the engine's
  // interrupt handler on the worker thread.
  CancelState cancelState;
  // Every native job of this runner, across runs. Jobs share it.
  std::shared_ptr<nodetool::jobs::RunnerTracker> tracker = std::make_shared<nodetool::jobs::RunnerTracker>();
  // Shared with the provider job grants, which the engine's context and
  // every asynchronous call still retained hold, possibly past the runner.
  const std::shared_ptr<CurrentRun> currentRun = std::make_shared<CurrentRun>();
  // The process lanes, or the worker itself with inlineHostJobs. They
  // outlive the runner.
  const std::shared_ptr<HostLanes> lanes;
  // The runner's admission account on the process ledger. Each run opens
  // its own run account under it. Shared with the runs' reservations and
  // JavaScript buffers, which can outlive the runner.
  const std::shared_ptr<nodetool::jobs::RunnerAccount> account;

  // Worker thread only.
  std::vector<uint8_t> bundle;
  std::unique_ptr<Context> context;
  // A loaded context that waits for the current one to be discarded. Built
  // while the queue is empty, so a run after a discard starts without a load.
  std::unique_ptr<Context> spare;
  bool interrupted = false;
  std::function<void(const Json&)> processingMessage;
  std::shared_ptr<ExecutionState> executionState;
  std::thread worker;
};

bool GraphRunner::Impl::interruptRequested() {
  const bool now = cancelState.interruptDue();
  if (now) interrupted = true;
  return now;
}

void GraphRunner::Impl::load(bool asSpare) {
  const auto start = Clock::now();
  if (!asSpare && spare) {
    context = std::move(spare);
    logLine("INFO", kLog, "replaced the discarded context with the spare in " + std::to_string(msSince(start)) + " ms");
    {
      std::lock_guard lock(mutex);
      loadFinished = true;
      isReady = true;
      error.clear();
      ++loads;
    }
    changed.notify_all();
    return;
  }
  auto next = std::make_unique<Context>();
  std::set<std::string> types;
  std::map<std::string, std::string> missing;
  std::string failure;
  double guestMs = 0;
  double readMs = 0;
  double catalogMs = 0;
  double firstNodeMs = 0;
  try {
    if (bundle.empty()) {
      std::ifstream in(bundlePath, std::ios::binary | std::ios::ate);
      if (!in) throw std::runtime_error("cannot read guest bundle " + bundlePath);
      bundle.resize(static_cast<size_t>(in.tellg()));
      in.seekg(0);
      in.read(reinterpret_cast<char*>(bundle.data()), static_cast<std::streamsize>(bundle.size()));
      if (!in) throw std::runtime_error("cannot read guest bundle " + bundlePath);
    }
    readMs = msSince(start);
    if (!executionState && (options.durableInboxes || !options.cacheNodeTypes.empty())) {
      executionState = std::make_shared<ExecutionState>(options.executionStateDirectory);
    }
    next->engine = js::createQuickJsEngine();
    if (options.javaScriptHeapBytes) next->engine->setMemoryLimit(options.javaScriptHeapBytes);
    // native-rules #12: lambda captures raw this and is stored in the engine, runs later
    next->engine->setInterruptHandler([this] { return interruptRequested(); });
    // The runner serves "message" itself, synchronously.
    if (options.context.asyncOperations.contains("message")) {
      throw std::runtime_error("The context operation 'message' cannot be asynchronous");
    }
    auto guestOptions = options;
    const auto messageObserver = options.context.operations.find("message");
    const host::ContextOptions::Callback observer = messageObserver == options.context.operations.end()
      ? host::ContextOptions::Callback{} : messageObserver->second;
    // native-rules #12: lambda captures raw this and is stored in guest options, runs later
    guestOptions.context.operations["message"] = [this, observer](const std::string& text) {
      if (observer) { try { observer(text); } catch (...) {} }
      if (processingMessage) processingMessage(Json::parse(text));
      return std::string("null");
    };
    host::grantProviderJobs(options, guestOptions.context, [run = currentRun] { return run->get(); });
    const auto grantedCancellation = options.context.cancelled;
    // native-rules #12: lambda captures raw this and is stored in guest options, runs later
    guestOptions.context.cancelled = [this, grantedCancellation] {
      return cancelState.cancelled() || (grantedCancellation && grantedCancellation());
    };
    next->guest = std::make_unique<Guest>(*next->engine, std::move(guestOptions));
    // native-rules #12: lambda captures raw this and is stored in the guest, runs later
    const auto guestStart = Clock::now();
    next->guest->load(bundle, bundlePath, [this] { return cancelState.snapshot().immediate; });
    guestMs = msSince(guestStart);
    const auto catalogStart = Clock::now();
    next->catalog = std::make_unique<GuestCatalog>(*next->guest);
    for (const auto& type : next->catalog->types()) {
      if (kRejectedTypes.count(type)) continue;
      const auto describeStart = Clock::now();
      auto flags = next->catalog->describe(Json{{"type", type}});
      if (firstNodeMs == 0) firstNodeMs = msSince(describeStart);
      if (!flags) continue;
      if (flags->contains("requires") && (*flags)["requires"].is_array() && !(*flags)["requires"].empty()) {
        std::string reason;
        for (const auto& r : (*flags)["requires"]) {
          reason += (reason.empty() ? "" : "; ") + r.value("spec", std::string()) + "." + r.value("name", std::string()) +
                    " (" + r.value("reason", std::string()) + ")";
        }
        missing[type] = std::move(reason);
        continue;
      }
      types.insert(type);
    }
    catalogMs = msSince(catalogStart);
    if (!asSpare && options.writeTypeSnapshot && !options.bundleAssetsDir.empty()) {
      const std::string snapshot = next->guest->typeSnapshot();
      if (snapshot != "null") {
        const std::filesystem::path target = std::filesystem::path(options.bundleAssetsDir) / "types.json";
        const std::filesystem::path staged = target.string() + ".tmp";
        {
          std::ofstream out(staged, std::ios::binary | std::ios::trunc);
          out << snapshot;
          if (!out) throw std::runtime_error("cannot write " + staged.string());
        }
        std::filesystem::rename(staged, target);
      }
    }
  } catch (const std::exception& e) {
    failure = e.what();
  }
  interrupted = false;
  // QuickJS keeps no reference to the bundle bytes after load. A reload reads
  // the file again.
  const bool bytecodeBundle = Guest::isBytecode(bundle);
  const size_t bundleBytes = bundle.size();
  std::vector<uint8_t>().swap(bundle);
  if (asSpare) {
    if (failure.empty()) {
      spare = std::move(next);
      logLine("INFO", kLog, "spare context loaded in " + std::to_string(msSince(start)) + " ms");
    } else {
      logLine("WARN", kLog, "spare context load failed: " + failure);
    }
    return;
  }
  if (failure.empty()) {
    context = std::move(next);
    logLine("INFO", kLog,
            "load phases " + Json{{"read_ms", readMs}, {"guest_ms", guestMs}, {"catalog_ms", catalogMs},
                                  {"first_node_ms", firstNodeMs}, {"bundle_bytes", bundleBytes}}.dump());
    logLine("INFO", kLog,
            std::string("bundle loaded (") +
                (bytecodeBundle ? "bytecode" : "source") + ") in " +
                std::to_string(msSince(start)) + " ms");
  } else {
    logLine("ERROR", kLog, "bundle load failed: " + failure);
  }
  {
    std::lock_guard lock(mutex);
    loadFinished = true;
    isReady = failure.empty();
    error = failure;
    if (isReady) {
      runnable = std::move(types);
      unavailable = std::move(missing);
      ++loads;
    }
  }
  changed.notify_all();
}

void GraphRunner::Impl::work() {
  {
    std::lock_guard lock(mutex);
    workerLoop = &Loop::current();
  }
  load();
  for (;;) {
    std::shared_ptr<Job> job;
    bool cancelledBeforeStart = false;
    std::string unavailable;
    {
      std::unique_lock lock(mutex);
      const auto wantsSpare = [this] { return queue.empty() && !stopping && context && !spare && options.spareContext; };
      if (wantsSpare() && !changed.wait_for(lock, kSpareIdleDelay, [this] { return stopping || !queue.empty(); })) {
        lock.unlock();
        load(true);
        lock.lock();
      }
      changed.wait(lock, [this] { return stopping || !queue.empty(); });
      if (queue.empty()) break;
      job = std::move(queue.front());
      queue.pop_front();
      cancelledBeforeStart = job->cancelRequested;
      if (!cancelledBeforeStart && !context) unavailable = error;
      if (!cancelledBeforeStart && context) {
        active = job;
        job->generation = cancelState.beginRun();
      }
    }
    auto deliver = [&job](const Json& msg) {
      try {
        job->handler(dumpWire(msg, Json::error_handler_t::replace), true);
      } catch (...) {
        // A handler failure must not reach the kernel.
      }
    };
    if (cancelledBeforeStart) {
      deliver(jobUpdate(*job, "cancelled", ""));
      continue;
    }
    if (!context) {
      deliver(jobUpdate(*job, "failed", "The local graph runner is unavailable: " + unavailable));
      continue;
    }
    runJob(*job);
    bool reload = false;
    {
      std::lock_guard lock(mutex);
      active.reset();
      liveUpdates.clear();
      liveUpdatesPending = false;
      cancelState.endRun();
      reload = !context && !stopping;
    }
    if (reload) load();
  }
  Loop::current().setPump(nullptr);
  spare.reset();
  context.reset();
  std::lock_guard lock(mutex);
  workerLoop = nullptr;
}

void GraphRunner::Impl::runJob(Job& job) {
  bool terminal = false;
  auto send = [this, &job](const Json& msg, bool last) {
    // Host-only values (GPU texture handles) become portable ones here.
    std::optional<Json> portable;
    try {
      portable = host::atBoundary(*context->engine, msg);
    } catch (const std::exception& e) {
      logLine("ERROR", kLog, std::string("message boundary: ") + e.what());
    }
    try {
      // A host reads bytes as tagged base64, whatever form the kernel holds.
      job.handler(dumpWire(portable ? *portable : msg, Json::error_handler_t::replace), last);
    } catch (...) {
      // A handler failure must not reach the kernel.
    }
  };
  processingMessage = [&](const Json& message) { if (!terminal) send(message, false); };
  struct ClearProcessingMessage {
    std::function<void(const Json&)>& callback;
    ~ClearProcessingMessage() { callback = {}; }
  } clearProcessingMessage{processingMessage};
  // Set once the runner exists. The kernel emits its terminal job_update
  // last, after every actor finished, so the outputs are complete then.
  const Runner* active = nullptr;
  auto deliver = [&](const Json& msg) {
    if (terminal) return;
    terminal = isTerminal(msg);
    if (!terminal) {
      send(msg, false);
      return;
    }
    job.finished = true;
    // The server follows the kernel's terminal update with the summary when
    // the run collected outputs.
    const Json* outputs = active ? &active->outputs() : nullptr;
    const bool summary = outputs && !outputs->empty();
    send(msg, !summary);
    if (summary) send(jobSummary(job, msg, *outputs), true);
  };

  Json graph;
  Json params = Json::object();
  Json triggerEvent;
  try {
    graph = Json::parse(job.graph);
    if (!job.params.empty()) params = Json::parse(job.params);
    if (!job.triggerEvent.empty()) {
      triggerEvent = Json::parse(job.triggerEvent);
      if (!triggerEvent.is_object() || !triggerEvent.contains("node_id") ||
          !triggerEvent["node_id"].is_string() || triggerEvent["node_id"].get<std::string>().empty()) {
        throw std::runtime_error("trigger event requires a nonempty node_id");
      }
    }
  } catch (const std::exception& e) {
    job.finished = true;
    send(jobUpdate(job, "failed", std::string("Invalid graph or params JSON: ") + e.what()), true);
    return;
  }

  interrupted = false;
  Loop& loop = Loop::current();
  Guest& guest = *context->guest;
  js::Engine& engine = *context->engine;
  bool unknownState = false;
  std::string failure;
  {
    RunOptions runOptions;
    runOptions.jobId = job.id;
    runOptions.workflowId = job.workflowId;
    runOptions.triggerEvent = std::move(triggerEvent);
    if (executionState || options.supervisor.decide) {
      runOptions.executionPolicy = std::make_shared<ExecutionPolicy>();
      runOptions.executionPolicy->state = executionState;
      runOptions.executionPolicy->userId = options.context.userId;
      runOptions.executionPolicy->cacheNodeTypes.insert(options.cacheNodeTypes.begin(), options.cacheNodeTypes.end());
      if (options.durableInboxes) runOptions.durableState = executionState;
    }
    if (options.supervisor.decide) {
      configurePublicSupervisor(*runOptions.executionPolicy, options.supervisor, job.id);
    }
    Runner runner(*context->catalog, deliver, std::move(runOptions));
    active = &runner;
    // Tells this run apart from every other, also from runs with the same
    // job id in this or another runner.
    const host::RunIdentity identity = host::newRunIdentity(job.id, account->openRun());
    AsyncRun async(engine, loop, tracker, job.generation, lanes->cpu(), identity);
    // Host functions submit to this run while it lasts. Asynchronous context
    // callbacks and file jobs run on the I/O lane, HTTP fetches on the
    // network lane. Unbound before `async` is destroyed.
    RunBinding::Scope bound(engine, async, lanes->io(), &lanes->network());
    // Provider jobs started from here on belong to this run.
    currentRun->set(identity);
    bool cancelForwarded = false;
    auto onCancel = [&](const CancelSnapshot& cancel) {
      if (!cancelForwarded) {
        cancelForwarded = true;
        runner.cancel();
        // Abort listeners in the guest run now, not at a later poll.
        try {
          const js::Value hook = engine.get(engine.global(), "__hostAbort");
          if (engine.isObject(hook)) engine.call(engine.get(hook, "cancel"), hook, {});
        } catch (const std::exception&) {
          // A listener that throws must not stop the cancel.
        }
      }
      // Timers due within the cancel grace period still fire, so work
      // waiting on a short timer can unwind. Later ones are dropped.
      loop.limitTimers(cancel.deadline.value_or(Clock::now()));
    };
    // Live property changes run as macrotasks of the run, one at a time.
    LiveWork live;
    live.pending = [this] { return liveUpdatesPending.load(); };
    live.dispatchOne = [this, &runner] {
      LiveUpdate update;
      {
        std::lock_guard lock(mutex);
        if (liveUpdates.empty()) return;
        update = std::move(liveUpdates.front());
        liveUpdates.pop_front();
        liveUpdatesPending = !liveUpdates.empty();
      }
      try {
        runner.updateNodeProperties(update.nodeId, update.properties);
      } catch (const std::exception& e) {
        // A node that refuses the values keeps the ones it has.
        logLine("WARN", kLog, "live property change of node " + update.nodeId + " failed: " + e.what());
      }
    };
    try {
      guest.begin(job.id, job.workflowId);
      auto task = runner.run(std::move(graph), std::move(params));
      // Pending timers and jobs keep the run going until its task finishes,
      // as they keep the server's run going. Timers still pending then are
      // dropped, and later job results are discarded.
      EngineRunControl control(engine, async, cancelState, job.generation, [&task] { return task.done(); },
                               onCancel, std::move(live));
      const RunExit exit = loop.run(control);
      if (!task.done()) {
        failure = exit == RunExit::Deadline ? "The run did not unwind within the cancel grace period"
                                            : "The run stalled with nodes still waiting";
      }
    } catch (const std::exception& e) {
      failure = e.what();
    }
    // Teardown order: stop and detach the run's jobs, then drop timers and
    // frames, then release run resources.
    async.teardown();
    loop.clearTimers();
    // Frames left after the loop went idle can never finish. They hold
    // engine values and point into this runner, so they go first.
    if (!failure.empty() || loop.liveFrames() > 0) {
      if (failure.empty()) failure = "The run left suspended work behind";
      unknownState = true;
      loop.abandon();
    }
    // A run that never reached the kernel's terminal update gets one from
    // here. Like the server's own terminal update for a run that threw, it
    // carries an empty result.
    if (!terminal) {
      const bool cancelled = job.cancelRequested;
      Json msg = jobUpdate(job, cancelled ? "cancelled" : "failed", cancelled ? "" : failure);
      msg["result"] = Json{{"outputs", Json::object()}};
      terminal = true;
      job.finished = true;
      send(msg, true);
    }
    // The run's provider jobs end with it (design section 4.10): after its
    // terminal update, before the engine serves another run. Closing them
    // stops their workers and releases their tombstones, and a next still
    // waiting completes into the closed mailbox.
    currentRun->set({});
    if (options.providerJobs) options.providerJobs->retireRun(identity);
  }
  // JavaScript cut off mid-call may have left the guest's own state half
  // updated. Read after the Runner destructor, whose release calls can also
  // be interrupted.
  if (interrupted) {
    unknownState = true;
    if (failure.empty()) failure = "JavaScript was interrupted";
  }
  context->engine->releaseRunResources();
  host::endRun(*context->engine, job.id);
  if (unknownState) {
    logLine("WARN", kLog, "discarding the JavaScript context: " + failure);
    {
      std::lock_guard lock(mutex);
      isReady = false;
    }
    context.reset();
  }
}

std::shared_ptr<AdmissionLedger> newAdmissionLedger(AdmissionLimits limits) {
  nodetool::jobs::ProcessLimits process;
  process.bytes = limits.bytes;
  process.operations = limits.operations;
  process.javaScriptBytes = limits.javaScriptBytes;
  return std::make_shared<AdmissionLedger>(process);
}

GraphRunner::GraphRunner(std::string bundlePath, HostOptions options) {
  if (options.bundleAssetsDir.empty()) {
    std::string dir = defaultBundleAssetsDir(bundlePath);
    std::error_code ec;
    if (std::filesystem::is_directory(dir, ec)) options.bundleAssetsDir = std::move(dir);
  }
  impl_ = std::make_unique<Impl>(std::move(bundlePath), std::move(options));
}

GraphRunner::~GraphRunner() {
  {
    std::lock_guard lock(impl_->mutex);
    impl_->stopping = true;
    for (auto& job : impl_->queue) job->cancelRequested = true;
    if (impl_->active) impl_->active->cancelRequested = true;
  }
  // Stops a load or a long JavaScript call at once.
  impl_->cancelState.interruptNow();
  {
    std::lock_guard lock(impl_->mutex);
    if (impl_->workerLoop) impl_->workerLoop->wake();
  }
  impl_->changed.notify_all();
  impl_->worker.join();
}

bool GraphRunner::ready() const {
  std::lock_guard lock(impl_->mutex);
  return impl_->isReady;
}

std::string GraphRunner::loadError() const {
  std::lock_guard lock(impl_->mutex);
  return impl_->error;
}

bool GraphRunner::waitUntilLoaded(int timeoutMs) const {
  std::unique_lock lock(impl_->mutex);
  impl_->changed.wait_for(lock, std::chrono::milliseconds(timeoutMs),
                          [this] { return impl_->loadFinished; });
  return impl_->isReady;
}

std::vector<std::string> GraphRunner::supportedNodeTypes() const {
  std::lock_guard lock(impl_->mutex);
  return {impl_->runnable.begin(), impl_->runnable.end()};
}

std::string GraphRunner::unsupportedReason(const std::string& graphJson) const {
  Json graph;
  try {
    graph = Json::parse(graphJson);
  } catch (const std::exception& e) {
    return std::string("Invalid graph JSON: ") + e.what();
  }
  if (!graph.is_object() || !graph.contains("nodes") || !graph["nodes"].is_array() ||
      !graph.contains("edges") || !graph["edges"].is_array()) {
    return "The graph needs nodes and edges arrays";
  }
  std::lock_guard lock(impl_->mutex);
  if (!impl_->isReady) {
    return impl_->error.empty() ? "The local graph runner is loading"
                                : "The local graph runner failed to load: " + impl_->error;
  }
  // normalizeGraph prunes editor-only nodes and the edges that touch them.
  std::set<std::string> pruned;
  for (const auto& node : graph["nodes"]) {
    if (!node.is_object() || !node.contains("type") || !node["type"].is_string()) continue;
    const std::string type = node["type"].get<std::string>();
    if (isEditorOnlyType(type)) {
      if (node.contains("id") && node["id"].is_string()) pruned.insert(node["id"].get<std::string>());
      continue;
    }
    if (!impl_->runnable.count(type)) {
      const auto missing = impl_->unavailable.find(type);
      return "Node type " + type + " does not run locally" +
             (missing == impl_->unavailable.end() ? "" : ": it needs " + missing->second);
    }
    const Json ui = node.value("ui_properties", Json::object());

  }
  auto touchesPruned = [&pruned](const Json& edge, const char* end) {
    return edge.contains(end) && edge[end].is_string() && pruned.count(edge[end].get<std::string>());
  };
  for (const auto& edge : graph["edges"]) {
    if (!edge.is_object() || touchesPruned(edge, "source") || touchesPruned(edge, "target")) continue;
    Json type = edge.contains("edge_type") && !edge["edge_type"].is_null() ? edge["edge_type"]
                                                                            : edge.value("type", Json());

  }
  return {};
}

void GraphRunner::submit(std::string jobId, std::string workflowId, std::string graphJson,
                         std::string paramsJson, MessageHandler onMessage, std::string triggerEventJson) {
  auto job = std::make_shared<Job>();
  job->id = std::move(jobId);
  job->workflowId = std::move(workflowId);
  job->graph = std::move(graphJson);
  job->params = std::move(paramsJson);
  job->triggerEvent = std::move(triggerEventJson);
  job->handler = std::move(onMessage);
  {
    std::lock_guard lock(impl_->mutex);
    if (impl_->stopping) job->cancelRequested = true;
    impl_->queue.push_back(std::move(job));
  }
  impl_->changed.notify_all();
}

bool GraphRunner::cancel(const std::string& jobId) {
  std::lock_guard lock(impl_->mutex);
  if (impl_->active && impl_->active->id == jobId && !impl_->active->finished) {
    if (!impl_->active->cancelRequested.exchange(true)) {
      // The request and its deadline are published together. The loop is
      // woken after the cancel state is unlocked.
      impl_->cancelState.request(impl_->active->generation, Clock::now() + kCancelGrace);
      if (impl_->workerLoop) impl_->workerLoop->wake();
    }
    return true;
  }
  for (auto& job : impl_->queue) {
    if (job->id == jobId) {
      job->cancelRequested = true;
      return true;
    }
  }
  return false;
}

bool GraphRunner::updateNodeProperties(const std::string& jobId, const std::string& nodeId,
                                       const std::string& propertiesJson) {
  if (nodeId.empty()) return false;
  Json properties = Json::parse(propertiesJson, nullptr, false);
  if (!properties.is_object()) return false;
  std::lock_guard lock(impl_->mutex);
  const auto& job = impl_->active;
  if (!job || job->id != jobId || job->finished || job->cancelRequested) return false;
  impl_->liveUpdates.push_back({nodeId, std::move(properties)});
  impl_->liveUpdatesPending = true;
  if (impl_->workerLoop) impl_->workerLoop->wake();
  return true;
}

int GraphRunner::contextLoads() const {
  std::lock_guard lock(impl_->mutex);
  return impl_->loads;
}

std::vector<uint8_t> compileBundle(const std::string& source, const std::string& filename) {
  auto engine = js::createQuickJsEngine();
  Guest guest(*engine);
  return guest.compile(source, filename);
}

bool isBundleBytecode(const std::vector<uint8_t>& bundle) { return Guest::isBytecode(bundle); }

}  // namespace gr
