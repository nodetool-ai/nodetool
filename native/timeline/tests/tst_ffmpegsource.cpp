// Decoder tests against the media from scripts/make-fixtures.sh: seeks land on
// the D17 frame (target between two frames, variable frame rate, superseded
// seek), the last frame stays at end of stream, and the D10a rejections.

#include "preview/FfmpegSource.h"
#include "preview/FrameCache.h"
#include "preview/SourcePool.h"
#include "preview/hw/HwInterop.h"

extern "C" {
#include <libavutil/frame.h>
#include <libavutil/hwcontext.h>
}

#if NT_HW_VIDEOTOOLBOX
#include <CoreVideo/CVPixelBuffer.h>
#endif
#include <QSet>
#include <QElapsedTimer>
#include <QTest>
#include <QThread>

#include <cmath>
#include <random>
#include <type_traits>

using namespace nt;

namespace {

std::string media(const char* name) {
    return std::string(NT_FIXTURES_DIR) + "/media/" + name;
}

// Calls frameAt like a render loop until the shown frame is the exact pick.
std::shared_ptr<DecodedFrame> waitExact(FfmpegDecoder& d, double target, int timeoutMs = 4000) {
    QElapsedTimer t;
    t.start();
    while (t.elapsed() < timeoutMs) {
        auto f = d.frameAt(target);
        if (f && d.exact()) return f;
        QThread::msleep(2);
    }
    return nullptr;
}

// The burnt-in barcode (scripts/make-fixtures.sh): bit k is the 80 px cell at
// x = 80k in the top 40 rows. A 640 px frame carries bits 0-7.
int barcode(const DecodedFrame& f) {
    const AVFrame* fr = f.frame;
    int value = 0;
    const int bits = std::min(16, fr->width / 80);
    for (int k = 0; k < bits; ++k) {
        const int x = 80 * k + 40;
        const int lum = fr->data[0][20 * fr->linesize[0] + x];
        if (lum > 128) value |= 1 << k;
    }
    return value;
}

// The barcode of a hardware frame, read back to the CPU (the test only; the
// app never maps hardware frames).
int hardwareBarcode(const DecodedFrame& f) {
#if !NT_HW_VIDEOTOOLBOX
    AVFrame* sw = av_frame_alloc();
    int value = 0;
    if (av_hwframe_transfer_data(sw, f.frame, 0) == 0) {
        for (int k = 0; k < std::min(16, sw->width / 80); ++k) {
            if (sw->data[0][20 * sw->linesize[0] + 80 * k + 40] > 128) value |= 1 << k;
        }
    }
    av_frame_free(&sw);
    return value;
#else
    auto pb = reinterpret_cast<CVPixelBufferRef>(f.frame->data[3]);
    CVPixelBufferLockBaseAddress(pb, kCVPixelBufferLock_ReadOnly);
    const auto* y = static_cast<const uint8_t*>(CVPixelBufferGetBaseAddressOfPlane(pb, 0));
    const size_t stride = CVPixelBufferGetBytesPerRowOfPlane(pb, 0);
    const int width = static_cast<int>(CVPixelBufferGetWidthOfPlane(pb, 0));
    int value = 0;
    for (int k = 0; k < std::min(16, width / 80); ++k) {
        if (y[20 * stride + static_cast<size_t>(80 * k + 40)] > 128) value |= 1 << k;
    }
    CVPixelBufferUnlockBaseAddress(pb, kCVPixelBufferLock_ReadOnly);
    return value;
#endif
}

// A test that decodes in hardware, or a data row that does ("hw", "auto").
bool needsHardware() {
    static const QSet<QByteArray> functions{"hardwareSeekBetweenFrames", "twelveHardwareSessions", "hardwareFallback",
                                            "importFailureFallsBackInAuto", "importFailureFailsTheClipInHardware",
                                            "sendErrorBeforeFirstFrameFallsBack", "hardwareSetupFailurePolicy",
                                            "hardwareDecodeIsNotStarvedByHeldFrames",
                                            "vaapiCacheCopyIsOwned"};
    const QByteArray tag(QTest::currentDataTag() ? QTest::currentDataTag() : "");
    return functions.contains(QTest::currentTestFunction()) || tag == "hw" || tag.contains(", hw") ||
           tag.contains(", auto");
}

// Sets the decode mode for one test and restores software after it.
struct ModeScope {
    explicit ModeScope(DecodeMode mode) { setDecodeMode(mode); }
    ~ModeScope() { setDecodeMode(DecodeMode::Software); }
};

}  // namespace

