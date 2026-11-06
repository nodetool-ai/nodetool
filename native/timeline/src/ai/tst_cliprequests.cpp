#include "ai/ClipRequests.h"
#include <QJsonArray>
#include <QtTest>

class ClipRequestsTest : public QObject {
    Q_OBJECT
private slots:
    void videoEdit() {
        QJsonObject clip{{"id", "clip"}, {"mediaType", "video"}, {"currentAssetId", "asset"}, {"trackId", "track"},
                         {"startMs", 2000}, {"durationMs", 4000}, {"inPointMs", 1000}, {"outPointMs", 5000},
                         {"versions", QJsonArray{QJsonObject{{"id", "take"}, {"assetId", "asset"}}}}};
        const QJsonObject options{{"instruction", "  change light  "}, {"provider", "p"}, {"model", "m"},
                                  {"referenceAssetIds", QJsonArray{"one", "one", "two"}}};
        const auto request = nt::ai::mediaEditRequest("sequence", clip, options);
        QVERIFY(request.ok());
        QCOMPARE(request.data.value("mode").toString(), QString("video_edit"));
        QCOMPARE(request.data.value("source_context").toObject().value("source_take_id").toString(), QString("take"));
        QCOMPARE(request.data.value("reference_asset_ids").toArray().size(), 2);
        clip.insert("currentAssetId", "other");
        QCOMPARE(request.data.value("source_asset_id").toString(), QString("asset"));
        clip.insert("speedMultiplier", 2);
        QVERIFY(!nt::ai::mediaEditRequest("sequence", clip, options).ok());
        clip.insert("speedMultiplier", 1);
        clip.insert("outPointMs", 4999);
        QVERIFY(!nt::ai::mediaEditRequest("sequence", clip, options).ok());
    }
    void extension() {
        const QJsonObject clip{{"id", "c"}, {"trackId", "t"}, {"mediaType", "video"}, {"currentAssetId", "a"},
                               {"startMs", 0}, {"durationMs", 4000}};
        const QJsonObject model{{"id", "m"}, {"provider", "p"}, {"supportedTasks", QJsonArray{"extend_video", "extend_video_end"}},
                                {"durations", QJsonArray{4, 8}}};
        QJsonObject options{{"direction", "end"}, {"addedSourceDurationMs", 4000}, {"prompt", " more "}};
        const auto request = nt::ai::extensionRequest("seq", "request", clip, model, options);
        QVERIFY(request.ok());
        QCOMPARE(request.data.value("duration").toInt(), 4);
        QCOMPARE(request.snapshot.value("source").toObject().value("rate").toInt(), 1);
        options.insert("direction", "start");
        QVERIFY(!nt::ai::extensionRequest("seq", "request", clip, model, options).ok());
    }
    void imageVideo() {
        const QJsonObject clip{{"id", "c"}, {"mediaType", "image"}, {"currentAssetId", "a"}, {"durationMs", 4200}, {"startMs", 100}};
        const QJsonObject model{{"id", "m"}, {"provider", "p"}, {"durations", QJsonArray{4, 8}},
                                {"aspectRatios", QJsonArray{"1:1", "16:9"}}, {"resolutions", QJsonArray{"720p", "1080p"}}};
        const QJsonObject options{{"targetClipId", "v"}, {"prompt", "animate"}, {"width", 1920}, {"height", 1080}};
        const auto request = nt::ai::imageToVideoRequest("seq", clip, model, options);
        QVERIFY(request.ok());
        QCOMPARE(request.data.value("duration").toInt(), 8);
        QCOMPARE(request.snapshot.value("clipDurationMs").toInt(), 8000);
        QCOMPARE(request.data.value("aspect_ratio").toString(), QString("16:9"));
        QCOMPARE(request.data.value("resolution").toString(), QString("1080p"));
        QVERIFY(!nt::ai::imageToVideoRequest("", clip, model, options).ok());
    }
    void lineDelivery() {
        QJsonObject input{{"scriptId", "s"}, {"line", QJsonObject{{"id", "l"}, {"text", "  hello "}, {"speakerId", "actor"}, {"direction", "soft"}}},
                          {"castMember", QJsonObject{{"id", "actor"}, {"voice", QJsonObject{{"provider", "p"}, {"model", "m"}, {"voice", "v"}}}}},
                          {"pace", "slow"}};
        const auto request = nt::ai::lineDeliveryRequest(input);
        QVERIFY(request.ok());
        QCOMPARE(request.data.value("prompt").toString(), QString("hello"));
        QCOMPARE(request.data.value("speed").toDouble(), 0.85);
        QCOMPARE(request.data.value("instructions").toString(), QString("soft"));
        input.insert("speed", 5);
        QVERIFY(!nt::ai::lineDeliveryRequest(input).ok());
    }
};
QTEST_GUILESS_MAIN(ClipRequestsTest)
#include "tst_cliprequests.moc"
