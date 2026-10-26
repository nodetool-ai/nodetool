#include "TimelineMerge.h"
#include "DocumentApplier.h"
#include "server/AutosaveController.h"
#include "TestHttpServer.h"
#include <QTemporaryDir>
#include <QScopeGuard>
#include <QUndoStack>
#include "ResourceChangeClient.h"
#include "server/ServerClient.h"

#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QTest>
#include <QSignalSpy>
#include <QWebSocketServer>
#include <QTcpServer>
#include <QTcpSocket>

#include <cstdio>
#include <memory>
#include <stdexcept>

using namespace nt::server::sync;

namespace {
class WsFixture : public QObject {
public:
    QWebSocketServer server{"sync", QWebSocketServer::NonSecureMode};
    QList<QWebSocket*> peers;
    QList<QStringList> frames;
    WsFixture()
    {
        connect(&server, &QWebSocketServer::newConnection, this, [this] {
            auto* peer = server.nextPendingConnection();
            peer->setParent(this);
            const auto index = peers.size();
            peers.append(peer);
            frames.append(QStringList{});
            connect(peer, &QWebSocket::textMessageReceived, this, [this, index](const QString& text) {
                frames[index].append(text);
            });
        });
    }
};
QJsonObject track(const QString& id) { return {{"id", id}, {"name", id}, {"type", "video"}}; }
QJsonObject clip(const QString& id, const QString& name = "original")
{
    return {{"id", id}, {"name", name}, {"trackId", "t"}, {"startMs", 0}, {"durationMs", 1000}};
}
QJsonObject document()
{
    return {{"tracks", QJsonArray{track("t")}}, {"trackFolders", QJsonArray{}},
            {"clips", QJsonArray{clip("a"), clip("b")}}, {"markers", QJsonArray{}},
            {"mediaTracks", QJsonArray{}}, {"transcript", QJsonArray{}},
            {"fps", 30}, {"width", 1920}, {"height", 1080}, {"scriptEnabled", false},
            {"camera2d", QJsonValue::Null}, {"setup", QJsonValue::Null}};
}
QJsonArray op(const QString& key = "clip_id", const QJsonValue& id = "a",
              const QString& tool = "ui_timeline_update_clip")
{
    return {QJsonObject{{"tool", tool}, {"input", QJsonObject{{key, id}}}}};
}
QJsonObject serialized(const MergeResult& result)
{
    QJsonArray conflicts;
    for (const auto& conflict : result.conflicts) {
        QJsonObject value{{"unit", QJsonObject{{"kind", conflict.kind}, {"id", conflict.id},
                                             {"label", conflict.label}}},
                          {"external", conflict.external}, {"reason", conflict.reason}};
        if (conflict.hasDraft) {
            value.insert("draft", conflict.draft);
        }
        conflicts.append(value);
    }
    return {{"doc", result.doc}, {"nextBase", result.nextBase}, {"conflicts", conflicts}};
}
} // namespace

class SyncTest : public QObject {
    Q_OBJECT
private slots:
    void syncDiagnosticsUseQtLogging() {
        QTemporaryDir cache;
        QUndoStack undo;
        const auto raw = document();
        nt::server::AutosaveController save({QUrl("http://127.0.0.1:1"), {}, "seq", cache.path(), {}},
            &undo, [&] { return raw; }, "u0");
        save.setExternalSync(false);
        save.setQuitFallbackDirs({});
        QTest::ignoreMessage(QtWarningMsg, "sync: failed: The server timeline was deleted. Edits are kept locally.");
        save.externalChanged("deleted", {}, {}, false);
    }

    void startupRefreshesOnce() {
        WsFixture ws;
        QVERIFY(ws.server.listen(QHostAddress::LocalHost, 0));
        TestHttpServer http;
        QTemporaryDir cache;
        auto raw = document();
        raw["id"] = "seq";
        raw["updatedAt"] = "u0";
        raw["clips"] = QJsonArray{};
        auto server = raw;
        server["updatedAt"] = "u1";
        server["fps"] = 60;
        http.setJson([&](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", server}}}}).toJson();
        });
        QUndoStack undo;
        setDocumentApplier([&](QUndoStack*, const QJsonObject& next, const nt::Timeline&) { raw = next; return true; });
        const auto reset = qScopeGuard([] { setDocumentApplier({}); });
        nt::server::AutosaveController save({http.base(), {}, "seq", cache.path(), {}}, &undo, [&] { return raw; }, "u0");
        save.setAutosave(false);
        save.setExternalSyncUrl(ws.server.serverUrl());
        // The write already happened before subscription. No notice is sent.
        QTRY_COMPARE_WITH_TIMEOUT(raw, server, 4000);
        QCOMPARE(http.countRequests("GET", "/trpc/timeline.get"), 1);
        QTest::qWait(100);
        QCOMPARE(http.countRequests("GET", "/trpc/timeline.get"), 1);
    }

