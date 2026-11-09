// The asynchronous media and track staging hosts
// (docs/plans/graph-runner-async-host.md, sections 4.7 to 4.9, rollout
// step 5): serial session order, finish, abort and close races, staging
// removal after dependents, stops between packets and frames, failure
// disposal with exact reservation counts, and outputs equal to the
// worker-only path.
//
// Each test drives __host.media from JavaScript under a bound run, as a
// graph run does. Races are forced through the media test hooks: an
// operation can be held at its start, and a stop check can pause, until the
// test releases it.
#include "host/media.h"
#include "host/sandbox_av_tracks.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/json.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/context_options.h"
#include "nodetool/jobs/admission.h"
#include "resource_test_support.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <stop_token>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>
extern "C" {
#include <libavutil/log.h>
}

namespace {

namespace fs = std::filesystem;
namespace js = gr::js;
using gr::AsyncRun;
using gr::RunExit;
using nodetool::jobs::LedgerUsage;
using std::chrono::milliseconds;
using std::chrono::seconds;
using step5::Clock;
using step5::Suite;
using step5::contains;
using step5::eventually;

// What the media hooks record, and the holds tests place on them.
//
// Thread affinity: thread-safe. `mutex` guards every field.
struct Probe {
  std::mutex mutex;
  std::condition_variable_any changed;
  std::vector<std::string> started;
  // Operations that wait at their start until released or stopped.
  std::set<std::string> held;
  int checkpoints = 0;
  // Writes that reached an encoder.
  int encoderWrites = 0;
  // The stop check that pauses until resume(). 0: none.
  int pauseAt = 0;
  bool paused = false;
  bool resumed = false;

  // A held operation that is stopped returns only once its stop flag is
  // set, so the check after it sees the stop.
  void start(std::string_view operation, const std::stop_token& stop, const gr::host::MediaTestHooks::Stopped& stopped) {
    std::unique_lock lock(mutex);
    started.emplace_back(operation);
    changed.notify_all();
    const std::string name(operation);
    if (!changed.wait(lock, stop, [&] { return !held.contains(name); })) {
      lock.unlock();
      (void)eventually([&] { return stopped(); });
    }
  }
  // A paused check returns after resume(), and only once its stop flag is
  // set, so it is the check that sees the stop.
  void checkpoint(const gr::host::MediaTestHooks::Stopped& stopped) {
    std::unique_lock lock(mutex);
    ++checkpoints;
    if (pauseAt == 0 || checkpoints != pauseAt) return;
    paused = true;
    changed.notify_all();
    changed.wait(lock, [&] { return resumed; });
    lock.unlock();
    (void)eventually([&] { return stopped(); });
  }
  void hold(const std::string& operation) {
    std::lock_guard lock(mutex);
    held.insert(operation);
  }
  void release(const std::string& operation) {
    {
      std::lock_guard lock(mutex);
      held.erase(operation);
    }
    changed.notify_all();
  }
  int count(const std::string& operation) {
    std::lock_guard lock(mutex);
    return static_cast<int>(std::count(started.begin(), started.end(), operation));
  }
  bool waitStarted(const std::string& operation, int n) {
    std::unique_lock lock(mutex);
    return changed.wait_for(lock, seconds(20), [&] {
      return std::count(started.begin(), started.end(), operation) >= n;
    });
  }
  // Counts stop checks from now on, pausing at the `pause`th.
  void countFrom(int pause) {
    std::lock_guard lock(mutex);
    checkpoints = 0;
    pauseAt = pause;
    paused = false;
    resumed = false;
  }
  bool waitPaused() {
    std::unique_lock lock(mutex);
    return changed.wait_for(lock, seconds(20), [&] { return paused; });
  }
  void resume() {
    {
      std::lock_guard lock(mutex);
      resumed = true;
    }
    changed.notify_all();
  }
  int checks() {
    std::lock_guard lock(mutex);
    return checkpoints;
  }
  std::vector<std::string> order() {
    std::lock_guard lock(mutex);
    return started;
  }
};

gr::host::MediaTestHooks hooksFor(const std::shared_ptr<Probe>& probe) {
  gr::host::MediaTestHooks hooks;
  hooks.started = [probe](std::string_view operation, const std::stop_token& stop,
                          const gr::host::MediaTestHooks::Stopped& stopped) { probe->start(operation, stop, stopped); };
  hooks.checkpoint = [probe](const gr::host::MediaTestHooks::Stopped& stopped) { probe->checkpoint(stopped); };
  hooks.encoderWrite = [probe] {
    std::lock_guard lock(probe->mutex);
    ++probe->encoderWrites;
  };
  return hooks;
}

std::string quoted(const std::string& text) { return gr::Json(text).dump(); }

// Grant and budget changes for one harness.
struct Config {
  size_t maxPixels = 0;
  size_t maxBytes = 0;
  nodetool::jobs::RunnerLimits runner;
};

// One engine with __host.media installed (media and track staging) on a
// temporary workspace, and one bound run on `lanes`, charged to its own
// admission ledger, as GraphRunner::Impl::runJob binds it.
//
// Thread affinity: the thread that created it only. The probe is shared
// with the lane threads through a shared pointer.
struct Harness {
  std::shared_ptr<Probe> probe = std::make_shared<Probe>();
  std::shared_ptr<gr::HostLanes> lanes;
  fs::path root;
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  gr::Loop& loop = gr::Loop::current();
  gr::CancelState cancel;
  std::shared_ptr<nodetool::jobs::RunnerTracker> tracker = std::make_shared<nodetool::jobs::RunnerTracker>();
  std::shared_ptr<nodetool::jobs::AdmissionLedger> ledger = std::make_shared<nodetool::jobs::AdmissionLedger>();
  std::shared_ptr<nodetool::jobs::RunnerAccount> runner;
  gr::host::RunIdentity identity;
  uint64_t generation = 0;
  std::optional<AsyncRun> async;
  std::optional<gr::RunBinding::Scope> bound;

