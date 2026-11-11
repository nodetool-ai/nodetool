// Rollout step 5 infrastructure of docs/plans/graph-runner-async-host.md:
// the destination queue for asset writes and removals (section 4.8, last
// paragraph). Each test uses its own DestinationQueue and asset directory
// under TMPDIR. A one-thread lane held by a blocking job keeps an earlier
// ticket's operation from running, so a later operation on another lane
// stages first and must wait for its turn.
#include "host/asset_destinations.h"
#include "host/paths.h"
#include "kernel/destination_queue.h"
#include "kernel/host_lanes.h"
#include "resource_test_support.h"

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <memory>
#include <mutex>
#include <set>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include <unistd.h>

namespace {

using gr::DestinationQueue;
using gr::ThreadPoolExecutor;
using gr::host::AssetRemoved;
using gr::host::Root;
using gr::host::assetDestination;
using gr::host::makeAssetRemoveJob;
using gr::host::makeAssetWriteJob;
using nodetool::jobs::JobOutcome;
using step5::Gate;
using step5::Suite;
using step5::TestRun;
using step5::contains;
using step5::eventually;
using Kind = JobOutcome::Kind;
namespace fs = std::filesystem;

// A fresh directory under TMPDIR, removed by the destructor.
//
// Thread affinity: the test thread.
class TempDir {
public:
  TempDir() {
    const char* base = std::getenv("TMPDIR");
    std::string pattern = std::string(base && *base ? base : "/tmp") + "/gr-assets-XXXXXX";
    std::vector<char> buffer(pattern.begin(), pattern.end());
    buffer.push_back('\0');
    if (!::mkdtemp(buffer.data())) throw std::runtime_error("mkdtemp failed");
    path_ = fs::canonical(buffer.data()).string();
  }
  ~TempDir() {
    std::error_code error;
    fs::remove_all(path_, error);
  }
  TempDir(const TempDir&) = delete;
  TempDir& operator=(const TempDir&) = delete;
  const std::string& path() const { return path_; }

private:
  std::string path_;
};

std::vector<uint8_t> bytes(const std::string& text) { return {text.begin(), text.end()}; }

std::string readFile(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}

// The names in `dir`, sorted.
std::vector<std::string> names(const std::string& dir) {
  std::vector<std::string> out;
  std::error_code error;
  for (const auto& entry : fs::directory_iterator(dir, error)) out.push_back(entry.path().filename().string());
  std::sort(out.begin(), out.end());
  return out;
}

size_t temporaries(const std::string& dir, const std::string& leaf) {
  size_t count = 0;
  for (const auto& name : names(dir)) {
    if (name.rfind(leaf + ".tmp-", 0) == 0) ++count;
  }
  return count;
}

// Blocks a one-thread lane until released.
std::unique_ptr<nodetool::jobs::NativeJob> blocker(std::shared_ptr<Gate> gate) {
  return nodetool::jobs::makeJob([gate](std::stop_token) {
    gate->wait();
    return JobOutcome::value(nullptr);
  });
}

std::string removal(const nodetool::jobs::JobPayload& payload) {
  auto* removed = dynamic_cast<const AssetRemoved*>(&payload);
  return removed ? (removed->removed ? "removed" : "absent") : "";
}

// A test's asset directory and its two lanes.
//
// Thread affinity: the test thread. The lanes are thread-safe.
struct Store {
  TempDir dir;
  std::vector<Root> roots = gr::host::canonicalRoots({{dir.path(), true}});
  ThreadPoolExecutor held{"held", 1};
  ThreadPoolExecutor free{"free", 2};
  std::shared_ptr<Gate> gate = std::make_shared<Gate>();
  DestinationQueue queue;

