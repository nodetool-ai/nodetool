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
#include <chrono>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

struct AVFrame;

namespace nt {

// Which decoder a source uses (--decode). Software is the M1b path. Hardware
// decodes with VideoToolbox and fails the clip when that is not possible.
// Auto tries VideoToolbox and falls back to software before the first frame,
// with the reason in the loader report.
enum class DecodeMode { Software, Hardware, Auto };
void setDecodeMode(DecodeMode mode);
DecodeMode decodeMode();

// Test seam: decoders created after this call fail their packet send with
// AVERROR_INVALIDDATA after `packets` packets (once, on the first decoder
// open); -1 turns it off.
void setTestDecodeFailureAfterPackets(int packets);
// Test seam: decoders created after this call fail VideoToolbox setup at
// their open number `open` (0 is the first open, 1 the first reopen); -1 off.
void setTestHardwareSetupFailureOnOpen(int open);
// Test seam: VideoToolbox decoders created after this call block in their
// packet send after `packets` packets, as a VideoToolbox session that never
// returns. The block ignores stop requests; releaseTestStalls() ends every
// such block. -1 turns it off.
void setTestHardwareStallAfterPackets(int packets);
void releaseTestStalls();
// Test seam: VideoToolbox decoders created after this call drop every
// decoded frame after the first `frames`, as a session that accepts packets
// and returns nothing. -1 turns it off.
void setTestHardwareFrameLossAfterFrames(int frames);

// The QoS class of the last decode worker that started (bench diagnostics).
const char* lastDecodeWorkerQos();

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
    std::string decoder;   // "videotoolbox" or "software", once decoding
    std::string fallback;  // why hardware decode was not used (Auto), or empty

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
    // A VideoToolbox frame: `frame->data[3]` is an NV12 CVPixelBufferRef and
    // there are no CPU planes.
    bool hardware = false;
    ~DecodedFrame();
};

// The memory a decoded frame keeps allocated: its padded software buffers,
// or its IOSurface's allocation for a VideoToolbox frame (review F3).
size_t frameBytes(const DecodedFrame& f);

// The watchdog limit: a VideoToolbox decoder with a pending target that makes
// no progress for this long is stalled.
inline constexpr std::chrono::milliseconds kDecoderStallLimit{1000};

class FfmpegDecoder {
public:
    // Starts the worker, which opens `path` and pre-rolls to `initialSec`.
    // `mode` overrides the --decode mode for this decoder.
    FfmpegDecoder(std::string path, double initialSec, std::optional<DecodeMode> mode = std::nullopt);
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

    // Render thread, the watchdog: true when the worker decodes with
    // VideoToolbox, the last frameAt() was not exact (a target is pending),
    // and the worker made no progress (no decoded frame, no idle wait with a
    // full queue) for `limit`. A VideoToolbox session can block in
    // VTDecompressionSessionDecodeFrame, or accept packets and return no frame.
    bool stalled(std::chrono::milliseconds limit = kDecoderStallLimit) const;

    // Stops `decoder` and joins its worker if the worker ends within `grace`.
    // Otherwise the worker is abandoned: its queued frames are dropped now,
    // its thread is detached, and the decoder deletes itself if the worker
    // ever returns. Never blocks longer than `grace`. True when joined.
    static bool stopWithin(std::unique_ptr<FfmpegDecoder> decoder, std::chrono::milliseconds grace);

    // Render thread: a VideoToolbox frame could not be imported to the GPU.
    // Before any hardware frame was shown, Auto reopens in software with the
    // reason as its fallback; otherwise, and in Hardware mode, the clip fails
    // with the reason (D15).
    void reportImportFailure(const std::string& reason, bool hardwareFrameShown);

    // For tests: seeks started (one per restart), reopens after a failed seek
    // or missing timestamps, and the queue state at the last frameAt().
    long long seeks() const { return m_seekCount.load(); }
    // Switches between the software seek decoder and VideoToolbox.
    long long engineSwitches() const { return m_engineSwitches.load(); }
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
    void beat();
    void publishSkipFloor(long long gen, double floorSec);
    static int interruptCallback(void* opaque);

