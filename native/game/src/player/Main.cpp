#include "core/PlayerInput.h"
#include "core/Session.h"
#include "player/JsonSaveHost.h"
#include "player/PlayerAudio.h"
#include "player/PlayerInput.h"
#include "render/GameViewport.h"
#include <QCommandLineParser>
#include <QFile>
#include <QGuiApplication>
#include <QKeySequence>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTimer>
#if QT_CONFIG(vulkan)
#include <QVulkanInstance>
#endif
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <fstream>
#include <future>
#include <iostream>
#include <mutex>
#include <rhi/qrhi.h>
#include <set>
#include <thread>

using namespace nodetool::game;
using player::InputState;
using player::consumeInput;
namespace {
Json readJson(const QString &path) {
  std::ifstream file(path.toStdString());
  if (!file) {
    throw Error("file", "Cannot open " + path.toStdString());
  }
  Json result;
  file >> result;
  return result;
}
void writeJson(const QString &path, const Json &value) {
  if (path.isEmpty()) {
    return;
  }
  std::ofstream file(path.toStdString());
  file << value.dump(2) << '\n';
  if (!file) {
    throw Error("file", "Cannot write " + path.toStdString());
  }
}
int capture(GameViewport &item, QQuickRenderControl &control,
            QQuickWindow &window, QSize size, const QString &path,
            std::size_t benchmarkFrames, Json &captureTimings) {
  item.setParentItem(window.contentItem());
  item.setSize(size);
  window.resize(size);
  if (!control.initialize()) {
    throw Error("render", "QQuickRenderControl could not initialize the "
                          "requested graphics backend");
  }
  auto *rhi = control.rhi();
  std::unique_ptr<QRhiTexture> texture(rhi->newTexture(
      QRhiTexture::RGBA8, size, 1,
      QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
  std::unique_ptr<QRhiRenderBuffer> depth(
      rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
  if (!texture->create() || !depth->create()) {
    throw Error("render", "Capture target allocation failed");
  }
  QRhiTextureRenderTargetDescription description{
      QRhiColorAttachment(texture.get())};
  description.setDepthStencilBuffer(depth.get());
  std::unique_ptr<QRhiTextureRenderTarget> target(
      rhi->newTextureRenderTarget(description));
  std::unique_ptr<QRhiRenderPassDescriptor> pass(
      target->newCompatibleRenderPassDescriptor());
  target->setRenderPassDescriptor(pass.get());
  if (!target->create()) {
    throw Error("render", "Capture render target creation failed");
  }
  window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(target.get()));
  QRhiReadbackResult readback;
  std::vector<double> frameTimes;
  const auto count = benchmarkFrames ? benchmarkFrames + 30 : 4;
  for (std::size_t frame = 0; frame < count; ++frame) {
    const auto started = std::chrono::steady_clock::now();
    item.update();
    QCoreApplication::processEvents();
    control.polishItems();
    control.beginFrame();
    control.sync();
    control.render();
    if (frame + 1 == count) {
      auto *update = rhi->nextResourceUpdateBatch();
      update->readBackTexture({texture.get()}, &readback);
      control.commandBuffer()->resourceUpdate(update);
    }
    control.endFrame();
    if (benchmarkFrames) {
      rhi->finish();
      if (frame >= 30) {
        frameTimes.push_back(std::chrono::duration<double, std::milli>(
                                 std::chrono::steady_clock::now() - started)
                                 .count());
      }
    }
    if (!item.renderError().isEmpty()) {
      throw Error("render", item.renderError().toStdString());
    }
  }
  rhi->finish();
  if (!frameTimes.empty()) {
    std::sort(frameTimes.begin(), frameTimes.end());
    captureTimings = {
        {"samples", frameTimes.size()},
        {"warmup", 30},
        {"p95Ms",
         frameTimes.at(
             static_cast<std::size_t>(std::ceil(frameTimes.size() * .95)) - 1)},
        {"p50Ms", frameTimes.at((frameTimes.size() - 1) / 2)},
        {"maxMs", frameTimes.back()},
        {"measurement", "wall time including command recording, upload "
                        "submission, and GPU completion; fixed committed pose"},
        {"gpuOnlyMs", nullptr}};
  }
  if (readback.data.isEmpty()) {
    throw Error("render", "Capture returned no pixels, backend " +
                              std::to_string(int(rhi->backend())) + " device " +
                              rhi->driverInfo().deviceName.toStdString());
  }
  auto image =
      QImage(reinterpret_cast<const uchar *>(readback.data.constData()),
             readback.pixelSize.width(), readback.pixelSize.height(),
             QImage::Format_RGBA8888)
          .copy();
  if (rhi->isYUpInFramebuffer()) {
    image = image.flipped(Qt::Vertical);
  }
  if (!image.save(path)) {
    throw Error("file", "Could not write capture " + path.toStdString());
  }
  window.setRenderTarget({});
  control.invalidate();
  return 0;
}
} // namespace
int main(int argc, char **argv) {
  if (argc == 2 && std::string(argv[1]) == "--capabilities") {
    std::cout << Json({{"engine", "native-cpp-1"},
                       {"schemaVersion", 4},
                       {"schemaVersions", Json::array({4, 5})},
                       {"dimensions", Json::array({"3d", "2d"})},
                       {"qt", QT_VERSION_STR},
                       {"player", true},
                       {"capture", true},
                       {"graphicsProbed", false},
                       {"snapshotRestoreScope", "same-session"}})
                     .dump()
              << '\n';
    return 0;
  }
  QGuiApplication app(argc, argv);
  app.setApplicationName("game-player");
  QCommandLineParser parser;
  parser.setApplicationDescription("Play or capture a native NodeTool game");
  parser.addHelpOption();
  parser.addPositionalArgument("document", "Native game document JSON");
  parser.addOptions(
      {{{"c", "capture"},
        "Capture an exact committed tick without a window",
        "path"},
       {"tick", "Tick to capture", "tick", "0"},
       {"verify-restore",
        "Verify same-session snapshot restoration before capturing"},
       {"quit-after", "Exit interactive playback after this committed tick",
        "tick"},
       {"width", "Viewport width", "pixels", "640"},
       {"height", "Viewport height", "pixels", "480"},
       {"inputs", "Recorded input frames JSON array", "path"},
       {"replay-saves", "Replay recorded JSON load results without storage IO"},
       {"report", "Write structured render report", "path"},
       {"record-inputs", "Write interactive input frames on exit", "path"},
       {"assets-dir", "Root of the prepared asset manifest", "path"},
       {"audio-capture", "Write offline stereo WAV while capturing", "path"},
       {"benchmark-frames",
        "Measure synchronized render frames after 30 warmup frames", "count",
        "0"}});
  parser.process(app);
  try {
    if (parser.positionalArguments().size() != 1) {
      throw Error("argument", "Provide one native game document");
    }
    bool validWidth = false, validHeight = false, validTick = false;
    const int width = parser.value("width").toInt(&validWidth),
              height = parser.value("height").toInt(&validHeight);
    const auto ticks = parser.value("tick").toULongLong(&validTick);
    if (!validWidth || !validHeight || !validTick || width < 64 ||
        height < 64 || width > 4096 || height > 4096 || ticks > 1'000'000) {
      throw Error("argument",
                  "Viewport must be 64..4096 pixels and tick 0..1000000");
    }
    bool validBenchmark = false;
    const auto benchmarkFrames =
        parser.value("benchmark-frames").toULongLong(&validBenchmark);
    if (!validBenchmark || benchmarkFrames > 10000 ||
        (benchmarkFrames && !parser.isSet("capture"))) {
      throw Error("argument",
                  "Benchmark requires capture and 1..10000 measured frames");
    }
    if (parser.isSet("verify-restore") && !parser.isSet("capture")) {
      throw Error("argument", "Restore verification requires capture");
    }
    const auto assetStarted = std::chrono::steady_clock::now();
    const auto document =
        validateDocument(readJson(parser.positionalArguments().front()));
    const auto inputs = parser.isSet("inputs")
                            ? readJson(parser.value("inputs"))
                            : Json::array();
    if (!inputs.is_array() || inputs.size() > 1'000'000) {
      throw Error("argument", "Inputs must be a bounded JSON array");
    }
    const auto root =
        parser.isSet("assets-dir")
            ? std::filesystem::path(parser.value("assets-dir").toStdString())
            : std::filesystem::path(
                  parser.positionalArguments().front().toStdString())
                  .parent_path();
    PreparedAssets assets(root, document.value("assets", Json::array()));
    auto renderModels = std::make_shared<RenderModels>();
    std::shared_ptr<const RenderImages> renderImages;
    auto assetLoad = std::async(std::launch::async, [&]() {
      for (const auto &scene : document.value("scenes", Json::array())) {
        const auto resolved =
            resolvePrefabs(document, scene.at("id").get<std::string>());
        for (const auto &entity : resolved) {
          if (entity.contains("visual") &&
              entity["visual"].value("kind", "") == "model") {
            const auto id = entity["visual"].at("assetId").get<std::string>();
            (*renderModels)[id] = assets.model(id);
          }
        }
      }
    });
    assetLoad.get();
    renderImages = std::make_shared<RenderImages>(
        prepareImages(assets, document.value("assets", Json::array())));
    const auto renderFonts =
        prepareHudFonts3D(assets, document.value("assets", Json::array()));
    const auto assetPrepareMs =
        std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - assetStarted)
            .count();
    Json audioReport = Json::object();
    Json simulationFailure = Json::object();
    std::vector<float> audioCapture;
    const auto mailbox = std::make_shared<FrameMailbox>();
    InputState input;
    input.recording = parser.isSet("record-inputs");
    input.lookEnabled = GameViewport::acceptsCameraLook(document);
    std::promise<void> prepared;
    auto ready = prepared.get_future();
    const bool offscreen = parser.isSet("capture");
    std::jthread simulation([&](std::stop_token stop) {
      try {
        Session session(document);
        JsonSaveHost jsonSaves(document.at("id").get<std::string>(), true,
                               parser.isSet("replay-saves"));
        PlayerAudio audio(assets, document, offscreen);
        audio.consumeFrame(session.frame());
        for (std::uint64_t tick = 0; tick < ticks; ++tick) {
          if (stop.stop_requested()) {
            throw Error("cancelled", "Player preparation cancelled");
          }
          jsonSaves.step(session,
                         tick < inputs.size() ? inputs[tick] : Json::object());
          audio.consumeFrame(session.frame());
          const auto pcm = audio.mixTick();
          if (parser.isSet("audio-capture")) {
            if (audioCapture.size() + pcm.size() > 48'000 * 2 * 300) {
              throw Error("resource_limit",
                          "Audio capture exceeds five minutes");
            }
            audioCapture.insert(audioCapture.end(), pcm.begin(), pcm.end());
          }
        }
        if (parser.isSet("verify-restore")) {
          const auto committed = session.frame();
          const auto checkpoint = session.snapshot();
          session.step(Json::object());
          session.restore(checkpoint);
          const auto restored = session.frame();
          if (restored.at("tick") != committed.at("tick") ||
              restored.at("entities") != committed.at("entities") ||
              restored.at("camera") != committed.at("camera")) {
            throw Error("snapshot_error",
                        "Restored committed presentation differs");
          }
        }
        mailbox->publish(session.frame());
        jsonSaves.drain();
        audioReport = audio.report();
        audioReport["jsonSaveStorage"] = jsonSaves.report();
        prepared.set_value();
        if (offscreen) {
          return;
        }
        auto deadline = std::chrono::steady_clock::now();
        while (!stop.stop_requested()) {
          deadline += std::chrono::microseconds(16667);
          if (!input.paused.load()) {
            auto value = consumeInput(input);
            const auto look = value.value("look", Json());
            value = movementInput(value.at("actions"),
                                  document.value("dimension", "3d"));
            if (!look.is_null()) {
              value["look"] = look;
            }
            jsonSaves.step(session, value);
            if (input.recording) {
              std::scoped_lock lock(input.mutex);
              input.recorded.back() = jsonSaves.lastInput();
            }
            audio.consumeFrame(session.frame());
            audio.mixTick();
            mailbox->publish(session.frame());
          }
          std::this_thread::sleep_until(deadline);
          if (std::chrono::steady_clock::now() - deadline >
              std::chrono::milliseconds(250)) {
            deadline = std::chrono::steady_clock::now();
          }
        }
        jsonSaves.drain();
        audioReport = audio.report();
        audioReport["jsonSaveStorage"] = jsonSaves.report();
      } catch (...) {
        const auto failure = std::current_exception();
        try {
          std::rethrow_exception(failure);
        } catch (const Error &error) {
          simulationFailure = {{"status", "error"},
                               {"code", error.code},
                               {"message", error.what()},
                               {"path", error.path}};
        } catch (const std::exception &error) {
          simulationFailure = {{"status", "error"},
                               {"code", "simulation"},
                               {"message", error.what()}};
        } catch (...) {
          simulationFailure = {{"status", "error"},
                               {"code", "simulation"},
                               {"message", "Player simulation failed"}};
        }
        try {
          prepared.set_exception(failure);
        } catch (const std::future_error &) {
          std::cerr << simulationFailure.dump() << '\n';
          QMetaObject::invokeMethod(
              &app, [&app]() { app.exit(1); }, Qt::QueuedConnection);
        }
      }
    });
    ready.get();
    // One renderer implementation is used in both paths. Qt owns the viewport
    // only while its parent item is alive, and the stack item is detached
    // first.
    const bool useVulkan = qgetenv("QSG_RHI_BACKEND") == "vulkan";
#if QT_CONFIG(vulkan)
    QVulkanInstance vulkan;
    if (useVulkan) {
      QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
      if (!vulkan.create()) {
        throw Error("render", "Vulkan instance creation failed: " +
                                  std::to_string(vulkan.errorCode()));
      }
    }
#else
    if (useVulkan) {
      throw Error(
          "render",
          "Vulkan was requested, but this Qt build has no Vulkan support");
    }
#endif
    if (offscreen) {
      QQuickRenderControl control;
      QQuickWindow window(&control);
#if QT_CONFIG(vulkan)
      if (useVulkan) {
        window.setVulkanInstance(&vulkan);
      }
#endif
      GameViewport item;
      item.setDocument(document);
      item.setModels(renderModels);
      item.setImages(renderImages);
      item.setFonts(renderFonts);
      item.setMailbox(mailbox);
      Json captureTimings = Json::object();
      const int result =
          capture(item, control, window, {width, height},
                  parser.value("capture"), benchmarkFrames, captureTimings);
      auto report = item.report();
      report["committedTick"] = mailbox->latest()->value("tick", 0ULL);
      report["restoreVerified"] = parser.isSet("verify-restore");
      report["capture"] = parser.value("capture").toStdString();
      report["build"] = std::string(Session::buildIdentity());
      report["configuration"] = GAME_BUILD_CONFIGURATION;
      report["qt"] = QT_VERSION_STR;
      report["audio"] = audioReport;
      report["assetPrepareMs"] = assetPrepareMs;
      report["frameTimings"] = captureTimings;
      if (parser.isSet("audio-capture")) {
        const auto bytes = encodeWave(audioCapture);
        std::ofstream file(parser.value("audio-capture").toStdString(),
                           std::ios::binary);
        file.write(reinterpret_cast<const char *>(bytes.data()),
                   std::streamsize(bytes.size()));
        if (!file) {
          throw Error("file", "Cannot write audio capture");
        }
      }
      writeJson(parser.value("report"), report);
      std::cout << report.dump() << '\n';
      item.setParentItem(nullptr);
      return result;
    }
    QQuickWindow window;
#if QT_CONFIG(vulkan)
    if (useVulkan) {
      window.setVulkanInstance(&vulkan);
    }
#endif
    window.setTitle(
        QString::fromStdString(document.value("title", "NodeTool game")));
    window.resize(width, height);
    GameViewport item;
    item.setParentItem(window.contentItem());
    item.setSize({double(width), double(height)});
    item.setDocument(document);
    item.setModels(renderModels);
    item.setImages(renderImages);
    item.setFonts(renderFonts);
    item.setMailbox(mailbox);
    item.setInputHandler([&](const Json &value) {
      if (value.contains("key")) {
        const int key = value["key"];
        const bool pressed = value.value("pressed", false);
        if (key == Qt::Key_P && pressed) {
          player::togglePause(input);
          return;
        }
        std::string action;
        if (key == Qt::Key_A || key == Qt::Key_Left) {
          action = "left";
        }
        if (key == Qt::Key_D || key == Qt::Key_Right) {
          action = "right";
        }
        if (key == Qt::Key_W || key == Qt::Key_Up) {
          action = "forward";
        }
        if (key == Qt::Key_S || key == Qt::Key_Down) {
          action = "backward";
        }
        if (key == Qt::Key_Space) {
          action = "jump";
        }
        std::vector<std::string> actions;
        if (!action.empty()) {
          actions.push_back(action);
        }
        const auto name = QKeySequence(key)
                              .toString(QKeySequence::PortableText)
                              .toStdString();
        for (const auto &binding :
             document.value("inputActions", Json::array())) {
          for (const auto &physical :
               binding.value("bindings", Json::array())) {
            if (physical == name || physical == "Key" + name) {
              actions.push_back(binding.at("id").get<std::string>());
              break;
            }
          }
        }
        player::setPhysicalActions(input, actions, pressed);
      } else if (value.contains("mouse")) {
        std::vector<std::string> actions;
        for (const auto &binding :
             document.value("inputActions", Json::array())) {
          for (const auto &physical :
               binding.value("bindings", Json::array())) {
            if (physical == value.at("mouse")) {
              actions.push_back(binding.at("id").get<std::string>());
              break;
            }
          }
        }
        player::setPhysicalActions(input, actions,
                                   value.value("pressed", false));
      } else if (value.contains("look")) {
        player::addLook(input, value.at("look"));
      } else if (value.contains("actions")) {
        player::setActionValues(input, value.at("actions"));
      }
    });
    QObject::connect(&window, &QQuickWindow::widthChanged, &item,
                     [&]() { item.setWidth(window.width()); });
    QObject::connect(&window, &QQuickWindow::heightChanged, &item,
                     [&]() { item.setHeight(window.height()); });
    QTimer timer;
    QObject::connect(&timer, &QTimer::timeout, &item, [&]() {
      item.update();
      if (parser.isSet("quit-after") && item.report().contains("vertices") &&
          mailbox->latest()->value("tick", 0ULL) >=
              parser.value("quit-after").toULongLong()) {
        app.quit();
      }
      if (!item.renderError().isEmpty()) {
        std::cerr << item.renderError().toStdString() << '\n';
        app.exit(1);
      }
    });
    timer.start(16);
    window.show();
    const int result = app.exec();
    simulation.request_stop();
    simulation.join();
    auto finalReport = item.report();
    finalReport["audio"] = audioReport;
    const auto committed = mailbox->latest();
    finalReport["committedTick"] = committed->at("tick");
    finalReport["entityTransforms"] = Json::object();
    for (const auto &entity : committed->at("entities")) {
      finalReport["entityTransforms"][entity.at("id").get<std::string>()] =
          entity.at("transform");
    }
    if (!simulationFailure.empty()) {
      finalReport.update(simulationFailure);
    }
    writeJson(parser.value("report"), finalReport);
    writeJson(parser.value("record-inputs"), input.recorded);
    item.setParentItem(nullptr);
    return result;
  } catch (const Error &error) {
    try {
      writeJson(parser.value("report"), {{"status", "error"},
                                         {"engine", "native-cpp-1"},
                                         {"code", error.code},
                                         {"message", error.what()}});
    } catch (...) {
    }
    std::cerr << Json({{"code", error.code},
                       {"message", error.what()},
                       {"graphicsBackend",
                        qgetenv("QSG_RHI_BACKEND").toStdString()}})
                     .dump()
              << '\n';
    return 1;
  } catch (const std::exception &error) {
    try {
      writeJson(parser.value("report"), {{"status", "error"},
                                         {"engine", "native-cpp-1"},
                                         {"code", "player"},
                                         {"message", error.what()}});
    } catch (...) {
    }
    std::cerr << Json({{"code", "player"}, {"message", error.what()}}).dump()
              << '\n';
    return 1;
  }
}