  std::string path(const std::string& key) const { return dir.path() + "/" + key; }
  // Holds the one-thread lane until release().
  void hold(TestRun& run) { run.submit(held, blocker(gate)); }
  void release() { gate->release(); }
};

// --- ordering across runs ------------------------------------------------------------

// Gate: commits and removals of one destination happen in ticket order,
// across two runs. W1 (run A) is held back; W2 (run B), a removal R (run A)
// and W3 (run B) stage or start first and wait. With order kept the file
// ends as W3 wrote it and R removed W1's file. Committing as soon as staged
// would let W1 commit last.
void orderingAcrossRuns(Suite& t) {
  Store s;
  TestRun a(1), b(2);
  a.describe = removal;
  const std::string key = "user/a.bin";
  const std::string destination = assetDestination(s.roots, key);
  CHECK(destination == s.path(key));
  s.hold(a);
  const uint64_t w1 = a.submit(s.held, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("one")));
  const uint64_t w2 = b.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("two")));
  const uint64_t r = a.submit(s.free, makeAssetRemoveJob(s.queue, s.free, s.roots, key));
  const uint64_t w3 = b.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("three")));
  CHECK(eventually([&] { return temporaries(s.path("user"), "a.bin") == 2; }));
  CHECK(s.queue.pending(destination) == 4);
  a.drain();
  b.drain();
  CHECK(!a.has(w1) && !b.has(w2) && !a.has(r) && !b.has(w3));
  CHECK(!fs::exists(s.path(key)));
  s.release();
  CHECK(a.await({w1, r}));
  CHECK(b.await({w2, w3}));
  CHECK(a.result(w1).kind == Kind::Value);
  CHECK(b.result(w2).kind == Kind::Value);
  CHECK(a.result(r).kind == Kind::Value && a.result(r).text == "removed");
  CHECK(b.result(w3).kind == Kind::Value);
  CHECK(readFile(s.path(key)) == "three");
  CHECK(s.queue.pending(destination) == 0);
  CHECK(s.queue.destinations() == 0);
  CHECK((names(s.path("user")) == std::vector<std::string>{"a.bin"}));

  // W1, then R, then W2: the removal finds W1's file, and W2's survives.
  TestRun c(3);
  c.describe = removal;
  s.gate = std::make_shared<Gate>();
  s.hold(c);
  const uint64_t x1 = c.submit(s.held, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("x1")));
  const uint64_t xr = c.submit(s.free, makeAssetRemoveJob(s.queue, s.free, s.roots, key));
  const uint64_t x2 = c.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("x2")));
  CHECK(eventually([&] { return temporaries(s.path("user"), "a.bin") == 1; }));
  s.release();
  CHECK(c.await({x1, xr, x2}));
  CHECK(readFile(s.path(key)) == "x2");
  CHECK(c.result(xr).text == "removed");
  // The blocker, then the three in ticket order.
  CHECK((c.order() == std::vector<uint64_t>{1, x1, xr, x2}));
}

// Gate: the process queue is one object, kept in the lane registry, and a
// line that empties is removed.
void processQueue(Suite& t) {
  DestinationQueue& first = gr::processDestinationQueue();
  CHECK(&first == &gr::processDestinationQueue());
  const size_t before = first.destinations();
  {
    nodetool::jobs::InlineExecutor inlineSteps;
    auto ticket = first.enqueue("/nowhere/process-queue-test", inlineSteps);
    CHECK(first.pending("/nowhere/process-queue-test") == 1);
    CHECK(first.destinations() == before + 1);
  }
  CHECK(first.pending("/nowhere/process-queue-test") == 0);
  CHECK(first.destinations() == before);
}

// --- cancellation before commit ------------------------------------------------------

