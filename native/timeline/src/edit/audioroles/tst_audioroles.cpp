#include "AudioRoleJson.h"
#include "AudioRoles.h"
#include "AudioRolesTestSupport.h"
#include "RoleAnalysis.h"
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "audio/AudioEngine.h"
#include "audio/automation/Automation.h"
#include "audio/loudness/LiveLoudness.h"
#include "audio/loudness/Loudness.h"
#include "playback/AudioClockFeed.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "wiring/KeyActions.h"

#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>

#include <chrono>
#include <cmath>
#include <memory>
#include <thread>

using namespace audioroles_test;
using namespace nt::audioroles;

namespace {

// Loudness of a rendered stereo buffer, measured by the meter alone (no mix, no analysis code).
double lufsOf(const std::vector<float>& stereo) {
    nt::audio::LoudnessMeter meter(kRate, 2);
    meter.processInterleaved(stereo.data(), static_cast<int>(stereo.size() / 2));
    return meter.integrated();
}
double rmsDb(const std::vector<float>& stereo, double fromMs, double toMs) {
    const auto a = static_cast<std::size_t>(fromMs * kRate / 1000) * 2;
    const auto b = std::min(stereo.size(), static_cast<std::size_t>(toMs * kRate / 1000) * 2);
    double sum = 0;
    for (std::size_t i = a; i < b; ++i) sum += static_cast<double>(stereo[i]) * stereo[i];
    return 10 * std::log10(sum / static_cast<double>(b - a) + 1e-20);
}
QJsonObject clipOf(const QJsonObject& doc, const QString& id) {
    for (const auto& v : doc.value("clips").toArray()) {
        if (v.toObject().value("id").toString() == id) return v.toObject();
    }
    return {};
}
QJsonObject trackOf(const QJsonObject& doc, const QString& id) {
    for (const auto& v : doc.value("tracks").toArray()) {
        if (v.toObject().value("id").toString() == id) return v.toObject();
    }
    return {};
}
QJsonArray lanePoints(const QJsonObject& track) {
    for (const auto& v : track.value("automation").toArray()) {
        const auto lane = v.toObject();
        if (lane.value("target").toObject().value("param").toString() == u"volumeDb") return lane.value("points").toArray();
    }
    return {};
}

}  // namespace

class TestAudioRoles : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;
    QString wav(const QString& name, const std::vector<float>& mono, int channels = 2) {
        const auto path = m_dir.filePath(name);
        writeWav(path, mono, channels);
        return path;
    }
    std::unique_ptr<TimelineModel> load(const QByteArray& json) {
        auto parsed = nt::parseTimelineJson(json);
        Q_ASSERT(parsed.timeline);
        auto model = std::make_unique<TimelineModel>();
        model->setTimeline(std::move(*parsed.timeline));
        return model;
    }
    nt::Timeline parse(const QByteArray& json) {
        auto parsed = nt::parseTimelineJson(json);
        Q_ASSERT(parsed.timeline);
        return std::move(*parsed.timeline);
    }
    // Dialogue on "voice" at 2 to 4 s and 6 to 7.5 s, a long music tone on "music", for 10 s.
    QByteArray duckingDocument(double musicStartMs = 0, double trackDb = 0, const QString& musicRole = "music") {
        const auto voice = wav("voice.wav", speech(10, 0.4f, [](double t) { return (t >= 2 && t < 4) || (t >= 6 && t < 7.5); }));
        auto music = tone(10, 220, 0.2f);
        const auto tone2 = tone(10, 330, 0.1f);
        for (std::size_t i = 0; i < music.size(); ++i) music[i] += tone2[i];
        const auto bed = wav("music.wav", music);
        return document({audioTrack("voice", 0), audioTrack("music", 1, trackDb)},
                        {audioClip("dlg", "voice", voice, musicStartMs, 10000, "dialogue"),
                         audioClip("mus", "music", bed, musicStartMs, 10000, musicRole)},
                        musicStartMs + 10000);
    }

