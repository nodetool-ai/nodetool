#include "kernel/guest.h"

#include "host/capabilities.h"

#include <coroutine>
#include <cstdio>
#include <cstring>

namespace gr {
namespace {

constexpr char kMagic[8] = {'N', 'T', 'G', 'R', 'B', 'C', '1', '\0'};

// Awaits a guest promise that settles with a string.
struct PromiseAwaiter {
  struct State {
    std::optional<std::string> value;
    std::optional<std::string> error;
    std::coroutine_handle<> handle;
  };
  js::Engine& engine;
  js::Value promise;
  std::shared_ptr<State> state = std::make_shared<State>();

  bool await_ready() const noexcept { return false; }
  void await_suspend(std::coroutine_handle<> h) {
    state->handle = h;
    auto st = state;
    js::then(
        engine, promise,
        [st](js::Engine& e, const js::Value& v) {
          st->value = e.toString(v);
          Loop::current().post(st->handle);
        },
        [st](js::Engine& e, const js::Value& v) {
          st->error = e.isObject(v) ? e.toString(e.get(v, "message")) : e.toString(v);
          Loop::current().post(st->handle);
        });
  }
  std::string await_resume() {
    if (state->error) throw NodeError(*state->error);
    return *state->value;
  }
};

Json unwrap(const std::string& reply) {
  Json r = Json::parse(reply);
  if (!r.value("ok", false)) {
    throw NodeError(r.value("error", std::string("guest call failed")));
  }
  return r.contains("value") ? r["value"] : Json();
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
    std::string reply = co_await PromiseAwaiter{
        e, e.call(guest_.api("genNext"), e.undefined(), {gid_})};
    Json r = Json::parse(reply);
    if (!r.value("ok", false)) {
      done_ = true;
      throw NodeError(r.value("error", std::string("generator failed")));
    }
    if (r.value("done", false)) {
      done_ = true;
      co_return std::nullopt;
    }
    co_return r["value"];
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
    js::Value gid = e.call(guest_.api("genStart"), e.undefined(),
                           {id_, e.string(inputs.dump())});
    return std::make_unique<GuestFrames>(guest_, gid);
  }
  bool hasRun() const override { return hasRun_; }
  Task<Json> run(StreamIO& io) override {
    js::Engine& e = guest_.engine();
    int ioId = guest_.registerIo(&io);
    js::Value p = e.call(guest_.api("run"), e.undefined(),
                         {id_, e.number(ioId)});
    std::string reply = co_await PromiseAwaiter{e, p};
    guest_.unregisterIo(ioId);
    co_return unwrap(reply);
  }

private:
  Task<Json> call(std::string method, Json inputs) {
    js::Engine& e = guest_.engine();
    js::Value p = e.call(guest_.api("call"), e.undefined(),
                         {id_, e.string(method), e.string(inputs.dump())});
    std::string reply = co_await PromiseAwaiter{e, p};
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
             {"data", r->second.data},
             {"lineage", lineageToJson(r->second.lineage)},
             {"source_edge_id", r->second.sourceEdgeId}};
  }
  e.call(cap.resolve, e.undefined(), {e.string(reply.dump())});
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

}  // namespace

Guest::Guest(js::Engine& engine, HostOptions options)
    : engine_(engine), options_(std::move(options)) {
  installHost();
}

bool Guest::isBytecode(const std::vector<uint8_t>& bundle) {
  return bundle.size() >= sizeof kMagic &&
         std::memcmp(bundle.data(), kMagic, sizeof kMagic) == 0;
}

std::vector<uint8_t> Guest::compile(const std::string& source,
                                    const std::string& filename) {
  std::vector<uint8_t> out(kMagic, kMagic + sizeof kMagic);
  auto bc = engine_.compileModule(source, filename);
  out.insert(out.end(), bc.begin(), bc.end());
  return out;
}