class TestFfmpegSource : public QObject {
    Q_OBJECT

private slots:
    // Each test starts with an empty scrub cache: a frame cached by an
    // earlier test would answer for its decoder and skip the path under test.
    void init() {
        FrameCache::shared().clear();
        // A build or a machine without hardware decode (NT_HW_NONE, a CI
        // runner with no GPU decoder: NT_NO_HW_DECODE=1) runs the software
        // tests only.
        if (needsHardware() && (std::string(hw::decoderName()) == "none" || qEnvironmentVariableIsSet("NT_NO_HW_DECODE"))) {
            QSKIP("no hardware decode in this build or on this machine");
        }
    }

    void rejections_data() {
        QTest::addColumn<QString>("file");
        QTest::addColumn<QString>("reason");
        QTest::newRow("rotation") << "reject-rotation.mp4" << "rotation";
        QTest::newRow("pixel aspect") << "reject-pixel-aspect.mp4" << "pixel-aspect";
        QTest::newRow("alpha") << "reject-alpha.mov" << "alpha";
        QTest::newRow("hdr") << "reject-hdr.mp4" << "hdr";
        QTest::newRow("usable") << "seek-360p30.mp4" << "";
    }
    void rejections() {
        QFETCH(QString, file);
        QFETCH(QString, reason);
        const MediaFacts f = probeMedia(media(qPrintable(file)));
        QVERIFY2(f.opened, f.error.c_str());
        QCOMPARE(QString::fromStdString(f.rejection), reason);
    }

    void missingFileFailsToOpen() {
        const MediaFacts f = probeMedia(media("does-not-exist.mp4"));
        QVERIFY(!f.opened);
        QVERIFY(!f.error.empty());
    }

    void targetBetweenTwoFrames() {
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        auto f = waitExact(d, 0.050);
        QVERIFY(f);
        QVERIFY(std::abs(f->ptsSec - 1.0 / 30.0) < 1e-6);
        QCOMPARE(barcode(*f), 1);
    }

    void sequentialStepsShowEveryFrame() {
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        for (int n = 0; n < 90; ++n) {
            auto f = waitExact(d, n / 30.0);
            QVERIFY2(f, qPrintable(QStringLiteral("frame %1").arg(n)));
            QCOMPARE(std::lround(f->ptsSec * 30.0), static_cast<long>(n));
            QCOMPARE(barcode(*f), n & 0xff);
        }
        QCOMPARE(d.seeks(), 1LL);  // only the initial pre-roll: playback decodes through
    }

    void seekForwardPastGapAndBack() {
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        QVERIFY(waitExact(d, 0.0));
        auto f = waitExact(d, 5.0);  // past the 1 s gap: a seek
        QVERIFY(f);
        QCOMPARE(std::lround(f->ptsSec * 30.0), 150L);
        QCOMPARE(barcode(*f), 150);
        f = waitExact(d, 2.51);  // backward: a seek
        QVERIFY(f);
        QCOMPARE(std::lround(f->ptsSec * 30.0), 75L);
        QCOMPARE(d.seeks(), 3LL);
    }

    void variableFrameRate() {
        FfmpegDecoder d(media("vfr-360p.mp4"), 0.0);
        // Frame 37 starts at 44/30 s, frame 38 at 46/30 s.
        auto f = waitExact(d, 1.5);
        QVERIFY(f);
        QVERIFY2(std::abs(f->ptsSec - 44.0 / 30.0) < 1e-3, qPrintable(QString::number(f->ptsSec)));
        QCOMPARE(barcode(*f), 37);
    }

    void supersededSeekLandsOnTheNewest() {
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        QVERIFY(waitExact(d, 0.0));
        d.frameAt(8.0);  // seek A, superseded before it lands
        auto f = waitExact(d, 3.0);  // seek B
        QVERIFY(f);
        QCOMPARE(std::lround(f->ptsSec * 30.0), 90L);
        QCOMPARE(barcode(*f), 90);
        // A frame of A may have painted first; the frame now is B's.
        QVERIFY(d.seeks() >= 2);
    }

    void endOfStreamKeepsLastFrame() {
        FfmpegDecoder d(media("seek-360p30.mp4"), 9.5);
        auto f = waitExact(d, 30.0);
        QVERIFY(f);
        QCOMPARE(std::lround(f->ptsSec * 30.0), 299L);
    }

    // F1: the pick and its exactness come from one queue snapshot. A worker
    // that adds frames between the two must not make a stale frame "exact".
    void staleFrameIsNotExact() {
        FfmpegDecoder d{FfmpegDecoder::NoWorkerForTest{}};
        d.testPush(0.233333);  // the newest frame decoded so far
        d.setTestHook([&d] {
            // The worker decodes up to and past the target meanwhile.
            d.testPush(0.933333);
            d.testPush(0.966667);
            d.setTestHook(nullptr);
        });
        auto f = d.frameAt(0.95);
        QVERIFY(f);
        QVERIFY2(!(d.exact() && std::abs(f->ptsSec - 0.233333) < 1e-6),
                 "a stale frame was reported as the exact pick");
        // On the next frame the true pick is shown and exact.
        f = d.frameAt(0.95);
        QVERIFY(f);
        QVERIFY(std::abs(f->ptsSec - 0.933333) < 1e-6);
        QVERIFY(d.exact());
    }

