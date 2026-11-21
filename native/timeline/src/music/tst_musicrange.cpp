// The Range tool's edges and labels (MUSIC-MODE.md MD11, MT-3, MT-4) and the
// New music project document (section 15, MD9) as pure functions.
#include "music/MusicDocument.h"
#include "music/MusicProject.h"
#include "music/MusicRange.h"

#include <QJsonArray>
#include <QtTest>

#include <random>

using namespace nt::music;

class TestMusicRange : public QObject {
    Q_OBJECT
private slots:
    void divisionFollowsTheRuler() {
        QCOMPARE(rangeDivision("bar"), GridDivision::Bar);
        for (const char* finer : {"beat", "1/4", "1/8", "1/16", "1/32", "1/8T", "1/16T"}) {
            QCOMPARE(rangeDivision(finer), GridDivision::Beat);
        }
    }

    void sequenceTempoReadsTheDocument() {
        QCOMPARE(sequenceTempo(QJsonObject{})->bpm, 120.0);
        const QJsonObject raw{{"tempo", QJsonObject{{"bpm", 87}, {"offsetMs", 10},
                                                     {"timeSignature", QJsonObject{{"beatsPerBar", 6}, {"beatUnit", 8}}}}}};
        const auto tempo = sequenceTempo(raw);
        QVERIFY(tempo);
        QCOMPARE(tempo->bpm, 87.0);
        QCOMPARE(tempo->beatsPerBar, 6.0);
        QCOMPARE(tempo->beatUnit, 8.0);
        QVERIFY(!sequenceTempo(QJsonObject{{"tempo", QJsonObject{{"bpm", 0}}}}));
    }

    void dragEdgesLandOnBarLines() {
        const MusicTempo tempo{120, 0, 4, 4};
        const auto anchor = rangeEdge(barStartFrame(5, tempo) + 2000, tempo, GridDivision::Bar, false);
        QCOMPARE(anchor, barStartFrame(5, tempo));
        const auto range = rangeBetween(anchor, barStartFrame(13, tempo) - 3000, tempo, GridDivision::Bar, false);
        QCOMPARE(range.startFrame, barStartFrame(5, tempo));
        QCOMPARE(range.endFrame, barStartFrame(13, tempo));
        // Backwards.
        const auto back = rangeBetween(anchor, barStartFrame(2, tempo) + 10, tempo, GridDivision::Bar, false);
        QCOMPARE(back.startFrame, barStartFrame(2, tempo));
        QCOMPARE(back.endFrame, barStartFrame(5, tempo));
        // A short snapped drag takes one bar in its direction.
        const auto shortForward = rangeBetween(anchor, anchor + 4000, tempo, GridDivision::Bar, false);
        QCOMPARE(shortForward.endFrame, barStartFrame(6, tempo));
        const auto shortBack = rangeBetween(anchor, anchor - 4000, tempo, GridDivision::Bar, false);
        QCOMPARE(shortBack.startFrame, barStartFrame(4, tempo));
        // No travel: nothing.
        const auto none = rangeBetween(anchor, anchor, tempo, GridDivision::Bar, false);
        QCOMPARE(none.startFrame, none.endFrame);
        // Beats when the ruler is finer than a bar.
        const auto beats = rangeBetween(beatStartFrame(9, tempo), beatStartFrame(11, tempo) + 100, tempo, GridDivision::Beat, false);
        QCOMPARE(beats.endFrame, beatStartFrame(11, tempo));
    }

    void altKeepsThePointerFrame() {
        const MusicTempo tempo{120, 0, 4, 4};
        const std::int64_t pointer = barStartFrame(9, tempo) + 12345;
        QCOMPARE(rangeEdge(pointer, tempo, GridDivision::Bar, true), pointer);
        const auto range = rangeBetween(barStartFrame(5, tempo), pointer, tempo, GridDivision::Bar, true);
        QCOMPARE(range.endFrame, pointer);
        QCOMPARE(laneFrame(frameToMs(7001)), std::int64_t(7001));
        QCOMPARE(laneFrame(-50), std::int64_t(0));
    }

    // Every snapped edge equals barStartFrame of its bar, at the tempi and signatures of MM1.
    void snappedEdgesAreBarStartFrames() {
        std::mt19937 random(7);
        int inspected = 0;
        for (const double bpm : {87.0, 120.0, 173.0}) {
            for (const auto& [beats, unit] : kMusicSignatures) {
                const MusicTempo tempo{bpm, 0, double(beats), double(unit)};
                for (std::int64_t bar = 1; bar <= 400; ++bar) {
                    const auto start = barStartFrame(bar, tempo);
                    const auto length = barStartFrame(bar + 1, tempo) - start;
                    const auto frame = start + std::int64_t(random() % std::uint32_t(length));
                    const auto edge = rangeEdge(frame, tempo, GridDivision::Bar, false);
                    const auto near = barAtFrame(edge, tempo);
                    QCOMPARE(edge, barStartFrame(near, tempo));
                    QVERIFY(near == bar || near == bar + 1);
                    QCOMPARE(barAtFrame(frame, tempo), bar);
                    ++inspected;
                }
            }
        }
        QCOMPARE(inspected, 3 * 4 * 400);
    }

