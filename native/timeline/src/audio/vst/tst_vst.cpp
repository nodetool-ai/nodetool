// End-to-end tests for VST3 instrument and audio effect hosting in native/timeline:
// edits (setTrackInstrument, setTrackInstrumentState, VST track/master effects),
// NodeToolVstHost scanning of both instruments and effects, offline rendering of
// MIDI clips through ToneInstrument.vst3, and offline processing of audio tracks
// and master bus through GainEffect.vst3 (with bypass, wet/dry, and built-in chaining).
#include "../../../tests/RequireValue.h"
#include "audio/AudioEngine.h"
#include "audio/vst/VstAudioStages.h"
#include "audio/vst/VstEdits.h"
#include "audio/vst/VstHostClient.h"
#include "audio/vst/VstHostModel.h"
#include "audio/vst/PluginAssistant.h"
#include "audio/vst/VstLiveChannel.h"
#include "midi/PatternExpand.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"

#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QtTest>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <thread>
#include <map>
#include <vector>

using namespace nt::audio::vst;

namespace {

double rmsInterleaved(const std::vector<float>& pcm, std::size_t fromFrame, std::size_t toFrame) {
    const std::size_t frames = pcm.size() / 2;
    fromFrame = std::min(fromFrame, frames);
    toFrame = std::min(toFrame, frames);
    if (toFrame <= fromFrame) return 0.0;
    double sum = 0.0;
    for (std::size_t i = fromFrame; i < toFrame; ++i) {
        const double l = pcm[i * 2];
        const double r = pcm[i * 2 + 1];
        sum += l * l + r * r;
    }
    return std::sqrt(sum / static_cast<double>((toFrame - fromFrame) * 2));
}

QString findTestArtifact(const QString& relPath) {
    const QString path = QDir(QStringLiteral(NT_VST_HOST_BUILD_DIR)).filePath(relPath);
    return QFileInfo::exists(path) ? QFileInfo(path).canonicalFilePath() : QString();
}

nt::Timeline parseRaw(const QJsonObject& raw) {
    auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson(QJsonDocument::Compact));
    Q_ASSERT(parsed.timeline);
    return requireValue(std::move(parsed.timeline));
}

QJsonObject midiNote(const QString& id, int pitch, int startTick, int durationTick, const QJsonObject& extra = {}) {
    QJsonObject n{{"id", id}, {"pitch", pitch}, {"velocity", 100}, {"startTick", startTick}, {"durationTick", durationTick}};
    for (auto it = extra.begin(); it != extra.end(); ++it) n.insert(it.key(), it.value());
    return n;
}

QJsonObject ctrlPoint(int tick, int value) { return QJsonObject{{"id", QString::number(tick)}, {"tick", tick}, {"value", value}}; }

QJsonObject ctrlLane(const QString& kind, const QJsonArray& points, const QJsonObject& extra = {}) {
    QJsonObject lane{{"id", "lane-" + kind}, {"kind", kind}, {"points", points}};
    for (auto it = extra.begin(); it != extra.end(); ++it) lane.insert(it.key(), it.value());
    return lane;
}

// One midi track "m1" at 120 BPM (960 ticks = 500 ms) with one clip.
MidiTrackStream midiStream(const QJsonArray& notes, const QJsonArray& controllers, double startMs = 0.0,
                           double inPointMs = 0.0, double durationMs = 4000.0) {
    const QJsonObject raw{
        {"id", "tl"}, {"name", "T"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 8000},
        {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
        {"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"name", "K"}, {"type", "midi"}, {"index", 0}}}},
        {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "m1"}, {"name", "P"}, {"startMs", startMs},
                                         {"durationMs", durationMs}, {"inPointMs", inPointMs},
                                         {"outPointMs", inPointMs + durationMs}, {"mediaType", "midi"},
                                         {"sourceType", "generated"}, {"status", "ready"}, {"locked", false},
                                         {"notes", notes}, {"controllers", controllers}}}}};
    return buildTrackMidiStream(parseRaw(raw), "m1", 120.0);
}

std::vector<MidiStreamEvent> eventsWithStatus(const MidiTrackStream& stream, int statusKind) {
    std::vector<MidiStreamEvent> out;
    for (const auto& e : stream.events) {
        const bool match = statusKind == 0xF4 ? e.status == 0xF4 : (e.status & 0xF0) == statusKind;
        if (match) out.push_back(e);
    }
    return out;
}

}  // namespace

