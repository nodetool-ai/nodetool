// MusicJobs and the music edits (MUSIC-MODE.md MD14, MD15, MD18, sections 9
// and 13) against a scripted server on a real socket. The server answers with
// the wire shapes of packages/websocket: `rpc_response` frames from
// CommandRouter.runRpc (session/commands.ts), `lookup_generations` rows with
// `music_status` while a row runs and `music_takes`/`timing` once it is
// complete (commands.ts lookup_generations), and takes as
// runMusicGeneration builds them (session/music-generation.ts). Take assets
// come from a scripted HTTP asset server, as tst_ai_controller serves them.
//
// MM3 exit 5: the placeholder appears in the submission's turn; eight tracks
//   play on the null backend through a whole job with no underrun.
// MM3 exit 6: a second job sent while the first runs is queued and runs after it.
// MM3 exit 7: undo after a result restores the placeholder, redo the takes,
//   and nothing asks the server to delete an asset.
// MM6: recovery on reopen, one resubmit of an interrupted acestep job, cancel,
//   retry, placement of an orphaned result, expected duration.

#include "assets/AssetWav.h"
#include "audio/AudioEngine.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "music/MusicEdits.h"
#include "music/MusicJobs.h"
#include "music/MusicTestServer.h"
#include "music/MusicTime.h"
#include "playback/AudioClockFeed.h"
#include "server/AutosaveController.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QUrlQuery>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>

#include <chrono>
#include <random>
#include <thread>

using namespace nt::music;
using namespace nt::music::testing;

namespace {

QString schemaError(const TimelineModel& timeline) {
    const auto root = QFileInfo(QFileInfo(QString::fromUtf8(__FILE__)).canonicalFilePath()).dir().absoluteFilePath("../../../..");
    QProcess validator;
    validator.setWorkingDirectory(root);
    validator.start("node", {QDir(root).filePath("node_modules/tsx/dist/cli.mjs"), QDir(root).filePath("native/timeline/src/ai/schema-check.ts")});
    if (!validator.waitForStarted()) return validator.errorString();
    auto document = nt::server::documentForSave(timeline.timeline().raw);
    // `mediaPath` is the prototype's local file (TimelineTypes.h), which a
    // server document never holds; the fixtures use it to give the bounce audio.
    QJsonArray clips;
    for (const auto& value : document.value("clips").toArray()) {
        auto clip = value.toObject();
        clip.remove("mediaPath");
        clips.append(clip);
    }
    document.insert("clips", clips);
    validator.write(QJsonDocument(document).toJson(QJsonDocument::Compact));
    validator.closeWriteChannel();
    if (!validator.waitForFinished(60000)) return validator.errorString();
    if (validator.exitStatus() != QProcess::NormalExit || validator.exitCode() != 0) {
        return QString::fromUtf8(validator.readAllStandardError());
    }
    return {};
}

QJsonObject track(const QString& id, int index, const QString& role = {}) {
    QJsonObject t{{"id", id}, {"name", id}, {"type", "audio"}, {"index", index}, {"visible", true}, {"locked", false}};
    if (!role.isEmpty()) t.insert("musicRole", role);
    return t;
}

QJsonObject sequence(const QJsonArray& tracks, const QJsonArray& clips) {
    return {{"id", "timeline"}, {"name", "Music"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 0},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}},
                                  {"key", QJsonObject{{"tonic", "A"}, {"mode", "minor"}}}}},
            {"music", QJsonObject{}},
            {"tracks", tracks},
            {"clips", clips},
            {"markers", QJsonArray{}}};
}

std::unique_ptr<TimelineModel> model(const QJsonObject& document) {
    const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson(QJsonDocument::Compact));
    if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
    auto timeline = std::make_unique<TimelineModel>();
    timeline->setTimeline(*parsed.timeline);
    return timeline;
}

QJsonObject clipById(const TimelineModel& timeline, const QString& id) {
    for (const auto& value : timeline.clipsJson()) {
        if (value.toObject().value("id").toString() == id) return value.toObject();
    }
    return {};
}

}  // namespace

class TestMusicJobs : public QObject {
    Q_OBJECT
    QTemporaryDir m_preferences;

