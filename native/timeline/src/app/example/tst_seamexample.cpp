#include "app/CliModes.h"
#include "app/MenuRegistry.h"
#include "app/PanelRegistry.h"
#include "model/TimelineModel.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include <QGuiApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QSignalSpy>
#include <QtTest>
#include <memory>

class TestSeamExample : public QObject {
    Q_OBJECT
private slots:
    void cliDispatch() {
        char name[] = "timeline";
        char flag[] = "--seam-example";
        char equals[] = "--seam-example=value";
        char* args[] = {name, flag};
        QCOMPARE(nt::app::dispatchCliMode(2, args).value(), 37);
        args[1] = equals;
        QVERIFY(!nt::app::dispatchCliMode(2, args));
    }
    void editAndUndo() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Before","width":640,"height":360,"fps":30,"durationMs":1000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        const auto generation = model.documentGeneration();
        const auto revision = model.timeline().revision;
        QVERIFY(model.applyEdit("example.rename", {{"name", "After"}}));
        QCOMPARE(model.name(), QString("After"));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.documentGeneration(), generation);
        QVERIFY(model.timeline().revision != revision);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.name(), QString("Before"));
        model.undoStack()->redo();
        QCOMPARE(model.name(), QString("After"));
        QVERIFY(!model.applyEdit("missing", {}));
        QVERIFY(!model.applyEdit("example.rename", {{"name", "After"}}));
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void panelHost() {
        PanelRegistry panels;
        QCOMPARE(panels.forSlot("left").size(), 1);
        TimelineModel model;
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 800}, {"height", 600}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        const std::function<QQuickItem*(QQuickItem*)> findPanel = [&](QQuickItem* item) -> QQuickItem* {
            if (item->objectName() == "examplePanel") {
                return item;
            }
            for (auto* child : item->childItems()) {
                if (auto* found = findPanel(child)) {
                    return found;
                }
            }
            return nullptr;
        };
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        QTRY_VERIFY(findPanel(root));
        auto* panel = findPanel(root);
        QVERIFY(panel);
        QCOMPARE(panel->parentItem()->parentItem()->objectName(), QString("panelSlot_left"));
        QVERIFY(panel->width() > 0);
    }
    void menuEnabledRule() {
        MenuRegistry menus;
        const auto disabled = menus.query("clip", {{"editable", false}});
        QCOMPARE(disabled.size(), 1);
        QCOMPARE(disabled[0].toMap().value("action").toString(), QString("example.rename"));
        QVERIFY(!disabled[0].toMap().value("enabled").toBool());
        QVERIFY(menus.query("clip", {{"editable", true}})[0].toMap().value("enabled").toBool());
        QVERIFY(menus.query("ruler", {}).isEmpty());
    }
};
QTEST_MAIN(TestSeamExample)
#include "tst_seamexample.moc"
