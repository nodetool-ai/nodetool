#include "ClipInspectorController.h"
#include "Keyframes.h"
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "preview/SceneEval.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QtTest>

static nt::Timeline fixture() {
    auto parsed = nt::parseTimelineJson(
        R"({"name":"Inspector","width":640,"height":360,"fps":30,"durationMs":2000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"c","trackId":"v","mediaType":"image","name":"Picture","startMs":0,"durationMs":2000,"opacity":0.8,"customField":"keep"}]})");
    return std::move(*parsed.timeline);
}
class TestKeyframes : public QObject {
    Q_OBJECT
  private slots:
    void transformEditsUndo() {
        nt::app::registerEdit("keyframes.input", nt::keyframes::edit);
        TimelineModel model;
        model.setTimeline(fixture());
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit(
            "keyframes.input",
            {{"clipId", "c"}, {"action", "input"}, {"row", "position"}, {"input", 0}, {"value", 42}, {"atMs", 0}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.clipsJson()[0].toObject()["transform"].toObject()["position"].toObject()["x"].toDouble(), 42.0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(model.clipsJson()[0].toObject()["customField"].toString(), QString("keep"));
    }
    void largeCurve() {
        QJsonArray kfs;
        constexpr int count = 32000;
        for (int i = 0; i < count; ++i) {
            kfs.append(QJsonObject{{"t", double(i) / (count - 1)}, {"value", i}});
        }
        const QJsonObject curve{{"property", "offsetX"}, {"keyframes", kfs}};
        QJsonObject clip{
            {"durationMs", count - 1},
            {"animations", QJsonArray{QJsonObject{{"id", "large"},
                                                  {"preset", "custom"},
                                                  {"role", "emphasis"},
                                                  {"params", QJsonObject{{"keyframed", true}}},
                                                  {"custom", QJsonObject{{"curves", QJsonArray{curve}}}}}}}};
        QCOMPARE(nt::keyframes::times(clip).size(), count);
        const auto moved = nt::keyframes::helper("moveKeyframes", {clip, QJsonArray{"offsetX"}, 0, 30000});
        clip.insert("animations", moved);
        // moveKeyframes in the TypeScript oracle returns 31993 keys: its
        // normalized-time tolerance also replaces the target's near neighbours.
        QCOMPARE(nt::keyframes::times(clip).size(), 31993);
        QCOMPARE(nt::keyframes::times(clip).first().toInt(), 1);
    }
    void spatialFieldsUndo() {
        for (const auto& field :
             QStringList{"anchorX", "anchorY", "rotationX", "rotationY", "perspective", "depthPx"}) {
            TimelineModel model;
            model.setTimeline(fixture());
            ClipInspectorController controller;
            controller.setTimeline(&model);
            controller.setClipId("c");
            const auto before = model.documentJson();
            const double value = field.startsWith("anchor") ? 0.25 : 25;
            QVERIFY(controller.write({{"action", "field"}, {"field", field}, {"value", value}}));
            QCOMPARE(controller.fieldValue(field), value);
            QCOMPARE(model.undoStack()->count(), 1);
            model.undoStack()->undo();
            QCOMPARE(model.documentJson(), before);
        }
    }
    void everyRowInputUndo() {
        for (const auto& row : nt::keyframes::rowSpecs()) {
            const auto spec = row.toObject();
            for (int index = 0; index < spec["inputs"].toArray().size(); ++index) {
                TimelineModel model;
                model.setTimeline(fixture());
                const auto before = model.documentJson();
                QVERIFY(model.applyEdit(
                    "keyframes.input",
                    {{"clipId", "c"}, {"row", spec["id"]}, {"input", index}, {"value", 0.7}, {"atMs", 0}}));
                QCOMPARE(model.undoStack()->count(), 1);
                model.undoStack()->undo();
                QCOMPARE(model.documentJson(), before);
            }
        }
    }
    void retimeAllAndStep() {
        TimelineModel model;
        model.setTimeline(fixture());
        PlaybackClock clock;
        clock.setDurationMs(2000);
        ClipInspectorController controller;
        controller.setTimeline(&model);
        controller.setClock(&clock);
        controller.setClipId("c");
        QVERIFY(controller.write({{"action", "stopwatch"}, {"row", "position"}}));
        QVERIFY(controller.write({{"action", "stopwatch"}, {"row", "opacity"}}));
        const auto before = model.documentJson();
        QVERIFY(controller.write({{"action", "move"}, {"fromMs", 0}, {"toMs", 600}}));
        QCOMPARE(model.undoStack()->count(), 3);
        QCOMPARE(nt::keyframes::times(model.clipsJson()[0].toObject()), QJsonArray{600});
        for (const auto& row : QStringList{"position", "opacity"}) {
            QCOMPARE(nt::keyframes::times(model.clipsJson()[0].toObject(), nt::keyframes::properties(row)),
                     QJsonArray{600});
        }
        const auto snapshot = model.snapshot();
        controller.step("position", 1);
        QCOMPARE(clock.time(), 600.0);
        QCOMPARE(model.snapshot(), snapshot);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
    }
    void gestureCancellationAndDocumentReplacement() {
        TimelineModel model;
        model.setTimeline(fixture());
        ClipInspectorController controller;
        controller.setTimeline(&model);
        controller.setClipId("c");
        const QVariantMap value{{"action", "field"}, {"field", "anchorX"}, {"value", 0.3}};
        const auto before = model.documentJson();
        controller.beginGesture();
        controller.preview(value);
        controller.cancelGesture();
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
        controller.beginGesture();
        controller.preview(value);
        model.setTimeline(fixture());
        const auto replacement = model.documentJson();
        controller.commit(value);
        // A release belonging to the previous document must not write here.
        QCOMPARE(model.documentJson(), replacement);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void lockedClipAndTrack() {
        for (const bool trackLock : {false, true}) {
            TimelineModel model;
            auto doc = fixture().raw;
            auto array = doc[trackLock ? "tracks" : "clips"].toArray();
            auto item = array[0].toObject();
            item.insert("locked", true);
            array[0] = item;
            doc.insert(trackLock ? "tracks" : "clips", array);
            auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
            QVERIFY(parsed.timeline);
            model.setTimeline(std::move(*parsed.timeline));
            ClipInspectorController controller;
            controller.setTimeline(&model);
            controller.setClipId("c");
            QVERIFY(controller.locked());
            QVERIFY(!controller.write({{"action", "field"}, {"field", "anchorX"}, {"value", 0.3}}));
            QCOMPARE(model.undoStack()->count(), 0);
        }
    }
    void gestureSingleUndo() {
        TimelineModel model;
        model.setTimeline(fixture());
        PlaybackClock clock;
        clock.setDurationMs(2000);
        ClipInspectorController controller;
        controller.setTimeline(&model);
        controller.setClock(&clock);
        controller.setClipId("c");
        const auto before = model.documentJson();
        const QVariantMap value{{"action", "input"}, {"row", "position"}, {"input", 0}, {"value", 33}};
        controller.beginGesture();
        controller.preview(value);
        const auto scene = nt::evaluateScene(*model.snapshot(), 100);
        QVERIFY(scene.layers[0].transform);
        QCOMPARE(scene.layers[0].transform->position.x, 33.0);
        QCOMPARE(model.undoStack()->count(), 0);
        controller.commit(value);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        const auto snapshot = model.snapshot();
        clock.seek(1000);
        QCOMPARE(changes.count(), 0);
        QCOMPARE(model.snapshot(), snapshot);
    }
    void previewTransformNextFrame() {
        nt::app::registerEdit("keyframes.input", nt::keyframes::edit);
        TimelineModel model;
        model.setTimeline(fixture());
        const auto old = model.snapshot();
        QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        QVERIFY(model.applyEdit(
            "keyframes.input",
            {{"clipId", "c"}, {"action", "input"}, {"row", "position"}, {"input", 0}, {"value", 73}, {"atMs", 0}}));
        QCOMPARE(changes.count(), 1);
        const auto frame = nt::evaluateScene(*model.snapshot(), 100);
        QCOMPARE(frame.layers.size(), size_t(1));
        QVERIFY(frame.layers[0].transform);
        QCOMPARE(frame.layers[0].transform->position.x, 73.0);
        QVERIFY(old != model.snapshot());
    }
    void previewKeyframeNextFrame() {
        nt::app::registerEdit("keyframes.input", nt::keyframes::edit);
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch",
                                {{"clipId", "c"}, {"action", "stopwatch"}, {"row", "opacity"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit(
            "keyframes.input",
            {{"clipId", "c"}, {"action", "input"}, {"row", "opacity"}, {"input", 0}, {"value", 0.2}, {"atMs", 0}}));
        QCOMPARE(nt::evaluateScene(*model.snapshot(), 100).layers[0].opacity, 0.2);
        model.undoStack()->undo();
        QCOMPARE(nt::evaluateScene(*model.snapshot(), 100).layers[0].opacity, 0.8);
    }
};
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (app.arguments().contains("--helpers")) {
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) {
            return 1;
        }
        const auto requests = QJsonDocument::fromJson(input.readAll()).array();
        QJsonArray results;
        for (const auto& request : requests) {
            const auto pair = request.toArray();
            results.append(nt::keyframes::helper(pair[0].toString(), pair[1].toArray()));
        }
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) {
            return 1;
        }
        output.write(QJsonDocument(results).toJson(QJsonDocument::Compact));
        return 0;
    }
    TestKeyframes test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_keyframes.moc"
