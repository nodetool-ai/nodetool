// Rollout step 5 of docs/plans/graph-runner-async-host.md for the file, asset
// and HTTP hosts: fs/promises on the I/O lane, file handles as resource
// controls, asset writes through the process destination queue, and fetches
// on the network lane.
//
//   gr_files_async_tests
//   gr_files_async_tests --child-writer <asset dir> <key> <byte> <count> <size>
//
// The second form is the other process of the cross-process asset test.
//
// HTTP tests talk only to a server this process runs on 127.0.0.1, through a
// test policy that admits it. Nothing reaches another host.
//
// Helper threads share state with the test through shared pointers they
// capture by value, never through the test's stack (native/AGENTS.md rule
// 12), and every test joins them before it returns.
#include "bound_run.h"
#include "host/asset_destinations.h"
#include "host/capabilities.h"
#include "host/files.h"
#include "host/http.h"
#include "host/paths.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/destination_queue.h"
#include "kernel/host_lanes.h"
#include "nodetool/jobs/admission.h"
#include "resource_test_support.h"

// The sanitizer runtimes replace malloc, so glibc's mallinfo2 sees no heap.
#if defined(__has_feature)
#if __has_feature(address_sanitizer) || __has_feature(thread_sanitizer)
#define GR_SANITIZED_ALLOCATOR 1
#endif
#endif
#if defined(__SANITIZE_ADDRESS__) || defined(__SANITIZE_THREAD__)
#define GR_SANITIZED_ALLOCATOR 1
#endif

#include <arpa/inet.h>
#if defined(__linux__)
#include <malloc.h>
#endif
#include <netinet/in.h>
#include <poll.h>
#include <spawn.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iterator>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

extern char** environ;

namespace gr::host {
void installFiles(js::Engine&, const js::Value&, const HostOptions&);
void installAssets(js::Engine&, const js::Value&, const HostOptions&);
void installHttp(js::Engine&, const js::Value&, const HostOptions&);
}  // namespace gr::host

namespace {

namespace fs = std::filesystem;
namespace js = gr::js;
using gr::ThreadPoolExecutor;
using grtest::BoundRun;
using step5::Clock;
using step5::eventually;
using step5::Gate;
using step5::Suite;
using step5::TestRun;
using std::chrono::milliseconds;

// A private temporary directory, removed with everything in it.
//
// Thread affinity: the test thread.
class TempDir {
public:
  TempDir() {
    std::string pattern = (fs::temp_directory_path() / "gr-files-async-XXXXXX").string();
    if (!::mkdtemp(pattern.data())) throw std::runtime_error("mkdtemp failed");
    path_ = pattern;
  }
  ~TempDir() {
    std::error_code ignored;
    fs::remove_all(path_, ignored);
  }
  TempDir(const TempDir&) = delete;
  TempDir& operator=(const TempDir&) = delete;
  std::string path(const std::string& rel = "") const { return rel.empty() ? path_ : path_ + "/" + rel; }

private:
  std::string path_;
};

std::string readText(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(in), {}};
}

void writeText(const std::string& path, const std::string& text) {
  fs::create_directories(fs::path(path).parent_path());
  std::ofstream(path, std::ios::binary) << text;
}

size_t descriptors() {
#if defined(__linux__)
  const char* path = "/proc/self/fd";
#else
  const char* path = "/dev/fd";
#endif
  return std::distance(fs::directory_iterator(path), fs::directory_iterator{});
}

// Temporary files of asset writes under `dir`.
size_t temporaries(const std::string& dir) {
  size_t n = 0;
  for (const auto& entry : fs::recursive_directory_iterator(dir)) {
    if (entry.path().filename().string().find(".tmp-") != std::string::npos) ++n;
  }
  return n;
}

// One engine with __host.files, __host.assets and __host.http, an asset
// directory and a workspace, and the admission ledger its runs charge.
//
// Thread affinity: the test thread.
struct Host {
  TempDir dir;
  std::shared_ptr<nodetool::jobs::AdmissionLedger> ledger = std::make_shared<nodetool::jobs::AdmissionLedger>();
  std::shared_ptr<nodetool::jobs::RunnerAccount> runner = ledger->openRunner();
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();

  explicit Host(gr::host::FileJobHooks hooks = {}) {
    if (hooks.at) gr::host::setFileJobHooks(*engine, std::move(hooks));
    fs::create_directories(dir.path("ws"));
    fs::create_directories(dir.path("assets"));
    gr::HostOptions options;
    options.workspaceDir = dir.path("ws");
    options.assetDir = dir.path("assets");
    options.allowHttpFetch = true;
    js::Engine& e = *engine;
    js::Value host = e.object();
    js::Value files = e.object(), assets = e.object(), http = e.object();
    gr::host::installFiles(e, files, options);
    gr::host::installAssets(e, assets, options);
    gr::host::installHttp(e, http, options);
    e.set(host, "files", files);
    e.set(host, "assets", assets);
    e.set(host, "http", http);
    e.set(e.global(), "__host", host);
    eval(R"JS(
globalThis.results = {};
globalThis.order = [];
const f = __host.files, a = __host.assets;
// Latin-1, enough for the ASCII the tests write. The bare engine has no
// TextEncoder.
const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function dec(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return s;
}
function show(v) { return v instanceof Uint8Array ? dec(v) : String(v); }
// Records how the promise `fn` returns settles, under `name`. A synchronous
// throw counts as a rejection.
function track(name, fn) {
  results[name] = 'pending';
  let p;
  try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
  p.then((v) => { results[name] = 'ok:' + show(v); order.push(name); },
         (e) => { results[name] = (e && e.name) + ':' + (e && e.message); order.push(name); });
}
const settled = (...names) => names.every((n) => results[n] !== undefined && results[n] !== 'pending');
)JS");
  }
  ~Host() { engine.reset(); }

  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  // How `name` settled, also printed when GR_FILES_ASYNC_VERBOSE is set.
  std::string result(const std::string& name) {
    std::string value = str("String(results[" + quote(name) + "])");
    if (std::getenv("GR_FILES_ASYNC_VERBOSE")) std::fprintf(stderr, "  %s = %s\n", name.c_str(), value.c_str());
    return value;
  }
  bool settled(const std::vector<std::string>& names) {
    std::string list;
    for (const auto& n : names) list += (list.empty() ? "" : ",") + quote(n);
    return engine->toBoolean(eval("settled(" + list + ")"));
  }
  static std::string quote(const std::string& s) { return "'" + s + "'"; }
  // Nothing of the ledger is charged: every reservation was released.
  bool released() const {
    const nodetool::jobs::LedgerUsage u = ledger->usage();
    return u.bytes == 0 && u.operations == 0 && u.deferredBytes == 0 && u.deferredEntries == 0;
  }
};

// Holds a lane's only thread until released.
std::unique_ptr<nodetool::jobs::NativeJob> blocker(std::shared_ptr<Gate> gate) {
  return nodetool::jobs::makeJob([gate](std::stop_token) {
    gate->wait();
    return nodetool::jobs::JobOutcome::value(nullptr);
  });
}

// --- fs/promises ---------------------------------------------------------------

