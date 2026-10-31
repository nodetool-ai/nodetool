#include "app/EditRegistry.h"
#include "app/PanelRegistry.h"
#include "app/MenuRegistry.h"
#include "model/TimelineModel.h"
#include "model/TimelineJson.h"
#include <QSignalSpy>
#include <QQuickItem>
#include <QQuickWindow>
#include <QGuiApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJSValue>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QtTest>
#include <memory>

class TestInspectorPrimitives : public QObject {
    Q_OBJECT
private slots:
    void init() {
        QTest::failOnWarning(QRegularExpression(".*Binding loop.*"));
    }
    void sectionActivation_data() {
        QTest::addColumn<bool>("disabled");
        QTest::newRow("enabled") << false;
        QTest::newRow("disabled") << true;
    }
    void sectionActivation() {
        QFETCH(bool, disabled);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
InspectorSection { width: 300; title: "Effect"; checkable: true; checked: true })", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        QSignalSpy changes(object.get(), SIGNAL(checkedChangedByUser(bool)));
        QSignalSpy toggles(object.get(), SIGNAL(toggled(bool)));
        QVERIFY(changes.isValid());
        QVERIFY(toggles.isValid());
        QVERIFY(object->setProperty("checkboxDisabled", disabled));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        window.resize(300, 100);
        item->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QQuickItem* checkbox = nullptr;
        for (auto* child : item->findChildren<QQuickItem*>()) {
            if (child->property("checkState").isValid()) {
                checkbox = child;
                break;
            }
        }
        QVERIFY(checkbox);
        const auto center = checkbox->mapToScene(QPointF(checkbox->width() / 2, checkbox->height() / 2)).toPoint();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, center);
        QCOMPARE(changes.count(), disabled ? 0 : 1);
        if (!disabled) {
            QCOMPARE(changes[0][0].toBool(), false);
        }
        QQuickItem* disclosure = nullptr;
        for (auto* child : item->findChildren<QQuickItem*>()) {
            if (child->property("menuButton").toBool() && child->property("accessibleName").toString() == "Effect") {
                disclosure = child;
                break;
            }
        }
        QVERIFY(disclosure);
        const auto disclosurePoint = disclosure->mapToScene(QPointF(disclosure->width() - 12, disclosure->height() / 2)).toPoint();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, disclosurePoint);
        QCOMPARE(toggles.count(), 1);
        QCOMPARE(toggles.last()[0].toBool(), false);
        disclosure->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Return);
        QCOMPARE(toggles.count(), 2);
        QCOMPARE(toggles.last()[0].toBool(), true);
    }
    void sliderDoubleTapResetsThroughSharedControl() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
InspectorSliderRow { width: 300; label: "Opacity"; value: 0.2; min: 0; max: 1; resetValue: 0.7 })", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        window.resize(300, 50);
        item->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QQuickItem* slider = nullptr;
        for (auto* child : item->findChildren<QQuickItem*>()) {
            if (child->property("resetOnDoubleTap").toBool()) { slider = child; break; }
        }
        QVERIFY(slider);
        QSignalSpy changes(object.get(), SIGNAL(change(double)));
        QVERIFY(changes.isValid());
        const auto point = slider->mapToScene(QPointF(slider->width() / 2, slider->height() / 2)).toPoint();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, point);
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, point);
        QTRY_COMPARE(changes.count(), 1);
        QCOMPARE(changes[0][0].toDouble(), 0.7);
    }
    void previewFeedback_data() {
        QTest::addColumn<bool>("keyboard");
        QTest::newRow("scrub") << false;
        QTest::newRow("arrow") << true;
    }
    void previewFeedback() {
        QFETCH(bool, keyboard);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
InspectorPillInput { width: 140; value: "10"; scrub: ({step:1,min:0,max:100}); onPreview: next => value = next })", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        window.resize(140, 40);
        item->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QSignalSpy starts(object.get(), SIGNAL(gestureStarted()));
        QSignalSpy previews(object.get(), SIGNAL(preview(QString)));
        QSignalSpy commits(object.get(), SIGNAL(commit(QString)));
        if (keyboard) {
            QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, {10, 14});
            QTest::keyPress(&window, Qt::Key_Up);
            QTest::keyPress(&window, Qt::Key_Up);
            QCOMPARE(commits.count(), 0);
            QTest::keyRelease(&window, Qt::Key_Up);
        } else {
            QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, {10, 14});
            QTest::mouseMove(&window, {30, 14});
            QCOMPARE(commits.count(), 0);
            QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, {30, 14});
        }
        QCOMPARE(starts.count(), 1);
        QVERIFY(!previews.isEmpty());
        QCOMPARE(commits.count(), 1);
        QCOMPARE(commits[0][0], previews.last()[0]);
        // Losing focus after release must not commit the same gesture twice.
        item->forceActiveFocus();
        QCOMPARE(commits.count(), 1);
    }
    void arrowStepFallsBackToStoredValueAfterClearing() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
