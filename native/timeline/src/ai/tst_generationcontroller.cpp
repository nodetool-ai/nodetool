#include "ai/GenerationController.h"
#include "ai/Take.h"
#include "ai/ClipRequests.h"
#include "ai/WorkflowGeneration.h"
#include "aiassist/AssistantSession.h"
#include "model/TimelineJson.h"
#include "assets/AssetMedia.h"
#include <QFile>
#include <QProcess>
#include "../../tests/TestHttpServer.h"
#include <QJsonDocument>
#include <QRegularExpression>
#include <QTemporaryDir>
#include <QWebSocketServer>
#include <QWebSocket>
#include <QtTest>

namespace {
QString schemaError(const TimelineModel& timeline) {
    const auto root = QFileInfo(QFileInfo(QString::fromUtf8(__FILE__)).canonicalFilePath()).dir().absoluteFilePath("../../../..");
    QProcess validator;
    validator.setWorkingDirectory(root);
    validator.start(QDir(root).filePath("node_modules/.bin/tsx"), {QDir(root).filePath("native/timeline/src/ai/schema-check.ts")});
    if (!validator.waitForStarted()) return validator.errorString();
    validator.write(QJsonDocument(nt::server::documentForSave(timeline.timeline().raw)).toJson(QJsonDocument::Compact));
    validator.closeWriteChannel();
    if (!validator.waitForFinished(30000)) return validator.errorString();
    if (validator.exitStatus() != QProcess::NormalExit || validator.exitCode() != 0)
        return QString::fromUtf8(validator.readAllStandardError());
    return {};
}
}

