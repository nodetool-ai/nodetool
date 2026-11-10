#include "kernel/guest.h"

#include "host/capabilities.h"
#include "kernel/async_jobs.h"

#include <quickjs.h>

#include <climits>
#include <cmath>
#include <coroutine>
#include <cstdio>
#include <cstring>
#include <span>
#include <stdexcept>
#include <utility>

namespace gr {
namespace {

constexpr char kMagic[8] = {'N', 'T', 'G', 'R', 'B', 'C', '1', '\0'};
// Header: magic, the QuickJS version string (NUL padded), then an FNV-1a 64
// hash of the bytecode that follows (little endian).
constexpr size_t kVersionSize = 24;
constexpr size_t kHashSize = 8;
constexpr size_t kHeaderSize = sizeof kMagic + kVersionSize + kHashSize;

uint64_t fnv1a(const uint8_t* data, size_t size) {
  uint64_t h = 1469598103934665603ull;
  for (size_t i = 0; i < size; ++i) h = (h ^ data[i]) * 1099511628211ull;
  return h;
}

std::string currentQuickJsVersion() {
  return std::string(JS_GetVersion()).substr(0, kVersionSize - 1);
}

// A blob on its way from the guest to the kernel. __host.blob() copies the
// guest's bytes into it and returns it as an opaque object. The guest lists
// the object next to the text that names it, and the kernel takes the blob
// out when it reads that text (Guest::reply).
//
// Ownership: the JavaScript object, through the engine's reference to its
// native payload. Guest::Transit holds a weak reference, to drop the bytes
// of a handle the guest never returned when the run ends.
//
// Thread affinity: worker only.
struct TransitBlob final : js::NativePayload {
  std::optional<Blob> blob;
};

// Awaits a guest promise that settles with a value's text and bytes.
struct PromiseAwaiter {
  struct State {
    std::optional<GuestReply> value;
    std::optional<std::string> error;
    std::coroutine_handle<> handle;
  };
  js::Engine& engine;
  js::Value promise;
  // native-rules #1: shared with promise callbacks, no justification
  std::shared_ptr<State> state = std::make_shared<State>();

  PromiseAwaiter(js::Engine& e, js::Value p) : engine(e), promise(std::move(p)) {}
  PromiseAwaiter(const PromiseAwaiter&) = delete;
  PromiseAwaiter& operator=(const PromiseAwaiter&) = delete;
  // The awaiting frame owns this awaiter. When Loop::abandon() destroys the
  // frame, the promise callbacks find no handle and post nothing.
  ~PromiseAwaiter() { state->handle = nullptr; }

  bool await_ready() const noexcept { return false; }
  void await_suspend(std::coroutine_handle<> h) {
    state->handle = h;
    auto st = state;
    js::then(
        engine, promise,
        [st](js::Engine& e, const js::Value& v) {
          try {
            st->value = Guest::reply(e, v);
          } catch (const std::exception& ex) {
            st->error = ex.what();
          }
          if (st->handle) Loop::current().post(std::exchange(st->handle, nullptr));
        },
        [st](js::Engine& e, const js::Value& v) {
          st->error = e.isObject(v) ? e.toString(e.get(v, "message")) : e.toString(v);
          if (st->handle) Loop::current().post(std::exchange(st->handle, nullptr));
        });
  }
  GuestReply await_resume() {
    if (state->error) throw NodeError(*state->error);
    return std::move(*state->value);
  }
};

Json unwrap(const GuestReply& reply) {
  Json r = reply.parse();
  if (!r.value("ok", false)) {
    throw NodeError(r.value("error", std::string("guest call failed")));
  }
  return r.contains("value") ? std::move(r["value"]) : Json();
}

class GuestFrames final : public FrameIterator {
public:
  GuestFrames(Guest& g, js::Value gid) : guest_(g), gid_(std::move(gid)) {}
  ~GuestFrames() override {
    if (done_) return;
    // A cancelled or abandoned stream leaves the generator suspended.
    try {
      js::Engine& e = guest_.engine();
      e.call(guest_.api("release"), e.undefined(), {gid_});
    } catch (const std::exception&) {
      // An interrupted engine refuses calls; the context is discarded then.
    }
  }
  Task<std::optional<Json>> next() override {
    if (done_) co_return std::nullopt;
    js::Engine& e = guest_.engine();
    GuestReply reply = co_await PromiseAwaiter{
        e, e.call(guest_.api("genNext"), e.undefined(), {gid_})};
    Json r = reply.parse();
    if (!r.value("ok", false)) {
      done_ = true;
      throw NodeError(r.value("error", std::string("generator failed")));
    }
    if (r.value("done", false)) {
      done_ = true;
      co_return std::nullopt;
    }
    co_return std::move(r["value"]);
  }

private:
  Guest& guest_;
  js::Value gid_;
  bool done_ = false;
};

class GuestExecutor final : public Executor {
public:
  GuestExecutor(Guest& g, js::Value id, bool hasRun)
      : guest_(g), id_(std::move(id)), hasRun_(hasRun) {}
  ~GuestExecutor() override {
    try {
      js::Engine& e = guest_.engine();
      e.call(guest_.api("release"), e.undefined(), {id_});
    } catch (const std::exception&) {
      // An interrupted engine refuses calls; the context is discarded then.
    }
  }

