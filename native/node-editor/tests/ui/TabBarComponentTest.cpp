// TabBar.qml, CanvasTabStrip.qml and NotificationsPanel.qml on their own:
// fixture DocumentTabs and Notifications, no EditorWindow, graph runner,
// QtNodes or media. The executable links only the interface library and the
// QML module.
#include "interfaces/DocumentTabs.h"
#include "interfaces/Notifications.h"

#include <QDateTime>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::DocumentTabs;
using nodetool::node_editor::Notifications;

namespace {

QVariantMap tab(const QString &title, bool dirty = false) {
    return {{"title", title}, {"dirty", dirty}, {"running", false}, {"renamable", true}};
}

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

QQuickItem *accessible(QQuickItem *root, const QString &name) {
    if (root->property("accessibleName").toString() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = accessible(child, name)) {
            return found;
        }
    }
    return nullptr;
}

QPoint centre(QQuickItem *item, qreal fraction = 0.5) {
    return item->mapToScene(QPointF(item->width() * fraction, item->height() / 2)).toPoint();
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

class TabBarComponentTest : public QObject {
    Q_OBJECT
private slots:
    void tabRequestsGoUp() {
        DocumentTabs tabs;
        tabs.setTabs({tab("Draft"), tab("Render", true)}, 0, "Personal", {});
        Notifications notifications;
        notifications.setUnread(2);
        QSignalSpy activated(&tabs, &DocumentTabs::activateTabRequested);
        QSignalSpy closed(&tabs, &DocumentTabs::closeTabRequested);
        QSignalSpy created(&tabs, &DocumentTabs::newTabRequested);
        QSignalSpy renamed(&tabs, &DocumentTabs::renameTabRequested);
        QSignalSpy dropped(&tabs, &DocumentTabs::dropTabRequested);
        QSignalSpy settings(&tabs, &DocumentTabs::settingsRequested);
        QSignalSpy opened(&notifications, &Notifications::openRequested);

        QQuickView view;
        show(view, {{"tabs", QVariant::fromValue(&tabs)}, {"notifications", QVariant::fromValue(&notifications)}},
             "TabBar.qml", {900, 36});
        auto *root = view.rootObject();
        view.resize(900, int(root->implicitHeight()));

        QCOMPARE(named(root, "project-name")->property("text").toString(), QString("Personal"));
        QVERIFY(named(root, "workflow-tab-0"));
        QVERIFY(named(root, "workflow-tab-1"));
        QVERIFY(named(named(root, "workflow-tab-1"), "unsaved-indicator")->isVisible());
        QVERIFY(!named(named(root, "workflow-tab-0"), "unsaved-indicator")->isVisible());

        click(view, named(root, "activate-tab-1"));
        QTRY_COMPARE(activated.size(), 1);
        QCOMPARE(activated.first().first().toInt(), 1);
        click(view, named(root, "close-tab-0"));
        QTRY_COMPARE(closed.size(), 1);
        QCOMPARE(closed.first().first().toInt(), 0);
        click(view, named(root, "new-workflow-tab"));
        QTRY_COMPARE(created.size(), 1);
        click(view, named(root, "tabbar-settings"));
        QTRY_COMPARE(settings.size(), 1);

        // The bell shows a dot while there are unread notifications.
        auto *dot = named(root, "tabbar-notifications-unread");
        QVERIFY(dot->isVisible());
        click(view, named(root, "tabbar-notifications"));
        QTRY_COMPARE(opened.size(), 1);
        notifications.setUnread(0);
        QTRY_VERIFY(!dot->isVisible());

        // The owner starts a rename, and the typed name goes up.
        tabs.beginRename(1);
        auto *field = named(named(root, "workflow-tab-1"), "tab-rename");
        QTRY_VERIFY(field->isVisible());
        QTest::keyClick(&view, Qt::Key_A, Qt::ControlModifier);
        for (const char key : QByteArray("Final")) {
            QTest::keyClick(&view, key);
        }
        QTest::keyClick(&view, Qt::Key_Return);
        QTRY_COMPARE(renamed.size(), 1);
        QCOMPARE(renamed.first().at(0).toInt(), 1);
        QCOMPARE(renamed.first().at(1).toString(), QString("Final"));
        QTRY_VERIFY(!field->isVisible());

        // Dragging the first tab past the middle of the second drops it after.
        auto *first = named(root, "workflow-tab-0");
        auto *second = named(root, "workflow-tab-1");
        QTest::mousePress(&view, Qt::LeftButton, Qt::NoModifier, centre(first));
        QTest::mouseMove(&view, centre(first, 0.7));
        QTest::mouseMove(&view, centre(second, 0.5));
        QTest::mouseMove(&view, centre(second, 0.8));
        QTest::mouseRelease(&view, Qt::LeftButton, Qt::NoModifier, centre(second, 0.8));
        QTRY_COMPARE(dropped.size(), 1);
        QCOMPARE(dropped.first().at(0).toInt(), 0);
        QCOMPARE(dropped.first().at(1).toInt(), 1);
        QCOMPARE(dropped.first().at(2).toBool(), true);
        QCOMPARE(activated.size(), 1);

        // A new active tab moves the accent.
        tabs.setTabs({tab("Draft"), tab("Render")}, 1, "Studio", {});
        QTRY_VERIFY(named(root, "workflow-tab-1")->property("active").toBool());
        QCOMPARE(named(root, "project-name")->property("text").toString(), QString("Studio"));
    }

    void canvasStripRequestsGoUp() {
        DocumentTabs tabs;
        const QVariantList entries{
            QVariantMap{{"title", "Workflow"}, {"surface", 0}, {"host", true}, {"selected", false}},
            QVariantMap{{"title", "Upscale"}, {"surface", 3}, {"host", false}, {"selected", true}}};
        tabs.setTabs({tab("Draft")}, 0, "Personal", {QVariantMap{{"entries", entries}, {"depth", 0}}});
        QSignalSpy activated(&tabs, &DocumentTabs::activateSurfaceRequested);
        QSignalSpy closed(&tabs, &DocumentTabs::closeSurfaceRequested);

        QQuickView view;
        show(view, {{"tabs", QVariant::fromValue(&tabs)}}, "CanvasTabStrip.qml", {700, 40});
        auto *root = view.rootObject();
        QVERIFY(root->implicitHeight() > 0);
        QCOMPARE(named(root, "canvas-label-0-1")->property("text").toString(), QString("Upscale"));
        QVERIFY(!named(root, "close-canvas-0-0")->isVisible());

        click(view, named(root, "activate-canvas-0-0"));
        QTRY_COMPARE(activated.size(), 1);
        QCOMPARE(activated.first().first().toInt(), 0);
        click(view, named(root, "close-canvas-0-1"));
        QTRY_COMPARE(closed.size(), 1);
        QCOMPARE(closed.first().first().toInt(), 3);

        // No subgraph surfaces leave no strip.
        tabs.setTabs({tab("Draft")}, 0, "Personal", {});
        QTRY_COMPARE(root->implicitHeight(), 0.0);
    }

    void notificationCopyGoesUp() {
        Notifications notifications;
        QSignalSpy copied(&notifications, &Notifications::copyRequested);

        QQuickView view;
        show(view, {{"notifications", QVariant::fromValue(&notifications)}}, "NotificationsPanel.qml", {600, 400});
        auto *root = view.rootObject();
        QTRY_VERIFY(named(root, "notifications-empty")->isVisible());

        notifications.setEntries({QVariantMap{{"type", "error"},
                                              {"content", "The render failed."},
                                              {"timestamp", QDateTime::currentDateTime()}}});
        QTRY_VERIFY(!named(root, "notifications-empty")->isVisible());
        QQuickItem *copy = nullptr;
        QTRY_VERIFY((copy = accessible(root, "Copy notification")));
        click(view, copy);
        QTRY_COMPARE(copied.size(), 1);
        QCOMPARE(copied.first().first().toString(), QString("The render failed."));
    }
};

QTEST_MAIN(TabBarComponentTest)
#include "TabBarComponentTest.moc"
