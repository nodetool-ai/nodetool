#include "ai/WorkflowGeneration.h"
#include "ai/GenerationTransport.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTest>
#include <QWebSocketServer>

class WorkflowGenerationTest : public QObject {
    Q_OBJECT
private slots:
    void lifecycle() {
        QWebSocketServer server("workflow-fixture", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QWebSocket* peer = nullptr;
        QList<QJsonObject> frames;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection(); peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object(); frames.append(frame);
                if (frame.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
            });
        });
        nt::ai::GenerationTransport transport;
        auto url = server.serverUrl(); url.setScheme("http"); transport.configure(url); transport.open();
        QTRY_VERIFY(transport.ready());
        nt::ai::WorkflowGeneration runner(&transport);
        const QJsonObject workflow{{"id", "wf"}, {"name", "Fixture"}, {"graph", QJsonObject{
            {"nodes", QJsonArray{QJsonObject{{"id", "out"}}, QJsonObject{{"id", "skip"}, {"ui_properties", QJsonObject{{"bypassed", true}}}}}},
            {"edges", QJsonArray{QJsonObject{{"source", "skip"}, {"target", "out"}}}}}}};
        const QJsonObject clip{{"id", "clip"}, {"workflowId", "wf"}, {"selectedOutputNodeId", "out"},
                               {"paramOverrides", QJsonObject{{"prompt", "before"}}}, {"dependencyHash", "hash"}};
        QVERIFY(runner.prepare("seq", "job", workflow, clip));
        const auto frozen = runner.context();
        QVERIFY(runner.start()); QVERIFY(!runner.start());
        QTRY_COMPARE(frames.size(), 2);
        QCOMPARE(frames[1].value("command").toString(), QString("run_job"));
        const auto data = frames[1].value("data").toObject();
        QCOMPARE(data.value("graph").toObject().value("nodes").toArray().size(), 1);
        QCOMPARE(data.value("graph").toObject().value("edges").toArray().size(), 0);
        QCOMPARE(data.value("params").toObject().value("prompt").toString(), QString("before"));
        QSignalSpy candidates(&runner, &nt::ai::WorkflowGeneration::candidate);
        peer->sendTextMessage(R"({"type":"output_update","job_id":"other","node_id":"out","value":{"asset_id":"wrong"}})");
        peer->sendTextMessage(R"({"type":"output_update","job_id":"job","node_id":"out","value":{"asset_id":"right"}})");
        peer->sendTextMessage(R"({"type":"job_update","job_id":"job","status":"completed"})");
        QTRY_COMPARE(candidates.size(), 1);
        QCOMPARE(candidates[0][0].toJsonObject(), frozen);
        QCOMPARE(candidates[0][1].toString(), QString("right"));
        QSignalSpy duplicate(&transport, &nt::ai::GenerationTransport::message);
        peer->sendTextMessage(R"({"type":"job_update","job_id":"job","status":"completed"})");
        QTRY_COMPARE(duplicate.size(), 1);
        QCOMPARE(candidates.size(), 1);
        nt::ai::WorkflowGeneration recovered(&transport);
        QVERIFY(recovered.recover(frozen));
        QTRY_COMPARE(frames.size(), 3);
        QCOMPARE(frames[2].value("command").toString(), QString("reconnect_job"));
        QSignalSpy replay(&recovered, &nt::ai::WorkflowGeneration::candidate);
        peer->sendTextMessage(R"({"type":"output_update","job_id":"job","node_id":"out","value":{"asset_id":"recovered"}})");
        peer->sendTextMessage(R"({"type":"job_update","job_id":"job","status":"completed"})");
        QTRY_COMPARE(replay.size(), 1);
        QCOMPARE(replay[0][1].toString(), QString("recovered"));
    }
    void persistedOutputs() {
        nt::ai::WorkflowGeneration runner(nullptr);
        const QJsonObject selected{{"id", "out"}, {"type", "nodetool.output.Output"}, {"data", QJsonObject{{"name", "movie"}}}};
        const QJsonObject other{{"id", "other"}, {"type", "nodetool.output.Output"}, {"data", QJsonObject{{"name", "other"}}}};
        const QJsonObject workflow{{"id", "wf"}, {"graph", QJsonObject{{"nodes", QJsonArray{selected, other}}, {"edges", QJsonArray{}}}}};
        const QJsonObject clip{{"id", "clip"}, {"workflowId", "wf"}, {"selectedOutputNodeId", "out"}};
        QVERIFY(runner.prepare("seq", "job", workflow, clip));
        const auto context = runner.context();
        QCOMPARE(context.value("outputKey").toString(), QString("movie"));
        const QJsonObject job{{"id", "job"}, {"workflow_id", "wf"}, {"status", "completed"},
                              {"outputs", QJsonObject{{"movie", QJsonArray{QJsonObject{{"asset_id", "old"}}, QJsonObject{{"asset_id", "last"}}}},
                                                      {"other", QJsonArray{QJsonObject{{"asset_id", "wrong"}}}}}}};
        auto wrong = job; wrong.insert("id", "other-job");
        QVERIFY(!runner.applyJobSnapshot(context, wrong));
        QSignalSpy candidates(&runner, &nt::ai::WorkflowGeneration::candidate);
        QVERIFY(runner.applyJobSnapshot(context, job));
        QCOMPARE(candidates.size(), 1);
        QCOMPARE(candidates[0][1].toString(), QString("last"));
        QVERIFY(!runner.applyJobSnapshot(context, job));
        auto duplicate = other; duplicate.insert("data", QJsonObject{{"name", "movie"}});
        const QJsonObject ambiguous{{"id", "wf"}, {"graph", QJsonObject{{"nodes", QJsonArray{selected, duplicate}}, {"edges", QJsonArray{}}}}};
        runner.reset(); QVERIFY(runner.prepare("seq", "job", ambiguous, clip));
        QVERIFY(!runner.context().contains("outputKey"));
        QVERIFY(!runner.applyJobSnapshot(runner.context(), job));
        const auto pending = runner.context();
        runner.reset();
        QVERIFY(!runner.applyJobSnapshot(QJsonObject{{"jobId", "job"}, {"sequenceId", "seq"}, {"clipId", "clip"}, {"workflowId", "wf"}}, job));
        auto omitted = job; omitted.insert("outputs", QJsonObject{{"omitted", true}});
        QVERIFY(!runner.applyJobSnapshot(pending, omitted));
    }
    void richScalarIsNotAnAsset() {
        nt::ai::WorkflowGeneration runner(nullptr);
        const QJsonObject workflow{{"id", "wf"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
        const QJsonObject clip{{"id", "clip"}, {"workflowId", "wf"}, {"selectedOutputNodeId", "out"}};
        QVERIFY(runner.prepare("seq", "job", workflow, clip));
        QSignalSpy candidates(&runner, &nt::ai::WorkflowGeneration::candidate);
        runner.acceptMessage({{"type", "output_update"}, {"job_id", "job"}, {"node_id", "out"}, {"output_type", "video"}, {"value", "https://example.invalid/movie"}});
        runner.acceptMessage({{"type", "job_update"}, {"job_id", "job"}, {"status", "completed"}});
        QCOMPARE(candidates.size(), 0);
        QCOMPARE(runner.status(), QString("failed"));
        runner.reset();
        QVERIFY(runner.context().isEmpty());
    }
    void cancellation() {
        nt::ai::WorkflowGeneration runner(nullptr);
        const QJsonObject workflow{{"id", "wf"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
        const QJsonObject clip{{"id", "clip"}, {"workflowId", "wf"}, {"selectedOutputNodeId", "out"}};
        QVERIFY(runner.prepare("seq", "job", workflow, clip));
        QCOMPARE(runner.beginCancel().value("id").toString(), QString("job"));
        QSignalSpy candidates(&runner, &nt::ai::WorkflowGeneration::candidate);
        runner.acceptMessage({{"type", "output_update"}, {"job_id", "job"}, {"node_id", "out"}, {"value", "late"}});
        runner.acceptMessage({{"type", "job_update"}, {"job_id", "job"}, {"status", "completed"}});
        QVERIFY(runner.finishCancel(true, {{"status", "cancelled"}}));
        QCOMPARE(runner.status(), QString("cancelled"));
        runner.acceptMessage({{"type", "output_update"}, {"job_id", "job"}, {"node_id", "out"}, {"value", "late"}});
        runner.acceptMessage({{"type", "job_update"}, {"job_id", "job"}, {"status", "completed"}});
        QCOMPARE(candidates.size(), 0);
    }
};
QTEST_GUILESS_MAIN(WorkflowGenerationTest)
#include "tst_workflowgeneration.moc"
