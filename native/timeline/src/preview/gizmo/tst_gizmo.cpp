#include "GizmoMath.h"
#include "TransformGizmoController.h"
#include "app/PanelRegistry.h"
#include "model/TimelineJson.h"
#include <QJsonDocument>
#include "edit/ClipGestureController.h"
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickWindow>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QPainter>
#include <QTemporaryDir>
#include <QThreadPool>
#include <memory>
#include <QSignalSpy>
#include <QtTest>
#include <algorithm>
#include <numbers>

using namespace nt::gizmo;
namespace {
Space space() { return {{100, 100}, {200, 100}, {200, 100}, {}, {}}; }
QJsonObject clip() {
    return {{"id", "picture"}, {"trackId", "v"}, {"mediaType", "image"}, {"name", "Still"},
            {"startMs", 100}, {"durationMs", 2000}, {"width", 100}, {"height", 100},
            {"untouched", QJsonObject{{"keep", true}}}};
}
QJsonObject animation() {
    return {{"id", "keys"}, {"preset", "custom"}, {"role", "emphasis"}, {"durationMs", 2000},
            {"params", QJsonObject{{"keyframed", true}}}, {"easing", "linear"},
            {"custom", QJsonObject{{"curves", QJsonArray{
                QJsonObject{{"property", "offsetX"}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 20}}}}},
                QJsonObject{{"property", "scale"}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 2}}}}},
                QJsonObject{{"property", "rotation"}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 0.2}}}}}
            }}, {"extra", "keep"}}}};
}
void load(TimelineModel& model, QJsonObject c = clip()) {
    QJsonObject raw{{"name", "Test"}, {"fps", 30}, {"width", 200}, {"height", 100}, {"durationMs", 3000},
                    {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"name", "Video"}, {"type", "video"}, {"index", 0}}}},
                    {"clips", QJsonArray{c}}, {"unknownDocumentField", true}};
    auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    if (!parsed.timeline) { qFatal("%s", qPrintable(parsed.error)); }
    model.setTimeline(std::move(*parsed.timeline));
}
void bind(TransformGizmoController& controller, TimelineModel& model, PlaybackClock& clock) {
    clock.setDurationMs(3000);
    clock.seek(1100);
    controller.setSize({200, 100});
    controller.setTimeline(&model);
    controller.setClock(&clock);
    controller.setSelection({"picture"});
}
double keyedValue(const QJsonObject& c, const QString& property, double t) {
    for (const auto& a : c.value("animations").toArray()) {
        for (const auto& curve : a.toObject().value("custom").toObject().value("curves").toArray()) {
            const auto o = curve.toObject();
            if (o.value("property").toString() != property) { continue; }
            for (const auto& key : o.value("keyframes").toArray()) {
                if (std::abs(key.toObject().value("t").toDouble() - t) < 1e-8) {
                    return key.toObject().value("value").toDouble();
                }
            }
        }
    }
    return std::numeric_limits<double>::quiet_NaN();
}
QQuickItem* visualNamed(QQuickItem* root, const QString& name) {
    QList<QQuickItem*> pending{root};
    while (!pending.isEmpty()) {
        auto* item = pending.takeLast();
        if (item->objectName() == name) { return item; }
        pending.append(item->childItems());
    }
    return nullptr;
}
void near(QPointF a, QPointF b) { QVERIFY2(QLineF(a, b).length() < 0.001, qPrintable(QString("%1,%2 != %3,%4").arg(a.x()).arg(a.y()).arg(b.x()).arg(b.y()))); }
}
class TestGizmo : public QObject {
    Q_OBJECT
private slots:
    void qmlPanelDiscoversEditorAndFollowsMonitor() {
        const auto panels = PanelRegistry().forSlot("preview");
        QVERIFY(std::any_of(panels.begin(), panels.end(), [](const auto& panel) {
            return panel.toMap().value("id") == "transformGizmo";
        }));
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        clock.setDurationMs(3000);
        clock.seek(1100);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}, {"width", 1000}, {"height", 700}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        QCoreApplication::processEvents();
        auto* editorItem = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(editorItem);
        QTRY_VERIFY(visualNamed(editorItem, "transformGizmo"));
        auto* g = qobject_cast<TransformGizmoController*>(visualNamed(editorItem, "transformGizmo"));
        auto* selection = editor->findChild<ClipGestureController*>();
        QVERIFY(g);
        QVERIFY(selection);
        QCoreApplication::processEvents();
        selection->setSelection({"picture"});
        QTRY_VERIFY(g->available());
        QCOMPARE(g->timeline(), &model);
        QCOMPARE(g->clock(), &clock);
        QVERIFY(!g->hasActiveFocus());
        auto* monitor = editor->findChild<QQuickItem*>("previewCompositor");
        QVERIFY(monitor);
        auto center = monitor->mapToItem(g, g->box().center);
        QVERIFY(g->contains(center));
        QVERIFY(!g->contains({0, 699}));
        editor->setProperty("width", 1200);
        editor->setProperty("height", 900);
        QCoreApplication::processEvents();
        center = monitor->mapToItem(g, g->box().center);
        QVERIFY(g->contains(center));
        QCOMPARE(g->box().center.x(), monitor->width() / 2);
    }
    void pointerRoutingFocusAndMenu() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        clock.setDurationMs(3000);
        clock.seek(1100);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import NodeTool.Timeline
            Item {
                required property TimelineModel timeline
                required property PlaybackClock clock
                property int outsideClicks: 0
                property int outsideEscapes: 0
                Keys.onEscapePressed: outsideEscapes++
                width: 600; height: 400
                focus: true
                MouseArea { anchors.fill: parent; onPressed: parent.outsideClicks++ }
                Item { objectName: "previewCompositor"; x: 100; y: 60; width: 400; height: 200 }
                ClipGestureController { timeline: parent.timeline; clock: parent.clock; selection: ["picture"] }
                TransformGizmoOverlay { anchors.fill: parent }
            }
        )", QUrl());
        std::unique_ptr<QObject> surface(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}}));
        QVERIFY2(surface, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(surface.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(600, 400);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* g = root->findChild<TransformGizmoController*>();
        QVERIFY(g);
        QTRY_VERIFY(g->available());
        root->forceActiveFocus();
        QVERIFY(!g->hasActiveFocus());
        QTest::mouseClick(&window, Qt::LeftButton, {}, {20, 350});
        QCOMPARE(root->property("outsideClicks").toInt(), 1);
        QVERIFY(!g->hasActiveFocus());
        QTest::keyClick(&window, Qt::Key_Tab);
        QVERIFY(g->hasActiveFocus());
        root->forceActiveFocus();
        const auto before = model.documentJson();
        QTest::mousePress(&window, Qt::LeftButton, {}, {320, 180});
        QVERIFY(g->hasActiveFocus());
        QTest::mouseMove(&window, {340, 190});
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(&window, Qt::LeftButton, {}, {340, 190});
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(transformOf(model.clipsJson()[0].toObject()).position.x, 10.0);
        QTest::keyClick(&window, Qt::Key_Right, Qt::ShiftModifier);
        QCOMPARE(model.undoStack()->count(), 2);
        QCOMPARE(transformOf(model.clipsJson()[0].toObject()).position.x, 20.0);
        QTest::mouseClick(&window, Qt::RightButton, {}, {320, 180});
        auto* menu = root->findChild<QObject*>("clipTransformContextMenu");
        QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QStringList labels;
        for (int i = 0; i < menu->property("count").toInt(); ++i) {
            QQuickItem* item = nullptr;
            QVERIFY(QMetaObject::invokeMethod(menu, "itemAt", Q_RETURN_ARG(QQuickItem*, item), Q_ARG(int, i)));
            if (item && item->objectName().startsWith("gizmoAction_")) { labels.append(item->property("text").toString()); }
        }
        QCOMPARE(labels, (QStringList{"Reset", "Rotate 180°", "Rotate 90° CW", "Rotate 90° CCW", "Flip horizontal", "Flip vertical"}));
        QTest::keyClick(&window, Qt::Key_Escape);
        QTRY_VERIFY(!menu->property("visible").toBool());
        QCOMPARE(root->property("outsideEscapes").toInt(), 0);
        QCOMPARE(model.undoStack()->count(), 2);
        QTest::mouseClick(&window, Qt::RightButton, {}, {320, 180});
        QTRY_VERIFY(menu->property("opened").toBool());
        auto* flip = menu->findChild<QObject*>("gizmoAction_flipHorizontal");
        QVERIFY(flip);
        QVERIFY(QMetaObject::invokeMethod(flip, "triggered"));
        QCOMPARE(model.undoStack()->count(), 3);
        QCOMPARE(transformOf(model.clipsJson()[0].toObject()).scale.x, -1.0);
        model.undoStack()->undo();
        model.undoStack()->undo();
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        root->setParentItem(nullptr);
    }
    void offscreenHandleStill() {
        TimelineModel model;
        auto c = clip();
        nt::ClipTransform transform;
        transform.scale = {0.6, 0.6};
        c.insert("transform", transformJson(transform));
        load(model, c);
        PlaybackClock clock;
        QQuickRenderControl control;
        QQuickWindow window(&control);
        window.resize(400, 200);
        window.setColor(Qt::transparent);
        TransformGizmoController controller;
        bind(controller, model, clock);
        controller.setParentItem(window.contentItem());
        controller.setSize({400, 200});
        QImage image(400, 200, QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::transparent);
        window.setRenderTarget(QQuickRenderTarget::fromPaintDevice(&image));
        control.polishItems();
        control.sync();
        control.render();
        QVERIFY(!image.isNull());
        // The top-left square is 8 px wide, white inside, blue at its edge.
        const auto corner = controller.box().corners[0].toPoint();
        QVERIFY(image.pixelColor(corner + QPoint(0, 2)).alpha() > 0);
        QVERIFY(image.pixelColor(corner + QPoint(0, 2)).red() > 240);
        QVERIFY(image.pixelColor(corner + QPoint(5, 2)).alpha() == 0);
        image.save("/tmp/pkg-H-gizmo.png");
        controller.setParentItem(nullptr);
        window.setRenderTarget({});
        control.invalidate();
    }
    void geometryAndDrag() {
        const auto s = space();
        const nt::ClipTransform identity;
        const auto g = geometry(identity, s);
        QCOMPARE(g.corners[0], QPointF(50, 0));
        QCOMPARE(g.corners[2], QPointF(150, 100));
        Drag drag{"body", identity, identity, s, {100, 50}, g};
        const auto moved = drag.update({130, 70}, false);
        QCOMPARE(moved.position.x, 30.0);
        QCOMPARE(moved.position.y, 20.0);
        for (const auto& target : {"tl", "tr", "br", "bl", "t", "r", "b", "l"}) {
            const QString name(target);
            Drag scale{name, identity, identity, s, g.handle(name), g};
            const QString opposite = QMap<QString, QString>{{"tl", "br"}, {"tr", "bl"}, {"br", "tl"}, {"bl", "tr"},
                {"t", "b"}, {"b", "t"}, {"l", "r"}, {"r", "l"}}.value(name);
            const auto fixed = g.handle(opposite);
            const auto next = scale.update((scale.pointer + fixed) / 2, false);
            QCOMPARE(next.scale.x, name == "t" || name == "b" ? 1.0 : 0.5);
            QCOMPARE(next.scale.y, name == "l" || name == "r" ? 1.0 : 0.5);
            near(geometry(next, s).handle(opposite), fixed);
        }
        Drag corner{"br", identity, identity, s, {150, 100}, g};
        const auto uniform = corner.update({200, 60}, true);
        QCOMPARE(uniform.scale.x, 1.5);
        QCOMPARE(uniform.scale.y, 1.5);
        const auto flipped = corner.update({25, -50}, false);
        QCOMPARE(flipped.scale.x, -0.25);
        QCOMPARE(flipped.scale.y, -0.5);
        const auto minimum = corner.update({50, 0}, false);
        QCOMPARE(minimum.scale.x, 0.01);
        QCOMPARE(minimum.scale.y, 0.01);
        Drag rotate{"rotate", identity, identity, s, g.handle("rotate"), g};
        const auto rotated = rotate.update({150, 50}, false);
        QVERIFY(std::abs(rotated.rotation + std::numbers::pi / 2) < 1e-6);
        near(geometry(rotated, s).pivot, g.pivot);
        const auto snapped = rotate.update({150, 31}, true);
        QVERIFY(std::abs(snapped.rotation / (std::numbers::pi / 12) - std::round(snapped.rotation / (std::numbers::pi / 12))) < 1e-6);
        Drag pivot{"pivot", identity, identity, s, g.pivot, g};
        const auto anchored = pivot.update({52, 2}, false);
        QCOMPARE(anchored.anchor.x, 0.0);
        QCOMPARE(anchored.anchor.y, 1.0);
        near(geometry(anchored, s).center, g.center);
    }
    void tiltedGestureUsesWebTwoDimensionalSnapshot() {
        nt::ClipTransform stored;
        stored.rotationY = 60;
        const auto s = space();
        const auto box = geometry(stored, s);
        near(box.corners[0], {75, 0});
        Drag drag{"br", stored, stored, s, {125, 100}, box};
        const auto next = drag.update({150, 100}, false);
        QVERIFY(!next.rotationY);
        QVERIFY(std::abs(next.scale.x - 1.5) < 1e-6);
        QVERIFY(std::abs(next.position.x - 50) < 0.001);
        near(geometry(next, s).corners[0], box.corners[0]);
    }
    void drawnAnimatedParentCropGeometry() {
        auto s = space();
        s.crop = {{"left", 0.5}, {"right", 0}, {"top", 0}, {"bottom", 0}};
        nt::ClipTransform drawn;
        drawn.position.x = 40;
        auto g = geometry(drawn, s);
        near(g.corners[0], {115, 0});
        near(g.corners[1], {165, 0});
        s.parent = nt::Mat4{2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
        near(positionDelta({10, 20}, s), {5, 10});
        g = geometry(drawn, s);
        Drag drag{"body", {}, drawn, s, g.center, g};
        QCOMPARE(drag.update(g.center + QPointF(20, 0), false).position.x, 10.0);
        drawn.rotation = 0.4;
        drawn.anchor = {0.2, 0.8};
        g = geometry(drawn, s);
        Drag pivot{"pivot", {}, drawn, s, g.pivot, g};
        const auto changed = pivot.update(g.corners[0], false);
        auto display = drawn;
        display.anchor = {drawn.anchor.x + changed.anchor.x - 0.5, drawn.anchor.y + changed.anchor.y - 0.5};
        display.position.x += changed.position.x;
        display.position.y += changed.position.y;
        near(geometry(display, s).center, g.center);
    }
    void gestureIsOneUndoAndActionsAreSeparate() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        TransformGizmoController controller;
        bind(controller, model, clock);
        const auto before = model.documentJson();
        QVERIFY(controller.begin("body", {100, 50}));
        controller.move({110, 55});
        controller.move({130, 70});
        QVERIFY(model.documentJson() != before);
        QCOMPARE(model.undoStack()->count(), 0);
        controller.end();
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        controller.action("flipHorizontal");
        QCOMPARE(model.undoStack()->count(), 2);
        QVERIFY(controller.handleKey(Qt::Key_Right));
        QCOMPARE(model.undoStack()->count(), 3);
        QVERIFY(controller.handleKey(Qt::Key_Up, Qt::ShiftModifier));
        QCOMPARE(model.undoStack()->count(), 4);
        const auto transform = transformOf(model.clipsJson()[0].toObject());
        QCOMPARE(transform.position.x, 31.0);
        QCOMPARE(transform.position.y, 10.0);
        QVERIFY(controller.handleKey(Qt::Key_Period));
        QCOMPARE(model.undoStack()->count(), 5);
        QCOMPARE(transformOf(model.clipsJson()[0].toObject()).scale.x, 1.0);
    }
    void animatedPropertyKeysFromGestureStart() {
        auto c = clip();
        c.insert("animations", QJsonArray{animation()});
        TimelineModel model;
        load(model, c);
        PlaybackClock clock;
        TransformGizmoController controller;
        bind(controller, model, clock);
        const auto before = model.documentJson();
        QVERIFY(controller.begin("body", controller.box().center));
        const auto point = controller.box().center;
        controller.move(point + QPointF(10, 5));
        controller.move(point + QPointF(30, 20));
        controller.end();
        const auto after = model.clipsJson()[0].toObject();
        QCOMPARE(transformOf(after).position.x, 0.0);
        QCOMPARE(keyedValue(after, "offsetX", 0.5), 50.0);
        QCOMPARE(keyedValue(after, "offsetY", 0.5), 20.0);
        QCOMPARE(keyedValue(after, "scale", 0.5), 2.0);
        QCOMPARE(keyedValue(after, "rotation", 0.5), 0.2);
        const auto layers = nt::activeLayersAt(model.timeline(), 1100);
        QVERIFY(!layers.empty());
        QCOMPARE(layers[0].transform->position.x, 50.0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
    }
    void keyframePatchScaleRotationAndOutside() {
        auto c = clip();
        c.insert("animations", QJsonArray{animation()});
        nt::ClipTransform base;
        base.position = {100, 50};
        base.scale = {2, 4};
        c.insert("transform", transformJson(base));
        auto next = base;
        next.position = {130, 70};
        next.scale = {3, 6};
        next.rotation = 0.5;
        auto patch = transformPatch(c, next, 1000);
        QCOMPARE(transformOf(patch).position.x, 100.0);
        QCOMPARE(transformOf(patch).scale.x, 2.0);
        QCOMPARE(transformOf(patch).rotation, 0.0);
        QCOMPARE(keyedValue(patch, "offsetX", 0.5), 50.0);
        QCOMPARE(keyedValue(patch, "offsetY", 0.5), 20.0);
        QCOMPARE(keyedValue(patch, "scale", 0.5), 3.0);
        QCOMPARE(keyedValue(patch, "rotation", 0.5), 0.7);
        QCOMPARE(transformPatch(c, next, std::nullopt), QJsonObject({{"transform", transformJson(next)}}));
        QCOMPARE(transformPatch(clip(), next, 1000), QJsonObject({{"transform", transformJson(next)}}));
    }
    void gestureCancellationAndDocumentReplacement() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        TransformGizmoController controller;
        bind(controller, model, clock);
        const auto before = model.documentJson();
        QVERIFY(controller.begin("body", {100, 50}));
        controller.move({130, 70});
        controller.cancel();
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(controller.begin("body", {100, 50}));
        controller.move({130, 70});
        auto replacement = clip();
        replacement.insert("name", "Replacement");
        load(model, replacement);
        const auto replaced = model.documentJson();
        controller.move({160, 90});
        controller.end();
        QCOMPARE(model.documentJson(), replaced);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void sourceDimensionsAndVisualEligibility() {
        TimelineModel model;
        auto c = clip();
        c.remove("width");
        c.remove("height");
        load(model, c);
        PlaybackClock clock;
        TransformGizmoController controller;
        bind(controller, model, clock);
        QVERIFY(!controller.available());
        QTemporaryDir directory;
        const auto path = directory.filePath("source.png");
        QImage image(160, 90, QImage::Format_RGB32);
        image.fill(Qt::red);
        QVERIFY(image.save(path));
        c.insert("mediaPath", path);
        load(model, c);
        QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        QTRY_VERIFY(controller.available());
        QCOMPARE(changes.count(), 0);
        const double width = QLineF(controller.box().corners[0], controller.box().corners[1]).length();
        QVERIFY(std::abs(width - 160.0 / 90 * 100) < 0.001);
        c.insert("mediaType", "audio");
        load(model, c);
        QVERIFY(!controller.available());
        c.insert("mediaType", "image");
        c.insert("hidden", true);
        load(model, c);
        QVERIFY(!controller.available());
        QThreadPool::globalInstance()->waitForDone();
    }
    void animatedScaleAndRotationGestures() {
        auto c = clip();
        c.insert("animations", QJsonArray{animation()});
        TimelineModel model;
        load(model, c);
        PlaybackClock clock;
        TransformGizmoController controller;
        bind(controller, model, clock);
        const auto g = controller.box();
        QVERIFY(controller.begin("r", g.handle("r")));
        const auto axis = g.handle("r") - g.handle("l");
        controller.move(g.handle("r") + axis / 2);
        controller.end();
        const auto scaled = model.clipsJson()[0].toObject();
        QCOMPARE(transformOf(scaled).scale.x, 1.0);
        QVERIFY(std::abs(keyedValue(scaled, "scale", 0.5) - 3.0) < 1e-6);
        near(controller.box().handle("l"), g.handle("l"));
        const auto rotatedBox = controller.box();
        const auto pointer = rotatedBox.handle("rotate");
        const auto relative = pointer - rotatedBox.pivot;
        const double angle = 0.5;
        const auto nextPointer = rotatedBox.pivot + QPointF(relative.x() * std::cos(angle) - relative.y() * std::sin(angle),
                                                           relative.x() * std::sin(angle) + relative.y() * std::cos(angle));
        QVERIFY(controller.begin("rotate", pointer));
        controller.move(nextPointer);
        controller.end();
        const auto rotated = model.clipsJson()[0].toObject();
        QCOMPARE(transformOf(rotated).rotation, 0.0);
        QVERIFY(std::abs(keyedValue(rotated, "rotation", 0.5) + 0.3) < 1e-6);
        near(controller.box().pivot, rotatedBox.pivot);
        QCOMPARE(model.undoStack()->count(), 2);
    }
    void unchangedPlayheadGeometryDoesNotNotify() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        TransformGizmoController controller;
        bind(controller, model, clock);
        QVERIFY(controller.available());
        const auto box = controller.box();
        QSignalSpy geometryChanges(&controller, &TransformGizmoController::geometryChanged);
        clock.seek(1200);
        QCOMPARE(controller.box().corners, box.corners);
        QCOMPARE(controller.box().center, box.center);
        QCOMPARE(controller.box().pivot, box.pivot);
        QCOMPARE(geometryChanges.count(), 0);
        clock.seek(50);
        QVERIFY(!controller.available());
        QCOMPARE(geometryChanges.count(), 1);
        geometryChanges.clear();
        clock.seek(60);
        QCOMPARE(geometryChanges.count(), 0);
    }
    void selectionAndPlayheadDoNotEdit() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        TransformGizmoController controller;
        bind(controller, model, clock);
        QVERIFY(controller.available());
        const auto revision = model.timeline().revision;
        QSignalSpy modelChanges(&model, &TimelineModel::clipsChanged);
        clock.seek(50);
        QVERIFY(!controller.available());
        clock.seek(1100);
        QVERIFY(controller.available());
        controller.setSelection({"picture", "other"});
        QVERIFY(!controller.available());
        controller.setSelection({});
        QVERIFY(!controller.available());
        QCOMPARE(modelChanges.count(), 0);
        QCOMPARE(model.timeline().revision, revision);
    }
};
QTEST_MAIN(TestGizmo)
#include "tst_gizmo.moc"
