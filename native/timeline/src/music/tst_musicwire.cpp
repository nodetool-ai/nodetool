// The wired music panel in the mounted editor (docs/MUSIC-MODE.md section 15,
// parts 5 to 7, sections 9, 12.4 and 13), driven by synthetic pointer and key
// events against two scripted servers on real sockets (MusicTestServer.h): one
// for the timeline's MusicJobs, one for the editor's MusicSetupModel.
//
// - Generate submits the panel's values, records the prompt once, and the job
//   list shows queued, running and done while the placeholder shows its state.
// - Cancel removes the placeholder.
// - The take list lists the result's takes; a click activates one and Delete
//   removes a take from the clip without asking the server to delete an asset.
// - The prompt history keeps one copy of a prompt and at most 50.
// - Regenerate from a record sends the stored seed and audio codes (TK-4).
// - The setup view shows for a missing engine or models, follows progress, and
//   hides when the status is ready and for a remote backend (BE-5).
//
// The setup status mirrors packages/websocket/src/acestep-setup.ts status()
// and aceStepSetupResultSchema in packages/protocol/src/ws-commands.ts.
#include "wiring/WiringFixture.h"
#include "music/MusicEdits.h"
#include "music/MusicJobs.h"
#include "music/MusicSelection.h"
#include "music/MusicSetup.h"
#include "music/MusicTestServer.h"
#include "music/MusicTime.h"

#include <QFile>
#include <QJsonArray>
#include <QTemporaryDir>
#include <QUndoStack>

using namespace nt::music;
using namespace nt::music::testing;

namespace {

double barMs(qint64 bar) { return frameToMs((bar - 1) * kBar); }
qint64 barFrame(qint64 bar) { return (bar - 1) * kBar; }

QJsonObject audioTrack(const char* id, const char* name, int index, const char* role) {
    return {{"id", id}, {"name", name}, {"type", "audio"}, {"index", index}, {"visible", true}, {"locked", false},
            {"muted", false}, {"solo", false}, {"heightPx", 64}, {"musicRole", role}};
}

// A music sequence whose id is the save target's, with `clips`.
QJsonObject musicDocument(const QJsonArray& clips, const QJsonArray& history = {}) {
    return {{"id", "timeline"}, {"name", "Song"}, {"fps", 30}, {"width", 640}, {"height", 360},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0},
                                  {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}},
                                  {"key", QJsonObject{{"tonic", "A"}, {"mode", "minor"}}}}},
            {"music", QJsonObject{{"promptHistory", history}}},
            {"tracks", QJsonArray{audioTrack("a", "Drums", 0, "drums"), audioTrack("b", "Bass", 1, "bass"),
                                  audioTrack("c", "Keyboard", 2, "keyboard")}},
            {"markers", QJsonArray{}},
            {"clips", clips}};
}

QJsonObject modelSet(bool present, const QJsonArray& roles, double bytes) {
    return {{"present", present ? roles : QJsonArray{}}, {"missing", present ? QJsonArray{} : roles},
            {"approx_bytes", bytes}, {"missing_bytes", present ? 0.0 : bytes}};
}

// acestep-setup.ts status(): the binary, both model sets and the operation.
QJsonObject setupStatus(bool remote, bool installed, const QString& blocked, bool firstRun, bool base,
                        const QJsonValue& operation = QJsonValue::Null) {
    return {{"remote", remote},
            {"binary", QJsonObject{{"installed", installed},
                                   {"version", installed ? QJsonValue("07abf07") : QJsonValue::Null},
                                   {"blocked", blocked.isEmpty() ? QJsonValue::Null : QJsonValue(blocked)},
                                   {"message", blocked.isEmpty() ? QJsonValue::Null
                                                                 : QJsonValue("This NodeTool build has no ace-server release to install yet.")}}},
            {"models", QJsonObject{{"first_run", modelSet(firstRun, {"textEncoder", "languageModel", "ditTurbo", "vae"}, 7.7e9)},
                                   {"add_instrument", modelSet(base, {"ditBase"}, 4.8e9)},
                                   {"available", true}}},
            {"operation", operation}};
}

