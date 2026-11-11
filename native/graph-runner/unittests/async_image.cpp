// Step 5 of docs/plans/graph-runner-async-host.md for the image capability
// and canvas encode: __host.image.metadata, transform and encodePngAsync,
// and a canvas surface's encodePng, run on the bound run's CPU lane.
//
//   gr_async_image_tests [case]
//
// Every lane here has one thread, and a job that blocks on a gate holds it,
// so the tests decide which jobs are queued or running when the guest
// mutates its inputs, the run is cancelled or the run ends. Jobs and helper
// threads share state with the test only through shared pointers they
// capture by value (native/AGENTS.md rule 12).
#include "host/capabilities.h"
#include "host/image_jobs.h"
#include "host/sandbox_ocr.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/graph_runner.h"
#include "nodetool/jobs/admission.h"
#include "sanitizer_build.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {

using gr::AsyncRun;
using gr::CancelState;
using gr::Loop;
using gr::RunExit;
using gr::ThreadPoolExecutor;
using nodetool::jobs::AdmissionLedger;
using nodetool::jobs::JobCost;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::LedgerUsage;
using nodetool::jobs::RunnerLimits;
using nodetool::jobs::RunnerTracker;
namespace js = gr::js;
using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;

// Check counters and a watchdog that ends the process when a case hangs.
// Constructed in main() and destroyed before it returns, which stops and
// joins the watchdog.
//
// Thread affinity: check() is thread-safe (atomic counters). begin() and the
// destructor run on the main thread. The watchdog shares only `Watch`,
// through a shared pointer, guarded by its mutex.
class Suite {
public:
  Suite() : watch_(std::make_shared<Watch>()) {
    watchdog_ = std::thread([watch = watch_] { watch->run(); });
  }
  ~Suite() {
    {
      std::lock_guard lock(watch_->mutex);
      watch_->stopping = true;
    }
    watch_->changed.notify_all();
    watchdog_.join();
  }
  Suite(const Suite&) = delete;
  Suite& operator=(const Suite&) = delete;

  void check(bool ok, const char* file, int line, const char* expression) {
    ++checks_;
    if (ok) return;
    ++failures_;
    std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", file, line, expression);
  }
  void begin(const char* name) {
    std::lock_guard lock(watch_->mutex);
    watch_->test = name;
    watch_->deadline = Clock::now() + std::chrono::seconds(60);
  }
  int failures() const { return failures_; }
  int checks() const { return checks_; }

private:
  struct Watch {
    std::mutex mutex;
    std::condition_variable changed;
    std::optional<Clock::time_point> deadline;  // guarded by mutex
    std::string test;                           // guarded by mutex
    bool stopping = false;                      // guarded by mutex

    void run() {
      std::unique_lock lock(mutex);
      while (!stopping) {
        changed.wait_for(lock, milliseconds(50));
        if (deadline && Clock::now() > *deadline) {
          std::fprintf(stderr, "TIMEOUT %s\n", test.c_str());
          std::_Exit(1);
        }
      }
    }
  };

  std::atomic<int> failures_{0};
  std::atomic<int> checks_{0};
  std::shared_ptr<Watch> watch_;
  std::thread watchdog_;
};

#define CHECK(cond) t.check(static_cast<bool>(cond), __FILE__, __LINE__, #cond)

// A one-shot flag another thread waits on.
//
// Thread affinity: thread-safe, `mutex` guards `open`.
struct Gate {
  std::mutex mutex;
  std::condition_variable changed;
  bool open = false;

  void release() {
    {
      std::lock_guard lock(mutex);
      open = true;
    }
    changed.notify_all();
  }
  bool wait(milliseconds timeout = milliseconds(30000)) {
    std::unique_lock lock(mutex);
    return changed.wait_for(lock, timeout, [&] { return open; });
  }
};

// What a gated job saw. Thread-safe: the gates lock themselves, and
// `outcome` is atomic.
struct GateProbe {
  Gate entered;
  Gate release;
  // The JobOutcome::Kind its inner job returned, or -1.
  std::atomic<int> outcome{-1};
};

