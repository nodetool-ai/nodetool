// The keyboard presets, checked in the mounted editor with real key events.
// A key press uses what the platform reports: Shift+1 is Qt::Key_Exclam and
// Shift+= is Qt::Key_Plus on a US keyboard, not the digit or Qt::Key_Equal.
#include "wiring/WiringFixture.h"
#include "edit/Keymap.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include "wiring/KeyActions.h"
#include <QJSValue>
#include <QJsonDocument>
#include <QQmlContext>
#include <QQmlEngine>
#include <QSettings>
#include <QTemporaryDir>
#include <map>

namespace {
using Binding = nt::edit::PresetBinding;
std::vector<Binding> bindingsOf(const QString& preset) { return nt::edit::presetBindings(preset); }
const QStringList PRESETS{"premiere", "fcp"};
// Every key one chord means, so "A" and "a" count as one key. Empty when
// nothing repeats.
QStringList repeatedChords(const std::vector<Binding>& bindings) {
    std::map<QString, QString> seen;
    QStringList repeats;
    for (const auto& b : bindings) {
        const auto chord = QStringLiteral("%1%2%3%4").arg(b.ctrl ? "Ctrl+" : "", b.alt ? "Alt+" : "", b.shift ? "Shift+" : "",
                                                          b.key.size() == 1 ? b.key.toLower() : b.key);
        const auto [at, inserted] = seen.try_emplace(chord, b.action);
        if (!inserted && at->second != b.action) { repeats.append(chord + ": " + at->second + " and " + b.action); }
    }
    return repeats;
}
}

class TestKeyboardPresets : public WiringFixture {
    Q_OBJECT
    QQuickItem* region() const { return item("tracksRegion"); }
    QObject* dock() const { return view->rootObject()->property("dockCanvas").value<QObject*>(); }
    QStringList visiblePanels() const { return dock()->property("visiblePanels").toStringList(); }
    QUndoStack* history() const { return model.undoStack(); }
    double playhead() const { return clock.currentTimeMs(); }
    void press(int key, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        region()->forceActiveFocus();
        QTest::keyClick(view.get(), static_cast<Qt::Key>(key), mods);
        QCoreApplication::processEvents();
    }
    // One press made one undo entry, and undo returns the document.
    template <typename Check>
    void editKey(int key, Qt::KeyboardModifiers mods, Check check) {
        const auto before = doc();
        const int entries = history()->index();
        press(key, mods);
        check();
        if (QTest::currentTestFailed()) { return; }
        QCOMPARE(history()->index(), entries + 1);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(doc(), before);
    }
    void selectEdge(const QString& id, const QString& edge) {
        auto* owner = item("clip-" + id);
        QVERIFY(owner);
        // The dock lays out on the next frame.
        gestures()->viewState()->flush();
        QTest::qWait(100);
        auto* handle = named(owner, edge == "start" ? "clipTrimStart" : "clipTrimEnd");
        QVERIFY(handle);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(handle));
        QCoreApplication::processEvents();
        QCOMPARE(gestures()->property("selectedEdit").toMap().value("clipId").toString(), id);
    }
    void loadDocument(const char* json) {
        auto parsed = nt::parseTimelineJson(json);
        QVERIFY(parsed.timeline);
        gestures()->setSelection({});
        model.setTimeline(std::move(*parsed.timeline));
        clock.seek(0);
        gestures()->viewState()->flush();
        QCoreApplication::processEvents();
    }
    QString focusedPanel() {
        QVariant result;
        return QMetaObject::invokeMethod(view->rootObject(), "focusedPanel", Q_RETURN_ARG(QVariant, result)) ? result.toString() : QString();
    }
    // NT_KEYBOARD_SCREENSHOTS names a folder for the views to look at.
    void screenshot(const QString& name) {
        const auto folder = qEnvironmentVariable("NT_KEYBOARD_SCREENSHOTS");
        if (folder.isEmpty()) { return; }
        QTest::qWait(200);
        QVERIFY(view->grabWindow().save(folder + "/" + name + ".png"));
    }
    double volumeOf(const QString& id) const { return clip(id).value("volumeDb").toDouble(); }