void Guest::load(const std::vector<uint8_t>& bundle,
                 const std::string& filename,
                 const std::function<bool()>& stop) {
  js::Value result;
  if (isBytecode(bundle)) {
    result = engine_.evaluateBytecode(
        std::vector<uint8_t>(bundle.begin() + sizeof kMagic, bundle.end()));
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
  auto st = std::make_shared<Settled>();
  js::then(
      engine_, result, [st](js::Engine&, const js::Value&) { st->done = true; },
      [st](js::Engine& e, const js::Value& v) {
        st->done = true;
        st->error = e.toString(v);
        if (st->error.empty()) st->error = "the bundle's evaluation was rejected";
      });
  Loop& loop = Loop::current();
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

Json Guest::types() {
  struct Settled {
    std::optional<std::string> value;
    std::optional<std::string> error;
  };
  auto st = std::make_shared<Settled>();
  js::then(
      engine_, engine_.call(api("types"), engine_.undefined(), {}),
      [st](js::Engine& e, const js::Value& v) { st->value = e.toString(v); },
      [st](js::Engine& e, const js::Value& v) {
        st->error = e.isObject(v) ? e.toString(e.get(v, "message")) : e.toString(v);
      });
  while (!st->value && !st->error && engine_.drainJobs() > 0) {
  }
  if (st->error) throw std::runtime_error("guest types() failed: " + *st->error);
  if (!st->value) throw std::runtime_error("guest types() did not settle");
  return Json::parse(*st->value);
}

std::optional<Json> Guest::describe(const Json& node) {
  Json r = Json::parse(callString("describe", {engine_.string(node.dump())}));
  if (r.is_null()) return std::nullopt;
  return r;
}

Json Guest::validate(const Json& node,
                     const std::vector<std::string>& connected) {
  Json c = connected;
  return Json::parse(callString(
      "validate", {engine_.string(node.dump()), engine_.string(c.dump())}));
}

std::unique_ptr<Executor> Guest::create(const Json& node) {
  auto flags = describe(node);
  js::Value id = engine_.call(api("create"), engine_.undefined(),
                              {engine_.string(node.dump())});
  bool hasRun = flags && flags->value("has_run", false);
  return std::make_unique<GuestExecutor>(*this, id, hasRun);
}

Task<Json> Guest::callSettled(js::Value promise) {
  std::string reply = co_await PromiseAwaiter{engine_, std::move(promise)};
  co_return unwrap(reply);
}

int Guest::registerIo(StreamIO* io) {
  int id = nextIo_++;
  ios_[id] = io;
  return id;
}

StreamIO& Guest::io(const js::Value& id) {
  auto it = ios_.find(int(engine_.toNumber(id)));
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

  e.set(host, "next", e.function("next", 2, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    std::optional<std::string> handle;
    if (a.size() > 1 && e.isString(a[1])) handle = e.toString(a[1]);
    auto cap = e.newPromise();
    (void)hostNext(e, cap, s, handle);
    return cap.promise;
  }));

  e.set(host, "emit", e.function("emit", 4, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    std::string slot = e.toString(a.at(1));
    std::optional<Json> value = optJson(e, a, 2);
    std::optional<Lineage> lineage;
    if (auto l = optJson(e, a, 3)) lineage = lineageFromJson(*l);
    auto cap = e.newPromise();
    (void)settleVoid(e, cap, s->emit(slot, std::move(value), std::move(lineage)));
    return cap.promise;
  }));

  e.set(host, "emitGroup", e.function("emitGroup", 3, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    Json values = optJson(e, a, 1).value_or(Json::object());
    std::optional<Lineage> lineage;
    if (auto l = optJson(e, a, 2)) lineage = lineageFromJson(*l);
    auto cap = e.newPromise();
    (void)settleVoid(e, cap, s->emitGroup(std::move(values), std::move(lineage)));
    return cap.promise;
  }));

  e.set(host, "drop", e.function("drop", 3, [this](js::Engine& e, Args a) {
    StreamIO* s = &io(a.at(0));
    std::string slot = e.toString(a.at(1));
    Lineage lineage = lineageFromJson(optJson(e, a, 2).value_or(Json::object()));
    auto cap = e.newPromise();
    (void)settleVoid(e, cap, s->drop(slot, std::move(lineage)));
    return cap.promise;
  }));

  e.set(host, "complete", e.function("complete", 2, [this](js::Engine& e, Args a) {
    io(a.at(0)).complete(e.toString(a.at(1)));
    return e.undefined();
  }));

  e.set(host, "hasBuffered", e.function("hasBuffered", 2, [this](js::Engine& e, Args a) {
    return e.boolean(io(a.at(0)).hasBuffered(e.toString(a.at(1))));
  }));

  e.set(host, "hasStream", e.function("hasStream", 2, [this](js::Engine& e, Args a) {
    return e.boolean(io(a.at(0)).hasStream(e.toString(a.at(1))));
  }));

  e.set(host, "scopeFor", e.function("scopeFor", 2, [this](js::Engine& e, Args a) {
    Json s = io(a.at(0)).scopeFor(e.toString(a.at(1)));
    return e.string(s.dump());
  }));

  e.set(host, "invocationScope", e.function("invocationScope", 1, [this](js::Engine& e, Args a) {
    Json s = io(a.at(0)).invocationScope();
    return e.string(s.dump());
  }));

  for (const auto& capability : host::capabilities()) {
    js::Value object = e.object();
    capability.install(e, object, options_);
    e.set(host, capability.name, object);
  }

  e.set(e.global(), "__host", host);
}

}  // namespace gr
