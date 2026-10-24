// SourcePool lifetime (F2): closing a clip never blocks the render thread on
// a decoder's I/O, and the FFmpeg interrupt callback ends a blocked read so
// the decoder is joined soon after.

#include "preview/FfmpegSource.h"
#include "preview/SourcePool.h"

#include <QElapsedTimer>
#include <QTest>
#include <QThread>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

using namespace nt;

namespace {

// A TCP listener that accepts connections (through the backlog) and never
// sends a byte: FFmpeg's read on it blocks until interrupted.
class StalledServer {
public:
    StalledServer() {
        m_fd = ::socket(AF_INET, SOCK_STREAM, 0);
        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        addr.sin_port = 0;
        ::bind(m_fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
        ::listen(m_fd, 4);
        socklen_t len = sizeof(addr);
        ::getsockname(m_fd, reinterpret_cast<sockaddr*>(&addr), &len);
        m_port = ntohs(addr.sin_port);
    }
    ~StalledServer() { ::close(m_fd); }
    std::string url() const { return "tcp://127.0.0.1:" + std::to_string(m_port); }

private:
    int m_fd = -1;
    int m_port = 0;
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

}  // namespace

class TestSourcePool : public QObject {
    Q_OBJECT

private slots:
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
};

QTEST_GUILESS_MAIN(TestSourcePool)
#include "tst_sourcepool.moc"