// The asynchronous functions give what the synchronous ones give, values
// and Node errors, on a threaded I/O lane, and release every reservation.
void promisesMatchSync(Suite& t) {
  ThreadPoolExecutor io("io", 4);
  Host h;
  writeText(h.dir.path("outside.txt"), "secret");
  std::string big(3 * 1024 * 1024 + 17, 'x');
  for (size_t i = 0; i < big.size(); i += 4096) big[i] = char('a' + (i / 4096) % 26);
  writeText(h.dir.path("ws/big.bin"), big);
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval(R"JS(
track('all', async () => {
  const log = [];
  log.push(await f.mkdirAsync('out/deep', true) === f.cwd() + '/out');
  log.push(await f.mkdirAsync('out/deep', true) === undefined);
  await f.writeFileAsync('out/a.txt', enc('hi'), false);
  await f.writeFileAsync('out/a.txt', enc(' there'), true);
  log.push(dec(await f.readFileAsync('out/a.txt')) === 'hi there');
  log.push(await f.readdirAsync('out') === f.readdir('out'));
  log.push(await f.statAsync('out/a.txt', true) === f.stat('out/a.txt', true));
  await f.copyFileAsync('out/a.txt', 'out/b.txt');
  await f.copyFileAsync('out/b.txt', 'out/b.txt');
  log.push(dec(await f.readFileAsync('out/b.txt')) === 'hi there');
  await f.renameAsync('out/b.txt', 'out/c.txt');
  log.push(await f.realpathAsync('out/c.txt') === f.cwd() + '/out/c.txt');
  const temp = await f.mkdtempAsync('clip-');
  log.push(temp.startsWith(f.cwd() + '/clip-') && temp.length === f.cwd().length + 12);
  await f.rmdirAsync(temp);
  await f.unlinkAsync('out/c.txt');
  log.push(dec(await f.readFileAsync('big.bin')) === dec(f.readFile('big.bin')));
  await f.rmAsync('out', true, false);
  await f.rmAsync('gone', false, true);
  log.push(f.readdir('.') === '[["big.bin","file"]]');
  return log.join();
});
for (const [name, fn] of [
    ['missing', () => f.readFileAsync('out/missing.txt')],
    ['dir', () => f.readFileAsync('.')],
    ['escape', () => f.readFileAsync('../outside.txt')],
    ['escapeWrite', () => f.writeFileAsync('../written.txt', enc('x'), false)],
    ['rmRoot', () => f.rmAsync('.', true, false)],
    ['notString', () => f.statAsync(7, true)]]) {
  track(name, fn);
}
)JS");
    const std::vector<std::string> names = {"all", "missing", "dir", "escape", "escapeWrite", "rmRoot", "notString"};
    run.runUntil([&] { return h.settled(names); });
    CHECK(h.result("all") == "ok:true,true,true,true,true,true,true,true,true,true");
    CHECK(h.result("missing") == "Error:ENOENT: no such file or directory, open 'out/missing.txt'");
    CHECK(step5::contains(h.result("dir"), "EISDIR"));
    CHECK(step5::contains(h.result("escape"), "EACCES"));
    CHECK(step5::contains(h.result("escapeWrite"), "EACCES"));
    CHECK(step5::contains(h.result("rmRoot"), "EACCES"));
    CHECK(step5::contains(h.result("notString"), "path must be a string"));
    CHECK(!fs::exists(h.dir.path("written.txt")));
    CHECK(h.released());
  }
  CHECK(h.released());
}

// A file that grows between the open step and the read step is read in full,
// by a second read that reserves the new size. One that keeps growing fails
// with EFBIG after kReadAttempts reads, and its descriptor is closed.
void readFileOfAGrowingFile(Suite& t) {
  // Appends to the file before each job it runs, then runs it inline.
  //
  // Thread affinity: the test thread, which runs every job.
  struct Growing final : nodetool::jobs::JobExecutor {
    std::string path;
    bool grow = false;
    nodetool::jobs::InlineExecutor inner;
    void submit(nodetool::jobs::SubmittedJob job) override {
      if (grow) std::ofstream(path, std::ios::binary | std::ios::app) << "+more";
      inner.submit(std::move(job));
    }
  };
  Growing io;
  Host h;
  io.path = h.dir.path("ws/grow.txt");
  writeText(io.path, "start");
  const size_t baseline = descriptors();
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    // Inline: the open step runs here and its result waits in the mailbox.
    h.eval("track('once', () => f.readFileAsync('grow.txt'));");
    std::ofstream(io.path, std::ios::binary | std::ios::app) << "-grown";
    run.runUntil([&] { return h.settled({"once"}); });
    CHECK(h.result("once") == "ok:start-grown");
    io.grow = true;
    h.eval("track('always', () => f.readFileAsync('grow.txt'));");
    run.runUntil([&] { return h.settled({"always"}); });
    CHECK(step5::contains(h.result("always"), "EFBIG"));
    CHECK(step5::contains(h.result("always"), "kept growing"));
    CHECK(descriptors() == baseline);
    CHECK(h.released());
  }
}

// Where a test's hook stops a running job: the job reports its first
// arrival at `point` and waits for `gate`, so the test can cancel the run
// while the job runs.
//
// Thread affinity: thread-safe. The hook runs on lane threads; the counters
// are atomics and the gates synchronize themselves. Shared by the hook and
// the test.
struct Pause {
  std::string point;
  std::atomic<int> arrivals{0};
  Gate arrived;
  Gate gate;
  gr::host::FileJobHooks hooks(std::shared_ptr<Pause> self) {
    return {[self](std::string_view at, uint64_t) {
      if (at != self->point || self->arrivals.fetch_add(1) != 0) return;
      self->arrived.release();
      self->gate.wait();
    }};
  }
};

// The run's cancellation while a write runs: the write stops at its next
// chunk, so only the chunk written before the stop reaches the file.
void writeCancelledWhileRunning(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  auto pause = std::make_shared<Pause>();
  pause->point = "write:chunk";
  Host h(pause->hooks(pause));
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("track('write', () => f.writeFileAsync('big.bin', new Uint8Array(8 * 1024 * 1024).fill(7), false));");
    pause->arrived.wait();
    run.cancel();
    run.runUntil([&] { return h.settled({"write"}); });
    CHECK(step5::contains(h.result("write"), "AbortError"));
    // The lane's reaper forwarded the stop to the running job.
    CHECK(eventually([&] { return io.pendingReaps() == 0; }));
    pause->gate.release();
    run.end();
    CHECK(run.tracker().waitIdle(Clock::now() + std::chrono::seconds(10)));
  }
  CHECK(fs::file_size(h.dir.path("ws/big.bin")) == 1024 * 1024);
  CHECK(h.released());
}

// A stop that reaches a running copy without the run's cancellation, here
// the lane's shutdown, ends it as Stopped: its promise rejects with an
// AbortError, not an Error, and the copy holds only what it copied.
void copyStoppedWhileRunning(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  auto pause = std::make_shared<Pause>();
  pause->point = "copy:chunk";
  Host h(pause->hooks(pause));
  writeText(h.dir.path("ws/source.bin"), std::string(4 * 1024 * 1024, 's'));
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("track('copy', () => f.copyFileAsync('source.bin', 'copy.bin'));");
    pause->arrived.wait();
    io.beginShutdown();
    // The lane's reaper requested the stop of the running copy.
    CHECK(eventually([&] { return io.pendingReaps() == 0; }));
    pause->gate.release();
    run.runUntil([&] { return h.settled({"copy"}); });
    CHECK(step5::contains(h.result("copy"), "AbortError:"));
    run.end();
    CHECK(run.tracker().waitIdle(Clock::now() + std::chrono::seconds(10)));
  }
  CHECK(io.awaitShutdown(Clock::now() + std::chrono::seconds(10)) == gr::HostShutdownStatus::Complete);
  CHECK(fs::file_size(h.dir.path("ws/copy.bin")) == 256 * 1024);
  CHECK(h.released());
}

