#include "preview/FfmpegSource.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/display.h>
#include <libavutil/imgutils.h>
#include <libavutil/pixdesc.h>
#include <libswscale/swscale.h>
}

#include <QByteArray>

#include <chrono>
#include <cmath>
#include <optional>

namespace nt {
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

bool openDecoder(Stream& s, const std::string& path, const AVIOInterruptCB* interrupt) {
    s.o = openStream(path, interrupt);
    s.ctx.reset();
    if (!s.o.facts.usable()) return false;
    s.ctx.reset(avcodec_alloc_context3(s.o.codec));
    avcodec_parameters_to_context(s.ctx.get(), s.o.stream->codecpar);
    s.ctx->thread_count = 2;  // D14
    s.ctx->thread_type = FF_THREAD_FRAME;
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
    s.draining = false;
    s.eof = false;
    s.fromStart = true;
    s.lastPts.reset();
    return true;
}

}  // namespace

MediaFacts probeMedia(const std::string& path) {
    return openStream(path, nullptr).facts;
}

DecodedFrame::~DecodedFrame() {
    av_frame_free(&frame);
}

FfmpegDecoder::FfmpegDecoder(std::string path, double initialSec)
    : m_path(std::move(path)), m_targetSec(initialSec), m_restartSec(initialSec) {
    m_thread = std::thread([this] { run(); });
}

FfmpegDecoder::FfmpegDecoder(NoWorkerForTest) : m_targetSec(0.0), m_restartSec(0.0) {
    m_ring.reset(m_requestGen.load());
}

