// Fade curves (PLAN M3 exit 5): the C++ port of audioFade.ts against vectors
// that scripts/fade-vectors.mjs samples from the TypeScript functions. The
// ctest fixture `fade_vectors` writes the file before this test runs.

#include "audio/FadeCurves.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtTest>

#include <cmath>

using namespace nt::audio;

class TstFadeCurves : public QObject {
    Q_OBJECT

    QJsonObject m_vectors;
    static constexpr double kTol = 1e-6;

private slots:
    void initTestCase() {
        const QString path = qEnvironmentVariable("NT_FADE_VECTORS", QStringLiteral(NT_BUILD_DIR "/fade-vectors.json"));
        QFile f(path);
        QVERIFY2(f.open(QIODevice::ReadOnly), qPrintable(QStringLiteral("no vectors at %1: run scripts/fade-vectors.mjs").arg(path)));
        m_vectors = QJsonDocument::fromJson(f.readAll()).object();
        QVERIFY(m_vectors.value(u"count").toInt() > 0);
    }

    void shapeGain() {
        int compared = 0;
        double worst = 0.0;
        for (const QJsonValue& sv : m_vectors.value(u"shapes").toArray()) {
            const QJsonObject s = sv.toObject();
            const FadeShape shape = parseFadeShape(s.value(u"shape").toString().toStdString());
            for (const QJsonValue& pv : s.value(u"points").toArray()) {
                const QJsonArray p = pv.toArray();
                const double err = std::abs(fadeShapeGain(shape, p[0].toDouble()) - p[1].toDouble());
                worst = std::max(worst, err);
                QVERIFY2(err <= kTol, qPrintable(QStringLiteral("%1 t=%2: %3 vs %4").arg(s.value(u"shape").toString())
                                                     .arg(p[0].toDouble()).arg(fadeShapeGain(shape, p[0].toDouble()))
                                                     .arg(p[1].toDouble())));
                ++compared;
            }
            QCOMPARE(fadeShapeGain(shape, std::nan("")), s.value(u"nanGain").toDouble());
        }
        qInfo("fadeShapeGain: %d values, max error %.3g", compared, worst);
        QVERIFY(compared >= 4 * 1001);
    }

    void clipGain() {
        int compared = 0;
        for (const QJsonValue& cv : m_vectors.value(u"clips").toArray()) {
            const QJsonObject c = cv.toObject();
            const QJsonObject clip = c.value(u"clip").toObject();
            const double duration = clip.value(u"durationMs").toDouble();
            const ResolvedFades fades = resolveClipFades(
                clip.value(u"fadeInMs").toDouble(), clip.value(u"fadeOutMs").toDouble(),
                parseFadeShape(clip.value(u"fadeInShape").toString().toStdString()),
                parseFadeShape(clip.value(u"fadeOutShape").toString().toStdString()), duration);
            const QJsonObject r = c.value(u"resolved").toObject();
            QCOMPARE(fades.fadeInMs, r.value(u"fadeInMs").toDouble());
            QCOMPARE(fades.fadeOutMs, r.value(u"fadeOutMs").toDouble());
            QCOMPARE(static_cast<int>(fades.fadeInShape),
                     static_cast<int>(parseFadeShape(r.value(u"fadeInShape").toString().toStdString())));
            QCOMPARE(static_cast<int>(fades.fadeOutShape),
                     static_cast<int>(parseFadeShape(r.value(u"fadeOutShape").toString().toStdString())));
            for (const QJsonValue& pv : c.value(u"points").toArray()) {
                const QJsonArray p = pv.toArray();
                const double got = clipFadeGain(fades, duration, p[0].toDouble());
                QVERIFY2(std::abs(got - p[1].toDouble()) <= kTol,
                         qPrintable(QStringLiteral("ms=%1: %2 vs %3").arg(p[0].toDouble()).arg(got).arg(p[1].toDouble())));
                ++compared;
            }
        }
        QVERIFY(compared > 0);
    }

    void dbGain() {
        QCOMPARE(dbToGain(0.0), 1.0);
        QVERIFY(std::abs(dbToGain(-6.0) - 0.5011872336272722) < 1e-12);
    }
};

QTEST_APPLESS_MAIN(TstFadeCurves)
#include "tst_fadecurves.moc"
