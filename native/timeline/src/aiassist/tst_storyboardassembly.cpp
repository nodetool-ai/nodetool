#include "aiassist/StoryboardAssembly.h"
#include <QtTest>
class StoryboardAssemblyTest : public QObject {
    Q_OBJECT
private slots:
    void provenanceAndReassembly() {
        const QJsonObject board{{"id", "board"}, {"document", QJsonObject{{"shots", QJsonArray{QJsonObject{{"id", "shot"}, {"index", 0}, {"clip", QJsonObject{{"asset_id", "video"}, {"duration", 3}}}}}}, {"screenplay", QJsonObject{{"music_prompt", "Score"}}}}}};
        const QJsonObject existing{{"id", "sequence"}, {"tracks", QJsonArray{QJsonObject{{"id", "imported"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "foreign"}, {"trackId", "imported"}, {"mediaType", "image"}, {"startMs", 5000}, {"durationMs", 1000}}}}};
        const auto built = nt::aiassist::assembleStoryboard(existing, board);
        QVERIFY2(built.error.isEmpty(), qPrintable(built.error));
        QCOMPARE(built.document.value("clips").toArray().size(), 4);
        const auto again = nt::aiassist::assembleStoryboard(built.document, board);
        QVERIFY(again.error.isEmpty());
        QCOMPARE(again.document.value("clips").toArray().size(), 4);
        QCOMPARE(again.document.value("durationMs").toDouble(), 6000.0);
        for (const auto& value : again.document.value("clips").toArray()) {
            const auto clip = value.toObject();
            if (clip.value("id").toString() != "foreign") { QCOMPARE(clip.value("storyboardBoardId").toString(), QString("board")); }
        }
        auto protectedDocument = built.document;
        protectedDocument.insert("storyboardMaterializations", QJsonArray{QJsonObject{{"boardId", "board"}}});
        const auto refused = nt::aiassist::assembleStoryboard(protectedDocument, board);
        QVERIFY(!refused.error.isEmpty());
        QCOMPARE(refused.document, protectedDocument);
    }
    void coverageAndStillPolicy() {
        const QJsonObject board{{"id", "board"}, {"document", QJsonObject{{"shots", QJsonArray{
            QJsonObject{{"id", "cover"}, {"index", 0}, {"clip", QJsonObject{{"asset_id", "video"}, {"duration", 8}}}},
            QJsonObject{{"id", "slice"}, {"index", 1}, {"covered_by", QJsonObject{{"shot_id", "cover"}, {"start_seconds", 3}, {"end_seconds", 6}}}},
            QJsonObject{{"id", "still"}, {"index", 2}, {"duration_seconds", 2}, {"production", QJsonObject{{"media_strategy", "still_motion_graphics"}}}, {"keyframe", QJsonObject{{"asset_id", "image"}}}, {"clip", QJsonObject{{"asset_id", "unused"}}}}
        }}}}};
        const auto result = nt::aiassist::assembleStoryboard({}, board);
        QVERIFY(result.error.isEmpty());
        const auto clips = result.document.value("clips").toArray();
        QCOMPARE(clips.size(), 5);
        QCOMPARE(clips.at(0).toObject().value("durationMs").toDouble(), 3000.0);
        QCOMPARE(clips.at(2).toObject().value("inPointMs").toDouble(), 3000.0);
        QCOMPARE(clips.at(4).toObject().value("mediaType").toString(), QString("image"));
        QCOMPARE(result.document.value("durationMs").toDouble(), 8000.0);
    }
};
QTEST_GUILESS_MAIN(StoryboardAssemblyTest)
#include "tst_storyboardassembly.moc"