// The run's cancellation while a recursive removal runs: it stops before
// the next entry, and the rest of the tree stays.
void removalCancelledWhileRunning(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  auto pause = std::make_shared<Pause>();
  pause->point = "rm:batch";
  Host h(pause->hooks(pause));
  for (int i = 0; i < 300; ++i) writeText(h.dir.path("ws/tree/f" + std::to_string(i)), "x");
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("track('rm', () => f.rmAsync('tree', true, false));");
    pause->arrived.wait();
    run.cancel();
    run.runUntil([&] { return h.settled({"rm"}); });
    CHECK(step5::contains(h.result("rm"), "AbortError"));
    // The lane's reaper forwarded the stop to the running job.
    CHECK(eventually([&] { return io.pendingReaps() == 0; }));
    pause->gate.release();
    run.end();
    CHECK(run.tracker().waitIdle(Clock::now() + std::chrono::seconds(10)));
  }
  size_t left = 0;
  for (const auto& entry : fs::directory_iterator(h.dir.path("ws/tree"))) {
    (void)entry;
    ++left;
  }
  CHECK(left == 300);
  CHECK(h.released());
}

// A recursive removal of a large tree holds no more memory than the
// workspace it reserved. The asynchronous removal reports what the ledger
// charges it. The synchronous removal, which uses the same traversal on
// this thread, is then measured: at each batch, while the batch's storage is
// live, the live heap of this thread's malloc arena above its level before
// the call must stay within that charge. The measurement counts every
// allocation the traversal makes, a C library directory stream included.
// It needs glibc's mallinfo2: it runs on Linux only, and is skipped under
// ThreadSanitizer, whose allocator mallinfo2 does not describe. Elsewhere
// the rest of the test still runs.
void removalMemoryIsBounded(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  // What the hook saw. Thread-safe: atomics, and a ledger set before the
  // removal is submitted. Shared with the hook, which runs on a lane thread
  // for the asynchronous removal and on this thread for the synchronous one.
  struct Probe {
    std::shared_ptr<nodetool::jobs::AdmissionLedger> ledger;
    std::atomic<uint64_t> reserved{0};
    std::atomic<int> batches{0};
    // Set for the synchronous removal.
    std::atomic<bool> measure{false};
    std::atomic<size_t> baseline{0};
    std::atomic<size_t> peak{0};
  };
  auto probe = std::make_shared<Probe>();
  Host h({[probe](std::string_view point, uint64_t) {
    if (point != "rm:batch") return;
    ++probe->batches;
    if (probe->measure) {
#if defined(__linux__)
      const size_t live = ::mallinfo2().uordblks;
      const size_t above = live > probe->baseline ? live - probe->baseline : 0;
      if (above > probe->peak) probe->peak = above;
#endif
      return;
    }
    // Only the removal runs: the ledger holds exactly its charge.
    probe->reserved = probe->ledger->usage().bytes;
  }});
  probe->ledger = h.ledger;
  const std::string name(200, 'n');
  auto plant = [&](const std::string& root) {
    for (int i = 0; i < 3000; ++i) writeText(h.dir.path("ws/" + root + "/" + name + std::to_string(i)), "");
    for (int d = 0; d < 3; ++d) {
      for (int i = 0; i < 100; ++i) {
        writeText(h.dir.path("ws/" + root + "/sub" + std::to_string(d) + "/deep/" + name + std::to_string(i)), "");
      }
    }
  };
  plant("tree");
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("track('rm', () => f.rmAsync('tree', true, false));");
    run.runUntil([&] { return h.settled({"rm"}); });
    CHECK(h.result("rm") == "ok:undefined");
  }
  CHECK(!fs::exists(h.dir.path("ws/tree")));
  CHECK(probe->batches > 3000 / 64);
  CHECK(probe->reserved > 0);
  CHECK(h.released());

  plant("again");
  probe->measure = true;
#if defined(__linux__)
  probe->baseline = ::mallinfo2().uordblks;
#endif
  h.eval("f.rm('again', true, false);");
  probe->measure = false;
  CHECK(!fs::exists(h.dir.path("ws/again")));
#if !defined(__linux__)
  std::fprintf(stderr, "  note: the peak heap check needs glibc's mallinfo2 and is skipped here\n");
#elif defined(GR_SANITIZED_ALLOCATOR)
  std::fprintf(stderr, "  note: the sanitizer allocator hides the heap from mallinfo2, so the peak heap check is skipped\n");
#else
  CHECK(probe->peak > 0);
  CHECK(probe->peak <= probe->reserved);
  if (probe->peak > probe->reserved) {
    std::fprintf(stderr, "  peak %zu bytes, reserved %llu\n", probe->peak.load(),
                 static_cast<unsigned long long>(probe->reserved.load()));
  }
#endif
}

// An ancestor swapped for a symlink while a recursive removal runs: the
// removal works through the directory it holds, so nothing outside the tree
// is removed. The swap happens at the second batch, read from tree/sub,
// after which tree/sub names a symlink to an outside directory whose files
// have the same names.
void removalIgnoresSwappedAncestor(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  // Shared with the hook, which runs on a lane thread. Thread-safe: an
  // atomic count, and paths written before the removal is submitted.
  struct Swap {
    std::string sub, moved, outside;
    std::atomic<int> batches{0};
  };
  auto swap = std::make_shared<Swap>();
  Host h({[swap](std::string_view point, uint64_t) {
    if (point != "rm:batch" || ++swap->batches != 2) return;
    fs::rename(swap->sub, swap->moved);
    fs::create_directory_symlink(swap->outside, swap->sub);
  }});
  swap->sub = h.dir.path("ws/tree/sub");
  swap->moved = h.dir.path("ws/moved");
  swap->outside = h.dir.path("outside");
  for (int i = 0; i < 10; ++i) {
    writeText(h.dir.path("ws/tree/sub/f" + std::to_string(i)), "inside");
    writeText(h.dir.path("outside/f" + std::to_string(i)), "outside");
  }
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("track('rm', () => f.rmAsync('tree', true, false));");
    run.runUntil([&] { return h.settled({"rm"}); });
  }
  CHECK(swap->batches >= 2);
  size_t outside = 0;
  for (const auto& entry : fs::directory_iterator(h.dir.path("outside"))) {
    outside += readText(entry.path().string()) == "outside";
  }
  CHECK(outside == 10);
  CHECK(h.released());
}

// The depth limit of a recursive removal: a tree 128 directories deep is
// removed, one 129 deep fails with ENAMETOOLONG before it removes anything,
// and neither leaves a descriptor open.
void removalDepthLimit(Suite& t) {
  Host h;
  auto plant = [&](const std::string& root, int depth) {
    std::string path = h.dir.path("ws/" + root);
    for (int i = 1; i < depth; ++i) path += "/d";
    fs::create_directories(path);
    writeText(path + "/leaf", "x");
  };
  plant("fits", 128);
  plant("deep", 129);
  const size_t baseline = descriptors();
  CHECK(h.str("try { f.rm('fits', true, false); 'ok'; } catch (e) { e.message; }") == "ok");
  CHECK(!fs::exists(h.dir.path("ws/fits")));
  CHECK(descriptors() == baseline);
  const std::string deep = h.str("try { f.rm('deep', true, false); 'ok'; } catch (e) { e.message; }");
  CHECK(step5::contains(deep, "ENAMETOOLONG"));
  CHECK(step5::contains(deep, "more than 128 directories deep"));
  CHECK(descriptors() == baseline);
  std::string leaf = h.dir.path("ws/deep");
  for (int i = 1; i < 129; ++i) leaf += "/d";
  CHECK(readText(leaf + "/leaf") == "x");
}