class TestVst final : public QObject {
    Q_OBJECT
private slots:
    void editorStateDoesNotRestoreOlderSnapshot() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QFile helper(dir.filePath("host"));
        QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys
for line in sys.stdin:
    req = json.loads(line)
    if req['cmd'] == 'quit': break
    with open(__file__ + '.requests', 'a') as log: log.write(req['cmd'] + '\n')
    if req['cmd'] == 'setState':
        with open(__file__ + '.state', 'w') as log: log.write(req['state'])
        print(json.dumps(dict(event='state', instance=req['instance'], state='stale-from-pipe', generation=req['generation'] - 1)), flush=True)
        print(json.dumps(dict(event='editorClosed', instance=req['instance'], state='stale-close-from-pipe', generation=req['generation'] - 1)), flush=True)
    print(json.dumps(dict(id=req['id'], ok=True)), flush=True)
)PY");
        helper.close();
        QVERIFY(helper.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));
        auto client = sharedVstHostClient();
        client->setOverrideExecutable(helper.fileName());
        TimelineModel timeline;
        timeline.setTimeline(parseRaw({{"id", "tl"}, {"name", "T"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
            {"durationMs", 4000}, {"clips", QJsonArray{}}, {"tracks", QJsonArray{QJsonObject{
                {"id", "m1"}, {"name", "Synth"}, {"type", "midi"}, {"index", 0},
                {"instrument", QJsonObject{{"type", "vst"}, {"plugin", QJsonObject{{"uid", "tone"}, {"path", "/tone.vst3"}}},
                                           {"state", "before"}}}}}}}));
        VstHostModel host;
        host.followTimeline(&timeline);
        connect(&host, &VstHostModel::pluginStateChanged, &timeline, [&timeline](const QString&, const QString& state) {
            timeline.applyEdit("setTrackInstrumentState", {{"trackId", "m1"}, {"state", state}});
        });
        connect(&host, &VstHostModel::pluginEditorClosed, &timeline, [&timeline](const QString&, const QString& state) {
            timeline.applyEdit("setTrackInstrumentState", {{"trackId", "m1"}, {"state", state}});
        });
        QSignalSpy restored(client.get(), &VstHostClient::stateRestored);
        emit client->pluginStateChanged("inst:m1", "edit-one");
        emit client->pluginStateChanged("inst:m1", "edit-two");
        QCOMPARE(timeline.timeline().raw.value("tracks").toArray()[0].toObject().value("instrument").toObject().value("state").toString(),
                 QStringLiteral("edit-two"));
        QTest::qWait(200);
        QCOMPARE(restored.count(), 0);
        QVERIFY(!QFileInfo::exists(helper.fileName() + ".requests"));
        timeline.undoStack()->undo();
        emit client->pluginStateChanged("inst:m1", "edit-during-restore");
        QCOMPARE(timeline.timeline().raw.value("tracks").toArray()[0].toObject().value("instrument").toObject().value("state").toString(),
                 QStringLiteral("edit-one"));
        QVERIFY(timeline.undoStack()->canRedo());
        QTRY_COMPARE(restored.count(), 1);
        // Delayed events remain stale even after the restoration reply.
        emit client->pluginStateChanged("inst:m1", "late-state", 0);
        emit client->pluginEditorClosed("inst:m1", "late-close", 0);
        QVERIFY(timeline.undoStack()->canRedo());
        timeline.undoStack()->redo();
        emit client->pluginStateChanged("inst:m1", "late-undo", 1);
        QTRY_COMPARE(restored.count(), 2);
        QCOMPARE(timeline.timeline().raw.value("tracks").toArray()[0].toObject().value("instrument").toObject().value("state").toString(),
                 QStringLiteral("edit-two"));
        QFile helperState(helper.fileName() + ".state");
        QVERIFY(helperState.open(QIODevice::ReadOnly));
        QCOMPARE(helperState.readAll(), QByteArray("edit-two"));
        emit client->pluginStateChanged("inst:m1", "fresh-edit", 2);
        QCOMPARE(timeline.timeline().raw.value("tracks").toArray()[0].toObject().value("instrument").toObject().value("state").toString(),
                 QStringLiteral("fresh-edit"));
        QTest::qWait(100);
        QCOMPARE(restored.count(), 2);
        client->setOverrideExecutable({});
    }

    void documentHistoryRestoresHelperState_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<int>("backgroundTracks");
        QTest::newRow("instrument") << QStringLiteral("instrument") << 0;
        QTest::newRow("track-effect") << QStringLiteral("track-effect") << 0;
        QTest::newRow("master-effect") << QStringLiteral("master-effect") << 0;
        QTest::newRow("large-document") << QStringLiteral("instrument") << 3000;
    }
    void documentHistoryRestoresHelperState() {
        QFETCH(QString, kind);
        QFETCH(int, backgroundTracks);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QFile helper(dir.filePath("host"));
        QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys
for line in sys.stdin:
    req = json.loads(line)
    if req['cmd'] == 'quit': break
    if req['cmd'] == 'setState':
        with open(__file__ + '.states', 'a') as log: log.write(json.dumps(req) + '\n')
    print(json.dumps(dict(id=req['id'], ok=True)), flush=True)
)PY");
        helper.close();
        QVERIFY(helper.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));
        auto client = sharedVstHostClient();
        client->setOverrideExecutable(helper.fileName());
        const QJsonObject plugin{{"uid", "tone"}, {"path", "/tone.vst3"}};
        const QJsonObject instrument{{"type", "vst"}, {"plugin", plugin}, {"state", "before"}};
        QJsonObject raw{{"id", "tl"}, {"name", "T"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                        {"durationMs", 4000}, {"clips", QJsonArray{}},
                        {"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"name", "Synth"}, {"type", "midi"},
                                                        {"index", 0}, {"instrument", instrument}}}}};
        if (kind != "instrument") {
            auto effect = instrument;
            effect.insert("id", "fx1");
            effect.insert("enabled", true);
            effect.insert("wet", 1.0);
            if (kind == "master-effect") {
                raw.insert("master", QJsonObject{{"volumeDb", 0}, {"effects", QJsonArray{effect}}});
            } else {
                auto tracks = raw.value("tracks").toArray();
                auto track = tracks[0].toObject();
                track.remove("instrument");
                track.insert("effects", QJsonArray{effect});
                tracks[0] = track;
                raw.insert("tracks", tracks);
            }
        }
        auto tracks = raw.value("tracks").toArray();
        for (int i = 0; i < backgroundTracks; ++i) {
            tracks.append(QJsonObject{{"id", "background-" + QString::number(i)}, {"name", "Synth"},
                                      {"type", "midi"}, {"index", i + 1}, {"instrument", instrument}});
        }
        raw.insert("tracks", tracks);
        TimelineModel timeline;
        timeline.setTimeline(parseRaw(raw));
        VstHostModel host;
        QSignalSpy editorChanges(&host, &VstHostModel::pluginStateChanged);
        QSignalSpy restored(client.get(), &VstHostClient::stateRestored);
        host.followTimeline(&timeline);
        const auto editEffect = [&](const QJsonObject& patch) {
            return timeline.applyEdit("Plugin edit", patch, [kind](QJsonObject document, const QJsonObject& fields) {
                auto tracks = document.value("tracks").toArray();
                auto track = kind == "master-effect" ? document.value("master").toObject() : tracks[0].toObject();
                auto effects = track.value("effects").toArray();
                auto effect = effects[0].toObject();
                for (auto field = fields.begin(); field != fields.end(); ++field) { effect.insert(field.key(), field.value()); }
                effects[0] = effect;
                track.insert("effects", effects);
                if (kind == "master-effect") {
                    document.insert("master", track);
                } else {
                    tracks[0] = track;
                    document.insert("tracks", tracks);
                }
                return document;
            });
        };
        const auto editState = [&](const QJsonValue& state) {
            return kind == "instrument"
                ? timeline.applyEdit("setTrackInstrumentState", {{"trackId", "m1"}, {"state", state}})
                : editEffect({{"state", state}});
        };
        QVERIFY(editState("after"));
        timeline.undoStack()->undo();
        timeline.undoStack()->redo();
        QVERIFY(editState(QJsonValue::Null));
        timeline.undoStack()->undo();
        const auto states = [&] {
            QFile log(helper.fileName() + ".states");
            QJsonArray results;
            if (log.open(QIODevice::ReadOnly)) {
                for (const auto& line : log.readAll().split('\n')) {
                    if (!line.isEmpty()) results.append(QJsonDocument::fromJson(line).object().value("state"));
                }
            }
            return results;
        };
        QTRY_COMPARE(states(), (QJsonArray{"after", "before", "after", QJsonValue::Null, "after"}));
        const QJsonObject replacementPlugin{{"uid", "other"}, {"path", "/other.vst3"}};
        auto replacement = instrument;
        replacement.insert("plugin", replacementPlugin);
        replacement.insert("state", "loaded");
        QVERIFY(kind == "instrument"
            ? timeline.applyEdit("setTrackInstrument", {{"trackId", "m1"}, {"instrument", replacement}})
            : editEffect({{"plugin", replacementPlugin}, {"state", "loaded"}}));
        timeline.undoStack()->undo();
        timeline.undoStack()->redo();
        QTRY_COMPARE(states(), (QJsonArray{"after", "before", "after", QJsonValue::Null, "after", "loaded", "after", "loaded"}));
        QFile log(helper.fileName() + ".states");
        QVERIFY(log.open(QIODevice::ReadOnly));
        const QString expectedInstance = kind == "instrument" ? "inst:m1" : kind == "master-effect" ? "master-fx:fx1" : "fx:m1:fx1";
        QJsonArray paths;
        for (const auto& line : log.readAll().split('\n')) {
            if (line.isEmpty()) continue;
            const auto request = QJsonDocument::fromJson(line).object();
            QCOMPARE(request.value("instance").toString(), expectedInstance);
            paths.append(request.value("path"));
        }
        QTRY_COMPARE(restored.count(), 8);
        QCOMPARE(editorChanges.count(), 0);
        QCOMPARE(paths, (QJsonArray{"/tone.vst3", "/tone.vst3", "/tone.vst3", "/tone.vst3", "/tone.vst3",
                                   "/other.vst3", "/tone.vst3", "/other.vst3"}));
        client->setOverrideExecutable({});
    }

    void pluginAssistantCancellation_data() {
        QTest::addColumn<QString>("operation");
        for (const auto *op : {"list_plugins", "list_plugin_presets", "select_plugin_preset", "get_plugin_parameters", "set_plugin_parameters"}) {
            QTest::newRow(op) << QString::fromLatin1(op);
        }
    }
    void pluginAssistantCancellation() {
        QFETCH(QString, operation);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QFile helper(dir.filePath("host"));
        QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys, time
operation = ')PY" + operation.toUtf8() + R"PY('
for line in sys.stdin:
    req = json.loads(line)
    if req['cmd'] == 'quit': break
    if req['cmd'] == 'dispose':
        print(json.dumps(dict(id=req['id'], ok=True)), flush=True)
        continue
    if operation == 'set_plugin_parameters' and req['cmd'] == 'getParameters':
        print(json.dumps(dict(id=req['id'], ok=True, parameters=[dict(id='level', index=0, name='Level')])), flush=True)
        continue
    with open(__file__ + '.instances', 'a') as log: log.write(req.get('instance', '') + '\n')
    open(__file__ + '.started', 'w').close()
    time.sleep(1)
    open(__file__ + '.executed', 'w').close()
    print(json.dumps(dict(id=req['id'], ok=True)), flush=True)
)PY");
        helper.close();
        QVERIFY(helper.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));
        VstHostClient client;
        client.setOverrideExecutable(helper.fileName());
        const QJsonObject slot{{"type", "vst"}, {"plugin", QJsonObject{{"path", "/test.vst3"}}}, {"state", "saved"}};
        const QJsonObject document{{"tracks", QJsonArray{QJsonObject{{"id", "track"}, {"type", "midi"}, {"instrument", slot}}}}};
        PluginToolResult outcome;
        const auto epoch = client.hostEpoch();
        QSignalSpy exited(&client, &VstHostClient::hostExited);
        std::stop_source cancellation;
        std::jthread worker([&] {
            outcome = runPluginTool(operation, {{"track", "track"}, {"preset", 0}, {"parameter", "Level"}, {"value", 0.5}}, document, client, cancellation.get_token());
        });
        QTRY_VERIFY(QFileInfo::exists(helper.fileName() + ".started"));
        QElapsedTimer elapsed;
        elapsed.start();
        cancellation.request_stop();
        worker.join();
        QVERIFY(elapsed.elapsed() < 300);
        QVERIFY(!outcome.result.value("ok").toBool());
        QVERIFY(outcome.result.value("error").toString().contains("cancelled"));
        QCOMPARE(outcome.document, document);
        QTest::qWait(1200);
        QCOMPARE(client.hostEpoch(), epoch);
        QCOMPARE(exited.count(), 0);
        QFile instances(helper.fileName() + ".instances");
        QVERIFY(instances.open(QIODevice::ReadOnly));
        const auto instanceLog = instances.readAll();
        QVERIFY(!instanceLog.contains("inst:track"));
        if (operation != "list_plugins") { QVERIFY(instanceLog.startsWith("request:")); }
        QVERIFY2(QFileInfo::exists(helper.fileName() + ".executed"), "abandoned RPC may finish without killing the shared helper");
    }

    void pluginAssistantPreservesUnavailableState_data() {
        QTest::addColumn<QString>("operation");
        QTest::addColumn<QString>("replyState");
        for (const auto &op : {QStringLiteral("select_plugin_preset"), QStringLiteral("set_plugin_parameters")}) {
            for (const auto &state : {QStringLiteral(""), QStringLiteral("null"), QStringLiteral("missing")}) {
                QTest::newRow(qPrintable(op + state)) << op << state;
            }
        }
    }
    void pluginAssistantPreservesUnavailableState() {
        QFETCH(QString, operation);
        QFETCH(QString, replyState);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QFile helper(dir.filePath("host"));
        QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys
for line in sys.stdin:
    req = json.loads(line)
    if req['cmd'] == 'quit': break
    res = dict(id=req['id'], ok=True, parameters=[dict(id='level', index=0, name='Level')])
    mode = ')PY" + replyState.toUtf8() + R"PY('
    if mode != 'missing': res['state'] = None if mode == 'null' else ''
    print(json.dumps(res), flush=True)
)PY");
        helper.close();
        QVERIFY(helper.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));
        VstHostClient client;
        client.setOverrideExecutable(helper.fileName());
        const QJsonObject slot{{"type", "vst"}, {"plugin", QJsonObject{{"path", "/test.vst3"}}}, {"state", "saved-patch"}};
        const QJsonObject document{{"tracks", QJsonArray{QJsonObject{{"id", "track"}, {"type", "midi"}, {"instrument", slot}}}}};
        PluginToolResult outcome;
        std::jthread worker([&] {
            outcome = runPluginTool(operation, {{"track", "track"}, {"preset", 0}, {"parameter", "Level"}, {"value", 0.5}}, document, client);
        });
        worker.join();
        QVERIFY2(outcome.result.value("ok").toBool(), qPrintable(outcome.result.value("error").toString()));
        QCOMPARE(outcome.document, document);
        QVERIFY(!outcome.result.value("stateUpdated").toBool());
    }

    void pluginAssistantEffectLimit() {
        const QString host = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gain = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        QVERIFY(!host.isEmpty());
        VstHostClient client;
        client.setOverrideExecutable(host);
        client.setExtraScanDirs({QFileInfo(gain).absolutePath()});
        QJsonArray effects;
        for (int i = 0; i < 32; ++i) {
            effects.append(QJsonObject{{"id", QString::number(i)}, {"type", "gain"}});
        }
        for (const auto &target : {QStringLiteral("track"), QStringLiteral("master")}) {
            const QJsonObject document{{"tracks", QJsonArray{QJsonObject{{"id", "track"}, {"type", "audio"}, {"effects", effects}}}},
                                       {"master", QJsonObject{{"effects", effects}}}};
            PluginToolResult outcome;
            std::jthread worker([&] {
                outcome = runPluginTool("load_plugin", {{"track", target}, {"plugin", "NodeTool Test Gain"}}, document, client);
            });
            worker.join();
            QVERIFY2(!outcome.result.value("ok").toBool(), "33rd effect must be rejected");
            QVERIFY(outcome.result.value("error").toString().contains("32"));
            QCOMPARE(outcome.document, document);
            std::jthread replacement([&] {
                outcome = runPluginTool("load_plugin", {{"track", target}, {"plugin", "NodeTool Test Gain"}, {"effectId", "0"}}, document, client);
            });
            replacement.join();
            QVERIFY2(outcome.result.value("ok").toBool(), qPrintable(outcome.result.value("error").toString()));
            const auto changedTrack = target == u"master" ? outcome.document.value("master").toObject()
                : outcome.document.value("tracks").toArray()[0].toObject();
            QCOMPARE(changedTrack.value("effects").toArray().size(), 32);
            QCOMPARE(changedTrack.value("effects").toArray()[0].toObject().value("id").toString(), QStringLiteral("0"));
        }
    }

    void pluginAssistantRoundTrip() {
        const QString host = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString tone = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        const QString gain = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        QVERIFY(!host.isEmpty());
        QVERIFY(!tone.isEmpty());
        QVERIFY(!gain.isEmpty());
        VstHostClient client;
        client.setOverrideExecutable(host);
        client.setExtraScanDirs({QFileInfo(tone).absolutePath(), QFileInfo(gain).absolutePath()});
        QJsonObject document{{"tracks", QJsonArray{QJsonObject{{"id", "aaaaaaaaaaaa00000000000000000001"}, {"name", "Keys"}, {"type", "midi"}}}}};
        const auto run = [&](const QString& op, QJsonObject args) {
            PluginToolResult outcome;
            std::jthread worker([&] { outcome = runPluginTool("ui_timeline_" + op, args, document, client); });
            worker.join();
            return outcome;
        };
        const auto listed = run("list_plugins", {{"query", "NodeTool Test"}});
        QVERIFY2(listed.result.value("ok").toBool(), qPrintable(listed.result.value("error").toString()));
        QVERIFY(listed.result.value("plugins").toArray().size() >= 2);
        const auto loaded = run("load_plugin", {{"track", "aaaaaaaaaaaa"}, {"plugin", "NodeTool Test Tone"}});
        QVERIFY2(loaded.result.value("ok").toBool(), qPrintable(loaded.result.value("error").toString()));
        document = loaded.document;
        QCOMPARE(loaded.result.value("plugin").toObject().value("format").toString(), QStringLiteral("vst3"));
        auto presets = run("list_plugin_presets", {{"track", "Keys"}});
        QVERIFY(presets.result.value("ok").toBool());
        QVERIFY(presets.result.value("presets").isArray());
        auto selected = run("select_plugin_preset", {{"track", "Keys"}, {"preset", 0}});
        QVERIFY2(selected.result.value("ok").toBool(), qPrintable(selected.result.value("error").toString()));
        document = selected.document;
        auto parameters = run("get_plugin_parameters", {{"track", "Keys"}, {"parameters", QJsonArray{"Level"}}});
        QVERIFY(parameters.result.value("ok").toBool());
        QCOMPARE(parameters.result.value("parameters").toArray().size(), 1);
        const auto changed = run("set_plugin_parameters", {{"track", "Keys"}, {"parameter", "Level"}, {"value", 0.8}});
        QVERIFY2(changed.result.value("ok").toBool(), qPrintable(changed.result.value("error").toString()));
        document = changed.document;
        QVERIFY(changed.result.value("stateUpdated").toBool());
        parameters = run("get_plugin_parameters", {{"track", "Keys"}, {"parameters", QJsonArray{"Level"}}});
        QVERIFY(std::abs(parameters.result.value("parameters").toArray()[0].toObject().value("value").toDouble() - 0.8) < 0.001);
        const auto bad = run("set_plugin_parameters", {{"track", "Keys"}, {"parameter", "Level"}, {"value", 2}});
        QVERIFY(!bad.result.value("ok").toBool());
        QCOMPARE(bad.document, document);
        const auto effect = run("load_plugin", {{"track", "master"}, {"plugin", "NodeTool Test Gain"}});
        QVERIFY2(effect.result.value("ok").toBool(), qPrintable(effect.result.value("error").toString()));
        document = effect.document;
        QCOMPARE(document.value("master").toObject().value("volumeDb").toDouble(-1), 0.0);
        QCOMPARE(effect.result.value("effectId").toString().size(), 32);
        const auto effectParams = run("get_plugin_parameters", {{"track", "master"}, {"effectId", effect.result.value("effectId").toString().left(12)}});
        QVERIFY2(effectParams.result.value("ok").toBool(), qPrintable(effectParams.result.value("error").toString()));
        auto tracks = document.value("tracks").toArray();
        tracks.append(QJsonObject{{"id", "aaaaaaaaaaaa00000000000000000002"}, {"name", "Keys 2"}, {"type", "midi"}});
        document.insert("tracks", tracks);
        QVERIFY(!run("get_plugin_parameters", {{"track", "aaaaaaaaaaaa"}}).result.value("ok").toBool());
        auto locked = tracks[0].toObject(); locked.insert("locked", true); tracks[0] = locked; document.insert("tracks", tracks);
        QVERIFY(!run("set_plugin_parameters", {{"track", "Keys"}, {"parameter", "Level"}, {"value", 0.2}}).result.value("ok").toBool());
    }

    void musicLoopCutsAndRepeatsMidiSourceWindow_data() {
        QTest::addColumn<bool>("offline");
        QTest::newRow("offline") << true;
        QTest::newRow("live") << false;
    }
    void musicLoopCutsAndRepeatsMidiSourceWindow() {
        QFETCH(bool, offline);
        const QJsonObject clip{{"id", "loop"}, {"trackId", "m"}, {"mediaType", "midi"},
            {"startMs", 0}, {"durationMs", 6000}, {"inPointMs", 0}, {"outPointMs", 2000}, {"loopLengthMs", 2000},
            {"notes", QJsonArray{midiNote("long", 60, 0, 5000), midiNote("hidden", 61, 4000, 200)}},
            {"controllers", QJsonArray{QJsonObject{{"id", "sustain"}, {"kind", "cc"}, {"cc", 64}, {"interpolation", "step"},
                {"points", QJsonArray{QJsonObject{{"id", "on"}, {"tick", 0}, {"value", 127}}}}}}}};
        if (offline) {
            const auto events = nt::audio::vst::extractMidiNoteEvents(clip, 120, 48000, 0, 6000);
            QCOMPARE(events.size(), size_t(3));
            for (size_t i = 0; i < events.size(); ++i) {
                QCOMPARE(events[i].pitch, 60);
                QCOMPARE(events[i].startFrame, static_cast<qint64>(i * 96000));
                QCOMPARE(events[i].gateOffFrame, static_cast<qint64>((i + 1) * 96000));
            }
            return;
        }
        const QJsonObject raw{{"name", "Loop"}, {"fps", 30}, {"width", 640}, {"height", 360},
            {"tracks", QJsonArray{QJsonObject{{"id", "m"}, {"type", "midi"}}}}, {"clips", QJsonArray{clip}}};
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        const auto stream = nt::audio::vst::buildTrackMidiStream(requireValue(parsed.timeline), "m", 120);
        std::vector<double> ons;
        std::vector<double> offs;
        std::vector<double> resets;
        for (const auto& event : stream.events) {
            if ((event.status & 0xf0) == 0x90) { QCOMPARE(event.data1, quint8(60)); ons.push_back(event.timeMs); }
            if ((event.status & 0xf0) == 0x80) { offs.push_back(event.timeMs); }
            if ((event.status & 0xf0) == 0xb0 && event.data1 == 64 && event.data2 == 0 && event.clipEndReset) { resets.push_back(event.timeMs); }
        }
        QCOMPARE(ons, (std::vector<double>{0, 2000, 4000}));
        QCOMPARE(offs, (std::vector<double>{2000, 4000, 6000}));
        QCOMPARE(resets, (std::vector<double>{2000, 4000, 6000}));
    }

    void reviewF3F24AudibleDeviceAutomation_data() {
        QTest::addColumn<QString>("type"); QTest::addColumn<QString>("param");
        QTest::addColumn<double>("base"); QTest::addColumn<double>("automated");
        QTest::addColumn<bool>("defaultInstrument");
        QTest::newRow("F3-instrument") << QString("instrument") << QString("cutoffHz") << 18000.0 << 80.0 << false;
        QTest::newRow("F3-instrument-alias") << QString("instrument") << QString("filter.cutoff") << 18000.0 << 80.0 << false;
        QTest::newRow("F24-filter") << QString("filter") << QString("frequency") << 18000.0 << 80.0 << false;
        QTest::newRow("F24-eq3") << QString("eq3") << QString("midGainDb") << 0.0 << -18.0 << false;
        QTest::newRow("F24-compressor") << QString("compressor") << QString("ratio") << 1.0 << 20.0 << false;
        QTest::newRow("F3-default-instrument") << QString("instrument") << QString("cutoffHz") << 4000.0 << 80.0 << true;
    }
    void reviewF3F24AudibleDeviceAutomation() {
        QFETCH(QString, type); QFETCH(QString, param); QFETCH(double, base); QFETCH(double, automated); QFETCH(bool, defaultInstrument);
        const auto render = [&](bool patternEnabled, double fixed, double clipDb = 0.0) {
            const auto device = type == "instrument" ? QString("instrument") : QString("fx");
            const auto pattern = nt::midi::normalizePattern({{"lengthSteps", 1}, {"rows", QJsonArray{
                QJsonObject{{"id", "note"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 69}}},
                    {"steps", QJsonArray{QJsonObject{{"on", true}, {"gate", 100}}}}},
                QJsonObject{{"id", "auto"}, {"mute", !patternEnabled},
                    {"assignment", QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "device"}, {"deviceId", device}, {"param", param}}}}},
                    {"steps", QJsonArray{QJsonObject{{"on", true}, {"value", automated}}}}}}}});
            QJsonObject instrument{{"type", "subtractive"}, {"waveform", "saw"}, {"attackMs", 0},
                {"decayMs", 0}, {"sustain", 1}, {"releaseMs", 0}, {"resonance", 0.707},
                {"cutoffHz", type == "instrument" ? fixed : 18000.0}, {"gainDb", 0}};
            if (defaultInstrument) {
                instrument.insert("attackMs", 5); instrument.insert("decayMs", 120); instrument.insert("sustain", 0.7);
                instrument.insert("releaseMs", 150); instrument.insert("gainDb", -6);
            }
            QJsonObject effect{{"id", "fx"}, {"type", type}, {"enabled", true}, {param, fixed},
                {"thresholdDb", -35}, {"kneeDb", 0}, {"attackMs", 1}, {"releaseMs", 10}, {"midFreq", 440}, {"midQ", 0.7}};
            QJsonObject track{{"id", "m1"}, {"type", "midi"}, {"instrument", instrument},
                {"effects", type == "instrument" ? QJsonArray{} : QJsonArray{effect}}};
            if (defaultInstrument && patternEnabled) { track.remove("instrument"); }
            const QJsonObject raw{{"tracks", QJsonArray{track}},
                {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "m1"}, {"mediaType", "midi"},
                    {"startMs", 0}, {"durationMs", 1000}, {"volumeDb", clipDb}, {"pattern", pattern}}}}};
            const auto timeline = parseRaw(raw);
            auto plan = nt::audio::buildMixPlan(timeline);
            nt::audio::prepareMixPlan(plan, 48000);
            std::vector<float> pcm(std::size_t{48000} * 2);
            for (int frame = 0; frame < 48000; frame += 128) {
                const int count = std::min(128, 48000 - frame);
                nt::audio::MixStats stats{};
                nt::audio::mixBlock(plan, nullptr, 48000, frame * 1000.0/48000, 1000.0/48000,
                    count, pcm.data() + static_cast<std::ptrdiff_t>(frame) * 2, stats);
            }
            return rmsInterleaved(pcm, 2400, 48000);
        };
        const double dry = render(false, base);
        const double reference = render(false, automated);
        const double actual = render(true, base);
        QVERIFY2(dry > 1e-4, "Production instrument must produce audio");
        const double quieter = render(false, base, -6.0);
        QVERIFY(std::abs(quieter - dry * std::pow(10.0, -6.0 / 20.0)) < dry * 0.001);
        QVERIFY2(std::abs(reference - dry) > dry * 0.1, "Real DSP target must change audible output");
        QVERIFY2(std::abs(actual - reference) < dry * 0.03,
            qPrintable(QString("dry=%1 reference=%2 automated=%3").arg(dry).arg(reference).arg(actual)));
    }
    void reviewF3F24InstrumentSlideAndStoredLane() {
        const auto render = [](int mode) {
            const QJsonObject target{{"kind", "device"}, {"deviceId", "instrument"}, {"param", "filter.cutoff"}};
            QJsonArray clips{QJsonObject{{"id", "notes"}, {"trackId", "m1"}, {"mediaType", "midi"},
                {"startMs", 0}, {"durationMs", 2000}, {"notes", QJsonArray{midiNote("n", 69, 0, 3840)}}}};
            QJsonArray points{QJsonObject{{"timeMs", 0}, {"value", 500}}};
            if (mode == 1) {
                const auto pattern = nt::midi::normalizePattern({{"lengthSteps", 2}, {"stepRate", "1/4"}, {"automationMode", "slide"},
                    {"rows", QJsonArray{QJsonObject{{"id", "cutoff"}, {"assignment", QJsonObject{{"type", "automation"}, {"target", target}}},
                        {"steps", QJsonArray{QJsonObject{{"on", true}, {"value", 2000}}, QJsonObject{{"on", true}, {"value", 80}}}}}}}});
                clips.append(QJsonObject{{"id", "pattern"}, {"trackId", "m1"}, {"mediaType", "midi"},
                    {"startMs", 500}, {"durationMs", 1000}, {"pattern", pattern}});
            } else if (mode == 2) {
                // The contract's explicit linear cutoff ramp, through the stored-lane engine.
                points = QJsonArray{QJsonObject{{"timeMs", 500}, {"value", 2000}}, QJsonObject{{"timeMs", 1000}, {"value", 80}}};
            }
            const QJsonObject instrument{{"type", "subtractive"}, {"waveform", "saw"}, {"attackMs", 0}, {"decayMs", 0},
                {"sustain", 1}, {"releaseMs", 0}, {"cutoffHz", 500}, {"resonance", 0.707}, {"gainDb", 0}};
            const QJsonObject raw{{"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"type", "midi"}, {"instrument", instrument},
                {"automation", QJsonArray{QJsonObject{{"id", "stored"}, {"target", target}, {"points", points}}}}}}}, {"clips", clips}};
            auto plan = nt::audio::buildMixPlan(parseRaw(raw));
            nt::audio::prepareMixPlan(plan, 48000);
            std::vector<float> pcm(std::size_t{96000} * 2);
            for (int frame = 0; frame < 96000; frame += 128) {
                nt::audio::MixStats stats{};
                nt::audio::mixBlock(plan, nullptr, 48000, frame * 1000.0 / 48000, 1000.0 / 48000,
                    128, pcm.data() + static_cast<std::ptrdiff_t>(frame) * 2, stats);
            }
            return pcm;
        };
        const auto baseline = render(0), actual = render(1), stored = render(2);
        const double early = rmsInterleaved(actual, 28800, 33600);
        const double late = rmsInterleaved(actual, 52800, 67200);
        QVERIFY2(early > 1e-3 && late < early * 0.25, "Slide must audibly close the real instrument filter");
        double difference = 0;
        for (std::size_t frame = 28800; frame < 67200; ++frame) {
            difference = std::max(difference, std::abs(static_cast<double>(actual[frame * 2] - stored[frame * 2])));
        }
        QVERIFY2(difference < 0.005, qPrintable(QString::number(difference)));
        for (const auto& window : {std::pair{4800, 19200}, std::pair{81600, 91200}}) {
            const double expected = rmsInterleaved(baseline, window.first, window.second);
            QVERIFY(expected > 1e-3);
            QVERIFY(std::abs(rmsInterleaved(actual, window.first, window.second) - expected) < 1e-4);
        }
    }
    void reviewF5OfflinePatternContext_data() {
        QTest::addColumn<QJsonObject>("clip"); QTest::addColumn<QJsonObject>("document");
        QTest::addColumn<int>("pitch"); QTest::addColumn<qint64>("startFrame");
        const QJsonObject midiTrack{{"id", "t"}, {"type", "midi"}};
        const QJsonObject baseDoc{{"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 100}}}, {"tracks", QJsonArray{midiTrack}}};
        const auto makePattern = [](const QJsonObject& assignment, const QJsonObject& settings = QJsonObject{}, int offset = 0) {
            auto input = settings;
            input.insert("lengthSteps", 1);
            input.insert("rows", QJsonArray{QJsonObject{{"id", "r"}, {"assignment", assignment},
                {"steps", QJsonArray{QJsonObject{{"on", true}, {"offset", offset}}}}}});
            return nt::midi::normalizePattern(input);
        };
        const auto add = [](const char* name, const QJsonObject& pattern, const QJsonObject& doc, int expectedPitch, bool quantize = false) {
            QJsonObject clip{{"id", "c"}, {"trackId", "t"}, {"mediaType", "midi"}, {"startMs", 100}, {"durationMs", 125}, {"pattern", pattern}};
            if (quantize) clip.insert("quantize", QJsonObject{{"grid", "1/16"}, {"strength", 100}});
            QTest::newRow(name) << clip << doc << expectedPitch << qint64{0};
        };
        auto kitDoc = baseDoc;
        auto kitTrack = midiTrack; kitTrack.insert("instrument", QJsonObject{{"type", "drum"}, {"baseNote", 70}});
        kitDoc.insert("tracks", QJsonArray{kitTrack});
        add("kit", makePattern({{"type", "kit"}, {"pad", 2}}), kitDoc, 72);
        auto keyDoc = baseDoc;
        auto tempo = keyDoc.value("tempo").toObject(); tempo.insert("key", QJsonObject{{"tonic", "D"}, {"mode", "major"}}); keyDoc.insert("tempo", tempo);
        add("key", makePattern({{"type", "note"}, {"pitch", 60}}, {{"pitchSource", "key"}, {"key", QJsonObject{{"tonic", 0}, {"mode", "major"}}}}), keyDoc, 62);
        auto chordDoc = baseDoc;
        chordDoc.insert("tracks", QJsonArray{midiTrack, QJsonObject{{"id", "chords"}, {"type", "chord"}, {"chords", QJsonArray{
            QJsonObject{{"id", "ch"}, {"startTick", 0}, {"durationTick", 960}, {"root", 4}, {"quality", "min"}}}}}});
        add("chords", makePattern({{"type", "degree"}, {"degree", "root"}, {"octave", 3}}, {{"pitchSource", "chords"}}), chordDoc, 64);
        add("tempo-offset", makePattern({{"type", "note"}, {"pitch", 60}}, {}, 25), baseDoc, 60, true);
    }
    void reviewF5OfflinePatternContext() {
        QFETCH(QJsonObject, clip); QFETCH(QJsonObject, document); QFETCH(int, pitch); QFETCH(qint64, startFrame);
        const auto events = extractMidiNoteEvents(clip, 120, 48000, 0, 125, document);
        QCOMPARE(events.size(), std::size_t{1});
        QCOMPARE(events.front().pitch, pitch);
        QCOMPARE(events.front().startFrame, startFrame);
    }
    void editsSetTrackInstrumentAndState() {
        QJsonObject raw{
            {"id", "tl1"},
            {"name", "Test"},
            {"fps", 30},
            {"width", 1920},
            {"height", 1080},
            {"durationMs", 4000},
            {"tracks",
             QJsonArray{
                 QJsonObject{{"id", "m1"}, {"name", "Synth"}, {"type", "midi"}, {"index", 0}, {"locked", false}},
                 QJsonObject{{"id", "mLocked"}, {"name", "Locked"}, {"type", "midi"}, {"index", 1}, {"locked", true}},
                 QJsonObject{{"id", "a1"}, {"name", "Audio"}, {"type", "audio"}, {"index", 2}, {"locked", false}},
             }},
            {"clips", QJsonArray{}},
        };

        TimelineModel model;
        model.setTimeline(parseRaw(raw));

        const QJsonObject vstInst{
            {"type", "vst"},
            {"plugin", QJsonObject{{"uid", "u1"}, {"name", "Tone"}, {"vendor", "NodeTool"}, {"path", "/tmp/tone.vst3"}}},
            {"state", QJsonValue::Null},
            {"gainDb", -3.0},
        };
        QVERIFY(model.applyEdit("setTrackInstrument", {{"trackId", "m1"}, {"instrument", vstInst}}));
        QCOMPARE(model.timeline().findTrack("m1")->raw.value("instrument").toObject().value("type").toString(),
                 QStringLiteral("vst"));
        QCOMPARE(model.timeline().findTrack("m1")->raw.value("instrument").toObject().value("gainDb").toDouble(), -3.0);

        // No-op when unchanged.
        QVERIFY(!model.applyEdit("setTrackInstrument", {{"trackId", "m1"}, {"instrument", vstInst}}));
        // Refuses locked MIDI tracks and non-MIDI tracks.
        QVERIFY(!model.applyEdit("setTrackInstrument", {{"trackId", "mLocked"}, {"instrument", vstInst}}));
        QVERIFY(!model.applyEdit("setTrackInstrument", {{"trackId", "a1"}, {"instrument", vstInst}}));

        // Updates saved base64 state cleanly.
        QVERIFY(model.applyEdit("setTrackInstrumentState", {{"trackId", "m1"}, {"state", "AAAA"}}));
        QCOMPARE(model.timeline().findTrack("m1")->raw.value("instrument").toObject().value("state").toString(),
                 QStringLiteral("AAAA"));
        QVERIFY(!model.applyEdit("setTrackInstrumentState", {{"trackId", "m1"}, {"state", "AAAA"}}));

        model.undoStack()->undo();
        QVERIFY(model.timeline().findTrack("m1")->raw.value("instrument").toObject().value("state").isNull());
    }

    void extractsMidiNoteEventsInClipWindow() {
        // At 120 BPM, 1 quarter note = 960 ticks = 500 ms.
        QJsonObject clipRaw{
            {"notes",
             QJsonArray{
                 // Note before inPointMs -> excluded.
                 QJsonObject{{"id", "n0"}, {"pitch", 48}, {"velocity", 100}, {"startTick", 0}, {"durationTick", 480}},
                 // Note at 500ms (inPointMs = 500ms) -> startFrame 0, duration 500ms = 24000 frames.
                 QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 110}, {"startTick", 960}, {"durationTick", 960}},
                 // Note at 1000ms lasting 1000ms -> clamped to clip duration (1000ms) -> 24000..48000.
                 QJsonObject{{"id", "n2"}, {"pitch", 64}, {"velocity", 90}, {"startTick", 1920}, {"durationTick", 1920}},
             }},
        };
        const auto events = extractMidiNoteEvents(clipRaw, 120.0, 48000.0, 500.0, 1000.0);
        QCOMPARE(events.size(), std::size_t{2});
        QCOMPARE(events[0].pitch, 60);
        QCOMPARE(events[0].velocity, 110);
        QCOMPARE(events[0].startFrame, std::int64_t{0});
        QCOMPARE(events[0].gateOffFrame, std::int64_t{24000});
        QCOMPARE(events[1].pitch, 64);
        QCOMPARE(events[1].startFrame, std::int64_t{24000});
        QCOMPARE(events[1].gateOffFrame, std::int64_t{48000});
    }

    void midiStreamSkipsMutedNotesAndKeepsChannelAndReleaseVelocity() {
        const auto stream = midiStream(
            QJsonArray{midiNote("a", 60, 0, 480, {{"muted", true}}),
                       midiNote("b", 62, 960, 480, {{"channel", 5}, {"releaseVelocity", 40}}),
                       midiNote("c", 64, 1920, 480)},
            {});
        QCOMPARE(stream.events.size(), std::size_t{4});
        QCOMPARE(stream.events[0].status, std::uint8_t{0x95});
        QCOMPARE(stream.events[0].data1, std::uint8_t{62});
        QCOMPARE(stream.events[1].status, std::uint8_t{0x85});
        QCOMPARE(stream.events[1].data2, std::uint8_t{40});
        QCOMPARE(stream.events[2].status, std::uint8_t{0x90});
        QCOMPARE(stream.events[3].status, std::uint8_t{0x80});
        QCOMPARE(stream.events[3].data2, std::uint8_t{0});  // no releaseVelocity: today's output
        QVERIFY(stream.events[0].noteId > 0 && stream.events[0].noteId == stream.events[1].noteId);
        QVERIFY(stream.events[0].noteId != stream.events[2].noteId);
        const auto offline = extractMidiNoteEvents(QJsonObject{{"notes", QJsonArray{midiNote("a", 60, 0, 480, {{"muted", true}}), midiNote("b", 62, 0, 480)}}},
                                                   120.0, 48000.0, 0.0, 1000.0);
        QCOMPARE(offline.size(), std::size_t{1});
        QCOMPARE(offline[0].pitch, 62);
    }

    void midiStreamEncodesControllerBytes() {
        const auto stream = midiStream({}, QJsonArray{
            ctrlLane("cc", QJsonArray{ctrlPoint(0, 99)}, {{"cc", 7}, {"channel", 2}}),
            ctrlLane("pitchBend", QJsonArray{ctrlPoint(0, -8192), ctrlPoint(10, 8191), ctrlPoint(20, 0)}, {{"interpolation", "step"}}),
            ctrlLane("channelPressure", QJsonArray{ctrlPoint(0, 55)}, {{"channel", 15}}),
            ctrlLane("polyPressure", QJsonArray{ctrlPoint(0, 44)}, {{"pitch", 61}})});
        const auto cc = eventsWithStatus(stream, 0xB0);
        QCOMPARE(cc.size(), std::size_t{1});
        QCOMPARE(cc[0].status, std::uint8_t{0xB2});
        QCOMPARE(cc[0].data1, std::uint8_t{7});
        QCOMPARE(cc[0].data2, std::uint8_t{99});
        const auto bend = eventsWithStatus(stream, 0xE0);
        QCOMPARE(bend.size(), std::size_t{4});  // 3 points + reset at the clip end
        QCOMPARE(bend[0].data1, std::uint8_t{0});
        QCOMPARE(bend[0].data2, std::uint8_t{0});
        QCOMPARE(bend[1].data1, std::uint8_t{127});
        QCOMPARE(bend[1].data2, std::uint8_t{127});
        QCOMPARE(bend[2].data1, std::uint8_t{0});
        QCOMPARE(bend[2].data2, std::uint8_t{0x40});
        const auto pressure = eventsWithStatus(stream, 0xD0);
        QCOMPARE(pressure.size(), std::size_t{1});
        QCOMPARE(pressure[0].status, std::uint8_t{0xDF});
        QCOMPARE(pressure[0].data1, std::uint8_t{55});
        const auto poly = eventsWithStatus(stream, 0xA0);
        QCOMPARE(poly.size(), std::size_t{1});
        QCOMPARE(poly[0].data1, std::uint8_t{61});
        QCOMPARE(poly[0].data2, std::uint8_t{44});
    }

    void midiStreamStepAndLinearSampling() {
        // 960 ticks = 500 ms. Step: one event per point.
        auto stream = midiStream({}, QJsonArray{ctrlLane("cc", QJsonArray{ctrlPoint(0, 0), ctrlPoint(960, 100)},
                                                         {{"cc", 1}, {"interpolation", "step"}})});
        QCOMPARE(eventsWithStatus(stream, 0xB0).size(), std::size_t{2});
        // Linear 0 -> 2 over 500 ms: ramp events only where the rounded value changes (130 ms: 1, 380 ms: 2).
        stream = midiStream({}, QJsonArray{ctrlLane("cc", QJsonArray{ctrlPoint(0, 0), ctrlPoint(960, 2)}, {{"cc", 1}})});
        const auto cc = eventsWithStatus(stream, 0xB0);
        QCOMPARE(cc.size(), std::size_t{4});
        QCOMPARE(cc[0].timeMs, 0.0);
        QCOMPARE(cc[1].timeMs, 130.0);
        QCOMPARE(cc[1].data2, std::uint8_t{1});
        QCOMPARE(cc[2].timeMs, 380.0);
        QCOMPARE(cc[2].data2, std::uint8_t{2});
        QCOMPARE(cc[3].timeMs, 500.0);
        // 0 -> 100: a ramp sample every 10 ms (49 between the points).
        stream = midiStream({}, QJsonArray{ctrlLane("cc", QJsonArray{ctrlPoint(0, 0), ctrlPoint(960, 100)}, {{"cc", 1}})});
        QCOMPARE(eventsWithStatus(stream, 0xB0).size(), std::size_t{51});
    }

    void midiStreamEmitsOnlyInsideWindowAndResetsAtEnd() {
        // Clip at 1000 ms, window 500..1500 ms of content (duration 1000): the lane point at tick 0 (0 ms) is hidden.
        const auto stream = midiStream({}, QJsonArray{
            ctrlLane("pitchBend", QJsonArray{ctrlPoint(0, 100), ctrlPoint(960, 200), ctrlPoint(5760, 300)}, {{"interpolation", "step"}}),
            ctrlLane("cc", QJsonArray{ctrlPoint(960, 90)}, {{"cc", 64}, {"interpolation", "step"}}),
            ctrlLane("cc", QJsonArray{ctrlPoint(960, 90)}, {{"cc", 1}, {"interpolation", "step"}}),
            ctrlLane("cc", QJsonArray{ctrlPoint(5760, 90)}, {{"cc", 11}, {"interpolation", "step"}})},
            1000.0, 500.0, 1000.0);
        const auto bend = eventsWithStatus(stream, 0xE0);
        QCOMPARE(bend.size(), std::size_t{2});  // tick 960 (timeline 1000 ms) and the reset at 2000 ms
        QCOMPARE(bend[0].timeMs, 1000.0);
        QCOMPARE(bend[1].timeMs, 2000.0);
        QCOMPARE(bend[1].data1, std::uint8_t{0});
        QCOMPARE(bend[1].data2, std::uint8_t{0x40});
        int sustainResets = 0;
        int otherResets = 0;
        for (const auto& e : eventsWithStatus(stream, 0xB0)) {
            if (e.timeMs == 2000.0 && e.data1 == 64 && e.data2 == 0) ++sustainResets;
            if (e.timeMs == 2000.0 && e.data1 != 64) ++otherResets;
        }
        QCOMPARE(sustainResets, 1);
        QCOMPARE(otherResets, 0);  // only pitch bend and cc 64 reset
        // The cc 11 lane starts after the window: nothing at all.
        for (const auto& e : eventsWithStatus(stream, 0xB0)) QVERIFY(e.data1 != 11);
    }

    void midiStreamOrdersClipEndResetBeforeNextClipOpeningValue() {
        // Clip A (0..1000 ms) ends where clip B (1000..2000 ms) opens. B is first in the array.
        const auto clip = [](const QString& id, double startMs, int value) {
            return QJsonObject{{"id", id}, {"trackId", "m1"}, {"name", id}, {"startMs", startMs},
                               {"durationMs", 1000}, {"inPointMs", 0}, {"outPointMs", 1000}, {"mediaType", "midi"},
                               {"sourceType", "generated"}, {"status", "ready"}, {"locked", false},
                               {"notes", QJsonArray{}},
                               {"controllers", QJsonArray{ctrlLane("pitchBend", QJsonArray{ctrlPoint(0, value)},
                                                                   {{"interpolation", "step"}})}}};
        };
        const QJsonObject raw{
            {"id", "tl"}, {"name", "T"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 8000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"name", "K"}, {"type", "midi"}, {"index", 0}}}},
            {"clips", QJsonArray{clip("b", 1000.0, 300), clip("a", 0.0, 100)}}};
        const auto stream = buildTrackMidiStream(parseRaw(raw), "m1", 120.0);
        std::vector<MidiStreamEvent> atBoundary;
        for (const auto& e : eventsWithStatus(stream, 0xE0)) {
            if (e.timeMs == 1000.0) atBoundary.push_back(e);
        }
        QCOMPARE(atBoundary.size(), std::size_t{2});  // A's reset, then B's opening value
        const int last = atBoundary.back().data1 | (atBoundary.back().data2 << 7);
        QCOMPARE(last, 300 + 8192);
    }

    void midiStreamOrdersAllEqualTimeClassesAndSurvivesFloatSums() {
        // Clip A ends at 819.2 + 1638.4 = 2457.6000000000004 in doubles. Clip B opens at 2457.6.
        const auto clip = [](const QString& id, double startMs, double durationMs, int value, const QJsonArray& notes) {
            return QJsonObject{{"id", id}, {"trackId", "m1"}, {"name", id}, {"startMs", startMs},
                               {"durationMs", durationMs}, {"inPointMs", 0}, {"outPointMs", durationMs},
                               {"mediaType", "midi"}, {"sourceType", "generated"}, {"status", "ready"},
                               {"locked", false}, {"notes", notes},
                               {"controllers", QJsonArray{ctrlLane("pitchBend", QJsonArray{ctrlPoint(0, value)},
                                                                   {{"interpolation", "step"}})}}};
        };
        const QJsonObject raw{
            {"id", "tl"}, {"name", "T"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 8000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"name", "K"}, {"type", "midi"}, {"index", 0}}}},
            {"clips", QJsonArray{clip("b", 2457.6, 1000.0, 300, QJsonArray{midiNote("n", 60, 0, 480)}),
                                 clip("a", 819.2, 1638.4, 100, QJsonArray{})}}};
        const auto stream = buildTrackMidiStream(parseRaw(raw), "m1", 120.0);
        std::vector<MidiStreamEvent> atBoundary;
        for (const auto& e : stream.events) {
            if (std::abs(e.timeMs - 2457.6) < 0.01) atBoundary.push_back(e);
        }
        // A's reset, B's opening bend, then B's note-on.
        QVERIFY2(atBoundary.size() >= 3, "events at the clip boundary");
        QCOMPARE(atBoundary[0].status & 0xF0, 0xE0);
        QVERIFY(atBoundary[0].clipEndReset);
        QCOMPARE(atBoundary[1].status & 0xF0, 0xE0);
        QVERIFY(!atBoundary[1].clipEndReset);
        QCOMPARE(atBoundary[1].data1 | (atBoundary[1].data2 << 7), 300 + 8192);
        QCOMPARE(atBoundary[2].status & 0xF0, 0x90);
    }

    void liveBlockSeekPutsClipEndResetBeforeChasedValue() {
        // Clip A [0, 1000) bend 2000 ends at 1000 ms. Clip B [500, 2000) bend 4000 at 500 ms.
        const auto clip = [](const QString& id, double startMs, double durationMs, int value) {
            return QJsonObject{{"id", id}, {"trackId", "m1"}, {"name", id}, {"startMs", startMs},
                               {"durationMs", durationMs}, {"inPointMs", 0}, {"outPointMs", durationMs},
                               {"mediaType", "midi"}, {"sourceType", "generated"}, {"status", "ready"},
                               {"locked", false}, {"notes", QJsonArray{}},
                               {"controllers", QJsonArray{ctrlLane("pitchBend", QJsonArray{ctrlPoint(0, value)},
                                                                   {{"interpolation", "step"}})}}};
        };
        const QJsonObject raw{
            {"id", "tl"}, {"name", "T"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 8000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"name", "K"}, {"type", "midi"}, {"index", 0}}}},
            {"clips", QJsonArray{clip("a", 0.0, 1000.0, 2000), clip("b", 500.0, 1500.0, 4000)}}};
        const auto stream = buildTrackMidiStream(parseRaw(raw), "m1", 120.0);
        std::array<vsthost::ShmMidiEvent, 64> out{};
        std::size_t cursor = 0;
        const double msPerFrame = 1000.0 / 48000.0;
        const auto got = assembleLiveBlockMidi(stream, cursor, true, 1000.0, 1000.0 + 128 * msPerFrame,
                                               msPerFrame, 128, out);
        QCOMPARE(got.count, std::size_t{2});
        QCOMPARE(out[0].data1 | (out[0].data2 << 7), 8192);          // A's reset to centre
        QCOMPARE(out[1].data1 | (out[1].data2 << 7), 4000 + 8192);   // then B's chased value wins
    }

    void liveBlockClockRunsResetAgainAfterAFailedBlock() {
        LiveBlockClock clock;
        QVERIFY(clock.isDiscontinuous(0.0));  // first block
        clock.advance(2.0);
        QVERIFY(!clock.isDiscontinuous(2.0));
        QVERIFY(clock.isDiscontinuous(3000.0));  // seek
        // The seek block failed (channel busy): the next block, at the seek target plus one block, must still reset.
        clock.invalidate();
        QVERIFY(clock.isDiscontinuous(3002.0));
    }

    void liveChannelCloseWaitsForTheAudioCallbackAndPreparesAtTheRealRate() {
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) QSKIP("NodeToolVstHost or test VST3 plugins not built");
        auto client = sharedVstHostClient();
        client->setOverrideExecutable(hostExe);
        client->setExtraScanDirs({QFileInfo(gainVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client->scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* gain = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == gainVst) gain = &p;
        }
        QVERIFY(gain != nullptr);

        VstLivePool pool;
        auto channel = pool.acquire(*client, QStringLiteral("fx:close:race"), gain->path, gain->uid, {}, 48000.0);
        QVERIFY(channel && channel->connected());
        // A device at 44.1 kHz: the control thread prepares, and the block then succeeds.
        std::vector<float> block(std::size_t{128} * 2, 0.25f);
        QVERIFY(channel->prepareRate(44100.0));
        QVERIFY(channel->processBlock(block, {}, 44100.0, false, 500));

        // The audio thread keeps exchanging blocks while the control thread closes the channel.
        std::atomic<bool> stop{false};
        std::atomic<int> okBlocks{0};
        std::thread audio([&] {
            std::vector<float> b(std::size_t{128} * 2, 0.25f);
            while (!stop.load()) {
                if (channel->processBlock(b, {}, 44100.0, false, 500)) ++okBlocks;
            }
        });
        QTRY_VERIFY_WITH_TIMEOUT(okBlocks.load() > 5, 5000);
        channel->close(client.get());
        const int after = okBlocks.load();
        QTest::qWait(50);
        stop.store(true);
        audio.join();
        QCOMPARE(okBlocks.load(), after);  // nothing exchanged after close returned
        QVERIFY(!channel->connected());
    }

    void midiStreamHoldsHiddenLaneValueAtTrimmedClipStart() {
        // Window 500..1500 ms of content at timeline 1000 ms. The step lane's points at 0 ms and 250 ms are hidden.
        const auto stream = midiStream({}, QJsonArray{ctrlLane("cc", QJsonArray{ctrlPoint(0, 10), ctrlPoint(480, 30)},
                                                               {{"cc", 7}, {"interpolation", "step"}})},
                                       1000.0, 500.0, 1000.0);
        const auto cc = eventsWithStatus(stream, 0xB0);
        QCOMPARE(cc.size(), std::size_t{1});
        QCOMPARE(cc[0].timeMs, 1000.0);
        QCOMPARE(cc[0].data2, std::uint8_t{30});
        // A point exactly at the chase time covers itself: no second event.
        std::array<MidiStreamEvent, 4> out;
        const auto exact = midiStream({}, QJsonArray{ctrlLane("cc", QJsonArray{ctrlPoint(0, 10), ctrlPoint(960, 30)},
                                                              {{"cc", 7}, {"interpolation", "step"}})});
        QCOMPARE(chaseMidiEvents(exact, 500.0, out), std::size_t{0});
    }

    void midiStreamChasesLaneValuesOnAMidClipStart() {
        // Linear bend: 0 ms -> 100, 1000 ms -> 300, clip at 0 ms.
        const auto stream = midiStream({}, QJsonArray{
            ctrlLane("pitchBend", QJsonArray{ctrlPoint(0, 100), ctrlPoint(1920, 300)}),
            ctrlLane("cc", QJsonArray{ctrlPoint(1920, 50), ctrlPoint(3840, 70)}, {{"cc", 7}, {"interpolation", "step"}})});
        std::array<MidiStreamEvent, 8> out;
        // At 500 ms: bend is 200; the cc 7 lane has not begun (first point at 1000 ms).
        auto count = chaseMidiEvents(stream, 500.0, out);
        QCOMPARE(count, std::size_t{1});
        QCOMPARE(out[0].status, std::uint8_t{0xE0});
        QCOMPARE(out[0].data1, std::uint8_t{(200 + 8192) & 0x7F});
        QCOMPARE(out[0].data2, std::uint8_t{((200 + 8192) >> 7) & 0x7F});
        QCOMPARE(out[0].timeMs, 500.0);
        // At 1500 ms: the step lane holds 50.
        count = chaseMidiEvents(stream, 1500.0, out);
        QCOMPARE(count, std::size_t{2});
        QCOMPARE(out[1].data1, std::uint8_t{7});
        QCOMPARE(out[1].data2, std::uint8_t{50});
        // At the first point and outside the clip: nothing.
        QCOMPARE(chaseMidiEvents(stream, 0.0, out), std::size_t{0});
        QCOMPARE(chaseMidiEvents(stream, 4000.0, out), std::size_t{0});
    }

    void midiStreamSamplesNoteExpressionWithNoteIds() {
        const QJsonObject expression{
            {"pitch", QJsonArray{QJsonObject{{"tick", 0}, {"value", 0}}, QJsonObject{{"tick", 960}, {"value", 12}}}},
            {"volume", QJsonArray{QJsonObject{{"tick", 0}, {"value", 4}}}},
            {"pan", QJsonArray{QJsonObject{{"tick", 480}, {"value", -1}}}},
            {"brightness", QJsonArray{QJsonObject{{"tick", 0}, {"value", 0.25}}}}};
        const auto stream = midiStream(QJsonArray{midiNote("a", 60, 0, 960, {{"expression", expression}})}, {});
        const auto onId = stream.events[0].noteId;
        QCOMPARE(stream.events[0].status, std::uint8_t{0x90});
        std::map<int, std::vector<MidiStreamEvent>> byType;
        for (const auto& e : eventsWithStatus(stream, 0xF4)) {
            QCOMPARE(e.noteId, onId);
            QVERIFY(e.timeMs >= 0.0 && e.timeMs < 500.0);
            byType[e.data1].push_back(e);
        }
        QCOMPARE(byType[0].front().value, 0.5f);  // tuning 0 semitones
        QVERIFY(byType[0].size() > 10);           // 10 ms ramp samples
        QVERIFY(qAbs(byType[0].back().value - (0.5f + 11.76f / 240.0f)) < 1e-4f);  // sample at 490 ms
        QCOMPARE(byType[1].size(), std::size_t{1});
        QCOMPARE(byType[1][0].value, 1.0f);       // 4x gain = 1.0 normalized
        QCOMPARE(byType[2][0].value, 0.0f);       // pan -1
        QCOMPARE(byType[2][0].timeMs, 250.0);
        QCOMPARE(byType[3][0].value, 0.25f);
        // At one time the note-on precedes its expression events.
        QCOMPARE(stream.events[1].status, std::uint8_t{0xF4});
        // The ids are stable between two builds.
        const auto again = midiStream(QJsonArray{midiNote("a", 60, 0, 960, {{"expression", expression}})}, {});
        QCOMPARE(again.events[0].noteId, onId);
    }

    void rendersVstInstrumentAndProcessesVstEffectEndToEnd() {
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or test VST3 plugins not built in native/vst-host/build");
        }

        auto client = sharedVstHostClient();
        client->setOverrideExecutable(hostExe);
        client->setExtraScanDirs({QFileInfo(toneVst).absolutePath(), QFileInfo(gainVst).absolutePath()});
        QVERIFY(client->available());

        // 1. Scan finds BOTH test instrument and test audio effect.
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client->scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        const VstPluginInfo* gain = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
            if (QFileInfo(p.path).canonicalFilePath() == gainVst) gain = &p;
        }
        if (!tone || !gain) {
            QFAIL("the scan did not list ToneInstrument.vst3 and GainEffect.vst3");
        }
        QVERIFY(tone->isInstrument);
        QVERIFY(!gain->isInstrument);

        // 2. Render a MIDI clip through ToneInstrument.vst3 via renderOffline.
        const QJsonObject toneRef{{"uid", tone->uid}, {"name", tone->name}, {"vendor", tone->vendor}, {"path", tone->path}};
        const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};

        auto makeMidiTimeline = [&](const QJsonArray& trackEffects, const QJsonArray& masterEffects = {}) {
            QJsonObject raw{
                {"id", "tl-vst"},
                {"name", "VST Test"},
                {"fps", 30},
                {"width", 1920},
                {"height", 1080},
                {"durationMs", 1000},
                {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
                {"master", QJsonObject{{"volumeDb", 0}, {"effects", masterEffects}}},
                {"tracks",
                 QJsonArray{
                     QJsonObject{
                         {"id", "m1"},
                         {"name", "Keys"},
                         {"type", "midi"},
                         {"index", 0},
                         {"volumeDb", 0},
                         {"pan", 0},
                         {"muted", false},
                         {"solo", false},
                         {"instrument", QJsonObject{{"type", "vst"}, {"plugin", toneRef}, {"state", QJsonValue::Null}, {"gainDb", 0}}},
                         {"effects", trackEffects},
                     },
                 }},
                {"clips",
                 QJsonArray{
                     QJsonObject{
                         {"id", "c1"},
                         {"trackId", "m1"},
                         {"name", "Phrase"},
                         {"startMs", 0},
                         {"durationMs", 1000},
                         {"inPointMs", 0},
                         {"outPointMs", 1000},
                         {"mediaType", "midi"},
                         {"sourceType", "generated"},
                         {"status", "ready"},
                         {"locked", false},
                         {"notes", QJsonArray{QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 110}, {"startTick", 480}, {"durationTick", 960}}}},
                     },
                 }},
            };
            return parseRaw(raw);
        };

        const auto dryPcm = nt::audio::renderOffline(makeMidiTimeline(QJsonArray{}), 48000, 0, 1000);
        QCOMPARE(dryPcm.size(), std::size_t{96000});
        const double beforeNote = rmsInterleaved(dryPcm, 0, 10000);
        const double duringNote = rmsInterleaved(dryPcm, 14000, 34000);
        QVERIFY2(beforeNote < 1e-4, qPrintable(QString::number(beforeNote)));
        QVERIFY2(duringNote > 1e-2, qPrintable(QString::number(duringNote)));

        // 3. Add GainEffect.vst3 (default 0.5x gain) to the MIDI track -> RMS halves.
        const QJsonObject fxEnabled{{"id", "fx1"}, {"type", "vst"}, {"enabled", true}, {"plugin", gainRef}, {"state", QJsonValue::Null}, {"wet", 1.0}};
        const auto trackFxPcm = nt::audio::renderOffline(makeMidiTimeline(QJsonArray{fxEnabled}), 48000, 0, 1000);
        const double fxRms = rmsInterleaved(trackFxPcm, 14000, 34000);
        QVERIFY2(std::abs(fxRms - 0.5 * duringNote) < 0.02 * duringNote,
                 qPrintable(QStringLiteral("fxRms=%1 expected=%2").arg(fxRms).arg(0.5 * duringNote)));

        // 4. Wet/dry = 0.5 blends dry (1.0) and wet (0.5) -> 0.75x.
        QJsonObject fxHalfWet = fxEnabled;
        fxHalfWet.insert("wet", 0.5);
        const auto blendPcm = nt::audio::renderOffline(makeMidiTimeline(QJsonArray{fxHalfWet}), 48000, 0, 1000);
        const double blendRms = rmsInterleaved(blendPcm, 14000, 34000);
        QVERIFY2(std::abs(blendRms - 0.75 * duringNote) < 0.02 * duringNote,
                 qPrintable(QStringLiteral("blendRms=%1 expected=%2").arg(blendRms).arg(0.75 * duringNote)));

        // 5. Bypassed VST effect leaves signal unchanged.
        QJsonObject fxBypassed = fxEnabled;
        fxBypassed.insert("enabled", false);
        const auto bypassedPcm = nt::audio::renderOffline(makeMidiTimeline(QJsonArray{fxBypassed}), 48000, 0, 1000);
        const double bypassedRms = rmsInterleaved(bypassedPcm, 14000, 34000);
        QVERIFY(std::abs(bypassedRms - duringNote) < 1e-4);

        // 6. Chaining built-in +6 dB gain before VST 0.5x gain -> ~1.0x overall!
        const QJsonObject builtInGain{{"id", "g1"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 6.0206}};
        const auto chainedPcm = nt::audio::renderOffline(makeMidiTimeline(QJsonArray{builtInGain, fxEnabled}), 48000, 0, 1000);
        const double chainedRms = rmsInterleaved(chainedPcm, 14000, 34000);
        QVERIFY2(std::abs(chainedRms - duringNote) < 0.03 * duringNote,
                 qPrintable(QStringLiteral("chainedRms=%1 expected=%2").arg(chainedRms).arg(duringNote)));

        // 7. Master VST effect scales the summed mix by 0.5x too.
        const auto masterFxPcm = nt::audio::renderOffline(makeMidiTimeline(QJsonArray{}, QJsonArray{fxEnabled}), 48000, 0, 1000);
        const double masterRms = rmsInterleaved(masterFxPcm, 14000, 34000);
        QVERIFY2(std::abs(masterRms - 0.5 * duringNote) < 0.02 * duringNote,
                 qPrintable(QStringLiteral("masterRms=%1 expected=%2").arg(masterRms).arg(0.5 * duringNote)));

        // 8. Audio clip on an audio track processed by GainEffect.vst3.
        QTemporaryDir tmp;
        QVERIFY(tmp.isValid());
        const QString wavPath = tmp.filePath(QStringLiteral("sine.wav"));
        std::vector<float> sine(std::size_t{48000} * 2);
        for (int i = 0; i < 48000; ++i) {
            const float s = 0.5f * std::sin(2.0f * 3.14159265f * 440.0f * static_cast<float>(i) / 48000.0f);
            sine[static_cast<std::size_t>(i) * 2] = s;
            sine[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        QVERIFY(writeStereoFloatWav(wavPath, 48000, sine));

        auto makeAudioTimeline = [&](const QJsonArray& effects) {
            QJsonObject raw{
                {"id", "tl-audio"},
                {"name", "Audio VST"},
                {"fps", 30},
                {"width", 1920},
                {"height", 1080},
                {"durationMs", 1000},
                {"tracks", QJsonArray{QJsonObject{{"id", "a1"}, {"name", "A1"}, {"type", "audio"}, {"index", 0}, {"volumeDb", 0}, {"pan", 0}, {"effects", effects}}}},
                {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "a1"}, {"name", "Tone"}, {"startMs", 0}, {"durationMs", 1000}, {"inPointMs", 0}, {"mediaType", "audio"}, {"status", "generated"}, {"mediaPath", wavPath}}}},
            };
            return parseRaw(raw);
        };
        const auto audioDry = nt::audio::renderOffline(makeAudioTimeline(QJsonArray{}), 48000, 0, 1000);
        const auto audioWet = nt::audio::renderOffline(makeAudioTimeline(QJsonArray{fxEnabled}), 48000, 0, 1000);
        const double audioDryRms = rmsInterleaved(audioDry, 2000, 46000);
        const double audioWetRms = rmsInterleaved(audioWet, 2000, 46000);
        QVERIFY(audioDryRms > 0.2);
        QVERIFY2(std::abs(audioWetRms - 0.5 * audioDryRms) < 0.02 * audioDryRms,
                 qPrintable(QStringLiteral("audioWetRms=%1 expected=%2").arg(audioWetRms).arg(0.5 * audioDryRms)));

        // 9. Crash isolation & recovery: kill NodeToolVstHost mid-session, confirm
        //    an active VstLiveChannel fails fast with dry passthrough (no hang!),
        //    and the next MixPlan build automatically restarts the host and streams audio again.
        auto liveFx = sharedVstLivePool().acquire(*client, QStringLiteral("fx:a1:fx1"),
                                                  gain->path, gain->uid, {}, 48000.0);
        QVERIFY(liveFx && liveFx->connected());
        client->terminateHostForTest();
        std::vector<float> testBlock(std::size_t{128} * 2, 0.5f);
        QElapsedTimer timer;
        timer.start();
        QVERIFY(!liveFx->processBlock(testBlock, {}, 48000.0, false, 200));
        QVERIFY2(timer.elapsed() < 100, "Dead host must wake poll() immediately via socket EOF");
        QCOMPARE(testBlock[0], 0.5f);  // untouched dry passthrough

        // Next render automatically spawns a fresh NodeToolVstHost and produces processed audio.
        const auto recoveredWet = nt::audio::renderOffline(makeAudioTimeline(QJsonArray{fxEnabled}), 48000, 0, 1000);
        const double recoveredRms = rmsInterleaved(recoveredWet, 2000, 46000);
        QVERIFY2(std::abs(recoveredRms - 0.5 * audioDryRms) < 0.02 * audioDryRms,
                 qPrintable(QStringLiteral("recoveredRms=%1 expected=%2").arg(recoveredRms).arg(0.5 * audioDryRms)));

        // 10. Real-time AudioEngine (null backend) plays the live VST3 synth + VST3 effect
        //     directly inside the device callback over shared memory.
        {
            nt::audio::AudioEngine engine;
            engine.setTimeline(std::make_shared<const nt::Timeline>(makeMidiTimeline(QJsonArray{fxEnabled})));
            nt::audio::AudioEngine::Options opts;
            opts.backend = nt::audio::AudioEngine::Backend::Manual;
            opts.sampleRate = 48000;
            std::string startErr;
            QVERIFY2(engine.start(opts, &startErr), startErr.c_str());
            nt::playback::TransportCommand cmd;
            cmd.seq = 1;
            cmd.playing = true;
            cmd.rate = 1.0;
            cmd.seekSeq = 1;
            cmd.seekMs = 0.0;
            engine.feed().command.store(cmd);
            QTRY_VERIFY(engine.stats().sessions >= 1);
            // Render 0.5s (50 blocks of 480 frames) through the manual real-time callback.
            std::vector<float> block(std::size_t{480} * 2, 0.0f);
            std::vector<float> recorded;
            recorded.reserve(std::size_t{50} * 480 * 2);
            for (int b = 0; b < 50; ++b) {
                engine.renderManual(block, static_cast<std::int64_t>(b) * 10'000'000LL);
                recorded.insert(recorded.end(), block.begin(), block.end());
            }
            engine.stop();
            // Note starts at tick 480 = 250ms = frame 12000 -> frames 14000..22000 must sound at ~0.5x!
            const double liveBefore = rmsInterleaved(recorded, 0, 10000);
            const double liveDuring = rmsInterleaved(recorded, 14000, 22000);
            QVERIFY2(liveBefore < 1e-4, qPrintable(QString::number(liveBefore)));
            QVERIFY2(std::abs(liveDuring - 0.5 * duringNote) < 0.03 * duringNote,
                     qPrintable(QStringLiteral("liveDuring=%1 expected=%2").arg(liveDuring).arg(0.5 * duringNote)));
        }
    }

    void midiStreamExpandsPatternClipNotesControllersAndRegionParams() {
        // 1-bar pattern clip at 120 BPM (duration 2000 ms = 3840 ticks):
        // - Kick on steps 0, 4, 8, 12 with transpose +2, velocityOffset -10
        // - CC 74 row in latch mode: 0 at step 0, 127 at step 8
        QJsonArray kickSteps;
        QJsonArray ccSteps;
        for (int i = 0; i < 16; ++i) {
            kickSteps.append(i % 4 == 0 ? QJsonObject{{"on", true}, {"velocity", 100}} : QJsonObject{});
            ccSteps.append(i == 0 ? QJsonObject{{"on", true}, {"value", 0}}
                                  : i == 8 ? QJsonObject{{"on", true}, {"value", 127}}
                                           : QJsonObject{});
        }
        const QJsonObject pattern{
            {"version", 1}, {"seed", 1}, {"lengthSteps", 16}, {"stepRate", "1/16"}, {"playback", "forward"},
            {"legato", false}, {"swing", 0}, {"swingDivision", "1/16"}, {"pitchSource", "off"},
            {"scale", "chromatic"}, {"noTranspose", false}, {"scaleQuantize", false}, {"midiChannel", 1},
            {"automationMode", "latch"}, {"mono", false}, {"name", "Beat"},
            {"rows", QJsonArray{
                QJsonObject{{"id", "r1"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 36}}},
                            {"mute", false}, {"solo", false}, {"lengthSteps", 16}, {"loopStart", 0}, {"loopEnd", 16},
                            {"stepRate", "1/16"}, {"playback", "forward"}, {"midiChannel", 1},
                            {"automationMode", "latch"}, {"subrows", QJsonArray{"velocity", "gate"}},
                            {"steps", kickSteps}},
                QJsonObject{{"id", "cc74"},
                            {"assignment", QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "cc"}, {"cc", 74}}}}},
                            {"mute", false}, {"solo", false}, {"lengthSteps", 16}, {"loopStart", 0}, {"loopEnd", 16},
                            {"stepRate", "1/16"}, {"playback", "forward"}, {"midiChannel", 1},
                            {"automationMode", "latch"}, {"subrows", QJsonArray{"value"}},
                            {"steps", ccSteps}}}}};
        const QJsonObject clipRaw{
            {"id", "p1"}, {"trackId", "m1"}, {"name", "Beat"}, {"startMs", 0.0}, {"durationMs", 2000.0},
            {"inPointMs", 0.0}, {"outPointMs", 2000.0}, {"mediaType", "midi"}, {"sourceType", "imported"},
            {"status", "generated"}, {"locked", false}, {"transpose", 2}, {"velocityOffset", -10},
            {"pattern", pattern}};
        const QJsonObject raw{
            {"id", "tl"}, {"name", "T"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 4000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "m1"}, {"name", "Drums"}, {"type", "midi"}, {"index", 0}}}},
            {"clips", QJsonArray{clipRaw}}};
        const auto stream = buildTrackMidiStream(parseRaw(raw), "m1", 120.0);
        const auto noteOns = eventsWithStatus(stream, 0x90);
        QCOMPARE(noteOns.size(), std::size_t{4});
        QCOMPARE(noteOns[0].timeMs, 0.0);
        QCOMPARE(noteOns[1].timeMs, 500.0);
        QCOMPARE(noteOns[2].timeMs, 1000.0);
        QCOMPARE(noteOns[3].timeMs, 1500.0);
        QCOMPARE(noteOns[0].data1, std::uint8_t{38});  // 36 + transpose 2
        QCOMPARE(noteOns[0].data2, std::uint8_t{90});  // 100 + velocityOffset -10

        const auto ccs = eventsWithStatus(stream, 0xB0);
        QCOMPARE(ccs.size(), std::size_t{2});
        QCOMPARE(ccs[0].timeMs, 0.0);
        QCOMPARE(ccs[0].data1, std::uint8_t{74});
        QCOMPARE(ccs[0].data2, std::uint8_t{0});
        QCOMPARE(ccs[1].timeMs, 1000.0);
        QCOMPARE(ccs[1].data2, std::uint8_t{127});

        // Offline note extraction also expands pattern clips.
        const auto offline = extractMidiNoteEvents(clipRaw, 120.0, 48000.0, 0.0, 2000.0);
        QCOMPARE(offline.size(), std::size_t{4});
        QCOMPARE(offline[0].pitch, 38);
        QCOMPARE(offline[0].velocity, 90);
    }
};

QTEST_MAIN(TestVst)
#include "tst_vst.moc"