InspectorPillInput { width: 140; value: "10"; scrub: ({step:1,min:0,max:100}); onPreview: next => value = next })", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        window.resize(140, 40);
        item->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QSignalSpy starts(object.get(), SIGNAL(gestureStarted()));
        QSignalSpy previews(object.get(), SIGNAL(preview(QString)));
        QSignalSpy commits(object.get(), SIGNAL(commit(QString)));
        QVERIFY(starts.isValid());
        QVERIFY(previews.isValid());
        QVERIFY(commits.isValid());
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, {10, 14});
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        QTest::keyClick(&window, Qt::Key_Backspace);
        QCOMPARE(object->property("draft").toString(), QString(""));
        QCOMPARE(object->property("value").toString(), QString("10"));
        QTest::keyPress(&window, Qt::Key_Up);
        QCOMPARE(commits.count(), 0);
        QTest::keyRelease(&window, Qt::Key_Up);
        QCOMPARE(starts.count(), 1);
        QVERIFY(!previews.isEmpty());
        QCOMPARE(previews.last()[0].toString(), QString("11"));
        QCOMPARE(commits.count(), 1);
        QCOMPARE(commits[0][0].toString(), QString("11"));
        item->forceActiveFocus();
        QCOMPARE(commits.count(), 1);
    }
    void documentEditsUseIncrementalPaths() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Before","width":640,"height":360,"fps":30,"durationMs":5000,"tracks":[{"id":"v","type":"video","name":"Video","index":0}],"clips":[{"id":"c","trackId":"v","startMs":0,"durationMs":1000,"mediaType":"video"}]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        const auto generation = model.documentGeneration();
        QSignalSpy resets(model.tracks(), &QAbstractItemModel::modelReset);
        QSignalSpy clips(&model, &TimelineModel::clipsChanged);
        QSignalSpy markers(&model, &TimelineModel::markersChanged);
        QVERIFY(model.applyEdit("moveClip", {{"clipId", "c"}, {"deltaMs", 100}}));
        QCOMPARE(model.clipsJson()[0].toObject().value("startMs").toDouble(), 100.0);
        QCOMPARE(clips.count(), 1);
        QCOMPARE(resets.count(), 0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        QVERIFY(model.applyEdit("addMarker", {{"id", "m"}, {"timeMs", 32.5}, {"label", "Marker"}}));
        QCOMPARE(model.markersJson()[0].toObject().value("timeMs").toDouble(), 33.0);
        QCOMPARE(markers.count(), 1);
        QCOMPARE(clips.count(), 2);
        QCOMPARE(resets.count(), 0);
        QVERIFY(model.applyEdit("deleteMarker", {{"id", "m"}}));
        QVERIFY(model.markersJson().isEmpty());
        QCOMPARE(model.undoStack()->count(), 2);
        model.undoStack()->undo();
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        nt::app::registerEdit("test.settings", [](QJsonObject raw, const QJsonObject&) {
            raw.insert("width", 1280);
            raw.insert("fps", 24);
            auto tracks = raw.value("tracks").toArray();
            auto track = tracks[0].toObject();
            track.insert("name", "Renamed");
            tracks[0] = track;
            raw.insert("tracks", tracks);
            return raw;
        });
        QVERIFY(model.applyEdit("test.settings", {}));
        QCOMPARE(model.canvasWidth(), 1280);
        QCOMPARE(model.fps(), 24.0);
        QCOMPARE(model.tracks()->data(model.tracks()->index(0), TrackListModel::NameRole).toString(), QString("Renamed"));
        QCOMPARE(resets.count(), 1);
        QCOMPARE(model.documentGeneration(), generation);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.canvasWidth(), 640);
        QCOMPARE(model.fps(), 30.0);
        QVERIFY(!model.applyEdit("example.rename", {{"name", "Must not register here"}}));
        PanelRegistry panels;
        MenuRegistry menus;
        for (const auto& panel : panels.forSlot("left")) {
            QVERIFY(panel.toMap().value("id").toString() != "example");
        }
        for (const auto& entry : menus.query("clip", {})) {
            QVERIFY(entry.toMap().value("action").toString() != "example.rename");
        }
    }
    void pillDragCommitsOnceAndBlankDraftIsRejected() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