// --- file handles ----------------------------------------------------------------

// Explicit close is a terminal barrier: reads accepted before it run first,
// in call order, while the lane holds them back, and the descriptor stays
// open until close runs. Every queued operation holds its exact charge.
void closeAfterQueuedReads(Suite& t) {
  ThreadPoolExecutor io("io", 1);
  Host h;
  writeText(h.dir.path("ws/data"), "ABCDEFGH");
  const size_t baseline = descriptors();
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("track('open', async () => { globalThis.handle = await f.openReadAsync('data', 'r'); return 'opened'; });");
    run.runUntil([&] { return h.settled({"open"}); });
    CHECK(h.result("open") == "ok:opened");
    CHECK(descriptors() == baseline + 1);
    TestRun side;
    auto gate = std::make_shared<Gate>();
    side.submit(io, blocker(gate));
    h.eval(R"JS(
track('r1', () => f.readHandleAsync(handle, 2, 0));
track('r2', () => f.readHandleAsync(handle, 2, null));
track('r3', () => f.readHandleAsync(handle, 2, null));
track('close', () => f.closeHandleAsync(handle));
track('late', () => f.readHandleAsync(handle, 1, 0));
track('lateClose', () => f.closeHandleAsync(handle));
)JS");
    // Three reads of 2 bytes, each charging its 4-byte path too, and the
    // close: four operations.
    const nodetool::jobs::LedgerUsage queued = h.ledger->usage();
    CHECK(queued.operations == 4);
    CHECK(queued.bytes == 3 * (2 + 4));
    CHECK(descriptors() == baseline + 1);
    gate->release();
    run.runUntil([&] { return h.settled({"r1", "r2", "r3", "close", "late", "lateClose"}); });
    CHECK(h.result("r1") == "ok:AB");
    CHECK(h.result("r2") == "ok:AB");
    CHECK(h.result("r3") == "ok:CD");
    CHECK(h.result("close") == "ok:undefined");
    CHECK(step5::contains(h.result("late"), "EBADF"));
    CHECK(step5::contains(h.result("lateClose"), "EBADF"));
    CHECK(h.str("order.filter((n) => /^(r[123]|close)$/.test(n)).join()") == "r1,r2,r3,close");
    CHECK(descriptors() == baseline);
    CHECK(h.released());
    CHECK(side.await({1}));
  }
}

// Abort (run cleanup) during a close: the read waiting on the lane is
// stopped when it starts, the queued read and close are rejected with an
// AbortError, and the lane's reaper closes the descriptor. A close that was
// already handed to the lane still runs. Exact charges are released.
void closeAbortRaces(Suite& t) {
  ThreadPoolExecutor io("io", 1);
  Host h;
  writeText(h.dir.path("ws/data"), "ABCDEFGH");
  const size_t baseline = descriptors();
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("track('open', async () => { globalThis.handle = await f.openReadAsync('data', 'r'); "
           "globalThis.second = await f.openReadAsync('data', 'r'); return 'opened'; });");
    run.runUntil([&] { return h.settled({"open"}); });
    CHECK(descriptors() == baseline + 2);
    TestRun side;
    auto gate = std::make_shared<Gate>();
    side.submit(io, blocker(gate));
    h.eval(R"JS(
track('active', () => f.readHandleAsync(handle, 2, 0));
track('queued', () => f.readHandleAsync(handle, 2, 0));
track('close', () => f.closeHandleAsync(handle));
track('dispatchedClose', () => f.closeHandleAsync(second));
)JS");
    CHECK(h.ledger->usage().operations == 4);
    // Run cleanup while the run is live, so the rejections settle.
    h.engine->releaseRunResources();
    gate->release();
    run.runUntil([&] { return h.settled({"active", "queued", "close", "dispatchedClose"}); });
    CHECK(step5::contains(h.result("active"), "AbortError"));
    CHECK(step5::contains(h.result("queued"), "AbortError:The file handle was closed at the end of the run"));
    CHECK(step5::contains(h.result("close"), "AbortError"));
    // The second handle's close was its control's active operation, already
    // on the lane: it runs, and abort cannot undo it.
    CHECK(h.result("dispatchedClose") == "ok:undefined");
    CHECK(eventually([&] { return descriptors() == baseline; }));
    CHECK(h.released());
    h.eval("track('after', () => f.readHandleAsync(handle, 1, 0));");
    run.runUntil([&] { return h.settled({"after"}); });
    CHECK(step5::contains(h.result("after"), "EBADF"));
    CHECK(side.await({1}));
  }
  CHECK(h.released());
}

// Opens, reads, closes and run cleanup interleaved on a lane with four
// threads: every promise settles as a value or an AbortError, every
// descriptor is closed and every charge released, round after round.
void closeAbortStress(Suite& t) {
  ThreadPoolExecutor io("io", 4);
  Host h;
  writeText(h.dir.path("ws/data"), "ABCDEFGH");
  const size_t baseline = descriptors();
  auto tracker = std::make_shared<nodetool::jobs::RunnerTracker>();
  int bad = 0, aborted = 0, completed = 0;
  for (int round = 0; round < 40; ++round) {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun(), tracker);
    h.eval("results = {}; order = []; globalThis.handles = [];"
           "track('open', async () => { for (let i = 0; i < 4; i++) handles.push(await f.openReadAsync('data', 'r')); "
           "return 'opened'; });");
    run.runUntil([&] { return h.settled({"open"}); });
    // Every lane thread waits on a gate that another thread opens a delay
    // after the operations were submitted. The delay changes each round, so
    // run cleanup lands before, during or after the operations, without a
    // fixed order.
    TestRun side;
    auto gate = std::make_shared<Gate>();
    auto submitted = std::make_shared<Gate>();
    std::vector<uint64_t> blockers;
    for (int i = 0; i < 4; ++i) blockers.push_back(side.submit(io, blocker(gate)));
    const auto delay = std::chrono::microseconds((round % 8) * 150);
    std::thread opener([gate, submitted, delay] {
      submitted->wait();
      std::this_thread::sleep_for(delay);
      gate->release();
    });
    h.eval(R"JS(
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 12; j++) track(`r${i}.${j}`, () => f.readHandleAsync(handles[i], 4, j % 8));
  if (i % 2 === 0) track(`c${i}`, () => f.closeHandleAsync(handles[i]));
}
)JS");
    submitted->release();
    // A quarter of the rounds let the operations finish before cleanup.
    if (round % 4 == 0) {
      opener.join();
      run.runUntil([&] { return h.engine->toBoolean(h.eval("Object.values(results).every((r) => r !== 'pending')")); });
    }
    h.engine->releaseRunResources();
    if (opener.joinable()) opener.join();
    run.runUntil([&] { return h.engine->toBoolean(h.eval("Object.values(results).every((r) => r !== 'pending')")); });
    bad += h.engine->toNumber(h.eval(
        "Object.values(results).filter((r) => !(r.startsWith('ok:') || r.startsWith('AbortError:'))).length"));
    if (std::getenv("GR_FILES_ASYNC_VERBOSE")) {
      std::fprintf(stderr, "  round %d: %s\n", round,
                   h.str("JSON.stringify(Object.values(results).reduce((m, r) => { const k = r.slice(0, 12); "
                         "m[k] = (m[k] || 0) + 1; return m; }, {}))").c_str());
    }
    aborted += h.engine->toNumber(h.eval("Object.values(results).filter((r) => r.startsWith('AbortError:')).length"));
    completed += h.engine->toNumber(h.eval("Object.keys(results).filter((n) => n !== 'open' && results[n].startsWith('ok:')).length"));
    CHECK(side.await(blockers));
    run.end();
    h.engine->releaseRunResources();
  }
  CHECK(bad == 0);
  // Both outcomes happened, so the rounds did race.
  CHECK(aborted > 0);
  CHECK(completed > 0);
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(10)));
  CHECK(eventually([&] { return descriptors() == baseline; }));
  CHECK(h.released());
}