  Task<void> initialize() override { co_await call("initialize", Json()); }
  Task<void> preProcess() override { co_await call("preProcess", Json()); }
  Task<void> finalize() override { co_await call("finalize", Json()); }
  Task<Json> process(Json inputs) override {
    co_return co_await call("process", std::move(inputs));
  }
  std::unique_ptr<FrameIterator> genProcess(Json inputs) override {
    js::Engine& e = guest_.engine();
    Guest::Passed in = Guest::pass(e, inputs);
    js::Value gid = e.call(guest_.api("genStart"), e.undefined(), {id_, in.text, in.blobs});
    return std::make_unique<GuestFrames>(guest_, gid);
  }
  bool hasRun() const override { return hasRun_; }
  Task<Json> run(StreamIO& io) override {
    js::Engine& e = guest_.engine();
    int ioId = guest_.registerIo(&io);
    js::Value p = e.call(guest_.api("run"), e.undefined(),
                         {id_, e.number(ioId)});
    GuestReply reply = co_await PromiseAwaiter{e, p};
    guest_.unregisterIo(ioId);
    co_return unwrap(reply);
  }

private:
  Task<Json> call(std::string method, Json inputs) {
    js::Engine& e = guest_.engine();
    Guest::Passed in = Guest::pass(e, inputs);
    js::Value p = e.call(guest_.api("call"), e.undefined(), {id_, e.string(method), in.text, in.blobs});
    GuestReply reply = co_await PromiseAwaiter{e, p};
    co_return unwrap(reply);
  }

  Guest& guest_;
  js::Value id_;
  bool hasRun_;
};

// Async host calls run as detached tasks that settle a guest promise.
Task<void> hostNext(js::Engine& e, js::PromiseCapability cap, StreamIO* io,
                    std::optional<std::string> handle) {
  std::optional<std::pair<std::string, Envelope>> r;
  std::string error;
  try {
    r = co_await io->next(std::move(handle));
  } catch (const std::exception& ex) {
    error = ex.what();
  }
  if (!error.empty()) {
    e.call(cap.reject, e.undefined(), {e.string(error)});
    co_return;
  }
  Json reply;
  if (!r) {
    reply = {{"done", true}};
  } else {
    reply = {{"done", false},
             {"handle", r->first},
             {"data", *r->second.data},
             {"lineage", lineageToJson(r->second.lineage)},
             {"source_edge_id", r->second.sourceEdgeId}};
  }
  // The bytes of the value travel next to the text, each copied into a
  // buffer of its own for this reader.
  std::vector<Blob> blobs;
  const std::string text = dumpTransit(reply, blobs);
  if (blobs.empty()) {
    e.call(cap.resolve, e.undefined(), {e.string(text)});
    co_return;
  }
  js::Value out = e.object();
  e.set(out, "text", e.string(text));
  e.set(out, "blobs", Guest::bytesOf(e, blobs));
  e.call(cap.resolve, e.undefined(), {out});
}

Task<void> settleVoid(js::Engine& e, js::PromiseCapability cap, Task<void> op) {
  std::string error;
  try {
    co_await op;
  } catch (const std::exception& ex) {
    error = ex.what();
  }
  if (!error.empty()) {
    e.call(cap.reject, e.undefined(), {e.string(error)});
  } else {
    e.call(cap.resolve, e.undefined(), {e.undefined()});
  }
}

std::optional<Json> optJson(js::Engine& e, const std::vector<js::Value>& args,
                            size_t i) {
  if (args.size() <= i || e.isUndefined(args[i]) || e.isNull(args[i])) {
    return std::nullopt;
  }
  return Json::parse(e.toString(args[i]));
}

// A node value the guest passed as its text at `text` and its bytes at
// `blobs`.
std::optional<Json> optValue(js::Engine& e, const std::vector<js::Value>& args,
                             size_t text, size_t blobs) {
  if (args.size() <= text || e.isUndefined(args[text]) || e.isNull(args[text])) {
    return std::nullopt;
  }
  return Guest::reply(e, args[text], args.size() > blobs ? args[blobs] : e.undefined()).parse();
}

}  // namespace

// The handles of this run that may still hold bytes. A reply takes the
// bytes of its handles at once, so one stays only when the guest never
// returned its text, as after a cancel. clear() drops those bytes when the
// run ends, so no blob outlives its run while it waits for the collector.
//
// Thread affinity: worker only.
struct Guest::Transit {
  std::vector<std::weak_ptr<TransitBlob>> handles;
  size_t sweepAt = kSweep;