  explicit Harness(std::shared_ptr<gr::HostLanes> l, size_t maxPixels = 0)
      : Harness(std::move(l), Config{maxPixels}) {}
  Harness(std::shared_ptr<gr::HostLanes> l, Config config)
      : lanes(std::move(l)), runner(ledger->openRunner(config.runner)) {
    const size_t maxPixels = config.maxPixels;
    std::string pattern = (fs::temp_directory_path() / "gr-media-async-XXXXXX").string();
    if (!mkdtemp(pattern.data())) throw std::runtime_error("mkdtemp failed");
    root = fs::canonical(pattern);
    gr::HostOptions options;
    options.workspaceDir = root.string();
    gr::host::MediaOptions grant;
    grant.enabled = true;
    grant.encoders = {"libx264", "aac"};
    if (maxPixels) grant.maxPixels = maxPixels;
    if (config.maxBytes) grant.maxBytes = config.maxBytes;
    grant.hooks = hooksFor(probe);
    js::Value host = engine->object();
    js::Value media = engine->object();
    gr::host::installMedia(*engine, media, options, grant);
    gr::host::installSandboxAvTracks(*engine, media, options, grant);
    engine->set(host, "media", media);
    engine->set(engine->global(), "__host", host);
    eval(R"(
      globalThis.log = [];
      globalThis.describe = (v) => v === null ? 'null' : v === undefined ? 'undefined'
        : typeof v === 'object' && v.rgba ? 'frame:' + v.rgba[0]
        : typeof v === 'object' ? JSON.stringify(v) : String(v);
      globalThis.record = (label, p) => Promise.resolve(p).then(
        (v) => { log.push(label + ':ok:' + describe(v)); },
        (e) => { log.push(label + ':' + e.name + ':' + e.message); });
      globalThis.has = (label) => log.some((e) => e.startsWith(label + ':'));
      globalThis.entry = (label) => log.find((e) => e.startsWith(label + ':')) ?? '';
      globalThis.attempt = (f) => { try { f(); return 'returned'; } catch (e) { return 'error: ' + e.message; } };
      globalThis.gray = (size, value) => {
        const pixels = new Uint8Array(size * size * 4);
        for (let i = 0; i < pixels.length; i += 4) pixels.set([value, value, value, 255], i);
        return pixels;
      };
      globalThis.media = __host.media;
      globalThis.encoderOptions = (outPath, size) => ({ outPath, fps: 10, input: 'rgba', width: size, height: size,
        spec: { codec: 'libx264', pixelFormat: 'yuv420p', options: { preset: 'veryfast', crf: '0' } } });
    )");
    beginRun();
  }
  ~Harness() {
    endRun();
    // The engine's host state holds the sessions and staging directories.
    engine.reset();
    if (!tracker->waitIdle(Clock::now() + seconds(30)) || !idle()) {
      std::fprintf(stderr, "media jobs were not disposed within 30 s\n");
      std::_Exit(1);
    }
    std::error_code error;
    fs::remove_all(root, error);
  }
  Harness(const Harness&) = delete;
  Harness& operator=(const Harness&) = delete;

  void beginRun() {
    identity = gr::host::newRunIdentity("media", runner->openRun());
    generation = cancel.beginRun();
    async.emplace(*engine, loop, tracker, generation, lanes->cpu(), identity);
    bound.emplace(*engine, *async, lanes->io());
  }
  // As runJob's teardown: unbind, stop and detach the run's jobs, drop
  // timers and frames, then release run resources.
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
  // No lane holds media work: nothing queued, running or waiting to be
  // destroyed on its reaper.
  bool idle() {
    return eventually([&] {
      for (auto kind : {gr::HostLanes::Kind::Cpu, gr::HostLanes::Kind::Io}) {
        if (auto* pool = lanes->pool(kind)) {
          if (pool->queued() || pool->running() || pool->pendingReaps()) return false;
        }
      }
      return true;
    }, milliseconds(30000));
  }

  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  std::string entry(const std::string& label) { return str("entry(" + quoted(label) + ")"); }
  RunExit runUntil(const std::string& condition) {
    gr::EngineRunControl control(*engine, *async, cancel, generation,
                                 [&] { return engine->toBoolean(eval(condition)); });
    return loop.run(control);
  }
  bool settle(const std::string& label) { return runUntil("has(" + quoted(label) + ")") == RunExit::Done; }
  LedgerUsage usage() const { return identity->account->usage(); }
  std::string path(const std::string& name) const { return (root / name).string(); }

  // Encodes `frames` gray frames of `size` x `size` pixels, the i-th one
  // 20 + 30 * i, into `name`.
  void encode(const std::string& name, int frames, int size = 16) {
    eval("record('fixture " + name + "', (async () => {"
         "  const id = media.openEncoder(encoderOptions(" + quoted(path(name)) + ", " + std::to_string(size) + "));"
         "  for (let i = 0; i < " + std::to_string(frames) + "; i++)"
         "    await media.write(id, gray(" + std::to_string(size) + ", 20 + 30 * i));"
         "  await media.finish(id); media.abort(id); })());");
    if (!settle("fixture " + name) || !contains(entry("fixture " + name), ":ok:")) {
      throw std::runtime_error("fixture failed: " + entry("fixture " + name));
    }
  }
  // A mono 16-bit WAV of a 440 Hz tone, `seconds` long.
  void tone(const std::string& name, int lengthSeconds = 1) {
    const uint32_t rate = 48000, samples = rate * lengthSeconds, data = samples * 2;
    std::vector<uint8_t> wav(44 + data);
    auto text = [&](size_t at, const char* value) { std::copy(value, value + 4, wav.begin() + at); };
    auto u32 = [&](size_t at, uint32_t v) {
      for (int i = 0; i < 4; ++i) wav[at + i] = uint8_t(v >> (8 * i));
    };
    auto u16 = [&](size_t at, uint16_t v) {
      wav[at] = uint8_t(v);
      wav[at + 1] = uint8_t(v >> 8);
    };
    text(0, "RIFF");
    u32(4, 36 + data);
    text(8, "WAVE");
    text(12, "fmt ");
    u32(16, 16);
    u16(20, 1);
    u16(22, 1);
    u32(24, rate);
    u32(28, rate * 2);
    u16(32, 2);
    u16(34, 16);
    text(36, "data");
    u32(40, data);
    for (uint32_t i = 0; i < samples; ++i) {
      const auto value = int16_t(8000 * std::sin(2 * 3.14159265358979 * 440 * i / rate));
      u16(44 + i * 2, uint16_t(value));
    }
    std::ofstream(path(name), std::ios::binary).write(reinterpret_cast<const char*>(wav.data()), wav.size());
  }
};

// What an encoder opened with encoderOptions(path) keeps charged while it
// lives: its path, codec, pixel format and the two codec options.
uint64_t encoderBytes(const std::string& path) {
  return path.size() + std::string("libx264yuv420ppresetveryfastcrf0").size();
}

bool zero(const LedgerUsage& u) { return u.bytes == 0 && u.operations == 0 && u.deferredBytes == 0; }

std::shared_ptr<gr::HostLanes> threaded() { return gr::processHostLanes({}); }

std::string fileBytes(const fs::path& path) {
  std::ifstream file(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(file), {}};
}

// --- serial sessions ---------------------------------------------------------

// Gate: serial session ordering. With four CPU lane threads free, a second
// write of the same encoder does not start while the first is held. Writes
// submitted without awaiting run in call order: the decoded frames come back
// in the order they were written.
void serialSessionOrder(Suite& t) {
  Harness h(threaded());
  h.probe->hold("write");
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("order.mp4")) + ", 16));"
         "for (let i = 0; i < 6; i++) record('w' + i, media.write(enc, gray(16, 20 + 30 * i)));"
         "record('finish', media.finish(enc));");
  CHECK(h.probe->waitStarted("write", 1));
  std::this_thread::sleep_for(milliseconds(100));
  // The session's later writes wait behind the held one.
  CHECK(h.probe->count("write") == 1);
  CHECK(h.str("log.length") == "0");
  h.probe->release("write");
  CHECK(h.settle("finish"));
  CHECK(h.str("log.join('|')") == "w0:ok:undefined|w1:ok:undefined|w2:ok:undefined|w3:ok:undefined|"
                                  "w4:ok:undefined|w5:ok:undefined|finish:ok:undefined");
  const auto order = h.probe->order();
  CHECK(order.size() == 7 && order.back() == "finish");
  h.eval("media.abort(enc); log = [];"
         "record('open', media.openFilter({ inputs: [{ filePath: " + quoted(h.path("order.mp4")) +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' })"
         ".then((id) => { globalThis.reader = id;"
         "  for (let i = 0; i < 7; i++) record('n' + i, media.next(id)); return id; }));");
  CHECK(h.runUntil("has('n6')") == RunExit::Done);
  for (int i = 0; i < 6; ++i) {
    const std::string frame = h.entry("n" + std::to_string(i));
    const auto at = frame.find("frame:");
    CHECK(at != std::string::npos);
    if (at == std::string::npos) continue;
    const int value = std::stoi(frame.substr(at + 6));
    CHECK(std::abs(value - (20 + 30 * i)) <= 3);
  }
  CHECK(h.entry("n6") == "n6:ok:null");
  h.eval("media.close(reader);");
}

