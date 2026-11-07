// F27 reconnect and live-running states. The web contracts are resumeInFlightJobs, handleJobResumed,
// settleLostRun and isJobHalted in web/src/stores/workflowUpdates.ts.
#include "FakeRunServer.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "server/WorkflowSession.h"
#include "ui/EditorWindow.h"
#include <QtTest>
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
}

class RunReconnectTest final : public QObject {
    Q_OBJECT
private slots:
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
        QVERIFY(!window.scene()->animationActive());
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
        QTest::qWait(50);
        QVERIFY(!window.scene()->animationActive());
        QCOMPARE(canvasStatus(window), QString());
        QVERIFY(queued(*window.session(), id).isEmpty());
        QVERIFY(second.commands.isEmpty());
    }
};

QTEST_MAIN(RunReconnectTest)
#include "RunReconnectTest.moc"
