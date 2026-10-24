#pragma once

// Software decode of one clip's media with FFmpeg (DESIGN.md D13, D14, D16,
// D17, D10a). `FfmpegDecoder` is the GPU-free core: a worker thread opens,
// demuxes and decodes ahead into a FrameRing, and the render thread picks the
// D17 frame for its target time. `FfmpegSource` wraps it as a LayerSource and
// uploads the picked frame's planes as textures.

#include "preview/FrameRing.h"
#include "preview/LayerSource.h"
#include "preview/YuvFormat.h"

#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

struct AVFrame;

namespace nt {

// What opening a stream found out (D10a facts) and why it was refused.
struct MediaFacts {
    bool opened = false;
    std::string error;      // open, seek or decode failure; empty when fine
    std::string rejection;  // "rotation", "pixel-aspect", "alpha", "hdr" or empty
    int width = 0;
    int height = 0;
    double frameRate = 0.0;     // frames per second; 0 when unknown
    bool constantRate = false;  // average and base rate agree (CFR)
    double durationSec = 0.0;   // 0 when unknown
    std::string codec;
    std::string pixelFormat;
    double rotationDeg = 0.0;
    int sarNum = 1;
    int sarDen = 1;
    std::string transfer;

    bool usable() const { return opened && rejection.empty() && error.empty(); }
};

// Opens `path` only to read its facts (no decode). Blocking; call it off the
// render thread.
MediaFacts probeMedia(const std::string& path);

// One decoded frame. It owns its AVFrame (planes in I420 or NV12, 8-bit), and
// its matrix and range describe those planes as stored.
struct DecodedFrame {
    AVFrame* frame = nullptr;
    double ptsSec = 0.0;
    long long generation = 0;
    PlaneLayout layout = PlaneLayout::I420;
    YuvMatrix matrix = YuvMatrix::Bt709;
    YuvRange range = YuvRange::Limited;
    int width = 0;
    int height = 0;
    ~DecodedFrame();
};

class FfmpegDecoder {
public:
    // Starts the worker, which opens `path` and pre-rolls to `initialSec`.
    FfmpegDecoder(std::string path, double initialSec);
    // Stops the worker: an interrupt callback ends blocking FFmpeg I/O, then
    // the thread is joined. Call it off the render thread (SourcePool retires
    // decoders on its own thread).
    ~FfmpegDecoder();
    FfmpegDecoder(const FfmpegDecoder&) = delete;
    FfmpegDecoder& operator=(const FfmpegDecoder&) = delete;

    // Render thread. Sets the target and returns the frame to show: the D17
    // pick when it is decoded, else the frame shown last (hold), or null
    // before the first frame. Never blocks on decode.
    std::shared_ptr<DecodedFrame> frameAt(double targetSec);

    // Whether the last frameAt() returned the exact D17 pick: in one queue
    // snapshot, the shown frame was the pick of the current seek, and a later
    // frame was queued or the stream had ended.
    bool exact() const { return m_exact; }

    // Facts once the worker opened the stream (opened or failed), else null.
    std::shared_ptr<const MediaFacts> facts() const;

    // Asks the worker to stop; the destructor waits for it.
    void requestStop();

    // For tests: seeks started (one per restart), reopens after a failed seek
    // or missing timestamps, and the queue state at the last frameAt().
    long long seeks() const { return m_seekCount.load(); }
    long long reopens() const { return m_reopenCount.load(); }
    int queuedFrames() const { return m_lastQueued; }
    double newestQueuedPts() const { return m_lastNewest; }

    // Test seam: a decoder with no worker, whose queue the test fills.
    struct NoWorkerForTest {};
    explicit FfmpegDecoder(NoWorkerForTest);
    void testPush(double ptsSec);  // a frame of the current generation
    // Runs inside frameAt() after the queue snapshot, where a worker could
    // change the queue concurrently.
    void setTestHook(std::function<void()> hook) { m_testHook = std::move(hook); }

private:
    void run();
    void publishFacts(const MediaFacts& facts);
    static int interruptCallback(void* opaque);

    std::string m_path;
    FrameRing<DecodedFrame> m_ring;

    // Requests from the render thread.
    std::atomic<double> m_targetSec;
    std::atomic<long long> m_requestGen{1};
    double m_restartSec;  // target of the newest restart (render thread)

    std::atomic<long long> m_seekCount{0};
    std::atomic<long long> m_reopenCount{0};

    mutable std::mutex m_factsMutex;
    std::shared_ptr<const MediaFacts> m_facts;

    std::mutex m_wakeMutex;
    std::condition_variable m_wake;
    std::atomic<bool> m_stop{false};

    // Render thread only.
    std::shared_ptr<DecodedFrame> m_shown;
    bool m_exact = false;
    int m_lastQueued = 0;
    double m_lastNewest = -1e300;

    std::function<void()> m_testHook;
    std::thread m_thread;
};

// A LayerSource that draws an FfmpegDecoder's frames. Owns its plane textures
// and recreates them only on a size or layout change (D11). The decoder can
// be taken out (takeDecoder) so it is stopped and joined off the render
// thread while the textures are released on it.
class FfmpegSource final : public LayerSource {
public:
    FfmpegSource(std::string path, double initialSec, QSize nominalSize);
    ~FfmpegSource() override;

    QSize frameSize() const override;
    LayerFrame frameAt(QRhi* rhi, QRhiResourceUpdateBatch* updates, double sourceTimeMs) override;

    FfmpegDecoder& decoder() { return *m_decoder; }
    std::unique_ptr<FfmpegDecoder> takeDecoder();

private:
    bool ensureTextures(QRhi* rhi, const DecodedFrame& f);

    std::unique_ptr<FfmpegDecoder> m_decoder;
    QSize m_nominalSize;
    std::array<std::unique_ptr<QRhiTexture>, 3> m_planes;
    PlaneLayout m_layout = PlaneLayout::I420;
    QSize m_texSize;
    const DecodedFrame* m_uploaded = nullptr;
    std::shared_ptr<DecodedFrame> m_uploadedRef;  // keeps the uploaded frame alive
};

}  // namespace nt