// --- finish, abort and close ------------------------------------------------

// Gate: abort supersedes a queued finish. The first write is held at its
// start, so the second write and the finish wait in the session's queue.
// abort() rejects both with an AbortError, stops the held write before it
// touched the codec, and no output file is created.
void abortSupersedesQueuedFinish(Suite& t) {
  Harness h(threaded());
  h.probe->hold("write");
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("aborted.mp4")) + ", 16));"
         "record('w0', media.write(enc, gray(16, 50)));"
         "record('w1', media.write(enc, gray(16, 80)));"
         "record('finish', media.finish(enc));");
  CHECK(h.probe->waitStarted("write", 1));
  h.eval("media.abort(enc);");
  CHECK(h.runUntil("log.length === 3") == RunExit::Done);
  CHECK(h.entry("w0") == "w0:AbortError:native media write was stopped");
  CHECK(h.entry("w1") == "w1:AbortError:native media encoder was aborted");
  CHECK(h.entry("finish") == "finish:AbortError:native media encoder was aborted");
  CHECK(h.probe->count("write") == 1);
  CHECK(h.probe->count("finish") == 0);
  CHECK(!fs::exists(h.path("aborted.mp4")));
  // Calls after the abort find no encoder.
  CHECK(contains(h.str("attempt(() => media.write(enc, gray(16, 1)))"), "native media encoder closed"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
}

// Gate: finish publishes only after the writes before it succeeded. The
// second write fails, which retires the session: the finish queued behind
// it rejects with that write's error instead of writing a trailer, and the
// session accepts nothing more.
void finishWaitsForPrecedingWrites(Suite& t) {
  Harness h(threaded());
  h.probe->hold("write");
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("partial.mp4")) + ", 16));"
         "record('w0', media.write(enc, gray(16, 50)));"
         "record('w1', media.write(enc, new Uint8Array(100)));"
         "record('w2', media.write(enc, gray(16, 80)));"
         "record('finish', media.finish(enc));");
  CHECK(h.probe->waitStarted("write", 1));
  h.probe->release("write");
  CHECK(h.runUntil("log.length === 4") == RunExit::Done);
  CHECK(h.entry("w0") == "w0:ok:undefined");
  CHECK(h.entry("w1") == "w1:Error:native media RGBA frame length mismatch");
  CHECK(h.entry("w2") == "w2:Error:native media RGBA frame length mismatch");
  CHECK(h.entry("finish") == "finish:Error:native media RGBA frame length mismatch");
  CHECK(h.probe->count("finish") == 0);
  h.eval("record('late', media.write(enc, gray(16, 80)));");
  CHECK(h.settle("late"));
  CHECK(h.entry("late") == "late:Error:native media encoder " + h.str("enc") + " is closed");
  // The first frame opened the file, but nothing finished it.
  h.eval("record('partial', media.probe(" + quoted(h.path("partial.mp4")) + "));");
  CHECK(h.settle("partial"));
  CHECK(contains(h.entry("partial"), "partial:Error:native media:"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
}

// Gate: an abort that comes after a finish committed changes nothing. The
// fixture encoder aborts right after its finish resolved, and the file is
// complete: finish closed it before it resolved.
void abortAfterFinishKeepsOutput(Suite& t) {
  Harness h(threaded());
  h.encode("done.mp4", 3);
  h.eval("record('probe', media.probe(" + quoted(h.path("done.mp4")) + "));");
  CHECK(h.settle("probe"));
  CHECK(contains(h.entry("probe"), "\"durationSec\":0.3"));
}

// Gate: explicit close is a terminal barrier, not an abort. Reads accepted
// before close() still run and resolve in order. A read after it is
// refused at the call.
void closeRunsAcceptedReads(Suite& t) {
  Harness h(threaded());
  h.encode("close.mp4", 4);
  h.probe->hold("next");
  h.eval("record('open', media.openFilter({ inputs: [{ filePath: " + quoted(h.path("close.mp4")) +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' })"
         ".then((id) => { globalThis.reader = id; record('n0', media.next(id)); record('n1', media.next(id));"
         "  media.close(id); return id; }));");
  CHECK(h.runUntil("has('open')") == RunExit::Done);
  CHECK(h.probe->waitStarted("next", 1));
  h.probe->release("next");
  CHECK(h.runUntil("has('n1')") == RunExit::Done);
  CHECK(contains(h.entry("n0"), "n0:ok:frame:"));
  CHECK(contains(h.entry("n1"), "n1:ok:frame:"));
  CHECK(contains(h.str("attempt(() => media.next(reader))"), "native media reader closed"));
}

// Gate: run cleanup aborts every session while operations are held and
// queued. The results are disposed into the closed mailbox, each job
// releases its whole reservation, and no promise settles after teardown.
void runCleanupDisposesSessions(Suite& t) {
  Harness h(threaded(), 4096);
  h.encode("cleanup.mp4", 3);
  h.eval("record('open', media.openFilter({ inputs: [{ filePath: " + quoted(h.path("cleanup.mp4")) +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' }));");
  CHECK(h.settle("open"));
  h.probe->hold("next");
  h.probe->hold("write");
  h.eval("const id = Number(entry('open').split(':')[2]);"
         "record('n0', media.next(id)); record('n1', media.next(id));"
         "globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("cleanup-out.mp4")) + ", 16));"
         "record('w0', media.write(enc, gray(16, 9)));");
  CHECK(h.probe->waitStarted("next", 1));
  CHECK(h.probe->waitStarted("write", 1));
  // Two running operations, one queued: each holds its own charge.
  const LedgerUsage held = h.usage();
  CHECK(held.operations == 3);
  CHECK(held.bytes == 2 * 16384 + 3 * 1024 + encoderBytes(h.path("cleanup-out.mp4")));
  CHECK(h.tracker->outstanding() == 3);
  h.endRun();
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(h.tracker->outstanding() == 0);
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
  CHECK(h.str("log.filter((e) => !e.startsWith('fixture')).join('|')") == "open:ok:" + h.str("Number(entry('open').split(':')[2])"));
  CHECK(!fs::exists(h.path("cleanup-out.mp4")));
  h.beginRun();
}

