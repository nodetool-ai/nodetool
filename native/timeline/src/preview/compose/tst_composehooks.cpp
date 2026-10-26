#include "preview/compose/TestHandlers.h"
#include "preview/layers/SceneHooks.h"
#include "preview/layers/TestStill.h"
#include "model/TimelineJson.h"
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>

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
        for (auto token : m_blends) { nt::unregisterBlendHandler(token); }
        for (auto token : m_stages) { nt::unregisterEffectStage(token); }
        for (auto token : m_hooks) { nt::unregisterSceneHook(token); }
        for (auto token : m_sources) { nt::unregisterLayerSource(token); }
        m_blends.clear(); m_stages.clear(); m_hooks.clear(); m_sources.clear();
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