private slots:
    void initTestCase() {
        QVERIFY(m_dir.isValid());
        // The app registers the automation stage at start-up. The mix needs it to play a volume lane.
        nt::automation::ensureRegistered();
    }

    void rolesAndDefaults() {
        QCOMPARE(roles(), QStringList({"dialogue", "music", "sfx", "ambience"}));
        QCOMPARE(effectiveRole({{"audioRole", "sfx"}}), QString("sfx"));
        QCOMPARE(effectiveRole({{"audioRole", "nonsense"}}), QString());
        QCOMPARE(effectiveRole({{"bindingKind", "text-to-audio"}}), QString("dialogue"));
        QCOMPARE(effectiveRole({{"bindingKind", "text-to-music"}}), QString("music"));
        QCOMPARE(effectiveRole({{"bindingKind", "text-to-audio"}, {"audioRole", "ambience"}}), QString("ambience"));
        QCOMPARE(effectiveRole({}), QString());
        QCOMPARE(defaultTargetLufs("dialogue"), -23.0);
        QCOMPARE(defaultTargetLufs("music"), -25.0);
        QCOMPARE(defaultTargetLufs("sfx"), -21.0);
        QCOMPARE(defaultTargetLufs("ambience"), -30.0);
    }

    void setRoleIsOneUndoEntry() {
        auto model = load(duckingDocument());
        QVERIFY(nt::app::findEdit("setClipsAudioRole"));
        QVERIFY(model->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"dlg", "mus"}}, {"role", "sfx"}}));
        QCOMPARE(model->undoStack()->count(), 1);
        QCOMPARE(clipOf(model->timeline().raw, "dlg").value("audioRole").toString(), QString("sfx"));
        QCOMPARE(clipOf(model->timeline().raw, "mus").value("audioRole").toString(), QString("sfx"));
        // The same role again is no edit. An unknown role is refused.
        QVERIFY(!model->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"dlg"}}, {"role", "sfx"}}));
        QVERIFY(!model->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"dlg"}}, {"role", "Foley"}}));
        QCOMPARE(model->undoStack()->count(), 1);
        model->undoStack()->undo();
        QCOMPARE(clipOf(model->timeline().raw, "dlg").value("audioRole").toString(), QString("dialogue"));
        QVERIFY(model->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"dlg"}}, {"role", ""}}));
        QVERIFY(!clipOf(model->timeline().raw, "dlg").contains("audioRole"));
    }

    void setRoleSkipsLockedAndSilentClips() {
        auto raw = QJsonDocument::fromJson(duckingDocument()).object();
        auto clips = raw.value("clips").toArray();
        auto locked = clips[0].toObject();
        locked.insert("locked", true);
        clips[0] = locked;
        auto image = clips[1].toObject();
        image.insert("id", "picture");
        image.insert("mediaType", "image");
        clips.append(image);
        raw.insert("clips", clips);
        auto model = load(QJsonDocument(raw).toJson());
        QVERIFY(!model->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"dlg", "picture"}}, {"role", "sfx"}}));
        QCOMPARE(clipOf(model->timeline().raw, "dlg").value("audioRole").toString(), QString("dialogue"));
    }

    void volumesAreOneUndoEntryAndClamped() {
        auto model = load(duckingDocument());
        QVERIFY(model->applyEdit("setClipsVolumeDb", {{"volumes", QJsonObject{{"dlg", -4.5}, {"mus", 99}}}}));
        QCOMPARE(model->undoStack()->count(), 1);
        QCOMPARE(clipOf(model->timeline().raw, "dlg").value("volumeDb").toDouble(), -4.5);
        QCOMPARE(clipOf(model->timeline().raw, "mus").value("volumeDb").toDouble(), 24.0);
        model->undoStack()->undo();
        QVERIFY(!clipOf(model->timeline().raw, "dlg").contains("volumeDb"));
    }

    void duckingEditWritesAndReplacesALane() {
        auto model = load(duckingDocument());
        const QJsonObject first = duckPayload({{"music", 0, 10000, 0,
            QJsonArray{QJsonObject{{"timeMs", 1200}, {"value", 0}}, QJsonObject{{"timeMs", 2000}, {"value", -15}},
                       QJsonObject{{"timeMs", 4000}, {"value", -15}}, QJsonObject{{"timeMs", 4800}, {"value", 0}}}}});
        QVERIFY(model->applyEdit("applyDucking", first));
        QCOMPARE(model->undoStack()->count(), 1);
        auto points = lanePoints(trackOf(model->timeline().raw, "music"));
        QCOMPARE(points.size(), 4);
        QCOMPARE(points[1].toObject().value("value").toDouble(), -15.0);
        // Running it again with other settings replaces the points of the range, it does not stack.
        const QJsonObject second = duckPayload({{"music", 0, 10000, 0,
            QJsonArray{QJsonObject{{"timeMs", 1500}, {"value", 0}}, QJsonObject{{"timeMs", 2000}, {"value", -6}},
                       QJsonObject{{"timeMs", 4000}, {"value", -6}}, QJsonObject{{"timeMs", 4500}, {"value", 0}}}}});
        QVERIFY(model->applyEdit("applyDucking", second));
        points = lanePoints(trackOf(model->timeline().raw, "music"));
        QCOMPARE(points.size(), 4);
        QCOMPARE(points[1].toObject().value("value").toDouble(), -6.0);
        // Identical input is no edit, and one undo restores the previous ducking.
        QVERIFY(!model->applyEdit("applyDucking", second));
        model->undoStack()->undo();
        QCOMPARE(lanePoints(trackOf(model->timeline().raw, "music"))[1].toObject().value("value").toDouble(), -15.0);
        model->undoStack()->undo();
        QVERIFY(!trackOf(model->timeline().raw, "music").contains("automation"));
        QCOMPARE(model->undoStack()->count(), 2);
    }

    void duckingKeepsNeighboursAndDipsAtTheEdge() {
        auto model = load(duckingDocument());
        // A hand-drawn point outside the range survives.
        const QJsonObject drawn = duckPayload({{"music", 20000, 25000, -3,
            QJsonArray{QJsonObject{{"timeMs", 21000}, {"value", -3}}, QJsonObject{{"timeMs", 22000}, {"value", -9}}}}});
        QVERIFY(model->applyEdit("applyDucking", drawn));
        // A dip that reaches the start of the range gets a flat anchor before it, so it never ramps in from the neighbour.
        const QJsonObject edge = duckPayload({{"music", 0, 10000, 0,
            QJsonArray{QJsonObject{{"timeMs", 0}, {"value", -15}}, QJsonObject{{"timeMs", 3000}, {"value", -15}},
                       QJsonObject{{"timeMs", 3800}, {"value", 0}}}}});
        QVERIFY(model->applyEdit("applyDucking", edge));
        const auto points = lanePoints(trackOf(model->timeline().raw, "music"));
        QList<double> times;
        for (const auto& p : points) times.append(p.toObject().value("timeMs").toDouble());
        QVERIFY2(std::is_sorted(times.begin(), times.end()), "points stay sorted");
        QVERIFY(times.contains(21000) && times.contains(22000));
        QVERIFY(times.contains(0) && times.contains(3000) && times.contains(3800));
        // The base level also follows a dip that ends fully ducked.
        QCOMPARE(points.last().toObject().value("timeMs").toDouble(), 22001.0);
    }

    void duckingRefusesLockedAndVideoTracks() {
        auto raw = QJsonDocument::fromJson(duckingDocument()).object();
        auto tracks = raw.value("tracks").toArray();
        auto locked = tracks[1].toObject();
        locked.insert("locked", true);
        tracks[1] = locked;
        raw.insert("tracks", tracks);
        auto model = load(QJsonDocument(raw).toJson());
        const QJsonObject payload = duckPayload({{"music", 0, 10000, 0, QJsonArray{QJsonObject{{"timeMs", 1000}, {"value", -9}}}}});
        QVERIFY(!model->applyEdit("applyDucking", payload));
    }

    void measuredLoudnessIgnoresGainFadesAndTrackFader() {
        const auto sig = speech(12, 0.05f, [](double t) { return std::fmod(t, 3.0) < 2.2; });
        const auto path = wav("quiet.wav", sig);
        auto json = QJsonDocument::fromJson(document({audioTrack("a", 0, -9)}, {audioClip("c", "a", path, 0, 12000, "dialogue")}, 12000)).object();
        auto clips = json.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("volumeDb", -12);
        clip.insert("fadeInMs", 2000);
        clip.insert("fadeOutMs", 2000);
        clips[0] = clip;
        json.insert("clips", clips);
        const auto timeline = parse(QJsonDocument(json).toJson());
        const auto results = measureClips(timeline, {"c"}, {}, {});
        QCOMPARE(results.size(), size_t(1));
        QVERIFY2(results[0].ok, qPrintable(results[0].problem));
        std::vector<float> stereo;
        for (float s : sig) { stereo.push_back(s); stereo.push_back(s); }
        QVERIFY2(std::abs(results[0].integratedLufs - lufsOf(stereo)) < 0.05,
                 qPrintable(QString::number(results[0].integratedLufs) + " vs " + QString::number(lufsOf(stereo))));
        QVERIFY(!results[0].mono);
    }

    void monoFilesMeasureAsOneChannel() {
        const auto sig = speech(12, 0.3f, [](double t) { return std::fmod(t, 3.0) < 2.2; });
        const auto stereoPath = wav("dual.wav", sig, 2);
        const auto monoPath = wav("mono.wav", sig, 1);
        const auto timeline = parse(document({audioTrack("a", 0), audioTrack("b", 1)},
            {audioClip("two", "a", stereoPath, 0, 12000), audioClip("one", "b", monoPath, 0, 12000)}, 12000));
        const auto r = measureClips(timeline, {"two", "one"}, {}, {});
        QVERIFY(r[0].ok && r[1].ok);
        QVERIFY(!r[0].mono && r[1].mono);
        // The dual-mono pair carries twice the energy: 3.01 LU more than the mono file.
        QVERIFY2(std::abs(r[0].integratedLufs - r[1].integratedLufs - 3.0103) < 0.1,
                 qPrintable(QString::number(r[0].integratedLufs) + " / " + QString::number(r[1].integratedLufs)));
        nt::audio::LoudnessMeter file(kRate, 1);
        file.processInterleaved(sig.data(), static_cast<int>(sig.size()));
        QVERIFY(std::abs(r[1].integratedLufs - file.integrated()) < 0.1);
    }

    void silentAndMissingClipsReportAProblem() {
        const auto silent = wav("silent.wav", std::vector<float>(kRate * 3, 0.0f));
        const auto timeline = parse(document({audioTrack("a", 0)},
            {audioClip("s", "a", silent, 0, 3000, "music"), audioClip("gone", "a", m_dir.filePath("nope.wav"), 0, 3000, "music")}, 3000));
        const auto r = measureClips(timeline, {"s", "gone", "absent"}, {}, {});
        QCOMPARE(r.size(), size_t(3));
        for (const auto& m : r) {
            QVERIFY(!m.ok);
            QVERIFY(!m.problem.isEmpty());
        }
        QVERIFY(r[0].problem.contains("silent"));
    }

    void matchLandsWithinHalfALuInOneUndoEntry() {
        const auto talk = wav("talk.wav", speech(12, 0.05f, [](double t) { return std::fmod(t, 3.0) < 2.2; }));
        const auto loud = wav("loud.wav", speech(12, 0.9f, [](double t) { return std::fmod(t, 2.0) < 1.5; }));
        auto bed = tone(12, 220, 0.4f);
        const auto bedPath = wav("bed.wav", bed);
        auto model = load(document({audioTrack("a", 0), audioTrack("b", 1), audioTrack("c", 2)},
            {audioClip("quiet", "a", talk, 0, 12000, "dialogue"), audioClip("shout", "b", loud, 0, 12000, "dialogue"),
             audioClip("bed", "c", bedPath, 0, 12000, "music"), audioClip("plain", "c", talk, 0, 12000)}, 12000));
        auto* roles = AudioRoles::forTimeline(model.get());
        QVERIFY(roles);
        QCOMPARE(AudioRoles::forTimeline(model.get()), roles);
        QSignalSpy finished(roles, &AudioRoles::finished);
        roles->matchLoudness({});
        QVERIFY(roles->busy());
        QTRY_VERIFY_WITH_TIMEOUT(finished.count() == 1, 30000);
        QVERIFY(!roles->busy());
        QVERIFY2(finished.first().at(1).toBool(), qPrintable(roles->message()));
        QCOMPARE(model->undoStack()->count(), 1);
        // Measure the result with the meter alone: clip volume applied by hand to the source signal.
        const auto check = [&](const QString& id, const std::vector<float>& mono, double target) {
            const double volume = clipOf(model->timeline().raw, id).value("volumeDb").toDouble();
            std::vector<float> stereo;
            const float gain = static_cast<float>(std::pow(10.0, volume / 20.0));
            for (float s : mono) { stereo.push_back(s * gain); stereo.push_back(s * gain); }
            QVERIFY2(std::abs(lufsOf(stereo) - target) <= 0.5, qPrintable(id + ": " + QString::number(lufsOf(stereo)) + " LUFS, wanted " + QString::number(target)));
        };
        check("quiet", speech(12, 0.05f, [](double t) { return std::fmod(t, 3.0) < 2.2; }), -23);
        check("shout", speech(12, 0.9f, [](double t) { return std::fmod(t, 2.0) < 1.5; }), -23);
        check("bed", bed, -25);
        // The clip without a role is left alone.
        QVERIFY(!clipOf(model->timeline().raw, "plain").contains("volumeDb"));
        QVERIFY(roles->message().contains("Matched 3 clips"));
        model->undoStack()->undo();
        QVERIFY(!clipOf(model->timeline().raw, "quiet").contains("volumeDb"));
        QVERIFY(!clipOf(model->timeline().raw, "bed").contains("volumeDb"));
    }

    void matchAgainRepeatsTheSameVolume() {
        const auto talk = wav("again.wav", speech(8, 0.1f, [](double t) { return std::fmod(t, 2.0) < 1.4; }));
        auto model = load(document({audioTrack("a", 0)}, {audioClip("c", "a", talk, 0, 8000, "dialogue")}, 8000));
        auto* roles = AudioRoles::forTimeline(model.get());
        QSignalSpy finished(roles, &AudioRoles::finished);
        roles->matchLoudness({"c"});
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        const double first = clipOf(model->timeline().raw, "c").value("volumeDb").toDouble();
        roles->matchLoudness({"c"});
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 2, 30000);
        // Measuring ignores the volume already set, so a second run lands on the same value and is no new edit.
        QCOMPARE(clipOf(model->timeline().raw, "c").value("volumeDb").toDouble(), first);
        QCOMPARE(model->undoStack()->count(), 1);
        QVERIFY(!finished.at(1).at(1).toBool());
    }

    void normalizeToLoudnessAndPeak() {
        const auto sig = speech(8, 0.2f, [](double t) { return std::fmod(t, 2.0) < 1.4; });
        const auto path = wav("norm.wav", sig);
        auto model = load(document({audioTrack("a", 0)}, {audioClip("c", "a", path, 0, 8000)}, 8000));
        auto* roles = AudioRoles::forTimeline(model.get());
        QSignalSpy finished(roles, &AudioRoles::finished);
        roles->normalize({"c"}, "loudness", -16);
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        std::vector<float> stereo;
        float gain = static_cast<float>(std::pow(10.0, clipOf(model->timeline().raw, "c").value("volumeDb").toDouble() / 20.0));
        for (float s : sig) { stereo.push_back(s * gain); stereo.push_back(s * gain); }
        QVERIFY(std::abs(lufsOf(stereo) + 16) <= 0.2);
        roles->normalize({"c"}, "peak", -3);
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 2, 30000);
        gain = static_cast<float>(std::pow(10.0, clipOf(model->timeline().raw, "c").value("volumeDb").toDouble() / 20.0));
        float peak = 0;
        for (float s : sig) peak = std::max(peak, std::abs(s * gain));
        QVERIFY(std::abs(20 * std::log10(peak) + 3) <= 0.1);
        QCOMPARE(model->undoStack()->count(), 2);
        // A target outside the range is refused without starting a measurement.
        roles->normalize({"c"}, "loud", -16);
        QVERIFY(!roles->busy());
    }

    void cancelLeavesTheDocumentAlone() {
        const auto longTone = wav("long.wav", tone(90, 440, 0.2f));
        auto model = load(document({audioTrack("a", 0)}, {audioClip("c", "a", longTone, 0, 90000, "music")}, 90000));
        auto* roles = AudioRoles::forTimeline(model.get());
        QSignalSpy finished(roles, &AudioRoles::finished);
        const auto before = model->timeline().raw;
        roles->matchLoudness({});
        QVERIFY(roles->busy());
        roles->cancel();
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        QVERIFY(!finished.first().at(1).toBool());
        QCOMPARE(model->timeline().raw, before);
        QCOMPARE(model->undoStack()->count(), 0);
        QVERIFY(roles->message().contains("Cancelled"));
        QVERIFY(!roles->busy());
    }

    void aChangedDocumentDiscardsTheResult() {
        const auto talk = wav("stale.wav", speech(20, 0.1f, [](double t) { return std::fmod(t, 2.0) < 1.4; }));
        auto model = load(document({audioTrack("a", 0)}, {audioClip("c", "a", talk, 0, 20000, "dialogue")}, 20000));
        auto* roles = AudioRoles::forTimeline(model.get());
        QSignalSpy finished(roles, &AudioRoles::finished);
        roles->matchLoudness({});
        QVERIFY(model->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"c"}}, {"role", "music"}}));
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        QVERIFY(!finished.first().at(1).toBool());
        QVERIFY(!clipOf(model->timeline().raw, "c").contains("volumeDb"));
        QVERIFY(roles->messageIsError());
        QVERIFY(roles->message().contains("changed"));
        QCOMPARE(model->undoStack()->count(), 1);
    }

    void matchWithoutARoleExplainsWhy() {
        const auto talk = wav("none.wav", speech(4, 0.1f, [](double) { return true; }));
        auto model = load(document({audioTrack("a", 0)}, {audioClip("c", "a", talk, 0, 4000)}, 4000));
        auto* roles = AudioRoles::forTimeline(model.get());
        roles->matchLoudness({"c"});
        QVERIFY(!roles->busy());
        QVERIFY(roles->messageIsError());
        QVERIFY(roles->message().contains("role"));
        QCOMPARE(model->undoStack()->count(), 0);
    }

    void roleSummaryAndSettings() {
        auto model = load(duckingDocument());
        auto* roles = AudioRoles::forTimeline(model.get());
        QCOMPARE(roles->roleSummary({"dlg"}).value("role").toString(), QString("dialogue"));
        QCOMPARE(roles->roleSummary({"dlg", "mus"}).value("role").toString(), QString("mixed"));
        QCOMPARE(roles->roleSummary({"nothing"}).value("count").toInt(), 0);
        QVERIFY(roles->setRole({"dlg", "mus"}, "sfx"));
        QCOMPARE(roles->roleOf("mus"), QString("sfx"));
        roles->setTarget("music", -20);
        roles->setDuckReduceDb(-12);
        roles->setDuckAgainst({"music", "sfx"});
        QCOMPARE(roles->duckAgainst(), QStringList({"sfx"}));
        QCOMPARE(roles->duckReduceDb(), 12.0);
        // Settings persist for the next timeline.
        auto other = load(duckingDocument());
        auto* again = AudioRoles::forTimeline(other.get());
        QCOMPARE(again->targets().value("music").toDouble(), -20.0);
        QCOMPARE(again->duckReduceDb(), 12.0);
        QCOMPARE(again->duckAgainst(), QStringList({"sfx"}));
        // Later tests start from the defaults.
        again->setTarget("music", -25);
        again->setDuckReduceDb(15);
        again->setDuckAgainst({"dialogue"});
    }

    void planDuckingFindsTheDialogue() {
        const auto timeline = parse(duckingDocument());
        const auto plans = planDucking(timeline, {"mus"}, {}, {}, {});
        QCOMPARE(plans.size(), size_t(1));
        const auto& plan = plans[0];
        QVERIFY2(plan.problem.isEmpty(), qPrintable(plan.problem));
        QCOMPARE(plan.triggerIds, std::vector<std::string>({"dlg"}));
        QCOMPARE(plan.regionsMs.size(), size_t(2));
        QVERIFY(std::abs(plan.regionsMs[0].first - 2000) < 120 && std::abs(plan.regionsMs[0].second - 4000) < 120);
        QVERIFY(std::abs(plan.regionsMs[1].first - 6000) < 120 && std::abs(plan.regionsMs[1].second - 7500) < 120);
        const std::vector<std::pair<double, double>> want{{1200, 0}, {2000, -15}, {4000, -15}, {4800, 0}, {5200, 0}, {6000, -15}, {7500, -15}, {8300, 0}};
        QCOMPARE(plan.points.size(), want.size());
        for (std::size_t i = 0; i < want.size(); ++i) {
            QVERIFY2(std::abs(plan.points[i].first - want[i].first) <= 130, qPrintable(QString::number(i) + ": " + QString::number(plan.points[i].first)));
            QCOMPARE(plan.points[i].second, want[i].second);
        }
    }

    void planDuckingFollowsTheClipOffsetAndFader() {
        // The same signal 20 s into the document, on a track at -6 dB: base -6, depth 15.
        const auto timeline = parse(duckingDocument(20000, -6));
        const auto plans = planDucking(timeline, {"mus"}, {}, {}, {});
        QVERIFY(plans[0].problem.isEmpty());
        QCOMPARE(plans[0].baseDb, -6.0);
        QCOMPARE(plans[0].points.size(), size_t(8));
        QVERIFY(std::abs(plans[0].points[1].first - 22000) <= 130);
        QCOMPARE(plans[0].points[1].second, -21.0);
        QCOMPARE(plans[0].points[0].second, -6.0);
    }

    void planDuckingNeedsAnAudioTrackAndTriggers() {
        auto raw = QJsonDocument::fromJson(duckingDocument()).object();
        auto tracks = raw.value("tracks").toArray();
        auto video = tracks[1].toObject();
        video.insert("type", "video");
        tracks[1] = video;
        raw.insert("tracks", tracks);
        auto plans = planDucking(parse(QJsonDocument(raw).toJson()), {"mus"}, {}, {}, {});
        QVERIFY(plans[0].problem.contains("audio track"));
        QVERIFY(duckingPayload(plans).value("entries").toArray().isEmpty());
        // No dialogue under the music: nothing to duck, and an empty plan to clear old ducking.
        DuckSettings sfxOnly;
        sfxOnly.against = {"sfx"};
        plans = planDucking(parse(duckingDocument()), {"mus"}, sfxOnly, {}, {});
        QVERIFY(plans[0].problem.isEmpty());
        QVERIFY(plans[0].triggerIds.empty() && plans[0].points.empty());
    }

    void duckingLowersTheMusicInTheRender() {
        auto model = load(duckingDocument());
        auto* roles = AudioRoles::forTimeline(model.get());
        QSignalSpy finished(roles, &AudioRoles::finished);
        roles->duck({});
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        QVERIFY2(finished.first().at(1).toBool(), qPrintable(roles->message()));
        QCOMPARE(model->undoStack()->count(), 1);
        QVERIFY(roles->message().contains("Ducked 1 clip under 2 passages"));
        // Render the music alone through the same mixer the --render-audio command uses.
        auto soloRaw = model->timeline().raw;
        auto tracks = soloRaw.value("tracks").toArray();
        auto voice = tracks[0].toObject();
        voice.insert("muted", true);
        tracks[0] = voice;
        soloRaw.insert("tracks", tracks);
        const auto rendered = nt::audio::renderOffline(parse(QJsonDocument(soloRaw).toJson()), kRate, 0, 10000);
        const double open = rmsDb(rendered, 500, 1000);
        const double ducked = rmsDb(rendered, 2500, 3500);
        const double second = rmsDb(rendered, 6300, 7200);
        const double after = rmsDb(rendered, 9000, 9800);
        QVERIFY2(std::abs((ducked - open) + 15) < 0.4, qPrintable(QString::number(ducked - open)));
        QVERIFY2(std::abs((second - open) + 15) < 0.4, qPrintable(QString::number(second - open)));
        QVERIFY2(std::abs(after - open) < 0.2, qPrintable(QString::number(after - open)));
        // Running it again with a shallower dip replaces the first.
        roles->setDuckReduceDb(6);
        roles->duck({});
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 2, 30000);
        QCOMPARE(lanePoints(trackOf(model->timeline().raw, "music")).size(), 8);
        QCOMPARE(model->undoStack()->count(), 2);
        // A clip that is not Music or Ambience is not ducked.
        QVERIFY(model->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"mus"}}, {"role", "dialogue"}}));
        roles->duck({"mus"});
        QVERIFY(!roles->busy());
        QVERIFY(roles->messageIsError());
    }

    // The meter of the mix: the device callback feeds it and the test reads it from another thread, as the panel does.
    void theLiveMeterReadsTheMixTheEnginePlays() {
        const auto path = wav("live.wav", tone(8, 997, 0.1f));
        auto timeline = std::make_shared<const nt::Timeline>(parse(document({audioTrack("a", 0)}, {audioClip("t", "a", path, 0, 8000)}, 8000)));
        nt::audio::LoudnessReadout readout;
        nt::audio::AudioEngine engine;
        engine.setTimeline(timeline);
        nt::audio::AudioEngine::Options options;
        options.backend = nt::audio::AudioEngine::Backend::Null;
        options.sampleRate = kRate;
        options.loudness = &readout;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        QCOMPARE(readout.read().blocks, std::uint64_t(0));
        nt::playback::TransportCommand command;
        command.seq = 1;
        command.playing = true;
        command.rate = 1.0;
        command.seekSeq = 1;
        command.seekMs = 0;
        command.seekIssuedNs = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
        engine.feed().command.store(command);
        QTRY_VERIFY_WITH_TIMEOUT(readout.read().blocks > 0 && std::isfinite(readout.read().integrated), 8000);
        QTest::qWait(1500);
        const auto reading = readout.read();
        // The same tone through the meter alone. The tone is steady, so any stretch of it reads the same.
        std::vector<float> stereo;
        for (float v : tone(3, 997, 0.1f)) { stereo.push_back(v); stereo.push_back(v); }
        QVERIFY2(std::abs(reading.integrated - lufsOf(stereo)) < 0.2, qPrintable(QString::number(reading.integrated) + " vs " + QString::number(lufsOf(stereo))));
        QVERIFY(std::abs(reading.momentary - reading.integrated) < 0.3);
        QVERIFY(std::isfinite(reading.truePeakDb) && reading.truePeakDb < -19 && reading.truePeakDb > -21);
        // A reset from this thread clears the integrated reading at the next block. It builds up again after 400 ms.
        readout.requestReset();
        QTRY_VERIFY_WITH_TIMEOUT(!std::isfinite(readout.read().integrated), 200);
        QTRY_VERIFY_WITH_TIMEOUT(std::isfinite(readout.read().integrated), 3000);
        engine.stop();
        // Stopped: the last readings stay, nothing moves.
        const auto stopped = readout.read();
        QTest::qWait(100);
        QCOMPARE(readout.read().blocks, stopped.blocks);
    }

    void actionsAreRegistered() {
        QStringList keys;
        for (const auto& action : nt::wiring::keyActions()) keys.append(action.name);
        for (const auto* name : {"matchLoudness", "duckMusic", "audioRole.dialogue", "audioRole.music", "audioRole.sfx",
                                 "audioRole.ambience", "audioRole.none"}) {
            QVERIFY2(keys.contains(name), name);
        }
        QStringList shell;
        for (const auto& entry : nt::app::shellMenuEntries("Clip")) shell.append(entry.action);
        QVERIFY(shell.contains("matchLoudness") && shell.contains("duckMusic") && shell.contains("audioRole.sfx"));
    }
};

int main(int argc, char** argv) {
    qputenv("QT_QPA_PLATFORM", "offscreen");
    QGuiApplication app(argc, argv);
    TestAudioRoles test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_audioroles.moc"
