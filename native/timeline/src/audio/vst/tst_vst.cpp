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
#include <chrono>
#include <cmath>
#include <cstring>
#include <numbers>
#include <thread>
#include <map>
#include <vector>

#ifndef Q_OS_WIN
#include <cerrno>
#include <fcntl.h>
#include <poll.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#endif

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

    void reverseOrderStateLoadsV2_data() {
        QTest::addColumn<bool>("applied");
        QTest::newRow("in-flight") << false;
        QTest::newRow("applied") << true;
    }
    void reverseOrderStateLoadsV2() {
        QFETCH(bool, applied);
        QTemporaryDir dir; QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json,sys,time
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    if r['cmd']=='joinLiveState':
        assert r['generation']==1 and r['state']=='saved'
        with open(__file__+'.generation','w') as f: f.write(str(r['generation']))
    else:
        with open(__file__+'.requests','a') as f: f.write(r['cmd']+'\n')
    if r['cmd']=='setLiveState': time.sleep(.3)
    print(json.dumps(dict(id=r['id'],ok=True)),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName());
        std::jthread caller([&] { QString error; client.setLiveState("inst:m1","saved",&error); });
        QTRY_VERIFY(QFileInfo::exists(helper.fileName()+".requests"));
        if (applied) { caller.join(); }
        QSignalSpy restored(&client,&VstHostClient::stateRestored);
        client.restoreStateAsync("inst:m1",{{"state","saved"}},1);
        if (caller.joinable()) { caller.join(); }
        QTRY_COMPARE(restored.count(),1);
        QVERIFY(QFileInfo::exists(helper.fileName()+".generation"));
        QFile log(helper.fileName()+".requests"); QVERIFY(log.open(QIODevice::ReadOnly));
        QCOMPARE(log.readAll(),QByteArray("setLiveState\n"));
        client.restoreStateAsync("inst:m1",{{"state","saved"}},2);
        QTRY_COMPARE(restored.count(),2);
        QCOMPARE(log.readAll(),QByteArray("setState\n"));
    }
    void restorationReceiptInvalidatedByDifferentStateV1() {
        QTemporaryDir dir;
        QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    with open(__file__+'.requests','a') as f: f.write(r['cmd']+'\n')
    print(json.dumps(dict(id=r['id'],ok=True)),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName());
        QSignalSpy restored(&client,&VstHostClient::stateRestored);
        client.restoreStateAsync("inst:m1",{{"state","saved"}},1);
        QTRY_COMPARE(restored.count(),1);
        QString error; QVERIFY(client.setLiveState("inst:m1","different",&error));
        QVERIFY(client.setLiveState("inst:m1","saved",&error));
        QFile log(helper.fileName()+".requests"); QVERIFY(log.open(QIODevice::ReadOnly));
        QCOMPARE(log.readAll(),QByteArray("setState\nsetLiveState\nsetLiveState\n"));
    }
    void workerDoesNotEnterPoolV3V4() {
        QFile source(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath("VstHostClient.cpp"));
        QVERIFY(source.open(QIODevice::ReadOnly));
        const auto bytes=source.readAll(); QVERIFY(!bytes.isEmpty());
        QVERIFY2(!bytes.contains("sharedVstLivePool().noteStateFromEditor"),
                 "V3/V4: worker must not enter a blocking process-global pool");
    }
    void editorLifecycleV5_data() {
        QTest::addColumn<QString>("closing");
        QTest::newRow("close") << QString("close");
        QTest::newRow("dispose") << QString("dispose");
        QTest::newRow("failed-replacement") << QString("replace");
    }
    void editorLifecycleV5() {
        QFETCH(QString,closing);
        QTemporaryDir dir; QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json,sys,time
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    with open(__file__+'.requests','a') as f: f.write(r['cmd']+'\n')
    if r['cmd']=='openEditor': time.sleep(.1)
    print(json.dumps(dict(id=r['id'],ok=r.get('uid')!='bad',state='editor')),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName());
        QSignalSpy opened(&client,&VstHostClient::editorOpened);
        client.openEditorAsync("inst:m1","/tone","tone","saved","Synth");
        if(closing=="close") { client.closeEditorAsync("inst:m1"); }
        else if(closing=="dispose") { client.disposeAsync("inst:m1"); }
        else { QTRY_COMPARE(opened.count(),1); client.openEditorAsync("inst:m1","/tone","bad","saved","Synth"); }
        QTRY_COMPARE(opened.count(),closing=="replace" ? 2 : 1);
        QJsonObject reply; QString error;
        QVERIFY(client.getParameters({{"instance","inst:m1"},{"path","/tone"},{"uid","tone"},{"state","saved"}},&reply,&error));
        QFile log(helper.fileName()+".requests"); QVERIFY(log.open(QIODevice::ReadOnly));
        QVERIFY2(!log.readAll().contains("getState"),"V5: closed or failed replacement editor must not be resurrected");
    }
    void closedEditorFallbackV6() {
        QTemporaryDir dir; QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json,sys
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    with open(__file__+'.requests','a') as f: f.write(r['cmd']+'\n')
    print(json.dumps(dict(id=r['id'],ok=r['cmd']!='getState',state=r.get('state',''),error='Unknown instance')),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName()); QSignalSpy opened(&client,&VstHostClient::editorOpened);
        client.openEditorAsync("inst:m1","/tone","tone","saved","Synth"); QTRY_COMPARE(opened.count(),1);
        QJsonObject reply; QString error;
        QVERIFY2(client.setParameters({{"instance","inst:m1"},{"path","/tone"},{"uid","tone"},{"state","saved"}},&reply,&error),"V6: missing editor must fall back to document state");
        QCOMPARE(reply.value("state").toString(),QString("saved"));
    }
    void captureTimeoutDoesNotDispatchV7() {
        QTemporaryDir dir; QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json,sys,time
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    if r['cmd']=='getState': time.sleep(30.3)
    with open(__file__+'.requests','a') as f: f.write(r['cmd']+'\n')
    print(json.dumps(dict(id=r['id'],ok=True,state='late')),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName()); QSignalSpy opened(&client,&VstHostClient::editorOpened);
        client.openEditorAsync("inst:m1","/tone","tone","saved","Synth"); QTRY_COMPARE(opened.count(),1);
        QJsonObject reply; QString error; QElapsedTimer elapsed; elapsed.start();
        QVERIFY(!client.setParameters({{"instance","inst:m1"},{"path","/tone"},{"uid","tone"}},&reply,&error));
        QVERIFY(elapsed.elapsed()<31000);
        QTest::qWait(800);
        QFile log(helper.fileName()+".requests"); QVERIFY(log.open(QIODevice::ReadOnly)); const auto bytes=log.readAll();
        QVERIFY2(!bytes.contains("setParameters"),"V7: timed-out capture must not dispatch isolated work");
        QVERIFY2(!bytes.contains("dispose"),"V6: timed-out capture never created a temporary instance");
    }
    void cancelledCaptureDoesNotDispatchV7() {
        QTemporaryDir dir; QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json,sys,time
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    if r['cmd']=='getState':
        open(__file__+'.capture','w').close()
        time.sleep(.4)
    with open(__file__+'.requests','a') as f: f.write(r['cmd']+'\n')
    print(json.dumps(dict(id=r['id'],ok=True,state='captured')),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName()); QSignalSpy opened(&client,&VstHostClient::editorOpened);
        client.openEditorAsync("inst:m1","/tone","tone","saved","Synth"); QTRY_COMPARE(opened.count(),1);
        std::stop_source stop;
        std::jthread caller([&] { QJsonObject reply; QString error; client.setParameters({{"instance","inst:m1"},{"path","/tone"},{"uid","tone"}},&reply,&error,stop.get_token()); });
        QTRY_VERIFY(QFileInfo::exists(helper.fileName()+".capture")); stop.request_stop(); caller.join(); QTest::qWait(600);
        QFile log(helper.fileName()+".requests"); QVERIFY(log.open(QIODevice::ReadOnly)); const auto bytes=log.readAll();
        QVERIFY2(!bytes.contains("setParameters"),"V7: abandoned capture must not dispatch isolated work");
        QVERIFY2(!bytes.contains("dispose"),"V6: an uncreated temporary instance must not be disposed");
    }

    void temporaryRequestsReleaseEditorBookkeepingN1() {
        QTemporaryDir dir;
        QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json,sys
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    print(json.dumps(dict(id=r['id'],ok=True,state='saved')),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName());
        for (int i=0;i<32;++i) {
            QJsonObject reply; QString error;
            QVERIFY(client.getParameters({{"instance","inst:m1"}},&reply,&error));
        }
        QCOMPARE(client.editorRequestCountForTest(),std::size_t{0});
    }

    void poolSyncJoinsPendingRestorationF35() {
        QTemporaryDir dir; QVERIFY(dir.isValid());
        QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys, time
for line in sys.stdin:
    r = json.loads(line)
    if r['cmd'] == 'quit': break
    with open(__file__ + '.requests', 'a') as log: log.write(r['cmd'] + '\n')
    if r['cmd'] == 'setState': time.sleep(.2)
    print(json.dumps(dict(id=r['id'], ok=True)), flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName());
        client.restoreStateAsync("inst:m1",{{"plugin",QJsonObject{{"path","/tone.vst3"},{"uid","tone"}}},{"state","restored"}},1);
        QString error;
        QVERIFY2(client.setLiveState("inst:m1","restored",&error),qPrintable(error));
        QTest::qWait(20);
        QVERIFY2(client.setLiveState("inst:m1","restored",&error),qPrintable(error));
        QFile requests(helper.fileName()+".requests"); QVERIFY(requests.open(QIODevice::ReadOnly));
        QCOMPARE(requests.readAll(),QByteArray("setState\n"));
    }

    void assistantCommitGuardsLaterKnobChangeF36() {
        QTemporaryDir dir;
        QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json,sys
for line in sys.stdin:
    r=json.loads(line)
    if r['cmd']=='quit': break
    state='captured' if r['cmd']=='getState' else 'agent-result'
    ok=True
    if r['cmd']=='setState':
        # The knob changed after capture, without a polling event reaching the UI.
        ok=r.get('expectedState')!='captured'
    print(json.dumps(dict(id=r['id'],ok=ok,state=state,error='' if ok else 'Editor changed during plugin request')),flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName());
        QSignalSpy opened(&client,&VstHostClient::editorOpened);
        client.openEditorAsync("inst:m1","/tone","tone","saved","Synth"); QTRY_COMPARE(opened.count(),1);
        QJsonObject reply; QString error;
        QVERIFY(client.setParameters({{"instance","inst:m1"},{"path","/tone"},{"uid","tone"},{"state","saved"}},&reply,&error));
        QSignalSpy restored(&client,&VstHostClient::stateRestored);
        client.restoreStateAsync("inst:m1",{{"plugin",QJsonObject{{"path","/tone"},{"uid","tone"}}},{"state",reply.value("state")}},1);
        QTRY_COMPARE(restored.count(),1);
        QVERIFY2(!restored[0][2].toString().isEmpty(),"F36: a later knob change must reject the stale assistant restore");
    }

    void assistantCapturesUnreportedEditorStateF36() {
        QTemporaryDir dir; QVERIFY(dir.isValid());
        QFile helper(dir.filePath("host")); QVERIFY(helper.open(QIODevice::WriteOnly));
        helper.write(R"PY(#!/usr/bin/env python3
import json, sys
for line in sys.stdin:
    r = json.loads(line)
    if r['cmd'] == 'quit': break
    state = 'unreported-knob' if r['cmd'] == 'getState' else r.get('state', '')
    if r['cmd'] == 'setParameters':
        assert r['instance'].startswith('request:')
        state += ':agent'
    print(json.dumps(dict(id=r['id'], ok=True, state=state)), flush=True)
)PY");
        helper.close(); QVERIFY(helper.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));
        VstHostClient client; client.setOverrideExecutable(helper.fileName());
        QSignalSpy opened(&client,&VstHostClient::editorOpened);
        client.openEditorAsync("inst:m1","/tone.vst3","tone","document-before-knob","Synth");
        QTRY_COMPARE(opened.count(),1);
        QJsonObject reply; QString error;
        QVERIFY2(client.setParameters({{"instance","inst:m1"},{"path","/tone.vst3"},{"uid","tone"},
            {"state","document-before-knob"},{"changes",QJsonArray{QJsonObject{{"id","level"},{"value",.5}}}}},&reply,&error),qPrintable(error));
        QCOMPARE(reply.value("state").toString(),QStringLiteral("unreported-knob:agent"));
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
        {
            auto plan=nt::audio::buildMixPlan(makeMidiTimeline(QJsonArray{fxEnabled}),nt::audio::RenderMode::Offline);
            nt::audio::prepareMixPlan(plan,48000);
            std::shared_ptr<nt::audio::BlockProcessor> instrument,effect;
            for (const auto& bus:plan.tracks) {
                for (const auto& processor:bus.processors) {
                    if (processor->id=="vst-instrument") { instrument=processor; }
                    if (processor->id=="fx1") { effect=processor; }
                }
            }
            QVERIFY(instrument); QVERIFY(effect);
            QVERIFY(instrument->setParameter("gainDb",-12.)); QVERIFY(effect->setParameter("wet",.25));
            nt::audio::prepareMixPlan(plan,48000,128);
            std::vector<float> pcm(96000);
            for (int frame=0;frame<48000;frame+=128) {
                nt::audio::MixStats stats{};
                nt::audio::mixBlock(plan,nullptr,48000,frame*1000./48000,1000./48000,std::min(128,48000-frame),pcm.data()+frame*2,stats);
            }
            const double expected=duringNote*std::pow(10.,-12./20.)*.875;
            QVERIFY2(std::abs(rmsInterleaved(pcm,14000,34000)-expected)<expected*.03,"VST prepare must retain live gain and wet targets");
            std::array<float,1024> block{}; block.fill(1.f);
            effect->process(block,{48000,2000,1000./48000});
            float previous=block.back();
            double time=2000+512*1000./48000;
            for (double wet:{1.,.25}) {
                QVERIFY(effect->setParameter("wet",wet)); block.fill(1.f);
                effect->process(block,{48000,time,1000./48000}); time+=512*1000./48000;
                for (std::size_t i=0;i<block.size();i+=2) { QVERIFY(std::abs(block[i]-previous)<.002f); previous=block[i]; }
                QVERIFY(std::abs(block.back()-(1.-wet*.5))<1e-4);
            }
        }
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
                // Pace manual callbacks so the non-blocking RT IPC worker stays ahead of the loop.
                std::this_thread::sleep_for(std::chrono::milliseconds(2));
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

    // F1: plug-in delay compensation aligns wet/dry blend and all tracks in live playback and offline render.
    void pluginDelayCompensationAlignsWetDryAndTracks() {
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or GainEffect.vst3 not built in native/vst-host/build");
        }
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

        // Configure GainEffect state with gain = 0.5 (normalized 0.25) and latency = 512 samples (normalized 512/2048).
        QJsonObject paramReply;
        QVERIFY2(client->setParameters(
                     QJsonObject{{"instance", "pdc-setup"},
                                 {"path", gain->path},
                                 {"uid", gain->uid},
                                 {"state", QJsonValue::Null},
                                 {"changes", QJsonArray{QJsonObject{{"index", 0}, {"value", 0.25}},
                                                        QJsonObject{{"index", 1}, {"value", 512.0 / 2048.0}}}}},
                     &paramReply, &error),
                 qPrintable(error));
        const QString delayedState = paramReply.value("state").toString();
        QVERIFY(!delayedState.isEmpty());

        // Single-sample impulse (0.5f) at frame 1000.
        QTemporaryDir tmp;
        QVERIFY(tmp.isValid());
        const QString wavPath = tmp.filePath(QStringLiteral("impulse.wav"));
        constexpr int kFrames = 8192;
        constexpr int kImpulseFrame = 1000;
        std::vector<float> impulse(std::size_t{kFrames} * 2, 0.0f);
        impulse[std::size_t{kImpulseFrame} * 2] = 0.5f;
        impulse[std::size_t{kImpulseFrame} * 2 + 1] = 0.5f;
        QVERIFY(writeStereoFloatWav(wavPath, 48000, impulse));

        const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};
        const auto peakFrame = [](const std::vector<float>& pcm, int from, int to) {
            int best = -1;
            float bestVal = 0.0f;
            const int limit = std::min<int>(to, static_cast<int>(pcm.size() / 2));
            for (int f = std::max(0, from); f < limit; ++f) {
                const float v = std::abs(pcm[static_cast<std::size_t>(f) * 2]);
                if (v > bestVal) { bestVal = v; best = f; }
            }
            return std::pair<int, float>{best, bestVal};
        };

        // 1. Wet/dry = 0.5 on a 512-sample latency VST effect: dry path must be delayed to match wet.
        {
            const QJsonObject fxHalfWet{{"id", "pdc-wd"}, {"type", "vst"}, {"enabled", true},
                                        {"plugin", gainRef}, {"state", delayedState}, {"wet", 0.5}};
            const QJsonObject raw{
                {"id", "tl-pdc-wd"}, {"name", "PDC WetDry"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                {"durationMs", 200}, {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{QJsonObject{{"id", "a1"}, {"name", "A1"}, {"type", "audio"}, {"index", 0},
                                                  {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fxHalfWet}}}}},
                {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "a1"}, {"name", "Imp"}, {"startMs", 0},
                                                 {"durationMs", 200}, {"inPointMs", 0}, {"mediaType", "audio"},
                                                 {"status", "generated"}, {"mediaPath", wavPath}}}}};
            const auto out = nt::audio::renderOffline(parseRaw(raw), 48000, 0, 200);
            // Dry (0.5 * 0.5 = 0.25) + wet (0.5 * 0.25 = 0.125) = 0.375 at ONE single aligned frame (frame 1000).
            const auto [pf, pv] = peakFrame(out, 0, 4000);
            QCOMPARE(pf, kImpulseFrame);
            QVERIFY2(std::abs(pv - 0.375f) < 1e-3f,
                     qPrintable(QStringLiteral("expected aligned wet+dry sum 0.375 at frame %1, got %2 at frame %3")
                                    .arg(kImpulseFrame).arg(pv).arg(pf)));
            // No ghost impulse 512 frames later.
            QVERIFY2(std::abs(out[std::size_t{kImpulseFrame + 512} * 2]) < 1e-4f,
                     qPrintable(QStringLiteral("uncompensated ghost impulse at +512: %1")
                                    .arg(out[std::size_t{kImpulseFrame + 512} * 2])));
        }

        // 2. Multi-track PDC alignment: track 1 has 512-sample VST effect (wet=1), track 2 has no effects.
        {
            const QJsonObject fxWet{{"id", "pdc-tr"}, {"type", "vst"}, {"enabled", true},
                                    {"plugin", gainRef}, {"state", delayedState}, {"wet", 1.0}};
            const QJsonObject raw{
                {"id", "tl-pdc-tracks"}, {"name", "PDC Tracks"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                {"durationMs", 200}, {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{
                    QJsonObject{{"id", "t1"}, {"name", "Delayed"}, {"type", "audio"}, {"index", 0},
                                {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fxWet}}},
                    QJsonObject{{"id", "t2"}, {"name", "Dry"}, {"type", "audio"}, {"index", 1},
                                {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{}}}}},
                {"clips", QJsonArray{
                    QJsonObject{{"id", "c1"}, {"trackId", "t1"}, {"name", "I1"}, {"startMs", 0}, {"durationMs", 200},
                                {"inPointMs", 0}, {"mediaType", "audio"}, {"status", "generated"}, {"mediaPath", wavPath}},
                    QJsonObject{{"id", "c2"}, {"trackId", "t2"}, {"name", "I2"}, {"startMs", 0}, {"durationMs", 200},
                                {"inPointMs", 0}, {"mediaType", "audio"}, {"status", "generated"}, {"mediaPath", wavPath}}}}};
            const auto tl = parseRaw(raw);

            // 2a. Offline render: both tracks align at frame 1000 (0.25 + 0.5 = 0.75) and nothing at 1512.
            const auto offlineOut = nt::audio::renderOffline(tl, 48000, 0, 200);
            const auto [offFrame, offVal] = peakFrame(offlineOut, 0, 4000);
            QCOMPARE(offFrame, kImpulseFrame);
            QVERIFY2(std::abs(offVal - 0.75f) < 1e-3f,
                     qPrintable(QStringLiteral("offline tracks not aligned: peak %1 at frame %2").arg(offVal).arg(offFrame)));
            QVERIFY2(std::abs(offlineOut[std::size_t{kImpulseFrame + 512} * 2]) < 1e-4f,
                     qPrintable(QStringLiteral("offline track 1 lagged at +512: %1")
                                    .arg(offlineOut[std::size_t{kImpulseFrame + 512} * 2])));

            // 2b. Live playback (AudioEngine manual backend): both tracks align at frame 1000 + 512 = 1512!
            nt::audio::AudioEngine engine;
            engine.setTimeline(std::make_shared<const nt::Timeline>(tl));
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
            // Wait until the session is primed so block 0 plays immediately from t=0.
            QTest::qWait(100);
            std::vector<float> block(std::size_t{480} * 2, 0.0f);
            std::vector<float> liveOut;
            for (int b = 0; b < 10; ++b) {
                engine.renderManual(block, static_cast<std::int64_t>(b) * 10'000'000LL);
                liveOut.insert(liveOut.end(), block.begin(), block.end());
                std::this_thread::sleep_for(std::chrono::milliseconds(2));
            }
            engine.stop();
            const auto [liveFrame, liveVal] = peakFrame(liveOut, 0, static_cast<int>(liveOut.size() / 2));
            QVERIFY2(liveFrame >= 0 && std::abs(liveVal - 0.75f) < 1e-3f,
                     qPrintable(QStringLiteral("live tracks not aligned: peak %1 at frame %2").arg(liveVal).arg(liveFrame)));
            QVERIFY2(liveFrame >= 512 && std::abs(liveOut[static_cast<std::size_t>(liveFrame - 512) * 2]) < 1e-4f,
                     qPrintable(QStringLiteral("live dry track arrived 512 frames early")));
        }
    }

    // D7 & D9: VstAudioStages dry-path ring buffer must stay primed at 0 latency (no dropout on 0->512 transition)
    // and keep dry passthrough latency-aligned with sibling tracks on host disconnect/crash.
    void d7_d9_vstDryPathLatencyTransitionAndDisconnectAlignment() {
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or GainEffect.vst3 not built in native/vst-host/build");
        }
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

        QJsonObject state0Reply, state512Reply;
        QVERIFY2(client->setParameters(
                     QJsonObject{{"instance", "d7-setup0"}, {"path", gain->path}, {"uid", gain->uid},
                                 {"state", QJsonValue::Null},
                                 {"changes", QJsonArray{QJsonObject{{"index", 0}, {"value", 0.25}},
                                                        QJsonObject{{"index", 1}, {"value", 0.0}}}}},
                     &state0Reply, &error),
                 qPrintable(error));
        const QString state0 = state0Reply.value("state").toString();
        QVERIFY2(client->setParameters(
                     QJsonObject{{"instance", "d7-setup512"}, {"path", gain->path}, {"uid", gain->uid},
                                 {"state", QJsonValue::Null},
                                 {"changes", QJsonArray{QJsonObject{{"index", 0}, {"value", 0.25}},
                                                        QJsonObject{{"index", 1}, {"value", 512.0 / 2048.0}}}}},
                     &state512Reply, &error),
                 qPrintable(error));
        const QString state512 = state512Reply.value("state").toString();
        const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};

        // D7: Start with latency=0, wet=0.5, feed steady 0.5f for 1024 frames, then switch live state to latency=512.
        // Dry path must already hold recent 0.5f samples (no zero-fill dropout).
        {
            const QJsonObject fx{{"id", "d7-fx"}, {"type", "vst"}, {"enabled", true},
                                 {"plugin", gainRef}, {"state", state0}, {"wet", 0.5}};
            const QJsonObject raw{
                {"id", "tl-d7"}, {"name", "D7"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 1000},
                {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{QJsonObject{{"id", "a1"}, {"name", "A1"}, {"type", "audio"}, {"index", 0},
                                                  {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fx}}}}},
                {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "a1"}, {"name", "DC"}, {"startMs", 0},
                                                 {"durationMs", 1000}, {"inPointMs", 0}, {"mediaType", "audio"},
                                                 {"status", "generated"}, {"mediaPath", "unused.wav"}}}}};
            const auto tl = parseRaw(raw);
            auto plan = nt::audio::buildMixPlan(tl);
            nt::audio::prepareMixPlan(plan, 48000.0);
            std::vector<float> dc(std::size_t{4096} * 2, 0.5f);
            nt::audio::VoicePcm vp{};
            vp.linear = dc.data();
            vp.linearCount = 4096;
            std::vector<float> out(std::size_t{128} * 2, 0.0f);
            nt::audio::MixStats st;
            // 12 blocks = 1536 frames at latency=0 -> primes async pipeline + dry ring with 0.5f frames.
            for (int b = 0; b < 12; ++b) {
                nt::audio::mixBlock(plan, &vp, 48000.0, b * 128 * 1000.0 / 48000.0, 1000.0 / 48000.0, 128, out.data(), st);
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            // Dynamically switch live plugin latency 0 -> 512 (same instance id "fx:a1:d7-fx").
            QVERIFY2(client->setLiveState(QStringLiteral("fx:a1:d7-fx"), state512, &error), qPrintable(error));
            // Process 3 blocks: updates channel->latencySamples to 512 and reads from dry ring at delay=512+async.
            float minSample = 1.0f;
            for (int b = 12; b < 15; ++b) {
                nt::audio::mixBlock(plan, &vp, 48000.0, b * 128 * 1000.0 / 48000.0, 1000.0 / 48000.0, 128, out.data(), st);
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                for (std::size_t f = 0; f < 128; ++f) {
                    minSample = std::min(minSample, out[f * 2]);
                }
            }
            // Dry contribution alone is 0.5 * 0.5 = 0.25. If m_dryDelay was empty (zeros), output drops to 0.0!
            QVERIFY2(minSample >= 0.20f,
                     qPrintable(QStringLiteral("D7 dry-path dropped out on 0->512 latency switch: minSample=%1").arg(minSample)));
        }
    }

    // D9: On VST disconnect/crash mid-stream with 512-sample latency, track 1 must output
    // latency-compensated dry (aligned with sibling track 2 at +512) rather than undelayed dry.
    void d9_vstDisconnectKeepsDryPathLatencyAligned() {
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or GainEffect.vst3 not built in native/vst-host/build");
        }
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

        QJsonObject state512Reply;
        QVERIFY2(client->setParameters(
                     QJsonObject{{"instance", "d9-setup512"}, {"path", gain->path}, {"uid", gain->uid},
                                 {"state", QJsonValue::Null},
                                 {"changes", QJsonArray{QJsonObject{{"index", 0}, {"value", 0.25}},
                                                        QJsonObject{{"index", 1}, {"value", 512.0 / 2048.0}}}}},
                     &state512Reply, &error),
                 qPrintable(error));
        const QString state512 = state512Reply.value("state").toString();
        const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};
        {
            const QJsonObject fx{{"id", "d9-fx"}, {"type", "vst"}, {"enabled", true},
                                 {"plugin", gainRef}, {"state", state512}, {"wet", 0.5}};
            const QJsonObject raw{
                {"id", "tl-d9"}, {"name", "D9"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 1000},
                {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{
                    QJsonObject{{"id", "t1"}, {"name", "VST"}, {"type", "audio"}, {"index", 0},
                                {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fx}}},
                    QJsonObject{{"id", "t2"}, {"name", "Dry"}, {"type", "audio"}, {"index", 1},
                                {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{}}}}},
                {"clips", QJsonArray{
                    QJsonObject{{"id", "c1"}, {"trackId", "t1"}, {"name", "I1"}, {"startMs", 0}, {"durationMs", 1000},
                                {"inPointMs", 0}, {"mediaType", "audio"}, {"status", "generated"}, {"mediaPath", "unused.wav"}},
                    QJsonObject{{"id", "c2"}, {"trackId", "t2"}, {"name", "I2"}, {"startMs", 0}, {"durationMs", 1000},
                                {"inPointMs", 0}, {"mediaType", "audio"}, {"status", "generated"}, {"mediaPath", "unused.wav"}}}}};
            const auto tl = parseRaw(raw);
            auto plan = nt::audio::buildMixPlan(tl);
            nt::audio::prepareMixPlan(plan, 48000.0);
            std::vector<float> imp(std::size_t{4096} * 2, 0.0f);
            imp[std::size_t{1000} * 2] = 0.5f;
            imp[std::size_t{1000} * 2 + 1] = 0.5f;
            nt::audio::VoicePcm vp[2]{};
            vp[0].linear = imp.data(); vp[0].linearCount = 4096;
            vp[1].linear = imp.data(); vp[1].linearCount = 4096;
            std::vector<float> out(std::size_t{2560} * 2, 0.0f);
            nt::audio::MixStats st;
            // Warm up 1 block, then kill the host!
            nt::audio::mixBlock(plan, vp, 48000.0, 0.0, 1000.0 / 48000.0, 128, out.data(), st);
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
            client->terminateHostForTest();
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
            for (int at = 128; at < 2560; at += 128) {
                nt::audio::mixBlock(plan, vp, 48000.0, at * 1000.0 / 48000.0, 1000.0 / 48000.0, 128,
                                    out.data() + static_cast<std::size_t>(at) * 2, st);
            }
            // No unaligned early impulse at frame 1000; both tracks align at frame 1000 + 512 + kAsyncLatencyFrames.
            const std::size_t alignedFrame = static_cast<std::size_t>(1512 + VstLiveChannel::kAsyncLatencyFrames);
            QVERIFY2(std::abs(out[std::size_t{1000} * 2]) < 1e-4f,
                     qPrintable(QStringLiteral("D9 early undelayed passthrough at frame 1000: %1").arg(out[std::size_t{1000} * 2])));
            QVERIFY2(std::abs(out[alignedFrame * 2] - 1.0f) < 1e-3f,
                     qPrintable(QStringLiteral("D9 expected aligned dry sum 1.0 at frame %1, got %2")
                                    .arg(alignedFrame).arg(out[alignedFrame * 2])));
        }
    }

    // D8 & D10: VstDryDelayLine supports runtime latency > 16383 at high sample rates (e.g. 24576 at 192 kHz)
    // and resets in O(1) on discontinuities without stale-buffer leakage or allocations.
    void d8_d10_vstDryDelayLineHighLatencyAndO1Discontinuity() {
        VstDryDelayLine delay;
        // Prepared at 192 kHz with initial latency 0 -> capacity must exceed 24576 (at least 1 s = 192000).
        delay.prepare(192000.0, 0);
        QVERIFY2(delay.capacity() > 24576, qPrintable(QStringLiteral("capacity=%1").arg(delay.capacity())));

        constexpr int kDelay = 24576;
        constexpr int kImpulseAt = 100;
        constexpr int kTotal = 26000;
        std::vector<float> in(std::size_t{128} * 2, 0.0f);
        std::vector<float> out(std::size_t{128} * 2, 0.0f);
        int foundAt = -1;
        float foundVal = 0.0f;
        for (int at = 0; at < kTotal; at += 128) {
            std::fill(in.begin(), in.end(), 0.0f);
            if (kImpulseAt >= at && kImpulseAt < at + 128) {
                const int off = kImpulseAt - at;
                in[static_cast<std::size_t>(off) * 2] = 0.75f;
                in[static_cast<std::size_t>(off) * 2 + 1] = 0.75f;
            }
            delay.process(in, out, kDelay, at == 0);
            for (int f = 0; f < 128; ++f) {
                if (std::abs(out[static_cast<std::size_t>(f) * 2]) > 0.1f) {
                    foundAt = at + f;
                    foundVal = out[static_cast<std::size_t>(f) * 2];
                }
            }
        }
        // D8: exact 24576-sample delay, NOT clamped to 16383.
        QCOMPARE(foundAt, kImpulseAt + kDelay);
        QVERIFY(std::abs(foundVal - 0.75f) < 1e-6f);

        // D10: fill with non-zero audio, then trigger a discontinuity -> must output exact 0.0f for the
        // first `kDelay` frames without stale leakage, and 1000 discontinuous resets must complete fast (< 50 ms).
        std::fill(in.begin(), in.end(), 0.9f);
        delay.process(in, out, 512, false);
        QElapsedTimer timer;
        timer.start();
        std::fill(in.begin(), in.end(), 0.0f);
        for (int i = 0; i < 1000; ++i) {
            delay.process(in, out, 512, true);
            QCOMPARE(delay.validFrames(), std::size_t{128});
            for (float s : out) {
                QCOMPARE(s, 0.0f);
            }
        }
        QVERIFY2(timer.elapsed() < 200,
                 qPrintable(QStringLiteral("1000 discontinuities took %1 ms (expected O(1) reset)").arg(timer.elapsed())));
    }

    // D8: Initial zero latency at 48 kHz followed by a 65536-sample runtime latency must not clamp to 47999.
    void d8_vstDryDelayLine65536At48kHzDoesNotClamp() {
        VstDryDelayLine delay;
        delay.prepare(48000.0, 0);
        constexpr int kDelay = 65536;
        constexpr int kImpulseAt = 100;
        constexpr int kTotal = kImpulseAt + kDelay + 512;
        std::vector<float> in(std::size_t{128} * 2, 0.0f);
        std::vector<float> out(std::size_t{128} * 2, 0.0f);
        int foundAt = -1;
        float foundVal = 0.0f;
        for (int at = 0; at < kTotal; at += 128) {
            std::fill(in.begin(), in.end(), 0.0f);
            if (kImpulseAt >= at && kImpulseAt < at + 128) {
                const int off = kImpulseAt - at;
                in[static_cast<std::size_t>(off) * 2] = 0.75f;
                in[static_cast<std::size_t>(off) * 2 + 1] = 0.75f;
            }
            QVERIFY(delay.process(in, out, kDelay, at == 0));
            for (int f = 0; f < 128; ++f) {
                if (std::abs(out[static_cast<std::size_t>(f) * 2]) > 0.1f) {
                    foundAt = at + f;
                    foundVal = out[static_cast<std::size_t>(f) * 2];
                }
            }
        }
        QCOMPARE(foundAt, kImpulseAt + kDelay);
        QVERIFY(std::abs(foundVal - 0.75f) < 1e-6f);
        QCOMPARE(delay.overflowDelay(), std::size_t{0});

        // Requests beyond preallocated maxDelay() must not clamp silently: process returns false
        // and records the required delay for control-thread inspection without allocating.
        const std::size_t beyond = delay.maxDelay() + 1000;
        QVERIFY(!delay.process(in, out, static_cast<int>(beyond), false));
        QCOMPARE(delay.overflowDelay(), beyond);
    }

    // D8 (round 3): Overflow must NOT clamp to maxDelay() and emit misaligned early dry audio.
    void d8_vstDryDelayLineOverflowDoesNotClamp() {
        VstDryDelayLine delay;
        delay.prepare(48000.0, 0);
        const std::size_t initialMax = delay.maxDelay();
        constexpr int kOverflowDelay = 300000;
        QVERIFY(static_cast<std::size_t>(kOverflowDelay) > initialMax);

        constexpr int kImpulseAt = 100;
        const int kTotal = static_cast<int>(initialMax) + kImpulseAt + 512;
        std::vector<float> in(std::size_t{128} * 2, 0.0f);
        std::vector<float> out(std::size_t{128} * 2, 0.0f);
        int earlyClampedAt = -1;
        float earlyClampedVal = 0.0f;
        for (int at = 0; at < kTotal; at += 128) {
            std::fill(in.begin(), in.end(), 0.0f);
            if (kImpulseAt >= at && kImpulseAt < at + 128) {
                const int off = kImpulseAt - at;
                in[static_cast<std::size_t>(off) * 2] = 0.75f;
                in[static_cast<std::size_t>(off) * 2 + 1] = 0.75f;
            }
            QVERIFY(!delay.process(in, out, kOverflowDelay, at == 0));
            for (int f = 0; f < 128; ++f) {
                const float v = std::abs(out[static_cast<std::size_t>(f) * 2]);
                if (v > 1e-4f && earlyClampedAt < 0) {
                    earlyClampedAt = at + f;
                    earlyClampedVal = out[static_cast<std::size_t>(f) * 2];
                }
            }
        }
        QCOMPARE(delay.overflowDelay(), std::size_t{kOverflowDelay});
        QVERIFY2(earlyClampedAt < 0,
                 qPrintable(QStringLiteral("D8 overflow clamped and emitted misaligned dry %1 at frame %2 (maxDelay=%3)")
                                .arg(earlyClampedVal).arg(earlyClampedAt).arg(initialMax)));

        // Control/worker thread services overflow off the audio thread, publishing a grown ring.
        QVERIFY(delay.serviceOverflow());
        QCOMPARE(delay.overflowDelay(), std::size_t{0});

        // Audio thread adopts the grown ring in O(1) and produces exact 300000-sample delay.
        int foundAt = -1;
        float foundVal = 0.0f;
        const int kGrownTotal = kImpulseAt + kOverflowDelay + 512;
        for (int at = 0; at < kGrownTotal; at += 128) {
            std::fill(in.begin(), in.end(), 0.0f);
            if (kImpulseAt >= at && kImpulseAt < at + 128) {
                const int off = kImpulseAt - at;
                in[static_cast<std::size_t>(off) * 2] = 0.75f;
                in[static_cast<std::size_t>(off) * 2 + 1] = 0.75f;
            }
            QVERIFY(delay.process(in, out, kOverflowDelay, at == 0));
            for (int f = 0; f < 128; ++f) {
                const float v = std::abs(out[static_cast<std::size_t>(f) * 2]);
                if (v > 0.1f && foundAt < 0) {
                    foundAt = at + f;
                    foundVal = out[static_cast<std::size_t>(f) * 2];
                }
            }
        }
        QCOMPARE(foundAt, kImpulseAt + kOverflowDelay);
        QVERIFY(std::abs(foundVal - 0.75f) < 1e-6f);
        // Reclaim the retired ring off-thread.
        QVERIFY(!delay.serviceOverflow());

        // Verify production MixPlan control-thread maintenance hook reaches processors.
        struct ServiceProbe final : nt::audio::BlockProcessor {
            int calls = 0;
            void process(std::span<float>, const nt::audio::BlockContext&) noexcept override {}
            void serviceControlThread() override { ++calls; }
        };
        auto probe = std::make_shared<ServiceProbe>();
        nt::audio::MixPlan plan;
        nt::audio::TrackPlan tp;
        tp.processors.push_back(probe);
        plan.tracks.push_back(std::move(tp));
        nt::audio::serviceMixPlanControl(plan);
        QCOMPARE(probe->calls, 1);
    }

    // DSP1b: Offline export must re-probe latency on a pooled live VST channel even when
    // the plug-in's latency changed in the host after opening at the same sample rate.
    void dsp1b_offlineExportReprobesPooledVstLatency() {
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or GainEffect.vst3 not built in native/vst-host/build");
        }
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

        QJsonObject state0Reply, state512Reply;
        QVERIFY2(client->setParameters(
                     QJsonObject{{"instance", "dsp1b-setup0"}, {"path", gain->path}, {"uid", gain->uid},
                                 {"state", QJsonValue::Null},
                                 {"changes", QJsonArray{QJsonObject{{"index", 0}, {"value", 0.25}},
                                                        QJsonObject{{"index", 1}, {"value", 0.0}}}}},
                     &state0Reply, &error),
                 qPrintable(error));
        QVERIFY2(client->setParameters(
                     QJsonObject{{"instance", "dsp1b-setup512"}, {"path", gain->path}, {"uid", gain->uid},
                                 {"state", QJsonValue::Null},
                                 {"changes", QJsonArray{QJsonObject{{"index", 0}, {"value", 0.25}},
                                                        QJsonObject{{"index", 1}, {"value", 512.0 / 2048.0}}}}},
                     &state512Reply, &error),
                 qPrintable(error));
        const QString state0 = state0Reply.value("state").toString();
        const QString state512 = state512Reply.value("state").toString();
        const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};

        QTemporaryDir tmp;
        QVERIFY(tmp.isValid());
        const QString wavPath = tmp.filePath(QStringLiteral("imp_reprobe.wav"));
        constexpr int kFrames = 8192;
        constexpr int kImpulseFrame = 1000;
        std::vector<float> impulse(std::size_t{kFrames} * 2, 0.0f);
        impulse[std::size_t{kImpulseFrame} * 2] = 0.5f;
        impulse[std::size_t{kImpulseFrame} * 2 + 1] = 0.5f;
        QVERIFY(writeStereoFloatWav(wavPath, 48000, impulse));

        auto makeTl = [&](const QString& state) {
            const QJsonObject fx{{"id", "reprobe-fx"}, {"type", "vst"}, {"enabled", true},
                                 {"plugin", gainRef}, {"state", state}, {"wet", 1.0}};
            const QJsonObject raw{
                {"id", "tl-dsp1b-reprobe"}, {"name", "DSP1b Reprobe"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                {"durationMs", 200}, {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{
                    QJsonObject{{"id", "t1"}, {"name", "VST"}, {"type", "audio"}, {"index", 0},
                                {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fx}}},
                    QJsonObject{{"id", "t2"}, {"name", "Dry"}, {"type", "audio"}, {"index", 1},
                                {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{}}}}},
                {"clips", QJsonArray{
                    QJsonObject{{"id", "c1"}, {"trackId", "t1"}, {"name", "I1"}, {"startMs", 0}, {"durationMs", 200},
                                {"inPointMs", 0}, {"mediaType", "audio"}, {"status", "generated"}, {"mediaPath", wavPath}},
                    QJsonObject{{"id", "c2"}, {"trackId", "t2"}, {"name", "I2"}, {"startMs", 0}, {"durationMs", 200},
                                {"inPointMs", 0}, {"mediaType", "audio"}, {"status", "generated"}, {"mediaPath", wavPath}}}}};
            return parseRaw(raw);
        };

        // 1. Open and pool the channel at 48 kHz with initial latency = 0.
        const auto firstOut = nt::audio::renderOffline(makeTl(state0), 48000, 0, 200);
        QVERIFY2(std::abs(firstOut[std::size_t{kImpulseFrame} * 2] - 0.75f) < 1e-3f,
                 qPrintable(QStringLiteral("baseline 0-latency render peak=%1").arg(firstOut[std::size_t{kImpulseFrame} * 2])));

        // 2. Mutate the live plug-in instance's latency in the host to 512 while keeping the timeline's
        //    `state` IDENTICAL to state0 (and stale the channel's cached latency back to 0).
        //    Verify reprobeMixPlanLatency() discovers 512 on the live plan WITHOUT flipping it to offline,
        //    AND verify renderOffline() uses an isolated offline channel without disturbing `pooled`.
        {
            const auto livePlan = nt::audio::buildMixPlan(makeTl(state0));
            nt::audio::prepareMixPlan(livePlan, 48000.0);
            auto pooled = sharedVstLivePool().acquire(*client, QStringLiteral("fx:t1:reprobe-fx"),
                                                      gain->path, gain->uid, state0, 48000.0, &error);
            QVERIFY2(pooled && pooled->connected(), qPrintable(error));
            QCOMPARE(pooled->appliedState(), state0);
            QVERIFY2(client->setLiveState(QStringLiteral("fx:t1:reprobe-fx"), state512, &error), qPrintable(error));
            QTRY_COMPARE_WITH_TIMEOUT(pooled->latencySamples(), 512, 2000);
            // Reset local cached latency to 0 to prove reprobeMixPlanLatency fetches 512 from the host.
            pooled->setLatencySamples(0);
            QCOMPARE(pooled->latencySamples(), 0);
            QCOMPARE(pooled->appliedState(), state0);

            nt::audio::reprobeMixPlanLatency(livePlan, 48000.0);
            QCOMPARE(pooled->latencySamples(), 512);
            QCOMPARE(nt::audio::planLatencySamples(livePlan), 512 + VstLiveChannel::kAsyncLatencyFrames);

            // Offline render uses its own isolated channel (D11) and compensates state512's 512-sample latency.
            const auto secondOut = nt::audio::renderOffline(makeTl(state512), 48000, 0, 200);
            QVERIFY2(std::abs(secondOut[std::size_t{kImpulseFrame} * 2] - 0.75f) < 1e-3f,
                     qPrintable(QStringLiteral("reprobed offline render misaligned at frame 1000: got %1 expected 0.75")
                                    .arg(secondOut[std::size_t{kImpulseFrame} * 2])));
            QVERIFY2(std::abs(secondOut[std::size_t{kImpulseFrame + 512} * 2]) < 1e-4f,
                     qPrintable(QStringLiteral("uncompensated ghost at +512 after offline render: %1")
                                    .arg(secondOut[std::size_t{kImpulseFrame + 512} * 2])));
            // Isolated offline render with state0 must NOT mutate or disturb the live pooled channel (still 512).
            (void)nt::audio::renderOffline(makeTl(state0), 48000, 0, 200);
            QCOMPARE(pooled->latencySamples(), 512);
        }

        // 2b. D4: Continuous-sine live bypass/un-bypass on VstLiveEffectProcessor (wet == 1.0, 512 latency)
        //     must produce neither a hard click nor a 512-sample mute hole on un-bypass.
        {
            const auto tlActive = makeTl(state512);
            const auto plan = nt::audio::buildMixPlan(tlActive);
            nt::audio::prepareMixPlan(plan, 48000.0);
            QVERIFY(!plan.tracks.empty() && !plan.tracks[0].processors.empty());
            auto fxProc = plan.tracks[0].processors[0];

            constexpr int kSineFrames = 8192;
            std::vector<float> sine(std::size_t{kSineFrames} * 2, 0.0f);
            for (int i = 0; i < kSineFrames; ++i) {
                const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / 48000.0));
                sine[static_cast<std::size_t>(i) * 2] = s;
                sine[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            std::vector<float> processed(std::size_t{kSineFrames} * 2, 0.0f);
            for (int at = 0; at < kSineFrames; at += 128) {
                if (at == 2048) fxProc->setBypassed(true);
                if (at == 4096) fxProc->setBypassed(false);
                auto blk = std::span<float>(processed.data() + static_cast<std::size_t>(at) * 2, 128 * 2);
                std::copy_n(sine.data() + static_cast<std::size_t>(at) * 2, 128 * 2, blk.data());
                nt::audio::BlockContext ctx{48000.0, static_cast<double>(at) * 1000.0 / 48000.0,
                                            1000.0 / 48000.0, false, 0};
                (void)fxProc->processBlock(blk, ctx);
                std::this_thread::sleep_for(std::chrono::microseconds(500));
            }
            for (int boundary : {2048, 4096}) {
                float maxStep = 0.0f;
                for (int f = boundary - 8; f < boundary + 640; ++f) {
                    const float step = std::abs(processed[static_cast<std::size_t>(f) * 2] -
                                                processed[static_cast<std::size_t>(f - 1) * 2]);
                    maxStep = std::max(maxStep, step);
                }
                QVERIFY2(maxStep < 0.08f,
                         qPrintable(QStringLiteral("D4 VST bypass/un-bypass click at frame %1: maxStep=%2")
                                        .arg(boundary).arg(maxStep)));
            }
            // No 512-sample mute hole after un-bypass at frame 4096.
            float postUnbypassPeak = 0.0f;
            for (int f = 4096 + 64; f < 4096 + 448; ++f) {
                postUnbypassPeak = std::max(postUnbypassPeak, std::abs(processed[static_cast<std::size_t>(f) * 2]));
            }
            QVERIFY2(postUnbypassPeak > 0.1f,
                     qPrintable(QStringLiteral("D4 VST un-bypass mute hole: peak=%1").arg(postUnbypassPeak)));
        }

        // 2c. D9: Closing an older channel for the same instance key must not unregister a newer channel.
        {
            const QString key = QStringLiteral("fx:d9-replace");
            auto ch1 = VstLiveChannel::open(*client, key, gain->path, gain->uid, state0, 48000.0, &error);
            QVERIFY2(ch1 && ch1->connected(), qPrintable(error));
            auto ch2 = VstLiveChannel::open(*client, key, gain->path, gain->uid, state0, 48000.0, &error);
            QVERIFY2(ch2 && ch2->connected(), qPrintable(error));
            // Old channel closes after replacement ch2 has already registered under `key`.
            ch1->close(client.get());
            QVERIFY2(client->setLiveState(key, state512, &error), qPrintable(error));
            QTRY_COMPARE_WITH_TIMEOUT(ch2->latencySamples(), 512, 2000);

            // 2d. D10: Monotonic latency generation rejects stale SHM / setLiveState values.
            const std::uint64_t currentGen = ch2->latencyGeneration();
            QVERIFY(currentGen >= 2);
            QVERIFY(!ch2->updateLatency(0, currentGen - 1));
            QCOMPARE(ch2->latencySamples(), 512);
            QVERIFY(ch2->updateLatency(256, currentGen + 1));
            QCOMPARE(ch2->latencySamples(), 256);
            QVERIFY(!ch2->updateLatency(0, currentGen));
            QCOMPARE(ch2->latencySamples(), 256);
            ch2->close(client.get());
        }

        // 3. Host `latencyChanged` event updates VstLiveChannel::latencySamples() and emits
        //    VstHostClient::pluginLatencyChanged; bypassing the VST effect via live AudioEngine
        //    setTimeline drops PDC latency to 0 and keeps tracks aligned without clicks.
        {
            QSignalSpy latencySpy(client.get(), &VstHostClient::pluginLatencyChanged);
            auto ch = sharedVstLivePool().acquire(*client, QStringLiteral("fx:t1:reprobe-fx"),
                                                  gain->path, gain->uid, state0, 48000.0, &error);
            QVERIFY2(ch && ch->connected(), qPrintable(error));
            QCOMPARE(ch->latencySamples(), 0);
            QVERIFY2(client->setLiveState(QStringLiteral("fx:t1:reprobe-fx"), state512, &error), qPrintable(error));
            QTRY_COMPARE_WITH_TIMEOUT(ch->latencySamples(), 512, 2000);
            QTRY_VERIFY_WITH_TIMEOUT(
                latencySpy.count() >= 1 &&
                    latencySpy.last().at(0).toString() == QStringLiteral("fx:t1:reprobe-fx") &&
                    latencySpy.last().at(1).toInt() == 512,
                2000);

            // Live AudioEngine bypass toggle on VST effect: PDC drops 512 -> 0 -> 512 in place!
            auto activeTl = std::make_shared<nt::Timeline>(makeTl(state512));
            auto bypassedRaw = activeTl->raw;
            auto tracks = bypassedRaw.value(u"tracks").toArray();
            auto t0 = tracks[0].toObject();
            auto fxArr = t0.value(u"effects").toArray();
            auto fxObj = fxArr[0].toObject();
            fxObj.insert(QStringLiteral("enabled"), false);
            fxArr[0] = fxObj;
            t0.insert(QStringLiteral("effects"), fxArr);
            tracks[0] = t0;
            bypassedRaw.insert(QStringLiteral("tracks"), tracks);
            auto bypassedTl = std::make_shared<nt::Timeline>(parseRaw(bypassedRaw));

            nt::audio::AudioEngine engine;
            engine.setTimeline(activeTl);
            nt::audio::AudioEngine::Options opts;
            opts.backend = nt::audio::AudioEngine::Backend::Manual;
            opts.sampleRate = 48000;
            std::string startErr;
            QVERIFY2(engine.start(opts, &startErr), startErr.c_str());
            nt::playback::TransportCommand cmd;
            cmd.seq = 1; cmd.playing = true; cmd.rate = 1.0; cmd.seekSeq = 1; cmd.seekMs = 0.0;
            engine.feed().command.store(cmd);
            QTRY_VERIFY(engine.stats().sessions >= 1);
            QTest::qWait(60);
            const int expectedLivePdc = 512 + VstLiveChannel::kAsyncLatencyFrames;
            std::vector<float> blk(std::size_t{480} * 2, 0.0f);
            engine.renderManual(blk, 0);
            QCOMPARE(engine.stats().pdcLatencyFrames, expectedLivePdc);
            const auto buildsBeforeBypass = engine.stats().planBuilds;
            // Pause and bypass: workerLoop must keep pdcLatencyFrames at 0 even before next audio block.
            cmd.seq = 2; cmd.playing = false;
            engine.feed().command.store(cmd);
            engine.setTimeline(bypassedTl);
            QTest::qWait(30);
            QCOMPARE(engine.stats().pdcLatencyFrames, 0);
            QCOMPARE(engine.stats().planBuilds, buildsBeforeBypass);
            // Resume while bypassed, then re-enable live.
            cmd.seq = 3; cmd.playing = true;
            engine.feed().command.store(cmd);
            engine.renderManual(blk, 10'000'000LL);
            QCOMPARE(engine.stats().pdcLatencyFrames, 0);
            engine.setTimeline(activeTl);
            engine.renderManual(blk, 20'000'000LL);
            QCOMPARE(engine.stats().pdcLatencyFrames, expectedLivePdc);
            QCOMPARE(engine.stats().planBuilds, buildsBeforeBypass);
            engine.stop();
        }
    }

    // C4: Continuous dry-path latency overflow (> prepared capacity) must NOT hard-mute or
    // discard history on adoption; it must retain/drain the old ring while filling the new ring
    // and crossfade cleanly once ready, for both wet=0 (dry-only) and mixed wet/dry.
    void c4_vstDryDelayContinuousOverflowRetainsHistoryAndCrossfades() {
        // Part A: Direct VstDryDelayLine continuous overflow -> serviceOverflow -> drain -> crossfade.
        {
            VstDryDelayLine delay;
            delay.prepare(48000.0, 0);
            constexpr int kOverflowDelay = 300000;
            QVERIFY(static_cast<std::size_t>(kOverflowDelay) > delay.maxDelay());

            constexpr int kJumpAt = 2048;
            constexpr int kServiceAt = 2560;  // 4 blocks in overflow before control thread grows ring
            constexpr int kTotal = kServiceAt + kOverflowDelay + 2048;
            std::vector<float> sine(std::size_t{kTotal} * 2, 0.0f);
            for (int i = 0; i < kTotal; ++i) {
                const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / 48000.0));
                sine[static_cast<std::size_t>(i) * 2] = s;
                sine[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
            for (int at = 0; at < kTotal; at += 128) {
                if (at == kServiceAt) {
                    QCOMPARE(delay.overflowDelay(), std::size_t{kOverflowDelay});
                    QVERIFY(delay.serviceOverflow());
                    QCOMPARE(delay.overflowDelay(), std::size_t{0});
                }
                const int target = (at < kJumpAt) ? 512 : kOverflowDelay;
                const auto inSpan = std::span<const float>(sine.data() + static_cast<std::size_t>(at) * 2, 128 * 2);
                const auto outSpan = std::span<float>(out.data() + static_cast<std::size_t>(at) * 2, 128 * 2);
                const bool ok = delay.process(inSpan, outSpan, target, at == 0);
                if (at >= kJumpAt && at < kServiceAt) {
                    QVERIFY(!ok);
                } else if (at >= kServiceAt) {
                    QVERIFY(ok);
                }
            }
            // Reclaim retired ring off-thread.
            QVERIFY(!delay.serviceOverflow());

            float maxStep = 0.0f;
            int silentBlocks = 0;
            for (int at = 1024; at < kTotal - 128; at += 128) {
                float blockPeak = 0.0f;
                for (int f = 0; f < 128; ++f) {
                    const int idx = at + f;
                    const float cur = out[static_cast<std::size_t>(idx) * 2];
                    const float prev = out[static_cast<std::size_t>(idx - 1) * 2];
                    maxStep = std::max(maxStep, std::abs(cur - prev));
                    blockPeak = std::max(blockPeak, std::abs(cur));
                }
                if (blockPeak < 0.05f) {
                    ++silentBlocks;
                }
            }
            QVERIFY2(silentBlocks == 0,
                     qPrintable(QStringLiteral("C4 VstDryDelayLine continuous overflow had %1 silent blocks").arg(silentBlocks)));
            QVERIFY2(maxStep < 0.08f,
                     qPrintable(QStringLiteral("C4 VstDryDelayLine continuous overflow clicked: maxStep=%1").arg(maxStep)));

            // Verify the grown ring delays a fresh impulse by exact kOverflowDelay samples.
            std::vector<float> impIn(std::size_t{128} * 2, 0.0f);
            std::vector<float> impOut(std::size_t{128} * 2, 0.0f);
            constexpr int kImpAt = 100;
            int foundAt = -1;
            float foundVal = 0.0f;
            for (int at = 0; at < kImpAt + kOverflowDelay + 512; at += 128) {
                std::fill(impIn.begin(), impIn.end(), 0.0f);
                if (kImpAt >= at && kImpAt < at + 128) {
                    const int off = kImpAt - at;
                    impIn[static_cast<std::size_t>(off) * 2] = 0.75f;
                    impIn[static_cast<std::size_t>(off) * 2 + 1] = 0.75f;
                }
                QVERIFY(delay.process(impIn, impOut, kOverflowDelay, at == 0));
                for (int f = 0; f < 128; ++f) {
                    if (std::abs(impOut[static_cast<std::size_t>(f) * 2]) > 0.1f && foundAt < 0) {
                        foundAt = at + f;
                        foundVal = impOut[static_cast<std::size_t>(f) * 2];
                    }
                }
            }
            QCOMPARE(foundAt, kImpAt + kOverflowDelay);
            QVERIFY(std::abs(foundVal - 0.75f) < 1e-6f);
        }

        // Part B: End-to-end VstLiveEffectProcessor continuous overflow for wet=0.0 (dry-only) and wet=0.5 (mixed).
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or GainEffect.vst3 not built in native/vst-host/build");
        }
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

        QJsonObject state0Reply;
        QVERIFY2(client->setParameters(
                     QJsonObject{{"instance", "c4-setup0"}, {"path", gain->path}, {"uid", gain->uid},
                                 {"state", QJsonValue::Null},
                                 {"changes", QJsonArray{QJsonObject{{"index", 0}, {"value", 0.25}},
                                                        QJsonObject{{"index", 1}, {"value", 0.0}}}}},
                     &state0Reply, &error),
                 qPrintable(error));
        const QString state0 = state0Reply.value("state").toString();
        const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};

        for (const double wet : {0.0, 0.5}) {
            const QString fxId = wet == 0.0 ? QStringLiteral("c4-dry") : QStringLiteral("c4-mix");
            const QString instanceKey = QStringLiteral("fx:a1:") + fxId;
            const auto cleanup = qScopeGuard([&] { sharedVstLivePool().closeInstance(instanceKey, client.get()); });

            const QJsonObject fx{{"id", fxId}, {"type", "vst"}, {"enabled", true},
                                 {"plugin", gainRef}, {"state", state0}, {"wet", wet}};
            const QJsonObject raw{
                {"id", "tl-c4"}, {"name", "C4"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 2000},
                {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{QJsonObject{{"id", "a1"}, {"name", "A1"}, {"type", "audio"}, {"index", 0},
                                                  {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fx}}}}},
                {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "a1"}, {"name", "Sine"}, {"startMs", 0},
                                                 {"durationMs", 2000}, {"inPointMs", 0}, {"mediaType", "audio"},
                                                 {"status", "generated"}, {"mediaPath", "unused.wav"}}}}};
            const auto tl = parseRaw(raw);
            auto plan = nt::audio::buildMixPlan(tl);
            nt::audio::prepareMixPlan(plan, 48000.0);
            auto ch = sharedVstLivePool().acquire(*client, instanceKey, gain->path, gain->uid, state0, 48000.0, &error);
            QVERIFY2(ch && ch->connected(), qPrintable(error));

            constexpr int kJumpAt = 2048;
            constexpr int kServiceAt = 3072;
            constexpr int kTotal = 6144;
            std::vector<float> sine(std::size_t{kTotal} * 2, 0.0f);
            for (int i = 0; i < kTotal; ++i) {
                const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / 48000.0));
                sine[static_cast<std::size_t>(i) * 2] = s;
                sine[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            nt::audio::VoicePcm vp{};
            vp.linear = sine.data();
            vp.linearCount = kTotal;
            std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
            nt::audio::MixStats st;

            for (int at = 0; at < kTotal; at += 128) {
                if (at == kJumpAt) {
                    // Simulate a live plug-in latency jump beyond the prepared dry-ring capacity (262144).
                    QVERIFY(ch->updateLatency(300000, ch->latencyGeneration() + 1000));
                }
                if (at == kServiceAt) {
                    nt::audio::serviceMixPlanControl(plan);
                }
                nt::audio::mixBlock(plan, &vp, 48000.0, at * 1000.0 / 48000.0, 1000.0 / 48000.0, 128,
                                    out.data() + static_cast<std::size_t>(at) * 2, st);
                std::this_thread::sleep_for(std::chrono::microseconds(500));
            }

            const double inputRms = rmsInterleaved(sine, kJumpAt, kTotal);
            const double overflowRms = rmsInterleaved(out, kJumpAt, kServiceAt);
            const double adoptedRms = rmsInterleaved(out, kServiceAt, kTotal);
            const double expectedRatio = (wet == 0.0) ? 1.0 : 0.75;
            QVERIFY2(overflowRms > (expectedRatio - 0.15) * inputRms,
                     qPrintable(QStringLiteral("C4 wet=%1 dropped dry during overflow: rms=%2 input=%3")
                                    .arg(wet).arg(overflowRms).arg(inputRms)));
            QVERIFY2(adoptedRms > (expectedRatio - 0.15) * inputRms,
                     qPrintable(QStringLiteral("C4 wet=%1 dropped dry after ring adoption: rms=%2 input=%3")
                                    .arg(wet).arg(adoptedRms).arg(inputRms)));

            float maxStep = 0.0f;
            for (int f = kJumpAt - 8; f < kTotal; ++f) {
                const float step = std::abs(out[static_cast<std::size_t>(f) * 2] -
                                            out[static_cast<std::size_t>(f - 1) * 2]);
                maxStep = std::max(maxStep, step);
            }
            QVERIFY2(maxStep < 0.08f,
                     qPrintable(QStringLiteral("C4 wet=%1 clicked across overflow/adoption: maxStep=%2")
                                    .arg(wet).arg(maxStep)));
        }
    }

    // SHM v2/v3 version mismatch integration test in both directions:
    // 1. v2 client -> v3 host: real NodeToolVstHost rejects v2 SHM header cleanly and stays healthy.
    // 2. v3 client -> v2 host: real VstLiveChannel::open fails cleanly when a v2 host rejects v3.
    void shmVersionMismatchRejectedInBothDirections() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or GainEffect.vst3 not built in native/vst-host/build");
        }

        // Direction 1: v2 client -> real v3 host (tst_vsthostprotocol).
        {
            VstHostClient client;
            client.setOverrideExecutable(hostExe);
            client.setExtraScanDirs({QFileInfo(gainVst).absolutePath()});
            std::vector<VstPluginInfo> plugins;
            QString error;
            QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
            const VstPluginInfo* gain = nullptr;
            for (const auto& p : plugins) {
                if (QFileInfo(p.path).canonicalFilePath() == gainVst) gain = &p;
            }
            QVERIFY(gain != nullptr);

            const QString tag = QUuid::createUuid().toString(QUuid::Id128).left(16);
            const QString shmPath = QDir::temp().filePath(QStringLiteral("ntv-v2-%1.bin").arg(tag));
            const QString sockPath = QStringLiteral("/tmp/ntv-v2-%1.sock").arg(tag);
            const auto cleanupFiles = qScopeGuard([&] {
                ::unlink(shmPath.toUtf8().constData());
                ::unlink(sockPath.toUtf8().constData());
            });

            // Create a v2-sized SHM file (HEAD's v2 ShmHeader was 64 bytes smaller than v3) with version = 2.
            const std::size_t v2Size = sizeof(vsthost::ShmBuffer) - 64;
            const int shmFd = ::open(shmPath.toUtf8().constData(), O_CREAT | O_RDWR | O_EXCL, 0600);
            QVERIFY(shmFd >= 0);
            const auto closeShm = qScopeGuard([shmFd] { ::close(shmFd); });
            QCOMPARE(::ftruncate(shmFd, static_cast<off_t>(v2Size)), 0);
            void* raw = ::mmap(nullptr, v2Size, PROT_READ | PROT_WRITE, MAP_SHARED, shmFd, 0);
            QVERIFY(raw != MAP_FAILED);
            const auto unmapShm = qScopeGuard([raw] { ::munmap(raw, v2Size); });
            std::memset(raw, 0, v2Size);
            auto* header = static_cast<vsthost::ShmHeader*>(raw);
            header->magic = vsthost::kShmMagic;
            header->version = 2u;  // v2 client talking to v3 host
            header->maxFrames = vsthost::kShmMaxFrames;

            const int listenFd = ::socket(AF_UNIX, SOCK_STREAM, 0);
            QVERIFY(listenFd >= 0);
            const auto closeListen = qScopeGuard([listenFd] { ::close(listenFd); });
            sockaddr_un addr{};
            addr.sun_family = AF_UNIX;
            const QByteArray sockUtf8 = sockPath.toUtf8();
            QVERIFY(static_cast<std::size_t>(sockUtf8.size()) < sizeof(addr.sun_path));
            ::unlink(sockUtf8.constData());
            std::memcpy(addr.sun_path, sockUtf8.constData(), static_cast<std::size_t>(sockUtf8.size()) + 1);
            QCOMPARE(::bind(listenFd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)), 0);
            QCOMPARE(::listen(listenFd, 1), 0);

            const std::uint64_t epochBefore = client.hostEpoch();
            int latency = -1;
            error.clear();
            const bool opened = client.openLive(QStringLiteral("fx:shm-v2-mismatch"), gain->path, gain->uid, {},
                                                48000.0, static_cast<int>(vsthost::kShmMaxFrames),
                                                shmPath, sockPath, &latency, &error, 10000);
            QVERIFY2(!opened, "v3 host must reject v2 SHM header");
            QVERIFY2(error.contains(QStringLiteral("Shared memory header mismatch")), qPrintable(error));
            QCOMPARE(client.hostEpoch(), epochBefore);

            // Host must reject before connecting to the audio socket.
            pollfd pfd{};
            pfd.fd = listenFd;
            pfd.events = POLLIN;
            QCOMPARE(::poll(&pfd, 1, 50), 0);

            // Host remains healthy for a subsequent valid v3 live channel.
            error.clear();
            auto v3Channel = VstLiveChannel::open(client, QStringLiteral("fx:shm-v3-ok"), gain->path, gain->uid,
                                                  {}, 48000.0, &error);
            QVERIFY2(v3Channel && v3Channel->connected(), qPrintable(error));
            std::vector<float> block(std::size_t{128} * 2, 0.5f);
            QVERIFY(v3Channel->processBlock(block, {}, 48000.0, true, 500));
            QVERIFY(std::abs(block[0] - 0.25f) < 1e-4f);
            v3Channel->close(&client);
        }

        // Direction 2: real v3 client (VstLiveChannel::open) -> v2 host.
        {
            QTemporaryDir dir;
            QVERIFY(dir.isValid());
            QFile v2Host(dir.filePath(QStringLiteral("v2-host")));
            QVERIFY(v2Host.open(QIODevice::WriteOnly));
            v2Host.write(R"PY(#!/usr/bin/env python3
import json, os, struct, sys
K_MAGIC = 0x4E545653
K_V2 = 2
for line in sys.stdin:
    req = json.loads(line)
    cmd = req.get('cmd')
    if cmd == 'quit':
        break
    if cmd == 'openLive':
        shm_path = req['shmPath']
        sock_path = req['sockPath']
        with open(shm_path, 'rb') as f:
            magic, version, max_frames = struct.unpack('<III', f.read(12))
        seen = dict(magic=magic, version=version, maxFrames=max_frames,
                    size=os.path.getsize(shm_path), shmPath=shm_path, sockPath=sock_path)
        with open(__file__ + '.seen', 'w') as out:
            json.dump(seen, out)
        if magic != K_MAGIC or version != K_V2:
            print(json.dumps(dict(id=req['id'], ok=False, error='Shared memory header mismatch')), flush=True)
            continue
    print(json.dumps(dict(id=req['id'], ok=True)), flush=True)
)PY");
            v2Host.close();
            QVERIFY(v2Host.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner));

            VstHostClient v2Client;
            v2Client.setOverrideExecutable(v2Host.fileName());
            QString error;
            auto ch = VstLiveChannel::open(v2Client, QStringLiteral("fx:shm-v3-to-v2"), QStringLiteral("/dummy.vst3"),
                                           QStringLiteral("dummy"), {}, 48000.0, &error);
            QVERIFY2(!ch, "v3 client must fail cleanly when v2 host rejects v3 SHM header");
            QVERIFY2(error.contains(QStringLiteral("Shared memory header mismatch")), qPrintable(error));

            QFile seenFile(v2Host.fileName() + QStringLiteral(".seen"));
            QVERIFY(seenFile.open(QIODevice::ReadOnly));
            const QJsonObject seen = QJsonDocument::fromJson(seenFile.readAll()).object();
            QCOMPARE(static_cast<std::uint32_t>(seen.value(QStringLiteral("magic")).toInteger()), vsthost::kShmMagic);
            QCOMPARE(static_cast<std::uint32_t>(seen.value(QStringLiteral("version")).toInteger()), vsthost::kShmVersion);
            QCOMPARE(static_cast<std::size_t>(seen.value(QStringLiteral("size")).toInteger()), sizeof(vsthost::ShmBuffer));
            // Client must unlink temporary shm and socket paths on rejection.
            QVERIFY(!QFileInfo::exists(seen.value(QStringLiteral("shmPath")).toString()));
            QVERIFY(!QFileInfo::exists(seen.value(QStringLiteral("sockPath")).toString()));
        }