// Holds its lane thread until released, then runs `inner` if it has one,
// with the stop token the lane gave it. Its cost is the inner job's.
//
// Thread affinity: the lane thread that runs it.
class GatedJob final : public nodetool::jobs::NativeJob {
public:
  GatedJob(std::shared_ptr<GateProbe> probe, std::unique_ptr<nodetool::jobs::NativeJob> inner = {})
      : probe_(std::move(probe)), inner_(std::move(inner)) {}
  JobCost cost() const override { return inner_ ? inner_->cost() : JobCost{}; }
  JobOutcome run(std::stop_token stop) override {
    probe_->entered.release();
    probe_->release.wait();
    if (!inner_) return JobOutcome::value(nullptr);
    JobOutcome outcome = inner_->run(std::move(stop));
    probe_->outcome = static_cast<int>(outcome.kind);
    return outcome;
  }

private:
  std::shared_ptr<GateProbe> probe_;
  std::unique_ptr<nodetool::jobs::NativeJob> inner_;
};

// Waits until `predicate` holds or `timeout` passes.
template <class P>
bool eventually(P predicate, milliseconds timeout = milliseconds(10000)) {
  const auto deadline = Clock::now() + timeout;
  while (!predicate()) {
    if (Clock::now() > deadline) return false;
    std::this_thread::sleep_for(milliseconds(2));
  }
  return true;
}

bool zero(const LedgerUsage& usage) { return usage.bytes == 0 && usage.operations == 0; }

// One engine with __host.image and __host.canvas, and one run bound to it
// at a time, as GraphRunner::Impl::runJob binds it, with `cpu` as the run's
// default executor.
//
// Thread affinity: the thread that created it only.
struct Harness {
  ThreadPoolExecutor& cpu;
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  Loop& loop = Loop::current();
  std::shared_ptr<AdmissionLedger> ledger = std::make_shared<AdmissionLedger>();
  std::shared_ptr<nodetool::jobs::RunnerAccount> runner;
  CancelState cancel;
  std::shared_ptr<RunnerTracker> tracker = std::make_shared<RunnerTracker>();
  gr::host::RunIdentity identity;
  uint64_t generation = 0;
  std::optional<AsyncRun> async;
  std::optional<gr::RunBinding::Scope> bound;

  explicit Harness(ThreadPoolExecutor& lane, RunnerLimits limits = {})
      : cpu(lane), runner(ledger->openRunner(limits)) {
    js::Engine& e = *engine;
    js::Value host = e.object();
    for (const auto& capability : gr::host::capabilities()) {
      const std::string name = capability.name;
      if (name != "image" && name != "canvas") continue;
      js::Value object = e.object();
      capability.install(e, object, gr::HostOptions{});
      e.set(host, capability.name, object);
    }
    e.set(e.global(), "__host", host);
    eval("globalThis.log = []; globalThis.results = {};"
         "globalThis.keep = (name, p) => p.then((v) => { results[name] = v; log.push(name + ':ok'); },"
         "  (e) => { log.push(name + ':' + e.name + ':' + e.message); });"
         "globalThis.same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);"
         "globalThis.pattern = (w, h, seed) => { const u = new Uint8Array(w * h * 4);"
         "  for (let i = 0; i < u.length; ++i) u[i] = (i * seed * 7 + (i >> 2)) & 255; return u; };"
         "globalThis.solid = (w, h, rgba) => { const u = new Uint8Array(w * h * 4);"
         "  for (let i = 0; i < u.length; ++i) u[i] = rgba[i % 4]; return u; };"
         "globalThis.attempt = (f) => { try { const v = f(); return v instanceof Promise ? 'promise' : 'value'; }"
         "  catch (e) { return 'error: ' + e.message; } };");
  }
  ~Harness() { endRun(); }
  Harness(const Harness&) = delete;
  Harness& operator=(const Harness&) = delete;

  void beginRun() {
    generation = cancel.beginRun();
    identity = gr::host::newRunIdentity("job", runner->openRun());
    async.emplace(*engine, loop, tracker, generation, cpu, identity);
    bound.emplace(*engine, *async, cpu);
  }
  // As runJob's teardown.
  void endRun() {
    if (!async) return;
    bound.reset();
    async->teardown();
    loop.clearTimers();
    loop.abandon();
    async.reset();
    engine->releaseRunResources();
    cancel.endRun();
  }
  LedgerUsage usage() const { return identity->account->usage(); }

  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  bool truthy(const std::string& source) { return engine->toBoolean(eval(source)); }
  size_t logged() { return static_cast<size_t>(engine->toNumber(eval("log.length"))); }
  std::string log() { return str("log.join(' | ')"); }
  RunExit runUntil(std::function<bool()> done) {
    gr::EngineRunControl control(*engine, *async, cancel, generation, std::move(done));
    return loop.run(control);
  }
  RunExit runUntilLogged(size_t count) {
    return runUntil([&] { return logged() >= count; });
  }
  // Submits a job that holds the lane's thread until `probe` releases it,
  // and waits until it runs. Not cancellable, like a cleanup call.
  void holdLane(const std::shared_ptr<GateProbe>& probe) {
    async->submit(cpu, std::make_unique<GatedJob>(probe), nullptr);
    probe->entered.wait();
  }
  std::vector<uint8_t> bytes(const std::string& source) { return engine->toBytes(eval(source)); }
  // Settles or disposes what the mailbox holds, as the loop does, until the
  // run holds no charge.
  bool drained() {
    return eventually([&] {
      while (async->dispatchOne()) {
      }
      return zero(usage());
    });
  }
};