  void add(const std::shared_ptr<TransitBlob>& handle) {
    if (handles.size() >= sweepAt) {
      std::erase_if(handles, [](const std::weak_ptr<TransitBlob>& weak) {
        const auto held = weak.lock();
        return !held || !held->blob;
      });
      sweepAt = std::max(kSweep, handles.size() * 2);
    }
    handles.push_back(handle);
  }
  void clear() {
    for (const auto& weak : handles) {
      if (const auto held = weak.lock()) held->blob.reset();
    }
    handles.clear();
    sweepAt = kSweep;
  }

private:
  static constexpr size_t kSweep = 64;
};

Json GuestReply::parse() const {
  Json value = Json::parse(text);
  attachBlobs(value, blobs);
  return value;
}

Guest::Guest(js::Engine& engine, HostOptions options)
    : engine_(engine), options_(std::move(options)), transit_(std::make_shared<Transit>()) {
  installHost();
}

js::Value Guest::bytesOf(js::Engine& e, const std::vector<Blob>& blobs) {
  if (blobs.empty()) return e.undefined();
  js::Value out = e.object();
  for (size_t i = 0; i < blobs.size(); ++i) {
    e.set(out, std::to_string(i), e.bytes(blobs[i].data(), blobs[i].size()));
  }
  return out;
}

Guest::Passed Guest::pass(js::Engine& e, const Json& value) {
  std::vector<Blob> blobs;
  const std::string text = dumpTransit(value, blobs);
  return {e.string(text), bytesOf(e, blobs)};
}

GuestReply Guest::reply(js::Engine& e, const js::Value& value) {
  if (e.isString(value) || !e.isObject(value)) return {e.toString(value), {}};
  return reply(e, e.get(value, "text"), e.get(value, "blobs"));
}

GuestReply Guest::reply(js::Engine& e, const js::Value& text, const js::Value& blobs) {
  GuestReply out;
  out.text = e.toString(text);
  if (!e.isObject(blobs)) return out;
  const double count = e.toNumber(e.get(blobs, "length"));
  if (!(count >= 0 && count <= 1e7) || count != std::floor(count)) {
    throw std::runtime_error("RangeError: expected a list of blobs");
  }
  out.blobs.reserve(static_cast<size_t>(count));
  for (size_t i = 0; i < static_cast<size_t>(count); ++i) {
    const auto handle = std::dynamic_pointer_cast<TransitBlob>(e.nativePayload(e.get(blobs, std::to_string(i))));
    if (!handle || !handle->blob) throw std::runtime_error("TypeError: expected bytes that __host.blob returned");
    out.blobs.push_back(std::move(*handle->blob));
    handle->blob.reset();
  }
  return out;
}

bool Guest::isBytecode(const std::vector<uint8_t>& bundle) {
  return bundle.size() >= sizeof kMagic &&
         std::memcmp(bundle.data(), kMagic, sizeof kMagic) == 0;
}

std::vector<uint8_t> Guest::compile(const std::string& source,
                                    const std::string& filename) {
  std::vector<uint8_t> out(kMagic, kMagic + sizeof kMagic);
  auto bc = engine_.compileModule(source, filename);
  std::string version = currentQuickJsVersion();
  version.resize(kVersionSize, '\0');
  out.insert(out.end(), version.begin(), version.end());
  uint64_t hash = fnv1a(bc.data(), bc.size());
  for (size_t i = 0; i < kHashSize; ++i) out.push_back(uint8_t(hash >> (8 * i)));
  out.insert(out.end(), bc.begin(), bc.end());
  return out;
}

void Guest::load(const std::vector<uint8_t>& bundle,
                 const std::string& filename,
                 const std::function<bool()>& stop) {
  js::Value result;
  if (isBytecode(bundle)) {
    if (bundle.size() < kHeaderSize) {
      throw std::runtime_error("bytecode header is truncated: rebuild guest.bin with the compile command");
    }
    const char* field = reinterpret_cast<const char*>(bundle.data() + sizeof kMagic);
    std::string version(field, strnlen(field, kVersionSize));
    if (version != currentQuickJsVersion()) {
      throw std::runtime_error("bytecode was built with QuickJS version " + version +
                               " but this runner uses " + currentQuickJsVersion() +
                               ": rebuild guest.bin with the compile command");
    }
    const uint8_t* payload = bundle.data() + kHeaderSize;
    size_t payloadSize = bundle.size() - kHeaderSize;
    uint64_t stored = 0;
    for (size_t i = 0; i < kHashSize; ++i) {
      stored |= uint64_t(bundle[sizeof kMagic + kVersionSize + i]) << (8 * i);
    }
    if (stored != fnv1a(payload, payloadSize)) {
      throw std::runtime_error("bytecode hash mismatch: guest.bin is corrupt or stale, rebuild it with the compile command");
    }
    result = engine_.evaluateBytecode(std::span<const uint8_t>(payload, payloadSize));
  } else {
    result = engine_.evaluateModule(
        std::string_view(reinterpret_cast<const char*>(bundle.data()),
                         bundle.size()),
        filename);
  }
  settleEvaluation(result, stop);
  nodetool_ = engine_.get(engine_.global(), "__nodetool");
  if (!engine_.isObject(nodetool_)) {
    throw std::runtime_error("bundle did not define globalThis.__nodetool");
  }
}

void Guest::settleEvaluation(const js::Value& result,
                             const std::function<bool()>& stop) {
  // Bytecode of a classic script evaluates to its completion value.
  if (!engine_.isPromise(result)) return;
  struct Settled {
    bool done = false;
    std::string error;
  };
  // native-rules #1: shared by two promise callbacks, no justification
  auto st = std::make_shared<Settled>();
  js::then(
      engine_, result, [st](js::Engine&, const js::Value&) { st->done = true; },
      [st](js::Engine& e, const js::Value& v) {
        st->done = true;
        st->error = e.toString(v);
        if (st->error.empty()) st->error = "the bundle's evaluation was rejected";
      });
  Loop& loop = Loop::current();
  // native-rules #12: lambda captures raw this and is stored in the loop, runs later
  loop.setPump([this] { return engine_.drainJobs() > 0; });
  bool stopped = false;
  try {
    loop.run([&] { return st->done || (stopped = stop && stop()); });
  } catch (...) {
    loop.setPump(nullptr);
    loop.clearTimers();
    throw;
  }
  loop.setPump(nullptr);
  if (size_t left = loop.pendingTimers(); left > 0) {
    std::fprintf(stderr, "[guest] dropped %zu timer(s) the bundle left pending at load\n", left);
  }
  loop.clearTimers();
  if (!st->error.empty()) throw std::runtime_error(st->error);
  if (stopped) throw std::runtime_error("the bundle load was stopped");
  if (!st->done) {
    throw std::runtime_error("the bundle's top-level await never settled");
  }
}

js::Value Guest::api(const std::string& name) {
  return engine_.get(nodetool_, name);
}

std::string Guest::callString(const std::string& fn,
                              std::vector<js::Value> args) {
  return engine_.toString(engine_.call(api(fn), engine_.undefined(), args));
}

void Guest::begin(const std::string& jobId, const std::string& workflowId) {
  engine_.call(api("begin"), engine_.undefined(),
               {engine_.string(jobId), engine_.string(workflowId)});
}

std::string Guest::settleNow(const std::string& fn, std::vector<js::Value> args) {
  struct Settled {
    std::optional<std::string> value;
    std::optional<std::string> error;
  };
  // native-rules #1: shared by two promise callbacks, no justification
  auto st = std::make_shared<Settled>();
  js::then(
      engine_, engine_.call(api(fn), engine_.undefined(), std::move(args)),
      [st](js::Engine& e, const js::Value& v) { st->value = e.toString(v); },
      [st](js::Engine& e, const js::Value& v) {
        st->error = e.isObject(v) ? e.toString(e.get(v, "message")) : e.toString(v);
      });
  while (!st->value && !st->error && engine_.drainJobs() > 0) {
  }
  if (st->error) throw std::runtime_error("guest " + fn + "() failed: " + *st->error);
  if (!st->value) throw std::runtime_error("guest " + fn + "() did not settle");
  return *st->value;
}

Json Guest::types() { return Json::parse(settleNow("types", {})); }

std::string Guest::typeSnapshot() { return settleNow("snapshot", {}); }

void Guest::ensureType(const Json& node) {
  if (!node.is_object() || !node.contains("type") || !node["type"].is_string()) return;
  const js::Value type = engine_.string(node["type"].get<std::string>());
  if (!engine_.isFunction(api("pending")) ||
      !engine_.toBoolean(engine_.call(api("pending"), engine_.undefined(), {type}))) {
    return;
  }
  settleNow("ensure", {type});
}

std::optional<Json> Guest::describe(const Json& node) {
  // A bare {type} is answered from the type snapshot without the module.
  if (node.size() > 1) ensureType(node);
  Json r = Json::parse(callString("describe", {engine_.string(dumpWire(node))}));
  if (r.is_null()) return std::nullopt;
  return r;
}

Json Guest::validate(const Json& node,
                     const std::vector<std::string>& connected) {
  ensureType(node);
  Json c = connected;
  return Json::parse(callString(
      "validate", {engine_.string(dumpWire(node)), engine_.string(c.dump())}));
}

std::unique_ptr<Executor> Guest::create(const Json& node) {
  ensureType(node);
  auto flags = describe(node);
  js::Value id = engine_.call(api("create"), engine_.undefined(),
                              {engine_.string(dumpWire(node))});
  bool hasRun = flags && flags->value("has_run", false);
  return std::make_unique<GuestExecutor>(*this, id, hasRun);
}

Task<Json> Guest::callSettled(js::Value promise) {
  GuestReply reply = co_await PromiseAwaiter{engine_, std::move(promise)};
  co_return unwrap(reply);
}

int Guest::registerIo(StreamIO* io) {
  int id = nextIo_++;
  ios_[id] = io;
  return id;
}

StreamIO& Guest::io(const js::Value& id) {
  const double d = engine_.toNumber(id);
  if (!(d >= INT_MIN && d <= INT_MAX) || d != std::floor(d))
    throw std::runtime_error("RangeError: expected an integer stream I/O handle");
  auto it = ios_.find(int(d));
  if (it == ios_.end()) throw std::runtime_error("unknown stream I/O handle");
  return *it->second;
}

void Guest::installHost() {
  js::Engine& e = engine_;
  js::Value host = e.object();
  using Args = const std::vector<js::Value>&;

  e.set(host, "log", e.function("log", 2, [](js::Engine& e, Args a) {
    std::string level = a.size() > 0 ? e.toString(a[0]) : "info";
    std::string msg = a.size() > 1 ? e.toString(a[1]) : "";
    std::fprintf(stderr, "[guest %s] %s\n", level.c_str(), msg.c_str());
    return e.undefined();
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "next", e.function("next", 2, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    std::optional<std::string> handle;
    if (a.size() > 1 && e.isString(a[1])) handle = e.toString(a[1]);
    auto cap = e.newPromise();
    (void)hostNext(e, cap, s, handle);
    return cap.promise;
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "emit", e.function("emit", 4, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    std::string slot = e.toString(a.at(1));
    std::optional<Json> value = optValue(e, a, 2, 4);
    std::optional<Lineage> lineage;
    if (auto l = optJson(e, a, 3)) lineage = lineageFromJson(*l);
    auto cap = e.newPromise();
    (void)settleVoid(e, cap, s->emit(slot, std::move(value), std::move(lineage)));
    return cap.promise;
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "emitGroup", e.function("emitGroup", 3, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    Json values = optValue(e, a, 1, 3).value_or(Json::object());
    std::optional<Lineage> lineage;
    if (auto l = optJson(e, a, 2)) lineage = lineageFromJson(*l);
    auto cap = e.newPromise();
    (void)settleVoid(e, cap, s->emitGroup(std::move(values), std::move(lineage)));
    return cap.promise;
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "drop", e.function("drop", 3, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    std::string slot = e.toString(a.at(1));
    Lineage lineage = lineageFromJson(optJson(e, a, 2).value_or(Json::object()));
    auto cap = e.newPromise();
    (void)settleVoid(e, cap, s->drop(slot, std::move(lineage)));
    return cap.promise;
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "complete", e.function("complete", 2, [this](js::Engine& e, Args a) {
    io(a.at(0)).complete(e.toString(a.at(1)));
    return e.undefined();
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "hasBuffered", e.function("hasBuffered", 2, [this](js::Engine& e, Args a) {
    return e.boolean(io(a.at(0)).hasBuffered(e.toString(a.at(1))));
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "hasStream", e.function("hasStream", 2, [this](js::Engine& e, Args a) {
    return e.boolean(io(a.at(0)).hasStream(e.toString(a.at(1))));
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "scopeFor", e.function("scopeFor", 2, [this](js::Engine& e, Args a) {
    Json s = io(a.at(0)).scopeFor(e.toString(a.at(1)));
    return e.string(s.dump());
  }));

  // native-rules #12: host function captures raw this and runs later from the engine
  e.set(host, "invocationScope", e.function("invocationScope", 1, [this](js::Engine& e, Args a) {
    Json s = io(a.at(0)).invocationScope();
    return e.string(s.dump());
  }));

  // The bytes of a value the guest is about to return or emit. Copies them
  // once, at the call, so the node may reuse its buffer afterwards, and
  // charges them to the run like the copied input of a native job. The
  // charge is retained: only the readers of the value release it.
  const auto binding = RunBinding::of(e);
  const std::weak_ptr<Transit> transit = transit_;
  e.set(host, "blob", e.function("blob", 1, [binding, transit](js::Engine& e, Args a) {
    const js::Value& source = a.at(0);
    if (!e.isBytes(source)) throw std::runtime_error("TypeError: expected an ArrayBuffer or a typed array");
    const std::span<const uint8_t> view = e.viewBytes(source);
    nodetool::jobs::Reservation charge;
    if (AsyncRun* run = binding->run()) charge = run->reserve();
    if (charge) {
      charge.reserveSnapshot(view.size());
      charge.retain();
    }
    auto handle = std::make_shared<TransitBlob>();
    handle->blob.emplace(std::vector<uint8_t>(view.begin(), view.end()), BlobKind::Uint8Array, std::move(charge));
    if (const auto list = transit.lock()) list->add(handle);
    return e.nativeObject(std::move(handle));
  }));
  // Frees the bytes of handles the guest made and will not return.
  e.set(host, "dropBlobs", e.function("dropBlobs", 1, [](js::Engine& e, Args a) {
    (void)Guest::reply(e, e.undefined(), a.at(0));
    return e.undefined();
  }));
  e.addRunCleanup([transit] {
    if (const auto list = transit.lock()) list->clear();
  });

  for (const auto& capability : host::capabilities()) {
    js::Value object = e.object();
    capability.install(e, object, options_);
    e.set(host, capability.name, object);
  }

  e.set(e.global(), "__host", host);
}

}  // namespace gr
