#include "preview/effects/ClipEffects.h"
#include "preview/effects/EffectMasks.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtTest>

using namespace nt::effects;

class TestEffectMasks : public QObject {
    Q_OBJECT
  private slots:
    // The TS renderers write this fixture (packages/timeline/tests/effectMasks.test.ts).
    void matchesTypeScriptCoverage() {
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/effect-mask-coverage.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        const int w = fixture.value("outWidth").toInt(), h = fixture.value("outHeight").toInt();
        const auto coverage = effectMaskCoverage(fixture.value("masks").toArray(), fixture.value("sourceWidth").toInt(),
                                                 fixture.value("sourceHeight").toInt(), w, h,
                                                 fixture.value("originX").toInt(), fixture.value("originY").toInt());
        const auto expected = fixture.value("coverage").toArray();
        QCOMPARE(qsizetype(coverage.size()), expected.size());
        QCOMPARE(qsizetype(coverage.size()), qsizetype(w * h));
        int partial = 0;
        for (size_t i = 0; i < coverage.size(); ++i) {
            QVERIFY2(std::abs(coverage[i] - expected[qsizetype(i)].toDouble()) < 1e-5, qPrintable(QString::number(i)));
            partial += coverage[i] > 0.01 && coverage[i] < 0.99;
        }
        QVERIFY(partial > 10);
    }
    void inactiveMasksMeanEverywhere() {
        QVERIFY(effectMaskCoverage({}, 8, 8, 8, 8).empty());
        const QJsonArray disabled{QJsonObject{{"enabled", false}, {"vertices", QJsonArray{QJsonObject{{"x", 0}}, QJsonObject{{"x", 1}}}}}};
        QVERIFY(effectMaskCoverage(disabled, 8, 8, 8, 8).empty());
    }
    void maskedEffectsPlanInPlace() {
        const QJsonObject mask{{"id", "m"}, {"shape", "polygon"},
                               {"vertices", QJsonArray{QJsonObject{{"x", 0.2}, {"y", 0.2}}, QJsonObject{{"x", 0.8}, {"y", 0.2}},
                                                       QJsonObject{{"x", 0.5}, {"y", 0.8}}}}};
        const QJsonArray effects{
            QJsonObject{{"id", "a"}, {"type", "color"}, {"enabled", true}, {"brightness", 0.2}, {"masks", QJsonArray{mask}}},
            QJsonObject{{"id", "b"}, {"type", "color"}, {"enabled", true}, {"saturation", 0.5}},
            QJsonObject{{"id", "c"}, {"type", "sharpen"}, {"enabled", true}, {"amount", 1}, {"radius", 3}, {"masks", QJsonArray{mask}}}};
        const auto chain = planChain(effects);
        // Masked color in place, masked sharpen (two lows + combine) as one group, then the unmasked aggregate.
        QCOMPARE(chain.size(), size_t(5));
        QCOMPARE(chain[0].op, Op::Grade);
        QVERIFY(chain[0].maskStart);
        QCOMPARE(chain[0].masks.size(), 1);
        QCOMPARE(chain[0].params[0], 0.2f);
        QVERIFY(chain[1].maskStart);
        QVERIFY(chain[1].masks.isEmpty());
        QCOMPARE(chain[3].op, Op::SharpenCombine);
        QCOMPARE(chain[3].masks.size(), 1);
        QCOMPARE(chain[4].op, Op::Grade);
        QCOMPARE(chain[4].params[2], 0.5f);
        QVERIFY(!chain[4].maskStart && chain[4].masks.isEmpty());
    }
};

QTEST_GUILESS_MAIN(TestEffectMasks)
#include "tst_effectmasks.moc"
