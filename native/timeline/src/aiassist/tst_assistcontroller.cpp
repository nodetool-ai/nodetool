#include "aiassist/AssistController.h"
#include <QtTest>
#include "model/TimelineJson.h"
#include <QJsonDocument>
#include <QSemaphore>
#include <QTemporaryFile>
#include <atomic>
class ControllerTest : public QObject {
    Q_OBJECT
private slots:
    void casAndServerContracts() {
        TimelineModel model;
        nt::Timeline timeline;
        timeline.raw = {{"id", "sequence"}, {"clips", QJsonArray{}}};
        {
            auto raw = timeline.raw;
            if (!raw.value("clips").toArray().isEmpty()) {
                raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    clip.insert("trackId", "audio");
                    if (!clip.contains("mediaType")) { clip.insert("mediaType", "audio"); }
                    if (!clip.contains("durationMs")) { clip.insert("durationMs", 1000); }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
            model.setTimeline(*parsed.timeline);
        }
        AssistController controller;
        controller.setModel(&model);
        QString called;
        QJsonObject input;
        controller.setCall([&](bool write, const QString& procedure, const QJsonObject& payload) {
            if (write) { called = procedure; input = payload; }
            return nt::server::QueryResult{QJsonObject{{"id", "script"}, {"updatedAt", "next"}}, {}};
        });
        QVERIFY(!controller.saveScript({{"id", "script"}, {"document", QJsonObject{}}}));
        QVERIFY(controller.saveScript({{"id", "script"}, {"document", QJsonObject{{"sections", QJsonArray{}}}}, {"updatedAt", "revision"}}));
        QTRY_VERIFY(!controller.busy());
        QCOMPARE(called, QString("scripts.update"));
        QCOMPARE(input.value("baseUpdatedAt").toString(), QString("revision"));
        QVERIFY(input.value("document").toObject().contains("sections"));
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void explicitScriptReconciliationIsUndoable() {
        TimelineModel model;
        nt::Timeline timeline;
        timeline.raw = {{"id", "sequence"}, {"clips", QJsonArray{QJsonObject{{"id", "clip"}, {"scriptId", "script"}, {"scriptLineId", "removed"}, {"startMs", 0}, {"durationMs", 100}}}}};
        {
            auto raw = timeline.raw;
            if (!raw.value("clips").toArray().isEmpty()) {
                raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    clip.insert("trackId", "audio");
                    if (!clip.contains("mediaType")) { clip.insert("mediaType", "audio"); }
                    if (!clip.contains("durationMs")) { clip.insert("durationMs", 1000); }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
            model.setTimeline(*parsed.timeline);
        }
        const auto before = model.timeline().raw;
        AssistController controller;
        controller.setModel(&model);
        const QJsonObject script{{"id", "script"}, {"timelineId", "sequence"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"sections", QJsonArray{}}}}};
        controller.setCall([script](bool, const QString& procedure, const QJsonObject&) {
            return nt::server::QueryResult{procedure == "scripts.list" ? QJsonValue(QJsonArray{script}) : QJsonValue(script), {}};
        });
        QVERIFY(controller.saveScript(script));
        QTRY_VERIFY(!controller.busy());
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(model.timeline().raw.value("clips").toArray().isEmpty());
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, before);
        QVERIFY(controller.refreshLinkedScript());
        QTRY_VERIFY(!controller.busy());
        QCOMPARE(model.timeline().raw, before);
        QVERIFY(controller.applyScriptRevision("script"));
        QTRY_VERIFY(!controller.busy());
        QCOMPARE(model.undoStack()->index(), 1);
        QVERIFY(model.timeline().raw.value("clips").toArray().isEmpty());
    }
    void storyboardAssemblyUsesCasAndOneUndo() {
        TimelineModel model;
        nt::Timeline timeline;
        timeline.raw = {{"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
        {
            auto raw = timeline.raw;
            if (!raw.value("clips").toArray().isEmpty()) {
                raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    clip.insert("trackId", "audio");
                    if (!clip.contains("mediaType")) { clip.insert("mediaType", "audio"); }
                    if (!clip.contains("durationMs")) { clip.insert("durationMs", 1000); }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
            model.setTimeline(*parsed.timeline);
        }
        const auto before = model.timeline().raw;
        const QJsonObject shot{{"id", "shot"}, {"index", 0}, {"clip", QJsonObject{{"asset_id", "video"}, {"duration", 3}}}};
        const QJsonObject board{{"id", "board"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"shots", QJsonArray{shot}}}}};
        AssistController controller;
        controller.setModel(&model);
        QJsonObject linkedInput;
        QTemporaryFile resolvedFile; QVERIFY(resolvedFile.open());
        const auto path = resolvedFile.fileName().toStdString();
        controller.setMediaResolver([path](const QJsonObject& raw) {
            nt::Clip media; media.raw = raw;
            media.mediaType = raw.value("mediaType") == "audio" ? nt::MediaType::Audio : nt::MediaType::Video;
            media.mediaPath = path; media.audioPath = path; return media;
        });
        controller.setCall([&](bool write, const QString& procedure, const QJsonObject& input) {
            if (write && procedure == "storyboards.update") { linkedInput = input; }
            return nt::server::QueryResult{board, {}};
        });
        QVERIFY(controller.assembleStoryboard(board));
        QTRY_VERIFY(!controller.busy());
        QCOMPARE(linkedInput.value("baseUpdatedAt").toString(), QString("revision"));
        QCOMPARE(linkedInput.value("timelineId").toString(), QString("sequence"));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.timeline().raw.value("clips").toArray().size(), 2);
        for (const auto& clip : model.timeline().clips) {
            QVERIFY(clip.mediaType == nt::MediaType::Audio ? !clip.audioPath.empty() : !clip.mediaPath.empty());
        }
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, before);
    }
    void undoDuringAssemblyLookupPreventsBackendLink() {
        const QJsonObject clip{{"id", "clip"}, {"trackId", "audio"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 1000}};
        const QJsonObject document{{"id", "sequence"}, {"tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}}}}, {"clips", QJsonArray{clip}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel model; model.setTimeline(*parsed.timeline);
        const auto beforeMove = model.timeline().raw;
        QVERIFY(model.moveClip("clip", 100));
        AssistController controller; controller.setModel(&model);
        const QJsonObject shot{{"id", "shot"}, {"index", 0}, {"clip", QJsonObject{{"asset_id", "video"}, {"duration", 3}}}};
        const QJsonObject board{{"id", "board"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"shots", QJsonArray{shot}}, {"screenplay", QJsonObject{{"script_id", "script"}}}}}};
        const auto release = std::make_shared<QSemaphore>();
        const auto started = std::make_shared<std::atomic_bool>(false);
        const auto writes = std::make_shared<std::atomic_int>(0);
        controller.setCall([release, started, writes, board](bool write, const QString& procedure, const QJsonObject&) {
            if (!write && procedure == "scripts.get") {
                started->store(true); release->acquire();
                return nt::server::QueryResult{QJsonObject{{"id", "script"}, {"document", QJsonObject{{"sections", QJsonArray{}}}}}, {}};
            }
            if (write && procedure == "storyboards.update") { writes->fetch_add(1); }
            return nt::server::QueryResult{board, {}};
        });
        QVERIFY(controller.assembleStoryboard(board));
        QTRY_VERIFY(started->load());
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, beforeMove);
        release->release();
        QTRY_VERIFY(!controller.busy());
        QCOMPARE(writes->load(), 0);
        QCOMPARE(model.timeline().raw, beforeMove);
        QCOMPARE(model.undoStack()->index(), 0);
        QVERIFY(!controller.error().isEmpty());
    }
    void createsAndLinksScriptThroughExistingApis() {
        const QJsonObject document{{"id", "sequence"}, {"name", "Cut"}, {"projectId", "project"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel model; model.setTimeline(*parsed.timeline);
        AssistController controller; controller.setModel(&model);
        const auto calls = std::make_shared<QStringList>();
        const auto linkedInput = std::make_shared<QJsonObject>();
        const QJsonObject created{{"id", "script"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"cast", QJsonArray{}}, {"sections", QJsonArray{}}}}};
        controller.setCall([calls, linkedInput, created](bool write, const QString& procedure, const QJsonObject& input) {
            if (write) { calls->append(procedure); }
            auto result = created;
            if (procedure == "scripts.update") { *linkedInput = input; result.insert("timelineId", input.value("timelineId")); }
            return nt::server::QueryResult{result, {}};
        });
        QVERIFY(controller.createLinkedScript()); QTRY_VERIFY(!controller.busy());
        QCOMPARE(*calls, (QStringList{"scripts.create", "scripts.update"}));
        QCOMPARE(linkedInput->value("id").toString(), QString("script"));
        QCOMPARE(linkedInput->value("timelineId").toString(), QString("sequence"));
        QCOMPARE(linkedInput->value("baseUpdatedAt").toString(), QString("revision"));
        QCOMPARE(controller.result().toMap().value("id").toString(), QString("script"));
    }
    void failedScriptSaveKeepsTypedLineDraft() {
        const QJsonObject document{{"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel model; model.setTimeline(*parsed.timeline);
        const QJsonObject line{{"id", "line"}, {"text", "Original"}, {"takes", QJsonArray{}}};
        const QJsonObject section{{"id", "section"}, {"lines", QJsonArray{line}}};
        const auto resource = std::make_shared<QJsonObject>(QJsonObject{{"id", "script"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"cast", QJsonArray{}}, {"sections", QJsonArray{section}}}}});
        const auto fail = std::make_shared<std::atomic_bool>(true);
        AssistController controller; controller.setModel(&model);
        controller.setCall([resource, fail](bool write, const QString&, const QJsonObject& input) {
            if (write && fail->load()) { return nt::server::QueryResult{{}, {"A newer script revision exists", "CONFLICT", {}, 409}}; }
            if (write) { resource->insert("document", input.value("document")); resource->insert("updatedAt", "next"); }
            return nt::server::QueryResult{*resource, {}};
        });
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        QVERIFY(controller.patchScriptLine("line", "Typed retained")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!controller.error().isEmpty());
        QCOMPARE(controller.scriptRows().first().toMap().value("text").toString(), QString("Typed retained"));
        QVERIFY(controller.hasScriptLineDraft("script", "line"));
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        QCOMPARE(controller.scriptRows().first().toMap().value("text").toString(), QString("Typed retained"));
        fail->store(false);
        QVERIFY(controller.saveScriptLineDraft("script", "line")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!controller.hasScriptLineDraft("script", "line"));
        QCOMPARE(controller.result().toMap().value("document").toMap().value("sections").toList().first().toMap().value("lines").toList().first().toMap().value("text").toString(), QString("Typed retained"));
        QCOMPARE(model.timeline().raw, document);
    }
    void newerDraftAndScriptIdentitySurviveAsyncReply() {
        const QJsonObject document{{"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson()); QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(*parsed.timeline);
        const auto release = std::make_shared<QSemaphore>();
        const auto started = std::make_shared<std::atomic_bool>(false);
        const auto writes = std::make_shared<std::atomic_int>(0);
        const QJsonObject line{{"id", "line"}, {"text", "Original"}, {"takes", QJsonArray{}}};
        const QJsonObject section{{"id", "section"}, {"lines", QJsonArray{line}}};
        const QJsonObject source{{"id", "script"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"cast", QJsonArray{}}, {"sections", QJsonArray{section}}}}};
        AssistController controller; controller.setModel(&model);
        controller.setCall([source, release, started, writes](bool write, const QString&, const QJsonObject& input) {
            auto result = source;
            if (write) { writes->fetch_add(1); started->store(true); release->acquire(); result.insert("document", input.value("document")); result.insert("updatedAt", "next"); }
            else { result.insert("id", input.value("id")); }
            return nt::server::QueryResult{result, {}};
        });
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        controller.setScriptLineDraft("script", "line", "Submitted");
        QVERIFY(controller.saveScriptLineDraft("script", "line")); QTRY_VERIFY(started->load());
        controller.setScriptLineDraft("script", "line", "New typing");
        release->release(); QTRY_VERIFY(!controller.busy());
        QCOMPARE(controller.scriptRows().first().toMap().value("text").toString(), QString("New typing"));
        QVERIFY(controller.hasScriptLineDraft("script", "line"));
        QVERIFY(controller.openScript("otherScript")); QTRY_VERIFY(!controller.busy());
        QCOMPARE(controller.scriptRows().first().toMap().value("text").toString(), QString("Original"));
        QVERIFY(!controller.saveScriptLineDraft("script", "line"));
        controller.setScriptLineDraft("script", "line", "Late old delegate");
        QCOMPARE(writes->load(), 1);
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        QCOMPARE(controller.scriptRows().first().toMap().value("text").toString(), QString("New typing"));
    }
    void remotelyRemovedLineRetainsVisibleDraft() {
        TimelineModel model;
        const auto parsed = nt::parseTimelineJson(R"({"id":"sequence","tracks":[],"clips":[]})"); QVERIFY(parsed.timeline.has_value()); model.setTimeline(*parsed.timeline);
        const QJsonObject line{{"id", "line"}, {"text", "Original"}, {"takes", QJsonArray{}}};
        const QJsonObject section{{"id", "section"}, {"lines", QJsonArray{line}}};
        const auto source = std::make_shared<QJsonObject>(QJsonObject{{"id", "script"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"sections", QJsonArray{section}}}}});
        AssistController controller; controller.setModel(&model);
        controller.setCall([source](bool, const QString&, const QJsonObject&) { return nt::server::QueryResult{*source, {}}; });
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        controller.setScriptLineDraft("script", "line", "Keep this draft");
        source->insert("document", QJsonObject{{"sections", QJsonArray{}}});
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        const auto row = controller.scriptRows().last().toMap();
        QCOMPARE(row.value("text").toString(), QString("Keep this draft"));
        QVERIFY(row.value("draftOrphan").toBool());
        QVERIFY(!controller.saveScriptLineDraft("script", "line"));
        QCOMPARE(controller.scriptRows().last().toMap().value("text").toString(), QString("Keep this draft"));
    }
    void scriptAuthoringUsesCasAndEmptyBackspace() {
        TimelineModel model;
        const QJsonObject document{{"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        model.setTimeline(*parsed.timeline);
        const QJsonObject line{{"id", "line"}, {"text", "Original"}, {"takes", QJsonArray{}}};
        auto resource = std::make_shared<QJsonObject>(QJsonObject{{"id", "script"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"cast", QJsonArray{}}, {"sections", QJsonArray{QJsonObject{{"id", "section"}, {"lines", QJsonArray{line}}}}}}}});
        const auto writes = std::make_shared<std::atomic_int>(0);
        const auto correctCas = std::make_shared<std::atomic_bool>(true);
        AssistController controller; controller.setModel(&model);
        controller.setCall([resource, writes, correctCas](bool write, const QString& procedure, const QJsonObject& input) {
            if (write && procedure == "scripts.update") {
                if (input.value("baseUpdatedAt") != resource->value("updatedAt")) { correctCas->store(false); }
                resource->insert("document", input.value("document"));
                resource->insert("updatedAt", QString::number(writes->fetch_add(1) + 1));
            }
            return nt::server::QueryResult{*resource, {}};
        });
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        QVERIFY(controller.addScriptLine()); QTRY_VERIFY(!controller.busy());
        const auto added = controller.result().toMap().value("document").toMap().value("sections").toList().first().toMap().value("lines").toList();
        QCOMPARE(added.size(), 2);
        const auto newId = added.last().toMap().value("id").toString();
        QVERIFY(controller.patchScriptLine(newId, " ")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!controller.removeEmptyScriptLine(newId, " "));
        QCOMPARE(writes->load(), 2);
        QVERIFY(controller.removeEmptyScriptLine(newId, "")); QTRY_VERIFY(!controller.busy());
        QCOMPARE(controller.scriptHeader().value("lineCount").toInt(), 1);
        QCOMPARE(writes->load(), 3);
        QVERIFY(correctCas->load());
        QCOMPARE(model.timeline().raw, document);
    }
    void staleResponseCannotReachReplacementDocument() {
        TimelineModel model;
        nt::Timeline timeline;
        timeline.raw = {{"id", "first"}, {"clips", QJsonArray{}}};
        {
            auto raw = timeline.raw;
            if (!raw.value("clips").toArray().isEmpty()) {
                raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    clip.insert("trackId", "audio");
                    if (!clip.contains("mediaType")) { clip.insert("mediaType", "audio"); }
                    if (!clip.contains("durationMs")) { clip.insert("durationMs", 1000); }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
            model.setTimeline(*parsed.timeline);
        }
        AssistController controller;
        controller.setModel(&model);
        auto release = std::make_shared<QSemaphore>();
        auto started = std::make_shared<std::atomic_bool>(false);
        controller.setCall([release, started](bool, const QString&, const QJsonObject&) {
            started->store(true); release->acquire();
            return nt::server::QueryResult{QJsonObject{{"id", "old"}}, {}};
        });
        QVERIFY(controller.openScript("script"));
        QTRY_VERIFY(started->load());
        timeline.raw.insert("id", "replacement"); {
            auto raw = timeline.raw;
            if (!raw.value("clips").toArray().isEmpty()) {
                raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    clip.insert("trackId", "audio");
                    if (!clip.contains("mediaType")) { clip.insert("mediaType", "audio"); }
                    if (!clip.contains("durationMs")) { clip.insert("durationMs", 1000); }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
            model.setTimeline(*parsed.timeline);
        }
        release->release();
        QTRY_VERIFY(!controller.busy());
        QVERIFY(controller.result().isNull());
        QVERIFY(!controller.error().isEmpty());
    }
};
QTEST_GUILESS_MAIN(ControllerTest)
#include "tst_assistcontroller.moc"
