// The music assistant tools (MUSIC-MODE.md section 15, GN-8) on the
// timeline's shared MusicJobs, against a scripted server on a real socket.
// The socket acknowledges text mode and records commands, as the server in
// tst_musicjobs does (CommandRouter.runRpc in packages/websocket
// session/commands.ts).

#include "midi/PatternExpand.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "music/MusicAssistant.h"
#include "music/MusicJobs.h"
#include "music/MusicTime.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>

using namespace nt::music;

namespace {

const QString kTimeline = QStringLiteral("99999999999900000000000000000009");
const QString kDrums = QStringLiteral("11111111111100000000000000000001");
const QString kBass = QStringLiteral("22222222222200000000000000000002");
const QString kKeys = QStringLiteral("33333333333300000000000000000003");
const QString kTwin = QStringLiteral("33333333333300000000000000000004");
const QString kClip = QStringLiteral("44444444444400000000000000000004");
constexpr qint64 kBar = 96000;  // 4/4 at 120 BPM

QJsonObject track(const QString& id, int index, const QString& role = {}) {
    QJsonObject t{{"id", id}, {"name", id.left(4)}, {"type", "audio"}, {"index", index}, {"visible", true}, {"locked", false}};
    if (!role.isEmpty()) t.insert("musicRole", role);
    return t;
}

QJsonObject sequence(const QJsonArray& tracks, const QJsonArray& clips, double bpm = 120, bool music = true) {
    QJsonObject s{{"id", kTimeline}, {"name", "Music"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 0},
                  {"tempo", QJsonObject{{"bpm", bpm}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
                  {"tracks", tracks},
                  {"clips", clips},
                  {"markers", QJsonArray{}}};
    if (music) s.insert("music", QJsonObject{});
    return s;
}

// An audio clip on `trackId` over bars [firstBar, lastBar], with an active take asset.
QJsonObject audioClip(const QString& id, const QString& trackId, int firstBar, int lastBar) {
    const double startMs = static_cast<double>((firstBar - 1) * kBar) / 48;
    const double durationMs = static_cast<double>((lastBar - firstBar + 1) * kBar) / 48;
    return {{"id", id}, {"trackId", trackId}, {"name", "loop"}, {"mediaType", "audio"}, {"sourceType", "imported"},
            {"startMs", startMs}, {"durationMs", durationMs}, {"inPointMs", 0}, {"outPointMs", durationMs},
            {"currentAssetId", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}};
}

std::unique_ptr<TimelineModel> model(const QJsonObject& document) {
    const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson(QJsonDocument::Compact));
    if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
    auto timeline = std::make_unique<TimelineModel>();
    timeline->setTimeline(*parsed.timeline);
    return timeline;
}

class Server : public QObject {
public:
    Server() : socket(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode) {
        socket.listen(QHostAddress::LocalHost, 0);
        connect(&socket, &QWebSocketServer::newConnection, this, [this] {
            peer = socket.nextPendingConnection();
            peer->setParent(&socket);
            connect(peer, &QWebSocket::textMessageReceived, this, [this](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") {
                    peer->sendTextMessage(R"({"message":"Mode set to text"})");
                } else {
                    messages.append(message);
                }
            });
        });
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(socket.serverPort())); }
    QList<QJsonObject> all(const QString& command) const {
        QList<QJsonObject> out;
        for (const auto& message : messages) {
            if (message.value("command") == command) out.append(message);
        }
        return out;
    }
    QWebSocketServer socket;
    QPointer<QWebSocket> peer;
    QList<QJsonObject> messages;
};

}  // namespace

class TestMusicAssistant : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;

    // The timeline's shared job module, pointed at the scripted server.
    MusicJobs& attach(TimelineModel& timeline, const Server& server) {
        auto* jobs = MusicJobs::forTimeline(&timeline);
        jobs->m_target = nt::server::SaveTarget{server.base(), {}, kTimeline, m_dir.filePath("server/user/timelines")};
        jobs->m_transport.configure(server.base());
        jobs->m_transport.open();
        return *jobs;
    }
    static QJsonObject run(const QString& tool, QJsonObject args, TimelineModel& timeline, MusicJobs& jobs) {
        args.insert("timeline_id", kTimeline);
        return assistant::run(tool, args, timeline, jobs);
    }