QJsonObject downloadOperation(const QString& state, double percent) {
    return {{"id", "op1"}, {"kind", "models"}, {"set", "first_run"}, {"state", state},
            {"stage", "Downloading acestep-v15-turbo-Q8_0.gguf"}, {"percent", percent},
            {"downloaded_bytes", 7.7e9 * percent / 100}, {"total_bytes", 7.7e9}, {"file", "acestep-v15-turbo-Q8_0.gguf"},
            {"file_index", 2}, {"file_count", 4}, {"error", QJsonValue::Null}, {"error_code", QJsonValue::Null}};
}

// A generated clip with two takes whose records carry seeds and audio codes.
QJsonObject generatedClip() {
    auto record = [](int candidate, int segment, qint64 start) {
        auto r = takeRecord("text2music", start, start + 4 * kBar, candidate, segment);
        r.insert("seed", 4242 + candidate);
        r.insert("audioCodes", QStringLiteral("codes-%1").arg(candidate));
        auto alignment = r.value("alignment").toObject();
        alignment.insert("drifting", candidate == 1);
        alignment.insert("lastBeatErrorMs", candidate == 1 ? 24.0 : 0.5);
        r.insert("alignment", alignment);
        return r;
    };
    auto take = [&](const char* id, int candidate, const char* label) {
        return QJsonObject{{"id", id}, {"assetId", assetId(0x500 + candidate)}, {"status", "success"},
                           {"createdAt", "2026-11-12T00:00:00.000Z"}, {"workflowUpdatedAt", "2026-11-12T00:00:00.000Z"},
                           {"jobId", "r0"}, {"dependencyHash", ""}, {"paramOverridesSnapshot", QJsonObject{}},
                           {"provider", "acestep"}, {"model", "acestep-v15-turbo-Q8_0.gguf"}, {"prompt", "warm keys"},
                           {"label", label}, {"source", "generated"},
                           // Segment 1 of a window that starts one take length before the clip.
                           {"musicGeneration", record(candidate, 1, barFrame(5))}};
    };
    return {{"id", "keys"}, {"trackId", "c"}, {"name", "warm keys"}, {"mediaType", "audio"}, {"sourceType", "generated"},
            {"startMs", barMs(5)}, {"durationMs", 8000}, {"inPointMs", 0}, {"outPointMs", 8000},
            {"audioRole", "music"}, {"status", "generated"}, {"locked", false},
            {"currentAssetId", assetId(0x500)}, {"activeTakeId", "t0"},
            {"versions", QJsonArray{take("t0", 0, "Take A2"), take("t1", 1, "Take B2")}}};
}

}  // namespace

class TestMusicWire : public WiringFixture {
    Q_OBJECT
    QTemporaryDir m_cache;

    // The timeline's one job module, which the panel reaches through MusicJobsRegistry.
    MusicJobs* jobs() { return MusicJobs::forTimeline(&model); }
    MusicSetupModel* setup() const {
        return qobject_cast<MusicSetupModel*>(view->rootObject()->property("musicSetup").value<QObject*>());
    }
    MusicSelection* selection() const { return gestures()->musicSelection(); }
    QQuickItem* panel() const { return item("musicPanel"); }
    QQuickItem* inPanel(const QString& name) const { return panel() ? named(panel(), name) : nullptr; }