// --- staging -----------------------------------------------------------------

// Gate: a staging directory is removed only after its dependents released
// it. A reader opened on a staged file keeps the directory after
// releaseTempDir(), until the reader is closed and its body destroyed. A
// one-shot probe held at its start keeps it the same way. A path inside a
// released directory is refused at the call.
void stagingWaitsForDependents(Suite& t) {
  Harness h(threaded());
  h.encode("source.mp4", 3);
  const std::string first = h.str("media.tempDir()");
  fs::copy_file(h.path("source.mp4"), first + "/input.mp4");
  h.eval("record('open', media.openFilter({ inputs: [{ filePath: " + quoted(first + "/input.mp4") +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' }));");
  CHECK(h.settle("open"));
  h.eval("globalThis.reader = Number(entry('open').split(':')[2]); media.releaseTempDir(" + quoted(first) + ");");
  CHECK(contains(h.str("attempt(() => media.releaseTempDir(" + quoted(first) + "))"), "not registered"));
  CHECK(contains(h.str("attempt(() => media.probe(" + quoted(first + "/input.mp4") + "))"),
                 "Code media staging directory was released"));
  std::this_thread::sleep_for(milliseconds(100));
  CHECK(fs::exists(first + "/input.mp4"));
  // The leased directory still serves the reader.
  h.eval("record('n0', media.next(reader));");
  CHECK(h.settle("n0"));
  CHECK(contains(h.entry("n0"), "n0:ok:frame:"));
  CHECK(fs::exists(first));
  h.eval("media.close(reader);");
  CHECK(eventually([&] { return !fs::exists(first); }));

  const std::string second = h.str("media.tempDir()");
  fs::copy_file(h.path("source.mp4"), second + "/input.mp4");
  h.probe->hold("probe");
  h.eval("record('probe', media.probe(" + quoted(second + "/input.mp4") + "));"
         "media.releaseTempDir(" + quoted(second) + ");");
  CHECK(h.probe->waitStarted("probe", 1));
  std::this_thread::sleep_for(milliseconds(100));
  CHECK(fs::exists(second + "/input.mp4"));
  h.probe->release("probe");
  CHECK(h.settle("probe"));
  CHECK(contains(h.entry("probe"), "probe:ok:{"));
  CHECK(eventually([&] { return !fs::exists(second); }));
}

// Gate: run cleanup removes staging after its dependents. A reader's read
// is paused at a stop check, past its start, so the stop cannot reach it
// yet. Run cleanup aborts the reader and the directory: the directory stays
// while the read runs, and goes once the read stopped and the reader's
// body was destroyed.
void runCleanupRemovesStagingAfterDependents(Suite& t) {
  Harness h(threaded());
  h.encode("source.mp4", 3);
  const std::string staged = h.str("media.tempDir()");
  fs::copy_file(h.path("source.mp4"), staged + "/input.mp4");
  h.eval("record('open', media.openFilter({ inputs: [{ filePath: " + quoted(staged + "/input.mp4") +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' }));");
  CHECK(h.settle("open"));
  h.probe->countFrom(1);
  h.eval("record('n0', media.next(Number(entry('open').split(':')[2])));");
  CHECK(h.probe->waitPaused());
  h.endRun();
  std::this_thread::sleep_for(milliseconds(150));
  CHECK(fs::exists(staged + "/input.mp4"));
  h.probe->resume();
  CHECK(eventually([&] { return !fs::exists(staged); }));
  CHECK(h.probe->checks() == 1);
  CHECK(h.str("has('n0')") == "false");
  h.beginRun();
}

// --- stop between packets and frames ------------------------------------------

// Gate: cancellation between packets. packetTimes is paused at its third
// stop check, the run is cancelled, and the job stops at that check instead
// of reading the remaining packets. An encoder write held at its start
// stops at its first check when the encoder is aborted, before the codec
// ran.
void stopBetweenPackets(Suite& t) {
  Harness h(threaded());
  h.encode("long.mp4", 30);
  h.probe->countFrom(0);
  h.eval("record('all', media.packetTimes(" + quoted(h.path("long.mp4")) + ", 1000));");
  CHECK(h.settle("all"));
  const int full = h.probe->checks();
  CHECK(full > 30);
  CHECK(h.str("JSON.parse(entry('all').slice('all:ok:'.length)).length") == "30");

  h.probe->countFrom(3);
  h.eval("record('cut', media.packetTimes(" + quoted(h.path("long.mp4")) + ", 1000));");
  CHECK(h.probe->waitPaused());
  h.async->cancel();
  h.probe->resume();
  CHECK(h.settle("cut"));
  CHECK(h.entry("cut") == "cut:AbortError:The operation was aborted");
  // The job's own result, after the cancellation's, is disposed with the
  // run's mailbox.
  h.endRun();
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(h.probe->checks() == 3);
  h.beginRun();
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("stopped.mp4")) + ", 16));"
         "record('w0', media.write(enc, gray(16, 30)));");
  CHECK(h.settle("w0"));
  h.probe->countFrom(0);
  h.probe->hold("write");
  h.eval("record('w1', media.write(enc, gray(16, 60)));");
  CHECK(h.probe->waitStarted("write", 2));
  h.eval("media.abort(enc);");
  CHECK(h.settle("w1"));
  CHECK(h.entry("w1") == "w1:AbortError:native media write was stopped");
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(h.probe->checks() == 1);
}

