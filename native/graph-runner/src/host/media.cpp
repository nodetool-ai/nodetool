#include "host/media.h"
#include "host/image.h"
#include "host/paths.h"
#include "kernel/json.h"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstring>
#include <map>
extern "C" {
#include <libavcodec/avcodec.h>
#include <libavfilter/avfilter.h>
#include <libavfilter/buffersink.h>
#include <libavfilter/buffersrc.h>
#include <libavformat/avformat.h>
#include <libavutil/display.h>
#include <libavutil/opt.h>
#include <libavutil/pixdesc.h>
#include <libswscale/swscale.h>
}
namespace gr::host {
namespace {
void check(int code) {
  if (code >= 0)
    return;
  char error[AV_ERROR_MAX_STRING_SIZE];
  av_strerror(code, error, sizeof(error));
  throw std::runtime_error(std::string("native media: ") + error);
}
// Validate before libav initializes filters: some filters open their own files.
void filterPolicy(const std::string &chain) {
  static const std::set<std::string> allowed = {
      "scale",    "format",   "fps",         "trim",      "setpts",
      "pad",      "crop",     "setsar",      "null",      "anull",
      "atrim",    "asetpts",  "aresample",   "aformat",   "volume",
      "adelay",   "apad",     "amix",        "afade",     "atempo",
      "pan",      "lowshelf", "highshelf",   "equalizer", "lowpass",
      "highpass", "bandpass", "acompressor", "aecho",     "asoftclip",
      "anullsrc"};
  if (chain.size() > 65536)
    throw std::runtime_error("native media filter size quota exceeded");
  bool start = true, quote = false, escape = false;
  for (size_t i = 0; i < chain.size(); ++i) {
    char c = chain[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c == '\\') {
      escape = true;
      continue;
    }
    if (c == '\'') {
      quote = !quote;
      continue;
    }
    if (quote)
      continue;
    if (c == ',' || c == ';') {
      start = true;
      continue;
    }
    if (!start || std::isspace(static_cast<unsigned char>(c)))
      continue;
    if (c == '[') {
      auto end = chain.find(']', i);
      if (end == std::string::npos)
        throw std::runtime_error("native media invalid filter label");
      i = end;
      continue;
    }
    size_t end = i;
    while (end < chain.size() &&
           (std::isalnum(static_cast<unsigned char>(chain[end])) ||
            chain[end] == '_'))
      ++end;
    if (!allowed.contains(chain.substr(i, end - i)))
      throw std::runtime_error("native media filter is not granted");
    start = false;
    i = end - 1;
  }
}
struct Dictionary {
  AVDictionary *value = nullptr;
  ~Dictionary() { av_dict_free(&value); }
};
struct FrameDelete {
  void operator()(AVFrame *f) const { av_frame_free(&f); }
};
using Frame = std::unique_ptr<AVFrame, FrameDelete>;
Frame frame() {
  Frame f(av_frame_alloc());
  if (!f)
    throw std::bad_alloc();
  return f;
}
struct Policy {
  MediaOptions options;
  std::vector<Root> roots;
  std::string cwd;
  void poll() const {
    if (!options.enabled)
      throw std::runtime_error("native media grant is disabled");
    if (options.cancelled && options.cancelled())
      throw std::runtime_error("native media cancelled");
  }
  void pixels(int w, int h) const {
    if (w <= 0 || h <= 0 || size_t(w) > options.maxPixels / size_t(h))
      throw std::runtime_error("native media pixel quota exceeded");
  }
  std::string path(const std::string &p, bool write = false) const {
    poll();
    return confine(roots, cwd, p, write ? Access::Write : Access::Read, "media",
                   true)
        .real;
  }
  const AVCodec *encoder(const std::string &name) const {
    poll();
    if (!options.encoders.contains(name))
      throw std::runtime_error("native media codec is not granted: " + name);
    auto c = avcodec_find_encoder_by_name(name.c_str());
    if (!c)
      throw std::runtime_error("native media encoder unavailable: " + name);
    return c;
  }
};
struct Input {
  // native-rules #6: raw libav handles freed by hand in the destructor, no per-handle RAII
  AVFormatContext *format = nullptr;
  AVCodecContext *codec = nullptr;
  AVPacket *packet = av_packet_alloc();
  int stream = -1;
  bool eof = false;
  double seek = 0;
  std::shared_ptr<Policy> policy;
  ~Input() {
    av_packet_free(&packet);
    avcodec_free_context(&codec);
    avformat_close_input(&format);
  }
  void open(std::shared_ptr<Policy> p, const std::string &path,
            bool audio = false, double start = 0, bool decode = true) {
    policy = p;
    const auto resolved = p->path(path);
    format = avformat_alloc_context();
    format->interrupt_callback = {
        [](void *ptr) {
          auto p = static_cast<Policy *>(ptr);
          return p->options.cancelled && p->options.cancelled() ? 1 : 0;
        },
        p.get()};
    Dictionary dictionary;
    auto &opts = dictionary.value;
    av_dict_set(&opts, "protocol_whitelist", "file", 0);
    // Exclude playlist/concat/image-sequence demuxers that can open additional
    // paths.
    av_dict_set(
        &opts, "format_whitelist",
        "mov,matroska,webm,wav,mp3,ogg,flac,aac,png_pipe,jpeg_pipe,webp_pipe",
        0);
    int opened = avformat_open_input(&format, resolved.c_str(), nullptr, &opts);
    av_dict_free(&opts);
    check(opened);
    if (format->pb && avio_size(format->pb) > int64_t(p->options.maxBytes))
      throw std::runtime_error("native media input byte quota exceeded");
    check(avformat_find_stream_info(format, nullptr));
    stream = av_find_best_stream(
        format, audio ? AVMEDIA_TYPE_AUDIO : AVMEDIA_TYPE_VIDEO, -1, -1,
        nullptr, 0);
    if (stream < 0 || !decode)
      return;
    auto par = format->streams[stream]->codecpar;
    if (!audio)
      p->pixels(par->width, par->height);
    auto decoder = avcodec_find_decoder(par->codec_id);
    if (!decoder)
      throw std::runtime_error("native media decoder unavailable");
    codec = avcodec_alloc_context3(decoder);
    check(avcodec_parameters_to_context(codec, par));
    codec->thread_count = 1;
    codec->max_pixels = p->options.maxPixels;
    check(avcodec_open2(codec, decoder, nullptr));
    seek = std::max(0.0, start);
    if (seek > 0) {
      auto s = format->streams[stream];
      check(av_seek_frame(
          format, stream,
          int64_t(seek / av_q2d(s->time_base)) +
              (s->start_time == AV_NOPTS_VALUE ? 0 : s->start_time),
          AVSEEK_FLAG_BACKWARD));
    }
  }
  Frame next() {
    if (!codec)
      return {};
    for (;;) {
      policy->poll();
      auto f = frame();
      int r = avcodec_receive_frame(codec, f.get());
      if (r == AVERROR_EOF)
        return {};
      if (r >= 0) {
        const auto tb = format->streams[stream]->time_base;
        f->time_base = tb;
        f->pts = f->best_effort_timestamp;
        auto start = format->streams[stream]->start_time;
        if (f->pts != AV_NOPTS_VALUE && start != AV_NOPTS_VALUE)
          f->pts -= start;
        if (f->pts != AV_NOPTS_VALUE && f->pts * av_q2d(tb) + 1e-9 < seek)
          continue;
        if (f->pts != AV_NOPTS_VALUE)
          f->pts -= int64_t(seek / av_q2d(tb));
        if (f->width)
          policy->pixels(f->width, f->height);
        return f;
      }
      if (r != AVERROR(EAGAIN))
        check(r);
      if (eof)
        return {};
      for (;;) {
        r = av_read_frame(format, packet);
        if (r < 0) {
          if (r != AVERROR_EOF)
            check(r);
          eof = true;
          check(avcodec_send_packet(codec, nullptr));
          break;
        }
        if (packet->stream_index == stream) {
          int sent = avcodec_send_packet(codec, packet);
          av_packet_unref(packet);
          check(sent);
          break;
        }
        av_packet_unref(packet);
      }
    }
  }
};
struct Filter {
  // native-rules #6: raw AVFilterGraph freed by hand in the destructor
  AVFilterGraph *graph = avfilter_graph_alloc();
  AVFilterContext *sink = nullptr;
  std::vector<AVFilterContext *> sources;
  std::vector<std::unique_ptr<Input>> inputs;
  std::vector<Frame> first;
  std::vector<bool> ended;
  size_t count = 0;
  std::shared_ptr<Policy> policy;
  bool audio = false;
  ~Filter() { avfilter_graph_free(&graph); }
  void init(std::shared_ptr<Policy> p, const Json &opts) {
    policy = p;
    audio = opts.value("outputKind", "video") == "audio";
    graph->nb_threads = 1;
    // native-rules #6: raw AVFilterInOut freed by hand on every exit path
    AVFilterInOut *outputs = nullptr;
    AVFilterInOut *in = avfilter_inout_alloc();
    try {
      check(avfilter_graph_create_filter(
          &sink, avfilter_get_by_name(audio ? "abuffersink" : "buffersink"),
          "out", nullptr, nullptr, graph));
      in->name = av_strdup(opts.value("output", "out").c_str());
      in->filter_ctx = sink;
      in->pad_idx = 0;
      for (const auto &item : opts.at("inputs")) {
        if (inputs.size() >= p->options.maxSessions)
          throw std::runtime_error("native media input quota exceeded");
        auto input = std::make_unique<Input>();
        bool sound = item.value("kind", "video") == "audio";
        input->open(p, item.at("filePath"), sound, item.value("seekSec", 0.0));
        auto f = input->next();
        if (!f)
          throw std::runtime_error("native media input has no frames");
        AVFilterContext *src = nullptr;
        std::string args;
        auto tb = input->format->streams[input->stream]->time_base;
        if (sound) {
          char layout[128];
          av_channel_layout_describe(&f->ch_layout, layout, sizeof(layout));
          args = "time_base=" + std::to_string(tb.num) + "/" +
                 std::to_string(tb.den) +
                 ":sample_rate=" + std::to_string(f->sample_rate) +
                 ":sample_fmt=" +
                 av_get_sample_fmt_name(AVSampleFormat(f->format)) +
                 ":channel_layout=" + layout;
        } else {
          args = "video_size=" + std::to_string(f->width) + "x" +
                 std::to_string(f->height) +
                 ":pix_fmt=" + std::to_string(f->format) +
                 ":time_base=" + std::to_string(tb.num) + "/" +
                 std::to_string(tb.den) + ":pixel_aspect=1/1";
        }
        check(avfilter_graph_create_filter(
            &src, avfilter_get_by_name(sound ? "abuffer" : "buffer"),
            ("in" + std::to_string(inputs.size())).c_str(), args.c_str(),
            nullptr, graph));
        auto out = avfilter_inout_alloc();
        out->name = av_strdup(item.value("label", "in").c_str());
        out->filter_ctx = src;
        out->pad_idx = 0;
        out->next = outputs;
        outputs = out;
        sources.push_back(src);
        first.push_back(std::move(f));
        inputs.push_back(std::move(input));
        ended.push_back(false);
      }
      std::string chain = opts.at("graph");
      filterPolicy(chain);
      check(avfilter_graph_parse_ptr(graph, chain.c_str(), &in, &outputs,
                                     nullptr));
      if (in || outputs)
        throw std::runtime_error("native media unconnected filter pads");
      if (graph->nb_filters > 256)
        throw std::runtime_error("native media filter count quota exceeded");
      check(avfilter_graph_config(graph, nullptr));
      if (!audio)
        p->pixels(av_buffersink_get_w(sink), av_buffersink_get_h(sink));
    } catch (...) {
      avfilter_inout_free(&in);
      avfilter_inout_free(&outputs);
      throw;
    }
    avfilter_inout_free(&in);
    avfilter_inout_free(&outputs);
  }
  Frame next() {
    policy->poll();
    if (++count > policy->options.maxFrames)
      throw std::runtime_error("native media frame quota exceeded");
    for (;;) {
      auto f = frame();
      int r = av_buffersink_get_frame(sink, f.get());
      if (r == AVERROR_EOF)
        return {};
      if (r >= 0) {
        f->time_base = av_buffersink_get_time_base(sink);
        if (f->width)
          policy->pixels(f->width, f->height);
        return f;
      }
      if (r != AVERROR(EAGAIN))
        check(r);
      bool fed = false;
      for (size_t i = 0; i < sources.size(); ++i) {
        policy->poll();
        if (ended[i])
          continue;
        auto next = first[i] ? std::move(first[i]) : inputs[i]->next();
        check(av_buffersrc_add_frame_flags(sources[i], next.get(),
                                           AV_BUFFERSRC_FLAG_KEEP_REF));
        if (!next)
          ended[i] = true;
        fed = true;
      }
      if (!fed)
        throw std::runtime_error("native media filter stalled");
    }
  }
};
struct Encoder {
  std::shared_ptr<Policy> policy;
  // native-rules #6: raw libav handles freed by hand in the destructor, no per-handle RAII
  AVFormatContext *format = nullptr;
  AVCodecContext *codec = nullptr;
  AVFilterGraph *graph = nullptr;
  AVFilterContext *source = nullptr;
  AVFilterContext *sink = nullptr;
  AVPacket *packet = av_packet_alloc();
  AVStream *stream = nullptr;
  size_t count = 0;
  Json opts;
  std::string path;
  ~Encoder() {
    avfilter_graph_free(&graph);
    av_packet_free(&packet);
    avcodec_free_context(&codec);
    if (format) {
      if (format->pb)
        avio_closep(&format->pb);
      avformat_free_context(format);
    }
  }
  void open(std::shared_ptr<Policy> p, Json o) {
    policy = p;
    opts = std::move(o);
    path = p->path(opts.at("outPath"), true);
    p->encoder(opts.at("spec").at("codec"));
  }
  void write(const std::vector<uint8_t> &bytes) {
    policy->poll();
    if (++count > policy->options.maxFrames)
      throw std::runtime_error("native media frame quota exceeded");
    int w = opts.value("width", 0), h = opts.value("height", 0);
    RgbaImage decoded;
    const uint8_t *rgba = bytes.data();
    if (opts.value("input", "rgba") == "png") {
      decoded = decodeImage(bytes.data(), bytes.size());
      w = decoded.width;
      h = decoded.height;
      rgba = decoded.pixels.data();
    }
    policy->pixels(w, h);
    if (decoded.pixels.empty() && bytes.size() != size_t(w) * h * 4)
      throw std::runtime_error("native media RGBA frame length mismatch");
    auto input = frame();
    input->format = AV_PIX_FMT_RGBA;
    input->width = w;
    input->height = h;
    input->pts = count - 1;
    check(av_frame_get_buffer(input.get(), 32));
    for (int y = 0; y < h; ++y)
      std::memcpy(input->data[0] + y * input->linesize[0],
                  rgba + size_t(y) * w * 4, size_t(w) * 4);
    if (!graph) {
      graph = avfilter_graph_alloc();
      graph->nb_threads = 1;
      auto rate = av_d2q(opts.at("fps").get<double>(), 1000000);
      if (rate.num <= 0)
        throw std::runtime_error("native media invalid fps");
      std::string args = "video_size=" + std::to_string(w) + "x" +
                         std::to_string(h) +
                         ":pix_fmt=" + std::to_string(AV_PIX_FMT_RGBA) +
                         ":time_base=" + std::to_string(rate.den) + "/" +
                         std::to_string(rate.num) + ":pixel_aspect=1/1";
      check(avfilter_graph_create_filter(&source,
                                         avfilter_get_by_name("buffer"), "in",
                                         args.c_str(), nullptr, graph));
      check(avfilter_graph_create_filter(&sink,
                                         avfilter_get_by_name("buffersink"),
                                         "out", nullptr, nullptr, graph));
      auto in = avfilter_inout_alloc();
      auto out = avfilter_inout_alloc();
      in->name = av_strdup("out");
      in->filter_ctx = sink;
      in->pad_idx = 0;
      out->name = av_strdup("in");
      out->filter_ctx = source;
      out->pad_idx = 0;
      auto spec = opts.at("spec");
      std::string chain = spec.value("filter", "");
      try {
        filterPolicy(chain);
      } catch (...) {
        avfilter_inout_free(&in);
        avfilter_inout_free(&out);
        throw;
      }
      if (!chain.empty())
        chain += ",";
      chain += "format=" + spec.value("pixelFormat", "yuv420p");
      int r =
          avfilter_graph_parse_ptr(graph, chain.c_str(), &in, &out, nullptr);
      avfilter_inout_free(&in);
      avfilter_inout_free(&out);
      check(r);
      check(avfilter_graph_config(graph, nullptr));
    }
    check(av_buffersrc_add_frame_flags(source, input.get(),
                                       AV_BUFFERSRC_FLAG_KEEP_REF));
    auto filtered = frame();
    check(av_buffersink_get_frame(sink, filtered.get()));
    w = filtered->width;
    h = filtered->height;
    policy->pixels(w, h);
    if (!codec) {
      auto spec = opts.at("spec");
      const auto *c = policy->encoder(spec.at("codec"));
      codec = avcodec_alloc_context3(c);
      codec->width = w;
      codec->height = h;
      codec->pix_fmt =
          av_get_pix_fmt(spec.value("pixelFormat", "yuv420p").c_str());
      codec->framerate = av_d2q(opts.at("fps").get<double>(), 1000000);
      codec->time_base = av_inv_q(codec->framerate);
      codec->thread_count = 1;
      if (codec->framerate.num <= 0)
        throw std::runtime_error("native media invalid fps");
      check(avformat_alloc_output_context2(&format, nullptr, nullptr,
                                           path.c_str()));
      if (format->oformat->flags & AVFMT_GLOBALHEADER)
        codec->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
      Dictionary dictionary;
      auto &options = dictionary.value;
      auto codecOptions = spec.value("options", Json::object());
      for (auto &[key, value] : codecOptions.items()) {
        static const std::set<std::string> allowed = {"preset",
                                                      "crf",
                                                      "b",
                                                      "profile",
                                                      "level",
                                                      "colorspace",
                                                      "color_primaries",
                                                      "color_trc",
                                                      "color_range",
                                                      "q",
                                                      "qscale",
                                                      "deadline",
                                                      "cpu-used",
                                                      "lossless",
                                                      "row-mt"};
        if (!allowed.contains(key)) {
          av_dict_free(&options);
          throw std::runtime_error("native media encoder option not granted: " +
                                   key);
        }
        av_dict_set(&options, key.c_str(), value.get<std::string>().c_str(), 0);
      }
      int r = avcodec_open2(codec, c, &options);
      av_dict_free(&options);
      check(r);
      stream = avformat_new_stream(format, nullptr);
      stream->time_base = codec->time_base;
      stream->avg_frame_rate = codec->framerate;
      check(avcodec_parameters_from_context(stream->codecpar, codec));
      check(avio_open(&format->pb, path.c_str(), AVIO_FLAG_WRITE));
      auto muxerOptions = opts.value("muxerOptions", Json::object());
      for (auto &[key, value] : muxerOptions.items()) {
        if (key != "movflags") {
          av_dict_free(&options);
          throw std::runtime_error("native media muxer option not granted");
        }
        av_dict_set(&options, key.c_str(), value.get<std::string>().c_str(), 0);
      }
      r = avformat_write_header(format, &options);
      av_dict_free(&options);
      check(r);
    }
    if (w != codec->width || h != codec->height)
      throw std::runtime_error("native media frame size changed");
    filtered->pts = count - 1;
    send(filtered.get());
  }

