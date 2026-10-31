#include "render/GameViewport.h"
#include <QGuiApplication>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QSGRendererInterface>
#if QT_CONFIG(vulkan)
#include <QVulkanInstance>
#endif
#include <cmath>
#include <iostream>
#include <limits>
using namespace nodetool::game;
namespace {
#if QT_CONFIG(vulkan)
QVulkanInstance *vulkanInstance = nullptr;
#endif
void check(bool condition, const char *message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}
QImage capture(GameViewport &item, QQuickRenderControl &control,
               QQuickWindow &window, QSize size) {
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
  const std::size_t count = 4;
  for (std::size_t frame = 0; frame < count; ++frame) {
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
    if (!item.renderError().isEmpty()) {
      throw Error("render", item.renderError().toStdString());
    }
  }
  rhi->finish();
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
  window.setRenderTarget({});
  control.invalidate();
  return image;
}
std::shared_ptr<PreparedModel> quad(ModelMaterial material,
                                    std::array<float, 4> color = {1, 1, 1, 1}) {
  auto model = std::make_shared<PreparedModel>();
  model->source = {{"nodes", Json::array({Json::object()})}};
  model->materials.push_back(material);
  ModelPrimitive primitive;
  primitive.material = 0;
  primitive.hasVertexColors = true;
  for (const auto position : std::array<std::array<float, 3>, 4>{
           {{-1, -1, 0}, {1, -1, 0}, {1, 1, 0}, {-1, 1, 0}}}) {
    ModelVertex vertex;
    vertex.position = position;
    vertex.normal = {0, 0, 1};
    vertex.color = color;
    primitive.vertices.push_back(vertex);
  }
  primitive.indices = {0, 1, 2, 0, 2, 3};
  model->meshes = {{primitive}};
  ModelNode node;
  node.local = identityMatrix();
  node.mesh = 0;
  model->nodes.push_back(node);
  model->roots = {0};
  return model;
}
Json environment() {
  return {{"background", "#000000"},
          {"ambient", {{"color", "#ffffff"}, {"intensity", 1}}},
          {"sky", {{"kind", "color"}}},
          {"postProcessing",
           {{"enabled", true}, {"toneMapping", "agx"}, {"antialias", "smaa"}}}};
}
QImage render(const std::shared_ptr<PreparedModel> &model, bool pbr = true,
              bool shadows = false, bool caster = true) {
  auto models = std::make_shared<RenderModels>();
  (*models)["quad"] = model;
  Json frame{{"dimension", "3d"},
             {"tick", 0},
             {"camera",
              {{"position", {0, 0, 4}},
               {"target", {0, 0, 0}},
               {"near", .1},
               {"far", 20}}},
             {"entities", Json::array()}};
  if (caster) {
    frame["entities"].push_back(
        {{"id", "quad"}, {"visual", {{"kind", "model"}, {"assetId", "quad"}}}});
  }
  if (pbr) {
    frame["environment"] = environment();
  }
  if (shadows) {
    frame["environment"]["ambient"]["intensity"] = .05;
    frame["environment"]["shadows"] = {
        {"enabled", true},
        {"mapSize", 512},
        {"cascades", {{"count", 2}, {"maxDistance", 20}}}};
    ModelMaterial receiver;
    receiver.metallic = 0;
    receiver.doubleSided = true;
    (*models)["receiver"] = quad(receiver);
    frame["entities"].push_back(
        {{"id", "receiver"},
         {"transform", {{"position", {0, 0, -1}}, {"scale", {3, 3, 1}}}},
         {"visual",
          {{"kind", "model"},
           {"assetId", "receiver"},
           {"castShadow", false}}}});
    frame["entities"].push_back(
        {{"id", "light"},
         {"transform", {{"rotation", {0, .38268343, 0, .92387953}}}},
         {"light3d",
          {{"kind", "directional"},
           {"color", "#ffffff"},
           {"intensity", 3},
           {"castShadow", true}}}});
  }
  auto mailbox = std::make_shared<FrameMailbox>();
  mailbox->publish(frame);
  QQuickRenderControl control;
  QQuickWindow window(&control);
#if QT_CONFIG(vulkan)
  if (vulkanInstance) {
    window.setVulkanInstance(vulkanInstance);
  }
#endif
  GameViewport viewport;
  viewport.setDocument({{"dimension", "3d"}});
  viewport.setModels(models);
  viewport.setImages(std::make_shared<RenderImages>());
  viewport.setFonts(std::make_shared<RenderFonts>());
  viewport.setMailbox(mailbox);
  const auto image = capture(viewport, control, window, {128, 128});
  if (shadows) {
    const auto report = viewport.report();
    check(report.at("shadowLayers").get<int>() > 0,
          "Shadow fixture must allocate shadow layers");
    check(report.at("shadowDrawCalls").get<int>() ==
              (caster ? report.at("shadowLayers").get<int>() : 0),
          "Shadow fixture must submit its caster for every shadow layer");
  }
  return image;
}
int distance(const QImage &a, const QImage &b, bool receiverOnly = false) {
  int difference = 0;
  for (int y = 0; y < a.height(); ++y) {
    for (int x = 0; x < a.width(); ++x) {
      if (receiverOnly && x >= 32 && x <= 96) {
        continue;
      }
      const auto p = a.pixelColor(x, y), q = b.pixelColor(x, y);
      difference += std::abs(p.red() - q.red()) +
                    std::abs(p.green() - q.green()) +
                    std::abs(p.blue() - q.blue());
    }
  }
  return difference;
}
} // namespace
int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  try {
#if QT_CONFIG(vulkan)
    QVulkanInstance vulkan;
    if (qgetenv("QSG_RHI_BACKEND") == "vulkan") {
      QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
      check(vulkan.create(), "Material test Vulkan instance unavailable");
      vulkanInstance = &vulkan;
    }
#endif
    ModelMaterial material;
    material.metallic = 0;
    material.doubleSided = true;
    material.color = {.8F, .6F, .4F, .8F};
    auto colored = quad(material, {.25F, .5F, 1.F, .5F});
    auto multiplied = material;
    multiplied.color = {.2F, .3F, .4F, .4F};
    for (const bool pbr : {false, true}) {
      const auto a = render(colored, pbr), b = render(quad(multiplied), pbr);
      check(distance(a, b) <= 8,
            "Vertex RGB must multiply linear base color once");
      check(a.pixelColor(64, 64).blue() > 20,
            "Color fixture must draw visible pixels");
    }
    auto gradientMaterial = material;
    gradientMaterial.color = {1, 1, 1, 1};
    auto gradient = quad(gradientMaterial);
    auto &gradientVertices = gradient->meshes[0][0].vertices;
    for (auto &vertex : gradientVertices) {
      vertex.color = vertex.position[0] < 0 ? std::array<float, 4>{1, 0, 0, 1}
                                            : std::array<float, 4>{0, 0, 1, 1};
    }
    for (const bool pbr : {false, true}) {
      const auto image = render(gradient, pbr);
      const auto left = image.pixelColor(48, 64);
      const auto middle = image.pixelColor(64, 64);
      const auto right = image.pixelColor(80, 64);
      check(left.red() > left.blue() + 15 && right.blue() > right.red() + 15,
            "Per-vertex RGB must vary across the primitive");
      check(middle.red() > 20 && middle.blue() > 20,
            "Per-vertex RGB must interpolate between endpoints");
    }
    for (auto &vertex : gradientVertices) {
      vertex.color = {1, 1, 1, vertex.position[0] < 0 ? 0.F : 1.F};
    }
    gradient->materials[0].alphaMode = "BLEND";
    const auto blendedGradient = render(gradient);
    check(blendedGradient.pixelColor(80, 64).red() >
              blendedGradient.pixelColor(48, 64).red() + 15,
          "Per-vertex BLEND alpha must interpolate across the primitive");
    gradient->materials[0].alphaMode = "MASK";
    const auto maskedGradient = render(gradient);
    check(maskedGradient.pixelColor(48, 64).red() < 5 &&
              maskedGradient.pixelColor(80, 64).red() > 20,
          "Interpolated vertex alpha must cross the MASK cutoff");
    const auto opaque = render(colored);
    for (auto &vertex : colored->meshes[0][0].vertices) {
      vertex.color[3] = 0;
    }
    check(distance(opaque, render(colored)) == 0,
          "OPAQUE must ignore vertex alpha");
    colored->materials[0].alphaMode = "MASK";
    const auto masked = render(colored),
               background = render(colored, true, false, false);
    check(distance(masked, background) == 0,
          "MASK must discard multiplied vertex alpha");
    colored->materials[0].alphaMode = "BLEND";
    for (auto &vertex : colored->meshes[0][0].vertices) {
      vertex.color[3] = .5F;
    }
    multiplied.alphaMode = "BLEND";
    check(distance(render(colored), render(quad(multiplied))) <= 8,
          "BLEND must multiply vertex and material alpha once");
    auto emission = material;
    emission.color = {0, 0, 0, 1};
    emission.emissive = {.1F, .08F, .03F};
    emission.emissiveStrength = 2.8F;
    auto equivalent = emission;
    equivalent.emissive = {.28F, .224F, .084F};
    equivalent.emissiveStrength = 1;
    check(distance(render(quad(emission)), render(quad(equivalent))) <= 8,
          "Emissive strength must scale factor once");
    emission.emissive = {1, 1, 1};
    emission.emissiveStrength = std::numeric_limits<float>::max();
    const auto extreme = render(quad(emission));
    check(extreme.pixelColor(64, 64).red() > 240,
          "Extreme finite emission must survive half-float output without NaN "
          "black");
    auto maskMaterial = material;
    maskMaterial.alphaMode = "MASK";
    auto shadowCaster = quad(maskMaterial, {1, 1, 1, 0});
    const auto noCaster = render(shadowCaster, true, true, false);
    check(distance(render(shadowCaster, true, true), noCaster) <= 8,
          "MASK shadow must use vertex alpha");
    for (auto &vertex : shadowCaster->meshes[0][0].vertices) {
      vertex.color[3] = 1;
    }
    const auto opaqueCaster = render(shadowCaster, true, true);
    check(distance(opaqueCaster, noCaster, true) > 100,
          "Shadow fixture must respond to an opaque caster");
    std::cout
        << "Material RGB, alpha, emission and shadow pixel checks passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
