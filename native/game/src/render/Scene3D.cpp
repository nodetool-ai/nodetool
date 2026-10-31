#include "Scene3D.h"
#include "SelectedModelNodes.h"
#include "Decals3D.h"
#include "Effects3D.h"
#include "PostFX3D.h"
#include "Sky3D.h"
#include <QBuffer>
#include <QColor>
#include <QFile>
#include <QImageReader>
#include <QMatrix4x4>
#include <QQuaternion>
#include <QVector3D>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <limits>
#include <numbers>
#include <qfloat16.h>
#include <rhi/qshader.h>
#include <set>
#include <tuple>
#include <vector>

namespace nodetool::game {
namespace {
using V4 = std::array<float, 4>;
constexpr int MaxDraws = 4096, MaxShadows = 28, MaxLights = 32;
constexpr std::size_t MeshByteBudget = 128 * 1024 * 1024,
                      TexturePixelBudget = 64 * 1024 * 1024,
                      TextureByteBudget = 256 * 1024 * 1024;
struct Vertex3D {
  float x, y, z, nx, ny, nz, u, v, r = 1, g = 1, b = 1, a = 1;
};
struct alignas(16) GpuMatrix {
  std::array<float, 16> values{};
  GpuMatrix() { *this = QMatrix4x4(); }
  GpuMatrix &operator=(const QMatrix4x4 &value) {
    std::copy_n(value.constData(), 16, values.begin());
    return *this;
  }
  QMatrix4x4 matrix() const { return QMatrix4x4(values.data()).transposed(); }
  QMatrix4x4 inverted() const { return matrix().inverted(); }
  QVector3D map(QVector3D value) const { return matrix().map(value); }
};
static_assert(sizeof(GpuMatrix) == 64);
struct alignas(16) SceneUniform {
  GpuMatrix viewProjection, view, inverseViewProjection;
  V4 cameraNear{}, targetFar{}, ambientCount{}, fogColorEnabled{},
      fogSettings{}, environment{}, backend{}, cascadeSplits{};
  std::array<GpuMatrix, MaxShadows> shadowMatrices;
  std::array<V4, MaxShadows> shadowLayers{};
  std::array<V4, MaxLights> lightPositionRange{}, lightColorIntensity{},
      lightDirectionDecay{}, lightShadows{};
};
struct alignas(16) MaterialUniform {
  GpuMatrix model, normal;
  V4 baseColor{1, 1, 1, 1}, emissiveNormal{0, 0, 0, 1}, surface{0, .8F, .5F, 0},
      flags{}, sampling{};
};
struct alignas(16) CopyUniform {
  GpuMatrix correction;
  V4 parameters{};
};
static_assert(sizeof(SceneUniform) == 4608);
static_assert(sizeof(MaterialUniform) == 208);
static_assert(sizeof(CopyUniform) == 80);
QVector3D vector(const Json &value, QVector3D fallback = {}) {
  if (!value.is_array() || value.size() != 3) {
    return fallback;
  }
  return {value[0].get<float>(), value[1].get<float>(), value[2].get<float>()};
}
QMatrix4x4 matrix(const Json &entity) {
  const auto t = entity.value("transform", Json::object());
  QMatrix4x4 m;
  m.translate(vector(t.value("position", Json::array({0, 0, 0}))));
  const auto q = t.value("rotation", Json::array({0, 0, 0, 1}));
  m.rotate(QQuaternion(q[3].get<float>(), q[0].get<float>(), q[1].get<float>(),
                       q[2].get<float>()));
  m.scale(vector(t.value("scale", Json::array({1, 1, 1})), {1, 1, 1}));
  return m;
}
QMatrix4x4 matrix(const Matrix4 &value) {
  return QMatrix4x4(value.data()).transposed();
}
float linear(float c) {
  return c <= .04045F ? c / 12.92F : std::pow((c + .055F) / 1.055F, 2.4F);
}
V4 color(const Json &value, float alpha = 1) {
  QColor c(QString::fromStdString(value.is_string() ? value.get<std::string>()
                                                    : "#ffffff"));
  if (!c.isValid()) {
    throw Error("render", "Invalid scene color");
  }
  return {linear(c.redF()), linear(c.greenF()), linear(c.blueF()), alpha};
}
QShader shader(const char *path) {
  QFile file(QString::fromUtf8(path));
  if (!file.open(QIODevice::ReadOnly)) {
    throw Error("render", std::string("Scene shader unavailable: ") + path);
  }
  auto result = QShader::fromSerialized(file.readAll());
  if (!result.isValid()) {
    throw Error("render", "Invalid scene shader");
  }
  return result;
}
QImage decode(const ModelImage &source) {
  QByteArray bytes(reinterpret_cast<const char *>(source.bytes.data()),
                   qsizetype(source.bytes.size()));
  QBuffer buffer(&bytes);
  buffer.open(QIODevice::ReadOnly);
  QImageReader reader(&buffer);
  const auto dimensions = reader.size();
  if (!dimensions.isValid() || dimensions.width() > 8192 ||
      dimensions.height() > 8192 ||
      qint64(dimensions.width()) * dimensions.height() > 16'777'216) {
    throw Error("resource_limit", "Scene image exceeds decoded pixel budget");
  }
  const auto image = reader.read();
  if (image.isNull() || image.size() != dimensions) {
    throw Error("asset", "Scene image decode failed");
  }
  return image.convertToFormat(QImage::Format_RGBA8888);
}
QRhiSampler::AddressMode address(int value) {
  switch (value) {
  case 33071:
    return QRhiSampler::ClampToEdge;
  case 33648:
    return QRhiSampler::Mirror;
  default:
    return QRhiSampler::Repeat;
  }
}
using SamplerKey = std::tuple<int, int, int, int>;
SamplerKey samplerKey(const ModelSampler &s) {
  return {s.wrapS, s.wrapT, s.magFilter, s.minFilter};
}
MaterialUniform material(const ModelMaterial &source, const QMatrix4x4 &model,
                         bool receiveShadow) {
  MaterialUniform result;
  result.model = model;
  result.normal = model.inverted().transposed();
  result.baseColor = source.color;
  result.emissiveNormal = {source.emissive[0] * source.emissiveStrength,
                           source.emissive[1] * source.emissiveStrength,
                           source.emissive[2] * source.emissiveStrength, source.normalScale};
  result.surface = {source.metallic, source.roughness, source.alphaCutoff,
                    source.alphaMode == "BLEND"  ? 2.F
                    : source.alphaMode == "MASK" ? 1.F
                                                 : 0.F};
  result.flags = {source.normalImage >= 0 ? 1.F : 0.F,
                  receiveShadow ? 1.F : 0.F, source.doubleSided ? 1.F : 0.F, 0};
  const auto linearMip = [](const ModelSampler &sampler) {
    return sampler.magFilter == 9729 &&
           (sampler.minFilter == 9985 || sampler.minFilter == 9987);
  };
  result.sampling = {
      source.image >= 0 && linearMip(source.baseColorSampler) ? 1.F : 0.F,
      source.normalImage >= 0 && linearMip(source.normalSampler) ? 1.F : 0.F,
      16, 0};

  return result;
}
ModelMaterial primitiveMaterial(const Json &visual) {
  ModelMaterial result;
  result.metallic = 0;
  result.roughness = .8F;
  if (visual.contains("material")) {
    const auto &m = visual.at("material");
    result.color =
        color(m.value("color", Json("#ffffff")), m.value("opacity", 1.F));
    result.metallic = m.value("metalness", 0.F);
    result.roughness = m.value("roughness", .8F);
    if (m.contains("emissive")) {
      auto c = color(m.at("emissive"));
      result.emissive = {c[0], c[1], c[2]};
    }
    const auto alpha = m.value("alphaMode", std::string("opaque"));
    result.alphaMode = alpha == "blend"  ? "BLEND"
                       : alpha == "mask" ? "MASK"
                                         : "OPAQUE";
    result.alphaCutoff = m.value("alphaCutoff", .5F);
  } else {
    const auto c = visual.value("color", Json::array({.7, .7, .7, 1}));
    for (std::size_t i = 0; i < 4; ++i) {
      result.color[i] = c[i].get<float>();
    }
  }
  return result;
}
void triangle(std::vector<Vertex3D> &vertices, QVector3D a, QVector3D b,
              QVector3D c) {
  const auto n = QVector3D::normal(b - a, c - a);
  vertices.push_back({a.x(), a.y(), a.z(), n.x(), n.y(), n.z(), 0, 0});
  vertices.push_back({b.x(), b.y(), b.z(), n.x(), n.y(), n.z(), 0, 0});
  vertices.push_back({c.x(), c.y(), c.z(), n.x(), n.y(), n.z(), 0, 0});
}
std::vector<Vertex3D> primitive(const std::string &shape) {
  std::vector<Vertex3D> result;
  if (shape == "box") {
    const std::array<QVector3D, 8> p = {QVector3D(-.5F, -.5F, -.5F),
                                        {.5F, -.5F, -.5F},
                                        {.5F, .5F, -.5F},
                                        {-.5F, .5F, -.5F},
                                        {-.5F, -.5F, .5F},
                                        {.5F, -.5F, .5F},
                                        {.5F, .5F, .5F},
                                        {-.5F, .5F, .5F}};
    constexpr std::array<int, 36> index = {0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
                                           0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
                                           0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5};
    for (std::size_t i = 0; i < index.size(); i += 3) {
      triangle(result, p[index[i]], p[index[i + 1]], p[index[i + 2]]);
    }
  } else {
    constexpr int rings = 16, segments = 24;
    const auto point = [&](int ring, int segment) {
      const float latitude = -std::numbers::pi_v<float> / 2 +
                             std::numbers::pi_v<float> * ring / rings,
                  longitude =
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
        triangle(result, point(y, x), point(y + 1, x), point(y + 1, x + 1));
        triangle(result, point(y, x), point(y + 1, x + 1), point(y, x + 1));
      }
    }
  }
  return result;
}
} // namespace