// Gate: a stop before the commit discards the write. W2 (run B) is staged
// and waiting when run B is torn down; W3 (run C) is still queued on the
// held lane when run C stops, so the lane drops it unrun and its ticket
// leaves the line. W1 and W4 (run A) commit; W2 reports Stopped into a
// closed mailbox, removing only its temporary file; W3 reports nothing.
void cancellationBeforeCommit(Suite& t) {
  Store s;
  TestRun a(1), b(2), c(3);
  const std::string key = "a.bin";
  s.hold(a);
  const uint64_t w1 = a.submit(s.held, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("one")));
  const uint64_t w3 = c.submit(s.held, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("three")));
  const uint64_t w2 = b.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("two")));
  const uint64_t w4 = a.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("four")));
  CHECK(eventually([&] { return temporaries(s.dir.path(), "a.bin") == 2; }));
  b.teardown();
  c.stop().request_stop();
  s.release();
  CHECK(a.await({w1, w4}));
  CHECK(a.result(w1).kind == Kind::Value && a.result(w4).kind == Kind::Value);
  CHECK(readFile(s.path(key)) == "four");
  CHECK(eventually([&] { return b.tracker().outstanding() == 0 && c.tracker().outstanding() == 0; }));
  c.drain();
  CHECK(!c.has(w3));
  (void)w2;
  CHECK((names(s.dir.path()) == std::vector<std::string>{"a.bin"}));
  CHECK(s.queue.destinations() == 0);

  // With its mailbox open, a write stopped before its commit reports
  // Stopped and leaves the old file.
  TestRun d(4), e(5);
  s.gate = std::make_shared<Gate>();
  s.hold(d);
  const uint64_t d1 = d.submit(s.held, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("five")));
  const uint64_t e1 = e.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("six")));
  CHECK(eventually([&] { return temporaries(s.dir.path(), "a.bin") == 1; }));
  e.stop().request_stop();
  s.release();
  CHECK(d.await({d1}));
  CHECK(e.await({e1}));
  CHECK(e.result(e1).kind == Kind::Stopped && contains(e.result(e1).error, "before its commit"));
  CHECK(readFile(s.path(key)) == "five");
  CHECK((names(s.dir.path()) == std::vector<std::string>{"a.bin"}));
}

// --- own temporary files ---------------------------------------------------------------

// Gate: each operation unlinks only its own temporary file. A file named
// like another process's temporary stays. W2 (run B) is cancelled while W3
// (run C) is staged and waiting behind it: W2's discard leaves W3's
// temporary file, so W3 still commits.
void ownTemporaryFileOnly(Suite& t) {
  Store s;
  TestRun a(1), b(2), c(3);
  const std::string key = "a.bin";
  const std::string foreign = s.path("a.bin.tmp-999999-0");
  { std::ofstream(foreign) << "someone else's"; }
  s.hold(a);
  const uint64_t w1 = a.submit(s.held, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("one")));
  const uint64_t w2 = b.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("two")));
  const uint64_t w3 = c.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("three")));
  CHECK(eventually([&] { return temporaries(s.dir.path(), "a.bin") == 3; }));
  b.stop().request_stop();
  s.release();
  CHECK(a.await({w1}));
  CHECK(b.await({w2}));
  CHECK(c.await({w3}));
  CHECK(a.result(w1).kind == Kind::Value);
  CHECK(b.result(w2).kind == Kind::Stopped);
  CHECK(c.result(w3).kind == Kind::Value);
  CHECK(readFile(s.path(key)) == "three");
  CHECK(readFile(foreign) == "someone else's");
  CHECK((names(s.dir.path()) == std::vector<std::string>{"a.bin", "a.bin.tmp-999999-0"}));
}

// --- confinement at commit ----------------------------------------------------------------