    // F3: a raw Annex-B stream has no timestamps and no seek index. Opening
    // it must still produce frames.
    void timestamplessStreamDecodes() {
        FfmpegDecoder d(media("annexb-360p30.h264"), 0.0);
        auto f = waitExact(d, 0.0);
        QVERIFY2(f, "no frame from a timestamp-less stream");
    }

    // F4: with no timestamps, the first frame is at 0 and frames follow at
    // the stream's frame rate.
    void timestamplessFramesStartAtZero() {
        FfmpegDecoder d(media("annexb-360p30.h264"), 0.0);
        auto f = waitExact(d, 0.0);
        QVERIFY(f);
        QCOMPARE(barcode(*f), 0);
        QVERIFY(std::abs(f->ptsSec) < 1e-9);
        const auto facts = d.facts();
        QVERIFY(facts && facts->frameRate > 0);
        f = waitExact(d, 10.0 / facts->frameRate);
        QVERIFY(f);
        QCOMPARE(barcode(*f), 10);
    }

    // F3/F4: a seek in a stream with no timestamps cannot place its frames,
    // so the decoder reopens and decodes from the start to the target.
    void timestamplessSeekRecovers() {
        FfmpegDecoder d(media("annexb-360p30.h264"), 0.0);
        QVERIFY(waitExact(d, 0.0));
        const double rate = d.facts()->frameRate;
        auto f = waitExact(d, 150.0 / rate, 8000);
        QVERIFY(f);
        QCOMPARE(barcode(*f), 150 & 0xff);
        QVERIFY(d.reopens() >= 1);
    }

    // F5: RGB input becomes opaque RGBA with the source colour.
    void rgbInputKeepsColour() {
        FfmpegDecoder d(media("rgb-solid-720p.mp4"), 0.0);
        auto f = waitExact(d, 0.0);
        QVERIFY(f);
        QCOMPARE(f->layout, PlaneLayout::Rgba);
        const AVFrame* fr = f->frame;
        const uint8_t* px = fr->data[0] + (fr->height / 2) * fr->linesize[0] + (fr->width / 2) * 4;
        // lavfi's colour source is YUV, so the encoded RGB can be 1 off.
        QVERIFY(std::abs(int(px[0]) - 0xC0) <= 1);
        QVERIFY(std::abs(int(px[1]) - 0x20) <= 1);
        QVERIFY(std::abs(int(px[2]) - 0x40) <= 1);
        QCOMPARE(int(px[3]), 255);
    }

    // F5: YUV input that needs conversion is written as BT.709 limited range
    // and labelled so; the shader matrix then gets the source colour back.
    void yuvConversionLabelsMatchOutput() {
        FfmpegDecoder d(media("yuv444-untagged-720p.mp4"), 0.0);
        auto f = waitExact(d, 0.0);
        QVERIFY(f);
        QCOMPARE(f->layout, PlaneLayout::I420);
        const AVFrame* fr = f->frame;
        const int x = fr->width / 2;
        const int y = fr->height / 2;
        const auto rgb = yuvToRgb(f->matrix, f->range, fr->data[0][y * fr->linesize[0] + x],
                                  fr->data[1][(y / 2) * fr->linesize[1] + x / 2],
                                  fr->data[2][(y / 2) * fr->linesize[2] + x / 2]);
        const double want[3] = {0xC0 / 255.0, 0x20 / 255.0, 0x40 / 255.0};
        for (int i = 0; i < 3; ++i) {
            QVERIFY2(std::abs(rgb[static_cast<size_t>(i)] - want[i]) < 3.0 / 255.0,
                     qPrintable(QStringLiteral("channel %1: %2, want %3")
                                    .arg(i)
                                    .arg(rgb[static_cast<size_t>(i)] * 255)
                                    .arg(want[i] * 255)));
        }
    }

    // M1c: VideoToolbox frames land on the same D17 frame as software.
    void hardwareSeekBetweenFrames() {
        ModeScope mode(DecodeMode::Hardware);
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        auto f = waitExact(d, 0.050);
        QVERIFY(f);
        QVERIFY(f->hardware);
        QCOMPARE(d.facts()->decoder, std::string(hw::decoderName()));
        QCOMPARE(hardwareBarcode(*f), 1);
        f = waitExact(d, 5.0);
        QVERIFY(f);
        QCOMPARE(hardwareBarcode(*f), 150);
    }

