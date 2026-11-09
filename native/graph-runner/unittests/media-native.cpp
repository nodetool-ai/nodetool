#include "host/capabilities.h"
#include "host/media.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/guest.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <unistd.h>
int main(int argc, char **argv) {
  if (argc != 2)
    return 2;
  namespace fs = std::filesystem;
  std::string pattern =
      (fs::temp_directory_path() / "gr-timeline-process-XXXXXX").string();
  const char *temp = mkdtemp(pattern.data());
  if (!temp)
    return 2;
  const fs::path root(temp);
  try {
    fs::create_directories(root / "assets");
    gr::HostOptions options;
    options.workspaceDir = root.string();
    options.sqliteDirectory = root.string();
    options.assetDir = (root / "assets").string();
    auto engine = gr::js::createQuickJsEngine();
    engine->set(engine->global(), "__timelineRoot",
                engine->string(root.string()));
    auto console = engine->object();
    auto log = engine->function("log", 0, [](auto &e, const auto &args) {
      for (const auto &arg : args)
        std::fprintf(stderr, "%s ", e.toString(arg).c_str());
      std::fprintf(stderr, "\n");
      return e.undefined();
    });
    for (const auto *name : {"log", "warn", "error", "debug", "info"})
      engine->set(console, name, log);
    engine->set(engine->global(), "console", console);
    options.gpu.enabled = true;
    options.gpu.softwareOnly = true;
    gr::Guest guest(*engine, options);
    auto media = engine->object();
    gr::host::MediaOptions grant;
    grant.enabled = true;
    grant.encoders = {"libx264", "aac", "libvpx-vp9", "prores_ks"};
    gr::host::installMedia(*engine, media, options, grant);
    engine->set(engine->get(engine->global(), "__host"), "media", media);
    auto denied = engine->object();
    gr::host::installMedia(*engine, denied, options);
    engine->set(engine->global(), "__mediaDenied", denied);
    auto limited = engine->object();
    auto limit = grant;
    limit.maxPixels = 16;
    gr::host::installMedia(*engine, limited, options, limit);
    engine->set(engine->global(), "__mediaLimited", limited);
    auto cancelled = engine->object();
    auto cancel = grant;
    cancel.cancelled = [] { return true; };
    gr::host::installMedia(*engine, cancelled, options, cancel);
    engine->set(engine->global(), "__mediaCancelled", cancelled);

    std::ifstream file(argv[1]);
    const std::string source{std::istreambuf_iterator<char>(file), {}};
    if (source.empty())
      throw std::runtime_error("Empty timeline process test bundle");
    // Media calls settle through the run's mailbox, so the bundle runs under
    // a bound run on the process lanes, as GraphRunner runs a job.
    gr::Loop &loop = gr::Loop::current();
    gr::CancelState cancelState;
    const uint64_t generation = cancelState.beginRun();
    auto lanes = gr::processHostLanes({});
    gr::AsyncRun async(*engine, loop,
                       std::make_shared<nodetool::jobs::RunnerTracker>(),
                       generation, lanes->cpu());
    {
      gr::RunBinding::Scope bound(*engine, async, lanes->io());
      struct Settled {
        bool done = false;
        std::string error;
      };
      // Shared with the two promise callbacks the engine keeps.
      auto settled = std::make_shared<Settled>();
      gr::js::then(
          *engine, engine->evaluateModule(source, argv[1]),
          [settled](gr::js::Engine &, const gr::js::Value &) {
            settled->done = true;
          },
          [settled](gr::js::Engine &e, const gr::js::Value &reason) {
            settled->done = true;
            settled->error = e.toString(reason);
            if (settled->error.empty())
              settled->error = "the test bundle was rejected";
          });
      gr::EngineRunControl control(*engine, async, cancelState, generation,
                                   [settled] { return settled->done; });
      loop.run(control);
      if (!settled->error.empty())
        throw std::runtime_error(settled->error);
      if (!settled->done)
        throw std::runtime_error("the test bundle never settled");
    }
    const std::string checks = engine->toString(engine->evaluateScript(
        "String(globalThis.__timelineChecks)", "checks.js"));
    if (checks == "undefined" || checks == "0")
      throw std::runtime_error("Timeline process tests did not finish");
    std::printf("timeline-result: %s\n",
                engine
                    ->toString(engine->evaluateScript(
                        "globalThis.__timelineResult", "parity.js"))
                    .c_str());
    std::printf("timeline-checks: %s checks passed\n", checks.c_str());
    std::fprintf(stderr, "media output root: %s\n", root.c_str());
    async.teardown();
    loop.clearTimers();
    engine->releaseRunResources();
    return 0;
  } catch (const std::exception &error) {
    std::fprintf(stderr, "%s\n", error.what());
    fs::remove_all(root);
    return 1;
  }
}
