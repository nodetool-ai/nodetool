// SourcePool lifetime (F2): closing a clip never blocks the render thread on
// a decoder's I/O, and the FFmpeg interrupt callback ends a blocked read so
// the decoder is joined soon after.

#include "preview/FfmpegSource.h"
#include "preview/FrameCache.h"
#include "preview/SourcePool.h"
#include "preview/hw/HwInterop.h"

#include <QElapsedTimer>
#include <QHostAddress>
#include <QTcpServer>
#include <QTest>
#include <QThread>

#include <algorithm>
#include <cmath>

#include <unistd.h>

using namespace nt;

namespace {

// A TCP listener that accepts connections (through the backlog) and never
// sends a byte: FFmpeg's read on it blocks until interrupted. QTcpServer, so
// the test also builds on Windows (M6); with no event loop it never accepts.
class StalledServer {
public:
    StalledServer() { m_server.listen(QHostAddress::LocalHost, 0); }
    std::string url() const { return "tcp://127.0.0.1:" + std::to_string(m_server.serverPort()); }

private:
    QTcpServer m_server;
};

Timeline oneClip(const std::string& mediaPath) {
    Timeline tl;
    tl.durationMs = 10000;
    Track t;
    t.id = "t";
    tl.tracks.push_back(t);
    Clip c;
    c.id = "c";
    c.trackId = "t";
    c.durationMs = 10000;
    c.mediaPath = mediaPath;
    tl.clips.push_back(c);
    return tl;
}

std::string media(const char* name) {
    return std::string(NT_FIXTURES_DIR) + "/media/" + name;
}

// One render-thread frame: the pool update, then the clip's decoder asked
// for `ms` as the compositor asks it. Returns the update's duration in ms.
double frame(SourcePool& pool, const Timeline& tl, double ms, bool* exact = nullptr, double* pts = nullptr) {
    QElapsedTimer t;
    t.start();
    pool.update(tl, ms);
    const double updateMs = static_cast<double>(t.nsecsElapsed()) / 1.0e6;
    auto* src = dynamic_cast<FfmpegSource*>(pool.sourceFor("c"));
    if (src) {
        auto f = src->decoder().frameAt(ms / 1000.0);
        if (exact) *exact = f && src->decoder().exact();
        if (pts && f) *pts = f->ptsSec;
    } else if (exact) {
        *exact = false;
    }
    return updateMs;
}

MediaReport reportFor(const SourcePool& pool) {
    for (const MediaReport& r : pool.report()) {
        if (r.clipId == "c") return r;
    }
    return {};
}

// No hardware decode in this build (NT_PORTABLE) or on this machine (a CI
// runner: NT_NO_HW_DECODE=1): the hardware tests are skipped.
bool hardwareUnavailable() {
    return std::string(hw::decoderName()) == "none" || qEnvironmentVariableIsSet("NT_NO_HW_DECODE");
}

struct ModeScope {
    explicit ModeScope(DecodeMode mode) { setDecodeMode(mode); }
    ~ModeScope() {
        setDecodeMode(DecodeMode::Software);
        setTestHardwareStallAfterPackets(-1);
        setTestHardwareFrameLossAfterFrames(-1);
    }
};

}  // namespace

class TestSourcePool : public QObject {
    Q_OBJECT

private slots:
    void init() {
        const QByteArray name(QTest::currentTestFunction());
        if (name.contains("ardware") && hardwareUnavailable()) QSKIP("no hardware decode in this build or on this machine");
    }

    void decoderDestructorInterruptsBlockedIo() {
        StalledServer server;
        auto decoder = std::make_unique<FfmpegDecoder>(server.url(), 0.0);
        QThread::msleep(300);  // the worker is now blocked reading the socket
        QVERIFY(!decoder->facts());
        QElapsedTimer t;
        t.start();
        decoder.reset();
        QVERIFY2(t.elapsed() < 1000, qPrintable(QStringLiteral("join took %1 ms").arg(t.elapsed())));
    }

    void closingAClipDoesNotBlockTheRenderThread() {
        StalledServer server;
        SourcePool pool;
        pool.update(oneClip(server.url()), 0.0);
        QCOMPARE(pool.openDecoders(), 1);
        QThread::msleep(300);  // its worker is blocked reading the socket

        QElapsedTimer t;
        t.start();
        pool.update(Timeline{}, 0.0);  // the clip leaves: retire its decoder
        QVERIFY2(t.elapsed() < 50, qPrintable(QStringLiteral("update took %1 ms").arg(t.elapsed())));

        // The retire thread joins it once the interrupt ends the read.
        QElapsedTimer closing;
        closing.start();
        while (pool.openDecoders() > 0 && closing.elapsed() < 2000) QThread::msleep(5);
        QCOMPARE(pool.openDecoders(), 0);
        QVERIFY(closing.elapsed() < 1000);
    }