    // The scrub cache's copy of a VAAPI frame has an owner from its
    // allocation on: a throwing allocation before DecodedFrame takes it
    // cannot leak the frame and its pixel buffers.
    void vaapiCacheCopyIsOwned() {
#if !NT_HW_VAAPI
        QSKIP("VAAPI only");
#else
        QVERIFY2(!std::is_pointer_v<decltype(hw::cacheCopy(nullptr))>, "cacheCopy returns an unowned AVFrame*");
        ModeScope mode(DecodeMode::Hardware);
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        const auto f = waitExact(d, 0.050);
        QVERIFY(f);
        QVERIFY(f->hardware);
        const auto copy = hw::cacheCopy(f->frame);
        QVERIFY(copy);
        QCOMPARE(copy->format, int(AV_PIX_FMT_NV12));
        QCOMPARE(copy->width, f->frame->width);
        QCOMPARE(copy->height, f->frame->height);
        QVERIFY(copy->data[0] && copy->data[1]);
#endif
    }

    // M1c exit 4 (R5): 12 VideoToolbox sessions open at once, all decoding.
    void twelveHardwareSessions() {
        ModeScope mode(DecodeMode::Hardware);
        const char* files[] = {"numbered-a-1080p30.mp4", "numbered-b-1080p30.mp4", "numbered-c-1080p30.mp4",
                               "numbered-d-1080p30.mp4"};
        std::vector<std::unique_ptr<FfmpegDecoder>> decoders;
        for (int i = 0; i < 12; ++i) {
            decoders.push_back(std::make_unique<FfmpegDecoder>(media(files[i % 4]), 1.0 + i * 0.1));
        }
        for (int i = 0; i < 12; ++i) {
            const double target = 1.0 + i * 0.1;
            auto f = waitExact(*decoders[static_cast<size_t>(i)], target, 8000);
            QVERIFY2(f, qPrintable(QStringLiteral("session %1 produced no frame").arg(i)));
            QVERIFY2(f->hardware, qPrintable(QStringLiteral("session %1 fell back: %2")
                                                 .arg(i)
                                                 .arg(QString::fromStdString(decoders[static_cast<size_t>(i)]->facts()->fallback))));
            QCOMPARE(hardwareBarcode(*f), static_cast<int>(std::floor(target * 30.0 + 1e-6)));
        }
    }

    // M1c: a stream VideoToolbox cannot decode (4:4:4 H.264) falls back to
    // software in Auto, with the reason, and fails the clip in Hardware.
    void hardwareFallback() {
        {
            ModeScope mode(DecodeMode::Auto);
            FfmpegDecoder d(media("yuv444-untagged-720p.mp4"), 0.0);
            auto f = waitExact(d, 0.0);
            QVERIFY(f);
            QVERIFY(!f->hardware);
            const auto facts = d.facts();
            QCOMPARE(facts->decoder, std::string("software"));
            QVERIFY2(!facts->fallback.empty(), "no fallback reason");
        }
        {
            ModeScope mode(DecodeMode::Hardware);
            FfmpegDecoder d(media("yuv444-untagged-720p.mp4"), 0.0);
            QElapsedTimer t;
            t.start();
            while (t.elapsed() < 4000 && !(d.facts() && !d.facts()->error.empty())) {
                d.frameAt(0.0);
                QThread::msleep(5);
            }
            QVERIFY(d.facts());
            QVERIFY2(!d.facts()->error.empty(), "Hardware mode did not fail the clip");
            QVERIFY(!d.facts()->usable());
        }
    }

    // M1c F2: a frame VideoToolbox decoded but the GPU cannot import (no
    // Metal interop) must not leave the picture missing. FfmpegSource reports
    // it; before the first frame is shown, Auto retries in software.
    void importFailureFallsBackInAuto() {
        ModeScope mode(DecodeMode::Auto);
        FfmpegSource source(media("seek-360p30.mp4"), 0.0, QSize(640, 360));
        FrameContext ctx;  // no QRhi and no interop: every import fails
        QElapsedTimer t;
        t.start();
        while (t.elapsed() < 4000) {
            if (const auto f = source.decoder().frameAt(0.0); f && !f->hardware) break;
            if (const auto f = source.decoder().frameAt(0.0); f && f->hardware) source.frameAt(ctx, 0.0);
            QThread::msleep(2);
        }
        const auto facts = source.decoder().facts();
        QVERIFY(facts);
        QCOMPARE(facts->decoder, std::string("software"));
        QVERIFY2(facts->fallback.find("import") != std::string::npos, facts->fallback.c_str());
        auto f = waitExact(source.decoder(), 0.0);
        QVERIFY(f);
        QVERIFY(!f->hardware);
        QCOMPARE(barcode(*f), 0);
    }

