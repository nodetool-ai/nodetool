// A keyed value changes the picture at two times, the same way in the preview compositor and in
// the offscreen frames the export renders, each from a document built by the keyframes.* edits.
#include "app/EditRegistry.h"
#include "edit/keyframes/Keyframes.h"
#include "export/OffscreenFrames.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include "preview/SceneEval.h"
#include "preview/crop/Reframe.h"
#include "scene/ParamCurves.h"
#include "preview/layers/TestStill.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>
#include <algorithm>

namespace {
constexpr int kWidth = 128;
constexpr int kHeight = 96;
constexpr double kEndMs = 1000;
QJsonObject tile(const QString& id, const QJsonObject& transform) {
    return {{"id", id},          {"trackId", "v"},  {"mediaType", "shape"},
            {"startMs", 0},      {"durationMs", kEndMs}, {"width", 64},
            {"height", 32},      {"shapeStyle", QJsonObject{{"kind", "rect"}}}, {"transform", transform}};
}
QJsonObject half() {
    return {{"position", QJsonObject{{"x", 0}, {"y", 0}}},
            {"scale", QJsonObject{{"x", 0.5}, {"y", 0.5}}},
            {"rotation", 0},
            {"anchor", QJsonObject{{"x", 0.5}, {"y", 0.5}}}};
}
nt::Timeline document(const QJsonArray& clips, const QJsonObject& extra = {}) {
    QJsonObject raw{{"fps", 30}, {"width", kWidth}, {"height", kHeight}, {"durationMs", kEndMs},
                    {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}}, {"clips", clips}};
    for (auto i = extra.begin(); i != extra.end(); ++i) { raw.insert(i.key(), i.value()); }
    return *nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline;
}
QImage preview(TimelineModel& model, double timeMs) {
    PlaybackClock clock;
    clock.setDurationMs(kEndMs);
    clock.seek(timeMs);
    nt::test::Still still;
    if (!still.initialize(model)) { return {}; }
    still.setClock(&clock);
    return still.capture(15000).convertToFormat(QImage::Format_RGBA8888);
}
// As the export does: the picture timeline in a model of its own, a frame at a time.
QImage exported(const TimelineModel& source, double timeMs) {
    TimelineModel model;
    model.setTimeline(nt::exporting::pictureTimeline(source.timeline()));
    nt::exporting::OffscreenFrames frames(model);
    return frames.captureAt(timeMs, [] { return false; }).convertToFormat(QImage::Format_RGBA8888);
}
// How many pixels differ by more than a rounding error.
int changed(const QImage& a, const QImage& b) {
    int count = 0;
    for (int y = 0; y < a.height(); ++y) {
        for (int x = 0; x < a.width(); ++x) {
            const auto p = a.pixelColor(x, y), q = b.pixelColor(x, y);
            if (std::max({std::abs(p.red() - q.red()), std::abs(p.green() - q.green()), std::abs(p.blue() - q.blue())}) > 8) {
                ++count;
            }
        }
    }
    return count;
}
void keyRow(TimelineModel& model, const QString& row, int input, double first, double second) {
    QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", row}, {"atMs", 0}}));
    // No change when the new key already holds the value.
    model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", row}, {"input", input}, {"value", first}, {"atMs", 0}});
    QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", row}, {"input", input}, {"value", second}, {"atMs", kEndMs}}));
}
// The two times differ on screen, and each frame agrees between preview and export.
void checkFrames(TimelineModel& model) {
    const auto previewStart = preview(model, 0);
    const auto previewEnd = preview(model, kEndMs - 1);
    const auto exportStart = exported(model, 0);
    const auto exportEnd = exported(model, kEndMs - 1);
    QVERIFY(!previewStart.isNull() && !previewEnd.isNull() && !exportStart.isNull() && !exportEnd.isNull());
    QCOMPARE(previewStart.size(), QSize(kWidth, kHeight));
    QCOMPARE(exportStart.size(), QSize(kWidth, kHeight));
    QVERIFY2(changed(previewStart, previewEnd) > 40, "the keyed value must change the preview");
    QVERIFY2(changed(exportStart, exportEnd) > 40, "the keyed value must change the export");
    QVERIFY2(changed(previewStart, exportStart) < 8, "preview and export must agree at the first key");
    QVERIFY2(changed(previewEnd, exportEnd) < 8, "preview and export must agree at the last key");
}
}  // namespace

