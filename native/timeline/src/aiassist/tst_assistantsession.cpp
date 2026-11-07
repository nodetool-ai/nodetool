#include "aiassist/AgentBridge.h"
#include "aiassist/AssistantSession.h"
#include "model/TimelineJson.h"
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSemaphore>
#include <QtTest>
#include <atomic>
class FakeAssistantGenerator : public QObject {
  Q_OBJECT
  Q_PROPERTY(TimelineModel *timeline MEMBER source)
  Q_PROPERTY(bool ready MEMBER ready)
  Q_PROPERTY(bool busy MEMBER busy)
  Q_PROPERTY(bool resolving MEMBER resolving)
  Q_PROPERTY(QString state MEMBER state)
  Q_PROPERTY(QString error MEMBER error)
  Q_PROPERTY(QVariantList candidates MEMBER candidates)
public:
  TimelineModel *source = nullptr;
  bool ready = true, busy = false, resolving = false;
  QString state, error, operation, clipId, takeId;
  QVariantMap options;
  QVariantList candidates;
  QStringList submittedIds;
  QVariantList submittedProduction;
  Q_INVOKABLE void regenerateProductionPrepared(const QString &id,
                                                const QVariantMap &compiled) {
    submittedProduction.append(compiled);
    submittedIds.append(
        compiled.value("identity").toMap().value("requestId").toString());
    regenerate(id);
    emit changed();
  }
  Q_INVOKABLE void regeneratePrepared(const QString &id,
                                      const QString &request) {
    submittedIds.append(request);
    regenerate(id);
    emit changed();
  }
  Q_INVOKABLE void finish(bool success = true) {
    busy = false;
    state = success ? "completed" : "failed";
    error = success ? QString{} : QStringLiteral("fixture failure");
    emit changed();
  }
  Q_INVOKABLE void cancel() {
    busy = false;
    state = "cancelled";
    emit changed();
  }
signals:
  void changed();

public:
  Q_INVOKABLE void open() { operation = "open"; }
  Q_INVOKABLE void regenerate(const QString &id) {
    operation = "regenerate";
    clipId = id;
    state = "running";
    busy = true;
  }
  Q_INVOKABLE void submitMediaEdit(const QString &id,
                                   const QVariantMap &input) {
    operation = "edit";
    clipId = id;
    options = input;
    state = "running";
    busy = true;
  }
  Q_INVOKABLE void apply(const QString &id, const QString &take) {
    operation = "apply";
    clipId = id;
    takeId = take;
    resolving = true;
  }
};
class AssistantSessionTest : public QObject {
  Q_OBJECT
private slots:
  void wireContract() {
    const QString timelineId = "123456789abc123456789abc12345678";
    const auto frame =
        AssistantSession::message("Split the selected clip", "thread",
                                  timelineId, {"clip"}, "provider", "model");
    QCOMPARE(frame.value("command").toString(), QString("chat_message"));
    const auto data = frame.value("data").toObject();
    QCOMPARE(data.value("thread_id").toString(), QString("thread"));
    QCOMPARE(data.value("role").toString(), QString("user"));
    QCOMPARE(data.value("permission_mode").toString(), QString("default"));
    QCOMPARE(data.value("workflow_id").toString(), timelineId);
    const auto context = data.value("ui_context").toObject();
    QCOMPARE(context.value("source").toString(), QString("timeline_assistant"));
    QCOMPARE(context.value("focused").toObject().value("id").toString(),
             timelineId);
    QCOMPARE(context.value("selection").toObject().value("clip_ids").toArray(),
             QJsonArray{"clip"});
    QVERIFY(data.value("id").toString().size() == 32);
    QVERIFY(!data.contains("tools"));
  }
  void bridgeUsesLockedDocumentRules() {
    QJsonObject raw{
        {"id", "sequence"},
        {"tracks", QJsonArray{QJsonObject{
                       {"id", "video"}, {"type", "video"}, {"locked", false}}}},
        {"clips", QJsonArray{QJsonObject{{"id", "clip"},
                                         {"trackId", "video"},
                                         {"mediaType", "video"},
                                         {"startMs", 0},
                                         {"durationMs", 1000},
                                         {"locked", true}}}}};
    QCOMPARE(nt::aiassist::assistantEdit("ui_timeline_delete_clip", raw,
                                         {{"clipId", "clip"}}),
             raw);
    QCOMPARE(
        nt::aiassist::assistantEdit("ui_timeline_move_clip", raw,
                                    {{"clipId", "clip"}, {"startMs", 300}}),
        raw);
    auto clips = raw.value("clips").toArray();
    auto clip = clips.at(0).toObject();
    clip.insert("locked", false);
    clips[0] = clip;
    raw.insert("clips", clips);
    const auto moved = nt::aiassist::assistantEdit(
        "ui_timeline_move_clip", raw, {{"clipId", "clip"}, {"startMs", 300}});
    QCOMPARE(moved.value("clips")
                 .toArray()
                 .at(0)
                 .toObject()
                 .value("startMs")
                 .toDouble(),
             300.0);
    const auto removed = nt::aiassist::assistantEdit("ui_timeline_delete_clip",
                                                     raw, {{"clipId", "clip"}});
    QVERIFY(removed.value("clips").toArray().isEmpty());
    QCOMPARE(nt::aiassist::assistantTools().size(), 13);
  }
  void bridgeCommitsOneUndoAndRejectsStaleDocument() {
    const QString sequenceId = "123456789abc123456789abc12345678";
    QJsonObject raw{
        {"id", sequenceId},
        {"name", "Sequence"},
        {"fps", 30},
        {"width", 1920},
        {"height", 1080},
        {"durationMs", 1000},
        {"tracks", QJsonArray{QJsonObject{
                       {"id", "video"}, {"type", "video"}, {"name", "Video"}}}},
        {"clips", QJsonArray{QJsonObject{{"id", "clip"},
                                         {"trackId", "video"},
                                         {"name", "Clip"},
                                         {"mediaType", "video"},
                                         {"startMs", 0},
                                         {"durationMs", 1000}}}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    auto result = session.executeTool("ui_timeline_move_clip",
                                      {{"timeline_id", sequenceId.left(12)},
                                       {"target", "clip"},
                                       {"startMs", 250}});
    QVERIFY2(result.value("ok").toBool(),
             qPrintable(result.value("error").toString()));
    QCOMPARE(model.undoStack()->count(), 1);
    QCOMPARE(model.clipsJson().at(0).toObject().value("startMs").toDouble(),
             250.0);
    model.undoStack()->undo();
    QCOMPARE(model.clipsJson().at(0).toObject().value("startMs").toDouble(),
             0.0);
    model.setTimeline(*parsed.timeline);
    result =
        session.executeTool("ui_timeline_delete_clip",
                            {{"timeline_id", sequenceId}, {"target", "clip"}});
    QVERIFY(!result.value("ok").toBool());
    QCOMPARE(model.clipCount(), 1);
    result = session.executeHostTool("ui_timeline_delete_clip",
                                     {{"timeline_id", sequenceId}, {"target", "clip"}},
                                     "chat-tool-call");
    QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
    QCOMPARE(model.clipCount(), 0);
    model.undoStack()->undo();
    QCOMPARE(model.clipCount(), 1);
  }
  void localDocumentUsesHostIdentity() {
    TimelineModel model;
    AssistantSession session;
    session.setTimeline(&model);
    const auto id = QStringLiteral("native-local:%1").arg(model.documentGeneration());
    const auto result = session.executeHostTool("ui_timeline_get_state",
                                                 {{"timeline_id", id}}, "local-state");
    QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
    QCOMPARE(result.value("sequenceId").toString(), id);
  }
  void canonicalGenerationToolsUseLiveController() {
    const QString sequenceId = "123456789abc123456789abc12345678";
    const QString clipId = "23456789abcd123456789abc12345678";
    const QString takeId = "3456789abcde123456789abc12345678";
    const QJsonObject clip{{"id", clipId},
                           {"trackId", "video"},
                           {"name", "Clip"},
                           {"mediaType", "video"},
                           {"sourceType", "generated"},
                           {"bindingKind", "text-to-video"},
                           {"prompt", "City"},
                           {"provider", "test"},
                           {"model", "test"},
                           {"startMs", 0},
                           {"durationMs", 1000},
                           {"versions", QJsonArray{}}};
    const QJsonObject raw{
        {"id", sequenceId},
        {"tracks", QJsonArray{QJsonObject{{"id", "video"}, {"type", "video"}}}},
        {"clips", QJsonArray{clip}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    FakeAssistantGenerator generator;
    generator.source = &model;
    generator.candidates = {QVariantMap{{"id", takeId}, {"clipId", clipId}}};
    AssistantSession session;
    session.setTimeline(&model);
    session.setGenerationController(&generator);
    auto result = session.executeTool("ui_timeline_generatively_edit_clip",
                                      {{"timeline_id", sequenceId},
                                       {"clip_id", clipId.left(12)},
                                       {"instruction", "Night"},
                                       {"provider", "test"},
                                       {"model", "edit"}});
    QVERIFY(result.value("started").toBool());
    QCOMPARE(generator.operation, QString("edit"));
    QCOMPARE(generator.options.value("instruction").toString(),
             QString("Night"));
    QCOMPARE(model.undoStack()->count(), 0);
    generator.busy = false;
    result = session.executeTool("ui_timeline_apply_take",
                                 {{"timeline_id", sequenceId},
                                  {"clip_id", clipId},
                                  {"take_id", takeId.left(12)}});
    QVERIFY(result.value("started").toBool());
    QCOMPARE(generator.takeId, takeId);
    generator.resolving = false;
    result = session.executeTool("ui_timeline_set_clip_binding",
                                 {{"timeline_id", sequenceId},
                                  {"target", clipId},
                                  {"prompt", "Harbor"},
                                  {"regenerate", true}});
    QVERIFY(result.value("started").toBool());
    QCOMPARE(generator.operation, QString("regenerate"));
    QCOMPARE(model.undoStack()->count(), 1);
    generator.busy = false;
    result = session.executeTool("ui_timeline_generate_clip",
                                 {{"timeline_id", sequenceId},
                                  {"kind", "text-to-image"},
                                  {"prompt", "Mountain"},
                                  {"autoGenerate", false},
                                  {"trackId", "video"},
                                  {"width", 1024},
                                  {"height", 768}});
    QVERIFY(result.value("ok").toBool());
    QVERIFY(!result.value("started").toBool());
    QCOMPARE(model.clipCount(), 2);
    QCOMPARE(model.undoStack()->count(), 2);
    const auto draft = model.clipsJson().last().toObject();
    QCOMPARE(draft.value("width").toInt(), 1024);
    QCOMPARE(draft.value("trackId").toString(), QString("video"));
    const auto state =
        session
            .executeTool("ui_timeline_get_state", {{"timeline_id", sequenceId}})
            .value("generation")
            .toObject();
    QCOMPARE(state.value("candidates").toArray().size(), 1);
    TimelineModel other;
    generator.source = &other;
    result = session.executeTool("ui_timeline_apply_take",
                                 {{"timeline_id", sequenceId},
                                  {"clip_id", clipId},
                                  {"take_id", takeId}});
    QVERIFY(!result.value("ok").toBool());
  }
  void shortConversationIdsCheckEveryAuthorizedPage() {
    const QString timelineId = "123456789abc123456789abc12345678";
    const QJsonObject raw{
        {"id", timelineId}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    std::atomic<int> messageCalls = 0;
    session.setHistoryCall([&messageCalls,
                            timelineId](const QString &procedure,
                                        const QJsonObject &input) {
      if (procedure == "messages.list") {
        ++messageCalls;
        return nt::server::QueryResult{QJsonObject{{"messages", QJsonArray{}}},
                                       {}};
      }
      const bool later = !input.value("cursor").toString().isEmpty();
      const QString id = later ? "abcdefabcdef00000000000000000000"
                               : "abcdefabcdef11111111111111111111";
      return nt::server::QueryResult{
          QJsonObject{
              {"threads", QJsonArray{QJsonObject{{"id", id},
                                                 {"workflow_id", timelineId}}}},
              {"next", later ? QJsonValue::Null : QJsonValue("later")}},
          {}};
    });
    QVERIFY(session.listThreads());
    QTRY_VERIFY(!session.loadingHistory());
    QCOMPARE(session.threads().size(), 1);
    QVERIFY(session.loadThread("abcdefabcdef"));
    QTRY_VERIFY(!session.loadingHistory());
    QVERIFY(session.error().contains("ambiguous"));
    QCOMPARE(messageCalls.load(), 0);
  }
  void directorUsesCanonicalPromptAndStagesBeforeAdoption() {
    QFile file(QFileInfo(QString::fromUtf8(__FILE__)).absolutePath() +
               "/fixtures/assistant-planning-web.json");
    QVERIFY(file.open(QIODevice::ReadOnly));
    const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
    QCOMPARE(nt::aiassist::assistantDirectorRequest(
                 fixture.value("raw").toObject(), true, "nodetool",
                 "nodetool/director"),
             fixture.value("request").toObject());
    QCOMPARE(nt::aiassist::assistantDirectorBeats(
                 fixture.value("raw").toObject(),
                 fixture.value("result").toObject()),
             fixture.value("beats").toArray());
    const QJsonObject raw{{"id", "sequence"},
                          {"projectId", "project"},
                          {"name", "Film"},
                          {"fps", 30},
                          {"width", 1920},
                          {"height", 1080},
                          {"durationMs", 0},
                          {"tracks", QJsonArray{}},
                          {"clips", QJsonArray{}},
                          {"markers", QJsonArray{}},
                          {"createdAt", "date"},
                          {"updatedAt", "date"},
                          {"setup", QJsonObject{{"stage", "idea"},
                                                {"brief", "A harbor film"},
                                                {"format", "ad-15"}}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    int sends = 0;
    QString requestId;
    session.setPlanningSend([&](const QString &command, const QJsonObject &data,
                                const QString &id) {
      ++sends;
      requestId = id;
      return command == "generate_text" &&
             data.value("schema_name") == "screenplay";
    });
    const auto result = session.executeTool("ui_timeline_plan_beats",
                                            {{"timeline_id", "sequence"}});
    QVERIFY(result.value("approvalRequired").toBool());
    QCOMPARE(sends, 0);
    QCOMPARE(model.undoStack()->count(), 0);
    QVERIFY(session.approvePlanning(true));
    QCOMPARE(sends, 1);
    QCOMPARE(model.undoStack()->count(), 0);
    session.receive({{"type", "rpc_response"},
                     {"request_id", requestId},
                     {"result", fixture.value("result")}});
    QCOMPARE(session.planningReview().value("kind").toString(),
             QString("planCandidate"));
    QVERIFY(session.approvePlanning(true));
    QCOMPARE(model.undoStack()->count(), 1);
    QVERIFY(model.timeline().raw.value("clips").toArray().isEmpty());
    QCOMPARE(model.timeline()
                 .raw.value("setup")
                 .toObject()
                 .value("stage")
                 .toString(),
             QString("review"));
    const auto state = session.executeTool("ui_timeline_get_state",
                                           {{"timeline_id", "sequence"}});
    QCOMPARE(state.value("setup"), model.timeline().raw.value("setup"));
  }
  void reviewedBatchPersistsBeforeSpendAndResumesOnlyRemainingIds() {
    const QJsonObject beat{{"id", "123456789abc123456789abc12345678"},
                           {"prompt", "Harbor"},
                           {"duration_ms", 3000}};
    const QJsonObject raw{
        {"id", "sequence"},
        {"projectId", "project"},
        {"name", "Film"},
        {"fps", 30},
        {"width", 1920},
        {"height", 1080},
        {"durationMs", 0},
        {"tracks", QJsonArray{}},
        {"clips", QJsonArray{}},
        {"markers", QJsonArray{}},
        {"createdAt", "date"},
        {"updatedAt", "date"},
        {"setup",
         QJsonObject{
             {"stage", "review"},
             {"brief", "Film"},
             {"format", "ad-15"},
             {"beats",
              QJsonArray{beat,
                         QJsonObject{{"id", "223456789abc123456789abc12345678"},
                                     {"prompt", "Sea"},
                                     {"duration_ms", 2000}}}}}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    FakeAssistantGenerator generator;
    generator.source = &model;
    AssistantSession session;
    session.setTimeline(&model);
    session.setGenerationController(&generator);
    auto checkpoints = std::make_shared<QList<QJsonObject>>();
    session.setPlanningPersist(
        [checkpoints, &generator](const QJsonObject &checkpoint) {
          checkpoints->append(checkpoint);
          return generator.submittedIds.isEmpty() ||
                 !checkpoint.value("requests").toArray().isEmpty() ||
                 !checkpoint.value("active_request").toObject().isEmpty();
        });
    auto result = session.executeTool("ui_timeline_generate_from_beats",
                                      {{"timeline_id", "sequence"},
                                       {"provider", "test"},
                                       {"model", "video"},
                                       {"music", false}});
    QVERIFY(result.value("approvalRequired").toBool());
    QCOMPARE(model.undoStack()->count(), 0);
    QVERIFY(generator.submittedIds.isEmpty());
    QVERIFY(session.approvePlanning(true));
    QCOMPARE(model.undoStack()->count(), 1);
    QCOMPARE(generator.submittedIds.size(), 1);
    const auto firstId = generator.submittedIds.first();
    QVERIFY(firstId.startsWith("request:candidate:variation:"));
    QCOMPARE(generator.submittedProduction.first()
                 .toMap()
                 .value("identity")
                 .toMap()
                 .value("requestId")
                 .toString(),
             firstId);
    QVERIFY(!checkpoints->isEmpty());
    const auto checkpoint = checkpoints->last();
    QCOMPARE(checkpoint.value("active_request")
                 .toObject()
                 .value("request_id")
                 .toString(),
             firstId);
    const auto secondId = checkpoint.value("requests")
                              .toArray()
                              .first()
                              .toObject()
                              .value("request_id")
                              .toString();
    const auto changedClip = checkpoint.value("requests")
                                 .toArray()
                                 .first()
                                 .toObject()
                                 .value("clip_id")
                                 .toString();
    auto altered = model.timeline().raw;
    auto alteredClips = altered.value("clips").toArray();
    for (qsizetype i = 0; i < alteredClips.size(); ++i) {
      auto clip = alteredClips.at(i).toObject();
      if (clip.value("id").toString() == changedClip) {
        clip.insert("model", "changed-model");
        alteredClips[i] = clip;
      }
    }
    altered.insert("clips", alteredClips);
    const auto changedParsed =
        nt::parseTimelineJson(QJsonDocument(altered).toJson());
    QVERIFY(changedParsed.timeline.has_value());
    TimelineModel changedModel;
    changedModel.setTimeline(*changedParsed.timeline);
    AssistantSession changed;
    changed.setTimeline(&changedModel);
    changed.setGenerationController(&generator);
    changed.setPlanningPersist([](const QJsonObject &) { return true; });
    QVERIFY(!changed.restorePlanningCheckpoint(checkpoint));
    QCOMPARE(generator.submittedIds.size(), 1);
    QVERIFY(changed.error().contains("recipe changed"));
    auto tamperedCheckpoint = checkpoint;
    auto tamperedRequests = tamperedCheckpoint.value("requests").toArray();
    auto tamperedRequest = tamperedRequests.first().toObject();
    auto tamperedProduction = tamperedRequest.value("production").toObject();
    auto tamperedSnapshot = tamperedProduction.value("snapshot").toObject();
    tamperedSnapshot.insert("prompt", "Unreviewed prompt");
    tamperedProduction.insert("snapshot", tamperedSnapshot);
    tamperedRequest.insert("production", tamperedProduction);
    tamperedRequests[0] = tamperedRequest;
    tamperedCheckpoint.insert("requests", tamperedRequests);
    AssistantSession changedPolicy;
    changedPolicy.setTimeline(&model);
    changedPolicy.setGenerationController(&generator);
    changedPolicy.setPlanningPersist([](const QJsonObject &) { return true; });
    QVERIFY(!changedPolicy.restorePlanningCheckpoint(tamperedCheckpoint));
    QCOMPARE(generator.submittedIds.size(), 1);
    session.approvePlanning(false);
    AssistantSession reopened;
    reopened.setTimeline(&model);
    reopened.setGenerationController(&generator);
    reopened.setPlanningPersist([](const QJsonObject &) { return true; });
    QVERIFY(reopened.restorePlanningCheckpoint(checkpoint));
    QVERIFY(reopened.approvePlanning(true));
    QCOMPARE(model.undoStack()->count(), 1);
    QCOMPARE(generator.submittedIds.size(), 2);
    QCOMPARE(generator.submittedIds.last(), secondId);
    QVERIFY(secondId != firstId);
    generator.finish(false);
    QVERIFY(!reopened.m_generationQueueActive);
    QCOMPARE(generator.submittedIds.size(), 2);
    model.undoStack()->undo();
    QVERIFY(model.clipsJson().isEmpty());
  }
  void planningSnapshotAndFailedCheckpointPreventSpend() {
    const QJsonObject raw{
        {"id", "sequence"},
        {"tracks", QJsonArray{}},
        {"clips", QJsonArray{}},
        {"setup", QJsonObject{{"stage", "review"},
                              {"brief", "Film"},
                              {"format", "ad-15"},
                              {"beats", QJsonArray{QJsonObject{
                                            {"id", "beat"},
                                            {"prompt", "Sea"},
                                            {"duration_ms", 1000}}}}}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    FakeAssistantGenerator generator;
    generator.source = &model;
    AssistantSession session;
    session.setTimeline(&model);
    session.setGenerationController(&generator);
    session.setPlanningPersist([](const QJsonObject &) { return false; });
    QVERIFY(session
                .executeTool("ui_timeline_generate_from_beats",
                             {{"timeline_id", "sequence"},
                              {"provider", "test"},
                              {"model", "video"},
                              {"music", false}})
                .value("ok")
                .toBool());
    QVERIFY(!session.approvePlanning(true));
    QVERIFY(generator.submittedIds.isEmpty());
    QCOMPARE(model.undoStack()->count(), 0);
    session.setPlanningPersist([](const QJsonObject &) { return true; });
    model.setTimeline(*parsed.timeline);
    QVERIFY(!session.approvePlanning(true));
    QVERIFY(generator.submittedIds.isEmpty());
  }
  void preparedCutRespectsLinkedTracksAndUnusedImportedLocks() {
    const QJsonObject source{{"id", "source"},           {"trackId", "video"},
                             {"name", "Imported"},       {"mediaType", "video"},
                             {"sourceType", "imported"}, {"startMs", 0},
                             {"durationMs", 3000},       {"linkId", "pair"}};
    const QJsonObject audio{{"id", "audioClip"},        {"trackId", "audio"},
                            {"name", "Audio"},          {"mediaType", "audio"},
                            {"sourceType", "imported"}, {"startMs", 0},
                            {"durationMs", 3000},       {"linkId", "pair"}};
    const QJsonObject videoTrack{{"id", "video"},   {"name", "Video"},
                                 {"type", "video"}, {"index", 0},
                                 {"visible", true}, {"locked", false}};
    const QJsonObject audioTrack{{"id", "audio"},   {"name", "Audio"},
                                 {"type", "audio"}, {"index", 1},
                                 {"visible", true}, {"locked", true}};
    const QJsonObject beat{{"id", "beat"},
                           {"prompt", "Harbor"},
                           {"duration_ms", 2000},
                           {"source_clip_id", "source"}};
    QJsonObject raw{
        {"id", "sequence"},
        {"tracks", QJsonArray{videoTrack, audioTrack}},
        {"clips", QJsonArray{source, audio}},
        {"setup", QJsonObject{{"brief", "Film"}, {"beats", QJsonArray{beat}}}}};
    const auto original = raw;
    QVERIFY(nt::aiassist::assistantPrepareBeatCut(raw, {}).contains("error"));
    QCOMPARE(raw, original);
    auto unused = source;
    unused.remove("linkId");
    unused.insert("locked", true);
    auto generated = beat;
    generated.remove("source_clip_id");
    raw.insert("clips", QJsonArray{unused});
    raw.insert("tracks", QJsonArray{videoTrack});
    raw.insert("setup", QJsonObject{{"brief", "Film"},
                                    {"beats", QJsonArray{generated}}});
    QVERIFY(
        nt::aiassist::assistantPrepareBeatCut(
            raw, {{"provider", "test"}, {"model", "video"}, {"music", false}})
            .contains("error"));
    QCOMPARE(raw.value("clips")
                 .toArray()
                 .first()
                 .toObject()
                 .value("startMs")
                 .toDouble(),
             0.0);
  }
  void planningBeatTargetsRequireUniqueFullResourcePrefixes() {
    const QString id = "123456789abc123456789abc12345678";
    const QJsonObject beat{
        {"id", id}, {"prompt", "Sea"}, {"duration_ms", 2000}};
    QJsonObject raw{{"id", "sequence"},
                    {"setup", QJsonObject{{"stage", "review"},
                                          {"brief", "Film"},
                                          {"beats", QJsonArray{beat}}}}};
    const auto changed = nt::aiassist::assistantPlanningEdit(
        "ui_timeline_update_beat", raw,
        {{"beat", id.left(12)}, {"prompt", "Harbor"}});
    QCOMPARE(changed.value("setup")
                 .toObject()
                 .value("beats")
                 .toArray()
                 .first()
                 .toObject()
                 .value("prompt")
                 .toString(),
             QString("Harbor"));
    auto collision = beat;
    collision.insert("id", "123456789abc00000000000000000000");
    auto setup = raw.value("setup").toObject();
    setup.insert("beats", QJsonArray{beat, collision});
    raw.insert("setup", setup);
    QCOMPARE(nt::aiassist::assistantPlanningEdit(
                 "ui_timeline_update_beat", raw,
                 {{"beat", id.left(12)}, {"prompt", "Harbor"}}),
             raw);
  }
  void newlineLegacyConversationKeepsExactIdentity() {
    const QString legacy = QStringLiteral("abcdefabcdef\n");
    const QJsonObject raw{
        {"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    std::atomic<int> lists = 0, messages = 0;
    session.setHistoryCall([&](const QString &procedure,
                               const QJsonObject &input) {
      if (procedure == "threads.list") {
        ++lists;
        return nt::server::QueryResult{
            QJsonObject{{"threads",
                         QJsonArray{QJsonObject{{"id", legacy},
                                                {"workflow_id", "sequence"}}}},
                        {"next", QJsonValue::Null}},
            {}};
      }
      ++messages;
      return nt::server::QueryResult{
          QJsonObject{{"messages", QJsonArray{QJsonObject{
                                       {"thread_id", input.value("thread_id")},
                                       {"role", "assistant"},
                                       {"content", "Legacy"}}}},
                      {"next", QJsonValue::Null}},
          {}};
    });
    QVERIFY(session.listThreads());
    QTRY_VERIFY(!session.loadingHistory());
    QVERIFY(session.loadThread(legacy));
    QTRY_VERIFY(!session.loadingHistory());
    QCOMPARE(lists.load(), 1);
    QCOMPARE(messages.load(), 1);
    QVERIFY(session.history().contains("Legacy"));
  }
  void invalidProductionCannotCommitOrStartARequest() {
    const QJsonObject raw{
        {"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    std::atomic<int> reads = 0, sends = 0;
    session.setHistoryCall([&](const QString &, const QJsonObject &) {
      ++reads;
      return nt::server::QueryResult{};
    });
    session.setPlanningSend(
        [&](const QString &, const QJsonObject &, const QString &) {
          ++sends;
          return true;
        });
    for (const auto &production :
         QJsonArray{QJsonObject{{"speech_mode", "alien"}},
                    QJsonObject{{"duration_ms", -1}},
                    QJsonObject{{"reference_bindings",
                                 QJsonArray{QJsonObject{{"kind", "product"},
                                                        {"asset_id", 42}}}}}}) {
      const auto result = session.executeTool(
          "ui_timeline_plan_beats",
          {{"timeline_id", "sequence"},
           {"beats", QJsonArray{QJsonObject{{"prompt", "Sea"},
                                            {"durationMs", 1000},
                                            {"production", production}}}}});
      QVERIFY(!result.value("ok").toBool());
      QCOMPARE(model.timeline().raw, raw);
      QCOMPARE(model.undoStack()->count(), 0);
      QVERIFY(!model.applyEdit(
          "assistant.ui_timeline_plan_beats",
          {{"beats", QJsonArray{QJsonObject{{"prompt", "Sea"},
                                            {"durationMs", 1000},
                                            {"production", production}}}}}));
    }
    QCOMPARE(reads.load(), 0);
    QCOMPARE(sends.load(), 0);
  }
  void productionReferencesNormalizeThroughAuthorizedCanonicalReads() {
    const QString asset = "aaaaaaaaaaaa00000000000000000000",
                  entity = "bbbbbbbbbbbb11111111111111111111",
                  audio = "cccccccccccc22222222222222222222",
                  script = "dddddddddddd33333333333333333333",
                  line = "eeeeeeeeeeee44444444444444444444",
                  speaker = "ffffffffffff55555555555555555555";
    const QJsonObject raw{
        {"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    auto requests = std::make_shared<QList<QJsonObject>>();
    session.setHistoryCall([=](const QString &procedure,
                               const QJsonObject &input) {
      requests->append(QJsonObject{{"procedure", procedure}, {"input", input}});
      if (procedure == "assets.get") {
        const auto id = input.value("id").toString();
        for (const auto &full : {asset, entity, audio}) {
          if (id == full || id == full.left(12)) {
            return nt::server::QueryResult{QJsonObject{{"id", full}}, {}};
          }
        }
      }
      if (procedure == "scripts.list" &&
          input.value("timelineId") == "sequence") {
        return nt::server::QueryResult{QJsonArray{QJsonObject{{"id", script}}},
                                       {}};
      }
      if (procedure == "scripts.get" && input.value("id") == script) {
        const QJsonObject document{
            {"cast", QJsonArray{QJsonObject{{"id", speaker}, {"name", "Ada"}}}},
            {"sections",
             QJsonArray{QJsonObject{
                 {"lines", QJsonArray{QJsonObject{{"id", line},
                                                  {"speakerId", speaker},
                                                  {"text", "Hello"}}}}}}}};
        return nt::server::QueryResult{
            QJsonObject{{"id", script}, {"document", document}}, {}};
      }
      return nt::server::QueryResult{
          {}, {"Unexpected scoped read", "BAD_REQUEST", {}, 400}};
    });
    const QJsonObject production{
        {"speech_mode", "off_camera"},
        {"speech_binding", QJsonObject{{"script_line_id", line.left(12)},
                                       {"speaker_id", speaker.left(12)},
                                       {"audio_asset_id", audio.left(12)}}},
        {"reference_bindings",
         QJsonArray{QJsonObject{{"kind", "product"},
                                {"asset_id", asset.left(12)},
                                {"entity_id", entity.left(12)}}}},
        {"references", QJsonArray{QJsonObject{
                           {"uri", "asset://" + asset.left(12) + ".png"}}}}};
    const auto result = session.executeTool(
        "ui_timeline_plan_beats",
        {{"timeline_id", "sequence"},
         {"beats", QJsonArray{QJsonObject{{"prompt", "Harbor"},
                                          {"durationMs", 1000},
                                          {"production", production}}}}});
    QVERIFY(result.value("deferred").toBool());
    QCOMPARE(model.undoStack()->count(), 0);
    QTRY_VERIFY(!session.loadingHistory());
    QCOMPARE(model.undoStack()->count(), 1);
    const auto saved = model.timeline()
                           .raw.value("setup")
                           .toObject()
                           .value("beats")
                           .toArray()
                           .first()
                           .toObject()
                           .value("production")
                           .toObject();
    const auto binding =
        saved.value("reference_bindings").toArray().first().toObject();
    QCOMPARE(binding.value("asset_id").toString(), asset);
    QCOMPARE(binding.value("entity_id").toString(), entity);
    const auto speech = saved.value("speech_binding").toObject();
    QCOMPARE(speech.value("audio_asset_id").toString(), audio);
    QCOMPARE(speech.value("script_line_id").toString(), line);
    QCOMPARE(speech.value("speaker_id").toString(), speaker);
    QCOMPARE(saved.value("references")
                 .toArray()
                 .first()
                 .toObject()
                 .value("uri")
                 .toString(),
             "asset://" + asset + ".png");
    QVERIFY(model.clipsJson().isEmpty());
    bool queriedPrefix = false;
    for (const auto &request : *requests) {
      if (request.value("procedure") == "assets.get" &&
          request.value("input").toObject().value("id") == asset.left(12)) {
        queriedPrefix = true;
      }
    }
    QVERIFY(queriedPrefix);
    const auto fullResult = session.executeTool(
        "ui_timeline_plan_beats",
        {{"timeline_id", "sequence"},
         {"beats",
          QJsonArray{QJsonObject{
              {"prompt", "Full references"},
              {"durationMs", 1000},
              {"production", QJsonObject{{"reference_bindings",
                                          QJsonArray{QJsonObject{
                                              {"kind", "product"},
                                              {"asset_id", asset}}}}}}}}}});
    QVERIFY(fullResult.value("deferred").toBool());
    QTRY_VERIFY(!session.loadingHistory());
    QCOMPARE(model.undoStack()->count(), 2);
    QCOMPARE(requests->last().value("input").toObject().value("id").toString(),
             asset);
  }
  void ambiguousOrUnscopedProductionReferencesDoNotCommit() {
    const QJsonObject raw{
        {"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    session.setHistoryCall([](const QString &procedure, const QJsonObject &) {
      if (procedure == "scripts.list") {
        return nt::server::QueryResult{QJsonArray{}, {}};
      }
      return nt::server::QueryResult{
          {}, {"Ambiguous asset prefix", "CONFLICT", {}, 409}};
    });
    for (const auto &production : QJsonArray{
             QJsonObject{
                 {"reference_bindings",
                  QJsonArray{QJsonObject{{"kind", "product"},
                                         {"asset_id", "aaaaaaaaaaaa"}}}}},
             QJsonObject{{"speech_mode", "off_camera"},
                         {"speech_binding",
                          QJsonObject{{"script_line_id", "eeeeeeeeeeee"}}}}}) {
      const auto result = session.executeTool(
          "ui_timeline_plan_beats",
          {{"timeline_id", "sequence"},
           {"beats", QJsonArray{QJsonObject{{"prompt", "Sea"},
                                            {"durationMs", 1000},
                                            {"production", production}}}}});
      QVERIFY(result.value("deferred").toBool());
      QTRY_VERIFY(!session.loadingHistory());
      QCOMPARE(model.timeline().raw, raw);
      QCOMPARE(model.undoStack()->count(), 0);
      QVERIFY(!session.error().isEmpty());
    }
  }
  void staleProductionResolutionDoesNotWriteIntoReplacement() {
    const QJsonObject raw{
        {"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    QVERIFY(parsed.timeline.has_value());
    TimelineModel model;
    model.setTimeline(*parsed.timeline);
    AssistantSession session;
    session.setTimeline(&model);
    auto release = std::make_shared<QSemaphore>();
    auto started = std::make_shared<std::atomic_bool>(false),
         finished = std::make_shared<std::atomic_bool>(false);
    session.setHistoryCall([=](const QString &procedure,
                               const QJsonObject &input) {
      if (procedure != "assets.get" || input.value("id") != "aaaaaaaaaaaa") {
        return nt::server::QueryResult{
            {}, {"Unexpected read", "BAD_REQUEST", {}, 400}};
      }
      started->store(true);
      release->acquire();
      finished->store(true);
      return nt::server::QueryResult{
          QJsonObject{{"id", "aaaaaaaaaaaa00000000000000000000"}}, {}};
    });
    const auto result = session.executeTool(
        "ui_timeline_plan_beats",
        {{"timeline_id", "sequence"},
         {"beats", QJsonArray{QJsonObject{
                       {"prompt", "Sea"},
                       {"durationMs", 1000},
                       {"production",
                        QJsonObject{{"reference_bindings",
                                     QJsonArray{QJsonObject{
                                         {"kind", "product"},
                                         {"asset_id", "aaaaaaaaaaaa"}}}}}}}}}});
    QVERIFY(result.value("deferred").toBool());
    QTRY_VERIFY(started->load());
    auto next = *parsed.timeline;
    next.raw.insert("id", "replacement");
    model.setTimeline(next);
    release->release();
    QTRY_VERIFY(finished->load());
    QTest::qWait(20);
    QCOMPARE(model.timeline().raw.value("id").toString(),
             QString("replacement"));
    QVERIFY(!model.timeline().raw.contains("setup"));
    QCOMPARE(model.undoStack()->count(), 0);
  }
  void historyWireContractAndTextProjection() {
    const auto threads =
        AssistantSession::threadListInput("sequence", "cursor");
    QCOMPARE(threads.value("workflow_id").toString(), QString("sequence"));
    QVERIFY(!threads.contains("project_id"));
    QCOMPARE(threads.value("cursor").toString(), QString("cursor"));
    const auto messages = AssistantSession::messageListInput("thread", "older");
    QCOMPARE(messages.value("thread_id").toString(), QString("thread"));
    QCOMPARE(messages.value("reverse").toBool(), true);
    QCOMPARE(messages.value("limit").toInt(), 100);
    const QJsonArray page{
        QJsonObject{
            {"role", "assistant"},
            {"content",
             QJsonArray{QJsonObject{{"type", "text"}, {"text", "Done"}},
                        QJsonObject{{"type", "image"}, {"url", "private"}}}}},
        QJsonObject{{"role", "tool"}, {"content", "internal"}},
        QJsonObject{{"role", "user"}, {"content", "Edit"}}};
    QCOMPARE(AssistantSession::historyText(page),
             QString("You:\nEdit\n\nAssistant:\nDone\n\n"));
  }
  void historyLoadsOnlyAuthorizedTimelineThread() {
    const QString sequenceId = "123456789abc123456789abc12345678";
    const QString threadId = "abcdefabcdef123456789abc12345678";
    nt::Timeline document;
    document.raw = {{"id", sequenceId}};
    TimelineModel model;
    model.setTimeline(document);
    AssistantSession session;
    session.setTimeline(&model);
    session.setHistoryCall([sequenceId, threadId](const QString &procedure,
                                                  const QJsonObject &input) {
      if (procedure == "threads.list") {
        if (input.value("workflow_id").toString() != sequenceId) {
          return nt::server::QueryResult{
              {}, {"Wrong timeline scope", "BAD_REQUEST", {}, 400}};
        }
        return nt::server::QueryResult{
            QJsonObject{{"threads",
                         QJsonArray{QJsonObject{{"id", threadId},
                                                {"title", "This timeline"},
                                                {"workflow_id", sequenceId}},
                                    QJsonObject{{"id", "foreign"},
                                                {"title", "Other timeline"},
                                                {"workflow_id", "different"}}}},
                        {"next", QJsonValue::Null}},
            {}};
      }
      if (procedure != "messages.list" ||
          input.value("thread_id").toString() != threadId ||
          !input.value("reverse").toBool()) {
        return nt::server::QueryResult{
            {}, {"Wrong message request", "BAD_REQUEST", {}, 400}};
      }
      return nt::server::QueryResult{
          QJsonObject{{"messages",
                       QJsonArray{QJsonObject{{"thread_id", threadId},
                                              {"role", "assistant"},
                                              {"content", "Saved answer"}}}},
                      {"next", QJsonValue::Null}},
          {}};
    });
    QVERIFY(session.listThreads());
    QTRY_VERIFY(!session.loadingHistory());
    QCOMPARE(session.threads().size(), 1);
    QVERIFY(!session.loadThread("foreign"));
    QVERIFY(session.loadThread(threadId.left(12)));
    QTRY_VERIFY(!session.loadingHistory());
    QCOMPARE(session.history(), QString("Assistant:\nSaved answer\n\n"));
    QVERIFY(!session.hasOlderMessages());
    model.setTimeline(document);
    QVERIFY(session.history().isEmpty());
    QVERIFY(session.threads().isEmpty());
  }
  void disconnectedDoesNotSend() {
    AssistantSession session;
    QVERIFY(!session.send("Edit"));
    QVERIFY(!session.ready());
    QVERIFY(!session.busy());
    session.receive({{"type", "chunk"},
                     {"thread_id", "other"},
                     {"content", "wrong thread"}});
    QVERIFY(session.answer().isEmpty());
  }
};
QTEST_GUILESS_MAIN(AssistantSessionTest)
#include "tst_assistantsession.moc"
