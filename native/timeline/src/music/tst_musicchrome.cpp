// The music chrome of the Music layout in the mounted editor, driven by
// synthetic pointer and key events (docs/MUSIC-MODE.md section 15, the music
// mode mockup): the music toolbar (key, tempo chip and lock, Snap, Loop range,
// position), the context bracket under the ruler, the hint line, the toast
// after a scripted job places its takes, the take header of a music clip, and
// the keys of the Music layout's keymap context against the Editing layout's.
#include "wiring/WiringFixture.h"
#include "music/MusicJobs.h"
#include "music/MusicRange.h"
#include "music/MusicSelection.h"
#include "music/MusicTestServer.h"
#include "music/MusicTime.h"

#include <QFile>
#include <QJsonArray>
#include <QTemporaryDir>
#include <QUndoStack>

using namespace nt::music;
using namespace nt::music::testing;

namespace {
constexpr double kMsPerPx = 80;
const MusicTempo kTempo{120, 0, 4, 4};
double barMs(std::int64_t bar) { return frameToMs(barStartFrame(bar, kTempo)); }
qint64 barFrame(qint64 bar) { return (bar - 1) * kBar; }

QJsonObject audioTrack(const char* id, const char* name, int index, const char* role) {
    return {{"id", id}, {"name", name}, {"type", "audio"}, {"index", index}, {"visible", true}, {"locked", false},
            {"muted", false}, {"solo", false}, {"heightPx", 64}, {"musicRole", role}};
}
QJsonObject audioClip(const char* id, const char* track, double startMs, double durationMs) {
    return {{"id", id}, {"trackId", track}, {"name", id}, {"mediaType", "audio"}, {"startMs", startMs},
            {"durationMs", durationMs}, {"currentAssetId", QStringLiteral("asset-%1").arg(id)}};
}
QJsonObject musicDocument(const QJsonArray& clips) {
    return {{"id", "timeline"}, {"name", "Night Drive"}, {"fps", 30}, {"width", 640}, {"height", 360},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0},
                                  {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}},
                                  {"key", QJsonObject{{"tonic", "A"}, {"mode", "minor"}}}}},
            {"music", QJsonObject{{"promptHistory", QJsonArray{}}}},
            {"tracks", QJsonArray{audioTrack("a", "Drums", 0, "drums"), audioTrack("b", "Bass", 1, "bass"),
                                  audioTrack("c", "Keyboard", 2, "keyboard")}},
            {"markers", QJsonArray{}},
            {"clips", clips}};
}
// A generated music clip on the keyboard over bars 5 to 8 with two takes; the
// active one drifts, and its record heard bars 2 to 8.
QJsonObject generatedClip(const char* id, const char* role) {
    auto take = [&](const char* takeId, int candidate, const char* label) {
        auto record = takeRecord("text2music", barFrame(5), barFrame(9), candidate, 0);
        record.insert("contextStartFrame", barFrame(2));
        record.insert("contextEndFrame", barFrame(9));
        auto alignment = record.value("alignment").toObject();
        alignment.insert("drifting", candidate == 0);
        alignment.insert("lastBeatErrorMs", candidate == 0 ? 24.0 : 0.5);
        record.insert("alignment", alignment);
        return QJsonObject{{"id", takeId}, {"assetId", assetId(0x500 + candidate)}, {"status", "success"},
                           {"createdAt", "2026-11-12T00:00:00.000Z"}, {"workflowUpdatedAt", "2026-11-12T00:00:00.000Z"},
                           {"jobId", "r0"}, {"dependencyHash", ""}, {"paramOverridesSnapshot", QJsonObject{}},
                           {"provider", "acestep"}, {"model", "acestep-v15-turbo-Q8_0.gguf"}, {"prompt", "warm keys"},
                           {"label", label}, {"source", "generated"}, {"musicGeneration", record}};
    };
    QJsonObject clip{{"id", id}, {"trackId", "c"}, {"name", "warm keys"}, {"mediaType", "audio"}, {"sourceType", "generated"},
                     {"startMs", barMs(5)}, {"durationMs", 8000}, {"inPointMs", 0}, {"outPointMs", 8000},
                     {"status", "generated"}, {"locked", false}, {"currentAssetId", assetId(0x500)}, {"activeTakeId", "t0"},
                     {"versions", QJsonArray{take("t0", 0, "Take A1"), take("t1", 1, "Take B1")}}};
    if (role) clip.insert("audioRole", role);
    return clip;
}
}  // namespace

