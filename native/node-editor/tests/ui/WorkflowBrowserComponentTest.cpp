// WorkflowBrowser.qml on its own: a fixture WorkflowBrowser, PanelLayout and
// StatusModel, no EditorWindow, graph runner, QtNodes or server. The executable
// links only the interface library and the QML module.
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "server/WorkflowBrowser.h"

#include <QGuiApplication>
#include <QStyleHints>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::PanelLayout;
using nodetool::node_editor::StatusModel;
using nodetool::node_editor::WorkflowBrowser;

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

QQuickItem *withText(QQuickItem *root, const QString &text) {
    if (root->property("text").toString() == text) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = withText(child, text)) {
            return found;
        }
    }
    return nullptr;
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTRY_VERIFY(item->isVisible() && item->width() > 0);
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier,
                      item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
}

QQuickItem *visibleNamed(QQuickItem *root, const QString &name) {
    auto *item = named(root, name);
    return item && item->isVisible() ? item : nullptr;
}

// Answers every request with one workflow page, so the panel has rows.
class PageServer final : public QTcpServer {
public:
    QByteArray page;
    PageServer() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            auto *socket = nextPendingConnection();  // Owned by this server, its parent.
            connect(socket, &QTcpSocket::readyRead, socket, [this, socket] {
                if (!socket->peek(socket->bytesAvailable()).contains("\r\n\r\n")) { return; }
                socket->readAll();
                socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " +
                              QByteArray::number(page.size()) + "\r\n\r\n" + page);
                socket->disconnectFromHost();
            });
        });
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
};

void doubleClick(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTest::mouseDClick(&view, Qt::LeftButton, Qt::NoModifier,
                       item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
}

}  // namespace

class WorkflowBrowserComponentTest : public QObject {
    Q_OBJECT
private slots:
    void browserSendsWindowRequests() {
        // An unconfigured browser makes no requests.
        WorkflowBrowser browser;
        PanelLayout panels;
        StatusModel status;
        QSignalSpy close(&panels, &PanelLayout::toggleBrowserRequested);
        QSignalSpy connectServer(&status, &StatusModel::connectRequested);
        QQuickView view;
        view.setInitialProperties({{"browser", QVariant::fromValue(&browser)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"status", QVariant::fromValue(&status)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkflowBrowser.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(360, 600);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        click(view, named(root, "browser-close"));
        QCOMPARE(close.size(), 1);
        // The connect button shows only while the session has no server.
        auto *connect = withText(root, "Connect to server");
        click(view, connect);
        QCOMPARE(connectServer.size(), 1);
        status.setStatus({.connected = true});
        QVERIFY(!connect->isVisible());
    }

    // WorkflowList.tsx: day groups, favourites, selection with bulk delete,
    // the row menu's Edit, and rename in place.
    void listMatchesTheWebList() {
        PageServer server;
        server.page = R"({"workflows":[
            {"id":"a","name":"Alpha","updated_at":"2026-11-13T09:00:00Z","tags":["image"]},
            {"id":"b","name":"Beta","updated_at":"2026-11-12T09:00:00Z","description":"Second"}],"next":null})";
        WorkflowBrowser browser;
        PanelLayout panels;
        StatusModel status;
        status.setStatus({.connected = true});
        browser.configure(server.url());
        browser.setNow(QDateTime::fromString("2026-11-13T12:00:00Z", Qt::ISODate));
        browser.refresh();
        QTRY_VERIFY(!browser.loading());
        QCOMPARE(browser.rows().size(), 2);
        QQuickView view;
        view.setInitialProperties({{"browser", QVariant::fromValue(&browser)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"status", QVariant::fromValue(&status)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkflowBrowser.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(360, 900);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QTRY_VERIFY(visibleNamed(root, "workflow-group-Today"));
        QVERIFY(visibleNamed(root, "workflow-group-Yesterday"));
        QVERIFY(visibleNamed(root, "workflow-tags"));
        // A single click opens after the double-click interval.
        QSignalSpy opened(&browser, &WorkflowBrowser::openRequested);
        click(view, named(root, "workflow-row-b"));
        QTRY_COMPARE(opened.size(), 1);
        QCOMPARE(opened.first().first().toString(), "b");
        // The star stays on a favourite.
        browser.toggleFavorite("a");
        QTRY_VERIFY(visibleNamed(root, "workflow-favorite-a"));
        click(view, named(root, "workflow-favorites-only"));
        QVERIFY(browser.favoritesOnly());
        QTRY_VERIFY(!visibleNamed(root, "workflow-row-b"));
        click(view, named(root, "workflow-favorites-only"));
        // Selection mode: a row click selects, and the toolbar deletes the selection.
        QSignalSpy deleteSelected(&browser, &WorkflowBrowser::deleteSelectedRequested);
        click(view, named(root, "workflow-selection-mode"));
        QTRY_VERIFY(visibleNamed(root, "workflow-select-a"));
        click(view, named(root, "workflow-row-b"));
        QCOMPARE(browser.selectedIds(), QStringList{"b"});
        QCOMPARE(opened.size(), 1);
        click(view, named(root, "workflow-delete-selected"));
        QCOMPARE(deleteSelected.first().first().toStringList(), QStringList{"b"});
        click(view, named(root, "workflow-selection-mode"));
        // Name order drops the day groups and shows each row's date.
        browser.setSortBy("name");
        QTRY_VERIFY(!visibleNamed(root, "workflow-group-Today"));
        QTRY_VERIFY(visibleNamed(root, "workflow-date-b"));
        // The row menu's Edit opens the settings form for that row.
        QMetaObject::invokeMethod(root, "openMenu", Q_ARG(QVariant, browser.rows()[1]),
                                  Q_ARG(QVariant, QVariant::fromValue<QObject *>(named(root, "workflow-row-b"))),
                                  Q_ARG(QVariant, 0), Q_ARG(QVariant, 0));
        // The menu lives in the window's overlay, outside the panel.
        QTRY_VERIFY(visibleNamed(view.contentItem(), "workflow-menu-edit"));
        click(view, named(view.contentItem(), "workflow-menu-edit"));
        QTRY_VERIFY(visibleNamed(root, "workflow-edit-form"));
        QCOMPARE(named(root, "workflow-edit-description")->property("value").toString(), "Second");
        click(view, named(root, "workflow-edit-close"));
        QTRY_VERIFY(!visibleNamed(root, "workflow-edit-form"));
        // A double-click renames in place instead of opening.
        doubleClick(view, named(root, "workflow-row-a"));
        QTRY_VERIFY(visibleNamed(root, "workflow-rename-a"));
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval() + 50);
        QCOMPARE(opened.size(), 1);
        QTest::keyClick(&view, Qt::Key_Escape);
        QTRY_VERIFY(!visibleNamed(root, "workflow-rename-a"));
    }

    void browserRequestsGoThroughTheModel() {
        WorkflowBrowser browser;
        QSignalSpy opened(&browser, &WorkflowBrowser::openRequested);
        QSignalSpy deleted(&browser, &WorkflowBrowser::deleteRequested);
        QSignalSpy reloaded(&browser, &WorkflowBrowser::reloadRequested);
        browser.open("w1");
        browser.confirmDelete("w1", "Poster");
        browser.reload();
        QCOMPARE(opened.first().first().toString(), "w1");
        QCOMPARE(deleted.first().at(1).toString(), "Poster");
        QCOMPARE(reloaded.size(), 1);
    }
};

QTEST_MAIN(WorkflowBrowserComponentTest)
#include "WorkflowBrowserComponentTest.moc"
