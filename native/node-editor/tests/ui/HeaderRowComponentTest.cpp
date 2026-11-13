// HeaderRow.qml, Rail.qml and StatusBar.qml on their own: fixture
// WorkflowHeader, PanelLayout and StatusModel, no EditorWindow, graph runner,
// QtNodes or media. The executable
// links only the interface library and the QML module.
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "interfaces/WorkflowHeader.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QStyleHints>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::PanelLayout;
using nodetool::node_editor::StatusModel;
using nodetool::node_editor::WorkflowHeader;

namespace {

QQuickItem *named(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = named(child, name)) {
            return found;
        }
    }
    return nullptr;
}

QPoint centre(QQuickItem *item) {
    return item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTRY_VERIFY(item->isVisible() && item->width() > 0);
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, centre(item));
}

void show(QQuickView &view, const QVariantMap &properties, const QString &file, QSize size) {
    view.setInitialProperties(properties);
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/" + file));
    QCOMPARE(view.status(), QQuickView::Ready);
    view.resize(size);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    QVERIFY(view.rootObject());
}

}  // namespace

class HeaderRowComponentTest : public QObject {
    Q_OBJECT
private slots:
    void headerRequestsGoUp() {
        WorkflowHeader header;
        header.setWorkflowName("Poster");
        header.setRenamable(true);
        header.setSaveStatus("dirty");
        header.setHistory(true, false);
        PanelLayout panels;
        panels.setPanels({.inspector = true});
        QSignalSpy undo(&header, &WorkflowHeader::undoRequested);
        QSignalSpy redo(&header, &WorkflowHeader::redoRequested);
        QSignalSpy renamed(&header, &WorkflowHeader::renameRequested);
        QSignalSpy saved(&header, &WorkflowHeader::saveToServerRequested);
        QSignalSpy synced(&header, &WorkflowHeader::serverSyncRequested);
        QSignalSpy more(&header, &WorkflowHeader::moreRequested);
        QSignalSpy chat(&panels, &PanelLayout::toggleChatRequested);
        QSignalSpy miniMap(&panels, &PanelLayout::miniMapRequested);
        QSignalSpy inspector(&panels, &PanelLayout::toggleInspectorRequested);

        QQuickView view;
        show(view, {{"header", QVariant::fromValue(&header)}, {"panels", QVariant::fromValue(&panels)}},
             "HeaderRow.qml", {1100, 44});
        auto *root = view.rootObject();

        QCOMPARE(named(root, "header-title")->property("text").toString(), QString("Poster"));
        QCOMPARE(named(root, "header-save-label")->property("text").toString(), QString("Unsaved changes"));
        QVERIFY(!named(root, "header-save-action")->isVisible());
        QVERIFY(named(root, "header-undo")->isEnabled());
        QVERIFY(!named(root, "header-redo")->isEnabled());
        QVERIFY(named(root, "header-inspector")->property("active").toBool());
        QVERIFY(!named(root, "header-chat")->property("active").toBool());

        click(view, named(root, "header-undo"));
        QTRY_COMPARE(undo.size(), 1);
        click(view, named(root, "header-redo"));
        QTest::qWait(20);
        QCOMPARE(redo.size(), 0);
        click(view, named(root, "header-chat"));
        QTRY_COMPARE(chat.size(), 1);
        click(view, named(root, "header-mini-map"));
        QTRY_COMPARE(miniMap.size(), 1);
        QCOMPARE(miniMap.first().first().toBool(), true);
        click(view, named(root, "header-inspector"));
        QTRY_COMPARE(inspector.size(), 1);
        click(view, named(root, "header-more"));
        QTRY_COMPARE(more.size(), 1);

        // A failed save offers Retry, which saves again; a conflict offers Review.
        header.setSaveStatus("error");
        QTRY_COMPARE(named(root, "header-save-action")->property("text").toString(), QString("Retry"));
        click(view, named(root, "header-save-action"));
        QTRY_COMPARE(saved.size(), 1);
        header.setSaveStatus("conflict");
        QTRY_COMPARE(named(root, "header-save-action")->property("text").toString(), QString("Review"));
        click(view, named(root, "header-save-action"));
        QTRY_COMPARE(synced.size(), 1);
        QCOMPARE(saved.size(), 1);

        // A double-click on the name edits it, and the typed name goes up. The
        // wait keeps the last click from pairing with this one.
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval() + 50);
        QTest::mouseDClick(&view, Qt::LeftButton, Qt::NoModifier, centre(named(root, "header-title")));
        auto *field = named(root, "header-rename");
        QTRY_VERIFY(field->isVisible());
        QTest::keyClick(&view, Qt::Key_A, Qt::ControlModifier);
        for (const char key : QByteArray("Flyer")) {
            QTest::keyClick(&view, key);
        }
        QTest::keyClick(&view, Qt::Key_Return);
        QTRY_COMPARE(renamed.size(), 1);
        QCOMPARE(renamed.first().first().toString(), QString("Flyer"));
        QTRY_VERIFY(!field->isVisible());

