// What the kernel calls to run one node's body. GuestExecutor runs the
// TypeScript class inside the JavaScript engine. OutputExecutor is the
// kernel-level `nodetool.output.Output` node, which runs natively.
#pragma once

#include "kernel/inbox.h"
#include "kernel/json.h"
#include "kernel/task.h"

#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace gr {

// The streaming I/O a node's run(inputs, outputs) sees. Implemented by the
// actor; mirrors NodeInputs/NodeOutputs in packages/execution-core/src/io.ts.
class StreamIO {
public:
  virtual ~StreamIO() = default;
  // Next envelope on `handle`, or on any handle when unset.
  virtual Task<std::optional<std::pair<std::string, Envelope>>> next(
      std::optional<std::string> handle) = 0;
  // `value` unset means JavaScript `undefined`.
  virtual Task<void> emit(std::string slot, std::optional<Json> value,
                          std::optional<Lineage> lineage) = 0;
  virtual Task<void> emitGroup(Json values, std::optional<Lineage> lineage) = 0;
  virtual Task<void> drop(std::string slot, Lineage lineage) = 0;
  virtual void complete(const std::string& slot) = 0;
  virtual bool hasBuffered(const std::string& handle) = 0;
  virtual bool hasStream(const std::string& handle) = 0;
  virtual Scope scopeFor(const std::string& handle) = 0;
  virtual Scope invocationScope() = 0;
};

// Steps an async generator. next() yields each frame, nullopt at the end.
class FrameIterator {
public:
  virtual ~FrameIterator() = default;
  virtual Task<std::optional<Json>> next() = 0;
};

class Executor {
public:
  virtual ~Executor() = default;
  virtual void beginInvocation(const std::string&) {}
  virtual Task<void> initialize() = 0;
  virtual Task<void> preProcess() = 0;
  virtual Task<void> finalize() = 0;
  virtual Task<Json> process(Json inputs) = 0;
  virtual std::unique_ptr<FrameIterator> genProcess(Json inputs) = 0;
  virtual bool hasRun() const = 0;
  // Returns the slot -> last emitted value map (NodeOutputs.collected()).
  virtual Task<Json> run(StreamIO& io) = 0;
};

// A failure raised by node code, carrying the message the TypeScript actor
// reports (`err.message`).
class NodeError : public std::runtime_error {
public:
  using std::runtime_error::runtime_error;
};

// The guest's step for an Output value that holds bytes or a media ref (see
// output_node.cpp). Without one, every value passes through unchanged.
using OutputValueStep = std::function<Task<Json>(Json value)>;
std::unique_ptr<Executor> makeOutputExecutor(const Json& properties,
                                             OutputValueStep valueStep = nullptr);

}  // namespace gr
