#include "render/Scene3D.h"
#include <QGuiApplication>
#include <QImage>
#include <QOffscreenSurface>
#if QT_CONFIG(vulkan)
#include <QVulkanInstance>
#endif
#include <array>
#include <iostream>
#include <memory>
#include <rhi/qrhi_platform.h>

static void initializeShaders() { Q_INIT_RESOURCE(game_pbr_shaders); }
using namespace nodetool::game;
namespace {
void require(bool condition, const char *message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}
Json sample(float x, float z, Json color, bool mesh) {
  return {{"entityId", "detached"},
          {"emitterId", "debris"},
          {"position", {x, 0, z}},
          {"velocity", {0, 0, 0}},
          {"color", std::move(color)},
          {"opacity", 1},
          {"size", 1.6},
          {"rotation", 0},
          {"life", .5},
          {"age", .5},
          {"lifetime", 1},
          {"blend", "normal"},
          {"unlit", true},
          {"softness", 0},
          {"render", mesh ? Json{{"kind", "mesh"},
                                 {"shape", "tetrahedron"},
                                 {"align", "world"}}
                          : Json{{"kind", "billboard"}}}};
}
std::array<double, 2> centroids(const QImage &image) {
  std::array<double, 2> sum{}, count{};
  for (int y = 0; y < image.height(); ++y) {
    for (int x = 0; x < image.width(); ++x) {
      const auto color = image.pixelColor(x, y);
      if (color.red() > color.green() + 10 && color.red() > color.blue() + 10) {
        sum[0] += x;
        ++count[0];
      }
      if (color.green() > color.red() + 10 &&
          color.green() > color.blue() + 10) {
        sum[1] += x;
        ++count[1];
      }
    }
  }
  require(count[0] > 10 && count[1] > 10,
          "Both separated mesh runs must remain visible");
  return {sum[0] / count[0], sum[1] / count[1]};
}
void exercise(QRhi *rhi) {
  constexpr int width = 128, height = 96;
  std::unique_ptr<QRhiTexture> texture(rhi->newTexture(
      QRhiTexture::RGBA8, {width, height}, 1,
      QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
  require(texture->create(), "Lifetime target texture");
  QRhiTextureRenderTargetDescription description{
      QRhiColorAttachment(texture.get())};
  std::unique_ptr<QRhiTextureRenderTarget> target(
      rhi->newTextureRenderTarget(description));
  std::unique_ptr<QRhiRenderPassDescriptor> pass(
      target->newCompatibleRenderPassDescriptor());
  target->setRenderPassDescriptor(pass.get());
  require(target->create(), "Lifetime render target");
  const Json environment = {
      {"background", "#000000"},
      {"ambient", {{"color", "#ffffff"}, {"intensity", 1}}},
      {"shadows", {{"enabled", false}}},
      {"postProcessing",
       {{"enabled", true}, {"toneMapping", "agx"}, {"antialias", "smaa"}}}};
  const Json document = {{"presentation",
                          {{"hudWidth", width},
                           {"hudHeight", height},
                           {"aspectRatio", double(width) / height}}},
                         {"scenes", Json::array()}};
  Json frame = {{"dimension", "3d"},
                {"tick", 70},
                {"generation", 0},
                {"sceneId", "scene"},
                {"entities", Json::array()},
                {"environment", environment},
                {"worldTransforms", Json::object()},
                {"camera",
                 {{"position", {0, 0, 5}},
                  {"target", {0, 0, 0}},
                  {"fov", 60},
                  {"near", .03},
                  {"far", 20}}}};
  const auto red = sample(-.9F, -3, {1, 0, 0}, true),
             green = sample(.9F, 0, {0, 1, 0}, true),
             blue = sample(0, -1, {0, 0, 1}, false);
  const auto models = std::make_shared<const SceneModels3D>();
  const auto images = std::make_shared<const RenderImages>();
  const auto fonts = std::make_shared<const RenderFonts>();
  Scene3D renderer;
  Json baseline;
  std::array<double, 2> before{}, after{};
  for (int index = 0; index < 32; ++index) {
    frame["tick"] = 70 + index;
    if (index == 0) {
      frame["particles"] = Json::array({red, blue, green});
    } else {
      auto movedRed = red, movedGreen = green;
      movedRed["position"] = {.9, 0, 0};
      movedGreen["position"] = {-.9, 0, -3};
      // Same identities and per-run vertex counts, but opposite depth order.
      frame["particles"] = Json::array({movedRed, blue, movedGreen});
    }
    QRhiCommandBuffer *commands = nullptr;
    require(rhi->beginOffscreenFrame(&commands) == QRhi::FrameOpSuccess,
            "Lifetime frame starts");
    const auto report = renderer.render(rhi, commands, target.get(), document,
                                        frame, models, images, fonts);
    QRhiReadbackResult readback;
    if (index < 2) {
      auto *updates = rhi->nextResourceUpdateBatch();
      updates->readBackTexture(QRhiReadbackDescription(texture.get()),
                               &readback);
      commands->resourceUpdate(updates);
    }
    require(rhi->endOffscreenFrame() == QRhi::FrameOpSuccess,
            "Lifetime frame completes");
    rhi->finish();
    require(report.at("sceneTriangles") == 10 &&
                report.at("sceneDrawCalls") == 3,
            "Three correctly ordered particle runs");
    if (index == 0) {
      baseline = report;
    }
    for (const char *key : {"sceneMeshCount", "meshBytes", "scenePipelineCount",
                            "sceneImageTextureCount", "imageGpuBytes"}) {
      require(report.at(key) == baseline.at(key),
              "Particle slot resources remain flat");
    }
    if (index < 2) {
      require(!readback.data.isEmpty(), "Actual lifetime pixels read back");
      QImage image(reinterpret_cast<const uchar *>(readback.data.constData()),
                   width, height, QImage::Format_RGBA8888);
      const auto centers = centroids(image);
      if (index == 0) {
        before = centers;
      } else {
        after = centers;
      }
    }
  }
  require(before[0] < before[1] && after[0] > after[1],
          "Reordered same-ID runs update their visible colors");
  require(after[0] - before[0] > 10 && before[1] - after[1] > 10,
          "Equal-capacity GPU buffers upload moved positions");
}
} // namespace
int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  try {
    initializeShaders();
#if QT_CONFIG(opengl)
    {
      std::unique_ptr<QOffscreenSurface> surface(
          QRhiGles2InitParams::newFallbackSurface());
      QRhiGles2InitParams params;
      params.fallbackSurface = surface.get();
      std::unique_ptr<QRhi> rhi(QRhi::create(QRhi::OpenGLES2, &params));
      require(bool(rhi), "Actual GL lifetime backend");
      exercise(rhi.get());
    }
#endif
#if QT_CONFIG(vulkan)
    {
      QVulkanInstance instance;
      instance.setExtensions(
          QRhiVulkanInitParams::preferredInstanceExtensions());
      require(instance.create(), "Lifetime Vulkan instance");
      QRhiVulkanInitParams params;
      params.inst = &instance;
      std::unique_ptr<QRhi> rhi(QRhi::create(QRhi::Vulkan, &params));
      require(bool(rhi), "Actual Vulkan lifetime backend");
      exercise(rhi.get());
    }
#endif
    std::cout << "Same-ID particle runs move/reorder with equal capacities and "
                 "flat resources on GL/Vulkan\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
