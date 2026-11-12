// F27 reconnect and live-running states. The web contracts are resumeInFlightJobs, handleJobResumed,
// settleLostRun and isJobHalted in web/src/stores/workflowUpdates.ts.
#include "FakeRunServer.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "server/ReconnectPolicy.h"
#include "server/WorkflowSession.h"
#include "ui/EditorWindow.h"
#include <QtTest>
#include <memory>
using namespace nodetool;
using namespace nodetool::node_editor;

namespace {
QJsonObject snapshot() {
    return {{"id", "workflow"},
            {"name", "Reconnect"},
            {"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "text"}, {"data", QJsonObject{}},
                                                                   {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}},
                                  {"edges", QJsonArray{}}}}};
}
void send(FakeRunServer &server, const QJsonObject &event) {
    QVERIFY(server.peer);
    server.peer->sendBinaryMessage(encodeMsgPack(event));
}
QVariantMap queued(WorkflowSession &session, const QString &id) {
    for (const auto &entry : session.queue()) {
        if (entry.toMap()["jobId"] == id) {
            return entry.toMap();
        }
    }
    return {};
}
QStringList commandNames(const FakeRunServer &server) {
    QStringList names;
    for (const auto &command : server.commands) {
        names.append(command["command"].toString());
    }
    return names;
}
QString canvasStatus(EditorWindow &window) {
    const auto &model = dynamic_cast<const WorkflowGraphModel &>(window.scene()->graphModel());
    for (const auto id : model.allNodeIds()) {
        return model.runtimeState(id)["status"].toString();
    }
    return {};
}
// Drops the socket, then retries the same server as More → Reconnect does.
void dropAndReconnect(FakeRunServer &server, WorkflowSession &session) {
    server.commands.clear();
    server.peer->close();
    QTRY_VERIFY(!session.connected());
    session.reconnectTransport();
    QTRY_VERIFY(session.connected());
    QTRY_VERIFY(!server.commands.isEmpty());
}
// Delays of 10, 20, 40 and then 40 milliseconds, with no jitter, so no test waits for the web's real backoff.
ReconnectPolicy fastPolicy() {
    ReconnectPolicy policy;
    policy.intervalMs = 10;
    policy.decay = 2.0;
    policy.maxIntervalMs = 40;
    policy.jitter = [] { return 1.0; };
    return policy;
}
// Stops the fake server from answering, as when the machine behind it is down.
quint16 takeDown(FakeRunServer &server) {
    const auto port = server.http.serverPort();
    server.http.close();
    return port;
}
void bringUp(FakeRunServer &server, quint16 port) {
    QVERIFY(server.http.listen(QHostAddress::LocalHost, port));
}
// The (attempt, delay) pairs that the session announced.
QList<QPair<int, int>> schedule(const QSignalSpy &spy) {
    QList<QPair<int, int>> result;
    for (const auto &entry : spy) {
        result.append({entry[0].toInt(), entry[1].toInt()});
    }
    return result;
}
}

