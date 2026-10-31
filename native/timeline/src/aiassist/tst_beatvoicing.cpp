#include "aiassist/BeatVoicing.h"
#include "aiassist/TranscriptBeats.h"
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "../../tests/TestHttpServer.h"
#include <atomic>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QFile>
#include <QFileInfo>
#include <QWebSocketServer>
#include <QtTest>
class BeatVoicingStateTest : public QObject {
    Q_OBJECT
private:
    static nt::ParseResult fixture() {
        return nt::parseTimelineJson(R"({"id":"timeline","tracks":[{"id":"audio","type":"audio","index":0}],"clips":[{"id":"beat","trackId":"audio","name":"Hello","startMs":0,"durationMs":3000,"mediaType":"audio","sourceType":"generated","bindingKind":"text-to-audio","prompt":"Hello","status":"draft","locked":false,"versions":[]},{"id":"music","trackId":"audio","name":"Music","startMs":10000,"durationMs":1000,"mediaType":"audio","sourceType":"imported","status":"generated"}],"markers":[]})");
    }
    static void stage(BeatVoicing& controller, TimelineModel& model) {
        controller.setTimeline(&model);
        controller.m_generation = model.documentGeneration();
        controller.m_lineId = "beat";
        controller.m_observedClip = model.clipsJson().at(0).toObject();
        controller.m_candidate = {{"clipId", "beat"}, {"assetId", "generated-asset"}, {"durationMs", 1000}, {"versionId", "version"},
            {"createdAt", "2026-01-01T00:00:00.000Z"}, {"promptSnapshot", "Hello"}, {"words", QJsonArray{QJsonObject{{"word", "Hello"}, {"startMs", 0}, {"endMs", 1000}}}}};
        nt::Clip media;
        media.raw = controller.m_observedClip;
        media.raw.insert("currentAssetId", "generated-asset");
        media.audioPath = QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4").toStdString();
        controller.m_candidateMedia = media;
        controller.m_state = "completed";
    }
private slots:
    void workerResolvesAudioBeforeExplicitAcceptance() {
        const auto parsed = fixture(); QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(*parsed.timeline);
        QTemporaryDir folder; QVERIFY(folder.isValid());
        const auto audioPath = folder.filePath("resolved.wav");
        QFile audio(audioPath); QVERIFY(audio.open(QIODevice::WriteOnly)); QCOMPARE(audio.write("fixture audio"), qint64(13)); audio.close();
        TestHttpServer server;
        server.setJson([](const QByteArray&, const QUrl&) {
            const QJsonObject asset{{"id", "generated-asset"}, {"duration", 1.25}, {"content_type", "audio/wav"}};
            const QJsonObject response{{"result", QJsonObject{{"data", asset}}}};
            return QJsonDocument(response).toJson();
        });
        std::atomic<int> resolutions{0};
        BeatVoicing controller;
        controller.setTimeline(&model);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", folder.filePath("server/user/timelines")};
        controller.m_generation = model.documentGeneration();
        controller.m_lineId = "beat";
        controller.m_observedClip = model.clipsJson().at(0).toObject();
        controller.m_assetId = "generated-asset";
        controller.m_generationRequestId = "resolved-request";
        controller.m_plan.scriptId = "timeline";
        controller.m_plan.line = {{"id", "beat"}, {"text", "Hello"}};
        controller.m_state = "transcribing";
        controller.setMediaResolver([audioPath, &resolutions](nt::server::ServerClient&, const QString&, const QJsonObject& asset, const QJsonObject& raw, nt::assets::MediaProtection& protection, quint64 generation) {
            ++resolutions;
            nt::Clip media;
            media.mediaType = nt::MediaType::Audio;
            media.raw = raw;
            media.audioPath = audioPath.toStdString();
            protection.protect(audioPath, generation);
            return asset.value("id").toString() == "generated-asset" ? media : nt::Clip{};
        });
        controller.persist({});
        QTRY_VERIFY(controller.hasCandidate());
        QTRY_VERIFY(!controller.m_worker);
        QCOMPARE(resolutions.load(), 1);
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(model.timeline().clips.at(0).audioPath.empty());
        QVERIFY(controller.apply());
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(QString::fromStdString(model.timeline().clips.at(0).audioPath), audioPath);
        QCOMPARE(model.clipsJson().at(0).toObject().value("currentAssetId").toString(), QString("generated-asset"));
        model.undoStack()->undo();
        QVERIFY(model.timeline().clips.at(0).audioPath.empty());
        model.undoStack()->redo();
        QCOMPARE(QString::fromStdString(model.timeline().clips.at(0).audioPath), audioPath);
    }
    void candidateKeepsUnrelatedEditsAndOneUndo() {
        const auto parsed = fixture(); QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel model; model.setTimeline(*parsed.timeline);
        BeatVoicing controller; stage(controller, model);
        QVERIFY(controller.hasCandidate());
        QVERIFY(model.moveClip("music", 20000));
        const auto before = model.timeline().raw;
        const auto count = model.undoStack()->count();
        QVERIFY(controller.apply());
        QCOMPARE(model.undoStack()->count(), count + 1);
        QCOMPARE(model.clipsJson().at(1).toObject().value("startMs").toInt(), 20000);
        QCOMPARE(model.clipsJson().at(0).toObject().value("currentAssetId").toString(), QString("generated-asset"));
        QCOMPARE(model.clipsJson().at(0).toObject().value("versions").toArray().size(), 1);
        QVERIFY(!controller.hasCandidate());
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, before);
        model.undoStack()->redo();
        QCOMPARE(model.clipsJson().at(0).toObject().value("currentAssetId").toString(), QString("generated-asset"));
    }
    void changedTargetAndReplacementRefuseCandidate() {
        const auto parsed = fixture(); QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(*parsed.timeline);
        BeatVoicing controller; stage(controller, model);
        QVERIFY(model.moveClip("beat", 500));
        const auto changed = model.timeline().raw;
        QVERIFY(!controller.apply());
        QCOMPARE(model.timeline().raw, changed);
        stage(controller, model);
        model.setTimeline(*parsed.timeline);
        QVERIFY(!controller.hasCandidate());
        QVERIFY(!controller.apply());
    }
    void recoveryNeverRegenerates() {
        const auto parsed = fixture(); QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(*parsed.timeline);
        QTemporaryDir folder;
        QWebSocketServer server("beat-recovery", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        auto base = server.serverUrl(); base.setScheme("http");
        QSignalSpy connections(&server, &QWebSocketServer::newConnection);
        QPointer<QWebSocket> peer;
        QStringList frames;
        connect(&server, &QWebSocketServer::newConnection, &server, [&server, &peer, &frames] {
            peer = server.nextPendingConnection();
            if (!peer) { return; }
            peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, &server, [&frames](const QString& frame) { frames.append(frame); });
        });
        BeatVoicing initial; stage(initial, model);
        initial.m_target = nt::server::SaveTarget{base, {}, "timeline", folder.path()};
        initial.m_generationRequestId = "original-beat-request";
        initial.m_plan.scriptId = "timeline";
        initial.m_plan.line = {{"id", "beat"}, {"text", "Hello"}};
        initial.m_assetId.clear();
        QVERIFY(initial.checkpoint());
        BeatVoicing reopened; reopened.setTimeline(&model); reopened.m_target = initial.m_target;
        reopened.recover("beat");
        QTRY_COMPARE(connections.size(), 1);
        QVERIFY(peer);
        QTRY_COMPARE(frames.size(), 1);
        peer->sendTextMessage(QStringLiteral(R"({"message":"Mode set to text"})"));
        QTRY_COMPARE(frames.size(), 2);
        const auto lookup = QJsonDocument::fromJson(frames.at(1).toUtf8()).object();
        QCOMPARE(lookup.value("command").toString(), QString("lookup_generations"));
        QCOMPARE(lookup.value("data").toObject().value("request_ids").toArray().at(0).toString(), QString("original-beat-request"));
        reopened.cancel();
        QTRY_COMPARE(frames.size(), 3);
        const auto cancel = QJsonDocument::fromJson(frames.at(2).toUtf8()).object();
        QCOMPARE(cancel.value("command").toString(), QString("cancel_generation"));
        QVERIFY(QFile::exists(initial.m_checkpoint));
        QCOMPARE(model.undoStack()->count(), 0);
    }
};
QTEST_GUILESS_MAIN(BeatVoicingStateTest)
#include "tst_beatvoicing.moc"