    // The watchdog: a VideoToolbox decoder with a pending target that makes
    // no progress for 1 s is retired without a join on the render thread,
    // and the clip reopens in software with the reason in the report. The
    // injected stall never returns, as a blocked VTDecompressionSession.
    void stalledHardwareDecoderFallsBackToSoftware() {
        ModeScope scope(DecodeMode::Hardware);
        FrameCache::shared().clear();
        const Timeline tl = oneClip(media("numbered-a-1080p30.mp4"));
        QElapsedTimer teardown;
        {
            SourcePool pool;
            setTestHardwareStallAfterPackets(2);
            frame(pool, tl, 0.0);  // the first decoder stalls after 2 packets
            setTestHardwareStallAfterPackets(-1);

            QElapsedTimer t;
            t.start();
            double worstUpdateMs = 0.0;
            while (reportFor(pool).fallback.empty() && t.elapsed() < 4000) {
                worstUpdateMs = std::max(worstUpdateMs, frame(pool, tl, 0.0));
                QThread::msleep(5);
            }
            const qint64 detectedMs = t.elapsed();
            const MediaReport r = reportFor(pool);
            QCOMPARE(r.fallback, std::string("hw decoder stalled, fell back to sw"));
            QVERIFY2(detectedMs >= 900 && detectedMs < 2500, qPrintable(QStringLiteral("detected after %1 ms").arg(detectedMs)));
            QVERIFY2(worstUpdateMs < 50.0, qPrintable(QStringLiteral("an update took %1 ms").arg(worstUpdateMs)));

            // The software decoder serves the clip: an exact frame at 2 s.
            bool exact = false;
            double pts = -1.0;
            t.restart();
            while (!exact && t.elapsed() < 4000) {
                frame(pool, tl, 2000.0, &exact, &pts);
                QThread::msleep(2);
            }
            QVERIFY(exact);
            QCOMPARE(std::lround(pts * 30.0), 60L);
            QCOMPARE(reportFor(pool).decoder, std::string("software"));
            QVERIFY(reportFor(pool).ok);

            // The clip stays in software for the session, also after it reopens.
            frame(pool, Timeline{}, 0.0);
            t.restart();
            while (pool.openDecoders() > 0 && t.elapsed() < 3000) QThread::msleep(5);
            QVERIFY2(pool.openDecoders() == 0,
                     qPrintable(QStringLiteral("%1 decoders still open").arg(pool.openDecoders())));
            exact = false;
            t.restart();
            while (!exact && t.elapsed() < 4000) {
                frame(pool, tl, 1000.0, &exact);
                QThread::msleep(2);
            }
            QVERIFY(exact);
            QCOMPARE(reportFor(pool).decoder, std::string("software"));
            teardown.start();
        }
        // The stalled worker never returned, and the teardown stays bounded.
        QVERIFY2(teardown.elapsed() < 2500, qPrintable(QStringLiteral("teardown took %1 ms").arg(teardown.elapsed())));
        releaseTestStalls();
    }

    // The other stall: a VideoToolbox session that accepts every packet and
    // returns no frame (open-GOP HEVC under fast seeking). The worker keeps
    // reading, so only decoded frames count as progress.
    void hardwareDecoderThatLosesFramesFallsBack() {
        ModeScope scope(DecodeMode::Hardware);
        FrameCache::shared().clear();
        const Timeline tl = oneClip(media("numbered-a-1080p30.mp4"));
        SourcePool pool;
        setTestHardwareFrameLossAfterFrames(3);
        frame(pool, tl, 0.0);
        setTestHardwareFrameLossAfterFrames(-1);
        QElapsedTimer t;
        t.start();
        bool exact = false;
        // Spend the frames the session keeps at 0 s first. A device that
        // opens slowly (VAAPI) would otherwise decode them after the seek to
        // 3 s, and the last of them, followed by the end of the stream, would
        // count as the exact pick there.
        while (!exact && t.elapsed() < 4000) {
            frame(pool, tl, 0.0, &exact);
            QThread::msleep(2);
        }
        QVERIFY(exact);
        exact = false;
        t.restart();
        double pts = -1.0;
        while (reportFor(pool).fallback.empty() && t.elapsed() < 5000) {
            frame(pool, tl, 3000.0, &exact);
            QThread::msleep(5);
        }
        QCOMPARE(reportFor(pool).fallback, std::string(kStallFallback));
        t.restart();
        while (!exact && t.elapsed() < 4000) {
            frame(pool, tl, 3000.0, &exact, &pts);
            QThread::msleep(2);
        }
        QVERIFY(exact);
        QCOMPARE(std::lround(pts * 30.0), 90L);
        QCOMPARE(reportFor(pool).decoder, std::string("software"));
    }

    // A healthy VideoToolbox decoder that holds its exact frame is not stalled.
    void idleHardwareDecoderIsNotStalled() {
        ModeScope scope(DecodeMode::Hardware);
        FrameCache::shared().clear();
        const Timeline tl = oneClip(media("numbered-a-1080p30.mp4"));
        SourcePool pool;
        QElapsedTimer t;
        t.start();
        while (t.elapsed() < 1800) {
            frame(pool, tl, 500.0);
            QThread::msleep(5);
        }
        const MediaReport r = reportFor(pool);
        QCOMPARE(r.decoder, std::string(hw::decoderName()));
        QCOMPARE(r.fallback, std::string());
    }
};

QTEST_GUILESS_MAIN(TestSourcePool)
#include "tst_sourcepool.moc"