struct Scene3D::State {
  QRhi *rhi = nullptr;
  QSize size;
  int outputSamples = 0;
  std::unique_ptr<QRhiBuffer> sceneBuffer, materialBuffer, passBuffer,
      copyBuffer;
  int materialStride = 0, passStride = 0;
  std::unique_ptr<QRhiTexture> hdr, linearDepth, depth, directionalDepth,
      pointDepth, dfg, hud;
  std::unique_ptr<QRhiTextureRenderTarget> hdrTarget, transparentTarget;
  std::unique_ptr<QRhiRenderPassDescriptor> hdrPass, transparentPass;
  std::unique_ptr<QRhiSampler> clampSampler, shadowSampler;
  struct Texture {
    std::unique_ptr<QRhiTexture> value;
  };
  struct Mesh {
    std::unique_ptr<QRhiBuffer> vertices, indices;
    int vertexCount = 0, indexCount = 0;
    QVector3D center;
    std::size_t bytes = 0;
  };
  std::map<std::string, Texture> textures;
  std::map<const ModelImage *, std::string> imageKeys;
  std::map<SamplerKey, std::unique_ptr<QRhiSampler>> samplers;
  std::map<std::string, Mesh> meshes;
  std::map<std::string, std::unique_ptr<QRhiShaderResourceBindings>> bindings;
  std::map<int, std::unique_ptr<QRhiGraphicsPipeline>> pipelines;
  std::unique_ptr<QRhiGraphicsPipeline> copyPipeline, hudPipeline;
  std::unique_ptr<QRhiShaderResourceBindings> copyBindings, hudBindings;
  std::shared_ptr<const SceneModels3D> models;
  std::shared_ptr<const RenderImages> images;
  std::size_t meshBytes = 0, texturePixels = 0, textureBytes = 0;
  bool defaultsUploaded = false;
  QRhiTexture *copiedTexture = nullptr;
  PostFX3D post;
  Sky3D sky;
  QRhiTexture *skyTexture = nullptr;
  Decals3D decals;
  Effects3D effects;
  std::set<std::string> dynamicMeshes;
  struct Draw {
    Mesh *mesh = nullptr;
    MaterialUniform material;
    std::string base, normal;
    ModelSampler baseSampler, normalSampler;
    bool cast = true, decal = false, depthWrite = true, additive = false,
         mirrored = false;
    float depth = 0;
    int uniform = 0;
  };
  std::vector<Draw> draws;
  struct ShadowTarget {
    std::unique_ptr<QRhiTextureRenderTarget> target;
    QMatrix4x4 matrix;
    int uniform = 0;
  };
  std::vector<ShadowTarget> directionalTargets, pointTargets;
  std::unique_ptr<QRhiRenderPassDescriptor> shadowPass;
  std::map<std::string, std::unique_ptr<QRhiShaderResourceBindings>>
      shadowBindings;
  std::map<int, std::unique_ptr<QRhiGraphicsPipeline>> shadowPipelines;
  int directionalSize = 1, pointSize = 1;
  std::vector<QMatrix4x4> shadowMatrices;
  void shadowTargets(int directionalCount, int pointCount, int mapSize) {
    const int localSize = std::min(1024, mapSize);
    if (int(directionalTargets.size()) == directionalCount &&
        int(pointTargets.size()) == pointCount && directionalSize == mapSize &&
        pointSize == localSize) {
      return;
    }
    pipelines.clear();
    bindings.clear();
    shadowPipelines.clear();
    shadowBindings.clear();
    directionalTargets.clear();
    pointTargets.clear();
    shadowPass.reset();
    directionalSize = mapSize;
    pointSize = localSize;
    directionalDepth.reset(
        rhi->newTextureArray(QRhiTexture::D32F, std::max(1, directionalCount),
                             {mapSize, mapSize}, 1, QRhiTexture::RenderTarget));
    pointDepth.reset(rhi->newTextureArray(
        QRhiTexture::D32F, std::max(1, pointCount), {localSize, localSize}, 1,
        QRhiTexture::RenderTarget));
    if (!directionalDepth->create() || !pointDepth->create()) {
      throw Error("render", "Scene shadow arrays allocation failed");
    }
    const auto create = [&](auto &targets, QRhiTexture *texture, int count) {
      for (int layer = 0; layer < count; ++layer) {
        QRhiTextureRenderTargetDescription description;
        description.setDepthTexture(texture);
        description.setDepthLayer(layer);
        ShadowTarget result;
        result.target.reset(rhi->newTextureRenderTarget(description));
        if (!shadowPass) {
          shadowPass.reset(result.target->newCompatibleRenderPassDescriptor());
        }
        result.target->setRenderPassDescriptor(shadowPass.get());
        if (!result.target->create()) {
          throw Error("render", "Scene shadow layer target creation failed");
        }
        targets.push_back(std::move(result));
      }
    };
    create(directionalTargets, directionalDepth.get(), directionalCount);
    create(pointTargets, pointDepth.get(), pointCount);
  }
  void planShadows(SceneUniform &scene, const Json &environment,
                   const std::vector<const Json *> &orderedEntities,
                   const QMatrix4x4 &view, const QMatrix4x4 &projection,
                   const DecalTransforms3D &world,
                   QRhiResourceUpdateBatch *updates) {
    shadowMatrices.clear();
    const auto settings = environment.value("shadows", Json::object());
    if (!settings.value("enabled", false)) {
      return;
    }
    const auto cascade = settings.value("cascades", Json::object());
    const int cascadeCount = cascade.value("count", 1);
    int directionalCount = 0, pointCount = 0, directionalCasters = 0;
    for (const auto *entry : orderedEntities) {
      const auto &entity = *entry;
      if (!entity.contains("light3d") ||
          !entity.at("light3d").value("castShadow", false)) {
        continue;
      }
      if (entity.at("light3d").at("kind") == "directional") {
        directionalCount += cascadeCount;
        ++directionalCasters;
      } else {
        pointCount += 6;
      }
    }
    if (directionalCasters > 1 || directionalCount > 4 || pointCount > 24) {
      throw Error("resource_limit", "Scene shadow caster budget exceeded");
    }
    shadowTargets(directionalCount, pointCount,
                  settings.value("mapSize", 1024));
    const float near = scene.cameraNear[3],
                far =
                    std::min(scene.targetFar[3],
                             cascade.value("maxDistance", scene.targetFar[3]));
    const float split = cascade.value("split", .5F);
    for (int i = 0; i < cascadeCount; ++i) {
      const float fraction = float(i + 1) / cascadeCount;
      scene.cascadeSplits[i] = (near + (far - near) * fraction) * (1 - split) +
                               near * std::pow(far / near, fraction) * split;
    }
    const auto inverseView = view.inverted();
    int lightIndex = 0, directionalLayer = 0, pointLayer = 0;
    const auto append = [&](QMatrix4x4 matrix, int layer, bool point,
                            float bias) {
      const int index = int(shadowMatrices.size());
      shadowMatrices.push_back(matrix);
      // Shaders map clip y to texture v as y*.5+.5. Where clip y points up
      // but texture rows start at the top (Metal, D3D), sample mirrored rows.
      QMatrix4x4 sampling;
      if (rhi->isYUpInNDC() && !rhi->isYUpInFramebuffer()) {
        sampling.scale(1, -1, 1);
      }
      scene.shadowMatrices[index] = sampling * matrix;
      scene.shadowLayers[index] = {float(layer), point ? 1.F : 0.F,
                                   1.F / (point ? pointSize : directionalSize),
                                   bias};
      auto &target = (point ? pointTargets : directionalTargets).at(layer);
      target.matrix = matrix;
      target.uniform = index;
    };
    for (const auto *entry : orderedEntities) {
      const auto &entity = *entry;
      if (!entity.contains("light3d")) {
        continue;
      }
      const auto &light = entity.at("light3d");
      if (!light.value("castShadow", false)) {
        ++lightIndex;
        continue;
      }
      const bool point = light.at("kind") == "point";
      const auto lightWorld = world.at(entity.at("id").get<std::string>());
      const auto position = lightWorld.map(QVector3D());
      const auto direction = lightWorld.mapVector({0, 0, 1}).normalized();
      scene.lightShadows[lightIndex][0] = float(shadowMatrices.size());
      scene.lightShadows[lightIndex][1] = point ? 6.F : float(cascadeCount);
      if (point) {
        constexpr std::array<std::array<float, 3>, 6> directions = {
            {{1, 0, 0},
             {-1, 0, 0},
             {0, 1, 0},
             {0, -1, 0},
             {0, 0, 1},
             {0, 0, -1}}};
        constexpr std::array<std::array<float, 3>, 6> ups = {{{0, -1, 0},
                                                              {0, -1, 0},
                                                              {0, 0, 1},
                                                              {0, 0, -1},
                                                              {0, -1, 0},
                                                              {0, -1, 0}}};
        const float range = light.at("range");
        QMatrix4x4 perspective;
        perspective.perspective(90, 1, std::min(.1F, range / 100), range);
        for (int face = 0; face < 6; ++face) {
          QMatrix4x4 look;
          look.lookAt(position,
                      position + QVector3D(directions[face][0],
                                           directions[face][1],
                                           directions[face][2]),
                      QVector3D(ups[face][0], ups[face][1], ups[face][2]));
          append(rhi->clipSpaceCorrMatrix() * perspective * look, pointLayer++,
                 true, light.value("shadowBias", 0.F));
        }
      } else {
        for (int c = 0; c < cascadeCount; ++c) {
          QMatrix4x4 look, ortho;
          if (cascadeCount == 1) {
            const float extent = settings.value("extent", 20.F);
            look.lookAt(position, position - direction,
                        std::abs(direction.y()) > .99F ? QVector3D(0, 0, 1)
                                                       : QVector3D(0, 1, 0));
            ortho.ortho(-extent, extent, -extent, extent, .1F, extent * 4);
          } else {
            const float start = c == 0 ? near : scene.cascadeSplits[c - 1],
                        end = scene.cascadeSplits[c];
            std::array<QVector3D, 8> corners;
            int k = 0;
            for (const float distance : {start, end}) {
              for (int y : {-1, 1}) {
                for (int x : {-1, 1}) {
                  corners[k++] = inverseView.map(
                      {x * distance / projection(0, 0),
                       y * distance / projection(1, 1), -distance});
                }
              }
            }
            // Match GameCascadedShadows3D's diagonal extent and light-space
            // placement. Bounds are rounded to a full texel before snapping.
            const float diagonal = std::max((corners[4] - corners[7]).length(),
                                            (corners[4] - corners[3]).length());
            const float radius =
                std::ceil(diagonal * .5F * directionalSize) / directionalSize;
            const auto up = std::abs(direction.y()) > .999F
                                ? QVector3D(0, 0, 1)
                                : QVector3D(0, 1, 0);
            QMatrix4x4 orientation;
            orientation.lookAt({}, -direction, up);
            auto minimum = orientation.map(corners[0]), maximum = minimum;
            for (const auto &corner : corners) {
              const auto lightSpace = orientation.map(corner);
              for (int axis = 0; axis < 3; ++axis) {
                minimum[axis] = std::min(minimum[axis], lightSpace[axis]);
                maximum[axis] = std::max(maximum[axis], lightSpace[axis]);
              }
            }
            auto center = (minimum + maximum) * .5F;
            const float margin = std::max(100.F, far),
                        texel = 2 * radius / directionalSize;
            center.setZ(maximum.z() + margin);
            center.setX(std::floor(center.x() / texel) * texel);
            center.setY(std::floor(center.y() / texel) * texel);
            const auto position = orientation.inverted().map(center);
            look.lookAt(position, position - direction, up);
            ortho.ortho(-radius, radius, -radius, radius, 1, margin + far * 4);
          }
          append(rhi->clipSpaceCorrMatrix() * ortho * look, directionalLayer++,
                 false, light.value("shadowBias", 0.F));
        }
      }
      ++lightIndex;
    }
    QByteArray passes(int(shadowMatrices.size()) * passStride, 0);
    for (std::size_t i = 0; i < shadowMatrices.size(); ++i) {
      std::memcpy(passes.data() + i * passStride, shadowMatrices[i].constData(),
                  64);
    }
    if (!passes.isEmpty()) {
      updates->updateDynamicBuffer(passBuffer.get(), 0, passes.size(),
                                   passes.constData());
    }
  }
  QRhiShaderResourceBindings *shadowBinding(const Draw &draw) {
    const std::string key = draw.base + ":" +
                            std::to_string(draw.baseSampler.wrapS) + ":" +
                            std::to_string(draw.baseSampler.wrapT) + ":" +
                            std::to_string(draw.baseSampler.minFilter) + ":" +
                            std::to_string(draw.baseSampler.magFilter);
    if (shadowBindings.contains(key)) {
      return shadowBindings.at(key).get();
    }
    auto value = std::unique_ptr<QRhiShaderResourceBindings>(
        rhi->newShaderResourceBindings());
    value->setBindings(
        {QRhiShaderResourceBinding::uniformBufferWithDynamicOffset(
             1,
             QRhiShaderResourceBinding::VertexStage |
                 QRhiShaderResourceBinding::FragmentStage,
             materialBuffer.get(), sizeof(MaterialUniform)),
         QRhiShaderResourceBinding::sampledTexture(
             2, QRhiShaderResourceBinding::FragmentStage,
             textures.at(draw.base).value.get(), sampler(draw.baseSampler)),
         QRhiShaderResourceBinding::uniformBufferWithDynamicOffset(
             8, QRhiShaderResourceBinding::VertexStage, passBuffer.get(), 64)});
    if (!value->create()) {
      throw Error("render", "Scene shadow bindings creation failed");
    }
    return shadowBindings.emplace(key, std::move(value)).first->second.get();
  }
  QRhiGraphicsPipeline *shadowPipeline(const Draw &draw) {
    const int key =
        (draw.material.flags[2] > .5F ? 1 : 0) | (draw.mirrored ? 2 : 0);
    if (shadowPipelines.contains(key)) {
      return shadowPipelines.at(key).get();
    }
    auto value =
        std::unique_ptr<QRhiGraphicsPipeline>(rhi->newGraphicsPipeline());
    value->setDepthTest(true);
    value->setDepthWrite(true);
    value->setDepthOp(QRhiGraphicsPipeline::LessOrEqual);
    value->setCullMode((key & 1) ? QRhiGraphicsPipeline::None
                                 : QRhiGraphicsPipeline::Front);
    value->setFrontFace(draw.mirrored ? QRhiGraphicsPipeline::CW
                                      : QRhiGraphicsPipeline::CCW);
    value->setShaderStages({{QRhiShaderStage::Vertex,
                             shader(":/game/shaders/pbr_shadow.vert.qsb")},
                            {QRhiShaderStage::Fragment,
                             shader(":/game/shaders/pbr_shadow.frag.qsb")}});
    QRhiVertexInputLayout layout;
    layout.setBindings({{sizeof(Vertex3D)}});
    layout.setAttributes(
        {{0, 0, QRhiVertexInputAttribute::Float3, 0},
         {0, 2, QRhiVertexInputAttribute::Float2, 6 * sizeof(float)},
         {0, 3, QRhiVertexInputAttribute::Float4, 8 * sizeof(float)}});
    value->setVertexInputLayout(layout);
    value->setShaderResourceBindings(shadowBinding(draw));
    value->setRenderPassDescriptor(shadowPass.get());
    if (!value->create()) {
      throw Error("render", "Scene shadow pipeline creation failed");
    }
    return shadowPipelines.emplace(key, std::move(value)).first->second.get();
  }
  struct ShadowStats {
    std::size_t drawCalls = 0, triangles = 0;
  };
  ShadowStats renderShadows(QRhiCommandBuffer *cb,
                            QRhiResourceUpdateBatch *&updates) {
    ShadowStats result;
    if (shadowMatrices.empty()) {
      return result;
    }
    for (auto *targets : {&directionalTargets, &pointTargets}) {
      for (auto &target : *targets) {
        cb->beginPass(target.target.get(), Qt::black, {1, 0}, updates);
        updates = nullptr;
        const auto dimensions = target.target->pixelSize();
        for (const auto &draw : draws) {
          if (!draw.cast || draw.decal) {
            continue;
          }
          cb->setGraphicsPipeline(shadowPipeline(draw));
          cb->setViewport(
              {0, 0, float(dimensions.width()), float(dimensions.height())});
          const QRhiCommandBuffer::DynamicOffset offsets[] = {
              {1, quint32(draw.uniform * materialStride)},
              {8, quint32(target.uniform * passStride)}};
          cb->setShaderResources(shadowBinding(draw), 2, offsets);
          const QRhiCommandBuffer::VertexInput input(draw.mesh->vertices.get(),
                                                     0);
          cb->setVertexInput(0, 1, &input, draw.mesh->indices.get(), 0,
                             QRhiCommandBuffer::IndexUInt32);
          if (draw.mesh->indexCount) {
            cb->drawIndexed(draw.mesh->indexCount);
          } else {
            cb->draw(draw.mesh->vertexCount);
          }
          ++result.drawCalls;
          result.triangles += (draw.mesh->indexCount ? draw.mesh->indexCount
                                                     : draw.mesh->vertexCount) /
                              3;
        }
        cb->endPass();
      }
    }
    return result;
  }

