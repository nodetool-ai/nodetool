#include "motion/tracking/TrackBinding.h"
#include "model/TimelineJson.h"
#include "scene/ClipScene.h"
#include <QTest>
#include <QFileInfo>
#include <QDir>
#include <QJsonDocument>

class TestTracking : public QObject {
    Q_OBJECT
    static QJsonArray samples() { return {QJsonObject{{"sourceMs", 0}, {"x", 0.2}, {"y", 0.3}},
        QJsonObject{{"sourceMs", 1000}, {"x", 0.8}, {"y", 0.9}},
        QJsonObject{{"sourceMs", 2000}, {"x", 0.4}}}; }
private slots:
    void interpolationAndSmoothing() {
        for (const double smoothing : {0.0, 0.5, 1.0, 2.0}) {
            for (const double time : {-100.0, 0.0, 250.0, 500.0, 1000.0, 1500.0, 3000.0, 250.0}) {
                const auto sample = nt::motion::sampleSmoothedTrack(samples(), time, smoothing);
                qInfo().noquote() << "TRACK_SAMPLE" << QString::fromUtf8(QJsonDocument(QJsonObject{{"time", time}, {"smoothing", smoothing}, {"sample", sample}}).toJson(QJsonDocument::Compact));
                QVERIFY(sample.value("x").isDouble());
            }
        }
        QCOMPARE(nt::motion::sampleTrack({}, 500), QJsonObject{});
    }
    void readinessOwnerAndModes() {
        nt::Clip owner, follower;
        owner.id = "owner"; owner.startMs = 1000; owner.inPointMs = 200; owner.speedMultiplier = 2;
        owner.raw = {{"currentAssetId", "full-source-asset"}};
        follower.raw = {{"trackBinding", QJsonObject{{"trackId", "full-track-id"}, {"mode", "position_scale"},
            {"offset", QJsonObject{{"x", 7}, {"y", -3}}}, {"scale", 1.5}, {"rotationOffset", 12}}}};
        QJsonObject track{{"id", "full-track-id"}, {"clipId", "owner"}, {"status", "ready"},
            {"sourceAssetId", "full-source-asset"}, {"sourceStartMs", 500}, {"sourceEndMs", 600}, {"samples", samples()}};
        std::unordered_map<std::string, const nt::Clip*> owners{{"owner", &owner}};
        const auto raw = follower.raw;
        const auto offset = nt::motion::resolveTrackBinding(follower, {track}, owners, 1150, 1000, 500);
        QVERIFY(offset); QVERIFY(std::abs(offset->x - 7) < 1e-8); QVERIFY(std::abs(offset->y - 47) < 1e-8);
        QVERIFY(nt::motion::resolveTrackBinding(follower, {track}, owners, 1000, 1000, 500));
        QCOMPARE(offset->scale, 1.5); QCOMPARE(offset->rotation, 12.0); QCOMPARE(follower.raw, raw);
        for (const auto* status : {"pending", "generating", "failed"}) {
            track.insert("status", status); QVERIFY(!nt::motion::resolveTrackBinding(follower, {track}, owners, 1150, 1000, 500));
        }
        track.insert("status", "ready"); track.insert("sourceAssetId", "replacement");
        QVERIFY(!nt::motion::resolveTrackBinding(follower, {track}, owners, 1150, 1000, 500));
        track.insert("sourceAssetId", "full-source-asset");
        QVERIFY(!nt::motion::resolveTrackBinding(follower, {track}, {}, 1150, 1000, 500));
        for (const auto* mode : {"transform", "mask", "effect_region", "reframe"}) {
            auto binding = follower.raw.value("trackBinding").toObject(); binding.insert("mode", mode); follower.raw.insert("trackBinding", binding);
            QVERIFY(!nt::motion::resolveTrackBinding(follower, {track}, owners, 1150, 1000, 500));
        }
    }
    void sceneIntegration() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline); auto& timeline = *result.timeline;
        auto& owner = timeline.clips[0]; auto& clip = timeline.clips[1];
        owner.startMs = 1000; owner.durationMs = 4000; owner.inPointMs = 200; owner.speedMultiplier = 2;
        owner.raw.insert("currentAssetId", "asset"); clip.startMs = 1000; clip.durationMs = 4000;
        clip.transform = nt::ClipTransform{}; clip.transform->position = {10, 20}; clip.transform->scale = {2, 3};
        clip.raw.insert("trackBinding", QJsonObject{{"trackId", "track"}, {"mode", "position_scale"}, {"scale", 1.5}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        timeline.raw.insert("mediaTracks", QJsonArray{QJsonObject{{"id", "track"}, {"clipId", QString::fromStdString(owner.id)},
            {"sourceAssetId", "asset"}, {"status", "ready"}, {"samples", samples()}, {"unknown", 42}}});
        const auto original = timeline.raw; const auto originalClip = clip.raw;
        for (const double time : {1150.0, 1400.0, 1150.0}) {
            const auto frame = nt::activeLayersAt(timeline, time);
            const auto found = std::find_if(frame.begin(), frame.end(), [&](const auto& layer) { return layer.clipId == clip.id; });
            QVERIFY(found != frame.end()); QVERIFY(found->transform);
            const auto sample = nt::motion::sampleTrack(samples(), nt::clipSourceMsAt(owner, time));
            QVERIFY(std::abs(found->transform->position.x - (10 + (sample.value("x").toDouble() - 0.5) * timeline.width)) < 1e-7);
            QCOMPARE(found->transform->scale.x, 3.0); QCOMPARE(found->transform->scale.y, 4.5);
            qInfo().noquote() << "TRACK_SCENE" << QString::fromUtf8(QJsonDocument(QJsonObject{{"time", time},
                {"width", timeline.width}, {"height", timeline.height}, {"x", found->transform->position.x},
                {"y", found->transform->position.y}, {"sx", found->transform->scale.x}, {"sy", found->transform->scale.y}}).toJson(QJsonDocument::Compact));
        }
        QCOMPARE(timeline.raw, original); QCOMPARE(clip.raw, originalClip);
        clip.raw.insert("steppedTime", QJsonObject{{"fps", 2}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        auto frame = nt::activeLayersAt(timeline, 1400);
        auto found = std::find_if(frame.begin(), frame.end(), [&](const auto& layer) { return layer.clipId == clip.id; });
        QVERIFY(found != frame.end());
        const auto steppedSample = nt::motion::sampleTrack(samples(), nt::clipSourceMsAt(owner, 1000));
        QVERIFY(std::abs(found->transform->position.x - (10 + (steppedSample.value("x").toDouble() - 0.5) * timeline.width)) < 1e-7);
        clip.raw.insert("animationLinks", QJsonArray{QJsonObject{{"kind", "wiggle"}, {"target", "positionX"}, {"amplitude", 0}}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        frame = nt::activeLayersAt(timeline, 1400);
        found = std::find_if(frame.begin(), frame.end(), [&](const auto& layer) { return layer.clipId == clip.id; });
        QVERIFY(found != frame.end()); QCOMPARE(found->transform->position.x, 0.0);
        clip.raw.remove("animationLinks");
        clip.mediaType = nt::MediaType::Group;
        clip.raw.insert("mediaType", "group");
        clip.scene = nt::scene::parseClipScene(clip.raw);
        auto& child = timeline.clips[2]; child.startMs = 1000; child.durationMs = 4000;
        child.raw.insert("parentId", QString::fromStdString(clip.id)); child.scene = nt::scene::parseClipScene(child.raw);
        frame = nt::activeLayersAt(timeline, 1400);
        found = std::find_if(frame.begin(), frame.end(), [&](const auto& layer) { return layer.clipId == child.id; });
        QVERIFY(found != frame.end()); QVERIFY(found->parentMatrix);
        const double groupX = 10 + (steppedSample.value("x").toDouble() - 0.5) * timeline.width;
        QVERIFY(std::abs((*found->parentMatrix)[12] - 2 * groupX / timeline.width) < 1e-6);

    }
};
QTEST_GUILESS_MAIN(TestTracking)
#include "tst_tracking.moc"
