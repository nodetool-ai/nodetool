#include "app/CliModes.h"
#include "app/PanelRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "server/TimelineList/TimelineListController.h"
#include <QGuiApplication>
#include <QCommandLineParser>
#include <QQuickView>
#include <QScopeGuard>
#include <QTimer>
#include <QImage>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQmlExpression>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <memory>
#include <functional>

class TestTimelineListUi : public QObject {
    Q_OBJECT
    std::unique_ptr<QObject> make(QQmlEngine& engine, const QString& name, const QVariantMap& props) {
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/" + name + ".qml"));
        if (!component.isReady()) {
            qWarning().noquote() << component.errorString();
            return {};
        }
        return std::unique_ptr<QObject>(component.createWithInitialProperties(props));
    }
    QQuickItem* item(QObject* root, const char* name) {
        const auto target = QString::fromLatin1(name);
        const std::function<QQuickItem*(QQuickItem*)> find = [&](QQuickItem* parent) -> QQuickItem* {
            if (!parent) {
                return nullptr;
            }
            if (parent->objectName() == target) {
                return parent;
            }
            for (auto* child : parent->childItems()) {
                if (auto* found = find(child)) {
                    return found;
                }
            }
            return nullptr;
        };
        return find(qobject_cast<QQuickItem*>(root));
    }
    bool hasText(QQuickItem* root, const QString& text) {
        if (root->property("text").toString() == text) {
            return true;
        }
        for (auto* child : root->childItems()) {
            if (hasText(child, text)) {
                return true;
            }
        }
        return false;
    }
    void load(TimelineModel& model) {
        auto parsed = nt::parseTimelineJson(R"({"id":"test","name":"Before","width":640,"height":360,"fps":30,"tracks":[],"clips":[],"markers":[],"custom":{"keep":true}})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
    }
    void show(QQuickWindow& window, QObject* object, int width, int height) {
        auto* root = qobject_cast<QQuickItem*>(object);
        QVERIFY(root);
        root->setSize(QSizeF(width, height));
        root->setParentItem(window.contentItem());
        window.resize(width, height);
        window.setColor(QColor("#08090A"));
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
    }
    void still(QQuickWindow& window, const QString& filename) {
        window.requestUpdate();
        QTest::qWait(100);
        // Software rendering's grabWindow works on the offscreen platform without a GPU.
        const QImage image = window.grabWindow();
        QVERIFY(!image.isNull());
        QVERIFY2(image.save(filename), qPrintable(filename));
        int different = 0;
        const auto background = image.pixelColor(0, 0);
        for (int y = 0; y < image.height(); ++y) {
            for (int x = 0; x < image.width(); ++x) {
                different += image.pixelColor(x, y) != background;
            }
        }
        QVERIFY(different > 50);
    }
private slots:
    void startupListWithoutServer() {
        const auto saved = qgetenv("NODETOOL_SERVER_URL");
        const auto hadServer = qEnvironmentVariableIsSet("NODETOOL_SERVER_URL");
        const auto restore = qScopeGuard([saved, hadServer] {
            if (hadServer) {
                qputenv("NODETOOL_SERVER_URL", saved);
            } else {
                qunsetenv("NODETOOL_SERVER_URL");
            }
        });
        qunsetenv("NODETOOL_SERVER_URL");
        bool sawList = false;
        bool sawError = false;
        QTimer close;
        close.setSingleShot(true);
        QObject::connect(&close, &QTimer::timeout, &close, [&sawList, &sawError] {
            for (auto* window : QGuiApplication::allWindows()) {
                auto* view = qobject_cast<QQuickView*>(window);
                if (view && view->isVisible() && view->rootObject()) {
                    sawList = view->rootObject()->objectName() == "TimelineListPanel";
                    const auto* controller = view->rootObject()->property("controller").value<QObject*>();
                    sawError = controller && controller->property("error").toString().contains("NODETOOL_SERVER_URL");
                    view->close();
                }
            }
        });
        close.start(200);
        QCommandLineParser parser;
        QVERIFY(parser.parse({"timeline"}));
        const auto result = nt::app::dispatchDefaultStartup(*QCoreApplication::instance(), parser);
        QVERIFY(result);
        QCOMPARE(std::get<int>(*result), 0);
        QVERIFY(sawList);
        QVERIFY(sawError);
    }
    void settingsPanelRegistered() {
        const auto panels = PanelRegistry().forSlot("overlay");
        int matches = 0;
        for (const auto& entry : panels) {
            const auto panel = entry.toMap();
            if (panel.value("id") == "projectSettings") {
                ++matches;
                QCOMPARE(panel.value("source").toUrl(), QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/ProjectSettingsDialog.qml"));
                QCOMPARE(panel.value("order").toInt(), 20);
                QCOMPARE(panel.value("title").toString(), QString("Project settings"));
            }
        }
        QCOMPARE(matches, 1);
    }
    void panelKeepsCppOwnership() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Item {
    required property TimelineModel timeline
    ProjectSettingsDialog { anchors.fill: parent }
})", QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> host(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(host, qPrintable(component.errorString()));
        const auto ownership = QQmlEngine::objectOwnership(&model);
        // Restore ownership before reporting red, so the test itself cannot free a stack model.
        QQmlEngine::setObjectOwnership(&model, QQmlEngine::CppOwnership);
        QCOMPARE(ownership, QQmlEngine::CppOwnership);
    }
    void settingsCommitAndUndo() {
        TimelineModel model;
        load(model);
        const auto before = model.documentJson();
        QQmlEngine engine;
        auto dialog = make(engine, "ProjectSettingsDialog", {{"timeline", QVariant::fromValue(&model)}});
        QVERIFY2(dialog, "ProjectSettingsDialog must exist");
        QQuickWindow window;
        show(window, dialog.get(), 800, 800);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        QVERIFY(dialog->setProperty("widthText", "1280"));
        QVERIFY(dialog->setProperty("heightText", "720"));
        QVERIFY(dialog->setProperty("fpsText", "24"));
        auto* apply = item(dialog.get(), "applySettings");
        QVERIFY(apply);
        QVERIFY(apply->isEnabled());
        const auto center = apply->mapToScene(QPointF(apply->width()/2, apply->height()/2)).toPoint();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, center);
        QCOMPARE(model.canvasWidth(), 1280);
        QCOMPARE(model.canvasHeight(), 720);
        QCOMPARE(model.fps(), 24.0);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.canvasWidth(), 640);
        QCOMPARE(model.canvasHeight(), 360);
        QCOMPARE(model.fps(), 30.0);
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(model.canvasWidth(), 1280);
        QVERIFY(!model.applyEdit("setProjectSettings", {{"width", 15}, {"height", 720}, {"fps", 24}}));
        QVERIFY(!model.applyEdit("setProjectSettings", {{"width", 1280}, {"height", 720}, {"fps", 24.5}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        QVERIFY(dialog->setProperty("widthText", ""));
        QVERIFY(!apply->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "commit"));
        QCOMPARE(model.canvasWidth(), 1280);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void unnamedRowLabel() {
        QQmlEngine engine;
        const QVariantList rows{QVariantMap{{"id", "unnamed"}, {"name", ""}, {"group", "Today"}}};
        auto panel = make(engine, "TimelineListPanel", {{"previewDocuments", rows}, {"autoRefresh", false}});
        QVERIFY(panel);
        QQuickWindow window;
        show(window, panel.get(), 320, 480);
        auto* row = item(panel.get(), "TimelineListItem_unnamed");
        QVERIFY(row);
        QVERIFY(hasText(row, "Untitled video"));
        QQmlExpression accessible(QQmlEngine::contextForObject(row), row, "Accessible.name");
        QCOMPARE(accessible.evaluate().toString(), QString("Untitled video"));
    }
    void emptySearchDescription() {
        QQmlEngine engine;
        auto panel = make(engine, "TimelineListPanel", {{"previewDocuments", QVariantList{}}, {"autoRefresh", false}});
        QVERIFY(panel);
        auto* search = item(panel.get(), "searchInput");
        QVERIFY(search);
        search->setProperty("text", "NO MATCH");
        QVERIFY(hasText(qobject_cast<QQuickItem*>(panel.get()), "Try a different search term."));
    }
    void offsetError() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        auto dialog = make(engine, "ProjectSettingsDialog", {{"timeline", QVariant::fromValue(&model)}});
        QVERIFY(dialog);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        auto* offset = item(dialog.get(), "offsetField");
        QVERIFY(offset);
        QVERIFY(offset->setProperty("text", "-1"));
        QVERIFY(hasText(offset, "0 or more"));
    }
    void layoutAndStills() {
        QQmlEngine engine;
        nt::server::TimelineListController controller(QUrl(), "", "");
        const QVariantList rows{
            QVariantMap{{"id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, {"name", "Morning edit"}, {"group", "Today"}},
            QVariantMap{{"id", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}, {"name", "Social cut"}, {"group", "Today"}}};
        auto panel = make(engine, "TimelineListPanel", {{"controller", QVariant::fromValue(&controller)},
            {"previewDocuments", rows}, {"autoRefresh", false}});
        QVERIFY2(panel, "TimelineListPanel must exist");
        QQuickWindow listWindow;
        show(listWindow, panel.get(), 320, 480);
        auto* header = item(panel.get(), "panelHeader");
        auto* search = item(panel.get(), "searchInput");
        auto* row = item(panel.get(), "TimelineListItem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        QVERIFY(header && search && row);
        QCOMPARE(header->height(), 36.0);
        QCOMPARE(search->height(), 28.0);
        QCOMPARE(search->y(), 8.0);
        QCOMPARE(row->height(), 28.0);
        QCOMPARE(row->property("padding").toDouble(), 4.0);
        auto* icon = item(row, "listPanelIcon");
        QVERIFY(icon);
        QCOMPARE(icon->width(), 20.0);
        QCOMPARE(icon->x(), 4.0);
        QCOMPARE(row->property("iconGap").toDouble(), 4.0);
        still(listWindow, "TimelineListPanel.png");
        search->setProperty("text", "NO MATCH");
        QTRY_VERIFY(!item(panel.get(), "TimelineListItem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        auto* empty = item(panel.get(), "emptyTitle");
        QVERIFY(empty);
        QCOMPARE(empty->property("text").toString(), QString("No matching timelines"));
        TimelineModel model;
        load(model);
        auto dialog = make(engine, "ProjectSettingsDialog", {{"timeline", QVariant::fromValue(&model)}});
        QVERIFY(dialog);
        QQuickWindow settingsWindow;
        show(settingsWindow, dialog.get(), 800, 800);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        auto* paper = item(dialog.get(), "dialogPaper");
        QVERIFY(paper);
        QCOMPARE(paper->width(), 444.0);
        auto* content = item(dialog.get(), "dialogContent");
        QVERIFY(content);
        QCOMPARE(content->x(), 24.0);
        const QStringList fields{"canvasSizeLabel", "resolutionPreset", "widthField", "heightField",
                                 "frameRateLabel", "frameRatePreset", "fpsField", "tempoLabel",
                                 "bpmField", "beatsField", "beatUnitField", "offsetField"};
        for (const auto& field : fields) {
            QVERIFY2(item(dialog.get(), field.toLatin1().constData()), qPrintable(field));
        }
        QCOMPARE(item(dialog.get(), "canvasSizeLabel")->property("text").toString(), QString("CANVAS SIZE"));
        QCOMPARE(item(dialog.get(), "widthField")->property("label").toString(), QString("Width"));
        QCOMPARE(item(dialog.get(), "heightField")->property("label").toString(), QString("Height"));
        QCOMPARE(item(dialog.get(), "frameRateLabel")->property("text").toString(), QString("FRAME RATE"));
        QCOMPARE(item(dialog.get(), "fpsField")->property("label").toString(), QString("FPS"));
        const auto y = [&](const char* name) { return item(dialog.get(), name)->mapToScene(QPointF()).y(); };
        QVERIFY(y("canvasSizeLabel") < y("resolutionPreset"));
        QVERIFY(y("resolutionPreset") < y("widthField"));
        QCOMPARE(y("widthField"), y("heightField"));
        QVERIFY(y("widthField") < y("frameRateLabel"));
        QVERIFY(y("frameRatePreset") < y("tempoLabel"));
        QVERIFY(y("tempoLabel") < y("offsetField"));
        still(settingsWindow, "ProjectSettingsDialog.png");
        // The xs dialog shrinks to fit narrow windows, retaining a 16 px margin.
        dialog->setProperty("width", 360);
        QCOMPARE(paper->width(), 328.0);
    }
};
QTEST_MAIN(TestTimelineListUi)
#include "tst_timelinelistui.moc"
