// Independent libav reader. Does not call the host adapter or guest wrappers.
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>
}
int main(int argc, char **argv) {
  if (argc != 3)
    return 2;
  AVFormatContext *input = nullptr;
  AVCodecContext *codec = nullptr;
  AVPacket *packet = av_packet_alloc();
  AVFrame *frame = av_frame_alloc();
  SwsContext *scale = nullptr;
  int count = 0, result = 1;
  try {
    if (avformat_open_input(&input, argv[1], nullptr, nullptr) < 0 ||
        avformat_find_stream_info(input, nullptr) < 0)
      throw std::runtime_error("open failed");
    int stream =
        av_find_best_stream(input, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
    if (stream < 0)
      throw std::runtime_error("no video");
    codec = avcodec_alloc_context3(
        avcodec_find_decoder(input->streams[stream]->codecpar->codec_id));
    avcodec_parameters_to_context(codec, input->streams[stream]->codecpar);
    if (avcodec_open2(codec, codec->codec, nullptr) < 0)
      throw std::runtime_error("decoder failed");
    auto drain = [&] {
      while (avcodec_receive_frame(codec, frame) >= 0) {
        if (frame->width != 8 || frame->height != 8)
          throw std::runtime_error("dimensions mismatch");
        unsigned char rgba[8 * 64 + 64];
        unsigned char *dst[] = {rgba};
        int stride[] = {64};
        scale = sws_getCachedContext(
            scale, 8, 8, static_cast<AVPixelFormat>(frame->format), 8, 8,
            AV_PIX_FMT_RGBA, SWS_BILINEAR, nullptr, nullptr, nullptr);
        sws_scale(scale, frame->data, frame->linesize, 0, 8, dst, stride);
        for (int i = 0; i < 64; i++) {
          const auto *pixel = rgba + (i / 8) * 64 + (i % 8) * 4;
          const int selected = count == 1 ? 1 : 0;
          if (pixel[selected] < 180 || pixel[1 - selected] > 40 ||
              pixel[2] > 40 || pixel[3] != 255)
            throw std::runtime_error("decoded pixels mismatch");
        }
        ++count;
        av_frame_unref(frame);
      }
    };
    while (av_read_frame(input, packet) >= 0) {
      if (packet->stream_index == stream) {
        if (avcodec_send_packet(codec, packet) < 0)
          throw std::runtime_error("packet failed");
        drain();
      }
      av_packet_unref(packet);
    }
    avcodec_send_packet(codec, nullptr);
    drain();
    if (count != std::atoi(argv[2]))
      throw std::runtime_error("frame count mismatch");
    std::printf("independent libav decode: %d frames, 8x8, pixels verified\n",
                count);
    result = 0;
  } catch (const std::exception &e) {
    std::fprintf(stderr, "%s\n", e.what());
  }
  sws_freeContext(scale);
  av_frame_free(&frame);
  av_packet_free(&packet);
  avcodec_free_context(&codec);
  avformat_close_input(&input);
  return result;
}
