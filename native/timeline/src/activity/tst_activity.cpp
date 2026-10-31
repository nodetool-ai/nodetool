#include "ActivityController.h"
#include "local/LocalActivity.h"
#include <QQmlEngine>
#include <QQmlComponent>
#include <QTemporaryDir>
#include <QTest>
#include <QJsonArray>
#include <QMutex>
#include <QMutexLocker>
#include <QTcpServer>
#include <QTcpSocket>
#include <QJsonDocument>
#include <QSet>
#include <atomic>

class ActivityTest : public QObject {
    Q_OBJECT
private slots:
    void mountedRealControllersPreserveModelOwnership() {
        QTemporaryDir history;
        qputenv("NODETOOL_TIMELINE_ACTIVITY_DIR", history.path().toUtf8());
        qmlRegisterType<ActivityController>("NodeTool.Timeline", 1, 0, "ActivityController");
        qmlRegisterType<LocalActivity>("NodeTool.Timeline", 1, 0, "LocalActivity");
        qmlRegisterUncreatableType<TimelineModel>("NodeTool.Timeline", 1, 0, "TimelineModel", "Created by C++");
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_ACTIVITY_SOURCE "/qml/TimelineVisuals.qml")), "NodeTool.Timeline", 1, 0, "TimelineVisuals");
        auto model = std::make_unique<TimelineModel>();
        QPointer<TimelineModel> retained(model.get());
        QJSEngine::ObjectOwnership ownership = QJSEngine::CppOwnership;
        {
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
    import NodeTool.Timeline
    import "../../qml/activity"
    Item {
        property TimelineModel timeline
        ActivityPanel { objectName: "realActivityPanel"; anchors.fill: parent }
    })", QUrl::fromLocalFile(QStringLiteral(NT_ACTIVITY_SOURCE "/src/activity/host.qml")));
            std::unique_ptr<QObject> root(component.createWithInitialProperties({{"timeline", QVariant::fromValue(model.get())}}));
            QVERIFY2(root, qPrintable(component.errorString()));
            ownership = QJSEngine::objectOwnership(model.get());
            auto* panel = root->findChild<QObject*>("realActivityPanel");
            QVERIFY(panel);
            auto* controller = qobject_cast<ActivityController*>(panel->property("controller").value<QObject*>());
            QVERIFY(controller);
            QCOMPARE(controller->timeline(), model.get());
            QVERIFY(!controller->connected());
        }
        if (!retained) { model.release(); }
        QVERIFY(retained);
        QCOMPARE(ownership, QJSEngine::CppOwnership);
    }
    void realTransportAndReopen() {
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        int requests = 0;
        bool authorization = true;
        connect(&server, &QTcpServer::newConnection, this, [&] {
            while (auto* socket = server.nextPendingConnection()) {
                connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
                    auto bytes = socket->property("request").toByteArray() + socket->readAll();
                    socket->setProperty("request", bytes);
                    if (!bytes.contains("\r\n\r\n")) { return; }
                    ++requests;
                    authorization = authorization && bytes.contains("Authorization: Bearer account-token");
                    QJsonObject data;
                    if (bytes.startsWith("GET /trpc/jobs.list?")) {
                        data = {{"jobs", QJsonArray{QJsonObject{{"id", "fedcba9876543210fedcba9876543210"}, {"project_id", "project-a"}, {"name", "Persisted render"}, {"status", "completed"}, {"cost", 0.25}}}}, {"next_start_key", QJsonValue::Null}};
                    } else if (bytes.startsWith("GET /trpc/generations.list?")) {
                        data = {{"generations", QJsonArray{}}, {"next", QJsonValue::Null}};
                    } else { data = {{"assets", QJsonArray{}}, {"next", QJsonValue::Null}}; }
                    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
                    socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                    socket->disconnectFromHost();
                });
                connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
            }
        });
        TimelineModel model; nt::Timeline document; document.raw = {{"projectId", "project-a"}}; model.setTimeline(document);
        const nt::server::SaveTarget target{QUrl("http://127.0.0.1:" + QString::number(server.serverPort())), "account-token", "timeline", "", {}};
        for (int launch = 0; launch < 2; ++launch) {
            ActivityController controller;
            controller.setTarget(target); controller.setTimeline(&model);
            QTRY_VERIFY_WITH_TIMEOUT(!controller.busy() && controller.rows().size() == 1, 10000);
            QCOMPARE(controller.error(), QString{});
            QCOMPARE(controller.rows().first().toMap().value("id").toString(), "fedcba9876543210fedcba9876543210");
            QCOMPARE(controller.rows().first().toMap().value("cost").toString(), "0.25 (currency not reported)");
        }
        QCOMPARE(requests, 6);
        QVERIFY(authorization);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void costsAndStates() {
        auto job = ActivityController::jobRow({{"id", "0123456789abcdef0123456789abcdef"}, {"status", "running"}, {"cost", 0}});
        QCOMPARE(job.value("cost").toString(), "0 (currency not reported)");
        QCOMPARE(job.value("progress").toDouble(), -1.0);
        QVERIFY(job.value("cancellable").toBool());
        QCOMPARE(job.value("id").toString().size(), 32);
        auto generation = ActivityController::generationRow({{"generation_id", "full-id"}, {"status", "running"}, {"cost", 2.4}, {"currency", "EUR"}, {"quantity", 3}, {"billing_unit", "seconds"}, {"price_source", "provider_reported"}, {"cancellation_requested", true}});
        QCOMPARE(generation.value("cost").toString(), "2.4 EUR (provider_reported) · 3 seconds");
        QVERIFY(!generation.value("cancellable").toBool());
        QCOMPARE(ActivityController::generationRow({{"cost", 1}}).value("cost").toString(), "Not reported");
        QCOMPARE(ActivityController::jobRow({{"cost", -1}}).value("cost").toString(), "Not reported");
    }
    void paginationSurvivesPollingAndLargeProxyList() {
        TimelineModel model; nt::Timeline document; document.raw = {{"projectId", "project-a"}}; model.setTimeline(document);
        ActivityController controller;
        controller.setTarget(nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), "", "timeline", "", {}});
        QStringList cursors;
        controller.setCall([&](bool, const QString& procedure, const QJsonObject& input) {
            if (procedure == "assets.list") {
                QJsonArray assets;
                for (int i = 0; i < 10000; ++i) { assets.append(QJsonObject{{"id", QString("proxy-%1").arg(i)}, {"project_id", "project-a"}, {"proxy_status", "ready"}, {"name", "Video"}}); }
                return nt::server::QueryResult{QJsonObject{{"assets", assets}, {"next", QJsonValue::Null}}, {}};
            }
            if (procedure == "generations.list") { return nt::server::QueryResult{QJsonObject{{"generations", QJsonArray{}}, {"next", QJsonValue::Null}}, {}}; }
            const auto cursor = input.value("start_key").toString(); cursors.append(cursor);
            const auto id = cursor.isEmpty() ? "first" : cursor == "page-2" ? "second" : "third";
            const auto next = cursor.isEmpty() ? "page-2" : cursor == "page-2" ? "page-3" : "";
            return nt::server::QueryResult{QJsonObject{{"jobs", QJsonArray{QJsonObject{{"id", id}, {"project_id", "project-a"}, {"status", "completed"}}}}, {"next_start_key", next}}, {}};
        });
        controller.setTimeline(&model);
        QTRY_VERIFY_WITH_TIMEOUT(!controller.busy() && controller.rows().size() == 10001, 15000);
        controller.loadMore(); QTRY_VERIFY(!controller.busy());
        QCOMPARE(controller.rows().size(), 10002);
        controller.refresh(); QTRY_VERIFY_WITH_TIMEOUT(!controller.busy(), 15000);
        QCOMPARE(controller.rows().size(), 10002);
        controller.loadMore(); QTRY_VERIFY(!controller.busy());
        QCOMPARE(cursors, QStringList({"", "page-2", "", "page-3"}));
        QCOMPARE(controller.rows().size(), 10003);
        QVERIFY(!controller.hasMore());
    }
    void newlyArrivedHistoryIsPageable_data() {
        QTest::addColumn<bool>("generations");
        QTest::newRow("jobs") << false;
        QTest::newRow("generations") << true;
    }
    void newlyArrivedHistoryIsPageable() {
        QFETCH(bool, generations);
        TimelineModel model;
        nt::Timeline document;
        document.raw = {{"projectId", "project-a"}};
        model.setTimeline(document);
        ActivityController controller;
        controller.setTarget(nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), "", "timeline", "", {}});
        std::atomic<int> listCalls = 0;
        const QString procedure = generations ? "generations.list" : "jobs.list";
        const QString rowsKey = generations ? "generations" : "jobs";
        const QString nextKey = generations ? "next" : "next_start_key";
        const QString idKey = generations ? "generation_id" : "id";
        controller.setCall([&](bool, const QString& requested, const QJsonObject& input) {
            if (requested != procedure) {
                const QString key = requested == "assets.list" ? "assets" : generations ? "jobs" : "generations";
                return nt::server::QueryResult{QJsonObject{{key, QJsonArray{}}, {"next", QJsonValue::Null}}, {}};
            }
            const int call = ++listCalls;
            QJsonArray rows;
            QString next;
            if (call > 1) {
                const bool older = !input.value("start_key").toString().isEmpty();
                const int begin = older ? 100 : 0;
                const int end = older ? 101 : 100;
                for (int i = begin; i < end; ++i) {
                    rows.append(QJsonObject{{idKey, QString::number(i).rightJustified(32, '0')},
                        {"project_id", "project-a"}, {"status", "completed"}});
                }
                if (!older) { next = "new-history-page-2"; }
            }
            return nt::server::QueryResult{QJsonObject{{rowsKey, rows}, {nextKey, next}}, {}};
        });
        controller.setTimeline(&model);
        QTRY_VERIFY(listCalls.load() == 1 && !controller.busy());
        QVERIFY(controller.rows().isEmpty());
        QVERIFY(!controller.hasMore());
        controller.refresh();
        QTRY_VERIFY(!controller.busy() && controller.rows().size() == 100);
        QVERIFY2(controller.hasMore(), "New records beyond the refreshed first page must remain discoverable");
        controller.loadMore();
        QTRY_VERIFY(!controller.busy() && controller.rows().size() == 101);
        QVERIFY(!controller.hasMore());
        QSet<QString> ids;
        for (const auto& value : controller.rows()) { ids.insert(value.toMap().value("id").toString()); }
        QCOMPARE(ids.size(), 101);
        QVERIFY(ids.contains(QString::number(100).rightJustified(32, '0')));
    }
    void scopeHistoryOfflineAndCancellation() {
        TimelineModel model;
        nt::Timeline timeline; timeline.raw = {{"projectId", "project-a"}};
        model.setTimeline(timeline);
        ActivityController controller;
        controller.setTarget(nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), "", "timeline", "", "expected-instance"});
        QMutex mutex;
        QStringList calls;
        bool offline = false;
        bool cancelled = false;
        controller.setCall([&](bool write, const QString& procedure, const QJsonObject& input) {
            QMutexLocker lock(&mutex);
            calls.append(procedure);
            if (input.value("project_id") != "project-a" && procedure != "jobs.cancel") { return nt::server::QueryResult{{}, {"Wrong project", "TEST", {}, 400}}; }
            if (offline) { return nt::server::QueryResult{{}, {"Offline", "NETWORK", {}, 0}}; }
            if (write) { cancelled = input.value("id") == "0123456789abcdef0123456789abcdef"; return nt::server::QueryResult{QJsonObject{}, {}}; }
            if (procedure == "assets.list") { return nt::server::QueryResult{QJsonObject{{"assets", QJsonArray{QJsonObject{{"id", "proxy-id"}, {"project_id", "project-a"}, {"proxy_status", "failed"}, {"name", "Video"}}}}, {"next", QJsonValue::Null}}, {}}; }
            if (procedure == "jobs.list") { return nt::server::QueryResult{QJsonObject{{"jobs", QJsonArray{QJsonObject{{"id", "0123456789abcdef0123456789abcdef"}, {"project_id", "project-a"}, {"status", cancelled ? "cancelled" : "running"}, {"cost", 0}}, QJsonObject{{"id", "other"}, {"project_id", "project-b"}}}}, {"next_start_key", QJsonValue::Null}}, {}}; }
            return nt::server::QueryResult{QJsonObject{{"generations", QJsonArray{}}, {"next", QJsonValue::Null}}, {}};
        });
        controller.setTimeline(&model);
        QTRY_VERIFY(!controller.busy() && controller.rows().size() == 2);
        QCOMPARE(controller.error(), QString{});
        QCOMPARE(controller.rows().first().toMap().value("status").toString(), "running");
        QVERIFY(controller.rows().first().toMap().value("cancellable").toBool());
        controller.cancel("0123456789abcdef0123456789abcdef");
        QTRY_VERIFY(!controller.busy());
        QVERIFY(cancelled);
        QCOMPARE(controller.rows().first().toMap().value("status").toString(), "cancelled");
        { QMutexLocker lock(&mutex); offline = true; }
        controller.refresh();
        QTRY_VERIFY(!controller.busy());
        QVERIFY(controller.error().contains("Offline"));
        QCOMPARE(controller.rows().size(), 2);
        QVERIFY(controller.rows().first().toMap().value("stale").toBool());
        QVERIFY(!controller.rows().first().toMap().value("cancellable").toBool());
        controller.setTarget(std::nullopt);
        QCOMPARE(controller.rows().size(), 0);
        QVERIFY(!controller.connected());
    }
};
QTEST_MAIN(ActivityTest)
#include "tst_activity.moc"
