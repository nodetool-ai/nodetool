#include "server/TimelineList/TimelineListController.h"
#include "TestHttpServer.h"
#include <QJsonArray>
#include <QDateTime>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QSignalSpy>
#include <QScopeGuard>
#include <QUrlQuery>
#include <QtTest>

namespace {
QByteArray answer(const QJsonValue& data) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
}
}
class TestTimelineListClient : public QObject {
    Q_OBJECT
private slots:
    void defaultServer() {
        const auto saved = qgetenv("NODETOOL_SERVER_URL");
        const bool wasSet = qEnvironmentVariableIsSet("NODETOOL_SERVER_URL");
        const auto restore = qScopeGuard([saved, wasSet] {
            if (wasSet) {
                qputenv("NODETOOL_SERVER_URL", saved);
            } else {
                qunsetenv("NODETOOL_SERVER_URL");
            }
        });
        qunsetenv("NODETOOL_SERVER_URL");
        QCOMPARE(nt::server::TimelineListController().serverUrl(), QUrl("http://localhost:7777"));
        qputenv("NODETOOL_SERVER_URL", "http://127.0.0.1:17862");
        QCOMPARE(nt::server::TimelineListController().serverUrl(), QUrl("http://127.0.0.1:17862"));
    }
    void lifecycle() {
        TestHttpServer server;
        QVERIFY(server.base().port() > 0);
        QVERIFY(server.base().port() != 7777);
        QJsonObject stored;
        QJsonObject createInput;
        server.setJson([&](const QByteArray& path, const QUrl& url) {
            if (path == "/trpc/projects.list") {
                return answer(QJsonArray{QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true}}});
            }
            if (path == "/trpc/timeline.list") {
                const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
                if (input.value("projectId") != "personal:1") {
                    return QByteArray(R"({"error":{"message":"wrong project","data":{"code":"BAD_REQUEST"}}})");
                }
                return answer(stored.isEmpty() ? QJsonArray{} : QJsonArray{stored});
            }
            return answer(stored);
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) {
            const auto input = QJsonDocument::fromJson(body).object();
            if (path == "/trpc/timeline.create") {
                createInput = input;
                stored = input;
                stored.insert("fps", 30);
                stored.insert("width", 1920);
                stored.insert("height", 1080);
                stored.insert("tracks", QJsonArray{});
                stored.insert("clips", QJsonArray{});
                stored.insert("markers", QJsonArray{});
                stored.insert("updatedAt", "2026-10-26T12:00:00Z");
            } else if (path == "/trpc/timeline.update") {
                stored.insert("name", input.value("name"));
            } else if (path == "/trpc/timeline.delete") {
                stored = {};
                return answer(QJsonObject{{"ok", true}});
            }
            return answer(stored);
        });
        nt::server::TimelineListController list(server.base(), "token", "");
        list.refresh();
        QCOMPARE(list.projectId(), QString("personal:1"));
        QVERIFY2(list.error().isEmpty(), qPrintable(list.error()));
        QCOMPARE(list.projects().size(), 1);
        const auto created = list.createTimeline();
        const auto id = created.value("id").toString();
        QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch());
        QCOMPARE(created.value("name").toString(), QString("Untitled video"));
        QCOMPARE(created.value("width").toInt(), 1920);
        QCOMPARE(created.value("height").toInt(), 1080);
        QCOMPARE(created.value("fps").toInt(), 30);
        QCOMPARE(created.value("tracks").toList().size(), 0);
        QCOMPARE(createInput.keys(), QStringList({"id", "name", "projectId"}));
        QCOMPARE(list.documents().size(), 1);
        const auto writes = server.countRequests("POST", "/trpc/");
        QVERIFY(!list.renameTimeline(id, "   "));
        QVERIFY(!list.renameTimeline(id, " Untitled video "));
        QCOMPARE(server.countRequests("POST", "/trpc/"), writes);
        QVERIFY(list.renameTimeline(id, "  My timeline  "));
        QCOMPARE(list.documents().first().toMap().value("name").toString(), QString("My timeline"));
        QSignalSpy opened(&list, &nt::server::TimelineListController::openRequested);
        const auto label = server.base().toString() + "#timeline=" + id;
        QCOMPARE(list.openTimeline(id), label);
        QCOMPARE(opened.size(), 1);
        QVERIFY(list.openTimeline("missing").isEmpty());
        list.requestDelete(id);
        QCOMPARE(list.deleteTarget().value("name").toString(), QString("My timeline"));
        QCOMPARE(server.countRequests("POST", "/trpc/timeline.delete"), 0);
        list.cancelDelete();
        QVERIFY(!list.confirmDelete());
        list.requestDelete(id);
        QVERIFY(list.confirmDelete());
        QVERIFY(list.documents().isEmpty());
        QCOMPARE(server.countRequests("POST", "/trpc/timeline.delete"), 1);
    }
    void largeListIsSorted() {
        TestHttpServer server;
        QVERIFY(server.base().port() > 0);
        QJsonArray documents;
        const auto start = QDateTime::fromString("2026-01-01T00:00:00Z", Qt::ISODate);
        for (int index = 0; index < 10000; ++index) {
            documents.append(QJsonObject{{"id", QStringLiteral("%1").arg(index, 32, 16, QChar('0'))},
                {"name", QString::number(index)}, {"updatedAt", start.addSecs(index).toString(Qt::ISODateWithMs)}});
        }
        server.setJson([&](const QByteArray& path, const QUrl&) {
            return path == "/trpc/projects.list" ?
                answer(QJsonArray{QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true}}}) : answer(documents);
        });
        nt::server::TimelineListController list(server.base(), "", "");
        list.refresh();
        QVERIFY2(list.error().isEmpty(), qPrintable(list.error()));
        const auto rows = list.documents();
        QCOMPARE(rows.size(), 10000);
        for (int index = 0; index < rows.size(); ++index) {
            QCOMPARE(rows[index].toMap().value("name").toString(), QString::number(9999 - index));
        }
    }
    void dateGroupsFollowWeb() {
        const auto now = QDateTime::currentDateTime();
        const auto group = [&](int days) {
            return nt::server::TimelineListController::dateGroup(now.addDays(-days).toString(Qt::ISODateWithMs));
        };
        QCOMPARE(group(0), QString("Today"));
        QCOMPARE(group(1), QString("Yesterday"));
        QCOMPARE(group(3), QString("3 days ago"));
        QCOMPARE(group(7), QString("1 week ago"));
        QCOMPARE(nt::server::TimelineListController::dateGroup(now.addMonths(-1).toString(Qt::ISODateWithMs)), QString("1 month ago"));
        QCOMPARE(nt::server::TimelineListController::dateGroup(now.addYears(-1).toString(Qt::ISODateWithMs)), QString("1 year ago"));
    }
    void noServerAndWrongInstance() {
        nt::server::TimelineListController absent(QUrl(), "", "");
        absent.refresh();
        QVERIFY(!absent.error().isEmpty());
        QVERIFY(absent.createTimeline().isEmpty());
        TestHttpServer server;
        server.setJson([](const QByteArray&, const QUrl&) {
            return answer(QJsonArray{QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true}}});
        });
        nt::server::TimelineListController list(server.base(), "", "expected");
        list.refresh();
        QVERIFY(list.createTimeline().isEmpty());
        QVERIFY(list.error().contains("WRONG_SERVER"));
        QCOMPARE(server.countRequests("POST", "/trpc/"), 0);
    }
};
QTEST_GUILESS_MAIN(TestTimelineListClient)
#include "tst_timelinelistclient.moc"
