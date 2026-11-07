// Engine-neutral JavaScript interface, shaped after React Native's JSI.
//
// The kernel talks to the guest only through this header. It never includes
// an engine's own headers, so a second backend (V8, Hermes, JSC) can be added
// behind createQuickJsEngine()'s siblings without touching the kernel.
#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <map>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace gr::js {

class Engine;
struct NativePayload { virtual ~NativePayload() = default; };

// A reference to a value owned by an Engine. Copies share the reference.
// Every Value must be released before its Engine is destroyed.
class Value {
public:
  struct Impl {
    virtual ~Impl() = default;
  };

  Value() = default;
  explicit Value(std::shared_ptr<Impl> impl) : impl_(std::move(impl)) {}

  bool empty() const { return !impl_; }
  const std::shared_ptr<Impl>& impl() const { return impl_; }

private:
  std::shared_ptr<Impl> impl_;
};

// A JavaScript exception surfaced to C++. `what()` is the error's message.
class JsError : public std::runtime_error {
public:
  using std::runtime_error::runtime_error;
};

// A C++ function callable from JavaScript. Throwing a std::exception raises a
// JavaScript Error with the same message.
using HostFunction =
    std::function<Value(Engine&, const std::vector<Value>& args)>;

// A pending promise with the functions that settle it.
struct PromiseCapability {
  Value promise;
  Value resolve;
  Value reject;
};

class Engine {
public:
  virtual ~Engine() = default;
  // Called by hosts at run end, and before context teardown. Cleanup must not
  // retain engine Values and must be safe to repeat.
  void addRunCleanup(std::function<void()> cleanup) { cleanups_.push_back(std::move(cleanup)); }
  // Dependency modules such as Yoga share their native state across runs.
  // Release their callbacks and memory while the JavaScript context is alive.
  void addContextCleanup(std::function<void()> cleanup) { contextCleanups_.push_back(std::move(cleanup)); }
  void releaseContextResources() {
    auto callbacks = std::move(contextCleanups_);
    contextCleanups_.clear();
    for (auto& callback : callbacks) callback();
  }
  void releaseRunResources() { for (auto& cleanup : cleanups_) cleanup(); }
  // Trusted per-context native state. Never exposed as a guest property or
  // indexed by a caller-controlled run id. State must not retain JS Values.
  void setHostState(const std::string& name, std::shared_ptr<NativePayload> state) {
    if (!hostStates_.emplace(name, std::move(state)).second) {
      throw std::logic_error("host state already installed: " + name);
    }
  }
  std::shared_ptr<NativePayload> hostState(const std::string& name) const {
    const auto it = hostStates_.find(name);
    return it == hostStates_.end() ? nullptr : it->second;
  }
private:
  std::map<std::string, std::shared_ptr<NativePayload>> hostStates_;
  std::vector<std::function<void()>> cleanups_;
  std::vector<std::function<void()>> contextCleanups_;
public:

  // Script loading. compileScript returns engine-specific bytecode that
  // evaluateBytecode accepts; it is valid only for the same engine build.
  virtual Value evaluateScript(std::string_view source,
                               const std::string& filename) = 0;
  virtual std::vector<uint8_t> compileScript(std::string_view source,
                                             const std::string& filename) = 0;
  // Module loading. A module may use top-level await, so evaluating one
  // returns the promise of its evaluation, which settles as the job queue
  // (and any timers it waits on) runs. Modules cannot import other modules:
  // a bundle is one self-contained module. compileModule returns bytecode
  // for evaluateBytecode, which then also returns the evaluation promise.
  virtual Value evaluateModule(std::string_view source,
                               const std::string& filename) = 0;
  virtual std::vector<uint8_t> compileModule(std::string_view source,
                                             const std::string& filename) = 0;
  virtual Value evaluateBytecode(const std::vector<uint8_t>& bytecode) = 0;

  // Value construction.
  virtual Value global() = 0;
  virtual Value undefined() = 0;
  virtual Value null() = 0;
  virtual Value boolean(bool b) = 0;
  virtual Value number(double d) = 0;
  virtual Value string(std::string_view s) = 0;
  virtual Value object() = 0;
  // Opaque native payload, finalized with its JS object. Never readable by JS.
  virtual Value nativeObject(std::shared_ptr<NativePayload> payload) = 0;
  virtual std::shared_ptr<NativePayload> nativePayload(const Value& object) = 0;
  virtual Value function(const std::string& name, unsigned arity,
                         HostFunction fn) = 0;

  // Byte arrays. bytes() makes a Uint8Array holding a copy of the data.
  // isBytes is true for an ArrayBuffer or any typed array view, and toBytes
  // copies out the bytes that view covers.
  virtual Value bytes(const uint8_t* data, size_t size) = 0;
  virtual bool isBytes(const Value& v) = 0;
  virtual std::vector<uint8_t> toBytes(const Value& v) = 0;
  virtual size_t byteLength(const Value& v) = 0;

  // Inspection.
  virtual bool isUndefined(const Value& v) = 0;
  virtual bool isNull(const Value& v) = 0;
  virtual bool isString(const Value& v) = 0;
  virtual bool isNumber(const Value& v) = 0;
  virtual bool isObject(const Value& v) = 0;
  virtual bool isFunction(const Value& v) = 0;
  // JavaScript ToString / ToNumber / ToBoolean conversions.
  virtual std::string toString(const Value& v) = 0;
  virtual double toNumber(const Value& v) = 0;
  virtual bool toBoolean(const Value& v) = 0;

  // Objects and calls. get/set/call throw JsError on a JavaScript exception.
  virtual Value get(const Value& object, const std::string& name) = 0;
  virtual void set(const Value& object, const std::string& name,
                   const Value& value) = 0;
  virtual Value call(const Value& fn, const Value& thisValue,
                     const std::vector<Value>& args) = 0;

  // Promises and the job (microtask) queue.
  virtual PromiseCapability newPromise() = 0;
  virtual bool isPromise(const Value& v) = 0;
  virtual bool hasPendingJobs() = 0;
  // Runs queued jobs until the queue is empty. Returns how many ran.
  virtual size_t drainJobs() = 0;

  // Polled while JavaScript runs. Returning true aborts the running script
  // with an uncatchable error, which surfaces as JsError.
  virtual void setInterruptHandler(std::function<bool()> handler) = 0;
  virtual Value externalArrayBuffer(uint8_t* data, size_t size, std::shared_ptr<NativePayload> owner) = 0;
  virtual void detachArrayBuffer(const Value& buffer) = 0;

};

std::unique_ptr<Engine> createQuickJsEngine();

// Calls `promise.then(onFulfilled, onRejected)`. Engine-neutral helper.
void then(Engine& engine, const Value& promise,
          std::function<void(Engine&, const Value&)> onFulfilled,
          std::function<void(Engine&, const Value&)> onRejected);

}  // namespace gr::js