InspectorPillInput { width: 140; value: "10"; scrub: ({step:1,min:0,max:100}) })", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        window.resize(140, 40);
        item->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QSignalSpy commits(object.get(), SIGNAL(commit(QString)));
        QSignalSpy starts(object.get(), SIGNAL(gestureStarted()));
        QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, {10, 14});
        QTest::mouseMove(&window, {30, 14});
        QCOMPARE(commits.count(), 0);
        QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, {30, 14});
        QCOMPARE(commits.count(), 1);
        QCOMPARE(starts.count(), 1);
        QCOMPARE(commits[0][0].toString(), QString("30"));
        object->setProperty("draft", "");
        QVERIFY(QMetaObject::invokeMethod(object.get(), "commitDraft"));
        QCOMPARE(commits.count(), 1);
        QCOMPARE(object->property("draft").toString(), QString("10"));
        object->setProperty("draft", "42");
        QVERIFY(QMetaObject::invokeMethod(object.get(), "commitDraft"));
        QCOMPARE(commits.count(), 2);
        QCOMPARE(commits[1][0].toString(), QString("42"));
    }
    void instantiate_data() {
        QTest::addColumn<QString>("type");
        for (const auto& type : QStringList{"InspectorHeader", "InspectorCard", "ClipIdentityCard", "InspectorSection",
                "InspectorSectionTitle", "InspectorRow", "InspectorStaticValue", "InspectorPillInput", "InspectorSliderRow",
                "InspectorColour", "InspectorSelect", "InspectorToggleRow", "InspectorDivider"}) {
            QTest::newRow(qPrintable(type)) << type;
        }
    }
    void instantiate() {
        QFETCH(QString, type);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(("import QtQuick\nimport NodeTool.Timeline\n" + type + " { width: 300 }").toUtf8(), QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--helpers")) {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQml
import "qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/primitives/InspectorPrimitivesHelpers.js" as Helpers
QtObject { function call(name, args) { return Helpers[name].apply(null, args) } })", QUrl());
        std::unique_ptr<QObject> helper(component.create());
        if (!helper) { qWarning() << component.errors(); return 1; }
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) {
            return 1;
        }
        const auto requests = QJsonDocument::fromJson(input.readAll()).array();
        QJsonArray results;
        for (const auto& value : requests) {
            const auto request = value.toArray();
            QVariant result;
            if (!QMetaObject::invokeMethod(helper.get(), "call", Q_RETURN_ARG(QVariant, result),
                    Q_ARG(QVariant, request[0].toString()), Q_ARG(QVariant, request[1].toArray().toVariantList()))) {
                return 1;
            }
            if (result.metaType() == QMetaType::fromType<QJSValue>()) {
                result = result.value<QJSValue>().toVariant();
            }
            results.append(QJsonValue::fromVariant(result));
        }
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) {
            return 1;
        }
        output.write(QJsonDocument(results).toJson(QJsonDocument::Compact));
        return 0;
    }
    TestInspectorPrimitives test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_inspectorprimitives.moc"