class TestMusicChrome : public WiringFixture {
    Q_OBJECT
    QTemporaryDir m_cache;

    DockLayoutStore* dockStore() const {
        return qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
    }
    MusicSelection* selection() const { return gestures()->musicSelection(); }
    MusicJobs* jobs() { return MusicJobs::forTimeline(&model); }
    QObject* panelModel() const {
        auto* panel = item("musicPanel");
        return panel ? panel->findChild<QObject*>("musicPanelModel") : nullptr;
    }

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
        view->setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view->loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(view->status() == QQuickView::Ready, qPrintable(view->errors().isEmpty() ? QString() : view->errors().first().toString()));
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(1800, 1000);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        QTRY_VERIFY(gestures());
        QTRY_COMPARE(dockStore()->workspace(), QStringLiteral("Music"));
        QTRY_VERIFY(item("musicToolbar") && item("musicToolbar")->isVisible());
        gestures()->viewState()->zoomTo(kMsPerPx, 0);
        gestures()->viewState()->setScrollLeftPx(0);
        gestures()->viewState()->flush();
        QTest::qWait(100);
        QCoreApplication::processEvents();
    }
    QPoint lanePoint(const QString& trackId, double ms) {
        auto* lane = item("trackLane-" + trackId);
        if (!lane) { return {}; }
        lane->ensurePolished();
        return lane->mapToScene(QPointF(ms / gestures()->viewState()->msPerPx(), lane->height() / 2)).toPoint();
    }
    // Focuses a Ui.Select and types `key` into it, as a person picks by the first letter.
    void typeInto(const QString& name, Qt::Key key) {
        auto* select = item(name);
        QVERIFY2(select, qPrintable(name));
        select->forceActiveFocus(Qt::TabFocusReason);
        QTRY_VERIFY(select->hasActiveFocus());
        QTest::keyClick(view.get(), key);
        QCoreApplication::processEvents();
    }

