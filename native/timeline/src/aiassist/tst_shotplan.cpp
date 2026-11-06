#include "aiassist/ShotPlan.h"
#include <QtTest>
class ShotPlanTest : public QObject {
    Q_OBJECT
private slots:
    void renderUsesShotPromptAndStoredStill() {
        const QJsonObject shot{{"id", "shot"}, {"action", "A person runs"}, {"motion", "Quickly"}, {"camera", QJsonObject{{"framing", "wide"}, {"movement", "pan"}}}, {"keyframe", QJsonObject{{"type", "image"}, {"asset_id", "still"}}}, {"duration_seconds", 4}};
        const QJsonObject board{{"id", "board"}, {"document", QJsonObject{{"style", "Watercolor"}, {"aspectRatio", "9:16"}, {"shots", QJsonArray{shot}}}}};
        const auto plan = nt::aiassist::planShotRender(board, "shot", "video", {{"id", "model"}, {"provider", "provider"}, {"supported_tasks", QJsonArray{"image_to_video"}}});
        QVERIFY(plan.error.isEmpty());
        QCOMPARE(plan.request.value("prompt").toString(), QString("Quickly, A person runs, pan"));
        QCOMPARE(plan.request.value("source_asset_id").toString(), QString("still"));
        QCOMPARE(plan.request.value("resolution").toString(), QString("1080p"));
        const auto refused = nt::aiassist::planShotRender(board, "shot", "video", {{"id", "model"}, {"provider", "provider"}, {"supported_tasks", QJsonArray{"text_to_video"}}});
        QVERIFY(!refused.error.isEmpty());
    }
    void candidatesRequireExplicitAcceptance() {
        QJsonObject board{{"id", "board"}, {"updatedAt", "revision"}, {"document", QJsonObject{{"shots", QJsonArray{QJsonObject{{"id", "shot"}, {"clip", QJsonObject{{"type", "video"}, {"asset_id", "original"}}}}}}}}};
        const auto appended = nt::aiassist::appendShotCandidate(board, "shot", "video", {{"type", "video"}, {"asset_id", "candidate"}, {"requestId", "request"}});
        const auto shot = appended.value("document").toObject().value("shots").toArray().at(0).toObject();
        QCOMPARE(shot.value("clip").toObject().value("asset_id").toString(), QString("original"));
        QCOMPARE(shot.value("clip_versions").toArray().size(), 2);
        const auto accepted = nt::aiassist::acceptShotCandidate(appended, "shot", "video", 1);
        QCOMPARE(accepted.value("document").toObject().value("shots").toArray().at(0).toObject().value("clip").toObject().value("asset_id").toString(), QString("candidate"));
        QCOMPARE(nt::aiassist::acceptShotCandidate(appended, "shot", "video", 99), appended);
    }
    void linkingKeepsFootageAndVoiceover() {
        QJsonObject doc{{"tracks", QJsonArray{QJsonObject{{"id", "video"}}, QJsonObject{{"id", "audio"}}}}, {"clips", QJsonArray{
            QJsonObject{{"id", "v"}, {"trackId", "video"}, {"mediaType", "video"}, {"linkId", "pair"}, {"currentAssetId", "footage"}},
            QJsonObject{{"id", "a"}, {"trackId", "audio"}, {"mediaType", "audio"}, {"linkId", "pair"}, {"currentAssetId", "footage"}},
            QJsonObject{{"id", "voice"}, {"trackId", "audio"}, {"mediaType", "audio"}, {"linkId", "pair"}, {"scriptLineId", "line"}}
        }}};
        const auto linked = nt::aiassist::linkShot(doc, {{"clipId", "v"}, {"boardId", "board"}, {"shotId", "shot"}});
        const auto clips = linked.value("clips").toArray();
        QCOMPARE(clips.at(1).toObject().value("storyboardShotId").toString(), QString("shot"));
        QVERIFY(!clips.at(2).toObject().contains("storyboardShotId"));
        const auto unlinked = nt::aiassist::linkShot(linked, {{"clipId", "v"}, {"unlink", true}});
        QCOMPARE(unlinked, doc);
        auto lockedClips = doc.value("clips").toArray();
        auto twin = lockedClips.at(1).toObject(); twin.insert("locked", true); lockedClips[1] = twin; doc.insert("clips", lockedClips);
        QCOMPARE(nt::aiassist::linkShot(doc, {{"clipId", "v"}, {"boardId", "board"}, {"shotId", "shot"}}), doc);
    }
};
QTEST_GUILESS_MAIN(ShotPlanTest)
#include "tst_shotplan.moc"