#endif
    }

    // VST2 (C3/F1 + F2): Headless stress test with ToneInstrument injecting 35 ms host delays.
    // Asserts: callback never blocks past a small bound, channel never disconnects permanently,
    // no permanent silence after delays, and underrun transitions fade smoothly without clicks.
    void vst2_hostDelayStressNoCallbackStallNoPermanentSilenceAndFadeConcealment() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        // Inject 35 ms host stalls (> old 25 ms timeout) every 30 blocks starting at block 15.
        qputenv("NT_TONE_INJECT_DELAY_MS", "35");
        qputenv("NT_TONE_INJECT_DELAY_EVERY", "30");
        qputenv("NT_TONE_INJECT_DELAY_START", "15");
        const auto restoreEnv = qScopeGuard([] {
            qunsetenv("NT_TONE_INJECT_DELAY_MS");
            qunsetenv("NT_TONE_INJECT_DELAY_EVERY");
            qunsetenv("NT_TONE_INJECT_DELAY_START");
        });

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        const QJsonObject toneRef{{"uid", tone->uid}, {"name", tone->name}, {"vendor", tone->vendor}, {"path", tone->path}};
        const QJsonObject raw{
            {"id", "tl-vst2-stress"}, {"name", "VST2 Stress"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
            {"durationMs", 2000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
            {"tracks", QJsonArray{
                QJsonObject{{"id", "m1"}, {"name", "Synth"}, {"type", "midi"}, {"index", 0},
                            {"volumeDb", 0}, {"pan", 0}, {"muted", false}, {"solo", false},
                            {"instrument", QJsonObject{{"type", "vst"}, {"plugin", toneRef}, {"state", QJsonValue::Null}, {"gainDb", 0}}},
                            {"effects", QJsonArray{}}}}},
            {"clips", QJsonArray{
                QJsonObject{{"id", "c1"}, {"trackId", "m1"}, {"name", "Hold"}, {"startMs", 0}, {"durationMs", 2000},
                            {"inPointMs", 0}, {"outPointMs", 2000}, {"mediaType", "midi"}, {"sourceType", "generated"},
                            {"status", "ready"}, {"locked", false},
                            {"notes", QJsonArray{QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 110},
                                                             {"startTick", 0}, {"durationTick", 3840}}}}}}}};
        const auto tl = parseRaw(raw);
        // Build base plan without triggering global sharedVstHostClient stage, then attach isolated client/pool.
        QJsonObject rawNoInst = raw;
        auto noInstTracks = rawNoInst.value(u"tracks").toArray();
        auto noInstTrack0 = noInstTracks[0].toObject();
        noInstTrack0.remove(QStringLiteral("instrument"));
        noInstTracks[0] = noInstTrack0;
        rawNoInst.insert(QStringLiteral("tracks"), noInstTracks);
        nt::audio::MixPlan plan = nt::audio::buildMixPlan(parseRaw(rawNoInst));
        for (auto& trackPlan : plan.tracks) {
            trackPlan.processors.clear();
        }
        VstLivePool pool;
        runVstInstrumentsStage(tl, plan, client, pool);
        // Force prepareMixPlan to run at 48000 Hz after attaching the isolated VST processor.
        nt::audio::prepareMixPlan(plan, 44100.0);
        nt::audio::prepareMixPlan(plan, 48000.0);

        auto ch = pool.acquire(client, QStringLiteral("inst:m1"), tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));
        // C3/F1: live VST instrument must report the added async pipeline block latency to PDC.
        QCOMPARE(nt::audio::planLatencySamples(plan), VstLiveChannel::kAsyncLatencyFrames);

        constexpr int kBlocks = 140;
        constexpr int kBlockFrames = 128;
        std::vector<float> recorded(static_cast<std::size_t>(kBlocks) * kBlockFrames * 2, 0.0f);
        double maxCallbackMs = 0.0;
        int overBound = 0;
        nt::audio::MixStats stats;

        for (int b = 0; b < kBlocks; ++b) {
            const double tMs = static_cast<double>(b * kBlockFrames) * 1000.0 / 48000.0;
            const auto t0 = std::chrono::steady_clock::now();
            nt::audio::mixBlock(plan, nullptr, 48000.0, tMs, 1000.0 / 48000.0, kBlockFrames,
                                recorded.data() + static_cast<std::size_t>(b * kBlockFrames) * 2, stats);
            const double cbMs = std::chrono::duration<double, std::milli>(
                                    std::chrono::steady_clock::now() - t0)
                                    .count();
            maxCallbackMs = std::max(maxCallbackMs, cbMs);
            if (cbMs > 2.0) ++overBound;
            std::this_thread::sleep_for(std::chrono::microseconds(2667));
        }

        const double tailRms = rmsInterleaved(recorded, static_cast<std::size_t>(kBlocks - 35) * kBlockFrames,
                                              static_cast<std::size_t>(kBlocks) * kBlockFrames);
        float maxStep = 0.0f;
        for (std::size_t f = 1; f < static_cast<std::size_t>(kBlocks) * kBlockFrames; ++f) {
            const float step = std::abs(recorded[f * 2] - recorded[(f - 1) * 2]);
            maxStep = std::max(maxStep, step);
        }
        const std::uint64_t underruns = ch->underrunCount();
        qInfo("VST2_STRESS maxCallbackMs=%.3f over2ms=%d connected=%d underruns=%llu tailRms=%.5f maxStep=%.5f",
              maxCallbackMs, overBound, ch->connected() ? 1 : 0,
              static_cast<unsigned long long>(underruns), tailRms, maxStep);

        QVERIFY2(maxCallbackMs < 2.0,
                 qPrintable(QStringLiteral("Callback blocked for %1 ms (bound 2.0 ms)").arg(maxCallbackMs, 0, 'f', 3)));
        QVERIFY2(ch->connected(), "Late host block must never set connected=false");
        QVERIFY2(underruns > 0, "Expected injected 35 ms host delays to record underruns in atomic counter");
        QVERIFY2(tailRms > 0.02,
                 qPrintable(QStringLiteral("Permanent silence after host stalls: tailRms=%1").arg(tailRms)));
        QVERIFY2(maxStep < 0.015f,
                 qPrintable(QStringLiteral("Hard click at underrun boundary: maxStep=%1").arg(maxStep)));
        pool.evictAll(&client);
