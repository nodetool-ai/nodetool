#include "audio/AudioSource.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/channel_layout.h>
#include <libavutil/opt.h>
#include <libswresample/swresample.h>
}

#include <QFileInfo>
#include <algorithm>
#include <cmath>
#include <cstring>

namespace nt::audio {

struct AudioSource::Impl {
    AVFormatContext* fmt = nullptr;
    AVCodecContext* dec = nullptr;
    SwrContext* swr = nullptr;
    AVPacket* packet = nullptr;
    AVFrame* frame = nullptr;
    int stream = -1;
    AVRational timeBase{1, 1};
    std::int64_t startPts = 0;
    std::int64_t streamStartPts = 0;
    std::function<bool()> cancelled;
    bool interrupted() const { return cancelled && cancelled(); }
    int outChannels = 2;
    bool draining = false;     // the demuxer is at its end, the decoder drains
    bool swrFlushed = false;
    bool needPosition = true;  // the next decoded frame sets the position
    std::int64_t seekTarget = 0;
    std::vector<float> scratch;

    ~Impl() {
        av_frame_free(&frame);
        av_packet_free(&packet);
        swr_free(&swr);
        avcodec_free_context(&dec);
        avformat_close_input(&fmt);
    }

    bool initSwr(int sampleRate) {
        swr_free(&swr);
        AVChannelLayout outLayout;
        av_channel_layout_default(&outLayout, outChannels);
        const int rc = swr_alloc_set_opts2(&swr, &outLayout, AV_SAMPLE_FMT_FLT, sampleRate, &dec->ch_layout,
                                           dec->sample_fmt, dec->sample_rate, 0, nullptr);
        av_channel_layout_uninit(&outLayout);
        return rc >= 0 && swr_init(swr) >= 0;
    }
};

AudioSource::~AudioSource() = default;

std::unique_ptr<AudioSource> AudioSource::open(const std::string& path, int sampleRate, std::string* error, std::function<bool()> cancelled) {
    const auto fail = [&](const char* why) -> std::unique_ptr<AudioSource> {
        if (error) *error = why;
        return nullptr;
    };
    std::unique_ptr<AudioSource> src(new AudioSource());
    src->m_impl = std::make_unique<Impl>();
    Impl& d = *src->m_impl;
    src->m_sampleRate = sampleRate;
    d.cancelled = std::move(cancelled);
    if (d.interrupted()) return fail("cancelled");
    const QFileInfo file(QString::fromStdString(path));
    if (file.exists() && !file.isFile()) return fail("audio source must be a regular file");
    d.fmt = avformat_alloc_context();
    if (!d.fmt) return fail("cannot allocate the audio demuxer");
    d.fmt->interrupt_callback.callback = [](void* opaque) { return static_cast<Impl*>(opaque)->interrupted() ? 1 : 0; };
    d.fmt->interrupt_callback.opaque = &d;
    if (avformat_open_input(&d.fmt, path.c_str(), nullptr, nullptr) < 0) return fail("cannot open the file");
    if (avformat_find_stream_info(d.fmt, nullptr) < 0) return fail("cannot read the stream info");
    const AVCodec* codec = nullptr;
    d.stream = av_find_best_stream(d.fmt, AVMEDIA_TYPE_AUDIO, -1, -1, &codec, 0);
    if (d.stream < 0 || !codec) return fail("no audio stream");
    AVStream* st = d.fmt->streams[d.stream];
    d.dec = avcodec_alloc_context3(codec);
    if (!d.dec || avcodec_parameters_to_context(d.dec, st->codecpar) < 0) return fail("cannot set up the decoder");
    if (avcodec_open2(d.dec, codec, nullptr) < 0) return fail("cannot open the decoder");
    d.timeBase = st->time_base;
    d.streamStartPts = st->start_time != AV_NOPTS_VALUE ? st->start_time : 0;
    // The preview normalizes picture timestamps to the video stream start.
    // Keep audio on that same clock, including leading silence or preroll.
    const int video = av_find_best_stream(d.fmt, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
    const auto* picture = video >= 0 ? d.fmt->streams[video] : nullptr;
    d.startPts = picture && picture->start_time != AV_NOPTS_VALUE
        ? av_rescale_q(picture->start_time, picture->time_base, d.timeBase)
        : d.fmt->start_time != AV_NOPTS_VALUE
            ? av_rescale_q(d.fmt->start_time, AV_TIME_BASE_Q, d.timeBase) : d.streamStartPts;
    src->m_sourceChannels = d.dec->ch_layout.nb_channels;
    src->m_sourceRate = d.dec->sample_rate;
    d.outChannels = src->m_sourceChannels == 1 ? 1 : 2;
    if (!d.initSwr(sampleRate)) return fail("cannot set up the resampler");
    d.packet = av_packet_alloc();
    d.frame = av_frame_alloc();
    if (st->duration != AV_NOPTS_VALUE) {
        src->m_durationFrames = std::max<std::int64_t>(0, std::llround(
            static_cast<double>(st->duration + d.streamStartPts - d.startPts) * av_q2d(d.timeBase) * sampleRate));
    } else if (d.fmt->duration != AV_NOPTS_VALUE) {
        src->m_durationFrames = static_cast<std::int64_t>(
            std::llround(static_cast<double>(d.fmt->duration) / AV_TIME_BASE * sampleRate));
    }
    return src;
}

bool AudioSource::decodeMore() {
    Impl& d = *m_impl;
    // Converts one decoded frame (or the resampler tail, for null) and
    // appends it to m_pending.
    const auto convert = [&](const AVFrame* in) {
        const int inSamples = in ? in->nb_samples : 0;
        const int cap = swr_get_out_samples(d.swr, inSamples);
        if (cap <= 0) return 0;
        d.scratch.resize(static_cast<std::size_t>(cap) * d.outChannels);
        uint8_t* outPlanes[1] = {reinterpret_cast<uint8_t*>(d.scratch.data())};
        const int got = swr_convert(d.swr, outPlanes, cap, in ? const_cast<const uint8_t**>(in->extended_data) : nullptr,
                                    inSamples);
        if (got <= 0) return 0;
        const std::size_t base = m_pending.size();
        m_pending.resize(base + static_cast<std::size_t>(got) * 2);
        float* dst = m_pending.data() + base;
        if (d.outChannels == 1) {
            for (int i = 0; i < got; ++i) dst[2 * i] = dst[2 * i + 1] = d.scratch[static_cast<std::size_t>(i)];
        } else {
            std::memcpy(dst, d.scratch.data(), static_cast<std::size_t>(got) * 2 * sizeof(float));
        }
        return got;
    };

    for (;;) {
        if (d.interrupted()) return false;
        const int rc = avcodec_receive_frame(d.dec, d.frame);
        if (rc == 0) {
            if (d.needPosition) {
                // The first frame after open or seek places the stream: drop
                // the frames before the target, or pad when it starts later.
                d.needPosition = false;
                const std::int64_t pts = d.frame->best_effort_timestamp;
                if (pts != AV_NOPTS_VALUE) {
                    const double sec = static_cast<double>(pts - d.startPts) * av_q2d(d.timeBase);
                    const auto at = static_cast<std::int64_t>(std::llround(sec * m_sampleRate));
                    m_skip = d.seekTarget - at;
                    if (m_skip < 0) {
                        m_pending.insert(m_pending.end(), static_cast<std::size_t>(-m_skip) * 2, 0.0f);
                        m_skip = 0;
                    }
                }
            }
            convert(d.frame);
            av_frame_unref(d.frame);
            return true;
        }
        if (rc == AVERROR_EOF) {
            if (!d.swrFlushed) {
                d.swrFlushed = true;
                if (convert(nullptr) > 0) return true;
            }
            return false;
        }
        if (rc != AVERROR(EAGAIN)) {
            // A decode error: the frame is lost, decoding goes on.
            ++m_decodeErrors;
            if (d.draining) return false;
        }
        // EAGAIN: feed the next packet.
        if (d.draining) return false;
        for (;;) {
            const int r = av_read_frame(d.fmt, d.packet);
            if (r < 0) {
                if (r != AVERROR_EOF) ++m_decodeErrors;  // a read error ends the stream early
                d.draining = true;
                avcodec_send_packet(d.dec, nullptr);
                break;
            }
            if (d.packet->stream_index == d.stream) {
                const int sent = avcodec_send_packet(d.dec, d.packet);
                if (sent < 0 && sent != AVERROR(EAGAIN)) ++m_decodeErrors;
                av_packet_unref(d.packet);
                break;
            }
            av_packet_unref(d.packet);
        }
    }
}

bool AudioSource::seek(std::int64_t frame) {
    Impl& d = *m_impl;
    frame = std::max<std::int64_t>(0, frame);
    if (frame == m_position && m_skip == 0) return true;
    const double sec = static_cast<double>(frame) / m_sampleRate;
    const auto ts = d.startPts + static_cast<std::int64_t>(std::floor(sec / av_q2d(d.timeBase)));
    if (av_seek_frame(d.fmt, d.stream, std::max(ts, d.streamStartPts), AVSEEK_FLAG_BACKWARD) < 0 &&
        av_seek_frame(d.fmt, d.stream, d.streamStartPts, AVSEEK_FLAG_BACKWARD) < 0) {
        return false;
    }
    avcodec_flush_buffers(d.dec);
    if (!d.initSwr(m_sampleRate)) return false;
    m_pending.clear();
    m_pendingRead = 0;
    m_skip = 0;
    m_eof = false;
    d.draining = false;
    d.swrFlushed = false;
    d.needPosition = true;
    d.seekTarget = frame;
    m_position = frame;
    return true;
}

std::int64_t AudioSource::read(float* stereo, std::int64_t frames) {
    Impl& d = *m_impl;
    std::int64_t done = 0;
    while (done < frames && !d.interrupted()) {
        std::int64_t avail = static_cast<std::int64_t>(m_pending.size() / 2) - static_cast<std::int64_t>(m_pendingRead);
        if (m_skip > 0 && avail > 0) {
            const std::int64_t drop = std::min(m_skip, avail);
            m_pendingRead += static_cast<std::size_t>(drop);
            m_skip -= drop;
            continue;
        }
        if (avail <= 0) {
            m_pending.clear();
            m_pendingRead = 0;
            if (m_eof || !decodeMore()) {
                m_eof = true;
                break;
            }
            continue;
        }
        const std::int64_t n = std::min(avail, frames - done);
        std::memcpy(stereo + 2 * done, m_pending.data() + 2 * m_pendingRead, static_cast<std::size_t>(n) * 2 * sizeof(float));
        m_pendingRead += static_cast<std::size_t>(n);
        done += n;
    }
    m_position += done;
    return done;
}

std::vector<float> AudioSource::readAll() {
    seek(0);
    std::vector<float> all;
    std::vector<float> chunk(8192 * 2);
    for (;;) {
        const std::int64_t n = read(chunk.data(), 8192);
        if (n <= 0) break;
        all.insert(all.end(), chunk.begin(), chunk.begin() + n * 2);
    }
    return all;
}

}  // namespace nt::audio