// --- assets --------------------------------------------------------------------------

// The destination of `key` in `h`'s asset directory, as the jobs key it.
std::string destination(Host& h, const std::string& key) {
  return gr::host::assetDestination(gr::host::canonicalRoots({{h.dir.path("assets"), true}}), key);
}

// Overlapping writes and removals of one key in one run commit in call
// order. A held place in the destination's line keeps every commit waiting
// until all of them staged, so staging order cannot decide the outcome.
void sameKeyWritesInOneRun(Suite& t) {
  ThreadPoolExecutor io("io", 4);
  Host h;
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    auto hold = gr::processDestinationQueue().enqueue(destination(h, "u/same.bin"), io);
    h.eval(R"JS(
track('w1', () => a.writeAsync('u/same.bin', enc('one')));
track('w2', () => a.writeAsync('u/same.bin', enc('two')));
track('rm', () => a.removeAsync('u/same.bin'));
track('w3', () => a.writeAsync('u/same.bin', enc('three')));
track('w4', () => a.writeAsync('u/same.bin', enc('four')));
track('bad', () => a.writeAsync('../x.bin', enc('x')));
)JS");
    CHECK(eventually([&] { return temporaries(h.dir.path("assets")) == 4; }));
    CHECK(!fs::exists(h.dir.path("assets/u/same.bin")));
    hold.abandon();
    run.runUntil([&] { return h.settled({"w1", "w2", "rm", "w3", "w4", "bad"}); });
    CHECK(h.result("w1") == "ok:undefined");
    CHECK(h.result("rm") == "ok:true");
    CHECK(h.result("w4") == "ok:undefined");
    CHECK(step5::contains(h.result("bad"), "Invalid storage key"));
    CHECK(h.str("order.filter((n) => n !== 'bad').join()") == "w1,w2,rm,w3,w4");
    CHECK(readText(h.dir.path("assets/u/same.bin")) == "four");
    CHECK(temporaries(h.dir.path("assets")) == 0);
    h.eval("track('read', () => a.readAsync('u/same.bin')); track('missing', () => a.readAsync('u/none.bin'));"
           "track('stat', () => a.statAsync('u/same.bin')); track('list', () => a.listAsync(''));");
    run.runUntil([&] { return h.settled({"read", "missing", "stat", "list"}); });
    CHECK(h.result("read") == "ok:four");
    CHECK(h.result("missing") == "ok:null");
    CHECK(step5::contains(h.result("stat"), "\"size\":4"));
    CHECK(step5::contains(h.result("list"), "\"key\":\"u/same.bin\""));
    CHECK(h.released());
  }
  CHECK(gr::processDestinationQueue().pending(destination(h, "u/same.bin")) == 0);
}

// The run's cancellation after a write staged and before its turn to commit
// rejects it with an AbortError, and the commit, when its turn comes,
// discards the staged file. The old content stays.
void commitCancellation(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  Host h;
  writeText(h.dir.path("assets/k.bin"), "old");
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    auto hold = gr::processDestinationQueue().enqueue(destination(h, "k.bin"), io);
    h.eval("track('write', () => a.writeAsync('k.bin', enc('new')));");
    CHECK(eventually([&] { return temporaries(h.dir.path("assets")) == 1; }));
    run.cancel();
    run.runUntil([&] { return h.settled({"write"}); });
    CHECK(step5::contains(h.result("write"), "AbortError"));
    hold.abandon();
    CHECK(eventually([&] { return temporaries(h.dir.path("assets")) == 0; }));
    CHECK(readText(h.dir.path("assets/k.bin")) == "old");
    run.end();
    CHECK(run.tracker().waitIdle(Clock::now() + std::chrono::seconds(10)));
  }
  CHECK(h.released());
}

// Across run teardown: a write of an ended run that had not committed is
// discarded when its turn comes, and the next run's write to the same key
// commits after it. A write that committed before its run ended stays.
void sameKeyAcrossRunTeardown(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  Host h;
  auto tracker = std::make_shared<nodetool::jobs::RunnerTracker>();
  {
    BoundRun first(*h.engine, io, nullptr, h.runner->openRun(), tracker);
    h.eval("track('kept', () => a.writeAsync('kept.bin', enc('A')));");
    first.runUntil([&] { return h.settled({"kept"}); });
    CHECK(h.result("kept") == "ok:undefined");
  }
  h.engine->releaseRunResources();
  CHECK(readText(h.dir.path("assets/kept.bin")) == "A");

  auto hold = gr::processDestinationQueue().enqueue(destination(h, "same.bin"), io);
  {
    BoundRun first(*h.engine, io, nullptr, h.runner->openRun(), tracker);
    h.eval("results = {}; track('a', () => a.writeAsync('same.bin', enc('A')));");
    CHECK(eventually([&] { return temporaries(h.dir.path("assets")) == 1; }));
  }
  h.engine->releaseRunResources();
  {
    BoundRun second(*h.engine, io, nullptr, h.runner->openRun(), tracker);
    h.eval("results = {}; track('b', () => a.writeAsync('same.bin', enc('B')));");
    CHECK(eventually([&] { return temporaries(h.dir.path("assets")) == 2; }));
    hold.abandon();
    second.runUntil([&] { return h.settled({"b"}); });
    CHECK(h.result("b") == "ok:undefined");
  }
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(10)));
  CHECK(readText(h.dir.path("assets/same.bin")) == "B");
  CHECK(temporaries(h.dir.path("assets")) == 0);
  CHECK(h.released());
}

// The other process of sameKeyAcrossProcesses: writes `count` payloads of
// `size` bytes of `byte` to `key`, each awaited.
int childWriter(const std::string& assetDir, const std::string& key, char byte, int count, size_t size) {
  ThreadPoolExecutor io("io", 2);
  auto ledger = std::make_shared<nodetool::jobs::AdmissionLedger>();
  auto engine = js::createQuickJsEngine();
  gr::HostOptions options;
  options.assetDir = assetDir;
  int failures = 0;
  {
    // The values must be released before the engine that owns them.
    js::Value host = engine->object(), assets = engine->object();
    gr::host::installAssets(*engine, assets, options);
    engine->set(host, "assets", assets);
    engine->set(engine->global(), "__host", host);
    BoundRun run(*engine, io, nullptr, ledger->openRunner()->openRun());
    engine->evaluateScript("globalThis.done = false; globalThis.failed = 0; (async () => { for (let i = 0; i < " +
                               std::to_string(count) + "; i++) { try { await __host.assets.writeAsync('" + key +
                               "', new Uint8Array(" + std::to_string(size) + ").fill(" +
                               std::to_string(int(byte)) + ")); } catch (e) { failed++; } } done = true; })();",
                           "child.js");
    run.runUntilGlobal("done");
    failures = int(engine->toNumber(engine->evaluateScript("failed", "failed.js")));
  }
  engine.reset();
  return failures == 0 ? 0 : 1;
}