// Gate: confinement is checked again at commit. W2 (run B) staged in
// `sub/` waits behind W1. Then `sub` is moved aside and replaced by a
// symlink, inside the asset directory in one case and outside it in the
// other. W1 stages after the swap and is refused; W2's commit is refused,
// its temporary file in the moved directory is removed through the
// directory it held, and nothing reaches the symlink's target. A parent
// replaced by another real directory is refused too.
void confinementAtCommit(Suite& t) {
  for (int variant = 0; variant < 3; ++variant) {
    Store s;
    TempDir outside;
    TestRun a(1), b(2);
    const std::string key = "sub/a.bin";
    CHECK(fs::create_directory(s.path("sub")));
    s.hold(a);
    const uint64_t w1 = a.submit(s.held, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("one")));
    const uint64_t w2 = b.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("two")));
    CHECK(eventually([&] { return temporaries(s.path("sub"), "a.bin") == 1; }));
    fs::rename(s.path("sub"), s.path("moved"));
    std::string target;
    if (variant == 0) {
      target = s.path("elsewhere");
      fs::create_directory(target);
      fs::create_directory_symlink(target, s.path("sub"));
    } else if (variant == 1) {
      target = outside.path();
      fs::create_directory_symlink(target, s.path("sub"));
    } else {
      target = s.path("sub");
      fs::create_directory(target);
    }
    s.release();
    CHECK(a.await({w1}));
    CHECK(b.await({w2}));
    CHECK(b.result(w2).kind == Kind::Error);
    CHECK(contains(b.result(w2).error, "EACCES"));
    if (variant == 2) {
      CHECK(contains(b.result(w2).error, "replaced"));
      // W1 staged into the new directory after the swap and committed there.
      CHECK(a.result(w1).kind == Kind::Value);
      CHECK((names(target) == std::vector<std::string>{"a.bin"}));
      CHECK(readFile(target + "/a.bin") == "one");
    } else {
      CHECK(a.result(w1).kind == Kind::Error && contains(a.result(w1).error, "EACCES"));
      CHECK(names(target).empty());
    }
    CHECK(names(s.path("moved")).empty());
    CHECK(s.queue.destinations() == 0);
  }
}

// --- destination steps run on their executor -------------------------------------------

// A step that records its thread and blocks until its gate opens.
//
// Thread affinity: runs on its ticket's executor. Ownership: unique, held by
// the queue until it runs.
struct BlockingStep final : gr::DestinationStep {
  BlockingStep(std::shared_ptr<Gate> g, std::shared_ptr<Gate> e, std::shared_ptr<std::atomic<std::thread::id>> t)
      : gate(std::move(g)), entered(std::move(e)), thread(std::move(t)) {}
  void run() noexcept override {
    thread->store(std::this_thread::get_id());
    entered->release();
    gate->wait();
  }
  std::shared_ptr<Gate> gate;
  std::shared_ptr<Gate> entered;
  std::shared_ptr<std::atomic<std::thread::id>> thread;
};

// Gate: abandoning an earlier ticket only updates the line. The later
// step, which blocks, runs on its executor's thread, and the thread that
// destroyed the earlier ticket returns at once.
void abandonedTicketRunsNoStep(Suite& t) {
  DestinationQueue queue;
  ThreadPoolExecutor steps("steps", 1);
  auto gate = std::make_shared<Gate>();
  auto entered = std::make_shared<Gate>();
  auto thread = std::make_shared<std::atomic<std::thread::id>>();
  auto first = std::make_shared<DestinationQueue::Ticket>(queue.enqueue("/k", steps));
  auto second = queue.enqueue("/k", steps);
  second.ready(std::make_unique<BlockingStep>(gate, entered, thread));
  CHECK(queue.pending("/k") == 2);
  auto returned = std::make_shared<Gate>();
  std::thread destroyer([first, returned]() mutable {
    first->abandon();
    returned->release();
  });
  const auto destroyerId = destroyer.get_id();
  bool prompt = false;
  {
    std::unique_lock lock(returned->mutex);
    prompt = returned->changed.wait_for(lock, std::chrono::seconds(2), [&] { return returned->open; });
  }
  CHECK(prompt);
  entered->wait();
  CHECK(thread->load() != destroyerId);
  CHECK(thread->load() != std::this_thread::get_id());
  gate->release();
  destroyer.join();
  CHECK(eventually([&] { return queue.destinations() == 0; }));
}

