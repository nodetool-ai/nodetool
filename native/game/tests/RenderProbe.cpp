#include "document/Document.h"
#include "render/GameViewport.h"
#include <QCommandLineParser>
#include <QGuiApplication>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QSGRendererInterface>
#if QT_CONFIG(vulkan)
#include <QVulkanInstance>
#endif
#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
using namespace nodetool::game;
namespace {
Json readBounded(const std::string &path, std::string *digest = nullptr) {
  const auto size = std::filesystem::file_size(path);
  if (size > 16 * 1024 * 1024) {
    throw Error("resource_limit", "Render probe input exceeds 16 MiB");
  }
  std::ifstream file(path);
  if (!file) {
    throw Error("file", "Cannot open render probe input");
  }
  std::vector<std::uint8_t> bytes(size + 1);
  file.read(reinterpret_cast<char *>(bytes.data()),
            std::streamsize(bytes.size()));
  const auto count = file.gcount();
  if (count > 16 * 1024 * 1024 || count != std::streamsize(size)) {
    throw Error("resource_limit",
                "Render probe input changed or exceeds bounds");
  }
  bytes.resize(std::size_t(count));
  if (digest) {
    *digest = assetDigest(bytes);
  }
  std::size_t nodes = 0;
  return Json::parse(bytes, [&](int depth, Json::parse_event_t, Json &) {
    if (depth > 128 || ++nodes > 2'000'000) {
      throw Error("resource_limit", "Render probe JSON complexity exceeded");
    }
    return true;
  });
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
// This executable is a test-only presentation probe. It never constructs a
// Session or imports saves and snapshots. Both pixels and asset admission use
// the production viewport and closed asset loader.
int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  QCommandLineParser parser;
  parser.addHelpOption();
  parser.addOptions({{"document", "Validated native document", "path"},
                     {"frame", "Committed presentation frame", "path"},
                     {"assets-dir", "Closed asset root", "path"},
                     {"capture", "Output PNG", "path"},
                     {"report", "Output JSON", "path"},
                     {"width", "Width", "pixels", "1280"},
                     {"height", "Height", "pixels", "720"},
                     {"benchmark-frames",
                      "Measured unchanged frames after warmup", "count", "0"}});
  parser.process(app);
  try {
    for (const auto *argument :
         {"document", "frame", "assets-dir", "capture"}) {
      if (!parser.isSet(argument)) {
        throw Error(
            "argument",
            "Render probe requires document, frame, assets-dir and capture");
      }
    }
    bool widthValid = false, heightValid = false, benchmarkValid = false;
    const int width = parser.value("width").toInt(&widthValid),
              height = parser.value("height").toInt(&heightValid);
    const auto benchmark =
        parser.value("benchmark-frames").toULongLong(&benchmarkValid);
    if (!widthValid || !heightValid || !benchmarkValid || width < 64 ||
        height < 64 || width > 4096 || height > 4096 || benchmark > 1000) {
      throw Error("argument",
                  "Render probe dimensions or frame count outside bounds");
    }
    const auto document =
        validateDocument(readBounded(parser.value("document").toStdString()));
    std::string frameDigest;
    auto frame = readBounded(parser.value("frame").toStdString(), &frameDigest);
    if (document.at("dimension") != "3d" ||
        frame.value("dimension", std::string()) != "3d") {
      throw Error("validation_error",
                  "Render probe requires 3D document and frame");
    }
    frame = normalizeSchema(readBounded(GAME_FRAME_SCHEMA), std::move(frame));
    PreparedAssets assets(parser.value("assets-dir").toStdString(),
                          document.at("assets"));
    for (const auto &entry : document.at("assets")) {
      assets.bytes(entry.at("id").get<std::string>());
    }
    auto models = std::make_shared<RenderModels>();
    for (const auto &entity : frame.at("entities")) {
      if (entity.contains("visual") &&
          entity.at("visual").at("kind") == "model") {
        const auto id = entity.at("visual").at("assetId").get<std::string>();
        (*models)[id] = assets.model(id);
      }
    }
    const auto images = std::make_shared<RenderImages>(
        prepareImages(assets, document.at("assets")));
    const auto fonts = prepareHudFonts3D(assets, document.at("assets"));
    auto mailbox = std::make_shared<FrameMailbox>();
    mailbox->publish(std::move(frame));
    const bool useVulkan = qgetenv("QSG_RHI_BACKEND") == "vulkan";
#if QT_CONFIG(vulkan)
    QVulkanInstance vulkan;
    if (useVulkan) {
      QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
      if (!vulkan.create()) {
        throw Error("render", "Probe Vulkan instance creation failed");
      }
    }
#else
    if (useVulkan) {
      throw Error("render", "Vulkan requested but unavailable in Qt build");
    }
#endif
    QQuickRenderControl control;
    QQuickWindow window(&control);
#if QT_CONFIG(vulkan)
    if (useVulkan) {
      window.setVulkanInstance(&vulkan);
    }
#endif
    GameViewport viewport;
    viewport.setDocument(document);
    viewport.setModels(models);
    viewport.setImages(images);
    viewport.setFonts(fonts);
    viewport.setMailbox(mailbox);
    Json timings = Json::object();
    const int status = capture(viewport, control, window, {width, height},
                               parser.value("capture"), benchmark, timings);
    auto report = viewport.report();
    report["measurement"] = "controlled-presentation-only";
    report["frameTimings"] = timings;
    report["sourceFrameDigest"] = frameDigest;
    if (parser.isSet("report")) {
      std::ofstream output(parser.value("report").toStdString());
      output << report.dump(2) << '\n';
      if (!output) {
        throw Error("file", "Cannot write probe report");
      }
    }
    std::cout << report.dump() << '\n';
    return status;
  } catch (const Error &error) {
    std::cerr << Json({{"status", "error"},
                       {"code", error.code},
                       {"message", error.what()},
                       {"path", error.path}})
                     .dump()
              << '\n';
    return 1;
  } catch (const std::exception &error) {
    std::cerr << Json({{"status", "error"},
                       {"code", "probe"},
                       {"message", error.what()}})
                     .dump()
              << '\n';
    return 1;
  }
}
