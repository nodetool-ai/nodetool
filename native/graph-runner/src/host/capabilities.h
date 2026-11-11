// Host capabilities: what node code can reach beyond the JavaScript engine.
//
// Each capability is a named group of functions installed on the guest as
// globalThis.__host.<name>.<function>. It lives in its own file in this
// directory and is listed once in capabilities.cpp. Its guest-side wrapper
// lives in guest/host/<name>.mjs, and guest/build.mjs maps the module
// specifiers node code imports onto that wrapper.
//
// Capability functions run on the runner's worker thread, between kernel
// steps, and may block. They exchange bytes as Uint8Array (Engine::bytes /
// Engine::toBytes) and throw std::exception to raise a JavaScript Error.
#pragma once

#include "js/engine.h"
#include "kernel/json.h"
#include "nodetool/graph_runner.h"

#include <optional>
#include <string>
#include <vector>

namespace gr::host {

struct Capability {
  const char* name;
  // Adds the capability's functions to `object`, which becomes
  // __host.<name>. `options` is the embedder's configuration for this runner.
  void (*install)(js::Engine& engine, const js::Value& object,
                  const HostOptions& options);
  // Optional. Rewrites an outgoing ProcessingMessage that holds values only
  // this host can read, such as GPU texture handles, into portable ones.
  // Returns nullopt when the message needs no change. Runs on the worker
  // thread before the message reaches the job's handler.
  std::optional<Json> (*boundary)(js::Engine& engine, const Json& message) = nullptr;
  // Optional. Called after a job's last message was delivered, to free what
  // the run held.
  void (*endRun)(js::Engine& engine, const std::string& jobId) = nullptr;
};

// Every capability, installed into each new guest context.
const std::vector<Capability>& capabilities();

// Applies every capability's boundary rewrite to `message`. Returns nullopt
// when no capability changed it.
std::optional<Json> atBoundary(js::Engine& engine, const Json& message);

// Calls every capability's endRun for `jobId`.
void endRun(js::Engine& engine, const std::string& jobId);

}  // namespace gr::host
