#include "aiassist/AgentBridge.h"
#include "aiassist/AssistantCommands.h"
#include "aiassist/AssistantSession.h"
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "edit/trim/TrimMode.h"
#include "export/FrameCapture.h"
#include "takes/TakeSwitcher.h"
#include "wiring/KeyActions.h"
#include "wiring/WiringFixture.h"
#include <QJsonArray>
#include <QSignalSpy>

using nt::aiassist::AssistantCommands;

// A two-track document with generated-form ids, as the server writes them.
static const QString CLIP_A = "aaaaaaaaaaaa00000000000000000001";
static const QString CLIP_B = "bbbbbbbbbbbb00000000000000000002";
static const QString CLIP_C = "cccccccccccc00000000000000000003";
static const QString CLIP_AUDIO = "dddddddddddd00000000000000000004";
static const QString TWIN_1 = "eeeeeeeeeeee00000000000000000005";
static const QString TWIN_2 = "eeeeeeeeeeee00000000000000000006";
static const QString TRACK_V = "11111111111100000000000000000001";
static const QString TRACK_A = "22222222222200000000000000000002";
static const QString TIMELINE = "99999999999900000000000000000009";
static const QString MARKER = "77777777777700000000000000000007";
static const QString CLIP_VIDEO = "66666666666600000000000000000006";

class TestAssistantCommands : public WiringFixture {
    Q_OBJECT
    std::unique_ptr<AssistantCommands> commands;
    std::unique_ptr<AssistantSession> session;

    void loadDocument() {
        const auto text = QStringLiteral(R"({"id":"%1","name":"Cut","fps":30,"width":640,"height":360,"durationMs":20000,
          "tracks":[{"id":"%2","name":"Video","type":"video","index":0,"heightPx":80,"visible":true,"locked":false},
                    {"id":"%3","name":"Audio","type":"audio","index":1,"heightPx":80,"visible":true,"locked":false,"muted":false,"solo":false}],
          "markers":[{"id":"%9","timeMs":12000,"label":"Beat"}],
          "clips":[{"id":"%4","trackId":"%2","name":"First","mediaType":"image","startMs":0,"durationMs":2000},
                   {"id":"%5","trackId":"%2","name":"Second","mediaType":"image","startMs":2000,"durationMs":2000},
                   {"id":"%6","trackId":"%2","name":"Third","mediaType":"image","startMs":4000,"durationMs":2000},
                   {"id":"%7","trackId":"%3","name":"Sound","mediaType":"audio","startMs":0,"durationMs":6000},
                   {"id":"%8","trackId":"%2","name":"Twin one","mediaType":"image","startMs":8000,"durationMs":1000},
                   {"id":"%10","trackId":"%2","name":"Twin two","mediaType":"image","startMs":10000,"durationMs":1000},
                   {"id":"%11","trackId":"%2","name":"Moving","mediaType":"video","startMs":13000,"durationMs":2000,"inPointMs":0,"outPointMs":2000}]})")
            .arg(TIMELINE, TRACK_V, TRACK_A, CLIP_A, CLIP_B, CLIP_C, CLIP_AUDIO, TWIN_1, MARKER, TWIN_2, CLIP_VIDEO);
        auto parsed = nt::parseTimelineJson(text.toUtf8());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        clock.setDurationMs(20000);
        clock.seek(1000);
        gestures()->setSelection({});
        gestures()->setLinkedSelection(true);
        gestures()->viewState()->clearRange();
        nt::edit::clipboard::clearClipClipboard();
        QCoreApplication::processEvents();
    }
    QVariantMap run(const QString& command, const QVariantMap& params = {}) {
        return commands->execute("ui_timeline_run_command", {{"timeline_id", TIMELINE}, {"command", command}, {"params", params}});
    }
    QVariantMap list(const QVariantMap& extra = {}) {
        auto args = extra;
        args.insert("timeline_id", TIMELINE);
        return commands->execute("ui_timeline_list_commands", args);
    }
    QVariantMap commandEntry(const QString& id) {
        for (const auto& value : list().value("commands").toList()) {
            if (value.toMap().value("id") == id) { return value.toMap(); }
        }
        return {};
    }
    // The id form the state tool hands the model.
    QString stateClipId(const QString& name) {
        session->setProperty("selectedClipIds", gestures()->selection());
        const auto state = session->executeHostTool("ui_timeline_get_state", {{"timeline_id", TIMELINE}}, {});
        for (const auto& value : state.value("clips").toArray()) {
            if (value.toObject().value("name") == name) { return value.toObject().value("id").toString(); }
        }
        return {};
    }
    QJsonObject rawClip(const QString& id) { return clip(id); }