class TestGenerationController : public QObject {
    Q_OBJECT
private slots:
    void largeCandidateHistory() {
        QJsonArray versions;
        QJsonArray saved;
        for (int i = 0; i < 10000; ++i) {
            const auto suffix = QString::number(i);
            versions.append(QJsonObject{{"id", "take-" + suffix}, {"assetId", "asset-" + suffix}, {"status", "success"}});
            if (i < 5000) {
                const auto clipId = i % 2 == 0 ? QStringLiteral("clip") : QStringLiteral("other");
                // Match some versions by take ID and others by asset ID.
                saved.append(QJsonObject{{"clipId", clipId},
                    {"id", i % 4 == 0 ? "take-" + suffix : "saved-" + suffix},
                    {"assetId", i % 4 == 2 ? "asset-" + suffix : "saved-asset-" + suffix}});
            }
        }
        QJsonObject raw{{"id", "timeline"}, {"name", "Test"}, {"fps", 30}, {"width", 640}, {"height", 360},
            {"tracks", QJsonArray{QJsonObject{{"id", "track"}, {"type", "video"}, {"index", 0}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "clip"}, {"trackId", "track"}, {"mediaType", "video"},
                {"startMs", 0}, {"durationMs", 1000}, {"versions", versions}}}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson(QJsonDocument::Compact));
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel timeline;
        timeline.setTimeline(*parsed.timeline);
        GenerationController controller;
        controller.setTimeline(&timeline);
        controller.m_candidates = saved;
        const auto result = controller.candidates();
        QCOMPARE(result.size(), 12500);
        QCOMPARE(result.first().toMap().value("id").toString(), QStringLiteral("take-0"));
        QCOMPARE(result.at(4999).toMap().value("id").toString(), QStringLiteral("saved-4999"));
        QCOMPARE(result.at(5000).toMap().value("id").toString(), QStringLiteral("take-1"));
        QCOMPARE(result.last().toMap().value("id").toString(), QStringLiteral("take-9999"));
    }
    void sharedAssetHistory() {
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"clip","trackId":"track","mediaType":"video","startMs":0,"durationMs":1000,"currentAssetId":"shared","activeTakeId":"two","versions":[{"id":"one","assetId":"shared","status":"success","durationMs":1000},{"id":"two","assetId":"shared","status":"success","durationMs":1000}]}]})");
        QVERIFY(parsed.timeline); TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        QCOMPARE(controller.candidates().size(), 2);
        controller.deleteTake("clip", "two");
        QCOMPARE(timeline.undoStack()->count(), 0);
        controller.deleteTake("clip", "one");
        QCOMPARE(timeline.undoStack()->count(), 1);
        QCOMPARE(timeline.clipsJson().first().toObject().value("activeTakeId").toString(), QStringLiteral("two"));
        timeline.undoStack()->undo();
        QCOMPARE(controller.candidates().size(), 2);
        QCOMPARE(timeline.clipsJson().first().toObject().value("activeTakeId").toString(), QStringLiteral("two"));
    }
    void takeLabelAndStagedDiscard() {
        QTemporaryDir cache;
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[{"id":"track","type":"audio","index":0}],"clips":[{"id":"clip","trackId":"track","name":"Clip","mediaType":"audio","sourceType":"generated","startMs":0,"durationMs":1000,"status":"generated","locked":false,"versions":[{"id":"server-take","assetId":"asset","status":"success"}]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{QUrl("http://127.0.0.1:1"), {}, "timeline", cache.path()};
        controller.m_job = {{"requestId", "take"}, {"clipId", "clip"}};
        controller.m_state = "completed";
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "take"}, {"requestId", "take"}, {"clipId", "clip"},
            {"assetId", "asset"}, {"status", "success"}, {"label", "Generated take"}, {"operation", "edit"}}};
        QVERIFY(controller.save());
        controller.renameTake("clip", "server-take", "New label");
        QCOMPARE(controller.candidates().first().toMap().value("label").toString(), QStringLiteral("New label"));
        QCOMPARE(controller.candidates().first().toMap().value("operation").toString(), QStringLiteral("edit"));
        timeline.undoStack()->undo();
        QVERIFY(!controller.candidates().first().toMap().contains("label"));
        timeline.undoStack()->redo();
        GenerationController reopened; reopened.setTimeline(&timeline); reopened.m_target = controller.m_target; reopened.restore();
        QCOMPARE(reopened.candidates().first().toMap().value("label").toString(), QStringLiteral("New label"));
        controller.m_job = {{"requestId", "staged"}, {"clipId", "clip"}};
        controller.m_candidates.append(QJsonObject{{"id", "staged"}, {"requestId", "staged"}, {"clipId", "clip"},
            {"assetId", "other"}, {"status", "success"}, {"label", "Generated take"}});
        QVERIFY(controller.save());
        const auto staged = controller.candidates().last().toMap();
        QVERIFY(!staged.value("recorded").toBool());
        const auto undoCount = timeline.undoStack()->count();
        controller.deleteTake("clip", "staged");
        QCOMPARE(timeline.undoStack()->count(), undoCount);
        QCOMPARE(controller.candidates().size(), 1);
        GenerationController afterDiscard; afterDiscard.setTimeline(&timeline); afterDiscard.m_target = controller.m_target; afterDiscard.restore();
        QCOMPARE(afterDiscard.candidates().size(), 1);
        QCOMPARE(afterDiscard.candidates().first().toMap().value("id").toString(), QStringLiteral("server-take"));
        controller.deleteTake("clip", "server-take");
        QCOMPARE(timeline.undoStack()->count(), undoCount + 1);
        QVERIFY(controller.candidates().isEmpty());
        timeline.undoStack()->undo();
        QCOMPARE(controller.candidates().first().toMap().value("label").toString(), QStringLiteral("New label"));
        timeline.undoStack()->redo();
        QVERIFY(controller.candidates().isEmpty());
        GenerationController afterRedo; afterRedo.setTimeline(&timeline); afterRedo.m_target = controller.m_target; afterRedo.restore();
        QVERIFY(afterRedo.candidates().isEmpty());
    }
    void sharedMediaProtection() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        const auto path = cache.filePath("candidate.wav");
        const auto latest = cache.filePath("latest.wav");
        for (const auto& name : {path, latest}) {
            QFile file(name); QVERIFY(file.open(QIODevice::WriteOnly)); QCOMPARE(file.write("12345678"), qint64(8));
        }
        nt::assets::MediaProtection evictor;
        {
            nt::assets::MediaProtection preview;
            preview.protect(path);
            evictor.evict(cache.path(), 1, latest);
            QVERIFY(QFileInfo::exists(path));
            preview.reset({});
            evictor.evict(cache.path(), 1, latest);
            QVERIFY(!QFileInfo::exists(path));
        }
        QVERIFY(QFileInfo::exists(latest));
    }
    void applyAndDeletedClip() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        TestHttpServer server;
        const QString assetId = QString(32, QLatin1Char('a'));
        QFile audioFixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.wav"));
        QVERIFY(audioFixture.open(QIODevice::ReadOnly));
        const auto bytes = audioFixture.readAll(); QVERIFY(!bytes.isEmpty());
        server.setFile("/media.wav", ServedFile(bytes));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            const QJsonObject asset{{"id", assetId}, {"name", "sound.wav"}, {"content_type", "audio/wav"},
                                    {"duration", 4}, {"size", bytes.size()}, {"get_url", "/media.wav"}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","type":"audio","index":0,"visible":false,"muted":true},{"id":"solo","type":"audio","index":1,"solo":true}],"clips":[{"id":"clip","trackId":"track","name":"sound","startMs":1000,"durationMs":4000,"mediaType":"audio","sourceType":"generated","bindingKind":"text-to-audio","provider":"test","model":"model","prompt":"sound","status":"draft","locked":false,"muted":true,"opacity":0,"parentId":"parent","versions":[]}],"markers":[]})");
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel timeline;
        timeline.setTimeline(*parsed.timeline);
        GenerationController controller;
        controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "request"}, {"requestId", "request"}, {"clipId", "clip"},
            {"assetId", assetId}, {"provider", "test"}, {"model", "model"}, {"prompt", "sound"}, {"durationMs", 4000},
            {"status", "success"}, {"startedAt", "2026-01-01T00:00:00Z"}}};
        controller.apply("clip", "request");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        QCOMPARE(timeline.undoStack()->count(), 1);
        QCOMPARE(timeline.clipsJson().first().toObject().value("versions").toArray().size(), 1);
        QTRY_VERIFY(!controller.m_worker);
        const auto beforePreview = timeline.documentJson();
        controller.previewUrl("clip", "request");
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        const auto reviewClip = controller.previewTimeline()->clipsJson().first().toObject();
        QCOMPARE(reviewClip.value("mediaType").toString(), QString("audio"));
        QVERIFY(!reviewClip.value("muted").toBool());
        QVERIFY(!reviewClip.contains("parentId"));
        QVERIFY(!reviewClip.contains("opacity"));
        const auto reviewDocument = controller.previewTimeline()->timeline().raw;
        QCOMPARE(reviewDocument.value("tracks").toArray().size(), 1);
        const auto reviewTrack = reviewDocument.value("tracks").toArray().first().toObject();
        QVERIFY(!reviewTrack.value("muted").toBool());
        QVERIFY(reviewTrack.value("visible").toBool(true));
        QCOMPARE(timeline.documentJson(), beforePreview);
        QVERIFY(timeline.clipsJson().first().toObject().value("muted").toBool());
        QVERIFY(!controller.previewTimeline()->timeline().clips.front().audioPath.empty());
        controller.setPreviewAudioMode("null"); controller.playPreview();
        QVERIFY(controller.previewClock()->playing()); QVERIFY(controller.m_previewAudio);
        controller.stopPreview(); QVERIFY(!controller.previewClock()->playing()); QVERIFY(!controller.m_previewAudio);
        timeline.undoStack()->undo();
        QVERIFY(timeline.clipsJson().first().toObject().value("currentAssetId").isUndefined());
        timeline.undoStack()->redo();
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        controller.apply("clip", "request");
        timeline.commitEdit("Delete", timeline.clipsJson(), {});
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QCOMPARE(timeline.clipCount(), 0);
        const auto candidate = controller.m_candidates;
        const auto target = controller.m_target;
        timeline.setTimeline(*parsed.timeline);
        controller.m_target = target;
        controller.m_candidates = candidate;
        controller.apply("clip", "request");
        timeline.setTimeline(*parsed.timeline);
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QVERIFY(timeline.clipsJson().first().toObject().value("currentAssetId").isUndefined());
    }
    void applyMediaEditKeepsOriginal() {
        QTemporaryDir cache;
        TestHttpServer server;
        QFile fixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4"));
        QVERIFY(fixture.open(QIODevice::ReadOnly));
        const auto bytes = fixture.readAll();
        QVERIFY(!bytes.isEmpty());
        const auto assetId = QString(32, QLatin1Char('b'));
        server.setFile("/video.mp4", ServedFile(bytes));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "edit.mp4"},
                {"content_type", "video/mp4"}, {"duration", 2}, {"size", bytes.size()}, {"get_url", "/video.mp4"}}}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","name":"Video","type":"video","index":0,"visible":true,"locked":false}],"clips":[{"id":"clip","trackId":"track","name":"shot","startMs":1000,"durationMs":1000,"mediaType":"video","sourceType":"imported","currentAssetId":"original","inPointMs":500,"outPointMs":1500,"status":"generated","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        const auto source = timeline.clipsJson().first().toObject();
        const auto request = nt::ai::mediaEditRequest("timeline", source,
            QJsonObject{{"instruction", "edit"}, {"provider", "test"}, {"model", "model"}});
        QVERIFY2(request.ok(), qPrintable(request.error));
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "edit"}, {"requestId", "edit"}, {"clipId", "clip"},
            {"assetId", assetId}, {"operation", "edit"}, {"clip", source}, {"snapshot", request.snapshot},
            {"provider", "test"}, {"model", "model"}, {"prompt", "edit"}, {"durationMs", 1000},
            {"status", "success"}, {"startedAt", "2026-01-01T00:00:00Z"}}};
        controller.apply("clip", "edit");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        const auto changed = timeline.clipsJson().first().toObject();
        const auto schemaFailure = schemaError(timeline);
        QVERIFY2(schemaFailure.isEmpty(), qPrintable(schemaFailure));
        QCOMPARE(changed.value("versions").toArray().size(), 2);
        const auto versions = changed.value("versions").toArray();
        QCOMPARE(versions.last().toObject().value("source").toString(), QStringLiteral("video_to_video"));
        const auto baseline = versions.first().toObject();
        const auto baselineId = baseline.value("id").toString();
        QVERIFY(QRegularExpression(QStringLiteral("^[0-9a-f]{32}$")).match(baselineId).hasMatch());
        QCOMPARE(versions.last().toObject().value("parentTakeId").toString(), baselineId);
        QCOMPARE(baseline.value("durationMs").toInt(), 2000);
        const auto original = nt::ai::applyTake(changed, baseline.value("id").toString());
        QVERIFY2(original.error.isEmpty(), qPrintable(original.error));
        QCOMPARE(original.clip.value("inPointMs").toInt(), 500);
        QCOMPARE(original.clip.value("outPointMs").toInt(), 1500);
        QCOMPARE(changed.value("inPointMs").toInt(), 0);
        QCOMPARE(changed.value("outPointMs").toInt(), 1000);
        QTRY_VERIFY(!controller.m_worker);
        controller.previewUrl("clip", baseline.value("id").toString());
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        const auto preview = controller.previewTimeline()->clipsJson().first().toObject();
        QCOMPARE(preview.value("inPointMs").toInt(), 500);
        QCOMPARE(preview.value("outPointMs").toInt(), 1500);
        QCOMPARE(timeline.undoStack()->count(), 1);
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString("original"));
    }
    void previewAndRestoreSlowedBaseline() {
        QTemporaryDir cache;
        TestHttpServer server;
        QFile fixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4"));
        QVERIFY(fixture.open(QIODevice::ReadOnly));
        const auto bytes = fixture.readAll();
        const auto assetId = QString(32, QLatin1Char('a'));
        server.setFile("/original.mp4", ServedFile(bytes));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "original.mp4"},
                {"content_type", "video/mp4"}, {"duration", 4}, {"size", bytes.size()}, {"get_url", "/original.mp4"}}}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":1920,"height":1080,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"clip","trackId":"track","name":"shot","startMs":0,"durationMs":8000,"mediaType":"video","sourceType":"generated","currentAssetId":"edited","inPointMs":0,"outPointMs":8000,"speedMultiplier":1,"speedBaked":true,"status":"generated","versions":[{"id":"baseline","assetId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"success","durationMs":4000,"sourceMapping":{"inPointMs":0,"outPointMs":4000,"speedMultiplier":0.5},"dependencyHash":"","paramOverridesSnapshot":{}}]}]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        controller.previewUrl("clip", "baseline");
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QVERIFY2(controller.error().isEmpty(), qPrintable(controller.error()));
        const auto preview = controller.previewTimeline()->clipsJson().first().toObject();
        QCOMPARE(preview.value("outPointMs").toInt(), 4000);
        QCOMPARE(preview.value("speedMultiplier").toDouble(), 0.5);
        controller.apply("clip", "baseline");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        QCOMPARE(timeline.undoStack()->count(), 1);
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString("edited"));
    }
    void applyExtensionTimingAndStaleSource() {
        QTemporaryDir cache; TestHttpServer server;
        QFile fixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4"));
        QVERIFY(fixture.open(QIODevice::ReadOnly)); const auto bytes = fixture.readAll(); QVERIFY(!bytes.isEmpty());
        const auto assetId = QString(32, QLatin1Char('c'));
        server.setFile("/extension.mp4", ServedFile(bytes));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "extension.mp4"},
                {"content_type", "video/mp4"}, {"duration", 2}, {"size", bytes.size()}, {"get_url", "/extension.mp4"}}}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","name":"Video","type":"video","index":0,"visible":true,"locked":false}],"clips":[{"id":"clip","trackId":"track","name":"shot","startMs":1000,"durationMs":1000,"mediaType":"video","sourceType":"imported","currentAssetId":"original","status":"generated","locked":false,"versions":[]},{"id":"next","trackId":"track","name":"next","startMs":2000,"durationMs":1000,"mediaType":"video","sourceType":"imported","status":"draft","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        const auto source = timeline.clipsJson().first().toObject();
        const auto request = nt::ai::extensionRequest("timeline", "extend", source,
            {{"id", "model"}, {"provider", "test"}, {"supportedTasks", QJsonArray{"extend_video"}}},
            {{"direction", "end"}, {"prompt", "extend"}, {"addedSourceDurationMs", 1000}});
        QVERIFY2(request.ok(), qPrintable(request.error));
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "extend"}, {"requestId", "extend"}, {"clipId", "clip"},
            {"assetId", assetId}, {"operation", "extension"}, {"clip", source}, {"snapshot", request.snapshot},
            {"provider", "test"}, {"model", "model"}, {"prompt", "extend"}, {"durationMs", 1000},
            {"status", "success"}, {"startedAt", "2026-01-01T00:00:00Z"}}};
        controller.applyExtension("clip", "extend", "available-space");
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QCOMPARE(timeline.undoStack()->count(), 0);
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString("original"));
        QVERIFY(!controller.error().isEmpty());
        timeline.moveClip("clip", 500);
        controller.applyExtension("clip", "extend", "keep-cut");
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString("original"));
        timeline.undoStack()->undo();
        controller.applyExtension("clip", "extend", "keep-cut");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        QCOMPARE(timeline.clipsJson().first().toObject().value("durationMs").toInt(), 1000);
        const auto schemaFailure = schemaError(timeline);
        QVERIFY2(schemaFailure.isEmpty(), qPrintable(schemaFailure));
        const auto versions = timeline.clipsJson().first().toObject().value("versions").toArray();
        const auto baselineId = versions.first().toObject().value("id").toString();
        QTRY_VERIFY(!controller.m_worker);
        controller.apply("clip", baselineId);
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString("original"));
        QTRY_VERIFY(!controller.m_worker);
        controller.deleteTake("clip", "extend");
        QCOMPARE(timeline.clipsJson().first().toObject().value("versions").toArray().size(), 1);
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipsJson().first().toObject().value("versions").toArray().size(), 2);
        QCOMPARE(controller.m_candidates.size(), 0);
        controller.previewUrl("clip", "extend");
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QCOMPARE(controller.previewTimeline()->clipCount(), 1);
        QCOMPARE(controller.previewTimeline()->clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        const int undoIndex = timeline.undoStack()->index();
        controller.applyExtension("clip", "extend", "keep-cut");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        QCOMPARE(timeline.undoStack()->index(), undoIndex + 1);
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString("original"));
    }
    void imageVideoRejectsDeletedSource() {
        QTemporaryDir cache; TestHttpServer server;
        QFile fixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4"));
        QVERIFY(fixture.open(QIODevice::ReadOnly)); const auto bytes = fixture.readAll(); QVERIFY(!bytes.isEmpty());
        const auto assetId = QString(32, QLatin1Char('d'));
        server.setFile("/video.mp4", ServedFile(bytes));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "video.mp4"},
                {"content_type", "video/mp4"}, {"duration", 2}, {"size", bytes.size()}, {"get_url", "/video.mp4"}}}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"image","trackId":"track","name":"frame","startMs":0,"durationMs":1000,"mediaType":"image","sourceType":"imported","currentAssetId":"source","status":"generated","locked":false,"versions":[]},{"id":"video","trackId":"track","name":"video","startMs":0,"durationMs":1000,"mediaType":"video","sourceType":"generated","bindingKind":"image-to-video","sourceClipId":"image","provider":"test","model":"model","prompt":"move","status":"draft","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        const auto source = timeline.clipsJson().first().toObject();
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "i2v"}, {"requestId", "i2v"}, {"clipId", "video"},
            {"assetId", assetId}, {"operation", "image-to-video"}, {"sourceClip", source},
            {"provider", "test"}, {"model", "model"}, {"prompt", "move"}, {"durationMs", 1000},
            {"status", "success"}, {"startedAt", "2026-01-01T00:00:00Z"}}};
        auto remaining = timeline.clipsJson(); remaining.removeAt(0);
        timeline.commitEdit("Delete source", timeline.clipsJson(), remaining);
        controller.apply("video", "i2v"); QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QVERIFY(timeline.clipsJson().first().toObject().value("currentAssetId").isUndefined());
        QVERIFY(!controller.error().isEmpty());
        QCOMPARE(timeline.undoStack()->count(), 1);
    }
    void submitMediaEditAndRecover() {
        QTemporaryDir cache; QWebSocketServer server(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QPointer<QWebSocket> peer; QList<QJsonObject> messages;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else messages.append(message);
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"clip","trackId":"track","name":"shot","startMs":1000,"durationMs":1000,"mediaType":"video","sourceType":"imported","currentAssetId":"source","inPointMs":500,"outPointMs":1500,"status":"generated","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort())), {}, "timeline", cache.path()};
        controller.open(); QTRY_VERIFY(controller.ready());
        controller.submitMediaEdit("clip", {{"instruction", "change light"}, {"provider", "test"}, {"model", "model"}});
        QTRY_VERIFY(!messages.isEmpty());
        const auto data = messages.first().value("data").toObject();
        QCOMPARE(data.value("mode").toString(), QString("video_edit"));
        QCOMPARE(data.value("source_context").toObject().value("source_start_ms").toInt(), 500);
        QCOMPARE(timeline.undoStack()->count(), 0);
        GenerationController reopened; reopened.setTimeline(&timeline); reopened.m_target = controller.m_target; reopened.restore();
        QCOMPARE(reopened.state(), QString("recovering"));
        QCOMPARE(reopened.m_job.value("snapshot").toObject().value("sourceContext").toObject().value("sourceAssetId").toString(), QString("source"));
        QCOMPARE(reopened.m_job.value("operation").toString(), QString("edit"));
    }
    void applyLineDeliveryPreservesOriginal() {
        QTemporaryDir cache; TestHttpServer http;
        const auto assetId = QString(32, QLatin1Char('e')); const QByteArray bytes("fixture audio bytes");
        http.setFile("/audio.wav", ServedFile(bytes));
        http.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "audio.wav"},
                {"content_type", "audio/wav"}, {"duration", 2}, {"size", bytes.size()}, {"get_url", "/audio.wav"}}}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","name":"Audio","type":"audio","index":0,"visible":true,"locked":false}],"clips":[{"id":"clip","trackId":"track","name":"line","startMs":0,"durationMs":1000,"mediaType":"audio","sourceType":"generated","scriptId":"script","scriptLineId":"line","currentAssetId":"source","status":"generated","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{http.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        const auto source = timeline.clipsJson().first().toObject();
        const auto request = nt::ai::lineDeliveryRequest(QJsonObject{{"scriptId", "script"},
            {"line", QJsonObject{{"id", "line"}, {"text", "Hello"}, {"speakerId", "speaker"}}},
            {"castMember", QJsonObject{{"id", "speaker"}, {"voice", QJsonObject{{"provider", "test"}, {"model", "model"}, {"voice", "voice"}}}}}});
        QVERIFY2(request.ok(), qPrintable(request.error));
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "line-take"}, {"requestId", "line-take"}, {"clipId", "clip"},
            {"assetId", assetId}, {"operation", "line-delivery"}, {"clip", source}, {"snapshot", request.snapshot},
            {"provider", "test"}, {"model", "model"}, {"prompt", "Hello"}, {"durationMs", 1000},
            {"status", "success"}, {"startedAt", "2026-01-01T00:00:00Z"}}};
        controller.apply("clip", "line-take");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        const auto result = timeline.clipsJson().first().toObject();
        QCOMPARE(result.value("versions").toArray().size(), 2);
        QVERIFY(result.value("versions").toArray().last().toObject().value("lineDelivery").isObject());
        const auto schemaFailure = schemaError(timeline);
        QVERIFY2(schemaFailure.isEmpty(), qPrintable(schemaFailure));
        QCOMPARE(result.value("durationMs").toInt(), 1000);
        QCOMPARE(timeline.undoStack()->count(), 1);
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString("source"));
    }
    void restoreImageAndDirectVideoMetadata() {
        QTemporaryDir cache;
        TestHttpServer server;
        QFile fixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4"));
        QVERIFY(fixture.open(QIODevice::ReadOnly)); const auto bytes = fixture.readAll();
        const auto assetId = QString(32, QLatin1Char('f'));
        server.setFile("/video.mp4", ServedFile(bytes));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "video.mp4"},
                {"content_type", "video/mp4"}, {"duration", 4}, {"size", bytes.size()}, {"get_url", "/video.mp4"}}}}}}).toJson(QJsonDocument::Compact);
        });
        const auto empty = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[],"clips":[],"markers":[]})");
        QVERIFY(empty.timeline);
        TimelineModel imageTimeline; imageTimeline.setTimeline(*empty.timeline);
        GenerationController imageController; imageController.setTimeline(&imageTimeline);
        imageController.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path()};
        imageController.m_job = QJsonObject{{"clipId", "image"}, {"clip", QJsonObject{{"id", "image"}, {"name", "Image"},
            {"mediaType", "image"}, {"sourceType", "generated"}, {"startMs", 0}, {"durationMs", 4000},
            {"status", "draft"}, {"locked", false}, {"versions", QJsonArray{}}}}};
        imageController.restoreClip("image");
        QCOMPARE(imageTimeline.timeline().raw.value("tracks").toArray().first().toObject().value("type").toString(), QStringLiteral("video"));
        const auto imageSchemaError = schemaError(imageTimeline);
        QVERIFY2(imageSchemaError.isEmpty(), qPrintable(imageSchemaError));

        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[{"id":"track","name":"Video","type":"video","index":0,"visible":true,"locked":false}],"clips":[{"id":"clip","trackId":"track","name":"Clip","mediaType":"video","sourceType":"generated","bindingKind":"text-to-video","provider":"test","model":"model","prompt":"scene","aspectRatio":"16:9","resolution":"720p","seed":42,"negativePrompt":"blur","referenceImageIds":["ref"],"startMs":0,"durationMs":4000,"status":"draft","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        const auto submitted = timeline.clipsJson().first().toObject();
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "request"}, {"requestId", "request"}, {"clipId", "clip"},
            {"assetId", assetId}, {"clip", submitted}, {"provider", "test"}, {"model", "model"}, {"prompt", "scene"},
            {"durationMs", 4000}, {"status", "success"}, {"startedAt", "2026-01-01T00:00:00Z"}}};
        controller.apply("clip", "request");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        const auto version = timeline.clipsJson().first().toObject().value("versions").toArray().last().toObject();
        const auto params = version.value("paramOverridesSnapshot").toObject();
        QCOMPARE(version.value("requestId").toString(), QStringLiteral("request"));
        QCOMPARE(params.value("prompt").toString(), QStringLiteral("scene"));
        QCOMPARE(params.value("durationMs").toInt(), 4000);
        QCOMPARE(params.value("seed").toInt(), 42);
        QCOMPARE(params.value("referenceAssetIds").toArray(), QJsonArray{QStringLiteral("ref")});
        QCOMPARE(version.value("generationRecipe").toObject().value("task").toString(), QStringLiteral("text_to_video"));
        const auto schemaFailure = schemaError(timeline);
        QVERIFY2(schemaFailure.isEmpty(), qPrintable(schemaFailure));
        QTRY_VERIFY(!controller.m_worker);
        timeline.undoStack()->undo();
        const QString variation = "variation:batch:timeline_clip:clip:1";
        const QString candidate = "candidate:" + variation;
        const QString request = "request:" + candidate;
        const QJsonObject identity{{"batchId", "batch"}, {"destinationKind", "timeline_clip"}, {"destinationId", "clip"},
            {"variationIndex", 1}, {"variationId", variation}, {"candidateId", candidate}, {"requestId", request}};
        auto snapshot = identity;
        snapshot.insert("schemaVersion", 1); snapshot.insert("operation", "new_take");
        snapshot.insert("prompt", "scene"); snapshot.insert("provider", "test"); snapshot.insert("model", "model");
        snapshot.insert("requestedDurationMs", 4000); snapshot.insert("referenceAssetIds", QJsonArray{"ref"});
        const QJsonObject production{{"identity", identity}, {"snapshot", snapshot}, {"referenceAssetIds", QJsonArray{"ref"}}};
        controller.m_candidates = QJsonArray{QJsonObject{{"id", request}, {"requestId", request}, {"clipId", "clip"},
            {"assetId", assetId}, {"clip", submitted}, {"operation", "regenerate"}, {"production", production},
            {"provider", "test"}, {"model", "model"}, {"prompt", "scene"}, {"durationMs", 4000},
            {"status", "success"}, {"startedAt", "2026-01-01T00:00:00Z"}}};
        controller.apply("clip", request);
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("versions").toArray().last().toObject().value("candidateId").toString(), candidate);
        const auto productionVersion = timeline.clipsJson().first().toObject().value("versions").toArray().last().toObject();
        QVERIFY(QRegularExpression(QStringLiteral("^[0-9a-f]{32}$")).match(productionVersion.value("id").toString()).hasMatch());
        QCOMPARE(productionVersion.value("productionSnapshot").toObject(), snapshot);
        QCOMPARE(productionVersion.value("variationId").toString(), variation);
        QCOMPARE(productionVersion.value("requestId").toString(), request);
        const auto productionSchemaError = schemaError(timeline);
        QVERIFY2(productionSchemaError.isEmpty(), qPrintable(productionSchemaError));
    }
    void applyWorkflowTakeSchema() {
        QTemporaryDir cache;
        TestHttpServer server;
        const auto assetId = QString(32, QLatin1Char('e'));
        const QByteArray bytes("fixture audio bytes");
        server.setFile("/workflow.wav", ServedFile(bytes));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "workflow.wav"},
                {"content_type", "audio/wav"}, {"duration", 1}, {"size", bytes.size()}, {"get_url", "/workflow.wav"}}}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[{"id":"track","name":"Audio","type":"audio","index":0,"visible":true,"locked":false}],"clips":[{"id":"clip","trackId":"track","name":"Clip","mediaType":"audio","sourceType":"generated","workflowId":"workflow","selectedOutputNodeId":"output","startMs":0,"durationMs":1000,"status":"draft","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        const auto clip = timeline.clipsJson().first().toObject();
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "job"}, {"requestId", "job"}, {"clipId", "clip"},
            {"assetId", assetId}, {"operation", "workflow"}, {"clip", clip}, {"status", "success"},
            {"startedAt", "2026-01-01T00:00:00Z"}, {"workflowUpdatedAt", "2025-01-01T00:00:00Z"},
            {"workflowContext", QJsonObject{{"workflowId", "workflow"}, {"dependencyHash", "hash"}, {"paramOverrides", QJsonObject{{"strength", 0.5}}}}}}};
        controller.apply("clip", "job");
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), assetId);
        const auto schemaFailure = schemaError(timeline);
        QVERIFY2(schemaFailure.isEmpty(), qPrintable(schemaFailure));
        const auto version = timeline.clipsJson().first().toObject().value("versions").toArray().last().toObject();
        QCOMPARE(version.value("workflowUpdatedAt").toString(), QStringLiteral("2025-01-01T00:00:00Z"));
        QVERIFY(!version.contains("workflowId"));
    }
    void workflowInputsAndCost() {
        QTemporaryDir cache;
        TestHttpServer server;
        server.setJson([](const QByteArray&, const QUrl&) {
            const QJsonArray nodes{
                QJsonObject{{"id", "prompt"}, {"type", "nodetool.input.StringInput"}, {"data", QJsonObject{{"name", "prompt"}, {"label", "Prompt"}, {"value", "default"}}}},
                QJsonObject{{"id", "count"}, {"type", "nodetool.input.IntegerInput"}, {"data", QJsonObject{{"name", "count"}, {"value", 3}, {"min", 1}, {"max", 9}}}},
                QJsonObject{{"id", "image"}, {"type", "nodetool.input.ImageInput"}, {"data", QJsonObject{{"name", "image"}}}}};
            const QJsonObject workflow{{"id", "workflow"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", workflow}}}}).toJson(QJsonDocument::Compact);
        });
        server.setFile("/api/sdk/v1/preflight", ServedFile(R"({"version":1,"level":"static","workflow_id":"workflow","cost":{"amount":0.25,"currency":"USD","confidence":"partial","unknown_cost_nodes":["missing"]}})"));
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"clip","trackId":"track","name":"Clip","mediaType":"video","sourceType":"generated","workflowId":"workflow","selectedOutputNodeId":"out","startMs":0,"durationMs":1000,"status":"generated","lastGeneratedHash":"old","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path()};
        controller.loadWorkflowInputs("clip");
        QTRY_VERIFY(!controller.workflowInputsLoading());
        QVERIFY2(controller.workflowInputsError().isEmpty(), qPrintable(controller.workflowInputsError()));
        QCOMPARE(controller.workflowInputs().size(), 3);
        QCOMPARE(controller.workflowInputs().first().toMap().value("value").toString(), QStringLiteral("default"));
        QTRY_COMPARE(controller.workflowCostLabel(), QStringLiteral("From $0.25"));
        QVERIFY(!controller.workflowCostDetail().isEmpty());
        QVERIFY(controller.setWorkflowInput("clip", "prompt", QStringLiteral("edited")));
        QCOMPARE(timeline.clipsJson().first().toObject().value("paramOverrides").toObject().value("prompt").toString(), QStringLiteral("edited"));
        QCOMPARE(timeline.clipsJson().first().toObject().value("status").toString(), QStringLiteral("stale"));
        QCOMPARE(timeline.undoStack()->count(), 1);
        timeline.undoStack()->undo();
        QVERIFY(!timeline.clipsJson().first().toObject().value("paramOverrides").toObject().contains("prompt"));
        QCOMPARE(controller.workflowInputs().first().toMap().value("value").toString(), QStringLiteral("default"));
        timeline.undoStack()->redo();
        QVERIFY(!controller.setWorkflowInput("clip", "unknown", 1));
        QVERIFY(!controller.setWorkflowInput("other", "prompt", "wrong"));
        const QVariantMap reference{{"type", "image"}, {"asset_id", "asset"}};
        QVERIFY(controller.setWorkflowInput("clip", "image", reference));
        QCOMPARE(timeline.clipsJson().first().toObject().value("paramOverrides").toObject().value("image").toObject().value("asset_id").toString(), QStringLiteral("asset"));
        auto sameClips = timeline.clipsJson();
        auto sameClip = sameClips.first().toObject(); sameClip.insert("status", "generated"); sameClips.replace(0, sameClip);
        QVERIFY(timeline.replaceClips(sameClips));
        QVERIFY(controller.setWorkflowInput("clip", "prompt", QStringLiteral("edited")));
        QCOMPARE(timeline.clipsJson().first().toObject().value("status").toString(), QStringLiteral("stale"));
        QCOMPARE(server.countRequests("GET", "/trpc/workflows.get"), 1);
        QTRY_VERIFY(server.countRequests("POST", "/api/sdk/v1/preflight") >= 2);
        QTRY_VERIFY(!controller.m_workflowInputWorker);
        auto locked = timeline.timeline().raw;
        auto tracks = locked.value("tracks").toArray();
        auto track = tracks.first().toObject(); track.insert("locked", true); tracks.replace(0, track); locked.insert("tracks", tracks);
        const auto lockedTimeline = nt::parseTimelineJson(QJsonDocument(locked).toJson(QJsonDocument::Compact));
        QVERIFY(lockedTimeline.timeline);
        timeline.setTimeline(*lockedTimeline.timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path()};
        controller.loadWorkflowInputs("clip");
        QTRY_VERIFY(!controller.workflowInputsLoading() && !controller.m_workflowInputWorker);
        QVERIFY(!controller.setWorkflowInput("clip", "prompt", "blocked"));
        QCOMPARE(timeline.undoStack()->count(), 0);
        controller.m_workflowInputDocument = {};
        controller.m_workflowInputClipId.clear();
        controller.loadWorkflowInputs("clip");
        timeline.setTimeline(*parsed.timeline);
        QTRY_VERIFY(!controller.m_workflowInputWorker);
        QVERIFY(controller.workflowInputClipId().isEmpty());
        QVERIFY(controller.workflowInputs().isEmpty());
    }
    void workflowCostTracksInputUndo() {
        QTemporaryDir cache;
        TestHttpServer server;
        server.setJson([](const QByteArray&, const QUrl&) {
            const QJsonArray nodes{QJsonObject{{"id", "prompt"}, {"type", "nodetool.input.StringInput"},
                {"data", QJsonObject{{"name", "prompt"}, {"value", "default"}}}}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", "workflow"},
                {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}}}}}).toJson(QJsonDocument::Compact);
        });
        ServedFile slow(R"({"version":1,"level":"static","workflow_id":"workflow","cost":{"amount":0.25,"currency":"USD","confidence":"estimate","unknown_cost_nodes":[]}})");
        slow.chunkDelayMs = 300;
        server.setFile("/api/sdk/v1/preflight", slow);
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"clip","trackId":"track","name":"Clip","mediaType":"video","sourceType":"generated","workflowId":"workflow","selectedOutputNodeId":"out","startMs":0,"durationMs":1000,"status":"draft","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path()};
        bool staleShown = false;
        connect(&controller, &GenerationController::workflowInputsChanged, this, [&] {
            if (controller.workflowCostLabel() == QStringLiteral("$0.25")) staleShown = true;
        });
        controller.loadWorkflowInputs("clip");
        QTRY_COMPARE(server.countRequests("POST", "/api/sdk/v1/preflight"), 1);
        QTRY_VERIFY(!controller.workflowInputsLoading());
        QVERIFY(controller.setWorkflowInput("clip", "prompt", "edited"));
        QVERIFY(controller.workflowCostLabel().isEmpty());
        timeline.undoStack()->undo();
        QVERIFY(controller.workflowCostLabel().isEmpty());
        server.setFile("/api/sdk/v1/preflight", ServedFile(R"({"version":1,"level":"static","workflow_id":"workflow","cost":{"amount":0.5,"currency":"USD","confidence":"estimate","unknown_cost_nodes":[]}})"));
        QTRY_COMPARE(controller.workflowCostLabel(), QStringLiteral("$0.5"));
        QVERIFY(!staleShown);
        QVERIFY(controller.workflowCostDetail().contains("saved workflow"));
        QTRY_COMPARE(server.countRequests("POST", "/api/sdk/v1/preflight"), 2);
        const auto requests = server.requests();
        QJsonObject latest;
        for (const auto& request : requests) if (request.target == "/api/sdk/v1/preflight") latest = QJsonDocument::fromJson(request.body).object();
        QVERIFY(latest.value("inputs").toObject().isEmpty());
        server.setFile("/api/sdk/v1/preflight", ServedFile(R"({"version":1,"level":"static","workflow_id":"workflow","cost":{"amount":0.75,"currency":"USD","confidence":"estimate","unknown_cost_nodes":[]}})"));
        auto external = timeline.clipsJson();
        auto changed = external.first().toObject();
        changed.insert("paramOverrides", QJsonObject{{"prompt", "external"}});
        external.replace(0, changed);
        QVERIFY(timeline.replaceClips(external));
        QVERIFY(controller.workflowCostLabel().isEmpty());
        QTRY_COMPARE(controller.workflowCostLabel(), QStringLiteral("$0.75"));
        QTRY_COMPARE(server.countRequests("POST", "/api/sdk/v1/preflight"), 3);
        QVERIFY(timeline.replaceClips({}));
        QVERIFY(controller.workflowCostLabel().isEmpty());
        QCOMPARE(server.countRequests("POST", "/trpc/jobs"), 0);
    }
    void submitWorkflowAndRecover() {
        QTemporaryDir cache; TestHttpServer http;
        QString recoveredJobId;
        http.setPost([](const QByteArray&, const QByteArray&) { return QByteArray(R"({"result":{"data":{"status":"cancelled"}}})"); });
        http.setJson([&recoveredJobId](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/jobs.get") {
                QJsonObject job{{"id", recoveredJobId}, {"workflow_id", "workflow"}, {"status", "completed"},
                    {"outputs", QJsonObject{{"output", QJsonArray{QJsonObject{{"asset_id", "recovered"}}}}}}};
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", job}}}}).toJson(QJsonDocument::Compact);
            }
            QJsonObject workflow{{"id", "workflow"}, {"name", "Test"}, {"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "output"}}}}, {"edges", QJsonArray{}}}}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", workflow}}}}).toJson(QJsonDocument::Compact);
        });
        QWebSocketServer socket(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode); QVERIFY(socket.listen(QHostAddress::LocalHost, 0));
        QPointer<QWebSocket> peer; QList<QJsonObject> messages;
        connect(&socket, &QWebSocketServer::newConnection, this, [&] {
            peer = socket.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else messages.append(message);
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"clip","trackId":"track","name":"shot","startMs":0,"durationMs":1000,"mediaType":"video","sourceType":"generated","workflowId":"workflow","selectedOutputNodeId":"output","status":"draft","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline); TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{http.base(), {}, "timeline", cache.path()};
        controller.m_transport.configure(QUrl(QStringLiteral("http://127.0.0.1:%1").arg(socket.serverPort())));
        controller.m_transport.open(); QTRY_VERIFY(controller.ready());
        controller.submitWorkflow("clip"); QTRY_VERIFY(!messages.isEmpty());
        QCOMPARE(messages.first().value("command").toString(), QString("run_job"));
        const auto jobId = controller.m_job.value("requestId").toString(); QVERIFY(!jobId.isEmpty());
        recoveredJobId = jobId;
        controller.m_workflow->statusChanged("completed", {});
        QCOMPARE(controller.state(), QString("recovering"));
        GenerationController reopened; reopened.setTimeline(&timeline); reopened.m_target = controller.m_target; reopened.restore();
        QCOMPARE(reopened.state(), QString("recovering"));
        QCOMPARE(reopened.m_job.value("workflowContext").toObject().value("jobId").toString(), jobId);
        const auto firstPeer = peer;
        reopened.m_transport.configure(QUrl(QStringLiteral("http://127.0.0.1:%1").arg(socket.serverPort())));
        reopened.m_transport.open(); QTRY_VERIFY(reopened.ready());
        QTRY_COMPARE(reopened.candidates().size(), 1);
        QCOMPARE(reopened.candidates().first().toMap().value("assetId").toString(), QString("recovered"));
        peer = firstPeer;
        const auto send = [&](const QJsonObject& object) { peer->sendTextMessage(QString::fromUtf8(QJsonDocument(object).toJson(QJsonDocument::Compact))); };
        send({{"type", "output_update"}, {"job_id", jobId}, {"node_id", "output"}, {"value", QJsonObject{{"asset_id", "asset"}}}});
        send({{"type", "job_update"}, {"job_id", jobId}, {"status", "completed"}});
        QTRY_COMPARE(controller.state(), QString("completed"));
        QCOMPARE(controller.candidates().size(), 1);
        QVERIFY(timeline.clipsJson().first().toObject().value("currentAssetId").isUndefined());
        QCOMPARE(timeline.undoStack()->count(), 0);
        QTRY_VERIFY(!controller.m_worker);
        const auto previous = messages.size();
        controller.submitWorkflow("clip"); QTRY_VERIFY(messages.size() > previous);
        const auto secondJob = controller.m_job.value("requestId").toString();
        QVERIFY(secondJob != jobId);
        QTRY_VERIFY(!controller.m_worker);
        controller.cancel();
        QTRY_COMPARE(controller.state(), QString("cancelled"));
        send({{"type", "output_update"}, {"job_id", secondJob}, {"node_id", "output"}, {"value", QJsonObject{{"asset_id", "late"}}}});
        send({{"type", "job_update"}, {"job_id", secondJob}, {"status", "completed"}});
        QCoreApplication::processEvents();
        QCOMPARE(controller.candidates().size(), 1);
    }
    void submitLineDelivery() {
        QTemporaryDir cache; TestHttpServer http;
        http.setJson([](const QByteArray&, const QUrl&) {
            const QJsonObject voice{{"provider", "test"}, {"model", "model"}, {"voice", "speaker"}};
            const QJsonObject line{{"id", "line"}, {"text", "Hello"}, {"speakerId", "speaker-id"}};
            const QJsonObject document{{"sections", QJsonArray{QJsonObject{{"lines", QJsonArray{line}}}}},
                {"cast", QJsonArray{QJsonObject{{"id", "speaker-id"}, {"voice", voice}}}}, {"setup", QJsonObject{{"pace", "slow"}}}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", "script"}, {"document", document}}}}}}).toJson(QJsonDocument::Compact);
        });
        QWebSocketServer socket(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(socket.listen(QHostAddress::LocalHost, 0));
        QPointer<QWebSocket> peer; QList<QJsonObject> messages;
        connect(&socket, &QWebSocketServer::newConnection, this, [&] {
            peer = socket.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else messages.append(message);
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","type":"audio","index":0}],"clips":[{"id":"clip","trackId":"track","name":"line","startMs":0,"durationMs":1000,"mediaType":"audio","sourceType":"generated","scriptId":"script","scriptLineId":"line","currentAssetId":"source","status":"generated","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{http.base(), {}, "timeline", cache.path()};
        controller.m_transport.configure(QUrl(QStringLiteral("http://127.0.0.1:%1").arg(socket.serverPort())));
        controller.m_transport.open(); QTRY_VERIFY(controller.ready());
        controller.submitLineDelivery("clip", {{"instructions", "gently"}});
        timeline.moveClip("clip", 500);
        QTRY_VERIFY(!controller.m_resolving && !controller.m_worker);
        QVERIFY(messages.isEmpty());
        timeline.undoStack()->undo();
        controller.submitLineDelivery("clip", {{"instructions", "gently"}});
        QTRY_VERIFY(!messages.isEmpty());
        const auto data = messages.first().value("data").toObject();
        QCOMPARE(data.value("mode").toString(), QString("audio"));
        QCOMPARE(data.value("prompt").toString(), QString("Hello"));
        QCOMPARE(data.value("voice").toString(), QString("speaker"));
        QCOMPARE(data.value("instructions").toString(), QString("gently"));
        QCOMPARE(data.value("speed").toDouble(), 0.85);
        QCOMPARE(timeline.undoStack()->index(), 0);
    }
    void submitImageToVideo() {
        QTemporaryDir cache;
        QWebSocketServer server(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QPointer<QWebSocket> peer; QList<QJsonObject> messages;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else messages.append(message);
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"image-track","type":"video","index":0}],"clips":[{"id":"image","trackId":"image-track","name":"frame","startMs":1000,"durationMs":4000,"mediaType":"image","sourceType":"imported","currentAssetId":"source","status":"generated","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort())), {}, "timeline", cache.path()};
        controller.open(); QTRY_VERIFY(controller.ready());
        QSignalSpy inserted(&controller, &GenerationController::clipInserted);
        controller.submitImageToVideo("image", {{"id", "model"}, {"provider", "test"}, {"durations", QVariantList{4}}}, {{"prompt", "move"}, {"width", 1920}, {"height", 1080}});
        QTRY_VERIFY(!messages.isEmpty());
        QCOMPARE(timeline.clipCount(), 2);
        const auto target = timeline.clipsJson().last().toObject();
        QCOMPARE(inserted.size(), 1);
        QCOMPARE(inserted.first().first().toString(), target.value("id").toString());
        QCOMPARE(target.value("bindingKind").toString(), QString("image-to-video"));
        QCOMPARE(target.value("sourceClipId").toString(), QString("image"));
        QVERIFY(target.value("trackId") != QString("image-track"));
        QCOMPARE(timeline.timeline().raw.value("tracks").toArray().size(), 2);
        QCOMPARE(messages.first().value("data").toObject().value("source_asset_id").toString(), QString("source"));
        QCOMPARE(timeline.undoStack()->count(), 1);
        timeline.undoStack()->undo(); QCOMPARE(timeline.clipCount(), 1);
    }
    void preparedProductionEndToEnd() {
        QTemporaryDir cache;
        TestHttpServer http;
        QFile fixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4"));
        QVERIFY(fixture.open(QIODevice::ReadOnly));
        const auto bytes = fixture.readAll();
        const auto assetId = QString(32, QLatin1Char('d'));
        http.setFile("/video.mp4", ServedFile(bytes));
        http.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "video.mp4"},
                {"content_type", "video/mp4"}, {"duration", 3}, {"size", bytes.size()}, {"get_url", "/video.mp4"}}}}}}).toJson(QJsonDocument::Compact);
        });
        QWebSocketServer socket(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(socket.listen(QHostAddress::LocalHost, 0));
        QPointer<QWebSocket> peer; QList<QJsonObject> messages;
        connect(&socket, &QWebSocketServer::newConnection, this, [&] {
            peer = socket.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else messages.append(message);
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"sequence","name":"Film","fps":30,"width":640,"height":360,"durationMs":0,"tracks":[],"clips":[],"markers":[],"setup":{"stage":"review","brief":"Film","format":"ad-15","beats":[{"id":"beat","prompt":"Harbor","duration_ms":2000,"production":{"schema_version":1,"speech_mode":"none","local_direction":"Keep product centered","duration_ms":3000,"requested_take_count":1,"visual_treatment":"product_close_up","reference_bindings":[{"kind":"product","asset_id":"reference"}],"protected_inputs":[{"id":"title","kind":"exact_text","value":"Brand","allowed_transformations":[]}]}}]}})");
        QVERIFY(parsed.timeline); TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController generation; generation.setTimeline(&timeline);
        generation.m_target = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(socket.serverPort())), {}, "sequence", cache.path() + "/server/user/timelines"};
        generation.open(); QTRY_VERIFY(generation.ready());
        AssistantSession session; session.setTimeline(&timeline); session.setGenerationController(&generation);
        session.setHistoryCall([](const QString& procedure, const QJsonObject& input) {
            if (procedure == "assets.get") return nt::server::QueryResult{QJsonObject{{"id", input.value("id")}}, {}};
            return nt::server::QueryResult{{}, {"NOT_FOUND", "Unexpected fixture request"}};
        });
        QJsonObject checkpoint;
        session.setPlanningPersist([&](const QJsonObject& value) { checkpoint = value; return true; });
        const auto staged = session.executeTool("ui_timeline_generate_from_beats", {{"timeline_id", "sequence"}, {"provider", "test"}, {"model", "video"}, {"music", false}});
        QVERIFY2(staged.value("ok").toBool(), qPrintable(QString::fromUtf8(QJsonDocument(staged).toJson())));
        QTRY_VERIFY2(session.planningReview().value("requiresApproval").toBool(), qPrintable(session.error()));
        QVERIFY(messages.isEmpty()); QCOMPARE(timeline.undoStack()->count(), 0);
        QVERIFY(session.approvePlanning(true)); QTRY_VERIFY(!messages.isEmpty());
        QCOMPARE(timeline.undoStack()->count(), 1);
        const auto active = checkpoint.value("active_request").toObject();
        const auto production = active.value("production").toObject();
        const auto identity = production.value("identity").toObject();
        const auto snapshot = production.value("snapshot").toObject();
        const auto requestId = identity.value("requestId").toString();
        const auto clipId = identity.value("destinationId").toString();
        QVERIFY(requestId.startsWith("request:candidate:variation:"));
        QCOMPARE(messages.first().value("request_id").toString(), requestId);
        QCOMPARE(messages.first().value("data").toObject().value("duration").toInt(), 3);
        QCOMPARE(messages.first().value("data").toObject().value("prompt"), snapshot.value("prompt"));
        peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"command", "generate_media"},
            {"request_id", requestId}, {"result", QJsonObject{{"asset_ids", QJsonArray{assetId}}}}}).toJson(QJsonDocument::Compact)));
        QTRY_COMPARE(generation.state(), QStringLiteral("completed"));
        QCOMPARE(generation.candidates().size(), 1);
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString());
        QCOMPARE(timeline.undoStack()->count(), 1);
        GenerationController recovered; recovered.setTimeline(&timeline);
        recovered.m_target = nt::server::SaveTarget{http.base(), {}, "sequence", cache.path() + "/server/user/timelines"};
        const auto submittedCount = messages.size();
        recovered.restore();
        QCOMPARE(recovered.candidates().size(), 1);
        QCOMPARE(messages.size(), submittedCount);
        recovered.apply(clipId, requestId);
        QTRY_VERIFY2(timeline.clipsJson().first().toObject().value("currentAssetId").toString() == assetId, qPrintable(recovered.error()));
        QCOMPARE(timeline.undoStack()->count(), 2);
        const auto version = timeline.clipsJson().first().toObject().value("versions").toArray().last().toObject();
        QCOMPARE(version.value("productionSnapshot").toObject(), snapshot);
        QCOMPARE(version.value("candidateId"), identity.value("candidateId"));
        const auto error = schemaError(timeline); QVERIFY2(error.isEmpty(), qPrintable(error));
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipsJson().first().toObject().value("currentAssetId").toString(), QString());
    }
    void regenerateImage() {
        QTemporaryDir cache; QWebSocketServer server(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QPointer<QWebSocket> peer; QList<QJsonObject> messages;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else messages.append(message);
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[{"id":"track","type":"video","index":0}],"clips":[{"id":"clip","trackId":"track","name":"image","startMs":0,"durationMs":4000,"mediaType":"image","sourceType":"generated","bindingKind":"text-to-image","provider":"test","model":"model","prompt":"landscape","width":1024,"height":768,"status":"draft","locked":false,"versions":[]}],"markers":[]})");
        QVERIFY(parsed.timeline); TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort())), {}, "timeline", cache.path()};
        controller.open(); QTRY_VERIFY(controller.ready());
        controller.regeneratePrepared("clip", "not-an-id");
        QVERIFY(!controller.error().isEmpty());
        QVERIFY(messages.isEmpty());
        controller.regeneratePrepared("clip", QString(32, QLatin1Char('b')) + QLatin1Char('\n'));
        QVERIFY(messages.isEmpty());
        const auto preparedId = QString(32, QLatin1Char('b'));
        controller.regeneratePrepared("clip", preparedId); QTRY_VERIFY(!messages.isEmpty());
        QCOMPARE(messages.first().value("request_id").toString(), preparedId);
        peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"command", "generate_media"},
            {"request_id", preparedId}, {"result", QJsonObject{{"asset_ids", QJsonArray{"result"}}}}}).toJson(QJsonDocument::Compact)));
        QTRY_COMPARE(controller.state(), QStringLiteral("completed"));
        const auto beforeDuplicate = messages.size();
        controller.regeneratePrepared("clip", preparedId);
        QVERIFY(!controller.error().isEmpty());
        QCoreApplication::processEvents();
        QCOMPARE(messages.size(), beforeDuplicate);
        const QString variation = "variation:batch:timeline_clip:clip:2";
        const QString candidate = "candidate:" + variation;
        const QString productionRequest = "request:" + candidate;
        const QJsonObject identity{{"batchId", "batch"}, {"destinationKind", "timeline_clip"}, {"destinationId", "clip"},
            {"variationIndex", 2}, {"variationId", variation}, {"candidateId", candidate}, {"requestId", productionRequest}};
        auto snapshot = identity;
        snapshot.insert("schemaVersion", 1); snapshot.insert("operation", "new_take");
        snapshot.insert("prompt", "frozen prompt"); snapshot.insert("provider", "test"); snapshot.insert("model", "model");
        snapshot.insert("requestedDurationMs", 7000);
        auto productionClip = timeline.clipsJson().first().toObject();
        productionClip.insert("bindingKind", "text-to-video"); productionClip.insert("prompt", "frozen prompt");
        timeline.replaceClips(QJsonArray{productionClip});
        const QJsonObject production{{"identity", identity}, {"snapshot", snapshot}, {"referenceAssetIds", QJsonArray{}}};
        auto malformed = production; auto wrongSnapshot = snapshot; wrongSnapshot.insert("candidateId", "wrong"); malformed.insert("snapshot", wrongSnapshot);
        controller.regenerateProductionPrepared("clip", malformed.toVariantMap());
        QCOMPARE(messages.size(), beforeDuplicate);
        controller.regenerateProductionPrepared("clip", production.toVariantMap());
        QTRY_COMPARE(messages.size(), beforeDuplicate + 1);
        QCOMPARE(messages.last().value("request_id").toString(), productionRequest);
        QCOMPARE(messages.last().value("data").toObject().value("prompt").toString(), QStringLiteral("frozen prompt"));
        QCOMPARE(messages.last().value("data").toObject().value("duration").toInt(), 7);
        QCOMPARE(controller.m_job.value("clip").toObject().value("durationMs").toInt(), 4000);
        QCOMPARE(controller.m_job.value("production").toObject(), production);
        peer->sendTextMessage(QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "rpc_response"}, {"command", "generate_media"},
            {"request_id", productionRequest}, {"result", QJsonObject{{"asset_ids", QJsonArray{"production-result"}}}}}).toJson(QJsonDocument::Compact)));
        QTRY_COMPARE(controller.state(), QStringLiteral("completed"));
        QCOMPARE(controller.m_candidates.last().toObject().value("production").toObject(), production);
        const auto productionCount = messages.size();
        controller.regenerateProductionPrepared("clip", production.toVariantMap());
        QCOMPARE(messages.size(), productionCount);
        const auto data = messages.first().value("data").toObject();
        QCOMPARE(data.value("mode").toString(), QString("image"));
        QCOMPARE(data.value("width").toInt(), 1024); QCOMPARE(data.value("height").toInt(), 768);
        QVERIFY(!data.contains("duration")); QCOMPARE(timeline.clipCount(), 1); QCOMPARE(timeline.undoStack()->count(), 0);
        auto clips = timeline.clipsJson(); auto source = clips.first().toObject();
        source.insert("id", "source"); source.insert("currentAssetId", "image-asset");
        auto target = clips.first().toObject(); target.insert("bindingKind", "image-to-image"); target.insert("sourceClipId", "source");
        clips = QJsonArray{source, target}; timeline.replaceClips(clips);
        TimelineModel other; other.setTimeline(timeline.timeline());
        GenerationController second; second.setTimeline(&other);
        second.m_target = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort())), {}, "timeline", cache.path() + "/other"};
        second.open(); QTRY_VERIFY(second.ready());
        const auto before = messages.size(); second.regenerate("clip"); QTRY_VERIFY(messages.size() > before);
        const auto replay = messages.last().value("data").toObject();
        QCOMPARE(replay.value("mode").toString(), QString("image_edit"));
        QCOMPARE(replay.value("source_asset_id").toString(), QString("image-asset"));
        QCOMPARE(second.m_job.value("sourceClip").toObject().value("id").toString(), QString("source"));
    }
    void shortTimelineIdRecovery() {
        QTemporaryDir cache;
        QWebSocketServer server(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QList<QJsonObject> messages;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            auto* peer = server.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, peer, [peer, &messages](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else messages.append(message);
            });
        });
        const QString full = QStringLiteral("abcdef0123456789abcdef0123456789");
        const auto parsed = nt::parseTimelineJson(R"({"id":"abcdef0123456789abcdef0123456789","fps":30,"width":640,"height":360,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline; timeline.setTimeline(*parsed.timeline);
        const auto serverUrl = QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort()));
        GenerationController controller; controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{serverUrl, {}, full.left(12), cache.path()};
        controller.open(); QTRY_VERIFY(controller.ready());
        controller.submit("video", "test", "model", "scene", 4, "16:9", "720p", {}, {}, 0);
        QTRY_VERIFY(!messages.isEmpty());
        QCOMPARE(messages.first().value("data").toObject().value("timeline_context").toObject().value("sequence_id").toString(), full);
        const auto request = controller.m_job.value("requestId").toString();
        QVERIFY(!request.isEmpty());
        GenerationController reopened; reopened.setTimeline(&timeline);
        reopened.m_target = nt::server::SaveTarget{serverUrl, {}, full, cache.path()};
        reopened.restore();
        QCOMPARE(reopened.m_job.value("requestId").toString(), request);
        QCOMPARE(reopened.state(), QStringLiteral("recovering"));
        reopened.open();
        QTRY_VERIFY(reopened.ready());
        QTRY_VERIFY(messages.size() >= 2);
        int generations = 0;
        for (const auto& message : messages) if (message.value("command") == "generate_media") ++generations;
        QCOMPARE(generations, 1);
        GenerationController mismatch; mismatch.setTimeline(&timeline);
        mismatch.m_target = nt::server::SaveTarget{serverUrl, {}, QStringLiteral("other"), cache.path()};
        mismatch.open();
        QVERIFY(!mismatch.ready());
        QVERIFY(!mismatch.error().isEmpty());
        mismatch.restore();
        QVERIFY(mismatch.m_job.isEmpty());
        mismatch.m_target->timelineId = full.left(11);
        QVERIFY(!mismatch.canonicalizeTarget());
        mismatch.m_target->timelineId = full.left(13);
        QVERIFY(!mismatch.canonicalizeTarget());
        mismatch.m_target->timelineId = QStringLiteral("000000000000");
        QVERIFY(!mismatch.canonicalizeTarget());
        const auto legacy = nt::parseTimelineJson(R"({"id":"personal:legacy","fps":30,"width":640,"height":360,"tracks":[],"clips":[]})");
        QVERIFY(legacy.timeline);
        TimelineModel legacyModel; legacyModel.setTimeline(*legacy.timeline);
        GenerationController legacyController; legacyController.setTimeline(&legacyModel);
        legacyController.m_target = nt::server::SaveTarget{serverUrl, {}, QStringLiteral("personal:legacy"), cache.path()};
        QVERIFY(legacyController.canonicalizeTarget());
        QCOMPARE(legacyController.m_target->timelineId, QStringLiteral("personal:legacy"));
    }
    void lockedTrackDoesNotSelect() {
        QTemporaryDir cache;
        QWebSocketServer server(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            auto* peer = server.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, peer, [peer](const QString& text) {
                if (QJsonDocument::fromJson(text.toUtf8()).object().value("command") == "set_mode")
                    peer->sendTextMessage(R"({"message":"Mode set to text"})");
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,"tracks":[{"id":"v","type":"video","index":0,"locked":true}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline;
        timeline.setTimeline(*parsed.timeline);
        GenerationController controller;
        controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort())), {}, "timeline", cache.path()};
        controller.open();
        QTRY_VERIFY(controller.ready());
        QSignalSpy inserted(&controller, &GenerationController::clipInserted);
        controller.submit("video", "test", "model", "scene", 4, "16:9", "720p", {}, {}, 0);
        QCOMPARE(inserted.size(), 0);
        QCOMPARE(timeline.clipCount(), 0);
        QVERIFY(!controller.error().isEmpty());
    }
    void submitCancelRecovery() {
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        QWebSocketServer server(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QPointer<QWebSocket> peer;
        QList<QJsonObject> messages;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") {
                    peer->sendTextMessage(R"({"message":"Mode set to text"})");
                } else { messages.append(message); }
            });
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Test","fps":30,"width":1920,"height":1080,"durationMs":0,"tracks":[],"clips":[],"markers":[]})");
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel timeline;
        timeline.setTimeline(*parsed.timeline);
        GenerationController controller;
        controller.setTimeline(&timeline);
        controller.m_target = nt::server::SaveTarget{QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort())), {}, "timeline", cache.path()};
        controller.open();
        QTRY_VERIFY(controller.ready());
        QSignalSpy inserted(&controller, &GenerationController::clipInserted);
        controller.submit("video", "test", "model", "", 4, "16:9", "720p", {}, {}, 1000);
        QCOMPARE(inserted.size(), 0);
        controller.submit("video", "test", "model", "a scene", 4, "16:9", "720p", {}, {}, 1000);
        QCOMPARE(inserted.size(), 1);
        QCOMPARE(inserted.first().first().toString(), timeline.clipsJson().first().toObject().value("id").toString());
        QTRY_VERIFY(!messages.isEmpty());
        QCOMPARE(messages.first().value("command").toString(), QString("generate_media"));
        QCOMPARE(timeline.clipCount(), 1);
        QCOMPARE(timeline.undoStack()->count(), 1);
        QCOMPARE(timeline.clipsJson().first().toObject().value("startMs").toInt(), 1000);
        const auto request = messages.first().value("request_id").toString();
        QVERIFY(QRegularExpression(QStringLiteral("^[0-9a-f]{32}$")).match(request).hasMatch());
        controller.cancel();
        QVERIFY(controller.busy());
        const auto send = [&](const QJsonObject& response) {
            peer->sendTextMessage(QString::fromUtf8(QJsonDocument(response).toJson(QJsonDocument::Compact)));
        };
        send({{"type", "rpc_response"}, {"command", "generate_media"}, {"request_id", request},
              {"result", QJsonObject{{"asset_ids", QJsonArray{"late"}}}}});
        QTRY_VERIFY(messages.size() >= 3);
        QVERIFY(controller.candidates().isEmpty());
        QString lookupId;
        for (const auto& message : messages) {
            if (message.value("command") == "lookup_generations") lookupId = message.value("request_id").toString();
        }
        QVERIFY(!lookupId.isEmpty());
        send({{"type", "rpc_response"}, {"command", "lookup_generations"}, {"request_id", lookupId},
              {"result", QJsonObject{{"generations", QJsonArray{QJsonObject{{"request_id", request}, {"status", "cancelled"}}}}}}});
        QTRY_COMPARE(controller.state(), QString("cancelled"));
        QVERIFY(!controller.busy());
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipCount(), 0);
        timeline.undoStack()->redo();
        QCOMPARE(timeline.clipCount(), 1);
        GenerationController reopened;
        reopened.setTimeline(&timeline);
        reopened.m_target = controller.m_target;
        reopened.restore();
        QCOMPARE(reopened.state(), QString("cancelled"));
        QCOMPARE(reopened.m_job.value("requestId").toString(), request);
        auto clips = timeline.clipsJson(); auto replayClip = clips.first().toObject();
        const auto clipId = replayClip.value("id").toString();
        replayClip.insert("seed", 42); replayClip.insert("negativePrompt", "blur");
        replayClip.insert("strength", 0.5); replayClip.insert("numInferenceSteps", 20);
        clips.replace(0, replayClip); timeline.replaceClips(clips);
        const auto beforeCount = messages.size();
        controller.regenerate(clipId);
        QTRY_VERIFY(messages.size() > beforeCount);
        QCOMPARE(timeline.clipCount(), 1);
        QCOMPARE(timeline.undoStack()->count(), 1);
        QCOMPARE(messages.last().value("command").toString(), QString("generate_media"));
        const auto replayData = messages.last().value("data").toObject();
        QCOMPARE(replayData.value("seed").toInt(), 42); QCOMPARE(replayData.value("negative_prompt").toString(), QString("blur"));
        QCOMPARE(replayData.value("strength").toDouble(), 0.5); QCOMPARE(replayData.value("num_inference_steps").toInt(), 20);
        QCOMPARE(controller.m_job.value("operation").toString(), QString("regenerate"));
    }
};
QTEST_GUILESS_MAIN(TestGenerationController)
#include "tst_generationcontroller.moc"
