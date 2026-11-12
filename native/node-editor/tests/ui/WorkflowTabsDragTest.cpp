// Workspace tab strip behavior from web/src/components/workspace/WorkspaceTabBar.tsx,
// WorkspaceTabItem.tsx and web/src/stores/WorkspaceTabsStore.ts, driven through
// real pointer and key events on EditorWindow.
#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "server/MsgPack.h"
#include <QAbstractButton>
#include <QAction>
#include <QApplication>
#include <QDir>
#include <QFile>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QMenu>
#include <QMessageBox>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSettings>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QTimer>
#include <QToolTip>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>
using namespace nodetool;

namespace {
QQuickItem *find(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) {
        return item;
    }
    for (auto child : item->childItems()) {
        if (auto result = find(child, name)) {
            return result;
        }
    }
    return nullptr;
}
// The strip of the shown tab. Each retained tab hosts its own. A strip that
// was just shown lays out its tabs in its next frame, which a person sees
// before clicking, so the helper renders that frame first.
QQuickWidget *strip(EditorWindow &window) {
    QCoreApplication::processEvents();
    QCoreApplication::processEvents();
    for (auto widget : window.findChildren<QQuickWidget *>()) {
        if (widget->isVisible() && widget->source().fileName() == "TabBar.qml" && widget->rootObject()) {
            (void)widget->grabFramebuffer();
            return widget;
        }
    }
    return nullptr;
}
QQuickItem *item(EditorWindow &window, const QString &name) {
    auto widget = strip(window);
    return widget ? find(widget->rootObject(), name) : nullptr;
}
QPoint point(QQuickItem *target, qreal x, qreal y) {
    return target->mapToScene(QPointF(x, y)).toPoint();
}
QPoint center(QQuickItem *target) {
    return point(target, target->width() / 2, target->height() / 2);
}
bool press(EditorWindow &window, const QString &name, Qt::MouseButton button) {
    auto widget = strip(window);
    auto target = widget ? find(widget->rootObject(), name) : nullptr;
    if (!target || !target->isVisible()) {
        return false;
    }
    QTest::mouseClick(widget->quickWindow(), button, Qt::NoModifier, center(target));
    QCoreApplication::processEvents();
    return true;
}
QStringList titles(EditorWindow &window) {
    QStringList result;
    for (const auto &tab : window.workflowTabs()) {
        result.append(tab.toMap()["title"].toString());
    }
    return result;
}
QJsonObject workflow(const QString &name) {
    const QJsonArray nodes{QJsonObject{{"id", "note"},
                                       {"type", "nodetool.workflows.base_node.Comment"},
                                       {"data", QJsonObject{{"comment", name}}},
                                       {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}};
    return {{"name", name}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}};
}
// An edit on the undo stack, which marks the document unsaved.
bool edit(EditorWindow &window) {
    const QJsonObject positions{{"note", QJsonObject{{"x", 40}, {"y", 40}}}};
    return bool(window.document()->applyCommand(
        {{"op", "moveNodes"}, {"positions", positions}, {"space", "absolute"}}, "Move"));
}
QMenu *popup(const QString &name) {
    QMenu *menu = nullptr;
    const auto found = QTest::qWaitFor([&] {
        menu = qobject_cast<QMenu *>(QApplication::activePopupWidget());
        return menu && menu->objectName() == name && menu->isVisible();
    }, 2000);
    return found ? menu : nullptr;
}
QStringList labels(QMenu *menu) {
    QStringList result;
    for (auto action : menu->actions()) {
        result.append(action->text());
    }
    return result;
}
QAction *entry(QMenu *menu, const QString &text) {
    for (auto action : menu->actions()) {
        if (action->text() == text) {
            return action;
        }
    }
    return nullptr;
}
void choose(QMenu *menu, const QString &text) {
    auto action = entry(menu, text);
    QVERIFY2(action, qPrintable(text));
    QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, menu->actionGeometry(action).center());
}
void answer(QMessageBox::StandardButton choice, int *asked) {
    // native-rules #13: timer on qApp has no expiry and can outlive the caller's asked pointer
    auto timer = new QTimer(qApp);
    // native-rules #12: lambda runs later on a timer and captures raw int* asked
    QObject::connect(timer, &QTimer::timeout, qApp, [choice, timer, asked] {
        auto box = qobject_cast<QMessageBox *>(QApplication::activeModalWidget());
        if (!box) {
            return;
        }
        timer->stop();
        timer->deleteLater();
        ++*asked;
        QTest::mouseClick(box->button(choice), Qt::LeftButton);
    });
    timer->start(10);
}
// A tab drag in steps, as a pointer moves across the strip.
void drag(EditorWindow &window, int from, int to, bool after, bool *indicated) {
    auto widget = strip(window);
    auto source = find(widget->rootObject(), QString("workflow-tab-%1").arg(from));
    auto target = find(widget->rootObject(), QString("workflow-tab-%1").arg(to));
    QVERIFY(source);
    QVERIFY(target);
    const auto start = point(source, source->width() / 3, source->height() / 2);
    const auto end = point(target, after ? target->width() * 0.8 : target->width() * 0.2, target->height() / 2);
    QTest::mousePress(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, start);
    for (int step = 1; step <= 8; ++step) {
        QTest::mouseMove(widget->quickWindow(), start + (end - start) * step / 8, 10);
    }
    auto indicator = find(target, "drop-indicator");
    QVERIFY(indicator);
    *indicated = indicator->isVisible()
        && (after ? indicator->x() + indicator->width() == target->width() : indicator->x() == 0);
    QTest::mouseRelease(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, end);
    QCoreApplication::processEvents();
}
} // namespace