  QRhiSampler *sampler(const ModelSampler &source) {
    auto key = samplerKey(source);
    auto found = samplers.find(key);
    if (found != samplers.end()) {
      return found->second.get();
    }
    const bool nearest = source.minFilter == 9728 || source.minFilter == 9984 ||
                         source.minFilter == 9986;
    const auto mip = source.minFilter < 9984
                         ? QRhiSampler::None
                         : (source.minFilter == 9984 || source.minFilter == 9985
                                ? QRhiSampler::Nearest
                                : QRhiSampler::Linear);
    auto value = std::unique_ptr<QRhiSampler>(rhi->newSampler(
        source.magFilter == 9728 ? QRhiSampler::Nearest : QRhiSampler::Linear,
        nearest ? QRhiSampler::Nearest : QRhiSampler::Linear, mip,
        address(source.wrapS), address(source.wrapT)));
    if (!value->create()) {
      throw Error("render", "Scene material sampler creation failed");
    }
    auto *result = value.get();
    samplers.emplace(key, std::move(value));
    return result;
  }
  void texture(const std::string &id, const QImage &source, bool srgb,
               QRhiResourceUpdateBatch *update) {
    if (textures.contains(id)) {
      return;
    }
    const auto pixels =
        std::size_t(source.width()) * std::size_t(source.height());
    if (source.isNull() || textures.size() >= 512 ||
        texturePixels + pixels > TexturePixelBudget) {
      throw Error("resource_limit", "Scene texture cache budget exceeded");
    }
    // QRhi GLES 6.12 does not implement the sRGB flag for RGBA8. Decode
    // before filtering so every backend interpolates and builds mips in linear
    // space. Half floats preserve the authored dark values without 8-bit loss.
    const auto image = source.convertToFormat(QImage::Format_RGBA8888);
    std::size_t bytes = 0;
    for (int width = image.width(), height = image.height();;
         width = std::max(1, width / 2), height = std::max(1, height / 2)) {
      bytes += std::size_t(width) * height * (srgb ? 8 : 4);
      if (width == 1 && height == 1) {
        break;
      }
    }
    if (bytes > TextureByteBudget - textureBytes) {
      throw Error("resource_limit", "Scene GPU image byte budget exceeded");
    }
    Texture target;
    const auto flags =
        QRhiTexture::MipMapped | QRhiTexture::UsedWithGenerateMips;
    target.value.reset(
        rhi->newTexture(srgb ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8,
                        source.size(), 1, flags));
    if (!target.value->create()) {
      throw Error("render", "Scene material texture allocation failed");
    }
    if (srgb) {
      QByteArray decoded(qsizetype(pixels * 8), 0);
      std::array<qfloat16, 256> lookup;
      for (int i = 0; i < 256; ++i) {
        lookup[i] = qfloat16(linear(float(i) / 255));
      }
      for (int y = 0; y < image.height(); ++y) {
        const auto *row = image.constScanLine(y);
        for (int x = 0; x < image.width(); ++x) {
          const std::array<qfloat16, 4> pixel = {
              lookup[row[x * 4]], lookup[row[x * 4 + 1]],
              lookup[row[x * 4 + 2]], qfloat16(float(row[x * 4 + 3]) / 255)};
          std::memcpy(decoded.data() + (std::size_t(y) * image.width() + x) * 8,
                      pixel.data(), 8);
        }
      }
      update->uploadTexture(
          target.value.get(),
          QRhiTextureUploadDescription({QRhiTextureUploadEntry(
              0, 0, QRhiTextureSubresourceUploadDescription(decoded))}));
    } else {
      update->uploadTexture(target.value.get(), image);
    }
    update->generateMips(target.value.get());
    textureBytes += bytes;
    texturePixels += pixels;
    textures.emplace(id, std::move(target));
  }
  Mesh &mesh(const std::string &id, const std::vector<Vertex3D> &vertices,
             const std::vector<std::uint32_t> &indices,
             QRhiResourceUpdateBatch *update) {
    auto found = meshes.find(id);
    if (found != meshes.end()) {
      return found->second;
    }
    const std::size_t bytes = vertices.size() * sizeof(Vertex3D) +
                              indices.size() * sizeof(std::uint32_t);
    if (vertices.empty() || bytes > MeshByteBudget - meshBytes) {
      throw Error("resource_limit", "Scene GPU mesh cache budget exceeded");
    }
    Mesh result;
    result.vertexCount = int(vertices.size());
    result.indexCount = int(indices.size());
    result.vertices.reset(
        rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer,
                       int(vertices.size() * sizeof(Vertex3D))));
    if (!result.vertices->create()) {
      throw Error("render", "Scene vertex buffer allocation failed");
    }
    update->uploadStaticBuffer(result.vertices.get(), vertices.data());
    if (!indices.empty()) {
      result.indices.reset(
          rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::IndexBuffer,
                         int(indices.size() * sizeof(std::uint32_t))));
      if (!result.indices->create()) {
        throw Error("render", "Scene index buffer allocation failed");
      }
      update->uploadStaticBuffer(result.indices.get(), indices.data());
    }
    QVector3D minimum(vertices.front().x, vertices.front().y,
                      vertices.front().z),
        maximum = minimum;
    for (const auto &v : vertices) {
      minimum.setX(std::min(minimum.x(), v.x));
      minimum.setY(std::min(minimum.y(), v.y));
      minimum.setZ(std::min(minimum.z(), v.z));
      maximum.setX(std::max(maximum.x(), v.x));
      maximum.setY(std::max(maximum.y(), v.y));
      maximum.setZ(std::max(maximum.z(), v.z));
    }
    result.center = (minimum + maximum) / 2;
    result.bytes = bytes;
    meshBytes += bytes;
    return meshes.emplace(id, std::move(result)).first->second;
  }
  Mesh &dynamicMesh(const std::string &key,
                    const std::vector<Vertex3D> &vertices,
                    const std::vector<std::uint32_t> &indices,
                    QRhiResourceUpdateBatch *updates) {
    dynamicMeshes.insert(key);
    const auto bytes = vertices.size() * sizeof(Vertex3D) +
                       indices.size() * sizeof(std::uint32_t);
    auto found = meshes.find(key);
    if (found != meshes.end() &&
        (found->second.vertexCount != int(vertices.size()) ||
         found->second.indexCount != int(indices.size()))) {
      meshBytes -= found->second.bytes;
      meshes.erase(found);
      found = meshes.end();
    }
    if (found == meshes.end()) {
      if (vertices.empty() || bytes > MeshByteBudget - meshBytes) {
        throw Error("resource_limit", "Scene dynamic mesh budget exceeded");
      }
      Mesh result;
      result.vertexCount = int(vertices.size());
      result.indexCount = int(indices.size());
      result.bytes = bytes;
      result.vertices.reset(
          rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::VertexBuffer,
                         int(vertices.size() * sizeof(Vertex3D))));
      if (!result.vertices->create()) {
        throw Error("render", "Scene dynamic vertex allocation failed");
      }
      if (!indices.empty()) {
        result.indices.reset(
            rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::IndexBuffer,
                           int(indices.size() * sizeof(std::uint32_t))));
        if (!result.indices->create()) {
          throw Error("render", "Scene dynamic index allocation failed");
        }
        updates->uploadStaticBuffer(result.indices.get(), indices.data());
      }
      meshBytes += bytes;
      found = meshes.emplace(key, std::move(result)).first;
    }
    updates->updateDynamicBuffer(found->second.vertices.get(), 0,
                                 int(vertices.size() * sizeof(Vertex3D)),
                                 vertices.data());
    QVector3D minimum(vertices.front().x, vertices.front().y,
                      vertices.front().z),
        maximum = minimum;
    for (const auto &v : vertices) {
      for (int i = 0; i < 3; ++i) {
        const float coordinate = i == 0 ? v.x : i == 1 ? v.y : v.z;
        minimum[i] = std::min(minimum[i], coordinate);
        maximum[i] = std::max(maximum[i], coordinate);
      }
    }
    found->second.center = (minimum + maximum) / 2;
    return found->second;
  }
  void initialize(QRhi *device, QRhiRenderTarget *output) {
    rhi = device;
    materialStride = rhi->ubufAligned(sizeof(MaterialUniform));
    passStride = rhi->ubufAligned(64);
    sceneBuffer.reset(rhi->newBuffer(
        QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(SceneUniform)));
    materialBuffer.reset(rhi->newBuffer(QRhiBuffer::Dynamic,
                                        QRhiBuffer::UniformBuffer,
                                        MaxDraws * materialStride));
    passBuffer.reset(rhi->newBuffer(QRhiBuffer::Dynamic,
                                    QRhiBuffer::UniformBuffer,
                                    MaxShadows * passStride));
    copyBuffer.reset(rhi->newBuffer(
        QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(CopyUniform)));
    if (!sceneBuffer->create() || !materialBuffer->create() ||
        !passBuffer->create() || !copyBuffer->create()) {
      throw Error("render", "Scene uniform buffer allocation failed");
    }
    clampSampler.reset(rhi->newSampler(
        QRhiSampler::Linear, QRhiSampler::Linear, QRhiSampler::None,
        QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
    shadowSampler.reset(rhi->newSampler(
        QRhiSampler::Linear, QRhiSampler::Linear, QRhiSampler::None,
        QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
    shadowSampler->setTextureCompareOp(QRhiSampler::LessOrEqual);
    if (!clampSampler->create() || !shadowSampler->create()) {
      throw Error("render", "Scene shared sampler creation failed");
    }
    directionalDepth.reset(rhi->newTextureArray(QRhiTexture::D32F, 1, {1, 1}, 1,
                                                QRhiTexture::RenderTarget));
    pointDepth.reset(rhi->newTextureArray(QRhiTexture::D32F, 1, {1, 1}, 1,
                                          QRhiTexture::RenderTarget));
    dfg.reset(rhi->newTexture(QRhiTexture::RGBA16F, {16, 16}));
    if (!directionalDepth->create() || !pointDepth->create() ||
        !dfg->create()) {
      throw Error("render", "Scene lighting target allocation failed");
    }
    outputSamples = output->sampleCount();
  }
  void resize(QSize dimensions) {
    if (size == dimensions) {
      return;
    }
    pipelines.clear();
    bindings.clear();
    copyPipeline.reset();
    hudPipeline.reset();
    copyBindings.reset();
    hudBindings.reset();
    hdrTarget.reset();
    transparentTarget.reset();
    hdrPass.reset();
    transparentPass.reset();
    hdr.reset(rhi->newTexture(QRhiTexture::RGBA16F, dimensions, 1,
                              QRhiTexture::RenderTarget));
    linearDepth.reset(rhi->newTexture(QRhiTexture::R32F, dimensions, 1,
                                      QRhiTexture::RenderTarget));
    depth.reset(rhi->newTexture(QRhiTexture::D32F, dimensions, 1,
                                QRhiTexture::RenderTarget));
    hud.reset(rhi->newTexture(QRhiTexture::RGBA8, dimensions));
    if (!hdr->create() || !linearDepth->create() || !depth->create() ||
        !hud->create()) {
      throw Error("render", "Scene HDR target allocation failed");
    }
    QRhiTextureRenderTargetDescription opaque;
    opaque.setColorAttachments({QRhiColorAttachment(hdr.get()),
                                QRhiColorAttachment(linearDepth.get())});
    opaque.setDepthTexture(depth.get());
    hdrTarget.reset(rhi->newTextureRenderTarget(opaque));
    hdrPass.reset(hdrTarget->newCompatibleRenderPassDescriptor());
    hdrTarget->setRenderPassDescriptor(hdrPass.get());
    QRhiTextureRenderTargetDescription transparent(
        QRhiColorAttachment(hdr.get()));
    transparent.setDepthTexture(depth.get());
    transparentTarget.reset(rhi->newTextureRenderTarget(
        transparent,
        QRhiTextureRenderTarget::PreserveColorContents |
            QRhiTextureRenderTarget::PreserveDepthStencilContents));
    transparentPass.reset(
        transparentTarget->newCompatibleRenderPassDescriptor());
    transparentTarget->setRenderPassDescriptor(transparentPass.get());
    if (!hdrTarget->create() || !transparentTarget->create()) {
      throw Error("render", "Scene HDR framebuffer allocation failed");
    }
    size = dimensions;
  }
  QRhiShaderResourceBindings *binding(const Draw &draw) {
    const auto &b = draw.baseSampler, &n = draw.normalSampler;
    const std::string key =
        draw.base + '|' + draw.normal + '|' + std::to_string(b.wrapS) + ':' +
        std::to_string(b.wrapT) + ':' + std::to_string(b.magFilter) + ':' +
        std::to_string(b.minFilter) + '|' + std::to_string(n.wrapS) + ':' +
        std::to_string(n.wrapT) + ':' + std::to_string(n.magFilter) + ':' +
        std::to_string(n.minFilter);
    auto found = bindings.find(key);
    if (found != bindings.end()) {
      return found->second.get();
    }
    auto value = std::unique_ptr<QRhiShaderResourceBindings>(
        rhi->newShaderResourceBindings());
    value->setBindings(
        {QRhiShaderResourceBinding::uniformBuffer(
             0,
             QRhiShaderResourceBinding::VertexStage |
                 QRhiShaderResourceBinding::FragmentStage,
             sceneBuffer.get()),
         QRhiShaderResourceBinding::uniformBufferWithDynamicOffset(
             1,
             QRhiShaderResourceBinding::VertexStage |
                 QRhiShaderResourceBinding::FragmentStage,
             materialBuffer.get(), sizeof(MaterialUniform)),
         QRhiShaderResourceBinding::sampledTexture(
             2, QRhiShaderResourceBinding::FragmentStage,
             textures.at(draw.base).value.get(), sampler(draw.baseSampler)),
         QRhiShaderResourceBinding::sampledTexture(
             3, QRhiShaderResourceBinding::FragmentStage,
             textures.at(draw.normal).value.get(), sampler(draw.normalSampler)),
         QRhiShaderResourceBinding::sampledTexture(
             4, QRhiShaderResourceBinding::FragmentStage,
             directionalDepth.get(), shadowSampler.get()),
         QRhiShaderResourceBinding::sampledTexture(
             5, QRhiShaderResourceBinding::FragmentStage, pointDepth.get(),
             shadowSampler.get()),
         QRhiShaderResourceBinding::sampledTexture(
             6, QRhiShaderResourceBinding::FragmentStage,
             (sky.environmentTexture() ? sky.environmentTexture()
                                       : textures.at("white").value.get()),
             sky.sampler()),
         QRhiShaderResourceBinding::sampledTexture(
             7, QRhiShaderResourceBinding::FragmentStage,
             (sky.environmentTexture() ? sky.environmentTexture()
                                       : textures.at("white").value.get()),
             sky.sampler()),
         QRhiShaderResourceBinding::sampledTexture(
             9, QRhiShaderResourceBinding::FragmentStage, dfg.get(),
             clampSampler.get())});
    if (!value->create()) {
      throw Error("render", "Scene material bindings creation failed");
    }
    auto *result = value.get();
    bindings.emplace(key, std::move(value));
    return result;
  }
  QRhiGraphicsPipeline *pipeline(const Draw &draw, bool transparent) {
    int key = (transparent ? 1 : 0) | (draw.material.flags[2] > .5F ? 2 : 0) |
              (draw.decal ? 4 : 0) | (draw.depthWrite ? 8 : 0) |
              (draw.additive ? 16 : 0) | (draw.mirrored ? 32 : 0);
    auto found = pipelines.find(key);
    if (found != pipelines.end()) {
      return found->second.get();
    }
    auto value =
        std::unique_ptr<QRhiGraphicsPipeline>(rhi->newGraphicsPipeline());
    value->setTopology(QRhiGraphicsPipeline::Triangles);
    value->setFrontFace(draw.mirrored ? QRhiGraphicsPipeline::CW
                                      : QRhiGraphicsPipeline::CCW);
    value->setDepthTest(true);
    value->setDepthWrite(draw.depthWrite && !draw.decal);
    value->setDepthOp(QRhiGraphicsPipeline::LessOrEqual);
    value->setCullMode(draw.material.flags[2] > .5F
                           ? QRhiGraphicsPipeline::None
                           : QRhiGraphicsPipeline::Back);
    if (draw.decal) {
      value->setDepthBias(-2);
      value->setSlopeScaledDepthBias(-2);
    }
    value->setShaderStages(
        {{QRhiShaderStage::Vertex, shader(":/game/shaders/pbr.vert.qsb")},
         {QRhiShaderStage::Fragment,
          shader(transparent ? ":/game/shaders/pbr_transparent.frag.qsb"
                             : ":/game/shaders/pbr.frag.qsb")}});
    QRhiVertexInputLayout layout;
    layout.setBindings({{sizeof(Vertex3D)}});
    layout.setAttributes(
        {{0, 0, QRhiVertexInputAttribute::Float3, 0},
         {0, 1, QRhiVertexInputAttribute::Float3, 3 * sizeof(float)},
         {0, 2, QRhiVertexInputAttribute::Float2, 6 * sizeof(float)},
         {0, 3, QRhiVertexInputAttribute::Float4, 8 * sizeof(float)}});
    value->setVertexInputLayout(layout);
    value->setShaderResourceBindings(binding(draw));
    value->setRenderPassDescriptor(transparent ? transparentPass.get()
                                               : hdrPass.get());
    QRhiGraphicsPipeline::TargetBlend colorBlend;
    colorBlend.enable = transparent || draw.decal;
    colorBlend.srcColor = QRhiGraphicsPipeline::SrcAlpha;
    colorBlend.dstColor = draw.additive
                              ? QRhiGraphicsPipeline::One
                              : QRhiGraphicsPipeline::OneMinusSrcAlpha;
    colorBlend.srcAlpha = QRhiGraphicsPipeline::One;
    colorBlend.dstAlpha = QRhiGraphicsPipeline::OneMinusSrcAlpha;
    if (transparent) {
      value->setTargetBlends({colorBlend});
    } else {
      QRhiGraphicsPipeline::TargetBlend depthBlend;
      depthBlend.colorWrite = draw.decal ? QRhiGraphicsPipeline::ColorMask{}
                                         : QRhiGraphicsPipeline::R;
      value->setTargetBlends({colorBlend, depthBlend});
    }
    if (!value->create()) {
      throw Error("render", "Scene PBR pipeline creation failed");
    }
    auto *result = value.get();
    pipelines.emplace(key, std::move(value));
    return result;
  }
  void draw(QRhiCommandBuffer *cb, Draw &value, bool transparent) {
    cb->setGraphicsPipeline(pipeline(value, transparent));
    cb->setViewport({0, 0, float(size.width()), float(size.height())});
    const QRhiCommandBuffer::DynamicOffset offset{
        1, quint32(value.uniform * materialStride)};
    cb->setShaderResources(binding(value), 1, &offset);
    const QRhiCommandBuffer::VertexInput input(value.mesh->vertices.get(), 0);
    cb->setVertexInput(0, 1, &input, value.mesh->indices.get(), 0,
                       QRhiCommandBuffer::IndexUInt32);
    if (value.mesh->indexCount) {
      cb->drawIndexed(value.mesh->indexCount);
    } else {
      cb->draw(value.mesh->vertexCount);
    }
  }
  void copy(QRhiCommandBuffer *cb, QRhiRenderTarget *output,
            QRhiTexture *source) {
    // Bindings change when the post-processing target chain changes.
    if (copiedTexture != source || !copyBindings || !hudBindings) {
      copyPipeline.reset();
      hudPipeline.reset();
      copyBindings.reset(rhi->newShaderResourceBindings());
      copyBindings->setBindings(
          {QRhiShaderResourceBinding::uniformBuffer(
               0,
               QRhiShaderResourceBinding::VertexStage |
                   QRhiShaderResourceBinding::FragmentStage,
               copyBuffer.get()),
           QRhiShaderResourceBinding::sampledTexture(
               1, QRhiShaderResourceBinding::FragmentStage, source,
               clampSampler.get())});
      hudBindings.reset(rhi->newShaderResourceBindings());
      hudBindings->setBindings(
          {QRhiShaderResourceBinding::uniformBuffer(
               0,
               QRhiShaderResourceBinding::VertexStage |
                   QRhiShaderResourceBinding::FragmentStage,
               copyBuffer.get()),
           QRhiShaderResourceBinding::sampledTexture(
               1, QRhiShaderResourceBinding::FragmentStage, hud.get(),
               clampSampler.get())});
      if (!copyBindings->create() || !hudBindings->create()) {
        throw Error("render", "Scene final bindings creation failed");
      }
      copiedTexture = source;
    }
    const auto create = [&](std::unique_ptr<QRhiGraphicsPipeline> &p,
                            QRhiShaderResourceBindings *bindings, bool blend) {
      if (p) {
        return;
      }
      p.reset(rhi->newGraphicsPipeline());
      p->setTopology(QRhiGraphicsPipeline::Triangles);
      p->setSampleCount(output->sampleCount());
      p->setShaderStages(
          {{QRhiShaderStage::Vertex,
            shader(":/game/shaders/scene_copy.vert.qsb")},
           {QRhiShaderStage::Fragment,
            shader(blend ? ":/game/shaders/scene_hud.frag.qsb"
                         : ":/game/shaders/scene_copy.frag.qsb")}});
      p->setShaderResourceBindings(bindings);
      p->setRenderPassDescriptor(output->renderPassDescriptor());
      QRhiGraphicsPipeline::TargetBlend b;
      b.enable = blend;
      b.srcColor = QRhiGraphicsPipeline::One;
      b.dstColor = QRhiGraphicsPipeline::OneMinusSrcAlpha;
      b.srcAlpha = QRhiGraphicsPipeline::One;
      b.dstAlpha = QRhiGraphicsPipeline::OneMinusSrcAlpha;
      p->setTargetBlends({b});
      if (!p->create()) {
        throw Error("render", "Scene final pipeline creation failed");
      }
    };
    create(copyPipeline, copyBindings.get(), false);
    create(hudPipeline, hudBindings.get(), true);
    cb->beginPass(output, Qt::black, {1, 0});
    cb->setGraphicsPipeline(copyPipeline.get());
    cb->setViewport({0, 0, float(size.width()), float(size.height())});
    cb->setShaderResources(copyBindings.get());
    cb->draw(3);
    cb->setGraphicsPipeline(hudPipeline.get());
    cb->setViewport({0, 0, float(size.width()), float(size.height())});
    cb->setShaderResources(hudBindings.get());
    cb->draw(3);
    cb->endPass();
  }
};
Scene3D::Scene3D() : state_(std::make_unique<State>()) {}
Scene3D::~Scene3D() = default;
Json Scene3D::render(QRhi *rhi, QRhiCommandBuffer *cb, QRhiRenderTarget *output,
                     const Json &document, const Json &frame,
                     const std::shared_ptr<const SceneModels3D> &models,
                     const std::shared_ptr<const RenderImages> &images,
                     const std::shared_ptr<const RenderFonts> &fonts) {
  if (state_->rhi != rhi || state_->outputSamples != output->sampleCount()) {
    state_ = std::make_unique<State>();
    state_->initialize(rhi, output);
  }
  auto &s = *state_;
  s.resize(output->pixelSize());
  if (s.models != models || s.images != images) {
    s.bindings.clear();
    s.pipelines.clear();
    s.meshes.clear();
    s.textures.clear();
    s.imageKeys.clear();
    s.meshBytes = 0;
    s.texturePixels = 0;
    s.textureBytes = 0;
    s.defaultsUploaded = false;
    s.models = models;
    s.images = images;
    s.decals.clear();
  }
  auto *update = rhi->nextResourceUpdateBatch();
  QImage white(1, 1, QImage::Format_RGBA8888);
  white.fill(Qt::white);
  s.texture("white", white, false, update);
  QImage normal(1, 1, QImage::Format_RGBA8888);
  normal.fill(QColor(128, 128, 255));
  s.texture("normal", normal, false, update);
  if (!s.defaultsUploaded) {
    QFile lut(":/game/native-dfg.rg16f");
    if (!lut.open(QIODevice::ReadOnly) || lut.size() != 1024) {
      throw Error("render", "DFG material integration lookup is unavailable");
    }
    const auto rg = lut.readAll();
    QFile provenance(":/game/native-dfg.json");
    if (!provenance.open(QIODevice::ReadOnly)) {
      throw Error("render",
                  "DFG material integration provenance is unavailable");
    }
    const auto metadata = Json::parse(provenance.readAll().toStdString());
    const std::vector<std::uint8_t> lutBytes(rg.begin(), rg.end());
    if (metadata.at("sha256") != assetDigest(lutBytes)) {
      throw Error("render", "DFG material integration digest mismatch");
    }
    QByteArray rgba(2048, 0);
    for (int pixel = 0; pixel < 256; ++pixel) {
      std::memcpy(rgba.data() + pixel * 8, rg.constData() + pixel * 4, 4);
      rgba[pixel * 8 + 7] = char(0x3c);
    }
    update->uploadTexture(
        s.dfg.get(),
        QRhiTextureUploadDescription({QRhiTextureUploadEntry(
            0, 0, QRhiTextureSubresourceUploadDescription(rgba))}));
    s.defaultsUploaded = true;
  }
  const auto env = frame.at("environment");
  const auto camera =
      frame.value("camera", document.value("camera", Json::object()));
  const auto eye = vector(camera.value("position", Json::array({6, 5, 8})));
  QMatrix4x4 view, projection;
  view.lookAt(eye, vector(camera.value("target", Json::array({0, 0, 0}))),
              vector(camera.value("up", Json::array({0, 1, 0})), {0, 1, 0}));
  const float near = camera.value("near", .05F),
              far = camera.value("far", 10000.F);
  projection.perspective(camera.value("fov", 60.F),
                         float(s.size.width()) / std::max(1, s.size.height()),
                         near, far);
  SceneUniform scene;
  scene.viewProjection = rhi->clipSpaceCorrMatrix() * projection * view;
  scene.view = view;
  scene.inverseViewProjection = scene.viewProjection.inverted();
  scene.cameraNear = {eye.x(), eye.y(), eye.z(), near};
  const auto destination =
      vector(camera.value("target", Json::array({0, 0, 0})));
  scene.targetFar = {destination.x(), destination.y(), destination.z(), far};
  auto ambient = color(env.at("ambient").at("color"));
  const float ambientIntensity = env.at("ambient").at("intensity");
  scene.ambientCount = {ambient[0] * ambientIntensity,
                        ambient[1] * ambientIntensity,
                        ambient[2] * ambientIntensity, 0};
  scene.backend = {rhi->isClipDepthZeroToOne() ? 1.F : 0.F,
                   rhi->isYUpInFramebuffer() ? 1.F : -1.F,
                   float(s.size.width()), float(s.size.height())};
  if (env.contains("fog")) {
    const auto &fog = env.at("fog");
    scene.fogColorEnabled = color(fog.at("color"), 1);
    scene.fogSettings = {fog.at("density"), fog.value("baseHeight", 0.F),
                         fog.value("heightFalloff", 1.F),
                         fog.value("maxOpacity", 1.F)};
  }
  DecalTransforms3D world;
  std::map<std::string, const Json *> entities;
  std::set<std::string> resolved;
  const auto &committedWorld = frame.value("worldTransforms", Json::object());
  for (const auto &entity : frame.at("entities")) {
    const auto id = entity.at("id").get<std::string>();
    entities.emplace(id, &entity);
    if (committedWorld.contains(id)) {
      world.emplace(id, matrix(Json{{"transform", committedWorld.at(id)}}));
      resolved.insert(id);
    } else {
      world.emplace(id, matrix(entity));
    }
  }
  // Committed world poses are authoritative. Authored editor previews may
  // still contain local parents; resolve each ancestor once, without recursion.
  for (const auto &entity : frame.at("entities")) {
    auto id = entity.at("id").get<std::string>();
    if (resolved.contains(id)) {
      continue;
    }
    std::vector<std::string> chain;
    const Json *cursor = &entity;
    while (!resolved.contains(id)) {
      if (!cursor->contains("parentId")) {
        resolved.insert(id);
        break;
      }
      if (chain.size() >= entities.size()) {
        throw Error("render", "Scene visual parent cycle");
      }
      chain.push_back(id);
      id = cursor->at("parentId").get<std::string>();
      const auto found = entities.find(id);
      if (found == entities.end()) {
        throw Error("render", "Scene visual parent unavailable");
      }
      cursor = found->second;
    }
    auto composed = world.at(id);
    for (auto ancestor = chain.rbegin(); ancestor != chain.rend(); ++ancestor) {
      composed *= matrix(*entities.at(*ancestor));
      world.at(*ancestor) = composed;
      resolved.insert(*ancestor);
    }
  }
  const auto &authoredOrder = frame.value("authoredOrder", Json::object());
  std::vector<std::pair<std::uint64_t, const Json *>> order;
  order.reserve(entities.size());
  for (const auto &entity : frame.at("entities")) {
    order.emplace_back(authoredOrder.value(entity.at("id").get<std::string>(),
                                           std::uint64_t(-1)),
                       &entity);
  }
  std::stable_sort(
      order.begin(), order.end(),
      [](const auto &a, const auto &b) { return a.first < b.first; });
  std::vector<const Json *> orderedEntities;
  orderedEntities.reserve(order.size());
  for (const auto &entry : order) {
    orderedEntities.push_back(entry.second);
  }
  // Match gameSkySunDirection3D: first matching directional light, then
  // the fixed default when no directional source is available.
  QVector3D sunDirection(0, .5F, -1);
  const auto skySettings = env.value("sky", Json::object());
  for (const auto *entry : orderedEntities) {
    if (!entry->contains("light3d") ||
        entry->at("light3d").at("kind") != "directional") {
      continue;
    }
    const auto id = entry->at("id").get<std::string>();
    if (skySettings.contains("sunEntityId") &&
        skySettings.at("sunEntityId") != id) {
      continue;
    }
    sunDirection = world.at(id).mapVector({0, 0, 1}).normalized();
    break;
  }
  s.sky.prepare(rhi, cb, env, sunDirection);
  if (s.skyTexture != s.sky.environmentTexture()) {
    s.pipelines.clear();
    s.bindings.clear();
    s.skyTexture = s.sky.environmentTexture();
  }
  scene.environment = {s.skyTexture ? 1.F : 0.F, s.sky.intensity(), 8, 0};
  SkyCamera3D skyCamera;
  skyCamera.inverseViewProjection = scene.inverseViewProjection.matrix();
  skyCamera.cameraPosition = eye;
  skyCamera.pixelSize = s.size;
  skyCamera.far = far;
  s.sky.prepareBackground(update, s.hdrPass.get(), skyCamera);
  s.draws.clear();
  s.dynamicMeshes.clear();
  const auto append = [&](State::Mesh &mesh, MaterialUniform m,
                          const ModelMaterial &source, const std::string &asset,
                          bool cast, bool decal = false) {
    if (s.draws.size() >= MaxDraws) {
      throw Error("resource_limit", "Scene draw budget exceeded");
    }
    State::Draw draw;
    draw.mesh = &mesh;
    draw.material = std::move(m);
    draw.cast = cast;
    draw.decal = decal;
    draw.depthWrite = source.alphaMode != "BLEND" && !decal;
    draw.mirrored = draw.material.model.matrix().determinant() < 0;
    draw.base = "white";
    draw.normal = "normal";
    draw.baseSampler = source.baseColorSampler;
    draw.normalSampler = source.normalSampler;
    if (source.image >= 0) {
      const auto &image = models->at(asset)->images.at(source.image);
      if (!s.imageKeys.contains(&image)) {
        s.imageKeys[&image] = assetDigest(image.bytes);
      }
      draw.base = s.imageKeys.at(&image) + ":srgb";
      if (!s.textures.contains(draw.base)) {
        s.texture(draw.base, decode(models->at(asset)->images.at(source.image)),
                  true, update);
      }
    }
    if (source.normalImage >= 0) {
      const auto &image = models->at(asset)->images.at(source.normalImage);
      if (!s.imageKeys.contains(&image)) {
        s.imageKeys[&image] = assetDigest(image.bytes);
      }
      draw.normal = s.imageKeys.at(&image) + ":linear";
      if (!s.textures.contains(draw.normal)) {
        s.texture(draw.normal,
                  decode(models->at(asset)->images.at(source.normalImage)),
                  false, update);
      }
    }
    draw.depth = -view.map(draw.material.model.map(mesh.center)).z();
    draw.uniform = int(s.draws.size());
    s.draws.push_back(std::move(draw));
  };
  for (const auto *entry : orderedEntities) {
    const auto &entity = *entry;
    if (entity.contains("light3d")) {
      const auto index = int(scene.ambientCount[3]);
      if (index >= MaxLights) {
        throw Error("resource_limit", "Scene light budget exceeded");
      }
      const auto &light = entity.at("light3d");
      const auto m = world.at(entity.at("id").get<std::string>());
      const auto position = m.map(QVector3D());
      const auto direction = m.mapVector({0, 0, 1}).normalized();
      scene.lightPositionRange[index] = {
          position.x(), position.y(), position.z(),
          light.at("kind") == "directional" ? -1.F
                                            : light.at("range").get<float>()};
      auto c = color(light.at("color"));
      scene.lightColorIntensity[index] = {c[0], c[1], c[2],
                                          light.at("intensity")};
      scene.lightDirectionDecay[index] = {direction.x(), direction.y(),
                                          direction.z(),
                                          light.value("decay", 2.F)};
      scene.lightShadows[index] = {-1, 0, light.value("shadowNormalBias", 0.F),
                                   light.value("shadowBias", 0.F)};
      scene.ambientCount[3] += 1;
    }
    if (!entity.contains("visual")) {
      continue;
    }
    const auto &visual = entity.at("visual");
    const auto transform = world.at(entity.at("id").get<std::string>());
    if (visual.at("kind") == "primitive") {
      const auto shape = visual.value("shape", std::string("box"));
      const auto data = primitive(shape);
      auto &gpu = s.mesh("primitive:" + shape, data, {}, update);
      auto m = transform;
      m.scale(vector(visual.value("size", Json::array({1, 1, 1})), {1, 1, 1}));
      const auto mat = primitiveMaterial(visual);
      append(gpu, material(mat, m, visual.value("receiveShadow", true)), mat,
             "", visual.value("castShadow", true));
      s.draws.back().depthWrite = true;
    } else if (visual.at("kind") == "model") {
      const auto id = visual.at("assetId").get<std::string>();
      if (!models || !models->contains(id)) {
        throw Error("asset", "Scene model is not prepared: " + id);
      }
      const auto &model = *models->at(id);
      const auto pose = sampleModel(
          model, visual.value("animation", std::size_t(0)),
          visual.value("animationTime", frame.value("tick", 0.0) / 60),
          visual.value("animationLoop", true));
      const auto selectedNodes = selectedModelNodes(model);
      for (std::size_t nodeIndex = 0; nodeIndex < model.nodes.size();
           ++nodeIndex) {
        const auto &node = model.nodes[nodeIndex];
        if (!selectedNodes[nodeIndex] || node.mesh < 0) {
          continue;
        }
        const auto nodeMatrix = matrix(pose.world.at(nodeIndex));
        const auto &primitives = model.meshes.at(node.mesh);
        for (std::size_t i = 0; i < primitives.size(); ++i) {
          const auto &source = primitives[i];
          const auto key =
              id + ":" + std::to_string(node.mesh) + ":" + std::to_string(i);
          State::Mesh *gpu = nullptr;
          if (node.skin < 0) {
            if (s.meshes.contains(key)) {
              gpu = &s.meshes.at(key);
            } else {
              std::vector<Vertex3D> vertices;
              vertices.reserve(source.vertices.size());
              for (const auto &v : source.vertices) {
                vertices.push_back({v.position[0], v.position[1], v.position[2],
                                    v.normal[0], v.normal[1], v.normal[2],
                                    v.uv[0], v.uv[1], v.color[0], v.color[1], v.color[2], v.color[3]});
              }
              gpu = &s.mesh(key, vertices, source.indices, update);
            }
          }
          if (node.skin >= 0) {
            std::vector<Vertex3D> vertices;
            vertices.reserve(source.vertices.size());
            for (const auto &v : source.vertices) {
              QVector3D position, normal;
              const QVector3D original(v.position[0], v.position[1],
                                       v.position[2]),
                  originalNormal(v.normal[0], v.normal[1], v.normal[2]);
              for (int joint = 0; joint < 4; ++joint) {
                if (v.weights[joint] <= 0) {
                  continue;
                }
                const auto transform =
                    matrix(pose.joints.at(node.skin).at(v.joints[joint]));
                position += transform.map(original) * v.weights[joint];
                normal += transform.inverted().transposed().mapVector(
                              originalNormal) *
                          v.weights[joint];
              }
              normal.normalize();
              vertices.push_back({position.x(), position.y(), position.z(),
                                  normal.x(), normal.y(), normal.z(), v.uv[0],
                                  v.uv[1], v.color[0], v.color[1], v.color[2], v.color[3]});
            }
            gpu = &s.dynamicMesh(
                "dynamic:skin:" + entity.at("id").get<std::string>() + ":" +
                    std::to_string(nodeIndex) + ":" + std::to_string(i),
                vertices, source.indices, update);
          }
          ModelMaterial mat;
          if (source.material >= 0) {
            mat = model.materials.at(source.material);
          }
          append(*gpu,
                 material(mat,
                          node.skin >= 0 ? transform : transform * nodeMatrix,
                          visual.value("receiveShadow", true)),
                 mat, id, visual.value("castShadow", true));
        }
      }
    }
  }
  // Projected decals share the scene's PBR material and shadow response.
  const auto &decals = s.decals.prepare(frame, models, world, &document);
  for (const auto &decal : decals) {
    if (!images || !images->contains(decal.assetId)) {
      throw Error("asset",
                  "Scene decal image is not prepared: " + decal.assetId);
    }
    const auto key = "dynamic:decal:" + decal.entityId;
    std::vector<Vertex3D> vertices;
    vertices.reserve(decal.vertices->size());
    for (const auto &v : *decal.vertices) {
      vertices.push_back({v.x, v.y, v.z, v.nx, v.ny, v.nz, v.u, 1 - v.v});
    }
    if (vertices.empty()) {
      continue;
    }
    auto &mesh = s.dynamicMesh(key, vertices, {}, update);
    ModelMaterial mat;
    mat.metallic = 0;
    mat.roughness = 1;
    mat.color = {1, 1, 1, decal.opacity};
    mat.alphaMode = "BLEND";
    mat.doubleSided = false;
    mat.baseColorSampler.wrapS = 33071;
    mat.baseColorSampler.wrapT = 33071;
    append(mesh, material(mat, QMatrix4x4(), true), mat, "", false, true);
    auto &draw = s.draws.back();
    draw.base = "image:" + decal.assetId + ":srgb";
    s.texture(
        draw.base,
        images->at(decal.assetId).convertToFormat(QImage::Format_RGBA8888),
        true, update);
  }
  ParticleCamera3D particleCamera;
  particleCamera.viewProjection = scene.viewProjection.matrix();
  particleCamera.view = view;
  const auto inverseView = view.inverted();
  particleCamera.right = inverseView.mapVector({1, 0, 0});
  particleCamera.up = inverseView.mapVector({0, 1, 0});
  particleCamera.position = eye;
  particleCamera.pixelSize = s.size;
  particleCamera.linearDepth = s.linearDepth.get();
  particleCamera.depthSampler = s.clampSampler.get();
  particleCamera.fogColor = {scene.fogColorEnabled[0], scene.fogColorEnabled[1],
                             scene.fogColorEnabled[2],
                             scene.fogColorEnabled[3]};
  particleCamera.fogSettings = {scene.fogSettings[0], scene.fogSettings[1],
                                scene.fogSettings[2], scene.fogSettings[3]};
  for (const auto &draw : s.draws) {
    if (draw.material.surface[3] > 1.5F && !draw.decal) {
      particleCamera.transparentDepths.push_back(draw.depth);
    }
  }
  s.effects.prepare(rhi, update, s.transparentPass.get(), frame,
                    particleCamera);
  // One emitter may occupy multiple transparency runs. Keep every run
  // in a distinct buffer until all queued draws have completed.
  std::size_t particleMeshSlot = 0;
  for (const auto &batch : s.effects.meshBatches()) {
    if (batch.vertices.empty()) {
      continue;
    }
    std::vector<Vertex3D> vertices;
    vertices.reserve(batch.vertices.size());
    for (const auto &v : batch.vertices) {
      vertices.push_back(
          {v.x, v.y, v.z, v.nx, v.ny, v.nz, 0, 0, v.r, v.g, v.b, v.a});
    }
    auto &mesh =
        s.dynamicMesh("dynamic:particle:" + std::to_string(particleMeshSlot++),
                      vertices, {}, update);
    ModelMaterial source;
    source.color = {1, 1, 1, 1};
    source.roughness = .8F;
    source.metallic = 0;
    source.alphaMode = "BLEND";
    source.doubleSided = false;
    auto m = material(source, QMatrix4x4(), false);
    m.flags[3] = batch.unlit ? 1.F : 0.F;
    append(mesh, m, source, "", false);
    auto &draw = s.draws.back();
    draw.depth = batch.depth;
    draw.additive = batch.additive;
  }
  for (auto entry = s.meshes.begin(); entry != s.meshes.end();) {
    if (entry->first.starts_with("dynamic:") &&
        !s.dynamicMeshes.contains(entry->first)) {
      s.meshBytes -= entry->second.bytes;
      entry = s.meshes.erase(entry);
    } else {
      ++entry;
    }
  }
  s.planShadows(scene, env, orderedEntities, view, projection, world, update);
  QByteArray materials(int(s.draws.size()) * s.materialStride, 0);
  for (const auto &draw : s.draws) {
    std::memcpy(materials.data() + draw.uniform * s.materialStride,
                &draw.material, sizeof(MaterialUniform));
  }
  if (!materials.isEmpty()) {
    update->updateDynamicBuffer(s.materialBuffer.get(), 0, materials.size(),
                                materials.constData());
  }
  update->updateDynamicBuffer(s.sceneBuffer.get(), 0, sizeof(scene), &scene);
  CopyUniform copy;
  copy.correction = rhi->clipSpaceCorrMatrix();
  copy.parameters = {rhi->isYUpInFramebuffer() ? 1.F : 0.F, 0, 0, 0};
  update->updateDynamicBuffer(s.copyBuffer.get(), 0, sizeof(copy), &copy);
  update->uploadTexture(s.hud.get(),
                        paintHud3D(document, frame, s.size, fonts));
  const auto background = color(env.value("background", Json("#202838")));
  const auto shadowStats = s.renderShadows(cb, update);
  cb->beginPass(
      s.hdrTarget.get(),
      QColor::fromRgbF(background[0], background[1], background[2], 1), {1, 0},
      update);
  s.sky.drawBackground(cb);
  std::size_t triangles = 0;
  for (auto &draw : s.draws) {
    if (draw.material.surface[3] < 1.5F && !draw.decal) {
      s.draw(cb, draw, false);
      triangles += (draw.mesh->indexCount ? draw.mesh->indexCount
                                          : draw.mesh->vertexCount) /
                   3;
    }
  }
  for (auto &draw : s.draws) {
    if (draw.decal) {
      s.draw(cb, draw, false);
      triangles += draw.mesh->vertexCount / 3;
    }
  }
  cb->endPass();
  struct TransparentItem {
    float depth;
    State::Draw *draw;
    std::size_t particle;
  };
  std::vector<TransparentItem> transparent;
  for (auto &draw : s.draws) {
    if (draw.material.surface[3] > 1.5F && !draw.decal) {
      transparent.push_back({draw.depth, &draw, 0});
    }
  }
  for (std::size_t i = 0; i < s.effects.batches().size(); ++i) {
    transparent.push_back({s.effects.batches()[i].depth, nullptr, i});
  }
  std::stable_sort(
      transparent.begin(), transparent.end(),
      [](const auto &a, const auto &b) { return a.depth > b.depth; });
  if (!transparent.empty()) {
    cb->beginPass(s.transparentTarget.get(), Qt::black, {1, 0});
    for (const auto &item : transparent) {
      if (item.draw) {
        s.draw(cb, *item.draw, true);
        triangles +=
            (item.draw->mesh->indexCount ? item.draw->mesh->indexCount
                                         : item.draw->mesh->vertexCount) /
            3;
      } else {
        s.effects.drawBatch(cb, item.particle);
        triangles += s.effects.batches()[item.particle].count / 3;
      }
    }
    cb->endPass();
  }
  auto *final = s.post.render(rhi, cb, s.hdr.get(), s.size, env);
  s.copy(cb, output, final);
  auto report = s.post.report();
  report["sky"] = s.sky.report();
  const auto shadowBytes = [](const auto &texture) {
    return std::size_t(texture->pixelSize().width()) *
           texture->pixelSize().height() * std::max(1, texture->arraySize()) *
           4;
  };
  report["shadowTextureBytes"] =
      shadowBytes(s.directionalDepth) + shadowBytes(s.pointDepth);
  report["scenePipelineCount"] = s.pipelines.size() + s.shadowPipelines.size();
  report["sceneMeshCount"] = s.meshes.size();
  report["sceneImageTextureCount"] = s.textures.size();
  report.update(
      {{"dimension", "3d"},
       {"tick", frame.value("tick", 0ULL)},
       {"camera", camera},
       {"vertices", triangles * 3},
       {"triangles", triangles},
       {"drawCalls", s.draws.size() + s.effects.batches().size()},
       {"particleBytes", s.effects.vertexBytes()},
       {"decalDiagnostics", s.decals.diagnostics()},
       {"meshBytes", s.meshBytes},
       {"texturePixels", s.texturePixels},
       {"imageGpuBytes", s.textureBytes},
       {"imageGpuByteBudget", TextureByteBudget},
       {"sceneTriangles", triangles},
       {"shadowTriangles", shadowStats.triangles},
       {"sceneDrawCalls", s.draws.size() + s.effects.batches().size()},
       {"shadowDrawCalls", shadowStats.drawCalls},
       {"fullscreenDrawCalls", report.at("passes").get<std::size_t>() + 3},
       {"totalDrawCalls", s.draws.size() + s.effects.batches().size() +
                              shadowStats.drawCalls +
                              report.at("passes").get<std::size_t>() + 3},
       {"totalTriangles", triangles + shadowStats.triangles +
                              report.at("passes").get<std::size_t>() + 3},
       {"geometryCountScope", "scene and shadow geometry; fullscreen adds "
                              "postFX, sky, final copy and HUD"},
       {"shadowLayers", s.shadowMatrices.size()},
       {"lights", int(scene.ambientCount[3])},
       {"width", s.size.width()},
       {"height", s.size.height()},
       {"pipeline", "linear-hdr-pbr"}});
  return report;
}
} // namespace nodetool::game