// Two processes write one key at once. Readers only ever see one whole
// payload, the last rename wins, and no temporary file is left.
void sameKeyAcrossProcesses(Suite& t) {
#if !defined(__linux__)
  // The child writer is started through /proc/self/exe, which only Linux
  // offers.
  (void)t;
  std::fprintf(stderr, "  note: the cross-process asset test runs on Linux only\n");
#else
  ThreadPoolExecutor io("io", 2);
  Host h;
  constexpr int count = 40;
  constexpr size_t size = 128 * 1024;
  const std::string target = h.dir.path("assets/shared/same.bin");
  std::string self = fs::read_symlink("/proc/self/exe").string();
  std::vector<std::string> args = {self, "--child-writer", h.dir.path("assets"), "shared/same.bin",
                                   "66", std::to_string(count), std::to_string(size)};
  std::vector<char*> argv;
  for (auto& arg : args) argv.push_back(arg.data());
  argv.push_back(nullptr);
  // The reader's observations. Thread-safe: atomics. Shared with the reader
  // thread, which the test joins.
  struct Observed {
    std::atomic<bool> done{false};
    std::atomic<int> reads{0};
    std::atomic<int> partial{0};
  };
  auto observed = std::make_shared<Observed>();
  std::thread reader([observed, target] {
    while (!observed->done) {
      std::error_code missing;
      if (!fs::exists(target, missing)) continue;
      const std::string bytes = readText(target);
      ++observed->reads;
      bool whole = bytes.size() == size;
      for (char c : bytes) whole = whole && c == bytes[0] && (c == 'A' || c == 'B');
      if (!whole) ++observed->partial;
    }
  });
  pid_t child = 0;
  const int spawned = ::posix_spawn(&child, self.c_str(), nullptr, nullptr, argv.data(), environ);
  CHECK(spawned == 0);
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    h.eval("globalThis.done = false; globalThis.failed = 0; (async () => { for (let i = 0; i < " +
           std::to_string(count) + "; i++) { try { await a.writeAsync('shared/same.bin', new Uint8Array(" +
           std::to_string(size) + ").fill(65)); } catch (e) { failed++; } } done = true; })();");
    run.runUntilGlobal("done");
    CHECK(h.engine->toNumber(h.eval("failed")) == 0);
  }
  int status = -1;
  if (spawned == 0) ::waitpid(child, &status, 0);
  observed->done = true;
  reader.join();
  CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
  CHECK(observed->reads > 0);
  CHECK(observed->partial == 0);
  const std::string final = readText(target);
  CHECK(final.size() == size && (final[0] == 'A' || final[0] == 'B'));
  CHECK(temporaries(h.dir.path("assets")) == 0);
  CHECK(h.released());
#endif
}

// --- HTTP ----------------------------------------------------------------------------

// An HTTP/1.1 server on 127.0.0.1 for one connection at a time.
//
// Thread affinity: the constructor and destructor run on the test thread.
// The server thread shares only `State`, through a shared pointer: atomics,
// and a socket only it uses after the constructor.
class LoopbackServer {
public:
  enum class Mode {
    // 8 KiB of a body that never ends, then silence: only libcurl's
    // progress callback still runs.
    Stall,
    // "hello" as text/plain.
    Small,
    // A redirect to a private address.
    Redirect,
  };

  explicit LoopbackServer(Mode mode) : state_(std::make_shared<State>()) {
    state_->mode = mode;
    state_->listener = ::socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (::bind(state_->listener, reinterpret_cast<sockaddr*>(&address), sizeof address) != 0 ||
        ::listen(state_->listener, 4) != 0) {
      throw std::runtime_error("loopback server could not listen");
    }
    socklen_t length = sizeof address;
    ::getsockname(state_->listener, reinterpret_cast<sockaddr*>(&address), &length);
    port_ = ntohs(address.sin_port);
    thread_ = std::thread([state = state_] { state->serve(); });
  }
  ~LoopbackServer() {
    state_->stopping = true;
    thread_.join();
    ::close(state_->listener);
  }
  LoopbackServer(const LoopbackServer&) = delete;
  LoopbackServer& operator=(const LoopbackServer&) = delete;

  std::string url(const std::string& path = "/x") const {
    return "http://127.0.0.1:" + std::to_string(port_) + path;
  }
  size_t bodyBytesSent() const { return state_->sent; }
  bool clientGone() const { return state_->gone; }
  Clock::time_point goneAt() const { return Clock::time_point(Clock::duration(state_->goneAt.load())); }

private:
  struct State {
    Mode mode = Mode::Small;
    int listener = -1;
    std::atomic<bool> stopping{false};
    std::atomic<size_t> sent{0};
    std::atomic<bool> gone{false};
    std::atomic<Clock::rep> goneAt{0};

    void serve() {
      while (!stopping) {
        pollfd p{listener, POLLIN, 0};
        if (::poll(&p, 1, 50) <= 0) continue;
        const int client = ::accept(listener, nullptr, nullptr);
        if (client < 0) continue;
        respond(client);
        ::close(client);
      }
    }
    bool send(int client, const std::string& text) {
#if defined(MSG_NOSIGNAL)
      const int flags = MSG_NOSIGNAL;
#else
      const int flags = 0;
      const int on = 1;
      ::setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &on, sizeof on);
#endif
      return ::send(client, text.data(), text.size(), flags) == ssize_t(text.size());
    }
    void respond(int client) {
      std::string request;
      char buf[1024];
      while (request.find("\r\n\r\n") == std::string::npos) {
        const ssize_t n = ::recv(client, buf, sizeof buf, 0);
        if (n <= 0) return;
        request.append(buf, size_t(n));
      }
      if (mode == Mode::Small) {
        send(client, "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello");
        return;
      }
      if (mode == Mode::Redirect) {
        send(client, "HTTP/1.1 302 Found\r\nLocation: http://10.1.2.3/secret\r\nContent-Length: 0\r\n"
                     "Connection: close\r\n\r\n");
        return;
      }
      if (!send(client, "HTTP/1.1 200 OK\r\nContent-Length: 1000000000\r\n\r\n")) return;
      if (!send(client, std::string(8 * 1024, 'z'))) return;
      sent += 8 * 1024;
      // Waits for the client to close its end.
      const auto until = Clock::now() + std::chrono::seconds(20);
      while (!stopping && Clock::now() < until) {
        pollfd p{client, POLLIN, 0};
        if (::poll(&p, 1, 20) <= 0) continue;
        if (::recv(client, buf, sizeof buf, 0) <= 0) {
          goneAt = Clock::now().time_since_epoch().count();
          gone = true;
          return;
        }
      }
    }
  };

  std::shared_ptr<State> state_;
  int port_ = 0;
  std::thread thread_;
};

