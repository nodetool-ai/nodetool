// WorkflowBrowser.qml on its own: a fixture WorkflowBrowser, PanelLayout and
// StatusModel, no EditorWindow, graph runner, QtNodes or server. The executable
// links only the interface library and the QML module.
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "server/WorkflowBrowser.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
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