    void openDocument(const QJsonObject& document) {
        auto parsed = nt::parseTimeline(document);
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        clock.pause();
        clock.seek(0);
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view->loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(view->status() == QQuickView::Ready, qPrintable(view->errors().isEmpty() ? QString() : view->errors().first().toString()));
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(1800, 1000);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        QTRY_VERIFY(gestures());
        QTRY_VERIFY(panel() && panel()->isVisible());
        QVERIFY(jobs());
        QVERIFY(setup());
    }
    // The job module talks to `server`: the HTTP store serves assets, the socket goes to the WebSocket.
    void connectJobs(Server& server) {
        jobs()->m_target = nt::server::SaveTarget{server.http.base(), {}, "timeline", m_cache.path() + "/server/user/timelines"};
        jobs()->m_transport.configure(server.base());
        jobs()->m_transport.open();
        QTRY_VERIFY(jobs()->ready());
    }
    // The setup state asks `server` and gets `status` back.
    void connectSetup(Server& server, const QJsonObject& status) {
        setup()->m_target = nt::server::SaveTarget{server.base(), {}, "timeline", m_cache.path()};
        setup()->refresh();
        QTRY_VERIFY(!server.last("acestep_setup_status").isEmpty());
        answerSetup(server, "acestep_setup_status", status);
    }
    static void answerSetup(Server& server, const QString& command, const QJsonObject& status, bool accepted = true,
                            const QString& reason = {}) {
        server.result(server.last(command).value("request_id").toString(), command,
                      {{"accepted", accepted}, {"reason", reason.isEmpty() ? QJsonValue::Null : QJsonValue(reason)},
                       {"status", status}});
    }
    // Scrolls the panel so `target` is on screen, then clicks its centre.
    void press(QQuickItem* target) {
        QVERIFY(target);
        auto* viewport = inPanel("musicPanelViewport");
        QVERIFY(viewport);
        for (auto* ancestor = target; ancestor; ancestor = ancestor->parentItem()) ancestor->ensurePolished();
        const auto top = target->mapToItem(viewport, QPointF(0, 0)).y();
        const double contentY = viewport->property("contentY").toDouble();
        const double maxY = std::max(0.0, viewport->property("contentHeight").toDouble() - viewport->height());
        viewport->setProperty("contentY", std::clamp(contentY + top - viewport->height() / 3, 0.0, maxY));
        QCoreApplication::processEvents();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(target));
        QCoreApplication::processEvents();
    }
    void typePrompt(const QString& text) {
        auto* field = inPanel("musicPrompt");
        press(field);
        QTRY_VERIFY(field->hasActiveFocus());
        for (const QChar c : text) QTest::keyClick(view.get(), c.toLatin1());
        QTRY_COMPARE(panel()->property("prompt").toString(), text);
    }
    QQuickItem* jobRow(const QString& id) const { return inPanel("musicJob_" + id); }
    QString jobText(const QString& id, const QString& part) const {
        auto* row = jobRow(id);
        auto* child = row ? named(row, part) : nullptr;
        return child ? child->property("text").toString() : QString();
    }
    QStringList history() const {
        QStringList out;
        for (const auto& value : doc().value("music").toObject().value("promptHistory").toArray()) out.append(value.toString());
        return out;
    }

