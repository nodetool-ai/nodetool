#include "aiassist/AgentBridge.h"
#include "audio/vst/VstHostClient.h"
#include <QDir>
#include <QFileInfo>
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
#include <QTemporaryDir>
#include <QFile>
#include <QElapsedTimer>

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

    void notePatchCommandsUseRegisteredEdits() {
        auto raw = model.timeline().raw;
        auto clips = raw.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("mediaType", "midi");
        clip.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 0}, {"durationTick", 480}}});
        clips[0] = clip;
        raw.insert("clips", clips);
        const auto parsed = nt::parseTimeline(raw);
        if (!parsed.timeline) { QFAIL("Fixture must parse"); }
        model.setTimeline(*parsed.timeline);
        const QList<QPair<QString, QJsonObject>> fixtures{
            {"midi.moveNotes", {{"notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 62}, {"startTick", 120}}}}}},
            {"midi.resizeNotes", {{"notes", QJsonArray{QJsonObject{{"id", "n"}, {"durationTick", 240}}}}}},
            {"midi.setNoteVelocities", {{"notes", QJsonArray{QJsonObject{{"id", "n"}, {"velocity", 42}}}}}},
            {"midi.addNotes", {{"notes", QJsonArray{QJsonObject{{"id", "new"}, {"pitch", 64}, {"velocity", 80}, {"startTick", 960}, {"durationTick", 240}}}}}},
            {"midi.patchNotes", {{"notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 63}, {"velocity", 42}, {"startTick", 120}, {"durationTick", 240}}}}}},
            {"midi.removeNotes", {{"noteIds", QJsonArray{"new"}}}}
        };
        QSignalSpy coarse(&model, &TimelineModel::timelineChanged);
        for (const auto& [name, payload] : fixtures) {
            QVERIFY2(!commandEntry(name).isEmpty(), qPrintable(name));
            auto params = payload.toVariantMap();
            params.insert("clip_id", CLIP_A);
            auto expectedPayload = payload;
            expectedPayload.insert("clipId", CLIP_A);
            const auto expected = nt::app::findEdit(name)(model.timeline().raw, expectedPayload);
            const auto result = run(name, params);
            QVERIFY2(result.value("error").toString().isEmpty(), qPrintable(result.value("error").toString()));
            QCOMPARE(model.timeline().raw, expected);
            QCOMPARE(coarse.size(), 0);
            const auto properties = commandEntry(name).value("parameters").toMap().value("properties").toMap();
            const auto itemSchema = properties.value(name == "midi.removeNotes" ? "noteIds" : "notes").toMap().value("items").toMap();
            if (name == "midi.removeNotes") { QCOMPARE(itemSchema.value("type").toString(), QString("string")); }
            else { QVERIFY(itemSchema.contains("additionalProperties")); QVERIFY(!itemSchema.value("additionalProperties").toBool()); }
            if (name != "midi.addNotes" && name != "midi.removeNotes") {
                const int count = model.undoStack()->count();
                const auto noop = run(name, params);
                QVERIFY2(noop.value("error").toString().isEmpty(), qPrintable(noop.value("error").toString()));
                QCOMPARE(model.undoStack()->count(), count);
            }
        }
        const auto invalid = run("midi.moveNotes", {{"clip_id", CLIP_A},
            {"notes", QVariantList{QVariantMap{{"id", "missing"}, {"pitch", 62}}}}});
        QVERIFY(invalid.value("error").toString().contains("id", Qt::CaseInsensitive));
        for (const auto* name : {"midi.resizeNotes", "midi.setNoteVelocities"}) {
            const auto missingField = run(name, {{"clip_id", CLIP_A}, {"notes", QVariantList{QVariantMap{{"id", "n"}}}}});
            QVERIFY2(!missingField.value("error").toString().isEmpty(), name);
        }
    }

    void closingCancelsPluginRequest() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QFile helper(dir.filePath("host"));
        QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys, time
for line in sys.stdin:
    req = json.loads(line)
    if req['cmd'] == 'quit': break
    open(__file__ + '.started', 'w').close()
    time.sleep(1)
    print(json.dumps(dict(id=req['id'], ok=True, plugins=[])), flush=True)
)PY");
        helper.close();
        QVERIFY(helper.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));
        const auto client = nt::audio::vst::sharedVstHostClient();
        const auto original = client->executablePath();
        client->setOverrideExecutable(helper.fileName());
        const auto result = commands->execute("ui_timeline_list_plugins", {{"timeline_id", TIMELINE}, {"rescan", true}}, "close-test");
        QVERIFY(result.value("deferred").toBool());
        QTRY_VERIFY(QFileInfo::exists(helper.fileName() + ".started"));
        QElapsedTimer elapsed;
        elapsed.start();
        commands.reset();
        const auto closeMs = elapsed.elapsed();
        client->setOverrideExecutable(original);
        commands = std::make_unique<AssistantCommands>(model, clock);
        commands->setEditor(view->rootObject());
        QVERIFY2(closeMs < 300, qPrintable(QStringLiteral("Closing waited %1 ms for plugin RPC").arg(closeMs)));
    }

    // Acceptance: a registered command that is neither allowed nor denied fails this test.
    void everyRegisteredCommandIsDecided() {
        const auto audit = nt::aiassist::auditCommands();
        QVERIFY2(audit.unlisted.isEmpty(), qPrintable("Neither allowed nor denied: " + audit.unlisted.join(", ")));
        QVERIFY2(audit.stale.isEmpty(), qPrintable("Not registered: " + audit.stale.join(", ")));
        QVERIFY2(audit.conflicting.isEmpty(), qPrintable("Allowed and denied: " + audit.conflicting.join(", ")));
        QVERIFY2(audit.unrunnable.isEmpty(), qPrintable("Allowed with no runner: " + audit.unrunnable.join(", ")));
        QVERIFY(nt::aiassist::registeredCommandIds().contains("effect.setParams"));
        QVERIFY(!commandEntry("effect.setParams").isEmpty());
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
        for (const auto* id : {"accountSignIn", "accountOtherServer", "accountSwitchServer", "shareTimeline",
                               "exportVideo", "quickExport", "exportFrame", "exportPremiere", "importPremiere", "exportMarkersCsv",
                               "remixClip", "sceneEditDetection", "projectSettings", "toggleSnap", "playPause", "resetWorkspace", "updateTrackEffect",
                               "ai.insertGeneration", "music.insertPlaceholder", "music.applyResult", "music.removeTakes", "musicCleanUpTakes", "assets.dropAsset", "restoreDocument", "acceptExternalUnit", "toggleScrubAudio"}) {
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
        QCOMPARE(entry.value("disabledReason").toString(), QString("Select clips, a gap or a section first."));
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
    void clipParamsAdvertisesSourceAndStyleFields() {
        const auto schema = commandEntry("set_clip_params").value("parameters").toMap();
        const auto properties = schema.value("properties").toMap();
        const auto required = schema.value("required").toList();
        for (const auto* name : {"inPointMs", "outPointMs", "transform", "blendMode", "borderRadius",
                                 "crop", "fontSizePx", "textStyle", "shapeStyle", "captionStyle"}) {
            QVERIFY2(properties.contains(name), name);
            QVERIFY(!required.contains(QString(name)));
        }
        const auto before = doc();
        const auto result = run("set_clip_params", {{"target", CLIP_VIDEO}, {"inPointMs", 100.0},
            {"outPointMs", 2100.0}, {"transform", QVariantMap{{"rotation", 15.0}}},
            {"blendMode", "multiply"}, {"borderRadius", 8.0}, {"crop", QVariantMap{{"left", 0.1}, {"right", 0.0}, {"top", 0.0}, {"bottom", 0.0}}}});
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(rawClip(CLIP_VIDEO).value("inPointMs").toDouble(), 100.0);
        QCOMPARE(rawClip(CLIP_VIDEO).value("blendMode").toString(), QString("multiply"));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
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
        QTest::newRow("no selection") << QString("rippleDeleteSelected") << QVariantMap{} << QString("Select clips, a gap or a section first.");
        QTest::newRow("no range") << QString("liftRange") << QVariantMap{{"inMs", 3000.0}} << QString("Set In and Out points first.");
        QTest::newRow("one clip group") << QString("groupClips") << QVariantMap{{"clip_ids", QStringList{CLIP_A}}}
                                        << QString("Select two or more clips first.");
        QTest::newRow("playhead off the clip") << QString("addKeyframe") << QVariantMap{{"clip_ids", QStringList{CLIP_A}}, {"atMs", 9000.0}}
                                               << QString("Select one clip and move the playhead over it.");
        QTest::newRow("no undo") << QString("undo") << QVariantMap{} << QString("Nothing to undo.");
        QTest::newRow("no edit point") << QString("trimEditLeft") << QVariantMap{} << QString("Pass clip_id and edge, or select an edit point first.");
        QTest::newRow("empty clipboard") << QString("paste") << QVariantMap{{"atMs", 3000.0}} << QString("Copy a clip or section first.");
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
        auto* takes = TakeSwitcher::attach(model, m_testCache.root());
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
    void fableParams() {
        const QList<QStringList> cases{
            {"eq", "fx.eq.low"}, {"comp", "fx.comp.thr"}, {"ott", "fx.ott.depth"},
            {"limiter", "fx.limit.gain"}, {"drive", "fx.drive.amt"}, {"chorus", "fx.chorus.rate"},
            {"echo", "fx.delay.fb"}, {"reverb", "fx.reverb.size"}, {"lab", "fx.crush.bits"}};
        const QList<double> maxima{15, 0, 1, 24, 1, 8, 0.92, 1, 16};
        const QList<double> minima{-15, -40, 0, 0, 0, 0.05, 0, 0, 1};
        int caseIndex = 0;
        for (const auto& row : cases) {
            QVERIFY(run("addTrackEffect", {{"track_id", TRACK_A}, {"effect", "fable:" + row[0]}}).value("ok").toBool());
            const auto effect = track(TRACK_A).value("effects").toArray().last().toObject();
            const auto id = effect.value("id").toString();
            const auto before = doc();
            const auto index = model.undoStack()->index();
            auto result = run("effect.setParams", {{"trackId", TRACK_A.left(12)}, {"effectId", id.left(12)},
                {"params", QVariantMap{{row[1], 1e100}}}});
            QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
            QCOMPARE(model.undoStack()->index(), index + 1);
            const auto changed = track(TRACK_A).value("effects").toArray().last().toObject().value("params").toObject();
            QCOMPARE(changed.value(row[1]).toDouble(), maxima[caseIndex]);
            QVERIFY(run("effect.setParams", {{"trackId", TRACK_A}, {"effectId", id},
                {"params", QVariantMap{{row[1], -1e100}}}}).value("ok").toBool());
            QCOMPARE(track(TRACK_A).value("effects").toArray().last().toObject().value("params").toObject().value(row[1]).toDouble(), minima[caseIndex]);
            model.undoStack()->undo();
            ++caseIndex;
            model.undoStack()->undo();
            QCOMPARE(doc(), before);
            for (const auto& bad : QList<QVariantMap>{{{"unknown", 1}}, {{row[1], "bad"}}, {{row[1], QVariant()}}, {}}) {
                QVERIFY(!run("effect.setParams", {{"trackId", TRACK_A}, {"effectId", id}, {"params", bad}}).value("ok").toBool());
                QCOMPARE(doc(), before);
            }
        }
        const auto id = track(TRACK_A).value("effects").toArray().last().toObject().value("id").toString();
        QVERIFY(run("effect.setParams", {{"trackId", TRACK_A}, {"effectId", id},
            {"params", QVariantMap{{"fx.crush.bits", 8}, {"fx.reso.note", 49.7}, {"fx.reso.chord", 5}, {"fx.reso.on", 1}}}}).value("ok").toBool());
        const auto params = track(TRACK_A).value("effects").toArray().last().toObject().value("params").toObject();
        QCOMPARE(params.value("fx.reso.note").toDouble(), 50.0);
        QCOMPARE(params.value("fx.reso.chord").toDouble(), 5.0);
        QCOMPARE(params.value("fx.reso.on").toDouble(), 1.0);
        QVERIFY(run("effect.setParams", {{"trackId", TRACK_A}, {"effectId", id},
            {"params", QVariantMap{{"fx.crush.bits", 10}}}}).value("ok").toBool());
        QCOMPARE(track(TRACK_A).value("effects").toArray().last().toObject().value("params").toObject().value("fx.reso.chord").toDouble(), 5.0);
        const auto before = doc();
        for (const auto value : {-1.0, 6.0, 1.5}) {
            QVERIFY(!run("effect.setParams", {{"trackId", TRACK_A}, {"effectId", id},
                {"params", QVariantMap{{"fx.reso.chord", value}, {"fx.crush.bits", 8}}}}).value("ok").toBool());
            QCOMPARE(doc(), before);
        }
        QVERIFY(!run("effect.setParams", {{"trackId", TRACK_A}, {"effectId", "missing"},
            {"params", QVariantMap{{"fx.crush.bits", 8}}}}).value("ok").toBool());
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
    void addTrackMakesAMidiTrack() {
        QVERIFY(run("addTrack", {{"type", "midi"}, {"name", "Keys"}}).value("ok").toBool());
        const auto added = doc().value("tracks").toArray().last().toObject();
        QCOMPARE(added.value("type").toString(), QString("midi"));
        QCOMPARE(added.value("name").toString(), QString("Keys"));
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
        add("setMasterLimiter", {{"enabled", false}});
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
        QCOMPARE(tools.size(), 47);
        for (const auto& name : {"ui_timeline_list_commands", "ui_timeline_run_command", "ui_timeline_read_scopes", "ui_timeline_capture_frame",
                                 "ui_timeline_music_generate", "ui_timeline_music_regenerate", "ui_timeline_music_add_instrument",
                                 "ui_timeline_get_pattern",
                                 "ui_timeline_create_pattern_region",
                                 "ui_timeline_convert_pattern_to_midi",
                                 "ui_timeline_convert_midi_to_pattern",
                                 "ui_timeline_separate_pattern_rows",
                                 "ui_timeline_set_pattern",
                                 "ui_timeline_set_pattern_seed",
                                 "ui_timeline_add_pattern_rows",
                                 "ui_timeline_set_pattern_row",
                                 "ui_timeline_remove_pattern_rows",
                                 "ui_timeline_move_pattern_row",
                                 "ui_timeline_sort_pattern_rows",
                                 "ui_timeline_set_pattern_row_sort",
                                 "ui_timeline_copy_pattern_row",
                                 "ui_timeline_set_steps",
                                 "ui_timeline_set_pattern_text",
                                 "ui_timeline_clear_pattern",
                                 "ui_timeline_copy_steps",
                                 "ui_timeline_repeat_step",
                                 "ui_timeline_rotate_pattern",
                                 "ui_timeline_transpose_pattern",
                                 "ui_timeline_randomize_pattern",
                                 "ui_timeline_nudge_pattern_values",
                                 "ui_timeline_tie_steps",
                                 "ui_timeline_list_step_patterns",
                                 "ui_timeline_apply_step_pattern",
                                 "ui_timeline_save_step_pattern",
                                 "ui_timeline_set_track_step_template",
                                 "ui_timeline_create_step_pattern_folder",
                                 "ui_timeline_rename_step_pattern_folder",
                                 "ui_timeline_delete_step_pattern_folder",
                                 "ui_timeline_move_step_pattern",
                                 "ui_timeline_learn_pattern_row",
                                 "ui_timeline_step_record",
                                 "ui_timeline_list_plugins", "ui_timeline_load_plugin",
                                 "ui_timeline_list_plugin_presets", "ui_timeline_select_plugin_preset",
                                 "ui_timeline_get_plugin_parameters", "ui_timeline_set_plugin_parameters"}) {
            QVERIFY(AssistantCommands::handles(name));
            const auto found = std::find_if(tools.begin(), tools.end(), [&](const QVariant& tool) { return tool.toMap().value("name") == name; });
            QVERIFY(found != tools.end());
            QVERIFY(!found->toMap().value("description").toString().isEmpty());
            QVERIFY(found->toMap().value("parameters").toMap().value("required").toStringList().contains("timeline_id"));
        }
        QVERIFY(!AssistantCommands::handles("ui_timeline_get_state"));
    }
    // GN-8: the music tools reach the timeline's job module, which refuses a sequence that is not a music project.
    void musicToolsDispatch() {
        const QVariantMap args{{"timeline_id", TIMELINE}, {"track_id", TRACK_A}, {"start_bar", 1}, {"end_bar", 2}, {"prompt", "drums"}};
        for (const auto* name : {"ui_timeline_music_generate", "ui_timeline_music_regenerate", "ui_timeline_music_add_instrument"}) {
            const auto result = commands->execute(name, args);
            QVERIFY(!result.value("ok").toBool());
            QVERIFY2(result.value("error").toString().contains("not a music project"), qPrintable(result.value("error").toString()));
        }
        auto other = args;
        other.insert("timeline_id", "00000000000000000000000000000000");
        QVERIFY(commands->execute("ui_timeline_music_generate", other).value("error").toString().contains("not open"));
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void pluginToolsDispatchAsynchronously() {
        const QDir build(QCoreApplication::applicationDirPath());
        const auto host = build.absoluteFilePath("../../vst-host/build/tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol");
        const auto plugin = build.absoluteFilePath("../../vst-host/build/GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3");
        QVERIFY(QFileInfo::exists(host));
        QVERIFY(QFileInfo::exists(plugin));
        const auto client = nt::audio::vst::sharedVstHostClient();
        client->setOverrideExecutable(host);
        client->setExtraScanDirs({QFileInfo(plugin).absolutePath()});
        QSignalSpy completed(commands.get(), &AssistantCommands::toolCompleted);
        const QVariantMap args{{"timeline_id", TIMELINE}, {"track", TRACK_A}, {"plugin", "NodeTool Test Gain"}};
        const auto pending = commands->execute("ui_timeline_load_plugin", args, "plugin-load");
        QVERIFY(pending.value("deferred").toBool());
        QTRY_COMPARE_WITH_TIMEOUT(completed.size(), 1, 180000);
        QCOMPARE(completed[0][0].toString(), QStringLiteral("plugin-load"));
        const auto result = completed[0][1].toMap();
        QVERIFY2(result.value("ok").toBool(), qPrintable(result.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 1);
        const auto loaded = doc();
        const auto effectId = result.value("effectId").toString();
        QCOMPARE(effectId.size(), 32);
        completed.clear();
        QVERIFY(commands->execute("ui_timeline_set_plugin_parameters", {{"timeline_id", TIMELINE}, {"track", TRACK_A},
            {"effectId", effectId.left(12)}, {"parameter", "Gain"}, {"value", 0.75}}, "plugin-change").value("deferred").toBool());
        QTRY_COMPARE_WITH_TIMEOUT(completed.size(), 1, 30000);
        const auto changed = completed[0][1].toMap();
        QVERIFY2(changed.value("ok").toBool(), qPrintable(changed.value("error").toString()));
        QCOMPARE(model.undoStack()->count(), 2);
        QVERIFY(doc() != loaded);
        model.undoStack()->undo();
        QCOMPARE(doc(), loaded);
        completed.clear();
        QVERIFY(commands->execute("ui_timeline_load_plugin", args, "stale-plugin-load").value("deferred").toBool());
        QVERIFY(run("setTrackName", {{"track_id", TRACK_A}, {"name", "Changed during plugin RPC"}}).value("ok").toBool());
        const auto edited = doc();
        QTRY_COMPARE_WITH_TIMEOUT(completed.size(), 1, 30000);
        QVERIFY(!completed[0][1].toMap().value("ok").toBool());
        QVERIFY(completed[0][1].toMap().value("error").toString().contains("changed"));
        QCOMPARE(doc(), edited);
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
    void samplerUpdateZoneClearsLoopModeOverride() {
        static const QString TRACK_MIDI = "33333333333300000000000000000003";
        const auto text = QStringLiteral(R"({"id":"%1","name":"Sampler","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"%2","name":"Sampler","type":"midi","index":0,"heightPx":80,"visible":true,"locked":false,
            "instrument":{"type":"sampler","oneShot":true,"attackMs":2,"decayMs":100,"sustain":1,"releaseMs":120,"gainDb":-6,
              "zones":[{"id":"z1","name":"Zone 1","assetId":"","mediaPath":"samples/a.wav","rootNote":60,"lowNote":0,"highNote":127,"gainDb":0,"loopMode":"sustain"}]}}],
          "clips":[]})")
            .arg(TIMELINE, TRACK_MIDI);
        auto parsed = nt::parseTimelineJson(text.toUtf8());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCoreApplication::processEvents();

        const auto entry = commandEntry("sampler.updateZone");
        QVERIFY2(!entry.isEmpty(), "sampler.updateZone missing from allowed commands");
        const auto loopModeSchema =
            entry.value("parameters").toMap().value("properties").toMap().value("loopMode").toMap();
        QVERIFY2(loopModeSchema.value("enum").toStringList().contains("inherit"),
                 qPrintable(QStringLiteral("sampler.updateZone loopMode enum missing 'inherit': %1")
                                .arg(loopModeSchema.value("enum").toStringList().join(", "))));

        // Invalid choice must still be rejected by command validation.
        const auto bad = run("sampler.updateZone", {{"track_id", TRACK_MIDI}, {"zoneId", "z1"}, {"loopMode", "bogus"}});
        QVERIFY(!bad.value("ok").toBool());

        // Clearing via validated "inherit" choice must succeed and remove loopMode from the zone JSON.
        const auto cleared = run("sampler.updateZone", {{"track_id", TRACK_MIDI}, {"zoneId", "z1"}, {"loopMode", "inherit"}});
        QVERIFY2(cleared.value("ok").toBool(), qPrintable(cleared.value("error").toString()));
        QVERIFY(cleared.value("changed").toBool());
        auto zoneAfterClear = doc().value("tracks").toArray().at(0).toObject()
                                  .value("instrument").toObject()
                                  .value("zones").toArray().at(0).toObject();
        QVERIFY2(!zoneAfterClear.contains("loopMode"), "loopMode override was not cleared by sampler.updateZone");

        // Setting an explicit override and clearing it again works cleanly.
        const auto setOneShot = run("sampler.updateZone", {{"track_id", TRACK_MIDI}, {"zoneId", "z1"}, {"loopMode", "oneShot"}});
        QVERIFY2(setOneShot.value("ok").toBool(), qPrintable(setOneShot.value("error").toString()));
        auto zoneAfterSet = doc().value("tracks").toArray().at(0).toObject()
                                .value("instrument").toObject()
                                .value("zones").toArray().at(0).toObject();
        QCOMPARE(zoneAfterSet.value("loopMode").toString(), QStringLiteral("oneShot"));

        const auto clearedAgain = run("sampler.updateZone", {{"track_id", TRACK_MIDI}, {"zoneId", "z1"}, {"loopMode", "inherit"}});
        QVERIFY2(clearedAgain.value("ok").toBool(), qPrintable(clearedAgain.value("error").toString()));
        auto zoneAfterClear2 = doc().value("tracks").toArray().at(0).toObject()
                                   .value("instrument").toObject()
                                   .value("zones").toArray().at(0).toObject();
        QVERIFY(!zoneAfterClear2.contains("loopMode"));
    }

    // instrument.setBuiltin replaces a MIDI track's instrument, the same edit the instrument menu uses.
    void builtinInstrumentCommand() {
        static const QString TRACK_MIDI = "44444444444400000000000000000005";
        const auto text = QStringLiteral(R"({"id":"%1","name":"Inst","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"%2","name":"Keys","type":"midi","index":0,"heightPx":80,"visible":true,"locked":false,
            "instrument":{"type":"subtractive"}}],
          "clips":[]})")
            .arg(TIMELINE, TRACK_MIDI);
        auto parsed = nt::parseTimelineJson(text.toUtf8());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCoreApplication::processEvents();
        const auto entry = commandEntry("instrument.setBuiltin");
        QVERIFY2(!entry.isEmpty(), "instrument.setBuiltin missing from allowed commands");
        const auto types = entry.value("parameters").toMap().value("properties").toMap().value("type").toMap().value("enum").toStringList();
        QCOMPARE(types, QStringList({"drum", "bass", "wavetable", "sampler", "modal", "subtractive"}));
        const auto before = doc();
        const auto instrument = [this] { return doc().value("tracks").toArray().at(0).toObject().value("instrument").toObject(); };
        QVERIFY(!run("instrument.setBuiltin", {{"track_id", TRACK_MIDI}, {"type", "theremin"}}).value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), 0);
        auto res = run("instrument.setBuiltin", {{"track_id", TRACK_MIDI}, {"type", "drum"}, {"preset", "uzu"}});
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        QCOMPARE(instrument().value("type").toString(), QStringLiteral("drum"));
        QCOMPARE(instrument().value("kit").toString(), QStringLiteral("uzu"));
        res = run("instrument.setBuiltin", {{"track_id", TRACK_MIDI.left(12)}, {"type", "modal"}});
        QVERIFY2(res.value("ok").toBool(), qPrintable(res.value("error").toString()));
        QCOMPARE(instrument().value("type").toString(), QStringLiteral("modal"));
        QVERIFY(!instrument().value("preset").toString().isEmpty());
        QCOMPARE(model.undoStack()->count(), 2);
        model.undoStack()->undo();
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }

    // E2: wavetable.setPreset and wavetable.setParams dispatched through ui_timeline_run_command.
    void wavetableAssistantCommands() {
        static const QString TRACK_MIDI = "44444444444400000000000000000004";
        const auto text = QStringLiteral(R"({"id":"%1","name":"WT1","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"%2","name":"Lead","type":"midi","index":0,"heightPx":80,"visible":true,"locked":false,
            "instrument":{"type":"subtractive","waveform":"saw"}}],
          "clips":[]})")
            .arg(TIMELINE, TRACK_MIDI);
        auto parsed = nt::parseTimelineJson(text.toUtf8());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCoreApplication::processEvents();

        // Schema inspection: both commands are advertised with track_id required and valid preset choices.
        const auto presetEntry = commandEntry("wavetable.setPreset");
        const auto paramsEntry = commandEntry("wavetable.setParams");
        QVERIFY2(!presetEntry.isEmpty(), "wavetable.setPreset missing from allowed commands");
        QVERIFY2(!paramsEntry.isEmpty(), "wavetable.setParams missing from allowed commands");
        const auto presetReq = presetEntry.value("parameters").toMap().value("required").toStringList();
        const auto paramsReq = paramsEntry.value("parameters").toMap().value("required").toStringList();
        QVERIFY(presetReq.contains("track_id"));
        QVERIFY(presetReq.contains("preset"));
        QVERIFY(paramsReq.contains("track_id"));
        const auto presetChoices =
            presetEntry.value("parameters").toMap().value("properties").toMap().value("preset").toMap().value("enum").toStringList();
        QVERIFY(presetChoices.contains("wt1-init"));
        QVERIFY(presetChoices.contains("wt1-hyper-saw"));

        // Invalid preset choice is rejected by command validation with zero undo entries.
        const auto beforePreset = doc();
        const auto badPreset = run("wavetable.setPreset", {{"track_id", TRACK_MIDI}, {"preset", "not-a-preset"}});
        QVERIFY(!badPreset.value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(doc(), beforePreset);

        // Dispatch wavetable.setPreset through ui_timeline_run_command (with full track_id).
        const auto setPresetRes = run("wavetable.setPreset", {{"track_id", TRACK_MIDI}, {"preset", "wt1-hyper-saw"}});
        QVERIFY2(setPresetRes.value("ok").toBool(), qPrintable(setPresetRes.value("error").toString()));
        QVERIFY(setPresetRes.value("changed").toBool());
        QCOMPARE(setPresetRes.value("undo").toMap().value("added").toBool(), true);
        QCOMPARE(model.undoStack()->count(), 1);
        const auto instAfterPreset = doc().value("tracks").toArray().at(0).toObject().value("instrument").toObject();
        QCOMPARE(instAfterPreset.value("type").toString(), QStringLiteral("wavetable"));
        QCOMPARE(instAfterPreset.value("preset").toString(), QStringLiteral("wt1-hyper-saw"));
        QCOMPARE(instAfterPreset.value("oscA").toObject().value("unison").toInt(), 7);
        QCOMPARE(instAfterPreset.value("filterType").toString(), QStringLiteral("lp12"));
        QVERIFY(std::abs(instAfterPreset.value("cutoffHz").toDouble() - 12000.0) < 1e-3);

        // Undo restores the document byte-for-byte.
        model.undoStack()->undo();
        QCOMPARE(doc(), beforePreset);

        // Redo before testing wavetable.setParams.
        model.undoStack()->redo();
        QCOMPARE(doc().value("tracks").toArray().at(0).toObject().value("instrument").toObject().value("preset").toString(),
                 QStringLiteral("wt1-hyper-saw"));
        const auto beforeParams = doc();
        const int undoBeforeParams = model.undoStack()->count();

        // Invalid enum choice on wavetable.setParams is rejected without mutating or pushing undo.
        const auto badParam = run("wavetable.setParams", {{"track_id", TRACK_MIDI.left(12)}, {"filterType", "bogus"}});
        QVERIFY(!badParam.value("ok").toBool());
        QCOMPARE(model.undoStack()->count(), undoBeforeParams);
        QCOMPARE(doc(), beforeParams);

        // Dispatch wavetable.setParams through ui_timeline_run_command (using 12-char track_id prefix).
        const auto setParamsRes = run("wavetable.setParams", {
            {"track_id", TRACK_MIDI.left(12)},
            {"oscATable", "pulse"},
            {"oscAPosition", 0.35},
            {"oscAUnison", 5},
            {"oscADetune", 0.4},
            {"filterType", "hp24"},
            {"cutoffHz", 1250.0},
            {"resonance", 0.55},
            {"drive", 0.3},
            {"ampAttackMs", 45.0},
            {"ampReleaseMs", 600.0},
            {"lfoShape", "tri"},
            {"lfoToCutoff", 0.25},
            {"mono", true},
            {"glideMs", 120.0},
            {"masterVolume", 0.85},
        });
        QVERIFY2(setParamsRes.value("ok").toBool(), qPrintable(setParamsRes.value("error").toString()));
        QVERIFY(setParamsRes.value("changed").toBool());
        QCOMPARE(setParamsRes.value("undo").toMap().value("added").toBool(), true);
        QCOMPARE(model.undoStack()->count(), undoBeforeParams + 1);

        const auto instAfterParams = doc().value("tracks").toArray().at(0).toObject().value("instrument").toObject();
        const auto oscAAfter = instAfterParams.value("oscA").toObject();
        const auto ampEnvAfter = instAfterParams.value("ampEnv").toObject();
        const auto lfoAfter = instAfterParams.value("lfo").toObject();
        QCOMPARE(instAfterParams.value("type").toString(), QStringLiteral("wavetable"));
        QVERIFY(!instAfterParams.contains("preset"));
        QCOMPARE(oscAAfter.value("table").toString(), QStringLiteral("pulse"));
        QVERIFY(std::abs(oscAAfter.value("position").toDouble() - 0.35) < 1e-4);
        QCOMPARE(oscAAfter.value("unison").toInt(), 5);
        QVERIFY(std::abs(oscAAfter.value("detune").toDouble() - 0.4) < 1e-4);
        QCOMPARE(instAfterParams.value("filterType").toString(), QStringLiteral("hp24"));
        QCOMPARE(instAfterParams.value("filterOn").toBool(), true);
        QVERIFY(std::abs(instAfterParams.value("cutoffHz").toDouble() - 1250.0) < 1e-3);
        QVERIFY(std::abs(instAfterParams.value("resonance").toDouble() - 0.55) < 1e-4);
        QVERIFY(std::abs(instAfterParams.value("drive").toDouble() - 0.3) < 1e-4);
        QVERIFY(std::abs(ampEnvAfter.value("attackMs").toDouble() - 45.0) < 1e-3);
        QVERIFY(std::abs(ampEnvAfter.value("releaseMs").toDouble() - 600.0) < 1e-3);
        QCOMPARE(lfoAfter.value("shape").toString(), QStringLiteral("tri"));
        QVERIFY(std::abs(lfoAfter.value("toCutoff").toDouble() - 0.25) < 1e-4);
        QCOMPARE(instAfterParams.value("mono").toBool(), true);
        QVERIFY(std::abs(instAfterParams.value("glideMs").toDouble() - 120.0) < 1e-3);
        QVERIFY(std::abs(instAfterParams.value("masterVolume").toDouble() - 0.85) < 1e-4);

        // Exact undo restoration for wavetable.setParams and wavetable.setPreset.
        model.undoStack()->undo();
        QCOMPARE(doc(), beforeParams);
        model.undoStack()->undo();
        QCOMPARE(doc(), beforePreset);
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