#endif
    }

    // VST2 (F2): Killing the host peer mid-stream must not block the callback, must fade out cleanly,
    // and must recover automatically on the control thread via serviceMixPlanControl().
    void vst2_deadHostPeerRecoversOnControlThreadWithoutBlockingCallback() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        // Two long held notes (no note-off clicks from the envelope-less test synth):
        // note 1 plays across the host crash (b=30, ~80 ms) and note 2 starts after control recovery (~150 ms).
        const QJsonArray notes{
            QJsonObject{{"id", "n0"}, {"pitch", 60}, {"velocity", 110}, {"startTick", 0}, {"durationTick", 3840}},
            QJsonObject{{"id", "n1"}, {"pitch", 64}, {"velocity", 110}, {"startTick", 288}, {"durationTick", 3840}},
        };
        const QJsonObject toneRef{{"uid", tone->uid}, {"name", tone->name}, {"vendor", tone->vendor}, {"path", tone->path}};
        const QJsonObject raw{
            {"id", "tl-vst2-recover"}, {"name", "VST2 Recover"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
            {"durationMs", 2000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
            {"tracks", QJsonArray{
                QJsonObject{{"id", "m1"}, {"name", "Synth"}, {"type", "midi"}, {"index", 0},
                            {"volumeDb", 0}, {"pan", 0}, {"muted", false}, {"solo", false},
                            {"instrument", QJsonObject{{"type", "vst"}, {"plugin", toneRef}, {"state", QJsonValue::Null}, {"gainDb", 0}}},
                            {"effects", QJsonArray{}}}}},
            {"clips", QJsonArray{
                QJsonObject{{"id", "c1"}, {"trackId", "m1"}, {"name", "Pulse"}, {"startMs", 0}, {"durationMs", 2000},
                            {"inPointMs", 0}, {"outPointMs", 2000}, {"mediaType", "midi"}, {"sourceType", "generated"},
                            {"status", "ready"}, {"locked", false}, {"notes", notes}}}}};

        QJsonObject rawNoInst = raw;
        auto noInstTracks = rawNoInst.value(u"tracks").toArray();
        auto noInstTrack0 = noInstTracks[0].toObject();
        noInstTrack0.remove(QStringLiteral("instrument"));
        noInstTracks[0] = noInstTrack0;
        rawNoInst.insert(QStringLiteral("tracks"), noInstTracks);

        const auto tl = parseRaw(raw);
        nt::audio::MixPlan plan = nt::audio::buildMixPlan(parseRaw(rawNoInst));
        for (auto& trackPlan : plan.tracks) {
            trackPlan.processors.clear();
        }
        VstLivePool pool;
        runVstInstrumentsStage(tl, plan, client, pool);
        nt::audio::prepareMixPlan(plan, 44100.0);
        nt::audio::prepareMixPlan(plan, 48000.0);

        auto ch = pool.acquire(client, QStringLiteral("inst:m1"), tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));

        constexpr int kBlocks = 140;
        constexpr int kBlockFrames = 128;
        std::vector<float> recorded(static_cast<std::size_t>(kBlocks) * kBlockFrames * 2, 0.0f);
        double maxCallbackMs = 0.0;
        nt::audio::MixStats stats;
        bool killed = false;
        bool recovered = false;

        for (int b = 0; b < kBlocks; ++b) {
            if (b == 30 && !killed) {
                killed = true;
                client.terminateHostForTest();
            }
            if (b >= 45 && !recovered && ch->peerDead()) {
                nt::audio::serviceMixPlanControl(plan);
                recovered = (ch->recoveryCount() >= 1);
            }
            const double tMs = static_cast<double>(b * kBlockFrames) * 1000.0 / 48000.0;
            const auto t0 = std::chrono::steady_clock::now();
            nt::audio::mixBlock(plan, nullptr, 48000.0, tMs, 1000.0 / 48000.0, kBlockFrames,
                                recorded.data() + static_cast<std::size_t>(b * kBlockFrames) * 2, stats);
            const double cbMs = std::chrono::duration<double, std::milli>(
                                    std::chrono::steady_clock::now() - t0)
                                    .count();
            maxCallbackMs = std::max(maxCallbackMs, cbMs);
            std::this_thread::sleep_for(std::chrono::microseconds(2667));
        }

        const double preCrashRms = rmsInterleaved(recorded, 8 * kBlockFrames, 28 * kBlockFrames);
        const double postRecoverRms = rmsInterleaved(recorded, 95 * kBlockFrames, 135 * kBlockFrames);
        float maxStep = 0.0f;
        for (std::size_t f = 1; f < static_cast<std::size_t>(kBlocks) * kBlockFrames; ++f) {
            maxStep = std::max(maxStep, std::abs(recorded[f * 2] - recorded[(f - 1) * 2]));
        }
        qInfo("VST2_RECOVER maxCallbackMs=%.3f recoveries=%llu underruns=%llu preRms=%.5f postRms=%.5f maxStep=%.5f",
              maxCallbackMs, static_cast<unsigned long long>(ch->recoveryCount()),
              static_cast<unsigned long long>(ch->underrunCount()), preCrashRms, postRecoverRms, maxStep);

        QVERIFY2(maxCallbackMs < 2.0,
                 qPrintable(QStringLiteral("Callback stalled during crash/recovery: %1 ms").arg(maxCallbackMs, 0, 'f', 3)));
        QVERIFY2(ch->recoveryCount() >= 1, "Control thread must recover dead host peer");
        QVERIFY2(ch->connected(), "Recovered channel must be connected");
        QVERIFY2(ch->underrunCount() > 0, "Crash window must record underruns");
        QVERIFY2(preCrashRms > 0.02 && postRecoverRms > 0.02,
                 qPrintable(QStringLiteral("Expected audio before and after recovery: pre=%1 post=%2")
                                .arg(preCrashRms).arg(postRecoverRms)));
        QVERIFY2(maxStep < 0.015f,
                 qPrintable(QStringLiteral("Hard click across crash/recovery fade: maxStep=%1").arg(maxStep)));
        pool.evictAll(&client);
#endif
    }

    // VST2 D1 / D2 / D3 / D13: Sync processBlock timeout must mark peerDead and recover cleanly
    // without permanent socket framing desync, and close() while parked on peerDead must never deadlock.
    void vst2_syncTimeoutAndParkedCloseNeverDesyncOrDeadlock() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        // Inject one 60 ms delay on block 1 only (every=1000, start=1).
        qputenv("NT_TONE_INJECT_DELAY_MS", "60");
        qputenv("NT_TONE_INJECT_DELAY_EVERY", "1000");
        qputenv("NT_TONE_INJECT_DELAY_START", "1");
        const auto restoreEnv = qScopeGuard([] {
            qunsetenv("NT_TONE_INJECT_DELAY_MS");
            qunsetenv("NT_TONE_INJECT_DELAY_EVERY");
            qunsetenv("NT_TONE_INJECT_DELAY_START");
        });

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        auto ch = VstLiveChannel::open(client, QStringLiteral("inst:d1-sync-timeout"),
                                       tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));

        std::vector<float> blk(std::size_t{128} * 2, 0.0f);
        const vsthost::ShmMidiEvent noteOn{0, 0x90, 60, 110, 0, 1, 0.0f};
        // Block 0: succeeds quickly (no delay).
        QVERIFY(ch->processBlock(blk, std::span<const vsthost::ShmMidiEvent>(&noteOn, 1), 48000.0, true, 50));
        // Block 1: hits 60 ms delay with 15 ms sync timeout -> must fail AND mark peerDead so no framing desync occurs.
        std::fill(blk.begin(), blk.end(), 0.0f);
        QVERIFY(!ch->processBlock(blk, {}, 48000.0, false, 15));
        QTRY_VERIFY_WITH_TIMEOUT(ch->peerDead(), 500);
        // Wait for host delay to finish, then recover on control thread and verify subsequent blocks succeed cleanly!
        QTest::qWait(80);
        QVERIFY2(ch->recoverIfNeeded(), "D1: recoverIfNeeded must reopen clean transport after timeout");
        QVERIFY(ch->connected());
        std::fill(blk.begin(), blk.end(), 0.0f);
        QVERIFY2(ch->processBlock(blk, std::span<const vsthost::ShmMidiEvent>(&noteOn, 1), 48000.0, true, 100),
                 "D1: post-timeout recovered exchange must not fail with BlockError/desync");
        QVERIFY(rmsInterleaved(blk, 0, 128) > 0.02);
        ch->close(&client);

        // D2: Tight loop killing host and calling close() immediately while worker parks on m_peerDead.
        qunsetenv("NT_TONE_INJECT_DELAY_MS");
        qunsetenv("NT_TONE_INJECT_DELAY_EVERY");
        qunsetenv("NT_TONE_INJECT_DELAY_START");
        for (int iter = 0; iter < 5; ++iter) {
            auto chPark = VstLiveChannel::open(client, QStringLiteral("inst:d2-park-%1").arg(iter),
                                               tone->path, tone->uid, {}, 48000.0, &error);
            QVERIFY2(chPark && chPark->connected(), qPrintable(error));
            client.terminateHostForTest();
            (void)chPark->processBlockAsync(blk, {}, 48000.0, false);
            QTRY_VERIFY_WITH_TIMEOUT(chPark->peerDead(), 1000);
            const auto t0 = std::chrono::steady_clock::now();
            chPark->close(&client);
            const double closeMs = std::chrono::duration<double, std::milli>(
                                       std::chrono::steady_clock::now() - t0).count();
            QVERIFY2(closeMs < 1000.0, qPrintable(QStringLiteral("D2 close took %1 ms").arg(closeMs)));
        }