private slots:
    void initTestCase() { QVERIFY(m_cache.isValid()); }
    void cleanup() { view.reset(); }

    // Part 5, 6 and the placeholder: the panel's values reach generate_media, and the job list follows.
    void generateSubmitsThePanelValues() {
        Server server;
        Server setupServer;
        openDocument(musicDocument({}, {"tight funk drums"}));
        selection()->set("c", barFrame(9), barFrame(13));
        QTRY_COMPARE(panel()->property("operation").toString(), QStringLiteral("text2music"));
        // No setup answer yet: the button is off and says why.
        QVERIFY(!inPanel("musicGenerate")->isEnabled());
        connectJobs(server);
        connectSetup(setupServer, setupStatus(false, true, {}, true, true));
        QTRY_COMPARE(setup()->state(), QStringLiteral("ready"));
        QVERIFY(!inPanel("musicGenerate")->isEnabled());
        QCOMPARE(inPanel("musicGenerateReason")->property("text").toString(), QStringLiteral("Describe the part to generate."));
        typePrompt("warm keys");
        press(inPanel("musicCandidatesMore"));
        QCOMPARE(panel()->property("candidates").toInt(), 3);
        // 4 bars at 120 BPM: two segments in a 16.5 s window, three candidates.
        QCOMPARE(inPanel("musicGenerate")->property("text").toString(), QStringLiteral("Generate 6 takes"));
        QTRY_VERIFY(inPanel("musicGenerate")->isEnabled());
        const auto undoBefore = model.undoStack()->count();
        press(inPanel("musicGenerate"));

        QTRY_COMPARE(server.all("generate_media").size(), 1);
        const auto sent = server.last("generate_media");
        const auto data = sent.value("data").toObject();
        const auto music = data.value("music").toObject();
        QCOMPARE(data.value("prompt").toString(), QStringLiteral("warm keys"));
        QCOMPARE(data.value("model").toString(), QStringLiteral("acestep-v15-turbo-Q8_0.gguf"));
        QCOMPARE(music.value("task").toString(), QStringLiteral("text2music"));
        QCOMPARE(music.value("candidates").toInt(), 3);
        QVERIFY(!music.contains("seed"));
        QCOMPARE(music.value("window_start_frame").toInteger(), barFrame(9));
        QCOMPARE(music.value("segments").toArray().size(), 2);
        // The prompt went into the history once, before the placeholder.
        QCOMPARE(history(), (QStringList{"warm keys", "tight funk drums"}));
        QCOMPARE(model.undoStack()->count(), undoBefore + 2);

        const auto id = sent.value("request_id").toString();
        const auto clipId = jobs()->job(id).value("clipId").toString();
        QTRY_VERIFY(jobRow(id));
        QCOMPARE(jobText(id, "musicJobState"), QStringLiteral("QUEUED"));
        QCOMPARE(jobText(id, "musicJobTitle"), QStringLiteral("Generate · Keyboard · bars 9–12"));
        QCOMPARE(jobText(id, "musicJobMeta"), QStringLiteral("Waiting for the job ahead"));
        QTRY_VERIFY(item("musicPlaceholderState-" + clipId));
        QCOMPARE(item("musicPlaceholderState-" + clipId)->property("text").toString(), QStringLiteral("Queued"));
        QTRY_VERIFY(!server.last("lookup_generations").isEmpty());
        server.lookupReply({QJsonObject{{"request_id", id}, {"status", "running"}, {"music_status", "running"}, {"asset_ids", QJsonArray{}}}});
        QTRY_COMPARE(jobText(id, "musicJobState"), QStringLiteral("RUNNING"));
        QVERIFY(jobText(id, "musicJobMeta").endsWith("elapsed · no estimate yet"));
        QTRY_COMPARE(item("musicPlaceholderState-" + clipId)->property("text").toString(), QStringLiteral("Running"));
        server.result(id, "generate_media", server.takes(sent, 1));
        QTRY_COMPARE(jobText(id, "musicJobState"), QStringLiteral("DONE"));
        QCOMPARE(jobText(id, "musicJobMeta"), QStringLiteral("6 takes placed · seed 1000"));
        QCOMPARE(clip(clipId).value("status").toString(), QStringLiteral("generated"));
        const auto versions = clip(clipId).value("versions").toArray();
        QCOMPARE(versions.size(), 6);
        QCOMPARE(versions[0].toObject().value("label").toString(), QStringLiteral("Take A1"));
        QCOMPARE(versions[5].toObject().value("label").toString(), QStringLiteral("Take C2"));
        // The active take names itself on the clip, and the take badge counts.
        QTRY_VERIFY(item("musicTakeHeader-" + clipId) && item("musicTakeHeader-" + clipId)->isVisible());
        QTRY_VERIFY(item("takeBadge-" + clipId) && item("takeBadge-" + clipId)->isVisible());

        // The take list of the clip under the range: click activates, Delete keeps the asset (part 7).
        selection()->set("c", barFrame(10), barFrame(11));
        QTRY_VERIFY(inPanel("musicTake_5"));
        QCOMPARE(panel()->findChild<QObject*>("musicPanelModel")->property("takeClipId").toString(), clipId);
        auto* second = named(inPanel("musicTake_1"), "musicTakeSelect");
        QCOMPARE(second->property("text").toString(), QStringLiteral("Take A2"));
        QCOMPARE(named(inPanel("musicTake_1"), "musicTakeMeta")->property("text").toString(), QStringLiteral("seed 1000 · +0 ms"));
        const auto undoBeforeTakes = model.undoStack()->count();
        press(second);
        QTRY_COMPARE(clip(clipId).value("activeTakeId"), versions[1].toObject().value("id"));
        QCOMPARE(clip(clipId).value("currentAssetId"), versions[1].toObject().value("assetId"));
        QCOMPARE(clip(clipId).value("status").toString(), QStringLiteral("generated"));
        QCOMPARE(model.undoStack()->count(), undoBeforeTakes + 1);
        // The active take cannot be deleted; another can, and its asset stays.
        QTRY_VERIFY(!named(inPanel("musicTake_1"), "musicTakeDelete")->isEnabled());
        const auto requestsBefore = server.http.requests().size();
        press(named(inPanel("musicTake_3"), "musicTakeDelete"));
        QTRY_COMPARE(clip(clipId).value("versions").toArray().size(), 5);
        for (const auto& value : clip(clipId).value("versions").toArray()) {
            QVERIFY(value.toObject().value("id") != versions[3].toObject().value("id"));
        }
        QCOMPARE(model.undoStack()->count(), undoBeforeTakes + 2);
        for (std::size_t i = requestsBefore; i < server.http.requests().size(); ++i) {
            QVERIFY(server.http.requests()[i].method != "DELETE");
        }
        for (const auto& message : server.messages) QVERIFY(!message.value("command").toString().contains("delete"));
        model.undoStack()->undo();
        QCOMPARE(clip(clipId).value("versions").toArray().size(), 6);
    }

    // Cancel on a queued job removes its placeholder in one step (JB-4).
    void cancelRemovesThePlaceholder() {
        Server server;
        Server setupServer;
        openDocument(musicDocument({}));
        connectJobs(server);
        connectSetup(setupServer, setupStatus(false, true, {}, true, true));
        selection()->set("c", barFrame(9), barFrame(13));
        typePrompt("slow pads");
        QTRY_VERIFY(inPanel("musicGenerate")->isEnabled());
        press(inPanel("musicGenerate"));
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        const auto id = server.last("generate_media").value("request_id").toString();
        const auto clipId = jobs()->job(id).value("clipId").toString();
        QVERIFY(!clip(clipId).isEmpty());
        QTRY_VERIFY(jobRow(id) && named(jobRow(id), "musicJobCancel")->isVisible());
        press(named(jobRow(id), "musicJobCancel"));
        QTRY_COMPARE(jobText(id, "musicJobState"), QStringLiteral("CANCELLED"));
        QVERIFY(clip(clipId).isEmpty());
        QTRY_COMPARE(server.all("cancel_generation").size(), 1);
        QCOMPARE(server.last("cancel_generation").value("data").toObject().value("request_ids").toArray(), QJsonArray{id});
        QCOMPARE(jobText(id, "musicJobMeta"), QStringLiteral("Cancelled"));
        QVERIFY(named(jobRow(id), "musicJobRetry")->isVisible());
    }

    // TK-6: the edit keeps one copy of a prompt, newest first, and at most 50.
    void promptHistoryIsWrittenOnceAndCapped() {
        QJsonArray full;
        for (int i = 0; i < kPromptHistoryCap; ++i) full.append(QStringLiteral("prompt %1").arg(i));
        Server setupServer;
        openDocument(musicDocument({}, full));
        QVERIFY(model.applyEdit("music.recordPrompt", {{"prompt", "  new idea  "}}));
        auto list = history();
        QCOMPARE(list.size(), kPromptHistoryCap);
        QCOMPARE(list.first(), QStringLiteral("new idea"));
        QCOMPARE(list.last(), QStringLiteral("prompt 48"));
        // Again: no change and no undo step.
        const auto undo = model.undoStack()->count();
        QVERIFY(!model.applyEdit("music.recordPrompt", {{"prompt", "new idea"}}));
        QCOMPARE(model.undoStack()->count(), undo);
        // An older prompt moves to the front once.
        QVERIFY(model.applyEdit("music.recordPrompt", {{"prompt", "prompt 10"}}));
        list = history();
        QCOMPARE(list.size(), kPromptHistoryCap);
        QCOMPARE(list.first(), QStringLiteral("prompt 10"));
        QCOMPARE(list.count("prompt 10"), 1);
        QVERIFY(!model.applyEdit("music.recordPrompt", {{"prompt", "   "}}));
        // The panel shows the four newest as chips; a click fills the prompt.
        selection()->set("c", barFrame(9), barFrame(13));
        QTRY_VERIFY(inPanel("musicPromptHistory_3"));
        QVERIFY(!inPanel("musicPromptHistory_4"));
        press(inPanel("musicPromptHistory_1"));
        QTRY_COMPARE(panel()->property("prompt").toString(), QStringLiteral("new idea"));
        // A sequence without the music object keeps no history.
        auto plain = musicDocument({});
        plain.remove("music");
        auto parsed = nt::parseTimeline(plain);
        QVERIFY(parsed.timeline);
        TimelineModel other;
        other.setTimeline(std::move(*parsed.timeline));
        QVERIFY(!other.applyEdit("music.recordPrompt", {{"prompt", "x"}}));
    }

    // TK-4: Regenerate from a record resends its task, range, prompt and model; the
    // same seed also sends the stored audio codes, a new seed sends neither.
    void regenerateFromRecord() {
        Server server;
        openDocument(musicDocument({generatedClip()}));
        connectJobs(server);
        selection()->set("c", barFrame(6), barFrame(7));
        QTRY_VERIFY(inPanel("musicTake_1"));
        // The drifting take is badged.
        QVERIFY(named(inPanel("musicTake_1"), "musicTakeDrifting")->isVisible());
        QVERIFY(!named(inPanel("musicTake_0"), "musicTakeDrifting")->isVisible());
        QVERIFY(item("musicTakeHeader-keys")->isVisible());
        // Same seed through the take's menu.
        press(named(inPanel("musicTake_1"), "musicTakeRegenerate"));
        QQuickItem* same = nullptr;
        QTRY_VERIFY((same = item("musicTakeSameSeed")) && same->isVisible());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(same));
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        auto sent = server.last("generate_media");
        auto data = sent.value("data").toObject();
        auto music = data.value("music").toObject();
        QCOMPARE(music.value("task").toString(), QStringLiteral("text2music"));
        QCOMPARE(music.value("seed").toInteger(), 4243);
        QCOMPARE(music.value("audio_codes").toString(), QStringLiteral("codes-1"));
        QCOMPARE(music.value("candidates").toInt(), 1);
        QCOMPARE(data.value("prompt").toString(), QStringLiteral("warm keys"));
        QCOMPARE(data.value("model").toString(), QStringLiteral("acestep-v15-turbo-Q8_0.gguf"));
        QCOMPARE(data.value("timeline_context").toObject().value("target_clip_id").toString(), QStringLiteral("keys"));
        // Segment 1 of the original window only: the window starts one take before the clip.
        QCOMPARE(music.value("window_start_frame").toInteger(), 0);
        QCOMPARE(music.value("segments").toArray(), (QJsonArray{QJsonObject{{"start_frame", 4 * kBar}, {"end_frame", 8 * kBar}}}));
        // The result lands on the same clip as a new take; no placeholder.
        const auto clipsBefore = model.clipsJson().size();
        const auto id = sent.value("request_id").toString();
        server.result(id, "generate_media", server.takes(sent, 0x700));
        QTRY_COMPARE(jobs()->job(id).value("state").toString(), QStringLiteral("done"));
        QCOMPARE(model.clipsJson().size(), clipsBefore);
        QCOMPARE(clip("keys").value("versions").toArray().size(), 3);

        // A refused submission reports the planner's message, not its code.
        selection()->set("c", barFrame(8), barFrame(10));
        QTRY_VERIFY(!panel()->findChild<QObject*>("musicPanelModel")->property("refusal").toString().isEmpty());
        const auto reason = panel()->findChild<QObject*>("musicPanelModel")->property("reason").toString();
        QVERIFY(jobs()->submit("c", barFrame(8), barFrame(10), {}, "x", 1, -1, "turbo").isEmpty());
        QCOMPARE(jobs()->error(), reason);
        QVERIFY(jobs()->error().contains(' '));

        // New seed: no seed, no codes.
        QVERIFY(!jobs()->regenerate("keys", "t0", false).isEmpty());
        QTRY_COMPARE(server.all("generate_media").size(), 2);
        music = server.last("generate_media").value("data").toObject().value("music").toObject();
        QVERIFY(!music.contains("seed"));
        QVERIFY(!music.contains("audio_codes"));

        // A repaint record replays its context, region and splice parent.
        auto repaint = clip("keys");
        auto versions = repaint.value("versions").toArray();
        auto take = versions[0].toObject();
        auto record = takeRecord("repaint", barFrame(6), barFrame(7), 0, 0);
        record.insert("seed", 77);
        record.insert("contextAssetId", assetId(0xc0de));
        record.insert("contextStartFrame", barFrame(5));
        record.insert("contextEndFrame", barFrame(5) + 6 * kBar);
        record.insert("requestFrames", 6 * kBar);
        record.insert("splice", QJsonObject{{"parentAssetId", assetId(0x500)}, {"startFrame", kBar}, {"endFrame", 2 * kBar},
                                            {"crossfadeFrames", 960}});
        take.insert("musicGeneration", record);
        versions.replace(0, take);
        repaint.insert("versions", versions);
        QJsonArray clips;
        for (const auto& value : model.clipsJson()) clips.append(value.toObject().value("id") == "keys" ? QJsonValue(repaint) : value);
        model.commitEdit("fixture", model.clipsJson(), clips);
        QVERIFY(!jobs()->regenerate("keys", "t0", true).isEmpty());
        QTRY_COMPARE(server.all("generate_media").size(), 3);
        music = server.last("generate_media").value("data").toObject().value("music").toObject();
        QCOMPARE(music.value("task").toString(), QStringLiteral("repaint"));
        QCOMPARE(music.value("seed").toInteger(), 77);
        QCOMPARE(music.value("context_asset_id").toString(), assetId(0xc0de));
        QCOMPARE(music.value("window_start_frame").toInteger(), barFrame(5));
        QCOMPARE(music.value("request_frames").toInteger(), 6 * kBar);
        QCOMPARE(music.value("region").toObject(), (QJsonObject{{"start_frame", kBar}, {"end_frame", 2 * kBar}}));
        QCOMPARE(music.value("splice").toObject(),
                 (QJsonObject{{"parent_asset_id", assetId(0x500)}, {"start_frame", kBar}, {"end_frame", 2 * kBar}}));
        // The repaint band covers the replaced bars while the job runs.
        QTRY_VERIFY(item("musicBand-" + server.last("generate_media").value("request_id").toString()));
    }

    // BE-5: the setup view replaces the button while something is missing.
    void setupViewFollowsTheStatus() {
        Server server;
        Server setupServer;
        openDocument(musicDocument({}));
        connectJobs(server);
        selection()->set("c", barFrame(9), barFrame(13));
        typePrompt("warm keys");
        connectSetup(setupServer, setupStatus(false, true, {}, false, false));
        QTRY_VERIFY(inPanel("musicSetupView")->isVisible());
        QVERIFY(!inPanel("musicGenerate")->isVisible());
        QTRY_COMPARE(named(inPanel("musicSetupView"), "musicSetupModels")->childItems().first()->property("text").toString(),
                     QStringLiteral("Models: 7.7 GB to download"));
        QVERIFY(!named(inPanel("musicSetupView"), "musicSetupInstall")->isVisible());
        press(named(inPanel("musicSetupView"), "musicSetupDownload"));
        QTRY_COMPARE(setupServer.all("acestep_download_models").size(), 1);
        QCOMPARE(setupServer.last("acestep_download_models").value("data").toObject().value("set").toString(), QStringLiteral("first_run"));
        answerSetup(setupServer, "acestep_download_models", setupStatus(false, true, {}, false, false, downloadOperation("running", 10)));
        QTRY_VERIFY(named(inPanel("musicSetupView"), "musicSetupProgress")->isVisible());
        // A progress frame pushed to this socket.
        setupServer.send({{"type", "acestep_setup_progress"}, {"operation", downloadOperation("running", 55)}});
        QTRY_COMPARE(setup()->operation().value("percent").toDouble(), 55.0);
        QCOMPARE(named(inPanel("musicSetupView"), "musicSetupStage")->property("text").toString(),
                 QStringLiteral("Downloading acestep-v15-turbo-Q8_0.gguf"));
        press(named(inPanel("musicSetupView"), "musicSetupCancel"));
        QTRY_COMPARE(setupServer.all("acestep_setup_cancel").size(), 1);
        answerSetup(setupServer, "acestep_setup_cancel", setupStatus(false, true, {}, false, false, downloadOperation("running", 60)));
        // The operation ends; the model asks for the status again, which is ready.
        const auto asked = setupServer.all("acestep_setup_status").size();
        setupServer.send({{"type", "acestep_setup_progress"}, {"operation", downloadOperation("done", 100)}});
        QTRY_COMPARE(setupServer.all("acestep_setup_status").size(), asked + 1);
        answerSetup(setupServer, "acestep_setup_status", setupStatus(false, true, {}, true, false));
        QTRY_VERIFY(!inPanel("musicSetupView")->isVisible());
        QVERIFY(inPanel("musicGenerate")->isVisible());
        QVERIFY(inPanel("musicGenerate")->isEnabled());

        // Add instrument asks for the base model on first use.
        QJsonArray clips{QJsonObject{{"id", "beat"}, {"trackId", "a"}, {"name", "beat"}, {"mediaType", "audio"},
                                     {"startMs", barMs(9)}, {"durationMs", barMs(5)}, {"currentAssetId", assetId(8)},
                                     {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}}};
        model.commitEdit("fixture", model.clipsJson(), clips);
        selection()->set("b", barFrame(9), barFrame(13));
        QTRY_COMPARE(panel()->property("operation").toString(), QStringLiteral("lego"));
        QTRY_VERIFY(inPanel("musicSetupView")->isVisible());
        press(named(inPanel("musicSetupView"), "musicSetupDownload"));
        QTRY_COMPARE(setupServer.all("acestep_download_models").size(), 2);
        QCOMPARE(setupServer.last("acestep_download_models").value("data").toObject().value("set").toString(), QStringLiteral("add_instrument"));

        // A blocked install says why in plain words and cannot start.
        setup()->refresh();
        QTRY_COMPARE(setupServer.all("acestep_setup_status").size(), asked + 2);
        answerSetup(setupServer, "acestep_setup_status", setupStatus(false, false, "digest-unset", false, false));
        selection()->set("c", barFrame(9), barFrame(13));
        QTRY_VERIFY(inPanel("musicSetupView")->isVisible());
        QTRY_COMPARE(named(inPanel("musicSetupView"), "musicSetupBlocked")->property("text").toString(),
                     QStringLiteral("This build has no ACE-Step archive yet, so the music engine cannot be installed."));
        QVERIFY(!named(inPanel("musicSetupView"), "musicSetupInstall")->isEnabled());

        // A remote backend needs no setup.
        setup()->refresh();
        QTRY_COMPARE(setupServer.all("acestep_setup_status").size(), asked + 3);
        answerSetup(setupServer, "acestep_setup_status", setupStatus(true, false, "unsupported-platform", false, false));
        QTRY_COMPARE(setup()->state(), QStringLiteral("remote"));
        QVERIFY(!inPanel("musicSetupView")->isVisible());
        QVERIFY(inPanel("musicGenerate")->isEnabled());
        selection()->set("b", barFrame(9), barFrame(13));
        QTRY_COMPARE(panel()->property("operation").toString(), QStringLiteral("lego"));
        QVERIFY(!inPanel("musicSetupView")->isVisible());
        QCOMPARE(inPanel("musicBackendStatusText")->property("text").toString(), QStringLiteral("ace-server on a remote machine"));
    }
};

int main(int argc, char** argv) {
    QTemporaryDir settings;
    qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(settings.filePath("settings.ini")));
    QGuiApplication app(argc, argv);
    TestMusicWire test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_musicwire.moc"
