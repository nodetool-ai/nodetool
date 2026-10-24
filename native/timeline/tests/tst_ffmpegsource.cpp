// Decoder tests against the media from scripts/make-fixtures.sh: seeks land on
// the D17 frame (target between two frames, variable frame rate, superseded
// seek), the last frame stays at end of stream, and the D10a rejections.

#include "preview/FfmpegSource.h"

extern "C" {
#include <libavutil/frame.h>
}

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
