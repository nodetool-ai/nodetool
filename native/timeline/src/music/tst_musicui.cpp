// Music mode in the mounted editor, driven by synthetic pointer events
// (docs/MUSIC-MODE.md MM2): the Music layout a music sequence opens with,
// the Range tool's snapped and free edges, the panel's inferred operation
// against MusicPlan, the Selection tool's rubber band, the program monitor
// of a sequence with a video track, the loop control, the role chip and
// picker, and New music project from the timeline list.
#include "wiring/WiringFixture.h"
#include "TestHttpServer.h"
#include "music/MusicPlan.h"
#include "music/MusicProject.h"
#include "music/MusicRange.h"
#include "music/MusicSelection.h"
#include "server/TimelineList/TimelineListController.h"
#include "app/MenuRegistry.h"

#include <QFile>
#include <QJsonArray>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QTemporaryDir>

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
            {"durationMs", durationMs}, {"currentAssetId", QStringLiteral("asset-%1").arg(id)}};
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
        QTRY_VERIFY(item("musicTool_range") && item("musicTool_range")->isVisible());
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
