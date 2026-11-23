// The music document fields through the native model and the native save
// (docs/MUSIC-MODE.md MD1 to MD5, PS-1, MM1 exit 1). The fixture is
// packages/timeline/tests/fixtures/music-document.json, which
// musicFields.protocolCompat.test.ts parses through the server schema with
// nothing stripped. Here the native load keeps every field, the typed reads
// see them, and the autosave request sends exactly that document.
#include "model/TimelineJson.h"
#include "midi/PatternExpand.h"
#include "music/MusicDocument.h"
#include "server/AutosaveController.h"
#include "TestHttpServer.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QtTest>

namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(NT_MUSIC_FIXTURE));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(file.readAll()).object();
}
QJsonObject patternDocument(const QJsonObject& pattern, bool stepTemplate) {
    auto doc = fixture();
    auto tracks = doc.value("tracks").toArray();
    QJsonObject track{{"id", "m"}, {"name", "MIDI"}, {"type", "midi"},
        {"index", static_cast<int>(tracks.size())}, {"visible", true}, {"locked", false}};
    if (stepTemplate) { track.insert("stepTemplate", pattern); }
    tracks.append(track); doc.insert("tracks", tracks);
    if (!stepTemplate) {
        doc.insert("clips", QJsonArray{QJsonObject{{"id", "p"}, {"trackId", "m"}, {"mediaType", "midi"},
            {"startMs", 0}, {"durationMs", 4000}, {"pattern", pattern}}});
    }
    return doc;
}
} // namespace

