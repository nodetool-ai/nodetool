// The music document fields through the native model and the native save
// (docs/MUSIC-MODE.md MD1 to MD5, PS-1, MM1 exit 1). The fixture is
// packages/timeline/tests/fixtures/music-document.json, which
// musicFields.protocolCompat.test.ts parses through the server schema with
// nothing stripped. Here the native load keeps every field, the typed reads
// see them, and the autosave request sends exactly that document.
#include "model/TimelineJson.h"
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
} // namespace

class MusicDocumentTests : public QObject {
    Q_OBJECT
private slots:
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
        nt::server::AutosaveController save(target, &undo, [&draft] { return draft; }, "u0");
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
};

QTEST_GUILESS_MAIN(MusicDocumentTests)
#include "tst_musicdocument.moc"
