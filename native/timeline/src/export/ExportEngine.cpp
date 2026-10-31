#include "export/ExportEngine.h"
#include "assets/AssetMedia.h"
#include "export/OffscreenFrames.h"
#include "export/ExportCapabilities.h"
#include "export/PngZip.h"
#include "preview/effects/Masks.h"
#include <QBuffer>
#include <array>
#include "audio/AudioEngine.h"
#include "model/TimelineModel.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSet>
#include <QTemporaryDir>
#include <algorithm>
#include <cmath>
#include <memory>
#include <span>
#include <stdexcept>
extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/channel_layout.h>
#include <libavutil/opt.h>
#include <libavutil/samplefmt.h>
#include <libswresample/swresample.h>
#include <libswscale/swscale.h>
}

namespace nt::exporting {
namespace {
struct CodecDelete { void operator()(AVCodecContext* p) const { avcodec_free_context(&p); } };
struct FrameDelete { void operator()(AVFrame* p) const { av_frame_free(&p); } };
struct PacketDelete { void operator()(AVPacket* p) const { av_packet_free(&p); } };
struct ScaleDelete { void operator()(SwsContext* p) const { sws_freeContext(p); } };
struct ResampleDelete { void operator()(SwrContext* p) const { swr_free(&p); } };
struct FormatDelete {
    void operator()(AVFormatContext* p) const {
        if (p->pb) avio_closep(&p->pb);
        avformat_free_context(p);
    }
};
using Codec = std::unique_ptr<AVCodecContext, CodecDelete>;
using Frame = std::unique_ptr<AVFrame, FrameDelete>;
using Packet = std::unique_ptr<AVPacket, PacketDelete>;
using Format = std::unique_ptr<AVFormatContext, FormatDelete>;
void check(int code, const char* operation) {
    if (code < 0) {
        std::array<char, AV_ERROR_MAX_STRING_SIZE> error{};
        av_strerror(code, error.data(), error.size());
        throw std::runtime_error(std::string(operation) + ": " + error.data());
    }
}
const AVCodec* chosen(const QString& overrideName, const AVCodec* fallback) {
    const auto* codec = overrideName.isEmpty() ? fallback : avcodec_find_encoder_by_name(overrideName.toUtf8().constData());
    if (!codec) throw std::runtime_error("Requested export encoder is unavailable");
    return codec;
}
Frame frame() {
    Frame result(av_frame_alloc());
    if (!result) throw std::bad_alloc();
    return result;
}
class Muxer {
public:
    Muxer(const QString& file, const QString& format) {
        AVFormatContext* raw = nullptr;
        const char* name = format == u"mp4" ? "mp4" : format == u"webm" ? "webm" : format == u"wav" ? "wav" : "mp3";
        const int status = avformat_alloc_output_context2(&raw, nullptr, name, file.toUtf8().constData());
        m_format.reset(raw);
        check(status, "Create export container");
        if (!m_format) throw std::bad_alloc();
        check(avio_open(&m_format->pb, file.toUtf8().constData(), AVIO_FLAG_WRITE), "Open export output");
    }
    AVStream* add(AVCodecContext& codec) {
        if (m_format->oformat->flags & AVFMT_GLOBALHEADER) codec.flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
        check(avcodec_open2(&codec, codec.codec, nullptr), "Open export encoder");
        auto* stream = avformat_new_stream(m_format.get(), nullptr);
        if (!stream) throw std::bad_alloc();
        stream->time_base = codec.time_base;
        check(avcodec_parameters_from_context(stream->codecpar, &codec), "Copy export codec parameters");
        return stream;
    }
    void header(bool mp4) {
        if (mp4) {
            check(av_opt_set(m_format->priv_data, "movflags", "+faststart", 0), "Set MP4 faststart");
            check(av_opt_set(m_format->priv_data, "use_editlist", "1", 0), "Set MP4 edit list");
            // Millisecond edit durations truncate fractional AAC tails.
            check(av_opt_set_int(m_format->priv_data, "movie_timescale", 48000, 0), "Set MP4 sample-accurate edit timescale");
        }
        check(avformat_write_header(m_format.get(), nullptr), "Write export header");
    }
    void encode(AVCodecContext& codec, AVStream& stream, AVFrame* input) {
        check(avcodec_send_frame(&codec, input), "Send export frame");
        Packet packet(av_packet_alloc());
        if (!packet) throw std::bad_alloc();
        for (;;) {
            const int status = avcodec_receive_packet(&codec, packet.get());
            if (status == AVERROR(EAGAIN) || status == AVERROR_EOF) break;
            check(status, "Receive export packet");
            av_packet_rescale_ts(packet.get(), codec.time_base, stream.time_base);
            packet->stream_index = stream.index;
            check(av_interleaved_write_frame(m_format.get(), packet.get()), "Write export packet");
            av_packet_unref(packet.get());
        }
    }
    void finish() { check(av_write_trailer(m_format.get()), "Finalize export"); }
private:
    Format m_format;
};
Codec videoCodec(const AVCodec* encoder, const Timeline& timeline) {
    Codec c(avcodec_alloc_context3(encoder));
    if (!c) throw std::bad_alloc();
    c->width = std::max(2, timeline.width / 2 * 2);
    c->height = std::max(2, timeline.height / 2 * 2);
    c->pix_fmt = AV_PIX_FMT_YUV420P;
    c->framerate = av_d2q(timeline.fps, 1000000);
    c->time_base = av_inv_q(c->framerate);
    c->color_range = AVCOL_RANGE_MPEG;
    c->colorspace = AVCOL_SPC_BT709;
    c->color_primaries = AVCOL_PRI_BT709;
    c->color_trc = AVCOL_TRC_BT709;
    c->max_b_frames = 0;
    c->thread_count = 3;
    c->bit_rate = 30000000;
    const std::string name(encoder->name);
    if (name == "libx264") {
        check(av_opt_set(c->priv_data, "crf", "8", 0), "Set H.264 quality");
        check(av_opt_set(c->priv_data, "preset", "slow", 0), "Set H.264 preset");
    } else if (name == "libvpx-vp9") {
        c->bit_rate = 0;
        check(av_opt_set(c->priv_data, "crf", "12", 0), "Set VP9 quality");
        check(av_opt_set(c->priv_data, "row-mt", "1", 0), "Set VP9 threading");
    }
    return c;
}
Codec audioCodec(const AVCodec* encoder) {
    Codec c(avcodec_alloc_context3(encoder));
    if (!c) throw std::bad_alloc();
    c->sample_rate = 48000;
    c->time_base = {1, 48000};
    av_channel_layout_default(&c->ch_layout, 2);
    const void* rawFormats = nullptr;
    int count = 0;
    check(avcodec_get_supported_config(c.get(), encoder, AV_CODEC_CONFIG_SAMPLE_FORMAT, 0,
          &rawFormats, &count), "Get encoder sample formats");
    const auto* formats = static_cast<const AVSampleFormat*>(rawFormats);
    c->sample_fmt = count > 0 ? formats[0] : AV_SAMPLE_FMT_FLTP;
    c->bit_rate = encoder->id == AV_CODEC_ID_MP3 ? 320000 : 192000;
    return c;
}
class AudioFrames {
public:
    explicit AudioFrames(AVCodecContext& c) : m_codec(c) {
        SwrContext* raw = nullptr;
        AVChannelLayout stereo = AV_CHANNEL_LAYOUT_STEREO;
        const int status = swr_alloc_set_opts2(&raw, &c.ch_layout, c.sample_fmt, 48000,
              &stereo, AV_SAMPLE_FMT_FLT, 48000, 0, nullptr);
        m_resample.reset(raw);
        check(status, "Create audio conversion");
        if (!m_resample) throw std::bad_alloc();
        // PCM rounding is deterministic, with no dither.
        check(av_opt_set_int(m_resample.get(), "dither_method", SWR_DITHER_NONE, 0), "Set PCM conversion");
        check(swr_init(m_resample.get()), "Initialize audio conversion");
    }
    Frame next(std::span<const float> pcm, qint64 offset) {
        auto f = frame();
        f->format = m_codec.sample_fmt;
        f->sample_rate = 48000;
        check(av_channel_layout_copy(&f->ch_layout, &m_codec.ch_layout), "Set audio frame channels");
        const int block = m_codec.frame_size > 0 ? m_codec.frame_size : 4096;
        f->nb_samples = static_cast<int>(std::min<qint64>(block, static_cast<qint64>(pcm.size() / 2) - offset));
        f->pts = offset;
        check(av_frame_get_buffer(f.get(), 0), "Allocate export audio frame");
        const auto bytes = std::as_bytes(pcm.subspan(static_cast<std::size_t>(offset * 2), static_cast<std::size_t>(f->nb_samples * 2)));
        const auto* input = reinterpret_cast<const uint8_t*>(bytes.data());
        check(swr_convert(m_resample.get(), f->data, f->nb_samples, &input, f->nb_samples), "Convert export audio");
        return f;
    }
private:
    AVCodecContext& m_codec;
    std::unique_ptr<SwrContext, ResampleDelete> m_resample;
};
}
Result exportTimeline(const Timeline& timeline, const Options& options, std::stop_token stop,
                      ProgressCallback progress, CancelProbe cancel) {
    Result result;
    const auto cancelled = [&] { return stop.stop_requested() || (cancel && cancel()); };
    const auto report = [&](QString phase, qint64 completed = 0) {
        if (progress) progress({phase, completed, result.frames, result.frames ? static_cast<double>(completed) / result.frames : 0});
    };
    try {
        if (options.alpha) throw std::runtime_error("Export with transparency is unavailable in the native compositor");
        const QStringList formats{QStringLiteral("mp4"), QStringLiteral("webm"), QStringLiteral("png_sequence"), QStringLiteral("wav"), QStringLiteral("mp3")};
        if (!formats.contains(options.format)) throw std::runtime_error("Unknown export format");
        if (!std::isfinite(timeline.fps) || timeline.fps <= 0 || timeline.width <= 0 || timeline.height <= 0) {
            throw std::runtime_error("Invalid export frame rate or canvas size");
        }
        double duration = timeline.durationMs;
        if (duration <= 0) {
            for (const auto& clip : timeline.clips) {
                duration = std::max(duration, clip.endMs());
            }
        }
        if (!std::isfinite(duration) || duration <= 0) throw std::runtime_error("Add a clip before exporting.");
        result.frames = std::max<qint64>(1, std::llround(duration * timeline.fps / 1000));
        result.fps = timeline.fps;
        const bool audioOnly = options.format == u"wav" || options.format == u"mp3";
        const bool png = options.format == u"png_sequence";
        QSet<QString> mediaPaths;
        for (const auto& clip : timeline.clips) {
            for (const auto& path : {clip.mediaPath, clip.originalMediaPath, clip.audioPath, clip.generatedMattePath}) {
                if (!path.empty()) mediaPaths.insert(QString::fromStdString(path));
            }
        }
        const auto mediaLeases = nt::assets::MediaProtection::leasePaths(mediaPaths);
        result.samples = std::max<qint64>(1, std::llround((audioOnly ? duration / 1000 : result.frames / timeline.fps) * 48000));
        if (png && static_cast<quint64>(result.frames) >= PngZip::MaxEntries) {
            throw std::runtime_error("PNG sequence exceeds classic ZIP limit of 65535 entries including the manifest");
        }
        report(QStringLiteral("preparing"));
        if (cancelled()) { result.cancelled = true; return result; }
        const QFileInfo destination(options.output);
        if (options.output.isEmpty() || !destination.dir().exists()) throw std::runtime_error("Export destination folder does not exist");
        if (destination.exists()) throw std::runtime_error("Export destination already exists");
        std::unique_ptr<QTemporaryDir> staging;
        QString stagingPath = options.stagingDirectory;
        if (stagingPath.isEmpty()) {
            staging = std::make_unique<QTemporaryDir>(destination.dir().filePath(QStringLiteral(".nt-export-XXXXXX")));
            if (!staging->isValid()) throw std::runtime_error("Cannot create temporary export output");
            stagingPath = staging->path();
        }
        const QString temporary = QDir(stagingPath).filePath(QStringLiteral("output"));
        if (!QFileInfo(stagingPath).isDir() || QFileInfo::exists(temporary)) {
            throw std::runtime_error("Export staging directory is unavailable");
        }
        QFile pngOutput(temporary);
        std::unique_ptr<PngZip> pngZip;
        if (png) {
            if (!pngOutput.open(QIODevice::WriteOnly)) throw std::runtime_error("Cannot open PNG ZIP output");
            pngZip = std::make_unique<PngZip>(pngOutput);
        }
        std::unique_ptr<Muxer> muxer;
        Codec video;
        Codec audio;
        AVStream* videoStream = nullptr;
        AVStream* audioStream = nullptr;
        if (!png) {
            muxer = std::make_unique<Muxer>(temporary, options.format);
            if (!audioOnly) {
                const auto* encoder = chosen(options.videoEncoder, options.format == u"mp4" ? h264Encoder() : avcodec_find_encoder_by_name("libvpx-vp9"));
                video = videoCodec(encoder, timeline);
                result.videoEncoder = QString::fromUtf8(encoder->name);
                videoStream = muxer->add(*video);
                videoStream->avg_frame_rate = video->framerate;
            }
            const auto* encoder = chosen(options.audioEncoder, options.format == u"mp4" ? avcodec_find_encoder(AV_CODEC_ID_AAC)
                : options.format == u"webm" ? avcodec_find_encoder_by_name("libopus")
                : options.format == u"wav" ? avcodec_find_encoder(AV_CODEC_ID_PCM_S16LE)
                : avcodec_find_encoder_by_name("libmp3lame"));
            audio = audioCodec(encoder);
            result.audioEncoder = QString::fromUtf8(encoder->name);
            audioStream = muxer->add(*audio);
            muxer->header(options.format == u"mp4");
        }
        std::vector<float> pcm;
        if (!png) {
            report(QStringLiteral("audio"));
            std::vector<std::string> problems;
            pcm = audio::renderOffline(timeline, 48000, 0, static_cast<double>(result.samples) / 48, &problems, cancelled);
            if (cancelled()) { result.cancelled = true; return result; }
            for (const auto& problem : problems) {
                // A silent video source is valid. Missing or corrupt media is
                // still an export error, rather than an unnoticed omission.
                if (!problem.ends_with(": no audio stream")) throw std::runtime_error(problem);
            }
            pcm.resize(static_cast<std::size_t>(result.samples * 2), 0);
        }
        std::unique_ptr<AudioFrames> audioFrames;
        if (audio) audioFrames = std::make_unique<AudioFrames>(*audio);
        qint64 audioOffset = 0;
        const auto soundUntil = [&](qint64 limit) {
            while (audio && audioOffset < std::min(limit, result.samples) && !cancelled()) {
                auto f = audioFrames->next(pcm, audioOffset);
                audioOffset += f->nb_samples;
                muxer->encode(*audio, *audioStream, f.get());
            }
        };
        if (!audioOnly) {
            TimelineModel model;
            Timeline pictureTimeline = timeline;
            for (auto& clip : pictureTimeline.clips) {
                auto matte = clip.raw.value("generatedMatte").toObject();
                if (!matte.isEmpty() && !matte.value("mediaPath").toString().isEmpty()) {
                    const QString resolved = nt::effects::resolvedGeneratedMattePath(clip);
                    if (!resolved.isEmpty()) {
                        matte.insert("mediaPath", resolved);
                        clip.raw.insert("generatedMatte", matte);
                    }
                }
                if ((clip.mediaType == MediaType::Video || clip.mediaType == MediaType::Image) &&
                    !clip.originalMediaPath.empty()) {
                    clip.mediaPath = clip.originalMediaPath;
                }
            }
            model.setTimeline(std::move(pictureTimeline));
            OffscreenFrames frames(model);
            std::unique_ptr<SwsContext, ScaleDelete> scale;
            Frame output;
            if (video) {
                scale.reset(sws_getContext(timeline.width, timeline.height, AV_PIX_FMT_RGBA, video->width, video->height,
                    AV_PIX_FMT_YUV420P, SWS_BICUBIC, nullptr, nullptr, nullptr));
                if (!scale) throw std::runtime_error("Cannot create export video conversion");
                check(sws_setColorspaceDetails(scale.get(), sws_getCoefficients(SWS_CS_ITU709), 1,
                    sws_getCoefficients(SWS_CS_ITU709), 0, 0, 1 << 16, 1 << 16), "Set export color conversion");
                output = frame();
                output->format = video->pix_fmt;
                output->width = video->width;
                output->height = video->height;
                output->color_range = video->color_range;
                output->colorspace = video->colorspace;
                check(av_frame_get_buffer(output.get(), 32), "Allocate export video frame");
            }
            for (qint64 i = 0; i < result.frames && !cancelled(); ++i) {
                const QImage image = frames.capture(i, timeline.fps, cancelled);
                if (cancelled()) break;
                if (image.isNull()) throw std::runtime_error("Empty export frame");
                if (png) {
                    QByteArray bytes;
                    QBuffer buffer(&bytes);
                    if (!buffer.open(QIODevice::WriteOnly) || !image.save(&buffer, "PNG")) {
                        throw std::runtime_error("Cannot encode export PNG");
                    }
                    const auto name = QStringLiteral("frame_%1.png").arg(i + 1, 6, 10, QLatin1Char('0')).toUtf8();
                    pngZip->add(name, bytes);
                } else {
                    check(av_frame_make_writable(output.get()), "Make export frame writable");
                    const std::array<const uint8_t*, 4> data{image.constBits(), nullptr, nullptr, nullptr};
                    const std::array<int, 4> stride{static_cast<int>(image.bytesPerLine()), 0, 0, 0};
                    check(sws_scale(scale.get(), data.data(), stride.data(), 0, timeline.height, output->data, output->linesize), "Convert export video");
                    output->pts = i;
                    output->duration = 1;
                    muxer->encode(*video, *videoStream, output.get());
                    soundUntil(std::llround((i + 1) * 48000 / timeline.fps));
                }
                report(QStringLiteral("encoding"), i + 1);
            }
        } else {
            // Chunked audio progress makes the same cancel path observable
            // for audio-only exports, without inventing video frames.
            for (qint64 i = 0; i < result.frames && !cancelled(); ++i) {
                soundUntil(std::llround(static_cast<double>(i + 1) / result.frames * result.samples));
                report(QStringLiteral("encoding"), i + 1);
            }
        }
        if (cancelled()) { result.cancelled = true; return result; }
        report(QStringLiteral("finalizing"), result.frames);
        if (png) {
            const auto bytes = QJsonDocument(QJsonObject{
                {QStringLiteral("format"), QStringLiteral("png_sequence")},
                {QStringLiteral("pattern"), QStringLiteral("frame_%06d.png")},
                {QStringLiteral("fps"), timeline.fps}, {QStringLiteral("width"), timeline.width},
                {QStringLiteral("height"), timeline.height}, {QStringLiteral("count"), result.frames}
            }).toJson();
            pngZip->add("manifest.json", bytes);
            pngZip->finish();
            if (!pngOutput.flush()) throw std::runtime_error("Cannot flush PNG ZIP output");
            pngOutput.close();
        } else {
            soundUntil(result.samples);
            if (video) muxer->encode(*video, *videoStream, nullptr);
            muxer->encode(*audio, *audioStream, nullptr);
            muxer->finish();
            muxer.reset();
        }
        if (cancelled()) { result.cancelled = true; return result; }
        if (!QDir().rename(temporary, destination.absoluteFilePath())) throw std::runtime_error("Cannot publish completed export");
    } catch (const std::exception& error) {
        result.error = QString::fromUtf8(error.what());
    }
    return result;
}
}
