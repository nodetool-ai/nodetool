#include "FollowPathControls.h"
#include <QtTest>
#include <QSignalSpy>
#include <QJsonArray>
#include <QJsonObject>
#include "model/TimelineJson.h"
#include "app/EditRegistry.h"
#include "edit/keyframes/Keyframes.h"
#include "edit/keyframes/ClipInspectorController.h"

class TestFollowPathControls : public QObject {
    Q_OBJECT
  private slots:
    void selectionAndUndo() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Test","width":640,"height":360,"fps":30,"durationMs":2000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":0,"durationMs":2000,"animations":[{"id":"a","role":"in","preset":"followPath","durationMs":800,"params":{"unknown":42}}]},{"id":"s","trackId":"v","mediaType":"shape","name":"Box","startMs":0,"durationMs":2000,"shapeStyle":{"kind":"rect"}}]})");
        QVERIFY(parsed.timeline.has_value());
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        FollowPathControls controls;
        controls.setTimeline(&model);
        QCOMPARE(controls.options().size(), 1);
        QCOMPARE(controls.options()[0].toMap().value("label").toString(), QString("Box"));
        const auto before = model.documentJson();
        auto params = controls.params("s");
        params.insert("unknown", 42);
        QVariantMap anim{{"id", "a"}, {"role", "in"}, {"preset", "followPath"}, {"durationMs", 800}, {"params", params}};
        ClipInspectorController controller;
        controller.setTimeline(&model);
        controller.setClipId("c");
        QSignalSpy changed(&controls, &FollowPathControls::changed);
        QVERIFY(controller.write({{"action", "animations"}, {"animations", QVariantList{anim}}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(changed.count() > 0);
        QCOMPARE(model.clipsJson()[0].toObject()["animations"].toArray()[0].toObject()["params"].toObject()["unknown"].toInt(), 42);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
    }
    void shapeGeometry() {
        const QVariantMap rect{{"kind", "rect"}, {"x", 0.1}, {"unknown", 7}};
        const auto result = FollowPathControls::shapeParams(rect);
        QCOMPARE(result.value("d").toString(), QString("M0 0L1 0L1 1L0 1Z"));
        QCOMPARE(result.value("pathX").toDouble(), 0.1);
        QCOMPARE(result.value("pathWidth").toDouble(), 0.5);
        QVERIFY(FollowPathControls::shapeParams({{"kind", "path"}, {"d", "  "}}).isEmpty());
        QCOMPARE(FollowPathControls::shapeParams({{"kind", "path"}, {"d", " M0 0L1 1 "}}).value("d").toString(), QString("M0 0L1 1"));
        QVERIFY(FollowPathControls::shapeParams({{"kind", "star"}}).isEmpty());
        QVERIFY(!FollowPathControls::shapeParams({{"kind", "ellipse"}}).isEmpty());
    }
};
QTEST_APPLESS_MAIN(TestFollowPathControls)
#include "tst_followpathcontrols.moc"