private slots:
    void pluginToolsAdvertised() {
        for (const auto* suffix : {"list_plugins", "load_plugin", "list_plugin_presets", "select_plugin_preset",
                                   "get_plugin_parameters", "set_plugin_parameters"}) {
            const auto name = QStringLiteral("ui_timeline_") + QString::fromLatin1(suffix);
            QVERIFY2(assistant::handles(name), qPrintable(name));
            bool found = false;
            for (const auto& tool : assistant::tools()) {
                if (tool.toMap().value("name").toString() == name) { found = true; }
            }
            QVERIFY(found);
        }
    }

    void reviewF20RowText_data() {
        QTest::addColumn<QString>("field"); QTest::addColumn<QJsonValue>("value");
        for (const auto& field : {QString("name"), QString("color")}) {
            QTest::newRow(qPrintable(field + "-number")) << field << QJsonValue(7);
            QTest::newRow(qPrintable(field + "-null")) << field << QJsonValue(QJsonValue::Null);
            QTest::newRow(qPrintable(field + "-object")) << field << QJsonValue(QJsonObject{});
        }
    }
    void reviewF20RowText() {
        QFETCH(QString, field); QFETCH(QJsonValue, value);
        auto t = track(kDrums, 0); t.insert("type", "midi");
        auto timeline = model(sequence(QJsonArray{t}, QJsonArray{QJsonObject{{"id", kClip}, {"trackId", kDrums},
            {"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 2000}, {"pattern", nt::midi::normalizePattern()}}}));
        MusicJobs jobs;
        const auto before = timeline->timeline().raw;
        const auto result = run("add_pattern_rows", {{"clipId", kClip}, {"rows", QJsonArray{QJsonObject{{"pitch", 60}, {field, value}}}}}, *timeline, jobs);
        QVERIFY(!result.value("ok").toBool());
        QCOMPARE(timeline->timeline().raw, before);
        QCOMPARE(timeline->undoStack()->count(), 0);
    }
    void reviewF26ClearStepRate() {
        auto t = track(kDrums, 0); t.insert("type", "midi");
        const auto pattern = nt::midi::normalizePattern({{"rows", QJsonArray{QJsonObject{{"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}},
            {"steps", QJsonArray{QJsonObject{{"on", true}, {"stepRate", "1/8"}}}}}}}});
        auto timeline = model(sequence(QJsonArray{t}, QJsonArray{QJsonObject{{"id", kClip}, {"trackId", kDrums},
            {"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 2000}, {"pattern", pattern}}}));
        MusicJobs jobs;
        const auto result = run("set_steps", {{"clipId", kClip}, {"row", "r"}, {"steps", QJsonArray{1}},
            {"values", QJsonObject{{"stepRate", QJsonValue::Null}}}}, *timeline, jobs);
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        const auto step = timeline->findClip(kClip)->raw.value("pattern").toObject().value("rows").toArray().first().toObject().value("steps").toArray().first().toObject();
        QVERIFY(!step.contains("stepRate"));
        QVERIFY(step.value("on").toBool());
        timeline->undoStack()->undo();
        QCOMPARE(timeline->findClip(kClip)->raw.value("pattern"), QJsonValue(pattern));
    }
    void reviewF22BusyGuards_data() {
        QTest::addColumn<int>("busy");
        QTest::newRow("drag") << 0;
        QTest::newRow("trim") << 1;
        QTest::newRow("take-recording") << 2;
    }
    void reviewF22BusyGuards() {
        QFETCH(int, busy);
        auto t = track(kDrums, 0); t.insert("type", "midi");
        auto timeline = model(sequence(QJsonArray{t}, QJsonArray{QJsonObject{{"id", kClip}, {"trackId", kDrums},
            {"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 2000}, {"pattern", nt::midi::normalizePattern()}}}));
        MusicJobs jobs;
        const nt::music::assistant::EditState state{busy == 0, busy == 1, busy == 2};
        const auto before = timeline->timeline().raw;
        const auto result = nt::music::assistant::run("set_pattern", {{"clipId", kClip}, {"name", "Edited"}}, *timeline, jobs, state);
        QVERIFY(!result.value("ok").toBool());
        QCOMPARE(timeline->timeline().raw, before);
        QCOMPARE(timeline->undoStack()->count(), 0);
        const auto read = nt::music::assistant::run("get_pattern", {{"clipId", kClip}}, *timeline, jobs, state);
        QVERIFY(read.value("ok").toBool());
    }
    void reviewF21CreationReportsCommittedId() {
        auto t = track(kDrums, 0); t.insert("type", "midi");
        auto timeline = model(sequence(QJsonArray{t}, {}));
        MusicJobs jobs;
        const auto result = run("apply_step_pattern", {{"trackId", kDrums}, {"pattern", "Boom Bap"}}, *timeline, jobs);
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        const auto clips = timeline->timeline().raw.value("clips").toArray();
        QCOMPARE(clips.size(), 1);
        QCOMPARE(result.value("clip").toObject().value("id"), clips.first().toObject().value("id"));
        const auto read = run("get_pattern", {{"clipId", result.value("clip").toObject().value("id")}}, *timeline, jobs);
        QVERIFY(read.value("ok").toBool());
    }
    void reviewF22UndoLabel() {
        auto t = track(kDrums, 0); t.insert("type", "midi");
        const auto pat = nt::midi::normalizePattern();
        auto timeline = model(sequence(QJsonArray{t}, QJsonArray{QJsonObject{{"id", kClip}, {"trackId", kDrums},
            {"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 2000}, {"pattern", pat}}}));
        MusicJobs jobs;
        const auto result = run("set_pattern", {{"clipId", kClip}, {"name", "Edited"}}, *timeline, jobs);
        QVERIFY(result.value("ok").toBool());
        QCOMPARE(timeline->undoStack()->undoText(), QString("Edit Step Pattern"));
    }
    void reviewF21RebasesBeforeCommand() {
        auto t = track(kDrums, 0); t.insert("type", "midi");
        const auto pat = nt::midi::normalizePattern();
        QJsonObject clip{{"id", kClip}, {"trackId", kDrums}, {"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 2000}, {"pattern", pat}};
        auto timeline = model(sequence(QJsonArray{t}, QJsonArray{clip}));
        MusicJobs jobs;
        QMetaObject::Connection connection;
        connection = connect(timeline.get(), &TimelineModel::beforeCommand, timeline.get(), [&] {
            disconnect(connection);
            auto updated = timeline->timeline().raw;
            updated.insert("name", "Committed by listener");
            const auto parsed = nt::parseTimeline(updated);
            QVERIFY(parsed.timeline.has_value());
            timeline->setTimeline(*parsed.timeline);
        });
        const auto result = nt::music::assistant::run("ui_timeline_set_pattern", {{"clipId", kClip}, {"name", "Edited"}}, *timeline, jobs);
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(timeline->timeline().raw.value("name").toString(), QString("Committed by listener"));
        timeline->undoStack()->undo();
        QCOMPARE(timeline->timeline().raw.value("name").toString(), QString("Committed by listener"));
        QCOMPARE(timeline->findClip(kClip)->raw.value("pattern").toObject().value("name"), pat.value("name"));
    }
    void initTestCase() {
        QVERIFY(m_dir.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", m_dir.filePath("preferences.ini").toUtf8());
    }

    void toolsAdvertiseSchemas() {
        const auto tools = assistant::tools();
        QStringList names;
        QVariantMap byName;
        for (const auto& value : tools) {
            const auto tool = value.toMap();
            const auto name = tool.value("name").toString();
            names.append(name);
            byName.insert(name, tool);
            const auto parameters = tool.value("parameters").toMap();
            QVERIFY(parameters.value("required").toStringList().contains("timeline_id"));
            QVERIFY(!tool.value("description").toString().isEmpty());
        }
        const QStringList expectedMusic{"ui_timeline_music_generate", "ui_timeline_music_regenerate",
                                        "ui_timeline_music_add_instrument"};
        const QStringList expectedPattern{
            "ui_timeline_get_pattern",           "ui_timeline_set_steps",          "ui_timeline_set_pattern_text",
            "ui_timeline_set_pattern",           "ui_timeline_add_pattern_rows",   "ui_timeline_clear_pattern",
            "ui_timeline_convert_pattern_to_midi", "ui_timeline_convert_midi_to_pattern",
            "ui_timeline_apply_step_pattern"};
        const QStringList expectedPlugins{"ui_timeline_list_plugins", "ui_timeline_load_plugin", "ui_timeline_list_plugin_presets",
                                          "ui_timeline_select_plugin_preset", "ui_timeline_get_plugin_parameters", "ui_timeline_set_plugin_parameters"};
        QCOMPARE(names, expectedMusic + expectedPattern + expectedPlugins);
        for (const auto& name : expectedMusic) {
            const auto parameters = byName.value(name).toMap().value("parameters").toMap();
            QCOMPARE(parameters.value("required").toStringList(),
                     QStringList({"timeline_id", "track_id", "start_bar", "end_bar", "prompt"}));
            const auto properties = parameters.value("properties").toMap();
            for (const auto* key : {"candidates", "seed", "model"}) QVERIFY(properties.contains(key));
        }
        for (const auto& name : names) QVERIFY(assistant::handles(name));
        for (const auto* bare : {"get_pattern", "set_steps", "set_pattern_text", "set_pattern", "add_pattern_rows",
                                 "clear_pattern", "convert_pattern_to_midi", "convert_midi_to_pattern",
                                 "apply_step_pattern"}) {
            QVERIFY(assistant::handles(QLatin1String(bare)));
        }
        QVERIFY(!assistant::handles("ui_timeline_run_command"));
        // Add instrument runs on the base model only, as in the panel.
        const auto lego = byName.value("ui_timeline_music_add_instrument")
                              .toMap()
                              .value("parameters")
                              .toMap()
                              .value("properties")
                              .toMap()
                              .value("model")
                              .toMap();
        QCOMPARE(lego.value("enum").toList().size(), 1);
    }

    // The bar range becomes the frames the panel sends, and the job goes through MusicJobs::submit.
    void generateSubmitsTheBarRange() {
        Server server;
        auto timeline = model(sequence({track(kDrums, 0, "drums"), track(kBass, 1, "bass")}, {}));
        auto& jobs = attach(*timeline, server);
        QVERIFY(MusicJobs::forTimeline(timeline.get()) == &jobs);
        QTRY_VERIFY(jobs.ready());

        // A short track id resolves; bars 3 to 4 are two bars.
        const auto result = run("ui_timeline_music_generate",
                                {{"track_id", kBass.left(12)}, {"start_bar", 3}, {"end_bar", 4}, {"prompt", "warm bass line"}, {"seed", 7}},
                                *timeline, jobs);
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        const auto jobId = result.value("job_id").toString();
        QVERIFY(!jobId.isEmpty());
        QCOMPARE(result.value("operation").toString(), QString("ui_timeline_music_generate"));
        QCOMPARE(result.value("track_id").toString(), kBass);
        const MusicTempo tempo;
        QCOMPARE(static_cast<qint64>(result.value("start_frame").toDouble()), barStartFrame(3, tempo));
        QCOMPARE(static_cast<qint64>(result.value("end_frame").toDouble()), barStartFrame(5, tempo));
        QCOMPARE(jobs.job(jobId).value("startFrame").toLongLong(), 2 * kBar);
        QCOMPARE(jobs.job(jobId).value("endFrame").toLongLong(), 4 * kBar);

        // The placeholder is in the document in the call's turn, one undo step.
        const auto clipId = result.value("clip_id").toString();
        const auto* clip = timeline->findClip(clipId);
        QVERIFY(clip);
        QCOMPARE(timeline->undoStack()->count(), 1);
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        const auto data = server.all("generate_media").first().value("data").toObject();
        QCOMPARE(data.value("provider").toString(), QString("acestep"));
        QCOMPARE(data.value("model").toString(), QString("acestep-v15-turbo-Q8_0.gguf"));
        QCOMPARE(data.value("prompt").toString(), QString("warm bass line"));
        const auto music = data.value("music").toObject();
        QCOMPARE(music.value("task").toString(), QString("text2music"));
        QCOMPARE(music.value("candidates").toInt(), 2);
        QCOMPARE(music.value("seed").toInteger(), 7);
    }

    // A sequence with no tempo object plans at DEFAULT_TEMPO, as the panel does.
    void generateWithoutATempoObject() {
        Server server;
        auto document = sequence({track(kBass, 0, "bass")}, {});
        document.remove("tempo");
        auto timeline = model(document);
        auto& jobs = attach(*timeline, server);
        QTRY_VERIFY(jobs.ready());
        const auto result = run("ui_timeline_music_generate",
                                {{"track_id", kBass}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "bass"}},
                                *timeline, jobs);
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(static_cast<qint64>(result.value("end_frame").toDouble()), 2 * kBar);
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        QCOMPARE(server.all("generate_media").first().value("data").toObject().value("music").toObject().value("bpm").toInt(), 120);
    }

    // Each tool asks the planner for its own operation and refuses with its message.
    void refusesWithThePlannersReason() {
        Server server;
        auto timeline = model(sequence({track(kDrums, 0, "drums"), track(kBass, 1), track(kKeys, 2, "keyboard")},
                                       {audioClip(kClip, kDrums, 1, 8)}));
        auto& jobs = attach(*timeline, server);
        QTRY_VERIFY(jobs.ready());

        // An empty range on the bass track: drums play there, so only Add instrument or Generate fit.
        auto refused = run("ui_timeline_music_regenerate", {{"track_id", kBass}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "x"}}, *timeline, jobs);
        QVERIFY(!refused.value("ok").toBool());
        QCOMPARE(refused.value("refusal").toString(), QString("no_clip"));
        QCOMPARE(refused.value("error").toString(), QString("Regenerate needs a range inside one clip."));
        QVERIFY(refused.value("valid_tools").toArray().contains(QJsonValue("ui_timeline_music_generate")));
        QVERIFY(!refused.value("valid_tools").toArray().contains(QJsonValue("ui_timeline_music_regenerate")));

        // The bass track has no role, so Add instrument cannot name the stem.
        refused = run("ui_timeline_music_add_instrument", {{"track_id", kBass}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "x"}}, *timeline, jobs);
        QCOMPARE(refused.value("refusal").toString(), QString("missing_role"));
        QCOMPARE(refused.value("error").toString(), QString("Add instrument needs a role on the target track."));

        // Generate over the drum clip.
        refused = run("ui_timeline_music_generate", {{"track_id", kDrums}, {"start_bar", 2}, {"end_bar", 3}, {"prompt", "x"}}, *timeline, jobs);
        QCOMPARE(refused.value("refusal").toString(), QString("occupied"));
        QVERIFY(!refused.value("error").toString().isEmpty());

        // A range past the drum clip's edge fits no operation.
        refused = run("ui_timeline_music_regenerate", {{"track_id", kDrums}, {"start_bar", 8}, {"end_bar", 9}, {"prompt", "x"}}, *timeline, jobs);
        QCOMPARE(refused.value("refusal").toString(), QString("partial_overlap"));

        QCOMPARE(timeline->undoStack()->count(), 0);
        QCOMPARE(jobs.jobs().size(), 0);
        QTest::qWait(50);
        QCOMPARE(server.all("generate_media").size(), 0);

        // Add instrument on a role track where the drums play: a job that bounces its context first.
        const auto added = run("ui_timeline_music_add_instrument", {{"track_id", kKeys}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "pads"}},
                               *timeline, jobs);
        QVERIFY2(added.value("ok").toBool(), qPrintable(added.value("error").toString()));
        QCOMPARE(added.value("model").toString(), QString("acestep-v15-base-Q8_0.gguf"));
        QCOMPARE(jobs.job(added.value("job_id").toString()).value("operation").toString(), QString("lego"));
        // Regenerate inside the drum clip.
        const auto again = run("ui_timeline_music_regenerate", {{"track_id", kDrums}, {"start_bar", 3}, {"end_bar", 4}, {"prompt", "fills"}, {"candidates", 1}},
                               *timeline, jobs);
        QVERIFY2(again.value("ok").toBool(), qPrintable(again.value("error").toString()));
        QCOMPARE(jobs.job(again.value("job_id").toString()).value("operation").toString(), QString("repaint"));
    }

    void refusesBadInput_data() {
        QTest::addColumn<QString>("tool");
        QTest::addColumn<QJsonObject>("args");
        QTest::addColumn<QString>("error");
        const QJsonObject base{{"track_id", kBass}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "x"}};
        const auto with = [&base](const char* key, const QJsonValue& value) {
            auto args = base;
            if (value.isUndefined()) args.remove(QLatin1String(key));
            else args.insert(QLatin1String(key), value);
            return args;
        };
        const QString generate = "ui_timeline_music_generate";
        QTest::newRow("bar zero") << generate << with("start_bar", 0) << "start_bar and end_bar must be whole bar numbers";
        QTest::newRow("fractional bar") << generate << with("end_bar", 1.5) << "start_bar and end_bar must be whole bar numbers";
        QTest::newRow("bar as text") << generate << with("start_bar", "1") << "start_bar and end_bar must be whole bar numbers";
        QTest::newRow("reversed") << generate << with("start_bar", 3) << "end_bar must be at or after start_bar";
        QTest::newRow("no prompt") << generate << with("prompt", " ") << "prompt must describe the music";
        QTest::newRow("candidates") << generate << with("candidates", 5) << "candidates must be from 1 to 4";
        QTest::newRow("seed") << generate << with("seed", -1) << "seed must be a whole number";
        QTest::newRow("model") << "ui_timeline_music_add_instrument" << with("model", "acestep-v15-turbo-Q8_0.gguf") << "model must be one of";
        QTest::newRow("unknown track") << generate << with("track_id", "55555555555500000000000000000005") << "is not on this timeline";
        QTest::newRow("ambiguous short id") << generate << with("track_id", kKeys.left(12)) << "matches more than one track";
        QTest::newRow("no track") << generate << with("track_id", QJsonValue::Undefined) << "track_id must be a track id";
    }
    void refusesBadInput() {
        QFETCH(QString, tool);
        QFETCH(QJsonObject, args);
        QFETCH(QString, error);
        Server server;
        auto timeline = model(sequence({track(kBass, 0), track(kKeys, 1, "keyboard"), track(kTwin, 2)}, {}));
        auto& jobs = attach(*timeline, server);
        const auto result = run(tool, args, *timeline, jobs);
        QVERIFY(!result.value("ok").toBool());
        QVERIFY2(result.value("error").toString().contains(error), qPrintable(result.value("error").toString()));
        QCOMPARE(timeline->undoStack()->count(), 0);
        QCOMPARE(jobs.jobs().size(), 0);
    }

    void refusesOutsideAMusicProject() {
        Server server;
        auto plain = model(sequence({track(kBass, 0)}, {}, 120, false));
        auto& jobs = attach(*plain, server);
        auto result = run("ui_timeline_music_generate", {{"track_id", kBass}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "x"}}, *plain, jobs);
        QVERIFY(result.value("error").toString().contains("not a music project"));
        // A tempo the music model cannot take.
        auto fractional = model(sequence({track(kBass, 0)}, {}, 87.5));
        auto& other = attach(*fractional, server);
        result = run("ui_timeline_music_generate", {{"track_id", kBass}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "x"}}, *fractional, other);
        QCOMPARE(result.value("refusal").toString(), QString("tempo"));
        QVERIFY(!result.value("error").toString().isEmpty());
    }

    // SQ55: all 9 native step sequencer assistant tools match TS SQ52/SQ54 vectors and errors.
    void stepSequencerToolsMatchTsVectors() {
        Server server;
        const QString kMidiTrack = QStringLiteral("55555555555500000000000000000005");
        const QString kPatClip = QStringLiteral("66666666666600000000000000000006");
        const QString kMidiClip = QStringLiteral("77777777777700000000000000000007");
        QJsonArray emptySteps;
        for (int i = 0; i < 16; ++i) emptySteps.append(QJsonObject{});
        const QJsonObject initPattern{
            {"version", 1}, {"seed", 1}, {"lengthSteps", 16}, {"stepRate", "1/16"}, {"playback", "forward"},
            {"legato", false}, {"swing", 0}, {"swingDivision", "1/16"}, {"pitchSource", "off"},
            {"scale", "chromatic"}, {"noTranspose", false}, {"scaleQuantize", false}, {"midiChannel", 1},
            {"automationMode", "latch"}, {"mono", false}, {"name", "Beat"},
            {"rows", QJsonArray{
                QJsonObject{{"id", "r1"}, {"name", "Kick"},
                            {"assignment", QJsonObject{{"type", "note"}, {"pitch", 36}}},
                            {"mute", false}, {"solo", false}, {"lengthSteps", 16}, {"loopStart", 0}, {"loopEnd", 16},
                            {"stepRate", "1/16"}, {"playback", "forward"}, {"midiChannel", 1},
                            {"automationMode", "latch"}, {"subrows", QJsonArray{"velocity", "gate"}},
                            {"steps", emptySteps}},
                QJsonObject{{"id", "r2"}, {"name", "Snare"},
                            {"assignment", QJsonObject{{"type", "note"}, {"pitch", 38}}},
                            {"mute", false}, {"solo", false}, {"lengthSteps", 16}, {"loopStart", 0}, {"loopEnd", 16},
                            {"stepRate", "1/16"}, {"playback", "forward"}, {"midiChannel", 1},
                            {"automationMode", "latch"}, {"subrows", QJsonArray{"velocity", "gate"}},
                            {"steps", emptySteps}}}}};
        const QJsonObject midiTrackObj{
            {"id", kMidiTrack}, {"name", "Drums"}, {"type", "midi"}, {"index", 0},
            {"visible", true}, {"locked", false}};
        const QJsonObject patClipObj{
            {"id", kPatClip}, {"trackId", kMidiTrack}, {"name", "Beat"}, {"mediaType", "midi"},
            {"sourceType", "imported"}, {"status", "generated"}, {"locked", false},
            {"startMs", 0.0}, {"durationMs", 2000.0}, {"inPointMs", 0.0}, {"outPointMs", 2000.0},
            {"pattern", initPattern}};
        const QJsonObject plainMidiClipObj{
            {"id", kMidiClip}, {"trackId", kMidiTrack}, {"name", "FourFloor"}, {"mediaType", "midi"},
            {"sourceType", "imported"}, {"status", "generated"}, {"locked", false},
            {"startMs", 2000.0}, {"durationMs", 2000.0}, {"inPointMs", 0.0}, {"outPointMs", 2000.0},
            {"notes", QJsonArray{
                QJsonObject{{"id", "n1"}, {"pitch", 36}, {"velocity", 100}, {"startTick", 0}, {"durationTick", 240}},
                QJsonObject{{"id", "n2"}, {"pitch", 36}, {"velocity", 100}, {"startTick", 960}, {"durationTick", 240}},
                QJsonObject{{"id", "n3"}, {"pitch", 36}, {"velocity", 100}, {"startTick", 1920}, {"durationTick", 240}},
                QJsonObject{{"id", "n4"}, {"pitch", 36}, {"velocity", 100}, {"startTick", 2880}, {"durationTick", 240}}}}};

        // Non-music project: Step Sequencer tools must work outside ACE-Step music projects too.
        auto timeline = model(sequence({midiTrackObj}, {patClipObj, plainMidiClipObj}, 120, false));
        auto& jobs = attach(*timeline, server);

        // 1. SQ52: set_steps with ramp velocity 20..80 over steps "1-4" -> [20, 40, 60, 80] and turned on.
        auto res = run("ui_timeline_set_steps",
                       {{"clipId", kPatClip.left(12)}, {"row", "Kick"}, {"steps", "1-4"},
                        {"ramp", QJsonObject{{"field", "velocity"}, {"from", 20}, {"to", 80}}}},
                       *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        QCOMPARE(timeline->undoStack()->count(), 1);
        const auto kickSteps = timeline->findClip(kPatClip)->raw.value("pattern").toObject()
                                   .value("rows").toArray().at(0).toObject().value("steps").toArray();
        QCOMPARE(kickSteps.at(0).toObject().value("velocity").toInt(), 20);
        QCOMPARE(kickSteps.at(1).toObject().value("velocity").toInt(), 40);
        QCOMPARE(kickSteps.at(2).toObject().value("velocity").toInt(), 60);
        QCOMPARE(kickSteps.at(3).toObject().value("velocity").toInt(), 80);
        for (int i = 0; i < 4; ++i) QVERIFY(kickSteps.at(i).toObject().value("on").toBool());

        // 2. SQ48: get_pattern with modes ["velocity"] returns 16 values per row.
        res = run("ui_timeline_get_pattern", {{"clipId", kPatClip}, {"modes", QJsonArray{"velocity"}}}, *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        QCOMPARE(res.value("rows").toArray().size(), 2);
        const auto velArr = res.value("rows").toArray().at(0).toObject().value("values").toObject().value("velocity").toArray();
        QCOMPARE(velArr.size(), 16);
        QCOMPARE(velArr.at(0).toInt(), 20);
        QCOMPARE(velArr.at(3).toInt(), 80);
        QCOMPARE(velArr.at(4).toInt(), 0);

        // 3. SQ52: set_pattern_text merge adds Clap row.
        res = run("ui_timeline_set_pattern_text",
                  {{"clipId", kPatClip}, {"text", "Clap: .... X... .... X..."}, {"mode", "merge"}},
                  *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        QCOMPARE(timeline->findClip(kPatClip)->raw.value("pattern").toObject().value("rows").toArray().size(), 3);

        // 4. SQ52: clear_pattern scope "row" mode "velocity" keeps steps on, clears velocity.
        res = run("ui_timeline_clear_pattern",
                  {{"clipId", kPatClip}, {"scope", "row"}, {"row", "Kick"}, {"mode", "velocity"}},
                  *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        const auto kickAfterClear = timeline->findClip(kPatClip)->raw.value("pattern").toObject()
                                        .value("rows").toArray().at(0).toObject().value("steps").toArray();
        QVERIFY(kickAfterClear.at(0).toObject().value("on").toBool());
        QVERIFY(!kickAfterClear.at(0).toObject().contains("velocity"));

        // 5. SQ50: set_pattern lengthSteps 32 repeats steps and stepRate "1/8" writes through to all rows.
        res = run("ui_timeline_set_pattern",
                  {{"clipId", kPatClip}, {"lengthSteps", 32}, {"stepRate", "1/8"}, {"swing", 40}},
                  *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        const auto patAfterSet = timeline->findClip(kPatClip)->raw.value("pattern").toObject();
        QCOMPARE(patAfterSet.value("lengthSteps").toInt(), 32);
        QCOMPARE(patAfterSet.value("stepRate").toString(), QStringLiteral("1/8"));
        QCOMPARE(patAfterSet.value("rows").toArray().at(0).toObject().value("stepRate").toString(), QStringLiteral("1/8"));
        QVERIFY(patAfterSet.value("rows").toArray().at(0).toObject().value("steps").toArray().at(16).toObject().value("on").toBool());

        // 6. SQ51: add_pattern_rows adds CC 74 row and refuses exceeding 128 rows.
        res = run("ui_timeline_add_pattern_rows",
                  {{"clipId", kPatClip}, {"rows", QJsonArray{QJsonObject{{"cc", 74}, {"name", "Cutoff"}}}}},
                  *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        QCOMPARE(timeline->findClip(kPatClip)->raw.value("pattern").toObject().value("rows").toArray().size(), 4);

        QJsonArray overflowRows;
        for (int i = 0; i < 126; ++i) overflowRows.append(QJsonObject{{"pitch", 36 + (i % 48)}});
        res = run("ui_timeline_add_pattern_rows", {{"clipId", kPatClip}, {"rows", overflowRows}}, *timeline, jobs);
        QVERIFY(!res.value("ok").toBool());
        QVERIFY2(res.value("error").toString().contains("128"), qPrintable(res.value("error").toString()));

        // 7. SQ21: convert_midi_to_pattern converts four-on-the-floor MIDI clip to pattern.
        res = run("ui_timeline_convert_midi_to_pattern",
                  {{"clipIds", QJsonArray{kMidiClip}}, {"stepRate", "1/16"}},
                  *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        const auto convertedPatClip = timeline->findClip(kMidiClip)->raw;
        QVERIFY(!convertedPatClip.contains("notes"));
        QVERIFY(convertedPatClip.value("pattern").isObject());
        QCOMPARE(convertedPatClip.value("pattern").toObject().value("rows").toArray().size(), 1);

        // 8. SQ20: convert_pattern_to_midi converts back to exact four-on-the-floor notes.
        res = run("ui_timeline_convert_pattern_to_midi", {{"clipIds", QJsonArray{kMidiClip}}}, *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        const auto backClip = timeline->findClip(kMidiClip)->raw;
        QVERIFY(!backClip.contains("pattern"));
        const auto backNotes = backClip.value("notes").toArray();
        QCOMPARE(backNotes.size(), 4);
        QCOMPARE(backNotes.at(0).toObject().value("pitch").toInt(), 36);
        QCOMPARE(backNotes.at(1).toObject().value("startTick").toInt(), 960);
        QCOMPARE(backNotes.at(2).toObject().value("startTick").toInt(), 1920);
        QCOMPARE(backNotes.at(3).toObject().value("startTick").toInt(), 2880);

        // 9. SQ54: apply_step_pattern "Boom Bap" loads factory library pattern onto clip and onto track.
        res = run("ui_timeline_apply_step_pattern",
                  {{"clipId", kPatClip}, {"pattern", "Boom Bap"}},
                  *timeline, jobs);
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        const auto boomBap = timeline->findClip(kPatClip)->raw.value("pattern").toObject();
        QCOMPARE(boomBap.value("name").toString(), QStringLiteral("Boom Bap"));
        QCOMPARE(boomBap.value("swing").toInt(), 36);
        QVERIFY(boomBap.value("rows").toArray().size() >= 3);

        // Refuses bad input (missing values & ramp) without pushing undo entry.
        const int undoBeforeErr = timeline->undoStack()->count();
        res = run("set_steps", {{"clipId", kPatClip}, {"row", "Kick"}, {"steps", "1-4"}}, *timeline, jobs);
        QVERIFY(!res.value("ok").toBool());
        QVERIFY(res.value("error").toString().contains("values"));
        QCOMPARE(timeline->undoStack()->count(), undoBeforeErr);

        // Undo reverses apply_step_pattern cleanly.
        timeline->undoStack()->undo();
        QCOMPARE(timeline->findClip(kPatClip)->raw.value("pattern").toObject().value("name").toString(), QStringLiteral("Beat"));
    }
};

QTEST_MAIN(TestMusicAssistant)
#include "tst_musicassistant.moc"