class RunReconnectTest final : public QObject {
    Q_OBJECT
private slots:
    // The web socket manager reconnects after any drop that is not on purpose, so no user action
    // is needed. Source: web/src/lib/websocket/WebSocketManager.ts handleClose and scheduleReconnect.
    void droppedSocketReconnectsByItself() {
        FakeRunServer server;
        WorkflowSession session;
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        server.peer->close();
        QTRY_VERIFY(!session.connected());
        QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 4000);
    }

    // The ladder is the web's: 1000 ms times 1.5 per failure, capped at 30 s, scaled by 0.5 to 1.0.
    // Source: getReconnectDelay in WebSocketManager.ts.
    void policyFollowsTheWebLadder() {
        ReconnectPolicy policy;
        policy.jitter = [] { return 1.0; };
        QCOMPARE(policy.delayMs(0), 1000);
        QCOMPARE(policy.delayMs(1), 1500);
        QCOMPARE(policy.delayMs(2), 2250);
        QCOMPARE(policy.delayMs(8), 25629);
        QCOMPARE(policy.delayMs(9), 30000);
        QCOMPARE(policy.delayMs(40), 30000);
        policy.jitter = [] { return 0.0; };
        QCOMPARE(policy.delayMs(0), 500);
        QCOMPARE(policy.delayMs(40), 15000);
        // The default jitter stays in the half-to-full window.
        policy.jitter = nullptr;
        for (int i = 0; i < 200; ++i) {
            const auto delay = policy.delayMs(0);
            QVERIFY(delay >= 500 && delay <= 1000);
        }
        // The web retries without limit until a limit is set.
        QVERIFY(policy.allows(1000000));
        policy.maxAttempts = 3;
        QVERIFY(policy.allows(2));
        QVERIFY(!policy.allows(3));
        for (const int code : {1008, 1009, 1010, 4000, 4001, 4003}) {
            QVERIFY(ReconnectPolicy::terminalCloseCode(code));
        }
        for (const int code : {1000, 1001, 1006, 1011}) {
            QVERIFY(!ReconnectPolicy::terminalCloseCode(code));
        }
    }

    // Each failed attempt waits longer, up to the cap. A success resets the ladder.
    void backoffGrowsAndSuccessResetsIt() {
        FakeRunServer server;
        WorkflowSession session;
        session.setReconnectPolicy(fastPolicy());
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        QCOMPARE(session.reconnectAttempt(), 0);
        QSignalSpy scheduled(&session, &WorkflowSession::reconnectScheduled);
        const auto port = takeDown(server);
        server.peer->close();
        QTRY_VERIFY_WITH_TIMEOUT(scheduled.count() >= 4, 4000);
        QCOMPARE(schedule(scheduled).mid(0, 4), (QList<QPair<int, int>>{{1, 10}, {2, 20}, {3, 40}, {4, 40}}));
        QVERIFY(!session.connected());
        bringUp(server, port);
        QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 4000);
        QCOMPARE(session.reconnectAttempt(), 0);
        QCOMPARE(session.connectionDetail(), QString());
        // The next drop starts at the bottom again.
        scheduled.clear();
        server.peer->close();
        QTRY_VERIFY(scheduled.count() >= 1);
        QCOMPARE(schedule(scheduled).first(), (QPair<int, int>{1, 10}));
        QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 4000);
    }

    // With an attempt limit the session stops and says so. More → Reconnect starts over.
    void givesUpAfterTheAttemptLimitAndManualReconnectRecovers() {
        FakeRunServer server;
        WorkflowSession session;
        auto policy = fastPolicy();
        policy.maxAttempts = 2;
        session.setReconnectPolicy(policy);
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        QSignalSpy scheduled(&session, &WorkflowSession::reconnectScheduled);
        const auto port = takeDown(server);
        server.peer->close();
        QTRY_VERIFY_WITH_TIMEOUT(session.gaveUp(), 4000);
        QCOMPARE(scheduled.count(), 2);
        QCOMPARE(session.connectionState(), QString("offline"));
        QCOMPARE(session.connectionDetail(), QString("Connection failed"));
        QTest::qWait(150);
        QCOMPARE(scheduled.count(), 2);
        bringUp(server, port);
        session.reconnectTransport();
        QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 4000);
        QVERIFY(!session.gaveUp());
        QCOMPARE(session.reconnectAttempt(), 0);
        QCOMPARE(session.connectionDetail(), QString());
    }

    // Panels such as Versions show the session's last error, so each failed retry would replace
    // their text. The status bar names the attempt instead, and only giving up reports an error.
    void failedRetriesReportOneErrorWhenTheSessionGivesUp() {
        FakeRunServer server;
        WorkflowSession session;
        auto policy = fastPolicy();
        policy.maxAttempts = 3;
        session.setReconnectPolicy(policy);
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
        QSignalSpy scheduled(&session, &WorkflowSession::reconnectScheduled);
        takeDown(server);
        server.peer->close();
        QTRY_VERIFY_WITH_TIMEOUT(scheduled.count() >= 2, 4000);
        QCOMPARE(errors.count(), 0);
        QTRY_VERIFY_WITH_TIMEOUT(session.gaveUp(), 4000);
        QCOMPARE(errors.count(), 1);
        QVERIFY(!errors.first().first().toString().isEmpty());
    }

    // A close the server sends for a reason that retrying cannot fix ends the attempts at once.
    void terminalCloseCodeStopsTheRetries() {
        FakeRunServer server;
        WorkflowSession session;
        session.setReconnectPolicy(fastPolicy());
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        QSignalSpy scheduled(&session, &WorkflowSession::reconnectScheduled);
        server.peer->close(QWebSocketProtocol::CloseCodePolicyViolated, "no");
        QTRY_VERIFY(session.gaveUp());
        QTest::qWait(150);
        QCOMPARE(scheduled.count(), 0);
        QVERIFY(!session.connected());
    }

    // More → Reconnect collapses a pending wait and restarts the ladder, as retryNow does on the web:
    // the attempt counter becomes 1, so the next wait is the second rung, not the one after the climb.
    void manualReconnectResetsTheBackoff() {
        FakeRunServer server;
        WorkflowSession session;
        auto policy = fastPolicy();
        policy.intervalMs = 100;
        policy.maxIntervalMs = 400;
        session.setReconnectPolicy(policy);
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        QSignalSpy scheduled(&session, &WorkflowSession::reconnectScheduled);
        const auto port = takeDown(server);
        server.peer->close();
        QTRY_VERIFY_WITH_TIMEOUT(scheduled.count() >= 3, 4000);
        QCOMPARE(schedule(scheduled).mid(0, 3), (QList<QPair<int, int>>{{1, 100}, {2, 200}, {3, 400}}));
        // The third wait is still pending. The manual attempt fails too and schedules from the second rung.
        scheduled.clear();
        session.reconnectTransport();
        QCOMPARE(session.reconnectAttempt(), 1);
        QTRY_VERIFY_WITH_TIMEOUT(scheduled.count() >= 1, 4000);
        QCOMPARE(schedule(scheduled).first(), (QPair<int, int>{2, 200}));
        // A manual attempt that succeeds clears the counter.
        bringUp(server, port);
        session.reconnectTransport();
        QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 4000);
        QCOMPARE(session.reconnectAttempt(), 0);
    }

    // Closing the session on purpose is not a drop. Neither a connected nor a waiting session retries.
    void deliberateDisconnectDoesNotReconnect() {
        FakeRunServer server;
        WorkflowSession session;
        session.setReconnectPolicy(fastPolicy());
        QSignalSpy connections(&server.websocket, &QWebSocketServer::newConnection);
        QSignalSpy scheduled(&session, &WorkflowSession::reconnectScheduled);
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        QCOMPARE(connections.count(), 1);
        session.disconnectFromServer();
        QTest::qWait(150);
        QVERIFY(!session.connected());
        QCOMPARE(scheduled.count(), 0);
        QCOMPARE(connections.count(), 1);
        QCOMPARE(session.connectionState(), QString("idle"));
        // A session that is waiting to retry stops when it is closed.
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        const auto port = takeDown(server);
        server.peer->close();
        QTRY_VERIFY(scheduled.count() >= 1);
        session.disconnectFromServer();
        const auto seen = scheduled.count();
        bringUp(server, port);
        QTest::qWait(150);
        QCOMPARE(scheduled.count(), seen);
        QVERIFY(!session.connected());
        QCOMPARE(connections.count(), 2);
    }

    // A pending retry for the old server never opens a socket to it once another server is chosen.
    void serverChangeCancelsThePendingRetry() {
        FakeRunServer first;
        FakeRunServer second;
        WorkflowSession session;
        auto policy = fastPolicy();
        policy.intervalMs = 100;
        policy.maxIntervalMs = 100;
        session.setReconnectPolicy(policy);
        session.connectToServer(first.url(), {});
        QTRY_VERIFY(session.connected());
        QSignalSpy firstConnections(&first.websocket, &QWebSocketServer::newConnection);
        first.peer->close();
        QTRY_VERIFY(!session.connected());
        session.connectToServer(second.url(), {});
        QTRY_VERIFY(session.connected());
        QTest::qWait(300);
        QCOMPARE(firstConnections.count(), 0);
        QVERIFY(session.connected());
        QCOMPARE(session.serverUrl(), second.url());
    }

    // Destroying the session while a retry waits opens nothing and does not crash.
    void teardownDuringBackoffOpensNothing() {
        FakeRunServer server;
        QSignalSpy connections(&server.websocket, &QWebSocketServer::newConnection);
        auto session = std::make_unique<WorkflowSession>();
        auto policy = fastPolicy();
        policy.intervalMs = 100;
        policy.maxIntervalMs = 100;
        session->setReconnectPolicy(policy);
        session->connectToServer(server.url(), {});
        QTRY_VERIFY(session->connected());
        QSignalSpy scheduled(session.get(), &WorkflowSession::reconnectScheduled);
        server.peer->close();
        QTRY_VERIFY(scheduled.count() >= 1);
        session.reset();
        QTest::qWait(300);
        QCOMPARE(connections.count(), 1);
    }

    // The status names what the socket is doing. The web reads offline between attempts and connecting
    // during one, and the chat store words it "Reconnecting... (attempt N)".
    void statusNamesTheAttempt() {
        FakeRunServer server;
        WorkflowSession session;
        auto policy = fastPolicy();
        policy.intervalMs = 5000;
        policy.maxIntervalMs = 5000;
        session.setReconnectPolicy(policy);
        QCOMPARE(session.connectionState(), QString("idle"));
        session.connectToServer(server.url(), {});
        QCOMPARE(session.connectionState(), QString("connecting"));
        QTRY_COMPARE(session.connectionState(), QString("connected"));
        QCOMPARE(session.connectionDetail(), QString());
        takeDown(server);
        server.peer->close();
        QTRY_COMPARE(session.connectionState(), QString("offline"));
        QCOMPARE(session.connectionDetail(), QString::fromUtf8("Reconnecting\u2026 (attempt 1)"));
        session.reconnectTransport();
        QCOMPARE(session.connectionState(), QString("connecting"));
        QTRY_COMPARE(session.connectionState(), QString("offline"));
        QCOMPARE(session.connectionDetail(), QString::fromUtf8("Reconnecting\u2026 (attempt 2)"));
    }

    // The window and its status bar show the state.
    void windowShowsTheReconnectState() {
        FakeRunServer server;
        EditorWindow window;
        auto policy = fastPolicy();
        policy.intervalMs = 5000;
        policy.maxIntervalMs = 5000;
        window.session()->setReconnectPolicy(policy);
        QCOMPARE(window.connectionStatus(), QString("idle"));
        window.session()->connectToServer(server.url(), {});
        QTRY_COMPARE(window.connectionStatus(), QString("connected"));
        QCOMPARE(window.connectionDetail(), QString());
        takeDown(server);
        server.peer->close();
        QTRY_COMPARE(window.connectionStatus(), QString("offline"));
        QCOMPARE(window.connectionDetail(), QString::fromUtf8("Reconnecting\u2026 (attempt 1)"));
    }

    // The run keeps its job ID across an automatic reconnect. The session resumes it from its last
    // sequence with no user action and submits nothing again.
    void inFlightRunResumesAfterAutomaticReconnect() {
        FakeRunServer server;
        WorkflowSession session;
        session.setReconnectPolicy(fastPolicy());
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        const auto id = session.run(snapshot());
        QTRY_COMPARE(server.commands.size(), 1);
        send(server, {{"type", "job_update"}, {"job_id", id}, {"job_seq", 3}, {"status", "running"}});
        QTRY_COMPARE(queued(session, id)["status"].toString(), QString("running"));
        server.commands.clear();
        const auto port = takeDown(server);
        server.peer->close();
        QTRY_VERIFY(!session.connected());
        QTRY_VERIFY(queued(session, id)["uncertain"].toBool());
        // The server comes back after a few failed attempts.
        QTest::qWait(60);
        bringUp(server, port);
        QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 4000);
        QTRY_COMPARE(commandNames(server), QStringList{"reconnect_job"});
        const auto data = server.commands[0]["data"].toObject();
        QCOMPARE(data["job_id"].toString(), id);
        QCOMPARE(data["last_seq"].toInt(), 3);
        send(server, {{"type", "job_resumed"}, {"job_id", id}, {"status", "running"}, {"last_seq", 3}, {"replay_count", 0}});
        QTRY_VERIFY(!queued(session, id)["uncertain"].toBool());
        QCOMPARE(queued(session, id)["status"].toString(), QString("running"));
        QVERIFY(!commandNames(server).contains("run_job"));
    }

    // A dropped socket resumes the active run by its original job ID from its last sequence and
    // submits nothing again. A run that already finished is not resumed.
    void reconnectResumesOnlyActiveRunsWithoutResubmitting() {
        FakeRunServer server;
        WorkflowSession session;
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        const auto active = session.run(snapshot());
        const auto finished = session.run(snapshot());
        QTRY_COMPARE(server.commands.size(), 2);
        send(server, {{"type", "node_update"}, {"job_id", active}, {"job_seq", 3}, {"node_id", "n"}, {"status", "running"}});
        send(server, {{"type", "job_update"}, {"job_id", finished}, {"job_seq", 1}, {"status", "completed"}});
        QTRY_COMPARE(queued(session, finished)["status"].toString(), QString("completed"));
        dropAndReconnect(server, session);
        QTest::qWait(50);
        QCOMPARE(commandNames(server), QStringList{"reconnect_job"});
        const auto data = server.commands[0]["data"].toObject();
        QCOMPARE(data["job_id"].toString(), active);
        QCOMPARE(data["last_seq"].toInt(), 3);
        QCOMPARE(data["workflow_id"].toString(), QString("workflow"));
        // Until the server answers, the run's outcome is unknown and no new run starts.
        QVERIFY(session.run(snapshot()).isEmpty());
        send(server, {{"type", "job_resumed"}, {"job_id", active}, {"status", "running"}, {"last_seq", 3}, {"replay_count", 0}});
        QTRY_VERIFY(!queued(session, active)["uncertain"].toBool());
        QCOMPARE(queued(session, active)["status"].toString(), QString("running"));
        QVERIFY(!commandNames(server).contains("run_job"));
    }

    // A lifecycle frame that arrives after the run finished does not reopen it, and frames for a
    // job this session never submitted are ignored.
    void lateAndForeignFramesAreIgnored() {
        FakeRunServer server;
        WorkflowSession session;
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        const auto id = session.run(snapshot());
        QTRY_COMPARE(server.commands.size(), 1);
        send(server, {{"type", "job_update"}, {"job_id", id}, {"job_seq", 1}, {"status", "completed"}});
        QTRY_COMPARE(queued(session, id)["status"].toString(), QString("completed"));
        QSignalSpy events(&session, &WorkflowSession::runEvent);
        send(server, {{"type", "job_update"}, {"job_id", id}, {"status", "running"}});
        send(server, {{"type", "job_update"}, {"job_id", id}, {"job_seq", 2}, {"status", "queued"}, {"queue_position", 1}});
        send(server, {{"type", "node_update"}, {"job_id", "foreign"}, {"job_seq", 1}, {"node_id", "n"}, {"status", "running"}});
        // An artifact may still follow completion, so it is delivered. It marks the end of the frames.
        send(server, {{"type", "generation_complete"}, {"job_id", id}, {"job_seq", 3}, {"node_id", "n"}, {"outputs", QJsonObject{}}});
        QTRY_COMPARE(events.count(), 1);
        QTest::qWait(20);
        QCOMPARE(events.count(), 1);
        QCOMPARE(events[0][1].toJsonObject()["type"].toString(), QString("generation_complete"));
        QCOMPARE(queued(session, id)["status"].toString(), QString("completed"));
        QVERIFY(queued(session, id)["terminal"].toBool());
        QVERIFY(queued(session, "foreign").isEmpty());
    }

    // The server no longer knows a run after the reconnect. The run settles as failed with the web
    // message, instead of blocking every later run.
    void lostRunSettlesAndAllowsNewRuns() {
        FakeRunServer server;
        WorkflowSession session;
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        const auto id = session.run(snapshot());
        QTRY_COMPARE(server.commands.size(), 1);
        QSignalSpy events(&session, &WorkflowSession::runEvent);
        send(server, {{"type", "node_update"}, {"job_id", id}, {"job_seq", 1}, {"node_id", "n"}, {"status", "running"}});
        QTRY_COMPARE(events.count(), 1);
        dropAndReconnect(server, session);
        QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
        send(server, {{"type", "job_resumed"}, {"job_id", id}, {"status", "unknown"}, {"last_seq", 1}, {"replay_count", 0}});
        QTRY_VERIFY(queued(session, id)["terminal"].toBool());
        QCOMPARE(queued(session, id)["status"].toString(), QString("failed"));
        QVERIFY(!queued(session, id)["uncertain"].toBool());
        QVERIFY(!errors.isEmpty());
        QVERIFY(errors.last()[0].toString().contains("Lost track of this run"));
        QVERIFY(!session.run(snapshot()).isEmpty());
    }

    // The canvas stops animating while the socket is down, resumes for the reconnected run, and
    // takes the replayed outcome of a run that finished during the gap.
    void reconnectedRunTakesItsReplayedOutcome() {
        FakeRunServer server;
        EditorWindow window;
        QVERIFY(window.document()->load(snapshot()).ok);
        window.session()->connectToServer(server.url(), {});
        QTRY_VERIFY(window.session()->connected());
        const auto id = window.session()->run(window.document()->snapshot());
        QTRY_COMPARE(server.commands.size(), 1);
        send(server, {{"type", "node_update"}, {"job_id", id}, {"job_seq", 1}, {"node_id", "n"}, {"status", "running"}});
        QTRY_VERIFY(window.scene()->animationActive());
        server.commands.clear();
        server.peer->close();
        QTRY_VERIFY(!window.session()->connected());
        QVERIFY(!window.scene()->animationActive());
        QCOMPARE(canvasStatus(window), QString("running"));
        window.action("Reconnect");
        QTRY_VERIFY(window.session()->connected());
        QTRY_VERIFY(window.scene()->animationActive());
        QTRY_COMPARE(commandNames(server), QStringList{"reconnect_job"});
        send(server, {{"type", "job_resumed"}, {"job_id", id}, {"status", "finished"}, {"last_seq", 1}, {"replay_count", 2}});
        send(server, {{"type", "node_update"}, {"job_id", id}, {"job_seq", 2}, {"node_id", "n"}, {"status", "error"}, {"error", "boom"}});
        send(server, {{"type", "job_update"}, {"job_id", id}, {"job_seq", 3}, {"status", "failed"}, {"error", "boom"}});
        QTRY_COMPARE(canvasStatus(window), QString("error"));
        QTRY_VERIFY(!window.scene()->animationActive());
        QTRY_COMPARE(queued(*window.session(), id)["status"].toString(), QString("failed"));
        QCOMPARE(commandNames(server), QStringList{"reconnect_job"});
    }

    // A run that finished during the gap, with its last frame already seen, has nothing to replay.
    // The reply alone settles it and the canvas goes idle.
    void runFinishedDuringTheGapSettlesTheCanvas() {
        FakeRunServer server;
        EditorWindow window;
        QVERIFY(window.document()->load(snapshot()).ok);
        window.session()->connectToServer(server.url(), {});
        QTRY_VERIFY(window.session()->connected());
        const auto id = window.session()->run(window.document()->snapshot());
        QTRY_COMPARE(server.commands.size(), 1);
        send(server, {{"type", "node_update"}, {"job_id", id}, {"job_seq", 1}, {"node_id", "n"}, {"status", "running"}});
        QTRY_VERIFY(window.scene()->animationActive());
        dropAndReconnect(server, *window.session());
        send(server, {{"type", "job_resumed"}, {"job_id", id}, {"status", "finished"}, {"last_seq", 1}, {"replay_count", 0}});
        QTRY_VERIFY(queued(*window.session(), id)["terminal"].toBool());
        QTRY_VERIFY(!window.scene()->animationActive());
        QVERIFY(canvasStatus(window) != QString("running"));
        QVERIFY(!window.session()->run(window.document()->snapshot()).isEmpty());
    }

    // A run the server lost stops the running ring once the reply arrives.
    void lostRunStopsTheCanvasAnimation() {
        FakeRunServer server;
        EditorWindow window;
        QVERIFY(window.document()->load(snapshot()).ok);
        window.session()->connectToServer(server.url(), {});
        QTRY_VERIFY(window.session()->connected());
        const auto id = window.session()->run(window.document()->snapshot());
        QTRY_COMPARE(server.commands.size(), 1);
        send(server, {{"type", "node_update"}, {"job_id", id}, {"job_seq", 1}, {"node_id", "n"}, {"status", "running"}});
        QTRY_VERIFY(window.scene()->animationActive());
        dropAndReconnect(server, *window.session());
        QTRY_VERIFY(window.scene()->animationActive());
        send(server, {{"type", "job_resumed"}, {"job_id", id}, {"status", "unknown"}, {"last_seq", 1}, {"replay_count", 0}});
        QTRY_VERIFY(!window.scene()->animationActive());
        QCOMPARE(canvasStatus(window), QString());
    }

    // Changing the server forgets the previous server's run. Its running state does not return
    // when the new connection opens.
    void serverChangeDropsTheOldRun() {
        FakeRunServer first;
        FakeRunServer second;
        EditorWindow window;
        QVERIFY(window.document()->load(snapshot()).ok);
        window.session()->connectToServer(first.url(), {});
        QTRY_VERIFY(window.session()->connected());
        const auto id = window.session()->run(window.document()->snapshot());
        QTRY_COMPARE(first.commands.size(), 1);
        send(first, {{"type", "node_update"}, {"job_id", id}, {"job_seq", 1}, {"node_id", "n"}, {"status", "running"}});
        QTRY_VERIFY(window.scene()->animationActive());
        window.session()->connectToServer(second.url(), {});
        QTRY_VERIFY(window.session()->connected());
        QTRY_VERIFY(second.peer);
        QTRY_VERIFY(!window.scene()->animationActive());
        QCOMPARE(canvasStatus(window), QString());
        QVERIFY(queued(*window.session(), id).isEmpty());
        QVERIFY(second.commands.isEmpty());
    }
};

QTEST_MAIN(RunReconnectTest)
#include "RunReconnectTest.moc"
