// Scene Edit Detection through the production editor: the menu entry, the dialog
// driven with real pointer input, the analysis of real media, the cuts as one
// undo entry, cancel, locked and speed-changed clips.
#include "app/Menus/ShellMenus.h"
#include "scenedetect/SceneEditController.h"
#include "wiring/WiringFixture.h"

#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QTimer>

namespace {
constexpr int kAnalysisTimeoutMs = 60000;

qint64 highWaterKb() {
    QFile status(QStringLiteral("/proc/self/status"));
    if (!status.open(QIODevice::ReadOnly)) { return 0; }
    for (const auto& line : status.readAll().split('\n')) {
        if (line.startsWith("VmHWM:")) { return line.simplified().split(' ')[1].toLongLong(); }
    }
    return 0;
}
}

class TestSceneEdit : public WiringFixture {
    Q_OBJECT
    static QString media(const QString& name) { return QString(NT_FIXTURES_DIR) + "/media/" + name; }
    static QString cutsMedia() { return media("scene-cuts-360p30.mp4"); }

    // The cut times of fixtures/video-cuts.json: where its second to fourth clip start.
    static QList<double> knownCuts() {
        QFile file(QString(NT_FIXTURES_DIR) + "/video-cuts.json");
        if (!file.open(QIODevice::ReadOnly)) { return {}; }
        const auto clips = QJsonDocument::fromJson(file.readAll()).object().value("clips").toArray();
        QList<double> cuts;
        for (int i = 1; i < clips.size(); ++i) { cuts << clips[i].toObject().value("startMs").toDouble(); }
        return cuts;
    }

    // One video clip of the 8 s media at 1 s, with a linked audio clip, on unlocked tracks.
    void load(const QJsonObject& videoExtra = {}, const QString& path = cutsMedia(), bool lockedAudioTrack = false) {
        QJsonObject video{{"id", "shot"}, {"trackId", "v"}, {"name", "Shot"}, {"mediaType", "video"}, {"startMs", 1000},
                          {"durationMs", 8000}, {"inPointMs", 0}, {"mediaPath", path}, {"linkId", "L"}};
        for (auto it = videoExtra.begin(); it != videoExtra.end(); ++it) { video.insert(it.key(), it.value()); }
        QJsonObject audio{{"id", "shot-a"}, {"trackId", "a"}, {"name", "Shot"}, {"mediaType", "audio"}, {"startMs", video.value("startMs")},
                          {"durationMs", video.value("durationMs")}, {"inPointMs", video.value("inPointMs")}, {"linkId", "L"}};
        QJsonObject doc{{"name", "Scene"}, {"fps", 30}, {"width", 640}, {"height", 360}, {"durationMs", 10000},
            {"tracks", QJsonArray{
                QJsonObject{{"id", "v"}, {"name", "Video"}, {"type", "video"}, {"index", 0}, {"heightPx", 80}, {"visible", true}, {"locked", false}},
                QJsonObject{{"id", "a"}, {"name", "Audio"}, {"type", "audio"}, {"index", 1}, {"heightPx", 80}, {"visible", true},
                            {"locked", lockedAudioTrack}, {"muted", false}, {"solo", false}}}},
            {"clips", QJsonArray{video, audio}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(std::move(*parsed.timeline));
        settle();
    }
    void settle() {
        QCoreApplication::processEvents();
        QTest::qWait(60);
    }
    QObject* dialog() const {
        auto* host = item("sceneEditHost");
        return host ? host->property("dialog").value<QObject*>() : nullptr;
    }
    SceneEditController* controller() const {
        auto* d = dialog();
        return d ? d->property("controller").value<SceneEditController*>() : nullptr;
    }
    bool visible() const { return dialog() && dialog()->property("visible").toBool(); }
    // Selects the video clip and opens the dialog the way the Clip menu does.
    bool openDialog(const QStringList& selection = {"shot"}) {
        gestures()->setSelection(selection);
        return gestures()->runAction("sceneEditDetection");
    }
    void waitReady() { QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), kAnalysisTimeoutMs); }
    QList<QJsonObject> clipsOn(const QString& trackId) const {
        QList<QJsonObject> out;
        for (const auto& c : model.clipsJson()) {
            if (c.toObject().value("trackId").toString() == trackId) { out << c.toObject(); }
        }
        std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return a.value("startMs").toDouble() < b.value("startMs").toDouble(); });
        return out;
    }
    void shot(const QString& name) {
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR")) { view->grabWindow().save(qEnvironmentVariable("NT_SHOT_DIR") + "/" + name + ".png"); }
    }

