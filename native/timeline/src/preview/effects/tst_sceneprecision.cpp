#include "preview/layers/TestStill.h"
#include "model/TimelineJson.h"
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
    std::unique_ptr<QRhiTexture> m_texture;
public:
    explicit FloatSource(float alpha) : m_alpha(alpha) {}
    QSize frameSize() const override { return {64, 32}; }
    nt::LayerFrame frameAt(const nt::FrameContext& ctx, double) override {
        if (!m_texture) {
            m_texture.reset(ctx.rhi->newTexture(QRhiTexture::RGBA16F, frameSize()));
            if (!m_texture->create()) { return {}; }
            std::vector<qfloat16> pixels(64 * 32 * 4);
            for (int i = 0; i < 64 * 32; ++i) {
                const float gray = float(i % 64 + 1) / 65;
                for (int c = 0; c < 3; ++c) { pixels[i * 4 + c] = qfloat16(gray * m_alpha); }
                pixels[i * 4 + 3] = qfloat16(m_alpha);
            }
            ctx.updates->uploadTexture(m_texture.get(), QRhiTextureUploadDescription{{{0, 0,
                QRhiTextureSubresourceUploadDescription(pixels.data(), int(pixels.size() * sizeof(qfloat16)))}}});
        }
        nt::LayerFrame frame;
        frame.format = nt::LayerFrame::rgbaFormat(m_texture.get());
        frame.planes[0] = m_texture.get(); frame.size = frameSize();
        return frame;
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
            readback.completed = [this, fp16] {
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
        resize.still.compositor()->requestCapture(); resize.still.frame(); resize.still.frame();
        QVERIFY(!resize.still.compositor()->captureReady());
        QVERIFY(resize.still.compositor()->renderError().contains("N2 delivery boundary"));
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
            const auto& stat = scene.still.stats().back();
            QVERIFY(stat.mediaLayers > 0);
            QVERIFY(!scene.still.compositor()->mediaReport().empty());
            QVERIFY(stat.allExact); QCOMPARE(stat.missingMediaLayers, 0); QCOMPARE(stat.resourceFailures, 0);
            // Two media paths, each with current/before/after temporal sources.
            QVERIFY(stat.openDecoders <= 6);
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
        }
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