#endif
    }

    // VST2 D4: Fast dead-peer recovery completing BEFORE the next audio callback must not enter
    // an infinite underrun loop, must preserve PDC alignment, and must re-chase the held note.
    void vst2_fastDeadPeerRecoveryBetweenCallbacksRechasesHeldNote() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        // Single held note n0 ONLY (no second note after recovery!).
        const QJsonArray notes{
            QJsonObject{{"id", "n0"}, {"pitch", 60}, {"velocity", 110}, {"startTick", 0}, {"durationTick", 3840}},
        };
        const QJsonObject toneRef{{"uid", tone->uid}, {"name", tone->name}, {"vendor", tone->vendor}, {"path", tone->path}};
        const QJsonObject raw{
            {"id", "tl-vst2-d4"}, {"name", "VST2 D4"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
            {"durationMs", 2000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
            {"tracks", QJsonArray{
                QJsonObject{{"id", "m1"}, {"name", "Synth"}, {"type", "midi"}, {"index", 0},
                            {"volumeDb", 0}, {"pan", 0}, {"muted", false}, {"solo", false},
                            {"instrument", QJsonObject{{"type", "vst"}, {"plugin", toneRef}, {"state", QJsonValue::Null}, {"gainDb", 0}}},
                            {"effects", QJsonArray{}}}}},
            {"clips", QJsonArray{
                QJsonObject{{"id", "c1"}, {"trackId", "m1"}, {"name", "Hold"}, {"startMs", 0}, {"durationMs", 2000},
                            {"inPointMs", 0}, {"outPointMs", 2000}, {"mediaType", "midi"}, {"sourceType", "generated"},
                            {"status", "ready"}, {"locked", false}, {"notes", notes}}}}};

        QJsonObject rawNoInst = raw;
        auto noInstTracks = rawNoInst.value(u"tracks").toArray();
        auto noInstTrack0 = noInstTracks[0].toObject();
        noInstTrack0.remove(QStringLiteral("instrument"));
        noInstTracks[0] = noInstTrack0;
        rawNoInst.insert(QStringLiteral("tracks"), noInstTracks);

        const auto tl = parseRaw(raw);
        nt::audio::MixPlan plan = nt::audio::buildMixPlan(parseRaw(rawNoInst));
        for (auto& trackPlan : plan.tracks) trackPlan.processors.clear();
        VstLivePool pool;
        runVstInstrumentsStage(tl, plan, client, pool);
        nt::audio::prepareMixPlan(plan, 44100.0);
        nt::audio::prepareMixPlan(plan, 48000.0);

        auto ch = pool.acquire(client, QStringLiteral("inst:m1"), tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));

        constexpr int kBlocks = 100;
        constexpr int kBlockFrames = 128;
        std::vector<float> recorded(static_cast<std::size_t>(kBlocks) * kBlockFrames * 2, 0.0f);
        nt::audio::MixStats stats;
        std::uint64_t underrunsAfterRecovery = 0;

        for (int b = 0; b < kBlocks; ++b) {
            if (b == 25) {
                // Kill host and immediately wait for worker to detect peerDead and recover BEFORE callback 25 runs!
                client.terminateHostForTest();
                // Push one idle wait for worker to notice EOF on socket or notice on next queued block.
                // Actually wait for peerDead via socket EOF if host died, or trigger on block 25 then recover before 26.
                const double tMs25 = static_cast<double>(25 * kBlockFrames) * 1000.0 / 48000.0;
                nt::audio::mixBlock(plan, nullptr, 48000.0, tMs25, 1000.0 / 48000.0, kBlockFrames,
                                    recorded.data() + static_cast<std::size_t>(25 * kBlockFrames) * 2, stats);
                QTRY_VERIFY_WITH_TIMEOUT(ch->peerDead(), 1000);
                // Recover BEFORE callback 26 ever runs (callback never sees dead==true!).
                nt::audio::serviceMixPlanControl(plan);
                QVERIFY2(ch->recoveryCount() >= 1 && ch->connected(), "D4: recovery must complete between callbacks");
                underrunsAfterRecovery = ch->underrunCount();
                continue;
            }
            const double tMs = static_cast<double>(b * kBlockFrames) * 1000.0 / 48000.0;
            nt::audio::mixBlock(plan, nullptr, 48000.0, tMs, 1000.0 / 48000.0, kBlockFrames,
                                recorded.data() + static_cast<std::size_t>(b * kBlockFrames) * 2, stats);
            std::this_thread::sleep_for(std::chrono::microseconds(2667));
        }

        const double preRms = rmsInterleaved(recorded, 8 * kBlockFrames, 24 * kBlockFrames);
        const double postRms = rmsInterleaved(recorded, 55 * kBlockFrames, 95 * kBlockFrames);
        const std::uint64_t extraUnderruns = ch->underrunCount() - underrunsAfterRecovery;
        QVERIFY2(preRms > 0.02, qPrintable(QStringLiteral("D4 preRms=%1").arg(preRms)));
        QVERIFY2(postRms > 0.02,
                 qPrintable(QStringLiteral("D4 held note silent or stuck in underrun loop after fast recovery: postRms=%1 extraUnderruns=%2")
                                .arg(postRms).arg(extraUnderruns)));
        QVERIFY2(extraUnderruns <= 2,
                 qPrintable(QStringLiteral("D4 infinite underrun loop after fast recovery: extraUnderruns=%1").arg(extraUnderruns)));
        pool.evictAll(&client);
#endif
    }

    // VST2 D8: VstEffectProcessor host-delay stress (wet=0.5) and dead-peer fallback/recovery crossfade.
    void vst2_effectHostDelayStressAndDeadPeerCrossfade() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString gainVst = findTestArtifact(QStringLiteral("GainEffect_artefacts/Release/VST3/NodeTool Test Gain.vst3"));
        if (hostExe.isEmpty() || gainVst.isEmpty()) {
            QSKIP("NodeToolVstHost or GainEffect.vst3 not built in native/vst-host/build");
        }

        // Part A: 35 ms host-delay stress on VstEffectProcessor with wet = 0.5.
        {
            qputenv("NT_GAIN_INJECT_DELAY_MS", "35");
            qputenv("NT_GAIN_INJECT_DELAY_EVERY", "25");
            qputenv("NT_GAIN_INJECT_DELAY_START", "12");
            const auto restoreEnv = qScopeGuard([] {
                qunsetenv("NT_GAIN_INJECT_DELAY_MS");
                qunsetenv("NT_GAIN_INJECT_DELAY_EVERY");
                qunsetenv("NT_GAIN_INJECT_DELAY_START");
            });

            VstHostClient client;
            client.setOverrideExecutable(hostExe);
            client.setExtraScanDirs({QFileInfo(gainVst).absolutePath()});
            std::vector<VstPluginInfo> plugins;
            QString error;
            QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
            const VstPluginInfo* gain = nullptr;
            for (const auto& p : plugins) {
                if (QFileInfo(p.path).canonicalFilePath() == gainVst) gain = &p;
            }
            QVERIFY(gain != nullptr);

            const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};
            const QJsonObject fx{{"id", "fx-stress"}, {"type", "vst"}, {"enabled", true},
                                 {"plugin", gainRef}, {"state", QJsonValue::Null}, {"wet", 0.5}};
            const QJsonObject raw{
                {"id", "tl-d8-stress"}, {"name", "D8 Stress"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                {"durationMs", 2000}, {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{QJsonObject{{"id", "a1"}, {"name", "A1"}, {"type", "audio"}, {"index", 0},
                                                  {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fx}}}}},
                {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "a1"}, {"name", "Sine"}, {"startMs", 0},
                                                 {"durationMs", 2000}, {"inPointMs", 0}, {"mediaType", "audio"},
                                                 {"status", "generated"}, {"mediaPath", "unused.wav"}}}}};
            QJsonObject rawNoFx = raw;
            auto tr = rawNoFx.value(u"tracks").toArray();
            auto tr0 = tr[0].toObject();
            // Keep a dummy built-in gain effect so buildMixPlan allocates plan.state, then replace with VST effect.
            tr0.insert(QStringLiteral("effects"), QJsonArray{
                QJsonObject{{"id", "dummy-gain"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 0.0}}});
            tr[0] = tr0;
            rawNoFx.insert(QStringLiteral("tracks"), tr);

            const auto tl = parseRaw(raw);
            auto plan = nt::audio::buildMixPlan(parseRaw(rawNoFx));
            QVERIFY(plan.state != nullptr);
            for (auto& tp : plan.tracks) tp.processors.clear();
            VstLivePool pool;
            runVstEffectsStage(tl, plan, client, pool);
            nt::audio::prepareMixPlan(plan, 44100.0);
            nt::audio::prepareMixPlan(plan, 48000.0);
            auto ch = pool.acquire(client, QStringLiteral("fx:a1:fx-stress"), gain->path, gain->uid, {}, 48000.0, &error);
            QVERIFY2(ch && ch->connected(), qPrintable(error));

            constexpr int kBlocks = 100;
            constexpr int kBlockFrames = 128;
            constexpr int kTotalFrames = kBlocks * kBlockFrames;
            std::vector<float> sine(static_cast<std::size_t>(kTotalFrames) * 2, 0.0f);
            for (int i = 0; i < kTotalFrames; ++i) {
                const float s = static_cast<float>(0.4 * std::sin(2.0 * std::numbers::pi * 220.0 * i / 48000.0));
                sine[static_cast<std::size_t>(i) * 2] = s;
                sine[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            nt::audio::VoicePcm vp{};
            vp.linear = sine.data();
            vp.linearCount = kTotalFrames;
            std::vector<float> out(static_cast<std::size_t>(kTotalFrames) * 2, 0.0f);
            nt::audio::MixStats st;
            double maxCbMs = 0.0;
            for (int b = 0; b < kBlocks; ++b) {
                const auto t0 = std::chrono::steady_clock::now();
                nt::audio::mixBlock(plan, &vp, 48000.0, static_cast<double>(b * kBlockFrames) * 1000.0 / 48000.0,
                                    1000.0 / 48000.0, kBlockFrames,
                                    out.data() + static_cast<std::size_t>(b * kBlockFrames) * 2, st);
                maxCbMs = std::max(maxCbMs, std::chrono::duration<double, std::milli>(
                                                std::chrono::steady_clock::now() - t0).count());
                std::this_thread::sleep_for(std::chrono::microseconds(2667));
            }
            float maxStep = 0.0f;
            for (int f = 1; f < kTotalFrames; ++f) {
                maxStep = std::max(maxStep, std::abs(out[static_cast<std::size_t>(f) * 2] -
                                                     out[static_cast<std::size_t>(f - 1) * 2]));
            }
            const double tailRms = rmsInterleaved(out, (kBlocks - 25) * kBlockFrames, kTotalFrames);
            QVERIFY2(maxCbMs < 2.0, qPrintable(QStringLiteral("D8 effect maxCbMs=%1").arg(maxCbMs)));
            QVERIFY(ch->connected());
            QVERIFY(ch->underrunCount() > 0);
            QVERIFY2(tailRms > 0.1, qPrintable(QStringLiteral("D8 effect tailRms=%1").arg(tailRms)));
            QVERIFY2(maxStep < 0.04f, qPrintable(QStringLiteral("D8 effect stress maxStep=%1").arg(maxStep)));
            pool.evictAll(&client);
        }

        // Part B: VstEffectProcessor dead-peer fallback and recovery must crossfade smoothly (no wet->dry or dry->silence click).
        {
            VstHostClient client;
            client.setOverrideExecutable(hostExe);
            client.setExtraScanDirs({QFileInfo(gainVst).absolutePath()});
            std::vector<VstPluginInfo> plugins;
            QString error;
            QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
            const VstPluginInfo* gain = nullptr;
            for (const auto& p : plugins) {
                if (QFileInfo(p.path).canonicalFilePath() == gainVst) gain = &p;
            }
            QVERIFY(gain != nullptr);

            const QJsonObject gainRef{{"uid", gain->uid}, {"name", gain->name}, {"vendor", gain->vendor}, {"path", gain->path}};
            const QJsonObject fx{{"id", "fx-d8"}, {"type", "vst"}, {"enabled", true},
                                 {"plugin", gainRef}, {"state", QJsonValue::Null}, {"wet", 1.0}};
            const QJsonObject raw{
                {"id", "tl-d8-xfade"}, {"name", "D8 Xfade"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                {"durationMs", 2000}, {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{QJsonObject{{"id", "a1"}, {"name", "A1"}, {"type", "audio"}, {"index", 0},
                                                  {"volumeDb", 0}, {"pan", 0}, {"effects", QJsonArray{fx}}}}},
                {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "a1"}, {"name", "DC"}, {"startMs", 0},
                                                 {"durationMs", 2000}, {"inPointMs", 0}, {"mediaType", "audio"},
                                                 {"status", "generated"}, {"mediaPath", "unused.wav"}}}}};
            QJsonObject rawNoFx = raw;
            auto tr = rawNoFx.value(u"tracks").toArray();
            auto tr0 = tr[0].toObject();
            tr0.insert(QStringLiteral("effects"), QJsonArray{
                QJsonObject{{"id", "dummy-gain"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 0.0}}});
            tr[0] = tr0;
            rawNoFx.insert(QStringLiteral("tracks"), tr);

            const auto tl = parseRaw(raw);
            auto plan = nt::audio::buildMixPlan(parseRaw(rawNoFx));
            QVERIFY(plan.state != nullptr);
            for (auto& tp : plan.tracks) tp.processors.clear();
            VstLivePool pool;
            runVstEffectsStage(tl, plan, client, pool);
            nt::audio::prepareMixPlan(plan, 44100.0);
            nt::audio::prepareMixPlan(plan, 48000.0);
            auto ch = pool.acquire(client, QStringLiteral("fx:a1:fx-d8"), gain->path, gain->uid, {}, 48000.0, &error);
            QVERIFY2(ch && ch->connected(), qPrintable(error));

            // Use a slow 60 Hz sine (amplitude 0.6 -> natural max step ~0.0047/sample, wet gain 0.5 -> dry is 0.6, wet is 0.3).
            constexpr int kBlocks = 100;
            constexpr int kBlockFrames = 128;
            constexpr int kTotalFrames = kBlocks * kBlockFrames;
            std::vector<float> sine(static_cast<std::size_t>(kTotalFrames) * 2, 0.0f);
            for (int i = 0; i < kTotalFrames; ++i) {
                const float s = static_cast<float>(0.6 * std::sin(2.0 * std::numbers::pi * 60.0 * i / 48000.0));
                sine[static_cast<std::size_t>(i) * 2] = s;
                sine[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            nt::audio::VoicePcm vp{};
            vp.linear = sine.data();
            vp.linearCount = kTotalFrames;
            std::vector<float> out(static_cast<std::size_t>(kTotalFrames) * 2, 0.0f);
            nt::audio::MixStats st;
            bool killed = false;
            bool recovered = false;

            for (int b = 0; b < kBlocks; ++b) {
                if (b == 25 && !killed) {
                    killed = true;
                    client.terminateHostForTest();
                }
                if (b >= 45 && !recovered && ch->peerDead()) {
                    nt::audio::serviceMixPlanControl(plan);
                    recovered = (ch->recoveryCount() >= 1);
                }
                nt::audio::mixBlock(plan, &vp, 48000.0, static_cast<double>(b * kBlockFrames) * 1000.0 / 48000.0,
                                    1000.0 / 48000.0, kBlockFrames,
                                    out.data() + static_cast<std::size_t>(b * kBlockFrames) * 2, st);
                std::this_thread::sleep_for(std::chrono::microseconds(2667));
            }
            QVERIFY(recovered);
            float maxStep = 0.0f;
            for (int f = 1; f < kTotalFrames; ++f) {
                maxStep = std::max(maxStep, std::abs(out[static_cast<std::size_t>(f) * 2] -
                                                     out[static_cast<std::size_t>(f - 1) * 2]));
            }
            QVERIFY2(maxStep < 0.03f,
                     qPrintable(QStringLiteral("D8 hard click during effect dead-peer fallback/recovery: maxStep=%1").arg(maxStep)));
            pool.evictAll(&client);
        }
#endif
    }

    // VST2 D10: Variable / non-divisor block sizes (64, 480, 512, mixed) under host stalls must not click.
    void vst2_variableBlockSizesUnderHostStallsNoClicks() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        qputenv("NT_TONE_INJECT_DELAY_MS", "35");
        qputenv("NT_TONE_INJECT_DELAY_EVERY", "12");
        qputenv("NT_TONE_INJECT_DELAY_START", "6");
        const auto restoreEnv = qScopeGuard([] {
            qunsetenv("NT_TONE_INJECT_DELAY_MS");
            qunsetenv("NT_TONE_INJECT_DELAY_EVERY");
            qunsetenv("NT_TONE_INJECT_DELAY_START");
        });

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        auto ch = VstLiveChannel::open(client, QStringLiteral("inst:d10-varblock"),
                                       tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));

        const std::array<int, 5> pattern{480, 64, 512, 128, 480};
        const vsthost::ShmMidiEvent noteOn{0, 0x90, 60, 120, 0, 1, 0.0f};
        std::vector<float> recorded;
        recorded.reserve(50000);
        for (int b = 0; b < 60; ++b) {
            const int nf = pattern[static_cast<std::size_t>(b) % pattern.size()];
            std::vector<float> blk(static_cast<std::size_t>(nf) * 2, 0.0f);
            const auto res = ch->processBlockAsync(
                blk,
                b == 0 ? std::span<const vsthost::ShmMidiEvent>(&noteOn, 1) : std::span<const vsthost::ShmMidiEvent>{},
                48000.0, b == 0);
            QVERIFY(!res.peerDead);
            recorded.insert(recorded.end(), blk.begin(), blk.end());
            std::this_thread::sleep_for(std::chrono::microseconds(static_cast<int>(nf * 1000000.0 / 48000.0)));
        }
        const std::size_t totalFrames = recorded.size() / 2;
        float maxStep = 0.0f;
        for (std::size_t f = 1; f < totalFrames; ++f) {
            maxStep = std::max(maxStep, std::abs(recorded[f * 2] - recorded[(f - 1) * 2]));
        }
        const double tailRms = rmsInterleaved(recorded, totalFrames - 2048, totalFrames);
        QVERIFY(ch->underrunCount() > 0);
        QVERIFY2(tailRms > 0.02, qPrintable(QStringLiteral("D10 tailRms=%1").arg(tailRms)));
        QVERIFY2(maxStep < 0.015f,
                 qPrintable(QStringLiteral("D10 hard click on partial-frame underrun: maxStep=%1").arg(maxStep)));
        ch->close(&client);
