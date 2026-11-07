#pragma once
#include "nodetool/context_options.h"
#include <cstddef>
#include <functional>
#include <memory>
#include <string>
#include <vector>
namespace gr::host {
// Provider endpoint calls (callEndpoint, uploadMedia, downloadMedia) can run
// for minutes. ProviderJobs runs each call on its own thread and grants the
// guest four short context operations per provider, so the runner thread never
// waits on a vendor:
//
//   provider:<id>:jobs:put    {upload?, data}          -> {upload}
//   provider:<id>:jobs:start  {method, args | upload}  -> {job}
//   provider:<id>:jobs:poll   {job}                    -> {state, ...}
//   provider:<id>:jobs:close  {job}                    -> null
//
// Poll answers one state at a time: "pending", "progress" with `event`,
// "part" with `data`, "done" with `value` (absent after parts), or "error"
// with `message`. A request or result larger than one part travels as
// consecutive parts of its JSON text: `put` appends request parts under an
// upload id that `start` names, and `poll` returns result parts before "done".
// `close` cancels a running call and frees the job. Its name ends in ":close",
// so the context lets it through after the run is cancelled.
class ProviderJobs {
public:
  struct Call {
    std::string provider;
    // callEndpoint, uploadMedia or downloadMedia.
    std::string method;
    // The guest's arguments as JSON text. Bytes are {"__bytes__": base64}.
    std::string argsJson;
    // Reports a progress event, given as JSON text. Safe from any thread.
    std::function<void(const std::string &eventJson)> progress;
    // True once the guest closed the job or the jobs object is shutting down.
    std::function<bool()> cancelled;
  };
  // Runs on the job's thread. Returns the result as JSON text or throws.
  using Worker = std::function<std::string(const Call &)>;
  struct Limits {
    // Largest JSON text a single put or poll carries.
    size_t partBytes = 256 * 1024;
    // Calls that may run at the same time.
    size_t maxJobs = 8;
    // Largest request a sequence of puts may assemble.
    size_t maxRequestBytes = 256 * 1024 * 1024;
    // Progress events kept per job before the oldest are dropped.
    size_t maxQueuedEvents = 64;
  };
  explicit ProviderJobs(Worker worker);
  ProviderJobs(Worker worker, Limits limits);
  // Cancels running calls and waits for their threads.
  ~ProviderJobs();
  ProviderJobs(const ProviderJobs &) = delete;
  ProviderJobs &operator=(const ProviderJobs &) = delete;

  // Adds the four operations for each provider id to `options`. The
  // operations keep this object's state alive, but calls stop when it is
  // destroyed.
  void grant(ContextOptions &options, const std::vector<std::string> &providers);

private:
  struct State;
  std::shared_ptr<State> state_;
};
} // namespace gr::host
