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
        const auto convert = [](int axis, int position) {
            std::array<uint8_t, width * height * 4> rgb{};
            std::array<std::array<uint8_t, width * height>, 3> output{};
            for (int y = 0; y < height; ++y) {
                for (int x = 0; x < width; ++x) {
                    rgb[(y * width + x) * 4 + 2] = (axis ? y : x) == position ? 255 : 0;
                    rgb[(y * width + x) * 4 + 3] = 255;
                }
            }
            std::unique_ptr<SwsContext, decltype(&sws_freeContext)> scale(sws_getContext(
                width, height, AV_PIX_FMT_RGBA, width, height, AV_PIX_FMT_YUV420P,
                SWS_BICUBIC, nullptr, nullptr, nullptr), sws_freeContext);
            if (!scale || sws_setColorspaceDetails(scale.get(), sws_getCoefficients(SWS_CS_ITU709), 1,
                sws_getCoefficients(SWS_CS_ITU709), 0, 0, 1 << 16, 1 << 16) < 0) {
                qFatal("Cannot initialize legacy conversion probe");
            }
            const std::array<const uint8_t*, 4> input{rgb.data(), nullptr, nullptr, nullptr};
            const std::array<int, 4> inputStride{width * 4, 0, 0, 0};
            const std::array<uint8_t*, 4> planes{output[0].data(), output[1].data(), output[2].data(), nullptr};
            const std::array<int, 4> stride{width, width / 2, width / 2, 0};
            if (sws_scale(scale.get(), input.data(), inputStride.data(), 0, height,
                          planes.data(), stride.data()) != height) { qFatal("Incomplete conversion"); }
            return output;
        };
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