#endif
    }

    // VST2 D11 / D12 / D14: reprobeMixPlanLatency must not latch a live plan to offline;
    // record-armed / live-monitored instrument tracks use small look-ahead (<=128) with per-track PDC;
    // seek flushes ahead queue cleanly without stale bleed.
    void vst2_reprobeLiveModeLowLatencyArmedTracksAndSeekFlush() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        const QJsonObject toneRef{{"uid", tone->uid}, {"name", tone->name}, {"vendor", tone->vendor}, {"path", tone->path}};
        auto makeMidiTl = [&](bool recordArmed, bool liveMonitor, bool withPlaybackTrack) {
            QJsonArray tracks{
                QJsonObject{{"id", "m1"}, {"name", "ArmedSynth"}, {"type", "midi"}, {"index", 0},
                            {"volumeDb", 0}, {"pan", 0}, {"muted", false}, {"solo", false},
                            {"recordArmed", recordArmed}, {"liveMonitor", liveMonitor},
                            {"instrument", QJsonObject{{"type", "vst"}, {"plugin", toneRef}, {"state", QJsonValue::Null}, {"gainDb", 0}}},
                            {"effects", QJsonArray{}}}
            };
            QJsonArray clips{
                QJsonObject{{"id", "c1"}, {"trackId", "m1"}, {"name", "N1"}, {"startMs", 0}, {"durationMs", 500},
                            {"inPointMs", 0}, {"outPointMs", 500}, {"mediaType", "midi"}, {"sourceType", "generated"},
                            {"status", "ready"}, {"locked", false},
                            {"notes", QJsonArray{QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 110},
                                                             {"startTick", 0}, {"durationTick", 960}}}}}
            };
            if (withPlaybackTrack) {
                tracks.append(QJsonObject{
                    {"id", "m2"}, {"name", "PlaybackSynth"}, {"type", "midi"}, {"index", 1},
                    {"volumeDb", 0}, {"pan", 0}, {"muted", false}, {"solo", false},
                    {"instrument", QJsonObject{{"type", "vst"}, {"plugin", toneRef}, {"state", QJsonValue::Null}, {"gainDb", 0}}},
                    {"effects", QJsonArray{}}});
                clips.append(QJsonObject{
                    {"id", "c2"}, {"trackId", "m2"}, {"name", "N2"}, {"startMs", 0}, {"durationMs", 500},
                    {"inPointMs", 0}, {"outPointMs", 500}, {"mediaType", "midi"}, {"sourceType", "generated"},
                    {"status", "ready"}, {"locked", false},
                    {"notes", QJsonArray{QJsonObject{{"id", "n2"}, {"pitch", 60}, {"velocity", 110},
                                                     {"startTick", 0}, {"durationTick", 960}}}}});
            }
            return parseRaw(QJsonObject{
                {"id", "tl-d11-d12"}, {"name", "D11D12"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                {"durationMs", 2000},
                {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
                {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", tracks}, {"clips", clips}});
        };

        auto buildIsolatedLivePlan = [&](const nt::Timeline& tl, VstLivePool& pool) {
            QJsonObject rawNoInst = tl.raw;
            auto tracks = rawNoInst.value(u"tracks").toArray();
            for (int i = 0; i < tracks.size(); ++i) {
                auto t = tracks[i].toObject();
                t.remove(QStringLiteral("instrument"));
                tracks[i] = t;
            }
            rawNoInst.insert(QStringLiteral("tracks"), tracks);
            auto plan = nt::audio::buildMixPlan(parseRaw(rawNoInst));
            for (auto& tp : plan.tracks) tp.processors.clear();
            runVstInstrumentsStage(tl, plan, client, pool);
            return plan;
        };

        // 1. D11: reprobeMixPlanLatency on a live plan must NOT switch it to offline mode or zero its async latency.
        {
            VstLivePool pool;
            const auto tl = makeMidiTl(false, false, false);
            auto plan = buildIsolatedLivePlan(tl, pool);
            nt::audio::prepareMixPlan(plan, 44100.0);
            nt::audio::prepareMixPlan(plan, 48000.0);
            QCOMPARE(nt::audio::planLatencySamples(plan), VstLiveChannel::kAsyncLatencyFrames);
            nt::audio::reprobeMixPlanLatency(plan, 48000.0);
            QCOMPARE(nt::audio::planLatencySamples(plan), VstLiveChannel::kAsyncLatencyFrames);
            pool.evictAll(&client);
        }

        // 2. C1 / D12: record-armed instrument track uses one device callback lookahead
        //    covering the submitted quantum (64 -> 64, 128 -> 128, 480 -> 480, 512 -> 512)
        //    and renders audio cleanly at 480 and 512 frames without permanent silence.
        {
            VstLivePool pool;
            const auto tlArmed = makeMidiTl(true, false, false);
            auto plan = buildIsolatedLivePlan(tlArmed, pool);
            nt::audio::prepareMixPlan(plan, 48000.0, 64);
            QCOMPARE(nt::audio::planLatencySamples(plan), 64);
            nt::audio::prepareMixPlan(plan, 48000.0, 128);
            QCOMPARE(nt::audio::planLatencySamples(plan), 128);
            for (const int blockFrames : {480, 512}) {
                nt::audio::prepareMixPlan(plan, 48000.0, blockFrames);
                QCOMPARE(nt::audio::planLatencySamples(plan), blockFrames);
                auto ch = pool.acquire(client, QStringLiteral("inst:m1"), tone->path, tone->uid, {}, 48000.0, &error);
                QVERIFY2(ch && ch->connected(), qPrintable(error));
                const std::uint64_t underrunsBefore = ch->underrunCount();
                constexpr int kCallbacks = 14;
                std::vector<float> rendered(static_cast<std::size_t>(kCallbacks * blockFrames) * 2, 0.0f);
                nt::audio::MixStats st;
                for (int b = 0; b < kCallbacks; ++b) {
                    nt::audio::mixBlock(plan, nullptr, 48000.0,
                                        static_cast<double>(b * blockFrames) * 1000.0 / 48000.0,
                                        1000.0 / 48000.0, blockFrames,
                                        rendered.data() + static_cast<std::size_t>(b * blockFrames) * 2, st);
                    std::this_thread::sleep_for(
                        std::chrono::microseconds(static_cast<int>(blockFrames * 1000000.0 / 48000.0)));
                }
                const double tailRms = rmsInterleaved(rendered, 4 * blockFrames, kCallbacks * blockFrames);
                const std::uint64_t newUnderruns = ch->underrunCount() - underrunsBefore;
                QVERIFY2(tailRms > 0.02,
                         qPrintable(QStringLiteral("C1 armed %1-frame callback silent: rms=%2").arg(blockFrames).arg(tailRms)));
                QVERIFY2(newUnderruns == 0,
                         qPrintable(QStringLiteral("C1 armed %1-frame callback had %2 underruns").arg(blockFrames).arg(newUnderruns)));
            }
            pool.evictAll(&client);
        }

        // 3. D12 / C7: live-monitored instrument track uses small lookahead (64 at 64-frame callback) AND
        //    per-track PDC aligns a hard-left 64-frame armed track with a hard-right 512-frame playback
        //    track to the exact sample (separately identifiable L vs R channels).
        {
            VstLivePool pool;
            const auto tlMon = makeMidiTl(false, true, false);
            auto monPlan = buildIsolatedLivePlan(tlMon, pool);
            nt::audio::prepareMixPlan(monPlan, 48000.0, 64);
            QCOMPARE(nt::audio::planLatencySamples(monPlan), 64);
            pool.evictAll(&client);

            auto tlMixed = makeMidiTl(true, false, true);
            // Pan armed track m1 hard left (-1.0) and playback track m2 hard right (+1.0).
            QJsonObject mixedRaw = tlMixed.raw;
            QJsonArray mixedTracks = mixedRaw.value(u"tracks").toArray();
            auto tr0 = mixedTracks[0].toObject();
            tr0.insert(QStringLiteral("pan"), -1.0);
            mixedTracks[0] = tr0;
            auto tr1 = mixedTracks[1].toObject();
            tr1.insert(QStringLiteral("pan"), 1.0);
            mixedTracks[1] = tr1;
            mixedRaw.insert(QStringLiteral("tracks"), mixedTracks);
            tlMixed = parseRaw(mixedRaw);

            auto mixedPlan = buildIsolatedLivePlan(tlMixed, pool);
            nt::audio::prepareMixPlan(mixedPlan, 48000.0, 64);
            QCOMPARE(nt::audio::planLatencySamples(mixedPlan), VstLiveChannel::kPlaybackAsyncLatencyFrames);
            QVERIFY(mixedPlan.tracks.size() == 2);
            QCOMPARE(mixedPlan.tracks[0].processors[0]->effectiveLatencySamples(), 64);
            QCOMPARE(mixedPlan.tracks[1].processors[0]->effectiveLatencySamples(),
                     VstLiveChannel::kPlaybackAsyncLatencyFrames);
            constexpr int kTotalFrames = 16 * 64;
            std::vector<float> mixedOut(static_cast<std::size_t>(kTotalFrames) * 2, 0.0f);
            nt::audio::MixStats st;
            for (int b = 0; b < 16; ++b) {
                nt::audio::mixBlock(mixedPlan, nullptr, 48000.0, static_cast<double>(b * 64) * 1000.0 / 48000.0,
                                    1000.0 / 48000.0, 64,
                                    mixedOut.data() + static_cast<std::size_t>(b * 64) * 2, st);
                std::this_thread::sleep_for(std::chrono::microseconds(1500));
            }
            int firstNonZeroL = -1;
            int firstNonZeroR = -1;
            double sumSqBeforeL = 0.0, sumSqBeforeR = 0.0;
            double sumSqAfterL = 0.0, sumSqAfterR = 0.0;
            float maxChannelDiff = 0.0f;
            for (int f = 0; f < kTotalFrames; ++f) {
                const float l = mixedOut[static_cast<std::size_t>(f) * 2];
                const float r = mixedOut[static_cast<std::size_t>(f) * 2 + 1];
                if (firstNonZeroL < 0 && std::abs(l) > 1e-5f) firstNonZeroL = f;
                if (firstNonZeroR < 0 && std::abs(r) > 1e-5f) firstNonZeroR = f;
                if (f < 512) {
                    sumSqBeforeL += static_cast<double>(l) * l;
                    sumSqBeforeR += static_cast<double>(r) * r;
                } else {
                    sumSqAfterL += static_cast<double>(l) * l;
                    sumSqAfterR += static_cast<double>(r) * r;
                    maxChannelDiff = std::max(maxChannelDiff, std::abs(l - r));
                }
            }
            const double beforeL = std::sqrt(sumSqBeforeL / 512.0);
            const double beforeR = std::sqrt(sumSqBeforeR / 512.0);
            const double afterL = std::sqrt(sumSqAfterL / static_cast<double>(kTotalFrames - 512));
            const double afterR = std::sqrt(sumSqAfterR / static_cast<double>(kTotalFrames - 512));
            QVERIFY2(beforeL < 1e-5 && beforeR < 1e-5,
                     qPrintable(QStringLiteral("C7 early leak before 512 PDC: L=%1 R=%2").arg(beforeL).arg(beforeR)));
            QVERIFY2(afterL > 0.04 && afterR > 0.04,
                     qPrintable(QStringLiteral("C7 track silent after PDC: L=%1 R=%2").arg(afterL).arg(afterR)));
            QVERIFY2(firstNonZeroL >= 512 && firstNonZeroL <= 514 && firstNonZeroL == firstNonZeroR,
                     qPrintable(QStringLiteral("C7 armed(L) vs playback(R) onset mismatch: L=%1 R=%2")
                                    .arg(firstNonZeroL).arg(firstNonZeroR)));
            QVERIFY2(maxChannelDiff < 1e-4f,
                     qPrintable(QStringLiteral("C7 armed(L) vs playback(R) sample alignment diff=%1").arg(maxChannelDiff)));
            pool.evictAll(&client);
        }

        // 3b. D9: LiveSession::reprepare() during continuous live playback fades smoothly without clicks.
        {
            auto ch = VstLiveChannel::open(client, QStringLiteral("inst:d9-reprepare"),
                                           tone->path, tone->uid, {}, 48000.0, &error);
            QVERIFY2(ch && ch->connected(), qPrintable(error));
            const vsthost::ShmMidiEvent noteOn{0, 0x90, 60, 120, 0, 1, 0.0f};
            std::vector<float> recorded;
            recorded.reserve(60 * 128 * 2);
            std::thread repThread;
            for (int b = 0; b < 50; ++b) {
                if (b == 18) {
                    repThread = std::thread([&] {
                        QString repErr;
                        (void)client.prepareLive(QStringLiteral("inst:d9-reprepare"), 48000.0, 512, nullptr, &repErr);
                    });
                }
                std::vector<float> blk(std::size_t{128} * 2, 0.0f);
                (void)ch->processBlockAsync(
                    blk,
                    b == 0 ? std::span<const vsthost::ShmMidiEvent>(&noteOn, 1) : std::span<const vsthost::ShmMidiEvent>{},
                    48000.0, b == 0);
                recorded.insert(recorded.end(), blk.begin(), blk.end());
                std::this_thread::sleep_for(std::chrono::microseconds(2500));
            }
            if (repThread.joinable()) repThread.join();
            float maxStep = 0.0f;
            for (std::size_t f = 1; f < recorded.size() / 2; ++f) {
                maxStep = std::max(maxStep, std::abs(recorded[f * 2] - recorded[(f - 1) * 2]));
            }
            QVERIFY2(maxStep < 0.015f,
                     qPrintable(QStringLiteral("D9 hard click during LiveSession::reprepare(): maxStep=%1").arg(maxStep)));
            ch->close(&client);
        }

        // 3c. D3/D13/C7/E3: Deterministic checkpoint-gated concurrent close() with processBlock()
        //     and recoverIfNeeded() on a genuinely peerDead channel. Gates close() on observed
        //     checkpoints both right before (iter 0,1) and right after (iter 2,3) openTransportSession(),
        //     releases recovery deliberately, and asserts each checkpoint was reached without deadlock/crash.
        {
            for (int iter = 0; iter < 4; ++iter) {
                const QString key = QStringLiteral("inst:d3-race-%1").arg(iter);
                auto ch = VstLiveChannel::open(client, key, tone->path, tone->uid, {}, 48000.0, &error);
                QVERIFY2(ch && ch->connected(), qPrintable(error));
                // Force genuine peerDead before launching recovery vs close race.
                client.terminateHostForTest();
                std::vector<float> probe(std::size_t{128} * 2, 0.0f);
                (void)ch->processBlockAsync(probe, {}, 48000.0, false);
                QTRY_VERIFY_WITH_TIMEOUT(ch->peerDead(), 1000);

                const bool gateAfterOpen = (iter >= 2);
                std::mutex cpMu;
                std::condition_variable cpCv;
                bool checkpointReached = false;
                bool releaseRecovery = false;
                ch->setRecoveryHookForTest([&](bool afterOpen) {
                    if (afterOpen != gateAfterOpen) return;
                    std::unique_lock<std::mutex> lk(cpMu);
                    checkpointReached = true;
                    cpCv.notify_all();
                    cpCv.wait(lk, [&] { return releaseRecovery; });
                });

                std::atomic<bool> recoverResult{true};
                std::thread recoverCaller([&] {
                    recoverResult.store(ch->recoverIfNeeded(), std::memory_order_release);
                });
                std::thread syncCaller([&] {
                    std::vector<float> b(std::size_t{128} * 2, 0.0f);
                    for (int k = 0; k < 4; ++k) {
                        (void)ch->processBlock(b, {}, 48000.0, false, 20);
                    }
                });

                // Wait until recoverIfNeeded() deterministically reaches the openTransportSession checkpoint.
                bool observedCheckpoint = false;
                {
                    std::unique_lock<std::mutex> lk(cpMu);
                    observedCheckpoint = cpCv.wait_for(
                        lk, std::chrono::seconds(5), [&] { return checkpointReached; });
                }
                QVERIFY2(observedCheckpoint,
                         qPrintable(QStringLiteral("E3 iter %1 never reached recovery checkpoint (afterOpen=%2)")
                                        .arg(iter).arg(gateAfterOpen)));

                // Launch close() while recoverIfNeeded() is held inside m_controlMutex at the checkpoint.
                // Alternate close(&client) and close(nullptr) to cover D13 closeLiveAsync cleanup.
                std::thread closeCaller([&] {
                    ch->close((iter % 2 == 0) ? &client : nullptr);
                });
                // Wait until close() has published m_closed/m_stop and is contending on m_controlMutex.
                QTRY_VERIFY_WITH_TIMEOUT(ch->closed(), 1000);

                // Deliberately release the blocked recovery operation so it completes/cleans up against close().
                {
                    std::lock_guard<std::mutex> lk(cpMu);
                    releaseRecovery = true;
                }
                cpCv.notify_all();

                closeCaller.join();
                recoverCaller.join();
                syncCaller.join();
                ch->setRecoveryHookForTest({});

                QVERIFY(ch->closed());
                QVERIFY2(!recoverResult.load(std::memory_order_acquire),
                         "E3: recoverIfNeeded() must abort cleanly when close() wins during openTransportSession");
                QCOMPARE(ch->recoveryCount(), std::uint64_t{0});
            }
        }

        // 4. D14: Transport seek in async mode flushes pre-seek blocks without stale bleed.
        {
            VstLivePool pool;
            const auto tl = makeMidiTl(false, false, false);
            auto plan = buildIsolatedLivePlan(tl, pool);
            nt::audio::prepareMixPlan(plan, 44100.0);
            nt::audio::prepareMixPlan(plan, 48000.0);
            nt::audio::MixStats st;
            std::vector<float> blk(std::size_t{128} * 2, 0.0f);
            // Play 20 blocks inside note [0..500 ms] so ahead queue is full of non-zero tone.
            for (int b = 0; b < 20; ++b) {
                nt::audio::mixBlock(plan, nullptr, 48000.0, static_cast<double>(b * 128) * 1000.0 / 48000.0,
                                    1000.0 / 48000.0, 128, blk.data(), st);
                std::this_thread::sleep_for(std::chrono::microseconds(2500));
            }
            QVERIFY(rmsInterleaved(blk, 0, 128) > 0.02);
            // Seek to 1200 ms (silent region after note end at 500 ms).
            std::vector<float> postSeek(std::size_t{12 * 128} * 2, 0.0f);
            for (int b = 0; b < 12; ++b) {
                nt::audio::mixBlock(plan, nullptr, 48000.0, 1200.0 + static_cast<double>(b * 128) * 1000.0 / 48000.0,
                                    1000.0 / 48000.0, 128,
                                    postSeek.data() + static_cast<std::size_t>(b * 128) * 2, st);
                std::this_thread::sleep_for(std::chrono::microseconds(2500));
            }
            // After the 64-sample fade-out, output in silent region must be pure silence (no stale pre-seek bleed!).
            const double postSeekRms = rmsInterleaved(postSeek, 128, 12 * 128);
            QVERIFY2(postSeekRms < 1e-4,
                     qPrintable(QStringLiteral("D14 stale pre-seek audio bled after seek: rms=%1").arg(postSeekRms)));
            pool.evictAll(&client);
        }
#endif
    }

    // VST2 C1: 512-frame callbacks with 128-frame configured look-ahead must not enter permanent silence.
    void vst2_c1_largeCallbackWithSmallLookaheadNoPermanentSilence() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        auto ch = VstLiveChannel::open(client, QStringLiteral("inst:c1-512-vs-128"),
                                       tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));
        ch->setAsyncLatencyFrames(128);

        constexpr int kFrames = 512;
        constexpr int kCallbacks = 20;
        const vsthost::ShmMidiEvent noteOn{0, 0x90, 60, 120, 0, 1, 0.0f};
        std::vector<float> recorded(static_cast<std::size_t>(kCallbacks * kFrames) * 2, 0.0f);
        for (int b = 0; b < kCallbacks; ++b) {
            auto dst = std::span<float>(recorded.data() + static_cast<std::size_t>(b * kFrames) * 2,
                                        static_cast<std::size_t>(kFrames) * 2);
            const auto res = ch->processBlockAsync(
                dst,
                b == 0 ? std::span<const vsthost::ShmMidiEvent>(&noteOn, 1) : std::span<const vsthost::ShmMidiEvent>{},
                48000.0, b == 0);
            QVERIFY(!res.peerDead);
            std::this_thread::sleep_for(std::chrono::microseconds(10667));
        }
        const double tailRms = rmsInterleaved(recorded, 4 * kFrames, kCallbacks * kFrames);
        QVERIFY2(tailRms > 0.02,
                 qPrintable(QStringLiteral("C1 permanent silence on 512-frame callback with 128 look-ahead: tailRms=%1")
                                .arg(tailRms)));
        QVERIFY(ch->connected());
        ch->close(&client);
#endif
    }

    // VST2 C2: Constructing and preparing a replacement MixPlan must not mutate the active plan's
    // pooled VstLiveChannel look-ahead before plan handoff (playback512->armed64 and armed64->armed64).
    void vst2_c2_oldPlanUnaffectedWhilePreparingReplacement() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        const QJsonObject toneRef{{"uid", tone->uid}, {"name", tone->name}, {"vendor", tone->vendor}, {"path", tone->path}};
        auto makeTl = [&](bool armed) {
            return parseRaw(QJsonObject{
                {"id", "tl-c2"}, {"name", "C2"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                {"durationMs", 3000},
                {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
                {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}, {"effects", QJsonArray{}}}},
                {"tracks", QJsonArray{
                    QJsonObject{{"id", "m1"}, {"name", "Synth"}, {"type", "midi"}, {"index", 0},
                                {"volumeDb", 0}, {"pan", 0}, {"muted", false}, {"solo", false},
                                {"recordArmed", armed}, {"liveMonitor", false},
                                {"instrument", QJsonObject{{"type", "vst"}, {"plugin", toneRef}, {"state", QJsonValue::Null}, {"gainDb", 0}}},
                                {"effects", QJsonArray{}}}}},
                {"clips", QJsonArray{
                    QJsonObject{{"id", "c1"}, {"trackId", "m1"}, {"name", "Hold"}, {"startMs", 0}, {"durationMs", 3000},
                                {"inPointMs", 0}, {"outPointMs", 3000}, {"mediaType", "midi"}, {"sourceType", "generated"},
                                {"status", "ready"}, {"locked", false},
                                {"notes", QJsonArray{QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 110},
                                                                 {"startTick", 0}, {"durationTick", 5760}}}}}}}});
        };
        auto buildLivePlan = [&](const nt::Timeline& tl, VstLivePool& pool) {
            QJsonObject rawNoInst = tl.raw;
            auto tracks = rawNoInst.value(u"tracks").toArray();
            auto t0 = tracks[0].toObject();
            t0.remove(QStringLiteral("instrument"));
            tracks[0] = t0;
            rawNoInst.insert(QStringLiteral("tracks"), tracks);
            auto plan = nt::audio::buildMixPlan(parseRaw(rawNoInst));
            for (auto& tp : plan.tracks) tp.processors.clear();
            runVstInstrumentsStage(tl, plan, client, pool);
            return plan;
        };

        VstLivePool pool;
        const auto tlPlay = makeTl(false);
        const auto tlArmed = makeTl(true);

        // Part A: Old plan (playback512) rendering while replacement plan (armed64) is constructed & prepared.
        auto oldPlan = buildLivePlan(tlPlay, pool);
        nt::audio::prepareMixPlan(oldPlan, 48000.0, 64);
        QCOMPARE(nt::audio::planLatencySamples(oldPlan), VstLiveChannel::kPlaybackAsyncLatencyFrames);
        auto ch = pool.acquire(client, QStringLiteral("inst:m1"), tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));

        constexpr int kBlockFrames = 64;
        std::vector<float> oldOut;
        oldOut.reserve(60 * kBlockFrames * 2);
        nt::audio::MixStats st;
        int blkIdx = 0;
        // Prime & stabilize oldPlan (playback512 = 8 blocks of 64 frames).
        for (; blkIdx < 16; ++blkIdx) {
            std::vector<float> blk(std::size_t{kBlockFrames} * 2, 0.0f);
            nt::audio::mixBlock(oldPlan, nullptr, 48000.0, static_cast<double>(blkIdx * kBlockFrames) * 1000.0 / 48000.0,
                                1000.0 / 48000.0, kBlockFrames, blk.data(), st);
            oldOut.insert(oldOut.end(), blk.begin(), blk.end());
            std::this_thread::sleep_for(std::chrono::microseconds(1500));
        }
        const std::size_t prePrepEndFrame = oldOut.size() / 2;
        const double prePrepRms = rmsInterleaved(oldOut, 10 * kBlockFrames, prePrepEndFrame);
        QVERIFY2(prePrepRms > 0.02, qPrintable(QStringLiteral("C2 oldPlan prePrepRms=%1").arg(prePrepRms)));
        const std::uint64_t underrunsBeforePrep = ch->underrunCount();

        // Construct AND prepare replacement plan (armed64) while oldPlan is STILL the active plan!
        auto newPlan = buildLivePlan(tlArmed, pool);
        nt::audio::prepareMixPlan(newPlan, 48000.0, 64);
        QCOMPARE(nt::audio::planLatencySamples(newPlan), 64);
        // Old plan must still report 512 AND continue rendering uninterrupted with zero re-prime/dropout!
        QCOMPARE(nt::audio::planLatencySamples(oldPlan), VstLiveChannel::kPlaybackAsyncLatencyFrames);
        for (; blkIdx < 32; ++blkIdx) {
            std::vector<float> blk(std::size_t{kBlockFrames} * 2, 0.0f);
            nt::audio::mixBlock(oldPlan, nullptr, 48000.0, static_cast<double>(blkIdx * kBlockFrames) * 1000.0 / 48000.0,
                                1000.0 / 48000.0, kBlockFrames, blk.data(), st);
            oldOut.insert(oldOut.end(), blk.begin(), blk.end());
            std::this_thread::sleep_for(std::chrono::microseconds(1500));
        }
        // Check EVERY 64-frame block rendered by oldPlan after newPlan preparation: none may drop out or click!
        float maxStepOld = 0.0f;
        for (std::size_t f = 10 * kBlockFrames + 1; f < oldOut.size() / 2; ++f) {
            maxStepOld = std::max(maxStepOld, std::abs(oldOut[f * 2] - oldOut[(f - 1) * 2]));
        }
        double minPostBlockRms = 1.0;
        for (int b = 16; b < 32; ++b) {
            minPostBlockRms = std::min(minPostBlockRms, rmsInterleaved(oldOut, b * kBlockFrames, (b + 1) * kBlockFrames));
        }
        QVERIFY2(minPostBlockRms > 0.02,
                 qPrintable(QStringLiteral("C2 oldPlan dropped out during replacement preparation: minBlockRms=%1")
                                .arg(minPostBlockRms)));
        QVERIFY2(maxStepOld < 0.015f,
                 qPrintable(QStringLiteral("C2 oldPlan clicked during replacement preparation: maxStep=%1").arg(maxStepOld)));
        QCOMPARE(ch->underrunCount(), underrunsBeforePrep);

        // Now hand off to newPlan (armed64) starting at timeline 0 ms (fresh note onset) and verify
        // it renders cleanly AND armed64->armed64 rebuild does not cause any re-prime or click!
        std::vector<float> armedOut;
        armedOut.reserve(32 * kBlockFrames * 2);
        int armedBlkIdx = 0;
        for (; armedBlkIdx < 12; ++armedBlkIdx) {
            std::vector<float> blk(std::size_t{kBlockFrames} * 2, 0.0f);
            nt::audio::mixBlock(newPlan, nullptr, 48000.0, static_cast<double>(armedBlkIdx * kBlockFrames) * 1000.0 / 48000.0,
                                1000.0 / 48000.0, kBlockFrames, blk.data(), st);
            armedOut.insert(armedOut.end(), blk.begin(), blk.end());
            std::this_thread::sleep_for(std::chrono::microseconds(1500));
        }
        // Construct & prepare a second armed64 plan while newPlan continues rendering: must NOT touch channel!
        auto armedPlan2 = buildLivePlan(tlArmed, pool);
        // Render one block of newPlan right after construction (before prepareMixPlan on armedPlan2)
        // to catch constructor temporarily writing 128 onto the pooled channel!
        {
            std::vector<float> blk(std::size_t{kBlockFrames} * 2, 0.0f);
            nt::audio::mixBlock(newPlan, nullptr, 48000.0, static_cast<double>(armedBlkIdx * kBlockFrames) * 1000.0 / 48000.0,
                                1000.0 / 48000.0, kBlockFrames, blk.data(), st);
            armedOut.insert(armedOut.end(), blk.begin(), blk.end());
            ++armedBlkIdx;
            std::this_thread::sleep_for(std::chrono::microseconds(1500));
        }
        nt::audio::prepareMixPlan(armedPlan2, 48000.0, 64);
        for (int b = 0; b < 10; ++b) {
            std::vector<float> blk(std::size_t{kBlockFrames} * 2, 0.0f);
            nt::audio::mixBlock(newPlan, nullptr, 48000.0, static_cast<double>((armedBlkIdx + b) * kBlockFrames) * 1000.0 / 48000.0,
                                1000.0 / 48000.0, kBlockFrames, blk.data(), st);
            armedOut.insert(armedOut.end(), blk.begin(), blk.end());
            std::this_thread::sleep_for(std::chrono::microseconds(1500));
        }
        // Every block from index 4 onward in armedOut must be continuous tone with zero dropout!
        double minArmedBlockRms = 1.0;
        for (int b = 4; b < 23; ++b) {
            minArmedBlockRms = std::min(minArmedBlockRms, rmsInterleaved(armedOut, b * kBlockFrames, (b + 1) * kBlockFrames));
        }
        QVERIFY2(minArmedBlockRms > 0.02,
                 qPrintable(QStringLiteral("C2 armed64->armed64 rebuild caused dropout/reprime: minBlockRms=%1")
                                .arg(minArmedBlockRms)));
        pool.evictAll(&client);
