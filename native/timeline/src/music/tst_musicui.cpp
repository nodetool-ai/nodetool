// Music mode in the mounted editor, driven by synthetic pointer events
// (docs/MUSIC-MODE.md MM2): the Music layout a music sequence opens with,
// the Range tool's snapped and free edges, the panel's inferred operation
// against MusicPlan, the Selection tool's rubber band, the program monitor
// of a sequence with a video track, the loop control, the role chip and
// picker, and New music project from the timeline list.
#include "wiring/WiringFixture.h"
#include "TestHttpServer.h"
#include "music/MusicPlan.h"
#include "music/MusicBounce.h"
#include "assets/AssetWav.h"
#include "audio/AudioEngine.h"
#include "audio/Mixer.h"
#include "ui/MidiNoteLines.h"
#include "music/MusicProject.h"
#include "music/MusicRange.h"
#include "music/MusicSelection.h"
#include "server/TimelineList/TimelineListController.h"
#include "app/MenuRegistry.h"
#include "aiassist/AssistantCommands.h"

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
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
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
    void cleanup() { view.reset(); }

    void musicOpsAreCallableAssistantCommands_data() {
        QTest::addColumn<QString>("operation");
        for (const auto* name : {"insert_time", "delete_time", "duplicate_range", "paste_range", "loop_clip", "duplicate_clip", "move_clip", "split_clip", "trim_clip", "add_media_clip", "delete-locked"}) {
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
        openDocument(raw);
        nt::aiassist::AssistantCommands commands(model, clock);
        commands.setEditor(view->rootObject());
        QJsonObject payload;
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
        const auto result = commands.execute("ui_timeline_run_command", {{"timeline_id", timelineId}, {"command", operation == "delete-locked" ? QStringLiteral("delete_time") : operation}, {"params", payload.toVariantMap()}});
        if (operation == "delete-locked") {
            QVERIFY(!result.value("ok").toBool());
            QVERIFY(result.value("error").toString().contains("Locked bass"));
            QCOMPARE(model.undoStack()->count(), 0);
            QCOMPARE(doc(), before);
            return;
        }
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 1);
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
        std::vector<float> source(2 * 2 * 48000);
        for (size_t i = 0; i < source.size(); ++i) { source[i] = i < 2 * 48000 ? 0.2f : 0.4f; }
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
        model.setTimeline(*parsed.timeline);
        std::vector<std::string> problems;
        const auto pcm = nt::audio::renderOffline(*model.snapshot(), 48000, 0, 6000, &problems);
        QVERIFY(problems.empty());
        QCOMPARE(pcm.size(), size_t(6 * 48000 * 2));
        const auto at = [&](int second) { return pcm[static_cast<size_t>((second * 48000 + 12000) * 2)]; };
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
        model.setTimeline(*parsed.timeline);
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
        model.setTimeline(*parsed.timeline);
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
        const auto bounce = nt::music::bounceTimeline(*parsed.timeline, BounceKind::Dry, "a");
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
        model.setTimeline(*parsed.timeline);
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
        model.setTimeline(std::move(*parsed.timeline));
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