        // A document that cannot be renamed ignores the double-click.
        header.setRenamable(false);
        QTest::mouseDClick(&view, Qt::LeftButton, Qt::NoModifier, centre(named(root, "header-title")));
        QTest::qWait(20);
        QVERIFY(!field->isVisible());
    }

    void railRequestsGoUp() {
        PanelLayout panels;
        panels.setPanels({.library = true});
        QSignalSpy browser(&panels, &PanelLayout::toggleBrowserRequested);
        QSignalSpy chat(&panels, &PanelLayout::toggleChatRequested);
        QSignalSpy library(&panels, &PanelLayout::toggleLibraryRequested);
        QSignalSpy catalog(&panels, &PanelLayout::toggleCatalogRequested);
        QSignalSpy panel(&panels, &PanelLayout::togglePanelRequested);

        QQuickView view;
        show(view, {{"panels", QVariant::fromValue(&panels)}}, "Rail.qml", {56, 700});
        auto *root = view.rootObject();
        const auto button = [root](const QString &name) { return named(root, name)->property("button").value<QQuickItem *>(); };

        QVERIFY(button("rail-library")->property("active").toBool());
        QVERIFY(!button("rail-nodes")->property("active").toBool());
        click(view, button("rail-documents"));
        QTRY_COMPARE(browser.size(), 1);
        click(view, button("rail-chats"));
        QTRY_COMPARE(chat.size(), 1);
        click(view, button("rail-library"));
        QTRY_COMPARE(library.size(), 1);
        click(view, button("rail-nodes"));
        QTRY_COMPARE(catalog.size(), 1);
        click(view, button("rail-panel"));
        QTRY_COMPARE(panel.size(), 1);

        // A view with no native panel stays disabled, and its hover says why.
        QVERIFY(!button("rail-examples")->isEnabled());
        QTest::mouseMove(&view, centre(named(root, "rail-examples")));
        auto *tip = button("rail-examples")->findChild<QObject *>("nativeButtonTooltip");
        QVERIFY(tip);
        QTRY_VERIFY(tip->property("visible").toBool());
        QCOMPARE(tip->property("text").toString(), QString("Examples has no native panel yet."));

        panels.setPanels({.catalog = true});
        QTRY_VERIFY(button("rail-nodes")->property("active").toBool());
        QVERIFY(!button("rail-library")->property("active").toBool());
    }

    void statusBarRequestsGoUp() {
        StatusModel status;
        status.setStatus({.connectionStatus = "offline",
                          .connectionDetail = "localhost:7777",
                          .nodeCount = 1,
                          .edgeCount = 3,
                          .queuedCount = 2,
                          .queueAvailable = true,
                          .systemStats = {{"cpu_percent", 41.6}, {"memory_used_gb", 7.25}}});
        PanelLayout panels;
        panels.setPanels({.trace = true});
        QSignalSpy connected(&status, &StatusModel::connectRequested);
        QSignalSpy reconnected(&status, &StatusModel::reconnectRequested);
        QSignalSpy queue(&status, &StatusModel::queueRequested);
        QSignalSpy views(&panels, &PanelLayout::statusViewRequested);

        QQuickView view;
        show(view, {{"status", QVariant::fromValue(&status)}, {"panels", QVariant::fromValue(&panels)}},
             "StatusBar.qml", {1200, 28});
        auto *root = view.rootObject();

        QCOMPARE(named(root, "status-connection")->property("text").toString(), QString("Offline"));
        QCOMPARE(named(root, "status-connection-detail")->property("text").toString(), QString("localhost:7777"));
        QCOMPARE(named(root, "status-reconnect")->property("text").toString(), QString("Reconnect"));
        QCOMPARE(named(root, "status-nodes-value")->property("text").toString(), QString("1"));
        QCOMPARE(named(root, "status-nodes-key")->property("text").toString(), QString("node"));
        QCOMPARE(named(root, "status-edges-key")->property("text").toString(), QString("edges"));
        QCOMPARE(named(root, "status-cpu-value")->property("text").toString(), QString("42%"));
        QCOMPARE(named(root, "status-queue-count")->property("text").toString(), QString("2"));
        QVERIFY(named(root, "status-trace")->property("active").toBool());
        QVERIFY(!named(root, "status-logs")->property("active").toBool());

        click(view, named(root, "status-reconnect"));
        QTRY_COMPARE(reconnected.size(), 1);
        QCOMPARE(connected.size(), 0);
        click(view, named(root, "status-queue"));
        QTRY_COMPARE(queue.size(), 1);
        for (const auto *tab : {"status-logs", "status-versions", "status-trace"}) {
            click(view, named(root, tab));
        }
        QTRY_COMPARE(views.size(), 3);
        QCOMPARE(views.at(0).first().toString(), QString("logs"));
        QCOMPARE(views.at(1).first().toString(), QString("versions"));
        QCOMPARE(views.at(2).first().toString(), QString("trace"));

        // An idle connection offers Connect, and an empty queue cannot open.
        auto next = StatusModel::Status{.connectionStatus = "idle"};
        status.setStatus(next);
        QTRY_COMPARE(named(root, "status-reconnect")->property("text").toString(), QString("Connect"));
        click(view, named(root, "status-reconnect"));
        QTRY_COMPARE(connected.size(), 1);
        click(view, named(root, "status-queue"));
        QTest::qWait(20);
        QCOMPARE(queue.size(), 1);
    }
};

QTEST_MAIN(HeaderRowComponentTest)
#include "HeaderRowComponentTest.moc"