    void importFailureFailsTheClipInHardware() {
        ModeScope mode(DecodeMode::Hardware);
        FfmpegSource source(media("seek-360p30.mp4"), 0.0, QSize(640, 360));
        FrameContext ctx;
        QElapsedTimer t;
        t.start();
        while (t.elapsed() < 4000) {
            const auto facts = source.decoder().facts();
            if (facts && !facts->error.empty()) break;
            source.frameAt(ctx, 0.0);
            QThread::msleep(2);
        }
        const auto facts = source.decoder().facts();
        QVERIFY(facts);
        QVERIFY2(facts->error.find("import") != std::string::npos, facts->error.c_str());
        QVERIFY(!facts->usable());
    }

    // M1c F3: a decode error in the middle of a stream (here from
    // avcodec_send_packet, injected after 30 packets) is reported, not
    // turned into end of stream with a frozen picture and an "ok" report.
    void midStreamDecodeErrorIsReported() {
        setTestDecodeFailureAfterPackets(30);
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        setTestDecodeFailureAfterPackets(-1);
        QVERIFY(waitExact(d, 0.3));
        QElapsedTimer t;
        t.start();
        while (t.elapsed() < 4000 && !(d.facts() && !d.facts()->error.empty())) {
            d.frameAt(t.elapsed() / 1000.0);
            QThread::msleep(5);
        }
        QVERIFY(d.facts());
        QVERIFY2(!d.facts()->error.empty(), "a mid-stream decode error was not reported");
        QVERIFY(!d.facts()->usable());
    }

    // F3: the same error before the first frame, in Auto, falls back to
    // software (send errors take the same path as receive errors).
    void sendErrorBeforeFirstFrameFallsBack() {
        ModeScope mode(DecodeMode::Auto);
        setTestDecodeFailureAfterPackets(0);
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        setTestDecodeFailureAfterPackets(-1);
        auto f = waitExact(d, 0.0);
        QVERIFY(f);
        QVERIFY(!f->hardware);
        QVERIFY2(d.facts()->fallback.find("decode") != std::string::npos, d.facts()->fallback.c_str());
        QCOMPARE(barcode(*f), 0);
    }

    // M1c F4: the first open and a reopen apply the same hardware policy.
    // VideoToolbox setup is made to fail at the first open, or at the reopen
    // that a seek in a timestamp-less stream needs.
    void hardwareSetupFailurePolicy_data() {
        QTest::addColumn<int>("failingOpen");  // 0: first open, 1: the reopen after a seek
        QTest::addColumn<int>("mode");         // DecodeMode
        QTest::newRow("first open, hw") << 0 << int(DecodeMode::Hardware);
        QTest::newRow("first open, auto") << 0 << int(DecodeMode::Auto);
        QTest::newRow("after seek, hw") << 1 << int(DecodeMode::Hardware);
        QTest::newRow("after seek, auto") << 1 << int(DecodeMode::Auto);
    }
    void hardwareSetupFailurePolicy() {
        QFETCH(int, failingOpen);
        QFETCH(int, mode);
        ModeScope scope(static_cast<DecodeMode>(mode));
        setTestHardwareSetupFailureOnOpen(failingOpen);
        FfmpegDecoder d(media("annexb-360p30.h264"), 0.0);
        setTestHardwareSetupFailureOnOpen(-1);
        // Waits for the exact frame, or for the clip to fail.
        const auto exactOrError = [&d](double target) -> std::shared_ptr<DecodedFrame> {
            QElapsedTimer t;
            t.start();
            while (t.elapsed() < 8000) {
                auto f = d.frameAt(target);
                if (f && d.exact()) return f;
                if (d.facts() && !d.facts()->error.empty()) return nullptr;
                QThread::msleep(2);
            }
            return nullptr;
        };
        // Show frame 0, then seek far ahead: the stream has no timestamps, so
        // the decoder reopens.
        const auto first = exactOrError(0.0);
        if (failingOpen == 0 && mode == int(DecodeMode::Hardware)) {
            QVERIFY(!first);
            QVERIFY(d.facts() && !d.facts()->error.empty());
            return;
        }
        QVERIFY(first);
        const double rate = d.facts()->frameRate;
        const auto later = exactOrError(150.0 / rate);
        const auto facts = d.facts();
        QVERIFY(facts);
        QVERIFY(d.reopens() >= (failingOpen == 1 ? 1 : 0));
        if (mode == int(DecodeMode::Hardware)) {
            QVERIFY2(!facts->error.empty(), "hw: a failed VideoToolbox setup at reopen went unreported");
            QVERIFY(!facts->usable());
        } else {
            QVERIFY(later);
            QVERIFY(!later->hardware);
            QCOMPARE(facts->decoder, std::string("software"));
            QVERIFY2(!facts->fallback.empty(), "auto: the fallback has no reason");
            QCOMPARE(barcode(*later), 150 & 0xff);
        }
    }

