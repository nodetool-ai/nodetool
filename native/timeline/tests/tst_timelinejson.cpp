#include "model/TimelineJson.h"

#include <QFileInfo>
#include <QTest>

class TestTimelineJson : public QObject {
    Q_OBJECT

private slots:
    void parsesThreeTracksFixture() {
        const auto r = nt::loadTimelineFile(QStringLiteral(NT_FIXTURES_DIR "/three-tracks.json"));
        QVERIFY2(r.timeline.has_value(), qPrintable(r.error));
        const nt::Timeline& tl = *r.timeline;
        QCOMPARE(tl.id, std::string("seq-three-tracks"));
        QCOMPARE(tl.fps, 30.0);
        QCOMPARE(tl.width, 1920);
        QCOMPARE(tl.height, 1080);
        QCOMPARE(tl.durationMs, 20000.0);
        QCOMPARE(tl.tracks.size(), size_t(3));
        QCOMPARE(tl.clips.size(), size_t(6));
        QCOMPARE(tl.tracks[0].type, nt::TrackType::Overlay);

        const nt::Clip& pipB = tl.clips[2];
        QCOMPARE(pipB.id, std::string("clip-pip-b"));
        QCOMPARE(pipB.inPointMs, 1500.0);
        QVERIFY(pipB.transform.has_value());
        QCOMPARE(pipB.transform->position.x, 460.0);
        QCOMPARE(pipB.transform->scale.y, 0.5);
        QCOMPARE(pipB.transform->rotation, 0.15);
    }

    void keepsRawObjects() {
        const auto r = nt::loadTimelineFile(QStringLiteral(NT_FIXTURES_DIR "/three-tracks.json"));
        QVERIFY(r.timeline.has_value());
        // Fields the model does not own survive in `raw`.
        QCOMPARE(r.timeline->raw.value(u"projectId").toString(), QStringLiteral("native-prototype"));
        QCOMPARE(r.timeline->tracks[0].raw.value(u"id").toString(), QStringLiteral("track-v1"));
        QCOMPARE(r.timeline->clips[0].raw.value(u"status").toString(), QStringLiteral("generated"));
    }

    void resolvesMediaPathAgainstFixtureDir() {
        const auto r = nt::loadTimelineFile(QStringLiteral(NT_FIXTURES_DIR "/media-tracks.json"));
        QVERIFY2(r.timeline.has_value(), qPrintable(r.error));
        const QString path = QString::fromStdString(r.timeline->clips[0].mediaPath);
        QVERIFY(QFileInfo(path).isAbsolute());
        QVERIFY(path.endsWith(QStringLiteral("fixtures/media/background-1080p.mp4")));
    }

    void defaultsOptionalFields() {
        const QByteArray json = R"({"id":"s","name":"n","fps":24,"width":640,"height":360,"durationMs":1000,
            "tracks":[{"id":"t","name":"T","type":"video","index":0,"visible":true,"locked":false}],
            "clips":[{"id":"c","trackId":"t","name":"C","startMs":0,"durationMs":500,"mediaType":"image"}]})";
        const auto r = nt::parseTimelineJson(json);
        QVERIFY2(r.timeline.has_value(), qPrintable(r.error));
        const nt::Clip& c = r.timeline->clips[0];
        QCOMPARE(c.opacity, 1.0);
        QCOMPARE(c.inPointMs, 0.0);
        QVERIFY(!c.transform.has_value());
        QVERIFY(!c.width.has_value());
        QVERIFY(!c.transitionIn.has_value());
    }

    void parsesTransitionIn() {
        const QByteArray json = R"({"fps":30,"width":640,"height":360,
            "tracks":[{"id":"t","name":"T","type":"video","index":0,"visible":true,"locked":false}],
            "clips":[{"id":"c","trackId":"t","name":"C","startMs":0,"durationMs":500,"mediaType":"video",
                      "transitionIn":{"type":"dipToColor","durationMs":250,"easing":"easeIn"}}]})";
        const auto r = nt::parseTimelineJson(json);
        QVERIFY2(r.timeline.has_value(), qPrintable(r.error));
        const auto& tr = r.timeline->clips[0].transitionIn;
        QVERIFY(tr.has_value());
        QCOMPARE(tr->type, std::string("dipToColor"));
        QCOMPARE(tr->durationMs, 250.0);
        QCOMPARE(tr->easing, std::string("easeIn"));
    }

    void rejectsBadInput_data() {
        QTest::addColumn<QByteArray>("json");
        QTest::newRow("not json") << QByteArray("{");
        QTest::newRow("bad track type")
            << QByteArray(R"({"fps":30,"width":1,"height":1,"tracks":[{"id":"t","type":"bogus"}],"clips":[]})");
        QTest::newRow("unknown trackId")
            << QByteArray(R"({"fps":30,"width":1,"height":1,"tracks":[],"clips":[{"id":"c","trackId":"x","durationMs":1,"mediaType":"video"}]})");
        QTest::newRow("zero fps") << QByteArray(R"({"fps":0,"width":1,"height":1,"tracks":[],"clips":[]})");
    }
    void rejectsBadInput() {
        QFETCH(QByteArray, json);
        const auto r = nt::parseTimelineJson(json);
        QVERIFY(!r.timeline.has_value());
        QVERIFY(!r.error.isEmpty());
    }
};

QTEST_APPLESS_MAIN(TestTimelineJson)
#include "tst_timelinejson.moc"
