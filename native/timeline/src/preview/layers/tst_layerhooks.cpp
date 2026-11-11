#include "preview/layers/SceneHooks.h"
#include "preview/layers/TestStill.h"
#include "preview/layers/TestInvertStage.h"
#include <QGuiApplication>
#include "model/TimelineJson.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>

namespace {
nt::Timeline document() {
    return *nt::parseTimelineJson(R"({"name":"layers","fps":30,"width":400,"height":200,"durationMs":1000,
      "tracks":[{"id":"v","type":"video"}],"clips":[
      {"id":"group","trackId":"v","mediaType":"group","startMs":0,"durationMs":1000,"opacity":0.5,"blendMode":"multiply","layout":{"display":"flex","width":400,"height":200}},
      {"id":"text","trackId":"v","parentId":"group","mediaType":"text","startMs":0,"durationMs":1000,
       "textStyle":{"text":"abcd","fontSizePx":10,"color":"#ffffff"}},
      {"id":"shape","trackId":"v","parentId":"group","mediaType":"shape","startMs":0,"durationMs":1000,
       "shapeStyle":{"kind":"rect"},"flexItem":{"width":50,"height":20}}]})").timeline;
}
const nt::ActiveLayer& shape(const nt::SceneFrame& frame) {
    const auto it = std::ranges::find(frame.layers, std::string("shape"), &nt::ActiveLayer::clipId);
    if (it == frame.layers.end()) { qFatal("missing shape layer"); }
    return *it;
}
}
class TestLayerHooks : public QObject {
    Q_OBJECT
    std::vector<nt::SceneHookToken> m_tokens;
    std::vector<nt::LayerSourceToken> m_sources;
    std::vector<nt::EffectStageToken> m_stages;
    static nt::Timeline captionDocument() {
        return *nt::parseTimelineJson(R"({"fps":30,"width":64,"height":32,"durationMs":1000,
          "tracks":[{"id":"v","type":"video"}],"clips":[{"id":"a","trackId":"v","mediaType":"video",
          "status":"generated","currentAssetId":"fixture","startMs":0,"durationMs":1000,"width":64,"height":32,
          "caption":{"words":[{"text":"hello","startMs":0,"endMs":1000}]}}]})").timeline;
    }
    static nt::Timeline pixels(bool pair = false, bool group = false) {
        auto raw = QJsonDocument::fromJson(R"({"fps":30,"width":64,"height":32,"durationMs":1000,
          "tracks":[{"id":"v","type":"video"}],"clips":[{"id":"a","trackId":"v","mediaType":"shape",
          "startMs":0,"durationMs":1000,"width":64,"height":32,"shapeStyle":{"kind":"rect"}}]})").object();
        auto clips = raw["clips"].toArray();
        auto a = clips[0].toObject();
        if (pair) {
            a.insert("width", 32);
            a.insert("transform", QJsonObject{{"position", QJsonObject{{"x", -16}, {"y", 0}}}});
            auto b = a; b.insert("id", "b");
            b.insert("transform", QJsonObject{{"position", QJsonObject{{"x", 16}, {"y", 0}}}});
            clips = QJsonArray{a, b};
        }
        if (group) {
            a.insert("parentId", "g");
            clips.replace(0, a);
            clips.prepend(QJsonObject{{"id","g"},{"trackId","v"},{"mediaType","group"},{"startMs",0},
                {"durationMs",1000},{"effects",QJsonArray{QJsonObject{{"enabled",true},{"type","invert"}}}}});
        }
        raw.insert("clips", clips);
        return *nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline;
    }
    void paintSources(bool split = false) {
        m_sources.push_back(nt::registerLayerSource("shape", [split](const nt::ActiveLayer& layer) {
            QImage image(QSize(layer.sourceWidth, layer.sourceHeight), QImage::Format_RGBA8888_Premultiplied);
            image.fill(layer.clipId == "b" ? QColor(10, 30, 200) : QColor(20, 80, 160));
            if (split) {
                for (int y = 0; y < image.height(); ++y) {
                    for (int x = image.width()/2; x < image.width(); ++x) { image.setPixelColor(x,y,QColor(200,30,10)); }
                }
            }
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        }));
    }