// --- ancestor swaps between acquisition and use ------------------------------------------

// A directory outside the asset directory, holding `b/` and, for the
// removal case, `b/x.bin`, and the swap a hook performs: `root/a` moves to
// `root/a-moved` and a symlink to the outside directory takes its place.
//
// Thread affinity: swap() runs on the job's thread, the checks on the test
// thread after the job's result arrived through the mailbox.
struct Swap {
  std::string root;
  std::string outside;
  std::atomic<bool> done{false};
  void swap() {
    fs::rename(root + "/a", root + "/a-moved");
    fs::create_directory_symlink(outside, root + "/a");
    done = true;
  }
};

// Gate: every step acts on the directories it acquired, never on a path
// resolved again. A hook swaps the intermediate directory `a` for a symlink
// to an outside directory between acquisition and use: during staging the
// temporary file still goes into the acquired directory and the commit is
// refused; between the commit's check and its rename the file lands in the
// acquired directory; during a removal the acquired file is removed. The
// outside directory is never touched.
void ancestorSwapBetweenAcquisitionAndUse(Suite& t) {
  const std::string key = "a/b/x.bin";
  for (const char* point : {"write:acquired", "commit:validated", "remove:acquired"}) {
    Store s;
    TempDir outside;
    fs::create_directories(s.path("a/b"));
    fs::create_directory(outside.path() + "/b");
    const bool removing = std::string(point) == "remove:acquired";
    if (removing) {
      { std::ofstream(s.path(key)) << "inside"; }
      { std::ofstream(outside.path() + "/b/x.bin") << "outside"; }
    }
    auto swap = std::make_shared<Swap>();
    swap->root = s.dir.path();
    swap->outside = outside.path();
    auto outsideSeen = std::make_shared<std::atomic<size_t>>(0);
    gr::host::AssetJobHooks hooks;
    hooks.at = [swap, outsideSeen, point = std::string(point), outsidePath = outside.path()](std::string_view at) {
      if (at == point && !swap->done) swap->swap();
      if (at == "write:staged") outsideSeen->store(names(outsidePath + "/b").size());
    };
    TestRun a(1);
    a.describe = removal;
    const uint64_t id = removing ? a.submit(s.free, makeAssetRemoveJob(s.queue, s.free, s.roots, key, hooks))
                                : a.submit(s.free, makeAssetWriteJob(s.queue, s.free, s.roots, key, bytes("new"), hooks));
    CHECK(a.await({id}));
    CHECK(swap->done.load());
    CHECK(outsideSeen->load() == 0);
    if (removing) {
      CHECK(a.result(id).kind == Kind::Value && a.result(id).text == "removed");
      CHECK(readFile(outside.path() + "/b/x.bin") == "outside");
      CHECK((names(outside.path() + "/b") == std::vector<std::string>{"x.bin"}));
      CHECK(!fs::exists(s.path("a-moved/b/x.bin")));
    } else if (std::string(point) == "write:acquired") {
      CHECK(a.result(id).kind == Kind::Error && contains(a.result(id).error, "EACCES"));
      CHECK(names(outside.path() + "/b").empty());
      CHECK(names(s.path("a-moved/b")).empty());
    } else {
      CHECK(a.result(id).kind == Kind::Value);
      CHECK(names(outside.path() + "/b").empty());
      CHECK(readFile(s.path("a-moved/b/x.bin")) == "new");
    }
  }
}