class TestKeyedRender : public QObject {
    Q_OBJECT
    std::vector<nt::LayerSourceToken> m_sources;
private slots:
    void initTestCase() {
        m_sources.push_back(nt::registerLayerSource("shape", [](const nt::ActiveLayer& layer) {
            // Four quarters, so that a turn or a flip shows.
            QImage image(layer.sourceWidth, layer.sourceHeight, QImage::Format_RGBA8888_Premultiplied);
            const bool other = layer.clipId == "other";
            for (int y = 0; y < image.height(); ++y) {
                for (int x = 0; x < image.width(); ++x) {
                    const bool left = x < image.width() / 2, top = y < image.height() / 2;
                    image.setPixelColor(x, y, other ? QColor(240, 240, 240)
                                              : left && top ? QColor(220, 40, 40)
                                              : left ? QColor(40, 220, 40)
                                              : top ? QColor(40, 40, 220) : QColor(220, 220, 40));
                }
            }
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        }));
    }
    void motionRows_data() {
        QTest::addColumn<QString>("row");
        QTest::addColumn<int>("input");
        QTest::addColumn<double>("first");
        QTest::addColumn<double>("second");
        QTest::newRow("anchor x") << "anchor" << 0 << 0.0 << 1.0;
        QTest::newRow("anchor y") << "anchor" << 1 << 0.0 << 1.0;
        QTest::newRow("rotation x") << "rotationX" << 0 << 0.0 << 70.0;
        QTest::newRow("rotation y") << "rotationY" << 0 << 0.0 << 70.0;
        QTest::newRow("perspective") << "perspective" << 0 << 60.0 << 5000.0;
    }
    void motionRows() {
        QFETCH(QString, row);
        QFETCH(int, input);
        QFETCH(double, first);
        QFETCH(double, second);
        auto transform = half();
        // Perspective shows only on a turned layer.
        if (row == "perspective") { transform.insert("rotationY", 50); }
        TimelineModel model;
        model.setTimeline(document({tile("c", transform)}));
        keyRow(model, row, input, first, second);
        if (QTest::currentTestFailed()) { return; }
        checkFrames(model);
    }
    void cropAndCorners_data() {
        QTest::addColumn<QString>("row");
        QTest::addColumn<double>("first");
        QTest::addColumn<double>("second");
        QTest::newRow("crop left") << "cropLeft" << 0.0 << 0.6;
        QTest::newRow("crop top") << "cropTop" << 0.0 << 0.6;
        QTest::newRow("crop right") << "cropRight" << 0.0 << 0.6;
        QTest::newRow("crop bottom") << "cropBottom" << 0.0 << 0.6;
        QTest::newRow("corners") << "borderRadius" << 0.0 << 16.0;
    }
    void cropAndCorners() {
        QFETCH(QString, row);
        QFETCH(double, first);
        QFETCH(double, second);
        TimelineModel model;
        model.setTimeline(document({tile("c", half())}));
        keyRow(model, row, 0, first, second);
        if (QTest::currentTestFailed()) { return; }
        checkFrames(model);
    }
    // One generic path, so a sample of what the Effects panel adds, each with a visible change.
    void effectParams_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<QString>("param");
        QTest::addColumn<double>("first");
        QTest::addColumn<double>("second");
        QTest::newRow("blur") << "blur" << "radius" << 0.0 << 12.0;
        QTest::newRow("exposure") << "exposure" << "exposure" << -2.0 << 2.0;
        QTest::newRow("levels gamma") << "levels" << "gamma" << 0.4 << 2.5;
        QTest::newRow("levels white") << "levels" << "outWhite" << 1.0 << 0.2;
        QTest::newRow("pixelate") << "pixelate" << "cellSize" << 1.0 << 24.0;
        QTest::newRow("posterize") << "posterize" << "levels" << 256.0 << 2.0;
        QTest::newRow("directional blur") << "directionalBlur" << "radius" << 0.0 << 20.0;
        QTest::newRow("lens distortion") << "lensDistortion" << "amount" << 0.0 << 0.9;
        QTest::newRow("glow") << "glow" << "intensity" << 0.0 << 2.0;
        QTest::newRow("drop shadow offset") << "dropShadow" << "offsetX" << 0.0 << 24.0;
        QTest::newRow("drop shadow opacity") << "dropShadow" << "opacity" << 0.0 << 1.0;
        QTest::newRow("chroma key") << "chromaKey" << "tolerance" << 0.0 << 0.5;
        QTest::newRow("secondary hue") << "secondaryColor" << "hueShift" << 0.0 << 120.0;
    }
    void effectParams() {
        QFETCH(QString, type);
        QFETCH(QString, param);
        QFETCH(double, first);
        QFETCH(double, second);
        auto clip = tile("c", half());
        QJsonObject effect{{"id", "e"}, {"type", type}, {"enabled", true}};
        if (type == "glow") { effect.insert("radius", 12); }
        if (type == "dropShadow") { effect.insert("blur", 2); effect.insert("offsetX", 8); effect.insert("offsetY", 8); effect.insert("color", "#ffffff"); effect.insert("opacity", 1); }
        if (type == "chromaKey") { effect.insert("color", "#be3c3c"); effect.insert("softness", 0.01); }
        clip.insert("effects", QJsonArray{effect});
        TimelineModel model;
        model.setTimeline(document({clip}));
        keyRow(model, nt::scene::effectCurveName("e", param), 0, first, second);
        if (QTest::currentTestFailed()) { return; }
        checkFrames(model);
    }
    // A switched-off effect draws nothing, and keeps its keys for when it comes back.
    void switchedOffEffectKeepsItsKeys() {
        auto clip = tile("c", half());
        clip.insert("effects", QJsonArray{QJsonObject{{"id", "e"}, {"type", "exposure"}, {"enabled", true}}});
        TimelineModel model;
        model.setTimeline(document({clip}));
        keyRow(model, "effect:e:exposure", 0, -2, 2);
        const auto curves = model.clipsJson()[0].toObject().value("paramCurves");
        auto next = model.clipsJson()[0].toObject();
        next.insert("effects", QJsonArray{QJsonObject{{"id", "e"}, {"type", "exposure"}, {"enabled", false}}});
        QVERIFY(model.replaceClips(QJsonArray{next}));
        QCOMPARE(model.clipsJson()[0].toObject().value("paramCurves"), curves);
        const auto start = exported(model, 0), end = exported(model, kEndMs - 1);
        QCOMPARE(changed(start, end), 0);
    }
    // Depth moves the layer through the stack, and through the camera.
    void depthOrdersTheStack() {
        TimelineModel model;
        model.setTimeline(document({tile("other", half()), tile("c", half())}));
        keyRow(model, "depth", 0, -10, 10);
        if (QTest::currentTestFailed()) { return; }
        const auto start = nt::evaluateScene(*model.snapshot(), 0);
        const auto end = nt::evaluateScene(*model.snapshot(), kEndMs - 1);
        QCOMPARE(start.layers.size(), size_t(2));
        QCOMPARE(start.layers.front().clipId, std::string("c"));
        QCOMPARE(end.layers.back().clipId, std::string("c"));
        checkFrames(model);
    }
    void depthMovesThroughTheCamera() {
        TimelineModel model;
        model.setTimeline(document({tile("c", half())}, {{"camera2d", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}, {"depthPx", 0}, {"focalLengthPx", 500}}}}));
        keyRow(model, "depth", 0, 0, 250);
        if (QTest::currentTestFailed()) { return; }
        checkFrames(model);
    }
};
QTEST_MAIN(TestKeyedRender)
#include "tst_keyedrender.moc"
