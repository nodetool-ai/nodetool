#include "model/TimelineJson.h"
#include "preview/layers/LayerRegistry.h"
#include "preview/layers/SceneHooks.h"
#include "render2d/Rasterizer.h"
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#include <QtTest>
#include <cmath>

namespace {
QJsonObject references() {
    QFile file(QStringLiteral(NT_RENDER2D_REFERENCE_DIR "/cases.json"));
    if (!file.open(QIODevice::ReadOnly)) {
        qFatal("Generate render2d references first");
    }
    return QJsonDocument::fromJson(file.readAll()).object();
}
double psnr(const QImage& a, const QImage& b, QColor background) {
    const auto composite = [&](const QImage& image) {
        QImage out(image.size(), QImage::Format_RGB32);
        out.fill(background);
        QPainter painter(&out);
        painter.drawImage(0, 0, image);
        return out;
    };
    const auto aa = composite(a), bb = composite(b);
    double error = 0;
    for (int y = 0; y < a.height(); ++y) {
        for (int x = 0; x < a.width(); ++x) {
            const auto ac = aa.pixelColor(x, y), bc = bb.pixelColor(x, y);
            error += std::pow(ac.red() - bc.red(), 2) + std::pow(ac.green() - bc.green(), 2) +
                     std::pow(ac.blue() - bc.blue(), 2);
        }
    }
    return error == 0 ? INFINITY : 10 * std::log10(255.0 * 255 * a.width() * a.height() * 3 / error);
}
nt::ActiveLayer layerFor(const QJsonObject& fixture) {
    const auto raw = QJsonObject{
        {"width", fixture["width"].toInt(640)},
        {"height", fixture["height"].toInt(360)},
        {"fps", 30},
        {"durationMs", 3000},
        {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"index", 0}, {"visible", true}}}},
        {"clips", QJsonArray{fixture["clip"]}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    if (!parsed.timeline) {
        qFatal("Reference timeline failed to parse");
    }
    const auto layers = nt::activeLayersAt(*parsed.timeline, fixture["timeMs"].toDouble());
    if (layers.empty()) {
        qFatal("Reference layer missing");
    }
    return layers.front();
}
} // namespace
class TestRender2d : public QObject {
    Q_OBJECT
  private slots:
    void sourcesAndMeasurerRegistered() {
        QVERIFY(nt::sceneHooks().measureText);
        for (const auto* kind : {"text", "shape", "caption"}) {
            QVERIFY2(nt::registeredLayerSourceFactory(kind).factory, kind);
        }
    }
    void rasterMatchesServer_data() {
        QTest::addColumn<QJsonObject>("fixture");
        for (const auto& value : references()["cases"].toArray()) {
            const auto fixture = value.toObject();
            QTest::newRow(qPrintable(fixture["name"].toString())) << fixture;
        }
    }
    void rasterMatchesServer() {
        QFETCH(QJsonObject, fixture);
        const QImage reference(QStringLiteral(NT_RENDER2D_REFERENCE_DIR "/") + fixture["name"].toString() + ".png");
        QVERIFY(!reference.isNull());
        const auto image = nt::render2d::rasterize(layerFor(fixture));
        QCOMPARE(image.size(), reference.size());
        const auto region = fixture["region"].toArray();
        const QRect crop = region.isEmpty()
                               ? image.rect()
                               : QRect(region[0].toInt(), region[1].toInt(), region[2].toInt(), region[3].toInt());
        const double score = std::min(psnr(image.copy(crop), reference.copy(crop), Qt::black),
                                      psnr(image.copy(crop), reference.copy(crop), Qt::white));
        image.save(QStringLiteral(NT_RENDER2D_REFERENCE_DIR "/") + fixture["name"].toString() + "-native.png");
        qInfo().noquote() << fixture["name"].toString() << "PSNR" << score;
        QVERIFY2(score >= 35, qPrintable(QString::number(score) + " dB < 35"));
    }
    void measuredLayoutMatchesServer_data() {
        QTest::addColumn<QJsonObject>("fixture");
        for (const auto& value : references()["cases"].toArray()) {
            const auto fixture = value.toObject();
            if (fixture["kind"] != "text" || !fixture["animations"].toArray().isEmpty()) {
                continue;
            }
            QTest::newRow(qPrintable(fixture["name"].toString())) << fixture;
        }
    }
    void measuredLayoutMatchesServer() {
        QFETCH(QJsonObject, fixture);
        const auto style = nt::scene::parseTextStyle(fixture["style"].toObject());
        const auto box = nt::scene::textBlockBox(nt::render2d::textMeasurer(), style, fixture["width"].toInt(640),
                                                 fixture["height"].toInt(360));
        const auto expected = fixture["layout"].toObject()["box"].toObject();
        qInfo() << fixture["name"].toString() << "box" << box.x << box.y << box.width << box.height << "expected"
                << expected;
        const auto layout = nt::scene::layoutTextBlock(nt::render2d::textMeasurer(), style, fixture["width"].toInt(640),
                                                       fixture["height"].toInt(360));
        const auto lines = fixture["layout"].toObject()["lines"].toArray();
        QCOMPARE(layout.lines.size(), static_cast<std::size_t>(lines.size()));
        for (std::size_t i = 0; i < layout.lines.size(); ++i) {
            QCOMPARE(layout.lines[i].text, lines[static_cast<qsizetype>(i)].toObject()["text"].toString());
        }
        QVERIFY(std::abs(box.x - expected["x"].toDouble()) < 0.1);
        QVERIFY(std::abs(box.y - expected["y"].toDouble()) < 0.1);
        QVERIFY(std::abs(box.width - expected["width"].toDouble()) < 0.1);
        QVERIFY(std::abs(box.height - expected["height"].toDouble()) < 0.1);
    }
    void unchangedInputsReuseRaster() {
        nt::render2d::RasterCache cache;
        auto layer = layerFor(references()["cases"].toArray().first().toObject());
        const auto first = cache.imageFor(layer).cacheKey();
        QVERIFY(first != 0);
        layer.clipTimeMs += 500;
        layer.sourceTimeMs += 500;
        layer.opacity = 0.5;
        layer.ext.insert("compositorOnly", QJsonObject{{"amount", 0.5}});
        QCOMPARE(cache.imageFor(layer).cacheKey(), first);
        QCOMPARE(cache.rasterCount(), 1);
        layer.ext.insert("textStyle", QJsonObject{{"text", "changed"}, {"fontSizePx", 30}, {"color", "#ffffff"}});
        QVERIFY(cache.imageFor(layer).cacheKey() != first);
        QCOMPARE(cache.rasterCount(), 2);
    }
};
QTEST_MAIN(TestRender2d)
#include "tst_render2d.moc"
