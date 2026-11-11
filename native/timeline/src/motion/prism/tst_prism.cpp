#include "preview/FfmpegSource.h"

extern "C" {
#include <libavutil/frame.h>
}

#include <QElapsedTimer>
#include <QImage>
#include <QTest>
#include <QThread>

#include <algorithm>

class PrismSourceTest : public QObject {
    Q_OBJECT
private slots:
    void jpegPreservesFullChroma() {
        const QString path = QStringLiteral(NT_PRISM_FIXTURES "/chroma-444.jpg");
        const QImage reference = QImage(path).convertToFormat(QImage::Format_RGBA8888);
        QVERIFY(!reference.isNull());
        nt::FfmpegDecoder decoder(path.toStdString(), 0.0, nt::DecodeMode::Software);
        QElapsedTimer timer;
        timer.start();
        std::shared_ptr<nt::DecodedFrame> frame;
        while (timer.elapsed() < 4000) {
            frame = decoder.frameAt(0.0);
            if (frame && decoder.exact()) {
                break;
            }
            QThread::msleep(2);
        }
        QVERIFY(frame);
        QCOMPARE(frame->width, reference.width());
        QCOMPARE(frame->height, reference.height());
        double squaredError = 0;
        for (int y = 0; y < reference.height(); ++y) {
            const auto* actual = frame->frame->data[0] + y * frame->frame->linesize[0];
            const auto* expected = reference.constScanLine(y);
            for (int x = 0; x < reference.width(); ++x) {
                for (int channel = 0; channel < 3; ++channel) {
                    double value = 0;
                    if (frame->layout == nt::PlaneLayout::Rgba) {
                        value = actual[x * 4 + channel];
                    } else {
                        QCOMPARE(frame->layout, nt::PlaneLayout::I420);
                        const auto* decoded = frame->frame;
                        const auto rgb = nt::yuvToRgb(frame->matrix, frame->range,
                            decoded->data[0][y * decoded->linesize[0] + x],
                            decoded->data[1][(y / 2) * decoded->linesize[1] + x / 2],
                            decoded->data[2][(y / 2) * decoded->linesize[2] + x / 2]);
                        value = std::clamp(rgb[static_cast<std::size_t>(channel)] * 255.0, 0.0, 255.0);
                    }
                    const double error = value - expected[x * 4 + channel];
                    squaredError += error * error;
                }
                if (frame->layout == nt::PlaneLayout::Rgba) {
                    QCOMPARE(actual[x * 4 + 3], uint8_t(255));
                }
            }
        }
        const double mse = squaredError / (reference.width() * reference.height() * 3);
        QVERIFY2(mse < 6.5025, qPrintable(QStringLiteral("JPEG RGB PSNR below 40 dB: MSE %1").arg(mse)));
        QCOMPARE(frame->layout, nt::PlaneLayout::Rgba);
    }
};
QTEST_GUILESS_MAIN(PrismSourceTest)
#include "tst_prism.moc"
