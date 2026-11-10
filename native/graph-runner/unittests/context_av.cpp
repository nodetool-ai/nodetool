#include "host/sandbox_av_tracks.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/guest.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include <atomic>
#include <map>
#include <memory>
extern "C" {
#include <libavformat/avformat.h>
}
#include <chrono>
#include <filesystem>
#include <functional>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <thread>
namespace {
// Staging directories are removed on the I/O lane's reaper once their
// dependents released them, so their removal is awaited.
bool eventually(const std::function<bool()> &ready) {
  const auto until =
      std::chrono::steady_clock::now() + std::chrono::seconds(20);
  while (!ready()) {
    if (std::chrono::steady_clock::now() > until)
      return false;
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
  return true;
}
bool stagingLeft(const std::filesystem::path &root) {
  for (const auto &entry : std::filesystem::directory_iterator(root))
    if (entry.path().filename().string().starts_with(".code-media-"))
      return true;
  return false;
}
} // namespace
int main(int argc, char **argv) {
  try {
    if (argc != 2 && argc != 3) {
      throw std::runtime_error("Expected Code media fixture");
    }
    const auto root =
        std::filesystem::temp_directory_path() /
        ("g5-code-av-" +
         std::to_string(
             std::chrono::steady_clock::now().time_since_epoch().count()));
    std::filesystem::create_directory(root);
    struct Cleanup {
      std::filesystem::path path;
      ~Cleanup() {
        std::error_code error;
        std::filesystem::remove_all(path, error);
      }
    } cleanup{root};
    std::atomic<bool> cancelled = false;
    gr::HostOptions options;
    options.workspaceDir = root.string();
    options.allowMedia = true;
    options.mediaEncoders = {"libx264", "aac"};
    options.context.cancelled = [&] { return cancelled.load(); };
    auto engine = gr::js::createQuickJsEngine();
    gr::Guest guest(*engine, options);
    auto host = engine->get(engine->global(), "__host");
    auto media = engine->get(host, "media");
    gr::host::MediaOptions grant;
    grant.enabled = true;
    grant.encoders = {"libx264", "aac"};
    grant.cancelled = options.context.cancelled;
    if (!engine->isFunction(engine->get(media, "remuxTracks"))) {
      throw std::runtime_error(
          "Production Guest media track capability is not registered");
    }
    auto denied = engine->object();
    gr::host::installSandboxAvTracks(*engine, denied, options, {});
    engine->set(engine->global(), "__tracksDenied", denied);
    engine->set(engine->global(), "__avRoot", engine->string(root.string()));
    engine->set(engine->global(), "__avDropOriginal",
                engine->boolean(argc == 3 &&
                                std::string(argv[2]) == "--drop-original"));
    std::ifstream input(argv[1]);
    std::string source{std::istreambuf_iterator<char>(input), {}};
    // Media calls settle through the run's mailbox, so the bundle runs under
    // a bound run on the process lanes, as GraphRunner runs a job.
    gr::Loop &loop = gr::Loop::current();
    gr::CancelState cancelState;
    const uint64_t generation = cancelState.beginRun();
    auto lanes = gr::processHostLanes({});
    gr::AsyncRun async(*engine, loop,
                       std::make_shared<nodetool::jobs::RunnerTracker>(),
                       generation, lanes->cpu());
    gr::RunBinding::Scope bound(*engine, async, lanes->io());
    {
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
    std::cout << engine->toString(engine->evaluateScript(
                     "JSON.stringify(__g5AvResult)", "result.js"))
              << '\n';
    AVFormatContext *raw = nullptr;
    if (avformat_open_input(&raw, (root / "two-tracks.mp4").c_str(), nullptr,
                            nullptr) < 0) {
      throw std::runtime_error("Independent remux input open failed");
    }
    const auto close = [](AVFormatContext *format) {
      avformat_close_input(&format);
    };
    std::unique_ptr<AVFormatContext, decltype(close)> verified(raw, close);
    if (avformat_find_stream_info(raw, nullptr) < 0) {
      throw std::runtime_error("Independent remux stream probe failed");
    }
    int pictures = 0, sounds = 0;
    std::map<int, int> packets;
    for (unsigned i = 0; i < raw->nb_streams; ++i) {
      const auto kind = raw->streams[i]->codecpar->codec_type;
      if (kind == AVMEDIA_TYPE_VIDEO) {
        ++pictures;
      }
      if (kind == AVMEDIA_TYPE_AUDIO) {
        ++sounds;
        packets[i] = 0;
      }
    }
    if (pictures != 1 || sounds != 2) {
      throw std::runtime_error("Code keepOriginalAudio did not preserve two "
                               "separate real audio tracks");
    }
    AVPacket *packet = av_packet_alloc();
    if (!packet) {
      throw std::bad_alloc();
    }
    while (av_read_frame(raw, packet) >= 0) {
      if (packets.contains(packet->stream_index)) {
        ++packets[packet->stream_index];
      }
      av_packet_unref(packet);
    }
    av_packet_free(&packet);
    for (const auto &[stream, count] : packets) {
      if (!count) {
        throw std::runtime_error(
            "Preserved audio track has no encoded packets");
      }
    }
    std::cout << "independent libav probe: one video and two packet-bearing "
                 "audio tracks\n";
    // Every helper call must remove its own staging directory, including
    // failures.
    if (!eventually([&] { return !stagingLeft(root); })) {
      throw std::runtime_error("Code media staging leaked after execution");
    }
    const auto staged = engine->toString(
        engine->call(engine->get(media, "tempDir"), media, {}));
    if (!std::filesystem::is_directory(staged)) {
      throw std::runtime_error("Native Code media staging was not created");
    }
    engine->releaseRunResources();
    if (!eventually([&] { return !std::filesystem::exists(staged); })) {
      throw std::runtime_error(
          "Interrupted Code media staging survived run cleanup");
    }
    cancelled = true;
    try {
      engine->call(engine->get(media, "remuxTracks"), media,
                   {engine->object()});
      throw std::logic_error("Native remux cancellation ignored");
    } catch (const gr::js::JsError &error) {
      if (std::string(error.what()).find("cancelled") == std::string::npos) {
        throw;
      }
    }
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
