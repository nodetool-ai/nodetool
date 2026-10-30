#include "render/PostFX3D.h"
#include "document/Schema.h"
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QImage>
#include <QOffscreenSurface>
#include <QtTest>
#include <qfloat16.h>
#include <rhi/qrhi.h>
#include <rhi/qrhi_platform.h>
#include <array>
#include <bit>
#include <memory>
#include <vector>
static void initializeShaders() { Q_INIT_RESOURCE(game_pbr_shaders); }
using namespace nodetool::game;
class PostFXTest final : public QObject {
  Q_OBJECT
private slots:
  void featurePixels() {
    initializeShaders();
    std::unique_ptr<QOffscreenSurface> surface(QRhiGles2InitParams::newFallbackSurface());
    QRhiGles2InitParams init; init.fallbackSurface = surface.get();
    std::unique_ptr<QRhi> rhi(QRhi::create(QRhi::OpenGLES2, &init));
    QVERIFY2(rhi != nullptr, "PostFX pixel tests require a real OpenGL QRhi");
    PostFX3D post;
    constexpr int width = 128, height = 96;
    std::vector<qfloat16> logical(width * height * 4);
    Json bits = Json::array();
    for (int y = 0; y < height; ++y) { for (int x = 0; x < width; ++x) {
      const bool edge = x > y * 4 / 3, hotspot = x >= 60 && x < 68 && y >= 44 && y < 52;
      const std::array<float, 4> color{hotspot ? 12.f : edge ? 2.f : .02f, float(y) / height * .8f, float(x) / width * .4f, 1.f};
      for (int c = 0; c < 4; ++c) { const qfloat16 value(color[c]); logical[(y * width + x) * 4 + c] = value; bits.push_back(std::bit_cast<quint16>(value)); }
    } }
    auto physical = logical;
    if (rhi->isYUpInFramebuffer()) { for (int y = 0; y < height; ++y) { std::copy_n(logical.data() + y * width * 4, width * 4, physical.data() + (height - 1 - y) * width * 4); } }
    std::unique_ptr<QRhiTexture> input(rhi->newTexture(QRhiTexture::RGBA16F, {width, height})); QVERIFY(input->create());
    const QString directory = qEnvironmentVariable("NODETOOL_POSTFX_REPORT_DIR", QDir::tempPath() + "/native-postfx-tests"); QVERIFY(QDir().mkpath(directory));
    Json fixtures = {{"width", width}, {"height", height}, {"rgba16", bits}, {"cases", Json::array()}};
    const Json base = {{"enabled", true}, {"toneMapping", "agx"}, {"antialias", "smaa"}, {"exposure", 1.15}};
    Json bloom = base; bloom["bloom"] = {{"intensity", .65}, {"radius", .3}, {"threshold", .45}, {"softness", .1}};
    Json vignette = base; vignette["vignette"] = {{"intensity", .6}, {"radius", .3}, {"softness", .5}};
    Json combined = bloom; combined["vignette"] = vignette["vignette"];
    std::array<std::pair<const char *, Json>, 5> cases{{{"agx", base}, {"bloom", bloom}, {"vignette", vignette}, {"combined", combined}, {"softness", combined}}};
    cases[4].second["bloom"]["softness"] = .45;
    QImage combinedImage;
    for (const auto &[name, settings] : cases) {
      QRhiCommandBuffer *cb = nullptr; QCOMPARE(rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
      auto *upload = rhi->nextResourceUpdateBatch();
      upload->uploadTexture(input.get(), QRhiTextureUploadDescription({QRhiTextureUploadEntry(0, 0, QRhiTextureSubresourceUploadDescription(QByteArray(reinterpret_cast<const char *>(physical.data()), qsizetype(physical.size() * sizeof(qfloat16)))))}));
      cb->resourceUpdate(upload);
      auto *output = post.render(rhi.get(), cb, input.get(), {width, height}, {{"postProcessing", settings}});
      QRhiReadbackResult result;
      auto *read = rhi->nextResourceUpdateBatch(); read->readBackTexture(QRhiReadbackDescription(output), &result); cb->resourceUpdate(read);
      QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
      rhi->finish(); QCOMPARE(result.pixelSize, QSize(width, height));
      QImage image(reinterpret_cast<const uchar *>(result.data.constData()), width, height, QImage::Format_RGBA8888); image = image.copy();
      if (rhi->isYUpInFramebuffer()) { image = image.flipped(Qt::Vertical); }
      QVERIFY(image.save(directory + "/" + QString::fromLatin1(name) + "-native.png"));
      if (std::string(name) == "combined") { combinedImage = image; }
      if (std::string(name) == "softness") { QVERIFY(image != combinedImage); }
      const auto report = post.report(); QCOMPARE(report.at("passes").get<int>(), settings.contains("bloom") ? settings.contains("vignette") ? 18 : 17 : settings.contains("vignette") ? 5 : 4);
      fixtures["cases"].push_back({{"name", name}, {"postProcessing", settings}, {"nativeReport", report}});
    }
    QFile file(directory + "/fixtures.json"); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QByteArray::fromStdString(fixtures.dump()));
    QRhiCommandBuffer *cb = nullptr;
    QCOMPARE(rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
    std::unique_ptr<QRhiTexture> oversized(rhi->newTexture(QRhiTexture::RGBA16F, {8192, 8192}));
    QVERIFY_EXCEPTION_THROWN(post.render(rhi.get(), cb, oversized.get(), {8192, 8192}, {{"postProcessing", base}}), std::exception);
    Json invalid = base; invalid["toneMapping"] = "aces";
    QVERIFY_EXCEPTION_THROWN(post.render(rhi.get(), cb, input.get(), {width, height}, {{"postProcessing", invalid}}), std::exception);
    QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
    post.reset();
  }
};
QTEST_MAIN(PostFXTest)
#include "PostFXTest.moc"