void FfmpegDecoder::testPush(double ptsSec) {
    auto f = std::make_shared<DecodedFrame>();
    f->ptsSec = ptsSec;
    f->generation = m_requestGen.load();
    m_ring.push(std::move(f));
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
    const bool queueCurrent = snap.generation == gen;
    m_lastQueued = snap.size;
    m_lastNewest = snap.newestPts;
    // The decoder's position: where the last seek put it, or the frame it
    // has reached past that. Frames still catching up to a seek count as the
    // seek target, so a pending seek is not restarted every frame.
    double position = m_restartSec;
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
    const AVIOInterruptCB interrupt{&FfmpegDecoder::interruptCallback, this};
    Stream s;
    const bool opened = openDecoder(s, m_path, &interrupt);
    publishFacts(s.o.facts);
    if (!opened) {
        return;  // rejected or failed: the pool draws a placeholder
    }

    std::unique_ptr<AVPacket, PacketFree> pkt(av_packet_alloc());
    std::unique_ptr<AVFrame, FrameFree> frm(av_frame_alloc());
    std::unique_ptr<SwsContext, SwsFree> sws;
    long long workerGen = 0;
    double seekTarget = 0.0;

    // Reopens the input to decode from its first packet: the recovery when a
    // seek fails, or when frames after a seek carry no timestamps (F3, F4).
    const auto reopen = [&]() -> bool {
        ++m_reopenCount;
        if (!openDecoder(s, m_path, &interrupt)) {
            MediaFacts failed = s.o.facts;
            if (failed.error.empty()) failed.error = "reopen failed";
            publishFacts(failed);
            return false;
        }
        return true;
    };

    while (!m_stop) {
        const long long gen = m_requestGen.load();
        const double target = m_targetSec.load();
        if (gen != workerGen) {
            seekTarget = target;
            // From the first packet, a target within the sequential gap
            // decodes through: no seek, which also serves streams with no
            // seek index (a raw Annex-B file).
            const bool decodeThrough = s.fromStart && !s.lastPts && target <= kMaxSequentialGapSec;
            if (!decodeThrough) {
                AVStream* st = s.o.stream;
                const int64_t ts = s.start + av_rescale_q(std::llround(std::max(0.0, target) * AV_TIME_BASE),
                                                          AV_TIME_BASE_Q, st->time_base);
                const int rc = av_seek_frame(s.o.fmt.get(), st->index, ts, AVSEEK_FLAG_BACKWARD);
                if (rc >= 0) {
                    avcodec_flush_buffers(s.ctx.get());
                    s.draining = false;
                    s.eof = false;
                    s.fromStart = false;
                    s.lastPts.reset();
                } else if (!reopen()) {
                    return;  // the failure is in the facts: the pool shows a placeholder
                }
            }
            m_ring.reset(gen);
            workerGen = gen;
            ++m_seekCount;
        }
        if (s.eof || !wantsMoreFrames(m_ring.size(), m_ring.newestPts(), target)) {
            std::unique_lock lock(m_wakeMutex);
            m_wake.wait_for(lock, std::chrono::milliseconds(10));
            continue;
        }

        int rc = avcodec_receive_frame(s.ctx.get(), frm.get());
        if (rc == AVERROR(EAGAIN)) {
            if (s.draining) {
                s.eof = true;
                m_ring.setEof(gen);
                continue;
            }
            rc = av_read_frame(s.o.fmt.get(), pkt.get());
            if (rc == AVERROR_EOF) {
                avcodec_send_packet(s.ctx.get(), nullptr);  // drain
                s.draining = true;
            } else if (rc >= 0) {
                if (pkt->stream_index == s.o.stream->index) avcodec_send_packet(s.ctx.get(), pkt.get());
                av_packet_unref(pkt.get());
            } else {
                s.eof = true;  // read error or interrupt: keep the last frame
                m_ring.setEof(gen);
            }
            continue;
        }
        if (rc < 0) {
            s.eof = true;  // AVERROR_EOF, or a decode error: keep the last frame
            m_ring.setEof(gen);
            continue;
        }

        // Presentation time: the frame's timestamp, else one frame after the
        // last placed frame, else 0 at the start of the stream. A frame with
        // no timestamp right after a seek has no known place: decode from
        // the start instead (F4).
        const int64_t raw = frm->best_effort_timestamp != AV_NOPTS_VALUE ? frm->best_effort_timestamp : frm->pts;
        double ptsSec = 0.0;
        if (raw != AV_NOPTS_VALUE) {
            ptsSec = static_cast<double>(raw - s.start) * s.tb;
        } else if (s.lastPts) {
            ptsSec = *s.lastPts + s.frameDur;
        } else if (s.fromStart) {
            ptsSec = 0.0;
        } else {
            av_frame_unref(frm.get());
            if (!reopen()) return;
            m_ring.reset(gen);
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
        if (fmt == AV_PIX_FMT_YUV420P || fmt == AV_PIX_FMT_YUVJ420P || fmt == AV_PIX_FMT_NV12) {
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
        if (m_ring.push(std::move(out))) {
            m_ring.prune(m_targetSec.load());  // keep only the newest frame behind the target
        }
    }
}

FfmpegSource::FfmpegSource(std::string path, double initialSec, QSize nominalSize)
    : m_decoder(std::make_unique<FfmpegDecoder>(std::move(path), initialSec)), m_nominalSize(nominalSize) {}

FfmpegSource::~FfmpegSource() = default;

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

LayerFrame FfmpegSource::frameAt(QRhi* rhi, QRhiResourceUpdateBatch* updates, double sourceTimeMs) {
    if (!m_decoder) return {};
    const std::shared_ptr<DecodedFrame> shown = m_decoder->frameAt(sourceTimeMs / 1000.0);
    if (!shown || !shown->frame || !ensureTextures(rhi, *shown)) {
        return {};
    }
    if (shown.get() != m_uploaded) {
        const AVFrame* fr = shown->frame;
        const int planes = shown->layout == PlaneLayout::I420 ? 3 : (shown->layout == PlaneLayout::Nv12 ? 2 : 1);
        for (int i = 0; i < planes; ++i) {
            const int rows = i == 0 ? fr->height : (fr->height + 1) / 2;
            const int cols = i == 0 ? fr->width : (fr->width + 1) / 2;
            // The batch is submitted in this render(), while `shown` is alive,
            // so the plane memory is read in place.
            QRhiTextureSubresourceUploadDescription desc(
                QByteArray::fromRawData(reinterpret_cast<const char*>(fr->data[i]), fr->linesize[i] * rows));
            desc.setDataStride(static_cast<quint32>(fr->linesize[i]));
            desc.setSourceSize(QSize(cols, rows));
            updates->uploadTexture(m_planes[static_cast<size_t>(i)].get(), QRhiTextureUploadEntry(0, 0, desc));
        }
        m_uploaded = shown.get();
        m_uploadedRef = shown;
    }
    LayerFrame out;
    out.format = shown->layout == PlaneLayout::I420   ? LayerFrame::Format::I420
                 : shown->layout == PlaneLayout::Nv12 ? LayerFrame::Format::Nv12
                                                      : LayerFrame::Format::Rgba8Premultiplied;
    out.planes = {m_planes[0].get(), m_planes[1].get(), m_planes[2].get()};
    out.size = m_texSize;
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