// Gate (review F1): a write refused at the call retires its encoder. One
// write is accepted, the next is over the byte quota and throws at the
// call. The guest catches it and calls finish, which must not publish a
// file without that frame: it fails with the refused write's error, while
// the write accepted before it still resolves.
void refusedWriteBlocksFinish(Suite& t) {
  Harness h(threaded(), Config{0, 8000});
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("quota.mp4")) + ", 16));"
         "record('w0', media.write(enc, gray(16, 50)));"
         "globalThis.refused = attempt(() => media.write(enc, new Uint8Array(9000)));"
         "record('finish', (async () => media.finish(enc))());");
  CHECK(h.str("refused") == "error: native media input byte quota exceeded");
  CHECK(h.runUntil("has('w0') && has('finish')") == RunExit::Done);
  CHECK(h.entry("w0") == "w0:ok:undefined");
  CHECK(h.entry("finish") == "finish:Error:native media input byte quota exceeded");
  CHECK(h.probe->count("finish") == 0);
  CHECK(contains(h.str("attempt(() => media.write(enc, gray(16, 9)))"), "byte quota exceeded"));
  h.eval("media.abort(enc);");
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate (review F1): a write refused by admission retires its encoder the
// same way. The run's byte limit admits a 16x16 frame but not a write
// whose snapshot and workspace exceed it, so run.submit refuses it after
// the snapshot was taken. finish then fails with the admission error.
void admissionRefusalBlocksFinish(Suite& t) {
  Config config;
  config.runner.runBytes = 8192;
  Harness h(threaded(), config);
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("admission.mp4")) + ", 16));"
         "record('w0', media.write(enc, gray(16, 50)));"
         "globalThis.refused = attempt(() => media.write(enc, new Uint8Array(3000)));"
         "record('finish', (async () => media.finish(enc))());");
  CHECK(contains(h.str("refused"), "more than the run limit"));
  CHECK(h.runUntil("has('w0') && has('finish')") == RunExit::Done);
  CHECK(h.entry("w0") == "w0:ok:undefined");
  CHECK(contains(h.entry("finish"), "finish:Error:a host operation needs"));
  CHECK(h.probe->count("finish") == 0);
  h.eval("media.abort(enc);");
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate (review F2): openEncoder copies only the fields the encoder uses,
// each after its bytes were reserved, and keeps that charge while the
// session lives. Under a 1 MiB run budget, a 2 MiB filter string is
// refused at the call, before its copy, and nothing stays charged. A large
// property the encoder does not use is never copied: the session is
// charged only for its path and spec, and the charge goes with the session.
void encoderOptionsAreReserved(Suite& t) {
  Config config;
  config.runner.runBytes = 1024 * 1024;
  Harness h(threaded(), config);
  const std::string out = h.path("options.mp4");
  h.eval("globalThis.big = 'x'.repeat(700000);"
         "globalThis.oversized = attempt(() => media.openEncoder({ ...encoderOptions(" + quoted(out) + ", 16),"
         "  spec: { codec: 'libx264', filter: big } }));");
  CHECK(contains(h.str("oversized"), "more than the run limit"));
  CHECK(eventually([&] { return zero(h.usage()); }));
  CHECK(h.usage().retainedBytes == 0);
  h.eval("globalThis.enc = media.openEncoder({ ...encoderOptions(" + quoted(out) + ", 16), extra: 'y'.repeat(4000000),"
         "  nested: { more: big } });");
  const uint64_t kept = encoderBytes(out);
  CHECK(h.usage().bytes == kept);
  CHECK(h.usage().retainedBytes == kept);
  CHECK(h.usage().operations == 0);
  h.eval("record('w0', media.write(enc, gray(16, 50)));");
  CHECK(h.settle("w0"));
  CHECK(h.entry("w0") == "w0:ok:undefined");
  h.eval("media.abort(enc);");
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
  CHECK(h.usage().retainedBytes == 0);
}

