#include "aiassist/ScriptVoicing.h"
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>
#include <QWebSocketServer>
class ScriptVoicingStateTest : public QObject {
    Q_OBJECT
private:
    static QJsonObject script() {
        const QJsonObject voice{{"provider", "test"}, {"model", "test"}, {"voice", "test"}};
        const QJsonObject line{{"id", "line"}, {"text", "Hello"}, {"voiceOverride", voice}, {"takes", QJsonArray{}}};
        const QJsonObject section{{"lines", QJsonArray{line}}};
        return {{"id", "script"}, {"document", QJsonObject{{"sections", QJsonArray{section}}}}};
    }
    static QUrl base(const QWebSocketServer& server) { auto url = server.serverUrl(); url.setScheme("http"); return url; }
private slots:
    void failedLedgerSendsNothing() {
        QWebSocketServer server("voice-test", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QSignalSpy connections(&server, &QWebSocketServer::newConnection);
        QTemporaryDir folder;
        QVERIFY(folder.isValid());
        QFile obstruction(folder.filePath("not-a-folder"));
        QVERIFY(obstruction.open(QIODevice::WriteOnly)); obstruction.close();
        TimelineModel timeline;
        ScriptVoicing controller;
        controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{base(server), {}, "timeline", obstruction.fileName()};
        controller.voice(script(), "line");
        QCOMPARE(controller.state(), QString("failed"));
        QVERIFY(controller.error().contains("recovery"));
        QTest::qWait(50);
        QCOMPARE(connections.size(), 0);
        QVERIFY(controller.m_generationResult.isEmpty());
    }
    void ledgerPrecedesSendAndMismatchedResponsesDoNothing() {
        QWebSocketServer server("voice-test", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QSignalSpy connections(&server, &QWebSocketServer::newConnection);
        QPointer<QWebSocket> peer;
        QStringList frames;
        connect(&server, &QWebSocketServer::newConnection, &server, [&server, &peer, &frames]() {
            peer = server.nextPendingConnection();
            if (!peer) { return; }
            peer->setParent(&server);
            connect(peer.data(), &QWebSocket::textMessageReceived, &server, [&frames](const QString& frame) { frames.append(frame); });
        });
        QTemporaryDir folder;
        TimelineModel timeline;
        ScriptVoicing controller;
        controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{base(server), {}, "timeline", folder.path()};
        controller.voice(script(), "line");
        QFile ledger(controller.m_checkpoint);
        QVERIFY(ledger.open(QIODevice::ReadOnly));
        const auto pending = QJsonDocument::fromJson(ledger.readAll()).object();
        QCOMPARE(pending.value("requestId").toString(), controller.m_generationRequestId);
        QVERIFY(pending.value("assetId").toString().isEmpty());
        ledger.close();
        QTRY_COMPARE(connections.size(), 1);
        QVERIFY(peer);
        QTRY_COMPARE(frames.size(), 1);
        peer->sendTextMessage(QStringLiteral(R"({"message":"Mode set to text"})"));
        QTRY_COMPARE(frames.size(), 2);
        const auto generated = QJsonDocument::fromJson(frames.at(1).toUtf8()).object();
        QCOMPARE(generated.value("command").toString(), QString("generate_media"));
        QCOMPARE(generated.value("request_id").toString(), pending.value("requestId").toString());
        controller.receive({{"request_id", "wrong"}, {"result", QJsonObject{{"asset_ids", QJsonArray{"wrong-asset"}}}}});
        QCOMPARE(controller.state(), QString("generating"));
        QVERIFY(controller.m_assetId.isEmpty());
        QCOMPARE(frames.size(), 2);
        controller.cancel();
        QTRY_COMPARE(frames.size(), 3);
        const auto cancelled = QJsonDocument::fromJson(frames.at(2).toUtf8()).object();
        QCOMPARE(cancelled.value("command").toString(), QString("cancel_generation"));
        QVERIFY(QFile::exists(controller.m_checkpoint));
        QVERIFY(!controller.busy());
    }
    void recoveryOnlyLooksUpOriginalRequest() {
        QWebSocketServer server("voice-recovery", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QSignalSpy connections(&server, &QWebSocketServer::newConnection);
        QPointer<QWebSocket> peer;
        QStringList frames;
        connect(&server, &QWebSocketServer::newConnection, &server, [&server, &peer, &frames]() {
            peer = server.nextPendingConnection();
            if (!peer) { return; }
            peer->setParent(&server);
            connect(peer.data(), &QWebSocket::textMessageReceived, &server, [&frames](const QString& frame) { frames.append(frame); });
        });
        QTemporaryDir folder;
        TimelineModel timeline;
        ScriptVoicing original;
        original.setTimeline(&timeline);
        original.m_target = nt::server::SaveTarget{base(server), {}, "timeline", folder.path()};
        original.m_plan = nt::aiassist::planScriptVoice(script(), "line");
        original.m_lineId = "line";
        original.m_generationRequestId = "original-request";
        QVERIFY(original.checkpoint());
        ScriptVoicing reopened;
        reopened.setTimeline(&timeline);
        reopened.m_target = original.m_target;
        reopened.recover(script(), "line");
        QTRY_COMPARE(connections.size(), 1);
        QVERIFY(peer);
        QTRY_COMPARE(frames.size(), 1);
        peer->sendTextMessage(QStringLiteral(R"({"message":"Mode set to text"})"));
        QTRY_COMPARE(frames.size(), 2);
        const auto lookup = QJsonDocument::fromJson(frames.at(1).toUtf8()).object();
        QCOMPARE(lookup.value("command").toString(), QString("lookup_generations"));
        QCOMPARE(lookup.value("data").toObject().value("request_ids").toArray().at(0).toString(), QString("original-request"));
        QCOMPARE(reopened.state(), QString("recovering"));
        reopened.receive({{"request_id", reopened.m_requestId}, {"result", QJsonObject{{"generations", QJsonArray{QJsonObject{{"request_id", "original-request"}, {"status", "failed"}, {"error", "fixture failure"}}}}}}});
        QCOMPARE(reopened.state(), QString("failed"));
        QVERIFY(!QFile::exists(original.m_checkpoint));
        QCOMPARE(frames.size(), 2);
    }
    void takeAppendIsIdempotentAfterSaveAcknowledgmentLoss() {
        auto doc = script();
        const auto plan = nt::aiassist::planScriptVoice(doc, "line");
        const auto take = nt::aiassist::scriptVoiceTake(plan, "asset", 1000, {}, "take_original-request", "date", {});
        doc = nt::aiassist::appendScriptTake(doc, "line", take);
        QCOMPARE(nt::aiassist::appendScriptTake(doc, "line", take), doc);
    }
};
QTEST_GUILESS_MAIN(ScriptVoicingStateTest)
#include "tst_scriptvoicingcontroller.moc"