    std::string m_path;
    DecodeMode m_mode = DecodeMode::Software;
    int m_failAfterPackets = -1;  // test seam
    int m_failHardwareOnOpen = -1;  // test seam
    int m_stallAfterPackets = -1;   // test seam
    int m_frameLossAfterFrames = -1;  // test seam
    // Catch-up skipping of non-reference frames (D19). NT_DECODE_SKIP=off
    // turns it off, for the latency A/B in scripts/window-checks.sh.
    bool m_skipNonReference = true;
    // Auto mode decodes seeks in software (NT_SEEK_SOFTWARE=off disables).
    bool m_softwareSeeks = true;
    FrameRing<DecodedFrame> m_ring;

    // Requests from the render thread.
    std::atomic<double> m_targetSec;
    std::atomic<long long> m_requestGen{1};
    double m_restartSec;  // target of the newest restart (render thread)

    std::atomic<long long> m_seekCount{0};
    std::atomic<long long> m_engineSwitches{0};

    // An import failure for the worker to act on (render thread to worker).
    std::mutex m_importMutex;
    std::string m_importFailure;
    bool m_importAfterShown = false;
    std::atomic<bool> m_importFailed{false};
    std::atomic<long long> m_reopenCount{0};

    mutable std::mutex m_factsMutex;
    std::shared_ptr<const MediaFacts> m_facts;

    // Watchdog state the worker writes: the time of its last loop step, and
    // whether it decodes with VideoToolbox.
    std::atomic<long long> m_heartbeatNs{0};
    std::atomic<bool> m_hardwareActive{false};
    // The latest anchor that justified a skipped frame in run `m_skipFloorGen`.
    std::mutex m_skipMutex;
    long long m_skipFloorGen = 0;
    double m_skipFloorSec = -1e300;
    // The worker's end, for a bounded stop.
    std::mutex m_doneMutex;
    std::condition_variable m_doneCv;
    bool m_done = false;
    bool m_abandoned = false;

    std::mutex m_wakeMutex;
    std::condition_variable m_wake;
    std::atomic<bool> m_stop{false};

    // Render thread only.
    std::shared_ptr<DecodedFrame> m_shown;
    bool m_exact = false;
    // A jump of the target (a seek, not playback) holds the shown frame until
    // the exact pick lands, so the frames decoded on the way never show.
    bool m_settling = false;
    double m_lastTargetSec = -1e300;
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
    FfmpegSource(std::string path, double initialSec, QSize nominalSize,
                 std::optional<DecodeMode> mode = std::nullopt);
    ~FfmpegSource() override;

    QSize frameSize() const override;
    LayerFrame frameAt(const FrameContext& ctx, double sourceTimeMs) override;

    FfmpegDecoder& decoder() { return *m_decoder; }
    std::unique_ptr<FfmpegDecoder> takeDecoder();

private:
    bool ensureTextures(QRhi* rhi, const DecodedFrame& f);
    LayerFrame hardwareFrame(const FrameContext& ctx, const std::shared_ptr<DecodedFrame>& shown);

    std::unique_ptr<FfmpegDecoder> m_decoder;
    QSize m_nominalSize;
    std::array<std::unique_ptr<QRhiTexture>, 3> m_planes;
    PlaneLayout m_layout = PlaneLayout::I420;
    QSize m_texSize;
    const DecodedFrame* m_uploaded = nullptr;
    std::shared_ptr<DecodedFrame> m_uploadedRef;  // keeps the uploaded frame alive

    // Hardware frames (D11): the displayed FrameRef, the frame it wraps, the
    // last frame number that drew with it, and where to retire it.
    std::shared_ptr<void> m_frameRef;
    bool m_importOk = false;        // a hardware frame was imported and shown
    bool m_importReported = false;  // the decoder was told about a failure
    const DecodedFrame* m_wrapped = nullptr;
    long long m_lastUseFrame = 0;
    RetireQueue* m_retire = nullptr;
};

}  // namespace nt