class MusicDocumentTests : public QObject {
    Q_OBJECT
private slots:
    void reviewF19RowText_data() {
        QTest::addColumn<QString>("field"); QTest::addColumn<QJsonValue>("value");
        QTest::addColumn<bool>("stepTemplate");
        for (bool stepTemplate : {false, true}) {
            const QString prefix = stepTemplate ? "template-" : "clip-";
            for (const auto& field : {QString("name"), QString("color")}) {
                QTest::newRow(qPrintable(prefix + field + "-number")) << field << QJsonValue(7) << stepTemplate;
                QTest::newRow(qPrintable(prefix + field + "-null")) << field << QJsonValue(QJsonValue::Null) << stepTemplate;
                QTest::newRow(qPrintable(prefix + field + "-object")) << field << QJsonValue(QJsonObject{}) << stepTemplate;
                QTest::newRow(qPrintable(prefix + field + "-empty")) << field << QJsonValue(QString{}) << stepTemplate;
                QTest::newRow(qPrintable(prefix + field + "-text")) << field << QJsonValue(QStringLiteral("Custom text")) << stepTemplate;
            }
        }
    }
    void reviewF19RowText() {
        QFETCH(QString, field); QFETCH(QJsonValue, value); QFETCH(bool, stepTemplate);
        auto pattern = nt::midi::normalizePattern({{"rows", QJsonArray{QJsonObject{{"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}}}}});
        QVERIFY(nt::midi::validateStepPattern(pattern).isEmpty());
        auto row = pattern.value("rows").toArray().first().toObject();
        row.insert(field, value); pattern.insert("rows", QJsonArray{row});
        const auto parsed = nt::parseTimeline(patternDocument(pattern, stepTemplate));
        QCOMPARE(parsed.timeline.has_value(), value.isString());
        if (parsed.timeline) {
            const auto stored = stepTemplate ? parsed.timeline->tracks.back().raw.value("stepTemplate") :
                parsed.timeline->clips.front().raw.value("pattern");
            QCOMPARE(stored, QJsonValue(pattern));
        }
    }
    void reviewF25IndependentRowLength_data() {
        QTest::addColumn<bool>("stepTemplate");
        QTest::newRow("clip") << false;
        QTest::newRow("template") << true;
    }
    void reviewF25IndependentRowLength() {
        QFETCH(bool, stepTemplate);
        auto pattern = nt::midi::normalizePattern({{"lengthSteps", 16}, {"rows", QJsonArray{QJsonObject{{"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}}}}});
        auto row = pattern.value("rows").toArray().first().toObject();
        QJsonArray steps; for (int i = 0; i < 32; ++i) { steps.append(QJsonObject{{"on", true}}); }
        row.insert("lengthSteps", 32); row.insert("loopEnd", 32); row.insert("steps", steps);
        pattern.insert("rows", QJsonArray{row});
        const auto parsed = nt::parseTimeline(patternDocument(pattern, stepTemplate));
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        const auto stored = stepTemplate ? parsed.timeline->tracks.back().raw.value("stepTemplate") :
            parsed.timeline->clips.front().raw.value("pattern");
        QCOMPARE(stored, QJsonValue(pattern));
    }
    void loadKeepsEveryMusicField() {
        const auto raw = fixture();
        QVERIFY(raw.contains("music"));
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        const auto& timeline = *parsed.timeline;
        QCOMPARE(timeline.raw, raw);
        QCOMPARE(timeline.tracks.size(), std::size_t{4});
        for (std::size_t i = 0; i < timeline.tracks.size(); ++i) {
            QCOMPARE(timeline.tracks[i].raw, raw["tracks"].toArray()[static_cast<qsizetype>(i)].toObject());
        }
        QCOMPARE(timeline.clips.front().raw, raw["clips"].toArray()[0].toObject());
    }

    void typedReads() {
        const auto raw = fixture();
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline.has_value());
        const auto key = nt::music::tempoKey(raw);
        QVERIFY(key.has_value());
        QCOMPARE(key->tonic, std::string("F#"));
        QCOMPARE(key->mode, std::string("minor"));
        QVERIFY(nt::music::isMusicSequence(raw));
        QCOMPARE(nt::music::promptHistory(raw),
                 QStringList({"warm analog bass, slow groove", "dusty breakbeat drums"}));
        std::vector<std::string> roles;
        for (const auto& track : parsed.timeline->tracks) {
            roles.push_back(nt::music::trackMusicRole(track).value_or(""));
        }
        QCOMPARE(roles, (std::vector<std::string>{"drums", "bass", "keyboard", "guitar"}));
        QCOMPARE(nt::music::musicRoleLabel("backing_vocals"), std::string_view("Backing vocals"));
        const auto versions = parsed.timeline->clips.front().raw["versions"].toArray();
        const auto repaint = nt::music::musicGeneration(versions[1].toObject());
        QCOMPARE(repaint["task"].toString(), QStringLiteral("repaint"));
        QCOMPARE(repaint["splice"].toObject()["crossfadeFrames"].toInt(), 960);
        QCOMPARE(nt::music::musicGeneration(versions[0].toObject())["alignment"].toObject()["offsetFrames"].toInt(), -240);

        // Absent or unknown values read as absent.
        auto plain = raw;
        plain.remove("music");
        auto tempo = plain["tempo"].toObject();
        tempo.insert("key", QJsonObject{{"tonic", "H"}, {"mode", "minor"}});
        plain.insert("tempo", tempo);
        QVERIFY(!nt::music::isMusicSequence(plain));
        QVERIFY(!nt::music::tempoKey(plain));
        QVERIFY(nt::music::promptHistory(plain).isEmpty());
        QVERIFY(!nt::music::trackMusicRole(QJsonObject{{"musicRole", "kazoo"}}));
        QVERIFY(nt::music::musicGeneration(QJsonObject{}).isEmpty());
    }

    // The autosave request carries every music field: the document the
    // server parses is the fixture's document part, which the protocol test
    // shows the schema keeps whole (an empty stripped report).
    void saveSendsEveryMusicField() {
        const auto raw = fixture();
        const auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline.has_value());
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        TestHttpServer http;
        QJsonObject sent;
        http.setPost([&sent](const QByteArray&, const QByteArray& body) {
            sent = QJsonDocument::fromJson(body).object().value("document").toObject();
            return QByteArray(R"({"result":{"data":{"id":"music-seq","updatedAt":"u1","stripped":[]}}})");
        });
        QUndoStack undo;
        auto draft = parsed.timeline->raw;
        nt::server::SaveTarget target{http.base(), QString(), "music-seq", dir.path(), QString()};
        nt::server::AutosaveController save(nt::server::AssetCacheRoot(dir.path()), target, &undo, [&draft] { return draft; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(true);
        // An edit the native model owns: a marker. Everything else rides along untouched.
        draft.insert("markers", QJsonArray{QJsonObject{{"id", "m1"}, {"timeMs", 4000}}});
        // native-rules #2: naked new handed to QUndoStack::push, a raw pointer that the stack owns
        undo.push(new QUndoCommand("edit"));
        QTRY_VERIFY_WITH_TIMEOUT(!sent.isEmpty(), 5000);
        QTRY_VERIFY_WITH_TIMEOUT(!save.dirty(), 5000);
        QVERIFY(save.stripped().isEmpty());

        auto expected = nt::server::documentForSave(raw);
        expected.insert("markers", draft["markers"]);
        QCOMPARE(sent, expected);
        QCOMPARE(sent["tempo"].toObject()["key"], raw["tempo"].toObject()["key"]);
        QCOMPARE(sent["music"], raw["music"]);
        for (qsizetype i = 0; i < 4; ++i) {
            QCOMPARE(sent["tracks"].toArray()[i].toObject()["musicRole"], raw["tracks"].toArray()[i].toObject()["musicRole"]);
        }
        const auto sentVersions = sent["clips"].toArray()[0].toObject()["versions"].toArray();
        const auto rawVersions = raw["clips"].toArray()[0].toObject()["versions"].toArray();
        QCOMPARE(sentVersions.size(), 2);
        for (qsizetype i = 0; i < 2; ++i) {
            QCOMPARE(sentVersions[i].toObject()["musicGeneration"], rawVersions[i].toObject()["musicGeneration"]);
        }
    }

    // SQ1: a pattern region round-trips through load, file save, and autosave
    // without losing pattern/patternPhaseTicks/patternRowCycles/stepTemplate,
    // and parseTimeline refuses a clip holding both `pattern` and `notes`.
    void patternRegionLoadSaveAndValidation() {
        const QJsonObject pattern{
            {"version", 1}, {"seed", 7}, {"lengthSteps", 4}, {"stepRate", "1/16"}, {"playback", "forward"},
            {"legato", false}, {"swing", 25}, {"swingDivision", "1/16"}, {"pitchSource", "off"},
            {"scale", "chromatic"}, {"noTranspose", false}, {"scaleQuantize", false}, {"midiChannel", 1},
            {"automationMode", "latch"}, {"mono", false}, {"name", "Kick"},
            {"rows", QJsonArray{QJsonObject{
                {"id", "r1"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 36}}},
                {"mute", false}, {"solo", false}, {"lengthSteps", 4}, {"loopStart", 0}, {"loopEnd", 4},
                {"stepRate", "1/16"}, {"playback", "forward"}, {"midiChannel", 1}, {"automationMode", "latch"},
                {"subrows", QJsonArray{"velocity", "gate"}},
                {"steps", QJsonArray{QJsonObject{{"on", true}}, QJsonObject{}, QJsonObject{{"on", true}}, QJsonObject{}}}}}}};
        const QJsonObject rowCycles{{"r1", QJsonObject{{"cycleOffset", 2}, {"lastCycle", 5}}}};
        const QJsonObject patClip{
            {"id", "pat-clip-1"}, {"trackId", "midi-1"}, {"name", "Beat"}, {"mediaType", "midi"},
            {"startMs", 0.0}, {"durationMs", 2000.0}, {"inPointMs", 0.0}, {"outPointMs", 2000.0},
            {"pattern", pattern}, {"patternPhaseTicks", 240}, {"patternRowCycles", rowCycles}};
        const QJsonObject doc{
            {"id", "pat-seq"}, {"name", "Pattern Doc"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
            {"durationMs", 2000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0},
                                  {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "midi-1"}, {"name", "Drums"}, {"type", "midi"}, {"index", 0},
                {"stepTemplate", pattern}}}},
            {"clips", QJsonArray{patClip}},
            {"markers", QJsonArray{}}};

        // 1. parseTimeline keeps every pattern field intact.
        const auto parsed = nt::parseTimeline(doc);
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        const auto loadedClip = parsed.timeline->clips.front().raw;
        QCOMPARE(loadedClip.value(u"pattern").toObject(), pattern);
        QCOMPARE(loadedClip.value(u"patternPhaseTicks").toInt(), 240);
        QCOMPARE(loadedClip.value(u"patternRowCycles").toObject(), rowCycles);
        QCOMPARE(parsed.timeline->tracks.front().raw.value(u"stepTemplate").toObject(), pattern);

        // 2. Local .timeline.json file save & reload round-trip.
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString filePath = dir.filePath(QStringLiteral("beat.timeline.json"));
        const QJsonObject wrapped = nt::timelineFileWithSequence(
            QJsonObject{{"format", "nodetool.timeline"}, {"version", nt::kTimelineFileVersion}}, parsed.timeline->raw);
        {
            QFile f(filePath);
            QVERIFY(f.open(QIODevice::WriteOnly));
            f.write(QJsonDocument(wrapped).toJson(QJsonDocument::Compact));
        }
        const auto reloaded = nt::loadTimelineFile(filePath);
        QVERIFY2(reloaded.timeline.has_value(), qPrintable(reloaded.error));
        QCOMPARE(reloaded.timeline->clips.front().raw.value(u"pattern").toObject(), pattern);
        QCOMPARE(reloaded.timeline->clips.front().raw.value(u"patternPhaseTicks").toInt(), 240);
        QCOMPARE(reloaded.timeline->clips.front().raw.value(u"patternRowCycles").toObject(), rowCycles);

        // 3. Autosave payload sends the pattern clip intact.
        const auto saveDoc = nt::server::documentForSave(parsed.timeline->raw);
        QCOMPARE(saveDoc.value(u"clips").toArray().at(0).toObject().value(u"pattern").toObject(), pattern);

        // 4. SQ1 validator refuses a clip holding both `pattern` and stored `notes`, naming the clip.
        auto invalid = doc;
        auto badClip = patClip;
        badClip.insert("notes", QJsonArray{});
        invalid.insert("clips", QJsonArray{badClip});
        const auto rejected = nt::parseTimeline(invalid);
        QVERIFY2(!rejected.timeline.has_value(), "Clip with both pattern and notes must be rejected");
        QVERIFY2(rejected.error.contains(QStringLiteral("pat-clip-1")), qPrintable(rejected.error));
    }
};

QTEST_GUILESS_MAIN(MusicDocumentTests)
#include "tst_musicdocument.moc"
