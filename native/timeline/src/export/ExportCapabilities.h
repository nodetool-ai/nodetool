#pragma once
struct AVCodec;
namespace nt::exporting {
const AVCodec* h264Encoder();
bool mp4Available();
}