    // R6: untagged media keeps the D10 guess by height. HD (720 lines and
    // up) reads as BT.709, SD as BT.601, and the colour comes back right.
    void untaggedGuessByHeight_data() {
        QTest::addColumn<QString>("file");
        QTest::addColumn<int>("matrix");
        QTest::newRow("HD 720p is BT.709") << "untagged-hd-720p.mp4" << int(YuvMatrix::Bt709);
        QTest::newRow("SD 480p is BT.601") << "untagged-sd-480p.mp4" << int(YuvMatrix::Bt601);
    }
    void untaggedGuessByHeight() {
        QFETCH(QString, file);
        QFETCH(int, matrix);
        FfmpegDecoder d(media(qPrintable(file)), 0.0);
        auto f = waitExact(d, 0.0);
        QVERIFY(f);
        QCOMPARE(int(f->matrix), matrix);
        QCOMPARE(f->range, YuvRange::Limited);
        const AVFrame* fr = f->frame;
        const int x = fr->width / 2;
        const int y = fr->height / 2;
        const auto rgb = yuvToRgb(f->matrix, f->range, fr->data[0][y * fr->linesize[0] + x],
                                  fr->data[1][(y / 2) * fr->linesize[1] + x / 2],
                                  fr->data[2][(y / 2) * fr->linesize[2] + x / 2]);
        const double want[3] = {0xC0 / 255.0, 0x20 / 255.0, 0x40 / 255.0};
        for (int i = 0; i < 3; ++i) {
            QVERIFY2(std::abs(rgb[static_cast<size_t>(i)] - want[i]) < 3.0 / 255.0,
                     qPrintable(QStringLiteral("channel %1: %2").arg(i).arg(rgb[static_cast<size_t>(i)] * 255)));
        }
    }

    // M1d exit 3 (D19): a frame decoded earlier is shown from the scrub cache
    // on the first call after a seek back, exact, with no decoder seek.
    void cacheHitDrawsInTheSameFrame_data() {
        QTest::addColumn<int>("mode");
        QTest::newRow("sw") << int(DecodeMode::Software);
        QTest::newRow("hw") << int(DecodeMode::Hardware);
    }
    void cacheHitDrawsInTheSameFrame() {
        QFETCH(int, mode);
        ModeScope scope(static_cast<DecodeMode>(mode));
        FrameCache::shared().clear();
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        for (int n = 0; n <= 20; ++n) QVERIFY(waitExact(d, n / 30.0));  // decode frames 0-20
        QVERIFY(waitExact(d, 6.0));  // seek away
        const long long seeksBefore = d.seeks();
        auto f = d.frameAt(15.0 / 30.0);  // back: one call, no waiting
        QVERIFY2(f && d.exact(), "the cached frame was not shown on the first call");
        QCOMPARE(std::lround(f->ptsSec * 30.0), 15L);
        QCOMPARE(d.seeks(), seeksBefore);  // the cache answered; the decoder did not seek
        QVERIFY(FrameCache::shared().hits() > 0);
    }

    // M1d: a seek catches up with non-reference frames skipped. The cache
    // must not link two decoded frames as neighbours across a skipped one,
    // or a lookup between them would return the older frame as the pick.
    void cacheNeverProvesAcrossSkippedFrames() {
        FrameCache::shared().clear();
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        QVERIFY(waitExact(d, 0.0));
        QVERIFY(waitExact(d, 5.9));  // a seek to the keyframe at 4.0 s, then catch-up to 5.9 s
        // From before the seek's keyframe to past the decode-ahead: proofs
        // exist from the target on, and every one must be right.
        int checked = 0;
        for (int n = 120; n < 190; ++n) {
            const double t = n / 30.0 + 0.001;
            const auto f = FrameCache::shared().lookup(media("seek-360p30.mp4"), t);
            if (!f) continue;
            ++checked;
            QCOMPARE(std::lround(f->ptsSec * 30.0), static_cast<long>(n));
        }
        qInfo("successor proofs checked: %d", checked);
        QVERIFY2(checked > 0, "no successor proof was checked");
    }

    // A VP9 WebM stream (1/1000 time base): every frame time shows that
    // frame, also where the frame starts exactly on the target (frame 15 at
    // 500 ms). Stepped forward, then each frame as a fresh seek.
    void webmFrameOnItsOwnTimestamp() {
        FfmpegDecoder d(media("numbered-vp9-360p.webm"), 0.0);
        for (int n = 0; n < 60; ++n) {
            auto f = waitExact(d, n * 1000.0 / 30.0 / 1000.0);
            QVERIFY(f);
            QCOMPARE(barcode(*f), n);
        }
        for (const int n : {15, 30, 14, 45, 1}) {
            FfmpegDecoder fresh(media("numbered-vp9-360p.webm"), n / 30.0);
            auto f = waitExact(fresh, n / 30.0);
            QVERIFY(f);
            QCOMPARE(barcode(*f), n);
        }
    }