  void send(AVFrame *f) {
    check(avcodec_send_frame(codec, f));
    for (;;) {
      policy->poll();
      int r = avcodec_receive_packet(codec, packet);
      if (r == AVERROR(EAGAIN) || r == AVERROR_EOF)
        break;
      check(r);
      if (packet->duration <= 0 && codec->codec_type == AVMEDIA_TYPE_VIDEO)
        packet->duration = 1;
      av_packet_rescale_ts(packet, codec->time_base, stream->time_base);
      packet->stream_index = stream->index;
      r = av_interleaved_write_frame(format, packet);
      av_packet_unref(packet);
      check(r);
      if (avio_tell(format->pb) > int64_t(policy->options.maxBytes))
        throw std::runtime_error("native media output byte quota exceeded");
    }
  }
  void finish() {
    if (!codec)
      throw std::runtime_error("native media no frames written");
    check(av_buffersrc_add_frame_flags(source, nullptr, 0));
    for (;;) {
      auto f = frame();
      int r = av_buffersink_get_frame(sink, f.get());
      if (r == AVERROR_EOF || r == AVERROR(EAGAIN))
        break;
      check(r);
      send(f.get());
    }
    send(nullptr);
    check(av_write_trailer(format));
  }
};
// Keep video packets compressed while encoding the filter graph's audio.
void muxAudio(std::shared_ptr<Policy> policy, const Json &opts) {
  Input video;
  video.open(policy, opts.at("videoPath"), false, 0, false);
  if (video.stream < 0)
    throw std::runtime_error("native media mux needs video");
  double duration = video.format->duration == AV_NOPTS_VALUE
                        ? 0
                        : double(video.format->duration) / AV_TIME_BASE;
  if (!(duration > 0))
    throw std::runtime_error("native media mux needs finite video duration");
  Encoder output;
  output.policy = policy;
  auto path = policy->path(opts.at("outPath"), true);
  check(avformat_alloc_output_context2(&output.format, nullptr, nullptr,
                                       path.c_str()));
  auto picture = avformat_new_stream(output.format, nullptr);
  auto original = video.format->streams[video.stream];
  check(avcodec_parameters_copy(picture->codecpar, original->codecpar));
  picture->codecpar->codec_tag = 0;
  picture->time_base = original->time_base;
  auto codec = policy->encoder(opts.value("codec", "aac"));
  output.codec = avcodec_alloc_context3(codec);
  output.codec->sample_rate = opts.value("sampleRate", 48000);
  output.codec->sample_fmt = AV_SAMPLE_FMT_FLTP;
  av_channel_layout_default(&output.codec->ch_layout, 2);
  output.codec->time_base = {1, output.codec->sample_rate};
  output.codec->bit_rate = 192000;
  if (output.format->oformat->flags & AVFMT_GLOBALHEADER)
    output.codec->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
  check(avcodec_open2(output.codec, codec, nullptr));
  output.stream = avformat_new_stream(output.format, nullptr);
  output.stream->time_base = output.codec->time_base;
  check(avcodec_parameters_from_context(output.stream->codecpar, output.codec));
  auto spec = opts.at("filter");
  std::string label = spec.value("output", "out");
  std::string graph = spec.at("graph");
  graph += ";[" + label + "]aformat=sample_fmts=fltp:sample_rates=" +
           std::to_string(output.codec->sample_rate) +
           ":channel_layouts=stereo[native_audio]";
  spec["graph"] = graph;
  spec["output"] = "native_audio";
  Filter audio;
  audio.init(policy, spec);
  if (output.codec->frame_size)
    av_buffersink_set_frame_size(audio.sink, output.codec->frame_size);
  check(avio_open(&output.format->pb, path.c_str(), AVIO_FLAG_WRITE));
  check(avformat_write_header(output.format, nullptr));
  bool videoDone = false, audioDone = false;
  double pictureTime = 0, audioTime = 0;
  size_t frames = 0;
  while (!videoDone || !audioDone) {
    policy->poll();
    if (++frames > policy->options.maxFrames * 4)
      throw std::runtime_error("native media mux packet quota exceeded");
    if (!videoDone && (audioDone || pictureTime <= audioTime)) {
      int r = av_read_frame(video.format, video.packet);
      if (r == AVERROR_EOF) {
        videoDone = true;
        continue;
      }
      check(r);
      if (video.packet->stream_index == video.stream) {
        pictureTime = video.packet->dts * av_q2d(original->time_base);
        av_packet_rescale_ts(video.packet, original->time_base,
                             picture->time_base);
        video.packet->stream_index = picture->index;
        check(av_interleaved_write_frame(output.format, video.packet));
      }
      av_packet_unref(video.packet);
    } else {
      auto f = audio.next();
      if (!f || f->pts * av_q2d(f->time_base) >= duration) {
        audioDone = true;
        output.send(nullptr);
        continue;
      }
      audioTime = f->pts * av_q2d(f->time_base);
      f->pts = av_rescale_q(f->pts, f->time_base, output.codec->time_base);
      f->nb_samples = std::min(
          f->nb_samples,
          int(std::ceil((duration - audioTime) * output.codec->sample_rate)));
      output.send(f.get());
    }
  }
  check(av_write_trailer(output.format));
}
struct State {
  std::shared_ptr<Policy> policy;
  int id = 0;
  std::map<int, std::unique_ptr<Filter>> filters;
  std::map<int, std::unique_ptr<Encoder>> encoders;
  void room() {
    policy->poll();
    if (filters.size() + encoders.size() >= policy->options.maxSessions)
      throw std::runtime_error("native media session quota exceeded");
  }
};
Json json(js::Engine &e, const js::Value &v) {
  return Json::parse(e.toString(e.call(
      e.get(e.get(e.global(), "JSON"), "stringify"), e.undefined(), {v})));
}
js::Value value(js::Engine &e, const Json &j) {
  return e.call(e.get(e.get(e.global(), "JSON"), "parse"), e.undefined(),
                {e.string(j.dump())});
}
Json probe(Input &i) {
  Json result = {{"format", i.format->iformat->name},
                 {"durationSec", nullptr},
                 {"video", nullptr},
                 {"audio", nullptr}};
  if (i.format->duration != AV_NOPTS_VALUE)
    result["durationSec"] = double(i.format->duration) / AV_TIME_BASE;
  for (unsigned n = 0; n < i.format->nb_streams; ++n) {
    auto s = i.format->streams[n];
    auto p = s->codecpar;
    if (p->codec_type == AVMEDIA_TYPE_VIDEO && result["video"].is_null()) {
      double rate = av_q2d(s->r_frame_rate),
             average = av_q2d(s->avg_frame_rate);
      auto pix = av_pix_fmt_desc_get(AVPixelFormat(p->format));
      double rotation = 0;
      auto matrix = av_packet_side_data_get(
          p->coded_side_data, p->nb_coded_side_data, AV_PKT_DATA_DISPLAYMATRIX);
      if (matrix && matrix->size >= 9 * sizeof(int32_t)) {
        double angle = -av_display_rotation_get(
            reinterpret_cast<const int32_t *>(matrix->data));
        if (std::isfinite(angle))
          rotation = std::fmod(std::fmod(angle, 360.0) + 360.0, 360.0);
      }
      bool swap =
          std::abs(rotation - 90) < 0.01 || std::abs(rotation - 270) < 0.01;
      result["video"] = {
          {"codec", avcodec_get_name(p->codec_id)},
          {"width", p->width},
          {"height", p->height},
          {"displayWidth", swap ? p->height : p->width},
          {"displayHeight", swap ? p->width : p->height},
          {"rotation", rotation},
          {"nominalFps", rate > 0 ? Json(rate) : Json(nullptr)},
          {"averageFps", average},
          {"constantFrameRate", rate > 0 && rate == average},
          {"alpha", pix && bool(pix->flags & AV_PIX_FMT_FLAG_ALPHA)},
          {"timeResolution",
           s->time_base.num ? double(s->time_base.den) / s->time_base.num : 0}};
    }
    if (p->codec_type == AVMEDIA_TYPE_AUDIO && result["audio"].is_null())
      result["audio"] = {{"codec", avcodec_get_name(p->codec_id)},
                         {"sampleRate", p->sample_rate},
                         {"channels", p->ch_layout.nb_channels}};
  }
  return result;
}
} // namespace
void installMedia(js::Engine &e, const js::Value &object,
                  const HostOptions &host, const MediaOptions &options) {
  // native-rules #1: state shared by the media host functions, no justification
  auto s = std::make_shared<State>();
  // native-rules #1: Policy shared by inputs, filters and encoders, no justification
  s->policy = std::make_shared<Policy>();
  s->policy->options = options;
  std::vector<std::pair<std::string, bool>> roots;
  if (!host.workspaceDir.empty())
    roots.emplace_back(host.workspaceDir, true);
  if (!host.assetDir.empty())
    roots.emplace_back(host.assetDir, true);
  for (auto &p : host.readRoots)
    roots.emplace_back(p, false);
  s->policy->roots = canonicalRoots(roots);
  s->policy->cwd = host.workspaceDir;
  e.addRunCleanup([s] {
    s->filters.clear();
    s->encoders.clear();
  });
  auto bind = [&](const char *name, js::HostFunction f) {
    e.set(object, name, e.function(name, 1, std::move(f)));
  };
  bind("muxAudio", [s](auto &en, const auto &a) {
    muxAudio(s->policy, json(en, a.at(0)));
    return en.undefined();
  });
  bind("hasEncoder", [s](auto &en, const auto &a) {
    s->policy->poll();
    auto name = en.toString(a.at(0));
    return en.boolean(s->policy->options.encoders.contains(name) &&
                      avcodec_find_encoder_by_name(name.c_str()));
  });
  bind("probe", [s](auto &en, const auto &a) {
    Input i;
    i.open(s->policy, en.toString(a.at(0)), false, 0, false);
    return value(en, probe(i));
  });
  bind("packetTimes", [s](auto &en, const auto &a) {
    Input i;
    i.open(s->policy, en.toString(a.at(0)), false, 0, false);
    Json times = Json::array();
    if (i.stream < 0)
      return en.null();
    size_t max =
        std::min(s->policy->options.maxFrames, size_t(en.toNumber(a.at(1))));
    while (times.size() < max) {
      s->policy->poll();
      int r = av_read_frame(i.format, i.packet);
      if (r == AVERROR_EOF)
        break;
      check(r);
      if (i.packet->stream_index == i.stream && i.packet->pts != AV_NOPTS_VALUE)
        times.push_back(i.packet->pts *
                        av_q2d(i.format->streams[i.stream]->time_base));
      av_packet_unref(i.packet);
    }
    return value(en, times);
  });
  bind("openFilter", [s](auto &en, const auto &a) {
    s->room();
    auto f = std::make_unique<Filter>();
    f->init(s->policy, json(en, a.at(0)));
    int id = ++s->id;
    s->filters[id] = std::move(f);
    return en.number(id);
  });
  bind("next", [s](auto &en, const auto &a) {
    int id = int(en.toNumber(a.at(0)));
    auto it = s->filters.find(id);
    if (it == s->filters.end())
      throw std::runtime_error("native media reader closed");
    auto f = it->second->next();
    if (!f)
      return en.null();
    auto out = en.object();
    en.set(out, "ptsSec", en.number(f->pts * av_q2d(f->time_base)));
    if (f->width) {
      s->policy->pixels(f->width, f->height);
      if (f->format != AV_PIX_FMT_RGBA)
        throw std::runtime_error("native media expected RGBA output");
      std::vector<uint8_t> bytes(size_t(f->width) * f->height * 4);
      for (int y = 0; y < f->height; ++y)
        std::memcpy(bytes.data() + size_t(y) * f->width * 4,
                    f->data[0] + y * f->linesize[0], size_t(f->width) * 4);
      en.set(out, "rgba", en.bytes(bytes.data(), bytes.size()));
      en.set(out, "width", en.number(f->width));
      en.set(out, "height", en.number(f->height));
    } else {
      if (f->format != AV_SAMPLE_FMT_FLT)
        throw std::runtime_error(
            "native media expected interleaved float output");
      size_t size = size_t(f->nb_samples) * f->ch_layout.nb_channels * 4;
      if (size > s->policy->options.maxBytes)
        throw std::runtime_error("native media audio quota exceeded");
      en.set(out, "pcm", en.bytes(f->data[0], size));
      en.set(out, "channels", en.number(f->ch_layout.nb_channels));
      en.set(out, "sampleRate", en.number(f->sample_rate));
    }
    return out;
  });
  bind("close", [s](auto &en, const auto &a) {
    s->filters.erase(int(en.toNumber(a.at(0))));
    return en.undefined();
  });
  bind("openEncoder", [s](auto &en, const auto &a) {
    s->room();
    auto enc = std::make_unique<Encoder>();
    enc->open(s->policy, json(en, a.at(0)));
    int id = ++s->id;
    s->encoders[id] = std::move(enc);
    return en.number(id);
  });
  bind("write", [s](auto &en, const auto &a) {
    int id = int(en.toNumber(a.at(0)));
    auto it = s->encoders.find(id);
    if (it == s->encoders.end())
      throw std::runtime_error("native media encoder closed");
    if (en.byteLength(a.at(1)) > s->policy->options.maxBytes)
      throw std::runtime_error("native media input byte quota exceeded");
    try {
      it->second->write(en.toBytes(a.at(1)));
    } catch (...) {
      s->encoders.erase(id);
      throw;
    }
    return en.undefined();
  });
  bind("finish", [s](auto &en, const auto &a) {
    int id = int(en.toNumber(a.at(0)));
    auto it = s->encoders.find(id);
    if (it == s->encoders.end())
      throw std::runtime_error("native media encoder closed");
    auto enc = std::move(it->second);
    s->encoders.erase(it);
    enc->finish();
    return en.undefined();
  });
  bind("abort", [s](auto &en, const auto &a) {
    s->encoders.erase(int(en.toNumber(a.at(0))));
    return en.undefined();
  });
}
} // namespace gr::host
