#include "aiassist/ShotWorkflow.h"
#include "aiassist/ShotPlan.h"
#include "model/TimelineJson.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QWebSocketServer>
#include <QHostAddress>
#include <QSemaphore>
#include <QScopeGuard>
#include <QtTest>
#include <atomic>
class ShotWorkflowTest : public QObject {
    Q_OBJECT
    static QJsonObject board() {
        return {{"id", "board"}, {"updatedAt", "v1"}, {"document", QJsonObject{{"aspectRatio", "16:9"}, {"shots", QJsonArray{QJsonObject{{"type", "shot"}, {"id", "shot"}, {"index", 0}, {"action", "A runner"}, {"render_mode", "direct"},
            {"clip", QJsonObject{{"type", "video"}, {"asset_id", "original"}, {"duration", 3}}}}}}}}};
    }
    static nt::Timeline timeline() {
        QJsonArray clips;
        for (const auto& type : {QString("video"), QString("audio")}) {
            clips.append(QJsonObject{{"id", type}, {"trackId", type}, {"mediaType", type}, {"startMs", 100}, {"durationMs", 3000}, {"currentAssetId", "original"}, {"linkId", "pair"}, {"storyboardBoardId", "board"}, {"storyboardShotId", "shot"}});
        }
        clips.append(QJsonObject{{"id", "voice"}, {"trackId", "audio"}, {"mediaType", "audio"}, {"startMs", 100}, {"durationMs", 1000}, {"currentAssetId", "speech"}, {"scriptLineId", "line"}, {"storyboardBoardId", "board"}, {"storyboardShotId", "shot"}});
        const auto parsed = nt::parseTimelineJson(QJsonDocument(QJsonObject{{"id", "sequence"}, {"name", "Sequence"}, {"tracks", QJsonArray{QJsonObject{{"id", "video"}, {"type", "video"}}, QJsonObject{{"id", "audio"}, {"type", "audio"}}}}, {"clips", clips}}).toJson());
        return *parsed.timeline;
    }
private slots:
    void renderCandidateThenExplicitAcceptance() {
        QTemporaryDir folder; QVERIFY(folder.isValid());
        QWebSocketServer server("shot test", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        TimelineModel model; model.setTimeline(timeline());
        ShotWorkflow workflow; workflow.setTimeline(&model);
        workflow.m_target = nt::server::SaveTarget{QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {}, "sequence", folder.path(), {}};
        std::atomic<int> writes{0}; bool journalBeforeSend = false;
        workflow.setCall([&writes](bool write, const QString& name, const QJsonObject& input) {
            if (!write && name == "storyboards.get") { return nt::server::QueryResult{board(), {}}; }
            if (!write && name == "assets.get") { return nt::server::QueryResult{QJsonObject{{"id", input.value("id")}, {"duration", 2}}, {}}; }
            if (write && name == "storyboards.update") {
                const int version = ++writes;
                if (input.value("baseUpdatedAt").toString() != (version == 1 ? "v1" : "v2")) { return nt::server::QueryResult{{}, {"Wrong CAS revision", "CONFLICT", {}, 409}}; }
                auto response = board(); response.insert("document", input.value("document")); response.insert("updatedAt", version == 1 ? "v2" : "v3");
                return nt::server::QueryResult{response, {}};
            }
            return nt::server::QueryResult{{}, {"Unexpected request", "BAD_REQUEST", {}, 400}};
        });
        QFile media(folder.filePath("candidate.bin")); QVERIFY(media.open(QIODevice::WriteOnly)); media.write("fixture"); media.close();
        workflow.setMediaResolver([path = media.fileName()](nt::server::ServerClient&, const QString&, const QJsonObject&, const QJsonObject& raw, nt::assets::MediaProtection& protection, quint64 generation) {
            nt::Clip result; result.raw = raw;
            result.mediaType = raw.value("mediaType") == "audio" ? nt::MediaType::Audio : nt::MediaType::Video;
            if (result.mediaType == nt::MediaType::Audio) { result.audioPath = path.toStdString(); }
            else { result.mediaPath = path.toStdString(); }
            protection.protect(path, generation); return result;
        });
        connect(&server, &QWebSocketServer::newConnection, &workflow, [&] {
            auto* peer = server.nextPendingConnection(); peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, &workflow, [&, peer](const QString& text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object();
                if (frame.value("command") == "set_mode") { peer->sendTextMessage("{\"message\":\"Mode set to text\"}"); }
                else if (frame.value("command") == "generate_media") {
                    journalBeforeSend = QFileInfo::exists(workflow.m_checkpoint);
                    peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"request_id", frame.value("request_id")}, {"result", QJsonObject{{"asset_ids", QJsonArray{"candidate"}}}}}).toJson(QJsonDocument::Compact)));
                }
            });
        });
        QJsonObject reviewedModel{{"id", "model"}, {"provider", "provider"}};
        reviewedModel.insert("reviewedRequest", nt::aiassist::planShotRender(board(), "shot", "video", reviewedModel).request);
        workflow.render(board(), "shot", "video", reviewedModel);
        QTRY_COMPARE_WITH_TIMEOUT(workflow.state(), QString("completed"), 10000);
        QTRY_VERIFY(!workflow.busy());
        QVERIFY(journalBeforeSend);
        QCOMPARE(writes.load(), 1);
        QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(model.clipsJson().at(0).toObject().value("currentAssetId").toString(), QString("original"));
        const auto savedBoard = QJsonObject::fromVariantMap(workflow.board());
        const auto shot = savedBoard.value("document").toObject().value("shots").toArray().at(0).toObject();
        QCOMPARE(shot.value("clip").toObject().value("asset_id").toString(), QString("original"));
        QCOMPARE(shot.value("clip_versions").toArray().size(), 2);
        QVERIFY(!shot.value("clip_model").toObject().contains("reviewedRequest"));
        workflow.accept(savedBoard, "shot", "video", 1);
        QTRY_COMPARE_WITH_TIMEOUT(workflow.state(), QString("completed"), 10000);
        QTRY_VERIFY(!workflow.busy());
        QCOMPARE(writes.load(), 2);
        QCOMPARE(model.undoStack()->count(), 1);
        const auto clips = model.clipsJson();
        QCOMPARE(clips.at(0).toObject().value("currentAssetId").toString(), QString("candidate"));
        QCOMPARE(clips.at(1).toObject().value("currentAssetId").toString(), QString("candidate"));
        QCOMPARE(clips.at(2).toObject().value("currentAssetId").toString(), QString("speech"));
        QCOMPARE(clips.at(0).toObject().value("durationMs").toDouble(), 2000.0);
        QVERIFY(!model.timeline().clips.at(0).mediaPath.empty());
        QVERIFY(!model.timeline().clips.at(1).audioPath.empty());
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson().at(0).toObject().value("currentAssetId").toString(), QString("original"));
    }
    void cancelledJournalSurvivesAnotherShot_data() {
        QTest::addColumn<int>("switchDocument");
        QTest::newRow("same-document") << 0;
        QTest::newRow("replaced-document") << 1;
        QTest::newRow("different-model") << 2;
    }
    void cancelledJournalSurvivesAnotherShot() {
        QFETCH(int, switchDocument);
        QTemporaryDir folder; QVERIFY(folder.isValid());
        QWebSocketServer server("journal test", QWebSocketServer::NonSecureMode); QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        TimelineModel model; model.setTimeline(timeline()); TimelineModel other; other.setTimeline(timeline());
        ShotWorkflow workflow; workflow.setTimeline(&model);
        workflow.m_target = nt::server::SaveTarget{QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {}, "sequence", folder.path(), {}};
        auto snapshot = board(); auto document = snapshot.value("document").toObject(); auto shotA = document.value("shots").toArray().first().toObject();
        shotA.insert("id", "shot-A"); auto shotB = shotA; shotB.insert("id", "shot-B"); document.insert("shots", QJsonArray{shotA, shotB}); snapshot.insert("document", document);
        workflow.setCall([snapshot](bool, const QString& name, const QJsonObject&) {
            return name == "storyboards.get" ? nt::server::QueryResult{snapshot, {}} : nt::server::QueryResult{{}, {"Unexpected call", "BAD_REQUEST", {}, 400}};
        });
        workflow.m_board = snapshot; workflow.m_shotId = "shot-A"; workflow.m_kind = "video"; workflow.m_requestId = "original-request-A";
        workflow.m_request = nt::aiassist::planShotRender(snapshot, "shot-A", "video", {{"id", "model"}, {"provider", "provider"}}).request;
        workflow.m_requests = QJsonArray{workflow.m_request}; workflow.m_dispatched = true; workflow.m_stopQueue = false; workflow.m_state = "rendering"; workflow.m_generation = model.documentGeneration();
        QVERIFY(workflow.checkpoint()); workflow.cancel();
        const auto originalPath = workflow.m_checkpoint; QFile original(originalPath); QVERIFY(original.open(QIODevice::ReadOnly)); const auto originalBytes = original.readAll(); original.close();
        if (switchDocument == 1) { model.setTimeline(timeline()); }
        else if (switchDocument == 2) { workflow.setTimeline(&other); }
        int submissions = 0; QString recoveredId;
        connect(&server, &QWebSocketServer::newConnection, &workflow, [&] {
            auto* peer = server.nextPendingConnection(); peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, &workflow, [&, peer](const QString& text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object();
                if (frame.value("command") == "set_mode") { peer->sendTextMessage("{\"message\":\"Mode set to text\"}"); }
                else if (frame.value("command") == "generate_media") { ++submissions; }
                else if (frame.value("command") == "lookup_generations") {
                    recoveredId = frame.value("data").toObject().value("request_ids").toArray().first().toString();
                    const QJsonObject generation{{"request_id", recoveredId}, {"status", "cancelled"}, {"error", "Original cancelled"}};
                    peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"request_id", frame.value("request_id")}, {"result", QJsonObject{{"generations", QJsonArray{generation}}}}}).toJson(QJsonDocument::Compact)));
                }
            });
        });
        workflow.render(snapshot, "shot-B", "video", {{"id", "model"}, {"provider", "provider"}});
        QTRY_COMPARE_WITH_TIMEOUT(submissions, 1, 10000); QTRY_VERIFY(workflow.m_worker == nullptr);
        QVERIFY(original.open(QIODevice::ReadOnly)); QCOMPARE(original.readAll(), originalBytes); original.close();
        QVERIFY(workflow.m_checkpoint != originalPath);
        workflow.cancel(); workflow.recover(snapshot, "shot-A", "video");
        QTRY_COMPARE_WITH_TIMEOUT(recoveredId, QString("original-request-A"), 10000);
        QCOMPARE(submissions, 1);
    }
    void recoveryResolvesShotIds_data() {
        QTest::addColumn<QString>("input"); QTest::addColumn<bool>("ambiguous"); QTest::addColumn<bool>("valid");
        QTest::newRow("full") << QString("0123456789abcdef0123456789abcdef") << false << true;
        QTest::newRow("prefix") << QString("0123456789ab") << false << true;
        QTest::newRow("named") << QString("named-shot") << false << true;
        QTest::newRow("ambiguous") << QString("0123456789ab") << true << false;
        QTest::newRow("eleven") << QString("0123456789a") << false << false;
        QTest::newRow("thirteen") << QString("0123456789abc") << false << false;
    }
    void recoveryResolvesShotIds() {
        QFETCH(QString, input); QFETCH(bool, ambiguous); QFETCH(bool, valid);
        QTemporaryDir folder; QVERIFY(folder.isValid()); TimelineModel model; model.setTimeline(timeline());
        ShotWorkflow workflow; workflow.setTimeline(&model); workflow.m_target = nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), {}, "sequence", folder.path(), {}};
        workflow.setCall([](bool, const QString&, const QJsonObject&) { return nt::server::QueryResult{}; });
        auto snapshot = board(); auto document = snapshot.value("document").toObject(); auto shot = document.value("shots").toArray().first().toObject();
        const auto fullId = input == "named-shot" ? input : QString("0123456789abcdef0123456789abcdef"); shot.insert("id", fullId); QJsonArray shots{shot};
        if (ambiguous) { auto duplicate = shot; duplicate.insert("id", "0123456789abffffffffffffffffffff"); shots.append(duplicate); }
        document.insert("shots", shots); snapshot.insert("document", document);
        workflow.m_board = snapshot; workflow.m_shotId = fullId; workflow.m_kind = "video"; workflow.m_requestId = "original-id"; workflow.m_request = {{"prompt", "original"}};
        workflow.m_dispatched = true; workflow.m_stopQueue = true; QVERIFY(workflow.checkpoint()); const auto expectedPath = workflow.m_checkpoint;
        workflow.m_checkpoint.clear(); workflow.recover(snapshot, input, "video");
        if (valid) { QCOMPARE(workflow.m_shotId, fullId); QCOMPARE(workflow.m_checkpoint, expectedPath); QCOMPARE(workflow.m_requestId, QString("original-id")); }
        else { QCOMPARE(workflow.state(), QString("failed")); QVERIFY(workflow.m_checkpoint.isEmpty()); }
    }
    void productionQueue_data() {
        QTest::addColumn<int>("takeCount"); QTest::addColumn<int>("scenario");
        QTest::newRow("one") << 1 << 0;
        QTest::newRow("two") << 2 << 0;
        QTest::newRow("three") << 3 << 0;
        QTest::newRow("partial-failure") << 3 << 1;
        QTest::newRow("cancel-future") << 3 << 2;
        QTest::newRow("restart-original-identity") << 3 << 3;
        QTest::newRow("terminal-error-explicit-retry") << 3 << 4;
    }
    void productionQueue() {
        QFETCH(int, takeCount); QFETCH(int, scenario);
        QTemporaryDir folder; QVERIFY(folder.isValid());
        QWebSocketServer server("queue test", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        TimelineModel timelineModel; timelineModel.setTimeline(timeline());
        auto stored = board(); auto document = stored.value("document").toObject(); auto shot = document.value("shots").toArray().first().toObject();
        shot.insert("production", QJsonObject{{"schema_version", 1}, {"speech_mode", "none"}, {"requested_take_count", takeCount}, {"duration_ms", 5500}, {"local_direction", "Keep the light soft"}});
        document.insert("shots", QJsonArray{shot}); stored.insert("document", document);
        const auto initial = stored;
        std::atomic<int> writes{0}; int submissions = 0; int lookups = 0; QStringList ids; bool recovering = false; bool retrying = false; QString failedId;
        const auto call = [&](bool write, const QString& name, const QJsonObject& input) {
            if (!write && name == "storyboards.get") { return nt::server::QueryResult{stored, {}}; }
            if (!write && name == "assets.get") { return nt::server::QueryResult{QJsonObject{{"id", input.value("id")}, {"duration", 5.5}}, {}}; }
            if (write && name == "storyboards.update") {
                if (input.value("baseUpdatedAt") != stored.value("updatedAt")) { return nt::server::QueryResult{{}, {"Wrong CAS", "CONFLICT", {}, 409}}; }
                stored.insert("document", input.value("document")); stored.insert("updatedAt", QString("revision-%1").arg(++writes)); return nt::server::QueryResult{stored, {}};
            }
            return nt::server::QueryResult{{}, {"Unexpected request", "BAD_REQUEST", {}, 400}};
        };
        const nt::server::SaveTarget target{QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {}, "sequence", folder.path(), {}};
        auto workflow = std::make_unique<ShotWorkflow>(); workflow->setTimeline(&timelineModel); workflow->m_target = target; workflow->setCall(call);
        const auto connectWorkflow = [&] {
            connect(workflow.get(), &ShotWorkflow::saved, workflow.get(), [&] { if (scenario == 2 && writes.load() == 1) { workflow->cancel(); } });
        };
        connectWorkflow();
        connect(&server, &QWebSocketServer::newConnection, &server, [&] {
            auto* peer = server.nextPendingConnection(); peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, &server, [&, peer](const QString& text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object(); const auto command = frame.value("command").toString();
                if (command == "set_mode") { peer->sendTextMessage("{\"message\":\"Mode set to text\"}"); return; }
                if (command == "lookup_generations") {
                    ++lookups;
                    if (scenario == 4) {
                        peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"request_id", frame.value("request_id")}, {"result", QJsonObject{{"generations", QJsonArray{}}}}}).toJson(QJsonDocument::Compact)));
                        return;
                    }
                    const auto original = frame.value("data").toObject().value("request_ids").toArray().first();
                    const QJsonObject generation{{"request_id", original}, {"status", "completed"}, {"asset_ids", QJsonArray{"candidate-2"}}};
                    const QJsonObject result{{"generations", QJsonArray{generation}}};
                    peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"request_id", frame.value("request_id")}, {"result", result}}).toJson(QJsonDocument::Compact))); return;
                }
                if (command != "generate_media") { return; }
                ++submissions; ids.append(frame.value("request_id").toString());
                const auto data = frame.value("data").toObject();
                QCOMPARE(data.value("duration").toDouble(), 5.5);
                QCOMPARE(data.value("prompt").toString(), QString("A runner\n\nKeep the light soft"));
                if (scenario == 3 && submissions == 2 && !recovering) { return; }
                QJsonObject reply{{"type", "rpc_response"}, {"request_id", frame.value("request_id")}};
                if ((scenario == 1 || scenario == 4) && submissions == 2 && !retrying) { failedId = frame.value("request_id").toString(); reply.insert("error", QJsonObject{{"message", "Second take failed"}}); }
                else {
                    if (scenario == 4 && retrying) {
                        const QJsonObject late{{"type", "rpc_response"}, {"request_id", failedId}, {"result", QJsonObject{{"asset_ids", QJsonArray{"late-old-result"}}}}};
                        peer->sendTextMessage(QString::fromUtf8(QJsonDocument(late).toJson(QJsonDocument::Compact)));
                    }
                    reply.insert("result", QJsonObject{{"asset_ids", QJsonArray{QString("candidate-%1").arg(submissions)}}}); }
                peer->sendTextMessage(QString::fromUtf8(QJsonDocument(reply).toJson(QJsonDocument::Compact)));
            });
        });
        QJsonObject selectedModel{{"id", "model"}, {"provider", "provider"}};
        const auto reviewed = nt::aiassist::planShotRender(initial, "shot", "video", selectedModel);
        QVERIFY2(reviewed.error.isEmpty(), qPrintable(reviewed.error)); selectedModel.insert("reviewedRequests", reviewed.requests);
        workflow->render(initial, "shot", "video", selectedModel);
        if (scenario == 4) {
            QTRY_COMPARE_WITH_TIMEOUT(workflow->state(), QString("failed"), 10000); QTRY_VERIFY(workflow->m_worker == nullptr);
            QCOMPARE(submissions, 2); QCOMPARE(writes.load(), 1);
            workflow->recover(stored, "shot", "video");
            QTRY_COMPARE_WITH_TIMEOUT(workflow->state(), QString("failed"), 1000);
            QCOMPARE(lookups, 0); QCOMPARE(submissions, 2);
            retrying = true;
            auto retryDocument = stored.value("document").toObject(); auto retryShot = retryDocument.value("shots").toArray().first().toObject();
            auto production = retryShot.value("production").toObject(); production.insert("requested_take_count", 1); retryShot.insert("production", production);
            retryDocument.insert("shots", QJsonArray{retryShot}); stored.insert("document", retryDocument);
            selectedModel.remove("reviewedRequests"); selectedModel.insert("reviewedRequests", nt::aiassist::planShotRender(stored, "shot", "video", selectedModel).requests);
            workflow->render(stored, "shot", "video", selectedModel);
            QTRY_COMPARE_WITH_TIMEOUT(workflow->state(), QString("completed"), 10000);
            QCOMPARE(submissions, 3); QVERIFY(ids.last() != failedId);
        } else if (scenario == 3) {
            QTRY_COMPARE_WITH_TIMEOUT(submissions, 2, 10000); QTRY_VERIFY(workflow->m_worker == nullptr);
            const auto secondId = ids.at(1); workflow.reset(); recovering = true;
            workflow = std::make_unique<ShotWorkflow>(); workflow->setTimeline(&timelineModel); workflow->m_target = target; workflow->setCall(call); connectWorkflow();
            workflow->recover(stored, "shot", "video");
            QTRY_COMPARE_WITH_TIMEOUT(workflow->state(), QString("completed"), 10000);
            QCOMPARE(ids.count(secondId), 1); QVERIFY(lookups >= 1);
        } else { QTRY_COMPARE_WITH_TIMEOUT(workflow->state(), scenario == 1 ? QString("failed") : scenario == 2 ? QString("cancelled") : QString("completed"), 10000); }
        QTRY_VERIFY(workflow->m_worker == nullptr);
        const auto savedShot = stored.value("document").toObject().value("shots").toArray().first().toObject();
        const auto versions = savedShot.value("clip_versions").toArray();
        const int expected = scenario == 4 ? 2 : scenario == 1 || scenario == 2 ? 1 : takeCount;
        QCOMPARE(writes.load(), expected); QCOMPARE(versions.size(), expected + 1);
        QCOMPARE(submissions, scenario == 1 ? 2 : scenario == 2 ? 1 : takeCount);
        QCOMPARE(savedShot.value("clip").toObject().value("asset_id").toString(), QString("original"));
        QSet<QString> candidateIds;
        for (qsizetype index = 1; index < versions.size(); ++index) {
            const auto candidate = versions.at(index).toObject(); const auto snapshot = candidate.value("productionSnapshot").toObject();
            QCOMPARE(snapshot.value("requestedDurationMs").toInt(), 5500); QCOMPARE(snapshot.value("variationIndex").toInt(), scenario == 4 && index == 2 ? 1 : static_cast<int>(index));
            QVERIFY(candidate.value("asset_id") != "late-old-result"); QCOMPARE(candidate.value("requestId"), snapshot.value("requestId")); candidateIds.insert(candidate.value("candidateId").toString());
        }
        if (scenario == 2) { QCOMPARE(QDir(folder.path()).entryList({"shot-render-*.json"}, QDir::Files).size(), 0); }
        QCOMPARE(candidateIds.size(), expected); QVERIFY(!savedShot.value("clip_model").toObject().contains("reviewedRequests"));
        QCOMPARE(timelineModel.undoStack()->count(), 0);
    }
    void reviewedRequestRejectsChangedContext_data() {
        QTest::addColumn<bool>("changedDuration"); QTest::addColumn<bool>("changedCount");
        QTest::newRow("linked-script-duration") << true << false;
        QTest::newRow("entity-reference") << false << false;
        QTest::newRow("approved-collection-count") << false << true;
    }
    void reviewedRequestRejectsChangedContext() {
        QFETCH(bool, changedDuration); QFETCH(bool, changedCount);
        QTemporaryDir folder; QVERIFY(folder.isValid());
        QWebSocketServer server("review test", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        TimelineModel timelineModel; timelineModel.setTimeline(timeline());
        ShotWorkflow workflow; workflow.setTimeline(&timelineModel);
        workflow.m_target = nt::server::SaveTarget{QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {}, "sequence", folder.path(), {}};
        auto snapshot = board(); auto document = snapshot.value("document").toObject();
        auto shot = document.value("shots").toArray().first().toObject();
        shot.insert("render_mode", "reference"); shot.insert("script_line_ids", QJsonArray{"line"});
        if (changedCount) { shot.insert("production", QJsonObject{{"requested_take_count", 3}}); }
        document.insert("shots", QJsonArray{shot}); document.insert("entityIds", QJsonArray{"entity"});
        document.insert("screenplay", QJsonObject{{"script_id", "script"}}); snapshot.insert("document", document);
        const QJsonObject marker{{"kind", "style"}, {"name", "Look"}, {"descriptor", "Ink"}, {"reference_asset_id", "approved-picture"}};
        const QJsonObject entityAsset{{"id", "entity"}, {"metadata", QJsonObject{{"nodetool_entity", marker}}}};
        const QJsonArray approvedAssets{entityAsset};
        QJsonObject selectedModel{{"id", "model"}, {"provider", "provider"}, {"supported_tasks", QJsonArray{"reference_to_video"}}};
        auto approved = nt::aiassist::planShotRender(snapshot, "shot", "video", selectedModel, nt::aiassist::shotEntityLibrary(approvedAssets)).request;
        approved.insert("duration", 2);
        if (changedCount) { selectedModel.insert("reviewedRequests", QJsonArray{approved, approved}); }
        else { selectedModel.insert("reviewedRequest", approved); }
        auto changedMarker = marker; changedMarker.insert("reference_asset_id", "changed-picture");
        auto changedAsset = entityAsset; changedAsset.insert("metadata", QJsonObject{{"nodetool_entity", changedMarker}});
        const QJsonArray currentAssets = changedDuration || changedCount ? approvedAssets : QJsonArray{changedAsset};
        const QJsonObject take{{"id", "take"}, {"assetId", "speech"}, {"durationMs", changedDuration ? 9000 : 2000}};
        const QJsonObject line{{"id", "line"}, {"currentTakeId", "take"}, {"takes", QJsonArray{take}}};
        const QJsonObject section{{"lines", QJsonArray{line}}};
        const QJsonObject script{{"document", QJsonObject{{"sections", QJsonArray{section}}}}};
        workflow.setCall([snapshot, currentAssets, script](bool write, const QString& name, const QJsonObject&) {
            if (!write && name == "storyboards.get") { return nt::server::QueryResult{snapshot, {}}; }
            if (!write && name == "assets.search") { return nt::server::QueryResult{QJsonObject{{"assets", currentAssets}}, {}}; }
            if (!write && name == "scripts.get") { return nt::server::QueryResult{script, {}}; }
            return nt::server::QueryResult{{}, {"Unexpected request", "BAD_REQUEST", {}, 400}};
        });
        int submissions = 0;
        connect(&server, &QWebSocketServer::newConnection, &workflow, [&] {
            auto* peer = server.nextPendingConnection(); peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, &workflow, [&, peer](const QString& text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object();
                if (frame.value("command") == "set_mode") { peer->sendTextMessage("{\"message\":\"Mode set to text\"}"); }
                else if (frame.value("command") == "generate_media") {
                    ++submissions;
                    peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"request_id", frame.value("request_id")}, {"error", QJsonObject{{"message", "Unexpected generation"}}}}).toJson(QJsonDocument::Compact)));
                }
            });
        });
        workflow.render(snapshot, "shot", "video", selectedModel);
        QTRY_COMPARE_WITH_TIMEOUT(workflow.state(), QString("failed"), 10000);
        QTRY_VERIFY(!workflow.busy());
        QCOMPARE(submissions, 0);
        QVERIFY(workflow.error().contains("Review"));
        QCOMPARE(QDir(folder.path()).entryList({"shot-render-*.json"}, QDir::Files).size(), 0);
        const auto persistedShot = QJsonObject::fromVariantMap(workflow.board()).value("document").toObject().value("shots").toArray().first().toObject();
        QVERIFY(!persistedShot.value("clip_model").toObject().contains("reviewedRequest"));
        QVERIFY(!persistedShot.value("clip_model").toObject().contains("reviewedRequests"));
    }
    void acceptanceRejectsInterveningLinkedClipEdits_data() {
        QTest::addColumn<bool>("delayCas");
        QTest::addColumn<bool>("addLinkedClip");
        QTest::newRow("asset-during-resolution") << false << false;
        QTest::newRow("link-during-resolution") << false << true;
        QTest::newRow("asset-during-cas") << true << false;
        QTest::newRow("link-during-cas") << true << true;
    }
    void acceptanceRejectsInterveningLinkedClipEdits() {
        QFETCH(bool, delayCas);
        QFETCH(bool, addLinkedClip);
        struct Gate { QSemaphore entered; QSemaphore proceed; std::atomic<int> resolutions{0}; std::atomic<int> writes{0}; };
        const auto gate = std::make_shared<Gate>();
        QTemporaryDir folder; QVERIFY(folder.isValid());
        QFile media(folder.filePath("candidate.bin")); QVERIFY(media.open(QIODevice::WriteOnly)); media.write("fixture"); media.close();
        TimelineModel model; model.setTimeline(timeline());
        ShotWorkflow workflow; workflow.setTimeline(&model);
        workflow.m_target = nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), {}, "sequence", folder.path(), {}};
        const auto releaseOnExit = qScopeGuard([gate] { gate->proceed.release(); });
        workflow.setCall([gate, delayCas](bool write, const QString& name, const QJsonObject& input) {
            if (!write && name == "assets.get") { return nt::server::QueryResult{QJsonObject{{"id", input.value("id")}, {"duration", 2}}, {}}; }
            if (write && name == "storyboards.update") {
                ++gate->writes;
                if (delayCas) { gate->entered.release(); gate->proceed.acquire(); }
                auto response = board(); response.insert("document", input.value("document")); response.insert("updatedAt", "v2");
                return nt::server::QueryResult{response, {}};
            }
            return nt::server::QueryResult{{}, {"Unexpected request", "BAD_REQUEST", {}, 400}};
        });
        workflow.setMediaResolver([gate, delayCas, path = media.fileName()](nt::server::ServerClient&, const QString&, const QJsonObject&, const QJsonObject& raw, nt::assets::MediaProtection&, quint64) {
            if (!delayCas && gate->resolutions.fetch_add(1) == 0) { gate->entered.release(); gate->proceed.acquire(); }
            nt::Clip result; result.raw = raw;
            result.mediaType = raw.value("mediaType") == "audio" ? nt::MediaType::Audio : nt::MediaType::Video;
            if (result.mediaType == nt::MediaType::Audio) { result.audioPath = path.toStdString(); } else { result.mediaPath = path.toStdString(); }
            return result;
        });
        const auto candidates = nt::aiassist::appendShotCandidate(board(), "shot", "video", {{"type", "video"}, {"asset_id", "candidate"}, {"duration", 2}});
        workflow.accept(candidates, "shot", "video", 1);
        QTRY_VERIFY_WITH_TIMEOUT(gate->entered.available() > 0, 10000);
        const auto before = model.clipsJson(); auto edited = before;
        if (addLinkedClip) {
            edited.append(QJsonObject{{"id", "newly-linked"}, {"trackId", "video"}, {"mediaType", "video"}, {"startMs", 5000}, {"durationMs", 1000},
                {"currentAssetId", "other-footage"}, {"storyboardBoardId", "board"}, {"storyboardShotId", "shot"}});
        } else {
            auto clip = edited.at(0).toObject(); clip.insert("currentAssetId", "manual-footage"); edited[0] = clip;
        }
        QVERIFY(model.commitEdit("User edit during shot acceptance", before, edited) != 0);
        gate->proceed.release();
        QTRY_COMPARE_WITH_TIMEOUT(workflow.state(), QString("failed"), 10000);
        QTRY_VERIFY(!workflow.busy());
        QCOMPARE(gate->writes.load(), delayCas ? 1 : 0);
        QCOMPARE(model.clipsJson(), edited);
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(workflow.error().contains("changed"));
        for (const auto& clip : model.timeline().clips) { QVERIFY(clip.mediaPath.empty()); QVERIFY(clip.audioPath.empty()); }
    }
    void staleResultAndExtractionFailureDoNotCommit() {
        QTemporaryDir folder; TimelineModel model; auto source = timeline(); source.clips.at(0).mediaPath = "/no/such/shot-source-video.mp4"; model.setTimeline(source);
        ShotWorkflow workflow; workflow.setTimeline(&model);
        workflow.m_target = nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), {}, "sequence", folder.path(), {}};
        std::atomic<int> writes{0}; workflow.setCall([&writes](bool write, const QString&, const QJsonObject&) { if (write) { ++writes; } return nt::server::QueryResult{}; });
        workflow.m_generation = model.documentGeneration(); workflow.m_state = "rendering"; workflow.m_requestId = "old";
        model.setTimeline(source);
        workflow.receive({{"request_id", "old"}, {"result", QJsonObject{{"asset_ids", QJsonArray{"wrong"}}}}});
        QCOMPARE(writes.load(), 0); QCOMPARE(model.undoStack()->count(), 0);
        workflow.derive(board(), "video", 1, "Derived");
        QTRY_COMPARE_WITH_TIMEOUT(workflow.state(), QString("failed"), 10000);
        QTRY_VERIFY(!workflow.busy());
        QCOMPARE(writes.load(), 0); QCOMPARE(model.undoStack()->count(), 0);
    }
};
QTEST_GUILESS_MAIN(ShotWorkflowTest)
#include "tst_shotworkflow.moc"
