#include "preview/compose/TestHandlers.h"
#include "preview/layers/SceneHooks.h"
#include "preview/layers/TestStill.h"
#include "model/TimelineJson.h"
#include "export/OffscreenFrames.h"
#include <QGuiApplication>
#include "playback/PlaybackClock.h"
#include <QProcess>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>
#include <algorithm>

namespace {
const QColor bottom(128, 192, 64);
const QColor top(192, 64, 128);
const QColor multiplied(96, 48, 32);
nt::Timeline document(const QString& mode = "normal", bool group = false, bool inside = false) {
    QJsonObject raw{{"fps",30},{"width",64},{"height",32},{"durationMs",1000},
        {"tracks",QJsonArray{QJsonObject{{"id","v"},{"type","video"}}}}};
    QJsonObject a{{"id","a"},{"trackId","v"},{"mediaType","shape"},{"startMs",0},{"durationMs",1000},
        {"width",64},{"height",32},{"shapeStyle",QJsonObject{{"kind","rect"}}}};
    auto b = a;
    b.insert("id","b");
    b.insert("transform", QJsonObject{{"scale",QJsonObject{{"x",0.5},{"y",0.5}}}});
    b.insert("blendMode", group && !inside ? "normal" : mode);
    QJsonArray clips{a,b};
    if (group) {
        b.insert("parentId","g");
        clips.replace(1,b);
        if (inside) { a.insert("parentId","g"); clips.replace(0,a); }
        clips.insert(1,QJsonObject{{"id","g"},{"trackId","v"},{"mediaType","group"},{"startMs",0},
            {"durationMs",1000},{"blendMode",inside ? "normal" : mode},
            {"effects",QJsonArray{QJsonObject{{"enabled",true},{"type","test"}}}}});
    }
    raw.insert("clips",clips);
    return *nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline;
}
}
class TestComposeHooks : public QObject {
    Q_OBJECT
    std::vector<nt::MatteStageToken> m_mattes;
    std::vector<nt::SecondSourceToken> m_seconds;
    std::vector<nt::BlendHandlerToken> m_blends;
    std::vector<nt::EffectStageToken> m_stages;
    std::vector<nt::SceneHookToken> m_hooks;
    std::vector<nt::LayerSourceToken> m_sources;
    void sources() {
        m_sources.push_back(nt::registerLayerSource("shape", [](const nt::ActiveLayer& layer) {
            QImage image(layer.sourceWidth,layer.sourceHeight,QImage::Format_RGBA8888_Premultiplied);
            image.fill(layer.clipId == "b" ? top : bottom);
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        }));
    }
    void multiply() {
        m_blends.push_back(nt::registerBlendHandler("multiply", [] { return std::make_unique<nt::test::MultiplyHandler>(); }));
    }
    QImage capture(const nt::Timeline& timeline, long long* targets = nullptr) {
        TimelineModel model; model.setTimeline(timeline);
        nt::test::Still still;
        if (!still.initialize(model)) { return {}; }
        const auto image = still.capture();
        if (targets && !still.stats().empty()) { *targets = still.stats().back().surfaceTargetsCreated; }
        return image;
    }
    void near(const QColor& actual, const QColor& expected) {
        QVERIFY2(std::abs(actual.red()-expected.red()) <= 2 && std::abs(actual.green()-expected.green()) <= 2 &&
                 std::abs(actual.blue()-expected.blue()) <= 2 && std::abs(actual.alpha()-expected.alpha()) <= 2,
                 qPrintable(QString("actual %1 expected %2").arg(actual.name(QColor::HexArgb),expected.name(QColor::HexArgb))));
    }
    void border(bool report, bool group = false, bool crop = false) {
        m_stages.push_back(nt::registerEffectStage([] { return std::make_unique<nt::test::BorderStage>(); }));
        if (group) {
            m_hooks.push_back(nt::registerGroupDecorator([report](nt::PrecompositeLayer& layer, const nt::Clip&, double) {
                layer.ext = {{"border",4},{"reportOutset",report}};
                // A resolved cut translates the group's left edge 16px into
                // view, exposing the padded strip to its left.
                nt::LayerTransition cut;
                cut.offset = nt::Vec2{0.25,0};
                layer.transition = cut;
            }));
        } else {
            m_hooks.push_back(nt::registerLayerDecorator([report,crop](nt::ActiveLayer& layer, const nt::Clip&, double) {
                if (layer.clipId == "b") {
                    layer.ext = {{"border",4},{"reportOutset",report}};
                    if (crop) { layer.sourceRect = {0,0,1,0.5f}; }
                }
            }));
        }
    }
private slots:
    void cleanup() {
        for (auto token : m_mattes) { nt::unregisterMatteStage(token); }
        for (auto token : m_seconds) { nt::unregisterSecondSourceProvider(token); }
        m_mattes.clear(); m_seconds.clear();
        for (auto token : m_blends) { nt::unregisterBlendHandler(token); }
        for (auto token : m_stages) { nt::unregisterEffectStage(token); }
        for (auto token : m_hooks) { nt::unregisterSceneHook(token); }
        for (auto token : m_sources) { nt::unregisterLayerSource(token); }
        m_blends.clear(); m_stages.clear(); m_hooks.clear(); m_sources.clear();
    }
    void exportMatchesPreviewWithHooks() {
        const auto ffmpeg = QStandardPaths::findExecutable("ffmpeg");
        QVERIFY2(!ffmpeg.isEmpty(),"ffmpeg is required for the second-source fixture");
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("luma.mkv");
        QProcess process;
        process.start(ffmpeg,{"-v","error","-y","-f","lavfi","-i","color=white:s=64x32:r=30:d=1",
            "-f","lavfi","-i","color=black:s=64x32:r=30:d=1","-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0[out]","-map","[out]","-c:v","ffv1",path});
        QVERIFY(process.waitForFinished(30000));
        QCOMPARE(process.exitStatus(),QProcess::NormalExit);
        QVERIFY2(process.exitCode() == 0,process.readAllStandardError().constData());

        const auto tile = [](const char* id, int x, int y) {
            return QJsonObject{{"id",id},{"trackId","v"},{"mediaType","shape"},
                {"startMs",0},{"durationMs",2000},{"width",64},{"height",32},
                {"shapeStyle",QJsonObject{{"kind","rect"}}},
                {"transform",QJsonObject{{"position",QJsonObject{{"x",x},{"y",y}}},
                    {"scale",QJsonObject{{"x",0.375},{"y",0.375}}}}}};
        };
        auto backdrop = tile("backdrop",0,0);
        backdrop.remove("transform");
        backdrop.insert("width",128); backdrop.insert("height",96);
        auto blend = tile("multiply",-32,-24);
        blend.insert("blendMode","multiply");
        auto matte = tile("matte",-32,24);
        matte.insert("hidden",true);
        auto matted = tile("matted",-32,24);
        matted.insert("matte",QJsonObject{{"sourceClipId","matte"},{"mode","alpha"}});
        const QJsonObject raw{{"fps",30},{"width",128},{"height",96},{"durationMs",2000},
            {"tracks",QJsonArray{QJsonObject{{"id","v"},{"type","video"}}}},
            {"clips",QJsonArray{backdrop,blend,tile("border",32,-24),matte,matted,tile("second",32,24)}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(*parsed.timeline);
        m_sources.push_back(nt::registerLayerSource("shape", [](const nt::ActiveLayer& layer) {
            QImage image(layer.sourceWidth,layer.sourceHeight,QImage::Format_RGBA8888_Premultiplied);
            image.fill(layer.clipId == "backdrop" ? bottom : top);
            if (layer.clipId == "matte") {
                image.fill(Qt::transparent);
                for (int y = 0; y < image.height(); ++y) {
                    for (int x = 0; x < image.width()/2; ++x) { image.setPixelColor(x,y,Qt::white); }
                }
            }
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        }));
        constexpr qint64 index = 45;
        constexpr double fps = 30.0;
        constexpr double timeMs = static_cast<double>(index) * 1000.0 / fps;
        const auto plain = [&] {
            nt::exporting::OffscreenFrames frames(model);
            return frames.capture(index,fps,[] { return false; });
        }();
        QVERIFY(!plain.isNull());
        QCOMPARE(plain.size(),QSize(128,96));

        multiply();
        m_stages.push_back(nt::registerEffectStage([] { return std::make_unique<nt::test::BorderStage>(); }));
        m_stages.push_back(nt::registerEffectStage([] { return std::make_unique<nt::test::SecondSourceStage>(); }));
        m_mattes.push_back(nt::registerMatteStage([] { return std::make_unique<nt::test::AlphaMatteStage>(); }));
        m_seconds.push_back(nt::registerSecondSourceProvider([path](const nt::ActiveLayer& layer, const nt::Clip&) {
            return layer.clipId == "second" ? std::vector<nt::SecondSourceRequest>{{"luma",path.toStdString()}}
                                            : std::vector<nt::SecondSourceRequest>{};
        }));
        m_hooks.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip&, double) {
            if (layer.clipId == "border") { layer.ext = {{"border",4},{"reportOutset",true}}; }
            if (layer.clipId == "second") { layer.ext.insert("secondSource",true); }
        }));
        const auto preview = [&] {
            PlaybackClock clock; clock.setDurationMs(2000); clock.seek(timeMs);
            nt::test::Still still;
            if (!still.initialize(model)) { return QImage{}; }
            still.setClock(&clock);
            return still.capture(15000).convertToFormat(QImage::Format_RGBA8888);
        }();
        QVERIFY(!preview.isNull());
        QCOMPARE(preview.size(),plain.size());
        const auto exported = [&] {
            nt::exporting::OffscreenFrames frames(model);
            return frames.capture(index,fps,[] { return false; }).convertToFormat(QImage::Format_RGBA8888);
        }();
        QVERIFY(!exported.isNull());
        QCOMPARE(exported.size(),preview.size());
        const auto difference = [](const QColor& a, const QColor& b) {
            return std::max({std::abs(a.red()-b.red()),std::abs(a.green()-b.green()),
                std::abs(a.blue()-b.blue()),std::abs(a.alpha()-b.alpha())});
        };
        const auto visible = [&](QPoint p, const QColor& before, const QColor& after, const char* hook) {
            near(plain.pixelColor(p),before);
            near(exported.pixelColor(p),after);
            QVERIFY2(difference(exported.pixelColor(p),plain.pixelColor(p)) > 1,hook);
        };
        visible({32,24},top,multiplied,"multiply blend must be visible in export");
        // The unpadded border tile starts at x72. This pixel needs its outset.
        visible({70,24},bottom,QColor(Qt::red),"effect outset must be visible in export");
        visible({48,72},top,bottom,"alpha matte must be visible in export");
        visible({96,72},top,bottom,"second-source black frame at 1.5s must be visible in export");
        near(exported.pixelColor(20,72),top);
        for (int y = 0; y < exported.height(); ++y) {
            for (int x = 0; x < exported.width(); ++x) {
                const auto actual = exported.pixelColor(x,y), expected = preview.pixelColor(x,y);
                QCOMPARE(actual.alpha(),255);
                QCOMPARE(expected.alpha(),255);
                QVERIFY2(difference(actual,expected) <= 1,qPrintable(QString("export/preview mismatch at (%1,%2): %3 / %4")
                    .arg(x).arg(y).arg(actual.name(QColor::HexArgb),expected.name(QColor::HexArgb))));
            }
        }
    }
    void matteExposesSourceLayer() {
        auto raw = document().raw;
        auto clips = raw.value("clips").toArray();
        auto a = clips[0].toObject();
        a.insert("hidden", true);
        a.insert("transform", QJsonObject{{"position",QJsonObject{{"x",12},{"y",4}}}});
        a.insert("animations", QJsonArray{QJsonObject{{"id","fade"},{"role","in"},{"preset","custom"},
            {"durationMs",1000},{"custom",QJsonObject{{"curves",QJsonArray{QJsonObject{
                {"property","opacity"},{"keyframes",QJsonArray{QJsonObject{{"t",0},{"value",0.2}},
                    QJsonObject{{"t",1},{"value",0.8},{"easing","linear"}}}}}}}}}}});
        auto b = clips[1].toObject();
        b.insert("matte", QJsonObject{{"sourceClipId","a"},{"mode","luma"},{"invert",true}});
        const auto parse = [&] {
            raw.insert("clips",QJsonArray{a,b});
            return *nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline;
        };
        m_hooks.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip&, double) {
            if (layer.clipId == "a") { layer.ext.insert("decorated",true); }
        }));
        const auto timeline = parse();
        const auto frame = nt::evaluateScene(timeline,500);
        QCOMPARE(frame.layers.size(),size_t{1});
        QCOMPARE(frame.layers[0].clipId,std::string("b"));
        QVERIFY(frame.layers[0].matte.has_value());
        const auto& matte = *frame.layers[0].matte;
        QCOMPARE(matte.mode,std::string("luma"));
        QVERIFY(matte.invert);
        QVERIFY(matte.layer);
        QCOMPARE(matte.layer->clipId,std::string("a"));
        QVERIFY(matte.layer->transform.has_value());
        QCOMPARE(matte.layer->transform->position.x,12.0);
        QCOMPARE(matte.layer->transform->position.y,4.0);
        QCOMPARE(matte.layer->opacity,0.5);
        QCOMPARE(matte.layer->drawOpacity,0.5);
        QVERIFY(matte.layer->ext.value("decorated").toBool());
        QVERIFY(!QJsonDocument(nt::framePlanJson(nt::buildFramePlan(timeline,500))).toJson().contains("\"matte\""));
        b.insert("generatedMatte",QJsonObject{{"assetId","mask"}});
        const auto generated = nt::evaluateScene(parse(),500);
        QCOMPARE(generated.layers.size(),size_t{1});
        QVERIFY(!generated.layers[0].matte);
        b.remove("generatedMatte");
        a.insert("startMs",600);
        const auto inactive = nt::evaluateScene(parse(),500);
        QVERIFY(inactive.layers.empty());
        QCOMPARE(inactive.dropped.size(),size_t{1});
        QCOMPARE(inactive.dropped[0].reason,std::string("matte_source_inactive"));
    }
    void lastRegistrationWins() {
        int first = 0, second = 0;
        m_blends.push_back(nt::registerBlendHandler("multiply", [&first] { ++first; return std::make_unique<nt::test::MultiplyHandler>(); }));
        m_blends.push_back(nt::registerBlendHandler("multiply", [&second] { ++second; return std::make_unique<nt::test::MultiplyHandler>(); }));
        QCOMPARE(nt::registeredBlendHandlers().size(), size_t{1});
        QCOMPARE(first,0); QCOMPARE(second,1);
        nt::unregisterBlendHandler(m_blends.back()); m_blends.pop_back();
        QCOMPARE(nt::registeredBlendHandlers().size(), size_t{1});
        QCOMPARE(first,1);
        cleanup();
        QVERIFY(nt::registeredBlendHandlers().empty());
        m_mattes.push_back(nt::registerMatteStage([&first] { ++first; return std::make_unique<nt::test::AlphaMatteStage>(); }));
        m_mattes.push_back(nt::registerMatteStage([&second] { ++second; return std::make_unique<nt::test::AlphaMatteStage>(); }));
        QVERIFY(nt::registeredMatteStage());
        QCOMPARE(second,2);
        nt::unregisterMatteStage(m_mattes.back()); m_mattes.pop_back();
        QVERIFY(nt::registeredMatteStage());
        QCOMPARE(first,2);
        m_seconds.push_back(nt::registerSecondSourceProvider([](const nt::ActiveLayer&, const nt::Clip&) {
            return std::vector<nt::SecondSourceRequest>{{"mask","first"}};
        }));
        const auto snapshot = nt::registeredSecondSourceProviders();
        QCOMPARE(snapshot.size(),size_t{1});
        cleanup();
        QVERIFY(!nt::registeredMatteStage());
        QVERIFY(nt::registeredSecondSourceProviders().empty());
        QCOMPARE(snapshot[0]({},{}).front().mediaPath,std::string("first"));
    }
    void matteStageUsesMatteAlpha() {
        auto timeline = document();
        auto raw = timeline.raw;
        auto clips = raw.value("clips").toArray();
        auto a = clips[0].toObject(), b = clips[1].toObject();
        a.insert("hidden",true);
        b.remove("transform");
        b.insert("matte",QJsonObject{{"sourceClipId","a"},{"mode","alpha"}});
        raw.insert("clips",QJsonArray{a,b});
        timeline = *nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline;
        m_sources.push_back(nt::registerLayerSource("shape", [](const nt::ActiveLayer& layer) {
            QImage image(64,32,QImage::Format_RGBA8888_Premultiplied);
            image.fill(layer.clipId == "b" ? top : QColor(Qt::transparent));
            if (layer.clipId == "a") {
                for (int y = 0; y < 32; ++y) {
                    for (int x = 0; x < 32; ++x) { image.setPixelColor(x,y,Qt::white); }
                }
            }
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        }));
        long long targets = -1;
        const auto plain = capture(timeline,&targets);
        QVERIFY(!plain.isNull());
        near(plain.pixelColor(16,16),top);
        near(plain.pixelColor(48,16),top);
        QCOMPARE(targets,0);
        m_mattes.push_back(nt::registerMatteStage([] { return std::make_unique<nt::test::AlphaMatteStage>(); }));
        const auto matted = capture(timeline);
        QVERIFY(!matted.isNull());
        near(matted.pixelColor(16,16),top);
        near(matted.pixelColor(48,16),QColor(Qt::black));
        m_hooks.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& l, const nt::Clip&, double) {
            if (l.clipId == "b") { l.opacity = 0.5; }
        }));
        const auto faded = capture(timeline);
        QVERIFY(!faded.isNull());
        near(faded.pixelColor(16,16),QColor(96,32,64));
        near(faded.pixelColor(48,16),QColor(Qt::black));
        m_hooks.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& l, const nt::Clip&, double) {
            if (l.clipId == "a") { l.opacity = 0.5; }
        }));
        const auto soft = capture(timeline);
        QVERIFY(!soft.isNull());
        near(soft.pixelColor(16,16),QColor(48,16,32));
    }
    void secondSourceReachesStage() {
        const auto ffmpeg = QStandardPaths::findExecutable("ffmpeg");
        QVERIFY2(!ffmpeg.isEmpty(),"ffmpeg is required for the second-source fixture");
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("luma.mkv");
        QProcess process;
        process.start(ffmpeg,{"-v","error","-y","-f","lavfi","-i","color=white:s=64x32:r=30:d=1",
            "-f","lavfi","-i","color=black:s=64x32:r=30:d=1","-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0[out]","-map","[out]","-c:v","ffv1",path});
        QVERIFY(process.waitForFinished(30000));
        QCOMPARE(process.exitStatus(),QProcess::NormalExit);
        QVERIFY2(process.exitCode() == 0,process.readAllStandardError().constData());
        auto timeline = document();
        timeline.durationMs = 2000;
        timeline.clips.resize(1);
        timeline.clips[0].durationMs = 2000;
        sources();
        m_hooks.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& l, const nt::Clip&, double) {
            l.ext.insert("secondSource",true);
        }));
        m_stages.push_back(nt::registerEffectStage([] { return std::make_unique<nt::test::SecondSourceStage>(); }));
        const auto at = [&](double ms) {
            TimelineModel model; model.setTimeline(timeline);
            PlaybackClock clock; clock.setDurationMs(2000); clock.seek(ms);
            nt::test::Still still;
            if (!still.initialize(model)) { return QImage{}; }
            still.setClock(&clock);
            return still.capture(15000);
        };
        const auto plain = at(1500);
        QVERIFY(!plain.isNull());
        near(plain.pixelColor(32,16),bottom);
        m_seconds.push_back(nt::registerSecondSourceProvider([path](const nt::ActiveLayer& l, const nt::Clip&) {
            return l.clipId == "a" ? std::vector<nt::SecondSourceRequest>{{"luma",path.toStdString()}}
                                   : std::vector<nt::SecondSourceRequest>{};
        }));
        const auto white = at(500), black = at(1500);
        QVERIFY(!white.isNull()); QVERIFY(!black.isNull());
        near(white.pixelColor(32,16),bottom);
        near(black.pixelColor(32,16),QColor(Qt::black));
        timeline.clips[0].inPointMs = 1000;
        const auto shifted = at(500);
        QVERIFY(!shifted.isNull());
        near(shifted.pixelColor(32,16),QColor(Qt::black));
        cleanup(); sources();
        auto raw = document().raw;
        auto clips = raw.value("clips").toArray();
        auto a = clips[0].toObject(), b = clips[1].toObject();
        a.insert("mediaType","video"); a.insert("mediaPath",path);
        a.insert("hidden",true); a.insert("durationMs",2000);
        b.remove("transform"); b.insert("durationMs",2000);
        b.insert("matte",QJsonObject{{"sourceClipId","a"},{"mode","alpha"}});
        raw.insert("clips",QJsonArray{a,b}); raw.insert("durationMs",2000);
        timeline = *nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline;
        m_mattes.push_back(nt::registerMatteStage([] { return std::make_unique<nt::test::SecondSourceMatteStage>(); }));
        m_seconds.push_back(nt::registerSecondSourceProvider([path](const nt::ActiveLayer& l, const nt::Clip&) {
            return l.clipId == "b" ? std::vector<nt::SecondSourceRequest>{{"luma",path.toStdString()}}
                                   : std::vector<nt::SecondSourceRequest>{};
        }));
        const auto mediaMatte = at(500), secondInMatte = at(1500);
        QVERIFY(!mediaMatte.isNull()); QVERIFY(!secondInMatte.isNull());
        near(mediaMatte.pixelColor(32,16),top);
        near(secondInMatte.pixelColor(32,16),QColor(Qt::black));
    }
    void blendHandlerMultipliesLayer() {
        sources();
        const auto plain = capture(document("multiply"));
        QVERIFY(!plain.isNull());
        near(plain.pixelColor(32,16),top);
        multiply();
        const auto blended = capture(document("multiply"));
        QVERIFY(!blended.isNull());
        near(blended.pixelColor(32,16),multiplied);
        near(blended.pixelColor(4,16),bottom);
        // Opacity must be applied before the handler samples its layer.
        m_hooks.push_back(nt::registerLayerDecorator([](nt::ActiveLayer& l, const nt::Clip&, double) {
            if (l.clipId == "b") { l.opacity = 0.5; }
        }));
        const auto translucent = capture(document("multiply"));
        QVERIFY(!translucent.isNull());
        near(translucent.pixelColor(32,16),QColor(112,120,48));
    }
    void blendHandlerOnGroupSurface() {
        sources(); multiply();
        const auto image = capture(document("multiply",true));
        QVERIFY(!image.isNull());
        near(image.pixelColor(32,16),multiplied);
        near(image.pixelColor(4,16),bottom);
    }
    void blendHandlerInsideGroupSurface() {
        sources(); multiply();
        const auto image = capture(document("multiply",true,true));
        QVERIFY(!image.isNull());
        near(image.pixelColor(32,16),multiplied);
        near(image.pixelColor(4,16),bottom);
    }
    void unhandledBlendDrawsOver() {
        sources();
        long long baseline = -1, handled = -2;
        const auto plain = capture(document("screen"),&baseline);
        QVERIFY(!plain.isNull());
        multiply();
        const auto image = capture(document("screen"),&handled);
        QCOMPARE(image,plain);
        QCOMPARE(handled,baseline);
        QCOMPARE(baseline,0);
        near(image.pixelColor(32,16),top);
    }
    void effectOutsetShowsBorder() {
        sources(); border(false);
        const auto clipped = capture(document());
        QVERIFY(!clipped.isNull());
        cleanup(); sources(); border(true);
        const auto image = capture(document());
        QVERIFY(!image.isNull());
        for (const QPoint p : {QPoint(15,16),QPoint(48,16),QPoint(32,7),QPoint(32,24)}) {
            near(clipped.pixelColor(p),bottom);
            near(image.pixelColor(p),QColor(Qt::red));
        }
        for (const QPoint p : {QPoint(17,9),QPoint(46,22),QPoint(32,16)}) { near(image.pixelColor(p),top); }
    }
    void effectOutsetOnGroupSurface() {
        sources(); border(false,true);
        const auto clipped = capture(document("normal",true,true));
        QVERIFY(!clipped.isNull());
        cleanup(); sources(); border(true,true);
        const auto image = capture(document("normal",true,true));
        QVERIFY(!image.isNull());
        near(clipped.pixelColor(14,16),QColor(Qt::black));
        near(image.pixelColor(14,16),QColor(Qt::red));
        near(image.pixelColor(40,16),top);
    }
    void effectOutsetChainAndCrop() {
        sources(); border(true,false,true);
        m_stages.push_back(nt::registerEffectStage([] { return std::make_unique<nt::test::BorderStage>(); }));
        const auto image = capture(document());
        QVERIFY(!image.isNull());
        // Cropped source is 64x16, contain fit .5: old bounds x16..48,
        // y12..20. Two 4px source outsets add 4 canvas pixels per side.
        near(image.pixelColor(12,16),QColor(Qt::red));
        near(image.pixelColor(51,16),QColor(Qt::red));
        near(image.pixelColor(32,8),QColor(Qt::red));
        near(image.pixelColor(32,16),top);
        near(image.pixelColor(11,16),bottom);
    }
};
QTEST_MAIN(TestComposeHooks)
#include "tst_composehooks.moc"