// The test policy: plain http to 127.0.0.1 only.
bool loopbackUrl(const std::string& url) { return url.rfind("http://127.0.0.1:", 0) == 0; }
bool loopbackAddress(const sockaddr* address) {
  if (address->sa_family != AF_INET) return false;
  return ntohl(reinterpret_cast<const sockaddr_in*>(address)->sin_addr.s_addr) == INADDR_LOOPBACK;
}
const gr::host::HttpFetchPolicy kLoopback{"http", loopbackUrl, loopbackAddress};

// Submits a fetch of `url` under `policy` to `network`, as getAsync does,
// and records its settlement under `name`.
void fetchInto(Host& h, BoundRun& run, nodetool::jobs::JobExecutor& network, const std::string& name,
               const std::string& url, gr::host::HttpFetchPolicy policy) {
  auto convert = [](gr::ResultConversion& conversion) -> js::Value {
    auto* r = dynamic_cast<gr::host::HttpResponse*>(conversion.payload());
    std::string text = std::to_string(r->status) + " " + r->contentType + " " +
                       std::string(r->body.begin(), r->body.end());
    return conversion.engine().string(text);
  };
  js::Value promise = run.async().submit(network, gr::host::makeHttpGetJob(url, policy), convert, true);
  h.engine->set(h.engine->global(), "fetched", promise);
  h.eval("track('" + name + "', () => fetched);");
}

// A fetch on the network lane completes, and the production policy still
// refuses loopback and plain http at the call.
void httpFetchOnTheNetworkLane(Suite& t) {
  ThreadPoolExecutor io("io", 1), network("network", 2);
  Host h;
  LoopbackServer small(LoopbackServer::Mode::Small);
  LoopbackServer redirect(LoopbackServer::Mode::Redirect);
  {
    BoundRun run(*h.engine, io, &network, h.runner->openRun());
    fetchInto(h, run, network, "small", small.url(), kLoopback);
    run.runUntil([&] { return h.settled({"small"}); });
    fetchInto(h, run, network, "redirect", redirect.url(), kLoopback);
    run.runUntil([&] { return h.settled({"redirect"}); });
    h.eval(R"JS(
track('loopback', () => __host.http.getAsync('https://127.0.0.1/a'));
track('plain', () => __host.http.getAsync('http://example.com/a'));
track('mapped', () => __host.http.getAsync('https://[::ffff:10.0.0.1]/a'));
)JS");
    run.runUntil([&] { return h.settled({"loopback", "plain", "mapped"}); });
    CHECK(h.result("small") == "ok:200 text/plain hello");
    CHECK(step5::contains(h.result("redirect"), "Refusing to fetch unsafe URL"));
    CHECK(step5::contains(h.result("redirect"), "10.1.2.3"));
    for (const char* name : {"loopback", "plain", "mapped"}) {
      CHECK(step5::contains(h.result(name), "Error:Refusing to fetch unsafe URL"));
    }
    CHECK(h.released());
  }
}

// The run's cancellation during a transfer rejects the fetch with an
// AbortError at once. The server has gone silent, so no data callback runs:
// libcurl's progress callback, called about once a second, ends the
// transfer on the network lane, and the server sees the connection close.
void httpCancellationDuringTransfer(Suite& t) {
  ThreadPoolExecutor io("io", 1), network("network", 2);
  Host h;
  LoopbackServer server(LoopbackServer::Mode::Stall);
  {
    BoundRun run(*h.engine, io, &network, h.runner->openRun());
    fetchInto(h, run, network, "stalled", server.url(), kLoopback);
    CHECK(eventually([&] { return server.bodyBytesSent() >= 8 * 1024; }));
    std::this_thread::sleep_for(milliseconds(100));
    // The 512 MiB body cap is reserved for the whole transfer.
    CHECK(h.ledger->usage().bytes >= gr::host::kMaxHttpBodyBytes);
    const auto cancelledAt = Clock::now();
    run.cancel();
    run.runUntil([&] { return h.settled({"stalled"}); });
    CHECK(step5::contains(h.result("stalled"), "AbortError"));
    CHECK(eventually([&] { return server.clientGone(); }, milliseconds(5000)));
    CHECK(server.goneAt() - cancelledAt < std::chrono::seconds(3));
    run.end();
    CHECK(run.tracker().waitIdle(Clock::now() + std::chrono::seconds(10)));
  }
  CHECK(h.released());
}

// An engine with only the asset store, for synchronous calls outside a run.
// Destroyed on the thread that made it.
std::unique_ptr<js::Engine> assetEngine(const std::string& assetDir) {
  auto engine = js::createQuickJsEngine();
  gr::HostOptions options;
  options.assetDir = assetDir;
  js::Value host = engine->object(), assets = engine->object();
  gr::host::installAssets(*engine, assets, options);
  engine->set(host, "assets", assets);
  engine->set(engine->global(), "__host", host);
  return engine;
}

// A synchronous write through `engine`: "ok", or the error message.
std::string syncWrite(js::Engine& engine, const std::string& key, char byte) {
  try {
    engine.evaluateScript("__host.assets.write('" + key + "', Uint8Array.of(" + std::to_string(int(byte)) + "));",
                          "sync.js");
    return "ok";
  } catch (const std::exception& e) {
    return e.what();
  }
}

// The synchronous asset functions refuse a call while a run is bound, and
// `find` stays synchronous. With the key free, a synchronous write from
// another engine commits at once, and an asynchronous write called after it
// commits after it.
void syncAndAsyncWritesShareTheQueue(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  Host h;
  BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
  h.eval("track('syncInRun', () => a.write('k.bin', enc('x'))); track('readInRun', () => a.read('k.bin'));"
         "track('findInRun', () => a.find('', 'k'));");
  run.runUntil([&] { return h.settled({"syncInRun", "readInRun", "findInRun"}); });
  CHECK(step5::contains(h.result("syncInRun"), "only outside a run"));
  CHECK(step5::contains(h.result("readInRun"), "only outside a run"));
  CHECK(h.result("findInRun") == "ok:[]");

  auto other = assetEngine(h.dir.path("assets"));
  CHECK(syncWrite(*other, "k.bin", 'B') == "ok");
  CHECK(readText(h.dir.path("assets/k.bin")) == "B");
  h.eval("track('A', () => a.writeAsync('k.bin', enc('A')));");
  run.runUntil([&] { return h.settled({"A"}); });
  CHECK(h.result("A") == "ok:undefined");
  CHECK(readText(h.dir.path("assets/k.bin")) == "A");
  CHECK(gr::processDestinationQueue().pending(destination(h, "k.bin")) == 0);
  CHECK(temporaries(h.dir.path("assets")) == 0);
  CHECK(h.released());
}

