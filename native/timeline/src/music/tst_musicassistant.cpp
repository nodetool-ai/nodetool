// The music assistant tools (MUSIC-MODE.md section 15, GN-8) on the
// timeline's shared MusicJobs, against a scripted server on a real socket.
// The socket acknowledges text mode and records commands, as the server in
// tst_musicjobs does (CommandRouter.runRpc in packages/websocket
// session/commands.ts).

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
    void initTestCase() {
        QVERIFY(m_dir.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", m_dir.filePath("preferences.ini").toUtf8());
    }

    void toolsAdvertiseSchemas() {
        const auto tools = assistant::tools();
        QStringList names;
        for (const auto& value : tools) {
            const auto tool = value.toMap();
            names.append(tool.value("name").toString());
            const auto parameters = tool.value("parameters").toMap();
            QCOMPARE(parameters.value("required").toStringList(),
                     QStringList({"timeline_id", "track_id", "start_bar", "end_bar", "prompt"}));
            const auto properties = parameters.value("properties").toMap();
            for (const auto* key : {"candidates", "seed", "model"}) QVERIFY(properties.contains(key));
            QVERIFY(!tool.value("description").toString().isEmpty());
        }
        QCOMPARE(names, QStringList({"ui_timeline_music_generate", "ui_timeline_music_regenerate", "ui_timeline_music_add_instrument"}));
        for (const auto& name : names) QVERIFY(assistant::handles(name));
        QVERIFY(!assistant::handles("ui_timeline_run_command"));
        // Add instrument runs on the base model only, as in the panel.
        const auto lego = tools.last().toMap().value("parameters").toMap().value("properties").toMap().value("model").toMap();
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
};

QTEST_MAIN(TestMusicAssistant)
#include "tst_musicassistant.moc"
