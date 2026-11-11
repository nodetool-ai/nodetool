#pragma once
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "nodetool/context_options.h"
#include <algorithm>
#include <atomic>
#include <cstddef>
#include <functional>
#include <stdexcept>
#include <string>
namespace gr::host {
// Installs __host.context. Throws std::invalid_argument when a name is in
// both grant maps (checkGrantMaps).
void installContext(js::Engine&, const js::Value&, const ContextOptions&);

// A name may be granted for one transport only. Throws std::invalid_argument
// naming the first operation found in both `operations` and
// `asyncOperations`.
void checkGrantMaps(const ContextOptions& options);

// The rules every context call obeys, whichever grant map or transport serves
// it. The request side runs before the callback starts and the response side
// after it returns, so an asynchronous call checks the response later, on the
// worker, when its result settles. Thread-safe: the call counter is atomic and
// limits are fixed at construction.
class ContextCallRules {
 public:
  explicit ContextCallRules(const ContextOptions& options)
      : cancelled_(options.cancelled), maxPayloadBytes_(options.maxPayloadBytes), maxCalls_(options.maxCalls) {}

  // Stream cleanup (`provider:<id>:close`) is permitted after cancellation and
  // after the call budget. It still obeys the payload limits.
  static bool isCleanup(const std::string& operation) {
    return operation.starts_with("provider:") && operation.ends_with(":close");
  }

  // Throws unless `operation` is granted in `grants`; returns its callback.
  template <class Map>
  static const typename Map::mapped_type& grant(const Map& grants, const std::string& operation) {
    auto found = grants.find(operation);
    if (found == grants.end()) throw std::runtime_error("ProcessingContext service '" + operation + "' is not granted");
    return found->second;
  }

  // Request admission: cancellation, then call count. Runs before the payload
  // is converted, so a cancelled or exhausted run never runs payload code, and
  // a payload whose conversion throws still consumes a call.
  void admit(const std::string& operation) {
    if (isCleanup(operation)) return;
    if (cancelled_ && cancelled_()) throw std::runtime_error("Run cancelled");
    if (++calls_ > maxCalls_) throw std::runtime_error("Context call limit exceeded");
  }

  // Request size, checked after the payload is converted.
  void checkRequestSize(size_t requestBytes) const {
    if (requestBytes > maxPayloadBytes_) throw std::runtime_error("Context request size limit exceeded");
  }

  // Cancellation and response size, in that order. A cancelled run's
  // response throws JobAborted, so an asynchronous call rejects with an
  // AbortError however its result and the cancellation were ordered. call()
  // throws it as the Error "Run cancelled", as before.
  void checkResponse(const std::string& operation, size_t responseBytes) const {
    if (!isCleanup(operation) && cancelled_ && cancelled_()) throw nodetool::jobs::JobAborted("Run cancelled");
    if (responseBytes > maxPayloadBytes_) throw std::runtime_error("Context response size limit exceeded");
  }

  // Run cleanup restores the call budget.
  void resetCalls() { calls_ = 0; }

 private:
  std::function<bool()> cancelled_;
  size_t maxPayloadBytes_;
  size_t maxCalls_;
  std::atomic<size_t> calls_{0};
};

// Fake providers: no provider or prediction grant may reach an embedder
// callback. Applies to any grant map.
template <class Map>
void dropProviderGrants(Map& grants) {
  std::erase_if(grants, [](const auto& entry) {
    return entry.first.starts_with("provider:") || entry.first.starts_with("prediction:");
  });
}
}