    void labels() {
        const MusicTempo tempo{120, 0, 4, 4};
        QCOMPARE(barPositionLabel(barStartFrame(5, tempo), tempo), QStringLiteral("5"));
        QCOMPARE(barPositionLabel(beatStartFrame(4 * 4 + 3, tempo), tempo), QStringLiteral("5.3"));
        QCOMPARE(barPositionLabel(beatStartFrame(4 * 4 + 3, tempo) + 5, tempo), QStringLiteral("5.3"));
        QCOMPARE(barRangeLabel({barStartFrame(5, tempo), barStartFrame(13, tempo)}, tempo), QStringLiteral("Bars 5–12"));
        QCOMPARE(barRangeLabel({barStartFrame(5, tempo), barStartFrame(6, tempo)}, tempo), QStringLiteral("Bar 5"));
        QCOMPARE(rangeLengthLabel({barStartFrame(5, tempo), barStartFrame(13, tempo)}, tempo), QStringLiteral("8 bars"));
        QCOMPARE(rangeLengthLabel({barStartFrame(5, tempo), barStartFrame(6, tempo)}, tempo), QStringLiteral("1 bar"));
        QCOMPARE(rangeLengthLabel({beatStartFrame(2, tempo), beatStartFrame(5, tempo)}, tempo), QStringLiteral("3 beats"));
        QCOMPARE(rangeLengthLabel({0, 60000}, tempo), QStringLiteral("1.25 s"));
        const MusicTempo eighths{87, 0, 6, 8};
        QCOMPARE(barPositionLabel(beatStartFrame(6 + 4, eighths), eighths), QStringLiteral("2.4"));
    }

    void projectRefusals() {
        QVERIFY(musicProjectRefusal({}).isEmpty());
        QCOMPARE(musicProjectRefusal({87.5, 4, 4, {}}), QString::fromUtf8(kMusicTempoBpmMessage.data()));
        QCOMPARE(musicProjectRefusal({29, 4, 4, {}}), QString::fromUtf8(kMusicTempoBpmMessage.data()));
        QCOMPARE(musicProjectRefusal({301, 4, 4, {}}), QString::fromUtf8(kMusicTempoBpmMessage.data()));
        QVERIFY(musicProjectRefusal({30, 2, 4, {}}).isEmpty());
        QVERIFY(musicProjectRefusal({300, 6, 8, {}}).isEmpty());
        QCOMPARE(musicProjectRefusal({120, 7, 8, {}}), QString::fromUtf8(kMusicTempoSignatureMessage.data()));
        QVERIFY(musicProjectRefusal({120, 3, 4, MusicKey{"F#", "minor"}}).isEmpty());
        QVERIFY(!musicProjectRefusal({120, 4, 4, MusicKey{"H", "minor"}}).isEmpty());
        QVERIFY(!musicProjectRefusal({120, 4, 4, MusicKey{"A", "dorian"}}).isEmpty());
        const auto settings = musicProjectSettings({{"bpm", 96}, {"beatsPerBar", 6}, {"beatUnit", 8}, {"keyTonic", "Eb"}, {"keyMode", "minor"}});
        QCOMPARE(settings.bpm, 96.0);
        QCOMPARE(settings.beatsPerBar, 6);
        QCOMPARE(settings.beatUnit, 8);
        QVERIFY(settings.key);
        QCOMPARE(settings.key->tonic, std::string("Eb"));
        QVERIFY(!musicProjectSettings({{"bpm", 96}, {"keyTonic", ""}}).key);
    }

    void projectDocument() {
        int next = 0;
        const auto doc = musicProjectDocument({96, 3, 4, MusicKey{"A", "minor"}},
                                              [&next] { return QStringLiteral("%1").arg(++next, 32, 10, QLatin1Char('0')); });
        QVERIFY(isMusicSequence(doc));
        QVERIFY(promptHistory(doc).isEmpty());
        QCOMPARE(doc.value("tempo").toObject().value("bpm").toDouble(), 96.0);
        QCOMPARE(doc.value("tempo").toObject().value("timeSignature").toObject().value("beatsPerBar").toInt(), 3);
        QCOMPARE(tempoKey(doc)->tonic, std::string("A"));
        QCOMPARE(tempoKey(doc)->mode, std::string("minor"));
        const auto tracks = doc.value("tracks").toArray();
        QCOMPARE(tracks.size(), 4);
        const QStringList roles{"drums", "bass", "keyboard", "guitar"};
        const QStringList names{"Drums", "Bass", "Keyboard", "Guitar"};
        for (int i = 0; i < 4; ++i) {
            const auto track = tracks[i].toObject();
            QCOMPARE(track.value("type").toString(), QStringLiteral("audio"));
            QCOMPARE(track.value("musicRole").toString(), roles[i]);
            QCOMPARE(track.value("name").toString(), names[i]);
            QCOMPARE(track.value("index").toInt(), i);
            QCOMPARE(track.value("id").toString().size(), 32);
        }
        QVERIFY(doc.value("clips").toArray().isEmpty());
        QVERIFY(!musicProjectDocument({}, [] { return QStringLiteral("x"); }).value("tempo").toObject().contains("key"));
    }

    void trackRoleEdit() {
        const QJsonObject doc{{"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}},
                                                    QJsonObject{{"id", "v"}, {"type", "video"}}}}};
        const auto set = setTrackRole(doc, {{"trackId", "a"}, {"role", "bass"}});
        QCOMPARE(set.value("tracks").toArray()[0].toObject().value("musicRole").toString(), QStringLiteral("bass"));
        const auto removed = setTrackRole(set, {{"trackId", "a"}, {"role", ""}});
        QVERIFY(!removed.value("tracks").toArray()[0].toObject().contains("musicRole"));
        QCOMPARE(setTrackRole(doc, {{"trackId", "a"}, {"role", "kazoo"}}), doc);
        QCOMPARE(setTrackRole(doc, {{"trackId", "v"}, {"role", "bass"}}), doc);
        QCOMPARE(setTrackRole(doc, {{"trackId", "missing"}, {"role", "bass"}}), doc);
    }
};

QTEST_GUILESS_MAIN(TestMusicRange)
#include "tst_musicrange.moc"
