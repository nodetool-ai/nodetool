// The kernel's view of the guest bundle (guest/entry.mjs). Owns the
// `globalThis.__host` functions and turns guest promises into Tasks.
#pragma once

#include "js/engine.h"
#include "kernel/executor.h"
#include "kernel/json.h"
#include "kernel/wire.h"
#include "nodetool/graph_runner.h"

#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace gr {

// What a guest function returned or passed: JSON text, and the bytes of
// the value, which the text names with {"__blob__": <index>} markers
// (kernel/wire.h). The bytes were copied out of the guest when it wrote the
// text, so a later change to the guest's buffer never reaches them.
//
// Thread affinity: worker only, like the engine it was read from.
struct GuestReply {
  std::string text;
  std::vector<Blob> blobs;

  // Parses the text and puts the bytes in place of their markers.
  Json parse() const;
};

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
  // json {buildId, types, flags} for <bundle>.assets/types.json, from a
  // guest that loaded every node module, or "null" (guest/parity/profile.mjs).
  std::string typeSnapshot();

  // Class flags for a node, or nullopt when the guest has no such type.
  std::optional<Json> describe(const Json& node);
  // Property and platform issues, as the TypeScript registry validators.
  Json validate(const Json& node, const std::vector<std::string>& connected);
  // Throws when the guest has no such type.
  std::unique_ptr<Executor> create(const Json& node);

  // A value for a guest function, as two arguments: its JSON text, and the
  // object that holds its bytes by index, or undefined for a value without
  // bytes. Each byte value is copied into a new JavaScript buffer, so the
  // node that reads it may change it and no other reader sees the change.
  struct Passed {
    js::Value text;
    js::Value blobs;
  };
  static Passed pass(js::Engine& engine, const Json& value);
  // The object that holds `blobs` by index for a guest function, or
  // undefined when there are none.
  static js::Value bytesOf(js::Engine& engine, const std::vector<Blob>& blobs);
  // Reads what a guest function returned or passed: a string, or an object
  // {text, blobs} whose blobs __host.blob() made. Takes the bytes out of
  // the guest's handles.
  static GuestReply reply(js::Engine& engine, const js::Value& value);
  // The same for a value passed as two arguments, text and blobs.
  static GuestReply reply(js::Engine& engine, const js::Value& text, const js::Value& blobs);

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
  // Calls fn and drains jobs until its promise settles. Throws on rejection.
  std::string settleNow(const std::string& fn, std::vector<js::Value> args);
  // Evaluates the deferred module of node.type when the guest has not yet.
  void ensureType(const Json& node);

  js::Engine& engine_;
  HostOptions options_;
  js::Value nodetool_;
  // The blobs __host.blob() made and no reply has taken yet (guest.cpp).
  struct Transit;
  // native-rules #1: shared so the __host.blob function and the run
  // cleanup, which the engine stores and may call after this Guest is
  // gone, can hold weak references. This Guest holds the only strong one.
  std::shared_ptr<Transit> transit_;
  std::map<int, StreamIO*> ios_;
  int nextIo_ = 1;
};

}  // namespace gr