// --- output equality and synchronous compatibility -----------------------------

// Gate: each promise-returning function gives the bytes and info of the same
// call made outside a run, which runs at the call as before. Inside a run,
// encodePng and a surface's pixels() still return their bytes at the call.
void outputsMatchTheSynchronousPath(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  CHECK(h.truthy("__host.canvas.available"));
  // Outside a run: values, not promises.
  h.eval(R"JS(
    globalThis.png = __host.image.encodePng(pattern(64, 48, 3), 64, 48);
    globalThis.over = __host.image.encodePng(pattern(16, 16, 5), 16, 16);
    globalThis.cases = [
      [{format: 'png'}, png, []],
      [{format: 'webp', webp: {lossless: true}}, png, []],
      [{format: 'webp', webp: {quality: 60}}, png, []],
      [{format: 'raw', ensureAlpha: true}, png, []],
      [{format: 'raw', greyscale: true, resize: {width: 20, height: 10}}, png, []],
      [{format: 'png', extract: {left: 2, top: 3, width: 10, height: 8}}, png, []],
      [{format: 'png', removeAlpha: true}, png, [over]],
      [{format: 'png', raw: {width: 64, height: 48, channels: 4}}, pattern(64, 48, 3), []],
      [{format: 'raw', create: {width: 8, height: 8, channels: 4, background: {r: 1, g: 2, b: 3, alpha: 0.5}}},
       new Uint8Array(), []],
    ];
    globalThis.expected = cases.map(([spec, source, overlays]) =>
      __host.image.transform(source, JSON.stringify(spec), ...overlays));
    globalThis.expectedMeta = __host.image.metadata(png, '{}');
    globalThis.unboundKinds = [attempt(() => __host.image.metadata(png, '{}')),
      attempt(() => __host.image.encodePngAsync(pattern(4, 4, 1), 4, 4)),
      attempt(() => __host.canvas.create(2, 2).encodePng())].join(',');
  )JS");
  CHECK(h.str("unboundKinds") == "value,value,value");
  CHECK(h.truthy("expected.every((r) => r.data instanceof Uint8Array && r.data.length > 0)"));

  h.beginRun();
  h.eval(R"JS(
    cases.forEach(([spec, source, overlays], i) =>
      keep('t' + i, __host.image.transform(source, JSON.stringify(spec), ...overlays)));
    keep('meta', __host.image.metadata(png, '{}'));
    keep('png', __host.image.encodePngAsync(pattern(64, 48, 3), 64, 48));
    globalThis.surface = __host.canvas.create(32, 24);
    surface.put(pattern(32, 24, 9), 32, 24, 0, 0);
    keep('canvas', surface.encodePng());
    // Synchronous canvas paths inside a run.
    globalThis.boundKinds = [attempt(() => surface.pixels()),
      attempt(() => __host.image.encodePng(surface.pixels(), 32, 24))].join(',');
    globalThis.canvasExpected = __host.image.encodePng(surface.pixels(), 32, 24);
  )JS");
  CHECK(h.str("boundKinds") == "value,value");
  // Nothing settles at the call: the results come through the run's mailbox.
  CHECK(h.logged() == 0);
  const size_t count = static_cast<size_t>(h.engine->toNumber(h.eval("cases.length"))) + 3;
  CHECK(h.runUntilLogged(count) == RunExit::Done);
  CHECK(h.str("log.filter((l) => !l.endsWith(':ok')).join(' | ')").empty());
  CHECK(h.truthy("cases.every((_, i) => same(results['t' + i].data, expected[i].data))"));
  CHECK(h.truthy("cases.every((_, i) => JSON.stringify(results['t' + i].info) === JSON.stringify(expected[i].info))"));
  CHECK(h.truthy("JSON.stringify(results.meta) === JSON.stringify(expectedMeta)"));
  CHECK(h.truthy("same(results.png, png)"));
  CHECK(h.truthy("same(results.canvas, canvasExpected)"));
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// --- snapshot isolation ---------------------------------------------------------

// Gate: snapshot isolation. With the lane held, a canvas encode, a pixel
// encode and a raw transform wait in the queue while the guest draws over
// the canvas and overwrites the buffers it passed. Each result still has the
// pixels of its call.
void inputsAreCopiedAtTheCall(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  h.beginRun();
  auto hold = std::make_shared<GateProbe>();
  h.holdLane(hold);
  h.eval(R"JS(
    const red = [255, 0, 0, 255], blue = [0, 0, 255, 255];
    const s = __host.canvas.create(8, 8);
    s.put(solid(8, 8, red), 8, 8, 0, 0);
    keep('canvas', s.encodePng());
    s.put(solid(8, 8, blue), 8, 8, 0, 0);
    globalThis.drawn = s.pixels();
    const pixels = solid(8, 8, red);
    keep('pixels', __host.image.encodePngAsync(pixels, 8, 8));
    pixels.fill(0);
    const raw = solid(8, 8, red);
    keep('raw', __host.image.transform(raw, JSON.stringify({format: 'raw', raw: {width: 8, height: 8, channels: 4}})));
    raw.fill(7);
  )JS");
  // All three are queued behind the held job, so the writes above happened
  // before any of them ran.
  CHECK(cpu.queued() == 3);
  CHECK(h.logged() == 0);
  hold->release.release();
  CHECK(h.runUntilLogged(3) == RunExit::Done);
  CHECK(h.log() == "canvas:ok | pixels:ok | raw:ok");
  CHECK(h.truthy("same(drawn, solid(8, 8, [0, 0, 255, 255]))"));
  CHECK(h.truthy("same(__host.image.decode(results.canvas).rgba, solid(8, 8, [255, 0, 0, 255]))"));
  CHECK(h.truthy("same(__host.image.decode(results.pixels).rgba, solid(8, 8, [255, 0, 0, 255]))"));
  CHECK(h.truthy("same(results.raw.data, solid(8, 8, [255, 0, 0, 255]))"));
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// --- cancellation and reservations ------------------------------------------------

// Gate: cancellation disposal with exact release counts. Four image jobs
// wait behind a held lane. The run holds exactly their costs, computed from
// the same inputs, and one slot each. cancel() rejects every one with an
// AbortError while the lane still holds them. Once the lane is released it
// destroys them without running them, and every byte and slot comes back.
void cancellationReleasesEveryReservation(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  h.eval("globalThis.png = __host.image.encodePng(pattern(64, 48, 3), 64, 48);");
  const std::vector<uint8_t> png = h.bytes("png");
  h.beginRun();
  auto hold = std::make_shared<GateProbe>();
  h.holdLane(hold);
  CHECK(h.usage().operations == 1);
  CHECK(h.usage().bytes == 0);
  const std::string transformSpec = R"({"format":"png","resize":{"width":32,"height":24}})";
  h.eval("keep('pixels', __host.image.encodePngAsync(pattern(64, 48, 3), 64, 48));"
         "keep('meta', __host.image.metadata(png, '{}'));"
         "keep('transform', __host.image.transform(png, '" + transformSpec + "'));"
         "globalThis.surface = __host.canvas.create(40, 30);"
         "keep('canvas', surface.encodePng());");
  CHECK(cpu.queued() == 4);
  const uint64_t expected =
      gr::host::pngJobCost(64, 48).total() +
      gr::host::makeMetadataJob(png, gr::host::parseImageSpec("{}"))->cost().total() +
      gr::host::makeTransformJob(png, gr::host::parseImageSpec(transformSpec), {})->cost().total() +
      gr::host::pngJobCost(40, 30).total();
  const LedgerUsage queued = h.usage();
  CHECK(queued.operations == 5);
  CHECK(queued.bytes == expected);
  CHECK(h.runner->usage().bytes == expected);
  CHECK(h.ledger->usage().bytes == expected);

  h.async->cancel();
  CHECK(h.runUntilLogged(4) == RunExit::Done);
  CHECK(h.log() ==
        "pixels:AbortError:The operation was aborted | meta:AbortError:The operation was aborted | "
        "transform:AbortError:The operation was aborted | canvas:AbortError:The operation was aborted");
  // The lane still holds the jobs, with their charges.
  CHECK(h.usage().bytes == expected);
  CHECK(h.usage().operations == 5);
  hold->release.release();
  CHECK(h.drained());
  CHECK(cpu.queued() == 0);
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()) && h.tracker->outstanding() == 0; }));
}

