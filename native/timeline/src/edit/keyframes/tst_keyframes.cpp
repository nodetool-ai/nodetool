#include "ClipInspectorController.h"
#include "Keyframes.h"
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "preview/SceneEval.h"
#include "edit/ClipOps.h"
#include "preview/crop/Reframe.h"
#include "scene/Animation.h"
#include "scene/SideCurves.h"
#include <QCoreApplication>
#include <QElapsedTimer>
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
    // Backlog B13: past the clip's end the row reads the endpoint and Previous works.
    void pastEndShowsEndpointAndPrevious() {
        auto timeline = fixture();
        TimelineModel model;
        model.setTimeline(std::move(timeline));
        PlaybackClock clock;
        clock.setDurationMs(5000);
        ClipInspectorController controller;
        controller.setTimeline(&model);
        controller.setClock(&clock);
        controller.setClipId("c");
        QVERIFY(controller.write({{"action", "stopwatch"}, {"row", "rotation"}}));
        clock.seek(1000);
        QVERIFY(controller.write({{"action", "input"}, {"row", "rotation"}, {"input", 0}, {"value", 2.5}}));
        clock.seek(4000);
        QCOMPARE(controller.playheadMs(), -1.0);
        const auto state = controller.rowState("rotation");
        QCOMPARE(state["values"].toList().first().toDouble(), 2.5);
        QVERIFY(state["hasPrev"].toBool());
        QVERIFY(!state["hasNext"].toBool());
        QVERIFY(!state["here"].toBool());
        controller.step("rotation", -1);
        QCOMPARE(clock.time(), 1000.0);
    }
    // keyframe_move.rs: every key keeps its offset, and a group can move into its old positions.
    void moveManyKeepsOffsets() {
        TimelineModel model;
        model.setTimeline(fixture());
        const auto at = [&](double ms, double value) {
            QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "rotation"}, {"input", 0}, {"value", value}, {"atMs", ms}}));
        };
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "rotation"}, {"atMs", 0}}));
        at(500, 5);
        at(1000, 10);
        at(1500, 15);
        const auto before = model.documentJson();
        const auto count = model.undoStack()->count();
        const auto keys = [](std::initializer_list<double> values) {
            QJsonArray result;
            for (double value : values) { result.append(QJsonObject{{"row", "rotation"}, {"atMs", value}}); }
            return result;
        };
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        QVERIFY(model.applyEdit("keyframes.moveMany", {{"clipId", "c"}, {"keys", keys({500, 1000})}, {"deltaMs", 500}}));
        QCOMPARE(model.undoStack()->count(), count + 1);
        // 1500 was not selected, so the key landing there replaces it, as a single move does.
        QCOMPARE(nt::keyframes::times(clip()), (QJsonArray{0, 1000, 1500}));
        QCOMPARE(nt::keyframes::inputValue(clip(), "rotation", 0, 1000), 5.0);
        QCOMPARE(nt::keyframes::inputValue(clip(), "rotation", 0, 1500), 10.0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        // The common delta stops at the clip's end: the group keeps its shape.
        QVERIFY(model.applyEdit("keyframes.moveMany", {{"clipId", "c"}, {"keys", keys({1000, 1500})}, {"deltaMs", 900}}));
        QCOMPARE(nt::keyframes::times(clip()), (QJsonArray{0, 500, 1500, 2000}));
        model.undoStack()->undo();
        QVERIFY(model.applyEdit("keyframes.moveMany", {{"clipId", "c"}, {"keys", keys({0, 500})}, {"deltaMs", -100}}) == false);
        QCOMPARE(model.documentJson(), before);
        QVERIFY(!model.applyEdit("keyframes.moveMany", {{"clipId", "c"}, {"keys", QJsonArray{}}, {"deltaMs", 100}}));
        QVERIFY(!model.applyEdit("keyframes.moveMany", {{"clipId", "c"}, {"keys", QJsonArray{QJsonObject{{"row", "nope"}, {"atMs", 0}}}}, {"deltaMs", 100}}));
        QCOMPARE(model.undoStack()->index(), count);
    }
    void deleteAndEaseMany() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "rotation"}, {"atMs", 0}}));
        for (const auto ms : {500.0, 1000.0}) {
            QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "rotation"}, {"input", 0}, {"value", ms / 100}, {"atMs", ms}}));
        }
        const auto count = model.undoStack()->count();
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        const QJsonArray two{QJsonObject{{"row", "rotation"}, {"atMs", 500}}, QJsonObject{{"row", "rotation"}, {"atMs", 1000}}};
        QVERIFY(model.applyEdit("keyframes.easingMany", {{"clipId", "c"}, {"keys", two}, {"easing", "hold"}}));
        QCOMPARE(model.undoStack()->count(), count + 1);
        QCOMPARE(nt::keyframes::helper("keyframeEasingAt", {clip(), "rotation", 500}).toString(), QString("hold"));
        QCOMPARE(nt::keyframes::helper("keyframeEasingAt", {clip(), "rotation", 1000}).toString(), QString("hold"));
        QCOMPARE(nt::keyframes::helper("keyframeEasingAt", {clip(), "rotation", 0}).toString(), QString("linear"));
        QVERIFY(model.applyEdit("keyframes.deleteMany", {{"clipId", "c"}, {"keys", two}}));
        QCOMPARE(model.undoStack()->count(), count + 2);
        QCOMPARE(nt::keyframes::times(clip()), QJsonArray{0});
        // Deleting a row's every key leaves it unanimated at the value of its last key, as one at a time does.
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "rotation"}, {"input", 0}, {"value", 3}, {"atMs", 700}}));
        QVERIFY(model.applyEdit("keyframes.deleteMany", {{"clipId", "c"}, {"keys", QJsonArray{QJsonObject{{"row", "rotation"}, {"atMs", 0}}, QJsonObject{{"row", "rotation"}, {"atMs", 700}}}}}));
        QVERIFY(!nt::keyframes::helper("isRowKeyframed", {clip(), "rotation"}).toBool());
        QCOMPARE(nt::keyframes::inputValue(clip(), "rotation", 0, 0), 3.0);
    }
    // A selection of many keys must not cost one document pass per key.
    void manyKeysScale() {
        QJsonArray kfs;
        QJsonArray selection;
        for (int i = 0; i < 4096; ++i) {
            kfs.append(QJsonObject{{"t", i / 4096.0}, {"value", i}});
            if (i % 2 == 0) { selection.append(QJsonObject{{"row", "rotation"}, {"atMs", std::floor(i / 4096.0 * 100000 + 0.5)}}); }
        }
        QJsonObject clip{{"id", "c"}, {"trackId", "v"}, {"durationMs", 100000},
            {"animations", QJsonArray{QJsonObject{{"id", "a"}, {"preset", "custom"}, {"role", "emphasis"}, {"durationMs", 100000},
                {"delayMs", 0}, {"params", QJsonObject{{"keyframed", true}}},
                {"custom", QJsonObject{{"curves", QJsonArray{QJsonObject{{"property", "rotation"}, {"keyframes", kfs}}}}}}}}}};
        QJsonObject document{{"tracks", QJsonArray{}}, {"clips", QJsonArray{clip}}};
        QElapsedTimer timer;
        timer.start();
        for (const auto* action : {"moveMany", "easingMany", "deleteMany"}) {
            const auto next = nt::keyframes::edit(document, {{"action", action}, {"clipId", "c"}, {"keys", selection}, {"deltaMs", 12}, {"easing", "hold"}});
            QVERIFY(next != document);
        }
        QVERIFY2(timer.elapsed() < 5000, qPrintable(QString::number(timer.elapsed())));
    }
    // Rows the graph draws: the same numbers the fields show, with handles for the arriving segment.
    void rowGraph() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "position"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "position"}, {"input", 0}, {"value", 100}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "position"}, {"input", 1}, {"value", 50}, {"atMs", 2000}}));
        QVERIFY(model.applyEdit("keyframes.easing", {{"clipId", "c"}, {"row", "position"}, {"atMs", 2000}, {"easing", "cubic-bezier(0.25,0.1,0.75,0.9)"}}));
        const auto clip = model.clipsJson()[0].toObject();
        const auto graph = nt::keyframes::rowGraph(clip, "position", 0, 2000, 20);
        const auto curves = graph["curves"].toArray();
        QCOMPARE(curves.size(), 2);
        for (int input = 0; input < 2; ++input) {
            const auto values = curves[input].toObject()["values"].toArray();
            QCOMPARE(values.size(), 21);
            for (int i = 0; i <= 20; ++i) {
                QCOMPARE(values[i].toDouble(), nt::keyframes::inputValue(clip, "position", input, i * 100.0));
            }
        }
        const auto keyed = graph["keys"].toArray();
        QCOMPARE(keyed.size(), 3);
        QCOMPARE(keyed[1].toObject()["ms"].toDouble(), 1000.0);
        QCOMPARE(keyed[2].toObject()["handles"].toObject()["x1"].toDouble(), 0.25);
        QCOMPARE(keyed[2].toObject()["handles"].toObject()["y2"].toDouble(), 0.9);
        QVERIFY(graph["hi"].toDouble() >= 100);
        QCOMPARE(graph["velocity"].toArray().size(), 20);
        // X moves 100 px in the first second, so the speed there is at least 100 px/s.
        QVERIFY(std::abs(graph["velocity"].toArray()[5].toDouble() - 100) < 40);
        QVERIFY(graph["vmax"].toDouble() > 0);
        // No handles on the first key, which has no arriving segment.
        QVERIFY(keyed[0].toObject()["handles"].isNull());
    }
    void bezierHandles_data() {
        QTest::addColumn<QString>("easing");
        QTest::addColumn<double>("x1");
        QTest::addColumn<double>("y1");
        QTest::addColumn<double>("x2");
        QTest::addColumn<double>("y2");
        QTest::newRow("linear") << "linear" << 1.0 / 3 << 1.0 / 3 << 2.0 / 3 << 2.0 / 3;
        QTest::newRow("easeIn") << "easeIn" << 1.0 / 3 << 0.0 << 2.0 / 3 << 0.0;
        QTest::newRow("easeOut") << "easeOut" << 1.0 / 3 << 1.0 << 2.0 / 3 << 1.0;
        QTest::newRow("bezier") << "cubic-bezier(0.1, 0.2, 0.3, 0.4)" << 0.1 << 0.2 << 0.3 << 0.4;
    }
    void bezierHandles() {
        QFETCH(QString, easing);
        QFETCH(double, x1);
        QFETCH(double, y1);
        QFETCH(double, x2);
        QFETCH(double, y2);
        const auto handles = nt::keyframes::bezierHandles(easing);
        QCOMPARE(handles["x1"].toDouble(), x1);
        QCOMPARE(handles["y1"].toDouble(), y1);
        QCOMPARE(handles["x2"].toDouble(), x2);
        QCOMPARE(handles["y2"].toDouble(), y2);
        // The two exact forms sample like the named easing they replace.
        if (easing == "easeIn" || easing == "easeOut" || easing == "linear") {
            const auto text = nt::keyframes::bezierEasing(x1, y1, x2, y2).toStdString();
            for (double t = 0; t <= 1; t += 0.05) {
                QVERIFY(std::abs(nt::scene::ease(text, t) - nt::scene::ease(easing.toStdString(), t)) < 2e-3);
            }
        }
    }
    void holdHasNoHandles() { QVERIFY(nt::keyframes::bezierHandles("hold").isEmpty()); }
    // The enable switch: off draws the identity everywhere with no evaluator change,
    // and on brings back every value. One undo step each way.
    void bypassFixedEffects() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "position"}, {"input", 0}, {"value", 40}, {"atMs", QJsonValue::Null}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "rotation"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "rotation"}, {"input", 0}, {"value", 1}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "opacity"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "opacity"}, {"input", 0}, {"value", 0.5}, {"atMs", 1000}}));
        const auto before = model.clipsJson()[0].toObject();
        const auto doc = model.documentJson();
        const auto count = model.undoStack()->count();
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", false}}));
        QCOMPARE(model.undoStack()->count(), count + 1);
        QVERIFY(!clip().contains("transform"));
        QVERIFY(!nt::keyframes::helper("isRowKeyframed", {clip(), "rotation"}).toBool());
        QVERIFY(nt::keyframes::helper("isRowKeyframed", {clip(), "opacity"}).toBool());
        QCOMPARE(nt::evaluateScene(*model.snapshot(), 1000).layers[0].opacity, 0.5);
        // A read-only view still shows what the row holds.
        const auto shown = nt::keyframes::withBypassRestored(clip());
        QCOMPARE(nt::keyframes::times(shown, nt::keyframes::properties("rotation")), (QJsonArray{0, 1000}));
        QCOMPARE(nt::keyframes::inputValue(shown, "position", 0, 0), 40.0);
        // Off a second time changes nothing.
        QVERIFY(!model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", false}}));
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "opacity"}, {"enabled", false}}));
        QVERIFY(!clip().contains("opacity"));
        QCOMPARE(nt::evaluateScene(*model.snapshot(), 1000).layers[0].opacity, 1.0);
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", true}}));
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "opacity"}, {"enabled", true}}));
        QVERIFY(!clip().contains("bypassedFixedEffects"));
        const auto restored = clip();
        QCOMPARE(restored["transform"], before["transform"]);
        QCOMPARE(restored["opacity"], before["opacity"]);
        QCOMPARE(nt::keyframes::times(restored, nt::keyframes::properties("rotation")), (QJsonArray{0, 1000}));
        QCOMPARE(nt::keyframes::inputValue(restored, "rotation", 0, 1000), 1.0);
        QCOMPARE(nt::keyframes::inputValue(restored, "opacity", 0, 1000), 0.5);
        for (int i = 0; i < 4; ++i) { model.undoStack()->undo(); }
        QCOMPARE(model.documentJson(), doc);
    }
    // A row whose fold replaces its base starts from that base, and hands the value back.
    void motionRowsReplaceFromTheBase() {
        TimelineModel model;
        model.setTimeline(fixture());
        ClipInspectorController controller;
        controller.setTimeline(&model);
        controller.setClipId("c");
        QVERIFY(model.applyEdit("keyframes.field", {{"clipId", "c"}, {"field", "anchorX"}, {"value", 0.25}}));
        const auto before = model.documentJson();
        const auto undoable = model.undoStack()->count();
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "anchor"}, {"atMs", 0}}));
        QCOMPARE(model.undoStack()->count(), undoable + 1);
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        QCOMPARE(nt::keyframes::inputValue(clip(), "anchor", 0, 0), 0.25);
        QCOMPARE(nt::keyframes::inputValue(clip(), "anchor", 1, 0), 0.5);
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "anchor"}, {"input", 0}, {"value", 0.75}, {"atMs", 1000}}));
        QCOMPARE(nt::keyframes::inputValue(clip(), "anchor", 0, 500), 0.5);
        const auto layer = [&](double t) { return *nt::evaluateScene(*model.snapshot(), t).layers[0].transform; };
        QCOMPARE(layer(1000).anchor.x, 0.75);
        QCOMPARE(layer(1000).anchor.y, 0.5);
        // Stopping the row keeps the value at the playhead as the static one.
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "anchor"}, {"atMs", 1000}}));
        QCOMPARE(controller.fieldValue("anchorX"), 0.75);
        QVERIFY(!nt::keyframes::helper("isRowKeyframed", {clip(), "anchor"}).toBool());
        for (int i = 0; i < 3; ++i) { model.undoStack()->undo(); }
        QCOMPARE(model.documentJson(), before);
    }
    // These channels are in the shared model, so the web draws them from the keyframe animation.
    void motionChannelsStayOnTheKeyframeAnimation() {
        TimelineModel model;
        model.setTimeline(fixture());
        for (const auto* row : {"anchor", "rotationX", "rotationY"}) {
            QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", row}, {"atMs", 0}}));
        }
        const auto animations = model.clipsJson()[0].toObject()["animations"].toArray();
        QCOMPARE(animations.size(), 1);
        QVERIFY(!nt::scene::isSideCurveAnimation(animations[0].toObject()));
        QCOMPARE(animations[0].toObject()["custom"].toObject()["curves"].toArray().size(), 4);
    }
    // Perspective and Depth have no channel, so a web build keeps them apart from what it draws.
    void motionRowsWithNoChannelStayOffTheKeyframeAnimation() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "position"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "position"}, {"input", 0}, {"value", 30}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "perspective"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "perspective"}, {"input", 0}, {"value", 500}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 40}, {"atMs", 1000}}));
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        auto animations = clip()["animations"].toArray();
        QCOMPARE(animations.size(), 2);
        const auto main = animations[0].toObject();
        QCOMPARE(main["custom"].toObject()["curves"].toArray().size(), 2);
        const auto side = animations[1].toObject();
        QVERIFY(nt::scene::isSideCurveAnimation(side));
        QCOMPARE(side["enabled"].toBool(true), false);
        QCOMPARE(side["custom"].toObject()["curves"].toArray().size(), 2);
        // Compiling keeps the channels and leaves the side animation out.
        const auto defs = nt::scene::parseAnimations(animations);
        QCOMPARE(nt::scene::compileAnimations(defs, 2000, {}).size(), size_t(1));
        const auto scene = [&](double t) { return *nt::evaluateScene(*model.snapshot(), t).layers[0].transform; };
        QCOMPARE(scene(0).perspective.value_or(0), 1000.0);
        QCOMPARE(scene(1000).perspective.value_or(0), 500.0);
        QCOMPARE(scene(1000).depthPx.value_or(0), 40.0);
        // Previous, next, moving, easing and deleting read the side curve like any other.
        QCOMPARE(nt::keyframes::times(clip(), nt::keyframes::properties("perspective")), (QJsonArray{0, 1000}));
        QCOMPARE(nt::keyframes::helper("adjacentKeyframeMs", {clip(), QJsonArray{"perspective"}, 0, 1}).toDouble(), 1000.0);
        QVERIFY(model.applyEdit("keyframes.easing", {{"clipId", "c"}, {"row", "perspective"}, {"atMs", 1000}, {"easing", "hold"}}));
        QCOMPARE(scene(999).perspective.value_or(0), 1000.0);
        QCOMPARE(nt::keyframes::helper("keyframeEasingAt", {clip(), "perspective", 1000}).toString(), QString("hold"));
        QVERIFY(model.applyEdit("keyframes.easingMany", {{"clipId", "c"}, {"keys", QJsonArray{QJsonObject{{"row", "perspective"}, {"atMs", 1000}}}}, {"easing", "cubic-bezier(0.1,0.2,0.3,0.4)"}}));
        QCOMPARE(nt::keyframes::helper("keyframeEasingAt", {clip(), "perspective", 1000}).toString(), QString("cubic-bezier(0.1,0.2,0.3,0.4)"));
        QVERIFY(model.applyEdit("keyframes.moveMany", {{"clipId", "c"}, {"keys", QJsonArray{QJsonObject{{"row", "depth"}, {"atMs", 1000}}}}, {"deltaMs", 500}}));
        QCOMPARE(nt::keyframes::times(clip(), {"depthPx"}), (QJsonArray{0, 1500}));
        const auto graph = nt::keyframes::rowGraph(clip(), "depth", 0, 1500, 15);
        QCOMPARE(graph["curves"].toArray()[0].toObject()["values"].toArray().last().toDouble(), 40.0);
        QCOMPARE(graph["keys"].toArray().size(), 2);
        QVERIFY(model.applyEdit("keyframes.toggle", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 700}}));
        QCOMPARE(nt::keyframes::times(clip(), {"depthPx"}).size(), 3);
        QVERIFY(model.applyEdit("keyframes.deleteMany", {{"clipId", "c"}, {"keys", QJsonArray{QJsonObject{{"row", "depth"}, {"atMs", 700}}}}}));
        QCOMPARE(nt::keyframes::times(clip(), {"depthPx"}).size(), 2);
        // The last curve on a side animation takes the animation with it.
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "perspective"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        animations = clip()["animations"].toArray();
        QCOMPARE(animations.size(), 1);
        QVERIFY(!nt::scene::isSideCurveAnimation(animations[0].toObject()));
    }
    // A clip with only side curves has no keyframe animation for an easing edit to index.
    void easingWithNoKeyframeAnimation() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 40}, {"atMs", 1000}}));
        QCOMPARE(model.clipsJson()[0].toObject()["animations"].toArray().size(), 1);
        QVERIFY(model.applyEdit("keyframes.easing", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 1000}, {"easing", "easeIn"}}));
        const auto clip = model.clipsJson()[0].toObject();
        QCOMPARE(nt::keyframes::helper("keyframeEasingAt", {clip, "depthPx", 1000}).toString(), QString("easeIn"));
        QCOMPARE(clip["animations"].toArray().size(), 1);
    }
    // An easing on the keyframe animation shapes only its own curves.
    void animationEasingLeavesSideCurves() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "position"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "position"}, {"input", 0}, {"value", 100}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 100}, {"atMs", 1000}}));
        auto clip = model.clipsJson()[0].toObject();
        auto animations = clip["animations"].toArray();
        auto main = animations[0].toObject();
        main.insert("easing", "hold");
        animations[0] = main;
        clip.insert("animations", animations);
        QCOMPARE(nt::keyframes::inputValue(clip, "position", 0, 500), 0.0);
        QCOMPARE(nt::keyframes::inputValue(clip, "depth", 0, 500), 50.0);
    }
    void moreCurvesThanOneAnimationHolds() {
        QJsonArray curves;
        for (int i = 0; i < 17; ++i) {
            curves.append(QJsonObject{{"property", QString("custom:%1").arg(i)}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", i}}}}});
        }
        const auto animations = nt::scene::withSideCurves({}, curves, 2000);
        QCOMPARE(animations.size(), 2);
        QCOMPARE(animations[0].toObject()["custom"].toObject()["curves"].toArray().size(), 16);
        QCOMPARE(animations[1].toObject()["custom"].toObject()["curves"].toArray().size(), 1);
        QCOMPARE(nt::scene::sideCurveList(animations), curves);
        const auto again = nt::scene::withSideCurves(animations, curves, 2000);
        QCOMPARE(again[0].toObject()["id"], animations[0].toObject()["id"]);
        QVERIFY(nt::scene::withSideCurves(animations, {}, 2000).isEmpty());
    }
    void splitSlicesEveryMotionCurve() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "rotationX"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "rotationX"}, {"input", 0}, {"value", 40}, {"atMs", 2000}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 40}, {"atMs", 2000}}));
        const auto clip = model.clipsJson()[0].toObject();
        const auto [left, right] = nt::edit::splitClip(clip, 1000);
        QCOMPARE(nt::keyframes::inputValue(left, "rotationX", 0, 1000), 20.0);
        QCOMPARE(nt::keyframes::inputValue(right, "rotationX", 0, 0), 20.0);
        QCOMPARE(nt::keyframes::inputValue(right, "rotationX", 0, 1000), 40.0);
        QCOMPARE(nt::keyframes::inputValue(left, "depth", 0, 1000), 20.0);
        QCOMPARE(nt::keyframes::inputValue(right, "depth", 0, 0), 20.0);
        QCOMPARE(nt::keyframes::inputValue(right, "depth", 0, 1000), 40.0);
        const auto sideId = [](const QJsonObject& c) {
            for (const auto& a : c["animations"].toArray()) {
                if (nt::scene::isSideCurveAnimation(a.toObject())) { return a.toObject()["id"].toString(); }
            }
            return QString();
        };
        QVERIFY(!sideId(left).isEmpty());
        QVERIFY(sideId(left) != sideId(right));
        // A trim stretches keys with the clip, as every normalized keyframe does.
        const auto trimmed = nt::edit::trimClip(clip, "end", -1000, std::nullopt);
        QCOMPARE(nt::keyframes::inputValue(trimmed, "depth", 0, 500), 20.0);
    }
    void lockedClipRefusesNewRows() {
        auto document = fixture().raw;
        auto clips = document["clips"].toArray();
        auto locked = clips[0].toObject();
        locked.insert("locked", true);
        clips[0] = locked;
        document.insert("clips", clips);
        for (const auto* row : {"anchor", "rotationX", "rotationY", "perspective", "depth"}) {
            const auto result = nt::keyframes::edit(document, {{"clipId", "c"}, {"action", "stopwatch"}, {"row", row}, {"atMs", 0}});
            QCOMPARE(result, document);
        }
    }
    void motionSwitchHoldsEveryMotionCurve() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "anchor"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "anchor"}, {"input", 0}, {"value", 0.9}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 40}, {"atMs", 1000}}));
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        const auto before = clip();
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", false}}));
        QVERIFY(!clip().contains("animations") || clip()["animations"].toArray().isEmpty());
        const auto off = nt::evaluateScene(*model.snapshot(), 1000).layers[0].transform;
        QVERIFY(!off || (off->anchor.x == 0.5 && !off->depthPx));
        const auto shown = nt::keyframes::withBypassRestored(clip());
        QCOMPARE(nt::keyframes::inputValue(shown, "anchor", 0, 1000), 0.9);
        QCOMPARE(nt::keyframes::inputValue(shown, "depth", 0, 1000), 40.0);
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", true}}));
        QCOMPARE(nt::keyframes::inputValue(clip(), "anchor", 0, 1000), 0.9);
        QCOMPARE(nt::keyframes::inputValue(clip(), "depth", 0, 1000), 40.0);
        QCOMPARE(nt::evaluateScene(*model.snapshot(), 1000).layers[0].transform->depthPx.value_or(0), 40.0);
    }
    void gizmoWritesAKeyedAnchorAsAKey() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "anchor"}, {"atMs", 0}}));
        const auto clip = model.clipsJson()[0].toObject();
        auto next = nt::keyframes::transform(clip);
        next.insert("anchor", QJsonObject{{"x", 0.75}, {"y", 0.5}});
        const auto patch = nt::keyframes::helper("gizmoTransformPatch", {clip, next, 0}).toObject();
        QCOMPARE(patch["transform"].toObject()["anchor"].toObject()["x"].toDouble(0.5), 0.5);
        auto patched = clip;
        patched.insert("animations", patch["animations"]);
        QCOMPARE(nt::keyframes::inputValue(patched, "anchor", 0, 0), 0.75);
    }
    void volumeRowAddsToTheStaticLevel() {
        auto parsed = nt::parseTimelineJson(
            R"({"name":"Sound","width":640,"height":360,"fps":30,"durationMs":2000,"tracks":[{"id":"a","type":"audio","name":"Audio"}],"clips":[{"id":"c","trackId":"a","mediaType":"audio","name":"Voice","startMs":0,"durationMs":2000,"volumeDb":-6}]})");
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "volume"}, {"atMs", 0}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(nt::keyframes::inputValue(clip(), "volume", 0, 0), -6.0);
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "volume"}, {"input", 0}, {"value", -18}, {"atMs", 2000}}));
        QCOMPARE(clip()["volumeDb"].toDouble(), -6.0);
        QCOMPARE(nt::keyframes::inputValue(clip(), "volume", 0, 2000), -18.0);
        QCOMPARE(nt::keyframes::inputValue(clip(), "volume", 0, 1000), -12.0);
        // Volume has no channel on the web, so it is on a side animation.
        const auto animations = clip()["animations"].toArray();
        QCOMPARE(animations.size(), 1);
        QVERIFY(nt::scene::isSideCurveAnimation(animations[0].toObject()));
        // A split cuts the curve at the value it holds there.
        const auto [left, right] = nt::edit::splitClip(clip(), 1000);
        QCOMPARE(nt::keyframes::inputValue(left, "volume", 0, 1000), -12.0);
        QCOMPARE(nt::keyframes::inputValue(right, "volume", 0, 0), -12.0);
        QCOMPARE(nt::keyframes::inputValue(right, "volume", 0, 1000), -18.0);
        // The switch sets the level aside, leaves the keys in place, and restores the same picture.
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "volume"}, {"enabled", false}}));
        QVERIFY(!clip().contains("volumeDb"));
        QCOMPARE(nt::keyframes::times(clip(), {"volumeDb"}), (QJsonArray{0, 2000}));
        const auto [offLeft, offRight] = nt::edit::splitClip(clip(), 1000);
        QCOMPARE(nt::keyframes::times(offLeft, {"volumeDb"}), (QJsonArray{0, 1000}));
        QCOMPARE(nt::keyframes::times(offRight, {"volumeDb"}), (QJsonArray{0, 1000}));
        const auto shown = nt::keyframes::withBypassRestored(clip());
        QCOMPARE(nt::keyframes::inputValue(shown, "volume", 0, 2000), -18.0);
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "volume"}, {"enabled", true}}));
        QCOMPARE(nt::keyframes::inputValue(clip(), "volume", 0, 2000), -18.0);
        // Stopping the row keeps the level at the playhead.
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "volume"}, {"atMs", 2000}}));
        QCOMPARE(clip()["volumeDb"].toDouble(), -18.0);
        QVERIFY(!clip().contains("animations") || clip()["animations"].toArray().isEmpty());
        while (model.undoStack()->canUndo()) { model.undoStack()->undo(); }
        QCOMPARE(model.documentJson(), before);
        // A lock refuses the edit.
        auto document = model.timeline().raw;
        auto clips = document["clips"].toArray();
        auto locked = clips[0].toObject();
        locked.insert("locked", true);
        clips[0] = locked;
        document.insert("clips", clips);
        QCOMPARE(nt::keyframes::edit(document, {{"clipId", "c"}, {"action", "stopwatch"}, {"row", "volume"}, {"atMs", 0}}), document);
    }
    // Review findings on the side curves of a long clip and the group switch.
    void splitKeepsSideKeysNearTheCut() {
        const QJsonObject curve{{"property", "volumeDb"},
            {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 0}}, QJsonObject{{"t", 0.5}, {"value", -40}, {"easing", "hold"}},
                                     QJsonObject{{"t", 1}, {"value", -40}}}}};
        const QJsonObject clip{{"id", "c"}, {"startMs", 0}, {"durationMs", 600000}, {"mediaType", "audio"},
            {"animations", nt::scene::withSideCurves({}, QJsonArray{curve}, 600000)}};
        const auto [left, right] = nt::edit::splitClip(clip, 299966.67);
        QCOMPARE(nt::keyframes::times(left, {"volumeDb"}).size(), 2);
        // The key is 33 ms after the cut, so it stays, and the drop stays at its time.
        QCOMPARE(nt::keyframes::times(right, {"volumeDb"}).size(), 3);
        QVERIFY(std::abs(nt::keyframes::times(right, {"volumeDb"})[1].toDouble() - 33) < 1);
        QCOMPARE(nt::keyframes::inputValue(right, "volume", 0, 34), -40.0);
        QCOMPARE(nt::keyframes::inputValue(right, "volume", 0, 30), 0.0);
    }
    void switchedOffRowsRefuseEdits() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 100}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", false}}));
        // Alt+K on the row of a switched-off group changes nothing.
        QVERIFY(!model.applyEdit("keyframes.toggle", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 500}}));
        QVERIFY(!model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "position"}, {"input", 0}, {"value", 5}, {"atMs", 500}}));
        // Other groups' rows still work.
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "opacity"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", true}}));
        const auto clip = model.clipsJson()[0].toObject();
        QCOMPARE(nt::keyframes::times(clip, {"depthPx"}), (QJsonArray{0, 1000}));
        QCOMPARE(nt::keyframes::inputValue(clip, "depth", 0, 500), 50.0);
    }
    // A curve a document grew while the group was off cannot shadow the stored one.
    void restoringAGroupReplacesALiveCurve() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 100}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.bypass", {{"clipId", "c"}, {"group", "motion"}, {"enabled", false}}));
        auto clip = model.clipsJson()[0].toObject();
        clip.insert("animations", nt::scene::withSideCurves({}, QJsonArray{QJsonObject{{"property", "depthPx"},
            {"keyframes", QJsonArray{QJsonObject{{"t", 0.25}, {"value", 7}}}}}}, 2000));
        const auto shown = nt::keyframes::withBypassRestored(clip);
        QCOMPARE(nt::keyframes::times(shown, {"depthPx"}), (QJsonArray{0, 1000}));
        QCOMPARE(nt::scene::sideCurveList(shown["animations"].toArray()).size(), 1);
    }
    // An animation-wide easing goes onto the Motion keys it shapes, and no further.
    void bypassLeavesSideCurveEasing() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "position"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "depth"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "depth"}, {"input", 0}, {"value", 100}, {"atMs", 1000}}));
        auto raw = model.timeline().raw;
        auto clips = raw["clips"].toArray();
        auto clip = clips[0].toObject();
        auto animations = clip["animations"].toArray();
        for (qsizetype i = 0; i < animations.size(); ++i) {
            auto a = animations[i].toObject();
            if (!nt::scene::isSideCurveAnimation(a)) { a.insert("easing", "hold"); animations[i] = a; }
        }
        clip.insert("animations", animations);
        clips[0] = clip;
        raw.insert("clips", clips);
        const auto off = nt::keyframes::edit(raw, {{"clipId", "c"}, {"action", "bypass"}, {"group", "motion"}, {"enabled", false}});
        const auto on = nt::keyframes::edit(off, {{"clipId", "c"}, {"action", "bypass"}, {"group", "motion"}, {"enabled", true}});
        QCOMPARE(nt::keyframes::inputValue(on["clips"].toArray()[0].toObject(), "depth", 0, 500), 50.0);
    }
    // One clip's motion blur does not move another clip through the stack early.
    void depthOrderReadsEachClipsOwnTime() {
        const QJsonObject curve{{"property", "depthPx"},
            {"keyframes", QJsonArray{QJsonObject{{"t", 0.5}, {"value", -1}}, QJsonObject{{"t", 0.505}, {"value", 1}}}}};
        const auto tile = [](const QString& id) {
            return QJsonObject{{"id", id}, {"trackId", "v"}, {"mediaType", "shape"}, {"startMs", 0}, {"durationMs", 2000},
                               {"shapeStyle", QJsonObject{{"kind", "rect"}}}};
        };
        auto keyed = tile("a");
        keyed.insert("animations", nt::scene::withSideCurves({}, QJsonArray{curve}, 2000));
        auto blurred = tile("b");
        blurred.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 360}});
        const auto parsed = nt::parseTimelineJson(QJsonDocument(QJsonObject{{"name", "Order"}, {"width", 64}, {"height", 64}, {"fps", 30}, {"durationMs", 2000},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}}, {"clips", QJsonArray{keyed, blurred}}}).toJson());
        QVERIFY(parsed.timeline.has_value());
        // The last sample of the frame at 1000 ms reads B's time 25 ms on, past A's keys. A holds
        // the frame's time, at depth -1, so it stays under B.
        const auto frame = nt::evaluateSceneTap(*parsed.timeline, 1025, 1000, 3, 4);
        QCOMPARE(frame.layers.size(), size_t(2));
        QCOMPARE(frame.layers.front().clipId, std::string("a"));
    }
    void cropRowsStayInsideThePicture() {
        TimelineModel model;
        model.setTimeline(fixture());
        const auto clip = [&] { return model.clipsJson()[0].toObject(); };
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "cropLeft"}, {"input", 0}, {"value", 0.6}, {"atMs", QJsonValue::Null}}));
        QCOMPARE(clip()["crop"].toObject()["left"].toDouble(), 0.6);
        // The opposite edge stops at 5% of the picture.
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "cropRight"}, {"input", 0}, {"value", 0.9}, {"atMs", QJsonValue::Null}}));
        QVERIFY(std::abs(clip()["crop"].toObject()["right"].toDouble() - 0.35) < 1e-9);
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "cropRight"}, {"input", 0}, {"value", 0}, {"atMs", QJsonValue::Null}}));
        // A crop of nothing is no crop.
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "cropLeft"}, {"input", 0}, {"value", 0}, {"atMs", QJsonValue::Null}}));
        QVERIFY(!clip().contains("crop"));
        while (model.undoStack()->canUndo()) { model.undoStack()->undo(); }
        QCOMPARE(model.documentJson(), before);
    }
    void cropKeysAreSampledAndKeptUsable() {
        TimelineModel model;
        model.setTimeline(fixture());
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "cropLeft"}, {"atMs", 0}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "cropLeft"}, {"input", 0}, {"value", 0.9}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.stopwatch", {{"clipId", "c"}, {"row", "cropRight"}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "cropRight"}, {"input", 0}, {"value", 0.05}, {"atMs", 1000}}));
        QVERIFY(model.applyEdit("keyframes.input", {{"clipId", "c"}, {"row", "cropRight"}, {"input", 0}, {"value", 0.9}, {"atMs", 0}}));
        const auto& timeline = *model.snapshot();
        const auto& c = timeline.clips[0];
        // At 500 ms each is at about half, which meets in the middle; keyed edges still leave the picture.
        const auto middle = nt::reframe::cropAt(c, 500);
        QVERIFY(nt::reframe::isCropUsable(middle));
        QVERIFY(middle["left"].toDouble() + middle["right"].toDouble() <= 0.95 + 1e-9);
        const auto end = nt::reframe::cropAt(c, 1000);
        QVERIFY(std::abs(end["left"].toDouble() - 0.9) < 1e-9);
        QVERIFY(std::abs(end["right"].toDouble() - 0.05) < 1e-9);
        // The side curves come from an edit, and a split cuts them at their value.
        const auto [left, right] = nt::edit::splitClip(model.clipsJson()[0].toObject(), 500);
        QCOMPARE(nt::keyframes::inputValue(right, "cropLeft", 0, 0), nt::keyframes::inputValue(left, "cropLeft", 0, 500));
        QCOMPARE(nt::keyframes::inputValue(right, "cropLeft", 0, 500), 0.9);
    }
    void bypassVolumeOnSoundOnly() {
        auto parsed = nt::parseTimelineJson(
            R"({"name":"Sound","width":640,"height":360,"fps":30,"durationMs":2000,"tracks":[{"id":"a","type":"audio","name":"Audio"}],"clips":[{"id":"c","trackId":"a","mediaType":"audio","name":"Voice","startMs":0,"durationMs":2000,"volumeDb":-6}]})");
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        ClipInspectorController controller;
        controller.setTimeline(&model);
        controller.setClipId("c");
        QVERIFY(controller.groupEnabled("volume"));
        QVERIFY(controller.write({{"action", "bypass"}, {"group", "volume"}, {"enabled", false}}));
        QVERIFY(!controller.groupEnabled("volume"));
        QVERIFY(!model.clipsJson()[0].toObject().contains("volumeDb"));
        QVERIFY(controller.write({{"action", "bypass"}, {"group", "volume"}, {"enabled", true}}));
        QCOMPARE(model.clipsJson()[0].toObject()["volumeDb"].toDouble(), -6.0);
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