#endif
    }

    // VST2 C3 + C6: Pure atomic callback handoff streams 64-frame low-latency callbacks without
    // underruns, and host RT thread scheduling accepts renderQuantumFrames separately from SHM
    // capacity during quiescent handshake and scheduling-only updates without resetting the plugin.
    void vst2_c3_c6_pureAtomicHandoffAndSeparateRenderQuantum() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        // Open with 64-frame render quantum (distinct from 512-frame SHM capacity).
        auto ch = VstLiveChannel::open(client, QStringLiteral("inst:c3-c6-q64"),
                                       tone->path, tone->uid, {}, 48000.0, &error, /*renderQuantumFrames=*/64);
        QVERIFY2(ch && ch->connected(), qPrintable(error));
        QCOMPARE(ch->configuredRenderQuantumFrames(), 64);

        const vsthost::ShmMidiEvent noteOn{0, 0x90, 60, 120, 0, 1, 0.0f};
        constexpr int kFrames = 64;
        std::vector<float> recorded;
        recorded.reserve(40 * kFrames * 2);
        double maxCbMs = 0.0;
        for (int b = 0; b < 32; ++b) {
            if (b == 16) {
                // C6: Update render quantum to 128 at same sample rate -> scheduling-only update,
                // must NOT reset held note or glitch audio!
                QVERIFY2(ch->prepareRate(48000.0, &error, 128), qPrintable(error));
                QCOMPARE(ch->configuredRenderQuantumFrames(), 128);
            }
            std::vector<float> blk(std::size_t{kFrames} * 2, 0.0f);
            const auto t0 = std::chrono::steady_clock::now();
            const auto res = ch->processBlockAsync(
                blk,
                b == 0 ? std::span<const vsthost::ShmMidiEvent>(&noteOn, 1) : std::span<const vsthost::ShmMidiEvent>{},
                48000.0, b == 0, /*desiredLatencyFrames=*/64);
            const double cbMs = std::chrono::duration<double, std::milli>(
                                    std::chrono::steady_clock::now() - t0).count();
            maxCbMs = std::max(maxCbMs, cbMs);
            QVERIFY(!res.peerDead);
            recorded.insert(recorded.end(), blk.begin(), blk.end());
            std::this_thread::sleep_for(std::chrono::microseconds(1333));
        }
        const double tailRms = rmsInterleaved(recorded, 20 * kFrames, 32 * kFrames);
        QVERIFY2(maxCbMs < 0.5, qPrintable(QStringLiteral("C3 atomic callback maxCbMs=%1").arg(maxCbMs)));
        QVERIFY2(tailRms > 0.02,
                 qPrintable(QStringLiteral("C6 scheduling-only quantum update silenced held note: tailRms=%1").arg(tailRms)));
        QCOMPARE(ch->underrunCount(), std::uint64_t{0});
        ch->close(&client);
