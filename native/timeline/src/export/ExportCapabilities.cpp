#include "export/ExportCapabilities.h"
#include <QtGlobal>
extern "C" {
#include <libavcodec/avcodec.h>
}
namespace nt::exporting {
const AVCodec* h264Encoder() {
#ifdef Q_OS_MACOS
    // VideoToolbox selection is unbuilt on this Linux machine.
    if (const auto* codec = avcodec_find_encoder_by_name("h264_videotoolbox")) return codec;
#endif
    if (const auto* codec = avcodec_find_encoder_by_name("libx264")) return codec;
    void* iterator = nullptr;
    while (const auto* codec = av_codec_iterate(&iterator)) {
        if (av_codec_is_encoder(codec) && codec->id == AV_CODEC_ID_H264 && !(codec->capabilities & AV_CODEC_CAP_HARDWARE)) {
            return codec;
        }
    }
    return nullptr;
}
bool mp4Available() { return h264Encoder() && avcodec_find_encoder(AV_CODEC_ID_AAC); }
}
