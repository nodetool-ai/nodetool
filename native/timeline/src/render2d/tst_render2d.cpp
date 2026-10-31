#include "model/TimelineJson.h"
#include "preview/layers/LayerRegistry.h"
#include "preview/layers/SceneHooks.h"
#include "render2d/Rasterizer.h"
#include "render2d/Paint.h"
#include <QFile>
#include <QDir>
#include <QScopeGuard>
#include <QTemporaryDir>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#include <QRawFont>
#include <QTextLayout>
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
    void fallbackEmojiKeepsColor() {
        nt::ActiveLayer layer;
        layer.kind = "text";
        layer.sourceWidth = 256;
        layer.sourceHeight = 128;
        layer.ext.insert("textStyle", QJsonObject{{"text", QString::fromUtf8("😀")},
                         {"fontFamily", "Inter"}, {"fontSizePx", 64}, {"color", "#ffffff"}});
        const auto image = nt::render2d::rasterize(layer);
        int colored = 0;
        for (int y = 0; y < image.height(); ++y) {
            for (int x = 0; x < image.width(); ++x) {
                const auto color = image.pixelColor(x, y);
                if (color.alpha() > 128 && std::abs(color.red() - color.blue()) > 32) {
                    ++colored;
                }
            }
        }
        QVERIFY2(colored > 100, "Emoji lost its intrinsic color or was replaced by a missing glyph");
    }
    void fallbackTextMeasurement() {
        nt::scene::TextStyle style;
        style.fontFamily = "Inter";
        style.fontSizePx = 48;
        const auto measure = nt::render2d::textMeasurer();
        // Load the bundled primary face before asking Qt for fallback runs.
        measure(QStringLiteral("A"), style);
        QFont font;
        font.setFamilies({QStringLiteral("Inter")});
        font.setPointSizeF(36);
        font.setHintingPreference(QFont::PreferVerticalHinting);
        const auto text = QString::fromUtf8("Hello مرحبا");
        QTextLayout layout(text, font);
        layout.beginLayout();
        auto line = layout.createLine();
        layout.endLayout();
        const double expected = line.naturalTextWidth();
        QVERIFY2(std::abs(measure(text, style) - expected) < 0.02,
                 qPrintable(QString("fallback advance %1 expected %2").arg(measure(text, style)).arg(expected)));
    }
    void bundledInterWeights_data() {
        QTest::addColumn<QString>("family");
        QTest::addColumn<int>("weight");
        QTest::addColumn<QString>("file");
        for (const auto& family : {QString(), QStringLiteral("Inter"), QStringLiteral("\"Inter\", sans-serif")}) {
            for (const int weight : {600, 700, 800, 900}) {
                QTest::newRow(qPrintable(QString("%1-%2").arg(family).arg(weight)))
                    << family << weight << QString(weight == 600 ? "Inter-SemiBold.ttf" : "Inter-ExtraBold.ttf");
            }
        }
    }
    void bundledInterWeights() {
        QFETCH(QString, family);
        QFETCH(int, weight);
        QFETCH(QString, file);
        nt::scene::TextStyle style;
        style.fontFamily = family;
        style.fontWeight = weight;
        style.fontSizePx = 156;
        const auto directory = nt::render2d::resolveFontDirectory(QGuiApplication::applicationDirPath());
        const QRawFont face(directory + u'/' + file, style.fontSizePx, QFont::PreferNoHinting);
        QVERIFY(face.isValid());
        // Digits have no pair positioning here. Design advances from the
        // shipped static face detect a platform matcher choosing variable 700.
        const auto text = QStringLiteral("4218306");
        const auto glyphs = face.glyphIndexesForString(text);
        const auto advances = face.advancesForGlyphIndexes(glyphs, QRawFont::UseDesignMetrics);
        double expected = 0;
        for (const auto& advance : advances) {
            expected += advance.x();
        }
        const auto actual = nt::render2d::textMeasurer()(text, style);
        QVERIFY2(std::abs(actual - expected) < 0.1,
                 qPrintable(QString("bundled weight %1 advance %2 expected %3").arg(weight).arg(actual).arg(expected)));
    }
    void cssColors_data() {
        QTest::addColumn<QString>("css");
        QTest::addColumn<QColor>("expected");
        // Channel values from the shared TypeScript parseCssColor parser.
        QTest::newRow("rgb-percent") << QString("rgb(100% 0% 0% / 50%)") << QColor::fromRgbF(1,0,0,0.5);
        QTest::newRow("rgba-percent-alpha") << QString("rgba(255, 0, 0, 50%)") << QColor::fromRgbF(1,0,0,0.5);
        QTest::newRow("rgb-space") << QString("rgb(255 128 0)") << QColor::fromRgbF(1,128.0/255,0,1);
        QTest::newRow("hsl-comma") << QString("hsl(120, 100%, 50%)") << QColor::fromRgbF(0,1,0,1);
        QTest::newRow("hsl-deg") << QString("hsl(240deg 100% 50% / 0.25)") << QColor::fromRgbF(0,0,1,0.25);
        QTest::newRow("hsla") << QString("hsla(0, 100%, 50%, 0.5)") << QColor::fromRgbF(1,0,0,0.5);
        QTest::newRow("hsl-grad") << QString("hsl(400grad 1 0.5)") << QColor::fromRgbF(1,0,0,1);
        QTest::newRow("hsl-rad") << QString("hsl(3.141592653589793rad 100% 50%)") << QColor::fromRgbF(0,1,1,1);
        QTest::newRow("hsl-turn") << QString(" HSL(-.5turn 100% 50%) ") << QColor::fromRgbF(0,1,1,1);
        QTest::newRow("clamp-exponent") << QString("RGB(3e2 -1 0 / 150%)") << QColor::fromRgbF(1,0,0,1);
        QTest::newRow("numeric-bases") << QString("rgb(0xff 0b10000000 0o0 / .5)") << QColor::fromRgbF(1,128.0/255,0,0.5);
        QTest::newRow("mixed-separators") << QString("rgba(255, 0 0)") << QColor::fromRgbF(1,0,0,1);
        QTest::newRow("hsl-exponent") << QString("hsl(1.2e2 100% 50%)") << QColor::fromRgbF(0,1,0,1);
        QTest::newRow("empty-percentage") << QString("rgb(% 0 0)") << QColor::fromRgbF(0,0,0,1);
        QTest::newRow("hex-alpha") << QString("#ff000080") << QColor(255,0,0,128);
        QTest::newRow("short-hex-alpha") << QString("#f008") << QColor(255,0,0,136);
        QTest::newRow("named") << QString(" ReBeccAPurple ") << QColor(102,51,153);
        for (const auto* invalid : {"invalid", "rgb(1 2 3 / )", "rgb(0b2 0 0)", "rgb(inf 0 0)", "rgb(nan 0 0)", "hsl(120. 1 1)", "rgb(1 2 3 4 5)", "rgb(1x 2 3)", "hsl(1foo 1 1)", "rgb(1 2 3 / / 1)", "#123456789", "#zzzz", "#12345", "#123456789abc", "darkyellow"}) {
            QTest::newRow(invalid) << QString::fromLatin1(invalid) << QColor(Qt::transparent);
        }
    }
    void cssColors() {
        QFETCH(QString,css); QFETCH(QColor,expected);
        const auto actual = nt::render2d::cssColor(css);
        QVERIFY2(std::abs(actual.redF()-expected.redF()) < 0.0001, qPrintable(QString("red: %1 expected %2").arg(actual.redF()).arg(expected.redF())));
        QVERIFY2(std::abs(actual.greenF()-expected.greenF()) < 0.0001, qPrintable(QString("green: %1 expected %2").arg(actual.greenF()).arg(expected.greenF())));
        QVERIFY2(std::abs(actual.blueF()-expected.blueF()) < 0.0001, qPrintable(QString("blue: %1 expected %2").arg(actual.blueF()).arg(expected.blueF())));
        QVERIFY2(std::abs(actual.alphaF()-expected.alphaF()) < 0.0001, qPrintable(QString("alpha: %1 expected %2").arg(actual.alphaF()).arg(expected.alphaF())));
    }
    void fontDirectoryOrder() {
        QTemporaryDir layout; QVERIFY(layout.isValid());
        const auto saved = qgetenv("NODETOOL_TIMELINE_FONTS_DIR");
        const bool wasSet = qEnvironmentVariableIsSet("NODETOOL_TIMELINE_FONTS_DIR");
        const auto restore = qScopeGuard([&] {
            if (wasSet) { qputenv("NODETOOL_TIMELINE_FONTS_DIR",saved); }
            else { qunsetenv("NODETOOL_TIMELINE_FONTS_DIR"); }
        });
        qunsetenv("NODETOOL_TIMELINE_FONTS_DIR");
        const auto app = layout.path()+"/MacOS";
        QVERIFY(QDir().mkpath(app));
        const auto source = nt::render2d::resolveFontDirectory(app);
        QVERIFY(QDir(source).exists()); QVERIFY(QFile::exists(source+"/Inter-Variable.ttf"));
        const auto bundle = layout.path()+"/Resources/fonts";
        QVERIFY(QDir().mkpath(bundle));
        QCOMPARE(QDir::cleanPath(nt::render2d::resolveFontDirectory(app)),bundle);
        const auto adjacent = app+"/fonts"; QVERIFY(QDir().mkpath(adjacent));
        QCOMPARE(nt::render2d::resolveFontDirectory(app),adjacent);
        const auto overrideDir = layout.path()+"/override"; QVERIFY(QDir().mkpath(overrideDir));
        qputenv("NODETOOL_TIMELINE_FONTS_DIR",overrideDir.toUtf8());
        QCOMPARE(nt::render2d::resolveFontDirectory(app),overrideDir);
        qputenv("NODETOOL_TIMELINE_FONTS_DIR",(layout.path()+"/missing").toUtf8());
        QCOMPARE(nt::render2d::resolveFontDirectory(app),adjacent);
        qunsetenv("NODETOOL_TIMELINE_FONTS_DIR");
        QVERIFY(QDir(adjacent).removeRecursively()); QVERIFY(QDir(bundle).removeRecursively());
        QCOMPARE(nt::render2d::resolveFontDirectory(app),source);
    }
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
        const double threshold = fixture["minPsnr"].toDouble(35);
        QVERIFY2(score >= threshold, qPrintable(QString("%1 dB < %2").arg(score).arg(threshold)));
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
