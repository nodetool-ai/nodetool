#pragma once
#include <cstddef>
#include <functional>
#include <map>
#include <memory>
#include <stop_token>
#include <string>
#include <utility>
namespace nodetool::jobs {
// A run's account in the admission ledger
// (native/jobs/include/nodetool/jobs/admission.h). Opaque to embedders.
class RunAccount;
} // namespace nodetool::jobs
namespace gr::host {

// What an asynchronous context callback reports: a JSON response, or an
// error the guest sees as a rejected Error.
//
// Thread affinity: none. A plain value, moved into the completion.
struct ContextResult {
  static ContextResult value(std::string json) { return {true, std::move(json)}; }
  static ContextResult error(std::string message) { return {false, std::move(message)}; }
  bool ok = true;
  // The JSON response when ok, otherwise the error message.
  std::string text;
};

// One run of a graph, as host code tells runs apart. The runner creates one
// for each run, and it never changes. Two identities are the same run only
// when they are the same object, so two runs with the same public job id,
// in one runner or in two, stay apart.
//
// Thread affinity: none. Immutable after creation.
struct RunTag {
  // The run's public job id, for reports and the provider worker.
  std::string jobId;
  // The admission account the run's host jobs are charged to, provider jobs
  // included. GraphRunner sets it. Empty: each user picks its own account
  // on the process ledger.
  std::shared_ptr<nodetool::jobs::RunAccount> account;
};
// Shared: the runner, every context call of the run and every provider job
// filed under it hold the same tag, and its address identifies the run while
// any of them is alive.
using RunIdentity = std::shared_ptr<const RunTag>;
inline RunIdentity newRunIdentity(std::string jobId, std::shared_ptr<nodetool::jobs::RunAccount> account = {}) {
  return std::make_shared<const RunTag>(RunTag{std::move(jobId), std::move(account)});
}

class ContextCompletionState;

// The one-shot completion of an asynchronous context call. Move-only.
//
// Thread affinity: none. Call it once, from any thread. Like any object, one
// completion is used by one thread at a time; its outcome state is shared
// with the runner under a mutex.
//
// The first terminal outcome of the call wins and later ones are discarded:
// calling the completion, the callback throwing, the run being stopped
// (an AbortError), or the last completion being destroyed uncalled (an
// Error). While the callback is still running, a throw beats destruction of
// the uncalled completion, so the guest sees the thrown message. A moved-from
// or already called completion is empty: destroying it does nothing, and
// calling it is ignored and asserts in debug builds.
//
// A completion that outlives its run is still safe to call. The result is
// destroyed on the calling thread and never reaches the runner thread.
class ContextCompletion {
 public:
  ContextCompletion() = default;
  explicit ContextCompletion(std::shared_ptr<ContextCompletionState> state);
  ContextCompletion(ContextCompletion&& other) noexcept = default;
  // Assigning over an uncalled completion drops it, as its destructor would.
  ContextCompletion& operator=(ContextCompletion&& other) noexcept;
  ContextCompletion(const ContextCompletion&) = delete;
  ContextCompletion& operator=(const ContextCompletion&) = delete;
  ~ContextCompletion();

  void operator()(ContextResult result);
  // False once called or moved from.
  explicit operator bool() const { return state_ != nullptr; }
  // The run that made the call, fixed on the runner thread when the call was
  // submitted. Empty when the run has no identity, or once this completion
  // was called or moved from.
  RunIdentity run() const;

 private:
  void drop() noexcept;
  std::shared_ptr<ContextCompletionState> state_;
};

// JSON operations are exact-name grants. Callback implementations must cooperate
// with cancelled() during blocking work. No process-wide service is discovered.
struct ContextOptions {
  using Callback = std::function<std::string(const std::string&)>;
  // An asynchronous operation. Runs on the host I/O lane, never on the runner
  // thread (except with HostOptions::inlineHostJobs, where every host job
  // runs inline), and may block. It receives the request JSON, a stop token
  // and the completion, which it may keep and call later from any thread.
  // Returning without calling or keeping the completion fails the call.
  //
  // The token is stopped when the run's cancellation begins (except for a
  // provider:<id>:close cleanup call), when the run ends, or when the host
  // lane shuts down while the callback runs. Stop callbacks registered on it
  // run on the I/O lane's reaper thread, never on the runner thread, so one
  // that blocks delays only that lane's stop requests. With
  // HostOptions::inlineHostJobs, or after the lane shut down, they run on the
  // thread that requested the stop. They should still only set flags or
  // issue a non-blocking wake (docs/plans/graph-runner-async-host.md,
  // section 4.9).
  //
  // done.run() names the run that submitted the call. It was fixed on the
  // runner thread at submission, so a callback that runs after its run ended
  // still knows which run it serves.
  //
  // The callback and everything it captures stay alive until the call has
  // ended and its completion is gone, which can be after the GraphRunner is
  // destroyed. Captures must therefore own what they use, never a raw
  // pointer to the embedder's runner or window.
  using AsyncCallback = std::function<void(std::string request, std::stop_token stop, ContextCompletion done)>;
  std::map<std::string, Callback> operations;
  // Operations called through the asynchronous transport. A name may be in
  // one map only: a name in both fails when the context is installed. Both
  // maps share the call count, payload limits and cancellation checks.
  std::map<std::string, AsyncCallback> asyncOperations;
  std::function<bool()> cancelled;
  std::string modelOptionsJson = "{}";
  std::string userId = "default";
  std::string environmentJson = "{}";
  // Authorized SandboxModuleResolution; no filesystem package discovery.
  std::string sandboxModuleResolutionJson = "null";
  // Array of InjectedTool metadata; each entry also needs a tool:<name> grant.
  std::string toolDefinitionsJson = "[]";
  // Explicit read grant for native OCR language models. Empty disables OCR.
  std::string ocrDataDirectory;
  size_t maxPayloadBytes = 1024 * 1024;
  size_t maxCalls = 10000;
  // Largest single message text for the "message" operation. Messages do not
  // count toward maxCalls or maxPayloadBytes.
  size_t maxMessageBytes = 64 * 1024 * 1024;
};
}
