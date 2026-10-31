#include "Scene2D.h"
#include "GameViewport.h"
#include "document/Document.h"
#include <QBuffer>
#include <QColor>
#include <QFile>
#include <QImageReader>
#include <QMatrix4x4>
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
namespace nodetool::game {
RenderImages prepareImages(PreparedAssets &assets, const Json &manifest) {
  RenderImages result;
  std::size_t total = 0;
  for (const auto &asset : manifest) {
    if (asset.value("kind", "") != "image") {
      continue;
    }
    const auto id = asset.at("id").get<std::string>();
    const auto bytes = assets.bytes(id);
    QByteArray encoded(reinterpret_cast<const char *>(bytes->data()),
                       int(bytes->size()));
    QBuffer buffer(&encoded);
    buffer.open(QIODevice::ReadOnly);
    QImageReader reader(&buffer);
    const auto format = reader.format();
    if (format != "png" && format != "jpeg" && format != "jpg") {
      throw Error("asset", "Native 2D images must be PNG or JPEG: " + id);
    }
    const auto size = reader.size();
    const auto pixels = qint64(size.width()) * size.height();
    if (!size.isValid() || pixels > 16'777'216 || size.width() > 8192 ||
        size.height() > 8192 ||
        total + std::size_t(pixels) > 64 * 1024 * 1024 ||
        result.size() >= 256) {
      throw Error("resource_limit", "2D image decode budget exceeded: " + id);
    }
    if (asset.contains("trim")) {
      const auto &trim = asset.at("trim");
      if (trim.at("x").get<double>() + size.width() >
              trim.at("sourceWidth").get<double>() ||
          trim.at("y").get<double>() + size.height() >
              trim.at("sourceHeight").get<double>()) {
        throw Error("asset", "Trim rectangle exceeds source canvas: " + id);
      }
    }
    auto image = reader.read();
    if (image.isNull() || image.size() != size) {
      throw Error("asset", "Cannot decode raster image: " + id);
    }
    total += std::size_t(pixels);
    result.emplace(
        id, image.convertToFormat(QImage::Format_RGBA8888_Premultiplied));
  }
  return result;
}
namespace {
constexpr int MaxVertices2D = 1'000'000;
struct SpriteVertex {
  float x, y, u, v, r, g, b, a, wx, wy, unlit;
};
struct Batch {
  int first, count;
  std::string asset;
  bool linear, additive;
};
QShader loadShader(const char *path) {
  QFile file(QString::fromUtf8(path));
  if (!file.open(QIODevice::ReadOnly)) {
    throw Error("render", "2D shader unavailable");
  }
  auto result = QShader::fromSerialized(file.readAll());
  if (!result.isValid()) {
    throw Error("render", "Invalid 2D shader");
  }
  return result;
}
QColor color(const Json &value, const char *fallback = "white") {
  QColor result(QString::fromStdString(
      value.is_string() ? value.get<std::string>() : fallback));
  return result.isValid() ? result : QColor(fallback);
}
} // namespace
struct Scene2D::State {
  QRhi *rhi = nullptr;
  int samples = 0;
  std::shared_ptr<const RenderImages> images;
  std::unique_ptr<QRhiBuffer> vertices, lights;
  std::array<std::unique_ptr<QRhiSampler>, 2> samplers;
  struct Surface {
    std::unique_ptr<QRhiTexture> texture;
    std::array<std::unique_ptr<QRhiShaderResourceBindings>, 2> bindings;
  };
  std::map<std::string, Surface> surfaces;
  std::array<std::unique_ptr<QRhiGraphicsPipeline>, 2> pipelines;
  QSize hudSize;
};
Scene2D::Scene2D() : state_(std::make_unique<State>()) {}
Scene2D::~Scene2D() = default;
Json Scene2D::render(QRhi *rhi, QRhiCommandBuffer *cb, QRhiRenderTarget *target,
                     const Json &document, const Json &frame,
                     const std::shared_ptr<const RenderImages> &images) {
  auto &s = *state_;
  if (s.rhi != rhi || s.samples != target->sampleCount()) {
    state_ = std::make_unique<State>();
    auto &n = *state_;
    n.rhi = rhi;
    n.samples = target->sampleCount();
    n.vertices.reset(rhi->newBuffer(QRhiBuffer::Dynamic,
                                    QRhiBuffer::VertexBuffer,
                                    MaxVertices2D * sizeof(SpriteVertex)));
    n.lights.reset(rhi->newBuffer(QRhiBuffer::Dynamic,
                                  QRhiBuffer::UniformBuffer,
                                  65 * 4 * sizeof(float)));
    if (!n.vertices->create() || !n.lights->create()) {
      throw Error("render", "2D buffers unavailable");
    }
    for (int i = 0; i < 2; ++i) {
      n.samplers[i].reset(rhi->newSampler(
          i ? QRhiSampler::Linear : QRhiSampler::Nearest,
          i ? QRhiSampler::Linear : QRhiSampler::Nearest, QRhiSampler::None,
          QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
      if (!n.samplers[i]->create()) {
        throw Error("render", "2D sampler unavailable");
      }
    }
  }
  auto &n = *state_;
  auto *update = rhi->nextResourceUpdateBatch();
  const auto addSurface = [&](const std::string &id, const QImage &image) {
    State::Surface surface;
    surface.texture.reset(rhi->newTexture(QRhiTexture::RGBA8, image.size()));
    if (!surface.texture->create()) {
      throw Error("render", "2D texture unavailable");
    }
    for (int i = 0; i < 2; ++i) {
      surface.bindings[i].reset(rhi->newShaderResourceBindings());
      surface.bindings[i]->setBindings(
          {QRhiShaderResourceBinding::uniformBuffer(
               0, QRhiShaderResourceBinding::FragmentStage, n.lights.get()),
           QRhiShaderResourceBinding::sampledTexture(
               1, QRhiShaderResourceBinding::FragmentStage,
               surface.texture.get(), n.samplers[i].get())});
      if (!surface.bindings[i]->create()) {
        throw Error("render", "2D texture binding unavailable");
      }
    }
    update->uploadTexture(surface.texture.get(), image);
    n.surfaces.insert_or_assign(id, std::move(surface));
  };
  if (n.images != images) {
    for (auto &pipeline : n.pipelines) {
      pipeline.reset();
    }
    n.surfaces.clear();
    n.hudSize = {};
    n.images = images;
    if (images) {
      for (const auto &[id, image] : *images) {
        addSurface(id, image);
      }
    }
  }
  const auto size = target->pixelSize();
  auto hud = paintHud(document, frame, size)
                 .convertToFormat(QImage::Format_RGBA8888_Premultiplied);
  if (n.hudSize != size) {
    for (auto &pipeline : n.pipelines) {
      pipeline.reset();
    }
    addSurface("\1hud", hud);
    n.hudSize = size;
  } else {
    update->uploadTexture(n.surfaces.at("\1hud").texture.get(), hud);
  }
  if (!n.pipelines[0]) {
    for (int i = 0; i < 2; ++i) {
      auto &pipeline = n.pipelines[i];
      pipeline.reset(rhi->newGraphicsPipeline());
      pipeline->setTopology(QRhiGraphicsPipeline::Triangles);
      pipeline->setSampleCount(target->sampleCount());
      pipeline->setShaderStages(
          {{QRhiShaderStage::Vertex,
            loadShader(":/game/shaders/sprite.vert.qsb")},
           {QRhiShaderStage::Fragment,
            loadShader(":/game/shaders/sprite.frag.qsb")}});
      QRhiVertexInputLayout layout;
      layout.setBindings({{sizeof(SpriteVertex)}});
      layout.setAttributes(
          {{0, 0, QRhiVertexInputAttribute::Float2, 0},
           {0, 1, QRhiVertexInputAttribute::Float2, 2 * sizeof(float)},
           {0, 2, QRhiVertexInputAttribute::Float4, 4 * sizeof(float)},
           {0, 3, QRhiVertexInputAttribute::Float3, 8 * sizeof(float)}});
      pipeline->setVertexInputLayout(layout);
      pipeline->setShaderResourceBindings(
          n.surfaces.at("\1hud").bindings[0].get());
      pipeline->setRenderPassDescriptor(target->renderPassDescriptor());
      QRhiGraphicsPipeline::TargetBlend blend;
      blend.enable = true;
      blend.srcColor = QRhiGraphicsPipeline::One;
      blend.dstColor = i ? QRhiGraphicsPipeline::One
                         : QRhiGraphicsPipeline::OneMinusSrcAlpha;
      blend.srcAlpha = QRhiGraphicsPipeline::One;
      blend.dstAlpha = QRhiGraphicsPipeline::OneMinusSrcAlpha;
      pipeline->setTargetBlends({blend});
      if (!pipeline->create()) {
        throw Error("render", "2D pipeline unavailable");
      }
    }
  }
  auto camera =
      frame.value("camera", document.value("camera2d", Json::object()));
  const double zoom = camera.value("zoom", 1.0), cx = camera.value("x", 0.0),
               cy = camera.value("y", 0.0);
  const double viewWidth = camera.value("width", 16.0) / zoom,
               viewHeight = camera.value("height", 9.0) / zoom;
  // Fit the authored camera without stretching its coordinate system.
  const double aspect = double(size.width()) / size.height();
  const double width = std::max(viewWidth, viewHeight * aspect),
               height = std::max(viewHeight, viewWidth / aspect);
  std::vector<SpriteVertex> vertices;
  std::vector<Batch> batches;
  struct Item {
    int layer;
    Json transform, sprite;
    std::size_t order = 0;
  };
  std::vector<Item> items;
  const auto appendItem = [&](Item item) {
    if (items.size() >= MaxVertices2D / 6 - 1) {
      throw Error("resource_limit", "2D visible item budget exceeded");
    }
    items.push_back(std::move(item));
  };
  std::map<std::string, bool> sampling;
  std::map<std::string, Json> metadata;
  for (const auto &asset : document.value("assets", Json::array())) {
    metadata[asset.at("id")] = asset;
    sampling[asset.at("id")] =
        asset.value("sampling", std::string("nearest")) == "linear";
  }
  const auto entities = frame.value("entities", Json::array());
  std::map<std::string, std::size_t> authoredOrder;
  std::size_t order = 128;
  for (const auto &entity : resolvePrefabs(
           document,
           frame.value("sceneId",
                       document.at("initialSceneId").get<std::string>()))) {
    authoredOrder.emplace(entity.at("id").get<std::string>(), order++);
  }
  for (const auto &entity : entities) {
    if (!authoredOrder.contains(entity.at("id").get<std::string>())) {
      authoredOrder.emplace(entity.at("id").get<std::string>(), order++);
    }
  }

  std::map<std::string, const Json *> definitions;
  std::map<std::string, Json> worldTransforms;
  for (const auto &entity : entities) {
    definitions.emplace(entity.at("id").get<std::string>(), &entity);
  }
  for (const auto &entity : entities) {
    std::vector<std::string> chain;
    std::string id = entity.at("id");
    while (!id.empty() && !worldTransforms.contains(id)) {
      if (chain.size() > definitions.size()) {
        throw Error("render", "2D parent cycle");
      }
      chain.push_back(id);
      const auto found = definitions.find(id);
      if (found == definitions.end()) {
        throw Error("render", "2D parent missing");
      }
      id = found->second->value("parentId", std::string());
    }
    while (!chain.empty()) {
      const auto current = chain.back();
      chain.pop_back();
      const auto &definition = *definitions.at(current);
      auto local = definition.value("transform", Json::object());
      const auto parent = definition.value("parentId", std::string());
      if (!parent.empty()) {
        const auto &p = worldTransforms.at(parent);
        const double angle = p.value("rotation", 0.0),
                     x = local.value("x", 0.0) * p.value("scaleX", 1.0),
                     y = local.value("y", 0.0) * p.value("scaleY", 1.0);
        local["x"] =
            p.value("x", 0.0) + std::cos(angle) * x - std::sin(angle) * y;
        local["y"] =
            p.value("y", 0.0) + std::sin(angle) * x + std::cos(angle) * y;
        local["rotation"] = angle + local.value("rotation", 0.0);
        local["scaleX"] = p.value("scaleX", 1.0) * local.value("scaleX", 1.0);
        local["scaleY"] = p.value("scaleY", 1.0) * local.value("scaleY", 1.0);
      }
      worldTransforms.emplace(current, std::move(local));
    }
  }
  for (const auto &entity : entities) {
    const auto &t = worldTransforms.at(entity.at("id").get<std::string>());
    if (entity.contains("sprite")) {
      auto sprite = entity["sprite"];
      if (!sprite.contains("frame") && entity.contains("animator")) {
        const auto &animator = entity["animator"];
        const auto &frames = animator.at("frames");
        auto index =
            frame.value("tick", 0ULL) / animator.value("ticksPerFrame", 1ULL);
        index = animator.value("loop", true)
                    ? index % frames.size()
                    : std::min<std::uint64_t>(index, frames.size() - 1);
        sprite["frame"] = frames.at(index);
      }
      appendItem({sprite.value("layer", 0), t, std::move(sprite),
                  authoredOrder.at(entity.at("id").get<std::string>())});
    }
    if (entity.contains("tilemap")) {
      const auto &map = entity["tilemap"];
      for (const auto &tile : map.at("tiles")) {
        auto sprite = tile;
        sprite["assetId"] = map.at("assetId");
        sprite["unlit"] = false;
        auto tt = t;
        const double angle = t.value("rotation", 0.0),
                     x = tile.value("x", 0.0) * t.value("scaleX", 1.0),
                     y = tile.value("y", 0.0) * t.value("scaleY", 1.0);
        tt["x"] = t.value("x", 0.0) + std::cos(angle) * x - std::sin(angle) * y;
        tt["y"] = t.value("y", 0.0) + std::sin(angle) * x + std::cos(angle) * y;
        const double radius =
            std::hypot(tile.at("width").get<double>() * t.value("scaleX", 1.0),
                       tile.at("height").get<double>() *
                           t.value("scaleY", 1.0)) /
            2;
        if (std::abs(tt.at("x").get<double>() - cx) > width / 2 + radius ||
            std::abs(tt.at("y").get<double>() - cy) > height / 2 + radius) {
          continue;
        }
        appendItem({map.value("layer", 0), std::move(tt), std::move(sprite),
                    authoredOrder.at(entity.at("id").get<std::string>())});
      }
    }
  }
  auto presentation = document;
  const auto sceneId =
      frame.value("sceneId", document.at("initialSceneId").get<std::string>());
  for (const auto &scene : document.at("scenes")) {
    if (scene.at("id") == sceneId) {
      for (const auto *field : {"lighting", "backgrounds"}) {
        if (scene.contains(field)) {
          presentation[field] = scene.at(field);
        }
      }
      break;
    }
  }
  const auto backgrounds = presentation.value("backgrounds", Json::array());
  std::size_t backgroundOrder = 0;
  for (const auto &background : backgrounds) {
    auto sprite = background;
    sprite["unlit"] = true;
    sprite["background"] = true;
    const double bw = background.at("width"), bh = background.at("height");
    const auto origin = background.value("origin", Json::object()),
               parallax = background.value("parallax", Json::object()),
               scroll = background.value("scrollRate", Json::object());
    const double seconds = frame.value("tick", 0.0) / 60.0;
    const double x = origin.value("x", 0.0) +
                     (1 - parallax.value("x", 1.0)) * cx +
                     scroll.value("x", 0.0) * seconds;
    const double y = origin.value("y", 0.0) +
                     (1 - parallax.value("y", 1.0)) * cy +
                     scroll.value("y", 0.0) * seconds;
    const auto mode = background.value("mode", std::string("repeat"));
    const bool rx = mode != "none", ry = mode == "repeat" || mode == "mirror";
    const double lowX = rx ? std::floor((cx - width / 2 - x) / bw) : 0;
    const double highX = rx ? std::ceil((cx + width / 2 - x) / bw) : 0;
    const double lowY = ry ? std::floor((cy - height / 2 - y) / bh) : 0;
    const double highY = ry ? std::ceil((cy + height / 2 - y) / bh) : 0;
    if (!std::isfinite(lowX) || !std::isfinite(highX) || !std::isfinite(lowY) ||
        !std::isfinite(highY) || std::abs(lowX) > 1e9 ||
        std::abs(highX) > 1e9 || std::abs(lowY) > 1e9 ||
        std::abs(highY) > 1e9 ||
        (highX - lowX + 1) * (highY - lowY + 1) > 100000) {
      throw Error("resource_limit", "Background repeat budget exceeded");
    }
    const int minx = int(lowX), maxx = int(highX), miny = int(lowY),
              maxy = int(highY);
    for (int iy = miny; iy <= maxy; ++iy) {
      for (int ix = minx; ix <= maxx; ++ix) {
        sprite["flipX"] = mode == "mirror" && (ix % 2 != 0);
        sprite["flipY"] = mode == "mirror" && (iy % 2 != 0);
        appendItem({background.value("layer", -100),
                    Json{{"x", x + ix * bw}, {"y", y + iy * bh}}, sprite,
                    backgroundOrder});
      }
    }
    ++backgroundOrder;
  }
  std::stable_sort(
      items.begin(), items.end(), [](const Item &a, const Item &b) {
        return a.layer == b.layer ? a.order < b.order : a.layer < b.layer;
      });
  const auto correction = rhi->clipSpaceCorrMatrix();
  const auto emitQuad = [&](const Json &t, const Json &sprite,
                            bool hudQuad = false) {
    const auto id = hudQuad ? std::string("\1hud")
                            : sprite.at("assetId").get<std::string>();
    if (!n.surfaces.contains(id)) {
      throw Error("asset", "2D image not prepared: " + id);
    }
    const auto imageSize = hudQuad ? size : images->at(id).size();
    const auto f = sprite.value("frame", Json{{"x", 0},
                                              {"y", 0},
                                              {"width", imageSize.width()},
                                              {"height", imageSize.height()}});
    const double fx = f.value("x", 0.0), fy = f.value("y", 0.0),
                 fw = f.at("width"), fh = f.at("height");
    if (fx < 0 || fy < 0 || fw <= 0 || fh <= 0 || fx + fw > imageSize.width() ||
        fy + fh > imageSize.height()) {
      throw Error("asset", "Sprite atlas frame outside image: " + id);
    }
    const double scaleX = sprite.value("scaleX", t.value("scaleX", 1.0));
    const double scaleY = sprite.value("scaleY", t.value("scaleY", 1.0));
    double sx = scaleX * sprite.value("width", 1.0),
           sy = scaleY * sprite.value("height", 1.0);
    const double angle = sprite.value("rotation", t.value("rotation", 0.0));
    double x = t.value("x", 0.0), y = t.value("y", 0.0);
    if (!hudQuad && metadata.contains(id) &&
        !sprite.value("background", false)) {
      const auto &asset = metadata.at(id);
      const auto pivot = asset.value("pivot", Json{{"x", .5}, {"y", .5}});
      const auto trim = asset.value("trim", Json::object());
      const bool framed = sprite.contains("frame");
      const double sourceWidth =
          framed ? fw : trim.value("sourceWidth", double(imageSize.width()));
      const double sourceHeight =
          framed ? fh : trim.value("sourceHeight", double(imageSize.height()));
      const double cropX = framed ? 0 : trim.value("x", 0.0),
                   cropY = framed ? 0 : trim.value("y", 0.0);
      const double ox =
          ((cropX + fw / 2) / sourceWidth - pivot.value("x", .5)) * sx;
      const double oy =
          (pivot.value("y", .5) - (cropY + fh / 2) / sourceHeight) * sy;
      x += std::cos(angle) * ox - std::sin(angle) * oy;
      y += std::sin(angle) * ox + std::cos(angle) * oy;
      sx *= fw / sourceWidth;
      sy *= fh / sourceHeight;
    }
    const double radius = std::hypot(sx, sy) / 2;
    if (!hudQuad && (std::abs(x - cx) > width / 2 + radius ||
                     std::abs(y - cy) > height / 2 + radius)) {
      return;
    }
    if (vertices.size() + 6 > MaxVertices2D) {
      throw Error("resource_limit", "2D vertex budget exceeded");
    }
    const auto tint = color(sprite.value("tint", Json("white")));
    const float opacity = sprite.value("opacity", 1.F) * tint.alphaF();
    const bool flipX = sprite.value("flipX", false),
               flipY = sprite.value("flipY", false);
    const int first = int(vertices.size());
    constexpr std::array<std::array<float, 2>, 6> points = {{{-.5F, .5F},
                                                             {-.5F, -.5F},
                                                             {.5F, -.5F},
                                                             {-.5F, .5F},
                                                             {.5F, -.5F},
                                                             {.5F, .5F}}};
    for (const auto &p : points) {
      const double wx = x + std::cos(angle) * p[0] * sx -
                        std::sin(angle) * p[1] * sy,
                   wy = y + std::sin(angle) * p[0] * sx +
                        std::cos(angle) * p[1] * sy;
      auto clip = correction.map(
          QVector3D(hudQuad ? p[0] * 2 : (wx - cx) * 2 / width,
                    hudQuad ? p[1] * 2 : (wy - cy) * 2 / height, 0));
      const float u = p[0] + .5F, v = .5F - p[1];
      vertices.push_back(
          {clip.x(), clip.y(),
           float((fx + (flipX ? 1 - u : u) * fw) / imageSize.width()),
           float((fy + (flipY ? 1 - v : v) * fh) / imageSize.height()),
           float(tint.redF()), float(tint.greenF()), float(tint.blueF()),
           opacity, float(wx), float(wy),
           sprite.value("unlit", false) ? 1.F : 0.F});
    }
    batches.push_back(
        {first, 6, id,
         hudQuad ||
             sprite.value("sampling", sampling[id]
                                          ? std::string("linear")
                                          : std::string("nearest")) == "linear",
         sprite.value("blend", std::string("normal")) == "additive"});
  };
  for (const auto &item : items) {
    emitQuad(item.transform, item.sprite);
  }
  emitQuad(Json::object(), Json{{"unlit", true}}, true);
  std::array<float, 260> lighting{};
  const auto light = presentation.value("lighting", Json::object()),
             ambient = light.value(
                 "ambient", Json{{"color", "#ffffff"}, {"intensity", 1}});
  const auto ac = color(ambient.value("color", Json("white")));
  const float intensity = ambient.value("intensity", 1.F);
  lighting[0] = ac.redF() * intensity;
  lighting[1] = ac.greenF() * intensity;
  lighting[2] = ac.blueF() * intensity;
  auto points = light.value("points", Json::array());
  std::vector<std::pair<double, Json>> entityLights;
  for (const auto &entity : frame.value("entities", Json::array())) {
    if (entity.contains("light2d")) {
      auto point = entity["light2d"];
      const auto t = worldTransforms.at(entity.at("id").get<std::string>()),
                 offset = point.value("offset", Json::object());
      const double angle = t.value("rotation", 0.0),
                   ox = offset.value("x", 0.0) * t.value("scaleX", 1.0),
                   oy = offset.value("y", 0.0) * t.value("scaleY", 1.0);
      point["x"] =
          t.value("x", 0.0) + std::cos(angle) * ox - std::sin(angle) * oy;
      point["y"] =
          t.value("y", 0.0) + std::sin(angle) * ox + std::cos(angle) * oy;
      entityLights.emplace_back(std::hypot(point.at("x").get<double>() - cx,
                                           point.at("y").get<double>() - cy),
                                std::move(point));
    }
  }
  std::stable_sort(
      entityLights.begin(), entityLights.end(),
      [](const auto &a, const auto &b) { return a.first < b.first; });
  for (const auto &[distance, point] : entityLights) {
    if (points.size() >= 32) {
      break;
    }
    points.push_back(point);
  }
  if (points.size() > 32) {
    throw Error("resource_limit", "2D point light budget exceeded");
  }
  lighting[3] = float(points.size());
  for (std::size_t i = 0; i < points.size(); ++i) {
    const auto &p = points[i];
    const auto c = color(p.at("color"));
    const auto o = 4 + i * 8;
    lighting[o] = p.at("x");
    lighting[o + 1] = p.at("y");
    lighting[o + 2] = p.at("radius");
    lighting[o + 3] = p.value("falloff", 1.F);
    lighting[o + 4] = c.redF();
    lighting[o + 5] = c.greenF();
    lighting[o + 6] = c.blueF();
    lighting[o + 7] = p.at("intensity");
  }
  update->updateDynamicBuffer(n.lights.get(), 0, sizeof(lighting),
                              lighting.data());
  update->updateDynamicBuffer(n.vertices.get(), 0,
                              int(vertices.size() * sizeof(SpriteVertex)),
                              vertices.data());
  cb->beginPass(target, QColor(18, 22, 30), {1, 0}, update);
  const QRhiCommandBuffer::VertexInput input(n.vertices.get(), 0);
  for (const auto &batch : batches) {
    cb->setGraphicsPipeline(n.pipelines[batch.additive ? 1 : 0].get());
    cb->setViewport({0, 0, float(size.width()), float(size.height())});
    cb->setShaderResources(
        n.surfaces.at(batch.asset).bindings[batch.linear ? 1 : 0].get());
    cb->setVertexInput(0, 1, &input);
    cb->draw(batch.count, 1, batch.first);
  }
  cb->endPass();
  return {{"vertices", vertices.size()},
          {"drawCalls", batches.size()},
          {"pointLights", points.size()},
          {"preparedImages", images ? images->size() : 0}};
}
} // namespace nodetool::game