    static void attach(MusicJobs& jobs, TimelineModel& timeline, const Server& server, const QString& backup) {
        jobs.setTimeline(&timeline);
        // The HTTP store serves assets; the socket goes to the WebSocket server.
        jobs.m_target = nt::server::SaveTarget{server.http.base(), {}, "timeline", backup + "/server/user/timelines"};
        jobs.restore();
        jobs.publish();
    }
    static void connectSocket(MusicJobs& jobs, const Server& server) {
        jobs.m_transport.configure(server.base());
        jobs.m_transport.open();
    }
    static QString state(const MusicJobs& jobs, const QString& id) { return jobs.job(id).value("state").toString(); }
    static QJsonObject request(const Server& server, int index = -1) {
        const auto sent = server.all("generate_media");
        return index < 0 ? sent.last() : sent.at(index);
    }
    static QString recordPath(const MusicJobs& jobs, const QString& id) { return jobs.recordPath(id); }
    static QJsonObject readRecord(const MusicJobs& jobs, const QString& id) {
        QFile file(recordPath(jobs, id));
        if (!file.open(QIODevice::ReadOnly)) return {};
        return QJsonDocument::fromJson(file.readAll()).object();
    }
    static QJsonArray generateDocumentTracks() {
        return {track("drums", 0, "drums"), track("bass", 1, "bass"), track("keys", 2, "keyboard")};
    }

private slots:
    void initTestCase() {
        QVERIFY(m_preferences.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", m_preferences.filePath("preferences.ini").toUtf8());
    }

    void placeholderEditRules() {
        auto timeline = model(sequence({track("a", 0), QJsonObject{{"id", "v"}, {"name", "v"}, {"type", "video"}, {"index", 1}, {"visible", true}, {"locked", false}},
                                        [] { auto t = track("locked", 2); t.insert("locked", true); return t; }()},
                                       {}));
        const auto clip = placeholderClip("p", "a", 4 * kBar, 12 * kBar, "dark synth pads", "acestep", "turbo");
        QCOMPARE(clip.value("status").toString(), QString("queued"));
        QCOMPARE(clip.value("audioRole").toString(), QString("music"));
        QCOMPARE(clip.value("fadeInMs").toDouble(), 5.0);
        QCOMPARE(clip.value("fadeOutMs").toDouble(), 5.0);
        QCOMPARE(clip.value("inPointMs").toDouble(), 0.0);
        QCOMPARE(clip.value("startMs").toDouble(), 8000.0);
        QCOMPARE(clip.value("durationMs").toDouble(), 16000.0);
        QCOMPARE(clip.value("outPointMs").toDouble(), 16000.0);
        QVERIFY(timeline->applyEdit("music.insertPlaceholder", {{"clip", clip}}));
        QCOMPARE(timeline->undoStack()->count(), 1);
        // The same id, an overlap, a video track and a locked track are refused.
        QVERIFY(!timeline->applyEdit("music.insertPlaceholder", {{"clip", clip}}));
        QVERIFY(!timeline->applyEdit("music.insertPlaceholder",
                                     {{"clip", placeholderClip("q", "a", 11 * kBar, 13 * kBar, "x", "acestep", "turbo")}}));
        QVERIFY(!timeline->applyEdit("music.insertPlaceholder",
                                     {{"clip", placeholderClip("r", "v", 0, kBar, "x", "acestep", "turbo")}}));
        QVERIFY(!timeline->applyEdit("music.insertPlaceholder",
                                     {{"clip", placeholderClip("s", "locked", 0, kBar, "x", "acestep", "turbo")}}));
        QVERIFY(timeline->applyEdit("music.insertPlaceholder",
                                    {{"clip", placeholderClip("t", "a", 12 * kBar, 13 * kBar, "x", "acestep", "turbo")}}));
        QCOMPARE(timeline->undoStack()->count(), 2);
        QVERIFY2(schemaError(*timeline).isEmpty(), qPrintable(schemaError(*timeline)));
    }

    // MD15 and TK-5 on the edit alone: repaint keeps the cut and records the original.
    void repaintResultKeepsTheCut() {
        QJsonObject source{{"id", "c"}, {"trackId", "a"}, {"name", "loop"}, {"mediaType", "audio"}, {"sourceType", "imported"},
                           {"startMs", 2000}, {"durationMs", 16000}, {"inPointMs", 1000}, {"outPointMs", 17000},
                           {"currentAssetId", assetId(1)}, {"volumeDb", -4}, {"fadeInMs", 30}, {"fadeOutMs", 40},
                           {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}};
        auto timeline = model(sequence({track("a", 0)}, {source}));
        const QJsonObject payload{{"clipId", "c"}, {"task", "repaint"}, {"requestId", "r1"}, {"jobId", "r1"},
            {"provider", "acestep"}, {"model", "turbo"}, {"prompt", "brighter"}, {"createdAt", "2026-11-12T00:00:00.000Z"},
            {"takes", QJsonArray{QJsonObject{{"assetId", assetId(2)}, {"candidate", 0}, {"segment", 0},
                                             {"record", takeRecord("repaint", 4 * kBar, 6 * kBar, 0, 0)}},
                                 QJsonObject{{"assetId", assetId(3)}, {"candidate", 1}, {"segment", 0},
                                             {"record", takeRecord("repaint", 4 * kBar, 6 * kBar, 1, 0)}}}}};
        QVERIFY(timeline->applyEdit("music.applyResult", payload));
        const auto clip = clipById(*timeline, "c");
        for (const auto* field : {"startMs", "durationMs", "inPointMs", "outPointMs", "volumeDb", "fadeInMs", "fadeOutMs", "status"}) {
            QCOMPARE(clip.value(field), source.value(field));
        }
        const auto versions = clip.value("versions").toArray();
        QCOMPARE(versions.size(), 3);
        QCOMPARE(versions[0].toObject().value("assetId").toString(), assetId(1));
        QCOMPARE(versions[0].toObject().value("source").toString(), QString("imported"));
        QVERIFY(!versions[0].toObject().contains("sourceMapping"));
        QCOMPARE(versions[1].toObject().value("parentTakeId"), versions[0].toObject().value("id"));
        QCOMPARE(versions[2].toObject().value("musicGeneration").toObject().value("candidateIndex").toInt(), 1);
        QVERIFY(!versions[1].toObject().contains("variationIndex"));
        QCOMPARE(clip.value("currentAssetId").toString(), assetId(2));
        QCOMPARE(clip.value("activeTakeId"), versions[1].toObject().value("id"));
        QVERIFY2(schemaError(*timeline).isEmpty(), qPrintable(schemaError(*timeline)));
        // Again: every asset is on the clip, so nothing changes.
        QVERIFY(!timeline->applyEdit("music.applyResult", payload));
        timeline->undoStack()->undo();
        QCOMPARE(clipById(*timeline, "c"), source);
        // A clip with no asset has no parent to repaint.
        auto empty = source;
        empty.remove("currentAssetId");
        auto bare = model(sequence({track("a", 0)}, {empty}));
        QVERIFY(!bare->applyEdit("music.applyResult", payload));
    }

    // MM3 exits 5 and 7, with the record, the request and the schema.
    void generateEndToEnd() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto id = jobs.submit("bass", 4 * kBar, 12 * kBar, {}, "warm upright bass", 2, 77, "acestep-v15-turbo");
        QVERIFY2(!id.isEmpty(), qPrintable(jobs.error()));
        // Same turn: no event has run since submit.
        const auto clipId = jobs.job(id).value("clipId").toString();
        const auto placeholder = clipById(*timeline, clipId);
        QCOMPARE(placeholder.value("status").toString(), QString("queued"));
        QCOMPARE(placeholder.value("trackId").toString(), QString("bass"));
        QCOMPARE(placeholder.value("startMs").toDouble(), frameToMs(4 * kBar));
        QCOMPARE(placeholder.value("durationMs").toDouble(), frameToMs(8 * kBar));
        QCOMPARE(timeline->undoStack()->count(), 1);
        QCOMPARE(state(jobs, id), QString("queued"));
        // The record precedes the request and holds all of it.
        const auto record = readRecord(jobs, id);
        QCOMPARE(record.value("state").toString(), QString("queued"));
        QVERIFY(record.value("sent").toBool());
        QCOMPARE(record.value("clipId").toString(), clipId);
        QVERIFY(QFileInfo(recordPath(jobs, id)).fileName().startsWith("timeline.music-job-"));

        QTRY_COMPARE(server.all("generate_media").size(), 1);
        const auto sent = request(server);
        QCOMPARE(sent.value("request_id").toString(), id);
        const auto data = sent.value("data").toObject();
        QCOMPARE(data, record.value("request").toObject());
        QCOMPARE(data.value("mode").toString(), QString("music"));
        QCOMPARE(data.value("provider").toString(), QString("acestep"));
        QCOMPARE(data.value("timeline_context").toObject().value("target_clip_id").toString(), clipId);
        const auto music = data.value("music").toObject();
        QCOMPARE(music.value("task").toString(), QString("text2music"));
        QCOMPARE(music.value("bpm").toInt(), 120);
        QCOMPARE(music.value("candidates").toInt(), 2);
        QCOMPARE(music.value("seed").toInt(), 77);
        QCOMPARE(music.value("window_start_frame").toInteger(), 4 * kBar);
        // 16 s target: one segment, and one beat of room for the alignment shift (GN-6).
        QCOMPARE(music.value("request_frames").toInteger(), 8 * kBar + 24000);
        QCOMPARE(music.value("segments").toArray(), (QJsonArray{QJsonObject{{"start_frame", 0}, {"end_frame", 8 * kBar}}}));
        QVERIFY(music.value("align").toBool());
        QCOMPARE(music.value("key").toObject().value("tonic").toString(), QString("A"));

        // The backend has the job but has not started it, then starts it.
        QTRY_VERIFY(!server.last("lookup_generations").isEmpty());
        QCOMPARE(server.last("lookup_generations").value("data").toObject().value("request_ids").toArray(), QJsonArray{id});
        server.lookupReply({QJsonObject{{"request_id", id}, {"status", "running"}, {"music_status", "queued"}, {"asset_ids", QJsonArray{}}}});
        QTRY_COMPARE(state(jobs, id), QString("queued"));
        server.lookupReply({QJsonObject{{"request_id", id}, {"status", "running"}, {"music_status", "running"}, {"asset_ids", QJsonArray{}}}});
        QTRY_COMPARE(state(jobs, id), QString("running"));
        server.result(id, "generate_media", server.takes(sent, 1));
        QTRY_COMPARE(state(jobs, id), QString("done"));
        QCOMPARE(timeline->undoStack()->count(), 2);
        const auto placed = clipById(*timeline, clipId);
        QCOMPARE(placed.value("status").toString(), QString("generated"));
        const auto versions = placed.value("versions").toArray();
        QCOMPARE(versions.size(), 2);
        QCOMPARE(placed.value("currentAssetId").toString(), assetId(1));
        QCOMPARE(versions[0].toObject().value("musicGeneration").toObject().value("targetStartFrame").toInteger(), 4 * kBar);
        QCOMPARE(versions[1].toObject().value("assetId").toString(), assetId(2));
        QCOMPARE(versions[1].toObject().value("musicGeneration").toObject().value("candidateIndex").toInt(), 1);
        for (const auto* field : {"startMs", "durationMs", "inPointMs", "outPointMs", "fadeInMs", "fadeOutMs", "audioRole", "trackId"}) {
            QCOMPARE(placed.value(field), placeholder.value(field));
        }
        // The active take plays: its asset was downloaded and registered.
        QVERIFY(!timeline->findClip(clipId)->audioPath.empty() || !timeline->findClip(clipId)->mediaPath.empty());
        QVERIFY2(schemaError(*timeline).isEmpty(), qPrintable(schemaError(*timeline)));
        QVERIFY(readRecord(jobs, id).value("takes").toArray().isEmpty());
        QCOMPARE(readRecord(jobs, id).value("state").toString(), QString("done"));

        // MM3 exit 7.
        timeline->undoStack()->undo();
        QCOMPARE(clipById(*timeline, clipId), placeholder);
        timeline->undoStack()->redo();
        QCOMPARE(clipById(*timeline, clipId), placed);
        for (const auto& recorded : server.http.requests()) {
            QVERIFY2(!recorded.target.contains("delete") && recorded.method != "DELETE", recorded.target.constData());
        }
        for (const auto& message : server.messages) {
            QVERIFY(!message.value("command").toString().contains("delete"));
        }
        // A late lookup of the finished job adds nothing.
        server.lookupReply({QJsonObject{{"request_id", id}, {"status", "completed"}, {"music_takes", server.takes(sent, 1).value("music_takes")}}});
        QTest::qWait(50);
        QCOMPARE(timeline->undoStack()->count(), 2);
        // The expected duration comes from the timing: 8.25 s for 16.5 s.
        QCOMPARE(jobs.expectedMs("text2music", "acestep-v15-turbo", 8 * kBar + 24000), 8250.0);
        QCOMPARE(jobs.expectedMs("text2music", "other-model", 8 * kBar + 24000), 0.0);
        QCOMPARE(jobs.expectedMs("repaint", "acestep-v15-turbo", 8 * kBar + 24000), 0.0);
    }

