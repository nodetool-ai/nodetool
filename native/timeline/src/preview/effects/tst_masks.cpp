#include "preview/effects/Masks.h"
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