private slots:
    void initTestCase() { QVERIFY(m_cache.isValid()); }
    void cleanup() { view.reset(); }

    // The toolbar replaces the editing tools in the Music layout, and only there.
    void toolbarReplacesTheToolsInTheMusicLayout() {
        openDocument(musicDocument({audioClip("a1", "a", barMs(1), 16000)}));
        QVERIFY(!item("toolToggle")->isVisible());
        QCOMPARE(item("musicProjectName")->property("text").toString(), QStringLiteral("Night Drive"));
        QCOMPARE(item("musicProjectSubtitle")->property("text").toString(), QStringLiteral("Music project"));
        // The tools carry their keys from the keymap.
        QCOMPARE(item("musicTool_range")->property("chip").toString(), gestures()->shortcutFor("rangeTool"));
        QCOMPARE(item("musicTool_select")->property("chip").toString(), gestures()->shortcutFor("selectTool"));
        QVERIFY(!item("musicTool_rangeKey")->property("text").toString().isEmpty());
        QVERIFY(item("musicTool_range")->property("active").toBool());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicTool_select")));
        QCOMPARE(gestures()->activeTool(), QStringLiteral("select"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicTool_range")));
        QCOMPARE(gestures()->activeTool(), QStringLiteral("range"));
        // The position readout: bar 3, beat 2, the first quarter of the beat.
        clock.seek(barMs(3) + 500 + 10);
        QTRY_COMPARE(item("musicPosition")->property("text").toString(), QStringLiteral("3.2.1"));
        clock.seek(0);
        QTRY_COMPARE(item("musicPosition")->property("text").toString(), QStringLiteral("1.1.1"));
        // Play and pause through the clock.
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicPlay")));
        QVERIFY(clock.playing());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicPlay")));
        QVERIFY(!clock.playing());
        // Another layout gets the editing tools back.
        dockStore()->switchWorkspace(int(dockStore()->workspaces().indexOf("Editing")));
        QTRY_VERIFY(item("toolToggle")->isVisible());
        QVERIFY(!item("musicToolbar")->isVisible());
        QVERIFY(!item("musicHint")->isVisible());
        QCOMPARE(item("musicHint")->implicitHeight(), 0.0);
    }

    // The key menu writes tempo.key in one undo step, also while the tempo is locked.
    void keyMenuWritesTheKey() {
        openDocument(musicDocument({audioClip("a1", "a", barMs(1), 16000)}));
        QVERIFY(item("musicTempoChip")->property("iconName").toString() == QStringLiteral("lock"));
        QCOMPARE(item("musicKeySelect")->property("value").toString(), QStringLiteral("A minor"));
        const auto undoBefore = model.undoStack()->count();
        typeInto("musicKeySelect", Qt::Key_C);
        QCOMPARE(doc().value("tempo").toObject().value("key").toObject(), (QJsonObject{{"tonic", "C"}, {"mode", "major"}}));
        QCOMPARE(model.undoStack()->count(), undoBefore + 1);
        QTRY_COMPARE(item("musicKeySelect")->property("value").toString(), QStringLiteral("C major"));
        // The timing is untouched.
        QCOMPARE(doc().value("tempo").toObject().value("bpm").toDouble(), 120.0);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicUndo")));
        QCOMPARE(doc().value("tempo").toObject().value("key").toObject(), (QJsonObject{{"tonic", "A"}, {"mode", "minor"}}));
        QTRY_COMPARE(item("musicKeySelect")->property("value").toString(), QStringLiteral("A minor"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicRedo")));
        QCOMPARE(doc().value("tempo").toObject().value("key").toObject().value("tonic").toString(), QStringLiteral("C"));
        // "No key" removes it.
        typeInto("musicKeySelect", Qt::Key_N);
        QVERIFY(!doc().value("tempo").toObject().contains("key"));
        // The edit refuses a key the model does not take.
        QCOMPARE(model.applyEdit("music.setKey", {{"tonic", "H"}, {"mode", "major"}}), quint64(0));
    }

    // MD6: the chip shows the lock while an audio clip holds the tempo, and opens the tempo settings.
    void tempoChipShowsTheLock() {
        openDocument(musicDocument({audioClip("a1", "a", barMs(1), 16000)}));
        auto* chip = item("musicTempoChip");
        QCOMPARE(chip->property("text").toString(), QStringLiteral("120 BPM 4/4"));
        QCOMPARE(chip->property("iconName").toString(), QStringLiteral("lock"));
        QVERIFY(chip->property("description").toString().startsWith("Tempo is locked because the project contains audio."));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(chip));
        auto* dialog = item("ProjectSettingsDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("opened").toBool());
        QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
        QTRY_VERIFY(!dialog->property("opened").toBool());
        // Without audio the tempo is free.
        gestures()->setSelection({"a1"});
        QVERIFY(gestures()->runAction("deleteSelected"));
        QVERIFY(clip("a1").isEmpty());
        QTRY_COMPARE(chip->property("iconName").toString(), QString());
    }

    // Snap beat makes a range drag end on a beat line; Snap bar on a bar line.
    void snapChangesWhereARangeEnds() {
        openDocument(musicDocument({}));
        QCOMPARE(gestures()->viewState()->gridDivision(), QStringLiteral("bar"));
        drag(lanePoint("c", barMs(2) + 100), lanePoint("c", barMs(2) + 1100));
        QCOMPARE(selection()->startFrame(), barStartFrame(2, kTempo));
        QCOMPARE(selection()->endFrame(), barStartFrame(3, kTempo));
        typeInto("musicSnapSelect", Qt::Key_Down);
        QCOMPARE(gestures()->viewState()->gridDivision(), QStringLiteral("beat"));
        drag(lanePoint("c", barMs(2) + 100), lanePoint("c", barMs(2) + 1100));
        QCOMPARE(selection()->startFrame(), beatStartFrame(5, kTempo));
        QCOMPARE(selection()->endFrame(), beatStartFrame(7, kTempo));
        typeInto("musicSnapSelect", Qt::Key_Up);
        QCOMPARE(gestures()->viewState()->gridDivision(), QStringLiteral("bar"));
    }

    // Loop range makes the range the loop, as the range band's control does.
    void loopRangeLoopsTheRange() {
        openDocument(musicDocument({}));
        QVERIFY(!item("musicLoopRange")->isEnabled());
        drag(lanePoint("c", barMs(2) + 300), lanePoint("c", barMs(4) - 300));
        QTRY_VERIFY(item("musicLoopRange")->isEnabled());
        QVERIFY(!clock.loop());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("musicLoopRange")));
        QVERIFY(clock.loop());
        QCOMPARE(clock.rangeInMs(), barMs(2));
        QCOMPARE(clock.rangeOutMs(), barMs(4));
        QCOMPARE(gestures()->viewState()->rangeInMs(), barMs(2));
        QCOMPARE(gestures()->viewState()->rangeOutMs(), barMs(4));
        QTRY_VERIFY(item("musicLoopRange")->property("active").toBool());
    }

    // The bracket spans the planner's window for Regenerate, and shows nothing for Generate.
    void bracketShowsThePlannersWindow() {
        openDocument(musicDocument({audioClip("a1", "a", barMs(1), 16000)}));
        QTRY_VERIFY(panelModel());
        selection()->set("a", barStartFrame(3, kTempo), barStartFrame(5, kTempo));
        QTRY_COMPARE(panelModel()->property("operation").toString(), QStringLiteral("repaint"));
        const auto label = panelModel()->property("contextLabel").toString();
        QVERIFY2(label.startsWith("Model hears bars "), qPrintable(label));
        auto* shape = item("musicContextBracketShape");
        QVERIFY(shape);
        QTRY_VERIFY(shape->isVisible());
        QCOMPARE(item("musicContextLabel")->property("text").toString(), label);
        const double startMs = panelModel()->property("contextStartFrame").toDouble() / 48;
        const double endMs = panelModel()->property("contextEndFrame").toDouble() / 48;
        QVERIFY(std::abs(shape->x() - startMs / kMsPerPx) < 1);
        QVERIFY(std::abs(shape->width() - (endMs - startMs) / kMsPerPx) < 1);
        // Generate into empty bars: no context, no bracket.
        selection()->set("c", barStartFrame(13, kTempo), barStartFrame(15, kTempo));
        QTRY_COMPARE(panelModel()->property("operation").toString(), QStringLiteral("text2music"));
        QTRY_VERIFY(!shape->isVisible());
        // The hint line names the keys of the keymap.
        QVERIFY(item("musicHint")->isVisible());
        QVERIFY(item("musicHint")->implicitHeight() > 0);
        QVERIFY(item("musicHintKey_Alt"));
        QVERIFY(item("musicHintKey_" + gestures()->shortcutFor("deleteSelected")));
    }

    // A music clip's name band shows the active take, its count and drift; other clips keep the take badge.
    void musicClipHeaderShowsTheTake() {
        auto plain = generatedClip("plain", nullptr);
        plain.insert("id", "plain");
        plain.insert("trackId", "b");
        openDocument(musicDocument({generatedClip("keys", "music"), plain}));
        QTRY_VERIFY(item("musicTakeHeader-keys") && item("musicTakeHeader-keys")->isVisible());
        QCOMPARE(item("musicTakeLabel-keys")->property("text").toString(), QStringLiteral("Take A1"));
        QCOMPARE(named(item("musicTakeCount-keys"), "musicTakeCountText")->property("text").toString(), QStringLiteral("1/2"));
        QVERIFY(item("musicDrift-keys")->isVisible());
        QVERIFY(!item("takeBadge-keys") || !item("takeBadge-keys")->isVisible());
        // The clip without the music role keeps the take badge and its own name band.
        QTRY_VERIFY(item("takeBadge-plain") && item("takeBadge-plain")->isVisible());
        QVERIFY(!item("musicTakeHeader-plain") || !item("musicTakeHeader-plain")->isVisible());
        // The other take: label and count follow, drift goes.
        QVERIFY(model.applyEdit("music.selectTake", {{"clipId", "keys"}, {"takeId", "t1"}}) != 0);
        QTRY_COMPARE(item("musicTakeLabel-keys")->property("text").toString(), QStringLiteral("Take B1"));
        QCOMPARE(named(item("musicTakeCount-keys"), "musicTakeCountText")->property("text").toString(), QStringLiteral("2/2"));
        QVERIFY(!item("musicDrift-keys")->isVisible());
        model.undoStack()->undo();

        // The open record of the active take puts its context under the ruler.
        selection()->set("c", barStartFrame(6, kTempo), barStartFrame(7, kTempo));
        QTRY_VERIFY(item("musicTake_0"));
        auto* toggle = named(item("musicTake_0"), "musicTakeRecordToggle");
        QVERIFY(toggle);
        QVERIFY(QMetaObject::invokeMethod(toggle, "click"));
        QTRY_COMPARE(item("musicContextLabel")->property("text").toString(), QStringLiteral("Model hears bars 2–8"));
        QVERIFY(item("musicContextBracketShape")->isVisible());
        QVERIFY(std::abs(item("musicContextBracketShape")->x() - barMs(2) / kMsPerPx) < 1);
        QVERIFY(QMetaObject::invokeMethod(toggle, "click"));
        QTRY_VERIFY(item("musicContextLabel")->property("text").toString() != QStringLiteral("Model hears bars 2–8"));
    }

    // The Music layout's keys (KeymapOverlay.h): R and V pick the tools, L loops the
    // range, ] and [ step through takes, one undo step each.
    void musicKeysApplyInTheMusicLayout() {
        openDocument(musicDocument({generatedClip("keys", "music")}));
        auto* region = item("tracksRegion");
        const auto press = [&](char key) {
            region->forceActiveFocus();
            QTest::keyClick(view.get(), key);
            QCoreApplication::processEvents();
        };
        QTRY_COMPARE(gestures()->keymapContext(), QStringLiteral("music"));
        QTRY_COMPARE(item("musicTool_range")->property("chip").toString(), QStringLiteral("R"));
        QCOMPARE(item("musicTool_select")->property("chip").toString(), QStringLiteral("V"));
        QCOMPARE(item("musicLoopRange")->property("chip").toString(), QStringLiteral("L"));
        QVERIFY(item("musicHintKey_["));
        QVERIFY(item("musicHintKey_]"));
        press('v');
        QCOMPARE(gestures()->activeTool(), QStringLiteral("select"));
        press('r');
        QCOMPARE(gestures()->activeTool(), QStringLiteral("range"));
        press('v');
        press('p');
        QCOMPARE(gestures()->activeTool(), QStringLiteral("range"));
        // L: the range becomes the loop.
        selection()->set("c", barStartFrame(6, kTempo), barStartFrame(8, kTempo));
        QVERIFY(!clock.loop());
        press('l');
        QVERIFY(clock.loop());
        QVERIFY(!clock.playing());
        QCOMPARE(clock.rangeInMs(), barMs(6));
        QCOMPARE(clock.rangeOutMs(), barMs(8));
        // ] and [ step the takes of the clip under the range.
        const auto undo = model.undoStack()->count();
        press(']');
        QCOMPARE(clip("keys").value("activeTakeId").toString(), QStringLiteral("t1"));
        QCOMPARE(clip("keys").value("currentAssetId").toString(), assetId(0x501));
        QCOMPARE(model.undoStack()->count(), undo + 1);
        QTRY_COMPARE(item("musicTakeLabel-keys")->property("text").toString(), QStringLiteral("Take B1"));
        press('[');
        QCOMPARE(clip("keys").value("activeTakeId").toString(), QStringLiteral("t0"));
        QCOMPARE(model.undoStack()->count(), undo + 2);
        // Without a clip under the range the keys change nothing.
        selection()->set("a", barStartFrame(1, kTempo), barStartFrame(2, kTempo));
        press(']');
        QCOMPARE(model.undoStack()->count(), undo + 2);
    }

    // In the Editing layout the preset's keys stay: L shuttles forward, R is rate stretch.
    void editingLayoutKeepsThePresetKeys() {
        openDocument(musicDocument({generatedClip("keys", "music")}));
        dockStore()->switchWorkspace(int(dockStore()->workspaces().indexOf("Editing")));
        QTRY_COMPARE(gestures()->keymapContext(), QString());
        auto* region = item("tracksRegion");
        region->forceActiveFocus();
        selection()->set("c", barStartFrame(6, kTempo), barStartFrame(8, kTempo));
        QTest::keyClick(view.get(), 'l');
        QCoreApplication::processEvents();
        QVERIFY(clock.playing());
        QVERIFY(!clock.loop());
        clock.pause();
        QTest::keyClick(view.get(), 'r');
        QCOMPARE(gestures()->activeTool(), QStringLiteral("rateStretch"));
        QTest::keyClick(view.get(), 'p');
        QCOMPARE(gestures()->activeTool(), QStringLiteral("range"));
        // ] is clip volume here, not a take step.
        QTest::keyClick(view.get(), ']');
        QCOMPARE(clip("keys").value("activeTakeId").toString(), QStringLiteral("t0"));
        QCOMPARE(gestures()->shortcutFor("rangeTool"), QStringLiteral("P"));
    }

    // The toast after a scripted job places its takes.
    void toastAfterPlacement() {
        Server server;
        openDocument(musicDocument({}));
        auto* toast = item("musicToast");
        QVERIFY(toast);
        QVERIFY(!toast->isVisible());
        jobs()->m_target = nt::server::SaveTarget{server.http.base(), {}, "timeline", m_cache.path() + "/server/user/timelines"};
        jobs()->m_transport.configure(server.base());
        jobs()->m_transport.open();
        QTRY_VERIFY(jobs()->ready());
        const auto id = jobs()->submit("c", double(barFrame(9)), double(barFrame(13)), "text2music", "warm keys", 2, -1,
                                       "acestep-v15-turbo-Q8_0.gguf");
        QVERIFY2(!id.isEmpty(), qPrintable(jobs()->error()));
        QTRY_COMPARE(server.all("generate_media").size(), 1);
        const auto sent = server.last("generate_media");
        server.result(sent.value("request_id").toString(), "generate_media", server.takes(sent, 1));
        QTRY_COMPARE(jobs()->job(id).value("state").toString(), QStringLiteral("done"));
        QTRY_VERIFY(toast->isVisible());
        QCOMPARE(toast->property("message").toString(), QStringLiteral("4 takes added. Take A1 is active."));
        QCOMPARE(named(toast, "toastText")->property("text").toString(), QStringLiteral("4 takes added. Take A1 is active."));
    }
};

int main(int argc, char** argv) {
    QTemporaryDir settings;
    qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(settings.filePath("settings.ini")));
    QGuiApplication app(argc, argv);
    TestMusicChrome test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_musicchrome.moc"
