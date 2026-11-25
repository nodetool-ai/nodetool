// Music mode in the mounted editor, driven by synthetic pointer events
// (docs/MUSIC-MODE.md MM2): the Music layout a music sequence opens with,
// the Range tool's snapped and free edges, the panel's inferred operation
// against MusicPlan, the Selection tool's rubber band, the program monitor
// of a sequence with a video track, the loop control, the role chip and
// picker, and New music project from the timeline list.
#include "../../tests/RequireValue.h"
#include <QDir>
#include "wiring/WiringFixture.h"
#include "TestHttpServer.h"
#include "music/MusicPlan.h"
#include "music/MusicBounce.h"
#include "assets/AssetWav.h"
#include "audio/AudioEngine.h"
#include "audio/Mixer.h"
#include "audio/vst/VstAudioStages.h"
#include "midi/PatternExpand.h"
#include "midi/RegionParams.h"
#include "midi/PianoRollController.h"
#include "edit/ClipOps.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/targeting/TargetingEdits.h"
#include "ui/MidiNoteLines.h"
#include "music/MusicProject.h"
#include "music/MusicRange.h"
#include "music/MusicSelection.h"
#include "server/TimelineList/TimelineListController.h"
#include "app/MenuRegistry.h"
#include "aiassist/AssistantCommands.h"
#include "aiassist/AssistantSession.h"

#include <QFile>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QImage>
#include <QJsonArray>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <algorithm>
#include <cmath>
#include <vector>

using namespace nt::music;

namespace {
// The offscreen window can come out narrower than asked, so 12 bars fit in the lanes.
constexpr double kMsPerPx = 80;
const MusicTempo kTempo{120, 0, 4, 4};  // a bar is 2000 ms, 96000 frames
double barMs(std::int64_t bar) { return frameToMs(barStartFrame(bar, kTempo)); }

QJsonObject audioTrack(const char* id, const char* name, int index, const char* role, bool muted = false) {
    return {{"id", id}, {"name", name}, {"type", "audio"}, {"index", index}, {"visible", true}, {"locked", false},
            {"muted", muted}, {"solo", false}, {"heightPx", 64}, {"musicRole", role}};
}
QJsonObject audioClip(const char* id, const char* track, double startMs, double durationMs) {
    return {{"id", id}, {"trackId", track}, {"name", id}, {"mediaType", "audio"}, {"startMs", startMs},
            {"durationMs", durationMs}, {"currentAssetId", QStringLiteral("asset-%1").arg(id)}, {"status", "generated"}};
}
QJsonObject musicDocument(bool withVideo) {
    QJsonArray tracks{audioTrack("a", "Drums", 0, "drums"), audioTrack("b", "Bass", 1, "bass"),
                      audioTrack("c", "Keyboard", 2, "keyboard"), audioTrack("d", "Guitar", 3, "guitar", true)};
    if (withVideo) {
        tracks.prepend(QJsonObject{{"id", "v"}, {"name", "Video"}, {"type", "video"}, {"index", 0},
                                   {"visible", true}, {"locked", false}, {"heightPx", 64}});
        for (int i = 0; i < tracks.size(); ++i) {
            auto track = tracks[i].toObject();
            track.insert("index", i);
            tracks[i] = track;
        }
    }
    return {{"name", "Song"}, {"fps", 30}, {"width", 640}, {"height", 360},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0},
                                  {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}},
                                  {"key", QJsonObject{{"tonic", "A"}, {"mode", "minor"}}}}},
            {"music", QJsonObject{{"promptHistory", QJsonArray{"warm rhodes chords", "tight funk drums"}}}},
            {"tracks", tracks},
            {"markers", QJsonArray{}},
            {"clips", QJsonArray{audioClip("a1", "a", barMs(1), 16000), audioClip("b1", "b", barMs(3), 4000),
                                 audioClip("b2", "b", barMs(5), 4000), audioClip("d1", "d", barMs(9), 8000)}}};
}
QJsonArray noteContent(const QJsonValue& value) {
    QJsonArray result;
    for (const auto& entry : value.toArray()) { auto note = entry.toObject(); note.remove("id"); result.append(note); }
    return result;
}
QByteArray answer(const QJsonValue& data) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
}
} // namespace

class TestMusicUi : public WiringFixture {
    Q_OBJECT
    DockLayoutStore* dockStore() const {
        return qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
    }
    QStringList visiblePanels() const {
        return view->rootObject()->property("dockCanvas").value<QObject*>()->property("visiblePanels").toStringList();
    }
    MusicSelection* selection() const { return gestures()->musicSelection(); }
    void openDocument(const QJsonObject& document) {
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        auto parsed = nt::parseTimeline(document);
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(requireValue(std::move(parsed.timeline)));
        clock.pause();
        clock.setLoop(false);
        clock.clearRange();
        clock.seek(0);
        view = std::make_unique<QQuickView>();
        m_testCache.install(*view->engine());
        view->setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view->loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(view->status() == QQuickView::Ready, qPrintable(view->errors().isEmpty() ? QString() : view->errors().first().toString()));
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(1800, 1000);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        QTRY_VERIFY(gestures());
        // MusicMode applies the layout once it finds the tracks panel.
        QTRY_COMPARE(dockStore()->workspace(), document.contains("music") ? QStringLiteral("Music") : QStringLiteral("Editing"));
        gestures()->viewState()->zoomTo(kMsPerPx, 0);
        gestures()->viewState()->setScrollLeftPx(0);
        gestures()->viewState()->flush();
        QTest::qWait(100);
        QCoreApplication::processEvents();
    }
    // A scene point on a track's lane at a sequence time.
    QPoint lanePoint(const QString& trackId, double ms) {
        auto* lane = item("trackLane-" + trackId);
        if (!lane) { return {}; }
        lane->ensurePolished();
        return lane->mapToScene(QPointF(ms / gestures()->viewState()->msPerPx(), lane->height() / 2)).toPoint();
    }
    // The lane frame a scene point stands for, as the controller reads it.
    std::int64_t pointerFrame(QPoint scene) {
        auto* viewport = gestures()->lanesViewport();
        const double x = viewport->mapFromScene(QPointF(scene)).x() + gestures()->viewState()->scrollLeftPx();
        return laneFrame(x * gestures()->viewState()->msPerPx());
    }
    QQuickItem* panelItem(const QString& name) {
        auto* panel = item("musicPanel");
        return panel ? named(panel, name) : nullptr;
    }
private slots:
    void cleanup() { view.reset(); model.setReadOnly(false); }