class WorkflowTabsDragTest final : public QObject {
    Q_OBJECT
public:
    static void initMain() {
        // Offscreen has no desktop hover hint. This pointer fixture exercises hover controls.
        qputenv("QT_QUICK_CONTROLS_HOVER_ENABLED", "1");
    }
private:
    QTemporaryDir settingsDir_;
    QTemporaryDir files_;

    void openSaved(EditorWindow &window, const QString &name, bool first) {
        if (!first) {
            QVERIFY(press(window, "new-workflow-tab", Qt::LeftButton));
        }
        QVERIFY(window.document()->load(workflow(name)));
        QVERIFY(window.saveFile(files_.filePath(name + ".json")));
    }

private slots:
    void initTestCase() {
        QVERIFY(settingsDir_.isValid());
        QVERIFY(files_.isValid());
        QSettings::setDefaultFormat(QSettings::IniFormat);
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settingsDir_.path());
    }
    void init() {
        QSettings().clear();
        // These tests count workflow sockets. An open chat window adds its own.
        QSettings().setValue("canvas-chat-dock/collapsed", true);
    }
    void dragReorderPersistsAndRestores() {
        {
            EditorWindow window;
            window.resize(1200, 800);
            window.show();
            openSaved(window, "Alpha", true);
            openSaved(window, "Beta", false);
            openSaved(window, "Gamma", false);
            QCOMPARE(titles(window), (QStringList{"Alpha", "Beta", "Gamma"}));
            bool indicated = false;
            drag(window, 0, 2, true, &indicated);
            QVERIFY(indicated);
            QCOMPARE(titles(window), (QStringList{"Beta", "Gamma", "Alpha"}));
            // A drag moves a tab without selecting it.
            QCOMPARE(window.workflowName(), QString("Gamma"));
            QCOMPARE(window.activeTab(), 1);
            {
                // The web store persists every reorder, so the order survives
                // a process that never closes its window.
                EditorWindow restored;
                restored.restoreTabs();
                QCOMPARE(titles(restored), (QStringList{"Beta", "Gamma", "Alpha"}));
            }
            drag(window, 2, 0, false, &indicated);
            QVERIFY(indicated);
            QCOMPARE(titles(window), (QStringList{"Alpha", "Beta", "Gamma"}));
            // Dropping a tab on itself changes nothing.
            drag(window, 1, 1, false, &indicated);
            QCOMPARE(titles(window), (QStringList{"Alpha", "Beta", "Gamma"}));
            QVERIFY(press(window, "activate-tab-1", Qt::LeftButton));
            QCOMPARE(window.workflowName(), QString("Beta"));
            QVERIFY(window.close());
        }
        EditorWindow restored;
        restored.restoreTabs();
        QCOMPARE(titles(restored), (QStringList{"Alpha", "Beta", "Gamma"}));
        QCOMPARE(restored.activeTab(), 1);
        QCOMPARE(restored.localFilePath(), files_.filePath("Beta.json"));
    }
    void contextMenuAndDirtyCloseOthers() {
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        openSaved(window, "Alpha", true);
        openSaved(window, "Beta", false);
        openSaved(window, "Gamma", false);
        QVERIFY(press(window, "activate-tab-1", Qt::LeftButton));
        QVERIFY(edit(window));
        QVERIFY(window.hasUnsavedChanges());
        QVERIFY(press(window, "activate-tab-2", Qt::LeftButton));

        QVERIFY(press(window, "activate-tab-2", Qt::RightButton));
        auto menu = popup("workflow-tab-menu");
        QVERIFY(menu);
        QCOMPARE(labels(menu), (QStringList{"Rename", "Close tab", "Close other tabs", "Close all tabs"}));
        for (auto action : menu->actions()) {
            QVERIFY(action->isEnabled());
        }
        int asked = 0;
        answer(QMessageBox::Cancel, &asked);
        choose(menu, "Close other tabs");
        QTRY_COMPARE(asked, 1);
        QTest::qWait(30);
        // Keep open leaves every document open, as the web confirmation does.
        QCOMPARE(window.workflowTabs().size(), 3);
        QVERIFY(window.workflowTabs()[1].toMap()["dirty"].toBool());

        QVERIFY(press(window, "activate-tab-2", Qt::RightButton));
        menu = popup("workflow-tab-menu");
        QVERIFY(menu);
        answer(QMessageBox::Discard, &asked);
        choose(menu, "Close other tabs");
        QTRY_COMPARE(window.workflowTabs().size(), 1);
        QCOMPARE(asked, 2);
        QCOMPARE(titles(window), QStringList{"Gamma"});
        QCOMPARE(window.workflowName(), QString("Gamma"));

        QVERIFY(press(window, "activate-tab-0", Qt::RightButton));
        menu = popup("workflow-tab-menu");
        QVERIFY(menu);
        choose(menu, "Rename");
        QTRY_VERIFY(item(window, "tab-rename") && item(window, "tab-rename")->isVisible());
        auto widget = strip(window);
        QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier);
        QTest::keyClicks(widget, "Renamed");
        QTest::keyClick(widget, Qt::Key_Return);
        QTRY_COMPARE(titles(window), QStringList{"Renamed"});
        QCOMPARE(QJsonDocument::fromJson([&] {
            QFile file(files_.filePath("Gamma.json"));
            return file.open(QIODevice::ReadOnly) ? file.readAll() : QByteArray();
        }()).object()["name"].toString(), QString("Renamed"));

        // Double-clicking the active tab renames it, and Escape keeps the name.
        auto tab = item(window, "activate-tab-0");
        QVERIFY(tab);
        QTest::mouseDClick(strip(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(tab));
        QTRY_VERIFY(item(window, "tab-rename") && item(window, "tab-rename")->isVisible());
        QTest::keyClicks(strip(window), "Dropped");
        QTest::keyClick(strip(window), Qt::Key_Escape);
        QTRY_VERIFY(!item(window, "tab-rename")->isVisible());
        QCOMPARE(titles(window), QStringList{"Renamed"});

        QVERIFY(press(window, "new-workflow-tab", Qt::LeftButton));
        QCOMPARE(window.workflowTabs().size(), 2);
        QVERIFY(press(window, "activate-tab-1", Qt::RightButton));
        menu = popup("workflow-tab-menu");
        QVERIFY(menu);
        choose(menu, "Close tab");
        QTRY_COMPARE(window.workflowTabs().size(), 1);

        QVERIFY(press(window, "new-workflow-tab", Qt::LeftButton));
        QVERIFY(press(window, "activate-tab-0", Qt::RightButton));
        menu = popup("workflow-tab-menu");
        QVERIFY(menu);
        choose(menu, "Close all tabs");
        // Native keeps one blank workflow open after the last tab closes.
        QTRY_COMPARE(titles(window), QStringList{"Untitled workflow"});
        QVERIFY(window.localFilePath().isEmpty());
    }
    void middleClickShortcutsTooltipsAndOverflow() {
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        window.activateWindow();
        QVERIFY(QTest::qWaitForWindowActive(&window));
        openSaved(window, "Alpha", true);
        openSaved(window, "Beta", false);
        openSaved(window, "Gamma", false);
        QVERIFY(press(window, "activate-tab-1", Qt::MiddleButton));
        QCOMPARE(titles(window), (QStringList{"Alpha", "Gamma"}));
        QCOMPARE(window.workflowName(), QString("Gamma"));

        const auto key = [&](Qt::Key code, Qt::KeyboardModifiers modifiers) {
            auto view = window.scene()->views().first();
            QTest::keyClick(view->viewport(), code, modifiers);
            QCoreApplication::processEvents();
        };
        openSaved(window, "Delta", false);
        QCOMPARE(window.activeTab(), 2);
        key(Qt::Key_PageDown, Qt::ControlModifier);
        QCOMPARE(window.activeTab(), 0);
        key(Qt::Key_PageUp, Qt::ControlModifier);
        QCOMPARE(window.activeTab(), 2);
        key(Qt::Key_BracketLeft, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(window.activeTab(), 1);
        key(Qt::Key_BracketRight, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(window.activeTab(), 2);
        key(Qt::Key_Right, Qt::ControlModifier | Qt::AltModifier);
        QCOMPARE(window.activeTab(), 0);
        key(Qt::Key_Left, Qt::ControlModifier | Qt::AltModifier);
        QCOMPARE(window.activeTab(), 2);
        key(Qt::Key_1, Qt::ControlModifier);
        QCOMPARE(window.workflowName(), QString("Alpha"));
        key(Qt::Key_3, Qt::ControlModifier);
        QCOMPARE(window.workflowName(), QString("Delta"));
        // A number past the last tab selects nothing.
        key(Qt::Key_9, Qt::ControlModifier);
        QCOMPARE(window.workflowName(), QString("Delta"));
        key(Qt::Key_T, Qt::ControlModifier);
        QCOMPARE(window.workflowTabs().size(), 4);
        QCOMPARE(window.activeTab(), 3);
        key(Qt::Key_W, Qt::ControlModifier);
        QCOMPARE(titles(window), (QStringList{"Alpha", "Gamma", "Delta"}));
        QCOMPARE(window.workflowName(), QString("Delta"));

        // Only a cut-off name shows its full text, and it shows quickly.
        auto widget = strip(window);
        QTest::mouseMove(widget->quickWindow(), center(item(window, "workflow-tab-0")));
        QTest::qWait(300);
        QVERIFY(!QToolTip::isVisible());
        const QString long_name = "A workflow name long enough to be cut off in its tab";
        QVERIFY(window.document()->load(workflow(long_name)));
        QTRY_COMPARE(titles(window).last(), long_name);
        widget = strip(window);
        auto title = find(item(window, "workflow-tab-2"), "tab-title");
        QVERIFY(title);
        QTest::mouseMove(widget->quickWindow(), point(title, title->width() / 2, title->height() / 2));
        QTest::qWait(60);
        QVERIFY(!QToolTip::isVisible());
        QTRY_VERIFY_WITH_TIMEOUT(QToolTip::isVisible(), 400);
        QCOMPARE(QToolTip::text(), long_name);
        const auto tab = item(window, "workflow-tab-2");
        QCOMPARE(tab->width(), qreal(220));
        auto close = item(window, "close-tab-2");
        QVERIFY(close);
        QVERIFY(close->isVisible());
        QVERIFY(close->isEnabled());
        QVERIFY(close->width() > 0 && close->height() > 0);
        QVERIFY(tab->contains(close->mapToItem(tab, QPointF(close->width() / 2, close->height() / 2))));
        QVERIFY(widget->rect().contains(center(close)));
        QVERIFY(close->property("hoverEnabled").toBool());
        QTest::mouseMove(widget->quickWindow(), center(close));
        QTRY_VERIFY(close->property("hovered").toBool());
        QTRY_COMPARE(QToolTip::text(), "Close " + long_name);

        // Overflowing tabs scroll inside the strip, and the new-tab button
        // stays after the visible tabs.
        for (int i = 0; i < 10; ++i) {
            key(Qt::Key_T, Qt::ControlModifier);
        }
        QCOMPARE(window.workflowTabs().size(), 13);
        widget = strip(window);
        auto flick = item(window, "workflow-tab-strip");
        auto add = item(window, "new-workflow-tab");
        QVERIFY(flick->property("contentWidth").toReal() > flick->width());
        QVERIFY(add->isVisible());
        QVERIFY(add->mapToScene(QPointF(add->width(), 0)).x() <= widget->width());
        const auto last = item(window, "workflow-tab-12");
        QVERIFY(last);
        QTRY_VERIFY(last->mapToItem(flick, QPointF(0, 0)).x() >= 0);
        QVERIFY(last->mapToItem(flick, QPointF(last->width(), 0)).x() <= flick->width() + 1);
        key(Qt::Key_1, Qt::ControlModifier);
        widget = strip(window);
        flick = item(window, "workflow-tab-strip");
        QTRY_COMPARE(flick->property("contentX").toReal(), qreal(0));
        QVERIFY(item(window, "workflow-tab-0")->width() >= 120);
    }
    void runningBadgeFollowsBackgroundRuns() {
        QWebSocketServer server("tabs", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost));
        QList<QWebSocket *> peers;
        connect(&server, &QWebSocketServer::newConnection, &server, [&] {
            auto peer = server.nextPendingConnection();
            peer->setParent(&server);
            peers.append(peer);
        });
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
        QTRY_VERIFY(window.session()->connected());
        QTRY_COMPARE(peers.size(), 1);
        QVERIFY(window.document()->load(workflow("Running")));
        const auto job = window.session()->run(window.document()->snapshot());
        QVERIFY(!job.isEmpty());
        QTRY_VERIFY(window.workflowTabs()[0].toMap()["running"].toBool());
        auto badge = find(item(window, "workflow-tab-0"), "running-indicator");
        QVERIFY(badge && badge->isVisible());
        QVERIFY(press(window, "new-workflow-tab", Qt::LeftButton));
        badge = find(item(window, "workflow-tab-0"), "running-indicator");
        QVERIFY(badge && badge->isVisible());
        QVERIFY(!find(item(window, "workflow-tab-1"), "running-indicator")->isVisible());
        // The web suppresses the spinner while instant update reruns the graph.
        QVERIFY(press(window, "activate-tab-0", Qt::LeftButton));
        window.action("Instant Update: Off");
        QTRY_VERIFY(!window.workflowTabs()[0].toMap()["running"].toBool());
        window.action("Instant Update: On");
        QTRY_VERIFY(window.workflowTabs()[0].toMap()["running"].toBool());
        QVERIFY(press(window, "activate-tab-1", Qt::LeftButton));
        const auto directory = qEnvironmentVariable("NODETOOL_TABS_CAPTURE_DIR");
        if (!directory.isEmpty()) {
            QVERIFY(QDir().mkpath(directory));
            for (bool dark : {true, false}) {
                window.setDarkTheme(dark);
                QTest::qWait(80);
                (void)strip(window)->grabFramebuffer();
                const auto image = window.grab(QRect(0, 0, window.width(), 120));
                QVERIFY(image.save(directory + (dark ? "/tabs-running-dark.png" : "/tabs-running-light.png")));
            }
        }
        peers.first()->sendBinaryMessage(node_editor::encodeMsgPack(
            QJsonObject{{"type", "job_update"}, {"job_id", job}, {"status", "completed"}}));
        QTRY_VERIFY(!window.workflowTabs()[0].toMap()["running"].toBool());
        badge = find(item(window, "workflow-tab-0"), "running-indicator");
        QTRY_VERIFY(badge && !badge->isVisible());
    }
    void projectGroupingAndRestore() {
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost));
        const auto stored = [](const QString &id, const QString &name, const QString &project) {
            auto value = workflow(name);
            value["id"] = id;
            value["project_id"] = project;
            value["updated_at"] = "2026-11-06T10:00:00Z";
            return value;
        };
        const QHash<QString, QJsonObject> workflows{
            {"/api/workflows/w1", stored("w1", "Campaign brief", "p1")},
            {"/api/workflows/w2", stored("w2", "Campaign cut", "p1")},
            {"/api/workflows/w3", stored("w3", "Personal notes", "personal:user")}};
        const QJsonObject projects{{"result", QJsonObject{{"data", QJsonArray{
            QJsonObject{{"id", "personal:user"}, {"name", "Personal"}, {"isPersonal", true}},
            QJsonObject{{"id", "p1"}, {"name", "Marketing"}},
            QJsonObject{{"id", "p2"}, {"name", "Research"}}}}}}};
        connect(&server, &QTcpServer::newConnection, &server, [&] {
            while (server.hasPendingConnections()) {
                auto socket = server.nextPendingConnection();
                socket->setParent(&server);
                connect(socket, &QTcpSocket::readyRead, &server, [&, socket] {
                    const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
                    socket->setProperty("bytes", bytes);
                    if (!bytes.contains("\r\n\r\n") || socket->property("done").toBool()) {
                        return;
                    }
                    socket->setProperty("done", true);
                    const auto path = QString::fromLatin1(bytes.split(' ').value(1));
                    QJsonObject body;
                    if (workflows.contains(path)) {
                        body = workflows[path];
                    } else if (path.startsWith("/trpc/projects.list")) {
                        body = projects;
                    }
                    const auto payload = QJsonDocument(body).toJson(QJsonDocument::Compact);
                    socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "
                                  + QByteArray::number(payload.size()) + "\r\n\r\n" + payload);
                    socket->disconnectFromHost();
                });
            }
        });
        const QUrl origin(QString("http://127.0.0.1:%1").arg(server.serverPort()));
        {
            EditorWindow window;
            window.resize(1200, 800);
            window.show();
            window.session()->connectToServer(origin, {});
            QCOMPARE(window.projectName(), QString("Personal"));
            QVERIFY(item(window, "project-name"));
            QCOMPARE(item(window, "project-name")->property("text").toString(), QString("Personal"));
            QVERIFY(window.document()->load(workflow("Scratch")));
            window.openWorkflow("w1");
            QTRY_COMPARE(titles(window), QStringList{"Campaign brief"});
            // An unlisted project takes its active document's name.
            QCOMPARE(window.projectName(), QString("Campaign brief"));
            window.openWorkflow("w2");
            QTRY_COMPARE(titles(window), (QStringList{"Campaign brief", "Campaign cut"}));

            QVERIFY(press(window, "project-selector-button", Qt::LeftButton));
            auto menu = popup("project-menu");
            QVERIFY(menu);
            QTRY_COMPARE(labels(menu), (QStringList{"Personal", "Marketing", "Research"}));
            QVERIFY(entry(menu, "Marketing")->isChecked());
            QCOMPARE(window.projectName(), QString("Marketing"));
            choose(menu, "Personal");
            QTRY_COMPARE(titles(window), QStringList{"Scratch"});
            QCOMPARE(item(window, "project-name")->property("text").toString(), QString("Personal"));
            // The Personal project groups with documents that have no project.
            window.openWorkflow("w3");
            QTRY_COMPARE(titles(window), (QStringList{"Scratch", "Personal notes"}));
            QCOMPARE(window.projectName(), QString("Personal"));
            // Tab cycling stays inside the project on screen.
            window.selectAdjacentTab(1);
            QCOMPARE(window.workflowName(), QString("Scratch"));

            QVERIFY(press(window, "project-selector-button", Qt::LeftButton));
            menu = popup("project-menu");
            QVERIFY(menu);
            // Names stay known after more tabs join the account.
            QCOMPARE(labels(menu), (QStringList{"Personal", "Marketing", "Research"}));
            choose(menu, "Marketing");
            QTRY_COMPARE(window.projectName(), QString("Marketing"));
            // The project returns to the document that was active in it.
            QCOMPARE(window.workflowName(), QString("Campaign cut"));
            QVERIFY(press(window, "activate-tab-0", Qt::LeftButton));
            QVERIFY(press(window, "activate-tab-0", Qt::RightButton));
            menu = popup("workflow-tab-menu");
            QVERIFY(menu);
            choose(menu, "Close other tabs");
            QTRY_COMPARE(titles(window), QStringList{"Campaign brief"});
            QVERIFY(press(window, "project-selector-button", Qt::LeftButton));
            menu = popup("project-menu");
            QVERIFY(menu);
            choose(menu, "Personal");
            QTRY_COMPARE(titles(window), (QStringList{"Scratch", "Personal notes"}));

            // A project without open documents opens a blank one in it.
            QVERIFY(press(window, "project-selector-button", Qt::LeftButton));
            menu = popup("project-menu");
            QVERIFY(menu);
            QTRY_VERIFY(entry(menu, "Research"));
            choose(menu, "Research");
            QTRY_COMPARE(window.projectName(), QString("Research"));
            QCOMPARE(titles(window), QStringList{"Untitled workflow"});
            QVERIFY(press(window, "new-workflow-tab", Qt::LeftButton));
            QCOMPARE(window.workflowTabs().size(), 2);
            QCOMPARE(window.projectName(), QString("Research"));

            QVERIFY(press(window, "project-selector-button", Qt::LeftButton));
            menu = popup("project-menu");
            QVERIFY(menu);
            choose(menu, "Marketing");
            QTRY_COMPARE(titles(window), QStringList{"Campaign brief"});
            QVERIFY(window.close());
        }
        qputenv("NODETOOL_TOKEN", "");
        EditorWindow restored;
        restored.resize(1200, 800);
        restored.show();
        restored.restoreTabs();
        // The saved project groups restored tabs before their documents load.
        QCOMPARE(titles(restored).size(), 1);
        QTRY_COMPARE(titles(restored), QStringList{"Campaign brief"});
        restored.selectProject("");
        QTRY_COMPARE(titles(restored), (QStringList{"Untitled workflow", "Personal notes"}));
    }
    void capturesAndDropIndicator() {
        const auto directory = qEnvironmentVariable("NODETOOL_TABS_CAPTURE_DIR");
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        openSaved(window, "Brand film", true);
        openSaved(window, "Product stills with a long name for the tab", false);
        QVERIFY(edit(window));
        openSaved(window, "Voiceover", false);
        openSaved(window, "Storyboard", false);
        QVERIFY(press(window, "activate-tab-3", Qt::LeftButton));
        for (bool dark : {true, false}) {
            window.setDarkTheme(dark);
            QTest::qWait(80);
            auto widget = strip(window);
            auto source = item(window, "workflow-tab-0");
            auto target = item(window, "workflow-tab-2");
            const auto start = center(source);
            const auto end = point(target, target->width() * 0.8, target->height() / 2);
            QTest::mousePress(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, start);
            for (int step = 1; step <= 6; ++step) {
                QTest::mouseMove(widget->quickWindow(), start + (end - start) * step / 6, 10);
            }
            QVERIFY(find(target, "drop-indicator")->isVisible());
            if (!directory.isEmpty()) {
                QVERIFY(QDir().mkpath(directory));
                QTest::qWait(50);
                (void)widget->grabFramebuffer();
                const auto image = window.grab(QRect(0, 0, window.width(), 120));
                QVERIFY(image.save(directory + (dark ? "/tabs-strip-dark.png" : "/tabs-strip-light.png")));
            }
            // Releasing outside every tab leaves the order alone.
            QTest::mouseRelease(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, QPoint(widget->width() - 4, 4));
            QCoreApplication::processEvents();
            QCOMPARE(titles(window).first(), QString("Brand film"));
            QVERIFY(press(window, "activate-tab-3", Qt::RightButton));
            auto menu = popup("workflow-tab-menu");
            QVERIFY(menu);
            if (!directory.isEmpty()) {
                QVERIFY(menu->grab().save(directory + (dark ? "/tabs-menu-dark.png" : "/tabs-menu-light.png")));
            }
            menu->close();
            QCoreApplication::processEvents();
        }
    }
};
QTEST_MAIN(WorkflowTabsDragTest)
#include "WorkflowTabsDragTest.moc"
