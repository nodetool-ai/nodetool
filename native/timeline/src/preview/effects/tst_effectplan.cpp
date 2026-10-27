#include "preview/effects/ClipEffects.h"
#include <QtTest>
#include <cmath>
using namespace nt::effects;
namespace {
QJsonObject effect(const char *type) { return {{"type", type}, {"enabled", true}}; }
QJsonArray points(std::initializer_list<std::pair<double, double>> values) {
    QJsonArray result;
    for (const auto &[x, y] : values) {
        result.append(QJsonObject{{"x", x}, {"y", y}});
    }
    return result;
}
} // namespace
class TestEffectPlan : public QObject {
    Q_OBJECT
  private slots:
    void cube() {
        QCOMPARE(cubeHalfBits(0.f), std::uint16_t{0});
        QCOMPARE(cubeHalfBits(1.f), std::uint16_t{0x3c00});
        QCOMPARE(cubeHalfBits(1.f + 1.f / 2048), std::uint16_t{0x3c01});
        QCOMPARE(cubeHalfBits(-1.f), std::uint16_t{0xbc00});
        QCOMPARE(cubeHalfBits(1e10f), std::uint16_t{0x7bff});
        QString text = "TITLE test\n# red-fastest\nLUT_3D_SIZE 2\nDOMAIN_MIN -1 0 0\nDOMAIN_MAX 1 1 2\n";
        for (int b = 0; b < 2; ++b) {
            for (int g = 0; g < 2; ++g) {
                for (int r = 0; r < 2; ++r) {
                    text += QString("%1 %2 %3\n").arg(r).arg(g).arg(b);
                }
            }
        }
        const auto lut = parseCube(text);
        QVERIFY(lut);
        QCOMPARE(lut->size, 2);
        QCOMPARE(lut->rgb.size(), size_t{24});
        QCOMPARE(lut->minimum[0], -1.f);
        QCOMPARE(lut->maximum[2], 2.f);
        QCOMPARE(lut->rgb[3], 1.f);
        QCOMPARE(lut->rgb[4], 0.f);
        QCOMPARE(lut->rgb[14], 1.f);
        QVERIFY(!parseCube(text + "1 1 1\n"));
        QVERIFY(!parseCube("LUT_3D_SIZE 65\n"));
        QVERIFY(!parseCube("LUT_1D_SIZE 2\n"));
        QVERIFY(!parseCube(QString(text).replace("DOMAIN_MAX 1 1 2", "DOMAIN_MAX -1 1 2")));
        QVERIFY(!parseCube(QString(text).replace("0 0 0\n", "nan 0 0\n")));
    }
    void curves() {
        const auto identity = fitCurve(points({{0, 0}, {1, 1}}));
        QVERIFY(std::abs(identity.midtones) < 1e-12);
        QVERIFY(std::abs(identity.shadows) < 1e-12);
        const auto remap = fitCurve(points({{1, 1}, {0.2, 0}, {0.8, 1}, {0, 0}}));
        QCOMPARE(remap.black, 0.2);
        QCOMPARE(remap.white, 0.8);
        QVERIFY(channelMidtones(points({{0, 0}, {0.5, 0.75}, {1, 1}})) > 1);
        QCOMPARE(fitCurve({}).white, 1.0);
    }
    void orderAndAggregation() {
        auto a = effect("color");
        a.insert("brightness", 0.25);
        a.insert("contrast", 2);
        auto b = a;
        b.insert("brightness", 0.5);
        auto blur = effect("blur");
        blur.insert("radius", 180);
        auto pixel = effect("pixelate");
        pixel.insert("cellSize", 42);
        auto poster = effect("posterize");
        poster.insert("levels", 3);
        auto disabled = effect("lensDistortion");
        disabled.insert("enabled", false);
        const auto chain = planChain({a, blur, pixel, b, poster, disabled, blur});
        QCOMPARE(chain.size(), size_t{5});
        QCOMPARE(chain[0].op, Op::Pixelate);
        QCOMPARE(chain[0].params[0], 42.f);
        QCOMPARE(chain[1].op, Op::Posterize);
        QCOMPARE(chain[2].op, Op::Grade);
        QCOMPARE(chain[2].params[0], 0.75f);
        QCOMPARE(chain[2].params[1], 4.f);
        QCOMPARE(chain[3].op, Op::Gaussian);
        QCOMPARE(chain[3].params[0], 256.f);
        QCOMPARE(chain[3].params[2], 1.f);
        QCOMPARE(chain[4].params[3], 1.f);
        QVERIFY(planChain({effect("color"), disabled}).empty());
    }
    void parameters_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<int>("op");
        for (const auto &[type, op] :
             std::initializer_list<std::pair<const char *, Op>>{{"pixelate", Op::Pixelate},
                                                                {"posterize", Op::Posterize},
                                                                {"directionalBlur", Op::Gaussian},
                                                                {"lensDistortion", Op::Spherize},
                                                                {"vignette", Op::Vignette},
                                                                {"sharpen", Op::Sharpen},
                                                                {"chromaKey", Op::ChromaKey},
                                                                {"curves", Op::Curves},
                                                                {"levels", Op::Levels},
                                                                {"liftGammaGain", Op::LiftGammaGain},
                                                                {"grain", Op::Grain},
                                                                {"lut", Op::Lut},
                                                                {"glow", Op::Threshold},
                                                                {"dropShadow", Op::AlphaMask}}) {
            QTest::newRow(type) << QString(type) << int(op);
        }
    }
    void parameters() {
        QFETCH(QString, type);
        QFETCH(int, op);
        QJsonObject e{{"type", type}, {"enabled", true}, {"radius", 24},    {"angle", 90},    {"amount", 0.8},
                      {"seed", 123},  {"animate", true}, {"outBlack", 0.1}, {"outWhite", 0.8}};
        const auto chain = planChain({e});
        QVERIFY(!chain.empty());
        QCOMPARE(int(chain[0].op), op);
        const auto &v = chain[0].params;
        if (type == "pixelate") {
            QCOMPARE(v[0], 8.f);
        }
        if (type == "posterize") {
            QCOMPARE(v[0], 4.f);
        }
        if (type == "lensDistortion") {
            QCOMPARE(v[0], 0.8f);
        }
        if (type == "vignette") {
            QCOMPARE(v[0], 0.8f);
            QCOMPARE(v[1], 24.f);
            QCOMPARE(v[2], 0.5f);
        }
        if (type == "sharpen") {
            QCOMPARE(v[0], 0.8f);
            QCOMPARE(v[1], 0.f);
        }
        if (type == "chromaKey") {
            QCOMPARE(v[0], 0.f);
            QCOMPARE(v[4], 0.1f);
            QCOMPARE(v[5], 0.5f);
        }
        if (type == "curves") {
            QCOMPARE(v[0], 0.f);
            QCOMPARE(v[1], 1.f);
            QCOMPARE(v[3], 0.f);
        }
        if (type == "levels") {
            QCOMPARE(v[1], 1.f);
            QCOMPARE(v[2], 1.f);
            QCOMPARE(chain[1].params[0], 0.7f);
        }
        if (type == "liftGammaGain") {
            QCOMPARE(v[0], 0.f);
            QCOMPARE(v[4], 1.f);
            QCOMPARE(v[8], 1.f);
        }
        if (type == "lut") {
            QCOMPARE(v[0], 1.f);
        }
        if (type == "glow") {
            QCOMPARE(v[0], 0.7f);
            QCOMPARE(chain[1].params[0], 24.f);
            QCOMPARE(chain[3].op, Op::Add);
        }
        if (type == "dropShadow") {
            QCOMPARE(chain[1].params[0], 0.f);
            QCOMPARE(chain[3].op, Op::Shadow);
        }
        if (type == "grain") {
            QCOMPARE(chain[0].params[3], 123.f);
        }
        if (type == "directionalBlur") {
            QVERIFY(std::abs(chain[0].params[2]) < 1e-6);
            QCOMPARE(chain[0].params[3], 1.f);
        }
        if (type == "levels") {
            QCOMPARE(chain.size(), size_t{2});
            QCOMPARE(chain[1].op, Op::Cdl);
        }
        if (type == "glow" || type == "dropShadow") {
            QCOMPARE(chain.size(), size_t{4});
        }
    }
    void marginAndCrop() {
        auto glow = effect("glow");
        glow.insert("radius", 10.2);
        auto shadow = effect("dropShadow");
        shadow.insert("blur", 8);
        shadow.insert("offsetX", -16);
        const auto margin = chainOutset({glow, shadow});
        QCOMPARE(margin, QMargins(71, 71, 71, 71));
        shadow.insert("enabled", false);
        QCOMPARE(chainOutset({shadow}), QMargins());
        const QJsonObject ext{{"effectSourceRect", QJsonArray{0.251, 0.2, 0.5, 0.5}}};
        QCOMPARE(cropPixels(ext, {100, 80}), QRect(25, 16, 50, 40));
        QCOMPARE(cropPixels({}, {100, 80}), QRect(0, 0, 100, 80));
    }
    void decorator() {
        nt::Clip clip;
        auto e = effect("grain");
        e.insert("seed", 19);
        e.insert("animate", true);
        auto disabled = e;
        disabled.insert("enabled", false);
        clip.raw.insert("effects", QJsonArray{e, disabled});
        QJsonObject ext;
        decorateEffects(ext, clip);
        const auto copied = ext.value("clipEffects").toArray();
        QCOMPARE(copied.size(), 1);
        QCOMPARE(copied[0].toObject().value("seed").toInt(), 19);
    }
};
QTEST_GUILESS_MAIN(TestEffectPlan)
#include "tst_effectplan.moc"
