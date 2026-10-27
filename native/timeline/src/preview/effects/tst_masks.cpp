#include "preview/effects/Masks.h"
#include "preview/effects/ClipEffects.h"
#include "preview/layers/SceneHooks.h"
#include <QJsonDocument>
#include <cmath>
#include <QtTest>

class TestMasks : public QObject {
    Q_OBJECT
  private slots:
    void coverage() {
        const QJsonObject rect{{"kind", "rect"}, {"x", 0.25}, {"y", 0.25}, {"width", 0.5}, {"height", 0.5}};
        nt::effects::MaskRasterizer raster;
        const auto a = raster.rasterize(rect, {64, 32});
        QVERIFY(!a.isNull());
        QCOMPARE(a.pixelColor(32, 16).alpha(), 255);
        QCOMPARE(a.pixelColor(1, 1).alpha(), 0);
        auto inverted = rect;
        inverted.insert("invert", true);
        const auto b = raster.rasterize(inverted, {64, 32});
        for (int y = 0; y < 32; ++y) {
            for (int x = 0; x < 64; ++x) {
                QCOMPARE(a.pixelColor(x, y).alpha() + b.pixelColor(x, y).alpha(), 255);
            }
        }
        auto soft = rect;
        soft.insert("featherPx", 4);
        const auto c = raster.rasterize(soft, {64, 32});
        QCOMPARE(c.pixelColor(32, 16).alpha(), 255);
        QVERIFY(c.pixelColor(16, 16).alpha() > 0);
        QVERIFY(c.pixelColor(16, 16).alpha() < 64);
        auto ellipse = rect;
        ellipse.insert("kind", "ellipse");
        const auto e = raster.rasterize(ellipse, {64, 32});
        QCOMPARE(e.pixelColor(16, 8).alpha(), 0);
        QCOMPARE(e.pixelColor(32, 16).alpha(), 255);
        auto round = rect;
        round.insert("radiusPx", 8);
        const auto r = raster.rasterize(round, {64, 32});
        QCOMPARE(r.pixelColor(16, 8).alpha(), 0);
        QCOMPARE(r.pixelColor(32, 16).alpha(), 255);
        const auto p = raster.rasterize({{"kind", "path"}, {"d", "M .2 .2 L .8 .2 L .5 .8 Z"}}, {64, 32});
        QVERIFY(!p.isNull());
        QCOMPARE(p.pixelColor(32, 16).alpha(), 255);
        QCOMPARE(p.pixelColor(1, 1).alpha(), 0);
        QVERIFY(raster.rasterize({{"kind", "path"}, {"d", "broken"}}, {64, 32}).isNull());
        QVERIFY(raster.rasterize({{"kind", "unknown"}}, {64, 32}).isNull());
        QVERIFY(raster.rasterize(rect, {}).isNull());
        QCOMPARE(raster.rasterize(rect, {4096, 2048}).size(), QSize(2048, 1024));
        QCOMPARE(a.cacheKey(), raster.rasterize(rect, {64, 32}).cacheKey());
        for (int i = 0; i < 40; ++i) {
            auto key = rect;
            key.insert("x", i / 100.0);
            raster.rasterize(key, {64, 32});
        }
        QVERIFY(raster.cacheSize() <= 32);
    }
    void invertedEllipseExportCoverage() {
        nt::effects::MaskRasterizer raster;
        const auto image = raster.rasterize({{"kind", "ellipse"},
                                             {"x", 0.25},
                                             {"y", 0.25},
                                             {"width", 0.5},
                                             {"height", 0.5},
                                             {"featherPx", 4},
                                             {"invert", true}},
                                            {64, 32});
        // mask-invert: the export's Canvas destination-out clips a transformed
        // feathered ellipse to the quadrant starting at its translated origin.
        QCOMPARE(image.pixelColor(28, 12).alpha(), 255);
        QCOMPARE(image.pixelColor(32, 16).alpha(), 0);
        QVERIFY(image.pixelColor(40, 20).alpha() > 100);
        const auto fractional = raster.rasterize({{"kind", "ellipse"},
                                                  {"x", 0.12},
                                                  {"y", 0.13},
                                                  {"width", 0.58},
                                                  {"height", 0.65},
                                                  {"featherPx", 4},
                                                  {"invert", true}},
                                                 {64, 32});
        QCOMPARE(fractional.pixelColor(25, 14).alpha(), 255);
        QCOMPARE(fractional.pixelColor(26, 13).alpha(), 255);
        QCOMPARE(fractional.pixelColor(26, 14).alpha(), 0);
    }
    void invertedFilteredExportCoverage() {
        nt::effects::MaskRasterizer raster;
        const auto image = raster.rasterize({{"kind", "rect"},
                                             {"x", 0.25},
                                             {"y", 0.25},
                                             {"width", 0.5},
                                             {"height", 0.5},
                                             {"radiusPx", 5},
                                             {"featherPx", 4},
                                             {"invert", true}},
                                            {64, 32});
        // The export erases 32/255 here: destination-out filters the mask
        // twice. A single filter leaves alpha above 240.
        QVERIFY(image.pixelColor(32, 4).alpha() < 235);
        QVERIFY(image.pixelColor(32, 4).alpha() > 210);
    }
    void emptyFeatheredEllipse() {
        nt::effects::MaskRasterizer raster;
        QJsonObject mask{{"kind", "ellipse"}, {"width", -0.5}, {"featherPx", 4}};
        const auto empty = raster.rasterize(mask, {64, 32});
        QVERIFY(!empty.isNull());
        QCOMPARE(empty.pixelColor(32, 16).alpha(), 0);
        mask.insert("invert", true);
        const auto inverted = raster.rasterize(mask, {64, 32});
        QVERIFY(!inverted.isNull());
        QCOMPARE(inverted.pixelColor(32, 16).alpha(), 255);
    }
    void generatedSourceKeepsClipTreatments() {
        nt::Clip clip; clip.durationMs = 1000;
        clip.raw = {{"generatedMatte", QJsonObject{{"mediaPath", "/tmp/matte.mp4"}}},
                    {"effects", QJsonArray{QJsonObject{{"id", "grade"}, {"type", "color"},
                        {"enabled", true}, {"brightness", 0.8}}}},
                    {"mask", QJsonObject{{"kind", "ellipse"}, {"featherPx", 12}}}};
        clip.raw.insert("animations", QJsonDocument::fromJson(R"([{
            "id":"style","role":"in","preset":"custom","durationMs":1000,
            "custom":{"curves":[{"property":"brightness","keyframes":[{"t":0,"value":0},{"t":1,"value":0.4}]}]},
            "styleTracks":[
                {"target":"effect.grade.brightness","keyframes":[{"t":0,"value":0.2},{"t":1,"value":0.8}]},
                {"target":"mask.featherPx","keyframes":[{"t":0,"value":12},{"t":1,"value":20}]}]
        }])").array());
        nt::Track track;
        track.raw = {{"effects", QJsonArray{QJsonObject{{"type", "colorCorrection"},
            {"enabled", true}, {"brightness", 0.4}}}}};
        nt::Timeline timeline;
        const nt::SceneDecorationContext context{timeline, &track, 500, 500, 30, 15};
        for (bool masksFirst : {false, true}) {
            nt::ActiveLayer layer;
            layer.sourceTimeMs = 725;
            layer.opacity = 0.4;
            layer.blendMode = "screen";
            layer.transform = nt::ClipTransform{};
            layer.parentMatrix = nt::Mat4{};
            layer.mask = nt::scene::WipeMask{"left", 0.1, 0.37};
            layer.sourceRect = {0.25, 0, 0.5, 1};
            layer.ext.insert("effectSourceRect", QJsonArray{0.25, 0, 0.5, 1});
            layer.transition = nt::LayerTransition{};
            layer.transition->mask = nt::scene::WipeMask{};
            layer.transition->iris = std::pair{0.4, 0.1};
            layer.transition->solidColor = "#ffffff";
            layer.transition->solidOpacity = 0.8;
            layer.transition->offset = nt::Vec2{0.5, 0};
            if (masksFirst) { nt::effects::decorateMasks(layer, clip, &context); }
            nt::effects::decorateEffects(layer.ext, clip, context);
            nt::effects::decorateTrackEffects(layer.ext, &track);
            if (!masksFirst) { nt::effects::decorateMasks(layer, clip, &context); }
            QVERIFY(layer.matte);
            const auto &source = *layer.matte->layer;
            QCOMPARE(source.ext.value("clipEffects"), layer.ext.value("clipEffects"));
            const auto effects = source.ext.value("clipEffects").toArray();
            QCOMPARE(effects.size(), 2);
            QCOMPARE(effects[0].toObject().value("brightness").toDouble(), 0.5);
            QCOMPARE(effects[1].toObject().value("brightness").toDouble(), 0.2);
            QVERIFY(!source.ext.contains("trackEffects"));
            QCOMPARE(source.ext.value("shapeMask"), layer.ext.value("shapeMask"));
            QCOMPARE(source.ext.value("shapeMask").toObject().value("featherPx").toDouble(), 16.);
            QVERIFY(source.mask);
            QCOMPARE(source.mask->direction, layer.mask->direction);
            QCOMPARE(source.mask->softness, layer.mask->softness);
            QCOMPARE(source.mask->progress, layer.mask->progress);
            QCOMPARE(source.sourceRect, (std::array<float, 4>{0, 0, 1, 1}));
            QCOMPARE(source.ext.value("effectSourceRect").toArray(), (QJsonArray{0, 0, 1, 1}));
            QVERIFY(source.transition);
            QVERIFY(!source.transition->mask);
            QVERIFY(!source.transition->iris);
            QVERIFY(!source.transition->solidColor);
            QCOMPARE(source.transition->solidOpacity, 0.);
            QVERIFY(source.transition->offset);
            QCOMPARE(source.transition->offset->x, 0.5);
            QCOMPARE(source.sourceTimeMs, 725.);
            QCOMPARE(source.opacity, 1.);
            QCOMPARE(source.blendMode, std::string("normal"));
            QCOMPARE(source.parentMatrix, layer.parentMatrix);
            QVERIFY(source.transform);
            // Later decorators preserve clip treatments without adding track effects or a recursive matte.
            auto decoratedSource = source;
            nt::effects::decorateEffects(decoratedSource.ext, clip, context);
            nt::effects::decorateTrackEffects(decoratedSource.ext, &track);
            nt::effects::decorateMasks(decoratedSource, clip, &context);
            QCOMPARE(decoratedSource.ext.value("clipEffects"), source.ext.value("clipEffects"));
            QVERIFY(!decoratedSource.ext.contains("trackEffects"));
            QCOMPARE(decoratedSource.ext.value("shapeMask"), source.ext.value("shapeMask"));
            QVERIFY(!decoratedSource.matte);
            QVERIFY(layer.ext.contains("clipEffects"));
            QVERIFY(layer.ext.contains("trackEffects"));
            QVERIFY(layer.ext.contains("shapeMask"));
        }
    }
    void hugeFeather_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<QByteArray>("feather");
        for (const auto *kind : {"path", "rect", "ellipse"}) {
            for (const auto *value : {"1e9", "1e300", "1e308"}) {
                QTest::newRow(qPrintable(QString("%1-%2").arg(kind, value))) << QString(kind) << QByteArray(value);
            }
        }
    }
    void hugeFeather() {
        QFETCH(QString, kind);
        QFETCH(QByteArray, feather);
        auto mask = QJsonDocument::fromJson("{\"featherPx\":" + feather + "}").object();
        QVERIFY(mask.value("featherPx").toDouble() > 0);
        mask.insert("kind", kind);
        mask.insert("d", "M .2 .2 L .8 .2 L .5 .8 Z");
        mask.insert("radiusPx", 4);
        mask.insert("x", 0.2); mask.insert("y", 0.2);
        mask.insert("width", 0.6); mask.insert("height", 0.6);
        nt::effects::MaskRasterizer raster;
        const auto image = raster.rasterize(mask, {32, 16});
        QVERIFY(!image.isNull());
        QCOMPARE(image.size(), QSize(32, 16));
        QVERIFY(image.pixelColor(16, 8).alpha() > 0);
        QVERIFY(image.pixelColor(16, 8).alpha() < 255);
        nt::Clip clip;
        mask.insert("mediaPath", "/tmp/matte.mp4");
        clip.raw.insert("generatedMatte", mask);
        nt::ActiveLayer layer;
        nt::effects::decorateMasks(layer, clip);
        QVERIFY(layer.matte);
        QVERIFY(std::isfinite(layer.matte->featherPx.value_or(-1)));
        QVERIFY(layer.matte->featherPx.value_or(-1) <= 256);
        const auto chain = nt::effects::planChain({QJsonObject{{"type", "blur"}, {"enabled", true},
            {"radius", layer.matte->featherPx.value_or(0)}}});
        QVERIFY(!chain.empty());
        for (const auto &pass : chain) {
            QVERIFY(std::isfinite(pass.params[0]));
            QVERIFY(pass.params[0] <= 256);
        }
    }
    void secondSourceRequests() {
        nt::Clip clip;
        clip.mediaPath = "/tmp/fixtures/picture.mp4";
        clip.raw = {{"mediaPath", "picture.mp4"},
                    {"generatedMatte", QJsonObject{{"assetId", "id"},
                                                   {"mediaPath", "matte.mp4"},
                                                   {"invert", true},
                                                   {"strength", 0.4},
                                                   {"featherPx", 12}}}};
        nt::ActiveLayer layer;
        layer.clipId = "picture";
        layer.sourceTimeMs = 725;
        layer.sourceWidth = 64;
        layer.sourceHeight = 32;
        QCOMPARE(nt::effects::generatedMatteSources(layer, clip).size(), size_t{0});
        nt::effects::decorateMasks(layer, clip);
        QVERIFY(layer.matte);
        QCOMPARE(layer.matte->mode, std::string("luma"));
        QVERIFY(layer.matte->invert);
        QCOMPARE(layer.matte->featherPx.value_or(0), 12.);
        QCOMPARE(layer.opacity, 0.4);
        QCOMPARE(layer.matte->layer->opacity, 1.);
        QCOMPARE(layer.matte->layer->sourceTimeMs, layer.sourceTimeMs);
        const auto requests = nt::effects::generatedMatteSources(*layer.matte->layer, clip);
        QCOMPARE(requests.size(), size_t{1});
        QCOMPARE(requests[0].key, std::string("j-generated-matte"));
        QCOMPARE(requests[0].mediaPath, std::string("/tmp/fixtures/matte.mp4"));
        for (const auto status : {"generating", "failed"}) {
            auto generated = clip.raw.value("generatedMatte").toObject();
            generated.insert("status", status);
            clip.raw.insert("generatedMatte", generated);
            nt::ActiveLayer pending;
            nt::effects::decorateMasks(pending, clip);
            QVERIFY(!pending.matte);
        }
    }
};
QTEST_GUILESS_MAIN(TestMasks)
#include "tst_masks.moc"