#endif
    }

    // VST2 E2: Stopped-transport worker must NOT spin indefinitely; idle path sleeps only
    // (low per-thread CPU time) and multi-channel 64-frame streaming meets deadlines with zero underruns.
    void vst2_e2_stoppedTransportWorkerCpuAndMultiChannel() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        VstHostClient client;
        client.setOverrideExecutable(hostExe);
        client.setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client.scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        // Open 4 retained 64-frame/48 kHz channels: 2 will stream, 2 stay stopped (idle).
        constexpr int kChannels = 4;
        std::array<std::shared_ptr<VstLiveChannel>, kChannels> channels;
        for (int i = 0; i < kChannels; ++i) {
            channels[static_cast<std::size_t>(i)] = VstLiveChannel::open(
                client, QStringLiteral("inst:e2-ch-%1").arg(i), tone->path, tone->uid, {}, 48000.0, &error, 64);
            QVERIFY2(channels[static_cast<std::size_t>(i)] && channels[static_cast<std::size_t>(i)]->connected(),
                     qPrintable(error));
        }

        // Stream a short burst on channel 0, then stop transport on all channels.
        const vsthost::ShmMidiEvent noteOn{0, 0x90, 60, 110, 0, 1, 0.0f};
        std::vector<float> blk(std::size_t{64} * 2, 0.0f);
        for (int b = 0; b < 8; ++b) {
            (void)channels[0]->processBlockAsync(
                blk, b == 0 ? std::span<const vsthost::ShmMidiEvent>(&noteOn, 1) : std::span<const vsthost::ShmMidiEvent>{},
                48000.0, b == 0, 64);
            std::this_thread::sleep_for(std::chrono::microseconds(1333));
        }

        // Let the stopped-transport channel settle past the post-handoff active/warm windows into deep idle.
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
        const std::int64_t cpuBefore0 = channels[0]->workerCpuTimeUs();
        const std::int64_t cpuBefore1 = channels[1]->workerCpuTimeUs();
        QVERIFY2(cpuBefore0 >= 0 && cpuBefore1 >= 0, "E2: workerCpuTimeUs must be supported on POSIX/macOS");

        // Measure 500 ms of stopped-transport idle wall time.
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        const std::int64_t cpuAfter0 = channels[0]->workerCpuTimeUs();
        const std::int64_t cpuAfter1 = channels[1]->workerCpuTimeUs();
        const std::int64_t deltaUs0 = cpuAfter0 - cpuBefore0;
        const std::int64_t deltaUs1 = cpuAfter1 - cpuBefore1;
        qInfo().noquote() << QStringLiteral("VST2_E2_IDLE cpu0=%1us cpu1=%2us (500ms wall)")
                                 .arg(deltaUs0).arg(deltaUs1);
        // Sleep-only idle path must use < 5 ms CPU over 500 ms wall time (< 1% of one core).
        // (Prior spin-every-poll bug burned ~69,000 us = ~14% of one core per channel.)
        QVERIFY2(deltaUs0 >= 0 && deltaUs0 < 5000,
                 qPrintable(QStringLiteral("E2 stopped-transport worker 0 burned %1 us CPU in 500 ms wall").arg(deltaUs0)));
        QVERIFY2(deltaUs1 >= 0 && deltaUs1 < 5000,
                 qPrintable(QStringLiteral("E2 stopped-transport worker 1 burned %1 us CPU in 500 ms wall").arg(deltaUs1)));

        // Multi-channel restart deadline test (G1): arm/wake channels 0 and 1 from the non-RT
        // transport-start path before callbacks begin, with NO warm-up exclusion, asserting
        // first-response deadline (callback 1 outputs onset audio) and zero underruns across all
        // 32 callbacks while channels 2 and 3 remain deep idle.
        constexpr int kFrames = 64;
        const std::int64_t idle2Before = channels[2]->workerCpuTimeUs();
        const std::int64_t idle3Before = channels[3]->workerCpuTimeUs();
        const std::uint64_t underruns0Before = channels[0]->underrunCount();
        const std::uint64_t underruns1Before = channels[1]->underrunCount();
        channels[0]->armForPlayback();
        channels[1]->armForPlayback();
        std::vector<float> rec0, rec1;
        rec0.reserve(32 * kFrames * 2);
        rec1.reserve(32 * kFrames * 2);
        double firstRespRms0 = 0.0;
        double firstRespRms1 = 0.0;
        for (int b = 0; b < 32; ++b) {
            std::vector<float> b0(std::size_t{kFrames} * 2, 0.0f);
            std::vector<float> b1(std::size_t{kFrames} * 2, 0.0f);
            const auto midi = (b == 0) ? std::span<const vsthost::ShmMidiEvent>(&noteOn, 1)
                                       : std::span<const vsthost::ShmMidiEvent>{};
            const auto r0 = channels[0]->processBlockAsync(b0, midi, 48000.0, b == 0, 64);
            const auto r1 = channels[1]->processBlockAsync(b1, midi, 48000.0, b == 0, 64);
            QVERIFY2(!r0.peerDead && !r1.peerDead, "G1: peer died during restart");
            QVERIFY2(r0.outputReady && r1.outputReady,
                     qPrintable(QStringLiteral("G1: underrun on callback %1 from deep-idle restart (r0=%2 r1=%3)")
                                    .arg(b).arg(r0.outputReady).arg(r1.outputReady)));
            if (b == 1) {
                firstRespRms0 = rmsInterleaved(b0, 0, kFrames);
                firstRespRms1 = rmsInterleaved(b1, 0, kFrames);
            }
            rec0.insert(rec0.end(), b0.begin(), b0.end());
            rec1.insert(rec1.end(), b1.begin(), b1.end());
            std::this_thread::sleep_for(std::chrono::microseconds(1333));
        }
        const std::int64_t idle2Delta = channels[2]->workerCpuTimeUs() - idle2Before;
        const std::int64_t idle3Delta = channels[3]->workerCpuTimeUs() - idle3Before;
        QVERIFY2(idle2Delta >= 0 && idle2Delta < 3000 && idle3Delta >= 0 && idle3Delta < 3000,
                 qPrintable(QStringLiteral("E2 idle retained channels burned CPU during active render: ch2=%1 us ch3=%2 us")
                                .arg(idle2Delta).arg(idle3Delta)));
        QVERIFY2(firstRespRms0 > 0.01 && firstRespRms1 > 0.01,
                 qPrintable(QStringLiteral("G1: first-response block after 64-frame seed lost onset audio: rms0=%1 rms1=%2")
                                .arg(firstRespRms0).arg(firstRespRms1)));
        QVERIFY2(rmsInterleaved(rec0, 4 * kFrames, 32 * kFrames) > 0.02, "E2 active channel 0 silent");
        QVERIFY2(rmsInterleaved(rec1, 4 * kFrames, 32 * kFrames) > 0.02, "E2 active channel 1 silent");
        QVERIFY2((channels[0]->underrunCount() - underruns0Before) == 0 &&
                     (channels[1]->underrunCount() - underruns1Before) == 0,
                 qPrintable(QStringLiteral("G1: restart from deep idle had underruns without warmup exclusion: ch0=%1 ch1=%2")
                                .arg(channels[0]->underrunCount() - underruns0Before)
                                .arg(channels[1]->underrunCount() - underruns1Before)));

        for (auto& ch : channels) {
            ch->close(&client);
        }