// Gate (second review F1): a write the run's admission queue refuses
// blocks every later write and the finish. With an 8 KiB run budget and one
// operation slot, a held packetTimes takes the slot, so six 1 KiB frame
// writes and the finish wait as deferred starts. When the slot frees, the
// first write needs 3 KiB beside the other five snapshots and the
// encoder's retained options, and nothing else can drain, so admission
// refuses it. Whether the next writes are refused too depends on when the
// process disposer releases the refused write's charge. Either way no write
// after the refused one succeeds: an admitted one sees the missing write and
// fails before it touches the codec, which retires the session, and a finish
// that runs sees it too. The file the first frame opened is never finished.
void deferredRefusalBlocksFinish(Suite& t) {
  Config config;
  config.runner.runBytes = 8192;
  config.runner.runOperations = 1;
  Harness h(threaded(), config);
  h.encode("hold.mp4", 2);
  const std::string out = h.path("deferred.mp4");
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(out) + ", 16));"
         "record('w0', media.write(enc, gray(16, 50)));");
  CHECK(h.settle("w0"));
  CHECK(h.entry("w0") == "w0:ok:undefined");
  const int finishes = h.probe->count("finish");
  h.probe->hold("packetTimes");
  h.eval("record('hold', media.packetTimes(" + quoted(h.path("hold.mp4")) + ", 1));");
  CHECK(h.probe->waitStarted("packetTimes", 1));
  h.eval("for (let i = 1; i <= 6; i++) record('w' + i, media.write(enc, gray(16, 50 + 20 * i)));"
         "record('finish', media.finish(enc));");
  // Every write and the finish wait for admission: none was refused at the
  // call.
  CHECK(h.async->deferred() == 7);
  h.probe->release("packetTimes");
  CHECK(h.runUntil("log.length === 10") == RunExit::Done);
  CHECK(contains(h.entry("w1"), "w1:Error:a waiting host operation can never start"));
  int gaps = 0;
  for (int i = 1; i <= 6; ++i) {
    const std::string entry = h.entry("w" + std::to_string(i));
    CHECK(contains(entry, ":Error:"));
    if (contains(entry, "native media encoder write 2 was refused before it ran")) ++gaps;
  }
  // At most one admitted write found the gap: it retired the session.
  CHECK(gaps <= 1);
  CHECK(contains(h.entry("finish"), "finish:Error:"));
  CHECK(h.probe->count("finish") <= finishes + 1);
  h.eval("media.abort(enc); record('probe', media.packetTimes(" + quoted(out) + ", 1));");
  CHECK(h.settle("probe"));
  CHECK(contains(h.entry("probe"), "probe:Error:native media:"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate (second review F1): finish itself checks the sequence when the
// refused write is the last one before it, so no later write can notice
// the gap. One 2720-byte write is deferred behind a held packetTimes. On
// retry it needs 8160 bytes beside the encoder's retained options, more
// than the 8 KiB run budget while nothing can drain, so admission refuses
// it. The finish behind it is admitted and rejects instead of publishing.
void deferredRefusalOfLastWrite(Suite& t) {
  Config config;
  config.runner.runBytes = 8192;
  config.runner.runOperations = 1;
  Harness h(threaded(), config);
  h.encode("hold.mp4", 2);
  const std::string out = h.path("last.mp4");
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(out) + ", 16));"
         "record('w0', media.write(enc, gray(16, 50)));");
  CHECK(h.settle("w0"));
  const int finishes = h.probe->count("finish");
  h.probe->hold("packetTimes");
  h.eval("record('hold', media.packetTimes(" + quoted(h.path("hold.mp4")) + ", 1));");
  CHECK(h.probe->waitStarted("packetTimes", 1));
  h.eval("record('w1', media.write(enc, new Uint8Array(2720))); record('finish', media.finish(enc));");
  CHECK(h.async->deferred() == 2);
  h.probe->release("packetTimes");
  CHECK(h.runUntil("has('w1') && has('finish')") == RunExit::Done);
  CHECK(contains(h.entry("w1"), "w1:Error:a waiting host operation can never start"));
  CHECK(h.entry("finish") == "finish:Error:native media encoder write 2 was refused before it ran");
  CHECK(h.probe->count("finish") == finishes + 1);
  h.eval("media.abort(enc); record('probe', media.packetTimes(" + quoted(out) + ", 1));");
  CHECK(h.settle("probe"));
  CHECK(contains(h.entry("probe"), "probe:Error:native media:"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate (third review F4): the write-side sequence check, deterministically.
// With an 8 KiB run budget and one operation slot, a held packetTimes takes
// the slot while four starts wait: write 2 (sized so its admission is
// refused while nothing can drain), a reader's open, write 3 and finish.
// When the slot frees, write 2 is refused and the small open is admitted
// and held, so write 3 stays blocked behind it instead of being judged
// while write 2's charge may still be on the process disposer. Once that
// charge is gone, the open is released and write 3 is admitted: it fails
// with the gap error without reaching the encoder, and finish rejects.
void writeSeesRefusedWrite(Suite& t) {
  Config config;
  config.runner.runBytes = 8192;
  config.runner.runOperations = 1;
  Harness h(threaded(), config);
  h.encode("hold.mp4", 2);
  const std::string out = h.path("gap.mp4"), hold = h.path("hold.mp4");
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(out) + ", 16));"
         "record('w1', media.write(enc, gray(16, 50)));");
  CHECK(h.settle("w1"));
  CHECK(h.entry("w1") == "w1:ok:undefined");
  h.eval("globalThis.blockerOptions = { inputs: [{ filePath: " + quoted(hold) +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' };");
  const uint64_t blocker = std::stoull(h.str("JSON.stringify(blockerOptions).length"));
  // Fits at deferral, but not beside the encoder's retained options once
  // nothing else can drain.
  const uint64_t first = (8192 - blocker - 1024) / 3;
  h.probe->hold("packetTimes");
  h.probe->hold("openFilter");
  h.eval("record('hold', media.packetTimes(" + quoted(hold) + ", 1));");
  CHECK(h.probe->waitStarted("packetTimes", 1));
  h.eval("record('w2', media.write(enc, new Uint8Array(" + std::to_string(first) + ")));"
         "record('blocker', media.openFilter(blockerOptions));"
         "record('w3', media.write(enc, gray(16, 90)));"
         "record('finish', media.finish(enc));");
  CHECK(h.async->deferred() == 4);
  const int writes = [&] {
    std::lock_guard lock(h.probe->mutex);
    return h.probe->encoderWrites;
  }();
  // The packetTimes ends: write 2 is refused, the open is admitted and held
  // at its start.
  h.probe->release("packetTimes");
  CHECK(h.runUntil("has('hold') && has('w2')") == RunExit::Done);
  CHECK(contains(h.entry("w2"), "w2:Error:a waiting host operation can never start"));
  CHECK(h.probe->waitStarted("openFilter", 1));
  CHECK(h.async->deferred() == 2);
  // Write 2's charge has left the ledger: only write 3's snapshot waits.
  CHECK(eventually([&] { return h.usage().deferredBytes == 1024; }));
  h.probe->release("openFilter");
  CHECK(h.runUntil("has('blocker') && has('w3') && has('finish')") == RunExit::Done);
  CHECK(h.entry("w3") == "w3:Error:native media encoder write 2 was refused before it ran");
  CHECK(contains(h.entry("finish"), "finish:Error:"));
  {
    std::lock_guard lock(h.probe->mutex);
    CHECK(h.probe->encoderWrites == writes);
  }
  CHECK(contains(h.entry("blocker"), "blocker:ok:"));
  h.eval("media.abort(enc); media.close(Number(entry('blocker').split(':')[2]));"
         "record('probe', media.packetTimes(" + quoted(out) + ", 1));");
  CHECK(h.settle("probe"));
  CHECK(contains(h.entry("probe"), "probe:Error:native media:"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.ledger->usage()); }));
}

// Gate (third review F3): a large array option value is never serialized or
// parsed natively. Under a 64 KiB run budget an encoder whose crf is a
// 100000-element array opens, holding only its path and spec, and its first
// write fails with the JSON library's type error for an array.
void largeOptionValueIsNotParsed(Suite& t) {
  Config config;
  config.runner.runBytes = 64 * 1024;
  Harness h(threaded(), config);
  const std::string out = h.path("array.mp4");
  CHECK(h.str("attempt(() => { globalThis.enc = media.openEncoder({ ...encoderOptions(" + quoted(out) + ", 16),"
              "  spec: { codec: 'libx264', pixelFormat: 'yuv420p', options: { preset: 'veryfast',"
              "    crf: Array(100000).fill(0) } } }); })") == "returned");
  // Its path, codec, pixel format, the granted preset, and the diagnostic
  // the first write reports.
  const std::string diagnostic = "[json.exception.type_error.302] type must be string, but is array";
  const uint64_t kept = out.size() + std::string("libx264yuv420ppresetveryfast").size() + diagnostic.size();
  CHECK(h.usage().bytes == kept);
  CHECK(h.usage().retainedBytes == kept);
  h.eval("record('w1', media.write(enc, gray(16, 50)));");
  CHECK(h.settle("w1"));
  CHECK(h.entry("w1") == "w1:Error:[json.exception.type_error.302] type must be string, but is array");
  h.eval("media.abort(enc);");
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
}

// Gate (second review F2): encoder options fail the first write in the
// order and with the messages of the former JSON copy, which kept
// JSON.stringify's order (Object.keys order) and read each value with the
// JSON library. A value JSON.stringify drops is skipped.
void encoderOptionErrors(Suite& t) {
  Harness h(threaded());
  const auto open = [&](const std::string& label, const std::string& options) {
    h.eval("record('" + label + "', (async () => { const id = media.openEncoder({ ...encoderOptions(" +
           quoted(h.path(label + ".mp4")) + ", 16), spec: { codec: 'libx264', options: " + options +
           " } }); try { await media.write(id, gray(16, 50)); } finally { media.abort(id); } })());");
    CHECK(h.settle(label));
    return h.entry(label);
  };
  CHECK(open("order", "{ zzz: 'x', aaa: 'x' }") == "order:Error:native media encoder option not granted: zzz");
  CHECK(open("number", "{ crf: 1 }") ==
        "number:Error:[json.exception.type_error.302] type must be string, but is number");
  CHECK(open("object", "{ preset: { a: 1 }, crf: 2 }") ==
        "object:Error:[json.exception.type_error.302] type must be string, but is object");
  CHECK(open("dropped", "{ zzz: undefined, preset: 'veryfast', crf: '0' }") == "dropped:ok:undefined");
  CHECK(open("boolean", "{ crf: true }") ==
        "boolean:Error:[json.exception.type_error.302] type must be string, but is boolean");
  CHECK(open("null", "{ crf: NaN }") ==
        "null:Error:[json.exception.type_error.302] type must be string, but is null");
  CHECK(open("boxed", "{ preset: new String('veryfast'), crf: { toJSON: () => '0' } }") == "boxed:ok:undefined");
}

// Gate (second review F2 follow-up): the session's retained charge covers
// everything it keeps, also bytes that were never copied from the guest: a
// resolved path longer than the relative one given, and the default pixel
// format.
void retainedChargeCoversGrowth(Suite& t) {
  Harness h(threaded());
  h.eval("globalThis.enc = media.openEncoder({ outPath: 'grown.mp4', fps: 10, width: 16, height: 16,"
         "  spec: { codec: 'libx264' } });");
  const uint64_t kept = h.path("grown.mp4").size() + std::string("libx264yuv420p").size();
  CHECK(h.usage().bytes == kept);
  CHECK(h.usage().retainedBytes == kept);
  h.eval("media.abort(enc);");
  CHECK(eventually([&] { return zero(h.usage()); }));
}

// --- reservations --------------------------------------------------------------

// Gate: failure disposal with exact reservation counts. Each operation
// holds its snapshot, its result cap and its known workspace from
// submission until its result is gone: a write its frame and twice that in
// workspace, a read the reserved frame size, a probe its path and the probe
// cap. Failures, refusals and conversions release all of it.
void reservationCounts(Suite& t) {
  Harness h(threaded(), 4096);
  h.encode("counted.mp4", 2);
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));

  h.probe->hold("write");
  h.eval("globalThis.enc = media.openEncoder(encoderOptions(" + quoted(h.path("counted-out.mp4")) + ", 16));"
         "record('bad', media.write(enc, new Uint8Array(1000)));");
  CHECK(h.probe->waitStarted("write", 1));
  LedgerUsage u = h.usage();
  CHECK(u.operations == 1);
  CHECK(u.bytes == 3000 + encoderBytes(h.path("counted-out.mp4")));
  CHECK(h.tracker->outstanding() == 1);
  h.probe->release("write");
  CHECK(h.settle("bad"));
  CHECK(h.entry("bad") == "bad:Error:native media RGBA frame length mismatch");
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
  // Refused by the retired session: charged nothing that stays.
  h.eval("record('refused', media.write(enc, gray(16, 1)));");
  CHECK(h.settle("refused"));
  CHECK(contains(h.entry("refused"), "is closed"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));

  h.eval("record('open', media.openFilter({ inputs: [{ filePath: " + quoted(h.path("counted.mp4")) +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' }));");
  CHECK(h.settle("open"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
  h.probe->hold("next");
  h.eval("record('n0', media.next(Number(entry('open').split(':')[2])));");
  CHECK(h.probe->waitStarted("next", 1));
  u = h.usage();
  CHECK(u.operations == 1);
  CHECK(u.bytes == 16384);
  h.probe->release("next");
  CHECK(h.settle("n0"));
  CHECK(contains(h.entry("n0"), "n0:ok:frame:"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
  CHECK(h.runner->usage().javaScriptBytes == 0);

  const std::string probed = h.path("counted.mp4");
  h.probe->hold("probe");
  h.eval("record('probe', media.probe(" + quoted(probed) + "));");
  CHECK(h.probe->waitStarted("probe", 1));
  u = h.usage();
  CHECK(u.operations == 1);
  CHECK(u.bytes == probed.size() + 64 * 1024);
  h.probe->release("probe");
  CHECK(h.settle("probe"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));

  // A file removed after submission fails in the job, and its charge goes
  // with the result.
  h.probe->hold("probe");
  h.eval("record('gone', media.probe(" + quoted(probed) + "));");
  CHECK(h.probe->waitStarted("probe", 2));
  fs::remove(probed);
  h.probe->release("probe");
  CHECK(h.settle("gone"));
  CHECK(contains(h.entry("gone"), "gone:Error:native media:"));
  CHECK(h.tracker->waitIdle(Clock::now() + seconds(20)));
  CHECK(eventually([&] { return zero(h.usage()); }));
  CHECK(zero(h.ledger->usage()));
}

// --- outputs -------------------------------------------------------------------

// What one pipeline produced: file bytes and decoded values.
struct Outputs {
  std::string video, muxed, tracks, probe, times, frames;
};

// Encodes, muxes audio, remuxes tracks, probes and decodes on `lanes`.
Outputs pipeline(Suite& t, std::shared_ptr<gr::HostLanes> lanes) {
  Harness h(std::move(lanes));
  h.encode("video.mp4", 6);
  h.tone("tone.wav");
  h.eval("record('mux', media.muxAudio({ videoPath: " + quoted(h.path("video.mp4")) +
         ", outPath: " + quoted(h.path("muxed.mp4")) + ", codec: 'aac', sampleRate: 48000,"
         "  filter: { inputs: [{ filePath: " + quoted(h.path("tone.wav")) + ", kind: 'audio', label: 'in' }],"
         "    graph: '[in]anull[out]', output: 'out', outputKind: 'audio' } }));");
  CHECK(h.settle("mux"));
  CHECK(h.entry("mux") == "mux:ok:undefined");
  h.eval("record('tracks', media.remuxTracks({ videoPath: " + quoted(h.path("muxed.mp4")) +
         ", audioPath: " + quoted(h.path("muxed.mp4")) + ", outPath: " + quoted(h.path("tracks.mp4")) + " }));"
         "record('probe', media.probe(" + quoted(h.path("muxed.mp4")) + "));"
         "record('times', media.packetTimes(" + quoted(h.path("muxed.mp4")) + ", 100));"
         "record('frames', media.openFilter({ inputs: [{ filePath: " + quoted(h.path("muxed.mp4")) +
         ", kind: 'video', label: 'in' }], graph: '[in]format=rgba[out]', output: 'out', outputKind: 'video' })"
         ".then(async (id) => { const sums = []; for (;;) { const f = await media.next(id); if (!f) break;"
         "  let sum = 0; for (const b of f.rgba) sum = (sum * 31 + b) % 1000000007; sums.push(f.ptsSec + '/' + sum); }"
         "  media.close(id); return sums.join(','); }));");
  CHECK(h.runUntil("has('tracks') && has('probe') && has('times') && has('frames')") == RunExit::Done);
  CHECK(h.entry("tracks") == "tracks:ok:undefined");
  Outputs out;
  out.video = fileBytes(h.path("video.mp4"));
  out.muxed = fileBytes(h.path("muxed.mp4"));
  out.tracks = fileBytes(h.path("tracks.mp4"));
  out.probe = h.entry("probe");
  out.times = h.entry("times");
  out.frames = h.entry("frames");
  return out;
}

// Gate: outputs equal to the worker-only path. The same pipeline runs with
// every job inline on the worker, in submission order, as the synchronous
// host ran it, and on the thread pool lanes. Files and decoded values are
// identical.
void outputsMatchInline(Suite& t) {
  const Outputs inlined = pipeline(t, gr::HostLanes::inlined());
  const Outputs pooled = pipeline(t, threaded());
  CHECK(inlined.video.size() > 100);
  CHECK(inlined.muxed.size() > inlined.video.size());
  CHECK(inlined.tracks.size() > inlined.video.size());
  CHECK(inlined.video == pooled.video);
  CHECK(inlined.muxed == pooled.muxed);
  CHECK(inlined.tracks == pooled.tracks);
  CHECK(inlined.probe == pooled.probe);
  CHECK(inlined.times == pooled.times);
  CHECK(inlined.frames == pooled.frames);
  CHECK(contains(inlined.probe, "\"channels\":2"));
  CHECK(contains(inlined.probe, "\"codec\":\"aac\""));
  CHECK(std::count(inlined.frames.begin(), inlined.frames.end(), '/') == 6);
}

}  // namespace

int main() {
  av_log_set_level(AV_LOG_ERROR);
  Suite t;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"serialSessionOrder", serialSessionOrder},
      {"abortSupersedesQueuedFinish", abortSupersedesQueuedFinish},
      {"finishWaitsForPrecedingWrites", finishWaitsForPrecedingWrites},
      {"abortAfterFinishKeepsOutput", abortAfterFinishKeepsOutput},
      {"closeRunsAcceptedReads", closeRunsAcceptedReads},
      {"runCleanupDisposesSessions", runCleanupDisposesSessions},
      {"stagingWaitsForDependents", stagingWaitsForDependents},
      {"runCleanupRemovesStagingAfterDependents", runCleanupRemovesStagingAfterDependents},
      {"stopBetweenPackets", stopBetweenPackets},
      {"reservationCounts", reservationCounts},
      {"refusedWriteBlocksFinish", refusedWriteBlocksFinish},
      {"admissionRefusalBlocksFinish", admissionRefusalBlocksFinish},
      {"encoderOptionsAreReserved", encoderOptionsAreReserved},
      {"deferredRefusalBlocksFinish", deferredRefusalBlocksFinish},
      {"deferredRefusalOfLastWrite", deferredRefusalOfLastWrite},
      {"writeSeesRefusedWrite", writeSeesRefusedWrite},
      {"largeOptionValueIsNotParsed", largeOptionValueIsNotParsed},
      {"encoderOptionErrors", encoderOptionErrors},
      {"retainedChargeCoversGrowth", retainedChargeCoversGrowth},
      {"outputsMatchInline", outputsMatchInline},
  };
  const char* only = std::getenv("GR_MEDIA_ASYNC_TEST");
  for (const auto& [name, test] : tests) {
    if (only && *only && std::string(only) != name) continue;
    t.begin(name, seconds(120));
    const int before = t.failures();
    test(t);
    t.end();
    std::printf("%s %s\n", t.failures() == before ? "PASS" : "FAIL", name);
  }
  std::printf("%d checks, %d failures\n", t.checks(), t.failures());
  return t.failures() == 0 ? 0 : 1;
}
