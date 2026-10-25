// Decoder tests against the media from scripts/make-fixtures.sh: seeks land on
// the D17 frame (target between two frames, variable frame rate, superseded
// seek), the last frame stays at end of stream, and the D10a rejections.

#include "preview/FfmpegSource.h"

extern "C" {
#include <libavutil/frame.h>
}

#include <CoreVideo/CVPixelBuffer.h>
#include <QElapsedTimer>
#include <QTest>
#include <QThread>

#include <cmath>

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

// The barcode of a VideoToolbox frame, read from its pixel buffer's Y plane
// (a CPU read for the test only; the app never maps hardware frames).
int hardwareBarcode(const DecodedFrame& f) {
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
        QCOMPARE(d.facts()->decoder, std::string("videotoolbox"));
        QCOMPARE(hardwareBarcode(*f), 1);
        f = waitExact(d, 5.0);
        QVERIFY(f);
        QCOMPARE(hardwareBarcode(*f), 150);
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
