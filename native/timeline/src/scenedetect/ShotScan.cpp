#include "scenedetect/ShotScan.h"
#include "scenedetect/SceneDetect.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>
}

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <optional>

namespace nt::shots {
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

class Scanner {
public:
    std::string error;

    bool open(const std::string& path) {
        if (path.empty()) {
            error = "no media";
            return false;
        }
        AVFormatContext* raw = nullptr;
        if (avformat_open_input(&raw, path.c_str(), nullptr, nullptr) < 0) {
            error = "cannot open media";
            return false;
        }
        format_.reset(raw);
        if (avformat_find_stream_info(format_.get(), nullptr) < 0) {
            error = "cannot open media streams";
            return false;
        }
        const AVCodec* decoder = nullptr;
        const int index = av_find_best_stream(format_.get(), AVMEDIA_TYPE_VIDEO, -1, -1, &decoder, 0);
        if (index < 0) {
            error = index == AVERROR_DECODER_NOT_FOUND ? "cannot open video decoder" : "no video stream";
            return false;
        }
        stream_ = format_->streams[index];
        codec_.reset(avcodec_alloc_context3(decoder));
        if (!codec_ || avcodec_parameters_to_context(codec_.get(), stream_->codecpar) < 0) {
            error = "cannot open video decoder";
            return false;
        }
        codec_->thread_count = 4;
        if (avcodec_open2(codec_.get(), decoder, nullptr) < 0) {
            error = "cannot open video decoder";
            return false;
        }
        packet_.reset(av_packet_alloc());
        picked_.reset(av_frame_alloc());
        ahead_.reset(av_frame_alloc());
        if (!packet_ || !picked_ || !ahead_) {
            error = "cannot decode video: allocation failed";
            return false;
        }
        start_ = stream_->start_time == AV_NOPTS_VALUE ? 0 : stream_->start_time;
        return true;
    }

    bool pick(double targetMs, bool shouldSeek) {
        if (!std::isfinite(targetMs)) {
            error = "cannot decode video: invalid source time";
            return false;
        }
        // D17 uses 1e-6 s. Allow 1 ms here for rounded container time bases.
        const double limit = targetMs + 1.0;
        double backoffMs = 1000.0;
        double seekMs = std::max(0.0, targetMs);
        for (;;) {
            if (shouldSeek && !seek(seekMs)) {
                return false;
            }
            if (!picked_->data[0]) {
                if (!readAhead()) {
                    if (error.empty()) { error = "cannot decode video: no frames"; }
                    return false;
                }
                if (shouldSeek && aheadMs_ > limit && seekMs > 0.0) {
                    seekMs = std::max(0.0, targetMs - backoffMs);
                    backoffMs *= 2.0;
                    continue;
                }
                promote();
            }
            while (true) {
                if (!ahead_->data[0] && !readAhead()) {
                    return error.empty();
                }
                if (aheadMs_ > limit) {
                    return true;
                }
                promote();
            }
        }
    }

    double pickedMs() const { return pickedMs_; }

    std::optional<Signature> reducedSignature() {
        const int w = std::min(picked_->width, 256);
        if (w <= 0 || picked_->height <= 0) {
            error = "cannot decode video: invalid frame size";
            return std::nullopt;
        }
        const int h = std::max(1, static_cast<int>(static_cast<std::int64_t>(picked_->height) * w / picked_->width));
        sws_.reset(sws_getCachedContext(sws_.release(), picked_->width, picked_->height,
                                       static_cast<AVPixelFormat>(picked_->format), w, h, AV_PIX_FMT_RGBA,
                                       SWS_AREA, nullptr, nullptr, nullptr));
        if (!sws_) {
            error = "cannot decode video: cannot convert frame";
            return std::nullopt;
        }
        rgba_.resize(static_cast<std::size_t>(w) * h * 4 + AV_INPUT_BUFFER_PADDING_SIZE);
        std::array<std::uint8_t*, 4> data{rgba_.data(), nullptr, nullptr, nullptr};
        const std::array<int, 4> strides{w * 4, 0, 0, 0};
        if (sws_scale(sws_.get(), picked_->data, picked_->linesize, 0, picked_->height, data.data(), strides.data()) != h) {
            error = "cannot decode video: cannot convert frame";
            return std::nullopt;
        }
        return signature(std::span<const std::uint8_t>(rgba_), w, h);
    }

private:
    bool seek(double ms) {
        const auto ts = start_ + av_rescale_q(static_cast<std::int64_t>(std::llround(ms * 1000.0)), AV_TIME_BASE_Q,
                                            stream_->time_base);
        if (av_seek_frame(format_.get(), stream_->index, ts, AVSEEK_FLAG_BACKWARD) < 0) {
            error = "cannot decode video: cannot seek";
            return false;
        }
        avcodec_flush_buffers(codec_.get());
        av_packet_unref(packet_.get());
        av_frame_unref(picked_.get());
        av_frame_unref(ahead_.get());
        draining_ = false;
        return true;
    }

