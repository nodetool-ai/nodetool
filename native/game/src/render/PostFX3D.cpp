#include "PostFX3D.h"
#include "document/Document.h"
#include <QCryptographicHash>
#include <QColor>
#include <QFile>
#include <QImage>
#include <QMatrix4x4>
#include <QResource>
#include <rhi/qrhi.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <span>
#include <vector>

static void initializePostFXResources() {
  static const bool initialized = [] { Q_INIT_RESOURCE(game_postfx_assets); return true; }();
  (void)initialized;
}
namespace nodetool::game {
namespace {
constexpr quint64 MaxTargetBytes = 512ULL * 1024 * 1024;
struct alignas(16) Uniforms {
  std::array<float, 16> clip{};
  std::array<float, 4> metrics{}, p0{}, p1{}, p2{};
  std::array<std::array<float, 4>, 22> weights{};
};
static_assert(sizeof(Uniforms) == 480);
QShader shader(const QString &path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) { throw Error("render", "Native postFX shader unavailable: " + path.toStdString()); }
  auto result = QShader::fromSerialized(file.readAll());
  if (!result.isValid()) { throw Error("render", "Native postFX shader invalid"); }
  return result;
}
QByteArray resource(const QString &path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) { throw Error("render", "Native postFX builtin unavailable"); }
  return file.readAll();
}
QImage lookup(const char *name, const Json &manifest) {
  const auto bytes = resource(QStringLiteral(":/game/") + QString::fromLatin1(name));
  const auto &expected = manifest.at("lookups").at(name);
  if (QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex().toStdString() != expected.at("pngDigest").get<std::string>()) { throw Error("asset", "SMAA builtin PNG integrity mismatch"); }
  const auto image = QImage::fromData(bytes, "PNG").convertToFormat(QImage::Format_RGBA8888);
  if (image.isNull() || image.width() != expected.at("width") || image.height() != expected.at("height")) { throw Error("asset", "SMAA builtin dimensions mismatch"); }
  const auto raw = QByteArray::fromRawData(reinterpret_cast<const char *>(image.constBits()), image.sizeInBytes());
  if (QCryptographicHash::hash(raw, QCryptographicHash::Sha256).toHex().toStdString() != expected.at("rgbaDigest").get<std::string>()) { throw Error("asset", "SMAA builtin decoded integrity mismatch"); }
  return image;
}
struct Target {
  std::unique_ptr<QRhiTexture> texture;
  std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
  std::unique_ptr<QRhiTextureRenderTarget> target;
  void create(QRhi *rhi, QSize size, QRhiTexture::Format format) {
    texture.reset(rhi->newTexture(format, size, 1, QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
    if (!texture->create()) { throw Error("render", "Native postFX texture allocation failed"); }
    target.reset(rhi->newTextureRenderTarget(QRhiTextureRenderTargetDescription(QRhiColorAttachment(texture.get()))));
    descriptor.reset(target->newCompatibleRenderPassDescriptor()); target->setRenderPassDescriptor(descriptor.get());
    if (!target->create()) { throw Error("render", "Native postFX render target unavailable"); }
  }
};
struct Pass {
  Target output;
  std::unique_ptr<QRhiBuffer> uniform;
  std::unique_ptr<QRhiShaderResourceBindings> bindings;
  std::unique_ptr<QRhiGraphicsPipeline> pipeline;
  std::vector<QRhiTexture *> inputs;
  std::vector<quint64> inputIds;
  QString vertex, fragment;
  void create(QRhi *rhi, QSize size, QRhiTexture::Format format, const QString &vert, const QString &frag) {
    output.create(rhi, size, format); vertex = vert; fragment = frag;
    uniform.reset(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(Uniforms)));
    if (!uniform->create()) { throw Error("render", "Native postFX uniform buffer unavailable"); }
  }
  QRhiTexture *run(QRhi *rhi, QRhiCommandBuffer *cb, QRhiBuffer *vertices,
                   std::span<QRhiTexture *const> textures, QRhiSampler *linear,
                   QRhiSampler *nearest, const Uniforms &data, bool smaaWeights = false) {
    bool changed = inputs.size() != textures.size();
    if (!changed) { for (std::size_t i = 0; i < textures.size(); ++i) { changed = changed || inputIds[i] != textures[i]->globalResourceId(); } }
    if (changed) {
      inputs.assign(textures.begin(), textures.end());
      inputIds.clear(); for (auto *texture : textures) { inputIds.push_back(texture->globalResourceId()); }
      if (!bindings) { bindings.reset(rhi->newShaderResourceBindings()); }
      std::vector<QRhiShaderResourceBinding> values;
      values.push_back(QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage, uniform.get()));
      for (std::size_t i = 0; i < textures.size(); ++i) { values.push_back(QRhiShaderResourceBinding::sampledTexture(int(i + 1), QRhiShaderResourceBinding::FragmentStage, textures[i], smaaWeights && i == 2 ? nearest : linear)); }
      bindings->setBindings(values.cbegin(), values.cend());
      if (!bindings->create()) { throw Error("render", "Native postFX bindings unavailable"); }
    }
    if (!pipeline) {
      pipeline.reset(rhi->newGraphicsPipeline()); pipeline->setTopology(QRhiGraphicsPipeline::Triangles);
      pipeline->setCullMode(QRhiGraphicsPipeline::None); pipeline->setDepthTest(false); pipeline->setDepthWrite(false);
      pipeline->setShaderStages({{QRhiShaderStage::Vertex, shader(vertex)}, {QRhiShaderStage::Fragment, shader(fragment)}});
      QRhiVertexInputLayout layout; layout.setBindings({{5 * sizeof(float)}});
      layout.setAttributes({{0, 0, QRhiVertexInputAttribute::Float3, 0}, {0, 1, QRhiVertexInputAttribute::Float2, 3 * sizeof(float)}});
      pipeline->setVertexInputLayout(layout); pipeline->setShaderResourceBindings(bindings.get()); pipeline->setRenderPassDescriptor(output.descriptor.get());
      if (!pipeline->create()) { throw Error("render", "Native postFX pipeline unavailable"); }
    }
    auto *update = rhi->nextResourceUpdateBatch(); update->updateDynamicBuffer(uniform.get(), 0, sizeof(Uniforms), &data);
    cb->beginPass(output.target.get(), QColor(0, 0, 0, 0), {1, 0}, update);
    cb->setGraphicsPipeline(pipeline.get()); cb->setShaderResources(bindings.get());
    const auto size = output.texture->pixelSize(); cb->setViewport({0, 0, float(size.width()), float(size.height())});
    const QRhiCommandBuffer::VertexInput input(vertices, 0); cb->setVertexInput(0, 1, &input); cb->draw(3); cb->endPass();
    return output.texture.get();
  }
};
} // namespace
struct PostFX3D::State {
  QRhi *rhi = nullptr;
  QSize size;
  quint64 bytes = 0;
  std::unique_ptr<QRhiBuffer> vertices;
  std::unique_ptr<QRhiSampler> linear, nearest;
  std::array<std::unique_ptr<QRhiTexture>, 2> lookups;
  Pass bright, composite, add, tone, vignette, edges, weights, blend;
  std::array<Pass, 5> horizontal, vertical;
  int completedPasses = 0;
};
PostFX3D::PostFX3D() : state_(std::make_unique<State>()) { initializePostFXResources(); }
PostFX3D::~PostFX3D() = default;
void PostFX3D::reset() { state_ = std::make_unique<State>(); }
Json PostFX3D::report() const { return {{"passes", state_->completedPasses}, {"targetBytes", state_->bytes}, {"maxTargetBytes", MaxTargetBytes}, {"smaa", "1x-medium"}, {"bloomMips", 5}}; }
QRhiTexture *PostFX3D::render(QRhi *rhi, QRhiCommandBuffer *cb, QRhiTexture *hdrInput, QSize size, const Json &environment) {
  if (!rhi || !cb || !hdrInput || !size.isValid() || hdrInput->format() != QRhiTexture::RGBA16F || hdrInput->sampleCount() != 1 || hdrInput->pixelSize() != size) { throw Error("render", "Native postFX requires matching single-sample linear RGBA16F input"); }
  if (!environment.contains("postProcessing")) { throw Error("unavailable_capability", "Native environment requires explicit AgX/SMAA post-processing"); }
  const auto &post = environment.at("postProcessing");
  if (!post.value("enabled", true) || post.value("toneMapping", std::string{}) != "agx" || post.value("antialias", std::string{}) != "smaa") { throw Error("unavailable_capability", "Native postFX supports explicit AgX and SMAA"); }
  if (state_->rhi != rhi || state_->size != size) {
    reset(); auto replacement = std::make_unique<State>(); auto &n = *replacement; n.rhi = rhi; n.size = size;
    n.bytes = quint64(size.width()) * quint64(size.height()) * 56 + 160 * 560 * 4 + 66 * 33 * 4;
    if (size.width() > 8192 || size.height() > 8192 || n.bytes > MaxTargetBytes) { throw Error("resource_limit", "Native postFX target budget exceeded"); }
    if (!rhi->isTextureFormatSupported(QRhiTexture::RGBA16F)) { throw Error("unavailable_capability", "Native postFX requires renderable half-float textures"); }
    n.vertices.reset(rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, 15 * sizeof(float)));
    n.linear.reset(rhi->newSampler(QRhiSampler::Linear, QRhiSampler::Linear, QRhiSampler::None, QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
    n.nearest.reset(rhi->newSampler(QRhiSampler::Nearest, QRhiSampler::Nearest, QRhiSampler::None, QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
    if (!n.vertices->create() || !n.linear->create() || !n.nearest->create()) { throw Error("render", "Native postFX resources unavailable"); }
    auto *update = rhi->nextResourceUpdateBatch();
    const std::array<float, 15> vertices{-1,-1,0,0,0, 3,-1,0,2,0, -1,3,0,0,2}; update->uploadStaticBuffer(n.vertices.get(), vertices.data());
    const auto manifestBytes = resource(":/game/native-smaa.json"); const auto manifest = Json::parse(manifestBytes.constData(), manifestBytes.constData() + manifestBytes.size());
    for (int i = 0; i < 2; ++i) {
      const auto image = lookup(i == 0 ? "native-smaa-area.png" : "native-smaa-search.png", manifest);
      n.lookups[i].reset(rhi->newTexture(QRhiTexture::RGBA8, image.size()));
      if (!n.lookups[i]->create()) { throw Error("render", "Native SMAA lookup texture unavailable"); }
      update->uploadTexture(n.lookups[i].get(), image);
    }
    cb->resourceUpdate(update);
    const QString vert = ":/game/shaders/postfx.vert.qsb", frag = ":/game/shaders/postfx.frag.qsb";
    const auto make = [&](Pass &pass, QSize targetSize, QRhiTexture::Format format = QRhiTexture::RGBA16F) { pass.create(rhi, targetSize, format, vert, frag); };
    QSize mip((size.width() + 1) / 2, (size.height() + 1) / 2); make(n.bright, mip);
    for (int i = 0; i < 5; ++i) { make(n.horizontal[i], mip); make(n.vertical[i], mip); mip = QSize((mip.width() + 1) / 2, (mip.height() + 1) / 2); }
    make(n.composite, n.bright.output.texture->pixelSize()); make(n.add, size); make(n.tone, size); make(n.vignette, size);
    n.edges.create(rhi, size, QRhiTexture::RGBA16F, ":/game/shaders/postfx_smaa_edges.vert.qsb", ":/game/shaders/postfx_smaa_edges.frag.qsb");
    n.weights.create(rhi, size, QRhiTexture::RGBA16F, ":/game/shaders/postfx_smaa_weights.vert.qsb", ":/game/shaders/postfx_smaa_weights.frag.qsb");
    n.blend.create(rhi, size, QRhiTexture::RGBA8, ":/game/shaders/postfx_smaa_blend.vert.qsb", ":/game/shaders/postfx_smaa_blend.frag.qsb");
    n.bytes = 160 * 560 * 4 + 66 * 33 * 4;
    const auto count = [&](const Pass &pass) { const auto pixels = pass.output.texture->pixelSize(); n.bytes += quint64(pixels.width()) * quint64(pixels.height()) * (pass.output.texture->format() == QRhiTexture::RGBA8 ? 4 : 8); };
    for (const auto *pass : {&n.bright, &n.composite, &n.add, &n.tone, &n.vignette, &n.edges, &n.weights, &n.blend}) { count(*pass); }
    for (int i = 0; i < 5; ++i) { count(n.horizontal[i]); count(n.vertical[i]); }
    state_ = std::move(replacement);
  }
  auto &n = *state_; n.completedPasses = 0;
  Uniforms data; const auto correction = rhi->clipSpaceCorrMatrix(); std::memcpy(data.clip.data(), correction.constData(), 64);
  data.metrics[2] = rhi->isYUpInFramebuffer() ? 1.f : 0.f;
  data.p1[1] = post.value("exposure", 1.f);
  const auto run = [&](Pass &pass, int operation, std::span<QRhiTexture *const> inputs, bool special = false) {
    const auto targetSize = pass.output.texture->pixelSize(); data.metrics[0] = 1.f / targetSize.width(); data.metrics[1] = 1.f / targetSize.height(); data.p0[0] = float(operation);
    ++n.completedPasses; return pass.run(rhi, cb, n.vertices.get(), inputs, n.linear.get(), n.nearest.get(), data, special);
  };
  const auto regular = [&](Pass &pass, int operation, std::initializer_list<QRhiTexture *> inputs) {
    std::array<QRhiTexture *, 5> bound{}; std::fill(bound.begin(), bound.end(), *inputs.begin()); std::copy(inputs.begin(), inputs.end(), bound.begin()); return run(pass, operation, bound);
  };
  auto *color = hdrInput;
  if (post.contains("bloom")) {
    const auto &bloom = post.at("bloom"); data.p1[0] = bloom.value("threshold", .85f); data.p1[2] = bloom.value("intensity", 1.f); data.p1[3] = bloom.value("radius", .4f); data.p2[3] = bloom.value("softness", .1f);
    color = regular(n.bright, 0, {hdrInput}); constexpr std::array<int, 5> kernels{6,10,14,18,22};
    for (int i = 0; i < 5; ++i) {
      const double sigma = double(kernels[i]) / 3.0; data.p0[1] = float(kernels[i]);
      for (int j = 0; j < kernels[i]; ++j) { data.weights[j][0] = static_cast<float>(.39894 * std::exp(-.5 * j * j / (sigma * sigma)) / sigma); }
      data.p0[2] = 1; data.p0[3] = 0; color = regular(n.horizontal[i], 1, {color});
      data.p0[2] = 0; data.p0[3] = 1; color = regular(n.vertical[i], 1, {color});
    }
    color = regular(n.composite, 2, {n.vertical[0].output.texture.get(), n.vertical[1].output.texture.get(), n.vertical[2].output.texture.get(), n.vertical[3].output.texture.get(), n.vertical[4].output.texture.get()});
    color = regular(n.add, 3, {hdrInput, color});
  }
  color = regular(n.tone, 4, {color});
  if (post.contains("vignette")) { const auto &v = post.at("vignette"); data.p2 = {v.value("intensity", .4f), v.value("radius", .5f), v.value("softness", .5f), 0}; color = regular(n.vignette, 5, {color}); }
  std::array<QRhiTexture *, 1> edgeInputs{color}; auto *edges = run(n.edges, 0, edgeInputs);
  std::array<QRhiTexture *, 3> weightInputs{edges, n.lookups[0].get(), n.lookups[1].get()}; auto *weights = run(n.weights, 0, weightInputs, true);
  std::array<QRhiTexture *, 2> blendInputs{weights, color}; return run(n.blend, 0, blendInputs);
}
} // namespace nodetool::game
