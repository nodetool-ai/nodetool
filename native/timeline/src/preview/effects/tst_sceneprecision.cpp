#include "preview/layers/TestStill.h"
#include "export/OffscreenFrames.h"
#include "model/TimelineJson.h"
#include "preview/effects/ClipEffects.h"
#include "playback/PlaybackClock.h"
#include <QFile>
#include <QScopeGuard>
#include <QtTest>
#include <qfloat16.h>
#if defined(Q_OS_LINUX)
#include <sys/resource.h>
#endif
#include <cmath>
#include <cstring>
#include <limits>

namespace {
QJsonObject effect(const char* type, QJsonObject parameters = {}) {
    parameters.insert("id", type);
    parameters.insert("type", type);
    parameters.insert("enabled", true);
    return parameters;
}
QJsonObject leaf(const char* id, const char* type) {
    return {{"id", id}, {"trackId", "v"}, {"mediaType", type}, {"startMs", 0},
        {"durationMs", 2000}, {"width", 64}, {"height", 32},
        {"shapeStyle", QJsonObject{{"kind", "rect"}, {"fill", "#808080"}}}};
}
nt::Timeline document(QJsonArray clips, int width = 64, int height = 32) {
    const auto parsed = nt::parseTimeline(QJsonObject{{"width", width}, {"height", height}, {"fps", 30},
        {"durationMs", 2000}, {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}}, {"clips", clips}});
    if (!parsed.timeline) { qFatal("invalid precision document"); }
    return *parsed.timeline;
}
class FloatSource final : public nt::LayerSource {
    float m_alpha;
    bool m_vertical;
    std::unique_ptr<QRhiTexture> m_texture;
public:
    explicit FloatSource(float alpha, bool vertical = false) : m_alpha(alpha), m_vertical(vertical) {}
    QSize frameSize() const override { return {64, 32}; }
    nt::LayerFrame frameAt(const nt::FrameContext& ctx, double) override {
        if (!m_texture) {
            m_texture.reset(ctx.rhi->newTexture(QRhiTexture::RGBA16F, frameSize()));
            if (!m_texture->create()) { return {}; }
            std::vector<qfloat16> pixels(64 * 32 * 4);
            for (int i = 0; i < 64 * 32; ++i) {
                const float gray = m_vertical ? float(i % 64 + 1) / 130 + float(i / 64) / 64
                                              : float(i % 64 + 1) / 65;
                for (int c = 0; c < 3; ++c) { pixels[i * 4 + c] = qfloat16(gray * m_alpha); }
                pixels[i * 4 + 3] = qfloat16(m_alpha);
            }
            ctx.updates->uploadTexture(m_texture.get(), QRhiTextureUploadDescription{{{0, 0,
                QRhiTextureSubresourceUploadDescription(pixels.data(), int(pixels.size() * sizeof(qfloat16)))}}});
        }
        nt::LayerFrame frame;
        frame.format = nt::LayerFrame::rgbaFormat(m_texture.get());
        frame.transfer = "bt709";
        frame.planes[0] = m_texture.get(); frame.size = frameSize();
        return frame;
    }
};
class TransferProbe final : public nt::LayerEffectStage {
    bool& m_seen;
    bool& m_valid;
    nt::effects::ClipEffectStage m_copy;
public:
    TransferProbe(bool& seen, bool& valid) : m_seen(seen), m_valid(valid) {}
    bool applies(const QJsonObject& ext) const override { return ext.contains("clipEffects"); }
    bool render(const nt::EffectContext& ctx, const nt::LayerFrame& input,
                QRhiTextureRenderTarget& output, const QJsonObject&) override {
        m_seen = true;
        m_valid = m_valid && input.transfer == "bt709";
        return m_copy.render(ctx, input, output, {});
    }
};
class Scene {
public:
    TimelineModel model;
    PlaybackClock clock;
    nt::test::Still still;
    QRhiReadbackResult readback;
    std::vector<float> pixels;
    QSize size;
    QRhiTexture::Format storage = QRhiTexture::UnknownFormat;
    bool settled = false, previous = false;
    int tap = 0;
    int previousFrames = 0;
    int copiedFrames = 0;
    quint64 peakGpuBytes = 0;
    quint64 gpuBytes = 0;
    bool initialize(nt::Timeline timeline, nt::WorkingFormat format) {
        model.setTimeline(std::move(timeline));
        clock.setDurationMs(2000);
        clock.setNowSource([] { return std::int64_t(0); });
        if (!still.initialize(model)) { return false; }
        still.setClock(&clock);
        still.compositor()->setWorkingFormat(format);
        still.compositor()->setAlphaDisplay(true);
        still.compositor()->workingObserver = [this](QRhi* rhi, QRhiCommandBuffer* cb, QRhiTexture* texture,
                                                   bool ready, bool prev, int index, bool copied) {
            static bool loggedBackend = false;
            if (!loggedBackend) {
                qInfo() << "scene backend" << rhi->backendName() << rhi->driverInfo().deviceName;
                loggedBackend = true;
            }
            gpuBytes = rhi->statistics().usedBytes;
            peakGpuBytes = std::max(peakGpuBytes, gpuBytes);
            settled = ready; previous = prev; tap = index;
            previousFrames += prev; copiedFrames += copied;
            size = texture->pixelSize(); storage = texture->format();
            readback = {};
            const bool fp16 = texture->format() == QRhiTexture::RGBA16F;
            readback.completed = [this, fp16, flip = rhi->isYUpInFramebuffer()] {
                const int count = size.width() * size.height() * 4;
                if (readback.data.size() != count * (fp16 ? 2 : 1)) { qFatal("unexpected working layout"); }
                pixels.resize(count);
                for (int i = 0; i < count; ++i) {
                    if (fp16) {
                        qfloat16 value;
                        std::memcpy(&value, readback.data.constData() + i * 2, 2);
                        pixels[i] = float(value);
                    } else { pixels[i] = static_cast<unsigned char>(readback.data[i]) / 255.f; }
                }
                if (flip) {
                    const int row = size.width() * 4;
                    for (int y = 0; y < size.height() / 2; ++y) {
                        for (int x = 0; x < row; ++x) {
                            std::swap(pixels[y * row + x], pixels[(size.height() - 1 - y) * row + x]);
                        }
                    }
                }
            };
            auto* updates = rhi->nextResourceUpdateBatch();
            updates->readBackTexture({texture}, &readback);
            cb->resourceUpdate(updates);
        };
        return true;
    }
    bool render() {
        QElapsedTimer timer; timer.start();
        do {
            pixels.clear(); still.frame();
            for (float value : pixels) { if (!std::isfinite(value)) { return false; } }
            if (settled && !pixels.empty()) { return true; }
            QThread::msleep(1);
        } while (timer.elapsed() < 10000);
        return false;
    }
    bool finiteNonblack() const {
        bool nonblack = false;
        for (size_t i = 0; i < pixels.size(); ++i) {
            if (!std::isfinite(pixels[i])) { return false; }
            if (i % 4 != 3 && pixels[i] > 0) { nonblack = true; }
        }
        return nonblack;
    }
    ~Scene() { if (still.compositor()) { still.compositor()->workingObserver = {}; } }
};
float difference(const std::vector<float>& a, const std::vector<float>& b) {
    if (a.size() != b.size()) { return INFINITY; }
    float result = 0;
    for (size_t i = 0; i < a.size(); ++i) { result = std::max(result, std::abs(a[i] - b[i])); }
    return result;
}
}
class TestScenePrecision : public QObject {
    Q_OBJECT
private slots:
    void resolutionMaskOutset() {
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            for (const bool inverted : {false, true}) {
                auto shape = leaf("masked", "shape");
                shape.insert("width", 128); shape.insert("height", 64);
                shape.insert("transform", QJsonObject{{"position", QJsonObject{{"x", 32}, {"y", -16}}}});
                shape.insert("effects", QJsonArray{effect("glow", {{"radius", 8}, {"intensity", 1}})});
                shape.insert("mask", QJsonObject{{"kind", "ellipse"}, {"x", 0.2}, {"y", 0.2},
                    {"width", 0.6}, {"height", 0.6}, {"featherPx", 4}, {"invert", inverted}});
                Scene scene;
                QVERIFY(scene.initialize(document({shape}, 256, 128), format));
                QVERIFY(scene.render());
                const auto capture = scene.still.capture(10000);
                QVERIFY(!capture.isNull());
                for (const int denominator : {1, 2, 4, 8}) {
                    auto* item = scene.still.compositor();
                    item->setPausedResolution(denominator);
                    QVERIFY(scene.render());
                    QCOMPARE(scene.size, QSize(256 / denominator, 128 / denominator));
                    QCOMPARE(scene.storage, format == nt::WorkingFormat::Rgba16F ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8);
                    QVERIFY(scene.finiteNonblack());
                    // The translated shape occupies the right half above the centre.
                    const auto alphaAt = [&](int x, int y) {
                        return scene.pixels[((y / denominator) * scene.size.width() + x / denominator) * 4 + 3];
                    };
                    QCOMPARE(alphaAt(16, 112), 0.f);
                    double mass = 0, momentX = 0, momentY = 0;
                    for (int y = 0; y < scene.size.height(); ++y) {
                        for (int x = 0; x < scene.size.width(); ++x) {
                            const double alpha = scene.pixels[(y * scene.size.width() + x) * 4 + 3];
                            mass += alpha;
                            momentX += alpha * (x + 0.5) * denominator;
                            momentY += alpha * (y + 0.5) * denominator;
                        }
                    }
                    QVERIFY(mass > 0);
                    QVERIFY(momentX / mass > 128 && momentX / mass < 192);
                    QVERIFY(momentY / mass > 16 && momentY / mass < 80);
                    qInfo() << "canvas allocation" << int(format) << denominator << scene.size
                            << scene.size.width() * scene.size.height() * (format == nt::WorkingFormat::Rgba16F ? 8 : 4);
                    QCOMPARE(scene.still.capture(10000), capture);
                }
            }
        }
    }
    void backdropResolutionAcrossShutter() {
        auto shape = leaf("base", "shape");
        shape.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}});
        auto adjustment = leaf("adjust", "adjustment");
        adjustment.insert("startMs", 1000);
        adjustment.insert("effects", QJsonArray{effect("levels", {{"gamma", 0.8}})});
        adjustment.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}});
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            Scene scene;
            QVERIFY(scene.initialize(document({shape, adjustment}), format));
            scene.still.compositor()->setPausedResolution(8);
            scene.clock.seek(990);
            QVERIFY(scene.render());
            QCOMPARE(scene.size, QSize(64, 32));
            const auto stable = scene.pixels;
            for (int i = 0; i < 8; ++i) {
                QVERIFY(scene.render());
                QCOMPARE(scene.size, QSize(64, 32));
                QCOMPARE(scene.pixels, stable);
            }
            scene.clock.seek(100);
            QVERIFY(scene.render());
            QCOMPARE(scene.size, QSize(8, 4));
        }
    }
    void identityShapeWorkingCapture() {
        auto shape = leaf("edge", "shape");
        shape.insert("width", 65); shape.insert("height", 49);
        shape.insert("shapeStyle", QJsonObject{{"kind", "rect"}, {"fill", "#7392ba"}});
        std::vector<float> control;
        QImage controlCapture;
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            Scene scene;
            QVERIFY(scene.initialize(document({shape}, 64, 48), format));
            QVERIFY(scene.render());
            const auto preview = scene.pixels;
            const auto capture = scene.still.capture(10000);
            QVERIFY(!capture.isNull());
            QCOMPARE(capture.format(), format == nt::WorkingFormat::Rgba8
                ? QImage::Format_RGBA8888_Premultiplied : QImage::Format_RGBA16FPx4_Premultiplied);
            if (format == nt::WorkingFormat::Rgba8) {
                control = preview;
                controlCapture = capture;
            } else {
                const auto a = controlCapture.convertToFormat(QImage::Format_RGBA32FPx4_Premultiplied);
                const auto b = capture.convertToFormat(QImage::Format_RGBA32FPx4_Premultiplied);
                float rgbDelta = 0, alphaDelta = 0, previewAlphaDelta = 0;
                for (int y = 0; y < a.height(); ++y) {
                    const auto* av = reinterpret_cast<const float*>(a.constScanLine(y));
                    const auto* bv = reinterpret_cast<const float*>(b.constScanLine(y));
                    for (int x = 0; x < a.width() * 4; ++x) {
                        auto& delta = x % 4 == 3 ? alphaDelta : rgbDelta;
                        delta = std::max(delta, std::abs(av[x] - bv[x]));
                    }
                }
                for (size_t i = 3; i < preview.size(); i += 4) {
                    previewAlphaDelta = std::max(previewAlphaDelta, std::abs(preview[i] - control[i]));
                }
                qInfo() << "identity working capture RGB/alpha codes" << rgbDelta * 255 << alphaDelta * 255
                        << "preview RGBA/alpha codes" << difference(control, preview) * 255 << previewAlphaDelta * 255;
                QVERIFY(rgbDelta <= 1.f / 255);
                QVERIFY(alphaDelta <= 1.f / 255);
                QVERIFY(difference(control, preview) <= 1.f / 255);
            }
        }
    }
    void straightLeafEdgeReference_data() {
        QTest::addColumn<bool>("withEffect");
        QTest::newRow("byte-source") << false;
        QTest::newRow("float-effect-result") << true;
    }
    void straightLeafEdgeReference() {
        QFETCH(bool, withEffect);
        QImage image(2, 2, QImage::Format_RGBA8888_Premultiplied);
        image.fill(Qt::transparent);
        image.setPixelColor(0, 0, Qt::red); image.setPixelColor(0, 1, Qt::red);
        const auto token = nt::registerLayerSource("video", [image](const nt::ActiveLayer&) {
            return std::make_unique<nt::test::PaintSource>(image);
        });
        const auto guard = qScopeGuard([&] { nt::unregisterLayerSource(token); });
        auto clip = leaf("edge", "video");
        clip.insert("width", 2); clip.insert("height", 2);
        if (withEffect) { clip.insert("effects", QJsonArray{effect("levels")}); }
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            Scene scene;
            QVERIFY(scene.initialize(document({clip}, 4, 4), format));
            QVERIFY(scene.render());
            // At x=1 the straight red and alpha are both 3/4. Placement
            // premultiplies after interpolation, so red is 9/16, not 3/4.
            const int i = (1 * 4 + 1) * 4;
            qInfo() << "edge reference mode/red/alpha" << int(format) << scene.pixels[i] << scene.pixels[i + 3];
            QVERIFY(std::abs(scene.pixels[i + 3] - 0.75f) <= 1.f / 255);
            QVERIFY(std::abs(scene.pixels[i] - 0.5625f) <= 1.f / 255);
        }
    }
    void previewOffscreenWorkingParity_data() {
        QTest::addColumn<bool>("floatSource");
        QTest::newRow("original-float-frame") << true;
        QTest::newRow("original-decoded-frame") << false;
    }
    void previewOffscreenWorkingParity() {
        QFETCH(bool, floatSource);
        const auto source = floatSource ? nt::registerLayerSource("video", [](const nt::ActiveLayer&) {
            return std::make_unique<FloatSource>(0.37f, true);
        }) : 0;
        const auto guard = qScopeGuard([&] { if (source) { nt::unregisterLayerSource(source); } });
        auto clip = leaf("original", "video");
        const auto path = floatSource ? QStringLiteral("original-frame")
            : QStringLiteral(NT_FIXTURES_DIR "/media/pip-a-720p.mp4");
        clip.insert("mediaPath", path);
        clip.insert("originalMediaPath", path);
        clip.insert("effects", QJsonArray{effect("levels", {{"gamma", 0.8}}),
            effect("grain", {{"amount", 0.3}, {"size", 2}, {"seed", 17}, {"animate", false}})});
        const auto timeline = nt::exporting::pictureTimeline(document({clip}));
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            Scene preview;
            QVERIFY(preview.initialize(timeline, format));
            preview.clock.seek(500);
            TimelineModel exportModel;
            exportModel.setTimeline(timeline);
            nt::exporting::OffscreenFrames offscreen(exportModel, format);
            const auto expected = offscreen.captureWorkingAt(500, [] { return false; });
            QVERIFY(!expected.isNull());
            QCOMPARE(expected.pixelColor(20, 20).alphaF(), 1.f);
            QVERIFY(expected.pixelColor(20, 20).valueF() > 0);
            for (const int denominator : {1, 2, 4, 8}) {
                auto* compositor = preview.still.compositor();
                compositor->setPausedResolution(denominator);
                compositor->setAlphaDisplay(true);
                compositor->setTransparencyGrid(true);
                compositor->setCanvasRegion(QRectF(0.2, 0.1, 0.5, 0.7));
                QVERIFY(preview.render());
                const auto captured = preview.still.capture(10000);
                QCOMPARE(captured, expected);
                QCOMPARE(offscreen.captureWorkingAt(500, [] { return false; }), expected);
            }
            auto wrongClip = clip;
            auto effects = wrongClip.value("effects").toArray();
            auto grain = effects[1].toObject();
            grain.insert("seed", 18);
            effects[1] = grain;
            wrongClip.insert("effects", effects);
            exportModel.setTimeline(document({wrongClip}));
            const auto changedSeed = offscreen.captureWorkingAt(500, [] { return false; });
            QVERIFY(!changedSeed.isNull());
            QVERIFY(changedSeed != expected);
            exportModel.setTimeline(timeline);
            QCOMPARE(offscreen.captureWorkingAt(500, [] { return false; }), expected);
            qInfo() << "preview/offscreen undithered parity" << int(format) << "exact at all four resolutions";
        }
    }
    void typedWorkingCapture() {
        const auto source = nt::registerLayerSource("video", [](const nt::ActiveLayer&) {
            return std::make_unique<FloatSource>(1.f, true);
        });
        const auto guard = qScopeGuard([&] { nt::unregisterLayerSource(source); });
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            Scene scene;
            QVERIFY(scene.initialize(document({leaf("capture", "video")}), format));
            auto* compositor = scene.still.compositor();
            compositor->setAlphaDisplay(false);
            QVERIFY(scene.render());
            const auto expected = scene.pixels;
            QImage previous;
            for (const int denominator : {1, 2, 4, 8}) {
                compositor->setPausedResolution(denominator);
                compositor->setAlphaDisplay(true);
                compositor->setTransparencyGrid(true);
                QVERIFY(scene.render());
                compositor->requestCapture();
                QElapsedTimer timeout; timeout.start();
                while (!compositor->captureReady() && timeout.elapsed() < 10000) { scene.still.frame(); }
                QVERIFY2(compositor->captureReady(), qPrintable(compositor->renderError()));
                const auto image = compositor->takeCapture();
                QVERIFY(!compositor->captureReady());
                QCOMPARE(image.size(), QSize(64, 32));
                const bool fp16 = format == nt::WorkingFormat::Rgba16F;
                QCOMPARE(image.format(), fp16 ? QImage::Format_RGBA16FPx4_Premultiplied
                                              : QImage::Format_RGBA8888_Premultiplied);
                QCOMPARE(image.bytesPerLine(), 64 * (fp16 ? 8 : 4));
                for (int y = 0; y < 32; ++y) {
                    for (int x = 0; x < 64 * 4; ++x) {
                        float actual;
                        if (fp16) {
                            qfloat16 value;
                            std::memcpy(&value, image.constScanLine(y) + x * 2, 2);
                            actual = float(value);
                        } else { actual = image.constScanLine(y)[x] / 255.f; }
                        QCOMPARE(actual, expected[(y * 64 * 4) + x]);
                    }
                }
                QVERIFY(image.pixelColor(12, 0).redF() < image.pixelColor(12, 31).redF());
                if (!previous.isNull()) { QCOMPARE(image, previous); }
                previous = image;
                // The owned capture remains valid after readback storage is reused.
                scene.still.frame();
                QCOMPARE(image, previous);
            }
            qInfo() << "typed working capture" << int(format) << "exact raw equality at Full/Half/Quarter/Eighth";
        }
    }
    void transferSurvivesLayerContracts() {
        QCOMPARE(nt::LayerFrame{}.transfer, std::string("unknown"));
        bool seen = false, valid = true;
        const auto source = nt::registerLayerSource("video", [](const nt::ActiveLayer&) {
            return std::make_unique<FloatSource>(1.f);
        });
        const auto probe = nt::registerEffectStage([&] { return std::make_unique<TransferProbe>(seen, valid); });
        const auto guard = qScopeGuard([&] {
            nt::unregisterEffectStage(probe);
            nt::unregisterLayerSource(source);
        });
        auto clip = leaf("transfer", "video");
        clip.insert("effects", QJsonArray{effect("levels", {{"gamma", 0.8}})});
        clip.insert("shapeMask", QJsonObject{{"kind", "ellipse"}});
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            seen = false;
            Scene scene;
            QVERIFY(scene.initialize(document({clip}), format));
            QVERIFY(scene.render());
            QVERIFY(seen);
            QVERIFY(valid);
        }
    }
    void rejectsInvalidPixels() {
        Scene scene;
        scene.pixels = {1.f, 0.f, 0.f, 1.f}; QVERIFY(scene.finiteNonblack());
        scene.pixels[0] = std::numeric_limits<float>::quiet_NaN(); QVERIFY(!scene.finiteNonblack());
        scene.pixels[0] = std::numeric_limits<float>::infinity(); QVERIFY(!scene.finiteNonblack());
        scene.pixels = {0.f, 0.f, 0.f, 1.f}; QVERIFY(!scene.finiteNonblack());
    }
    void inverseLevelsAndTinyAlpha() {
        for (const float alpha : {1.f, 0.001f, 1e-5f, 1e-7f, 0.f}) {
            const auto token = nt::registerLayerSource("video", [alpha](const nt::ActiveLayer&) {
                return std::make_unique<FloatSource>(alpha);
            });
            const auto guard = qScopeGuard([token] { nt::unregisterLayerSource(token); });
            for (const bool denoise : {false, true}) {
                auto clip = leaf("source", "video");
                // Below 1e-4, compressing RGB by ten intentionally underflows half storage.
                // Tiny-alpha safety uses identity Levels followed by denoise instead.
                const double white = alpha < 1e-4f ? 1.0 : 0.1;
                QJsonArray effects{effect("levels", {{"outWhite", white}}), effect("levels", {{"inWhite", white}})};
                if (denoise) { effects.append(effect("denoise", {{"lumaStrength", 1}, {"chromaStrength", 1}, {"radius", 1}})); }
                clip.insert("effects", effects);
                clip.insert("parentId", "group"); clip.insert("blendMode", "screen");
                auto group = leaf("group", "group");
                group.insert("effects", QJsonArray{effect("levels")});
                const auto timeline = document({group, clip});
                float errors[2]{};
                int mode = 0;
                for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
                    Scene scene; QVERIFY(scene.initialize(timeline, format)); QVERIFY(scene.render());
                    QCOMPARE(scene.storage, format == nt::WorkingFormat::Rgba16F ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8);
                    if (alpha > 0) { QVERIFY(format == nt::WorkingFormat::Rgba8 || scene.finiteNonblack()); }
                    else { for (float value : scene.pixels) { QCOMPARE(value, 0.f); } }
                    // Denoise intentionally changes the ramp. Only check finiteness there.
                    if (!denoise) {
                        for (int x = 0; x < 64; ++x) {
                            const float expected = float(qfloat16(float(x + 1) / 65 * alpha));
                            errors[mode] = std::max(errors[mode], std::abs(scene.pixels[(16 * 64 + x) * 4] - expected));
                        }
                        qInfo() << "numerical mode" << int(format) << "alpha" << alpha << "error" << errors[mode];
                        if (format == nt::WorkingFormat::Rgba16F) {
                            QVERIFY2(errors[mode] <= std::max(2e-7f, alpha * 0.002f), "full scene inverse Levels error");
                        }
                    }
                    ++mode;
                }
                if (!denoise) {
                    qInfo() << "scene alpha" << alpha << "byte error" << errors[0] << "float error" << errors[1];
                    if (alpha > 0) { QVERIFY(errors[1] < errors[0]); }
                }
            }
        }
    }
    void ancillaryTemporalResizeAndCost() {
        auto shape = leaf("shape", "shape"); shape.insert("parentId", "group");
        shape.insert("effects", QJsonArray{effect("blur", {{"radius", 2}})});
        shape.insert("transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 400}});
        shape.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}});
        shape.insert("mask", QJsonObject{{"kind", "ellipse"}, {"featherPx", 2}});
        auto text = leaf("text", "text"); text.insert("text", "FP16"); text.insert("parentId", "group");
        auto group = leaf("group", "group"); group.insert("opacity", 0.8);
        group.insert("effects", QJsonArray{effect("levels")});
        const auto timeline = document({group, shape, text}, 640, 360);
        std::vector<float> control;
        for (const auto format : {nt::WorkingFormat::Rgba8, nt::WorkingFormat::Rgba16F}) {
            Scene scene; QVERIFY(scene.initialize(timeline, format)); scene.clock.seek(200);
            QVERIFY(scene.render()); QVERIFY(scene.finiteNonblack());
            if (format == nt::WorkingFormat::Rgba8) { control = scene.pixels; }
            else {
                const float delta = difference(control, scene.pixels);
                qInfo() << "ancillary scene max delta" << delta;
                QVERIFY2(delta <= 4.f / 255, "four byte quantization steps across group, blur and composition");
            }
            QVERIFY(scene.previousFrames > 0);
            const auto stable = scene.pixels;
            std::int64_t nowNs = 0;
            scene.clock.setNowSource([&nowNs] { return nowNs; });
            scene.clock.play(); QVERIFY(scene.render());
            nowNs += 33333333; scene.clock.tick(); QVERIFY(scene.render());
            QVERIFY(scene.copiedFrames > 0);
            scene.clock.pause();
            for (const double time : {700., 200., 1100., 200.}) {
                scene.clock.seek(time); QVERIFY(scene.render()); QVERIFY(scene.finiteNonblack());
                if (time == 200) { QCOMPARE(scene.pixels, stable); }
            }
            const int copiesBeforeReplacement = scene.copiedFrames;
            scene.model.setTimeline(timeline);
            scene.still.frame();
            QVERIFY(!scene.settled);
            if (format == nt::WorkingFormat::Rgba16F) { QCOMPARE(scene.copiedFrames, copiesBeforeReplacement); }
            QVERIFY(scene.render()); QCOMPARE(scene.pixels, stable);
            for (const int denominator : {2, 4, 1}) {
                scene.still.compositor()->setPausedResolution(denominator);
                QVERIFY(scene.render()); QVERIFY(scene.finiteNonblack());
                // Group effects deliberately require the full canvas.
                QCOMPARE(scene.size, QSize(640, 360));
            }
            for (const auto next : {nt::WorkingFormat::Rgba16F, nt::WorkingFormat::Rgba8, format}) {
                scene.still.compositor()->setWorkingFormat(next); QVERIFY(scene.render()); QVERIFY(scene.finiteNonblack());
                QCOMPARE(scene.storage, next == nt::WorkingFormat::Rgba16F ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8);
            }
            scene.still.compositor()->setWorkingFormat(format); QVERIFY(scene.render());
            QElapsedTimer timer; timer.start();
            for (int i = 0; i < 32; ++i) { scene.clock.seek(500 + i * 10); QVERIFY(scene.render()); }
            double cpu = 0; const auto& stats = scene.still.stats();
            for (const auto& stat : stats) { cpu += stat.renderCpuMs; QVERIFY(stat.resourceFailures == 0); }
            qInfo() << "PRELIMINARY format" << int(format) << "wall ms/settled frame incl typed readback" << timer.nsecsElapsed() / 1e6 / 32
                    << "recording ms/render (whole run)" << cpu / stats.size() << "surface bytes" << stats.back().surfaceBytes << "peak GPU allocator used bytes" << scene.peakGpuBytes;
        }
        Scene resize; QVERIFY(resize.initialize(document({leaf("shape", "shape")}), nt::WorkingFormat::Rgba16F));
        for (const auto size : {QSize(96, 48), QSize(32, 16), QSize(64, 32)}) {
            resize.model.setTimeline(document({leaf("shape", "shape")}, size.width(), size.height()));
            QVERIFY(resize.render()); QCOMPARE(resize.size, size); QVERIFY(resize.finiteNonblack());
        }
        for (const int denominator : {2, 4, 8, 1}) {
            resize.still.compositor()->setPausedResolution(denominator);
            QVERIFY(resize.render()); QCOMPARE(resize.size, QSize(64 / denominator, 32 / denominator));
            QVERIFY(resize.finiteNonblack());
        }
    }
    void decodedScrubAndEdits() {
        auto clip = leaf("decoded", "video");
        clip.insert("crop", QJsonObject{{"left", 0.45}, {"right", 0.45}, {"top", 0.45}, {"bottom", 0.45}});
        auto timeline = [&](int iteration) {
            clip.insert("mediaPath", QStringLiteral(NT_FIXTURES_DIR "/media/") +
                (iteration % 2 ? "pip-a-720p.mp4" : "pip-b-720p.mp4"));
            clip.insert("effects", QJsonArray{effect("denoise", {{"temporalStrength", 0.3}}),
                effect("levels", {{"gamma", 1.0 + (iteration % 3) * 0.1}})});
            return document({clip});
        };
        Scene scene; QVERIFY(scene.initialize(timeline(0), nt::WorkingFormat::Rgba16F));
        // Each edit replaces the current/before/after workers. Retirement is
        // asynchronous, even when cached frames make the picture exact already.
        constexpr int decodersPerEdit = 3;
        constexpr int editsPerBurst = 10;
        constexpr int burstDecoderBudget = decodersPerEdit * (editsPerBurst + 1);
        int peakDecoders = 0;
        qint64 longestDrainMs = 0;
        long long peakBytes = 0;
        quint64 warmGpuBytes = 0;
#if defined(Q_OS_LINUX)
        long warmRss = 0;
#endif
        for (int i = 0; i < 60; ++i) {
            auto edited = timeline(i);
            if (i % 10 == 0) { scene.model.setTimeline(std::move(edited)); }
            else { QVERIFY(scene.model.replaceClips(QJsonArray{clip})); }
            scene.clock.seek(i % 3 == 0 ? 1200 : i % 3 == 1 ? 800 : 100);
            QVERIFY2(scene.render(), "decoded frame failed to settle"); QVERIFY(scene.finiteNonblack());
            scene.still.frame();
            const auto stat = scene.still.stats().back();
            QVERIFY(stat.mediaLayers > 0);
            QVERIFY(!scene.still.compositor()->mediaReport().empty());
            QVERIFY(stat.allExact); QCOMPARE(stat.missingMediaLayers, 0); QCOMPARE(stat.resourceFailures, 0);
            // One active set plus at most one retiring set per edit in this
            // burst. Draining between bursts prevents growth across all 60 edits.
            peakDecoders = std::max(peakDecoders, stat.openDecoders);
            QVERIFY2(stat.openDecoders <= burstDecoderBudget,
                qPrintable(QStringLiteral("iteration %1: %2 open decoders, budget %3")
                    .arg(i).arg(stat.openDecoders).arg(burstDecoderBudget)));

            peakBytes = std::max(peakBytes, stat.surfaceBytes);
#if defined(Q_OS_LINUX)
            QFile status("/proc/self/status"); QVERIFY(status.open(QIODevice::ReadOnly));
            const auto lines = status.readAll().split('\n');
            long rss = 0;
            for (const auto& line : lines) {
                if (line.startsWith("VmRSS:")) { rss = line.simplified().split(' ')[1].toLong(); }
            }
            QVERIFY(rss > 0);
            if (i == 29) { warmRss = rss; }
            if (i == 59) {
                qInfo() << "warm/end RSS KiB" << warmRss << rss;
                QVERIFY(rss <= warmRss + 64 * 1024);
            }
#endif
            if (i == 29) { warmGpuBytes = scene.gpuBytes; }
            if (i == 59) { QVERIFY(scene.gpuBytes <= warmGpuBytes + 16 * 1024 * 1024); }
            for (const auto& report : scene.still.compositor()->mediaReport()) { QVERIFY2(report.ok, qPrintable(report.reason)); }
            if ((i + 1) % editsPerBurst == 0) {
                QElapsedTimer closing; closing.start();
                while (scene.still.stats().back().openDecoders > decodersPerEdit && closing.elapsed() < 5000) {
                    QThread::msleep(5);
                    scene.still.frame();
                }
                const int settledDecoders = scene.still.stats().back().openDecoders;
                longestDrainMs = std::max(longestDrainMs, closing.elapsed());
                qInfo() << "decoder burst ending" << i << "peak" << peakDecoders
                        << "settled" << settledDecoders << "drain ms" << closing.elapsed();
                QCOMPARE(settledDecoders, decodersPerEdit);
            }
        }
        qInfo() << "decoder peak" << peakDecoders << "longest drain ms" << longestDrainMs;
        qInfo() << "decoded 60 switches/backward seeks/effect replacements peak pooled surface bytes" << peakBytes << "peak GPU allocator used bytes" << scene.peakGpuBytes
                << "warm/end GPU bytes" << warmGpuBytes << scene.gpuBytes;
#if defined(Q_OS_LINUX)
        rusage usage{}; QVERIFY(getrusage(RUSAGE_SELF, &usage) == 0);
        qInfo() << "process peak RSS KiB (includes earlier scenes)" << usage.ru_maxrss;
#endif
        QVERIFY(peakBytes <= 1280 * 720 * 8 * 16);
    }
};
QTEST_MAIN(TestScenePrecision)
#include "tst_sceneprecision.moc"