#endif
    }

    // VST2 G1: Non-RT transport-start and plan-publish paths in AudioEngine must arm/wake deep-idle
    // VstLiveChannel workers BEFORE real-time callbacks begin, so 64-frame/48 kHz restart meets
    // the first-response deadline with zero underruns and no warm-up exclusion.
    void vst2_g1_audioEngineTransportStartAndPlanPublishWake() {
#ifdef Q_OS_WIN
        QSKIP("POSIX shared memory live channel tests are not supported on Windows");
#else
        const QString hostExe = findTestArtifact(QStringLiteral("tst_vsthostprotocol_artefacts/Release/tst_vsthostprotocol"));
        const QString toneVst = findTestArtifact(QStringLiteral("ToneInstrument_artefacts/Release/VST3/NodeTool Test Tone.vst3"));
        if (hostExe.isEmpty() || toneVst.isEmpty()) {
            QSKIP("NodeToolVstHost or ToneInstrument.vst3 not built in native/vst-host/build");
        }

        auto client = sharedVstHostClient();
        client->setOverrideExecutable(hostExe);
        client->setExtraScanDirs({QFileInfo(toneVst).absolutePath()});
        registerVstAudioStages(client);

        std::vector<VstPluginInfo> plugins;
        QString error;
        QVERIFY2(client->scanSync(true, &plugins, &error), qPrintable(error));
        const VstPluginInfo* tone = nullptr;
        for (const auto& p : plugins) {
            if (QFileInfo(p.path).canonicalFilePath() == toneVst) tone = &p;
        }
        QVERIFY(tone != nullptr);

        const QString trackId = QStringLiteral("g1-midi-track");
        const QString instanceKey = QStringLiteral("inst:") + trackId;
        const auto cleanup = qScopeGuard([&] {
            sharedVstLivePool().closeInstance(instanceKey, client.get());
        });

        auto makeTimeline = [&](double volumeDb) {
            QJsonObject plugin{
                {"path", tone->path},
                {"uid", tone->uid},
                {"name", tone->name},
                {"format", tone->format},
            };
            QJsonObject instrument{
                {"type", "vst"},
                {"plugin", plugin},
                {"gainDb", 0.0},
            };
            // At 125 BPM, 1 quarter = 480 ms = 960 ticks -> 0.5 ms/tick.
            // 15 blocks of 64 frames @ 48 kHz = 960 frames = 20.0 ms = 40 ticks exactly,
            // so n1 triggers on Step 1 (0 ms) and n2 triggers on Step 2 resume (20.0 ms).
            QJsonObject note1{
                {"id", "n1"},
                {"pitch", 60},
                {"velocity", 115},
                {"startTick", 0},
                {"durationTick", 1920},
                {"channel", 0},
            };
            QJsonObject note2{
                {"id", "n2"},
                {"pitch", 64},
                {"velocity", 115},
                {"startTick", 40},
                {"durationTick", 1920},
                {"channel", 0},
            };
            QJsonObject clip{
                {"id", "c1"},
                {"trackId", trackId},
                {"mediaType", "midi"},
                {"startMs", 0.0},
                {"durationMs", 2000.0},
                {"inPointMs", 0.0},
                {"notes", QJsonArray{note1, note2}},
            };
            QJsonObject track{
                {"id", trackId},
                {"type", "midi"},
                {"name", "G1 Synth"},
                {"volumeDb", volumeDb},
                {"pan", 0.0},
                {"muted", false},
                {"solo", false},
                {"recordArmed", true},
                {"instrument", instrument},
            };
            QJsonObject raw{
                {"id", "g1-tl"},
                {"name", "G1"},
                {"fps", 30},
                {"width", 1920},
                {"height", 1080},
                {"tempo", QJsonObject{{"bpm", 125.0}}},
                {"master", QJsonObject{{"volumeDb", 0.0}, {"limiter", false}}},
                {"tracks", QJsonArray{track}},
                {"clips", QJsonArray{clip}},
            };
            return std::make_shared<const nt::Timeline>(parseRaw(raw));
        };

        auto tl1 = makeTimeline(0.0);
        auto tl2 = makeTimeline(-1.0);

        nt::audio::AudioEngine engine;
        engine.setTimeline(tl1);
        nt::audio::AudioEngine::Options opts;
        opts.backend = nt::audio::AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        opts.periodFrames = 64;
        std::string startErr;
        QVERIFY2(engine.start(opts, &startErr), startErr.c_str());

        auto ch = sharedVstLivePool().acquire(*client, instanceKey, tone->path, tone->uid, {}, 48000.0, &error);
        QVERIFY2(ch && ch->connected(), qPrintable(error));

        constexpr int kFrames = 64;
        constexpr std::int64_t kStepNs = 1'333'333LL;
        std::int64_t hostNs = 0;

        // 1. Transport-start from deep idle: let worker settle past 250 ms idle, then start playback.
        std::this_thread::sleep_for(std::chrono::milliseconds(260));
        const std::uint64_t underrunsBeforeStart = ch->underrunCount();
        const std::int64_t sessionsBeforeStart = engine.stats().sessions;
        nt::playback::TransportCommand cmd;
        cmd.seq = 1;
        cmd.playing = true;
        cmd.rate = 1.0;
        cmd.seekSeq = 1;
        cmd.seekMs = 0.0;
        engine.feed().command.store(cmd);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().sessions > sessionsBeforeStart, 2000);

        double firstRespRmsStart = 0.0;
        for (int b = 0; b < 15; ++b) {
            std::vector<float> out(std::size_t{kFrames} * 2, 0.0f);
            engine.renderManual(out, hostNs);
            hostNs += kStepNs;
            if (b == 1) {
                firstRespRmsStart = rmsInterleaved(out, 0, kFrames);
            }
            std::this_thread::sleep_for(std::chrono::microseconds(1333));
        }
        QVERIFY2(firstRespRmsStart > 0.01,
                 qPrintable(QStringLiteral("G1 transport-start first-response missed deadline: rms=%1").arg(firstRespRmsStart)));
        QCOMPARE(ch->underrunCount() - underrunsBeforeStart, std::uint64_t{0});

        // 2. Pause -> deep idle (>250 ms) -> plan publish (setTimeline) -> immediate same-seekSeq
        //    resume (proving publishPlan() itself armed/woke the worker before callbacks start).
        cmd.seq = 2;
        cmd.playing = false;
        engine.feed().command.store(cmd);
        {
            std::vector<float> out(std::size_t{kFrames} * 2, 0.0f);
            engine.renderManual(out, hostNs);
            hostNs += kStepNs;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(260));

        const std::uint64_t underrunsBeforePublish = ch->underrunCount();
        engine.setTimeline(tl2);
        // Resume immediately with the SAME seekSeq (no seek wait in CallbackClockDriver), so
        // callback 0 enters mixSession immediately relying purely on publishPlan()'s wake/arm.
        cmd.seq = 3;
        cmd.playing = true;
        engine.feed().command.store(cmd);

        double firstRespRmsRestart = 0.0;
        for (int b = 0; b < 24; ++b) {
            std::vector<float> out(std::size_t{kFrames} * 2, 0.0f);
            engine.renderManual(out, hostNs);
            hostNs += kStepNs;
            if (b == 1) {
                firstRespRmsRestart = rmsInterleaved(out, 0, kFrames);
            }
            std::this_thread::sleep_for(std::chrono::microseconds(1333));
        }
        QVERIFY2(firstRespRmsRestart > 0.01,
                 qPrintable(QStringLiteral("G1 plan-publish/restart first-response missed deadline: rms=%1")
                                .arg(firstRespRmsRestart)));
        QCOMPARE(ch->underrunCount() - underrunsBeforePublish, std::uint64_t{0});

        engine.stop();
#endif
    }
};

QTEST_MAIN(TestVst)
#include "tst_vst.moc"