// Gate: a job asked to stop after its lane took it. The production PNG job
// waits inside a gate while the run is cancelled. Its promise rejects with
// an AbortError at once. Released, the job sees its stop token before
// encoding, returns Stopped, and its result, which no settler waits for, is
// disposed with its charge.
void runningJobStopsBeforeEncoding(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  h.beginRun();
  auto probe = std::make_shared<GateProbe>();
  std::vector<uint8_t> rgba(16 * 16 * 4, 200);
  js::Value promise = h.async->submit(
      cpu, std::make_unique<GatedJob>(probe, gr::host::makePngJob(std::move(rgba), 16, 16)),
      gr::host::pngConverter(), true);
  h.engine->set(h.engine->global(), "running", promise);
  h.eval("keep('png', running);");
  probe->entered.wait();
  CHECK(h.usage().bytes == gr::host::pngJobCost(16, 16).total());
  CHECK(h.usage().operations == 1);
  h.async->cancel();
  CHECK(h.runUntilLogged(1) == RunExit::Done);
  CHECK(h.log() == "png:AbortError:The operation was aborted");
  CHECK(h.usage().bytes == gr::host::pngJobCost(16, 16).total());
  probe->release.release();
  CHECK(h.drained());
  CHECK(probe->outcome == static_cast<int>(JobOutcome::Kind::Stopped));
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate: the run ends while a job runs. The closed mailbox cannot take its
// result, so the job's charge stays exactly as it was until the job returns
// and its result is destroyed on the lane.
void runEndsWhileAJobRuns(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  h.eval("globalThis.png = __host.image.encodePng(pattern(32, 32, 3), 32, 32);");
  const std::vector<uint8_t> png = h.bytes("png");
  h.beginRun();
  auto probe = std::make_shared<GateProbe>();
  auto job = gr::host::makeTransformJob(png, gr::host::parseImageSpec(R"({"format":"raw"})"), {});
  const uint64_t cost = job->cost().total();
  h.async->submit(cpu, std::make_unique<GatedJob>(probe, std::move(job)), gr::host::transformConverter(), true);
  probe->entered.wait();
  auto account = h.identity->account;
  h.endRun();
  CHECK(account->usage().bytes == cost);
  CHECK(account->usage().operations == 1);
  CHECK(h.tracker->outstanding() == 1);
  probe->release.release();
  CHECK(eventually([&] { return zero(account->usage()) && h.tracker->outstanding() == 0; }));
  CHECK(probe->outcome == static_cast<int>(JobOutcome::Kind::Stopped));
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate: a job that completes after the run asked nothing of it resolves,
// and its result's charge moves into the JavaScript ledger or goes away.
void completedJobsReleaseTheirCharge(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  h.beginRun();
  auto probe = std::make_shared<GateProbe>();
  std::vector<uint8_t> rgba(16 * 16 * 4, 90);
  js::Value promise = h.async->submit(
      cpu, std::make_unique<GatedJob>(probe, gr::host::makePngJob(std::move(rgba), 16, 16)),
      gr::host::pngConverter(), true);
  h.engine->set(h.engine->global(), "running", promise);
  h.eval("keep('png', running);");
  probe->entered.wait();
  CHECK(h.usage().bytes == gr::host::pngJobCost(16, 16).total());
  probe->release.release();
  CHECK(h.runUntilLogged(1) == RunExit::Done);
  CHECK(h.log() == "png:ok");
  CHECK(probe->outcome == static_cast<int>(JobOutcome::Kind::Value));
  CHECK(h.truthy("same(__host.image.decode(results.png).rgba, solid(16, 16, [90, 90, 90, 90]))"));
  CHECK(zero(h.usage()));
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// --- failures ----------------------------------------------------------------------

// Gate: failure disposal. A source libvips cannot decode rejects with an
// Error from the lane, and its charge is released when the rejection
// settles. An output format the adapter does not write fails at the call,
// before anything is charged.
void failuresRejectAndRelease(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  h.beginRun();
  h.eval(R"JS(
    const broken = new Uint8Array(256);
    broken.set([137, 80, 78, 71, 13, 10, 26, 10]);
    keep('broken', __host.image.transform(broken, '{"format":"png"}'));
    globalThis.tiff = attempt(() =>
      __host.image.transform(__host.image.encodePng(pattern(4, 4, 1), 4, 4), '{"format":"tiff"}'));
  )JS");
  CHECK(h.str("tiff") == "error: Unsupported image output format");
  CHECK(h.usage().operations == 1);
  CHECK(h.usage().bytes > 0);
  CHECK(h.runUntilLogged(1) == RunExit::Done);
  CHECK(h.truthy("log[0].startsWith('broken:Error:')"));
  CHECK(eventually([&] { return zero(h.usage()); }));
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate: a spec is bounded and validated before it is copied or parsed into
// anything but an ImageSpec. Under a 512 KiB run limit, a 1 MiB spec fails on
// its length before its copy is reserved, and a used field that holds null,
// an array or an object where a value belongs fails at the call. Nothing
// stays charged and no job is queued. A spec padded near the 4096-byte limit
// with unknown keys holding long arrays and nested objects is accepted: its
// job is charged exactly what the plain spec's job is, its source and an
// ImageSpec, and it gives the same output.
void specsAreBoundedBeforeAllocation(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  RunnerLimits limits;
  limits.runBytes = 512 * nodetool::jobs::kKiB;
  Harness h(cpu, limits);
  h.beginRun();
  h.eval(R"JS(
    globalThis.small = __host.image.encodePng(pattern(4, 4, 1), 4, 4);
    globalThis.tryBoth = (spec) => [attempt(() => __host.image.transform(small, spec)),
                                    attempt(() => __host.image.metadata(small, spec))].join(' / ');
    globalThis.huge = tryBoth('{"format":"png","pad":"' + 'x'.repeat(1 << 20) + '"}');
    globalThis.nullWidth = tryBoth('{"resize":{"width":null,"height":1}}');
    globalThis.arrayValue = tryBoth('{"format":["png"]}');
    globalThis.objectValue = tryBoth('{"create":{"width":2,"height":2,"channels":4,"background":{"r":{"deep":1}}}}');
    globalThis.notObject = tryBoth('[' + '0,'.repeat(1800) + '0]');
    globalThis.plain = '{"format":"png","removeAlpha":true}';
    globalThis.padded = '{"format":"png","pad":[' + '0,'.repeat(900) + '0],' +
      Array.from({length: 60}, (_, i) => '"k' + i + '":' + '{"a":['.repeat(3) + ']}'.repeat(3)).join(',') +
      ',"removeAlpha":true}';
  )JS");
  const std::string tooLong = "error: Image spec exceeds 4096 bytes";
  const std::string mistyped = "error: Invalid image spec field type";
  CHECK(h.str("huge") == tooLong + " / " + tooLong);
  CHECK(h.str("nullWidth") == mistyped + " / " + mistyped);
  CHECK(h.str("arrayValue") == mistyped + " / " + mistyped);
  CHECK(h.str("objectValue") == mistyped + " / " + mistyped);
  CHECK(h.str("notObject") == "error: Image spec must be an object / error: Image spec must be an object");
  CHECK(zero(h.usage()));
  CHECK(h.async->inFlight() == 0);
  CHECK(cpu.queued() == 0);

  const auto paddedBytes = static_cast<size_t>(h.engine->toNumber(h.eval("padded.length")));
  CHECK(paddedBytes > 3500 && paddedBytes <= gr::host::kMaxImageSpecBytes);
  const std::vector<uint8_t> small = h.bytes("small");
  auto job = gr::host::makeTransformJob(small, gr::host::parseImageSpec(R"({"format":"png","removeAlpha":true})"), {});
  CHECK(job->cost().snapshotBytes == small.size() + sizeof(gr::host::ImageSpec));
  auto hold = std::make_shared<GateProbe>();
  h.holdLane(hold);
  h.eval("keep('plain', __host.image.transform(small, plain)); keep('padded', __host.image.transform(small, padded));");
  CHECK(h.usage().bytes == 2 * job->cost().total());
  hold->release.release();
  CHECK(h.runUntilLogged(2) == RunExit::Done);
  CHECK(h.log() == "plain:ok | padded:ok");
  CHECK(h.truthy("same(results.plain.data, results.padded.data)"));
  CHECK(h.truthy("JSON.stringify(results.plain.info) === JSON.stringify(results.padded.info)"));
  CHECK(h.drained());
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate: admission and byte caps reject at the call, before the copy, and
// leave no promise pending and, once refused inputs are disposed, nothing
// charged. With a 1 MiB run limit a
// 4 MiB pixel buffer fails its snapshot reservation, and a 256 KiB buffer
// whose encode needs more than the limit fails at submission.
void admissionRejectsBeforeTheCopy(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  RunnerLimits limits;
  limits.runBytes = nodetool::jobs::kMiB;
  Harness h(cpu, limits);
  h.beginRun();
  CHECK(gr::host::pngJobCost(256, 256).total() > nodetool::jobs::kMiB);
  const std::string big = h.str("attempt(() => __host.image.encodePngAsync(new Uint8Array(1024 * 1024 * 4), 1024, 1024))");
  const std::string canvas = h.str("attempt(() => __host.canvas.create(1024, 1024).encodePng())");
  const std::string costly = h.str("attempt(() => __host.image.encodePngAsync(new Uint8Array(256 * 256 * 4), 256, 256))");
  const std::string mismatch = h.str("attempt(() => __host.image.encodePngAsync(new Uint8Array(12), 4, 4))");
  // The snapshot reservation refuses the first two before their copy.
  CHECK(big == "error: a host operation's inputs need 4194304 bytes, more than the run limit of 1 MiB");
  CHECK(canvas == big);
  CHECK(costly.rfind("error: a host operation needs ", 0) == 0);
  CHECK(mismatch == "error: __host.image.encodePngAsync: pixel data does not match width * height * 4");
  // The job refused at submission goes to the process disposer, which
  // releases its charge on its own thread.
  CHECK(eventually([&] { return zero(h.usage()); }));
  CHECK(h.async->inFlight() == 0);
  CHECK(cpu.queued() == 0);
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// --- PT12: large outputs and slow calls on the CPU lane ----------------------------

// Gate (PT12): a 50 MB decode copies once. Inside a run, decodeAsync decodes
// on the CPU lane, and both it and the synchronous decode hand the decoded
// pixels to JavaScript without a copy: the runner's JavaScript ledger holds
// them while the arrays live, and nothing once they are collected.
void largeDecodeCopiesOnce(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  constexpr uint64_t kSide = 3540;
  const uint64_t pixels = kSide * kSide * 4;
  h.eval("globalThis.big = __host.image.encodePng(solid(3540, 3540, [10, 20, 30, 255]), 3540, 3540);");
  h.beginRun();
  auto start = Clock::now();
  h.eval("globalThis.syncDecoded = __host.image.decode(big);");
  const auto syncMs = std::chrono::duration_cast<milliseconds>(Clock::now() - start).count();
  const uint64_t syncLedger = h.runner->usage().javaScriptBytes;
  std::fprintf(stderr, "PT12 sync decode of %llu bytes: %lld ms on the worker, %llu bytes adopted\n",
               static_cast<unsigned long long>(pixels), static_cast<long long>(syncMs),
               static_cast<unsigned long long>(syncLedger));
  CHECK(syncLedger >= pixels);
  CHECK(h.truthy("syncDecoded.rgba.length === 3540 * 3540 * 4 && syncDecoded.rgba[2] === 30"));
  CHECK(h.truthy("typeof __host.image.decodeAsync === 'function'"));
  start = Clock::now();
  h.eval("globalThis.callKind = attempt(() => __host.image.decodeAsync(big));"
         "keep('d', __host.image.decodeAsync(big));");
  const auto callMs = std::chrono::duration_cast<milliseconds>(Clock::now() - start).count();
  CHECK(h.str("callKind") == "promise");
  CHECK(h.runUntilLogged(1) == RunExit::Done);
  const auto asyncMs = std::chrono::duration_cast<milliseconds>(Clock::now() - start).count();
  CHECK(h.log() == "d:ok");
  CHECK(h.truthy("results.d.width === 3540 && results.d.height === 3540 && results.d.rgba.length === 3540 * 3540 * 4"));
  CHECK(h.truthy("results.d.rgba[0] === 10 && results.d.rgba[3] === 255"));
  const uint64_t ledger = h.runner->usage().javaScriptBytes;
  std::fprintf(stderr, "PT12 decodeAsync: call %lld ms, settled %lld ms, %llu bytes adopted\n",
               static_cast<long long>(callMs), static_cast<long long>(asyncMs),
               static_cast<unsigned long long>(ledger - syncLedger));
  CHECK(ledger >= syncLedger + pixels);
  h.eval("syncDecoded = null; results = {};");
  h.engine->collectGarbage();
  CHECK(h.runner->usage().javaScriptBytes == 0);
  CHECK(h.drained());
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

#ifdef GR_TEST_TESSDATA
// Gate (PT12): a cancel during OCR ends the call. Inside a run, OCR returns
// a promise at once and recognizes on the CPU lane. A cancel while it runs
// rejects the promise with an AbortError, and Tesseract's cancel callback
// sees the job's stop token, so the job ends and releases its charge long
// before a full recognition would.
void cancelDuringOcrEndsTheCall(Suite& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  Harness h(cpu);
  js::Engine& e = *h.engine;
  js::Value ocr = e.object();
  gr::host::installSandboxOcr(e, ocr, GR_TEST_TESSDATA, nullptr);
  e.set(e.get(e.global(), "__host"), "ocr", ocr);
  h.eval("globalThis.noise = __host.image.encodePng(pattern(4000, 4000, 13), 4000, 4000);");
  CHECK(h.truthy("noise.length <= 10 * 1024 * 1024"));
  // Outside a run, the recognition runs at the call, to its end.
  auto start = Clock::now();
  h.eval("globalThis.full = typeof __host.ocr.ocr(noise, 'eng', 30000);");
  const auto fullMs = std::chrono::duration_cast<milliseconds>(Clock::now() - start).count();
  CHECK(h.str("full") == "string");
  std::fprintf(stderr, "PT12 OCR outside a run: %lld ms at the call\n", static_cast<long long>(fullMs));
  h.beginRun();
  start = Clock::now();
  h.eval("globalThis.pending = __host.ocr.ocr(noise, 'eng', 30000);"
         "globalThis.ocrKind = pending instanceof Promise ? 'promise' : 'value';"
         "if (ocrKind === 'promise') keep('ocr', pending);");
  const auto callMs = std::chrono::duration_cast<milliseconds>(Clock::now() - start).count();
  if (h.str("ocrKind") != "promise") {
    std::fprintf(stderr, "PT12 OCR ran on the worker for %lld ms and could not be cancelled\n",
                 static_cast<long long>(callMs));
    CHECK(h.str("ocrKind") == "promise");
    h.endRun();
    return;
  }
  CHECK(callMs < 1000);
  // Let the lane start the recognition.
  CHECK(eventually([&] { return cpu.queued() == 0; }));
  std::this_thread::sleep_for(milliseconds(50));
  CHECK(h.logged() == 0);
  const auto cancelled = Clock::now();
  h.async->cancel();
  CHECK(h.runUntilLogged(1) == RunExit::Done);
  CHECK(h.log() == "ocr:AbortError:The operation was aborted");
  CHECK(h.drained());
  const auto stopMs = std::chrono::duration_cast<milliseconds>(Clock::now() - cancelled).count();
  std::fprintf(stderr, "PT12 OCR: call %lld ms, job ended %lld ms after the cancel\n",
               static_cast<long long>(callMs), static_cast<long long>(stopMs));
  CHECK(stopMs < 2000 * gr::test::kSanitizerTimeScale && stopMs < fullMs);
  h.endRun();
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}
#endif

}  // namespace

int main(int argc, char** argv) {
  const std::string only = argc > 1 ? argv[1] : "";
  struct Case {
    const char* name;
    void (*run)(Suite&);
  };
  const Case cases[] = {
      {"outputsMatchTheSynchronousPath", outputsMatchTheSynchronousPath},
      {"inputsAreCopiedAtTheCall", inputsAreCopiedAtTheCall},
      {"cancellationReleasesEveryReservation", cancellationReleasesEveryReservation},
      {"runningJobStopsBeforeEncoding", runningJobStopsBeforeEncoding},
      {"runEndsWhileAJobRuns", runEndsWhileAJobRuns},
      {"completedJobsReleaseTheirCharge", completedJobsReleaseTheirCharge},
      {"failuresRejectAndRelease", failuresRejectAndRelease},
      {"specsAreBoundedBeforeAllocation", specsAreBoundedBeforeAllocation},
      {"admissionRejectsBeforeTheCopy", admissionRejectsBeforeTheCopy},
      {"largeDecodeCopiesOnce", largeDecodeCopiesOnce},
#ifdef GR_TEST_TESSDATA
      {"cancelDuringOcrEndsTheCall", cancelDuringOcrEndsTheCall},
#endif
  };
  Suite t;
  for (const Case& c : cases) {
    if (!only.empty() && only != c.name) continue;
    t.begin(c.name);
    const int before = t.failures();
    try {
      c.run(t);
    } catch (const std::exception& e) {
      t.check(false, __FILE__, __LINE__, e.what());
    }
    std::fprintf(stderr, "%s %s\n", t.failures() == before ? "PASS" : "FAIL", c.name);
  }
  std::fprintf(stderr, "%d checks, %d failures\n", t.checks(), t.failures());
  return t.failures() == 0 ? 0 : 1;
}