    bool readAhead() {
        if (ahead_->data[0]) { return true; }
        for (;;) {
            const int received = avcodec_receive_frame(codec_.get(), ahead_.get());
            if (received == 0) {
                auto ts = ahead_->best_effort_timestamp;
                if (ts == AV_NOPTS_VALUE) { ts = ahead_->pts; }
                if (ts == AV_NOPTS_VALUE) { ts = ahead_->pkt_dts; }
                if (ts == AV_NOPTS_VALUE) {
                    error = "cannot decode video: missing frame timestamp";
                    return false;
                }
                aheadMs_ = static_cast<double>(ts - start_) * av_q2d(stream_->time_base) * 1000.0;
                return true;
            }
            if (received == AVERROR_EOF) { return false; }
            if (received != AVERROR(EAGAIN) || draining_) {
                error = "cannot decode video";
                return false;
            }
            int read = 0;
            do {
                av_packet_unref(packet_.get());
                read = av_read_frame(format_.get(), packet_.get());
            } while (read >= 0 && packet_->stream_index != stream_->index);
            if (read < 0 && read != AVERROR_EOF) {
                error = "cannot decode media";
                return false;
            }
            draining_ = read == AVERROR_EOF;
            const int sent = avcodec_send_packet(codec_.get(), draining_ ? nullptr : packet_.get());
            av_packet_unref(packet_.get());
            if (sent < 0) {
                error = "cannot decode video";
                return false;
            }
        }
    }

    void promote() {
        av_frame_unref(picked_.get());
        av_frame_move_ref(picked_.get(), ahead_.get());
        pickedMs_ = aheadMs_;
    }

    std::unique_ptr<AVFormatContext, FormatCloser> format_;
    std::unique_ptr<AVCodecContext, CodecCloser> codec_;
    std::unique_ptr<AVPacket, PacketFree> packet_;
    std::unique_ptr<AVFrame, FrameFree> picked_;
    std::unique_ptr<AVFrame, FrameFree> ahead_;
    std::unique_ptr<SwsContext, SwsFree> sws_;
    AVStream* stream_ = nullptr;
    std::int64_t start_ = 0;
    bool draining_ = false;
    double pickedMs_ = 0.0;
    double aheadMs_ = 0.0;
    std::vector<std::uint8_t> rgba_;
};
}  // namespace

ScanResult scanShots(const ScanRequest& request, const std::function<bool(std::size_t done)>& progress) {
    ScanResult result;
    if (request.sourceTimesMs.empty()) { return result; }
    Scanner scanner;
    if (!scanner.open(request.path)) {
        result.error = scanner.error;
        return result;
    }
    result.diffs.reserve(request.sourceTimesMs.size());
    std::optional<Signature> previous;
    double previousPick = 0.0;
    double previousTarget = 0.0;
    for (const double target : request.sourceTimesMs) {
        const bool shouldSeek = previous ? target < previousTarget || target - previousTarget > 1000.0 : target > 1000.0;
        if (!scanner.pick(target, shouldSeek)) {
            result.error = scanner.error;
            return result;
        }
        float diff = 0.0F;
        if (!previous || scanner.pickedMs() != previousPick) {
            auto current = scanner.reducedSignature();
            if (!current) {
                result.error = scanner.error;
                return result;
            }
            if (previous) { diff = difference(*previous, *current); }
            previous = std::move(current);
        }
        previousPick = scanner.pickedMs();
        previousTarget = target;
        result.diffs.push_back(diff);
        if (progress && !progress(result.diffs.size())) {
            result.cancelled = true;
            return result;
        }
    }
    return result;
}

}  // namespace nt::shots