    // Open GOP (x265's default): the frames just before each random access
    // point (CRA at 2 s, 4 s) are decoded after it and reference the GOP
    // before it. A seek can land on the CRA, where those frames cannot be
    // decoded and are dropped, so the first frame out is after the target.
    // The decoder must then seek further back, not restart at the same
    // place forever.
    void openGopFramesBeforeRandomAccessPoint_data() {
        QTest::addColumn<int>("mode");
        QTest::newRow("sw") << int(DecodeMode::Software);
        QTest::newRow("hw") << int(DecodeMode::Hardware);
    }
    void openGopFramesBeforeRandomAccessPoint() {
        QFETCH(int, mode);
        ModeScope scope(static_cast<DecodeMode>(mode));
        for (const int n : {58, 59, 118, 119, 178, 179}) {
            FrameCache::shared().clear();
            FfmpegDecoder d(media("numbered-a-2160p30-hevc.mp4"), n / 30.0);
            auto f = waitExact(d, n / 30.0, 6000);
            QVERIFY2(f, qPrintable(QStringLiteral("frame %1 never became exact (seeks %2)").arg(n).arg(d.seeks())));
            QCOMPARE(std::lround(f->ptsSec * 30.0), static_cast<long>(n));
        }
    }

    // M1d review F2: a non-reference B-frame followed by a long presentation
    // gap (I 0 ms, B 33 ms, P 1067 ms). For 800 ms the B-frame is the D17
    // pick: catch-up skipping must not drop it.
    void longGapKeepsNonReferencePick() {
        FfmpegDecoder d(media("bframe-gap.mp4"), 0.8);
        auto f = waitExact(d, 0.8);
        QVERIFY(f);
        QCOMPARE(std::lround(f->ptsSec * 1000.0), 33L);
    }

    // M1d review F3: a cached frame counts its real allocation: at least
    // the packed 4:2:0 size, padding included, for software and for the
    // IOSurface of a VideoToolbox frame.
    void frameBytesCountRealAllocations_data() {
        QTest::addColumn<int>("mode");
        QTest::newRow("sw") << int(DecodeMode::Software);
        QTest::newRow("hw") << int(DecodeMode::Hardware);
    }
    void frameBytesCountRealAllocations() {
        QFETCH(int, mode);
        ModeScope scope(static_cast<DecodeMode>(mode));
        FfmpegDecoder d(media("numbered-a-1080p30.mp4"), 0.0);
        auto f = waitExact(d, 0.0);
        QVERIFY(f);
        const size_t packed = size_t(1920) * 1080 * 3 / 2;
        const size_t bytes = frameBytes(*f);
        QVERIFY2(bytes >= packed && bytes < packed * 2,
                 qPrintable(QStringLiteral("%1 bytes for a packed %2").arg(bytes).arg(packed)));
        qInfo("%s: %zu bytes (packed %zu)", mode == int(DecodeMode::Hardware) ? "hw" : "sw", bytes, packed);
    }

    // M1d review F1: the header claims 30 fps (average and base rate agree),
    // but frames start at 0, 50, 67 ms. A cached 50 ms frame with no proven
    // successor is not the pick for 70 ms.
    void headerRateProvesNoInterval() {
        const MediaFacts facts = probeMedia(media("vfr-header-cfr.mp4"));
        QVERIFY(facts.constantRate);  // the header's claim
        FrameCache cache;
        auto frame = std::make_shared<DecodedFrame>();
        frame->ptsSec = 0.050;
        cache.insert("vfr", 0.050, frame, 1, -1.0);
        QVERIFY(!cache.lookup("vfr", 0.070));
    }

    // M1d: the scrub cache holds hardware frames (their CVPixelBuffers).
    // Stepping through 5 s of 4K HEVC with the cache full must keep decoding.
    void hardwareDecodeIsNotStarvedByHeldFrames() {
        ModeScope scope(DecodeMode::Hardware);
        FrameCache::shared().clear();
        FfmpegDecoder d(media("numbered-a-2160p30-hevc.mp4"), 0.0);
        for (int n = 0; n < 150; ++n) {
            auto f = waitExact(d, n / 30.0, 3000);
            QVERIFY2(f, qPrintable(QStringLiteral("frame %1 never became exact (cache %2 MB)")
                                       .arg(n)
                                       .arg(FrameCache::shared().bytes() / 1048576)));
        }
    }

