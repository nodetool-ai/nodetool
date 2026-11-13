// New music project through TimelineListController against a fake server
// with the wire shapes of the tRPC timeline routes (MUSIC-MODE.md section 15,
// MM2 exit 1): timeline.create takes {id, name, projectId}, the music fields
// follow as timeline.update {id, baseUpdatedAt, document}, and the refusals
// of MD9 send nothing.
#include "server/TimelineList/TimelineListController.h"
#include "TestHttpServer.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QtTest>

namespace {
QByteArray answer(const QJsonValue& data) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
}
} // namespace

class TestMusicProject : public QObject {
    Q_OBJECT
private slots:
    void createsTheMusicSequence() {
        TestHttpServer server;
        QJsonObject stored;
        QJsonObject createInput;
        QJsonObject updateInput;
        server.setJson([&](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/projects.list") {
                return answer(QJsonArray{QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true}}});
            }
            if (path == "/trpc/timeline.list") {
                return answer(stored.isEmpty() ? QJsonArray{} : QJsonArray{stored});
            }
            return answer(stored);
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) {
            const auto input = QJsonDocument::fromJson(body).object();
            if (path == "/trpc/timeline.create") {
                createInput = input;
                stored = input;
                stored.insert("fps", 30);
                stored.insert("width", 1920);
                stored.insert("height", 1080);
                stored.insert("tracks", QJsonArray{});
                stored.insert("clips", QJsonArray{});
                stored.insert("markers", QJsonArray{});
                stored.insert("updatedAt", "2026-11-12T10:00:00.000Z");
                return answer(stored);
            }
            if (path == "/trpc/timeline.update") {
                updateInput = input;
                stored.insert("updatedAt", "2026-11-12T10:00:01.000Z");
                return answer(QJsonObject{{"updatedAt", "2026-11-12T10:00:01.000Z"}, {"stripped", QJsonArray{}}});
            }
            return answer(QJsonObject{});
        });
        nt::server::TimelineListController list(server.base(), "token", "");
        list.refresh();
        QVERIFY2(list.error().isEmpty(), qPrintable(list.error()));

        // MD9: refused before anything is sent.
        const auto writes = server.countRequests("POST", "/trpc/");
        QVERIFY(list.createMusicTimeline({{"bpm", 87.5}, {"beatsPerBar", 4}, {"beatUnit", 4}}).isEmpty());
        QVERIFY(list.error().contains("whole-number tempo"));
        QVERIFY(list.createMusicTimeline({{"bpm", 120}, {"beatsPerBar", 5}, {"beatUnit", 4}}).isEmpty());
        QVERIFY(list.error().contains("2/4, 3/4, 4/4 or 6/8"));
        QCOMPARE(server.countRequests("POST", "/trpc/"), writes);

        const auto created = list.createMusicTimeline(
            {{"bpm", 96}, {"beatsPerBar", 3}, {"beatUnit", 4}, {"keyTonic", "A"}, {"keyMode", "minor"}});
        QVERIFY2(!created.isEmpty(), qPrintable(list.error()));
        const auto id = created.value("id").toString();
        QCOMPARE(id.size(), 32);
        QCOMPARE(created.value("name").toString(), QStringLiteral("Untitled music"));
        QCOMPARE(createInput.keys(), QStringList({"id", "name", "projectId"}));
        QCOMPARE(updateInput.value("id").toString(), id);
        QCOMPARE(updateInput.value("baseUpdatedAt").toString(), QStringLiteral("2026-11-12T10:00:00.000Z"));
        const auto document = updateInput.value("document").toObject();
        QVERIFY(document.value("music").isObject());
        QCOMPARE(document.value("tempo").toObject().value("bpm").toDouble(), 96.0);
        QCOMPARE(document.value("tempo").toObject().value("timeSignature").toObject().value("beatsPerBar").toInt(), 3);
        QCOMPARE(document.value("tempo").toObject().value("key").toObject(), (QJsonObject{{"tonic", "A"}, {"mode", "minor"}}));
        const auto tracks = document.value("tracks").toArray();
        QCOMPARE(tracks.size(), 4);
        QStringList roles;
        for (const auto& track : tracks) {
            QCOMPARE(track.toObject().value("type").toString(), QStringLiteral("audio"));
            roles.append(track.toObject().value("musicRole").toString());
        }
        QCOMPARE(roles, QStringList({"drums", "bass", "keyboard", "guitar"}));
        QVERIFY(document.value("clips").toArray().isEmpty());
        QVERIFY(document.value("markers").toArray().isEmpty());

        QSignalSpy opened(&list, &nt::server::TimelineListController::openRequested);
        QCOMPARE(list.openTimeline(id), server.base().toString() + "#timeline=" + id);
        QCOMPARE(opened.size(), 1);
    }

    void serverErrorIsReported() {
        TestHttpServer server;
        server.setJson([](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/projects.list") {
                return answer(QJsonArray{QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true}}});
            }
            return answer(QJsonArray{});
        });
        server.setPost([](const QByteArray& path, const QByteArray&) {
            if (path == "/trpc/timeline.create") {
                return answer(QJsonObject{{"id", "x"}, {"updatedAt", "2026-11-12T10:00:00.000Z"}});
            }
            return QByteArray(R"({"error":{"message":"Timeline has been modified since last load","data":{"code":"CONFLICT","httpStatus":409}}})");
        });
        nt::server::TimelineListController list(server.base(), "token", "");
        list.refresh();
        QVERIFY(list.createMusicTimeline({{"bpm", 120}}).isEmpty());
        QVERIFY2(list.error().contains("modified"), qPrintable(list.error()));
        QVERIFY(!list.busy());
    }
};

QTEST_GUILESS_MAIN(TestMusicProject)
#include "tst_musicproject.moc"