private slots:
    void init() {
        // The dock remembers its layout there, so a slot starts from the default.
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        open();
        gestures()->setKeyboardPreset("premiere");
        clock.pause();
        clock.setRate(1);
        clock.setLoop(false);
        QCOMPARE(gestures()->keyboardPreset(), QString("premiere"));
    }
    void cleanup() { view.reset(); }

    // A key must not be dead: every binding of every preset names an action
    // the editor has code for.
    // Each preset alone and in each editor context ("premiere@music").
    void everyBindingHasAHandler_data() {
        QTest::addColumn<QString>("preset");
        QVERIFY(!nt::edit::keymapContexts().isEmpty());
        for (const auto& preset : PRESETS) {
            QTest::newRow(qPrintable(preset)) << preset;
            for (const auto& context : nt::edit::keymapContexts()) {
                const auto name = nt::edit::keymapName(preset, context);
                QTest::newRow(qPrintable(name)) << name;
            }
        }
    }
    void everyBindingHasAHandler() {
        QFETCH(QString, preset);
        const auto available = ClipGestureController::availableActions();
        QStringList missing;
        int inspected = 0;
        for (const auto& b : bindingsOf(preset)) {
            ++inspected;
            if (!available.contains(b.action) && !missing.contains(b.action)) { missing.append(b.action); }
        }
        QVERIFY(inspected > 50);
        QVERIFY2(missing.isEmpty(), qPrintable(preset + " has no handler for: " + missing.join(", ")));
    }
    void noKeyIsBoundTwice_data() { everyBindingHasAHandler_data(); }
    void noKeyIsBoundTwice() {
        QFETCH(QString, preset);
        const auto repeats = repeatedChords(bindingsOf(preset));
        QVERIFY2(repeats.isEmpty(), qPrintable(repeats.join("; ")));
    }
    // The Music layout's keys win there and nowhere else; Range keeps P everywhere.
    void musicContextOverridesOnlyInMusic() {
        using nt::edit::KeyEventLike;
        using nt::edit::keymapName;
        using nt::edit::resolveTimelineAction;
        const auto key = [](const char* k, const char* code) { return KeyEventLike{k, code}; };
        const QString music = keymapName("premiere", "music");
        QCOMPARE(music, QStringLiteral("premiere@music"));
        QCOMPARE(resolveTimelineAction(key("r", "KeyR"), "premiere"), QStringLiteral("rateStretchTool"));
        QCOMPARE(resolveTimelineAction(key("r", "KeyR"), music), QStringLiteral("rangeTool"));
        QCOMPARE(resolveTimelineAction(key("l", "KeyL"), "premiere"), QStringLiteral("shuttleForward"));
        QCOMPARE(resolveTimelineAction(key("l", "KeyL"), music), QStringLiteral("loopMusicRange"));
        QCOMPARE(resolveTimelineAction(key("[", "BracketLeft"), "premiere"), QStringLiteral("clipVolumeDown"));
        QCOMPARE(resolveTimelineAction(key("[", "BracketLeft"), music), QStringLiteral("previousMusicTake"));
        QCOMPARE(resolveTimelineAction(key("]", "BracketRight"), "premiere"), QStringLiteral("clipVolumeUp"));
        QCOMPARE(resolveTimelineAction(key("]", "BracketRight"), music), QStringLiteral("nextMusicTake"));
        QCOMPARE(resolveTimelineAction(key("v", "KeyV"), music), QStringLiteral("selectTool"));
        for (const auto& preset : PRESETS) {
            QCOMPARE(resolveTimelineAction(key("p", "KeyP"), preset), QStringLiteral("rangeTool"));
            QCOMPARE(resolveTimelineAction(key("p", "KeyP"), keymapName(preset, "music")), QStringLiteral("rangeTool"));
            // The chips on the music toolbar read the context's key first.
            QCOMPARE(nt::edit::formatActionShortcut(keymapName(preset, "music"), "rangeTool"), QStringLiteral("R"));
            QCOMPARE(nt::edit::formatActionShortcut(keymapName(preset, "music"), "selectTool"), QStringLiteral("V"));
            QCOMPARE(nt::edit::formatActionShortcut(preset, "loopMusicRange"), QString());
        }
        // Final Cut's V enables clips outside the Music layout.
        QCOMPARE(resolveTimelineAction(key("v", "KeyV"), "fcp"), QStringLiteral("toggleClipEnabled"));
        QCOMPARE(resolveTimelineAction(key("v", "KeyV"), keymapName("fcp", "music")), QStringLiteral("selectTool"));
        // A Shift chord the context does not name keeps its action.
        QCOMPARE(resolveTimelineAction(KeyEventLike{"{", "BracketLeft", false, false, true}, music), QStringLiteral("clipVolumeDownMore"));
        // The controller resolves in the context it is given.
        gestures()->setKeymapContext("music");
        QCOMPARE(gestures()->resolveKeyAction(Qt::Key_L, "l", Qt::NoModifier), QStringLiteral("loopMusicRange"));
        QCOMPARE(gestures()->shortcutFor("rangeTool"), QStringLiteral("R"));
        gestures()->setKeymapContext({});
        QCOMPARE(gestures()->resolveKeyAction(Qt::Key_L, "l", Qt::NoModifier), QStringLiteral("shuttleForward"));
        QCOMPARE(gestures()->shortcutFor("rangeTool"), QStringLiteral("P"));
    }

    void theRepeatCheckFindsARepeat() {
        // The check above fails on bad input.
        QVERIFY(!repeatedChords({{"one", "k", true}, {"two", "K", true}}).isEmpty());
        QVERIFY(repeatedChords({{"one", "k", true}, {"two", "k", false}}).isEmpty());
    }

    // The issue's table, one slot per group.
    // Every action of every preset runs in a state it applies to, so a name in
    // availableActions() with no code behind it fails here.
    void everyBindingRuns() {
        auto* source = view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QStringList actions;
        for (const auto& preset : PRESETS) {
            for (const auto& b : bindingsOf(preset)) {
                if (!actions.contains(b.action)) { actions.append(b.action); }
            }
        }
        QVERIFY(actions.size() > 50);
        for (const auto& action : actions) {
            loadDocument(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
              "tracks":[{"id":"v","name":"Video","type":"video","index":0},{"id":"w","name":"Video 2","type":"video","index":1},
                        {"id":"a","name":"Audio","type":"audio","index":2}],
              "clips":[{"id":"c","trackId":"v","name":"Still","mediaType":"image","startMs":1000,"durationMs":2000,"currentAssetId":"asset-1"},
                       {"id":"d","trackId":"v","name":"Later","mediaType":"image","startMs":5000,"durationMs":1000},
                       {"id":"s","trackId":"a","name":"Sound","mediaType":"audio","startMs":5000,"durationMs":1000}]})");
            gestures()->setActiveTool("select");
            auto* dockStore = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
            dockStore->switchWorkspace(0);
            QCoreApplication::processEvents();
            clock.seek(1500);
            source->setAsset({{"id", "asset-2"}, {"name", "Take"}, {"content_type", "video/mp4"}, {"duration", 10}});
            gestures()->viewState()->zoomTo(10, 0);
            gestures()->viewState()->setScrollLeftPx(0);
            gestures()->viewState()->flush();
            QCoreApplication::processEvents();
            gestures()->viewState()->setRangeIn(1100);
            gestures()->viewState()->setRangeOut(1400);
            gestures()->setSelection(action == "groupClips" ? QStringList{"c", "d"}
                : action == "audioGain" || action == "applyDefaultAudioTransition" || action.startsWith("clipVolume") ? QStringList{"s"}
                : QStringList{"c"});
            if (action == "paste" || action == "pasteInsert" || action == "pasteAttributes") { QVERIFY(gestures()->runAction("copy")); }
            if (action.contains("Marker")) { model.addMarker(1500, "A"); clock.seek(1500); }
            if (action.startsWith("trimEdit") || action == "extendEdit") {
                // On a selected clip the transition grip takes the middle of the edge.
                gestures()->setSelection({});
                selectEdge("c", "end");
            }
            if (action == "nextKeyframe" || action == "prevKeyframe") { clock.seek(1000); }
            const bool ran = gestures()->runAction(action);
            // Escape reports false on purpose, so the key still closes a menu.
            QVERIFY2(ran || action == "escape", qPrintable(action));
            if (action == "toggleProgramFullscreen" || action == "maximizePanel" || action == "toggleShortcuts") { gestures()->runAction(action); }
            if (action == "speedDuration" || action == "audioGain" || action == "pasteAttributes") { QTest::keyClick(view.get(), Qt::Key_Escape); }
            clock.pause();
            clock.setRate(1);
            clock.setLoop(false);
            QCoreApplication::processEvents();
        }
        source->setAsset({});
    }
    void presetKeepsItsKeysFromRegisteredDefaults() {
        // Ctrl+B is Final Cut's split, so the panel toggle stands aside there and
        // says nothing about a key it does not own.
        auto* dockCanvas = dock();
        const bool collapsed = dockCanvas->property("leftCollapsed").toBool();
        gestures()->setKeyboardPreset("fcp");
        clock.seek(1500);
        const auto clips = model.clipsJson().size();
        press(Qt::Key_B, Qt::ControlModifier);
        QCOMPARE(dockCanvas->property("leftCollapsed").toBool(), collapsed);
        QVERIFY(model.clipsJson().size() > clips);
        QCOMPARE(gestures()->shortcutFor("toggleLeftPanels"), QString());
        press(Qt::Key_Z, Qt::ControlModifier);
        gestures()->setKeyboardPreset("premiere");
        QCOMPARE(gestures()->shortcutFor("toggleLeftPanels"), QKeySequence("Ctrl+B").toString(QKeySequence::NativeText));
        press(Qt::Key_B, Qt::ControlModifier);
        QCOMPARE(dockCanvas->property("leftCollapsed").toBool(), !collapsed);
        press(Qt::Key_B, Qt::ControlModifier);
        // An action with its own key in the preset gives up its default: in the
        // Premiere preset Ctrl+Shift+E exports a frame and never disables a clip.
        gestures()->setSelection({"c"});
        const auto before = doc();
        press(Qt::Key_E, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(doc(), before);
        // Each registered default is free in every preset, or stands aside as above.
        std::map<QString, QString> owners;
        for (const auto& action : nt::wiring::keyActions()) {
            for (const auto& key : action.defaultKeys) {
                const auto [at, inserted] = owners.try_emplace(key.toString(), action.name);
                QVERIFY2(inserted, qPrintable(key.toString() + ": " + at->second + " and " + action.name));
            }
        }
        QVERIFY(!owners.empty());
    }
    void oldPremiereKeysMoved() {
        // Ctrl+Alt+K no longer splits, Shift+L is slow shuttle, and loop keeps a key.
        QCOMPARE(gestures()->shortcutFor("splitAtPlayhead"), QString("Ctrl+K"));
        QCOMPARE(gestures()->shortcutFor("cutAllTracks"), QString("Ctrl+Shift+K"));
        press(Qt::Key_L, Qt::ControlModifier | Qt::ShiftModifier);
        QVERIFY(clock.loop());
        press(Qt::Key_L, Qt::ControlModifier | Qt::ShiftModifier);
        QVERIFY(!clock.loop());
        press(Qt::Key_L, Qt::ShiftModifier);
        QVERIFY(!clock.loop());
        QCOMPARE(clock.rate(), 0.1);
        press(Qt::Key_K);
        // The other presets keep the web's keys.
        gestures()->setKeyboardPreset("fcp");
        press(Qt::Key_L, Qt::ControlModifier);
        QVERIFY(clock.loop());
        press(Qt::Key_L, Qt::ControlModifier);
        // Alt+M is the DAW layout there, and the Audio workspace here.
        auto* store = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        const auto workspace = store->workspace();
        press(Qt::Key_M, Qt::AltModifier);
        QCOMPARE(store->workspace(), QString("Audio"));
        press(Qt::Key_M, Qt::AltModifier);
        QCOMPARE(store->workspace(), workspace);
        QVERIFY(nt::edit::resolveWebTimelineAction({"k", "KeyK", true, false, false, true}, "premiere") == "splitAtPlayhead");
    }
    void sheetListsTheNewKeys() {
        QStringList dimmed;
        QStringList listed;
        for (const auto& group : gestures()->shortcutSheet().value("groups").toList()) {
            for (const auto& row : group.toMap().value("rows").toList()) {
                const auto data = row.toMap();
                listed.append(data.value("id").toString());
                if (!data.value("available").toBool() && data.contains("action")) { dimmed.append(data.value("id").toString()); }
            }
        }
        // The sheet's footer names the key that opens it.
        press(Qt::Key_Question, Qt::ShiftModifier);
        auto* dialog = item("shortcutsSheet");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("open").toBool());
        screenshot("sheet");
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_VERIFY(!dialog->property("open").toBool());
        for (const auto& b : bindingsOf("premiere")) { QVERIFY2(listed.contains(b.action) || b.action == "toggleShortcuts", qPrintable(b.action)); }
        QVERIFY2(dimmed.isEmpty(), qPrintable(dimmed.join(", ")));
    }
    void splitKeys() {
        gestures()->setSelection({"c"});
        const auto clips = model.clipsJson().size();
        editKey(Qt::Key_K, Qt::ControlModifier, [&] {
            QCOMPARE(model.clipsJson().size(), clips + 1);
            QCOMPARE(clip("e").value("durationMs").toDouble(), 2000.0);
        });
        gestures()->setSelection({});
        editKey(Qt::Key_K, Qt::ControlModifier | Qt::ShiftModifier, [&] { QCOMPARE(model.clipsJson().size(), clips + 2); });
        const auto before = doc();
        press(Qt::Key_K, Qt::ControlModifier | Qt::AltModifier);
        QCOMPARE(doc(), before);
    }
    void navigationKeys() {
        press(Qt::Key_Down);
        QCOMPARE(playhead(), 3000.0);
        press(Qt::Key_Up);
        QCOMPARE(playhead(), 1000.0);
        press(Qt::Key_End);
        QCOMPARE(playhead(), 6000.0);
        press(Qt::Key_Home);
        QCOMPARE(playhead(), 0.0);
        // Up and Down follow the targeted tracks, Shift+Up and Shift+Down do not.
        auto& targets = nt::targeting::TrackTargeting::current();
        targets.setTrackTargeted("v", false);
        targets.setTrackTargeted("w", false);
        clock.seek(1500);
        press(Qt::Key_Down);
        QCOMPARE(playhead(), 5000.0);
        clock.seek(1500);
        press(Qt::Key_Down, Qt::ShiftModifier);
        QCOMPARE(playhead(), 3000.0);
        press(Qt::Key_Up, Qt::ShiftModifier);
        QCOMPARE(playhead(), 1000.0);
        targets.setTrackTargeted("v", true);
        targets.setTrackTargeted("w", true);
        gestures()->setSelection({"c"});
        press(Qt::Key_Home, Qt::ShiftModifier);
        QCOMPARE(playhead(), 1000.0);
        press(Qt::Key_End, Qt::ShiftModifier);
        QVERIFY(std::abs(playhead() - (3000.0 - 1000.0 / 30)) < 0.5);
        // The gaps of the whole sequence, not of one track.
        clock.seek(1500);
        press(Qt::Key_Colon, Qt::ShiftModifier);
        QCOMPARE(playhead(), 3000.0);
        press(Qt::Key_Semicolon, Qt::AltModifier);
        QCOMPARE(playhead(), 0.0);
    }
    void selectionKeys() {
        clock.seek(1500);
        press(Qt::Key_D);
        auto selected = gestures()->selection();
        selected.sort();
        QCOMPARE(selected, (QStringList{"c", "e"}));
        gestures()->setSelection({"c"});
        press(Qt::Key_Down, Qt::ControlModifier);
        QCOMPARE(gestures()->selection(), QStringList{"d"});
        press(Qt::Key_Up, Qt::ControlModifier);
        QCOMPARE(gestures()->selection(), QStringList{"c"});
        // At the end of the track the selection stays.
        press(Qt::Key_Up, Qt::ControlModifier);
        QCOMPARE(gestures()->selection(), QStringList{"c"});
        // With nothing selected, the clips at the playhead.
        gestures()->setSelection({});
        press(Qt::Key_Down, Qt::ControlModifier);
        QCOMPARE(gestures()->selection().size(), 2);
    }
    void transportKeys() {
        clock.seek(1500);
        press(Qt::Key_L, Qt::ShiftModifier);
        QVERIFY(clock.playing());
        QCOMPARE(clock.rate(), 0.1);
        press(Qt::Key_L, Qt::ShiftModifier);
        QVERIFY(std::abs(clock.rate() - 0.2) < 1e-9);
        press(Qt::Key_J, Qt::ShiftModifier);
        QCOMPARE(clock.rate(), -0.1);
        press(Qt::Key_K);
        QVERIFY(!clock.playing());
        QCOMPARE(clock.rate(), 1.0);

        std::int64_t now = 0;
        clock.setNowSource([&now] { return now; });
        auto advance = [&](double ms) {
            now += static_cast<std::int64_t>(ms * 1e6);
            clock.tick();
        };
        clock.seek(4000);
        // Shift+K plays around the playhead, then comes back to it.
        press(Qt::Key_K, Qt::ShiftModifier);
        QVERIFY(clock.playing());
        QCOMPARE(playhead(), 1000.0);
        advance(4999);
        QVERIFY(clock.playing());
        advance(2);
        QVERIFY(!clock.playing());
        QCOMPARE(playhead(), 4000.0);
        // No mark changed.
        QCOMPARE(clock.rangeInMs(), -1.0);
        QCOMPARE(clock.rangeOutMs(), -1.0);
        // Ctrl+Space plays from the playhead to the out point and stays there.
        gestures()->viewState()->setRangeIn(2000);
        gestures()->viewState()->setRangeOut(5000);
        press(Qt::Key_Space, Qt::ControlModifier);
        QVERIFY(clock.playing());
        QCOMPARE(playhead(), 4000.0);
        advance(1001);
        QVERIFY(!clock.playing());
        QCOMPARE(playhead(), 5000.0);
        // Shift+Space adds a preroll and a postroll around the marks.
        gestures()->viewState()->setRangeIn(4000);
        gestures()->viewState()->setRangeOut(5000);
        press(Qt::Key_Space, Qt::ShiftModifier);
        QVERIFY(clock.playing());
        QCOMPARE(playhead(), 1000.0);
        advance(5999);
        QVERIFY(clock.playing());
        advance(2);
        QVERIFY(!clock.playing());
        QCOMPARE(playhead(), 7000.0);
        clock.setNowSource({});
    }
    void extendEditKeys() {
        clock.seek(2000);
        // The nearest edit on each targeted track moves to the playhead.
        editKey(Qt::Key_Q, Qt::ShiftModifier, [this] {
            QCOMPARE(clip("c").value("startMs").toDouble(), 2000.0);
            QCOMPARE(clip("e").value("startMs").toDouble(), 2000.0);
        });
        editKey(Qt::Key_W, Qt::ShiftModifier, [this] {
            QCOMPARE(clip("c").value("durationMs").toDouble(), 1000.0);
            QCOMPARE(clip("e").value("durationMs").toDouble(), 1000.0);
        });
        // A cut between two clips rolls.
        loadDocument(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
          "clips":[{"id":"x","trackId":"v","name":"X","mediaType":"image","startMs":0,"durationMs":2000},
                   {"id":"y","trackId":"v","name":"Y","mediaType":"image","startMs":2000,"durationMs":2000}]})");
        clock.seek(2500);
        editKey(Qt::Key_Q, Qt::ShiftModifier, [this] {
            QCOMPARE(clip("x").value("durationMs").toDouble(), 2500.0);
            QCOMPARE(clip("y").value("startMs").toDouble(), 2500.0);
            QCOMPARE(clip("y").value("durationMs").toDouble(), 1500.0);
        });
    }
    void selectedEditKeys() {
        gestures()->viewState()->zoomTo(10, 0);
        selectEdge("c", "end");
        screenshot("selected-edit");
        clock.seek(2000);
        editKey(Qt::Key_E, Qt::NoModifier, [this] { QCOMPARE(clip("c").value("durationMs").toDouble(), 1000.0); });
        const double frame = 1000.0 / 30;
        editKey(Qt::Key_Left, Qt::ControlModifier | Qt::AltModifier, [&] {
            QVERIFY(std::abs(clip("c").value("durationMs").toDouble() - (2000 - frame)) <= 1);
        });
        editKey(Qt::Key_Right, Qt::ControlModifier | Qt::AltModifier | Qt::ShiftModifier, [&] {
            QVERIFY(std::abs(clip("c").value("durationMs").toDouble() - (2000 + 10 * frame)) <= 1);
        });
        // A held key is one undo entry.
        const int held = history()->index();
        press(Qt::Key_Left, Qt::ControlModifier | Qt::AltModifier);
        gestures()->handleKey(Qt::Key_Left, {}, int(Qt::ControlModifier | Qt::AltModifier), true);
        QVERIFY(std::abs(clip("c").value("durationMs").toDouble() - (2000 - 2 * frame)) <= 1);
        QCOMPARE(history()->index(), held + 1);
        press(Qt::Key_Z, Qt::ControlModifier);
        // Selecting a clip ends the edit selection, and then the key does nothing.
        gestures()->setSelection({"d"});
        QVERIFY(gestures()->property("selectedEdit").toMap().isEmpty());
        const auto before = doc();
        press(Qt::Key_E);
        QCOMPARE(doc(), before);
    }
    void nudgeAndSlideKeys() {
        gestures()->setSelection({"d"});
        const double frame = 1000.0 / 30;
        editKey(Qt::Key_Right, Qt::ControlModifier, [&] {
            QVERIFY(std::abs(clip("d").value("startMs").toDouble() - (5000 + frame)) <= 1);
        });
        editKey(Qt::Key_Left, Qt::ControlModifier, [&] {
            QVERIFY(std::abs(clip("d").value("startMs").toDouble() - (5000 - frame)) <= 1);
        });
        loadDocument(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
          "clips":[{"id":"x","trackId":"v","name":"X","mediaType":"video","startMs":0,"durationMs":2000,"inPointMs":1000},
                   {"id":"y","trackId":"v","name":"Y","mediaType":"video","startMs":2000,"durationMs":1000,"inPointMs":1000},
                   {"id":"z","trackId":"v","name":"Z","mediaType":"video","startMs":3000,"durationMs":2000,"inPointMs":1000}]})");
        gestures()->setSelection({"y"});
        editKey(Qt::Key_Period, Qt::AltModifier, [&] {
            const double start = clip("y").value("startMs").toDouble();
            QVERIFY(std::abs(start - (2000 + frame)) <= 1);
            QCOMPARE(clip("y").value("durationMs").toDouble(), 1000.0);
            QCOMPARE(clip("x").value("durationMs").toDouble(), start);
            QCOMPARE(clip("z").value("startMs").toDouble(), start + 1000);
        });
        editKey(Qt::Key_Comma, Qt::AltModifier, [&] {
            QVERIFY(std::abs(clip("y").value("startMs").toDouble() - (2000 - frame)) <= 1);
        });
        const int held = history()->index();
        press(Qt::Key_Period, Qt::AltModifier);
        gestures()->handleKey(Qt::Key_Period, ".", int(Qt::AltModifier), true);
        QVERIFY(std::abs(clip("y").value("startMs").toDouble() - (2000 + 2 * frame)) <= 1);
        QCOMPARE(history()->index(), held + 1);
    }
    void markKeys() {
        auto* range = gestures()->viewState();
        gestures()->setSelection({"c", "d"});
        press(Qt::Key_Slash);
        QCOMPARE(range->rangeInMs(), 1000.0);
        QCOMPARE(range->rangeOutMs(), 6000.0);
        press(Qt::Key_I, Qt::AltModifier);
        QCOMPARE(range->rangeInMs(), -1.0);
        QCOMPARE(range->rangeOutMs(), 6000.0);
        press(Qt::Key_O, Qt::AltModifier);
        QCOMPARE(range->rangeOutMs(), -1.0);
        range->setRangeIn(1000);
        range->setRangeOut(2000);
        press(Qt::Key_X, Qt::AltModifier);
        QCOMPARE(range->rangeInMs(), -1.0);
        QCOMPARE(range->rangeOutMs(), -1.0);
        model.addMarker(1500, "A");
        model.addMarker(2500, "B");
        clock.seek(1500);
        const auto count = [this] { return model.markersJson().size(); };
        editKey(Qt::Key_M, Qt::AltModifier, [&] { QCOMPARE(count(), qsizetype(1)); });
        clock.seek(1700);
        const auto before = doc();
        press(Qt::Key_M, Qt::AltModifier);
        QCOMPARE(doc(), before);
        editKey(Qt::Key_M, Qt::ControlModifier | Qt::AltModifier, [&] { QCOMPARE(count(), qsizetype(0)); });
    }
    void trackHeightKeys() {
        auto* state = gestures()->viewState();
        const double zoom = state->verticalZoom();
        press(Qt::Key_Plus, Qt::ShiftModifier);
        QVERIFY(state->verticalZoom() > zoom);
        press(Qt::Key_Plus, Qt::ShiftModifier);
        QCOMPARE(state->verticalZoom(), zoom);
        press(Qt::Key_Underscore, Qt::ShiftModifier);
        QVERIFY(state->verticalZoom() < zoom);
        press(Qt::Key_Underscore, Qt::ShiftModifier);
        QCOMPARE(state->verticalZoom(), zoom);
        press(Qt::Key_Equal, Qt::ControlModifier);
        QCOMPARE(state->verticalZoom(), zoom + 0.25);
        press(Qt::Key_Minus, Qt::ControlModifier);
        QCOMPARE(state->verticalZoom(), zoom);
        const double audio = track("a").value("heightPx").toDouble();
        const double video = track("v").value("heightPx").toDouble();
        editKey(Qt::Key_Equal, Qt::AltModifier, [&] {
            QCOMPARE(track("a").value("heightPx").toDouble(), audio + 12);
            QCOMPARE(track("v").value("heightPx").toDouble(), video);
        });
        editKey(Qt::Key_Minus, Qt::AltModifier, [&] { QCOMPARE(track("a").value("heightPx").toDouble(), audio - 12); });
    }
    void volumeKeys() {
        gestures()->setSelection({"s"});
        editKey(Qt::Key_BracketRight, Qt::NoModifier, [this] { QCOMPARE(volumeOf("s"), 1.0); });
        editKey(Qt::Key_BracketLeft, Qt::NoModifier, [this] { QCOMPARE(volumeOf("s"), -1.0); });
        editKey(Qt::Key_BraceRight, Qt::ShiftModifier, [this] { QCOMPARE(volumeOf("s"), 6.0); });
        editKey(Qt::Key_BraceLeft, Qt::ShiftModifier, [this] { QCOMPARE(volumeOf("s"), -6.0); });
        // A held key is one undo entry.
        const auto before = doc();
        const int entries = history()->index();
        press(Qt::Key_BracketRight);
        gestures()->handleKey(Qt::Key_BracketRight, "]", 0, true);
        gestures()->handleKey(Qt::Key_BracketRight, "]", 0, true);
        QCOMPARE(volumeOf("s"), 3.0);
        QCOMPARE(history()->index(), entries + 1);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(doc(), before);
        press(Qt::Key_G);
        auto* host = item("audioGainHost");
        QVERIFY(host);
        auto* gain = host->findChild<QObject*>("audioGainDialog");
        QVERIFY(gain);
        QTRY_VERIFY(gain->property("visible").toBool());
        QCOMPARE(gain->property("clipIds").toStringList(), QStringList{"s"});
        gain->setProperty("dbText", "4");
        QVERIFY(QMetaObject::invokeMethod(gain, "confirm"));
        QTRY_VERIFY(!gain->property("visible").toBool());
        QCOMPARE(volumeOf("s"), 4.0);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(doc(), before);
    }
    void panelKeys_data() {
        QTest::addColumn<int>("key");
        QTest::addColumn<QString>("panel");
        QTest::newRow("Shift+1") << int(Qt::Key_Exclam) << QString("assets");
        QTest::newRow("Shift+2") << int(Qt::Key_At) << QString("source");
        QTest::newRow("Shift+3") << int(Qt::Key_NumberSign) << QString("tracks");
        QTest::newRow("Shift+4") << int(Qt::Key_Dollar) << QString("program");
        QTest::newRow("Shift+5") << int(Qt::Key_Percent) << QString("effectControls");
        QTest::newRow("Shift+9") << int(Qt::Key_ParenLeft) << QString("inspector");
        QTest::newRow("Shift+6") << int(Qt::Key_AsciiCircum) << QString("mixer");
        QTest::newRow("Shift+7") << int(Qt::Key_Ampersand) << QString("effects");
        QTest::newRow("Shift+0") << int(Qt::Key_ParenRight) << QString("script");
        QTest::newRow("Shift+8") << int(Qt::Key_Asterisk) << QString("storyboard");
    }
    void panelKeys() {
        QFETCH(int, key);
        QFETCH(QString, panel);
        view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState")
            ->setAsset({{"id", "asset"}, {"name", "Take"}, {"content_type", "video/mp4"}});
        press(key, Qt::ShiftModifier);
        QTRY_VERIFY2(visiblePanels().contains(panel), qPrintable(visiblePanels().join(",")));
        QTRY_COMPARE(focusedPanel(), panel);
        view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState")->setAsset({});
    }
    void panelKeysWorkFromAnyPanel() {
        press(Qt::Key_Exclam, Qt::ShiftModifier);
        QTRY_COMPARE(focusedPanel(), QString("assets"));
        QTest::keyClick(view.get(), Qt::Key_NumberSign, Qt::ShiftModifier);
        QTRY_COMPARE(focusedPanel(), QString("tracks"));
        // The Timeline has the keys again: this press reaches it with no click.
        clock.seek(1500);
        QTest::keyClick(view.get(), Qt::Key_Down);
        QCOMPARE(playhead(), 3000.0);
        // The transport follows from a panel that is not the Timeline.
        press(Qt::Key_Exclam, Qt::ShiftModifier);
        QTRY_COMPARE(focusedPanel(), QString("assets"));
        QTest::keyClick(view.get(), Qt::Key_L);
        QVERIFY(clock.playing());
        QTest::keyClick(view.get(), Qt::Key_K);
        QVERIFY(!clock.playing());
    }
    void panelKeysWorkWhileTheTimelineIsHidden() {
        // Behind another tab of its group.
        press(Qt::Key_AsciiCircum, Qt::ShiftModifier);
        QTRY_VERIFY(visiblePanels().contains("mixer"));
        QVERIFY(!visiblePanels().contains("tracks"));
        QTest::keyClick(view.get(), Qt::Key_NumberSign, Qt::ShiftModifier);
        QTRY_VERIFY(visiblePanels().contains("tracks"));
        // Behind a maximized group: the key that maximized it restores it.
        press(Qt::Key_Dollar, Qt::ShiftModifier);
        QTRY_COMPARE(focusedPanel(), QString("program"));
        QTest::keyClick(view.get(), Qt::Key_QuoteLeft);
        QCOMPARE(visiblePanels(), QStringList{"program"});
        QTest::keyClick(view.get(), Qt::Key_QuoteLeft);
        QVERIFY(visiblePanels().contains("tracks"));
        // Escape leaves Program full screen too.
        const auto visibility = view->visibility();
        press(Qt::Key_QuoteLeft, Qt::ControlModifier);
        QTRY_COMPARE(view->visibility(), QWindow::FullScreen);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_COMPARE(view->visibility(), visibility);
        QVERIFY(visiblePanels().contains("tracks"));
    }
    void panelCycleKeys() {
        press(Qt::Key_NumberSign, Qt::ShiftModifier);
        QTRY_COMPARE(focusedPanel(), QString("tracks"));
        QTest::keyClick(view.get(), Qt::Key_Greater, Qt::ControlModifier | Qt::ShiftModifier);
        QTRY_VERIFY(focusedPanel() != "tracks");
        const auto next = focusedPanel();
        QVERIFY(visiblePanels().contains(next));
        QTest::keyClick(view.get(), Qt::Key_Less, Qt::ControlModifier | Qt::ShiftModifier);
        QTRY_COMPARE(focusedPanel(), QString("tracks"));
    }
    void maximizeAndWorkspaceKeys() {
        press(Qt::Key_QuoteLeft);
        QVERIFY(!dock()->property("maximizedGroup").toString().isEmpty());
        QCOMPARE(visiblePanels(), QStringList{"tracks"});
        press(Qt::Key_QuoteLeft);
        QVERIFY(dock()->property("maximizedGroup").toString().isEmpty());
        // Program full screen, then back to the window as it was.
        const auto visibility = view->visibility();
        press(Qt::Key_QuoteLeft, Qt::ControlModifier);
        QCOMPARE(visiblePanels(), QStringList{"program"});
        QTRY_COMPARE(view->visibility(), QWindow::FullScreen);
        screenshot("program-fullscreen");
        press(Qt::Key_QuoteLeft, Qt::ControlModifier);
        QTRY_COMPARE(view->visibility(), visibility);
        QVERIFY(dock()->property("maximizedGroup").toString().isEmpty());
        // Alt+Shift+0 resets the layout.
        auto* store = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        const int epoch = store->property("layoutEpoch").toInt();
        press(Qt::Key_ParenRight, Qt::AltModifier | Qt::ShiftModifier);
        QCOMPARE(store->property("layoutEpoch").toInt(), epoch + 1);
    }
    void keyframeKeys() {
        gestures()->setSelection({"c"});
        clock.seek(1500);
        const auto key = [this] { return clip("c").value("animations").toArray(); };
        editKey(Qt::Key_K, Qt::AltModifier, [&] { QVERIFY(!key().isEmpty()); });
        press(Qt::Key_K, Qt::AltModifier);
        clock.seek(2000);
        press(Qt::Key_K, Qt::AltModifier);
        clock.seek(1700);
        press(Qt::Key_K, Qt::AltModifier | Qt::ShiftModifier);
        QCOMPARE(playhead(), 2000.0);
        press(Qt::Key_K, Qt::ControlModifier | Qt::AltModifier | Qt::ShiftModifier);
        QCOMPARE(playhead(), 1500.0);
    }
    void audioTransitionKey() {
        loadDocument(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"a","name":"Audio","type":"audio","index":0}],
          "clips":[{"id":"p","trackId":"a","name":"P","mediaType":"audio","startMs":0,"durationMs":2000},
                   {"id":"q","trackId":"a","name":"Q","mediaType":"audio","startMs":2000,"durationMs":2000}]})");
        gestures()->setSelection({"p"});
        editKey(Qt::Key_D, Qt::ControlModifier | Qt::ShiftModifier, [this] {
            QCOMPARE(clip("p").value("fadeOutMs").toDouble(), 500.0);
            QCOMPARE(clip("p").value("fadeOutShape").toString(), QString("plus3dB"));
            QCOMPARE(clip("p").value("durationMs").toDouble(), 2500.0);
            QCOMPARE(clip("q").value("fadeInMs").toDouble(), 500.0);
            QCOMPARE(clip("p").value("fadeInMs").toDouble(), 500.0);
        });
    }
    void matchFrameKeys() {
        loadDocument(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
          "clips":[{"id":"m","trackId":"v","name":"Take","mediaType":"video","startMs":1000,"durationMs":2000,"inPointMs":4000,"currentAssetId":"asset-1"}]})");
        auto* source = view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        source->setAsset({});
        clock.seek(1500);
        press(Qt::Key_F);
        QCOMPARE(source->asset().value("id").toString(), QString("asset-1"));
        QCOMPARE(source->property("cueMs").toDouble(), 4500.0);
        QTRY_VERIFY(visiblePanels().contains("source"));
        QVERIFY(visiblePanels().contains("assets"));
        auto* viewer = item("sourceViewer");
        QVERIFY(viewer);
        QCOMPARE(viewer->property("playerTimeMs").toDouble(), 4500.0);
        // The Library selects the asset when the server says where it is, and the frame holds.
        auto* explorer = item("assetExplorer");
        QVERIFY(explorer);
        auto* browser = explorer->property("browser").value<QObject*>();
        QVERIFY(QMetaObject::invokeMethod(browser, "assetLocated", Q_ARG(QVariantMap, (QVariantMap{{"id", "asset-1"}, {"parent_id", ""}}))));
        QCOMPARE(explorer->property("selectedId").toString(), QString("asset-1"));
        QCOMPARE(viewer->property("playerTimeMs").toDouble(), 4500.0);
        explorer->setProperty("selectedId", QString());
        source->setAsset({});
        press(Qt::Key_F, Qt::ShiftModifier);
        QVERIFY(visiblePanels().contains("assets"));
        QVERIFY(source->asset().value("id").toString().isEmpty());
        // With nothing under the playhead the keys do nothing.
        clock.seek(9000);
        press(Qt::Key_F);
        QVERIFY(source->asset().value("id").toString().isEmpty());
    }
    // Slots below load their own editor, with the flag main sets.
    void firstLaunchOffersALayout() {
        view.reset();
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        const auto load = [this](bool interactive) {
            auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
              "tracks":[{"id":"v","name":"Video","type":"video","index":0}],"clips":[]})");
            QVERIFY(parsed.timeline);
            model.setTimeline(std::move(*parsed.timeline));
            view = std::make_unique<QQuickView>();
            view->rootContext()->setContextProperty("nativeInteractiveRun", interactive);
            view->setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
            view->loadFromModule("NodeTool.Timeline", "TimelineEditor");
            QVERIFY(view->status() == QQuickView::Ready);
            view->setResizeMode(QQuickView::SizeRootObjectToView);
            view->resize(1400, 800);
            view->show();
            QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        };
        // A non-interactive run sees nothing, and records nothing.
        load(false);
        QVERIFY(gestures());
        auto* prompt = item("keyboardLayoutPrompt");
        QVERIFY(prompt);
        QVERIFY(!prompt->isVisible());
        QVERIFY(!QSettings(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"), QSettings::IniFormat).contains("keyboardLayout"));
        // The first interactive run offers it, and the document is open behind it.
        load(true);
        prompt = item("keyboardLayoutPrompt");
        QVERIFY(prompt);
        QTRY_VERIFY(prompt->isVisible());
        QVERIFY(gestures());
        // The prompt takes no keys: they still reach the editor.
        QVERIFY(!prompt->hasActiveFocus() && !prompt->isAncestorOf(view->activeFocusItem()));
        region()->forceActiveFocus();
        const bool playing = clock.playing();
        QTest::keyClick(view.get(), Qt::Key_L);
        QVERIFY(clock.playing() != playing);
        clock.shuttleStop();
        screenshot("prompt");
        click("keyboardLayout_premiere");
        QTRY_VERIFY(!prompt->isVisible());
        QTRY_COMPARE(gestures()->keyboardPreset(), QString("premiere"));
        // The choice stays, so a later launch does not ask again.
        load(true);
        prompt = item("keyboardLayoutPrompt");
        QVERIFY(prompt);
        QVERIFY(!prompt->isVisible());
        QTRY_COMPARE(gestures()->keyboardPreset(), QString("premiere"));
        // Closing it keeps the Premiere layout and also counts as an answer.
        view.reset();
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        load(true);
        prompt = item("keyboardLayoutPrompt");
        QTRY_VERIFY(prompt->isVisible());
        click("keyboardLayoutKeep");
        QTRY_VERIFY(!prompt->isVisible());
        QCOMPARE(gestures()->keyboardPreset(), QString("premiere"));
        QVERIFY(QSettings(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"), QSettings::IniFormat).contains("keyboardLayout"));
    }
};

int main(int argc, char** argv) {
    QTemporaryDir settings;
    qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(settings.filePath("settings.ini")));
    QGuiApplication app(argc, argv);
    TestKeyboardPresets test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_keyboardpresets.moc"
