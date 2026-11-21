// SourcePool lifetime (F2): closing a clip never blocks the render thread on
// a decoder's I/O, and the FFmpeg interrupt callback ends a blocked read so
// the decoder is joined soon after.

#include "preview/FfmpegSource.h"
#include "preview/FrameCache.h"
#include "preview/SourcePool.h"
#include "preview/StillImageSource.h"
#include "preview/hw/HwInterop.h"

#include <QElapsedTimer>
#include <QHostAddress>
#include <QImage>
#include <QTemporaryDir>
#include <QTcpServer>
#include <QTest>
#include <QThread>

#include <algorithm>
#include <cmath>

extern "C" {
#include <libavformat/avio.h>
}

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

    void transparentStillImageDrawsFromRgba_data() {
        QTest::addColumn<bool>("image");
        QTest::newRow("image clip") << true;
        QTest::newRow("video clip") << false;
    }
    void transparentStillImageDrawsFromRgba() {
        // D10a rejects alpha on the YUV path. An image clip keeps it through
        // one RGBA texture. Video with alpha still shows the placeholder.
        QFETCH(bool, image);
        QTemporaryDir dir;
        const QString path = dir.filePath("logo.png");
        QImage png(64, 32, QImage::Format_RGBA8888);
        png.fill(QColor(230, 120, 40, 128));
        QVERIFY(png.save(path));
        Timeline tl = oneClip(path.toStdString());
        tl.clips[0].mediaType = image ? MediaType::Image : MediaType::Video;
        SourcePool pool;
        QTRY_VERIFY_WITH_TIMEOUT((pool.update(tl, 0.0), !reportFor(pool).clipId.empty()), 3000);
        const MediaReport r = reportFor(pool);
        if (image) {
            QVERIFY2(r.ok, r.reason.c_str());
            QCOMPARE(r.decoder, std::string("image"));
            auto* still = dynamic_cast<StillImageSource*>(pool.sourceFor("c"));
            QVERIFY(still);
            QCOMPARE(still->frameSize(), QSize(64, 32));
        } else {
            QVERIFY(!r.ok);
            QCOMPARE(r.reason, std::string("alpha"));
            QVERIFY(!dynamic_cast<StillImageSource*>(pool.sourceFor("c")));
        }
    }
    void decoderDestructorInterruptsBlockedIo() {
        // The LGPL FFmpeg that CI builds has --disable-network: no tcp:// to block on.
        if (!avio_find_protocol_name("tcp://127.0.0.1:1")) QSKIP("FFmpeg has no tcp protocol");
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
    void queuedHardwareStallsHaveBoundedJoinedTeardown() {
        ModeScope scope(DecodeMode::Hardware);
        FrameCache::shared().clear();
        Timeline tl = oneClip(media("numbered-a-1080p30.mp4"));
        for (int i = 1; i < 4; ++i) {
            Clip clip = tl.clips.front();
            clip.id = "c" + std::to_string(i);
            tl.clips.push_back(std::move(clip));
        }
        QElapsedTimer teardown;
        {
            SourcePool pool;
            setTestHardwareStallAfterPackets(0);
            pool.update(tl, 0.0);
            setTestHardwareStallAfterPackets(-1);
            // Wait for every worker to enter the injected uninterruptible call.
            for (const Clip& clip : tl.clips) {
                auto* source = dynamic_cast<FfmpegSource*>(pool.sourceFor(clip.id));
                QVERIFY(source);
                QTRY_VERIFY_WITH_TIMEOUT(source->decoder().stalled(), 3000);
            }
            teardown.start();
        }
        const qint64 elapsed = teardown.elapsed();
        releaseTestStalls();
        QVERIFY2(elapsed < 1500, qPrintable(QStringLiteral("teardown took %1 ms").arg(elapsed)));
    }

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
        // Spend the three frames the session keeps at 0 s first. One decoded
        // after the seek to 3 s would land on the keyframe before it and,
        // followed by the end of the stream, count as the exact pick there.
        // The cache proves frame 1 only once frame 2, the third, is published.
        const std::string path = media("numbered-a-1080p30.mp4");
        bool thirdPublished = false;
        while (!thirdPublished && t.elapsed() < 4000) {
            frame(pool, tl, 0.0, &exact);
            thirdPublished = FrameCache::shared().lookup(path, 1.5 / 30.0) != nullptr;
            QThread::msleep(2);
        }
        QVERIFY2(thirdPublished, "the session did not publish its three frames");
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

    // Scrubbing back across a cut reuses the recently passed clip's open
    // decoder within kPrerollMs instead of reopening it from disk.
    void recentlyPassedClipStaysOpenForBackwardScrub() {
        Timeline tl;
        tl.durationMs = 6000;
        Track track;
        track.id = "t";
        tl.tracks.push_back(track);
        Clip a;
        a.id = "a";
        a.trackId = "t";
        a.startMs = 0;
        a.durationMs = 3000;
        a.mediaPath = media("numbered-a-1080p30.mp4");
        Clip b;
        b.id = "b";
        b.trackId = "t";
        b.startMs = 3000;
        b.durationMs = 3000;
        b.mediaPath = media("numbered-b-1080p30.mp4");
        tl.clips.push_back(a);
        tl.clips.push_back(b);

        std::atomic<int> videoOpens{0};
        SourcePool pool(SourcePool::WorkerReadProbes{[&] { ++videoOpens; }, {}});
        pool.update(tl, 2500.0);
        QTRY_COMPARE_WITH_TIMEOUT(videoOpens.load(), 2, 4000);
        QVERIFY(pool.sourceFor("a") != nullptr);
        QVERIFY(pool.sourceFor("b") != nullptr);

        // 1 s past clip a's end (within kPrerollMs): a stays open.
        pool.update(tl, 4000.0);
        QVERIFY2(pool.sourceFor("a") != nullptr, "recently passed clip was evicted immediately");
        QVERIFY(pool.sourceFor("b") != nullptr);

        // Scrubbing back onto clip a reuses the existing decoder with no reopen.
        pool.update(tl, 2500.0);
        QVERIFY(pool.sourceFor("a") != nullptr);
        QCOMPARE(videoOpens.load(), 2);

        // Past kPrerollMs (2.5 s behind), clip a is retired.
        pool.update(tl, 5500.0);
        QVERIFY2(pool.sourceFor("a") == nullptr, "clip past kPrerollMs was not retired");
    }

    // Jumping across split clips that share one media file adopts the retiring
    // decoder instead of reopening from disk, and never flashes the old clip's frame.
    void sameMediaClipAdoptsRetiringDecoder() {
        FrameCache::shared().clear();
        Timeline tl;
        tl.durationMs = 8000;
        Track track;
        track.id = "t";
        tl.tracks.push_back(track);
        Clip a;
        a.id = "cut-a";
        a.trackId = "t";
        a.startMs = 0;
        a.durationMs = 2000;
        a.inPointMs = 0;
        a.mediaPath = media("numbered-a-1080p30.mp4");
        Clip a2;
        a2.id = "cut-a2";
        a2.trackId = "t";
        a2.startMs = 6000;
        a2.durationMs = 2000;
        a2.inPointMs = 15000;
        a2.mediaPath = media("numbered-a-1080p30.mp4");
        tl.clips.push_back(a);
        tl.clips.push_back(a2);

        std::atomic<int> videoOpens{0};
        SourcePool pool(SourcePool::WorkerReadProbes{[&] { ++videoOpens; }, {}});
        QElapsedTimer t;
        t.start();
        bool exact = false;
        while (!exact && t.elapsed() < 4000) {
            pool.update(tl, 500.0);
            if (auto* src = dynamic_cast<FfmpegSource*>(pool.sourceFor("cut-a"))) {
                auto f = src->decoder().frameAt(0.5);
                exact = f && src->decoder().exact();
            }
            if (!exact) QThread::msleep(2);
        }
        QVERIFY(exact);
        QCOMPARE(videoOpens.load(), 1);

        // Jump past kPrerollMs to cut-a2 (source 16.0 s): cut-a retires and
        // cut-a2 adopts its open decoder with no new file open and no stale frame flash.
        pool.update(tl, 7000.0);
        QVERIFY(pool.sourceFor("cut-a") == nullptr);
        auto* adopted = dynamic_cast<FfmpegSource*>(pool.sourceFor("cut-a2"));
        QVERIFY(adopted != nullptr);
        QCOMPARE(videoOpens.load(), 1);
        auto immediate = adopted->decoder().frameAt(16.0);
        QVERIFY2(!immediate || std::abs(immediate->ptsSec - 16.0) < 0.05,
                 "adopted decoder flashed previous clip's frame");

        t.restart();
        exact = false;
        double pts = -1.0;
        while (!exact && t.elapsed() < 4000) {
            pool.update(tl, 7000.0);
            auto* src = dynamic_cast<FfmpegSource*>(pool.sourceFor("cut-a2"));
            QVERIFY(src != nullptr);
            auto f = src->decoder().frameAt(16.0);
            if (f && src->decoder().exact()) {
                exact = true;
                pts = f->ptsSec;
            } else {
                QThread::msleep(2);
            }
        }
        QVERIFY(exact);
        QCOMPARE(std::lround(pts * 30.0), 480L);
        QCOMPARE(videoOpens.load(), 1);
    }

    // Software decode thread budgeting: solo active video (and single-track
    // cut lookahead) gets auto (0), still images get 1, multi-track active and
    // multi-track upcoming clips get the multi-track cap, and idle recently-
    // passed clips keep their budget to avoid codec rebuilds on backward scrub.
    void softwareThreadBudgetScalesWithActiveTracks() {
        ModeScope scope(DecodeMode::Software);
        FrameCache::shared().clear();

        const int hwCores = std::max(1, static_cast<int>(std::thread::hardware_concurrency()));
        const int expectedMulti = std::clamp((hwCores * 2) / 3, std::min(4, hwCores), 8);

        Timeline tl;
        tl.durationMs = 15000;
        for (int i = 0; i < 4; ++i) {
            Track t;
            t.id = "t" + std::to_string(i);
            tl.tracks.push_back(t);
        }
        Clip v1;
        v1.id = "v1";
        v1.trackId = "t0";
        v1.startMs = 0;
        v1.durationMs = 15000;
        v1.mediaPath = media("numbered-a-1080p30.mp4");

        Clip v2;
        v2.id = "v2";
        v2.trackId = "t1";
        v2.startMs = 2000;
        v2.durationMs = 8000;
        v2.mediaPath = media("numbered-b-1080p30.mp4");

        Clip v3;
        v3.id = "v3";
        v3.trackId = "t2";
        v3.startMs = 2500;
        v3.durationMs = 7500;
        v3.mediaPath = media("numbered-c-1080p30.mp4");

        Clip img;
        img.id = "img";
        img.trackId = "t3";
        img.startMs = 0;
        img.durationMs = 15000;
        img.mediaType = MediaType::Image;
        img.mediaPath = media("numbered-a-1080p30.mp4");

        // Single-track cut lookahead: 1 active video + 1 upcoming cut both get 0.
        Timeline singleCut;
        singleCut.durationMs = 10000;
        singleCut.tracks.push_back(tl.tracks[0]);
        Clip cutA = v1;
        cutA.id = "cutA";
        cutA.durationMs = 2000;
        Clip cutB = v2;
        cutB.id = "cutB";
        cutB.trackId = "t0";
        cutB.startMs = 2000;
        singleCut.clips = {cutA, cutB};
        {
            SourcePool cutPool;
            cutPool.update(singleCut, 1000.0, {"cutA"});
            auto* a = dynamic_cast<FfmpegSource*>(cutPool.sourceFor("cutA"));
            auto* b = dynamic_cast<FfmpegSource*>(cutPool.sourceFor("cutB"));
            QVERIFY(a && b);
            QCOMPARE(a->decoder().softwareThreads(), 0);
            QCOMPARE(b->decoder().softwareThreads(), 0);
        }

        tl.clips = {v1, v2, v3, img};

        SourcePool pool;
        // At 1000 ms: v1 is the sole active video clip, img is an image clip,
        // and v2/v3 are 2 upcoming multi-track clips (pre-opened with expectedMulti).
        pool.update(tl, 1000.0, {"v1", "img"});
        auto* s1 = dynamic_cast<FfmpegSource*>(pool.sourceFor("v1"));
        auto* s2 = dynamic_cast<FfmpegSource*>(pool.sourceFor("v2"));
        auto* s3 = dynamic_cast<FfmpegSource*>(pool.sourceFor("v3"));
        auto* sImg = dynamic_cast<FfmpegSource*>(pool.sourceFor("img"));
        QVERIFY(s1 && s2 && s3 && sImg);
        QCOMPARE(s1->decoder().softwareThreads(), 0);
        QCOMPARE(sImg->decoder().softwareThreads(), 1);
        QCOMPARE(s2->decoder().softwareThreads(), expectedMulti);
        QCOMPARE(s3->decoder().softwareThreads(), expectedMulti);

        // At 4000 ms: v1, v2, v3 are all active video tracks. Each gets the
        // multi-track cap, and resized decoders still seek to exact frames.
        pool.update(tl, 4000.0, {"v1", "v2", "v3", "img"});
        QCOMPARE(s1->decoder().softwareThreads(), expectedMulti);
        QCOMPARE(s2->decoder().softwareThreads(), expectedMulti);
        QCOMPARE(s3->decoder().softwareThreads(), expectedMulti);
        QCOMPARE(sImg->decoder().softwareThreads(), 1);

        QElapsedTimer t;
        t.start();
        bool exact1 = false, exact2 = false;
        double pts1 = -1.0, pts2 = -1.0;
        while ((!exact1 || !exact2) && t.elapsed() < 4000) {
            pool.update(tl, 4000.0, {"v1", "v2", "v3", "img"});
            if (auto f1 = s1->decoder().frameAt(4.0); f1 && s1->decoder().exact()) {
                exact1 = true;
                pts1 = f1->ptsSec;
            }
            if (auto f2 = s2->decoder().frameAt(2.0); f2 && s2->decoder().exact()) {
                exact2 = true;
                pts2 = f2->ptsSec;
            }
            if (!exact1 || !exact2) QThread::msleep(2);
        }
        QVERIFY(exact1);
        QVERIFY(exact2);
        QCOMPARE(std::lround(pts1 * 30.0), 120L);
        QCOMPARE(std::lround(pts2 * 30.0), 60L);

        // At 11000 ms: v1 is solo active again (0), while v2/v3 are recently
        // passed and keep their open thread budget without churn.
        pool.update(tl, 11000.0, {"v1", "img"});
        QCOMPARE(s1->decoder().softwareThreads(), 0);
        QVERIFY(pool.sourceFor("v2") != nullptr);
        QCOMPARE(s2->decoder().softwareThreads(), expectedMulti);
        QCOMPARE(s3->decoder().softwareThreads(), expectedMulti);
    }
};

QTEST_GUILESS_MAIN(TestSourcePool)
#include "tst_sourcepool.moc"