private slots:
    void cleanup() {
        for (auto token : m_tokens) { nt::unregisterSceneHook(token); }
        m_tokens.clear();
        for (auto token : m_sources) { nt::unregisterLayerSource(token); }
        m_sources.clear();
        for (auto token : m_stages) { nt::unregisterEffectStage(token); }
        m_stages.clear();
    }
    void registeredSourceDrawsSolidColour() {
        paintSources();
        TimelineModel model; model.setTimeline(pixels());
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still");
        const auto image = still.capture();
        QVERIFY(!image.isNull());
        QImage expected(image.size(), image.format()); expected.fill(QColor(20,80,160));
        QCOMPARE(image, expected);
        QVERIFY(!still.stats().empty());
        QCOMPARE(still.stats().back().surfaceTargetsCreated, 0);
    }
    void sourceFactoryFollowsKindAndDocument() {
        int created = 0;
        const auto factory = [&created](const nt::ActiveLayer& layer) {
            ++created;
            QImage image(QSize(layer.sourceWidth,layer.sourceHeight), QImage::Format_RGBA8888_Premultiplied);
            image.fill(layer.kind == "text" ? Qt::blue : Qt::red);
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        };
        m_sources.push_back(nt::registerLayerSource("shape",factory));
        m_sources.push_back(nt::registerLayerSource("text",factory));
        TimelineModel model; model.setTimeline(pixels());
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still");
        QVERIFY(!still.capture().isNull());
        auto clips = model.clipsJson();
        auto text = clips.first().toObject();
        text.insert("mediaType", "text"); text.insert("textStyle", QJsonObject{{"text","hello"}});
        clips.replace(0, text);
        QVERIFY(model.commitEdit("kind",model.clipsJson(),clips));
        const auto image = still.capture();
        QVERIFY(!image.isNull());
        QCOMPARE(image.pixelColor(32,16), QColor(Qt::blue));
        QCOMPARE(created, 2);
        model.setTimeline(model.timeline());
        QVERIFY(!still.capture().isNull());
        QCOMPARE(created, 3);
    }
    void captionAndVideoShareClipId() {
        const auto timeline = captionDocument();
        const auto plan = nt::buildFramePlan(timeline, 0);
        QCOMPARE(plan.layers.size(), std::size_t{2});
        QCOMPARE(plan.layers[0].layer.clipId, plan.layers[1].layer.clipId);
        QCOMPARE(plan.layers[0].layer.kind, std::string("video"));
        QCOMPARE(plan.layers[1].layer.kind, std::string("caption"));
    }
    void captionAndVideoKeepSeparateSources() {
        int captions = 0;
        m_sources.push_back(nt::registerLayerSource("video", [](const nt::ActiveLayer& layer) {
            QImage image(layer.sourceWidth, layer.sourceHeight, QImage::Format_RGBA8888_Premultiplied);
            image.fill(Qt::red);
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        }));
        m_sources.push_back(nt::registerLayerSource("caption", [&captions](const nt::ActiveLayer& layer) {
            ++captions;
            QImage image(layer.sourceWidth, layer.sourceHeight, QImage::Format_RGBA8888_Premultiplied);
            image.fill(Qt::transparent);
            for (int y = 0; y < image.height(); ++y) {
                for (int x = image.width() / 2; x < image.width(); ++x) { image.setPixelColor(x, y, Qt::blue); }
            }
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        }));
        TimelineModel model; model.setTimeline(captionDocument());
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still");
        for (int frame = 0; frame < 4; ++frame) {
            const auto image = still.capture();
            QVERIFY(!image.isNull());
            QCOMPARE(image.pixelColor(16, 16), QColor(Qt::red));
            QCOMPARE(image.pixelColor(48, 16), QColor(Qt::blue));
        }
        QCOMPARE(captions, 1);
    }
    void registeredMediaReplacesSyntheticSource() {
        auto timeline = captionDocument();
        auto& clip = timeline.clips.front();
        clip.raw.remove("caption");
        clip.scene.reset();
        TimelineModel model; model.setTimeline(timeline);
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still");
        const auto placeholder = still.capture();
        QVERIFY(!placeholder.isNull());
        auto media = clip;
        media.mediaPath = NT_FIXTURES_DIR "/media/colorbars-bt709-limited.mp4";
        model.registerMedia(media);
        QCOMPARE(model.timeline().clips.front().mediaPath, media.mediaPath);
        const auto resolved = still.capture(3000);
        QVERIFY2(!resolved.isNull(), "registered media capture did not complete");
        QVERIFY2(resolved != placeholder, "resolved fixture must replace the synthetic picture");
        media.mediaPath.clear();
        model.registerMedia(media);
        const auto restored = still.capture(3000);
        QVERIFY2(!restored.isNull(), "synthetic source capture did not complete after removing registered media");
        QCOMPARE(restored, placeholder);
    }
    void factoryRegistrationReplacesCachedSource() {
        TimelineModel model; model.setTimeline(pixels());
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still");
        const auto placeholder = still.capture();
        QVERIFY(!placeholder.isNull());
        paintSources();
        const auto painted = still.capture();
        QVERIFY(!painted.isNull());
        QCOMPARE(painted.pixelColor(32, 16), QColor(20, 80, 160));
        cleanup();
        QCOMPARE(still.capture(), placeholder);
    }
    void sourceRectCropsToReference() {
        const QColor topLeft(20, 80, 160);
        const QColor topRight(210, 40, 70);
        const QColor bottomLeft(30, 180, 60);
        const QColor bottomRight(180, 120, 20);
        QImage image(64, 32, QImage::Format_RGBA8888_Premultiplied);
        image.fill(QColor(80, 30, 200));
        // Four distinct 16x16 blocks expose incorrect crop orientation or scale.
        for (int y = 0; y < image.height(); ++y) {
            for (int x = 0; x < image.width() / 2; ++x) {
                image.setPixelColor(x, y, y < image.height() / 2
                    ? (x < image.width() / 4 ? topLeft : topRight)
                    : (x < image.width() / 4 ? bottomLeft : bottomRight));
            }
        }

        QImage stillA;
        {
            m_sources.push_back(nt::registerLayerSource("shape", [image](const nt::ActiveLayer&) {
                return std::make_unique<nt::test::PaintSource>(image);
            }));
            m_tokens.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip&, double) {
                layer.sourceRect = {0, 0, 0.5f, 1};
            }));
            TimelineModel model; model.setTimeline(pixels());
            nt::test::Still still;
            QVERIFY2(still.initialize(model), "no QRhi for offscreen still A");
            stillA = still.capture();
            QVERIFY(!stillA.isNull());
        }
        cleanup();

        m_sources.push_back(nt::registerLayerSource("shape", [image](const nt::ActiveLayer&) {
            return std::make_unique<nt::test::PaintSource>(image.copy(0, 0, image.width() / 2, image.height()));
        }));
        TimelineModel model; model.setTimeline(pixels());
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still B");
        const auto stillB = still.capture();
        QVERIFY(!stillB.isNull());
        QCOMPARE(stillA, stillB);
        // The 32x32 crop is contain-fitted at x=16 on the 64x32 canvas.
        QCOMPARE(stillA.pixelColor(24, 8), topLeft);
        QCOMPARE(stillA.pixelColor(40, 8), topRight);
        QCOMPARE(stillA.pixelColor(24, 24), bottomLeft);
        QCOMPARE(stillA.pixelColor(40, 24), bottomRight);
    }
    void effectStageInvertsOnlyItsLayer() {
        paintSources();
        m_tokens.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip& clip, double) {
            if (clip.id == "a") { layer.ext.insert("invert", true); }
        }));
        m_stages.push_back(nt::registerEffectStage([] { return std::make_unique<nt::test::InvertStage>(); }));
        TimelineModel model; model.setTimeline(pixels(true));
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still");
        const auto image = still.capture();
        QVERIFY(!image.isNull());
        QCOMPARE(image.pixelColor(16,16), QColor(235,175,95));
        QCOMPARE(image.pixelColor(48,16), QColor(10,30,200));
        QVERIFY(still.stats().back().surfaceTargetsCreated > 0);
    }
    void effectStageRunsOnGroupSurface() {
        paintSources();
        m_tokens.push_back(nt::registerGroupDecorator([](nt::PrecompositeLayer& layer, const nt::Clip&, double) {
            layer.ext.insert("invert", true);
        }));
        m_stages.push_back(nt::registerEffectStage([] { return std::make_unique<nt::test::InvertStage>(); }));
        TimelineModel model; model.setTimeline(pixels(false,true));
        nt::test::Still still;
        QVERIFY2(still.initialize(model), "no QRhi for offscreen still");
        const auto image = still.capture();
        QVERIFY(!image.isNull());
        QCOMPARE(image.pixelColor(32,16), QColor(235,175,95));
        QCOMPARE(still.stats().back().surfaceTargetsCreated, 2);
    }
    void decoratorsReachLayersAndGroups() {
        int leaves = 0, groups = 0;
        m_tokens.push_back(nt::registerLayerDecorator([&](nt::ActiveLayer& layer, const nt::Clip& clip, double time) {
            ++leaves;
            layer.ext = {{"clip", QString::fromStdString(clip.id)}, {"time", time}};
            layer.sourceRect = {0, 0, 0.5f, 1};
        }));
        m_tokens.push_back(nt::registerGroupDecorator([&](nt::PrecompositeLayer& layer, const nt::Clip& clip, double time) {
            ++groups;
            layer.ext = {{"clip", QString::fromStdString(clip.id)}, {"time", time}};
        }));
        auto timeline = document();
        const auto plan = nt::buildFramePlan(timeline, 123);
        QCOMPARE(leaves, 2);
        QCOMPARE(groups, 1);
        const auto json = nt::framePlanJson(plan);
        const auto layer = json["layers"].toArray().first().toObject();
        QCOMPARE(layer["ext"].toObject()["time"].toDouble(), 123.0);
        QCOMPARE(layer["sourceRect"].toArray(), QJsonArray({0, 0, 0.5, 1}));
        QCOMPARE(json["precomposites"].toArray().first().toObject()["ext"].toObject()["clip"].toString(), QStringLiteral("group"));
        cleanup();
        const auto plain = nt::framePlanJson(nt::buildFramePlan(timeline, 123));
        QVERIFY(!plain["layers"].toArray().first().toObject().contains("ext"));
        QVERIFY(!plain["layers"].toArray().first().toObject().contains("sourceRect"));
        QVERIFY(!plain["precomposites"].toArray().first().toObject().contains("ext"));

        auto croppedTimeline = pixels();
        m_tokens.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip&, double) {
            layer.sourceRect = {0, 0, 0.5f, 1};
        }));
        const auto cropped = nt::buildFramePlan(croppedTimeline, 123);
        cleanup();
        croppedTimeline.clips.front().width = 32;
        const auto reference = nt::buildFramePlan(croppedTimeline, 123);
        QCOMPARE(cropped.layers.size(), size_t{1});
        QCOMPARE(reference.layers.size(), size_t{1});
        QCOMPARE(cropped.layers.front().matrix, reference.layers.front().matrix);
    }
    void textMeasurerSeparatesFallbackCache() {
        auto timeline = document();
        timeline.revision = nt::nextTimelineRevision();
        const auto fallback = nt::evaluateScene(timeline, 100);
        const auto before = shape(fallback).transform->position.x;
        m_tokens.push_back(nt::registerSceneTextMeasurer([](const QString&, const nt::scene::TextStyle&) { return 80.0; }));
        const auto measured = nt::evaluateScene(timeline, 100);
        // Four 10px glyphs use the fallback width 24px. The measured width is 80px.
        QCOMPARE(shape(measured).transform->position.x - before, 56.0);
        cleanup();
        QCOMPARE(shape(nt::evaluateScene(timeline, 100)).transform->position.x, before);
    }
    void sourceTimeMapperFallsBack() {
        nt::Clip clip; clip.startMs = 100; clip.inPointMs = 50; clip.speedMultiplier = 2;
        QCOMPARE(nt::clipSourceMsAt(clip, 200), 250.0);
        m_tokens.push_back(nt::registerSourceTimeMapper([](const nt::Clip&, double time) { return time + 700; }));
        QCOMPARE(nt::clipSourceMsAt(clip, 200), 900.0);
        cleanup();
        QCOMPARE(nt::clipSourceMsAt(clip, 200), 250.0);
        clip.speedBaked = true;
        QCOMPARE(nt::clipSourceMsAt(clip, 200), 150.0);
    }
};
QTEST_MAIN(TestLayerHooks)
#include "tst_layerhooks.moc"