    void destructionSharesQuitBudget() {
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QList<QTcpSocket*> sockets;
        bool received = false;
        bool stalled = true;
        const auto release = [](QTcpSocket* socket) {
            socket->write("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            socket->disconnectFromHost();
        };
        connect(&server, &QTcpServer::newConnection, this, [&] {
            auto* socket = server.nextPendingConnection();
            socket->setParent(&server);
            sockets.append(socket);
            connect(socket, &QTcpSocket::readyRead, &server, [&, socket] {
                socket->readAll();
                received = true; // deliberately withhold the HTTP response
                if (!stalled) {
                    release(socket);
                }
            });
        });
        QTemporaryDir cache;
        QUndoStack undo;
        auto raw = document();
        const auto base = QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort()));
        auto save = std::make_unique<nt::server::AutosaveController>(
            nt::server::SaveTarget{base, {}, "seq", cache.path(), {}}, &undo, [&] { return raw; }, "u0");
        save->setExternalSync(false);
        save->setAutosave(false);
        save->setQuitFallbackDirs({});
        raw["markers"] = QJsonArray{QJsonObject{{"id", "local"}, {"timeMs", 100}}};
        save->documentChanged();
        save->refreshExternal();
        QTRY_VERIFY(received);
        QElapsedTimer elapsed;
        elapsed.start();
        constexpr int budgetMs = 80;
        const bool keptLocally = !save->flushBeforeQuit(budgetMs);
        save.reset();
        const auto shutdownMs = elapsed.elapsed();
        qInfo("quit flush and destruction: %lld ms for %d ms budget", static_cast<long long>(shutdownMs), budgetMs);
        // Unblock detached workers and drain them even when the timing fails.
        stalled = false;
        for (auto* socket : sockets) {
            release(socket);
        }
        QTRY_COMPARE_WITH_TIMEOUT(nt::server::AutosaveController::liveFetchWorkers(), 0, 35000);
        QVERIFY(keptLocally);
        QVERIFY2(shutdownMs < budgetMs + 350, qPrintable(QString("shutdown took %1 ms for %2 ms budget").arg(shutdownMs).arg(budgetMs)));
    }

    void controllerWebsocketAdopts() {
        WsFixture ws;
        QVERIFY(ws.server.listen(QHostAddress::LocalHost, 0));
        TestHttpServer http;
        QTemporaryDir cache;
        auto raw = document();
        raw["id"] = "seq";
        raw["updatedAt"] = "u0";
        QJsonArray mediaClips;
        for (const auto& value : raw["clips"].toArray()) {
            auto item = value.toObject();
            item["mediaType"] = "shape";
            mediaClips.append(item);
        }
        raw["clips"] = mediaClips;
        auto server = raw;
        auto clips = server["clips"].toArray();
        auto first = clips[0].toObject();
        first["startMs"] = 500;
        clips[0] = first;
        server["clips"] = clips;
        server["updatedAt"] = "u1";
        bool externalWrite = false;
        http.setJson([&](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", externalWrite ? server : raw}}}}).toJson();
        });
        QUndoStack undo;
        setDocumentApplier([&](QUndoStack*, const QJsonObject& next, const nt::Timeline&) { raw = next; return true; });
        const auto reset = qScopeGuard([] { setDocumentApplier({}); });
        nt::server::AutosaveController save({http.base(), {}, "seq", cache.path(), {}}, &undo, [&] { return raw; }, "u0");
        save.setAutosave(false);
        save.setExternalSyncUrl(QUrl(QString("http://127.0.0.1:%1").arg(ws.server.serverPort())));
        QTRY_COMPARE(ws.peers.size(), 1);
        QTRY_COMPARE(http.countRequests("GET", "/trpc/timeline.get"), 1);
        QTRY_COMPARE(save.externalState(), QString("idle"));
        externalWrite = true;
        const QJsonObject frame{{"type", "resource_change"}, {"resource_type", "timelinesequence"},
            {"event", "updated"}, {"resource", QJsonObject{{"id", "seq"}, {"etag", "fixture-etag"}, {"project_id", "default"}, {"updated_at", "u1"}}},
            {"ops", QJsonArray{QJsonObject{{"tool", "ui_timeline_move_clip"},
                {"input", QJsonObject{{"target", "a"}, {"startMs", 500}, {"id", "a"}}}}}}};
        ws.peers[0]->sendTextMessage(QString::fromUtf8(QJsonDocument(frame).toJson()));
        QTRY_COMPARE(raw, server);
        QCOMPARE(http.countRequests("GET", "/trpc/timeline.get"), 2);
        QCOMPARE(save.baseUpdatedAt(), QString("u1"));
        ws.peers[0]->sendTextMessage(R"({"type":"resource_resync"})");
        QTRY_COMPARE(http.countRequests("GET", "/trpc/timeline.get"), 3);
        QTRY_COMPARE(save.externalState(), QString("idle"));
        QTest::qWait(100);
        QCOMPARE(http.countRequests("GET", "/trpc/timeline.get"), 3);
    }

    void acceptedUnits_data() {
        QTest::addColumn<QString>("kind");
        for (const auto* kind : {"clip", "track", "trackFolder", "marker", "mediaTrack", "transcript", "field", "document"}) {
            QTest::newRow(kind) << QString(kind);
        }
    }
    void acceptedUnits() {
        QFETCH(QString, kind);
        const QHash<QString, QString> fields{{"clip", "clips"}, {"track", "tracks"}, {"trackFolder", "trackFolders"},
            {"marker", "markers"}, {"mediaTrack", "mediaTracks"}, {"transcript", "transcript"}};
        auto raw = document();
        const QString field = fields.value(kind);
        const QJsonObject incoming{{"id", "a"}, {"name", "external"}};
        QJsonObject conflict{{"kind", kind}, {"id", kind == "field" ? "fps" : "a"}, {"reason", "edited"},
            {"external", kind == "field" ? QJsonValue(60) : kind == "document" ? QJsonValue(document()) : QJsonValue(incoming)}};
        if (kind == "document") { auto value = document(); value["fps"] = 60; conflict["external"] = value; conflict["reason"] = "replaced"; }
        const auto applied = applyAcceptedUnit(raw, conflict);
        if (kind == "field" || kind == "document") {
            QCOMPARE(applied["fps"], QJsonValue(60));
        } else {
            bool found = false;
            for (const auto& item : applied[field].toArray()) {
                if (item.toObject()["id"] == "a" && item.toObject()["name"] == "external") {
                    found = true;
                }
            }
            QVERIFY(found);
            conflict["external"] = QJsonValue::Null;
            conflict["reason"] = "deleted";
            const auto removed = applyAcceptedUnit(applied, conflict)[field].toArray();
            for (const auto& item : removed) {
                QVERIFY(item.toObject()["id"] != "a");
            }
        }
        conflict["reason"] = "dangling";
        QCOMPARE(applyAcceptedUnit(raw, conflict), raw);
    }

    void acceptedDeletion_data() {
        QTest::addColumn<QString>("kind");
        for (const auto* kind : {"track", "trackFolder", "linked-clip", "group-clip", "locked-clip"}) {
            QTest::newRow(kind) << QString(kind);
        }
    }
    void acceptedDeletion() {
        QFETCH(QString, kind);
        auto raw = document();
        QString unitKind = "clip";
        QString id = "a";
        if (kind == "track") { unitKind = "track"; id = "t"; }
        if (kind == "trackFolder") {
            unitKind = "trackFolder"; id = "folder";
            raw["trackFolders"] = QJsonArray{QJsonObject{{"id", id}}};
            auto tracks = raw["tracks"].toArray();
            auto first = tracks[0].toObject(); first["folderId"] = id; tracks[0] = first;
            raw["tracks"] = tracks;
        }
        if (kind == "linked-clip" || kind == "group-clip") {
            QJsonArray clips;
            for (const auto& value : raw["clips"].toArray()) {
                auto item = value.toObject();
                if (kind == "linked-clip") {
                    item["linkId"] = "link";
                } else if (item["id"] == "a") {
                    item["mediaType"] = "group";
                } else {
                    item["parentId"] = "a";
                }
                clips.append(item);
            }
            raw["clips"] = clips;
        }
        if (kind == "locked-clip") {
            raw["tracks"] = QJsonArray{QJsonObject{{"id", "t"}, {"type", "video"}, {"locked", true}}};
        }
        const auto applied = applyAcceptedUnit(raw, {{"kind", unitKind}, {"id", id}, {"reason", "deleted"}, {"external", QJsonValue::Null}});
        if (kind == "track") {
            QVERIFY(applied["tracks"].toArray().isEmpty());
            QVERIFY(applied["clips"].toArray().isEmpty());
        } else if (kind == "trackFolder") {
            QVERIFY(applied["trackFolders"].toArray().isEmpty());
            QVERIFY(!applied["tracks"].toArray()[0].toObject().contains("folderId"));
        } else if (kind == "locked-clip") {
            QCOMPARE(applied, raw);
        } else {
            QCOMPARE(applied["clips"].toArray().size(), 1);
            QVERIFY(!applied["clips"].toArray()[0].toObject().contains(kind == "linked-clip" ? "linkId" : "parentId"));
        }
    }

    void handshake_data()
    {
        QTest::addColumn<QString>("token");
        QTest::newRow("bearer") << QString("test-token");
        QTest::newRow("loopback") << QString();
    }
    void handshake()
    {
        QFETCH(QString, token);
        QWebSocketServer server("sync", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        auto base = server.serverUrl();
        base.setScheme("http");
        base.setPath("/ignored/base");
        base.setQuery("discard=1");
        ResourceChangeClient client(base, "sequence", token);
        QSignalSpy states(&client, &ResourceChangeClient::stateChanged);
        client.start();
        QTRY_VERIFY_WITH_TIMEOUT(server.hasPendingConnections(), 1000);
        const std::unique_ptr<QWebSocket> peer(server.nextPendingConnection());
        QVERIFY(peer);
        const auto request = peer->request();
        QCOMPARE(request.url().scheme(), "ws");
        QCOMPARE(request.url().path(), "/ws");
        QVERIFY(request.url().query().isEmpty());
        QCOMPARE(request.rawHeader("Authorization"),
                 token.isEmpty() ? QByteArray{} : QByteArray("Bearer test-token"));
        QCOMPARE(request.rawHeader("X-Nodetool-Client"), QByteArray(nt::server::kClientHeader));
        QVERIFY(!request.hasRawHeader("Origin"));
        QTRY_VERIFY_WITH_TIMEOUT(client.connected(), 1000);
        QVERIFY(!states.isEmpty());
        client.stop();
        QVERIFY(!client.connected());
    }
    void textModeAndPing()
    {
        WsFixture fixture;
        QVERIFY(fixture.server.listen(QHostAddress::LocalHost, 0));
        ResourceChangeClient client(fixture.server.serverUrl(), "sequence");
        client.start();
        QTRY_COMPARE_WITH_TIMEOUT(fixture.frames.size(), 1, 1000);
        QTRY_COMPARE_WITH_TIMEOUT(fixture.frames[0].size(), 1, 1000);
        QCOMPARE(QJsonDocument::fromJson(fixture.frames[0][0].toUtf8()).object(),
                 (QJsonObject{{"command", "set_mode"}, {"data", QJsonObject{{"mode", "text"}}}}));
        fixture.peers[0]->sendTextMessage(R"({"type":"ping"})");
        QTRY_COMPARE_WITH_TIMEOUT(fixture.frames[0].size(), 2, 1000);
        QCOMPARE(QJsonDocument::fromJson(fixture.frames[0][1].toUtf8()).object(),
                 (QJsonObject{{"type", "pong"}}));
    }
    void resourceFrames()
    {
        WsFixture fixture;
        QVERIFY(fixture.server.listen(QHostAddress::LocalHost, 0));
        ResourceChangeClient client(fixture.server.serverUrl(), "77d07f26b9a74cf6b41e76fc12e3967d");
        QSignalSpy changes(&client, &ResourceChangeClient::changed);
        QSignalSpy refreshes(&client, &ResourceChangeClient::refreshNeeded);
        client.start();
        QTRY_COMPARE_WITH_TIMEOUT(fixture.peers.size(), 1, 1000);
        auto* peer = fixture.peers[0];
        const QByteArray frame = R"({"type":"resource_change","resource_type":"timelinesequence","event":"updated","resource":{"id":"77d07f26b9a74cf6b41e76fc12e3967d","etag":"3a046c5e7bde746b75adf8fce9234711","project_id":"default","updated_at":"2026-10-26T14:35:20.276Z"},"ops":[{"tool":"ui_timeline_move_clip","input":{"target":"clip-1","startMs":500,"id":"clip-1"}}]})";
        peer->sendTextMessage(QString::fromUtf8(frame));
        QTRY_COMPARE_WITH_TIMEOUT(changes.size(), 1, 1000);
        const auto notice = changes.takeFirst();
        QCOMPARE(notice[0].toString(), "updated");
        QCOMPARE(notice[1].toString(), "2026-10-26T14:35:20.276Z");
        QCOMPARE(qvariant_cast<QJsonArray>(notice[2]),
                 (QJsonArray{QJsonObject{{"tool", "ui_timeline_move_clip"},
                     {"input", QJsonObject{{"target", "clip-1"}, {"startMs", 500}, {"id", "clip-1"}}}}}));
        QVERIFY(notice[3].toBool());
        auto message = QJsonDocument::fromJson(frame).object();
        const auto send = [peer](const QJsonObject& value) {
            peer->sendTextMessage(QString::fromUtf8(QJsonDocument(value).toJson(QJsonDocument::Compact)));
        };
        auto other = message;
        auto resource = other["resource"].toObject();
        resource["id"] = "another-id";
        other["resource"] = resource;
        send(other);
        other = message;
        other["resource_type"] = "storyboard";
        send(other);
        peer->sendBinaryMessage(frame);
        peer->sendTextMessage("{malformed");
        peer->sendTextMessage("[]");
        // The resync is an ordered barrier after the ignored frames.
        peer->sendTextMessage(R"({"type":"resource_resync"})");
        QTRY_COMPARE_WITH_TIMEOUT(refreshes.size(), 1, 1000);
        QCOMPARE(changes.size(), 0);
        message.remove("ops");
        resource = message["resource"].toObject();
        resource.remove("updated_at");
        message["resource"] = resource;
        send(message);
        QTRY_COMPARE_WITH_TIMEOUT(changes.size(), 1, 1000);
        QVERIFY(changes.last()[1].toString().isEmpty());
        QVERIFY(qvariant_cast<QJsonArray>(changes.last()[2]).isEmpty());
        QVERIFY(!changes.last()[3].toBool());
        message["ops"] = QJsonArray{};
        send(message);
        QTRY_COMPARE_WITH_TIMEOUT(changes.size(), 2, 1000);
        QVERIFY(changes.last()[3].toBool());
    }
    void reconnectBackoffAndRefresh_data()
    {
        QTest::addColumn<double>("random");
        QTest::addColumn<int>("first");
        QTest::addColumn<int>("second");
        QTest::newRow("half-jitter") << 0.0 << 100 << 150;
        QTest::newRow("middle-jitter") << 0.5 << 150 << 225;
        QTest::newRow("full-jitter") << 1.0 << 200 << 300;
    }
    void reconnectBackoffAndRefresh()
    {
        QFETCH(double, random);
        QFETCH(int, first);
        QFETCH(int, second);
        WsFixture fixture;
        QVERIFY(fixture.server.listen(QHostAddress::LocalHost, 0));
        const auto port = fixture.server.serverPort();
        ResourceChangeClient client(fixture.server.serverUrl(), "sequence");
        client.setRandomSource([random] { return random; });
        client.setBackoffBase(200);
        client.setReconnectRefreshDelay([] { return 30; });
        QSignalSpy delays(&client, &ResourceChangeClient::reconnectScheduled);
        QSignalSpy refreshes(&client, &ResourceChangeClient::refreshNeeded);
        client.start();
        QTRY_COMPARE_WITH_TIMEOUT(fixture.peers.size(), 1, 1000);
        QTRY_VERIFY_WITH_TIMEOUT(client.connected(), 1000);
        QTest::qWait(60);
        QCOMPARE(refreshes.size(), 1);
        fixture.peers[0]->close(QWebSocketProtocol::CloseCodeGoingAway, "restart");
        fixture.server.close();
        QTRY_COMPARE_WITH_TIMEOUT(delays.size(), 1, 1000);
        QCOMPARE(delays[0][0].toInt(), first);
        QVERIFY(!client.connected());
        QCOMPARE(client.state(), ResourceChangeClient::State::Reconnecting);
        QTRY_COMPARE_WITH_TIMEOUT(delays.size(), 2, 1000);
        QCOMPARE(delays[1][0].toInt(), second);
        QVERIFY(fixture.server.listen(QHostAddress::LocalHost, port));
        QTRY_COMPARE_WITH_TIMEOUT(fixture.peers.size(), 2, 1000);
        QTRY_COMPARE_WITH_TIMEOUT(refreshes.size(), 2, 1000);
        QTest::qWait(60);
        QCOMPARE(refreshes.size(), 2);
        fixture.peers[1]->close(static_cast<QWebSocketProtocol::CloseCode>(1012), "service restart");
        QTRY_COMPARE_WITH_TIMEOUT(delays.size(), 3, 1000);
        QCOMPARE(delays[2][0].toInt(), first);
        QTRY_COMPARE_WITH_TIMEOUT(fixture.peers.size(), 3, 1000);
        QTRY_COMPARE_WITH_TIMEOUT(refreshes.size(), 3, 1000);
        QTest::qWait(60);
        QCOMPARE(refreshes.size(), 3);
        client.stop();
        QTest::qWait(first + 60);
        QCOMPARE(fixture.peers.size(), 3);
        QCOMPARE(client.state(), ResourceChangeClient::State::Stopped);
    }
    void terminalClose_data()
    {
        QTest::addColumn<int>("code");
        for (const auto code : {1008, 1009, 1010, 4000, 4001, 4003}) {
            QTest::newRow(qPrintable(QString::number(code))) << code;
        }
    }
    void terminalClose()
    {
        QFETCH(int, code);
        WsFixture fixture;
        QVERIFY(fixture.server.listen(QHostAddress::LocalHost, 0));
        ResourceChangeClient client(fixture.server.serverUrl(), "sequence");
        client.setBackoffBase(20);
        client.setReconnectRefreshDelay([] { return 0; });
        QSignalSpy delays(&client, &ResourceChangeClient::reconnectScheduled);
        QSignalSpy refreshes(&client, &ResourceChangeClient::refreshNeeded);
        client.start();
        QTRY_COMPARE_WITH_TIMEOUT(fixture.peers.size(), 1, 1000);
        QTRY_COMPARE_WITH_TIMEOUT(refreshes.size(), 1, 1000);
        fixture.peers[0]->close(static_cast<QWebSocketProtocol::CloseCode>(code), "access refused");
        QTRY_COMPARE_WITH_TIMEOUT(client.state(), ResourceChangeClient::State::Failed, 1000);
        QVERIFY(!client.connected());
        QCOMPARE(client.reason(), "access refused");
        QTest::qWait(100);
        QCOMPARE(delays.size(), 0);
        QCOMPARE(refreshes.size(), 1);
        QCOMPARE(fixture.peers.size(), 1);
    }
    void unauthorizedHandshake_data()
    {
        QTest::addColumn<QByteArray>("challenge");
        QTest::newRow("server-auth-rejection") << QByteArray();
        QTest::newRow("basic-challenge") << QByteArray("WWW-Authenticate: Basic realm=sync\r\n");
    }
    void unauthorizedHandshake()
    {
        QFETCH(QByteArray, challenge);
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        int requests = 0;
        connect(&server, &QTcpServer::newConnection, &server, [&server, &requests, challenge] {
            auto* socket = server.nextPendingConnection();
            socket->setParent(&server);
            connect(socket, &QTcpSocket::readyRead, socket, [socket, &requests, challenge] {
                socket->setProperty("request", socket->property("request").toByteArray() + socket->readAll());
                if (!socket->property("request").toByteArray().contains("\r\n\r\n")) {
                    return;
                }
                ++requests;
                socket->write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n"
                              + challenge + "\r\n");
                socket->disconnectFromHost();
            });
        });
        ResourceChangeClient client(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())),
                                    "sequence", "expired-token");
        client.setBackoffBase(20);
        QSignalSpy delays(&client, &ResourceChangeClient::reconnectScheduled);
        QTest::failOnWarning();
        QTest::ignoreMessage(QtWarningMsg, "ResourceChangeClient: WebSocket authentication failed (HTTP 401)");
        client.start();
        QTRY_COMPARE_WITH_TIMEOUT(requests, 1, 1000);
        QTRY_COMPARE_WITH_TIMEOUT(client.state(), ResourceChangeClient::State::Failed, 1000);
        QVERIFY(client.reason().contains("401"));
        QVERIFY(!client.connected());
        QTest::qWait(100);
        QCOMPARE(requests, 1);
        QCOMPARE(delays.size(), 0);
    }
    void missedHeartbeat()
    {
        WsFixture fixture;
        QVERIFY(fixture.server.listen(QHostAddress::LocalHost, 0));
        ResourceChangeClient client(fixture.server.serverUrl(), "sequence");
        client.setHeartbeatTimings(80, 60);
        client.setBackoffBase(20);
        client.setReconnectRefreshDelay([] { return 0; });
        QSignalSpy delays(&client, &ResourceChangeClient::reconnectScheduled);
        QSignalSpy refreshes(&client, &ResourceChangeClient::refreshNeeded);
        client.start();
        QTRY_COMPARE_WITH_TIMEOUT(fixture.frames.size(), 1, 1000);
        QTRY_COMPARE_WITH_TIMEOUT(fixture.frames[0].size(), 2, 1000);
        QCOMPARE(QJsonDocument::fromJson(fixture.frames[0][1].toUtf8()).object()["type"].toString(), "ping");
        QTRY_COMPARE_WITH_TIMEOUT(fixture.peers.size(), 2, 1000);
        QCOMPARE(delays.size(), 1);
        QTRY_COMPARE_WITH_TIMEOUT(refreshes.size(), 2, 1000);
        client.stop();
    }
    void stopWhileConnecting()
    {
        WsFixture fixture;
        QVERIFY(fixture.server.listen(QHostAddress::LocalHost, 0));
        ResourceChangeClient client(fixture.server.serverUrl(), "sequence");
        connect(&client, &ResourceChangeClient::stateChanged, &client, [&client] {
            if (client.state() == ResourceChangeClient::State::Connecting) {
                client.stop();
            }
        });
        client.start();
        QTest::qWait(100);
        QCOMPARE(client.state(), ResourceChangeClient::State::Stopped);
        QCOMPARE(fixture.peers.size(), 0);
    }
    void disjointEdits()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["clips"] = QJsonArray{clip("a", "local"), clip("b")};
        server["clips"] = QJsonArray{clip("a"), clip("b", "external")};
        const auto result = mergeTimelineDocuments(base, draft, server, op("id", "b"));
        QCOMPARE(result.doc["clips"].toArray(), (QJsonArray{clip("a", "local"), clip("b", "external")}));
        QVERIFY(result.conflicts.isEmpty());
        QCOMPARE(result.nextBase, server);
    }
    void sameClip()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["clips"] = QJsonArray{clip("a", "local"), clip("b")};
        server["clips"] = QJsonArray{clip("a", "external"), clip("b")};
        const auto result = mergeTimelineDocuments(base, draft, server, op());
        QCOMPARE(result.doc, draft);
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts[0].reason, "edited");
        QCOMPARE(result.conflicts[0].label, "local");
        QCOMPARE(result.conflicts[0].external, QJsonValue(clip("a", "external")));
        QCOMPARE(result.nextBase, base);
    }
    void externalDelete()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["clips"] = QJsonArray{clip("a", "local"), clip("b")};
        server["clips"] = QJsonArray{};
        const auto result = mergeTimelineDocuments(base, draft, server, op());
        QCOMPARE(result.doc["clips"].toArray(), QJsonArray{clip("a", "local")});
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts[0].reason, "deleted");
        QVERIFY(result.conflicts[0].external.isNull());
        // nextBase follows server membership even for a refused deletion.
        QCOMPARE(result.nextBase["clips"].toArray(), QJsonArray{});
    }
    void draftDelete()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["clips"] = QJsonArray{clip("b")};
        server["clips"] = QJsonArray{clip("a", "external"), clip("b")};
        const auto result = mergeTimelineDocuments(base, draft, server, op());
        QCOMPARE(result.doc, draft);
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts[0].reason, "deleted");
        QVERIFY(!result.conflicts[0].hasDraft);
        QCOMPARE(result.nextBase, base);
    }
    void additions()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["clips"] = QJsonArray{clip("a"), clip("local"), clip("b")};
        server["clips"] = QJsonArray{clip("external"), clip("a"), clip("b")};
        const auto result = mergeTimelineDocuments(base, draft, server, op());
        QCOMPARE(result.doc["clips"].toArray(),
                 (QJsonArray{clip("external"), clip("a"), clip("local"), clip("b")}));
        QVERIFY(result.conflicts.isEmpty());
    }
    void trackAdditionAndRename()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["tracks"] = QJsonArray{QJsonObject{{"id", "t"}, {"name", "renamed"}, {"type", "video"}}};
        server["tracks"] = QJsonArray{track("new"), track("t")};
        const auto result = mergeTimelineDocuments(base, draft, server, op("trackId", "new", "add_track"));
        QCOMPARE(result.doc["tracks"].toArray().size(), 2);
        QCOMPARE(result.doc["tracks"].toArray()[1].toObject()["name"], QJsonValue("renamed"));
    }
    void trackDeletion()
    {
        const auto base = document();
        auto removed = base;
        removed["tracks"] = QJsonArray{};
        removed["clips"] = QJsonArray{};
        const auto deletion = mergeTimelineDocuments(base, base, removed, op("trackId", "t", "delete_track"));
        QVERIFY(deletion.doc["tracks"].toArray().isEmpty());
    }
    void dangling()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["tracks"] = QJsonArray{};
        draft["clips"] = QJsonArray{};
        server["clips"] = QJsonArray{clip("new")};
        const auto result = mergeTimelineDocuments(base, draft, server, op());
        QVERIFY(result.doc["clips"].toArray().isEmpty());
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts[0].reason, "dangling");
        QCOMPARE(result.conflicts[0].id, "new");
    }
    void scalarEdits()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["fps"] = 24;
        server["tempo"] = QJsonObject{{"bpm", 120}};
        const auto result = mergeTimelineDocuments(base, draft, server, std::nullopt, true);
        QCOMPARE(result.doc["fps"], QJsonValue(24));
        QCOMPARE(result.doc["tempo"], server["tempo"]);
        server["fps"] = 60;
        const auto contested = mergeTimelineDocuments(base, draft, server, std::nullopt, true);
        QCOMPARE(contested.conflicts.size(), 1);
        QCOMPARE(contested.conflicts[0].id, "fps");
        QCOMPARE(contested.nextBase["fps"], QJsonValue(30));
    }
    void withoutOps()
    {
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["fps"] = 24;
        server["width"] = 1280;
        const auto replaced = mergeTimelineDocuments(base, draft, server);
        QCOMPARE(replaced.doc, draft);
        QCOMPARE(replaced.nextBase, base);
        QCOMPARE(replaced.conflicts.size(), 1);
        QCOMPARE(replaced.conflicts[0].reason, "replaced");
        QVERIFY(!replaced.conflicts[0].hasDraft);
        const auto merged = mergeTimelineDocuments(base, draft, server, QJsonArray{}, true);
        QCOMPARE(merged.doc["width"], QJsonValue(1280));
        QVERIFY(merged.conflicts.isEmpty());
    }
    void opScoping_data()
    {
        QTest::addColumn<QString>("key");
        QTest::newRow("clip_id") << QString("clip_id");
        QTest::newRow("clipId") << QString("clipId");
        QTest::newRow("id") << QString("id");
        QTest::newRow("target") << QString("target");
    }
    void opScoping()
    {
        QFETCH(QString, key);
        const auto base = document();
        auto draft = base;
        auto server = base;
        draft["clips"] = QJsonArray{clip("a", "local"), clip("b", "local")};
        server["clips"] = QJsonArray{clip("a", "external"), clip("b", "external")};
        const auto result = mergeTimelineDocuments(base, draft, server, op(key));
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts[0].id, "a");
        QCOMPARE(result.doc, draft);
        // The unlisted refusal must keep its old base too.
        QCOMPARE(result.nextBase, base);
    }
    void projectionAndApply()
    {
        auto raw = document();
        raw["id"] = "sequence";
        raw["unknown"] = QJsonObject{{"keep", true}};
        raw["tempo"] = QJsonObject{{"bpm", 100}};
        raw["master"] = QJsonObject{{"volumeDb", -3}};
        auto projected = mergeDocumentOf(raw);
        QVERIFY(!projected.contains("id"));
        QVERIFY(!projected.contains("unknown"));
        auto wire = raw;
        wire.remove("tempo");
        wire["master"] = QJsonValue::Null;
        wire.remove("tracks");
        const auto fetched = mergeDocumentOfSequence(wire, projected);
        QCOMPARE(fetched["tempo"], raw["tempo"]);
        QCOMPARE(fetched["master"], raw["master"]);
        QCOMPARE(fetched["tracks"].toArray(), QJsonArray{});
        projected.remove("tempo");
        const auto applied = applyMergeDocument(raw, projected);
        QVERIFY(!applied.contains("tempo"));
        QCOMPARE(applied["id"], raw["id"]);
        QCOMPARE(applied["unknown"], raw["unknown"]);
        QVERIFY(!mergeDocumentOf({}).contains("fps"));
        QVERIFY(mergeDocumentOf({})["camera2d"].isNull());
    }
    void mergedSetupPayload_data()
    {
        QTest::addColumn<QJsonValue>("setup");
        QTest::newRow("absent") << QJsonValue(QJsonValue::Undefined);
        QTest::newRow("null") << QJsonValue(QJsonValue::Null);
        QTest::newRow("object") << QJsonValue(QJsonObject{{"stage", "review"}, {"brief", "A film"}});
    }
    void mergedSetupPayload()
    {
        QFETCH(QJsonValue, setup);
        auto raw = document();
        raw.insert("setup", setup);
        const auto base = mergeDocumentOf(raw);
        auto draft = base;
        draft["fps"] = 24;
        auto server = raw;
        server["width"] = 1280;
        const auto merged = mergeTimelineDocuments(base, draft, mergeDocumentOfSequence(server, base),
                                                    std::nullopt, true);
        const auto applied = applyMergeDocument(server, merged.doc);
        QCOMPARE(applied["fps"], QJsonValue(24));
        QCOMPARE(applied["width"], QJsonValue(1280));
        if (setup.isObject()) {
            QCOMPARE(applied["setup"], setup);
        } else {
            QVERIFY(!applied.contains("setup"));
        }
        // camera2d is explicitly nullable in the payload, unlike setup.
        QVERIFY(applied.contains("camera2d"));
        QVERIFY(applied["camera2d"].isNull());
    }
    void acceptedSetupPayload_data()
    {
        mergedSetupPayload_data();
    }
    void acceptedSetupPayload()
    {
        QFETCH(QJsonValue, setup);
        auto raw = document();
        raw["setup"] = QJsonObject{{"stage", "review"}, {"brief", "Local film"}};
        const auto applied = applyAcceptedUnit(raw, {{"kind", "field"}, {"id", "setup"},
                                                     {"reason", "edited"}, {"external", setup}});
        if (setup.isObject()) {
            QCOMPARE(applied["setup"], setup);
        } else {
            QVERIFY(!applied.contains("setup"));
        }
    }
    void cameraParse()
    {
        const auto base = document();
        auto server = base;
        const QJsonObject position{{"x", 2}, {"y", 3}};
        const QJsonObject expected{{"position", position}, {"depthPx", 0}, {"focalLengthPx", 100}};
        auto camera = expected;
        camera["extra"] = true;
        camera["position"] = QJsonObject{{"x", 2}, {"y", 3}, {"extra", 4}};
        server["camera2d"] = camera;
        const auto result = mergeTimelineDocuments(base, base, server, std::nullopt, true);
        QCOMPARE(result.doc["camera2d"], QJsonValue(expected));
        QCOMPARE(result.nextBase["camera2d"], QJsonValue(expected));
    }
    void cameraRejectsInvalidWrites_data()
    {
        QTest::addColumn<QJsonValue>("camera");
        const QJsonObject valid{{"position", QJsonObject{{"x", 0}, {"y", 0}}},
                                {"depthPx", 0}, {"focalLengthPx", 100}};
        QTest::newRow("not-object") << QJsonValue(false);
        QTest::newRow("missing-fields") << QJsonValue(QJsonObject{});
        auto camera = valid;
        camera["focalLengthPx"] = 0;
        QTest::newRow("zero-focal-length") << QJsonValue(camera);
        camera = valid;
        camera["aperturePx"] = -1;
        QTest::newRow("negative-aperture") << QJsonValue(camera);
        camera = valid;
        camera["focusDepthPx"] = QJsonValue::Null;
        QTest::newRow("null-optional-number") << QJsonValue(camera);
        camera = valid;
        camera["position"] = QJsonObject{{"x", "0"}, {"y", 0}};
        QTest::newRow("string-coordinate") << QJsonValue(camera);
        camera = valid;
        camera["keyframes"] = QJsonValue::Null;
        QTest::newRow("null-keyframes") << QJsonValue(camera);
        camera["keyframes"] = QJsonArray{QJsonValue::Null};
        QTest::newRow("null-keyframe") << QJsonValue(camera);
        camera["keyframes"] = QJsonArray{QJsonObject{{"position", valid["position"]}, {"depthPx", 0}}};
        QTest::newRow("missing-keyframe-time") << QJsonValue(camera);
    }
    void cameraRejectsInvalidWrites()
    {
        QFETCH(QJsonValue, camera);
        const auto base = document();
        auto server = base;
        server["camera2d"] = camera;
        QVERIFY_THROWS_EXCEPTION(std::invalid_argument,
            mergeTimelineDocuments(base, base, server, std::nullopt, true));
    }
    void largeCollection()
    {
        auto base = document();
        QJsonArray clips;
        for (int i = 0; i < 10000; ++i) {
            clips.append(clip(QString::number(i)));
        }
        base["clips"] = clips;
        auto server = base;
        clips.replace(9999, clip("9999", "external"));
        server["clips"] = clips;
        const auto result = mergeTimelineDocuments(base, base, server, op("id", "9999"));
        QCOMPARE(result.doc["clips"].toArray(), clips);
        QVERIFY(result.conflicts.isEmpty());
    }
};

int main(int argc, char** argv)
{
    QCoreApplication app(argc, argv);
    if (app.arguments().contains("--merge")) {
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) {
            return 2;
        }
        QJsonParseError error;
        const auto requests = QJsonDocument::fromJson(input.readAll(), &error);
        if (error.error != QJsonParseError::NoError || !requests.isArray()) {
            return 2;
        }
        QJsonArray results;
        for (const auto& value : requests.array()) {
            const auto request = value.toObject();
            const auto base = mergeDocumentOf(request["base"].toObject());
            const auto draft = mergeDocumentOf(request["draft"].toObject());
            const auto server = mergeDocumentOfSequence(request["server"].toObject(), base);
            const auto ops = request.contains("ops")
                ? std::optional{request["ops"].toArray()} : std::nullopt;
            results.append(serialized(mergeTimelineDocuments(base, draft, server, ops,
                request["mergeWithoutOps"].toBool())));
        }
        const auto output = QJsonDocument(results).toJson(QJsonDocument::Compact);
        return std::fwrite(output.constData(), 1, static_cast<size_t>(output.size()), stdout)
                       == static_cast<size_t>(output.size()) ? 0 : 3;
    }
    SyncTest test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_sync.moc"
