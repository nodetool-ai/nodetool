#pragma once
#include <QImageReader>
#include <QJsonObject>
#include <QSize>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <functional>
#include <memory>
#include <string>
extern "C" {
#include <libavcodec/codec.h>
#include <libavformat/avformat.h>
}

namespace nt::assets {
struct PreviewMediaFacts {
    double durationMs = 0;
    QSize size;
    bool hasVideo = false;
    bool hasAudio = false;
    bool hasImage = false;
    bool readable = false;
};
// Read local container facts only. Interrupt probing on cancellation or timeout.
inline PreviewMediaFacts probePreviewMedia(const std::string& path, const std::function<bool()>& interrupted = {}) {
    struct ProbeDeadline {
        const std::function<bool()>& interrupted;
        std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        bool expired() const { return (interrupted && interrupted()) || std::chrono::steady_clock::now() >= end; }
    } deadline{interrupted};
    if (path.empty() || deadline.expired()) { return {}; }
    AVFormatContext* opened = avformat_alloc_context();
    if (!opened) { return {}; }
    opened->interrupt_callback = {[](void* opaque) {
        return static_cast<ProbeDeadline*>(opaque)->expired() ? 1 : 0;
    }, &deadline};
    // The resolver supplies a cache file, never a URL or a nested network input.
    AVDictionary* options = nullptr;
    av_dict_set(&options, "protocol_whitelist", "file", 0);
    const int status = avformat_open_input(&opened, path.c_str(), nullptr, &options);
    av_dict_free(&options);
    if (status < 0) { return {}; }
    const auto close = [](AVFormatContext* context) { avformat_close_input(&context); };
    const std::unique_ptr<AVFormatContext, decltype(close)> context(opened, close);
    if (deadline.expired() || avformat_find_stream_info(context.get(), nullptr) < 0 || deadline.expired()) { return {}; }
    double duration = context->duration > 0 ? static_cast<double>(context->duration) / (AV_TIME_BASE / 1000.0) : 0;
    PreviewMediaFacts facts;
    const std::string format = context->iformat && context->iformat->name ? context->iformat->name : "";
    const bool imageContainer = format == "image2" || format == "image2pipe" || format.ends_with("_pipe") ||
        format == "gif" || format == "apng" || format == "ico";
    for (unsigned i = 0; i < context->nb_streams; ++i) {
        const auto* stream = context->streams[i];
        const bool decodable = avcodec_find_decoder(stream->codecpar->codec_id) != nullptr;
        const bool videoStream = decodable && stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
            stream->codecpar->width > 0 && stream->codecpar->height > 0;
        const bool audioStream = decodable && stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
            stream->codecpar->sample_rate > 0 && stream->codecpar->ch_layout.nb_channels > 0;
        facts.hasAudio = facts.hasAudio || audioStream;
        facts.hasVideo = facts.hasVideo || videoStream;
        facts.hasImage = facts.hasImage || (videoStream &&
            (imageContainer || (stream->disposition & AV_DISPOSITION_STILL_IMAGE)));
        if (facts.size.isEmpty() && stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
            stream->codecpar->width > 0 && stream->codecpar->height > 0) {
            facts.size = QSize(stream->codecpar->width, stream->codecpar->height);
        }
        if (stream->duration > 0) {
            duration = std::max(duration, stream->duration * av_q2d(stream->time_base) * 1000.0);
        }
    }
    facts.durationMs = std::isfinite(duration) && duration > 0 ? duration : 0;
    return facts;
}
inline double previewDurationMs(const std::string& path, const std::function<bool()>& interrupted = {}) {
    return probePreviewMedia(path, interrupted).durationMs;
}
inline PreviewMediaFacts previewMediaFacts(const std::string& path, const QString& mediaType,
                                          const QJsonObject& asset,
                                          const std::function<bool()>& interrupted = {}) {
    if (interrupted && interrupted()) { return {}; }
    PreviewMediaFacts facts;
    if (mediaType == u"image") {
        QImageReader reader(QString::fromStdString(path));
        facts.readable = reader.canRead();
        facts.size = reader.size();
        if (!facts.readable) {
            facts = probePreviewMedia(path, interrupted);
            facts.readable = facts.hasImage;
        }
    } else {
        facts = probePreviewMedia(path, interrupted);
        facts.readable = mediaType == u"audio" ? facts.hasAudio : mediaType == u"video" && facts.hasVideo;
    }
    if (facts.size.isEmpty()) {
        const auto metadata = asset.value("metadata").toObject();
        facts.size = QSize(metadata.value("width").toInt(), metadata.value("height").toInt());
    }
    if (facts.size.isEmpty()) { facts.size = QSize(1920, 1080); }
    return facts;
}
}
