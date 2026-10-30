#include <QGuiApplication>
#include <QLibraryInfo>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <memory>

class ActivityPanelSource : public QObject {
    Q_OBJECT
    Q_PROPERTY(QObject* timeline MEMBER timeline NOTIFY changed)
    Q_PROPERTY(QVariantList rows MEMBER rows NOTIFY changed)
    Q_PROPERTY(bool busy MEMBER busy NOTIFY changed)
    Q_PROPERTY(bool connected MEMBER connected NOTIFY changed)
    Q_PROPERTY(bool hasMore MEMBER hasMore NOTIFY changed)
    Q_PROPERTY(QString error MEMBER error NOTIFY changed)
    Q_PROPERTY(QString scopeLabel MEMBER scopeLabel NOTIFY changed)
    Q_PROPERTY(QString lastUpdated MEMBER lastUpdated NOTIFY changed)
public:
    using QObject::QObject;
    QObject* timeline = nullptr;
    QVariantList rows;
    bool busy = false;
    bool connected = true;
    bool hasMore = false;
    QString error;
    QString scopeLabel = "Project activity";
    QString lastUpdated;
    QString cancelled;
    QString cancelledSource;
    int refreshes = 0;
    int loads = 0;
    Q_INVOKABLE void refresh() { ++refreshes; }
    Q_INVOKABLE void loadMore() { ++loads; }
    Q_INVOKABLE void cancel(const QString& id) { cancelled = id; }
    Q_INVOKABLE void cancel(const QString& id, const QString& source) { cancelled = id; cancelledSource = source; }
    void update() { emit changed(); }
 signals:
    void changed();
};

class TestActivityPanel : public QObject {
    Q_OBJECT
private:
    static QQuickItem* find(QQuickItem* root, const QString& name) {
        if (root->objectName() == name) { return root; }
        for (auto* child : root->childItems()) {
            if (auto* result = find(child, name)) { return result; }
        }
        return nullptr;
    }
    static void click(QQuickWindow& window, QQuickItem* item) {
        QVERIFY(item);
        const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, point);
    }
    static QVariantMap row(const QString& id, const QString& source, const QString& status, bool cancellable) {
        return {{"id", id}, {"source", source}, {"title", "A render with a long descriptive name that wraps"},
            {"kind", "Render"}, {"status", status}, {"detail", "Provider state: processing"}, {"progress", -1.0},
            {"cost", "0.125 USD / generation"}, {"cancellable", cancellable}};
    }
private slots:
    void init() { QTest::failOnWarning(QRegularExpression(".*")); }
    void initTestCase() {
        qmlRegisterType<ActivityPanelSource>("NodeTool.Timeline", 1, 0, "ActivityController");
        qmlRegisterType<ActivityPanelSource>("NodeTool.Timeline", 1, 0, "LocalActivity");
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_ACTIVITY_SOURCE "/qml/Theme.qml")),
            "NodeTool.Timeline", 1, 0, "Theme");
    }
    void mountedNarrowFlow() {
        QObject timeline;
        QQmlEngine engine;
        QStringList imports;
        const auto buildRoot = QCoreApplication::applicationDirPath();
        for (const auto& path : engine.importPathList()) {
            if (path != buildRoot && !path.startsWith(buildRoot + '/')) { imports.append(path); }
        }
        engine.setImportPathList(imports);
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import QtQml
import "../../../qml/activity"
Item {
    property QtObject timeline
    ActivityPanel { objectName: "mountedActivityPanel"; anchors.fill: parent }
})", QUrl::fromLocalFile(QStringLiteral(NT_ACTIVITY_SOURCE "/src/activity/ui/host.qml")));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&timeline)}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* host = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(host);
        auto* panel = find(host, "mountedActivityPanel");
        QVERIFY(panel);
        auto* server = qobject_cast<ActivityPanelSource*>(panel->property("controller").value<QObject*>());
        auto* local = qobject_cast<ActivityPanelSource*>(panel->property("localController").value<QObject*>());
        QVERIFY(server); QVERIFY(local);
        const auto ownership = QJSEngine::objectOwnership(&timeline);
        QJSEngine::setObjectOwnership(&timeline, QJSEngine::CppOwnership);
        QCOMPARE(ownership, QJSEngine::CppOwnership);
        QQuickWindow window;
        window.resize(320, 640);
        host->setParentItem(window.contentItem());
        host->setSize(QSizeF(320, 640));
        QCOMPARE(server->timeline, host->property("timeline").value<QObject*>());
        QCOMPARE(local->timeline, server->timeline);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        const QString id = "0123456789abcdef0123456789abcdef";
        server->rows = {row(id, "Generation", "running", true)};
        server->lastUpdated = "2026-10-30T12:00:00Z";
        server->update();
        QTRY_VERIFY(find(panel, "activityCancel_0"));
        auto* identity = find(panel, "activityId_0");
        QVERIFY(identity);
        QCOMPARE(identity->property("text").toString(), id);
        QVERIFY(!find(panel, "activityProgress_0")->isVisible());
        QVERIFY(identity->width() > 0);
        QVERIFY(identity->mapToItem(panel, QPointF(identity->width(), 0)).x() <= panel->width());
        click(window, find(panel, "activityCancel_0"));
        QCOMPARE(server->cancelled, id);
        QCOMPARE(server->cancelledSource, QString("Generation"));
        auto* filter = find(panel, "activityFilter");
        QVERIFY(filter);
        filter->setProperty("currentIndex", 2);
        QTRY_COMPARE(find(panel, "activityList")->property("count").toInt(), 0);
        filter->setProperty("currentIndex", 1);
        QTRY_COMPARE(find(panel, "activityList")->property("count").toInt(), 1);
        click(window, find(panel, "activityRefresh"));
        QCOMPARE(server->refreshes, 1);
        server->connected = false;
        server->error = "Offline. Showing the last server result.";
        server->update();
        QTRY_VERIFY(!find(panel, "activityCancel_0")->isEnabled());
        QCOMPARE(find(panel, "activityError")->property("text").toString(), server->error);
        const auto screenshot = qEnvironmentVariable("NT_ACTIVITY_SCREENSHOT");
        if (!screenshot.isEmpty()) { QVERIFY(window.grabWindow().save(screenshot)); }
        auto* search = find(panel, "activitySearch");
        QVERIFY(search);
        search->setProperty("text", "does not match");
        QTRY_COMPARE(find(panel, "activityList")->property("count").toInt(), 0);
        QVERIFY(find(panel, "activityEmpty")->property("text").toString().contains("matches"));
        search->setProperty("text", "");
        server->rows.clear();
        local->rows = {row("local-full-id", "Local", "running", true)};
        server->update(); local->update();
        QTRY_COMPARE(find(panel, "activityList")->property("count").toInt(), 1);
        QTRY_VERIFY(find(panel, "activityCancel_0")->isEnabled());
        click(window, find(panel, "activityCancel_0"));
        QCOMPARE(local->cancelled, QString("local-full-id"));
        server->hasMore = true; server->update();
        QTRY_VERIFY(find(panel, "activityMore")->isVisible());
        click(window, find(panel, "activityMore"));
        QCOMPARE(server->loads, 1);
    }
};
QTEST_MAIN(TestActivityPanel)
#include "tst_activitypanel.moc"
