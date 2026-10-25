#include "app/CliModes.h"
#include "app/EditRegistry.h"
#include <QCommandLineParser>
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
#include <array>
#include <memory>

class TestSeamExample : public QObject {
    Q_OBJECT
private slots:
    void cliDispatch() {
        auto name = std::to_array("timeline");
        auto flag = std::to_array("--seam-example");
        auto equals = std::to_array("--seam-example=value");
        std::array args{name.data(), flag.data()};
        QCOMPARE(nt::app::dispatchCliMode(2, args.data()).value(), 37);
        args[1] = equals.data();
        QVERIFY(!nt::app::dispatchCliMode(2, args.data()));
    }
    void defaultStartup() {
        QCommandLineParser parser;
        parser.addOption(QCommandLineOption("exit"));
        QVERIFY(parser.parse({"timeline"}));
        QVERIFY(!nt::app::dispatchDefaultStartup(*QCoreApplication::instance(), parser));
        QVERIFY(nt::app::registerDefaultStartup([](QCoreApplication& app, QCommandLineParser& args) -> nt::app::StartupResult {
            return args.isSet("exit") ? nt::app::StartupResult{41} : nt::app::StartupResult{app.applicationName() + ".json"};
        }));
        QVERIFY(!nt::app::registerDefaultStartup([](QCoreApplication&, QCommandLineParser&) -> nt::app::StartupResult { return 99; }));
        const auto source = nt::app::dispatchDefaultStartup(*QCoreApplication::instance(), parser);
        QVERIFY(source);
        QCOMPARE(std::get<QString>(*source), QCoreApplication::applicationName() + ".json");
        QVERIFY(parser.parse({"timeline", "--exit"}));
        QCOMPARE(std::get<int>(*nt::app::dispatchDefaultStartup(*QCoreApplication::instance(), parser)), 41);
    }
    void overrideEditAndUndo() {
        const auto override = [](QJsonObject raw, const QJsonObject&) {
            raw.insert("name", "Overridden ripple delete");
            return raw;
        };
        QVERIFY(nt::app::overrideEdit("rippleDeleteSelected", override));
        QVERIFY(!nt::app::overrideEdit("rippleDeleteSelected", override));
        // Builtin registration before or after the override cannot replace it.
        QVERIFY(nt::app::overrideEdit("example.lateBuiltin", override));
        QVERIFY(nt::app::registerEdit("example.lateBuiltin", [](QJsonObject raw, const QJsonObject&) { return raw; }));
        QCOMPARE(nt::app::findEdit("example.lateBuiltin")({}, {}).value("name").toString(), QString("Overridden ripple delete"));
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Before","width":640,"height":360,"fps":30,"durationMs":1000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("rippleDeleteSelected", {}));
        QCOMPARE(model.name(), QString("Overridden ripple delete"));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(model.name(), QString("Overridden ripple delete"));
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
