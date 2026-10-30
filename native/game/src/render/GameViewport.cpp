#include "GameViewport.h"
#include "SelectedModelNodes.h"
#include <QBuffer>
#include <QCursor>
#include <QFile>
#include <QFont>
#include <QImageReader>
#include <QKeyEvent>
#include <QMatrix4x4>
#include <QMouseEvent>
#include <QPainter>
#include <QQuaternion>
#include <QQuickWindow>
#include <QVector3D>
#include <array>
#include <cmath>
#include <numbers>
#include <rhi/qrhi.h>
#include <rhi/qshader.h>
#include <vector>

static void initializeGameShaders() {
  Q_INIT_RESOURCE(game_shaders);
  Q_INIT_RESOURCE(game_pbr_shaders);
}
namespace nodetool::game {
namespace {
struct Vertex {
  float x, y, z, r, g, b, a, u = 0, v = 0;
};
struct Draw {
  int offset = 0, count = 0;
  std::string texture;
};
struct Geometry {
  std::vector<Vertex> vertices;
  std::vector<Draw> draws;
};
constexpr int MaxVertices = 1'000'000;
QVector3D vector3(const Json &value, QVector3D fallback = {}) {
  if (!value.is_array() || value.size() != 3) {
    return fallback;
  }
  return {value[0].get<float>(), value[1].get<float>(), value[2].get<float>()};
}
QShader shader(const QString &path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) {
    throw Error("render", "Shader asset is unavailable: " + path.toStdString());
  }
  auto result = QShader::fromSerialized(file.readAll());
  if (!result.isValid()) {
    throw Error("render", "Shader asset is invalid: " + path.toStdString());
  }
  return result;
}
QMatrix4x4 transform(const Json &entity) {
  const auto &value = entity.value("transform", Json::object());
  QMatrix4x4 m;
  m.translate(vector3(value.value("position", Json::array({0, 0, 0}))));
  const auto q = value.value("rotation", Json::array({0, 0, 0, 1}));
  m.rotate(QQuaternion(q[3].get<float>(), q[0].get<float>(), q[1].get<float>(),
                       q[2].get<float>()));
  m.scale(vector3(value.value("scale", Json::array({1, 1, 1})), {1, 1, 1}));
  return m;
}
QVector3D transformNormal(const QMatrix4x4 &matrix, QVector3D normal) {
  const auto value = matrix.normalMatrix();
  return {value(0, 0) * normal.x() + value(0, 1) * normal.y() +
              value(0, 2) * normal.z(),
          value(1, 0) * normal.x() + value(1, 1) * normal.y() +
              value(1, 2) * normal.z(),
          value(2, 0) * normal.x() + value(2, 1) * normal.y() +
              value(2, 2) * normal.z()};
}
void triangle(std::vector<Vertex> &out, const QMatrix4x4 &model, QVector3D a,
              QVector3D b, QVector3D c, const std::array<float, 4> &color) {
  if (out.size() + 3 > MaxVertices) {
    throw Error("resource_limit", "Render vertex budget exceeded");
  }
  const auto normal = QVector3D::normal(model.map(b) - model.map(a),
                                        model.map(c) - model.map(a));
  const float light =
      0.35F +
      0.65F *
          std::max(0.0F, QVector3D::dotProduct(
                             normal, QVector3D(0.4F, 0.8F, 0.5F).normalized()));
  for (const auto &point : {a, b, c}) {
    const auto p = model.map(point);
    out.push_back({p.x(), p.y(), p.z(), color[0] * light, color[1] * light,
                   color[2] * light, color[3]});
  }
}
Geometry geometry(const Json &frame,
                  const std::shared_ptr<const RenderModels> &models) {
  Geometry result;
  auto &out = result.vertices;
  for (const auto &entity : frame.value("entities", Json::array())) {
    if (!entity.contains("visual")) {
      continue;
    }
    const auto &visual = entity["visual"];
    if (visual.value("kind", "") == "model") {
      if (!models) {
        throw Error("asset", "Prepared model cache unavailable");
      }
      const auto id = visual.at("assetId").get<std::string>();
      const auto found = models->find(id);
      if (found == models->end()) {
        throw Error("asset", "Model not prepared: " + id);
      }
      const auto &asset = *found->second;
      const auto pose =
          sampleModel(asset, visual.value("animation", std::size_t(0)),
                      frame.value("tick", 0.0) / 60.0, true);
      const auto selectedNodes = selectedModelNodes(asset);
      for (std::size_t nodeIndex = 0; nodeIndex < asset.nodes.size();
           ++nodeIndex) {
        const auto &node = asset.nodes[nodeIndex];
        if (!selectedNodes[nodeIndex] || node.mesh < 0) {
          continue;
        }
        const auto &matrix = pose.world.at(nodeIndex);
        QMatrix4x4 nodeMatrix(matrix.data());
        nodeMatrix = nodeMatrix.transposed();
        for (const auto &primitive : asset.meshes.at(node.mesh)) {
          const int first = int(out.size());
          ModelMaterial material;
          if (primitive.material >= 0) {
            material = asset.materials.at(primitive.material);
          }
          const auto model = transform(entity) * nodeMatrix;
          for (const auto index : primitive.indices) {
            if (out.size() >= MaxVertices) {
              throw Error("resource_limit", "Render vertex budget exceeded");
            }
            const auto &vertex = primitive.vertices.at(index);
            QVector3D p(vertex.position[0], vertex.position[1],
                        vertex.position[2]);
            QVector3D normal(vertex.normal[0], vertex.normal[1],
                             vertex.normal[2]);
            if (node.skin >= 0) {
              QVector3D skinned, skinnedNormal;
              for (int joint = 0; joint < 4; ++joint) {
                if (vertex.weights[joint] <= 0) {
                  continue;
                }
                const auto &skinMatrix =
                    pose.joints.at(node.skin).at(vertex.joints[joint]);
                QMatrix4x4 jointMatrix(skinMatrix.data());
                jointMatrix = jointMatrix.transposed();
                skinned += jointMatrix.map(p) * vertex.weights[joint];
                skinnedNormal += transformNormal(jointMatrix, normal) *
                                 vertex.weights[joint];
              }
              p = transform(entity).map(skinned);
              normal = transformNormal(transform(entity), skinnedNormal)
                           .normalized();
            } else {
              p = model.map(p);
              normal = transformNormal(model, normal).normalized();
            }
            const float light =
                .35F +
                .65F *
                    std::max(0.F, QVector3D::dotProduct(
                                      normal,
                                      QVector3D(.4F, .8F, .5F).normalized()));
            out.push_back({p.x(), p.y(), p.z(), material.color[0] * light,
                           material.color[1] * light, material.color[2] * light,
                           material.color[3], vertex.uv[0], vertex.uv[1]});
          }
          result.draws.push_back(
              {first, int(out.size()) - first,
               material.image >= 0 ? id + ":" + std::to_string(material.image)
                                   : ""});
        }
      }
      continue;
    }
    if (visual.value("kind", "") != "primitive") {
      continue;
    }
    const int first = int(out.size());
    const auto rgba = visual.value("color", Json::array({0.6, 0.7, 0.9, 1}));
    const std::array<float, 4> color = {
        rgba[0].get<float>(), rgba[1].get<float>(), rgba[2].get<float>(),
        rgba[3].get<float>()};
    auto model = transform(entity);
    model.scale(
        vector3(visual.value("size", Json::array({1, 1, 1})), {1, 1, 1}));
    const auto shape = visual.value("shape", "box");
    if (shape == "box") {
      const std::array<QVector3D, 8> p = {QVector3D(-.5F, -.5F, -.5F),
                                          {.5F, -.5F, -.5F},
                                          {.5F, .5F, -.5F},
                                          {-.5F, .5F, -.5F},
                                          {-.5F, -.5F, .5F},
                                          {.5F, -.5F, .5F},
                                          {.5F, .5F, .5F},
                                          {-.5F, .5F, .5F}};
      constexpr int index[] = {0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
                               0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
                               0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5};
      for (int i = 0; i < 36; i += 3) {
        triangle(out, model, p[index[i]], p[index[i + 1]], p[index[i + 2]],
                 color);
      }
    } else {
      constexpr int rings = 16, segments = 24;
      const auto point = [&](int ring, int segment) {
        const float latitude = -std::numbers::pi_v<float> / 2 +
                               std::numbers::pi_v<float> * ring / rings;
        const float longitude =
            2 * std::numbers::pi_v<float> * segment / segments;
        float y = .5F * std::sin(latitude);
        if (shape == "capsule") {
          y += y >= 0 ? .25F : -.25F;
        }
        return QVector3D(.5F * std::cos(latitude) * std::cos(longitude), y,
                         .5F * std::cos(latitude) * std::sin(longitude));
      };
      for (int y = 0; y < rings; ++y) {
        for (int x = 0; x < segments; ++x) {
          triangle(out, model, point(y, x), point(y + 1, x),
                   point(y + 1, x + 1), color);
          triangle(out, model, point(y, x), point(y + 1, x + 1),
                   point(y, x + 1), color);
        }
      }
    }
    result.draws.push_back({first, int(out.size()) - first, ""});
  }
  return result;
}
QString hudText(QString text, const Json &frame) {
  text.replace("{tick}", QString::number(frame.value("tick", 0ULL)));
  text.replace("{score}", QString::number(frame.value("score", 0.0)));
  text.replace("{health}", QString::number(frame.value("health", 0.0)));
  return text;
}
QRectF bounds(const Json &widget, QSizeF size) {
  const auto &b = widget["bounds"];
  return {b[0].get<double>() * size.width(), b[1].get<double>() * size.height(),
          b[2].get<double>() * size.width(),
          b[3].get<double>() * size.height()};
}
} // namespace
QImage paintHud(const Json &document, const Json &frame, QSize size) {
  QImage image(size, QImage::Format_RGBA8888_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setFont(QFont("Sans Serif", 14));
  for (const auto &widget : document.value("hud", Json::array())) {
    const auto rect = bounds(widget, size);
    if (widget.value("kind", "") == "button") {
      painter.setPen(QColor(155, 163, 178));
      painter.setBrush(QColor(40, 46, 58, 240));
      painter.drawRoundedRect(rect, 4, 4);
    }
    painter.setPen(QColor(244, 246, 250));
    painter.drawText(
        rect.adjusted(8, 0, -8, 0), Qt::AlignVCenter | Qt::AlignLeft,
        hudText(QString::fromStdString(widget.value("text", "")), frame));
  }
  return image;
}
class GameViewportRenderer final : public QQuickRhiItemRenderer {
  Json document_, frame_, report_ = Json::object();
  std::shared_ptr<const RenderModels> models_;
  std::shared_ptr<const RenderImages> images_;
  std::shared_ptr<const RenderFonts> fonts_;
  Scene3D scene3d_;
  Scene2D scene2d_;
  struct Surface {
    std::unique_ptr<QRhiTexture> texture;
    std::unique_ptr<QRhiShaderResourceBindings> bindings;
  };
  std::map<std::string, Surface> surfaces_;
  std::size_t decodedPixels_ = 0;
  QString error_;
  std::unique_ptr<QRhiBuffer> mesh_, camera_, quad_;
  std::unique_ptr<QRhiTexture> hud_;
  std::unique_ptr<QRhiSampler> sampler_, shadowSampler_;
  std::unique_ptr<QRhiTexture> shadowTexture_;
  std::unique_ptr<QRhiTextureRenderTarget> shadowTarget_;
  std::unique_ptr<QRhiRenderPassDescriptor> shadowPass_;
  std::unique_ptr<QRhiShaderResourceBindings> shadowBindings_;
  std::unique_ptr<QRhiGraphicsPipeline> shadowPipeline_;
  std::unique_ptr<QRhiShaderResourceBindings> meshBindings_, hudBindings_;
  std::unique_ptr<QRhiGraphicsPipeline> meshPipeline_, hudPipeline_;
  QSize hudSize_;
  QRhi *previousRhi_ = nullptr;
  int previousSamples_ = 0;
  void initialize(QRhiCommandBuffer *) override {
    if (meshPipeline_ && previousRhi_ == rhi() &&
        previousSamples_ == renderTarget()->sampleCount()) {
      return;
    }
    previousRhi_ = rhi();
    previousSamples_ = renderTarget()->sampleCount();
    try {
      shadowPipeline_.reset();
      shadowBindings_.reset();
      shadowTarget_.reset();
      shadowPass_.reset();
      shadowTexture_.reset();
      surfaces_.clear();
      decodedPixels_ = 0;
      meshPipeline_.reset();
      hudPipeline_.reset();
      hudBindings_.reset();
      meshBindings_.reset();
      mesh_.reset(rhi()->newBuffer(QRhiBuffer::Dynamic,
                                   QRhiBuffer::VertexBuffer,
                                   MaxVertices * sizeof(Vertex)));
      camera_.reset(rhi()->newBuffer(QRhiBuffer::Dynamic,
                                     QRhiBuffer::UniformBuffer, 144));
      quad_.reset(rhi()->newBuffer(
          QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, 16 * sizeof(float)));
      if (!mesh_->create() || !camera_->create() || !quad_->create()) {
        throw Error("render", "GPU buffer allocation failed");
      }
      sampler_.reset(rhi()->newSampler(QRhiSampler::Linear, QRhiSampler::Linear,
                                       QRhiSampler::None, QRhiSampler::Repeat,
                                       QRhiSampler::Repeat));
      if (!sampler_->create()) {
        throw Error("render", "Surface sampler creation failed");
      }
      Surface white;
      white.texture.reset(rhi()->newTexture(QRhiTexture::RGBA8, {1, 1}));
      if (!white.texture->create()) {
        throw Error("render", "Surface texture creation failed");
      }
      surfaces_[""] = std::move(white);
      shadowTexture_.reset(rhi()->newTexture(QRhiTexture::D32F, {1024, 1024}, 1,
                                             QRhiTexture::RenderTarget));
      if (!shadowTexture_->create()) {
        throw Error("render", "Shadow depth texture unavailable");
      }
      shadowSampler_.reset(rhi()->newSampler(
          QRhiSampler::Linear, QRhiSampler::Linear, QRhiSampler::None,
          QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
      shadowSampler_->setTextureCompareOp(QRhiSampler::LessOrEqual);
      if (!shadowSampler_->create()) {
        throw Error("render", "Shadow sampler unavailable");
      }
      QRhiTextureRenderTargetDescription shadowDescription;
      shadowDescription.setDepthTexture(shadowTexture_.get());
      shadowTarget_.reset(rhi()->newTextureRenderTarget(shadowDescription));
      shadowPass_.reset(shadowTarget_->newCompatibleRenderPassDescriptor());
      shadowTarget_->setRenderPassDescriptor(shadowPass_.get());
      if (!shadowTarget_->create()) {
        throw Error("render", "Shadow target unavailable");
      }
      shadowBindings_.reset(rhi()->newShaderResourceBindings());
      shadowBindings_->setBindings({QRhiShaderResourceBinding::uniformBuffer(
          0, QRhiShaderResourceBinding::VertexStage, camera_.get())});
      if (!shadowBindings_->create()) {
        throw Error("render", "Shadow binding unavailable");
      }
      shadowPipeline_.reset(rhi()->newGraphicsPipeline());
      shadowPipeline_->setTopology(QRhiGraphicsPipeline::Triangles);
      shadowPipeline_->setDepthTest(true);
      shadowPipeline_->setDepthWrite(true);
      shadowPipeline_->setShaderStages(
          {{QRhiShaderStage::Vertex, shader(":/game/shaders/shadow.vert.qsb")},
           {QRhiShaderStage::Fragment,
            shader(":/game/shaders/shadow.frag.qsb")}});
      QRhiVertexInputLayout shadowLayout;
      shadowLayout.setBindings({{sizeof(Vertex)}});
      shadowLayout.setAttributes({{0, 0, QRhiVertexInputAttribute::Float3, 0}});
      shadowPipeline_->setVertexInputLayout(shadowLayout);
      shadowPipeline_->setShaderResourceBindings(shadowBindings_.get());
      shadowPipeline_->setRenderPassDescriptor(shadowPass_.get());
      if (!shadowPipeline_->create()) {
        throw Error("render", "Shadow pipeline unavailable");
      }
      meshBindings_.reset(rhi()->newShaderResourceBindings());
      meshBindings_->setBindings(
          {QRhiShaderResourceBinding::uniformBuffer(
               0,
               QRhiShaderResourceBinding::VertexStage |
                   QRhiShaderResourceBinding::FragmentStage,
               camera_.get()),
           QRhiShaderResourceBinding::sampledTexture(
               1, QRhiShaderResourceBinding::FragmentStage,
               surfaces_.at("").texture.get(), sampler_.get()),
           QRhiShaderResourceBinding::sampledTexture(
               2, QRhiShaderResourceBinding::FragmentStage,
               shadowTexture_.get(), shadowSampler_.get())});
      if (!meshBindings_->create()) {
        throw Error("render", "GPU binding creation failed");
      }
      meshPipeline_.reset(rhi()->newGraphicsPipeline());
      meshPipeline_->setTopology(QRhiGraphicsPipeline::Triangles);
      meshPipeline_->setDepthTest(true);
      meshPipeline_->setDepthWrite(true);
      meshPipeline_->setCullMode(QRhiGraphicsPipeline::None);
      meshPipeline_->setSampleCount(renderTarget()->sampleCount());
      meshPipeline_->setShaderStages(
          {{QRhiShaderStage::Vertex, shader(":/game/shaders/mesh.vert.qsb")},
           {QRhiShaderStage::Fragment,
            shader(":/game/shaders/mesh.frag.qsb")}});
      QRhiVertexInputLayout layout;
      layout.setBindings({{sizeof(Vertex)}});
      layout.setAttributes(
          {{0, 0, QRhiVertexInputAttribute::Float3, 0},
           {0, 1, QRhiVertexInputAttribute::Float4, 3 * sizeof(float)},
           {0, 2, QRhiVertexInputAttribute::Float2, 7 * sizeof(float)}});
      meshPipeline_->setVertexInputLayout(layout);
      meshPipeline_->setShaderResourceBindings(meshBindings_.get());
      meshPipeline_->setRenderPassDescriptor(
          renderTarget()->renderPassDescriptor());
      if (!meshPipeline_->create()) {
        throw Error("render", "GPU mesh pipeline creation failed");
      }
      hudSize_ = {};
      report_ = {{"backend", int(rhi()->backend())},
                 {"device", rhi()->driverInfo().deviceName.toStdString()}};
    } catch (const std::exception &error) {
      error_ = QString::fromUtf8(error.what());
    }
  }
  void synchronize(QQuickRhiItem *base) override {
    auto *item = static_cast<GameViewport *>(base);
    if (document_ != item->document_ || images_ != item->images_ ||
        models_ != item->models_ || fonts_ != item->fonts_) {
      error_.clear();
    }
    document_ = item->document_;
    models_ = item->models_;
    images_ = item->images_;
    fonts_ = item->fonts_;
    if (item->mailbox_) {
      if (const auto frame = item->mailbox_->latest()) {
        frame_ = *frame;
      }
    }
    item->error_ = error_;
    item->report_ = report_;
  }
  void render(QRhiCommandBuffer *cb) override {
    if (!error_.isEmpty()) {
      return;
    }
    try {
      const auto size = renderTarget()->pixelSize();
      if (document_.value("dimension", "3d") == "2d") {
        if (!images_) {
          cb->beginPass(renderTarget(), QColor(18, 22, 30), {1, 0});
          cb->endPass();
          report_["loading"] = true;
          return;
        }
        report_["loading"] = false;
        report_.update(scene2d_.render(rhi(), cb, renderTarget(), document_,
                                       frame_, images_));
        report_["tick"] = frame_.value("tick", 0ULL);
        report_["dimension"] = "2d";
        report_["width"] = size.width();
        report_["height"] = size.height();
        return;
      }
      auto presentation = frame_;
      if (!presentation.contains("environment")) {
        const auto sceneId = frame_.value(
            "sceneId", document_.value("initialSceneId", std::string()));
        for (const auto &scene : document_.value("scenes", Json::array())) {
          if (scene.value("id", std::string()) == sceneId &&
              scene.contains("environment")) {
            presentation["environment"] = scene.at("environment");
            break;
          }
        }
      }
      if (presentation.contains("environment")) {
        if (!models_ || !images_ || !fonts_) {
          cb->beginPass(renderTarget(), QColor(18, 22, 30), {1, 0});
          cb->endPass();
          report_["loading"] = true;
          return;
        }
        report_["loading"] = false;
        report_.update(scene3d_.render(rhi(), cb, renderTarget(), document_,
                                       presentation, models_, images_, fonts_));
        return;
      }
      const auto draw = geometry(frame_, models_);
      const auto &data = draw.vertices;
      auto *update = rhi()->nextResourceUpdateBatch();
      QImage white(1, 1, QImage::Format_RGBA8888);
      white.fill(Qt::white);
      update->uploadTexture(surfaces_.at("").texture.get(), white);
      if (models_) {
        for (const auto &[id, model] : *models_) {
          for (std::size_t i = 0; i < model->images.size(); ++i) {
            const auto key = id + ":" + std::to_string(i);
            if (surfaces_.contains(key)) {
              continue;
            }
            const auto &bytes = model->images[i].bytes;
            QByteArray encoded(reinterpret_cast<const char *>(bytes.data()),
                               int(bytes.size()));
            QBuffer buffer(&encoded);
            buffer.open(QIODevice::ReadOnly);
            QImageReader reader(&buffer);
            const auto dimensions = reader.size();
            if (!dimensions.isValid() ||
                qint64(dimensions.width()) * dimensions.height() > 16'777'216) {
              throw Error("asset", "Decoded image exceeds pixel budget");
            }
            const auto pixels = std::size_t(dimensions.width()) *
                                std::size_t(dimensions.height());
            if (surfaces_.size() >= 256 ||
                decodedPixels_ + pixels > 64 * 1024 * 1024) {
              throw Error("resource_limit",
                          "Model texture cache exceeds GPU budget");
            }
            const auto image =
                reader.read().convertToFormat(QImage::Format_RGBA8888);
            if (image.isNull() ||
                qint64(image.width()) * image.height() > 16'777'216) {
              throw Error("asset", "Invalid or over-budget decoded image");
            }
            Surface surface;
            surface.texture.reset(
                rhi()->newTexture(QRhiTexture::RGBA8, image.size()));
            if (!surface.texture->create()) {
              throw Error("render", "Model texture creation failed");
            }
            surface.bindings.reset(rhi()->newShaderResourceBindings());
            surface.bindings->setBindings(
                {QRhiShaderResourceBinding::uniformBuffer(
                     0,
                     QRhiShaderResourceBinding::VertexStage |
                         QRhiShaderResourceBinding::FragmentStage,
                     camera_.get()),
                 QRhiShaderResourceBinding::sampledTexture(
                     1, QRhiShaderResourceBinding::FragmentStage,
                     surface.texture.get(), sampler_.get()),
                 QRhiShaderResourceBinding::sampledTexture(
                     2, QRhiShaderResourceBinding::FragmentStage,
                     shadowTexture_.get(), shadowSampler_.get())});
            if (!surface.bindings->create()) {
              throw Error("render", "Model texture binding failed");
            }
            update->uploadTexture(surface.texture.get(), image);
            surfaces_.emplace(key, std::move(surface));
            decodedPixels_ += pixels;
          }
        }
      }
      QMatrix4x4 view, projection;
      const auto camera =
          frame_.value("camera", document_.value("camera", Json::object()));
      view.lookAt(
          vector3(camera.value("position", Json::array({6, 5, 8}))),
          vector3(camera.value("target", Json::array({0, 0, 0}))),
          vector3(camera.value("up", Json::array({0, 1, 0})), {0, 1, 0}));
      projection.perspective(camera.value("fov", 60.0F),
                             float(size.width()) / std::max(1, size.height()),
                             camera.value("near", .05F),
                             camera.value("far", 10000.F));
      const auto vp = rhi()->clipSpaceCorrMatrix() * projection * view;
      QMatrix4x4 lightView, lightProjection;
      lightView.lookAt({20, 40, 25}, {0, 0, 0}, {0, 1, 0});
      lightProjection.ortho(-40, 40, -40, 40, .1F, 150.F);
      const auto light =
          rhi()->clipSpaceCorrMatrix() * lightProjection * lightView;
      std::array<float, 36> uniforms{};
      std::copy_n(vp.constData(), 16, uniforms.data());
      std::copy_n(light.constData(), 16, uniforms.data() + 16);
      uniforms[32] = rhi()->isClipDepthZeroToOne() ? 1.F : 0.F;
      update->updateDynamicBuffer(camera_.get(), 0, 144, uniforms.data());
      if (!data.empty()) {
        update->updateDynamicBuffer(
            mesh_.get(), 0, int(data.size() * sizeof(Vertex)), data.data());
      }
      if (hudSize_ != size) {
        hudPipeline_.reset();
        hudBindings_.reset();
        hud_.reset(rhi()->newTexture(QRhiTexture::RGBA8, size));
        if (!hud_->create()) {
          throw Error("render", "HUD texture creation failed");
        }

        hudBindings_.reset(rhi()->newShaderResourceBindings());
        hudBindings_->setBindings({QRhiShaderResourceBinding::sampledTexture(
            1, QRhiShaderResourceBinding::FragmentStage, hud_.get(),
            sampler_.get())});
        if (!hudBindings_->create()) {
          throw Error("render", "HUD binding creation failed");
        }
        hudPipeline_.reset(rhi()->newGraphicsPipeline());
        hudPipeline_->setTopology(QRhiGraphicsPipeline::TriangleStrip);
        hudPipeline_->setSampleCount(renderTarget()->sampleCount());
        hudPipeline_->setShaderStages(
            {{QRhiShaderStage::Vertex, shader(":/game/shaders/hud.vert.qsb")},
             {QRhiShaderStage::Fragment,
              shader(":/game/shaders/hud.frag.qsb")}});
        QRhiVertexInputLayout l;
        l.setBindings({{4 * sizeof(float)}});
        l.setAttributes(
            {{0, 0, QRhiVertexInputAttribute::Float2, 0},
             {0, 1, QRhiVertexInputAttribute::Float2, 2 * sizeof(float)}});
        hudPipeline_->setVertexInputLayout(l);
        hudPipeline_->setShaderResourceBindings(hudBindings_.get());
        hudPipeline_->setRenderPassDescriptor(
            renderTarget()->renderPassDescriptor());
        QRhiGraphicsPipeline::TargetBlend blend;
        blend.enable = true;
        blend.srcColor = QRhiGraphicsPipeline::One;
        blend.dstColor = QRhiGraphicsPipeline::OneMinusSrcAlpha;
        blend.srcAlpha = QRhiGraphicsPipeline::One;
        blend.dstAlpha = QRhiGraphicsPipeline::OneMinusSrcAlpha;
        hudPipeline_->setTargetBlends({blend});
        if (!hudPipeline_->create()) {
          throw Error("render", "HUD pipeline creation failed");
        }
        hudSize_ = size;
      }
      // Texture UV orientation is independent of the backend's clip-space Y.
      const bool flip = rhi()->isYUpInNDC();
      const float top = flip ? 1.F : -1.F, bottom = -top;
      const float quad[] = {-1, top,    0, 0, 1, top,    1, 0,
                            -1, bottom, 0, 1, 1, bottom, 1, 1};
      update->uploadStaticBuffer(quad_.get(), quad);
      update->uploadTexture(hud_.get(), paintHud(document_, frame_, size));
      cb->beginPass(shadowTarget_.get(), Qt::transparent, {1, 0}, update);
      cb->setViewport({0, 0, 1024, 1024});
      if (!data.empty()) {
        cb->setGraphicsPipeline(shadowPipeline_.get());
        cb->setViewport({0, 0, 1024, 1024});
        cb->setShaderResources(shadowBindings_.get());
        const QRhiCommandBuffer::VertexInput input(mesh_.get(), 0);
        cb->setVertexInput(0, 1, &input);
        cb->draw(int(data.size()));
      }
      cb->endPass();
      cb->beginPass(renderTarget(), QColor(18, 22, 30), {1, 0});
      cb->setViewport({0, 0, float(size.width()), float(size.height())});
      if (!data.empty()) {
        cb->setGraphicsPipeline(meshPipeline_.get());
        cb->setViewport({0, 0, float(size.width()), float(size.height())});
        cb->setShaderResources(meshBindings_.get());
        const QRhiCommandBuffer::VertexInput input(mesh_.get(), 0);
        cb->setVertexInput(0, 1, &input);
        for (const auto &batch : draw.draws) {
          cb->setShaderResources(
              batch.texture.empty()
                  ? meshBindings_.get()
                  : surfaces_.at(batch.texture).bindings.get());
          cb->draw(batch.count, 1, batch.offset);
        }
      }
      cb->setGraphicsPipeline(hudPipeline_.get());
      cb->setViewport({0, 0, float(size.width()), float(size.height())});
      cb->setShaderResources(hudBindings_.get());
      const QRhiCommandBuffer::VertexInput input(quad_.get(), 0);
      cb->setVertexInput(0, 1, &input);
      cb->draw(4);
      cb->endPass();
      report_["tick"] = frame_.value("tick", 0ULL);
      report_["vertices"] = data.size();
      report_["width"] = size.width();
      report_["height"] = size.height();
      report_["shadowMapSize"] = 1024;
      report_["camera"] = camera;
    } catch (const std::exception &error) {
      error_ = QString::fromUtf8(error.what());
    }
  }
};
GameViewport::GameViewport(QQuickItem *parent) : QQuickRhiItem(parent) {
  initializeGameShaders();
  setAcceptedMouseButtons(Qt::LeftButton | Qt::RightButton);
  setFlag(ItemIsFocusScope);
  setFocus(true);
}
GameViewport::~GameViewport() { releaseLook(); }
bool GameViewport::acceptsCameraLook(const Json &document) {
  if (document.value("dimension", "3d") != "3d") {
    return false;
  }
  if (document.value("camera", Json::object()).value("kind", "") ==
      "firstPerson") {
    return true;
  }
  for (const auto &scene : document.value("scenes", Json::array())) {
    if (scene.contains("activeCameraId")) {
      return true;
    }
  }
  return false;
}
bool GameViewport::cameraLookInput() const {
  return bool(input_) && acceptsCameraLook(document_);
}
void GameViewport::releaseLook() {
  lookDragging_ = false;
  if (capturedWindow_) {
    capturedWindow_->removeEventFilter(this);
    capturedWindow_->setMouseGrabEnabled(false);
    capturedWindow_.clear();
    unsetCursor();
  }
}
bool GameViewport::eventFilter(QObject *watched, QEvent *event) {
  if (capturedWindow_ && watched == capturedWindow_) {
    if (event->type() == QEvent::WindowDeactivate) {
      releaseLook();
    } else if (event->type() == QEvent::MouseMove) {
      const auto *mouse = static_cast<QMouseEvent *>(event);
      const auto center = mapToScene(QPointF(width() / 2, height() / 2));
      const auto delta = mouse->position() - center;
      if (!delta.isNull() && cameraLookInput()) {
        input_({{"look", {{"x", delta.x()}, {"y", delta.y()}}}});
        QCursor::setPos(capturedWindow_->mapToGlobal(center.toPoint()));
      }
      return true;
    }
  }
  return QQuickRhiItem::eventFilter(watched, event);
}
void GameViewport::setDocument(Json document) {
  document_ = std::move(document);
  if (!cameraLookInput()) {
    releaseLook();
  }
  update();
}
void GameViewport::setMailbox(std::shared_ptr<FrameMailbox> mailbox) {
  mailbox_ = std::move(mailbox);
  update();
}
Json GameViewport::frame() const {
  const auto value = mailbox_ ? mailbox_->latest() : nullptr;
  return value ? *value : Json::object();
}
QQuickRhiItemRenderer *GameViewport::createRenderer() {
  return new GameViewportRenderer;
}
std::optional<std::string> GameViewport::actionAt(QPointF position) const {
  for (const auto &widget : document_.value("hud", Json::array())) {
    if (widget.value("kind", "") == "button" &&
        bounds(widget, size()).contains(position)) {
      return widget.at("action").get<std::string>();
    }
  }
  return std::nullopt;
}
void GameViewport::mousePressEvent(QMouseEvent *event) {
  if (const auto action = actionAt(event->position())) {
    if (input_) {
      input_({{"actions", {{*action, true}}}});
    }
    event->accept();
    return;
  }
  if (cameraLookInput()) {
    forceActiveFocus();
    previousPointer_ = event->position();
    if (event->button() == Qt::RightButton) {
      lookDragging_ = true;
    } else if (event->button() == Qt::LeftButton && window() &&
               window()->setMouseGrabEnabled(true)) {
      capturedWindow_ = window();
      capturedWindow_->installEventFilter(this);
      setCursor(Qt::BlankCursor);
      const auto center = mapToScene(QPointF(width() / 2, height() / 2));
      QCursor::setPos(capturedWindow_->mapToGlobal(center.toPoint()));
    }
    event->accept();
    return;
  }
  event->ignore();
}
void GameViewport::mouseMoveEvent(QMouseEvent *event) {
  if (lookDragging_ && cameraLookInput()) {
    const auto delta = event->position() - previousPointer_;
    previousPointer_ = event->position();
    input_({{"look", {{"x", delta.x()}, {"y", delta.y()}}}});
    event->accept();
    return;
  }
  event->ignore();
}
void GameViewport::mouseReleaseEvent(QMouseEvent *event) {
  if (event->button() == Qt::RightButton) {
    lookDragging_ = false;
  }
  event->accept();
}
void GameViewport::keyPressEvent(QKeyEvent *event) {
  if (event->key() == Qt::Key_Escape && (capturedWindow_ || lookDragging_)) {
    releaseLook();
    event->accept();
    return;
  }
  if (event->isAutoRepeat()) {
    event->accept();
    return;
  }
  if (input_) {
    input_({{"key", event->key()}, {"pressed", true}});
  }
  event->accept();
}
void GameViewport::keyReleaseEvent(QKeyEvent *event) {
  if (input_) {
    input_({{"key", event->key()}, {"pressed", false}});
  }
  event->accept();
}
} // namespace nodetool::game