// Two engines on one thread. Engine A's run has a write to K deferred for
// admission: its only operation slot is held by a write to another key,
// which waits behind a held place. Unbound engine B writes K synchronously
// on the same thread: it fails at once with EBUSY instead of waiting for a
// write only this thread can admit. Once A's writes finished, B's retry
// succeeds. A hang fails the test through the suite's watchdog.
void syncWriteBesideADeferredWrite(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  Host h;
  nodetool::jobs::RunnerLimits limits;
  limits.runOperations = 1;
  auto limited = h.ledger->openRunner(limits);
  {
    BoundRun run(*h.engine, io, nullptr, limited->openRun());
    auto hold = gr::processDestinationQueue().enqueue(destination(h, "other.bin"), io);
    h.eval("track('other', () => a.writeAsync('other.bin', enc('O'))); track('k', () => a.writeAsync('k.bin', enc('A')));");
    CHECK(run.async().deferred() == 1);
    auto b = assetEngine(h.dir.path("assets"));
    const std::string busy = syncWrite(*b, "k.bin", 'B');
    CHECK(step5::contains(busy, "EBUSY"));
    CHECK(step5::contains(busy, "'k.bin'"));
    CHECK(step5::contains(busy, "an asynchronous operation on this asset is pending"));
    CHECK(!fs::exists(h.dir.path("assets/k.bin")));
    hold.abandon();
    run.runUntil([&] { return h.settled({"other", "k"}); });
    CHECK(h.result("k") == "ok:undefined");
    CHECK(readText(h.dir.path("assets/k.bin")) == "A");
    CHECK(syncWrite(*b, "k.bin", 'B') == "ok");
  }
  CHECK(readText(h.dir.path("assets/k.bin")) == "B");
  CHECK(temporaries(h.dir.path("assets")) == 0);
  CHECK(h.released());
}

// A synchronous write while an asynchronous write to the same key has
// staged and waits for its commit: EBUSY at once, and the asynchronous
// write's content wins.
void syncWriteBesideAStagedWrite(Suite& t) {
  ThreadPoolExecutor io("io", 2);
  Host h;
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
    auto hold = gr::processDestinationQueue().enqueue(destination(h, "k.bin"), io);
    h.eval("track('A', () => a.writeAsync('k.bin', enc('A')));");
    CHECK(eventually([&] { return temporaries(h.dir.path("assets")) == 1; }));
    auto b = assetEngine(h.dir.path("assets"));
    CHECK(step5::contains(syncWrite(*b, "k.bin", 'B'), "EBUSY"));
    hold.abandon();
    run.runUntil([&] { return h.settled({"A"}); });
    CHECK(h.result("A") == "ok:undefined");
  }
  CHECK(readText(h.dir.path("assets/k.bin")) == "A");
  CHECK(temporaries(h.dir.path("assets")) == 0);
  CHECK(h.released());
}

// A run that binds no network lane cannot fetch: network work never falls
// back to the I/O lane.
void networkLaneIsExplicit(Suite& t) {
  ThreadPoolExecutor io("io", 1);
  Host h;
  BoundRun run(*h.engine, io, nullptr, h.runner->openRun());
  h.eval("track('fetch', () => __host.http.getAsync('https://example.com/a.png'));");
  run.runUntil([&] { return h.settled({"fetch"}); });
  CHECK(step5::contains(h.result("fetch"), "need a network lane"));
  CHECK(h.released());
}

// --- failure disposal ----------------------------------------------------------------

// Failed jobs release exactly their charges when they settle. Results that
// arrive after their run ended are disposed: their charges go, and an open
// step's descriptor is closed with its payload.
void failureDisposal(Suite& t) {
  ThreadPoolExecutor io("io", 1);
  Host h;
  writeText(h.dir.path("ws/data"), "ABCDEFGH");
  const size_t baseline = descriptors();
  auto tracker = std::make_shared<nodetool::jobs::RunnerTracker>();
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun(), tracker);
    h.eval(R"JS(
track('missing', () => f.readFileAsync('nope'));
track('denied', () => f.writeFileAsync('../x', enc('x'), false));
track('badKey', () => a.writeAsync('/abs', enc('x')));
track('assetMissing', () => a.removeAsync('none.bin'));
track('copyMissing', () => f.copyFileAsync('nope', 'copy'));
)JS");
    run.runUntil([&] { return h.settled({"missing", "denied", "badKey", "assetMissing", "copyMissing"}); });
    CHECK(step5::contains(h.result("missing"), "ENOENT"));
    CHECK(step5::contains(h.result("denied"), "EACCES"));
    CHECK(step5::contains(h.result("badKey"), "Invalid storage key"));
    CHECK(h.result("assetMissing") == "ok:false");
    CHECK(step5::contains(h.result("copyMissing"), "ENOENT"));
    CHECK(h.released());
  }
  {
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun(), tracker);
    TestRun side;
    auto gate = std::make_shared<Gate>();
    side.submit(io, blocker(gate));
    // Queued behind the gate, then the run ends: each is discarded unrun or
    // its result goes to the closed mailbox.
    h.eval("for (let i = 0; i < 5; i++) track('q' + i, () => f.readFileAsync('data'));");
    CHECK(h.ledger->usage().operations == 5);
    CHECK(h.ledger->usage().bytes == 5 * 4);
    run.end();
    gate->release();
    CHECK(side.await({1}));
  }
  {
    // An open step that finished while its run ended: the payload that owns
    // the descriptor is disposed, closing it.
    BoundRun run(*h.engine, io, nullptr, h.runner->openRun(), tracker);
    h.eval("track('opened', () => f.readFileAsync('data'));");
    CHECK(eventually([&] { return run.async().mailbox()->pending(); }));
    CHECK(descriptors() == baseline + 1);
    run.end();
  }
  h.engine->releaseRunResources();
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(10)));
  CHECK(eventually([&] { return descriptors() == baseline; }));
  CHECK(h.released());
}

}  // namespace

int main(int argc, char** argv) {
  if (argc == 7 && std::string(argv[1]) == "--child-writer") {
    return childWriter(argv[2], argv[3], char(std::atoi(argv[4])), std::atoi(argv[5]),
                       size_t(std::atoll(argv[6])));
  }
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"promisesMatchSync", promisesMatchSync},
      {"readFileOfAGrowingFile", readFileOfAGrowingFile},
      {"writeCancelledWhileRunning", writeCancelledWhileRunning},
      {"copyStoppedWhileRunning", copyStoppedWhileRunning},
      {"removalCancelledWhileRunning", removalCancelledWhileRunning},
      {"removalMemoryIsBounded", removalMemoryIsBounded},
      {"removalIgnoresSwappedAncestor", removalIgnoresSwappedAncestor},
      {"removalDepthLimit", removalDepthLimit},
      {"closeAfterQueuedReads", closeAfterQueuedReads},
      {"closeAbortRaces", closeAbortRaces},
      {"closeAbortStress", closeAbortStress},
      {"sameKeyWritesInOneRun", sameKeyWritesInOneRun},
      {"commitCancellation", commitCancellation},
      {"sameKeyAcrossRunTeardown", sameKeyAcrossRunTeardown},
      {"sameKeyAcrossProcesses", sameKeyAcrossProcesses},
      {"syncAndAsyncWritesShareTheQueue", syncAndAsyncWritesShareTheQueue},
      {"syncWriteBesideADeferredWrite", syncWriteBesideADeferredWrite},
      {"syncWriteBesideAStagedWrite", syncWriteBesideAStagedWrite},
#ifdef GR_HAVE_CURL
      {"httpFetchOnTheNetworkLane", httpFetchOnTheNetworkLane},
      {"httpCancellationDuringTransfer", httpCancellationDuringTransfer},
      {"networkLaneIsExplicit", networkLaneIsExplicit},
#endif
      {"failureDisposal", failureDisposal},
  };
  const char* only = std::getenv("GR_FILES_ASYNC_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    // The no-wait asset tests must fail fast if a synchronous call blocks.
    const bool fast = std::string(name).rfind("syncWriteBeside", 0) == 0;
    suite.begin(name, std::chrono::seconds(fast ? 30 : 120));
    const int before = suite.failures();
    try {
      fn(suite);
    } catch (const std::exception& e) {
      suite.check(false, __FILE__, __LINE__, e.what());
    }
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
