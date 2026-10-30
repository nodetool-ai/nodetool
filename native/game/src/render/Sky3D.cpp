// Atmospheric model and CubeUV/GGX PMREM ported from three@0.185.1.
// Copyright 2010-2026 three.js authors. MIT license: Sky3D-LICENSE.txt.
#include "Sky3D.h"
#include <QColor>
#include <QFile>
#include <algorithm>
#include <array>
#include <cmath>
#include <numbers>
#include <optional>
#include <qfloat16.h>
#include <rhi/qrhi.h>
#include <vector>

namespace nodetool::game {
namespace {
constexpr int CubeSize = 256, AtlasWidth = 768, AtlasHeight = 1024, MaxMip = 8,
              LodCount = 11;
float linear(double value) {
  return value <= .04045 ? value / 12.92
                         : std::pow((value + .055) / 1.055, 2.4);
}
QVector3D parseColor(const std::string &value) {
  const QColor c(QString::fromStdString(value));
  if (!c.isValid()) {
    throw Error("validation_error", "Invalid sky color");
  }
  return {linear(c.red() / 255.), linear(c.green() / 255.),
          linear(c.blue() / 255.)};
}
QShader loadShader(const char *path) {
  QFile file(QString::fromUtf8(path));
  if (!file.open(QIODevice::ReadOnly)) {
    throw Error("render", "Sky shader unavailable: " + std::string(path));
  }
  const auto shader = QShader::fromSerialized(file.readAll());
  if (!shader.isValid()) {
    throw Error("render", "Invalid sky shader");
  }
  return shader;
}
QRhiTextureUploadDescription
uploadDescription(const std::vector<QRhiTextureUploadEntry> &entries) {
  QRhiTextureUploadDescription result;
  result.setEntries(entries.cbegin(), entries.cend());
  return result;
}
struct Settings {
  float turbidity = 10, rayleigh = 2;
  QVector3D ground, sun;
  bool operator==(const Settings &) const = default;
};
QVector3D radiance(const Settings &s, QVector3D direction) {
  direction.normalize();
  if (direction.y() < 0) {
    return s.ground;
  }
  const float pi = std::numbers::pi_v<float>,
              sunFade =
                  1 - std::clamp(1 - std::exp(s.sun.y() / 450000.F), 0.F, 1.F),
              rayleigh = s.rayleigh - (1 - sunFade);
  const QVector3D betaR =
      QVector3D(5.804542996261093E-6F, 1.3562911419845635E-5F,
                3.0265902468824876E-5F) *
      rayleigh;
  const QVector3D betaM =
      QVector3D(1.8399918514433978E14F, 2.7798023919660528E14F,
                4.0790479543861094E14F) *
      (.434F * (.2F * s.turbidity) * 10E-18F * .005F);
  const float sunE =
      1000.F *
      std::max(0.F,
               1 - std::exp(-(1.6110731556870734F -
                              std::acos(std::clamp(s.sun.y(), -1.F, 1.F))) /
                            1.5F));
  const float zenith = std::acos(std::max(0.F, direction.y())),
              inverse =
                  1 / (std::cos(zenith) +
                       .15F * std::pow(93.885F - zenith * 180 / pi, -1.253F));
  const float cosine = QVector3D::dotProduct(direction, s.sun),
              rPhase =
                  .05968310365946075F * (1 + std::pow(cosine * .5F + .5F, 2.F)),
              g = .8F,
              mPhase = .07957747154594767F * (1 - g * g) /
                       std::pow(1 - 2 * g * cosine + g * g, 1.5F),
              mix = std::clamp(std::pow(1 - s.sun.y(), 5.F), 0.F, 1.F);
  QVector3D result;
  for (int channel = 0; channel < 3; ++channel) {
    const float extinction = std::exp(
                    -(betaR[channel] * 8400.F + betaM[channel] * 1250.F) *
                    inverse),
                scatter = sunE *
                          (betaR[channel] * rPhase + betaM[channel] * mPhase) /
                          (betaR[channel] + betaM[channel]);
    float inside = std::pow(std::max(0.F, scatter * (1 - extinction)), 1.5F);
    inside *= 1 - mix + std::sqrt(std::max(0.F, scatter * extinction)) * mix;
    result[channel] = (inside + .1F * extinction) * .04F;
  }
  result += QVector3D(0, .0003F, .00075F);
  return result;
}
QVector3D cubeDirection(int face, float u, float v) {
  switch (face) {
  case 0:
    return {1, -v, -u};
  case 1:
    return {-1, -v, u};
  case 2:
    return {u, 1, v};
  case 3:
    return {u, -1, -v};
  case 4:
    return {u, -v, 1};
  default:
    return {-u, -v, -1};
  }
}
struct Target {
  std::unique_ptr<QRhiTexture> texture;
  std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
  std::unique_ptr<QRhiTextureRenderTarget> target;
  void create(QRhi *rhi) {
    texture.reset(rhi->newTexture(
        QRhiTexture::RGBA16F, {AtlasWidth, AtlasHeight}, 1,
        QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
    if (!texture->create()) {
      throw Error("render", "Sky atlas allocation failed");
    }
    target.reset(rhi->newTextureRenderTarget(
        QRhiTextureRenderTargetDescription(QRhiColorAttachment(texture.get())),
        QRhiTextureRenderTarget::PreserveColorContents));
    descriptor.reset(target->newCompatibleRenderPassDescriptor());
    target->setRenderPassDescriptor(descriptor.get());
    if (!target->create()) {
      throw Error("render", "Sky atlas target unavailable");
    }
  }
};
struct FilterPass {
  std::unique_ptr<QRhiBuffer> uniform;
  std::unique_ptr<QRhiShaderResourceBindings> bindings;
  void create(QRhi *rhi, QRhiTexture *source, QRhiSampler *sampler) {
    uniform.reset(
        rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, 16));
    if (!uniform->create()) {
      throw Error("render", "Sky filter uniform unavailable");
    }
    bindings.reset(rhi->newShaderResourceBindings());
    bindings->setBindings(
        {QRhiShaderResourceBinding::uniformBuffer(
             0, QRhiShaderResourceBinding::FragmentStage, uniform.get()),
         QRhiShaderResourceBinding::sampledTexture(
             1, QRhiShaderResourceBinding::FragmentStage, source, sampler)});
    if (!bindings->create()) {
      throw Error("render", "Sky filter bindings unavailable");
    }
  }
};
struct FilterVertex {
  float x, y, u, v, face;
};
std::unique_ptr<QRhiGraphicsPipeline>
pipeline(QRhi *rhi, QRhiShaderResourceBindings *bindings,
         QRhiRenderPassDescriptor *pass, const char *vertex,
         const char *fragment, int attachments = 1) {
  std::unique_ptr<QRhiGraphicsPipeline> result(rhi->newGraphicsPipeline());
  result->setTopology(QRhiGraphicsPipeline::Triangles);
  result->setCullMode(QRhiGraphicsPipeline::None);
  result->setDepthTest(false);
  result->setDepthWrite(false);
  if (attachments == 2) {
    result->setTargetBlends({QRhiGraphicsPipeline::TargetBlend{},
                             QRhiGraphicsPipeline::TargetBlend{}});
  }
  result->setShaderStages({{QRhiShaderStage::Vertex, loadShader(vertex)},
                           {QRhiShaderStage::Fragment, loadShader(fragment)}});
  result->setShaderResourceBindings(bindings);
  if (attachments == 1) {
    QRhiVertexInputLayout layout;
    layout.setBindings({{sizeof(FilterVertex)}});
    layout.setAttributes(
        {{0, 0, QRhiVertexInputAttribute::Float2, 0},
         {0, 1, QRhiVertexInputAttribute::Float2, 2 * sizeof(float)},
         {0, 2, QRhiVertexInputAttribute::Float, 4 * sizeof(float)}});
    result->setVertexInputLayout(layout);
  }
  result->setRenderPassDescriptor(pass);
  if (!result->create()) {
    throw Error("render", "Sky pipeline unavailable");
  }
  return result;
}
} // namespace
struct Sky3D::State {
  QRhi *rhi = nullptr;
  bool enabled = false;
  float intensity = 0;
  QVector3D background;
  std::optional<Settings> cached;
  std::unique_ptr<QRhiTexture> cube;
  std::unique_ptr<QRhiSampler> sampler;
  Target atlas, ping;
  std::array<FilterPass, 21> filters;
  std::unique_ptr<QRhiBuffer> geometry;
  std::unique_ptr<QRhiGraphicsPipeline> cubePipeline, filterPipeline;
  std::unique_ptr<QRhiBuffer> backgroundUniform;
  std::unique_ptr<QRhiShaderResourceBindings> backgroundBindings;
  std::unique_ptr<QRhiGraphicsPipeline> backgroundPipeline;
  QRhiRenderPassDescriptor *backgroundPass = nullptr;
  QSize backgroundSize;
  std::size_t builds = 0;
};
QVector3D proceduralSkyRadiance3D(const Json &sky, QVector3D sun,
                                  QVector3D direction) {
  if (sun.lengthSquared() < 1e-12F || direction.lengthSquared() < 1e-12F) {
    throw Error("validation_error", "Sky direction must be nonzero");
  }
  Settings settings;
  settings.turbidity = sky.value("turbidity", 10.F);
  settings.rayleigh = sky.value("rayleigh", 2.F);
  settings.sun = sun.normalized();
  settings.ground =
      parseColor(sky.value("groundColor", std::string("#3d3a36")));
  return radiance(settings, direction);
}
Sky3D::Sky3D() : state_(std::make_unique<State>()) {}
Sky3D::~Sky3D() = default;
void Sky3D::reset() { state_ = std::make_unique<State>(); }
void Sky3D::prepare(QRhi *rhi, QRhiCommandBuffer *commands,
                    const Json &environment, QVector3D sun) {
  if (state_->rhi != rhi) {
    reset();
    state_->rhi = rhi;
  }
  auto &s = *state_;
  s.background =
      parseColor(environment.value("background", std::string("#12161e")));
  const auto sky = environment.value("sky", Json{{"kind", "color"}});
  const auto kind = sky.value("kind", std::string("color"));
  if (kind != "color" && kind != "procedural") {
    throw Error("unsupported", "Native sky requires color or procedural sky");
  }
  s.enabled = kind == "procedural";
  s.intensity = s.enabled ? sky.value("intensity", 1.F) : 0;
  if (!s.sampler) {
    s.sampler.reset(rhi->newSampler(QRhiSampler::Linear, QRhiSampler::Linear,
                                    QRhiSampler::None, QRhiSampler::ClampToEdge,
                                    QRhiSampler::ClampToEdge,
                                    QRhiSampler::ClampToEdge));
    if (!s.sampler->create()) {
      throw Error("render", "Sky sampler unavailable");
    }
  }
  const auto release = [](QRhiResourceUpdateBatch *batch) { batch->release(); };
  std::unique_ptr<QRhiResourceUpdateBatch, decltype(release)> pending(
      rhi->nextResourceUpdateBatch(), release);
  auto *uploads = pending.get();
  bool uploadPending = false;
  if (!s.cube) {
    s.cube.reset(rhi->newTexture(
        QRhiTexture::RGBA16F,
        s.enabled ? QSize(CubeSize, CubeSize) : QSize(1, 1), 1,
        QRhiTexture::CubeMap | QRhiTexture::UsedAsTransferSource));
    if (!s.cube->create()) {
      pending.reset();
      throw Error("render", "Sky cube unavailable");
    }
    if (!s.enabled) {
      QByteArray black(8, 0);
      std::vector<QRhiTextureUploadEntry> entries;
      for (int face = 0; face < 6; ++face) {
        entries.emplace_back(face, 0,
                             QRhiTextureSubresourceUploadDescription(black));
      }
      uploads->uploadTexture(s.cube.get(), uploadDescription(entries));
      uploadPending = true;
    }
  }
  if (!s.enabled) {
    if (uploadPending) {
      commands->resourceUpdate(pending.release());
    } else {
      pending.reset();
    }
    return;
  }
  Settings settings;
  settings.turbidity = sky.value("turbidity", 10.F);
  settings.rayleigh = sky.value("rayleigh", 2.F);
  settings.ground =
      parseColor(sky.value("groundColor", std::string("#3d3a36")));
  if (sun.lengthSquared() < 1e-12F) {
    pending.reset();
    throw Error("validation_error", "Sky sun direction must be nonzero");
  }
  settings.sun = sun.normalized();
  if (s.cached && *s.cached == settings) {
    pending.reset();
    return;
  }
  if (s.cube->pixelSize() != QSize(CubeSize, CubeSize)) {
    s.backgroundPipeline.reset();
    s.backgroundBindings.reset();
    s.cube.reset(rhi->newTexture(QRhiTexture::RGBA16F, {CubeSize, CubeSize}, 1,
                                 QRhiTexture::CubeMap |
                                     QRhiTexture::UsedAsTransferSource));
    if (!s.cube->create()) {
      pending.reset();
      throw Error("render", "Procedural sky cube unavailable");
    }
  }
  std::vector<QRhiTextureUploadEntry> entries;
  for (int face = 0; face < 6; ++face) {
    QByteArray data(CubeSize * CubeSize * 8, Qt::Uninitialized);
    auto *pixels = reinterpret_cast<qfloat16 *>(data.data());
    for (int y = 0; y < CubeSize; ++y) {
      for (int x = 0; x < CubeSize; ++x) {
        const auto value =
            radiance(settings, cubeDirection(face, 2 * (x + .5F) / CubeSize - 1,
                                             2 * (y + .5F) / CubeSize - 1));
        const auto offset = (y * CubeSize + x) * 4;
        pixels[offset] = qfloat16(value.x());
        pixels[offset + 1] = qfloat16(value.y());
        pixels[offset + 2] = qfloat16(value.z());
        pixels[offset + 3] = qfloat16(1.F);
      }
    }
    entries.emplace_back(face, 0,
                         QRhiTextureSubresourceUploadDescription(data));
  }
  uploads->uploadTexture(s.cube.get(), uploadDescription(entries));
  if (!s.atlas.texture) {
    std::array<FilterVertex, LodCount * 36> vertices{};
    std::size_t vertex = 0;
    for (int lod = 0; lod < LodCount; ++lod) {
      const int size = 1 << std::max(MaxMip - lod, 4);
      const double texel = 1. / (size - 2);
      const float min = static_cast<float>(-texel),
                  max = static_cast<float>(1 + texel);
      const std::array<std::array<float, 2>, 6> uv = {{{min, min},
                                                       {max, min},
                                                       {max, max},
                                                       {min, min},
                                                       {max, max},
                                                       {min, max}}};
      for (int face = 0; face < 6; ++face) {
        const double x = (face % 3) * 2. / 3 - 1, y = face > 2 ? 0 : -1;
        const std::array<std::array<double, 2>, 6> points = {
            {{x, y},
             {x + 2. / 3, y},
             {x + 2. / 3, y + 1},
             {x, y},
             {x + 2. / 3, y + 1},
             {x, y + 1}}};
        for (std::size_t i = 0; i < 6; ++i) {
          vertices[vertex++] = {static_cast<float>(points[i][0]),
                                static_cast<float>(points[i][1]), uv[i][0],
                                uv[i][1], static_cast<float>(face)};
        }
      }
    }
    s.geometry.reset(rhi->newBuffer(
        QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, sizeof(vertices)));
    if (!s.geometry->create()) {
      throw Error("render", "Sky filter geometry unavailable");
    }
    uploads->uploadStaticBuffer(s.geometry.get(), vertices.data());
    s.atlas.create(rhi);
    s.ping.create(rhi);
    const QByteArray zero(AtlasWidth * AtlasHeight * 8, 0);
    uploads->uploadTexture(
        s.atlas.texture.get(),
        QRhiTextureUploadDescription({QRhiTextureUploadEntry(
            0, 0, QRhiTextureSubresourceUploadDescription(zero))}));
    uploads->uploadTexture(
        s.ping.texture.get(),
        QRhiTextureUploadDescription({QRhiTextureUploadEntry(
            0, 0, QRhiTextureSubresourceUploadDescription(zero))}));
    s.filters[0].create(rhi, s.cube.get(), s.sampler.get());
    for (int lod = 1; lod < LodCount; ++lod) {
      s.filters[2 * lod - 1].create(rhi, s.atlas.texture.get(),
                                    s.sampler.get());
      s.filters[2 * lod].create(rhi, s.ping.texture.get(), s.sampler.get());
    }
    s.cubePipeline =
        pipeline(rhi, s.filters[0].bindings.get(), s.atlas.descriptor.get(),
                 ":/game/shaders/sky_filter.vert.qsb",
                 ":/game/shaders/sky_cube_to_uv.frag.qsb");
    s.filterPipeline =
        pipeline(rhi, s.filters[1].bindings.get(), s.ping.descriptor.get(),
                 ":/game/shaders/sky_filter.vert.qsb",
                 ":/game/shaders/sky_pmrem.frag.qsb");
  }
  commands->resourceUpdate(pending.release());
  const auto run = [&](int index, Target &target, int lod, float mip,
                       float roughness, QRhiGraphicsPipeline *program) {
    const int size = 1 << std::max(MaxMip - lod, 4),
              x = 3 * size * std::max(lod - 4, 0), y = 4 * (CubeSize - size);
    const std::array<float, 4> values = {static_cast<float>(size), mip,
                                         roughness, 0};
    auto *update = rhi->nextResourceUpdateBatch();
    auto &filter = s.filters[index];
    update->updateDynamicBuffer(filter.uniform.get(), 0, 16, values.data());
    commands->beginPass(target.target.get(), Qt::black, {1, 0}, update);
    commands->setGraphicsPipeline(program);
    commands->setShaderResources(filter.bindings.get());
    const int nativeY =
        rhi->isYUpInFramebuffer() ? y : AtlasHeight - y - 2 * size;
    commands->setViewport({static_cast<float>(x), static_cast<float>(nativeY),
                           static_cast<float>(3 * size),
                           static_cast<float>(2 * size)});
    const QRhiCommandBuffer::VertexInput input(s.geometry.get(), 0);
    commands->setVertexInput(0, 1, &input);
    commands->draw(36, 1, lod * 36);
    commands->endPass();
  };
  run(0, s.atlas, 0, 8, 0, s.cubePipeline.get());
  for (int lod = 1; lod < LodCount; ++lod) {
    const double target = static_cast<double>(lod) / 10,
                 source = static_cast<double>(lod - 1) / 10;
    const float roughness = static_cast<float>(
        std::sqrt(target * target - source * source) * target * 1.25);
    run(2 * lod - 1, s.ping, lod, static_cast<float>(MaxMip - lod + 1),
        roughness, s.filterPipeline.get());
    run(2 * lod, s.atlas, lod, static_cast<float>(MaxMip - lod), 0,
        s.filterPipeline.get());
  }
  s.cached = settings;
  ++s.builds;
}
void Sky3D::prepareBackground(QRhiResourceUpdateBatch *updates,
                              QRhiRenderPassDescriptor *pass,
                              const SkyCamera3D &camera) {
  auto &s = *state_;
  if (!s.rhi || !s.cube) {
    throw Error("render", "Sky background not prepared");
  }
  if (!s.backgroundUniform) {
    s.backgroundUniform.reset(
        s.rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, 176));
    if (!s.backgroundUniform->create()) {
      throw Error("render", "Sky camera buffer unavailable");
    }
  }
  if (s.backgroundPass != pass) {
    s.backgroundPipeline.reset();
    s.backgroundPass = pass;
  }
  if (!s.backgroundBindings) {
    s.backgroundBindings.reset(s.rhi->newShaderResourceBindings());
    s.backgroundBindings->setBindings(
        {QRhiShaderResourceBinding::uniformBuffer(
             0,
             QRhiShaderResourceBinding::VertexStage |
                 QRhiShaderResourceBinding::FragmentStage,
             s.backgroundUniform.get()),
         QRhiShaderResourceBinding::sampledTexture(
             1, QRhiShaderResourceBinding::FragmentStage, s.cube.get(),
             s.sampler.get())});
    if (!s.backgroundBindings->create()) {
      throw Error("render", "Sky background bindings unavailable");
    }
  }
  if (!s.backgroundPipeline) {
    s.backgroundPipeline =
        pipeline(s.rhi, s.backgroundBindings.get(), pass,
                 ":/game/shaders/sky_background.vert.qsb",
                 ":/game/shaders/sky_background.frag.qsb", 2);
  }
  std::array<float, 44> values{};
  std::copy_n(s.rhi->clipSpaceCorrMatrix().constData(), 16, values.begin());
  std::copy_n(camera.inverseViewProjection.constData(), 16,
              values.begin() + 16);
  values[32] = camera.cameraPosition.x();
  values[33] = camera.cameraPosition.y();
  values[34] = camera.cameraPosition.z();
  values[36] = s.intensity;
  values[37] = camera.far;
  values[38] = s.enabled ? 1.F : 0.F;
  values[40] = s.background.x();
  values[41] = s.background.y();
  values[42] = s.background.z();
  updates->updateDynamicBuffer(s.backgroundUniform.get(), 0, sizeof(values),
                               values.data());
  s.backgroundSize = camera.pixelSize;
}
void Sky3D::drawBackground(QRhiCommandBuffer *commands) {
  const auto &s = *state_;
  if (!s.backgroundPipeline) {
    throw Error("render", "Sky draw requires background preparation");
  }
  commands->setGraphicsPipeline(s.backgroundPipeline.get());
  commands->setShaderResources(s.backgroundBindings.get());
  commands->setViewport({0, 0, static_cast<float>(s.backgroundSize.width()),
                         static_cast<float>(s.backgroundSize.height())});
  commands->draw(3);
}
QRhiTexture *Sky3D::cubeTexture() const { return state_->cube.get(); }
QRhiTexture *Sky3D::environmentTexture() const {
  return state_->enabled ? state_->atlas.texture.get() : nullptr;
}
QRhiSampler *Sky3D::sampler() const { return state_->sampler.get(); }
float Sky3D::intensity() const { return state_->intensity; }
Json Sky3D::report() const {
  const auto &s = *state_;
  std::size_t bytes =
      s.cube ? static_cast<std::size_t>(s.cube->pixelSize().width()) *
                   s.cube->pixelSize().height() * 6 * 8
             : 0;
  if (s.atlas.texture) {
    bytes += 2 * AtlasWidth * AtlasHeight * 8;
  }
  return {{"builds", s.builds},
          {"textureBytes", bytes},
          {"enabled", s.enabled},
          {"maxMip", MaxMip},
          {"ggxSamples", 256}};
}
} // namespace nodetool::game
