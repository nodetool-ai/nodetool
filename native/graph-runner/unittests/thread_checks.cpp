// Worker thread ownership checks (invariant I5 of
// docs/plans/graph-runner-async-host.md). Built with GR_THREAD_CHECKS=1.
// Each case runs in a forked child. Using an engine, a value, the settler
// registry or a loop from a thread other than its owner must abort the
// child. The same use on the owner thread must not.
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/task.h"

#include <csignal>
#include <cstdio>
#include <functional>
#include <future>
#include <memory>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#if defined(__unix__) || defined(__APPLE__)
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <unistd.h>
#define GR_HAVE_FORK 1
#endif
#ifdef __linux__
#include <sys/prctl.h>
#endif

namespace {

// native-rules #14: file-scope mutable test counters
int failures = 0;
int checks = 0;

#define CHECK(cond)                                                                    \
  do {                                                                                 \
    ++checks;                                                                          \
    if (!(cond)) {                                                                     \
      ++failures;                                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond);    \
    }                                                                                  \
  } while (0)

namespace js = gr::js;

#if GR_HAVE_FORK
// Runs `body` in a child process. Returns the signal that ended it, or 0
// when it exited normally with status 0, or -1 otherwise.
int inChild(const std::function<void()>& body) {
  std::fflush(stderr);
  const pid_t pid = fork();
  if (pid == 0) {
    // The expected aborts leave no core dump.
    const rlimit none{0, 0};
    setrlimit(RLIMIT_CORE, &none);
#ifdef __linux__
    prctl(PR_SET_DUMPABLE, 0);
#endif
    body();
    std::_Exit(0);
  }
  int status = 0;
  waitpid(pid, &status, 0);
  if (WIFSIGNALED(status)) return WTERMSIG(status);
  return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : -1;
}

void offThread(const std::function<void()>& use) {
  std::thread(use).join();
}

// Each case creates its objects on the child's main thread, then uses them
// from `run`.
struct Case {
  const char* name;
  std::function<void(const std::function<void(const std::function<void()>&)>& run)> body;
};

const std::vector<Case>& cases() {
  static const std::vector<Case> all = {
      {"engine call", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         run([&] { engine->number(1); });
       }},
      {"value release", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         auto value = std::make_unique<js::Value>(engine->object());
         run([&] { value.reset(); });
       }},
      {"value read", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         js::Value value = engine->string("x");
         run([&] { (void)engine->isString(value); });
       }},
      {"job drain", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         run([&] { engine->drainJobs(1); });
       }},
      {"settler registry", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         gr::SettlerRegistry registry(*engine);
         run([&] { (void)registry.size(); });
       }},
      {"script evaluation", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         run([&] { engine->evaluateScript("1 + 1", "t.js"); });
       }},
      {"string", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         run([&] { engine->string("x"); });
       }},
      {"object", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         run([&] { engine->object(); });
       }},
      {"native object", [](const auto& run) {
         auto engine = js::createQuickJsEngine();
         run([&] { engine->nativeObject(std::make_shared<js::NativePayload>()); });
       }},
      {"loop timer", [](const auto& run) {
         auto loop = std::make_unique<gr::Loop>();
         run([&] { loop->setTimer(std::chrono::milliseconds(1), [] {}); });
         loop->clearTimers();
       }},
  };
  return all;
}
#endif

void ownerThreadUsesPass() {
#if GR_HAVE_FORK
  for (const auto& c : cases()) {
    const int result = inChild([&] { c.body([](const std::function<void()>& use) { use(); }); });
    if (result != 0) std::fprintf(stderr, "owner thread case failed: %s\n", c.name);
    CHECK(result == 0);
  }
#endif
}

void foreignThreadUsesAbort() {
#if GR_HAVE_FORK
  for (const auto& c : cases()) {
    const int result = inChild([&] { c.body([](const std::function<void()>& use) { offThread(use); }); });
    if (result != SIGABRT) std::fprintf(stderr, "foreign thread case did not abort: %s\n", c.name);
    CHECK(result == SIGABRT);
  }
#endif
}

// An off-thread evaluation aborts before any guest code runs: the script
// would call a host function that records the call in memory shared with
// the parent. The engine is created on a helper thread and evaluated from
// the child's main thread. QuickJS bounds its stack from the creating
// thread, and the main thread's stack lies above a helper's, so without the
// ownership check QuickJS would run the script. On the owner thread the same
// script records the call.
void offThreadEvaluationRunsNoGuestCode() {
#if GR_HAVE_FORK
  auto* called = static_cast<volatile int*>(
      mmap(nullptr, sizeof(int), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0));
  CHECK(called != MAP_FAILED);
  auto scenario = [called](bool foreign) {
    return inChild([called, foreign] {
      std::unique_ptr<js::Engine> engine;
      auto evaluate = [&] {
        try {
          engine->evaluateScript("hit()", "t.js");
        } catch (...) {
          std::_Exit(3);  // a JavaScript error is not the ownership abort
        }
      };
      std::promise<void> created;
      std::promise<void> finished;
      std::thread owner([&] {
        engine = js::createQuickJsEngine();
        engine->set(engine->global(), "hit",
                    engine->function("hit", 0, [called](js::Engine& e, const std::vector<js::Value>&) {
                      *called = 1;
                      return e.undefined();
                    }));
        if (!foreign) evaluate();
        created.set_value();
        finished.get_future().wait();
      });
      created.get_future().wait();
      if (foreign) evaluate();
      finished.set_value();
      owner.join();
      engine.release();  // the child exits; the owner thread is gone
    });
  };
  *called = 0;
  CHECK(scenario(true) == SIGABRT);
  CHECK(*called == 0);
  *called = 0;
  CHECK(scenario(false) == 0);
  CHECK(*called == 1);
  munmap(const_cast<int*>(called), sizeof(int));
#endif
}

}  // namespace

int main() {
#if !GR_THREAD_CHECKS
  std::fprintf(stderr, "built without GR_THREAD_CHECKS\n");
  return 1;
#endif
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"ownerThreadUsesPass", ownerThreadUsesPass},
      {"foreignThreadUsesAbort", foreignThreadUsesAbort},
      {"offThreadEvaluationRunsNoGuestCode", offThreadEvaluationRunsNoGuestCode},
  };
  for (const auto& [name, fn] : tests) {
    const int before = failures;
    fn();
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