private slots:
    // A window takes seconds to open, so the tests share one and each gets a fresh document.
    void initTestCase() {
        open();
        commands = std::make_unique<AssistantCommands>(model, clock);
        commands->setEditor(view->rootObject());
        session = std::make_unique<AssistantSession>();
        session->setTimeline(&model);
    }
    void cleanupTestCase() {
        commands.reset();
        session.reset();
        view.reset();
    }
    void init() { loadDocument(); }

    // Acceptance: a registered command that is neither allowed nor denied fails this test.
    void everyRegisteredCommandIsDecided() {
        const auto audit = nt::aiassist::auditCommands();
        QVERIFY2(audit.unlisted.isEmpty(), qPrintable("Neither allowed nor denied: " + audit.unlisted.join(", ")));
        QVERIFY2(audit.stale.isEmpty(), qPrintable("Not registered: " + audit.stale.join(", ")));
        QVERIFY2(audit.conflicting.isEmpty(), qPrintable("Allowed and denied: " + audit.conflicting.join(", ")));
        QVERIFY2(audit.unrunnable.isEmpty(), qPrintable("Allowed with no runner: " + audit.unrunnable.join(", ")));
        // The audit looked at something: the registries really hold these.
        QVERIFY(nt::aiassist::registeredCommandIds().size() > 300);
        QVERIFY(audit.allowed > 100);
        QVERIFY(audit.denied > 50);
    }
    void auditReportsBadInput() {
        auto registered = nt::aiassist::registeredCommandIds();
        registered.insert("test.madeUpCommand");
        registered.remove("undo");
        const auto audit = nt::aiassist::auditCommands(registered);
        QCOMPARE(audit.unlisted, QStringList{"test.madeUpCommand"});
        QCOMPARE(audit.stale, QStringList{"undo"});
        QVERIFY(!audit.clean());
    }
    void securityDenials_data() {
        QTest::addColumn<QString>("id");
        for (const auto* id : {"exportVideo", "quickExport", "exportFrame", "exportPremiere", "importPremiere", "exportMarkersCsv",
                               "remixClip", "sceneEditDetection", "projectSettings", "toggleSnap", "playPause", "resetWorkspace", "updateTrackEffect",
                               "ai.insertGeneration", "assets.dropAsset", "restoreDocument", "acceptExternalUnit", "toggleScrubAudio"}) {
            QTest::newRow(id) << QString(id);
        }
    }
    void securityDenials() {
        QFETCH(QString, id);
        const auto before = doc();
        const auto result = run(id);
        QVERIFY(!result.value("ok").toBool());
        QVERIFY2(!result.value("error").toString().isEmpty(), qPrintable(id));
        QVERIFY2(result.value("error").toString().contains("not available to the Assistant"), qPrintable(result.value("error").toString()));
        QCOMPARE(doc(), before);
        QVERIFY(commandEntry(id).isEmpty());
        QCOMPARE(model.undoStack()->count(), 0);
    }

    void listShowsIdLabelParametersAndEnabled() {
        const auto entry = commandEntry("rippleDeleteSelected");
        QCOMPARE(entry.value("label").toString(), QString("Ripple Delete"));
        QCOMPARE(entry.value("enabled").toBool(), false);
        QCOMPARE(entry.value("disabledReason").toString(), QString("Select a clip or a gap first."));
        const auto properties = entry.value("parameters").toMap().value("properties").toMap();
        QVERIFY(properties.contains("clip_ids"));
        QCOMPARE(properties.value("clip_ids").toMap().value("type").toString(), QString("array"));
        gestures()->setSelection({CLIP_B});
        QCOMPARE(commandEntry("rippleDeleteSelected").value("enabled").toBool(), true);
        // Filter by id or label, and only what can run now.
        const auto filtered = list({{"filter", "ripple"}}).value("commands").toList();
        QVERIFY(!filtered.isEmpty() && filtered.size() < 15);
        const auto enabledOnly = list({{"enabled_only", true}}).value("commands").toList();
        for (const auto& value : enabledOnly) { QVERIFY(value.toMap().value("enabled").toBool()); }
        QVERIFY(enabledOnly.size() < list().value("commands").toList().size());
    }
    void listingChangesNothing() {
        gestures()->setSelection({CLIP_B});
        const auto before = doc();
        const auto selection = gestures()->selection();
        const double playhead = clock.currentTimeMs();
        QVERIFY(!list().value("commands").toList().isEmpty());
        QCOMPARE(doc(), before);
        QCOMPARE(gestures()->selection(), selection);
        QCOMPARE(clock.currentTimeMs(), playhead);
        QCOMPARE(model.undoStack()->count(), 0);
    }

    // Acceptance: ids in the form the state tool returns, one undo entry, and the new state.
    void rippleDeleteWithStateIds() {
        const auto id = stateClipId("Second");
        QCOMPARE(id, CLIP_B);
        const auto result = run("rippleDeleteSelected", {{"clip_ids", QStringList{id}}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QVERIFY(result.value("changed").toBool());
        QCOMPARE(model.undoStack()->count(), 1);
        const auto undo = result.value("undo").toMap();
        QCOMPARE(undo.value("entry").toString(), QString("Ripple delete"));
        QCOMPARE(undo.value("added").toBool(), true);
        QVERIFY(undo.value("canUndo").toBool());
        QVERIFY(clip(CLIP_B).isEmpty());
        QCOMPARE(clip(CLIP_C).value("startMs").toDouble(), 2000.0);
        // The returned state is the new document, with the ids the state tool returns.
        QStringList ids;
        double thirdStart = -1;
        for (const auto& value : result.value("state").toMap().value("clips").toList()) {
            const auto row = value.toMap();
            ids.append(row.value("id").toString());
            if (row.value("id") == CLIP_C) { thirdStart = row.value("startMs").toDouble(); }
        }
        QVERIFY(!ids.contains(CLIP_B));
        QVERIFY(ids.contains(CLIP_C));
        QCOMPARE(thirdStart, 2000.0);
        model.undoStack()->undo();
        QCOMPARE(clip(CLIP_C).value("startMs").toDouble(), 4000.0);
        QVERIFY(!clip(CLIP_B).isEmpty());
    }
    void shortIdsResolveUniquely() {
        const auto result = run("rippleDeleteSelected", {{"clip_ids", QStringList{stateClipId("Second").left(12)}}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QVERIFY(clip(CLIP_B).isEmpty());
        // Two clips share this prefix, so it names neither.
        const auto before = doc();
        const auto ambiguous = run("rippleDeleteSelected", {{"clip_ids", QStringList{TWIN_1.left(12)}}});
        QVERIFY(!ambiguous.value("ok").toBool());
        QVERIFY2(ambiguous.value("error").toString().contains("more than one"), qPrintable(ambiguous.value("error").toString()));
        QCOMPARE(doc(), before);
        // Not a startsWith search: only the exact 12 characters count as a short id.
        QVERIFY(!run("rippleDeleteSelected", {{"clip_ids", QStringList{CLIP_C.left(8)}}}).value("ok").toBool());
        QVERIFY(!run("rippleDeleteSelected", {{"clip_ids", QStringList{"ffffffffffff"}}}).value("ok").toBool());
        QCOMPARE(doc(), before);
        QCOMPARE(model.undoStack()->count(), 1);
        // The timeline id takes the same two forms.
        const auto shortTimeline = commands->execute("ui_timeline_list_commands", {{"timeline_id", TIMELINE.left(12)}});
        QVERIFY(shortTimeline.value("ok").toBool());
        QVERIFY(!commands->execute("ui_timeline_list_commands", {{"timeline_id", "other"}}).value("ok").toBool());
        // Track and marker ids too.
        const auto track = run("setTrackName", {{"track_id", TRACK_V.left(12)}, {"name", "Picture"}});
        QVERIFY2(track.value("ok").toBool(), qPrintable(track.value("error").toString()));
        QCOMPARE(this->track(TRACK_V).value("name").toString(), QString("Picture"));
        const auto marker = run("markers.remove", {{"marker_ids", QStringList{MARKER.left(12)}}});
        QVERIFY2(marker.value("ok").toBool(), qPrintable(marker.value("error").toString()));
        QVERIFY(model.markersJson().isEmpty());
    }

    // Acceptance: a disabled command returns a clear error and changes nothing.
    void disabledCommands_data() {
        QTest::addColumn<QString>("id");
        QTest::addColumn<QVariantMap>("params");
        QTest::addColumn<QString>("message");
        QTest::newRow("no selection") << QString("rippleDeleteSelected") << QVariantMap{} << QString("Select a clip or a gap first.");
        QTest::newRow("no range") << QString("liftRange") << QVariantMap{{"inMs", 3000.0}} << QString("Set In and Out points first.");
        QTest::newRow("one clip group") << QString("groupClips") << QVariantMap{{"clip_ids", QStringList{CLIP_A}}}
                                        << QString("Select two or more clips first.");
        QTest::newRow("playhead off the clip") << QString("addKeyframe") << QVariantMap{{"clip_ids", QStringList{CLIP_A}}, {"atMs", 9000.0}}
                                               << QString("Select one clip and move the playhead over it.");
        QTest::newRow("no undo") << QString("undo") << QVariantMap{} << QString("Nothing to undo.");
        QTest::newRow("no edit point") << QString("trimEditLeft") << QVariantMap{} << QString("Pass clip_id and edge, or select an edit point first.");
        QTest::newRow("empty clipboard") << QString("paste") << QVariantMap{{"atMs", 3000.0}} << QString("Copy a clip first.");
    }
    void disabledCommands() {
        QFETCH(QString, id);
        QFETCH(QVariantMap, params);
        QFETCH(QString, message);
        gestures()->setSelection({CLIP_C});
        if (id == "rippleDeleteSelected" || id == "paste" || id == "undo" || id == "trimEditLeft") { gestures()->setSelection({}); }
        const auto before = doc();
        const auto selection = gestures()->selection();
        const double playhead = clock.currentTimeMs();
        const auto result = run(id, params);
        QVERIFY(!result.value("ok").toBool());
        QCOMPARE(result.value("disabled").toBool(), true);
        QCOMPARE(result.value("error").toString(), message);
        QCOMPARE(doc(), before);
        QCOMPARE(gestures()->selection(), selection);
        QCOMPARE(clock.currentTimeMs(), playhead);
        QCOMPARE(gestures()->viewState()->rangeInMs(), -1.0);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void refusedParameters_data() {
        QTest::addColumn<QString>("id");
        QTest::addColumn<QVariantMap>("params");
        QTest::newRow("unknown") << QString("undo") << QVariantMap{{"foo", 1}};
        QTest::newRow("wrong type") << QString("rippleTrimClipStart") << QVariantMap{{"clip_id", CLIP_A}, {"deltaMs", "ten"}};
        QTest::newRow("missing") << QString("rippleTrimClipStart") << QVariantMap{{"clip_id", CLIP_A}};
        QTest::newRow("missing id") << QString("rippleTrimClipStart") << QVariantMap{{"deltaMs", 10}};
        QTest::newRow("unknown clip") << QString("rippleTrimClipStart") << QVariantMap{{"clip_id", "nope"}, {"deltaMs", 10}};
        QTest::newRow("bad enum") << QString("rollClipEdge") << QVariantMap{{"clip_id", CLIP_A}, {"edge", "middle"}, {"deltaMs", 10}};
        QTest::newRow("negative time") << QString("splitAtPlayhead") << QVariantMap{{"atMs", -5}};
        QTest::newRow("no command") << QString("") << QVariantMap{};
        QTest::newRow("unknown command") << QString("noSuchCommand") << QVariantMap{};
    }
    void refusedParameters() {
        QFETCH(QString, id);
        QFETCH(QVariantMap, params);
        const auto before = doc();
        const double playhead = clock.currentTimeMs();
        const auto result = run(id, params);
        QVERIFY(!result.value("ok").toBool());
        QVERIFY(!result.value("error").toString().isEmpty());
        QCOMPARE(doc(), before);
        QCOMPARE(clock.currentTimeMs(), playhead);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void refusesLocations() {
        const auto before = doc();
        for (const auto& patch : {QVariantMap{{"currentAssetId", "other"}}, QVariantMap{{"mediaUrl", "http://example.com/a.mp4"}},
                                  QVariantMap{{"textStyle", QVariantMap{{"fontUrl", "file:///etc/passwd"}}}},
                                  QVariantMap{{"textStyle", QVariantMap{{"fontFamily", "/etc/passwd"}}}}, QVariantMap{{"effects", QVariantList{QVariantMap{{"lut", "https://example.com/a.cube"}}}}}}) {
            const auto result = run("patchClip", {{"clip_id", CLIP_A}, {"patch", patch}});
            QVERIFY(!result.value("ok").toBool());
        }
        QCOMPARE(doc(), before);
        // Words that look like an address are still words.
        QVERIFY(run("patchClip", {{"clip_id", CLIP_A}, {"patch", QVariantMap{{"name", "See http://example.com"}, {"opacity", 0.5}}}}).value("ok").toBool());
        QCOMPARE(clip(CLIP_A).value("name").toString(), QString("See http://example.com"));
        QVERIFY(run("markers.add", {{"timeMs", 100}, {"note", "From https://example.com/brief"}}).value("ok").toBool());
    }

    // A patch must leave a document the server accepts on save.
    void patchesKeepTheDocumentValid_data() {
        QTest::addColumn<QVariantMap>("patch");
        QTest::newRow("partial transform") << QVariantMap{{"transform", QVariantMap{{"rotation", 45}}}};
        QTest::newRow("effects") << QVariantMap{{"effects", QVariantMap{}}};
        QTest::newRow("bad blend") << QVariantMap{{"blendMode", "bogus"}};
        QTest::newRow("opacity text") << QVariantMap{{"opacity", "half"}};
        QTest::newRow("opacity range") << QVariantMap{{"opacity", 2}};
        QTest::newRow("name number") << QVariantMap{{"name", 5}};
        QTest::newRow("name null") << QVariantMap{{"name", QVariant::fromValue(nullptr)}};
        QTest::newRow("hidden text") << QVariantMap{{"hidden", "yes"}};
        QTest::newRow("unlocks") << QVariantMap{{"locked", false}};
        QTest::newRow("huge radius") << QVariantMap{{"borderRadius", 1e300}};
    }
    void patchesKeepTheDocumentValid() {
        QFETCH(QVariantMap, patch);
        const auto before = doc();
        QVERIFY(!run("patchClip", {{"clip_id", CLIP_A}, {"patch", patch}}).value("ok").toBool());
        QCOMPARE(doc(), before);
    }
    void textStyleChangesKeepTheOtherFields() {
        QVERIFY(run("addText", {{"track_id", TRACK_V}, {"timeMs", 16000}}).value("ok").toBool());
        const auto textId = gestures()->selection().first();
        const auto result = run("patchClip", {{"clip_id", textId}, {"patch", QVariantMap{{"textStyle", QVariantMap{{"text", "Visit https://example.com"}}}}}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        const auto style = clip(textId).value("textStyle").toObject();
        QCOMPARE(style.value("text").toString(), QString("Visit https://example.com"));
        QCOMPARE(style.value("fontSizePx").toDouble(), 96.0);
        QCOMPARE(style.value("color").toString(), QString("#FFFFFF"));
        const auto before = doc();
        QVERIFY(!run("patchClip", {{"clip_id", textId}, {"patch", QVariantMap{{"textStyle", QVariantMap{{"fontFamily", "/etc/passwd"}}}}}}).value("ok").toBool());
        QVERIFY(!run("patchClip", {{"clip_id", textId}, {"patch", QVariantMap{{"textStyle", QVariantMap{{"path", "x"}}}}}}).value("ok").toBool());
        QVERIFY(!run("patchClip", {{"clip_id", textId}, {"patch", QVariantMap{{"textStyle", QVariantMap{{"fontSizePx", "big"}}}}}}).value("ok").toBool());
        QVERIFY(!run("patchClip", {{"clip_id", textId}, {"patch", QVariantMap{{"textStyle", QVariantMap{{"fontSizePx", 1e7}}}}}}).value("ok").toBool());
        QVERIFY(!run("patchClip", {{"clip_id", CLIP_A}, {"patch", QVariantMap{{"textStyle", QVariantMap{{"text", "Hi"}}}}}}).value("ok").toBool());
        QCOMPARE(doc(), before);
    }
    void locksHold() {
        QVERIFY(run("toggleClipLock", {{"clip_ids", QStringList{CLIP_A}}}).value("ok").toBool());
        const auto lockedClip = doc();
        for (const auto& call : {std::pair<QString, QVariantMap>{"patchClip", {{"clip_id", CLIP_A}, {"patch", QVariantMap{{"opacity", 0.5}}}}},
                                 {"setClipSpeed", {{"clip_id", CLIP_A}, {"speed", 2.0}}},
                                 {"keyframes.toggle", {{"clip_id", CLIP_A}, {"row", "opacity"}, {"atMs", 100}}}}) {
            const auto result = run(call.first, call.second);
            QVERIFY2(!result.value("ok").toBool(), qPrintable(call.first));
            QVERIFY(result.value("error").toString().contains("locked"));
        }
        QCOMPARE(doc(), lockedClip);
        QVERIFY(run("setTrackLocked", {{"track_id", TRACK_A}, {"locked", true}}).value("ok").toBool());
        const auto lockedTrack = doc();
        QVERIFY(!run("setClipAudio", {{"clip_id", CLIP_AUDIO}, {"field", "fadeInMs"}, {"value", 100}}).value("ok").toBool());
        QVERIFY(!run("addClipAudioEffect", {{"clip_id", CLIP_AUDIO}, {"type", "eq3"}}).value("ok").toBool());
        QVERIFY(!run("setClipsGain", {{"clip_ids", QStringList{CLIP_AUDIO}}, {"db", -6.0}}).value("ok").toBool());
        QCOMPARE(doc(), lockedTrack);
    }
    // The person's work comes first, and an Assistant call never folds into it.
    void trimModeRefuses() {
        clock.seek(2000);
        QVERIFY(gestures()->trimMode()->selectNearest());
        QVERIFY(gestures()->trimMode()->active());
        const auto before = doc();
        QVERIFY(!run("setTrackName", {{"track_id", TRACK_V}, {"name", "X"}}).value("ok").toBool());
        QVERIFY(!run("trimEditRight", {{"clip_id", CLIP_C}, {"edge", "end"}}).value("ok").toBool());
        QVERIFY(gestures()->trimMode()->active());
        QCOMPARE(doc(), before);
        QCOMPARE(model.undoStack()->count(), 0);
        gestures()->trimMode()->leave();
    }
    void recordingRefuses() {
        auto* takes = TakeSwitcher::forTimeline(&model);
        QVERIFY(takes);
        takes->toggleRecording(*gestures());
        QVERIFY(takes->recording());
        const auto before = doc();
        const auto result = run("takeSwitch2", {{"clip_ids", QStringList{CLIP_A}}});
        QVERIFY(!result.value("ok").toBool());
        QVERIFY(result.value("error").toString().contains("recording"));
        QCOMPARE(doc(), before);
        takes->toggleRecording(*gestures());
        clock.pause();
    }
    void refusedTakeIsAnError() {
        const auto before = doc();
        const auto result = run("takeSwitch9", {{"clip_ids", QStringList{CLIP_A}}, });
        QVERIFY(!result.value("ok").toBool());
        QVERIFY(!result.value("error").toString().isEmpty());
        QCOMPARE(doc(), before);
    }
    void effectIds() {
        QVERIFY(run("addTrackEffect", {{"track_id", TRACK_A}, {"effect", "eq3"}}).value("ok").toBool());
        const auto id = track(TRACK_A).value("effects").toArray().first().toObject().value("id").toString();
        const auto before = doc();
        QVERIFY(!run("removeTrackEffect", {{"track_id", TRACK_A}, {"effect_id", "ffffffffffff"}}).value("ok").toBool());
        QCOMPARE(doc(), before);
        QVERIFY(run("removeTrackEffect", {{"track_id", TRACK_A}, {"effect_id", id.left(12)}}).value("ok").toBool());
        QVERIFY(track(TRACK_A).value("effects").toArray().isEmpty());
        // A new master effect's id comes back in the state, which removes it again.
        const auto added = run("addMasterEffect", {{"effect", "eq3"}});
        QVERIFY2(added.value("ok").toBool(), qPrintable(added.value("error").toString()));
        const auto masterId = added.value("state").toMap().value("master").toMap().value("effects").toList().value(0).toMap().value("id").toString();
        QVERIFY(!masterId.isEmpty());
        QVERIFY(run("removeMasterEffect", {{"effect_id", masterId.left(12)}}).value("ok").toBool());
    }
    // Unbounded numbers can allocate without limit in the audio plan, so these stay out.
    void effectValuesAreNotExposed() {
        for (const auto* id : {"updateTrackEffect", "updateMasterEffect", "patchClipAudioEffect"}) {
            QVERIFY(run(id).value("error").toString().contains("not available to the Assistant"));
        }
    }
    void actionsRespectLocks() {
        QVERIFY(run("toggleClipLock", {{"clip_ids", QStringList{CLIP_C}}}).value("ok").toBool());
        const auto before = doc();
        gestures()->setSelection({CLIP_B});
        // The locked clip stays, and the selection comes back.
        for (const auto* id : {"deleteSelected", "rippleDeleteSelected", "toggleClipEnabled", "applyFades", "addKeyframe"}) {
            QVariantMap params{{"clip_ids", QStringList{CLIP_C}}};
            if (QString(id) == "addKeyframe") { params.insert("atMs", 4500.0); }
            const auto result = run(id, params);
            QVERIFY2(!result.value("ok").toBool(), id);
            QVERIFY2(result.value("error").toString().contains("locked"), qPrintable(result.value("error").toString()));
            QCOMPARE(gestures()->selection(), QStringList{CLIP_B});
        }
        QCOMPARE(doc(), before);
        // A lock on the track holds its clips, and only the clip's own lock can be toggled.
        QVERIFY(run("toggleClipLock", {{"clip_ids", QStringList{CLIP_C}}}).value("ok").toBool());
        QVERIFY(run("setTrackLocked", {{"track_id", TRACK_A}, {"locked", true}}).value("ok").toBool());
        const auto lockedTrack = doc();
        QVERIFY(!run("toggleClipEnabled", {{"clip_ids", QStringList{CLIP_AUDIO}}}).value("ok").toBool());
        QVERIFY(!run("toggleClipLock", {{"clip_ids", QStringList{CLIP_AUDIO}}}).value("ok").toBool());
        QCOMPARE(doc(), lockedTrack);
    }
    // An action that takes the selection and changes nothing is an error, not a success.
    void noChangeOnSelectionIsAnError() {
        const auto before = doc();
        gestures()->setSelection({CLIP_B});
        // Fades apply to sound and video, and this clip is a still.
        const auto result = run("applyFades", {{"clip_ids", QStringList{CLIP_A}}});
        QVERIFY(!result.value("ok").toBool());
        QCOMPARE(gestures()->selection(), QStringList{CLIP_B});
        QCOMPARE(doc(), before);
        // Reading commands have nothing to change.
        QVERIFY(run("copy", {{"clip_ids", QStringList{CLIP_A}}}).value("ok").toBool());
    }
    void batchSpeedFollowsLinkedSelection() {
        QVERIFY(run("linkClips", {{"clip_ids", QStringList{CLIP_A, CLIP_AUDIO}}}).value("ok").toBool());
        gestures()->setLinkedSelection(false);
        const auto result = run("setClipsSpeed", {{"clip_ids", QStringList{CLIP_A}}, {"speed", 2.0}});
        gestures()->setLinkedSelection(true);
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(clip(CLIP_A).value("speedMultiplier").toDouble(), 2.0);
        QVERIFY(clip(CLIP_AUDIO).value("speedMultiplier").toDouble(1.0) == 1.0);
    }
    // Volume in dB has its own bounded command: a huge one is infinite gain in the mixer.
    void volumeIsBounded() {
        const auto before = doc();
        QVERIFY(!run("setClipAudio", {{"clip_id", CLIP_AUDIO}, {"field", "volumeDb"}, {"value", 10000}}).value("ok").toBool());
        QVERIFY(!run("setClipsGain", {{"clip_ids", QStringList{CLIP_AUDIO}}, {"db", 10000}}).value("ok").toBool());
        QCOMPARE(doc(), before);
        QVERIFY(run("setClipsGain", {{"clip_ids", QStringList{CLIP_AUDIO}}, {"db", -6.0}, {"mode", "set"}}).value("ok").toBool());
        QCOMPARE(clip(CLIP_AUDIO).value("volumeDb").toDouble(), -6.0);
    }
    void insertTrackGoesWhereAsked() {
        QVERIFY(run("insertTrack", {{"type", "video"}, {"name", "Top"}, {"atIndex", 0}}).value("ok").toBool());
        QCOMPARE(doc().value("tracks").toArray().first().toObject().value("name").toString(), QString("Top"));
        // addTrack appends and has no position to ignore.
        QVERIFY(!run("addTrack", {{"type", "video"}, {"atIndex", 0}}).value("ok").toBool());
    }
    // Captions go to the clip the time finds, so the command doesn't pretend to take one.
    void captionAddHasNoClipParameter() {
        QVERIFY(!run("captions.add", {{"clip_id", CLIP_AUDIO}, {"text", "Hi"}, {"atMs", 100}}).value("ok").toBool());
    }
    void refusedRangeKeepsTheView() {
        QVERIFY(run("setTrackLocked", {{"track_id", TRACK_V}, {"locked", true}}).value("ok").toBool());
        QVERIFY(run("setTrackLocked", {{"track_id", TRACK_A}, {"locked", true}}).value("ok").toBool());
        gestures()->viewState()->setRangeIn(1000);
        gestures()->viewState()->setRangeOut(2000);
        clock.seek(5000);
        const auto before = doc();
        const auto result = run("extractRange");
        QVERIFY(!result.value("ok").toBool());
        QCOMPARE(doc(), before);
        QCOMPARE(gestures()->viewState()->rangeInMs(), 1000.0);
        QCOMPARE(gestures()->viewState()->rangeOutMs(), 2000.0);
        QCOMPARE(clock.currentTimeMs(), 5000.0);
    }
    void locksFollowLinkedSelection() {
        QVERIFY(run("linkClips", {{"clip_ids", QStringList{CLIP_A, CLIP_AUDIO}}}).value("ok").toBool());
        QVERIFY(run("setTrackLocked", {{"track_id", TRACK_A}, {"locked", true}}).value("ok").toBool());
        // The link makes the audio part of the edit, and it is locked.
        QVERIFY(!run("patchClip", {{"clip_id", CLIP_A}, {"patch", QVariantMap{{"opacity", 0.5}}}}).value("ok").toBool());
        gestures()->setLinkedSelection(false);
        const auto result = run("patchClip", {{"clip_id", CLIP_A}, {"patch", QVariantMap{{"opacity", 0.5}}}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
    }
    void loudnessWithNothingToDoIsAnError() {
        const auto result = run("matchLoudness", {{"clip_ids", QStringList{CLIP_AUDIO}}});
        QVERIFY(!result.value("ok").toBool());
        QVERIFY(result.value("error").toString().contains("nothing to do"));
    }
    void rangeCommands() {
        const auto extract = run("extractRange", {{"inMs", 2000.0}, {"outMs", 4000.0}});
        QVERIFY2(extract.value("ok").toBool(), qPrintable(extract.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(clip(CLIP_B).isEmpty());
        QCOMPARE(clip(CLIP_C).value("startMs").toDouble(), 2000.0);
        QVERIFY(run("undo").value("ok").toBool());
        QCOMPARE(clip(CLIP_C).value("startMs").toDouble(), 4000.0);
        const auto lift = run("liftRange", {{"inMs", 2000.0}, {"outMs", 4000.0}});
        QVERIFY2(lift.value("ok").toBool(), qPrintable(lift.value("error").toString()));
        QVERIFY(clip(CLIP_B).isEmpty());
        QCOMPARE(clip(CLIP_C).value("startMs").toDouble(), 4000.0);
    }
    void gapRipple() {
        const auto result = run("rippleDeleteSelected", {{"gap_track_id", TRACK_V}, {"gap_at_ms", 7000.0}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(clip(TWIN_1).value("startMs").toDouble(), 6000.0);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void groups() {
        const auto group = run("groupClips", {{"clip_ids", QStringList{CLIP_A, CLIP_B}}});
        QVERIFY2(group.value("ok").toBool(), qPrintable(group.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(gestures()->selection().size(), 1);
        const auto groupId = gestures()->selection().first();
        QCOMPARE(clip(groupId).value("mediaType").toString(), QString("group"));
        const auto ungroup = run("ungroupClips", {{"clip_ids", QStringList{groupId}}});
        QVERIFY2(ungroup.value("ok").toBool(), qPrintable(ungroup.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 2);
        QVERIFY(clip(groupId).isEmpty());
    }
    void playheadParameterSeeksFirst() {
        const int clipsBefore = model.clipCount();
        const auto result = run("splitAtPlayhead", {{"clip_ids", QStringList{CLIP_A}}, {"atMs", 500.0}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(clock.currentTimeMs(), 500.0);
        QCOMPARE(model.clipCount(), clipsBefore + 1);
        QCOMPARE(result.value("state").toMap().value("playheadMs").toDouble(), 500.0);
        QCOMPARE(result.value("state").toMap().value("clips").toList().size(), clipsBefore + 1);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void editPointParameters() {
        const auto result = run("trimEditRight", {{"clip_id", CLIP_C}, {"edge", "end"}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QVERIFY(clip(CLIP_C).value("durationMs").toDouble() != 2000.0);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void twoCallsAreTwoEntries() {
        QVERIFY(run("nudgeRight", {{"clip_ids", QStringList{CLIP_C}}}).value("ok").toBool());
        QVERIFY(run("nudgeRight", {{"clip_ids", QStringList{CLIP_C}}}).value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), 2);
    }
    void gestureInProgressRefuses() {
        QVERIFY(gestures()->pressClip(CLIP_C, "body", 100, 100, Qt::NoModifier));
        QVERIFY(!gestures()->gestureKind().isEmpty());
        const auto before = doc();
        const auto result = run("deleteSelected", {{"clip_ids", QStringList{CLIP_A}}});
        QVERIFY(!result.value("ok").toBool());
        QVERIFY2(result.value("error").toString().contains("dragging"), qPrintable(result.value("error").toString()));
        QVERIFY(!gestures()->gestureKind().isEmpty());
        gestures()->cancelGesture();
        QCOMPARE(doc(), before);
    }
    // Each exposed edit with parameters a model would pass. It must really edit, in one undo
    // entry, and undo must restore the document.
    void edits_data() {
        QTest::addColumn<QString>("id");
        QTest::addColumn<QVariantMap>("params");
        const auto add = [](const char* id, const QVariantMap& params) { QTest::newRow(id) << QString(id) << params; };
        add("trimClipStart", {{"clip_id", CLIP_B}, {"deltaMs", 200}});
        add("trimClipEnd", {{"clip_id", CLIP_B}, {"deltaMs", -200}});
        add("rippleTrimClipStart", {{"clip_id", CLIP_B}, {"deltaMs", 200}});
        add("rippleTrimClipEnd", {{"clip_id", CLIP_B}, {"deltaMs", -200}});
        add("rollClipEdge", {{"clip_id", CLIP_A}, {"edge", "end"}, {"deltaMs", -200}});
        add("slideClip", {{"clip_id", CLIP_B}, {"deltaMs", 100}});
        add("rateStretchClip", {{"clip_id", CLIP_C}, {"edge", "end"}, {"durationMs", 1000}});
        add("moveClip", {{"clip_id", TWIN_2}, {"deltaMs", 1000}});
        add("splitClipAtTime", {{"clip_id", CLIP_B}, {"atMs", 3000}});
        add("setClipTransition", {{"clip_id", CLIP_B}, {"mode", "crossfade"}});
        add("setTransitionDuration", {{"clip_id", CLIP_B}, {"durationMs", 400}});
        add("setClipSpeed", {{"clip_id", CLIP_B}, {"speed", 2.0}});
        add("setClipsSpeed", {{"clip_ids", QStringList{CLIP_B, CLIP_C}}, {"speed", 2.0}});
        add("setClipsGain", {{"clip_ids", QStringList{CLIP_AUDIO}}, {"db", -6.0}});
        add("setClipAudio", {{"clip_id", CLIP_AUDIO}, {"field", "fadeInMs"}, {"value", 500}});
        add("captions.add", {{"text", "Hello there"}, {"atMs", 13500}});
        add("patchClip", {{"clip_id", CLIP_A}, {"patch", QVariantMap{{"opacity", 0.5}}}});
        add("addTrack", {{"type", "video"}, {"name", "Overlay"}});
        add("insertTrack", {{"type", "video"}, {"name", "First"}, {"atIndex", 0}});
        add("duplicateTrack", {{"track_id", TRACK_V}});
        add("removeTrack", {{"track_id", TRACK_A}});
        add("reorderTracks", {{"track_ids", QStringList{TRACK_A, TRACK_V}}});
        add("setTrackName", {{"track_id", TRACK_V}, {"name", "Picture"}});
        add("setTrackHeight", {{"track_id", TRACK_V}, {"heightPx", 120}});
        add("setTrackVisible", {{"track_id", TRACK_V}, {"visible", false}});
        add("setTrackLocked", {{"track_id", TRACK_V}, {"locked", true}});
        add("setTrackMuted", {{"track_id", TRACK_A}, {"muted", true}});
        add("setTrackSolo", {{"track_id", TRACK_A}, {"solo", true}});
        add("setTrackVolume", {{"track_id", TRACK_A}, {"db", -3.0}});
        add("setTrackPan", {{"track_id", TRACK_A}, {"pan", 0.5}});
        add("setMasterVolume", {{"db", -3.0}});
        add("addTrackEffect", {{"track_id", TRACK_A}, {"effect", "eq3"}});
        add("addMasterEffect", {{"effect", "eq3"}});
        add("addClipAudioEffect", {{"clip_id", CLIP_AUDIO}, {"type", "eq3"}});
        add("markers.add", {{"timeMs", 500}, {"label", "Hit"}});
        add("markers.update", {{"marker_ids", QStringList{MARKER}}, {"patch", QVariantMap{{"label", "Downbeat"}}}});
        add("markers.remove", {{"marker_ids", QStringList{MARKER}}});
        add("keyframes.toggle", {{"clip_id", CLIP_A}, {"row", "opacity"}, {"atMs", 500}});
        add("frameHold.add", {{"clip_ids", QStringList{CLIP_VIDEO}}, {"atMs", 13500}});
        add("frameHold.insertSegment", {{"clip_id", CLIP_VIDEO}, {"atMs", 13500}, {"durationMs", 500}});
        add("frameHold.options", {{"clip_ids", QStringList{CLIP_VIDEO}}, {"enabled", true}, {"holdOn", "in"}});
        add("setClipCropEdge", {{"clip_id", CLIP_A}, {"edge", "left"}, {"value", 0.1}});
        add("setProjectSettings", {{"width", 1280}, {"height", 720}, {"fps", 25}});
    }
    void edits() {
        QFETCH(QString, id);
        QFETCH(QVariantMap, params);
        const auto before = doc();
        const auto result = run(id, params);
        QVERIFY2(result.value("ok").toBool(), qPrintable(id + ": " + result.value("error").toString()));
        QVERIFY2(result.value("changed").toBool(), qPrintable(id));
        QVERIFY2(doc() != before, qPrintable(id));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(result.value("undo").toMap().value("added").toBool(), true);
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    // Every allowed command with no required parameter, in a state where most can run: at most one
    // undo entry each, never a window or dialog opened, and undo restores the document.
    void everyCommandIsAtMostOneEntry() {
        const auto entries = list().value("commands").toList();
        QVERIFY(entries.size() > 100);
        const auto popups = [this] {
            return view->findChildren<QWindow*>().size();
        };
        const int popupsBefore = popups();
        for (const auto& value : entries) {
            const auto entry = value.toMap();
            const auto id = entry.value("id").toString();
            if (!entry.value("parameters").toMap().value("required").toList().isEmpty()) { continue; }
            gestures()->setSelection({CLIP_B, CLIP_C});
            gestures()->viewState()->setRangeIn(2000);
            gestures()->viewState()->setRangeOut(4000);
            clock.seek(3000);
            const auto before = doc();
            const int index = model.undoStack()->index();
            const auto result = run(id);
            QCoreApplication::processEvents();
            const int added = model.undoStack()->index() - index;
            QVERIFY2(id == "undo" || added <= 1, qPrintable(id + " pushed " + QString::number(added)));
            QVERIFY2(result.contains("ok"), qPrintable(id));
            QVERIFY2(popups() == popupsBefore, qPrintable(id + " opened a window"));
            if (added == 1) {
                model.undoStack()->undo();
                QVERIFY2(doc() == before, qPrintable(id + " did not undo cleanly"));
            }
            // A failure names its reason.
            if (!result.value("ok").toBool()) { QVERIFY2(!result.value("error").toString().isEmpty(), qPrintable(id)); }
        }
    }
    void foldsSeveralPushesIntoOneEntry() {
        const auto before = doc();
        const int index = model.undoStack()->index();
        QVERIFY(model.applyEdit("setTrackName", {{"trackId", TRACK_V}, {"name", "One"}}));
        QVERIFY(model.applyEdit("setTrackName", {{"trackId", TRACK_V}, {"name", "Two"}}));
        const auto after = doc();
        QCOMPARE(model.undoStack()->index(), index + 2);
        nt::aiassist::foldUndoEntries(model, index, "Both");
        QCOMPARE(model.undoStack()->index(), index + 1);
        QCOMPARE(model.undoStack()->text(index), QString("Both"));
        QCOMPARE(doc(), after);
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void toolsAdvertiseSchemas() {
        const auto tools = AssistantCommands::tools();
        QCOMPARE(tools.size(), 4);
        for (const auto& name : {"ui_timeline_list_commands", "ui_timeline_run_command", "ui_timeline_read_scopes", "ui_timeline_capture_frame"}) {
            QVERIFY(AssistantCommands::handles(name));
            const auto found = std::find_if(tools.begin(), tools.end(), [&](const QVariant& tool) { return tool.toMap().value("name") == name; });
            QVERIFY(found != tools.end());
            QVERIFY(!found->toMap().value("description").toString().isEmpty());
            QVERIFY(found->toMap().value("parameters").toMap().value("required").toStringList().contains("timeline_id"));
        }
        QVERIFY(!AssistantCommands::handles("ui_timeline_get_state"));
    }
    void scopesRefuseBadInputSynchronously() {
        const auto base = QVariantMap{{"timeline_id", TIMELINE}};
        auto args = base;
        args.insert("atMs", -1);
        QVERIFY(!commands->execute("ui_timeline_read_scopes", args, "a").value("ok").toBool());
        args = base;
        args.insert("scopes", QStringList{"nonsense"});
        QVERIFY(!commands->execute("ui_timeline_read_scopes", args, "b").value("ok").toBool());
        args = base;
        args.insert("atMs", 999999);
        QVERIFY(!commands->execute("ui_timeline_capture_frame", args, "c").value("ok").toBool());
        args = base;
        args.insert("width", -3);
        QVERIFY(!commands->execute("ui_timeline_capture_frame", args, "d").value("ok").toBool());
        QVERIFY(!commands->execute("ui_timeline_capture_frame", base, "").value("ok").toBool());
    }
    void readScopesAndCaptureFrame() {
        if (qEnvironmentVariable("QT_QUICK_BACKEND") == "software") { QSKIP("Runs as assistant_capture, with a real graphics backend."); }
        auto* capture = view->rootObject()->property("frameCapture").value<FrameCapture*>();
        QVERIFY(capture);
        capture->setExecutable(NT_TIMELINE_BINARY);
        QSignalSpy done(commands.get(), &AssistantCommands::toolCompleted);
        const auto before = doc();
        const auto started = commands->execute("ui_timeline_read_scopes",
            {{"timeline_id", TIMELINE}, {"atMs", 1000.0}, {"scopes", QStringList{"histogram", "waveform"}}}, "scopes");
        QVERIFY2(started.value("deferred").toBool(), qPrintable(started.value("error").toString()));
        QTRY_VERIFY_WITH_TIMEOUT(done.size() == 1, 60000);
        QCOMPARE(done[0][0].toString(), QString("scopes"));
        const auto scopes = done[0][1].toMap();
        QVERIFY2(scopes.value("ok").toBool(), qPrintable(scopes.value("error").toString()));
        QCOMPARE(scopes.value("timeMs").toDouble(), 1000.0);
        QVERIFY(scopes.contains("waveform") && scopes.contains("histogram"));
        const auto frame = commands->execute("ui_timeline_capture_frame", {{"timeline_id", TIMELINE}, {"atMs", 1000.0}, {"width", 320}}, "frame");
        QVERIFY2(frame.value("deferred").toBool(), qPrintable(frame.value("error").toString()));
        QTRY_VERIFY_WITH_TIMEOUT(done.size() == 2, 60000);
        const auto shot = done[1][1].toMap();
        QVERIFY2(shot.value("ok").toBool(), qPrintable(shot.value("error").toString()));
        const auto entry = shot.value("frames").toList().value(0).toMap();
        QVERIFY(entry.value("dataUrl").toString().startsWith("data:image/jpeg;base64,"));
        QCOMPARE(entry.value("width").toInt(), 320);
        QCOMPARE(entry.value("timelineTimeMs").toDouble(), 1000.0);
        QCOMPARE(doc(), before);
        QCOMPARE(model.undoStack()->count(), 0);
        // Never larger than the frame.
        QVERIFY(commands->execute("ui_timeline_capture_frame", {{"timeline_id", TIMELINE}, {"atMs", 1000.0}, {"width", 1920}}, "large").value("deferred").toBool());
        QTRY_VERIFY_WITH_TIMEOUT(done.size() == 3, 60000);
        QCOMPARE(done[2][1].toMap().value("frames").toList().value(0).toMap().value("width").toInt(), 640);
        // A very tall sequence stays within the height limit.
        QVERIFY(run("setProjectSettings", {{"width", 16}, {"height", 7680}, {"fps", 30}}).value("ok").toBool());
        QVERIFY(commands->execute("ui_timeline_capture_frame", {{"timeline_id", TIMELINE}, {"atMs", 1000.0}, {"width", 1920}}, "tall").value("deferred").toBool());
        QTRY_VERIFY_WITH_TIMEOUT(done.size() == 4, 60000);
        QVERIFY(done[3][1].toMap().value("frames").toList().value(0).toMap().value("height").toInt() <= 1920);
    }
    // Last, because the registry has no way to remove an entry: a real registration fails the audit.
    void aRealNewRegistrationFailsTheAudit() {
        QVERIFY(nt::wiring::registerKeyAction({"test.newCommand", "New command", {}, [](ClipGestureController&, const QVariantMap&) { return true; }}));
        QVERIFY(nt::aiassist::auditCommands().unlisted.contains("test.newCommand"));
        QVERIFY(nt::app::registerEdit("test.newEdit", [](QJsonObject raw, const QJsonObject&) { return raw; }));
        QVERIFY(nt::aiassist::auditCommands().unlisted.contains("test.newEdit"));
    }
};
QTEST_MAIN(TestAssistantCommands)
#include "tst_assistantcommands.moc"
