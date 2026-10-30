#include "Effects3D.h"
#include <QFile>
#include <QVector2D>
#include <algorithm>
#include <array>
#include <cmath>
namespace nodetool::game {
namespace {
constexpr std::size_t MaxParticles = 8192, MaxVertices = MaxParticles * 6;
using Vertex = ParticleVertex3D;
float linear(double value) {
  return static_cast<float>(
      value <= .04045 ? value / 12.92 : std::pow((value + .055) / 1.055, 2.4));
}
QVector3D vector(const Json &value) {
  return {value.at(0).get<float>(), value.at(1).get<float>(),
          value.at(2).get<float>()};
}
QShader shader(const char *path) {
  QFile file(QString::fromUtf8(path));
  if (!file.open(QIODevice::ReadOnly)) {
    throw Error("render", "Particle shader unavailable");
  }
  auto result = QShader::fromSerialized(file.readAll());
  if (!result.isValid()) {
    throw Error("render", "Invalid particle shader");
  }
  return result;
}
struct Sample {
  const Json *value;
  float depth;
};
} // namespace
struct Effects3D::State {
  QRhi *rhi = nullptr;
  QRhiTexture *depth = nullptr;
  QRhiSampler *sampler = nullptr;
  QRhiRenderPassDescriptor *pass = nullptr;
  std::unique_ptr<QRhiBuffer> vertices, uniforms;
  std::unique_ptr<QRhiShaderResourceBindings> bindings;
  std::array<std::unique_ptr<QRhiGraphicsPipeline>, 2> pipelines;
  std::vector<Vertex> data;
  std::vector<ParticleBatch3D> draws;
  std::vector<MeshParticleBatch3D> meshes;
  QSize size;
  bool cached = false;
  std::uint64_t tick = 0, generation = 0;
  std::string scene;
  ParticleCamera3D previousCamera;
  QRhiRenderPassDescriptor *cachedPass = nullptr;
};
Effects3D::Effects3D() : state_(std::make_unique<State>()) {}
Effects3D::~Effects3D() = default;
void Effects3D::prepareGeometry(const Json &frame,
                                const ParticleCamera3D &camera) {
  auto &s = *state_;
  s.data.clear();
  s.draws.clear();
  s.meshes.clear();
  s.size = camera.pixelSize;
  const auto samples = frame.value("particles", Json::array());
  if (samples.size() > MaxParticles) {
    throw Error("resource_limit", "Particle draw budget exceeded");
  }
  std::vector<Sample> sorted;
  sorted.reserve(samples.size());
  for (const auto &p : samples) {
    if (p.at("size").get<double>() <= 0 || p.at("opacity").get<double>() <= 0) {
      continue;
    }
    const auto position = vector(p.at("position"));
    const auto view = camera.view * QVector4D(position, 1);
    sorted.push_back({&p, -view.z()});
  }
  std::stable_sort(
      sorted.begin(), sorted.end(),
      [](const auto &a, const auto &b) { return a.depth > b.depth; });
  std::vector<float> boundaries = camera.transparentDepths;
  std::sort(boundaries.begin(), boundaries.end(), std::greater<float>());
  std::size_t boundary = 0;
  std::string previousKind;
  std::size_t previousBoundary = 0;
  bool previousMesh = false;
  const std::array<QVector2D, 6> corners = {
      QVector2D(-.5F, -.5F), QVector2D(.5F, -.5F), QVector2D(-.5F, .5F),
      QVector2D(.5F, -.5F),  QVector2D(.5F, .5F),  QVector2D(-.5F, .5F)};
  const std::array<QVector3D, 4> tetra = {
      QVector3D(1, 1, 1).normalized() * .5F,
      QVector3D(-1, -1, 1).normalized() * .5F,
      QVector3D(-1, 1, -1).normalized() * .5F,
      QVector3D(1, -1, -1).normalized() * .5F};
  constexpr std::array<std::array<int, 3>, 4> faces = {
      {{2, 1, 0}, {0, 3, 2}, {1, 3, 0}, {2, 3, 1}}};
  for (const auto &sample : sorted) {
    const auto &p = *sample.value;
    const auto position = vector(p.at("position")),
               velocity = vector(p.at("velocity"));
    const auto &render = p.at("render");
    const auto kind = render.at("kind").get<std::string>();
    const bool mesh = kind == "mesh",
               additive = p.value("blend", std::string("normal")) == "additive",
               unlit = p.value("unlit", false);
    while (boundary < boundaries.size() &&
           sample.depth <= boundaries[boundary]) {
      ++boundary;
    }
    const auto key = kind + (additive ? ":additive" : ":normal") +
                     (mesh && unlit ? ":unlit" : ":lit");
    const auto &tint = p.at("color");
    const float red = linear(tint.at(0)), green = linear(tint.at(1)),
                blue = linear(tint.at(2)),
                opacity = static_cast<float>(
                    std::min(1., p.at("opacity").get<double>())),
                size = p.at("size"), angle = p.at("rotation");
    if (mesh) {
      if (render.value("shape", std::string()) != "tetrahedron" ||
          render.value("align", std::string("world")) != "world") {
        throw Error("unsupported", "Unsupported particle mesh render style");
      }
      if (previousKind != key || !previousMesh ||
          previousBoundary != boundary) {
        s.meshes.push_back({{},
                            sample.depth,
                            additive,
                            unlit,
                            p.value("entityId", std::string()) + ":" +
                                p.value("emitterId", std::string())});
      }
      auto &vertices = s.meshes.back().vertices;
      const float c = std::cos(angle), sn = std::sin(angle);
      const auto rotateY = [&](const QVector3D &v) {
        return QVector3D(c * v.x() + sn * v.z(), v.y(),
                         -sn * v.x() + c * v.z());
      };
      for (const auto &face : faces) {
        const auto normal =
            rotateY(QVector3D::crossProduct(tetra[face[1]] - tetra[face[0]],
                                            tetra[face[2]] - tetra[face[0]])
                        .normalized());
        for (const auto index : face) {
          const auto point = position + rotateY(tetra[index]) * size;
          vertices.push_back({point.x(), point.y(), point.z(), normal.x(),
                              normal.y(), normal.z(), red, green, blue,
                              opacity});
        }
      }
    } else {
      if (kind != "billboard" && kind != "stretched") {
        throw Error("unsupported", "Unsupported particle quad render style");
      }
      if (previousKind != key || previousMesh || previousBoundary != boundary) {
        s.draws.push_back({static_cast<int>(s.data.size()), 0, sample.depth,
                           additive,
                           p.value("entityId", std::string()) + ":" +
                               p.value("emitterId", std::string())});
      }
      const auto viewVelocity = camera.view * QVector4D(velocity, 0);
      QVector2D along(viewVelocity.x(), viewVelocity.y());
      if (along.length() <= 1e-5F) {
        along = {0, 1};
      } else {
        along.normalize();
      }
      const QVector2D across(along.y(), -along.x());
      const float stretched = std::max(size * render.value("length", 1.F) +
                                           velocity.length() *
                                               render.value("speedScale", .1F),
                                       1e-4F),
                  c = std::cos(angle), sn = std::sin(angle);
      for (const auto &corner : corners) {
        const auto offset =
            kind == "stretched"
                ? across * corner.x() * size + along * corner.y() * stretched
                : QVector2D(c * corner.x() - sn * corner.y(),
                            sn * corner.x() + c * corner.y()) *
                      size;
        const auto point =
            position + camera.right * offset.x() + camera.up * offset.y();
        s.data.push_back({point.x(), point.y(), point.z(), corner.x() + .5F,
                          corner.y() + .5F, red, green, blue, opacity,
                          p.value("softness", 0.F)});
      }
      s.draws.back().count += 6;
    }
    previousKind = key;
    previousBoundary = boundary;
    previousMesh = mesh;
  }
}
void Effects3D::prepare(QRhi *rhi, QRhiResourceUpdateBatch *updates,
                        QRhiRenderPassDescriptor *pass, const Json &frame,
                        const ParticleCamera3D &camera) {
  if (state_->rhi != rhi) {
    state_ = std::make_unique<State>();
    state_->rhi = rhi;
  }
  auto &s = *state_;
  const auto tick = frame.value("tick", std::uint64_t{0}),
             generation = frame.value("generation", std::uint64_t{0});
  const auto scene = frame.value("sceneId", std::string());
  const auto &previous = s.previousCamera;
  if (s.cached && s.tick == tick && s.generation == generation &&
      s.scene == scene && s.cachedPass == pass &&
      previous.linearDepth == camera.linearDepth &&
      previous.depthSampler == camera.depthSampler &&
      previous.view == camera.view &&
      previous.viewProjection == camera.viewProjection &&
      previous.pixelSize == camera.pixelSize &&
      previous.position == camera.position && previous.right == camera.right &&
      previous.up == camera.up && previous.fogColor == camera.fogColor &&
      previous.fogSettings == camera.fogSettings &&
      previous.transparentDepths == camera.transparentDepths) {
    return;
  }
  prepareGeometry(frame, camera);
  const auto remember = [&] {
    s.cached = true;
    s.tick = tick;
    s.generation = generation;
    s.scene = scene;
    s.previousCamera = camera;
    s.cachedPass = pass;
  };
  if (s.data.empty()) {
    remember();
    return;
  }
  if (!camera.linearDepth || !camera.depthSampler) {
    throw Error("render", "Particle pass requires scene linear depth");
  }
  if (!s.vertices) {
    s.vertices.reset(
        rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::VertexBuffer,
                       static_cast<int>(MaxVertices * sizeof(Vertex))));
    s.uniforms.reset(rhi->newBuffer(
        QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, 48 * sizeof(float)));
    if (!s.vertices->create() || !s.uniforms->create()) {
      throw Error("render", "Particle buffer allocation failed");
    }
  }
  if (s.depth != camera.linearDepth || s.sampler != camera.depthSampler ||
      s.pass != pass) {
    for (auto &pipeline : s.pipelines) {
      pipeline.reset();
    }
    s.bindings.reset();
    s.depth = camera.linearDepth;
    s.sampler = camera.depthSampler;
    s.pass = pass;
  }
  if (!s.bindings) {
    s.bindings.reset(rhi->newShaderResourceBindings());
    s.bindings->setBindings(
        {QRhiShaderResourceBinding::uniformBuffer(
             0,
             QRhiShaderResourceBinding::VertexStage |
                 QRhiShaderResourceBinding::FragmentStage,
             s.uniforms.get()),
         QRhiShaderResourceBinding::sampledTexture(
             1, QRhiShaderResourceBinding::FragmentStage, s.depth, s.sampler)});
    if (!s.bindings->create()) {
      throw Error("render", "Particle bindings unavailable");
    }
    for (int i = 0; i < 2; ++i) {
      auto &pipeline = s.pipelines[i];
      pipeline.reset(rhi->newGraphicsPipeline());
      pipeline->setShaderStages(
          {{QRhiShaderStage::Vertex,
            shader(":/game/shaders/particles.vert.qsb")},
           {QRhiShaderStage::Fragment,
            shader(":/game/shaders/particles.frag.qsb")}});
      QRhiVertexInputLayout layout;
      layout.setBindings({{sizeof(Vertex)}});
      layout.setAttributes(
          {{0, 0, QRhiVertexInputAttribute::Float3, 0},
           {0, 1, QRhiVertexInputAttribute::Float2, 3 * sizeof(float)},
           {0, 2, QRhiVertexInputAttribute::Float4, 5 * sizeof(float)},
           {0, 3, QRhiVertexInputAttribute::Float, 9 * sizeof(float)}});
      pipeline->setVertexInputLayout(layout);
      pipeline->setTopology(QRhiGraphicsPipeline::Triangles);
      pipeline->setCullMode(QRhiGraphicsPipeline::None);
      pipeline->setDepthTest(true);
      pipeline->setDepthWrite(false);
      pipeline->setDepthOp(QRhiGraphicsPipeline::LessOrEqual);
      QRhiGraphicsPipeline::TargetBlend blend;
      blend.enable = true;
      blend.srcColor = QRhiGraphicsPipeline::One;
      blend.dstColor = i ? QRhiGraphicsPipeline::One
                         : QRhiGraphicsPipeline::OneMinusSrcAlpha;
      blend.srcAlpha = QRhiGraphicsPipeline::One;
      blend.dstAlpha = QRhiGraphicsPipeline::OneMinusSrcAlpha;
      pipeline->setTargetBlends({blend});
      pipeline->setShaderResourceBindings(s.bindings.get());
      pipeline->setRenderPassDescriptor(pass);
      if (!pipeline->create()) {
        throw Error("render", "Particle pipeline unavailable");
      }
    }
  }
  std::array<float, 48> uniforms{};
  std::copy_n(camera.viewProjection.constData(), 16, uniforms.begin());
  std::copy_n(camera.view.constData(), 16, uniforms.begin() + 16);
  uniforms[32] = static_cast<float>(camera.pixelSize.width());
  uniforms[33] = static_cast<float>(camera.pixelSize.height());
  uniforms[34] = 0;
  for (int i = 0; i < 4; ++i) {
    uniforms[36 + i] = camera.fogColor[i];
    uniforms[40 + i] = camera.fogSettings[i];
  }
  uniforms[44] = camera.position.x();
  uniforms[45] = camera.position.y();
  uniforms[46] = camera.position.z();
  updates->updateDynamicBuffer(s.uniforms.get(), 0, sizeof(uniforms),
                               uniforms.data());
  updates->updateDynamicBuffer(s.vertices.get(), 0,
                               static_cast<int>(s.data.size() * sizeof(Vertex)),
                               s.data.data());
  remember();
}
const std::vector<ParticleBatch3D> &Effects3D::batches() const {
  return state_->draws;
}
const std::vector<MeshParticleBatch3D> &Effects3D::meshBatches() const {
  return state_->meshes;
}
const std::vector<ParticleVertex3D> &Effects3D::quadVertices() const {
  return state_->data;
}
std::size_t Effects3D::vertexBytes() const {
  return state_->vertices ? MaxVertices * sizeof(Vertex) : 0;
}
void Effects3D::drawBatch(QRhiCommandBuffer *commands,
                          std::size_t index) const {
  const auto &s = *state_;
  const auto &batch = s.draws.at(index);
  commands->setGraphicsPipeline(s.pipelines[batch.additive ? 1 : 0].get());
  commands->setViewport({0, 0, static_cast<float>(s.size.width()),
                         static_cast<float>(s.size.height())});
  commands->setShaderResources(s.bindings.get());
  const QRhiCommandBuffer::VertexInput input(s.vertices.get(), 0);
  commands->setVertexInput(0, 1, &input);
  commands->draw(batch.count, 1, batch.first);
}
} // namespace nodetool::game
