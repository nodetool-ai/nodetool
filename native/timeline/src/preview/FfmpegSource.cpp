#include "preview/FfmpegSource.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/hwcontext.h>
#include <libavformat/avformat.h>
#include <libavutil/display.h>
#include <libavutil/imgutils.h>
#include <libavutil/pixdesc.h>
#include <libswscale/swscale.h>
}

#include "platform/CpuUsage.h"
#include "preview/FrameCache.h"
#include "preview/RetireQueue.h"
#include "preview/hw/HwInterop.h"

#include <QByteArray>
#include <QString>

#include <chrono>
#include <cmath>
#include <optional>

namespace nt {

namespace {
std::atomic<DecodeMode> g_decodeMode{DecodeMode::Software};
}  // namespace

void setDecodeMode(DecodeMode mode) {
    g_decodeMode = mode;
}

DecodeMode decodeMode() {
    return g_decodeMode.load();
}

namespace {
std::atomic<int> g_testFailAfterPackets{-1};
}  // namespace

void setTestDecodeFailureAfterPackets(int packets) {
    g_testFailAfterPackets = packets;
}

namespace {
std::atomic<int> g_testFailHardwareOnOpen{-1};
}  // namespace

void setTestHardwareSetupFailureOnOpen(int open) {
    g_testFailHardwareOnOpen = open;
}

namespace {
std::atomic<int> g_testStallAfterPackets{-1};
std::atomic<int> g_testFrameLossAfterFrames{-1};
std::mutex g_testStallMutex;
std::condition_variable g_testStallCv;
long long g_testStallRelease = 0;  // bumped by releaseTestStalls()

// Blocks like a VideoToolbox call that never returns, until the test releases it.
void testStall() {
    std::unique_lock lock(g_testStallMutex);
    const long long release = g_testStallRelease;
    g_testStallCv.wait(lock, [&] { return g_testStallRelease != release; });
}
}  // namespace

void setTestHardwareFrameLossAfterFrames(int frames) {
    g_testFrameLossAfterFrames = frames;
}

void setTestHardwareStallAfterPackets(int packets) {
    g_testStallAfterPackets = packets;
}

void releaseTestStalls() {
    {
        std::lock_guard lock(g_testStallMutex);
        ++g_testStallRelease;
    }
    g_testStallCv.notify_all();
}

namespace {
std::atomic<const char*> g_decodeWorkerQos{"none"};
}  // namespace

const char* lastDecodeWorkerQos() {
    return g_decodeWorkerQos.load();
}

namespace {

struct FormatCloser {
    void operator()(AVFormatContext* f) const { avformat_close_input(&f); }
};
struct CodecCloser {
    void operator()(AVCodecContext* c) const { avcodec_free_context(&c); }
};
struct FrameFree {
    void operator()(AVFrame* f) const { av_frame_free(&f); }
};
struct PacketFree {
    void operator()(AVPacket* p) const { av_packet_free(&p); }
};
struct BufferUnref {
    void operator()(AVBufferRef* b) const { av_buffer_unref(&b); }
};
struct SwsFree {
    void operator()(SwsContext* s) const { sws_freeContext(s); }
};

std::string avError(int code) {
    char buf[AV_ERROR_MAX_STRING_SIZE] = {};
    av_strerror(code, buf, sizeof(buf));
    return buf;
}

double rationalToDouble(AVRational r) {
    return r.den == 0 ? 0.0 : static_cast<double>(r.num) / r.den;
}

// D10a facts of an opened stream, and the web's rejection order
// (`decodeRejection`): rotation, pixel aspect, alpha, HDR.
MediaFacts factsFor(AVFormatContext* fmt, AVStream* st) {
    MediaFacts f;
    f.opened = true;
    const AVCodecParameters* par = st->codecpar;
    f.width = par->width;
    f.height = par->height;
    f.frameRate = rationalToDouble(st->avg_frame_rate);
    f.constantRate = st->avg_frame_rate.num > 0 && av_cmp_q(st->avg_frame_rate, st->r_frame_rate) == 0;
    if (fmt->duration != AV_NOPTS_VALUE) f.durationSec = static_cast<double>(fmt->duration) / AV_TIME_BASE;
    f.codec = avcodec_get_name(par->codec_id);
    const auto pixFmt = static_cast<AVPixelFormat>(par->format);
    const AVPixFmtDescriptor* desc = av_pix_fmt_desc_get(pixFmt);
    f.pixelFormat = desc ? desc->name : "unknown";
    if (const AVPacketSideData* sd =
            av_packet_side_data_get(par->coded_side_data, par->nb_coded_side_data, AV_PKT_DATA_DISPLAYMATRIX)) {
        const double rot = av_display_rotation_get(reinterpret_cast<const int32_t*>(sd->data));
        f.rotationDeg = std::isnan(rot) ? 0.0 : rot;
    }
    if (par->sample_aspect_ratio.num > 0 && par->sample_aspect_ratio.den > 0) {
        f.sarNum = par->sample_aspect_ratio.num;
        f.sarDen = par->sample_aspect_ratio.den;
    }
    const char* trc = av_color_transfer_name(par->color_trc);
    f.transfer = trc ? trc : "unknown";

    const AVDictionaryEntry* alphaMode = av_dict_get(st->metadata, "alpha_mode", nullptr, 0);
    const bool alpha = (desc && (desc->flags & AV_PIX_FMT_FLAG_ALPHA)) || (alphaMode && std::string(alphaMode->value) == "1");
    const bool hdr = par->color_trc == AVCOL_TRC_SMPTE2084 || par->color_trc == AVCOL_TRC_ARIB_STD_B67;
    const long rotation = std::lround(f.rotationDeg) % 360;
    if (rotation != 0) {
        f.rejection = "rotation";
    } else if (f.sarNum != f.sarDen) {
        f.rejection = "pixel-aspect";
    } else if (alpha) {
        f.rejection = "alpha";
    } else if (hdr) {
        f.rejection = "hdr";
    }
    return f;
}

struct Opened {
    std::unique_ptr<AVFormatContext, FormatCloser> fmt;
    AVStream* stream = nullptr;
    const AVCodec* codec = nullptr;
    MediaFacts facts;
};

// Opens the container. `interrupt` (may be null) lets the owner cancel any
// blocking I/O FFmpeg does here and in later reads.
Opened openStream(const std::string& path, const AVIOInterruptCB* interrupt) {
    Opened o;
    AVFormatContext* raw = avformat_alloc_context();
    if (interrupt) raw->interrupt_callback = *interrupt;
    int rc = avformat_open_input(&raw, path.c_str(), nullptr, nullptr);
    if (rc < 0) {
        o.facts.error = "open: " + avError(rc);
        return o;  // avformat_open_input freed the context
    }
    o.fmt.reset(raw);
    rc = avformat_find_stream_info(raw, nullptr);
    if (rc < 0) {
        o.facts.error = "stream info: " + avError(rc);
        return o;
    }
    rc = av_find_best_stream(raw, AVMEDIA_TYPE_VIDEO, -1, -1, &o.codec, 0);
    if (rc < 0) {
        o.facts.error = "no video stream";
        return o;
    }
    o.stream = raw->streams[rc];
    o.facts = factsFor(raw, o.stream);
    return o;
}

YuvMatrix matrixFor(AVColorSpace cs, int height) {
    switch (cs) {
    case AVCOL_SPC_BT709: return YuvMatrix::Bt709;
    case AVCOL_SPC_BT470BG:
    case AVCOL_SPC_SMPTE170M: return YuvMatrix::Bt601;
    default: return defaultMatrixForHeight(height);
    }
}

// The decoder state the worker owns: container, codec, and the timestamp
// bookkeeping for one pass through the stream.
struct Stream {
    Opened o;
    std::unique_ptr<AVCodecContext, CodecCloser> ctx;
    std::unique_ptr<AVBufferRef, BufferUnref> hwDevice;
    bool hardware = false;   // decoding with VideoToolbox
    bool gotFrame = false;   // a frame came out since the stream opened
    double tb = 0.0;
    int64_t start = 0;
    double frameDur = 1.0 / 30.0;
    bool draining = false;
    bool eof = false;
    // True while decoding from the first packet: the first timestamp-less
    // frame is then frame 0. False after a seek, where it is unknown.
    bool fromStart = true;
    std::optional<double> lastPts;  // unset until a frame is placed
};

// Sets up the platform's hardware decoder on `ctx` (D15, hw/HwInterop.h).
// Empty on success, else why not.
std::string setUpHardware(Stream& s) {
    AVBufferRef* device = nullptr;
    const std::string reason = hw::setUpDecoder(s.ctx.get(), s.o.codec, s.o.facts.codec, &device);
    if (device) s.hwDevice.reset(device);
    return reason;
}

// Opens the container and the codec. With `hardware`, it tries VideoToolbox
// first and writes why not into `hwReason` when that fails.
bool openDecoder(Stream& s, const std::string& path, const AVIOInterruptCB* interrupt, bool hardware,
                 std::string* hwReason, bool failHardwareForTest = false) {
    s.o = openStream(path, interrupt);
    s.ctx.reset();
    s.hwDevice.reset();
    s.hardware = false;
    s.gotFrame = false;
    if (!s.o.facts.usable()) return false;
    s.ctx.reset(avcodec_alloc_context3(s.o.codec));
    avcodec_parameters_to_context(s.ctx.get(), s.o.stream->codecpar);
    if (hardware) {
        const std::string reason = failHardwareForTest ? std::string(hw::apiName()) + " setup failed (test)" : setUpHardware(s);
        s.hardware = reason.empty();
        if (hwReason) *hwReason = reason;
    }
    if (s.hardware) {
        s.ctx->thread_count = 1;  // VideoToolbox decodes on its own threads
    } else {
        s.ctx->thread_count = 2;  // D14
        s.ctx->thread_type = FF_THREAD_FRAME;
    }
    const int rc = avcodec_open2(s.ctx.get(), s.o.codec, nullptr);
    if (rc < 0) {
        s.o.facts.error = "codec open: " + avError(rc);
        return false;
    }
    AVStream* st = s.o.stream;
    s.tb = rationalToDouble(st->time_base);
    s.start = st->start_time == AV_NOPTS_VALUE ? 0 : st->start_time;
    // The codec's own rate (an H.264 VUI timing) is the better guess for a
    // raw stream, where the container rate is a default.
    const double codecRate = rationalToDouble(s.ctx->framerate);
    if (s.o.facts.frameRate <= 0.0 || (codecRate > 0.0 && st->start_time == AV_NOPTS_VALUE)) {
        s.o.facts.frameRate = codecRate > 0.0 ? codecRate : 30.0;
    }
    s.frameDur = 1.0 / s.o.facts.frameRate;
    s.o.facts.decoder = s.hardware ? hw::decoderName() : "software";
    s.draining = false;
    s.eof = false;
    s.fromStart = true;
    s.lastPts.reset();
    return true;
}

// A container time base coarser than the frame grid rounds frame times: in
// WebM (1/1000 s) frame 2 of 30 fps footage is stored as 67 ms, after its true
// start at 66.67 ms, and a target of 66.67 ms would show frame 1. The stored
// time only says the true time is within half a tick, so a time that close
// to the grid of the stream's rate is moved onto it. A time further off the
// grid (a real variable rate) is kept as stored.
double snapToFrameGrid(double ptsSec, double tb, double frameDur) {
    if (tb <= 0.0 || frameDur <= 0.0) return ptsSec;
    const double grid = std::round(ptsSec / frameDur) * frameDur;
    return std::abs(grid - ptsSec) <= tb / 2.0 + kTimestampEpsilonSec ? grid : ptsSec;
}

// Whether a hardware frame is one the interop wraps. Empty when it is,
// else why not.
std::string checkHardwareFrame(const AVFrame* frame) {
    return hw::checkFrame(frame);
}

}  // namespace

MediaFacts probeMedia(const std::string& path) {
    // Facts only; the decoder in use is known once a source decodes.
    return openStream(path, nullptr).facts;
}

size_t frameBytes(const DecodedFrame& f) {
    if (!f.frame) return 0;
    if (f.hardware) {
        // The surface allocation, with its row and plane alignment.
        return hw::frameBytes(f.frame);
    }
    // The distinct buffers behind the planes, with their padding.
    size_t bytes = 0;
    for (int i = 0; i < AV_NUM_DATA_POINTERS && f.frame->buf[i]; ++i) {
        bool seen = false;
        for (int j = 0; j < i; ++j) seen = seen || f.frame->buf[j]->buffer == f.frame->buf[i]->buffer;
        if (!seen) bytes += f.frame->buf[i]->size;
    }
    return bytes;
}

DecodedFrame::~DecodedFrame() {
    av_frame_free(&frame);
}

FfmpegDecoder::FfmpegDecoder(std::string path, double initialSec, std::optional<DecodeMode> mode)
    : m_path(std::move(path)),
      m_mode(mode.value_or(decodeMode())),
      m_failAfterPackets(g_testFailAfterPackets.load()),
      m_failHardwareOnOpen(g_testFailHardwareOnOpen.load()),
      m_stallAfterPackets(g_testStallAfterPackets.load()),
      m_frameLossAfterFrames(g_testFrameLossAfterFrames.load()),
      m_skipNonReference(qEnvironmentVariable("NT_DECODE_SKIP") != QLatin1String("off")),
      m_targetSec(initialSec),
      m_restartSec(initialSec) {
    beat();
    m_thread = std::thread([this] {
        run();
        std::unique_lock lock(m_doneMutex);
        m_done = true;
        if (m_abandoned) {
            // stopWithin() gave up on this worker and detached it: nothing
            // else owns the decoder now.
            lock.unlock();
            delete this;
            return;
        }
        m_doneCv.notify_all();
    });
}

FfmpegDecoder::FfmpegDecoder(NoWorkerForTest) : m_targetSec(0.0), m_restartSec(0.0), m_done(true) {
    m_ring.reset(m_requestGen.load());
}

void FfmpegDecoder::publishSkipFloor(long long gen, double floorSec) {
    std::lock_guard lock(m_skipMutex);
    if (m_skipFloorGen != gen) {
        m_skipFloorGen = gen;
        m_skipFloorSec = floorSec;
    } else {
        m_skipFloorSec = std::max(m_skipFloorSec, floorSec);
    }
}

void FfmpegDecoder::beat() {
    m_heartbeatNs = std::chrono::duration_cast<std::chrono::nanoseconds>(
                        std::chrono::steady_clock::now().time_since_epoch())
                        .count();
}

bool FfmpegDecoder::stalled(std::chrono::milliseconds limit) const {
    const long long now = std::chrono::duration_cast<std::chrono::nanoseconds>(
                              std::chrono::steady_clock::now().time_since_epoch())
                              .count();
    if (!m_hardwareActive.load() || m_exact) return false;
    return now - m_heartbeatNs.load() > std::chrono::duration_cast<std::chrono::nanoseconds>(limit).count();
}

bool FfmpegDecoder::stopWithin(std::unique_ptr<FfmpegDecoder> decoder, std::chrono::milliseconds grace) {
    if (!decoder) return true;
    decoder->requestStop();
    std::unique_lock lock(decoder->m_doneMutex);
    if (decoder->m_doneCv.wait_for(lock, grace, [&] { return decoder->m_done; })) {
        lock.unlock();
        decoder.reset();  // the worker has returned: the join is immediate
        return true;
    }
    // The worker is blocked in a call that does not return (a VideoToolbox
    // session). Its queued frames, and their decoder surfaces, go now; the
    // frame in its own call stack stays until the call returns.
    decoder->m_ring.reset(decoder->m_requestGen.load() + 1);
    decoder->m_abandoned = true;
    decoder->m_thread.detach();
    lock.unlock();
    (void)decoder.release();  // the worker deletes it if it ever returns
    return false;
}

void FfmpegDecoder::testPush(double ptsSec) {
    auto f = std::make_shared<DecodedFrame>();
    f->ptsSec = ptsSec;
    f->generation = m_requestGen.load();
    m_ring.push(std::move(f));
}

void FfmpegDecoder::reportImportFailure(const std::string& reason, bool hardwareFrameShown) {
    {
        std::lock_guard lock(m_importMutex);
        m_importFailure = reason;
        m_importAfterShown = hardwareFrameShown;
    }
    m_importFailed = true;
    m_wake.notify_one();
}

void FfmpegDecoder::requestStop() {
    m_stop = true;
    m_wake.notify_all();
}

FfmpegDecoder::~FfmpegDecoder() {
    requestStop();
    if (m_thread.joinable()) m_thread.join();
}

int FfmpegDecoder::interruptCallback(void* opaque) {
    return static_cast<FfmpegDecoder*>(opaque)->m_stop.load() ? 1 : 0;
}

void FfmpegDecoder::publishFacts(const MediaFacts& facts) {
    std::lock_guard lock(m_factsMutex);
    m_facts = std::make_shared<const MediaFacts>(facts);
}

std::shared_ptr<const MediaFacts> FfmpegDecoder::facts() const {
    std::lock_guard lock(m_factsMutex);
    return m_facts;
}

std::shared_ptr<DecodedFrame> FfmpegDecoder::frameAt(double targetSec) {
    m_targetSec = targetSec;
    // One snapshot: the pick, whether a later frame is queued, end of
    // stream, and the generation they belong to (F1).
    auto snap = m_ring.pick(targetSec);
    const long long gen = m_requestGen.load();
    // A paused scrub checks the cache before it seeks (D19): a frame decoded
    // earlier that the cache proves is the D17 pick is shown now, exact, and
    // the decoder is left where it is.
    const bool queueHasPick = snap.front && snap.generation == gen && snap.front->generation == gen &&
                              frameStartsBy(snap.front->ptsSec, targetSec) && (snap.frameAfter || snap.eof);
    if (!queueHasPick) {
        if (auto cached = FrameCache::shared().lookup(m_path, targetSec)) {
            m_shown = std::move(cached);
            m_exact = true;
            m_lastQueued = snap.size;
            m_lastNewest = snap.newestPts;
            return m_shown;
        }
    }
    const bool queueCurrent = snap.generation == gen;
    m_lastQueued = snap.size;
    m_lastNewest = snap.newestPts;
    // The decoder's position: where the last seek put it, or the frame it
    // has reached past that. Frames still catching up to a seek count as the
    // seek target, so a pending seek is not restarted every frame.
    double position = m_restartSec;
    {
        // Frames before the skip floor may have been skipped: a target there
        // needs a new run.
        std::lock_guard lock(m_skipMutex);
        if (m_skipFloorGen == gen) position = std::max(position, m_skipFloorSec);
    }
    if (queueCurrent && snap.front) {
        position = std::max(position, snap.front->ptsSec);
    } else if (queueCurrent && m_shown && m_shown->generation == gen) {
        position = std::max(position, m_shown->ptsSec);
    }
    const double newest = queueCurrent ? snap.newestPts : -1e300;
    const bool backward = targetSec < position - kTimestampEpsilonSec;
    const bool farForward = targetSec - std::max(position, newest) > kMaxSequentialGapSec;
    long long current = gen;
    if (backward || farForward) {
        m_restartSec = targetSec;
        current = gen + 1;
        m_requestGen = current;
        snap = {};
    }
    m_wake.notify_one();
    if (m_testHook) m_testHook();

    const bool pickReady = snap.front && snap.generation == current && snap.front->generation == current &&
                           frameStartsBy(snap.front->ptsSec, targetSec);
    if (pickReady) {
        m_shown = snap.front;  // a superseded seek's frame stays until this lands
    }
    m_exact = pickReady && (snap.frameAfter || snap.eof);
    return m_shown;
}

void FfmpegDecoder::run() {
    g_decodeWorkerQos = cpu::currentThreadQos();
    const AVIOInterruptCB interrupt{&FfmpegDecoder::interruptCallback, this};
    const DecodeMode mode = m_mode;
    Stream s;
    std::string fallback;  // why VideoToolbox is not used, in Auto
    int opens = 0;
    // One open policy for the first open and every reopen (F4). With
    // VideoToolbox wanted, a setup or codec-open failure fails the clip in
    // Hardware mode and continues in software in Auto, with the reason.
    const auto openWithPolicy = [&](bool wantHardware) -> bool {
        beat();
        m_hardwareActive = false;
        std::string reason;
        bool ok = openDecoder(s, m_path, &interrupt, wantHardware, &reason, m_failHardwareOnOpen == opens++);
        const bool streamFine = s.o.facts.opened && s.o.facts.rejection.empty();
        if (wantHardware && streamFine && (!ok || !s.hardware)) {
            if (!ok) reason = s.o.facts.error;  // the codec did not open with VideoToolbox
            if (mode == DecodeMode::Hardware) {
                MediaFacts failed = s.o.facts;
                failed.error = "hardware decode: " + reason;
                failed.fallback = fallback;
                publishFacts(failed);
                return false;
            }
            fallback = reason;
            if (!ok) ok = openDecoder(s, m_path, &interrupt, false, nullptr);
        }
        MediaFacts facts = s.o.facts;
        facts.fallback = fallback;
        if (!ok && facts.error.empty() && facts.rejection.empty()) facts.error = "open failed";
        publishFacts(facts);
        beat();
        m_hardwareActive = ok && s.hardware;
        return ok;
    };
    if (!openWithPolicy(mode != DecodeMode::Software)) {
        return;  // rejected or failed: the pool draws a placeholder
    }

    std::unique_ptr<AVPacket, PacketFree> pkt(av_packet_alloc());
    std::unique_ptr<AVFrame, FrameFree> frm(av_frame_alloc());
    std::unique_ptr<SwsContext, SwsFree> sws;
    long long workerGen = 0;
    double seekTarget = 0.0;
    double lastCachedPts = -1.0;  // the frame this run cached last
    double anchorSec = -1e300;  // the latest packet start of this run that starts by the target
    // Every frame skipped in this run starts before this floor, so two frames
    // decoded at or after it are neighbours in presentation order.
    double runSkipFloor = -1e300;

    // Open GOP: whether this run has decoded a frame that starts by the
    // target, and how far before the target the last re-seek went.
    bool runHasPick = false;
    double reseekBackSec = 0.0;

    // Reopens the input to decode from its first packet: the recovery when a
    // seek fails, or when frames after a seek carry no timestamps (F3, F4).
    // `hardware` keeps or drops VideoToolbox.
    const auto reopen = [&](bool hardware) -> bool {
        ++m_reopenCount;
        return openWithPolicy(hardware);
    };
    bool pendingPacket = false;  // `pkt` holds a packet the decoder refused with EAGAIN
    // Seeks to the random access point at or before `sec`; on a failed seek,
    // reopens to decode from the first packet. False when that fails too.
    const auto seekTo = [&](double sec) -> bool {
        AVStream* st = s.o.stream;
        const int64_t ts =
            s.start + av_rescale_q(std::llround(std::max(0.0, sec) * AV_TIME_BASE), AV_TIME_BASE_Q, st->time_base);
        if (av_seek_frame(s.o.fmt.get(), st->index, ts, AVSEEK_FLAG_BACKWARD) >= 0) {
            avcodec_flush_buffers(s.ctx.get());
            s.draining = false;
            s.eof = false;
            s.fromStart = false;
            s.lastPts.reset();
            return true;
        }
        return reopen(s.hardware);
    };
    // Sends a packet; the test seam fails one send after N packets.
    int packetsSent = 0;
    int failAfter = m_failAfterPackets;
    int stallAfter = m_stallAfterPackets;
    const int lossAfter = m_frameLossAfterFrames;
    int hwFramesSeen = 0;
    const auto sendPacket = [&](AVPacket* packet) -> int {
        if (s.hardware && stallAfter >= 0 && stallAfter-- == 0) testStall();
        if (failAfter >= 0 && packetsSent++ >= failAfter) {
            failAfter = -1;
            return AVERROR_INVALIDDATA;
        }
        return avcodec_send_packet(s.ctx.get(), packet);
    };
    // VideoToolbox failed before its first frame: Auto continues in software
    // from the same position (D15), Hardware fails the clip.
    const auto hardwareFailed = [&](const std::string& reason, long long gen) -> bool {
        if (mode == DecodeMode::Hardware) {
            MediaFacts failed = s.o.facts;
            failed.error = "hardware decode: " + reason;
            publishFacts(failed);
            return false;
        }
        fallback = reason;
        if (!reopen(false)) return false;
        m_ring.reset(gen);
        return true;
    };

    // The watchdog's progress marks (beat): an open, a seek, a decoded frame,
    // and an idle wait with a full queue. Packets read or accepted are not
    // progress: a VideoToolbox session can accept every packet and return no
    // frame (seen on open-GOP HEVC under fast seeking), reach the end of the
    // stream and sit there with the target never decoded. A worker blocked in
    // a call makes no progress either.
    while (!m_stop) {
        const long long gen = m_requestGen.load();
        const double target = m_targetSec.load();
        if (m_importFailed.exchange(false)) {
            std::string reason;
            bool afterShown = false;
            {
                std::lock_guard lock(m_importMutex);
                reason = "GPU import: " + m_importFailure;
                afterShown = m_importAfterShown;
            }
            if (s.hardware && mode == DecodeMode::Auto && !afterShown) {
                fallback = reason;
                if (!reopen(false)) return;
                m_ring.reset(gen);
                workerGen = 0;  // seek the software decoder to the target
                continue;
            }
            MediaFacts failed = s.o.facts;
            failed.error = "hardware decode: " + reason;
            failed.fallback = fallback;
            publishFacts(failed);
            return;  // the pool shows a placeholder with the reason
        }
        if (gen != workerGen) {
            seekTarget = target;
            lastCachedPts = -1.0;  // a seek breaks the run: no successor link across it
            anchorSec = -1e300;
            runSkipFloor = -1e300;
            if (pendingPacket) {  // a packet from before the seek
                av_packet_unref(pkt.get());
                pendingPacket = false;
            }
            // From the first packet, a target within the sequential gap
            // decodes through: no seek, which also serves streams with no
            // seek index (a raw Annex-B file).
            const bool decodeThrough = s.fromStart && !s.lastPts && target <= kMaxSequentialGapSec;
            runHasPick = false;
            reseekBackSec = 0.0;
            if (!decodeThrough && !seekTo(target)) {
                return;  // the failure is in the facts: the pool shows a placeholder
            }
            m_ring.reset(gen);
            workerGen = gen;
            ++m_seekCount;
            beat();
        }
        if (s.eof || !wantsMoreFrames(m_ring.size(), m_ring.newestPts(), target)) {
            // A full queue is idle, not stalled. The end of the stream is no
            // progress: with a target still pending there, frames were lost.
            if (!s.eof) beat();
            std::unique_lock lock(m_wakeMutex);
            m_wake.wait_for(lock, std::chrono::milliseconds(10));
            continue;
        }

        // Send and receive errors take one path (F3). EAGAIN from send keeps
        // the packet for after the next receive; EOF is the end, not an
        // error. Any other error before VideoToolbox's first frame falls back
        // (Auto) or fails the clip (Hardware); later, it fails the clip with
        // the reason, so the report never says "ok" over a frozen picture.
        const auto decodeError = [&](int code, const char* where) -> bool {
            const std::string reason = std::string(where) + ": " + avError(code);
            if (s.hardware && !s.gotFrame) {
                if (!hardwareFailed(std::string(hw::apiName()) + " decode " + reason, gen)) return false;
                pendingPacket = false;
                av_packet_unref(pkt.get());
                workerGen = 0;  // seek the software decoder to the target
                return true;
            }
            MediaFacts failed = s.o.facts;
            failed.error = "decode failed" + (s.lastPts ? " after " + std::to_string(*s.lastPts) + " s" : std::string()) +
                           " (" + reason + ")";
            failed.fallback = fallback;
            publishFacts(failed);
            return false;
        };

        int rc = avcodec_receive_frame(s.ctx.get(), frm.get());
        if (rc == AVERROR(EAGAIN)) {
            if (s.draining) {
                s.eof = true;
                m_ring.setEof(gen);
                continue;
            }
            if (!pendingPacket) {
                rc = av_read_frame(s.o.fmt.get(), pkt.get());
                if (rc == AVERROR_EOF) {
                    const int drain = avcodec_send_packet(s.ctx.get(), nullptr);
                    if (drain < 0 && drain != AVERROR_EOF && !decodeError(drain, "drain")) return;
                    s.draining = true;
                    continue;
                }
                if (rc < 0) {
                    if (m_stop) return;  // the interrupt callback ended the read
                    if (!decodeError(rc, "read")) return;
                    continue;
                }
                if (pkt->stream_index != s.o.stream->index) {
                    av_packet_unref(pkt.get());
                    continue;
                }
                pendingPacket = true;
                // Catching up to a target after a seek, a non-reference frame
                // is skipped only when it provably cannot be the D17 pick: a
                // packet read earlier in this run starts later than it and by
                // the target (its anchor). Reference status says nothing about
                // display, so a frame before a long presentation gap decodes
                // (review F2). The anchor becomes the run's skip floor: a
                // target below it restarts the decoder.
                bool skip = false;
                if (pkt->pts != AV_NOPTS_VALUE) {
                    const double packetSec = static_cast<double>(pkt->pts - s.start) * s.tb;
                    skip = m_skipNonReference && packetSec < anchorSec - kTimestampEpsilonSec;
                    if (skip) {
                        publishSkipFloor(gen, anchorSec);
                        runSkipFloor = std::max(runSkipFloor, anchorSec);
                    }
                    if (frameStartsBy(packetSec, m_targetSec.load())) anchorSec = std::max(anchorSec, packetSec);
                }
                s.ctx->skip_frame = skip ? AVDISCARD_NONREF : AVDISCARD_DEFAULT;
            }
            rc = sendPacket(pkt.get());
            if (rc == AVERROR(EAGAIN)) continue;  // receive first, then send it again
            av_packet_unref(pkt.get());
            pendingPacket = false;
            if (rc < 0 && rc != AVERROR_EOF && !decodeError(rc, "send")) return;
            continue;
        }
        if (rc == AVERROR_EOF) {
            s.eof = true;
            m_ring.setEof(gen);
            continue;
        }
        if (rc < 0) {
            if (!decodeError(rc, "receive")) return;
            continue;
        }
        if (s.hardware && lossAfter >= 0 && hwFramesSeen++ >= lossAfter) {
            av_frame_unref(frm.get());  // test seam: the session loses its output
            continue;
        }
        beat();
#if NT_HW_VAAPI
        if (frm->format == hw::pixelFormat()) {
            // On this thread, before the render thread maps it (hw::syncFrame).
            const int synced = hw::syncFrame(frm.get());
            if (synced < 0) {
                av_frame_unref(frm.get());
                if (!decodeError(synced, "VAAPI sync")) return;
                continue;
            }
        }
#endif
        if (s.hardware && !s.gotFrame) {
            const std::string bad = checkHardwareFrame(frm.get());
            if (!bad.empty()) {
                av_frame_unref(frm.get());
                if (!hardwareFailed(bad, gen)) return;
                workerGen = 0;
                continue;
            }
        }
        s.gotFrame = true;

        // Presentation time: the frame's timestamp, else one frame after the
        // last placed frame, else 0 at the start of the stream. A frame with
        // no timestamp right after a seek has no known place: decode from
        // the start instead (F4).
        const int64_t raw = frm->best_effort_timestamp != AV_NOPTS_VALUE ? frm->best_effort_timestamp : frm->pts;
        double ptsSec = 0.0;
        if (raw != AV_NOPTS_VALUE) {
            ptsSec = snapToFrameGrid(static_cast<double>(raw - s.start) * s.tb, s.tb, s.frameDur);
        } else if (s.lastPts) {
            ptsSec = *s.lastPts + s.frameDur;
        } else if (s.fromStart) {
            ptsSec = 0.0;
        } else {
            av_frame_unref(frm.get());
            if (pendingPacket) {
                av_packet_unref(pkt.get());
                pendingPacket = false;
            }
            if (!reopen(s.hardware)) return;
            m_ring.reset(gen);
            continue;
        }
        // Open GOP: a seek can land on a random access point whose leading
        // frames (presented before it, decoded after it) reference the GOP
        // before it. Those frames are dropped, so the first frame out starts
        // after the target and the pick never comes. Seek further back,
        // doubling the distance, instead of restarting at the same place.
        const double wanted = m_targetSec.load();
        if (frameStartsBy(ptsSec, wanted)) {
            runHasPick = true;
        } else if (!runHasPick && !s.fromStart && reseekBackSec < wanted) {
            av_frame_unref(frm.get());
            if (pendingPacket) {
                av_packet_unref(pkt.get());
                pendingPacket = false;
            }
            reseekBackSec = reseekBackSec <= 0.0 ? 1.0 : 2.0 * reseekBackSec;
            if (!seekTo(wanted - reseekBackSec)) return;
            lastCachedPts = -1.0;
            anchorSec = -1e300;
            runSkipFloor = -1e300;
            m_ring.reset(gen);
            ++m_seekCount;
            beat();
            continue;
        }
        s.lastPts = ptsSec;
        (void)seekTarget;

        auto out = std::make_shared<DecodedFrame>();
        out->generation = gen;
        out->ptsSec = ptsSec;
        out->width = frm->width;
        out->height = frm->height;
        const auto fmt = static_cast<AVPixelFormat>(frm->format);
        const AVColorSpace cs =
            frm->colorspace != AVCOL_SPC_UNSPECIFIED ? frm->colorspace : s.o.stream->codecpar->color_space;
        const bool full = frm->color_range == AVCOL_RANGE_JPEG || fmt == AV_PIX_FMT_YUVJ420P;
        if (static_cast<int>(fmt) == hw::pixelFormat()) {
            // Zero copy: the frame keeps its CVPixelBuffer; the render thread
            // wraps its planes as Metal textures.
            out->layout = PlaneLayout::Nv12;
            out->hardware = true;
            out->matrix = matrixFor(cs, frm->height);
            out->range = full ? YuvRange::Full : YuvRange::Limited;
            out->frame = av_frame_clone(frm.get());
        } else if (fmt == AV_PIX_FMT_YUV420P || fmt == AV_PIX_FMT_YUVJ420P || fmt == AV_PIX_FMT_NV12) {
            out->layout = fmt == AV_PIX_FMT_NV12 ? PlaneLayout::Nv12 : PlaneLayout::I420;
            out->matrix = matrixFor(cs, frm->height);
            out->range = full ? YuvRange::Full : YuvRange::Limited;
            out->frame = av_frame_clone(frm.get());
        } else if (const AVPixFmtDescriptor* desc = av_pix_fmt_desc_get(fmt);
                   desc && (desc->flags & AV_PIX_FMT_FLAG_RGB)) {
            // RGB input (RGB24, GBRP, ...): convert to opaque RGBA on this
            // worker. RGB to RGB involves no matrix and no chroma
            // subsampling, so the colour is the source's (F5).
            sws.reset(sws_getCachedContext(sws.release(), frm->width, frm->height, fmt, frm->width, frm->height,
                                           AV_PIX_FMT_RGB0, SWS_POINT, nullptr, nullptr, nullptr));
            AVFrame* conv = av_frame_alloc();
            conv->format = AV_PIX_FMT_RGB0;
            conv->width = frm->width;
            conv->height = frm->height;
            av_frame_get_buffer(conv, 32);
            sws_scale(sws.get(), frm->data, frm->linesize, 0, frm->height, conv->data, conv->linesize);
            for (int y = 0; y < conv->height; ++y) {  // RGB0 leaves the 4th byte undefined: make it opaque
                uint8_t* row = conv->data[0] + static_cast<ptrdiff_t>(y) * conv->linesize[0];
                for (int x = 0; x < conv->width; ++x) row[x * 4 + 3] = 255;
            }
            out->layout = PlaneLayout::Rgba;
            out->frame = conv;
        } else {
            // Any other YUV format (4:2:2, 4:4:4, more bits): convert to I420
            // on this worker. The conversion is configured explicitly (F5):
            // the input is read with its own tags, or the D10 default for an
            // untagged stream, and the output is written as BT.709 limited
            // range, which is what the planes are labelled.
            sws.reset(sws_getCachedContext(sws.release(), frm->width, frm->height, fmt, frm->width, frm->height,
                                           AV_PIX_FMT_YUV420P, SWS_BILINEAR, nullptr, nullptr, nullptr));
            const int srcSpace = matrixFor(cs, frm->height) == YuvMatrix::Bt709 ? SWS_CS_ITU709 : SWS_CS_ITU601;
            sws_setColorspaceDetails(sws.get(), sws_getCoefficients(srcSpace), full ? 1 : 0,
                                     sws_getCoefficients(SWS_CS_ITU709), 0, 0, 1 << 16, 1 << 16);
            AVFrame* conv = av_frame_alloc();
            conv->format = AV_PIX_FMT_YUV420P;
            conv->width = frm->width;
            conv->height = frm->height;
            av_frame_get_buffer(conv, 32);
            sws_scale(sws.get(), frm->data, frm->linesize, 0, frm->height, conv->data, conv->linesize);
            out->layout = PlaneLayout::I420;
            out->matrix = YuvMatrix::Bt709;
            out->range = YuvRange::Limited;
            out->frame = conv;
        }
        av_frame_unref(frm.get());
        const double pts = out->ptsSec;
        std::shared_ptr<DecodedFrame> cached = out;
#if NT_HW_VAAPI
        if (out->hardware) {
            // The cache keeps a system-memory copy, not the VA surface
            // (hw::cacheCopy). Without one, this frame is not cached.
            cached.reset();
            if (AVFrame* copy = hw::cacheCopy(out->frame)) {
                cached = std::make_shared<DecodedFrame>();
                cached->frame = copy;
                cached->ptsSec = out->ptsSec;
                cached->generation = out->generation;
                cached->layout = PlaneLayout::Nv12;
                cached->matrix = out->matrix;
                cached->range = out->range;
                cached->width = out->width;
                cached->height = out->height;
            }
        }
#endif
        const size_t bytes = cached ? frameBytes(*cached) : 0;
        if (m_ring.push(std::move(out))) {
            m_ring.prune(m_targetSec.load());  // keep only the newest frame behind the target
            // The scrub cache keeps it after it leaves the queue (D19); the
            // previous frame of this run is its proven predecessor.
            // Two frames are neighbours only when no skipped frame can lie
            // between them: skipped frames all start before the run's floor.
            const bool contiguous = lastCachedPts >= runSkipFloor - kTimestampEpsilonSec;
            if (cached) {
                FrameCache::shared().insert(m_path, pts, std::move(cached), bytes, contiguous ? lastCachedPts : -1.0);
                lastCachedPts = pts;
            } else {
                lastCachedPts = -1.0;  // the next frame has no cached predecessor
            }
        }
    }
}

FfmpegSource::FfmpegSource(std::string path, double initialSec, QSize nominalSize, std::optional<DecodeMode> mode)
    : m_decoder(std::make_unique<FfmpegDecoder>(std::move(path), initialSec, mode)), m_nominalSize(nominalSize) {}

FfmpegSource::~FfmpegSource() {
    // The displayed hardware frame may still be sampled by a command buffer
    // in flight: it goes to the retire queue, not straight to release (D11).
    if (m_retire && m_frameRef) m_retire->retire(std::move(m_frameRef), m_lastUseFrame);
}

std::unique_ptr<FfmpegDecoder> FfmpegSource::takeDecoder() {
    if (m_decoder) m_decoder->requestStop();
    m_uploaded = nullptr;
    m_uploadedRef.reset();
    return std::move(m_decoder);
}

QSize FfmpegSource::frameSize() const {
    return m_texSize.isValid() ? m_texSize : m_nominalSize;
}

bool FfmpegSource::ensureTextures(QRhi* rhi, const DecodedFrame& f) {
    const QSize size(f.width, f.height);
    if (m_planes[0] && size == m_texSize && f.layout == m_layout) {
        return true;
    }
    const QSize chroma((f.width + 1) / 2, (f.height + 1) / 2);
    for (auto& p : m_planes) p.reset();
    switch (f.layout) {
    case PlaneLayout::Rgba:
        m_planes[0].reset(rhi->newTexture(QRhiTexture::RGBA8, size));
        break;
    case PlaneLayout::I420:
        m_planes[0].reset(rhi->newTexture(QRhiTexture::R8, size));
        m_planes[1].reset(rhi->newTexture(QRhiTexture::R8, chroma));
        m_planes[2].reset(rhi->newTexture(QRhiTexture::R8, chroma));
        break;
    case PlaneLayout::Nv12:
        m_planes[0].reset(rhi->newTexture(QRhiTexture::R8, size));
        m_planes[1].reset(rhi->newTexture(QRhiTexture::RG8, chroma));
        break;
    }
    for (auto& p : m_planes) {
        if (p && !p->create()) return false;
    }
    m_texSize = size;
    m_layout = f.layout;
    m_uploaded = nullptr;
    return true;
}

LayerFrame FfmpegSource::hardwareFrame(const FrameContext& ctx, const std::shared_ptr<DecodedFrame>& shown) {
    // An import failure is part of the source's state: the decoder falls
    // back to software or fails the clip, so the picture is not silently
    // missing (F2).
    const auto importFailed = [&](const std::string& reason) {
        if (!m_importReported) {
            m_decoder->reportImportFailure(reason, m_importOk);
            m_importReported = true;
        }
        return LayerFrame{};
    };
    if (!ctx.interop) return importFailed(std::string("no GPU import for ") + hw::apiName() + " frames");
    if (shown.get() != m_wrapped) {
        std::string error;
        std::shared_ptr<hw::FrameRef> ref = hw::wrapFrame(*ctx.interop, shown->frame, &error);
        if (!ref) {
            if (m_frameRef && ctx.retire) ctx.retire->retire(std::move(m_frameRef), m_lastUseFrame);
            m_wrapped = nullptr;
            return importFailed(error);
        }
        m_importOk = true;
        // The replaced frame waits in the retire queue until no command
        // buffer that sampled it is in flight.
        if (m_frameRef) ctx.retire->retire(std::move(m_frameRef), m_lastUseFrame);
        m_frameRef = ref;
        m_wrapped = shown.get();
    }
    auto* ref = static_cast<hw::FrameRef*>(m_frameRef.get());
    m_lastUseFrame = ctx.frameNumber;
    ref->markUsed(ctx.frameNumber);
    LayerFrame out;
    out.format = LayerFrame::Format::Nv12;
    out.planes = {ref->plane(0), ref->plane(1), nullptr};
    out.size = ref->size();
    out.hardware = true;
    return out;
}

LayerFrame FfmpegSource::frameAt(const FrameContext& ctx, double sourceTimeMs) {
    if (!m_decoder) return {};
    m_retire = ctx.retire;
    const std::shared_ptr<DecodedFrame> shown = m_decoder->frameAt(sourceTimeMs / 1000.0);
    if (!shown || !shown->frame) {
        return {};
    }
    LayerFrame out;
    if (shown->hardware) {
        out = hardwareFrame(ctx, shown);
        if (out.format == LayerFrame::Format::None) return {};
    } else {
        if (!ensureTextures(ctx.rhi, *shown)) return {};
        if (shown.get() != m_uploaded) {
            const AVFrame* fr = shown->frame;
            const int planes = shown->layout == PlaneLayout::I420 ? 3 : (shown->layout == PlaneLayout::Nv12 ? 2 : 1);
            for (int i = 0; i < planes; ++i) {
                const int rows = i == 0 ? fr->height : (fr->height + 1) / 2;
                const int cols = i == 0 ? fr->width : (fr->width + 1) / 2;
                // The batch is submitted in this render(), while `shown` is
                // alive, so the plane memory is read in place.
                QRhiTextureSubresourceUploadDescription desc(
                    QByteArray::fromRawData(reinterpret_cast<const char*>(fr->data[i]), fr->linesize[i] * rows));
                desc.setDataStride(static_cast<quint32>(fr->linesize[i]));
                desc.setSourceSize(QSize(cols, rows));
                ctx.updates->uploadTexture(m_planes[static_cast<size_t>(i)].get(), QRhiTextureUploadEntry(0, 0, desc));
            }
            m_uploaded = shown.get();
            m_uploadedRef = shown;
            out.cpuCopies = planes;
        }
        out.format = shown->layout == PlaneLayout::I420   ? LayerFrame::Format::I420
                     : shown->layout == PlaneLayout::Nv12 ? LayerFrame::Format::Nv12
                                                          : LayerFrame::Format::Rgba8Premultiplied;
        out.planes = {m_planes[0].get(), m_planes[1].get(), m_planes[2].get()};
        out.size = m_texSize;
    }
    out.colorMatrix = yuvToRgbMatrix(shown->matrix, shown->range);
    out.ptsSec = shown->ptsSec;
    if (const auto facts = m_decoder->facts()) {
        out.frameRate = facts->frameRate;
        out.constantRate = facts->constantRate;
        out.durationSec = facts->durationSec;
    }
    out.exact = m_decoder->exact();
    return out;
}

}  // namespace nt
