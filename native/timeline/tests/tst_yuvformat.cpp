#include "preview/YuvFormat.h"

#include <QTest>

#include <cmath>

using namespace nt;

namespace {

bool near(const std::array<double, 3>& rgb, double r, double g, double b, double tol = 0.004) {
    return std::abs(rgb[0] - r) < tol && std::abs(rgb[1] - g) < tol && std::abs(rgb[2] - b) < tol;
}

}  // namespace

class TestYuvFormat : public QObject {
    Q_OBJECT

private slots:
    void limitedRangeBlackAndWhite() {
        for (YuvMatrix m : {YuvMatrix::Bt709, YuvMatrix::Bt601}) {
            QVERIFY(near(yuvToRgb(m, YuvRange::Limited, 16, 128, 128), 0, 0, 0));
            QVERIFY(near(yuvToRgb(m, YuvRange::Limited, 235, 128, 128), 1, 1, 1));
        }
    }

    void fullRangeBlackAndWhite() {
        QVERIFY(near(yuvToRgb(YuvMatrix::Bt709, YuvRange::Full, 0, 128, 128), 0, 0, 0, 0.003));
        QVERIFY(near(yuvToRgb(YuvMatrix::Bt709, YuvRange::Full, 255, 128, 128), 1, 1, 1, 0.003));
    }

    void bt709Red() {
        // 100% red in BT.709 limited: Y 63, Cb 102, Cr 240.
        QVERIFY(near(yuvToRgb(YuvMatrix::Bt709, YuvRange::Limited, 63, 102, 240), 1, 0, 0, 0.01));
    }

    void bt601Red() {
        // 100% red in BT.601 limited: Y 81, Cb 90, Cr 240.
        QVERIFY(near(yuvToRgb(YuvMatrix::Bt601, YuvRange::Limited, 81, 90, 240), 1, 0, 0, 0.01));
    }

    void matricesDiffer() {
        // The same code values decode differently under the two matrices.
        const auto a = yuvToRgb(YuvMatrix::Bt709, YuvRange::Limited, 81, 90, 240);
        const auto b = yuvToRgb(YuvMatrix::Bt601, YuvRange::Limited, 81, 90, 240);
        QVERIFY(std::abs(a[1] - b[1]) > 0.05);
    }

    void defaultMatrix() {
        QCOMPARE(defaultMatrixForHeight(720), YuvMatrix::Bt709);
        QCOMPARE(defaultMatrixForHeight(576), YuvMatrix::Bt601);
    }
};

QTEST_APPLESS_MAIN(TestYuvFormat)
#include "tst_yuvformat.moc"