private slots:
    void init() { open(); gestures()->setKeyboardPreset("nodetool"); }
    void cleanup() { view.reset(); }

    void theClipMenuOffersItForAVideoSelection() {
        load();
        QVariantMap context{{"kind", "shell"}, {"gestures", QVariant::fromValue<QObject*>(gestures())},
                            {"timeline", QVariant::fromValue<QObject*>(&model)}};
        const auto enabledInMenu = [&] {
            for (const auto& menu : nt::app::shellMenuDescription("nodetool", {}, context)) {
                if (menu.label != "Clip") { continue; }
                for (const auto& entry : menu.items) {
                    if (entry.action == "sceneEditDetection") { return entry.enabled ? 1 : 0; }
                }
            }
            return -1;
        };
        gestures()->setSelection({});
        QCOMPARE(enabledInMenu(), 0);
        gestures()->setSelection({"shot-a"});  // audio alone is not a video clip
        QCOMPARE(enabledInMenu(), 0);
        gestures()->setSelection({"shot"});
        QCOMPARE(enabledInMenu(), 1);
        QVERIFY(!openDialog({}));
        QVERIFY(!visible());
        QVERIFY(!openDialog({"shot-a"}));
        QVERIFY(!visible());
    }

    void findsEveryKnownCutAndAppliesThemAsOneUndoEntry() {
        load();
        const auto known = knownCuts();
        QCOMPARE(known.size(), 3);
        const auto before = model.documentJson();
        const int base = model.undoStack()->count();
        QVERIFY(openDialog());
        QTRY_VERIFY(visible());
        waitReady();
        QCOMPARE(controller()->cutCount(), 3);
        QCOMPARE(controller()->clipCount(), 1);
        QCOMPARE(model.undoStack()->count(), base);  // analysing changes nothing
        QCOMPARE(model.documentJson(), before);
        QTRY_VERIFY(item("sceneApplyCuts")->property("enabled").toBool());
        QCOMPARE(item("sceneSummary")->property("text").toString(), QString("Found 3 cuts in 1 clip."));
        settle();
        shot("scene-dialog-ready");

        click("sceneApplyCuts");
        QCOMPARE(controller()->state(), QString("applied"));
        QCOMPARE(model.undoStack()->count(), base + 1);
        const auto video = clipsOn("v");
        const auto audio = clipsOn("a");
        QCOMPARE(video.size(), 4);
        QCOMPARE(audio.size(), 4);  // the linked audio is cut in the same places
        const double frame = 1000.0 / 30;
        for (int i = 1; i < video.size(); ++i) {
            // video-cuts.json starts its clips at 0 s, the clip here at 1 s.
            QVERIFY2(std::abs(video[i].value("startMs").toDouble() - (1000 + known[i - 1])) < frame,
                     qPrintable(QString("cut %1 at %2").arg(i).arg(video[i].value("startMs").toDouble())));
            QCOMPARE(audio[i].value("startMs").toDouble(), video[i].value("startMs").toDouble());
        }
        double covered = 0;
        for (const auto& piece : video) { covered += piece.value("durationMs").toDouble(); }
        QCOMPARE(covered, 8000.0);
        QCOMPARE(item("sceneSummary")->property("text").toString(), QString("Cut 1 clip at 3 points. Linked audio was cut at the same places."));
        settle();
        shot("scene-dialog-applied");

        model.undoStack()->undo();
        QCOMPARE(clipsOn("v").size(), 1);
        QCOMPARE(clipsOn("a").size(), 1);
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(clipsOn("v").size(), 4);
        click("sceneClose");
        QTRY_VERIFY(!visible());
    }

    void createMarkersIsOneUndoEntryAndLeavesTheClips() {
        load();
        QVERIFY(openDialog());
        waitReady();
        const auto clipsBefore = model.clipsJson();
        const int base = model.undoStack()->count();
        QTRY_VERIFY(item("sceneCreateMarkers")->property("enabled").toBool());
        click("sceneCreateMarkers");
        QCOMPARE(controller()->state(), QString("applied"));
        QCOMPARE(model.undoStack()->count(), base + 1);
        QCOMPARE(model.clipsJson(), clipsBefore);
        const auto markers = model.markersJson();
        QCOMPARE(markers.size(), 3);
        const auto known = knownCuts();
        const double frame = 1000.0 / 30;
        for (int i = 0; i < 3; ++i) {
            QVERIFY(std::abs(markers[i].toObject().value("timeMs").toDouble() - (1000 + known[i])) < frame);
        }
        QCOMPARE(item("sceneSummary")->property("text").toString(), QString("Added 3 markers."));
        model.undoStack()->undo();
        QCOMPARE(model.markersJson().size(), 0);
        // Detecting again finds markers already there and adds none.
        model.undoStack()->redo();
        QVERIFY(openDialog());
        waitReady();
        const int count = model.undoStack()->count();
        click("sceneCreateMarkers");
        QCOMPARE(model.undoStack()->count(), count);
        QCOMPARE(model.markersJson().size(), 3);
        QVERIFY(item("sceneSummary")->property("text").toString().startsWith("No markers added"));
    }

    void cancelChangesNothing() {
        load();
        const auto before = model.documentJson();
        const int base = model.undoStack()->count();
        QVERIFY(openDialog());
        controller()->cancel();
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("idle"), kAnalysisTimeoutMs);
        QCOMPARE(controller()->cutCount(), 0);
        QVERIFY(controller()->summary().startsWith("Stopped"));
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), base);
        // The Close button after a finished analysis changes nothing either.
        QVERIFY(openDialog());
        waitReady();
        controller()->setSensitivity(100);
        click("sceneClose");
        QTRY_VERIFY(!visible());
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), base);
    }

    void stopButtonStopsARunningAnalysis() {
        load({}, media("numbered-a-1080p30.mp4"));
        QVERIFY(openDialog());
        QCOMPARE(controller()->state(), QString("analyzing"));
        QVERIFY(item("sceneProgress")->isVisible());
        click("sceneClose");  // reads "Stop" while analysing
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("idle"), kAnalysisTimeoutMs);
        QCOMPARE(clipsOn("v").size(), 1);
    }

    void nothingFoundIsReportedAndChangesNothing() {
        load({}, media("scene-motion-360p30.mp4"), false);
        const auto before = model.documentJson();
        QVERIFY(openDialog());
        waitReady();
        QCOMPARE(controller()->cutCount(), 0);
        QVERIFY(item("sceneSummary")->property("text").toString().startsWith("No cuts found in 1 clip. Nothing will change."));
        QVERIFY(!item("sceneApplyCuts")->property("enabled").toBool());
        QVERIFY(!item("sceneCreateMarkers")->property("enabled").toBool());
        QVERIFY(!controller()->applyCuts());
        QVERIFY(!controller()->createMarkers());
        QCOMPARE(model.documentJson(), before);
        shot("scene-dialog-none");
    }

    void sensitivityAndShortestShotUpdateTheCountWithoutAnotherScan() {
        load();
        QVERIFY(openDialog());
        waitReady();
        QCOMPARE(controller()->cutCount(), 3);
        // Cuts at frames 60, 120 and 180, each 60 frames after the one before. A shortest shot of
        // 61 frames leaves only the one at 120, which is 120 frames from the start.
        controller()->setMinShotFrames(61);
        QCOMPARE(controller()->state(), QString("ready"));
        QCOMPARE(controller()->cutCount(), 1);
        controller()->setMinShotFrames(60);
        QCOMPARE(controller()->cutCount(), 3);
        controller()->setMinShotFrames(61);
        controller()->setMinShotFrames(6);
        QCOMPARE(controller()->cutCount(), 3);
        // Typing into the field commits the same way.
        auto* field = item("sceneMinShot");
        QVERIFY(field);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(field));
        QTRY_VERIFY(field->hasActiveFocus());
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        for (const auto key : {Qt::Key_1, Qt::Key_0, Qt::Key_0}) { QTest::keyClick(view.get(), key); }
        QTest::keyClick(view.get(), Qt::Key_Return);
        QCOMPARE(controller()->minShotFrames(), 100);
        QCOMPARE(controller()->cutCount(), 1);
        QCOMPARE(item("sceneSummary")->property("text").toString(), QString("Found 1 cut in 1 clip."));
    }

    void aLockedClipIsLeftOutAndSaid() {
        load({{"locked", true}});
        QVERIFY(openDialog());
        QCOMPARE(controller()->state(), QString("failed"));
        QVERIFY(controller()->notice().contains("1 locked clip"));
        QVERIFY(!item("sceneApplyCuts")->property("enabled").toBool());
        QCOMPARE(clipsOn("v").size(), 1);
    }

    void aLockedPartnerTrackLeavesTheClipsAlone() {
        load({}, cutsMedia(), true);
        QVERIFY(openDialog());
        QCOMPARE(controller()->state(), QString("failed"));
        QVERIFY(controller()->notice().contains("locked"));
        QCOMPARE(clipsOn("v").size(), 1);
        QCOMPARE(clipsOn("a").size(), 1);
    }

    void aSpeedChangedClipIsCutWhereTheShotChanges() {
        // 4 s of timeline at twice the speed show the 8 s of media: the cuts come at 1, 2 and 3 s.
        load({{"durationMs", 4000}, {"speedMultiplier", 2}, {"outPointMs", 8000}});
        QVERIFY(openDialog());
        waitReady();
        QCOMPARE(controller()->cutCount(), 3);
        QVERIFY(controller()->applyCuts());
        const auto video = clipsOn("v");
        QCOMPARE(video.size(), 4);
        const double frame = 1000.0 / 30;
        const double expectedStart[] = {2000, 3000, 4000};
        const double expectedIn[] = {2000, 4000, 6000};
        for (int i = 1; i < 4; ++i) {
            QVERIFY2(std::abs(video[i].value("startMs").toDouble() - expectedStart[i - 1]) < frame,
                     qPrintable(QString("start %1").arg(video[i].value("startMs").toDouble())));
            QVERIFY(std::abs(video[i].value("inPointMs").toDouble() - expectedIn[i - 1]) < 2 * frame);
            QCOMPARE(video[i].value("speedMultiplier").toDouble(), 2.0);
        }
    }

    void aSlowedClipIsAnalysedAtItsOwnRate() {
        // Half speed: the 4 s clip shows the first 2 s of media, which holds the cut at 2 s only
        // as its last frame, so nothing is found inside it.
        load({{"durationMs", 4000}, {"speedMultiplier", 0.5}, {"outPointMs", 2000}});
        QVERIFY(openDialog());
        waitReady();
        QCOMPARE(controller()->cutCount(), 0);
        // Starting 1 s into the media at half speed, the cut at 2 s comes 2 s into the clip.
        load({{"durationMs", 4000}, {"speedMultiplier", 0.5}, {"inPointMs", 1000}, {"outPointMs", 3000}});
        QVERIFY(openDialog());
        waitReady();
        QCOMPARE(controller()->cutCount(), 1);
        QVERIFY(controller()->applyCuts());
        const auto video = clipsOn("v");
        QCOMPARE(video.size(), 2);
        QVERIFY(std::abs(video[1].value("startMs").toDouble() - 3000) < 1000.0 / 30);
    }

    void aTimeRemapAnalysesButCannotBeCut() {
        // A reversed remap plays the media backwards, so the cuts mirror.
        const QJsonObject remap{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 8000}, {"easing", "linear"}},
                                                         QJsonObject{{"t", 1}, {"sourceMs", 0}, {"easing", "linear"}}}}};
        load({{"timeRemap", remap}});
        QVERIFY(openDialog());
        waitReady();
        QCOMPARE(controller()->cutCount(), 3);
        QCOMPARE(controller()->cuttableCount(), 0);
        QVERIFY(controller()->notice().contains("time remap"));
        QVERIFY(!item("sceneApplyCuts")->property("enabled").toBool());
        const int base = model.undoStack()->count();
        QVERIFY(!controller()->applyCuts());
        QCOMPARE(model.undoStack()->count(), base);
        QTRY_VERIFY(item("sceneCreateMarkers")->property("enabled").toBool());
        click("sceneCreateMarkers");
        const auto markers = model.markersJson();
        QCOMPARE(markers.size(), 3);
        const double frame = 1000.0 / 30;
        const double mirrored[] = {1000 + 2000, 1000 + 4000, 1000 + 6000};
        for (int i = 0; i < 3; ++i) {
            QVERIFY2(std::abs(markers[i].toObject().value("timeMs").toDouble() - mirrored[i]) <= 1.5 * frame,
                     qPrintable(QString::number(markers[i].toObject().value("timeMs").toDouble())));
        }
    }

    void aClipChangedSinceTheAnalysisIsNotCut() {
        load();
        QVERIFY(openDialog());
        waitReady();
        const QJsonObject moved = clipsOn("v").first();
        auto changed = moved;
        changed.insert("startMs", 1500);
        auto changedAudio = clipsOn("a").first();
        changedAudio.insert("startMs", 1500);
        model.replaceClips(QJsonArray{changed, changedAudio});
        settle();
        const int base = model.undoStack()->count();
        QVERIFY(!controller()->applyCuts());
        QCOMPARE(model.undoStack()->count(), base);
    }

    // Opt-in, because it needs a 10 minute 1080p file: NT_SCENE_LONG=1 NT_SCENE_LONG_FILE=<file>. The file
    // is testsrc2 at 1920x1080, 30 fps, 600 s. The analysis runs on its own thread, so the GUI thread's
    // timer must keep ticking through it, and the memory it holds must not grow with the clip.
    void aTenMinuteClipAnalysesWithoutBlockingTheGui() {
        const QString file = qEnvironmentVariable("NT_SCENE_LONG_FILE");
        if (qEnvironmentVariableIntValue("NT_SCENE_LONG") != 1 || file.isEmpty()) {
            QSKIP("Set NT_SCENE_LONG=1 and NT_SCENE_LONG_FILE=<10 minute 1080p30 file> to run this.");
        }
        QVERIFY(QFileInfo::exists(file));
        load({{"durationMs", 600000}}, file);
        qint64 maxGapMs = 0;
        qint64 ticks = 0;
        QElapsedTimer clock;
        clock.start();
        qint64 last = clock.elapsed();
        QTimer ticker;
        ticker.setInterval(10);
        connect(&ticker, &QTimer::timeout, this, [&] {
            const qint64 now = clock.elapsed();
            maxGapMs = std::max(maxGapMs, now - last);
            last = now;
            ++ticks;
        });
        ticker.start();
        const qint64 before = highWaterKb();
        QVERIFY(openDialog());
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), 600000);
        ticker.stop();
        const qint64 after = highWaterKb();
        qInfo() << "Long clip: seconds" << clock.elapsed() / 1000.0 << "ticks" << ticks << "longest GUI gap ms" << maxGapMs
                << "VmHWM KiB before" << before << "after" << after << "cuts" << controller()->cutCount();
        QVERIFY(ticks > 100);
        QVERIFY2(maxGapMs < 250, qPrintable(QString::number(maxGapMs)));
        QVERIFY(after - before < 300 * 1024);
    }

    void aMissingFileIsReported() {
        load({}, media("does-not-exist.mp4"));
        QVERIFY(openDialog());
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("failed"), kAnalysisTimeoutMs);
        QVERIFY(controller()->notice().contains("Shot"));
        QVERIFY(!item("sceneApplyCuts")->property("enabled").toBool());
    }
};

QTEST_MAIN(TestSceneEdit)
#include "tst_sceneedit.moc"