    void reviewF1LoopedPatternJoin_data() {
        QTest::addColumn<QString>("playback");
        for (auto mode : {"forward", "shuffle", "random", "wander", "many"}) { QTest::newRow(mode) << QString(mode); }
    }
    void reviewF1LoopedPatternJoin() {
        QFETCH(QString, playback);
        const bool many = playback == u"many";
        if (many) { playback = "wander"; }
        auto raw = musicDocument(false); auto c = audioClip("m", "a", 0, many ? 700000 : 3000); c.insert("mediaType", "midi");
        c.insert("loopLengthMs", 700); c.insert("inPointMs", 50); c.insert("patternPhaseTicks", 250);
        c.insert("pattern", nt::midi::normalizePattern({{"seed", 42}, {"rows", QJsonArray{QJsonObject{{"id", "r"},
            {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}, {"lengthSteps", 3}, {"stepRate", "1/8"}, {"playback", playback},
            {"steps", QJsonArray{QJsonObject{{"on", true}, {"note", 0}}, QJsonObject{{"on", true}, {"note", 2}, {"condition", QJsonObject{{"type", "recurrence"}, {"cycles", 2}, {"iteration", 1}}}}, QJsonObject{{"on", true}, {"note", 4}}}}}}}}));
        raw.insert("clips", QJsonArray{c});
        const auto full = nt::midi::expandPatternClip(c, raw).value("notes").toArray();
        const auto unrolled = nt::edit::expandMusicLoops(raw); QJsonArray notes;
        for (const auto& part : unrolled.value("clips").toArray()) {
            const auto clip = part.toObject(); const double shift = std::floor(clip.value("startMs").toDouble() * 1.92 + 0.5);
            for (auto note : nt::midi::expandPatternClip(clip, raw).value("notes").toArray()) {
                auto n = note.toObject(); n.insert("startTick", n.value("startTick").toDouble() + shift); notes.append(n);
            }
        }
        QCOMPARE(notes.size(), full.size());
        for (int i = 0; i < notes.size(); ++i) {
            QCOMPARE(notes[i].toObject().value("startTick"), full[i].toObject().value("startTick"));
            QCOMPARE(notes[i].toObject().value("pitch"), full[i].toObject().value("pitch"));
        }
        auto tail = audioClip("tail", "a", c.value("durationMs").toDouble(), 100); tail.insert("mediaType", "midi");
        raw.insert("clips", QJsonArray{c,tail});
        const auto joined = nt::edit::applyMusicClipEdit(raw, "join_clips", {{"clips", QJsonArray{"m", "tail"}}}).value("clips").toArray()[0].toObject().value("notes").toArray();
        QCOMPARE(joined.size(), full.size());
        for (int i = 0; i < joined.size(); ++i) {
            QCOMPARE(joined[i].toObject().value("startTick"), full[i].toObject().value("startTick"));
            QCOMPARE(joined[i].toObject().value("pitch"), full[i].toObject().value("pitch"));
        }
    }
    void reviewF19JoinMenuRefusals_data() {
        QTest::addColumn<QString>("kind");
        for (auto kind : {"track", "type", "locked", "audio"}) { QTest::newRow(kind) << QString(kind); }
    }
    void reviewF19JoinMenuRefusals() {
        QFETCH(QString, kind);
        auto raw = musicDocument(false); auto a = audioClip("one", "a", 4000, 1000); a.insert("mediaType", "midi");
        auto b = a; b.insert("id", "two"); b.insert("startMs", 5000);
        if (kind == "track") { b.insert("trackId", "b"); }
        if (kind == "type") { b.insert("mediaType", "audio"); }
        if (kind == "locked") { b.insert("locked", true); }
        if (kind == "audio") { a.insert("mediaType", "audio"); b.insert("mediaType", "audio"); }
        raw.insert("clips", QJsonArray{a,b}); openDocument(raw); gestures()->setSelection({"one", "two"});
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("a", 4500));
        QTRY_VERIFY(item("clipMenu-joinClips"));
        QVERIFY(!item("clipMenu-joinClips")->isEnabled());
        QVERIFY(!item("clipMenu-joinClips")->property("reasonText").toString().isEmpty());
    }
    void reviewF21RenameRefusal() {
        openDocument(musicDocument(false));
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("b", 5000));
        QTRY_VERIFY(item("clipMenu-renameClip")); click("clipMenu-renameClip"); QTRY_VERIFY(item("clipRenameField"));
        item("clipRenameField")->setProperty("text", "Rename");
        QVERIFY(model.applyEdit("set_clip_params", {{"clipId", "b1"}, {"name", "Externally renamed"}}));
        model.setReadOnly(true); click("clipRenameApply");
        QVERIFY(!item("clipRenameField")->property("errorText").toString().isEmpty());
        QVERIFY(item("clipRenameError")); QVERIFY(item("clipRenameError")->isVisible());
    }
    void reviewF3DeleteQuantizeOrigin() {
        auto raw = musicDocument(false); auto tempo = raw.value("tempo").toObject(); tempo.insert("offsetMs", 500); raw.insert("tempo", tempo);
        auto c = audioClip("m", "a", 0, 4000); c.insert("mediaType", "midi");
        c.insert("quantize", QJsonObject{{"grid", "1/4"}, {"strength", 100}});
        c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 2200}, {"durationTick", 240}}});
        raw.insert("clips", QJsonArray{c}); auto baked = raw;
        baked.insert("clips", QJsonArray{nt::midi::bakeRegionQuantize(c, 120, 500)});
        const QJsonObject range{{"fromMs", 200}, {"toMs", 1000}};
        auto expected = nt::edit::applySectionEdit(baked, "delete_time", range).value("clips").toArray();
        auto actual = nt::edit::applySectionEdit(raw, "delete_time", range).value("clips").toArray();
        QCOMPARE(actual.size(), expected.size());
        for (int i = 0; i < actual.size(); ++i) { QCOMPARE(noteContent(actual[i].toObject().value("notes")), noteContent(expected[i].toObject().value("notes"))); }
    }
    void reviewF18DropTempo_data() {
        QTest::addColumn<QString>("mode"); QTest::newRow("overwrite") << QString("overwrite"); QTest::newRow("insert") << QString("insert");
    }
    void reviewF18DropTempo() {
        QFETCH(QString, mode);
        auto raw = musicDocument(false); raw.insert("tempo", QJsonObject{{"bpm", 90}, {"offsetMs", 350}});
        auto c = audioClip("m", "a", 0, 4000); c.insert("mediaType", "midi");
        c.insert("quantize", QJsonObject{{"grid", "1/4"}, {"strength", 100}});
        c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 2500}, {"durationTick", 240}}});
        auto mover = audioClip("move", "a", 1000, 500);
        raw.insert("clips", QJsonArray{c, mover}); auto baked = raw;
        baked.insert("clips", QJsonArray{nt::midi::bakeRegionQuantize(c, 90, 350), mover});
        const auto expected = nt::targeting::resolveDropAction(nt::edit::structure::editDocument(baked), {}, {"move"}, mode);
        const auto actual = nt::targeting::resolveDropAction(nt::edit::structure::editDocument(raw), {}, {"move"}, mode);
        QCOMPARE(actual.size(), expected.size());
        for (size_t i = 0; i < actual.size(); ++i) {
            QCOMPARE(noteContent(actual[i].value("notes")), noteContent(expected[i].value("notes")));
            const auto notes = actual[i].value("notes").toArray();
            if (!notes.isEmpty()) { QCOMPARE(notes[0].toObject().value("startTick").toDouble(), mode == u"insert" ? 984.0 : 264.0); }
        }
    }
    void reviewAssistantContracts_data() {
        QTest::addColumn<QString>("finding");
        for (auto id : {"F2", "F10", "F11", "F11-alias", "F13-target", "F13-noop"}) { QTest::newRow(id) << QString(id); }
    }
    void reviewAssistantContracts() {
        QFETCH(QString, finding);
        auto raw = musicDocument(false); raw.insert("id", "aaaaaaaaaaaa00000000000000000001");
        auto a = audioClip("one", "a", 0, 1000); a.insert("mediaType", "midi"); a.insert("linkId", "linked");
        auto b = a; b.insert("id", "two"); b.insert("startMs", 1000); b.remove("linkId");
        auto v = audioClip("partner", "b", 0, 1000); v.insert("linkId", "linked"); v.insert("locked", true);
        const QString firstId = finding == u"F13-target" ? QStringLiteral("cccccccccccc00000000000000000001") : QStringLiteral("one");
        a.insert("id", firstId);
        raw.insert("clips", QJsonArray{a, b, v}); openDocument(raw); gestures()->setSelection({firstId, "two"}); gestures()->setLinkedSelection(true);
        nt::aiassist::AssistantCommands commands(model, clock); commands.setEditor(view->rootObject());
        const auto run = [&](const QString& command, const QVariantMap& params) {
            return commands.execute("ui_timeline_run_command", {{"timeline_id", raw.value("id").toString()}, {"command", command}, {"params", params}});
        };
        if (finding == "F2") { QVERIFY(!run("join_clips", {{"clips", QStringList{"one", "two"}}}).value("ok").toBool()); QCOMPARE(model.undoStack()->count(), 0); }
        if (finding == "F10") { gestures()->setLinkedSelection(false); const auto r = run("join_clips", {}); QVERIFY2(r.value("ok").toBool(), qPrintable(r.value("error").toString())); }
        if (finding == "F11") {
            const auto r = run("music.setAutoCrossfade", {{"autoCrossfadeMs", 10}});
            QVERIFY2(r.value("ok").toBool(), qPrintable(r.value("error").toString()));
            const auto state = r.value("state").toMap();
            QVERIFY(state.value("music").toMap().contains("promptHistory"));
            QCOMPARE(state.value("autoCrossfadeMs").toDouble(), 10.0);
        }
        if (finding == "F11-alias") {
            const auto r = run("set_tempo", {{"auto_crossfade_ms", 0}});
            QVERIFY2(r.value("ok").toBool(), qPrintable(r.value("error").toString()));
            QCOMPARE(doc().value("music").toObject().value("autoCrossfadeMs").toDouble(-1), 0.0);
        }
        if (finding == "F13-target") {
            gestures()->setLinkedSelection(false);
            const auto r = run("set_clip_params", {{"target", firstId.left(12)}, {"volumeDb", -6}, {"muted", true}});
            QVERIFY2(r.value("ok").toBool(), qPrintable(r.value("error").toString()));
            QCOMPARE(clip(firstId).value("volumeDb").toDouble(), -6.0); QVERIFY(clip(firstId).value("muted").toBool());
        }
        if (finding == "F13-noop") { const auto r = run("music.setAutoCrossfade", {{"autoCrossfadeMs", 10}}); QVERIFY(r.value("ok").toBool()); const auto second = run("music.setAutoCrossfade", {{"autoCrossfadeMs", 10}}); QVERIFY(second.value("ok").toBool()); QCOMPARE(model.undoStack()->count(), 1);
            gestures()->setLinkedSelection(false);
            const auto midiNoop = run("set_clip_params", {{"target", "one"}, {"transpose", 0}});
            QVERIFY2(midiNoop.value("ok").toBool(), qPrintable(midiNoop.value("error").toString()));
            QVERIFY(!midiNoop.value("changed").toBool()); QCOMPARE(model.undoStack()->count(), 1);
        }
    }
    void reviewF13TimingParameters() {
        auto raw = musicDocument(false);
        raw.insert("id", "aaaaaaaaaaaa00000000000000000001");
        raw.insert("clips", QJsonArray{audioClip("one", "a", 1000, 2000)});
        openDocument(raw);
        nt::aiassist::AssistantCommands commands(model, clock);
        commands.setEditor(view->rootObject());
        const auto result = commands.execute("ui_timeline_run_command", {{"timeline_id", raw.value("id").toString()},
            {"command", "set_clip_params"}, {"params", QVariantMap{{"target", "one"}, {"trackId", "b"}, {"startMs", 500}, {"durationMs", 1000}}}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(clip("one").value("startMs").toDouble(), 500.0);
        QCOMPARE(clip("one").value("durationMs").toDouble(), 1000.0);
        QCOMPARE(clip("one").value("trackId").toString(), QString("b"));
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void reviewF13AudioEffectParameters() {
        auto raw = musicDocument(false);
        raw.insert("id", "aaaaaaaaaaaa00000000000000000001");
        raw.insert("clips", QJsonArray{audioClip("one", "a", 0, 1000)});
        openDocument(raw);
        nt::aiassist::AssistantCommands commands(model, clock);
        commands.setEditor(view->rootObject());
        const auto run = [&](const QVariantMap& params) {
            return commands.execute("ui_timeline_run_command", {{"timeline_id", raw.value("id").toString()},
                {"command", "set_clip_params"}, {"params", params}});
        };
        const QVariantList effects{QVariantMap{{"id", "gain"}, {"type", "gain"}, {"enabled", true}, {"gainDb", -6}}};
        const auto result = run({{"target", "one"}, {"audioEffects", effects}, {"speedMultiplier", 2}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(clip("one").value("audioEffects").toArray(), QJsonArray::fromVariantList(effects));
        QCOMPARE(clip("one").value("durationMs").toDouble(), 500.0);
        QCOMPARE(model.undoStack()->count(), 1);
        const auto before = doc();
        QVERIFY(!run({{"target", "one"}, {"audioEffects", QVariantList{QVariantMap{{"type", "gain"}}}}}).value("ok").toBool());
        QCOMPARE(doc(), before);
        const auto cleared = run({{"target", "one"}, {"audioEffects", QVariantList{}}});
        QVERIFY2(cleared.value("ok").toBool(), qPrintable(cleared.value("error").toString()));
        QVERIFY(clip("one").value("audioEffects").toArray().isEmpty());
    }
    void reviewF23UnlockClipParameters() {
        auto raw = musicDocument(false);
        raw.insert("id", "aaaaaaaaaaaa00000000000000000001");
        raw.insert("clips", QJsonArray{audioClip("one", "a", 0, 1000)});
        openDocument(raw);
        nt::aiassist::AssistantCommands commands(model, clock);
        commands.setEditor(view->rootObject());
        const auto run = [&](const QVariantMap& params) {
            return commands.execute("ui_timeline_run_command", {{"timeline_id", raw.value("id").toString()},
                {"command", "set_clip_params"}, {"params", params}});
        };
        QVERIFY(run({{"target", "one"}, {"locked", true}}).value("ok").toBool());
        const auto locked = doc();
        QVERIFY(!run({{"target", "one"}, {"locked", false}, {"name", "Bypass"}}).value("ok").toBool());
        QCOMPARE(doc(), locked);
        const auto result = run({{"target", "one"}, {"locked", false}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QVERIFY(!clip("one").value("locked").toBool());
        QCOMPARE(model.undoStack()->count(), 2);
        model.undoStack()->undo();
        QVERIFY(clip("one").value("locked").toBool());
        auto tracks = locked.value("tracks").toArray();
        auto track = tracks[0].toObject(); track.insert("locked", true); tracks[0] = track;
        auto trackLocked = locked; trackLocked.insert("tracks", tracks);
        QVERIFY_THROWS_EXCEPTION(nt::edit::OpError, nt::edit::applyMusicClipEdit(trackLocked,
            "set_clip_params", {{"target", "one"}, {"locked", false}}));
    }
    void reviewF11TempoAndSession() {
        auto raw = musicDocument(false); raw.insert("id", "aaaaaaaaaaaa00000000000000000001");
        auto c = audioClip("m", "a", 2000, 1000); c.insert("mediaType", "midi"); c.insert("inPointMs", 100); c.insert("loopLengthMs", 400);
        raw.insert("clips", QJsonArray{c});
        const auto changed = nt::edit::applyMusicClipEdit(raw, "set_tempo", {{"bpm", 60}, {"offset_ms", 500}, {"key", QJsonValue::Null}, {"auto_crossfade_ms", 0}});
        const auto scaled = changed.value("clips").toArray()[0].toObject();
        QCOMPARE(scaled.value("startMs").toDouble(), 4500.0); QCOMPARE(scaled.value("durationMs").toDouble(), 2000.0);
        QCOMPARE(scaled.value("inPointMs").toDouble(), 200.0); QCOMPARE(scaled.value("loopLengthMs").toDouble(), 800.0);
        QVERIFY(!changed.value("tempo").toObject().contains("key"));
        auto parsed = nt::parseTimeline(changed); QVERIFY(parsed.timeline); model.setTimeline(requireValue(std::move(parsed.timeline)));
        AssistantSession session; session.setTimeline(&model);
        const auto state = session.executeTool("ui_timeline_get_state", {{"timeline_id", raw.value("id")}});
        QVERIFY2(state.value("ok").toBool(), qPrintable(state.value("error").toString()));
        QCOMPARE(state.value("tempo"), changed.value("tempo")); QCOMPARE(state.value("music"), changed.value("music"));
        QCOMPARE(state.value("autoCrossfadeMs").toDouble(-1), 0.0);
    }
    void reviewF6QuantizeFocusLoss() {
        auto raw = musicDocument(false); auto c = audioClip("m", "a", 0, 4000); c.insert("mediaType", "midi"); raw.insert("clips", QJsonArray{c});
        openDocument(raw); gestures()->setSelection({"m"}); dockStore()->dispatch({{"type", "activate"}, {"panelId", "pianoRoll"}});
        QTRY_VERIFY(item("midiRegionQuantizeStrength"));
        QTest::failOnWarning(QRegularExpression(".*PianoRollInspector.*TypeError.*"));
        QVERIFY(QMetaObject::invokeMethod(item("midiRegionQuantizeStrength"), "valueCommitted", Q_ARG(double, 50.0)));
        QVERIFY(!clip("m").contains("quantize"));
    }
    void reviewF9CrossfadeControl() {
        openDocument(musicDocument(false));
        QTRY_VERIFY(item("musicAutoCrossfade"));
        auto* field = item("musicAutoCrossfade"); QCOMPARE(field->property("value").toDouble(), 10.0);
        QVERIFY(QMetaObject::invokeMethod(field, "valueCommitted", Q_ARG(double, 0.0)));
        QCOMPARE(doc().value("music").toObject().value("autoCrossfadeMs").toDouble(-1), 0.0);
        model.undoStack()->undo(); QTRY_COMPARE(field->property("value").toDouble(), 10.0);
    }
    void reviewF20VisibleLabels() {
        auto raw = musicDocument(false); auto c = audioClip("m", "a", 0, 4000); c.insert("mediaType", "midi"); raw.insert("clips", QJsonArray{c});
        openDocument(raw); gestures()->setSelection({"m"}); dockStore()->dispatch({{"type", "activate"}, {"panelId", "pianoRoll"}});
        QTRY_VERIFY(item("midiRegionTransposeLabel"));
        for (const auto* name : {"midiRegionTransposeLabel", "midiRegionVelocityLabel", "midiRegionQuantizeLabel", "midiRegionQuantizeStrengthLabel"}) { QVERIFY(item(name)); QVERIFY(!item(name)->property("text").toString().isEmpty()); }
    }
    void reviewF4DryCrossfade() {
        auto raw = musicDocument(false);
        raw.insert("clips", QJsonArray{audioClip("one", "a", 0, 1000), audioClip("two", "a", 1000, 1000)});
        auto parsed = nt::parseTimeline(raw); QVERIFY(parsed.timeline);
        auto& timeline = requireValue(parsed.timeline);
        for (auto& c : timeline.clips) { c.mediaPath = "unused.wav"; }
        const auto plan = nt::audio::buildMixPlan(bounceTimeline(timeline, BounceKind::Dry, "a"));
        QCOMPARE(plan.voices.size(), size_t(2));
        QCOMPARE(plan.voices[0].fades.fadeOutMs, 0.0);
    }
    void reviewF5SilentNeighbors_data() {
        QTest::addColumn<QString>("kind");
        for (auto kind : {"muted", "hidden", "assetless"}) { QTest::newRow(kind) << QString(kind); }
    }
    void reviewF5SilentNeighbors() {
        QFETCH(QString, kind);
        auto raw = musicDocument(false);
        auto b = audioClip("two", "a", 1000, 1000);
        if (kind == "assetless") { b.remove("currentAssetId"); } else { b.insert(kind, true); }
        raw.insert("clips", QJsonArray{audioClip("one", "a", 0, 1000), b});
        auto parsed = nt::parseTimeline(raw); QVERIFY(parsed.timeline);
        auto& timeline = requireValue(parsed.timeline);
        timeline.clips[0].mediaPath = "unused.wav";
        if (kind != "assetless") { timeline.clips[1].mediaPath = "unused.wav"; }
        const auto plan = nt::audio::buildMixPlan(timeline);
        QCOMPARE(plan.voices.size(), size_t(1));
        QCOMPARE(plan.voices[0].fades.fadeOutMs, 0.0);
    }
    void reviewF7PatternNoteLines() {
        auto raw = musicDocument(false);
        auto c = audioClip("m", "a", 0, 2000); c.insert("mediaType", "midi");
        c.insert("pattern", nt::midi::normalizePattern({{"rows", QJsonArray{QJsonObject{{"id", "r"},
            {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}, {"steps", QJsonArray{QJsonObject{{"on", true}}}}}}}}));
        raw.insert("clips", QJsonArray{c});
        auto parsed = nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(requireValue(std::move(parsed.timeline)));
        nt::ui::MidiNoteLinesItem lines; lines.setTimeline(&model); lines.setClipId("m");
        lines.setMsPerPx(1); lines.setWidth(2000); lines.setHeight(50);
        QVERIFY(!lines.lines().empty());
    }
    void reviewF8PressureTranspose() {
        QJsonObject c{{"transpose", 60}, {"notes", QJsonArray{QJsonObject{{"pitch", 36}}}},
            {"controllers", QJsonArray{QJsonObject{{"kind", "polyPressure"}, {"pitch", 36}}}}};
        const auto projected = nt::midi::applyRegionParams(c, 120);
        QCOMPARE(projected.value("controllers").toArray()[0].toObject().value("pitch").toInt(), 96);
    }
    void reviewF12JoinPrunesLinks() {
        auto raw = musicDocument(false);
        auto a = audioClip("one", "a", 0, 1000); a.insert("mediaType", "midi");
        auto b = a; b.insert("id", "two"); b.insert("startMs", 1000); b.insert("linkId", "link");
        auto v = audioClip("v", "b", 1000, 1000); v.insert("linkId", "link");
        raw.insert("clips", QJsonArray{a, b, v});
        const auto result = nt::edit::applyMusicClipEdit(raw, "join_clips", {{"clips", QJsonArray{"one", "two"}}});
        for (const auto& c : result.value("clips").toArray()) { QVERIFY(!c.toObject().contains("linkId")); }
    }
    void reviewF14InvalidColor_data() {
        QTest::addColumn<QString>("color"); QTest::newRow("empty") << QString(); QTest::newRow("long") << QString(65, 'x');
    }
    void reviewF14InvalidColor() {
        QFETCH(QString, color);
        QVERIFY_THROWS_EXCEPTION(nt::edit::OpError, nt::edit::applyMusicClipEdit(musicDocument(false), "set_clip_params", {{"clipId", "b1"}, {"labelColor", color}}));
    }
    void reviewF15PianoColor() {
        auto raw = musicDocument(false); auto c = audioClip("m", "a", 0, 1000);
        c.insert("mediaType", "midi"); c.insert("labelColor", "#3E63DD"); raw.insert("clips", QJsonArray{c});
        auto parsed = nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(requireValue(std::move(parsed.timeline)));
        PianoRollController controller; controller.setTimeline(&model); controller.setClipId("m");
        QCOMPARE(controller.property("clipColor").toString(), QString("#3E63DD"));
    }
    void reviewF16JoinExpression() {
        auto raw = musicDocument(false); auto a = audioClip("one", "a", 0, 1000); a.insert("mediaType", "midi");
        a.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"startTick", 1800}, {"durationTick", 500},
            {"expression", QJsonObject{{"pressure", QJsonArray{QJsonObject{{"tick", 400}, {"value", 1}}}}}}}});
        auto b = a; b.insert("id", "two"); b.insert("startMs", 1000); b.remove("notes"); raw.insert("clips", QJsonArray{a,b});
        const auto joined = nt::edit::applyMusicClipEdit(raw, "join_clips", {{"clips", QJsonArray{"one", "two"}}}).value("clips").toArray()[0].toObject();
        QVERIFY(!joined.value("notes").toArray()[0].toObject().contains("expression"));
        auto notes = a.value("notes").toArray();
        notes.append(QJsonObject{{"id", "short"}, {"pitch", 62}, {"startTick", 1800}, {"durationTick", 0.5}});
        a.insert("notes", notes); raw.insert("clips", QJsonArray{a,b});
        const auto filtered = nt::edit::applyMusicClipEdit(raw, "join_clips", {{"clips", QJsonArray{"one", "two"}}});
        QCOMPARE(filtered.value("clips").toArray()[0].toObject().value("notes").toArray().size(), 1);
    }
    void reviewF17JoinOrdering() {
        auto raw = musicDocument(false); auto a = audioClip("one", "a", 0, 1000); a.insert("mediaType", "midi");
        auto b = a; b.insert("id", "two"); b.insert("startMs", 1000);
        raw.insert("clips", QJsonArray{a, audioClip("other", "b", 0, 1000), b});
        const auto clips = nt::edit::applyMusicClipEdit(raw, "join_clips", {{"clips", QJsonArray{"one", "two"}}}).value("clips").toArray();
        QCOMPARE(clips[0].toObject().value("id").toString(), QString("one"));
        QVERIFY(!clips[0].toObject().contains("notes"));
        a.insert("notes", QJsonArray{QJsonObject{{"id", "c"}, {"startTick", 0}, {"pitch", 64}, {"durationTick", 100}},
            QJsonObject{{"id", "z"}, {"startTick", 0}, {"pitch", 60}, {"durationTick", 100}},
            QJsonObject{{"id", "a"}, {"startTick", 0}, {"pitch", 60}, {"durationTick", 100}}});
        raw.insert("clips", QJsonArray{a,b});
        const auto notes = nt::edit::applyMusicClipEdit(raw, "join_clips", {{"clips", QJsonArray{"one", "two"}}}).value("clips").toArray()[0].toObject().value("notes").toArray();
        QCOMPARE(notes[0].toObject().value("id").toString(), QString("a"));
        QCOMPARE(notes[1].toObject().value("id").toString(), QString("z"));
        QCOMPARE(notes[2].toObject().value("id").toString(), QString("c"));
    }
    void reviewF22NegativeInPoint() {
        QJsonObject c{{"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 1000},
            {"quantize", QJsonObject{{"grid", "1/16"}, {"strength", 100}}},
            {"notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 240}}}}};
        const auto expected = nt::audio::vst::extractMidiNoteEvents(c, 120, 48000, 0, 1000);
        const auto actual = nt::audio::vst::extractMidiNoteEvents(c, 120, 48000, -50, 1000);
        QCOMPARE(actual.size(), expected.size()); QVERIFY(!actual.empty());
        QCOMPARE(actual[0].startFrame, expected[0].startFrame);
    }
    void midiRegionParamsReachNoteLines() {
        auto raw = musicDocument(false);
        auto c = audioClip("m", "a", 4000, 4000);
        c.insert("mediaType", "midi"); c.insert("transpose", 12);
        c.insert("quantize", QJsonObject{{"grid", "1/16"}, {"strength", 100}});
        const QJsonArray notes{QJsonObject{{"id", "low"}, {"pitch", 120}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 240}},
            QJsonObject{{"id", "high"}, {"pitch", 127}, {"velocity", 90}, {"startTick", 1000}, {"durationTick", 240}}};
        c.insert("notes", notes); raw.insert("clips", QJsonArray{c});
        auto parsed = nt::parseTimeline(raw); QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(requireValue(std::move(parsed.timeline)));
        nt::ui::MidiNoteLinesItem lines;
        lines.setTimeline(&model); lines.setClipId("m"); lines.setMsPerPx(1); lines.setWidth(4000); lines.setHeight(50);
        const auto geometry = lines.lines();
        QCOMPARE(geometry.size(), 2);
        QCOMPARE(geometry[0].toMap().value("x").toDouble(), 0.0);
        QCOMPARE(geometry[1].toMap().value("x").toDouble(), 500.0);
        QCOMPARE(geometry[0].toMap().value("y"), geometry[1].toMap().value("y"));
        QCOMPARE(model.clipsJson()[0].toObject().value("notes").toArray(), notes);
    }
    void midiRegionControlsKeepStoredNotesAndShowBadges() {
        auto raw = musicDocument(false);
        auto clips = raw.value("clips").toArray();
        auto c = clips[1].toObject(); c.insert("mediaType", "midi");
        const QJsonArray notes{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 240}}};
        c.insert("notes", notes); clips[1] = c; raw.insert("clips", clips);
        openDocument(raw);
        gestures()->setSelection({"b1"});
        dockStore()->dispatch({{"type", "activate"}, {"panelId", "pianoRoll"}});
        QTRY_VERIFY(item("midiRegionTranspose"));
        auto* field = item("midiRegionTranspose");
        QVERIFY(QMetaObject::invokeMethod(field, "valueCommitted", Q_ARG(double, 12.0)));
        QTRY_COMPARE(clip("b1").value("transpose").toInt(), 12);
        QCOMPARE(clip("b1").value("notes").toArray(), notes);
        QTRY_VERIFY(item("midiTransposeBadge")->isVisible());
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QTRY_VERIFY(!item("midiTransposeBadge")->isVisible());
    }
    void musicAudioGetsAutomaticCrossfade() {
        auto raw = musicDocument(false);
        auto a = audioClip("one", "a", 0, 1000);
        auto b = audioClip("two", "a", 1000, 1000);
        raw.insert("clips", QJsonArray{a, b});
        auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        for (auto& clip : parsed.timeline->clips) { clip.mediaPath = "unused.wav"; }
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        QCOMPARE(plan.voices.size(), size_t(2));
        QCOMPARE(plan.voices[0].fades.fadeOutMs, 5.0);
        QCOMPARE(plan.voices[1].fades.fadeInMs, 5.0);
        QCOMPARE(parsed.timeline->clips[0].fadeOutMs, 0.0);
    }
    void automaticCrossfadeRespectsStoredFadesAndProjectSetting() {
        auto raw = musicDocument(false);
        auto a = audioClip("one", "a", 0, 1000);
        auto b = audioClip("two", "a", 996, 1000);
        const auto check = [&](QJsonObject doc, double out, double in, nt::audio::FadeShape shape) {
            auto parsed = nt::parseTimeline(doc);
            QVERIFY(parsed.timeline);
            for (auto& c : parsed.timeline->clips) { c.mediaPath = "unused.wav"; }
            const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
            QCOMPARE(plan.voices.size(), size_t(2));
            QCOMPARE(plan.voices[0].fades.fadeOutMs, out);
            QCOMPARE(plan.voices[1].fades.fadeInMs, in);
            QCOMPARE(plan.voices[1].fades.fadeInShape, shape);
        };
        raw.insert("clips", QJsonArray{a, b});
        check(raw, 4, 4, nt::audio::FadeShape::Plus3dB);
        a.insert("fadeOutMs", 200); b.insert("fadeInMs", 50);
        raw.insert("clips", QJsonArray{a, b});
        check(raw, 200, 50, nt::audio::FadeShape::Linear);
        a.remove("fadeOutMs"); b.remove("fadeInMs"); raw.insert("clips", QJsonArray{a, b});
        raw.insert("music", QJsonObject{{"autoCrossfadeMs", 0}});
        check(raw, 0, 0, nt::audio::FadeShape::Linear);
        raw.remove("music");
        check(raw, 0, 0, nt::audio::FadeShape::Linear);
    }
    void clipMenuRenamesAnyClipOnce_data() {
        QTest::addColumn<QString>("mediaType");
        for (const auto* type : {"audio", "midi", "video", "image"}) { QTest::newRow(type) << QString::fromLatin1(type); }
    }
    void clipMenuRenamesAnyClipOnce() {
        QFETCH(QString, mediaType);
        auto raw = musicDocument(false);
        auto clips = raw.value("clips").toArray();
        auto c = clips[1].toObject(); c.insert("mediaType", mediaType); clips[1] = c; raw.insert("clips", clips);
        openDocument(raw);
        const auto before = clip("b1");
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("b", 5000));
        QTRY_VERIFY(item("clipMenu-renameClip"));
        click("clipMenu-renameClip");
        QTRY_VERIFY(item("clipRenameField"));
        auto* field = item("clipRenameField");
        field->setProperty("text", "New bass");
        click("clipRenameApply");
        QTRY_COMPARE(clip("b1").value("name").toString(), QString("New bass"));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(clip("b1"), before);
    }
    void midiRegionParamsReachPlayback() {
        QJsonObject c{{"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 2000}, {"transpose", 12}, {"velocityOffset", -20},
            {"quantize", QJsonObject{{"grid", "1/16"}, {"strength", 100}}},
            {"notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 240}}}}};
        const auto events = nt::audio::vst::extractMidiNoteEvents(c, 120, 48000, 0, 2000);
        QCOMPARE(events.size(), size_t(1));
        QCOMPARE(events[0].pitch, 72);
        QCOMPARE(events[0].velocity, 70);
        QCOMPARE(events[0].startFrame, 0);
    }
    void joinMenuJoinsSelectionOnce() {
        auto raw = musicDocument(false);
        auto clips = raw.value("clips").toArray();
        for (int i : {1, 2}) {
            auto c = clips[i].toObject(); c.insert("mediaType", "midi"); c.insert("notes", QJsonArray{}); clips[i] = c;
        }
        raw.insert("clips", clips);
        openDocument(raw);
        gestures()->setSelection({"b1", "b2"});
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("b", 5000));
        QTRY_VERIFY(item("clipMenu-joinClips"));
        click("clipMenu-joinClips");
        QTRY_COMPARE(model.clipsJson().size(), 3);
        QCOMPARE(clip("b1").value("durationMs").toDouble(), 8000.0);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson().size(), 4);
    }
    void musicOpsAreCallableAssistantCommands_data() {
        QTest::addColumn<QString>("operation");
        for (const auto* name : {"insert_time", "delete_time", "duplicate_range", "paste_range", "loop_clip", "duplicate_clip", "move_clip", "split_clip", "trim_clip", "add_media_clip", "delete-locked", "join_clips", "set_clip_params", "music.setAutoCrossfade", "midi-params", "join-pattern"}) {
            QTest::newRow(name) << QString::fromLatin1(name);
        }
    }
    void musicOpsAreCallableAssistantCommands() {
        QFETCH(QString, operation);
        auto raw = musicDocument(false);
        const QString timelineId = "aaaaaaaaaaaa00000000000000000001";
        raw.insert("id", timelineId);
        if (operation == "delete-locked") {
            auto clips = raw.value("clips").toArray();
            auto locked = clips[1].toObject();
            locked.insert("locked", true);
            locked.insert("name", "Locked bass");
            clips[1] = locked;
            raw.insert("clips", clips);
        }
        if (operation == "join_clips" || operation == "midi-params" || operation == "join-pattern") {
            auto clips = raw.value("clips").toArray();
            for (int i : {1, 2}) { auto c = clips[i].toObject(); c.insert("mediaType", "midi"); c.insert("notes", QJsonArray{}); clips[i] = c; }
            if (operation == "join-pattern") {
                const auto pattern = nt::midi::normalizePattern({{"lengthSteps", 4}, {"stepRate", "1/4"}, {"rows", QJsonArray{
                    QJsonObject{{"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}, {"lengthSteps", 4},
                        {"stepRate", "1/4"}, {"steps", QJsonArray{QJsonObject{{"on", true}}, QJsonObject{}, QJsonObject{}, QJsonObject{}}}}}}});
                for (int i : {1, 2}) { auto c = clips[i].toObject(); c.remove("notes"); c.insert("pattern", pattern); if (i == 2) { c.insert("startMs", 10000); } clips[i] = c; }
            }
            raw.insert("clips", clips);
        }
        openDocument(raw);
        nt::aiassist::AssistantCommands commands(model, clock);
        commands.setEditor(view->rootObject());
        QJsonObject payload;
        if (operation == "join_clips" || operation == "join-pattern") { payload = {{"clips", QJsonArray{"b1", "b2"}}}; }
        if (operation == "midi-params") { payload = {{"clipId", "b1"}, {"transpose", 12}, {"velocityOffset", -20}, {"quantize", QJsonObject{{"grid", "1/16"}, {"strength", 50}}}}; }
        if (operation == "set_clip_params") { payload = {{"clipId", "b1"}, {"name", "Renamed bass"}, {"labelColor", "#3E63DD"}}; }
        if (operation == "music.setAutoCrossfade") { payload = {{"autoCrossfadeMs", 25}}; }
        if (operation == "insert_time") { payload = {{"atBar", 2}, {"bars", 1}}; }
        if (operation == "delete_time" || operation == "duplicate_range") { payload = {{"fromBar", 2}, {"toBar", 3}}; }
        if (operation == "delete-locked") { payload = {{"fromBar", 3}, {"toBar", 5}}; }
        if (operation == "paste_range") { payload = {{"atBar", 3}, {"content", QJsonObject{{"lengthMs", 2000}, {"clips", QJsonArray{audioClip("copy", "a", 0, 2000)}}}}}; }
        if (operation == "loop_clip") { payload = {{"clipId", "b1"}, {"times", 3}}; }
        if (operation == "duplicate_clip") { payload = {{"clipId", "b1"}, {"count", 2}}; }
        if (operation == "move_clip") { payload = {{"clipId", "b1"}, {"atBar", 4}}; }
        if (operation == "split_clip") { payload = {{"clipId", "b1"}, {"atBar", 4}}; }
        if (operation == "trim_clip") { payload = {{"clipId", "b1"}, {"atBar", 4}}; }
        if (operation == "add_media_clip") { payload = {{"trackId", "a"}, {"atBar", 3}, {"asset", QJsonObject{{"id", "bbbbbbbbbbbb00000000000000000002"}, {"content_type", "audio/wav"}, {"duration", 1}}}}; }
        const auto before = doc();
        const auto result = commands.execute("ui_timeline_run_command", {{"timeline_id", timelineId}, {"command", operation == "delete-locked" ? QStringLiteral("delete_time") : operation == "midi-params" ? QStringLiteral("set_clip_params") : operation == "join-pattern" ? QStringLiteral("join_clips") : operation}, {"params", payload.toVariantMap()}});
        if (operation == "delete-locked") {
            QVERIFY(!result.value("ok").toBool());
            QVERIFY(result.value("error").toString().contains("Locked bass"));
            QCOMPARE(model.undoStack()->count(), 0);
            QCOMPARE(doc(), before);
            return;
        }
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 1);
        if (operation == "join-pattern") {
            QVERIFY(result.value("convertedToMidi").toBool());
            QCOMPARE(result.value("convertedPatternClipIds").toList().size(), 2);
            QVERIFY(!clip("b1").contains("pattern"));
            QCOMPARE(clip("b1").value("notes").toArray().size(), 4);
        }
        if (operation == "join_clips" || operation == "join-pattern") {
            QCOMPARE(result.value("state").toMap().value("selectedClipIds").toStringList(), QStringList{"b1"});
        }
        if (operation == "midi-params") {
            QCOMPARE(clip("b1").value("transpose").toInt(), 12);
            QCOMPARE(clip("b1").value("velocityOffset").toInt(), -20);
            QCOMPARE(clip("b1").value("quantize").toObject().value("strength").toInt(), 50);
        }
        if (operation == "set_clip_params") {
            QCOMPARE(clip("b1").value("labelColor").toString(), QString("#3E63DD"));
            QCOMPARE(clip("b1").value("name").toString(), QString("Renamed bass"));
        }
        if (operation == "music.setAutoCrossfade") {
            QCOMPARE(result.value("state").toMap().value("music").toMap().value("autoCrossfadeMs").toDouble(), 25.0);
        }
        if (operation == "loop_clip") {
            bool shown = false;
            for (const auto& value : result.value("state").toMap().value("clips").toList()) {
                const auto c = value.toMap();
                if (c.value("id").toString() == "b1") { shown = c.value("loopLengthMs").toDouble() == 4000; }
            }
            QVERIFY(shown);
            const auto removed = commands.execute("ui_timeline_run_command", {{"timeline_id", timelineId}, {"command", operation},
                {"params", QVariantMap{{"clipId", "b1"}, {"loopLengthMs", QVariant::fromValue(nullptr)}}}});
            QVERIFY2(removed.value("ok").toBool(), qPrintable(removed.value("error").toString()));
            QVERIFY(!clip("b1").contains("loopLengthMs"));
            model.undoStack()->undo();
        }
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }

    void loopAudioRendersTheSameSourceOnEveryRepeat() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const auto path = directory.filePath("source.wav");
        std::vector<float> source(std::size_t{2} * 2 * 48000);
        for (size_t i = 0; i < source.size(); ++i) { source[i] = i < std::size_t{2} * 48000 ? 0.2f : 0.4f; }
        QVERIFY(nt::assets::writeStereoFloatWav(path, source));
        auto raw = musicDocument(false);
        auto loop = audioClip("loop", "a", 0, 6000);
        loop.insert("mediaPath", path);
        loop.insert("inPointMs", 0);
        loop.insert("outPointMs", 2000);
        loop.insert("loopLengthMs", 2000);
        raw.insert("clips", QJsonArray{loop});
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        model.setTimeline(requireValue(parsed.timeline));
        std::vector<std::string> problems;
        const auto pcm = nt::audio::renderOffline(*model.snapshot(), 48000, 0, 6000, &problems);
        QVERIFY(problems.empty());
        QCOMPARE(pcm.size(), size_t(6 * 48000 * 2));
        const auto at = [&](int second) { return pcm[(static_cast<size_t>(second) * 48000 + 12000) * 2]; };
        QVERIFY(std::abs(at(0)) > 0.01f);
        QVERIFY(std::abs(at(0) - at(2)) < 0.0001f);
        QVERIFY(std::abs(at(0) - at(4)) < 0.0001f);
        QVERIFY(std::abs(at(1) - at(3)) < 0.0001f);
        QVERIFY(std::abs(at(1) - at(5)) < 0.0001f);
    }

    void loopOverviewStaysBoundedWithManyTracks() {
        auto raw = musicDocument(false);
        QJsonArray tracks;
        QJsonArray clips;
        for (int i = 0; i < 400; ++i) {
            const auto id = QStringLiteral("t%1").arg(i);
            tracks.append(audioTrack(qPrintable(id), qPrintable(id), i, "keyboard"));
            auto c = audioClip(qPrintable(QStringLiteral("c%1").arg(i)), qPrintable(id), 0, 3600000);
            c.insert("loopLengthMs", 2000);
            c.insert("outPointMs", 2000);
            clips.append(c);
        }
        raw.insert("tracks", tracks);
        raw.insert("clips", clips);
        openDocument(raw);
        QList<qint64> samples;
        for (int i = 0; i < 15; ++i) {
            QElapsedTimer timer;
            timer.start();
            gestures()->viewState()->setScrollLeftPx(i * 1000);
            gestures()->viewState()->flush();
            QCoreApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
            const auto frame = view->grabWindow();
            QVERIFY(!frame.isNull());
            samples.append(timer.nsecsElapsed());
        }
        std::sort(samples.begin(), samples.end());
        qInfo("CE3 400-track pan/render/readback median: %.3f ms", double(samples[samples.size() / 2]) / 1000000);
        auto* repeats = item("musicLoopRepeats-c0");
        QVERIFY(repeats);
        QVERIFY(repeats->width() <= gestures()->viewState()->viewportWidthPx());
        QVERIFY(repeats->width() > 0);
    }

    void loopMidiNoteLinesRepeatAndStopAtBoundaries() {
        auto raw = musicDocument(false);
        auto tracks = raw.value("tracks").toArray();
        auto track = tracks[0].toObject();
        track.insert("type", "midi");
        tracks[0] = track;
        raw.insert("tracks", tracks);
        auto loop = audioClip("m", "a", 0, 6000);
        loop.insert("mediaType", "midi");
        loop.insert("loopLengthMs", 2000);
        loop.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"startTick", 0}, {"durationTick", 5000}, {"pitch", 60}, {"velocity", 90}}});
        raw.insert("clips", QJsonArray{loop});
        openDocument(raw);
        auto* lines = qobject_cast<nt::ui::MidiNoteLinesItem*>(item("midiNoteLines-m"));
        QVERIFY(lines);
        QTRY_COMPARE(lines->lines().size(), 3);
        const auto rects = lines->lines();
        for (qsizetype i = 0; i < rects.size(); ++i) {
            QCOMPARE(rects[i].toMap().value("x").toDouble(), double(i) * 25);
            QCOMPARE(rects[i].toMap().value("width").toDouble(), 25.0);
            QCOMPARE(rects[i].toMap().value("repeated").toBool(), i > 0);
        }
        QCOMPARE(clip("m").value("notes").toArray()[0].toObject().value("durationTick").toDouble(), 5000.0);
    }

    // Review screenshots of looped clips and the clip menu, written when NT_PANEL_SCREENSHOTS is set.
    void loopClipReviewScreenshot() {
        auto raw = musicDocument(false);
        auto tracks = raw.value("tracks").toArray();
        auto keys = tracks[2].toObject();
        keys.insert("type", "midi");
        tracks[2] = keys;
        raw.insert("tracks", tracks);
        auto midi = audioClip("m", "c", barMs(1), 8000);
        midi.insert("mediaType", "midi");
        midi.insert("name", "Rhodes");
        midi.insert("loopLengthMs", 2000);
        midi.insert("notes", QJsonArray{QJsonObject{{"id", "n1"}, {"startTick", 0}, {"durationTick", 480}, {"pitch", 60}, {"velocity", 90}},
                                        QJsonObject{{"id", "n2"}, {"startTick", 480}, {"durationTick", 480}, {"pitch", 64}, {"velocity", 90}},
                                        QJsonObject{{"id", "n3"}, {"startTick", 960}, {"durationTick", 960}, {"pitch", 67}, {"velocity", 90}}});
        auto bass = audioClip("b1", "b", barMs(7), 10000);
        bass.insert("name", "Bass Loop");
        bass.insert("loopLengthMs", 4000);
        bass.insert("outPointMs", 4000);
        auto clips = raw.value("clips").toArray();
        clips.removeAt(1);
        clips.append(midi);
        clips.append(bass);
        // Real generated media, so the audio regions show a waveform: decaying hits on the beat.
        QTemporaryDir media;
        QVERIFY(media.isValid());
        const auto wav = media.filePath("beat.wav");
        std::vector<float> pcm(size_t(16 * 48000 * 2));
        for (size_t frame = 0; frame < pcm.size() / 2; ++frame) {
            const double t = double(frame % 24000) / 48000;
            const double hit = std::exp(-t * 9) * std::sin(2 * M_PI * (frame % 96000 < 48000 ? 110 : 82) * double(frame) / 48000);
            pcm[frame * 2] = pcm[frame * 2 + 1] = float(0.8 * hit);
        }
        QVERIFY(nt::assets::writeStereoFloatWav(wav, pcm));
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto c = clips[i].toObject();
            if (c.value("mediaType").toString() == "audio") { c.insert("mediaPath", wav); }
            clips[i] = c;
        }
        raw.insert("clips", clips);
        openDocument(raw);
        auto* lines = qobject_cast<nt::ui::MidiNoteLinesItem*>(item("midiNoteLines-m"));
        auto* clipItem = item("clip-m");
        QVERIFY(lines && clipItem);
        QVERIFY2(lines->mapToScene({0, lines->height()}).y() <= clipItem->mapToScene({0, clipItem->height()}).y() + 0.5, "Note lines spill below the clip");
        const auto folder = qEnvironmentVariable("NT_PANEL_SCREENSHOTS");
        if (folder.isEmpty()) { return; }
        QVERIFY(QDir().mkpath(folder));
        gestures()->viewState()->zoomTo(25, 0);
        gestures()->viewState()->flush();
        QTest::qWait(100);
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, lanePoint("b", barMs(7) + 1000));
        QTest::qWait(800);
        auto* region = item("tracksRegion");
        const QRect crop = region ? region->mapRectToScene(region->boundingRect()).toRect() : QRect(0, 0, 1800, 1000);
        const auto frame = view->grabWindow();
        QVERIFY(!frame.isNull());
        const qreal dpr = frame.devicePixelRatio();
        QVERIFY(frame.copy(QRect(crop.topLeft() * dpr, crop.size() * dpr)).save(QDir(folder).filePath("loop-clips.png")));
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("b", barMs(7) + 1000));
        QTRY_VERIFY(item("clipMenu-repeatClip"));
        QTest::qWait(200);
        QVERIFY(view->grabWindow().save(QDir(folder).filePath("clip-menu.png")));
        QTest::keyClick(view.get(), Qt::Key_Escape);
    }

    // SQ3d: the range "+" offers Pattern next to MIDI: an empty pattern region of the range length, one undo entry.
    void rangeCreatesPatternRegion() {
        auto raw = musicDocument(false);
        auto tracks = raw.value("tracks").toArray();
        auto keys = tracks[2].toObject();
        keys.insert("type", "midi");
        tracks[2] = keys;
        raw.insert("tracks", tracks);
        openDocument(raw);
        gestures()->viewState()->zoomTo(25, 0);
        gestures()->viewState()->flush();
        selection()->set("c", msToFrame(barMs(2)), msToFrame(barMs(6)));
        QTRY_VERIFY(item("musicRangeCreate-c") && item("musicRangeCreate-c")->isVisible());
        click("musicRangeCreate-c");
        QTRY_VERIFY(item("menu-item-midi") && item("menu-item-pattern") && item("menu-item-pattern")->isVisible());
        const auto folder = qEnvironmentVariable("NT_PANEL_SCREENSHOTS");
        if (!folder.isEmpty()) {
            QVERIFY(QDir().mkpath(folder));
            QTest::qWait(300);
            auto* region = item("tracksRegion");
            const QRect crop = region ? region->mapRectToScene(region->boundingRect()).toRect() : QRect(0, 0, 1800, 1000);
            const auto frame = view->grabWindow();
            const qreal dpr = frame.devicePixelRatio();
            QVERIFY(frame.copy(QRect(crop.topLeft() * dpr, crop.size() * dpr)).save(QDir(folder).filePath("sq3d-range-pattern.png")));
        }
        const int before = model.undoStack()->count();
        click("menu-item-pattern");
        QCOMPARE(model.undoStack()->count(), before + 1);
        QJsonObject created;
        for (const auto& value : model.clipsJson()) {
            const auto c = value.toObject();
            if (c.value("trackId").toString() == "c") created = c;
        }
        QVERIFY(created.value("pattern").isObject());
        QCOMPARE(created.value("startMs").toDouble(), barMs(2));
        QCOMPARE(created.value("durationMs").toDouble(), barMs(6) - barMs(2));
        QCOMPARE(gestures()->selection(), QStringList{created.value("id").toString()});
        model.undoStack()->undo();
        for (const auto& value : model.clipsJson()) QVERIFY(value.toObject().value("trackId").toString() != "c");
    }

    void fxBadgeShowsOnlyOnAClipWithEffects() {
        auto raw = musicDocument(false);
        auto clips = raw.value("clips").toArray();
        auto withFx = clips[1].toObject();
        withFx.insert("effects", QJsonArray{QJsonObject{{"id", "e1"}, {"type", "eq"}}});
        clips[1] = withFx;
        raw.insert("clips", clips);
        openDocument(raw);
        auto* plain = item("clip-a1");
        auto* effected = item("clip-b1");
        QVERIFY(plain && effected);
        QVERIFY(named(plain, "clipFxBadge"));
        QVERIFY(!named(plain, "clipFxBadge")->isVisible());
        QVERIFY(named(effected, "clipFxBadge")->isVisible());
    }

    void musicLoopMenuTogglesTheLoopAsOneUndo() {
        openDocument(musicDocument(false));
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("b", 5000));
        QTRY_VERIFY(item("clipMenu-loopClip"));
        QVERIFY(!item("clipMenu-loopClip")->property("looped").toBool());
        click("clipMenu-loopClip");
        QTRY_COMPARE(clip("b1").value("loopLengthMs").toDouble(), 4000.0);
        QVERIFY(clip("b1").value("durationMs").toDouble() > 4000.0);
        QCOMPARE(model.undoStack()->count(), 1);
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("b", 5000));
        QTRY_VERIFY(item("clipMenu-loopClip") && item("clipMenu-loopClip")->isVisible());
        QTRY_VERIFY(item("clipMenu-loopClip")->property("looped").toBool());
        click("clipMenu-loopClip");
        QTRY_VERIFY(!clip("b1").contains("loopLengthMs"));
        QCOMPARE(model.undoStack()->count(), 2);
    }

    void musicRepeatMenuMakesCountedCopiesOnce() {
        openDocument(musicDocument(false));
        const auto before = model.timeline().raw;
        QTest::mouseClick(view.get(), Qt::RightButton, {}, lanePoint("b", 5000));
        QTRY_VERIFY(item("clipMenu-repeatClip"));
        click("clipMenu-repeatClip");
        QTRY_VERIFY(item("musicRepeatCount"));
        auto* count = item("musicRepeatCount");
        count->forceActiveFocus();
        QVERIFY(QMetaObject::invokeMethod(count, "selectAll"));
        QTest::keyClick(view.get(), Qt::Key_3);
        click("musicRepeatApply");
        QTRY_COMPARE(model.clipsJson().size(), 7);
        QCOMPARE(model.undoStack()->count(), 1);
        QList<double> starts;
        for (const auto& value : model.clipsJson()) {
            const auto c = value.toObject();
            if (c.value("trackId") == QJsonValue("b")) { starts.append(c.value("startMs").toDouble()); }
        }
        std::sort(starts.begin(), starts.end());
        QCOMPARE(starts, QList<double>({4000, 8000, 8000, 12000, 16000}));
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, before);
    }

    void sectionClipboardActions_data() {
        QTest::addColumn<QString>("action");
        for (const auto* action : {"copy-paste", "cut", "delete", "insert"}) { QTest::newRow(action) << QString::fromLatin1(action); }
    }
    void sectionClipboardActions() {
        QFETCH(QString, action);
        openDocument(musicDocument(false));
        const auto before = model.timeline().raw;
        gestures()->setActiveTool("range");
        drag(lanePoint("a", 2000), lanePoint("b", 4000));
        QVERIFY(!gestures()->property("sectionRange").toMap().isEmpty());
        bool accepted = false;
        const auto run = [&](const QString& name) {
            accepted = false;
            return QMetaObject::invokeMethod(gestures(), "editMusicSection", Q_RETURN_ARG(bool, accepted), Q_ARG(QString, name));
        };
        if (action == "copy-paste") {
            QVERIFY(run("copy"));
            QVERIFY(accepted);
            QCOMPARE(model.timeline().raw, before);
            QCOMPARE(model.undoStack()->count(), 0);
            const QVariantMap context{{"gestures", QVariant::fromValue(static_cast<QObject*>(gestures()))}};
            bool pasteEnabled = false;
            for (const auto& entry : nt::app::shellMenuEntries()) {
                if (entry.action == "paste" && entry.enabled) { pasteEnabled = entry.enabled(context); }
            }
            QVERIFY(pasteEnabled);
            clock.seek(10000);
            QVERIFY(run("paste"));
        } else { QVERIFY(run(action)); }
        QVERIFY(accepted);
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(clip("d1").value("startMs").toDouble(), action == "cut" || action == "delete" ? 14000.0 : 18000.0);
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, before);
    }

    void mediaPlacementAcceptsBarAddress_data() {
        QTest::addColumn<QString>("operation");
        QTest::addColumn<int>("bpm");
        for (const auto* action : {"assets.dropAsset", "add_media_clip"}) {
            QTest::newRow(qPrintable(QString::fromLatin1(action) + "-120")) << QString::fromLatin1(action) << 120;
            QTest::newRow(qPrintable(QString::fromLatin1(action) + "-123")) << QString::fromLatin1(action) << 123;
            QTest::newRow(qPrintable(QString::fromLatin1(action) + "-mixed")) << QString::fromLatin1(action) << 0;
        }
    }
    void mediaPlacementAcceptsBarAddress() {
        QFETCH(QString, operation);
        QFETCH(int, bpm);
        auto raw = musicDocument(false);
        auto tempo = raw.value("tempo").toObject();
        tempo.insert("bpm", bpm == 0 ? 120 : bpm);
        raw.insert("tempo", tempo);
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        model.setTimeline(requireValue(parsed.timeline));
        const QJsonObject asset{{"id", "fedcba01234500000000000000000000"}, {"name", "tone.wav"}, {"content_type", "audio/wav"}, {"duration", 1}};
        QJsonObject payload{{"asset", asset}, {"trackId", "a"}, {"atBar", 3}, {"beat", 2}};
        if (bpm == 0) {
            payload.insert("startMs", 1000);
            QVERIFY(!model.applyEdit(operation, payload));
            QCOMPARE(model.undoStack()->count(), 0);
            return;
        }
        QVERIFY(model.applyEdit(operation, payload));
        const auto added = model.clipsJson().last().toObject();
        QCOMPARE(added.value("startMs").toDouble(), bpm == 120 ? 4500.0 : 4390.243902439024);
        QCOMPARE(added.value("durationMs").toDouble(), 1000.0);
        QCOMPARE(model.undoStack()->count(), 1);
    }

    void musicNudgeUsesSnapAndShiftUsesBar_data() {
        QTest::addColumn<bool>("large");
        QTest::addColumn<bool>("compound");
        QTest::newRow("snap-eighth") << false << false;
        QTest::newRow("shift-bar") << true << false;
        QTest::newRow("shift-six-eight-bar") << true << true;
    }
    void musicNudgeUsesSnapAndShiftUsesBar() {
        QFETCH(bool, large);
        QFETCH(bool, compound);
        auto raw = musicDocument(false);
        if (compound) {
            auto tempo = raw.value("tempo").toObject();
            tempo.insert("timeSignature", QJsonObject{{"beatsPerBar", 6}, {"beatUnit", 8}});
            raw.insert("tempo", tempo);
        }
        openDocument(raw);
        gestures()->viewState()->setGridDivision("1/8");
        gestures()->setSelection({"d1"});
        const auto modifiers = int(Qt::AltModifier) | (large ? int(Qt::ShiftModifier) : 0);
        QVERIFY(gestures()->handleKey(Qt::Key_Right, {}, modifiers, false));
        QCOMPARE(clip("d1").value("startMs").toDouble(), 16000.0 + (large ? (compound ? 1500 : 2000) : 250));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(clip("d1").value("startMs").toDouble(), 16000.0);
    }
    void sectionRangeSpansTracksAndDuplicatesOnce() {
        openDocument(musicDocument(false));
        gestures()->setActiveTool("range");
        drag(lanePoint("a", 2000), lanePoint("c", 10000));
        const auto range = gestures()->property("sectionRange").toMap();
        QCOMPARE(range.value("fromMs").toDouble(), 2000.0);
        QCOMPARE(range.value("toMs").toDouble(), 10000.0);
        auto* menuButton = item("musicRangeSection-a");
        QVERIFY(menuButton);
        click("musicRangeSection-a");
        QTRY_VERIFY(item("musicSectionDuplicate-a"));
        click("musicSectionDuplicate-a");
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(clip("d1").value("startMs").toDouble(), 24000.0);
        bool copied = false;
        for (const auto& value : model.clipsJson()) {
            const auto c = value.toObject();
            if (c.value("trackId") == QJsonValue("a") && c.value("startMs").toDouble() == 10000 && c.value("durationMs").toDouble() == 8000) { copied = true; }
        }
        QVERIFY(copied);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson().size(), 4);
    }
    void cornerLoopDrag_data() {
        QTest::addColumn<bool>("cancel");
        QTest::newRow("commit") << false;
        QTest::newRow("escape") << true;
    }
    void cornerLoopDrag() {
        QFETCH(bool, cancel);
        openDocument(musicDocument(false));
        gestures()->setActiveTool("select");
        auto* handle = item("musicClipLoopHandle-b1");
        QVERIFY(handle);
        QVERIFY(handle->isVisible());
        const auto from = center(handle);
        QTest::mousePress(view.get(), Qt::LeftButton, {}, from);
        QCOMPARE(gestures()->gestureKind(), QStringLiteral("loop"));
        QTest::mouseMove(view.get(), from + QPoint(50, 0), 20);
        QCOMPARE(model.undoStack()->count(), 0);
        if (cancel) { QTest::keyClick(view.get(), Qt::Key_Escape); }
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, from + QPoint(50, 0));
        QCoreApplication::processEvents();
        QCOMPARE(model.undoStack()->count(), cancel ? 0 : 1);
        QCOMPARE(clip("b1").value("durationMs").toDouble(), cancel ? 4000.0 : 8000.0);
        if (!cancel) {
            QCOMPARE(clip("b1").value("loopLengthMs").toDouble(), 4000.0);
            model.undoStack()->undo();
            QCOMPARE(clip("b1").value("durationMs").toDouble(), 4000.0);
        }
    }

    void loopSnapshotBuildsRepeatedWindowsWithoutChangingDocument() {
        auto raw = musicDocument(false);
        auto loop = audioClip("loop", "a", 0, 6000);
        loop.insert("mediaPath", "/private/tmp/a23-loop-plan.wav");
        loop.insert("loopLengthMs", 2000);
        loop.insert("outPointMs", 2000);
        raw.insert("clips", QJsonArray{loop});
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        model.setTimeline(requireValue(parsed.timeline));
        const auto snapshot = model.snapshot();
        QCOMPARE(snapshot->clips.size(), size_t(1));
        const auto plan = nt::audio::buildMixPlan(*snapshot);
        QCOMPARE(plan.voices.size(), size_t(3));
        QCOMPARE(model.clipsJson().size(), 1);
        QCOMPARE(model.clipsJson()[0].toObject().value("loopLengthMs").toDouble(), 2000.0);
        QCOMPARE(model.undoStack()->count(), 0);
        for (size_t i = 0; i < plan.voices.size(); ++i) {
            QCOMPARE(plan.voices[i].startMs, double(i) * 2000);
            QCOMPARE(plan.voices[i].durationMs, 2000.0);
            QCOMPARE(plan.voices[i].inPointMs, 0.0);
        }
    }
    void loopBounceUsesRepeatedSourceWindows() {
        auto raw = musicDocument(false);
        auto loop = audioClip("loop", "a", 0, 6000);
        loop.insert("mediaPath", "/private/tmp/a23-loop-plan.wav");
        loop.insert("loopLengthMs", 2000);
        loop.insert("outPointMs", 2000);
        raw.insert("clips", QJsonArray{loop});
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        const auto bounce = nt::music::bounceTimeline(requireValue(parsed.timeline), BounceKind::Dry, "a");
        QCOMPARE(bounce.clips.size(), size_t(1));
        const auto plan = nt::audio::buildMixPlan(bounce);
        QCOMPARE(plan.voices.size(), size_t(3));
        for (const auto& voice : plan.voices) {
            QCOMPARE(voice.durationMs, 2000.0);
            QCOMPARE(voice.inPointMs, 0.0);
        }
    }

    void sectionEditsAreOneUndoStep_data() {
        QTest::addColumn<QString>("operation");
        for (const auto* name : {"insert_time", "delete_time", "duplicate_range", "paste_range", "loop_clip", "duplicate_clip", "move_clip", "split_clip", "trim_clip"}) { QTest::newRow(name) << QString::fromLatin1(name); }
    }
    void sectionEditsAreOneUndoStep() {
        QFETCH(QString, operation);
        const auto parsed = nt::parseTimeline(musicDocument(false));
        QVERIFY(parsed.timeline);
        model.setTimeline(requireValue(parsed.timeline));
        const auto before = model.timeline().raw;
        QJsonObject payload{{"fromBar", 2}, {"toBar", 3}};
        if (operation == "insert_time") { payload = {{"atBar", 2}, {"bars", 1}}; }
        if (operation == "paste_range") {
            payload = {{"atBar", 2}, {"content", QJsonObject{{"lengthMs", 2000},
                {"clips", QJsonArray{audioClip("copy", "a", 0, 2000)}}}}};
        }
        if (operation == "loop_clip") { payload = {{"clipId", "b1"}, {"times", 3}}; }
        if (operation == "duplicate_clip") { payload = {{"clipId", "b1"}, {"count", 3}}; }
        if (operation == "move_clip") { payload = {{"clipId", "d1"}, {"atBar", 10}}; }
        if (operation == "split_clip" || operation == "trim_clip") { payload = {{"clipId", "b1"}, {"atBar", 4}}; }
        QVERIFY(model.applyEdit(operation, payload));
        QCOMPARE(model.undoStack()->count(), 1);
        const QString label = operation == "insert_time" ? "Insert silence" : operation == "delete_time" ? "Delete section" :
            operation == "duplicate_range" ? "Duplicate section" : operation == "paste_range" ? "Paste section" :
            operation == "loop_clip" ? "Loop clip" : operation == "duplicate_clip" ? "Repeat clip" :
            operation == "move_clip" ? "Move clip" : operation == "split_clip" ? "Split clip" : "Trim clip";
        QCOMPARE(model.undoStack()->undoText(), label);
        const auto after = model.timeline().raw;
        QVERIFY(after != before);
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, before);
        model.undoStack()->redo();
        QCOMPARE(model.timeline().raw, after);
    }



    // MM2 exit 1 in the editor: the document New music project makes opens with the
    // music object, tempo and key, four role tracks, the bar ruler and the Music layout.
    void newProjectOpensInMusicMode() {
        int next = 0;
        auto document = musicProjectDocument({96, 4, 4, MusicKey{"D", "minor"}},
                                             [&next] { return QStringLiteral("%1").arg(++next, 32, 16, QLatin1Char('0')); });
        document.insert("name", "Untitled music");
        document.insert("fps", 30);
        document.insert("width", 1920);
        document.insert("height", 1080);
        openDocument(document);
        const auto raw = doc();
        QVERIFY(raw.value("music").isObject());
        QCOMPARE(raw.value("tempo").toObject().value("bpm").toDouble(), 96.0);
        QCOMPARE(raw.value("tempo").toObject().value("key").toObject().value("tonic").toString(), QStringLiteral("D"));
        QCOMPARE(gestures()->viewState()->rulerMode(), QStringLiteral("bars"));
        QCOMPARE(gestures()->viewState()->gridDivision(), QStringLiteral("bar"));
        QCOMPARE(gestures()->activeTool(), QStringLiteral("range"));
        QCOMPARE(dockStore()->workspace(), QStringLiteral("Music"));
        QTRY_VERIFY(visiblePanels().contains("music"));
        QVERIFY(visiblePanels().contains("tracks"));
        QVERIFY(visiblePanels().contains("mixer"));
        QVERIFY2(!visiblePanels().contains("program"), qPrintable(visiblePanels().join(",")));
        // The role chips, one per track, named after the role.
        const QStringList labels{"Drums", "Bass", "Keyboard", "Guitar"};
        const auto tracks = raw.value("tracks").toArray();
        QCOMPARE(tracks.size(), 4);
        for (int i = 0; i < 4; ++i) {
            const auto id = tracks[i].toObject().value("id").toString();
            QTRY_VERIFY(item("trackRole-" + id));
            auto* chip = item("trackRole-" + id);
            QVERIFY(chip->isVisible());
            QCOMPARE(chip->property("label").toString(), labels[i]);
        }
        // The Music layout's toolbar carries the Range tool in place of the editing tools.
        // The tool list lives in the toolbar tool menu, as in Logic; the range tool is active.
        QTRY_VERIFY(item("musicToolMenuButton") && item("musicToolMenuButton")->isVisible());
        QVERIFY(!item("toolToggle")->isVisible());
    }

    // MM2 exit 5, and video behaviour: a sequence with a video track shows the monitor in the
    // Music layout, and a sequence with no music object leaves the Music workspace.
    void videoTrackShowsTheMonitor() {
        openDocument(musicDocument(true));
        QTRY_VERIFY(visiblePanels().contains("music"));
        QVERIFY2(visiblePanels().contains("program"), qPrintable(visiblePanels().join(",")));
        auto video = musicDocument(false);
        video.remove("music");
        dockStore()->switchWorkspace(int(dockStore()->workspaces().indexOf("Music")));
        auto parsed = nt::parseTimeline(video);
        QVERIFY(parsed.timeline);
        model.setTimeline(requireValue(std::move(parsed.timeline)));
        QTRY_COMPARE(dockStore()->workspace(), QStringLiteral("Editing"));
        QTRY_VERIFY(visiblePanels().contains("program"));
        QVERIFY(!visiblePanels().contains("music"));
        QVERIFY(!item("tool_range")->isVisible());
    }

    // MM2 exit 2: a Range tool drag ends on barStartFrame frames, and with Alt on the pointer's frame.
    void rangeDragSnapsToBars() {
        openDocument(musicDocument(false));
        // Over empty space on the keyboard track.
        const auto from = lanePoint("c", barMs(2) + 700);
        const auto to = lanePoint("c", barMs(6) - 600);
        drag(from, to);
        QVERIFY(selection()->active());
        QCOMPARE(selection()->trackId(), QStringLiteral("c"));
        QCOMPARE(selection()->startFrame(), barStartFrame(2, kTempo));
        QCOMPARE(selection()->endFrame(), barStartFrame(6, kTempo));
        // Over a clip on the bass track: the drag selects a range, it does not move the clip.
        const auto before = clip("b1");
        drag(lanePoint("b", barMs(3) + 400), lanePoint("b", barMs(4) + 1500));
        QCOMPARE(clip("b1"), before);
        QCOMPARE(selection()->trackId(), QStringLiteral("b"));
        QCOMPARE(selection()->startFrame(), barStartFrame(3, kTempo));
        QCOMPARE(selection()->endFrame(), barStartFrame(5, kTempo));
        // Alt: both edges where the pointer is.
        const auto freeFrom = lanePoint("c", barMs(2) + 700);
        const auto freeTo = lanePoint("c", barMs(6) - 600);
        drag(freeFrom, freeTo, Qt::AltModifier);
        QCOMPARE(selection()->startFrame(), pointerFrame(freeFrom));
        QCOMPARE(selection()->endFrame(), pointerFrame(freeTo));
        QVERIFY(selection()->endFrame() != barStartFrame(6, kTempo));
        // Beats when the ruler's division is finer than a bar.
        gestures()->viewState()->setGridDivision("1/8");
        drag(lanePoint("c", barMs(2) + 100), lanePoint("c", barMs(2) + 1100));
        QCOMPARE(selection()->startFrame(), beatStartFrame(5, kTempo));
        QCOMPARE(selection()->endFrame(), beatStartFrame(7, kTempo));
        gestures()->viewState()->setGridDivision("bar");
        // The band and its bar numbers.
        drag(lanePoint("c", barMs(2) + 200), lanePoint("c", barMs(6) - 200));
        QTRY_VERIFY(item("musicRangeBand-c") && item("musicRangeBand-c")->isVisible());
        QCOMPARE(named(item("musicRangeBand-c"), "musicRangeStartBar")->property("text").toString(), QStringLiteral("2"));
        QCOMPARE(named(item("musicRangeBand-c"), "musicRangeEndBar")->property("text").toString(), QStringLiteral("6"));
        QVERIFY(!item("musicRangeBand-b") || !item("musicRangeBand-b")->isVisible());
        // A double-click on a clip selects its span; a click clears the range.
        QTest::mouseDClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clip-b2")));
        QCoreApplication::processEvents();
        QCOMPARE(selection()->trackId(), QStringLiteral("b"));
        QCOMPARE(selection()->startFrame(), msToFrame(barMs(5)));
        QCOMPARE(selection()->endFrame(), msToFrame(barMs(7)));
        const auto empty = lanePoint("c", barMs(8));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, empty);
        QCoreApplication::processEvents();
        QVERIFY(!selection()->active());
        QCOMPARE(clock.time(), std::round(frameToMs(pointerFrame(empty))));
        // Not an undo step and not in the document.
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(!QString::fromUtf8(model.documentJson()).contains("musicSelection"));
    }

    // MM2 exit 3: the panel shows the inferred operation for 12 fixture selections, equal to MusicPlan.
    void panelShowsThePlannersOperation() {
        openDocument(musicDocument(false));
        struct Fixture { const char* track; double start; double end; };
        const std::vector<Fixture> fixtures{
            {"c", barMs(1), barMs(3)},   {"c", barMs(9), barMs(11)}, {"b", barMs(3), barMs(4)},
            {"b", barMs(3), barMs(5)},   {"b", barMs(4), barMs(6)},  {"b", barMs(2), barMs(4)},
            {"b", barMs(7), barMs(9)},   {"b", barMs(9), barMs(10)}, {"a", barMs(2), barMs(3)},
            {"d", barMs(9), barMs(10)},  {"c", barMs(8), barMs(10)}, {"c", 2083.3125, 6020.0625}};
        QCOMPARE(fixtures.size(), std::size_t(12));
        QSet<QString> seen;
        for (const auto& f : fixtures) {
            selection()->set(f.track, msToFrame(f.start), msToFrame(f.end));
            QCoreApplication::processEvents();
            const auto raw = doc();
            const auto plan = planMusicOperation(planInputFromJson(
                {{"tempo", raw.value("tempo")},
                 {"selection", QJsonObject{{"trackId", f.track}, {"startFrame", double(msToFrame(f.start))},
                                           {"endFrame", double(msToFrame(f.end))}}},
                 {"tracks", raw.value("tracks")},
                 {"clips", raw.value("clips")}}));
            const QString expected = plan.inferred ? QString::fromUtf8(taskName(*plan.inferred).data()) : QString();
            seen.insert(expected);
            QStringList checked;
            for (const auto task : kMusicTasks) {
                const auto name = QString::fromUtf8(taskName(task).data());
                auto* button = panelItem("musicOperation_" + name);
                QVERIFY2(button, qPrintable(name));
                if (button->property("checked").toBool()) { checked.append(name); }
                const bool valid = std::ranges::find(plan.valid, task) != plan.valid.end();
                QCOMPARE(button->isEnabled(), valid);
            }
            QCOMPARE(checked, expected.isEmpty() ? QStringList{} : QStringList{expected});
            QCOMPARE(panelItem("musicOperationReason")->property("text").toString(), QString::fromStdString(plan.reason));
            QCOMPARE(item("musicPanel")->property("targetTrackId").toString(), QString::fromLatin1(f.track));
            QCOMPARE(item("musicPanel")->property("targetStartFrame").toDouble(), double(msToFrame(f.start)));
        }
        // The fixtures cover the three operations and the refusal.
        QCOMPARE(seen, (QSet<QString>{"text2music", "repaint", "lego", ""}));

        // The submission inputs a later job module reads.
        selection()->set("c", barStartFrame(1, kTempo), barStartFrame(3, kTempo));
        QCoreApplication::processEvents();
        auto* panel = item("musicPanel");
        QCOMPARE(panel->property("operation").toString(), QStringLiteral("lego"));
        QCOMPARE(panel->property("candidates").toInt(), 2);
        QCOMPARE(panel->property("seed").toInt(), -1);
        QCOMPARE(panel->property("model").toString(), QStringLiteral("acestep-v15-base-Q8_0.gguf"));
        QVERIFY(!panelItem("musicGenerate")->isEnabled());
        QVERIFY(panelItem("musicGenerateReason")->isVisible());
        QCOMPARE(panelItem("musicTargetTrack")->property("text").toString(), QStringLiteral("Keyboard · bars 1–2"));
        QCOMPARE(panelItem("musicTargetRange")->property("text").toString(), QStringLiteral("2 bars · 4.0 s · role Keyboard"));
        // An override to a valid operation, which the next range resets.
        auto* generate = panelItem("musicOperation_text2music");
        QVERIFY(generate->isEnabled());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(generate));
        QTRY_COMPARE(panel->property("operation").toString(), QStringLiteral("text2music"));
        QCOMPARE(panel->property("model").toString(), QStringLiteral("acestep-v15-turbo-Q8_0.gguf"));
        QVERIFY(panelItem("musicOperationReason")->property("text").toString().contains("in place of"));
        selection()->set("c", barStartFrame(2, kTempo), barStartFrame(3, kTempo));
        QCoreApplication::processEvents();
        QCOMPARE(panel->property("operation").toString(), QStringLiteral("lego"));
        // The prompt history fills the prompt.
        QTRY_VERIFY(panelItem("musicPromptHistory_1"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(panelItem("musicPromptHistory_1")));
        QTRY_COMPARE(panel->property("prompt").toString(), QStringLiteral("tight funk drums"));
    }

    // The role picker writes musicRole through one undoable edit, and the chip follows.
    void rolePickerWritesTheRole() {
        openDocument(musicDocument(false));
        selection()->set("c", barStartFrame(1, kTempo), barStartFrame(2, kTempo));
        QCoreApplication::processEvents();
        auto* panelModel = named(item("musicPanel"), "musicPanelModel");
        QVERIFY(!panelModel);  // a QObject, not an item
        QObject* modelObject = item("musicPanel")->findChild<QObject*>("musicPanelModel");
        QVERIFY(modelObject);
        QCOMPARE(modelObject->property("trackRole").toString(), QStringLiteral("keyboard"));
        QVERIFY(QMetaObject::invokeMethod(modelObject, "setTrackRole", Q_ARG(QString, QStringLiteral("synth"))));
        QCOMPARE(track("c").value("musicRole").toString(), QStringLiteral("synth"));
        QCOMPARE(model.undoStack()->count(), 1);
        QTRY_COMPARE(item("trackRole-c")->property("label").toString(), QStringLiteral("Synth"));
        QCOMPARE(modelObject->property("trackRole").toString(), QStringLiteral("synth"));
        model.undoStack()->undo();
        QCOMPARE(track("c").value("musicRole").toString(), QStringLiteral("keyboard"));
        QTRY_COMPARE(item("trackRole-c")->property("label").toString(), QStringLiteral("Keyboard"));
    }

    // MM2 exit 4 here: with the Selection tool a lane drag is today's rubber band and leaves the range.
    void selectionToolKeepsTheRubberBand() {
        openDocument(musicDocument(false));
        selection()->set("c", barStartFrame(1, kTempo), barStartFrame(2, kTempo));
        gestures()->setActiveTool("select");
        const auto from = lanePoint("c", barMs(9) + 200);
        const auto to = lanePoint("b", barMs(4) + 200);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), to, 20);
        QCOMPARE(gestures()->gestureKind(), QStringLiteral("marquee"));
        QVERIFY(gestures()->rubberBand().value("width").toDouble() > 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCoreApplication::processEvents();
        QVERIFY(gestures()->selection().contains("b2"));
        QCOMPARE(selection()->trackId(), QStringLiteral("c"));
        QCOMPARE(selection()->endFrame(), barStartFrame(2, kTempo));
        // The tool's key, and Escape back to Select clears the range.
        auto* region = item("tracksRegion");
        region->forceActiveFocus();
        QTest::keyClick(view.get(), Qt::Key_P);
        QCOMPARE(gestures()->activeTool(), QStringLiteral("range"));
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QCOMPARE(gestures()->activeTool(), QStringLiteral("select"));
        QVERIFY(!selection()->active());
    }

    // The loop control makes the range the In and Out range the clock loops on.
    void loopControlLoopsTheRange() {
        openDocument(musicDocument(false));
        drag(lanePoint("c", barMs(2) + 300), lanePoint("c", barMs(4) - 300));
        QCOMPARE(selection()->startFrame(), barStartFrame(2, kTempo));
        QCOMPARE(selection()->endFrame(), barStartFrame(4, kTempo));
        QTRY_VERIFY(item("musicRangeLoop-c") && item("musicRangeLoop-c")->isVisible());
        QVERIFY(!clock.loop());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicRangeLoop-c")));
        QCoreApplication::processEvents();
        QVERIFY(clock.loop());
        QCOMPARE(gestures()->viewState()->rangeInMs(), barMs(2));
        QCOMPARE(gestures()->viewState()->rangeOutMs(), barMs(4));
        QCOMPARE(clock.rangeInMs(), barMs(2));
        QCOMPARE(clock.rangeOutMs(), barMs(4));
        QVERIFY(item("musicRangeLoop-c")->property("active").toBool());
        // Played past the Out point, the clock comes back inside the range.
        std::int64_t nowNs = 1'000'000'000;
        clock.setNowSource([&nowNs] { return nowNs; });
        clock.seek(barMs(3));
        clock.play();
        clock.tick();
        nowNs += std::int64_t(2500) * 1'000'000;
        clock.tick();
        QVERIFY2(clock.time() >= barMs(2) && clock.time() < barMs(4), qPrintable(QString::number(clock.time())));
        clock.pause();
        clock.setNowSource({});
        // A range the clock does not loop on reads as off.
        drag(lanePoint("c", barMs(5) + 300), lanePoint("c", barMs(6) + 300));
        QTRY_VERIFY(!item("musicRangeLoop-c")->property("active").toBool());
    }

    // MM2 exit 1 from the timeline list: the dialog refuses an off-grid tempo and creates the sequence.
    void timelineListCreatesAMusicProject() {
        TestHttpServer server;
        QJsonObject stored;
        QJsonObject update;
        server.setJson([&](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/projects.list") {
                return answer(QJsonArray{QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true}}});
            }
            if (path == "/trpc/timeline.list") { return answer(stored.isEmpty() ? QJsonArray{} : QJsonArray{stored}); }
            return answer(stored);
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) {
            const auto input = QJsonDocument::fromJson(body).object();
            if (path == "/trpc/timeline.create") {
                stored = input;
                stored.insert("updatedAt", "2026-11-12T10:00:00.000Z");
                return answer(stored);
            }
            update = input;
            return answer(QJsonObject{{"updatedAt", "2026-11-12T10:00:01.000Z"}});
        });
        nt::server::TimelineListController controller(server.base(), "token", "");
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineListPanel.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> panel(component.createWithInitialProperties({{"controller", QVariant::fromValue(&controller)}}));
        QVERIFY(panel);
        QQuickWindow window;
        auto* root = qobject_cast<QQuickItem*>(panel.get());
        root->setParentItem(window.contentItem());
        root->setSize({480, 720});
        window.resize(480, 720);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QTRY_VERIFY(!controller.projectId().isEmpty());
        auto* button = named(window.contentItem(), "createMusicProject");
        QVERIFY(button);
        QTRY_VERIFY(button->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(button, "click"));
        auto* dialog = named(window.contentItem(), "newMusicProjectDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("opened").toBool());
        auto* bpm = named(window.contentItem(), "musicBpmField");
        QVERIFY(bpm);
        bpm->setProperty("text", "87.5");
        QVERIFY(dialog->property("refusal").toString().contains("whole-number tempo"));
        auto* create = named(window.contentItem(), "applySettings");
        QVERIFY(create);
        QVERIFY(!create->isEnabled());
        auto* refusal = named(window.contentItem(), "musicProjectRefusal");
        QVERIFY(refusal && refusal->isVisible());
        bpm->setProperty("text", "140");
        dialog->setProperty("signature", "6/8");
        dialog->setProperty("keyTonic", "Eb");
        QVERIFY(dialog->property("refusal").toString().isEmpty());
        QTRY_VERIFY(create->isEnabled());
        QSignalSpy opened(&controller, &nt::server::TimelineListController::openRequested);
        // The popup's place in an offscreen window depends on the platform's window size, so the
        // button is pressed through its own API here; the range and panel tests use the pointer.
        QVERIFY(QMetaObject::invokeMethod(create, "click"));
        QTRY_COMPARE(opened.size(), 1);
        QVERIFY(opened.first().first().toString().endsWith("#timeline=" + stored.value("id").toString()));
        const auto document = update.value("document").toObject();
        QVERIFY(document.value("music").isObject());
        QCOMPARE(document.value("tempo").toObject().value("bpm").toDouble(), 140.0);
        QCOMPARE(document.value("tempo").toObject().value("timeSignature").toObject(), (QJsonObject{{"beatsPerBar", 6}, {"beatUnit", 8}}));
        QCOMPARE(document.value("tempo").toObject().value("key").toObject(), (QJsonObject{{"tonic", "Eb"}, {"mode", "major"}}));
        QCOMPARE(document.value("tracks").toArray().size(), 4);
        QTRY_VERIFY(!dialog->property("opened").toBool());
    }

    // File > New Music Project opens the dialog of the editor's document actions (UI-1).
    void fileMenuOpensTheDialog() {
        openDocument(musicDocument(false));
        const auto entries = nt::app::shellMenuEntries("File");
        const auto entry = std::ranges::find_if(entries, [](const auto& e) { return e.action == "newMusicProject"; });
        QVERIFY(entry != entries.end());
        QCOMPARE(entry->label, QStringLiteral("New Music Project…"));
        const QVariantMap none{{"kind", "shell"}};
        QVERIFY(!entry->enabled(none));
        QVERIFY(!entry->disabledReason.isEmpty());
        const QVariantMap context{{"kind", "shell"}, {"gestures", QVariant::fromValue<QObject*>(gestures())}};
        QTRY_VERIFY(entry->enabled(context));
        QVERIFY(entry->run(context));
        auto* dialog = item("newMusicProjectDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("opened").toBool());
        QCOMPARE(dialog->property("refusal").toString(), QString());
    }

    // The window of --music (UI-5): it opens on the dialog, and Create opens the new sequence.
    void musicWindowCreatesAndOpens() {
        TestHttpServer server;
        QJsonObject stored;
        server.setJson([&](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/projects.list") {
                return answer(QJsonArray{QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true}}});
            }
            if (path == "/trpc/timeline.list") { return answer(stored.isEmpty() ? QJsonArray{} : QJsonArray{stored}); }
            return answer(stored);
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) {
            if (path == "/trpc/timeline.create") {
                stored = QJsonDocument::fromJson(body).object();
                stored.insert("updatedAt", "2026-11-12T10:00:00.000Z");
                return answer(stored);
            }
            return answer(QJsonObject{{"updatedAt", "2026-11-12T10:00:01.000Z"}});
        });
        nt::server::TimelineListController controller(server.base(), "token", "");
        QQuickView window;
        window.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        window.setSource(QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/music/MusicProjectWindow.qml"));
        QVERIFY2(window.status() == QQuickView::Ready, qPrintable(window.errors().isEmpty() ? QString() : window.errors().first().toString()));
        window.resize(480, 520);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* dialog = named(window.rootObject(), "newMusicProjectDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("opened").toBool());
        QTRY_VERIFY(!controller.projectId().isEmpty());
        QSignalSpy opened(&controller, &nt::server::TimelineListController::openRequested);
        const QVariant settings = QVariantMap{{"bpm", 100}, {"beatsPerBar", 4}, {"beatUnit", 4}};
        QVERIFY(QMetaObject::invokeMethod(window.rootObject(), "create", Q_ARG(QVariant, settings)));
        QTRY_COMPARE(opened.size(), 1);
        QSignalSpy dismissed(window.rootObject(), SIGNAL(dismissed()));
        QVERIFY(QMetaObject::invokeMethod(dialog, "cancelled"));
        QCOMPARE(dismissed.size(), 1);
    }
};

int main(int argc, char** argv) {
    QTemporaryDir settings;
    qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(settings.filePath("settings.ini")));
    QGuiApplication app(argc, argv);
    TestMusicUi test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_musicui.moc"