    // M1d: a fast scrub over a long-GOP 4K stream, then stop: the clip must
    // land on the exact frame of the last request. It runs through the
    // SourcePool, as the compositor does, so the watchdog applies:
    // VideoToolbox can hang on this open-GOP HEVC stream under fast seeking,
    // and the pool then reopens the clip in software with the reason in the
    // report.
    void scrubThenStopSettles_data() {
        QTest::addColumn<int>("mode");
        QTest::newRow("sw") << int(DecodeMode::Software);
        QTest::newRow("hw") << int(DecodeMode::Hardware);
    }
    void scrubThenStopSettles() {
        QFETCH(int, mode);
        ModeScope scope(static_cast<DecodeMode>(mode));
        FrameCache::shared().clear();
        Timeline tl;
        tl.durationMs = 15000;
        Track track;
        track.id = "t";
        tl.tracks.push_back(track);
        Clip clip;
        clip.id = "c";
        clip.trackId = "t";
        clip.durationMs = 15000;
        clip.mediaPath = media("numbered-a-2160p30-hevc.mp4");
        tl.clips.push_back(clip);
        SourcePool pool;
        // One render frame: the pool update, then the clip's decoder.
        const auto step = [&](int n) -> std::shared_ptr<DecodedFrame> {
            pool.update(tl, n * 1000.0 / 30.0);
            auto* src = dynamic_cast<FfmpegSource*>(pool.sourceFor("c"));
            if (!src) return nullptr;
            auto f = src->decoder().frameAt(n / 30.0);
            return f && src->decoder().exact() ? f : nullptr;
        };
        const auto settle = [&](int n, int timeoutMs) -> std::shared_ptr<DecodedFrame> {
            QElapsedTimer t;
            t.start();
            while (t.elapsed() < timeoutMs) {
                if (auto f = step(n)) return f;
                QThread::msleep(2);
            }
            return nullptr;
        };
        QVERIFY(settle(0, 8000));
        std::mt19937 rng(3);
        std::uniform_int_distribution<int> start(0, 449);
        std::uniform_real_distribution<double> stepFrames(-9.0, 9.0);
        std::uniform_real_distribution<double> jump(0.0, 1.0);
        for (int run = 0; run < 6; ++run) {
            int frame = start(rng);
            QElapsedTimer t;
            t.start();
            qint64 next = 0;
            while (t.elapsed() < 2000) {
                if (t.elapsed() >= next) {
                    frame = jump(rng) < 0.05 ? start(rng)
                                             : std::clamp(frame + static_cast<int>(std::lround(stepFrames(rng))), 0, 449);
                    next += 16;
                }
                step(frame);
                QThread::msleep(2);
            }
            auto f = settle(frame, 5000);
            QVERIFY2(f, qPrintable(QStringLiteral("run %1: frame %2 never became exact").arg(run).arg(frame)));
            QCOMPARE(std::lround(f->ptsSec * 30.0), static_cast<long>(frame));
        }
        std::string fallback = "no report";
        std::string decoder;
        for (const MediaReport& r : pool.report()) {
            if (r.clipId == "c") {
                fallback = r.fallback;
                decoder = r.decoder;
            }
        }
        // Either VideoToolbox decoded throughout, or the watchdog moved the
        // clip to software and said so.
        if (mode == int(DecodeMode::Hardware)) {
            QVERIFY2((decoder == hw::decoderName() && fallback.empty()) ||
                         (decoder == "software" && fallback == kStallFallback),
                     qPrintable(QStringLiteral("decoder %1, fallback '%2'")
                                    .arg(QString::fromStdString(decoder), QString::fromStdString(fallback))));
            if (!fallback.empty()) qInfo("watchdog fell back: %s", fallback.c_str());
        } else {
            QCOMPARE(decoder, std::string("software"));
        }
    }

    // F9: the worker fills at most 8 frames, and no further than 250 ms
    // (plus the one frame that crosses the line) past the target, also after
    // the target moves on.
    void decodeAheadIsBounded() {
        FfmpegDecoder d(media("seek-360p30.mp4"), 0.0);
        for (const double target : {1.0, 1.5, 2.0}) {
            QVERIFY(waitExact(d, target));
            QThread::msleep(200);  // let the worker fill its queue
            QVERIFY(d.frameAt(target));
            const int queued = d.queuedFrames();
            const double ahead = d.newestQueuedPts() - target;
            QVERIFY2(queued <= 8, qPrintable(QStringLiteral("queued %1").arg(queued)));
            QVERIFY2(ahead <= 0.25 + 1.0 / 30.0 + 1e-6, qPrintable(QStringLiteral("ahead %1 s").arg(ahead)));
            // Not vacuous: the worker did decode ahead.
            QVERIFY2(queued >= 2 && ahead > 0.1, qPrintable(QStringLiteral("queued %1 ahead %2").arg(queued).arg(ahead)));
        }
        QCOMPARE(d.seeks(), 1LL);  // 1.0, 1.5 and 2.0 decode through
    }
};

QTEST_GUILESS_MAIN(TestFfmpegSource)
#include "tst_ffmpegsource.moc"