    // MM3 exit 5, second half (JB-1, AU-3).
    void playbackDuringJob() {
        QTemporaryDir cache;
        Server server;
        QJsonArray tracks;
        QJsonArray clips;
        for (int i = 0; i < 8; ++i) {
            const auto path = cache.filePath(QStringLiteral("t%1.wav").arg(i));
            QVERIFY(nt::assets::writeStereoFloatWav(path, noise(20 * 48000, 100 + i)));
            const auto id = QStringLiteral("t%1").arg(i);
            tracks.append(track(id, i));
            clips.append(QJsonObject{{"id", "c" + id}, {"trackId", id}, {"name", id}, {"mediaType", "audio"}, {"sourceType", "imported"},
                                     {"startMs", 0}, {"durationMs", 20000}, {"mediaPath", path}, {"status", "generated"},
                                     {"locked", false}, {"versions", QJsonArray{}}});
        }
        tracks.append(track("music", 8, "synth"));
        auto timeline = model(sequence(tracks, clips));
        nt::audio::AudioEngine engine;
        engine.setTimeline(timeline->snapshot());
        connect(timeline.get(), &TimelineModel::clipsChanged, this, [&] { engine.setTimelineAsync(timeline->snapshot()); });
        nt::audio::AudioEngine::Options options;
        options.backend = nt::audio::AudioEngine::Backend::Null;
        options.sampleRate = 48000;
        options.periodFrames = 480;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        nt::playback::TransportCommand command;
        command.seq = 1;
        command.seekSeq = 1;
        command.rate = 1.0;
        command.seekMs = 0;
        engine.feed().command.store(command);
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        command.seq = 2;
        command.playing = true;
        engine.feed().command.store(command);
        QTRY_VERIFY(engine.stats().playedFrames > 4800);

        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        // An empty range with other tracks sounding infers Add instrument; Generate is chosen.
        // Two bars at 120 BPM: three segments per candidate (GN-6, MM3 exit 2).
        // The range lies ahead of the playhead, inside the engine's lookahead:
        // a take placed under the playhead counts underruns until its new
        // voice is filled (AudioEngine.cpp: "Filling a new voice cannot hold
        // up publication"), which is the engine's rule, not this module's.
        const auto id = jobs.submit("music", 2 * kBar, 4 * kBar, "text2music", "arpeggio", 2, -1, "turbo");
        QVERIFY2(!id.isEmpty(), qPrintable(jobs.error()));
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        const auto music = request(server).value("data").toObject().value("music").toObject();
        QVERIFY(!music.contains("seed"));
        QCOMPARE(music.value("segments").toArray().size(), 3);
        QCOMPARE(music.value("request_frames").toInteger(), 6 * kBar + 24000);
        server.result(id, "generate_media", server.takes(request(server), 1));
        QTRY_COMPARE(state(jobs, id), QString("done"));
        QVERIFY2(engine.stats().playedFrames < 3 * 48000, "the job outlasted the lookahead before the range");
        // Play into the placed take and two seconds through it.
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().playedFrames > 6 * 48000, 15000);
        const auto stats = engine.stats();
        engine.stop();
        QCOMPARE(stats.underruns, std::int64_t(0));
        QCOMPARE(clipById(*timeline, jobs.job(id).value("clipId").toString()).value("versions").toArray().size(), 6);
    }

    // MM3 exit 6 (JB-3): the backend runs one job at a time from its FIFO, and
    // the provider reports a job queued behind an earlier one
    // (MUSIC-MODE.md 12.3, music-generation.ts `music_status`).
    void secondJobQueuesBehindTheFirst() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto first = jobs.submit("drums", 0, 8 * kBar, "text2music", "breakbeat", 1, 1, "turbo");
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        server.lookupReply({QJsonObject{{"request_id", first}, {"status", "running"}, {"music_status", "running"}}});
        QTRY_COMPARE(state(jobs, first), QString("running"));
        const auto second = jobs.submit("keys", 0, 8 * kBar, "text2music", "rhodes", 1, 2, "turbo");
        QVERIFY(!second.isEmpty());
        QCOMPARE(jobs.activeCount(), 2);
        QTRY_COMPARE(server.all("generate_media").size(), 2);
        // One lookup names both active jobs.
        QTRY_COMPARE(server.last("lookup_generations").value("data").toObject().value("request_ids").toArray().size(), 2);
        server.lookupReply({QJsonObject{{"request_id", second}, {"status", "running"}, {"music_status", "queued"}},
                            QJsonObject{{"request_id", first}, {"status", "running"}, {"music_status", "running"}}});
        QTRY_COMPARE(state(jobs, second), QString("queued"));
        QCOMPARE(state(jobs, first), QString("running"));
        server.result(first, "generate_media", server.takes(request(server, 0), 1));
        QTRY_COMPARE(state(jobs, first), QString("done"));
        QCOMPARE(state(jobs, second), QString("queued"));
        const auto lookups = server.all("lookup_generations").size();
        QTRY_VERIFY_WITH_TIMEOUT(server.all("lookup_generations").size() > lookups, 5000);
        QCOMPARE(server.last("lookup_generations").value("data").toObject().value("request_ids").toArray(), QJsonArray{second});
        server.lookupReply({QJsonObject{{"request_id", second}, {"status", "running"}, {"music_status", "running"}}});
        QTRY_COMPARE(state(jobs, second), QString("running"));
        server.result(second, "generate_media", server.takes(request(server, 1), 10));
        QTRY_COMPARE(state(jobs, second), QString("done"));
        QCOMPARE(jobs.activeCount(), 0);
        QCOMPARE(timeline->undoStack()->count(), 4);
    }

    void atMostEightActiveJobs() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        for (int i = 0; i < MusicJobs::kMaxActiveJobs; ++i) {
            QVERIFY2(!jobs.submit("drums", i * 8 * kBar, (i + 1) * 8 * kBar, "text2music", "beat", 1, i, "turbo").isEmpty(),
                     qPrintable(jobs.error()));
        }
        QVERIFY(jobs.submit("bass", 0, 8 * kBar, "text2music", "bass", 1, 1, "turbo").isEmpty());
        QVERIFY(jobs.error().contains("Eight"));
        QCOMPARE(jobs.activeCount(), 8);
        QCOMPARE(jobs.jobList()->rowCount(), 8);
        QTRY_COMPARE(server.all("generate_media").size(), 8);
    }

    // JB-2: the record survives the app, and a reopen places the result once.
    void recoveryOnReopen() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        QString id;
        QString clipId;
        {
            MusicJobs jobs;
            attach(jobs, *timeline, server, cache.path());
            connectSocket(jobs, server);
            QTRY_VERIFY(jobs.ready());
            id = jobs.submit("bass", 0, 8 * kBar, {}, "walking bass", 1, 5, "turbo");
            clipId = jobs.job(id).value("clipId").toString();
            QTRY_COMPARE(server.all("generate_media").size(), 1);
        }
        const auto sent = request(server);
        MusicJobs reopened;
        attach(reopened, *timeline, server, cache.path());
        QCOMPARE(state(reopened, id), QString("queued"));
        QCOMPARE(reopened.activeCount(), 1);
        connectSocket(reopened, server);
        QTRY_VERIFY(reopened.ready());
        // The reopen looks the job up and does not send it again.
        QTRY_VERIFY(!server.last("lookup_generations").isEmpty());
        QCOMPARE(server.last("lookup_generations").value("data").toObject().value("request_ids").toArray(), QJsonArray{id});
        QCOMPARE(server.all("generate_media").size(), 1);
        auto completed = server.takes(sent, 1);
        completed.insert("request_id", id);
        completed.insert("status", "completed");
        server.lookupReply({completed});
        QTRY_COMPARE(state(reopened, id), QString("done"));
        QCOMPARE(clipById(*timeline, clipId).value("versions").toArray().size(), 1);
        const auto undo = timeline->undoStack()->count();
        // A third open finds a finished job and places nothing again.
        MusicJobs third;
        attach(third, *timeline, server, cache.path());
        QCOMPARE(state(third, id), QString("done"));
        QCOMPARE(third.activeCount(), 0);
        QTest::qWait(50);
        QCOMPARE(timeline->undoStack()->count(), undo);
        QVERIFY(third.dismiss(id));
        QVERIFY(!QFile::exists(recordPath(third, id)));
    }

    // A reopen while the result is being placed places it again, and only once.
    void recoveryWhilePlacing() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "walking bass", 1, 5, "turbo");
        QVERIFY(!id.isEmpty());
        // Written by hand: the app quit with the takes in the record.
        auto record = readRecord(jobs, id);
        const auto takes = server.takes(QJsonObject{{"data", record.value("request")}}, 1);
        record.insert("state", "placing");
        record.insert("sent", true);
        record.insert("takes", takes.value("music_takes"));
        jobs.m_jobs.clear();
        {
            QFile file(recordPath(jobs, id));
            QVERIFY(file.open(QIODevice::WriteOnly));
            file.write(QJsonDocument(record).toJson());
        }
        MusicJobs reopened;
        attach(reopened, *timeline, server, cache.path());
        QTRY_COMPARE(state(reopened, id), QString("done"));
        const auto clipId = record.value("clipId").toString();
        QCOMPARE(clipById(*timeline, clipId).value("versions").toArray().size(), 1);
        QCOMPARE(server.all("generate_media").size(), 0);
    }

    // JB-2 second layer: one resubmit for acestep, then a failure with Retry.
    void interruptedJobResubmitsOnce() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "walking bass", 1, 5, "turbo");
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        QTRY_VERIFY(!server.last("lookup_generations").isEmpty());
        server.lookupReply({QJsonObject{{"request_id", id}, {"status", "interrupted"}, {"error", "Server restarted"}}});
        QTRY_COMPARE(server.all("generate_media").size(), 2);
        const auto second = request(server);
        const auto secondId = second.value("request_id").toString();
        QVERIFY(secondId != id);
        QCOMPARE(second.value("data"), request(server, 0).value("data"));
        QCOMPARE(jobs.job(id).value("resubmitCount").toInt(), 1);
        QCOMPARE(jobs.job(id).value("requestId").toString(), secondId);
        QCOMPARE(readRecord(jobs, id).value("requestId").toString(), secondId);
        QCOMPARE(state(jobs, id), QString("queued"));
        const auto lookups = server.all("lookup_generations").size();
        QTRY_VERIFY_WITH_TIMEOUT(server.all("lookup_generations").size() > lookups, 5000);
        server.lookupReply({QJsonObject{{"request_id", secondId}, {"status", "interrupted"}, {"error", "Server restarted"}}});
        QTRY_COMPARE(state(jobs, id), QString("failed"));
        QCOMPARE(server.all("generate_media").size(), 2);
        QVERIFY(jobs.job(id).value("error").toString().contains("Server restarted"));
        QVERIFY(jobs.job(id).value("canRetry").toBool());
        // The placeholder stays for the retry.
        const auto clipId = jobs.job(id).value("clipId").toString();
        QVERIFY(!clipById(*timeline, clipId).isEmpty());
        QVERIFY(jobs.retry(id));
        QTRY_COMPARE(server.all("generate_media").size(), 3);
        QVERIFY(request(server).value("request_id").toString() != secondId);
        QCOMPARE(jobs.job(id).value("resubmitCount").toInt(), 0);
        QCOMPARE(timeline->undoStack()->count(), 1);
    }

    void paidProviderNeverResubmits() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "walking bass", 1, 5, "turbo", {{"provider", "fal"}});
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        QCOMPARE(request(server).value("data").toObject().value("provider").toString(), QString("fal"));
        QTRY_VERIFY(!server.last("lookup_generations").isEmpty());
        server.lookupReply({QJsonObject{{"request_id", id}, {"status", "interrupted"}, {"error", ""}}});
        QTRY_COMPARE(state(jobs, id), QString("failed"));
        QCOMPARE(server.all("generate_media").size(), 1);
    }

    // JB-5.
    void errorShowsBackendTextAndRetries() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "walking bass", 1, 5, "turbo");
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        server.error(id, "generate_media", "ace-server: synth model not found");
        QTRY_COMPARE(state(jobs, id), QString("failed"));
        QCOMPARE(jobs.job(id).value("error").toString(), QString("ace-server: synth model not found"));
        QCOMPARE(readRecord(jobs, id).value("error").toString(), QString("ace-server: synth model not found"));
        QVERIFY(jobs.retry(id));
        QTRY_COMPARE(server.all("generate_media").size(), 2);
        const auto retried = request(server);
        QVERIFY(retried.value("request_id").toString() != id);
        QCOMPARE(retried.value("data"), request(server, 0).value("data"));
        server.result(retried.value("request_id").toString(), "generate_media", server.takes(retried, 1));
        QTRY_COMPARE(state(jobs, id), QString("done"));
        QVERIFY(jobs.job(id).value("error").toString().isEmpty());
        QVERIFY(!jobs.retry(id));
    }

    // JB-4.
    void cancelRemovesThePlaceholder() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "walking bass", 1, 5, "turbo");
        const auto clipId = jobs.job(id).value("clipId").toString();
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        QVERIFY(jobs.job(id).value("canCancel").toBool());
        QVERIFY(jobs.cancel(id));
        QTRY_COMPARE(server.all("cancel_generation").size(), 1);
        QCOMPARE(server.last("cancel_generation").value("data").toObject().value("request_ids").toArray(), QJsonArray{id});
        QCOMPARE(state(jobs, id), QString("cancelled"));
        QVERIFY(clipById(*timeline, clipId).isEmpty());
        QCOMPARE(timeline->undoStack()->count(), 2);
        // A late result for the cancelled request is dropped.
        server.result(id, "generate_media", server.takes(request(server), 1));
        QTest::qWait(100);
        QCOMPARE(timeline->undoStack()->count(), 2);
        QCOMPARE(state(jobs, id), QString("cancelled"));
        QVERIFY(!jobs.cancel(id));
        // Undo brings the placeholder back as the user's edit history says.
        timeline->undoStack()->undo();
        QVERIFY(!clipById(*timeline, clipId).isEmpty());
    }

    // 9.1: a result whose placeholder is gone stays in the record.
    void orphanedResultIsPlacedOnRequest() {
        QTemporaryDir cache;
        Server server;
        auto timeline = model(sequence(generateDocumentTracks(), {}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "walking bass", 2, 5, "turbo");
        const auto clipId = jobs.job(id).value("clipId").toString();
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        timeline->undoStack()->undo();
        QVERIFY(clipById(*timeline, clipId).isEmpty());
        server.result(id, "generate_media", server.takes(request(server), 1));
        QTRY_COMPARE(state(jobs, id), QString("done"));
        QCOMPARE(jobs.job(id).value("unplacedTakes").toInt(), 2);
        QVERIFY(jobs.job(id).value("canPlace").toBool());
        QVERIFY(jobs.job(id).value("error").toString().contains("placeholder"));
        QCOMPARE(readRecord(jobs, id).value("takes").toArray().size(), 2);
        const auto undo = timeline->undoStack()->index();
        QVERIFY(jobs.placeOrphan(id));
        // The clip and its takes come back in one undo step.
        QTRY_COMPARE(state(jobs, id), QString("done"));
        QCOMPARE(timeline->undoStack()->index(), undo + 1);
        const auto placed = clipById(*timeline, clipId);
        QCOMPARE(placed.value("versions").toArray().size(), 2);
        QCOMPARE(placed.value("status").toString(), QString("generated"));
        QCOMPARE(jobs.job(id).value("unplacedTakes").toInt(), 0);
        QVERIFY(!jobs.placeOrphan(id));
        timeline->undoStack()->undo();
        QVERIFY(clipById(*timeline, clipId).isEmpty());
    }

    // 9.2: a dry bounce is uploaded and sent with the region and the splice parent.
    void regenerateSendsTheDryBounce() {
        QTemporaryDir cache;
        Server server;
        const auto path = cache.filePath("source.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(path, noise(20 * 48000, 3)));
        // An 8-bar clip at bar 2 that plays its asset from 0.5 s.
        QJsonObject source{{"id", "loop"}, {"trackId", "keys"}, {"name", "loop"}, {"mediaType", "audio"}, {"sourceType", "imported"},
                           {"startMs", 2000}, {"durationMs", 16000}, {"inPointMs", 500}, {"outPointMs", 16500},
                           {"currentAssetId", assetId(9)}, {"mediaPath", path}, {"volumeDb", -6}, {"status", "generated"},
                           {"locked", false}, {"versions", QJsonArray{}}};
        auto timeline = model(sequence(generateDocumentTracks(), {source}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        // Bars 4 and 5, inside the clip.
        const auto id = jobs.submit("keys", 3 * kBar, 5 * kBar, {}, "brighter chords", 1, 3, "turbo");
        QVERIFY2(!id.isEmpty(), qPrintable(jobs.error()));
        QCOMPARE(jobs.job(id).value("operation").toString(), QString("repaint"));
        QCOMPARE(state(jobs, id), QString("rendering"));
        QCOMPARE(jobs.bands().size(), 1);
        QCOMPARE(jobs.bands().first().toMap().value("startFrame").toLongLong(), 3 * kBar);
        QCOMPARE(timeline->undoStack()->count(), 0);
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        QCOMPARE(server.uploads.size(), 1);
        QVERIFY(server.uploads.first().contains(R"("generation_context":"music")"));
        QVERIFY(server.uploads.first().contains(R"("bounce":"dry")"));
        const auto music = request(server).value("data").toObject().value("music").toObject();
        QCOMPARE(music.value("task").toString(), QString("repaint"));
        QCOMPARE(music.value("context_asset_id").toString(), assetId(0xc0001));
        QCOMPARE(jobs.job(id).value("state").toString(), QString("queued"));
        const auto window = music.value("window_start_frame").toInteger();
        const auto region = music.value("region").toObject();
        QCOMPARE(window + region.value("start_frame").toInteger(), 3 * kBar);
        QCOMPARE(window + region.value("end_frame").toInteger(), 5 * kBar);
        const auto splice = music.value("splice").toObject();
        QCOMPARE(splice.value("parent_asset_id").toString(), assetId(9));
        // inPointMs plus the distance from the clip start, in frames.
        QCOMPARE(splice.value("start_frame").toInteger(), 24000 + 2 * kBar);
        QCOMPARE(splice.value("end_frame").toInteger(), 24000 + 4 * kBar);
        server.result(id, "generate_media", server.takes(request(server), 1));
        QTRY_COMPARE(state(jobs, id), QString("done"));
        QVERIFY(jobs.bands().isEmpty());
        const auto clip = clipById(*timeline, "loop");
        for (const auto* field : {"startMs", "durationMs", "inPointMs", "outPointMs", "volumeDb"}) {
            QCOMPARE(clip.value(field), source.value(field));
        }
        QCOMPARE(clip.value("versions").toArray().size(), 2);
        QCOMPARE(clip.value("versions").toArray().first().toObject().value("assetId").toString(), assetId(9));
        QCOMPARE(clip.value("currentAssetId").toString(), assetId(1));
        QVERIFY2(schemaError(*timeline).isEmpty(), qPrintable(schemaError(*timeline)));
    }

    // 9.3: the mix bounce first, then the placeholder and the request.
    void addInstrumentBouncesThenPlaces() {
        QTemporaryDir cache;
        Server server;
        const auto path = cache.filePath("drums.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(path, noise(20 * 48000, 4)));
        QJsonObject drums{{"id", "beat"}, {"trackId", "drums"}, {"name", "beat"}, {"mediaType", "audio"}, {"sourceType", "imported"},
                          {"startMs", 0}, {"durationMs", 16000}, {"currentAssetId", assetId(8)}, {"mediaPath", path},
                          {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}};
        auto timeline = model(sequence(generateDocumentTracks(), {drums}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        connectSocket(jobs, server);
        QTRY_VERIFY(jobs.ready());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "fretless bass", 1, 3, "base");
        QVERIFY2(!id.isEmpty(), qPrintable(jobs.error()));
        QCOMPARE(jobs.job(id).value("operation").toString(), QString("lego"));
        QCOMPARE(state(jobs, id), QString("rendering"));
        const auto clipId = jobs.job(id).value("clipId").toString();
        QVERIFY(clipById(*timeline, clipId).isEmpty());
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        QVERIFY(server.uploads.first().contains(R"("bounce":"mix")"));
        QCOMPARE(clipById(*timeline, clipId).value("status").toString(), QString("queued"));
        const auto music = request(server).value("data").toObject().value("music").toObject();
        QCOMPARE(music.value("task").toString(), QString("lego"));
        QCOMPARE(music.value("track_role").toString(), QString("bass"));
        QCOMPARE(music.value("context_asset_id").toString(), assetId(0xc0001));
        QVERIFY(!music.contains("splice"));
        server.result(id, "generate_media", server.takes(request(server), 1));
        QTRY_COMPARE(state(jobs, id), QString("done"));
        const auto placed = clipById(*timeline, clipId);
        QCOMPARE(placed.value("status").toString(), QString("generated"));
        QCOMPARE(placed.value("startMs").toDouble(), 0.0);
        QCOMPARE(placed.value("durationMs").toDouble(), frameToMs(8 * kBar));
        QVERIFY2(schemaError(*timeline).isEmpty(), qPrintable(schemaError(*timeline)));
    }

    void cancelWhileRendering() {
        QTemporaryDir cache;
        Server server;
        const auto path = cache.filePath("drums.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(path, noise(20 * 48000, 4)));
        QJsonObject drums{{"id", "beat"}, {"trackId", "drums"}, {"name", "beat"}, {"mediaType", "audio"}, {"sourceType", "imported"},
                          {"startMs", 0}, {"durationMs", 16000}, {"currentAssetId", assetId(8)}, {"mediaPath", path},
                          {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}};
        auto timeline = model(sequence(generateDocumentTracks(), {drums}));
        MusicJobs jobs;
        attach(jobs, *timeline, server, cache.path());
        const auto id = jobs.submit("bass", 0, 8 * kBar, {}, "fretless bass", 1, 3, "base");
        QVERIFY(jobs.cancel(id));
        QCOMPARE(state(jobs, id), QString("cancelled"));
        QTest::qWait(100);
        QCOMPARE(server.all("generate_media").size(), 0);
        QCOMPARE(timeline->undoStack()->count(), 0);
        // A reopen of a job that died while rendering offers Retry.
        auto record = readRecord(jobs, id);
        record.insert("state", "rendering");
        {
            QFile file(recordPath(jobs, id));
            QVERIFY(file.open(QIODevice::WriteOnly));
            file.write(QJsonDocument(record).toJson());
        }
        MusicJobs reopened;
        attach(reopened, *timeline, server, cache.path());
        QCOMPARE(state(reopened, id), QString("failed"));
        QVERIFY(reopened.job(id).value("canRetry").toBool());
    }
};

QTEST_MAIN(TestMusicJobs)
#include "tst_musicjobs.moc"
