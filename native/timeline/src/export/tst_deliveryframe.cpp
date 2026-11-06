#include "export/DeliveryFrame.h"
#include <QtTest>
#include <set>
#include <array>
#include <memory>
extern "C" {
#include <libswscale/swscale.h>
}

using namespace nt::exporting::delivery;
class DeliveryFrameTest : public QObject {
    Q_OBJECT
private slots:
    void ditherTile() {
        std::set<double> ranks;
        double sum = 0;
        for (int y = 0; y < 8; ++y) {
            for (int x = 0; x < 8; ++x) { ranks.insert(dither(x,y)); sum += dither(x,y); }
        }
        QCOMPARE(ranks.size(), size_t(64));
        QCOMPARE(sum, 0.0);
        for (int step = 0; step <= 25500; ++step) {
            const double code = step / 100.0;
            double bias = 0;
            for (int y = 0; y < 8; ++y) {
                for (int x = 0; x < 8; ++x) {
                    const double error = quantize(code,x,y) - code;
                    QVERIFY(std::abs(error) <= 1);
                    bias += error;
                    QCOMPARE(quantize(code,x,y), quantize(code,x+8,y+8));
                }
            }
            QVERIFY(std::abs(bias / 64) < 0.1);
        }
    }
    void legacyChromaFilter() {
        constexpr int width = 16, height = 16;
        const auto convert = [](int axis, int position, bool wide = false, int channel = 2) {
            std::array<uint8_t, width * height * 4> rgb{};
            std::array<std::array<uint8_t, width * height>, 3> output{};
            std::array<uint16_t, width * height * 4> rgb16{};
            std::array<std::array<uint16_t, width * height>, 3> planes16{};
            for (int y = 0; y < height; ++y) {
                for (int x = 0; x < width; ++x) {
                    rgb[(y * width + x) * 4 + channel] = (axis ? y : x) == position ? 255 : 0;
                    rgb[(y * width + x) * 4 + 3] = 255;
                }
            }
            for (size_t i = 0; i < rgb.size(); ++i) { rgb16[i] = rgb[i] * 257; }
            std::unique_ptr<SwsContext, decltype(&sws_freeContext)> scale(sws_getContext(
                width, height, wide ? AV_PIX_FMT_RGBA64 : AV_PIX_FMT_RGBA, width, height, wide ? AV_PIX_FMT_YUV420P16 : AV_PIX_FMT_YUV420P,
                SWS_BICUBIC, nullptr, nullptr, nullptr), sws_freeContext);
            if (!scale || sws_setColorspaceDetails(scale.get(), sws_getCoefficients(SWS_CS_ITU709), 1,
                sws_getCoefficients(SWS_CS_ITU709), 0, 0, 1 << 16, 1 << 16) < 0) {
                qFatal("Cannot initialize legacy conversion probe");
            }
            const std::array<const uint8_t*, 4> input{wide ? reinterpret_cast<const uint8_t*>(rgb16.data()) : rgb.data(), nullptr, nullptr, nullptr};
            const std::array<int, 4> inputStride{width * (wide ? 8 : 4), 0, 0, 0};
            const std::array<uint8_t*, 4> planes{wide ? reinterpret_cast<uint8_t*>(planes16[0].data()) : output[0].data(), wide ? reinterpret_cast<uint8_t*>(planes16[1].data()) : output[1].data(), wide ? reinterpret_cast<uint8_t*>(planes16[2].data()) : output[2].data(), nullptr};
            const std::array<int, 4> stride{width * (wide ? 2 : 1), wide ? width : width / 2, wide ? width : width / 2, 0};
            if (sws_scale(scale.get(), input.data(), inputStride.data(), 0, height,
                          planes.data(), stride.data()) != height) { qFatal("Incomplete conversion"); }
            if (wide) {
                for (int plane = 0; plane < 3; ++plane) {
                    const int w = plane ? width / 2 : width;
                    quantizePlane(planes[plane], stride[plane], output[plane].data(), w, w, plane ? height / 2 : height);
                }
            }
            return output;
        };
        for (int axis = 0; axis < 2; ++axis) {
            for (int position = 0; position < 16; ++position) {
                for (int channel = 0; channel < 3; ++channel) {
                    const auto legacy = convert(axis, position, false, channel);
                    const auto wide = convert(axis, position, true, channel);
                    for (int plane = 0; plane < 3; ++plane) {
                        for (int i = 0; i < (plane ? width * height / 4 : width * height); ++i) {
                            QVERIFY(std::abs(int(legacy[plane][i]) - int(wide[plane][i])) <= 1);
                        }
                    }
                }
            }
        }
        const auto horizontal = convert(0, 4);
        QCOMPARE(horizontal[1][2], uint8_t(184));
        QCOMPARE(horizontal[1][1], uint8_t(128));
        QCOMPARE(horizontal[1][3], uint8_t(128));
        const auto vertical = convert(1, 4);
        // A 2x2 box would yield neutral chroma in rows 1 and 3. The existing
        // route has positive and negative support outside that box.
        QVERIFY(vertical[1][1 * width / 2] > 128);
        QVERIFY(vertical[1][3 * width / 2] < 128);
        QCOMPARE(vertical[0][4 * width], uint8_t(32)); // limited BT.709 blue luma
    }
    void stagingQuantization() {
        QImage image(8, 8, QImage::Format_RGBA32FPx4);
        image.fill(QColor::fromRgbF(0.12345, 0.5, 1.0, 1.0));
        const auto staged = rgba64(image);
        QCOMPARE(staged.format(), QImage::Format_RGBA64);
        const auto* source = reinterpret_cast<const float*>(image.constBits());
        const auto* wide = reinterpret_cast<const uint16_t*>(staged.constBits());
        for (int c = 0; c < 4; ++c) {
            QVERIFY(std::abs(wide[c] / 65535.0 - source[c]) <= 1.0 / 65535);
        }
        std::array<uint16_t, 64> plane;
        std::array<uint8_t, 64> bytes;
        std::set<int> sums;
        for (int fraction = 0; fraction <= 64; ++fraction) {
            plane.fill(16 * 256 + fraction * 4);
            quantizePlane(reinterpret_cast<const uint8_t*>(plane.data()), 16, bytes.data(), 8, 8, 8);
            int sum = 0;
            for (const auto value : bytes) { sum += value; }
            QCOMPARE(sum, 16 * 64 + fraction);
            sums.insert(sum);
        }
        QCOMPARE(sums.size(), size_t(65));
    }
    void alphaAndPng() {
        QImage image(8,8,QImage::Format_RGBA32FPx4_Premultiplied);
        image.fill(Qt::transparent);
        auto* p = reinterpret_cast<float*>(image.bits());
        p[0] = 0.75f; // Undefined hidden colour at zero alpha must not escape.
        p[4] = 0.0001f * 0.3f; p[5] = 0.0001f * 0.7f; p[7] = 0.0001f;
        const auto original = image.copy();
        const auto straight = straightFloat(image);
        QCOMPARE(image, original);
        const auto* s = reinterpret_cast<const float*>(straight.constBits());
        QCOMPARE(s[0], 0.f);
        QVERIFY(std::abs(s[4] - 0.3f) < 1e-6f);
        QVERIFY(std::abs(s[5] - 0.7f) < 1e-6f);
        const auto bytes = rgba8(straight);
        QCOMPARE(bytes.pixelColor(0,0).alpha(),0);
        QCOMPARE(bytes.pixelColor(1,0).alpha(),0);
        QTemporaryDir directory;
        const auto path = directory.filePath("frame.png");
        QVERIFY(bytes.save(path));
        QCOMPARE(QImage(path).convertToFormat(QImage::Format_RGBA8888),bytes);
    }
    void pngConstantPatches() {
        QTemporaryDir directory;
        for (float code : {0.f, 0.1f, 1.5f, 31.37f, 127.9f, 254.8f, 255.f}) {
            QImage image(8, 8, QImage::Format_RGBA32FPx4);
            for (int y = 0; y < 8; ++y) {
                auto* row = reinterpret_cast<float*>(image.scanLine(y));
                for (int x = 0; x < 8; ++x) {
                    row[4*x] = row[4*x+1] = row[4*x+2] = code / 255.f;
                    row[4*x+3] = 1;
                }
            }
            const auto before = image.copy();
            const auto bytes = rgba8(image);
            QCOMPARE(image, before);
            QCOMPARE(rgba8(image), bytes);
            const auto path = directory.filePath("patch.png");
            QVERIFY(bytes.save(path));
            const QImage decoded(path);
            double bias = 0;
            for (int y = 0; y < 8; ++y) {
                for (int x = 0; x < 8; ++x) {
                    const auto pixel = decoded.pixelColor(x,y);
                    QCOMPARE(pixel.alpha(), 255);
                    QCOMPARE(pixel.red(), pixel.green());
                    QCOMPARE(pixel.red(), pixel.blue());
                    const double error = pixel.red() - code;
                    QVERIFY(std::abs(error) <= 1);
                    bias += error;
                }
            }
            QVERIFY(std::abs(bias / 64) < 0.1);
        }
    }
    void spatialFloatResampling_data() {
        QTest::addColumn<QSize>("target");
        QTest::addColumn<QString>("mode");
        QTest::addColumn<QSize>("scaledSize");
        QTest::addColumn<QPoint>("offset");
        QTest::newRow("fit-up") << QSize(16,16) << QStringLiteral("fit")
            << QSize(16,8) << QPoint(0,4);
        QTest::newRow("fill-up") << QSize(16,16) << QStringLiteral("fill")
            << QSize(32,16) << QPoint(-8,0);
        QTest::newRow("fit-down") << QSize(4,4) << QStringLiteral("fit")
            << QSize(4,2) << QPoint(0,1);
        QTest::newRow("fill-down") << QSize(2,2) << QStringLiteral("fill")
            << QSize(4,2) << QPoint(-1,0);
    }
    void spatialFloatResampling() {
        QFETCH(QSize, target);
        QFETCH(QString, mode);
        QFETCH(QSize, scaledSize);
        QFETCH(QPoint, offset);
        QImage source(8,4,QImage::Format_RGBA32FPx4);
        const auto sample = [](int x, int y, int c) -> double {
            if (c == 3) { return 1.0; }
            // Non-byte values and asymmetric spatial/channel impulses expose
            // early quantization, wrong orientation and incorrect filter support.
            return 0.123456 + ((x * x + 7 * y + 11 * c + x * y) % 29) / 64.0;
        };
        for (int y = 0; y < source.height(); ++y) {
            auto* row = reinterpret_cast<float*>(source.scanLine(y));
            for (int x = 0; x < source.width(); ++x) {
                for (int c = 0; c < 4; ++c) { row[4*x+c] = sample(x,y,c); }
            }
        }
        const auto before = source.copy();
        const auto actual = resample(source, target, mode, true);
        QCOMPARE(source, before);
        QCOMPARE(actual.size(), target);
        QCOMPARE(actual.format(), QImage::Format_RGBA32FPx4);
        // Explicit fixture geometry above, area averages below for shrinking,
        // and pixel-center bilinear interpolation for enlargement. The oracle
        // never calls QImage scaling or delivery conversion helpers.
        for (int y = 0; y < target.height(); ++y) {
            const auto* row = reinterpret_cast<const float*>(actual.constScanLine(y));
            for (int x = 0; x < target.width(); ++x) {
                const int sx = x - offset.x(), sy = y - offset.y();
                for (int c = 0; c < 4; ++c) {
                    double expected = c == 3 ? 1.0 : 0.0;
                    if (sx >= 0 && sx < scaledSize.width() && sy >= 0 && sy < scaledSize.height()) {
                        if (scaledSize.width() < source.width()) {
                            const int factor = source.width() / scaledSize.width();
                            expected = 0;
                            for (int dy = 0; dy < factor; ++dy) {
                                for (int dx = 0; dx < factor; ++dx) {
                                    expected += sample(sx * factor + dx, sy * factor + dy, c);
                                }
                            }
                            expected /= factor * factor;
                        } else {
                            const double px = std::clamp((sx + 0.5) * source.width() / scaledSize.width() - 0.5,
                                                         0.0, double(source.width()-1));
                            const double py = std::clamp((sy + 0.5) * source.height() / scaledSize.height() - 0.5,
                                                         0.0, double(source.height()-1));
                            const int x0 = int(std::floor(px)), y0 = int(std::floor(py));
                            const int x1 = std::min(x0+1, source.width()-1);
                            const int y1 = std::min(y0+1, source.height()-1);
                            const double fx = px-x0, fy = py-y0;
                            expected = (1-fy) * ((1-fx)*sample(x0,y0,c) + fx*sample(x1,y0,c))
                                + fy * ((1-fx)*sample(x0,y1,c) + fx*sample(x1,y1,c));
                        }
                    }
                    QVERIFY2(std::abs(row[4*x+c] - expected) < 1e-6,
                        qPrintable(QString("(%1,%2) channel %3: actual %4 expected %5")
                            .arg(x).arg(y).arg(c).arg(row[4*x+c],0,'g',12).arg(expected,0,'g',12)));
                }
            }
        }
    }
    void floatResampling() {
        QImage image(65,49,QImage::Format_RGBA32FPx4);
        for (int y=0;y<image.height();++y) {
            auto* p = reinterpret_cast<float*>(image.scanLine(y));
            for (int x=0;x<image.width();++x) {
                p[4*x]=p[4*x+1]=p[4*x+2]=0.123456f; p[4*x+3]=1;
            }
        }
        for (const auto size : {QSize(48,32),QSize(96,80),QSize(64,48)}) {
            for (const auto mode : {QStringLiteral("fit"),QStringLiteral("fill")}) {
                for (bool explicitSize : {false,true}) {
                    const auto scaled = resample(image,size,mode,explicitSize);
                    QCOMPARE(scaled.size(),size);
                    QCOMPARE(scaled.format(),QImage::Format_RGBA32FPx4);
                    const auto* center = reinterpret_cast<const float*>(scaled.constScanLine(size.height()/2));
                    QVERIFY(std::abs(center[4*(size.width()/2)]-0.123456f)<1e-6f);
                    QCOMPARE(center[4*(size.width()/2)+3],1.f);
                }
            }
        }
    }
};
QTEST_GUILESS_MAIN(DeliveryFrameTest)
#include "tst_deliveryframe.moc"
