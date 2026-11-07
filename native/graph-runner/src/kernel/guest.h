// The kernel's view of the guest bundle (guest/entry.mjs). Owns the
// `globalThis.__host` functions and turns guest promises into Tasks.
#pragma once

#include "js/engine.h"
#include "kernel/executor.h"
#include "kernel/json.h"
#include "nodetool/graph_runner.h"

#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace gr {

class Guest {
public:
  explicit Guest(js::Engine& engine, HostOptions options = {});

  // Loads a bundle: ES module source, or bytecode written by compile(). The
  // module may use top-level await. Loading runs the calling thread's loop
  // (jobs and timers) until the module's evaluation settles, and drops the
  // timers still pending then. `stop` is polled while the load waits for a
  // timer; returning true abandons the load. Throws when the module throws
  // or never settles.
  void load(const std::vector<uint8_t>& bundle, const std::string& filename,
            const std::function<bool()>& stop = {});
  static bool isBytecode(const std::vector<uint8_t>& bundle);
  // Compiles bundle source, an ES module, to bytecode for this engine build.
  std::vector<uint8_t> compile(const std::string& source,
                               const std::string& filename);

  // Starts a run: the identity node code sees as context.jobId/workflowId.
  void begin(const std::string& jobId, const std::string& workflowId);
  // Registry entry per node type, as the server's graph node type resolver
  // returns it: {nodeType, propertyTypes, outputs, descriptorDefaults, ...}.
  Json types();

  // Class flags for a node, or nullopt when the guest has no such type.
  std::optional<Json> describe(const Json& node);
  // Property and platform issues, as the TypeScript registry validators.
  Json validate(const Json& node, const std::vector<std::string>& connected);
  // Throws when the guest has no such type.
  std::unique_ptr<Executor> create(const Json& node);

  // Used by GuestExecutor.
  Task<Json> callSettled(js::Value promise);
  js::Value api(const std::string& name);
  js::Engine& engine() { return engine_; }
  int registerIo(StreamIO* io);
  void unregisterIo(int id) { ios_.erase(id); }

  // Drains the engine's job queue. Installed as the loop pump.
  bool pump() { return engine_.drainJobs() > 0; }

private:
  void installHost();
  void settleEvaluation(const js::Value& result, const std::function<bool()>& stop);
  StreamIO& io(const js::Value& id);
  std::string callString(const std::string& fn, std::vector<js::Value> args);

  js::Engine& engine_;
  HostOptions options_;
  js::Value nodetool_;
  std::map<int, StreamIO*> ios_;
  int nextIo_ = 1;
};

}  // namespace gr