// Gate: keys are checked on the worker, before a ticket is taken.
void keysCheckedAtSubmission(Suite& t) {
  Store s;
  for (const char* bad : {"", "/abs", "a/../b", "..", "a\\b"}) {
    bool threw = false;
    try {
      (void)makeAssetWriteJob(s.queue, s.free, s.roots, bad, bytes("x"));
    } catch (const std::exception&) {
      threw = true;
    }
    CHECK(threw);
  }
  bool threw = false;
  try {
    (void)makeAssetRemoveJob(s.queue, s.free, {}, "a.bin");
  } catch (const gr::host::FsError& e) {
    threw = e.code == "EACCES";
  }
  CHECK(threw);
  CHECK(s.queue.destinations() == 0);
  // A removal of a missing file reports false.
  TestRun a(1);
  a.describe = removal;
  const uint64_t r = a.submit(s.free, makeAssetRemoveJob(s.queue, s.free, s.roots, "missing.bin"));
  CHECK(a.await({r}));
  CHECK(a.result(r).kind == Kind::Value && a.result(r).text == "absent");
}

}  // namespace

// A synchronous write's step runs on the calling thread, and the call
// returns only after it committed, even when another thread schedules the
// destination's line in between. The queue's hook runs once the step is
// visible to other schedulers. There a competing thread takes a later place
// in the same line and abandons it, which schedules the line. The step must
// still run on the caller.
void syncStepRunsOnTheCaller(Suite& t) {
  TempDir dir;
  const std::vector<Root> roots = gr::host::canonicalRoots({{dir.path(), true}});
  const std::string destination = assetDestination(roots, "k.bin");
  // Shared by the hooks and the competing thread, which the hook joins.
  // Thread-safe: atomics, a mutex for the step's thread, and a queue and an
  // executor the competing thread reaches through shared ownership.
  struct Probe {
    std::weak_ptr<DestinationQueue> queue;
    std::shared_ptr<nodetool::jobs::InlineExecutor> spare = std::make_shared<nodetool::jobs::InlineExecutor>();
    std::string destination;
    std::atomic<bool> competed{false};
    std::mutex mutex;
    std::thread::id stepThread;  // guarded by mutex
  };
  auto probe = std::make_shared<Probe>();
  probe->destination = destination;
  auto queue = std::make_shared<DestinationQueue>(gr::DestinationQueueHooks{[probe](std::string_view point) {
    if (point != "published" || probe->competed.exchange(true)) return;
    std::thread competitor([queue = probe->queue.lock(), spare = probe->spare, at = probe->destination] {
      auto later = queue->enqueue(at, *spare);
      later.abandon();
    });
    competitor.join();
  }});
  probe->queue = queue;
  gr::host::AssetJobHooks hooks{[probe](std::string_view point) {
    if (point != "commit:validated") return;
    std::lock_guard lock(probe->mutex);
    probe->stepThread = std::this_thread::get_id();
  }};
  gr::host::writeAssetNow(*queue, roots, "k.bin", std::vector<uint8_t>{'n', 'e', 'w'}, hooks);
  CHECK(probe->competed);
  {
    std::lock_guard lock(probe->mutex);
    CHECK(probe->stepThread == std::this_thread::get_id());
  }
  CHECK(readFile(dir.path() + "/k.bin") == "new");
  CHECK(queue->pending(destination) == 0);
  size_t entries = 0;
  for (const auto& entry : fs::directory_iterator(dir.path())) {
    (void)entry;
    ++entries;
  }
  CHECK(entries == 1);
}

int main() {
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"orderingAcrossRuns", orderingAcrossRuns},
      {"processQueue", processQueue},
      {"cancellationBeforeCommit", cancellationBeforeCommit},
      {"ownTemporaryFileOnly", ownTemporaryFileOnly},
      {"confinementAtCommit", confinementAtCommit},
      {"keysCheckedAtSubmission", keysCheckedAtSubmission},
      {"syncStepRunsOnTheCaller", syncStepRunsOnTheCaller},
      {"abandonedTicketRunsNoStep", abandonedTicketRunsNoStep},
      {"ancestorSwapBetweenAcquisitionAndUse", ancestorSwapBetweenAcquisitionAndUse},
  };
  const char* only = std::getenv("GR_ASSET_DESTINATION_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    suite.begin(name, std::chrono::seconds(120));
    const int before = suite.failures();
    fn(suite);
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
