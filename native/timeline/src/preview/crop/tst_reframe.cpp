#include "Reframe.h"
#include "ReframeController.h"
#include "preview/SceneEval.h"
#include "app/PanelRegistry.h"
#include "edit/inspectorsections/InspectorSectionRegistry.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QFile>
#include <QGuiApplication>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QtTest>
#include <memory>
namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) {
            return found;
        }
    }
    return nullptr;
}
QVariantMap qmlMap(const QVariant& value) {
    return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant().toMap() : value.toMap();
}
QJsonObject document() {
    return QJsonDocument::fromJson(
               R"({"name":"Reframe","width":640,"height":360,"fps":30,"durationMs":10000,"tracks":[{"id":"v","type":"video","index":0}],"clips":[{"id":"c","trackId":"v","mediaType":"video","startMs":100,"durationMs":1000,"inPointMs":200,"custom":"kept"}]})")
        .object();
}
} // namespace
class TestReframe : public QObject {
    Q_OBJECT
  private slots:
    void init() {
        QTest::failOnWarning(QRegularExpression(".*(TypeError|ReferenceError|Binding loop|Unable to "
                                                "assign|Cannot override).*"));
    }
    void staticCropPlan() {
        auto doc = document();
        auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject();
        clip.insert("width", 101);
        clip.insert("height", 99);
        clip.insert("crop", QJsonObject{{"left", .1}, {"right", .2}, {"top", .05}, {"bottom", .15}});
        const auto planFor = [&](const QJsonObject& raw) {
            clips[0] = raw;
            doc.insert("clips", clips);
            const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
            return nt::buildFramePlan(*parsed.timeline, 300);
        };
        const auto plan = planFor(clip);
        QCOMPARE(plan.layers.size(), size_t(1));
        const auto& layer = plan.layers.front();
        const std::array<float, 4> expected{10.f / 101, 4.f / 99, 71.f / 101, 79.f / 99};
        QCOMPARE(layer.layer.sourceRect, expected);
        QCOMPARE(layer.matrix, nt::layerMatrix({}, 71, 79, 640, 360));
        auto degenerate = clip;
        degenerate.insert("crop", QJsonObject{{"left", .8}, {"right", .2}, {"top", 0}, {"bottom", 0}});
        const std::array<float, 4> full{0, 0, 1, 1};
        QCOMPARE(planFor(degenerate).layers.front().layer.sourceRect, full);
        for (auto reframe : {QJsonObject{{"mode", "center"}},
                            QJsonObject{{"mode", "auto"}, {"sourceAssetId", "stale"}}}) {
            auto reframed = clip;
            reframe.insert("keyframes", QJsonArray{QJsonObject{{"sourceMs", 0}, {"x", .5}, {"y", .5}, {"zoom", 2}}});
            reframed.insert("reframe", reframe);
            const auto activeReframe = nt::reframe::renderableReframe(reframed).toObject();
            const double width = reframed.value("width").toDouble(doc.value("width").toDouble());
            const double height = reframed.value("height").toDouble(doc.value("height").toDouble());
            const auto crop = nt::reframe::resolveReframeCrop(activeReframe, 400,
                {{"width", activeReframe.value("sourceWidth").toDouble(width)},
                 {"height", activeReframe.value("sourceHeight").toDouble(height)}},
                {{"width", 640}, {"height", 360}}).toObject();
            const auto rect = nt::reframe::cropRectPx(crop, width, height);
            const std::array<float, 4> reframeExpected{
                static_cast<float>(rect.value("x").toDouble() / width),
                static_cast<float>(rect.value("y").toDouble() / height),
                static_cast<float>(rect.value("width").toDouble() / width),
                static_cast<float>(rect.value("height").toDouble() / height)};
            QVERIFY(reframeExpected != full);
            QEXPECT_FAIL("", "F1: the layer decorator seam has no sequence canvas or media tracks (SceneHooks, package S4)", Continue);
            QCOMPARE(planFor(reframed).layers.front().layer.sourceRect, reframeExpected);
            QCOMPARE(planFor(nt::reframe::clearReframe(reframed)).layers.front().layer.sourceRect, expected);
        }
    }
    void sectionRegistration() {
        InspectorSectionRegistry registry;
        const auto sections = registry.sections();
        int cropOrder = -1, reframeOrder = -1;
        for (const auto& value : sections) {
            const auto section = value.toMap();
            if (section["id"] == "crop") { cropOrder = section["order"].toInt(); }
            if (section["id"] == "reframe") { reframeOrder = section["order"].toInt(); }
        }
        QCOMPARE(cropOrder, 45);
        QCOMPARE(reframeOrder, 84);
        PanelRegistry panels;
        for (const auto& value : panels.forSlot("right")) {
            QVERIFY(!value.toMap()["id"].toString().startsWith("inspectorCrop"));
            QVERIFY(!value.toMap()["id"].toString().startsWith("inspectorReframe"));
        }
    }
    void previewOverlayMount() {
        auto doc = document();
        auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject();
        clip.insert("width", 1024);
        clip.insert("height", 576);
        clip.insert("reframe", QJsonObject{{"mode", "center"}, {"keyframes", QJsonArray{
            QJsonObject{{"sourceMs", 0}, {"x", .375}, {"y", .625}, {"zoom", 2}}}}});
        clip.insert("transform", QJsonObject{{"position", QJsonObject{{"x", 30}, {"y", -20}}},
                                             {"rotation", .3}, {"scale", QJsonObject{{"x", 1.2}, {"y", .8}}},
                                             {"anchor", QJsonObject{{"x", .3}, {"y", .7}}}});
        clips[0] = clip;
        doc.insert("clips", clips);
        TimelineModel model;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        PlaybackClock clock;
        clock.seek(300);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        std::unique_ptr<QObject> object(component.createWithInitialProperties(
            {{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(object.get());
        root->setSize({1280, 800});
        auto* gestures = object->findChild<ClipGestureController*>();
        QVERIFY(gestures);
        gestures->setSelection({"c"});
        QQuickItem* overlay = nullptr;
        QTRY_VERIFY((overlay = findItem(root, "reframeFocusOverlay")) != nullptr);
        QTRY_VERIFY(overlay->isVisible());
        auto* frame = findItem(root, "previewFrame");
        QVERIFY(frame);
        QCOMPARE(overlay->size(), frame->size());
        const auto geometry = QJsonObject::fromVariantMap(qmlMap(overlay->property("geometry")));
        const auto crop = nt::reframe::resolveReframeCrop(clip["reframe"].toObject(), 400,
            {{"width", 1024}, {"height", 576}}, {{"width", 640}, {"height", 360}}).toObject();
        QCOMPARE(geometry["crop"].toObject(), crop);
        auto expectedGeometry = geometry;
        expectedGeometry.remove("drawMatrix");
        expectedGeometry.insert("transform", clip["transform"]);
        const auto expected = nt::reframe::sourcePointToReframeViewport(.375, .625, expectedGeometry);
        const auto displayed = qmlMap(overlay->property("displayed"));
        QVERIFY(std::abs(displayed["x"].toDouble() - expected["x"].toDouble()) < .01);
        QVERIFY(std::abs(displayed["y"].toDouble() - expected["y"].toDouble()) < .01);
        QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        clock.seek(400);
        QCOMPARE(changes.count(), 0);
        gestures->setSelection({});
        QTRY_VERIFY(!overlay->isVisible());
        gestures->setSelection({"c", "other"});
        QTRY_VERIFY(!overlay->isVisible());
        gestures->setSelection({"c"});
        QTRY_VERIFY(overlay->isVisible());
        QVERIFY(model.applyEdit("clearClipReframe", {{"clipId", "c"}}));
        QTRY_VERIFY(!overlay->isVisible());
    }
    void panelSlotsFollowSelection() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(QJsonDocument(document()).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties(
            {{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(root);
        root->setWidth(1280);
        root->setHeight(800);
        QCoreApplication::processEvents();
        auto* section = findItem(root, "inspectorReframe");
        auto* crop = findItem(root, "inspectorCrop");
        QVERIFY(section);
        QVERIFY(crop);
        const auto inInspector = [](QQuickItem* item) {
            while (item && item->objectName() != "timelineInspector") { item = item->parentItem(); }
            return item != nullptr;
        };
        QVERIFY(inInspector(section));
        QVERIFY(inInspector(crop));
        auto* gestures = object->findChild<ClipGestureController*>();
        QVERIFY(gestures);
        gestures->setSelection({"c"});
        QCoreApplication::processEvents();
        QCOMPARE(section->property("clipId").toString(), QString("c"));
        QVERIFY(section->implicitHeight() > 0);
        QVERIFY(crop->implicitHeight() > 0);
        gestures->setSelection({});
        QCOMPARE(section->implicitHeight(), 0.);
        QCOMPARE(crop->implicitHeight(), 0.);
    }
    void qmlInteractions() {
        auto doc = document();
        auto clips = doc.value("clips").toArray();
        auto second = clips[0].toObject();
        second.insert("id", "second");
        clips.append(second);
        doc.insert("clips", clips);
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "ReframeSection");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.create());
        QVERIFY(object);
        QVERIFY(object->setProperty("timelineModel", QVariant::fromValue(&model)));
        QVERIFY(object->setProperty("playbackClock", QVariant::fromValue(&clock)));
        QVERIFY(object->setProperty("selectedIds", QVariantList{QString("c")}));
        auto* root = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(root);
        auto* add = findItem(root, "reframeAdd");
        QVERIFY(add);
        QVERIFY(!add->isEnabled());
        QVERIFY(object->setProperty("focusX", .8));
        QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        clock.seek(300);
        QCOMPARE(changes.count(), 0);
        QVERIFY(add->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(object.get(), "addKeyframe"));
        QCOMPARE(model.undoStack()->count(), 1);
        const auto key =
            model.clipsJson()[0].toObject().value("reframe").toObject().value("keyframes").toArray()[0].toObject();
        QCOMPARE(key.value("sourceMs").toDouble(), 400.);
        QCOMPARE(key.value("x").toDouble(), .8);
        QVERIFY(object->setProperty("selectedIds", QVariantList{QString("second")}));
        QCOMPARE(object->property("focusX").toDouble(), .5);
        QVERIFY(object->setProperty("selectedIds", QVariantList{QString("c"), QString("second")}));
        QCOMPARE(object->property("implicitHeight").toDouble(), 0.);
    }
    void overlayInteractions() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(QJsonDocument(document()).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        ReframeController controller;
        controller.setModel(&model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "ReframeFocusOverlay");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(
            component.createWithInitialProperties({{"controller", QVariant::fromValue(&controller)},
                                                   {"clipId", "c"},
                                                   {"sourceMs", 400},
                                                   {"sourceWidth", 640},
                                                   {"sourceHeight", 360},
                                                   {"sequenceWidth", 640},
                                                   {"sequenceHeight", 360},
                                                   {"frameWidth", 640},
                                                   {"frameHeight", 360}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        QVERIFY(object->setProperty("zoom", 2.));
        QVERIFY(QMetaObject::invokeMethod(object.get(), "beginDrag", Q_ARG(QVariant, 160.), Q_ARG(QVariant, 180.)));
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(object->setProperty("sourceMs", 800.));
        QVERIFY(QMetaObject::invokeMethod(object.get(), "updatePointer", Q_ARG(QVariant, 480.), Q_ARG(QVariant, 90.)));
        QVERIFY(QMetaObject::invokeMethod(object.get(), "endDrag"));
        QCOMPARE(model.undoStack()->count(), 1);
        const auto keys = model.clipsJson()[0].toObject().value("reframe").toObject().value("keyframes").toArray();
        QCOMPARE(keys.size(), 1);
        QCOMPARE(keys[0].toObject().value("sourceMs").toDouble(), 400.);
        QCOMPARE(keys[0].toObject().value("x").toDouble(), .75);
        QCOMPARE(keys[0].toObject().value("zoom").toDouble(), 2.);
        QCOMPARE(keys[0].toObject().value("y").toDouble(), .25);
        QVERIFY(
            QMetaObject::invokeMethod(object.get(), "nudge", Q_ARG(QVariant, Qt::Key_Left), Q_ARG(QVariant, false)));
        QCOMPARE(object->property("focusX").toDouble(), .74);
        QVERIFY(QMetaObject::invokeMethod(object.get(), "nudge", Q_ARG(QVariant, Qt::Key_Down), Q_ARG(QVariant, true)));
        QCOMPARE(object->property("focusY").toDouble(), .30);
        model.undoStack()->undo();
        model.undoStack()->undo();
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), document().value("clips").toArray());
    }
    void gestureAndUndo() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(QJsonDocument(document()).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        ReframeController controller;
        controller.setModel(&model);
        QCOMPARE(controller.sourceMsAt("c", 300), 400.);
        const auto before = model.clipsJson();
        controller.beginGesture("setClipCropEdge", {{"clipId", "c"}, {"edge", "left"}});
        controller.preview({{"value", .2}});
        QCOMPARE(model.clipsJson()[0].toObject()["crop"].toObject()["left"].toDouble(), .2);
        QCOMPARE(model.undoStack()->count(), 0);
        controller.commit("setClipCropEdge", {{"value", .3}});
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), before);
        controller.beginGesture("addClipReframeKeyframe", {{"clipId", "c"}, {"sourceMs", 400}});
        controller.preview({{"x", .2}, {"y", .4}});
        controller.commit("addClipReframeKeyframe", {{"sourceMs", 800}, {"clipId", "other"}, {"x", .7}, {"y", .6}});
        const auto key = model.clipsJson()[0].toObject()["reframe"].toObject()["keyframes"].toArray()[0].toObject();
        QCOMPARE(key["sourceMs"].toDouble(), 400.);
        QCOMPARE(key["x"].toDouble(), .7);
        QCOMPARE(model.undoStack()->count(), 1);
        controller.beginGesture("setClipCropEdge", {{"clipId", "c"}, {"edge", "top"}});
        controller.preview({{"value", .3}});
        model.setTimeline(*parsed.timeline);
        const auto replacement = model.documentJson();
        controller.commit("setClipCropEdge", {{"value", .6}});
        QCOMPARE(model.documentJson(), replacement);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void refusesLockedAndUnknownClips() {
        for (const auto& action :
             {"setClipCropEdge", "setClipReframeSubject", "addClipReframeKeyframe", "clearClipReframe"}) {
            const QJsonObject payload{{"clipId", "c"},   {"edge", "left"}, {"value", .2}, {"mode", "auto"},
                                      {"sourceMs", 400}, {"x", .2},        {"y", .8}};
            auto doc = document();
            auto clips = doc.value("clips").toArray();
            auto clip = clips[0].toObject();
            clip.insert("locked", true);
            clips[0] = clip;
            doc.insert("clips", clips);
            QCOMPARE(nt::reframe::edit(doc, action, payload), doc);
            doc = document();
            auto tracks = doc.value("tracks").toArray();
            auto track = tracks[0].toObject();
            track.insert("locked", true);
            tracks[0] = track;
            doc.insert("tracks", tracks);
            QCOMPARE(nt::reframe::edit(doc, action, payload), doc);
            auto unknown = payload;
            unknown.insert("clipId", "missing");
            QCOMPARE(nt::reframe::edit(document(), action, unknown), document());
        }
    }
    void subjectMode() {
        auto doc = document();
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("setClipReframeSubject", {{"clipId", "c"}, {"mode", "auto"}}));
        QVERIFY(model.applyEdit("addClipReframeKeyframe", {{"clipId", "c"}, {"sourceMs", 400}, {"x", .2}, {"y", .8}}));
        QVERIFY(model.applyEdit("clearClipReframe", {{"clipId", "c"}}));
        QCOMPARE(model.undoStack()->count(), 3);
        model.undoStack()->undo();
        model.undoStack()->undo();
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        auto next = nt::reframe::edit(doc, "setClipReframeSubject",
                                      {{"clipId", "c"}, {"mode", "track"}, {"trackId", "subject"}});
        QCOMPARE(next["clips"].toArray()[0].toObject()["reframe"].toObject()["trackId"].toString(), QString("subject"));
        next = nt::reframe::edit(next, "setClipReframeSubject", {{"clipId", "c"}, {"mode", "center"}});
        QVERIFY(!next["clips"].toArray()[0].toObject()["reframe"].toObject().contains("trackId"));
        QCOMPARE(next["clips"].toArray()[0].toObject()["reframe"].toObject()["mode"].toString(), QString("center"));
    }
    void focusAndKeyframes() {
        const QJsonObject request{
            {"op", "sampleReframeAt"},
            {"reframe",
             QJsonObject{{"mode", "center"},
                         {"keyframes", QJsonArray{QJsonObject{{"sourceMs", 0}, {"x", .2}, {"y", .3}, {"zoom", 1}},
                                                  QJsonObject{{"sourceMs", 100}, {"x", .8}, {"y", .7}, {"zoom", 3}}}}}},
            {"sourceMs", 50}};
        const auto sampled = nt::reframe::evaluate(request).toObject();
        QCOMPARE(sampled["x"].toDouble(), .5);
        QCOMPARE(sampled["zoom"].toDouble(), 2.);
        const QJsonObject geometry{{"crop", QJsonObject{{"left", .1}, {"right", .2}, {"top", 0}, {"bottom", 0}}},
                                   {"sourceWidth", 1000},
                                   {"sourceHeight", 500},
                                   {"sequenceWidth", 640},
                                   {"sequenceHeight", 360},
                                   {"frameWidth", 640},
                                   {"frameHeight", 360}};
        auto point = nt::reframe::evaluate(
                         {{"op", "sourcePointToReframeViewport"}, {"x", .45}, {"y", .5}, {"geometry", geometry}})
                         .toObject();
        QVERIFY(std::abs(point["x"].toDouble() - 320) < .001);
        QVERIFY(std::abs(point["y"].toDouble() - 180) < .001);
        const auto back =
            nt::reframe::evaluate(
                {{"op", "reframeViewportPointToSource"}, {"x", point["x"]}, {"y", point["y"]}, {"geometry", geometry}})
                .toObject();
        QVERIFY(std::abs(back["x"].toDouble() - .45) < .00001);
    }
    void qmlSections() {
        QQmlEngine engine;
        for (const auto& name : {"ReframeSection", "ReframeCrop", "ReframeFocusOverlay"}) {
            QQmlComponent component(&engine);
            component.loadFromModule("NodeTool.Timeline", name);
            QVERIFY2(component.isReady(), qPrintable(component.errorString()));
            std::unique_ptr<QObject> item(component.create());
            QVERIFY2(item, qPrintable(component.errorString()));
        }
    }
    void cropMathAndEdges() {
        const QJsonObject crop{{"left", .1}, {"right", .2}, {"top", .05}, {"bottom", .15}};
        QVERIFY(nt::reframe::isCropUsable(crop));
        QVERIFY(nt::reframe::hasCrop(crop));
        QCOMPARE(nt::reframe::cropRectPx(crop, 101, 99),
                 (QJsonObject{{"x", 10}, {"y", 4}, {"width", 71}, {"height", 79}}));
        QCOMPARE(nt::reframe::cropMax(crop, "left"), .75);
        auto doc = document();
        auto next = nt::reframe::edit(doc, "setClipCropEdge", {{"clipId", "c"}, {"edge", "left"}, {"value", .2}});
        QCOMPARE(next["clips"].toArray()[0].toObject()["crop"].toObject()["left"].toDouble(), .2);
        next = nt::reframe::edit(next, "setClipCropEdge", {{"clipId", "c"}, {"edge", "right"}, {"value", .8}});
        QVERIFY(!next["clips"].toArray()[0].toObject().contains("crop"));
        QCOMPARE(next, doc);
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QVERIFY(model.applyEdit("setClipCropEdge", {{"clipId", "c"}, {"edge", "top"}, {"value", .3}}));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), doc["clips"].toArray());
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--oracle")) {
        QFile input;
        if (!input.open(0, QIODevice::ReadOnly)) {
            return 1;
        }
        QJsonArray result;
        for (const auto& value : QJsonDocument::fromJson(input.readAll()).array())
            result.append(nt::reframe::evaluate(value.toObject()));
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) {
            return 1;
        }
        output.write(QJsonDocument(result).toJson(QJsonDocument::Compact));
        return 0;
    }
    TestReframe test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_reframe.moc"
