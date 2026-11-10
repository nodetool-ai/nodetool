#include "host/media.h"
#include "host/image.h"
#include "host/media_job.h"
#include "host/paths.h"
#include "host/sandbox_av_tracks.h"
#include "kernel/async_jobs.h"
#include "kernel/job_inputs.h"
#include "kernel/json.h"
#include "nodetool/jobs/admission.h"
#include "nodetool/jobs/resource_control.h"
#include "nodetool/jobs/session_stop.h"
#include <algorithm>
#include <cctype>
#include <climits>
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

using nodetool::jobs::JobCost;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::Reservation;
using nodetool::jobs::ResourceControl;
using nodetool::jobs::ResourceLease;
using nodetool::jobs::ResourceOperationContext;
using nodetool::jobs::SessionStopBridge;
using nodetool::jobs::checkedMul;

namespace gr::host {
namespace {
// Guest handle ids are converted to int only after this check. NaN, infinite
// and out-of-range values are undefined behavior in the cast. The "RangeError: "
// prefix is the convention of the sqlite host.
int intArg(js::Engine &e, const js::Value &v) {
  const double d = e.toNumber(v);
  if (!(d >= INT_MIN && d <= INT_MAX) || d != std::floor(d))
    throw std::runtime_error("RangeError: native media: expected an integer id");
  return int(d);
}
void check(int code) {
  if (code >= 0)
    return;
  char error[AV_ERROR_MAX_STRING_SIZE];
  av_strerror(code, error, sizeof(error));
  throw std::runtime_error(std::string("native media: ") + error);
}
// Validate before libav initializes filters: some filters open their own files.
void filterPolicy(const std::string &chain) {
  // Every filter of the linked libavfilter that works on its streams in
  // memory. Left out: filters that read or write files or load models,
  // fonts or plugins (movie, sendcmd, lut3d, drawtext, ladspa, ...), stats
  // writers (psnr, ssim, loudnorm), hardware and OS device filters, wall-clock
  // waits (realtime, cue) and the buffer and sink endpoints the host adds.
  static const std::set<std::string> allowed = {
      "a3dscope", "aap", "abench", "abitscope", "acompressor", "acontrast", "acopy",
      "acrossfade", "acrossover", "acrusher", "addroi", "adeclick", "adeclip",
      "adecorrelate", "adelay", "adenorm", "aderivative", "adrawgraph", "adrc",
      "adynamicequalizer", "adynamicsmooth", "aecho", "aemphasis", "aeval", "aevalsrc",
      "aexciter", "afade", "afdelaysrc", "afftdn", "afftfilt", "afir", "afireqsrc",
      "afirsrc", "aformat", "afreqshift", "afwtdn", "agate", "agraphmonitor",
      "ahistogram", "aiir", "aintegral", "ainterleave", "alatency", "alimiter",
      "allpass", "allrgb", "allyuv", "aloop", "alphaextract", "alphamerge", "amerge",
      "amix", "amplify", "amultiply", "anequalizer", "anlmdn", "anlmf", "anlms",
      "anoisesrc", "anull", "anullsrc", "apad", "aperms", "aphasemeter", "aphaser",
      "aphaseshift", "apsnr", "apsyclip", "apulsator", "aresample", "areverse",
      "arls", "asdr", "asegment", "aselect", "asetnsamples", "asetpts", "asetrate",
      "asettb", "ashowinfo", "asidedata", "asisdr", "asoftclip", "aspectralstats",
      "asplit", "astats", "astreamselect", "asubboost", "asubcut", "asupercut",
      "asuperpass", "asuperstop", "atadenoise", "atempo", "atilt", "atrim", "avectorscope",
      "avgblur", "avsynctest", "axcorrelate", "backgroundkey", "bandpass", "bandreject",
      "bass", "bbox", "bench", "bilateral", "biquad", "bitplanenoise", "blackdetect",
      "blackframe", "blend", "blockdetect", "blurdetect", "bm3d", "boxblur", "bwdif",
      "cas", "ccrepack", "channelmap", "channelsplit", "chorus", "chromahold",
      "chromakey", "chromanr", "chromashift", "ciescope", "codecview", "color",
      "colorbalance", "colorchannelmixer", "colorchart", "colorcontrast", "colorcorrect",
      "colordetect", "colorhold", "colorize", "colorkey", "colorlevels", "colormap",
      "colormatrix", "colorspace", "colorspectrum", "colortemperature", "compand",
      "compensationdelay", "concat", "convolution", "convolve", "copy", "corr",
      "crop", "cropdetect", "crossfeed", "crystalizer", "datascope", "dblur",
      "dcshift", "dctdnoiz", "deband", "deblock", "decimate", "deconvolve", "dedot",
      "deesser", "deflate", "deflicker", "dejudder", "delogo", "despill", "detelecine",
      "dialoguenhance", "dilation", "displace", "doubleweave", "drawbox", "drawgraph",
      "drawgrid", "drmeter", "dynaudnorm", "earwax", "ebur128", "edgedetect",
      "elbg", "entropy", "epx", "eq", "equalizer", "erosion", "estdif", "exposure",
      "extractplanes", "extrastereo", "fade", "feedback", "fftdnoiz", "fftfilt",
      "field", "fieldmatch", "fieldorder", "fillborders", "flanger", "floodfill",
      "format", "fps", "framepack", "framerate", "framestep", "freezedetect",
      "freezeframes", "fspp", "gblur", "geq", "gradfun", "gradients", "graphmonitor",
      "grayworld", "greyedge", "guided", "haas", "haldclut", "haldclutsrc", "hdcd",
      "headphone", "hflip", "highpass", "highshelf", "hilbert", "histeq", "histogram",
      "hqdn3d", "hqx", "hstack", "hsvhold", "hsvkey", "hue", "huesaturation",
      "hwdownload", "hwmap", "hwupload", "hysteresis", "identity", "idet", "il",
      "inflate", "interlace", "interleave", "join", "kerndeint", "kirsch", "lagfun",
      "latency", "lenscorrection", "limitdiff", "limiter", "loop", "lowpass",
      "lowshelf", "lumakey", "lut", "lut2", "lutrgb", "lutyuv", "mandelbrot",
      "maskedclamp", "maskedmax", "maskedmerge", "maskedmin", "maskedthreshold",
      "maskfun", "mcdeint", "mcompand", "median", "mergeplanes", "mestimate",
      "midequalizer", "minterpolate", "mix", "monochrome", "morpho", "mpdecimate",
      "mptestsrc", "msad", "multiply", "negate", "nlmeans", "noformat", "noise",
      "normalize", "null", "nullsrc", "oscilloscope", "overlay", "owdenoise",
      "pad", "pal100bars", "pal75bars", "palettegen", "pan", "perlin", "perms",
      "perspective", "phase", "photosensitivity", "pixdesctest", "pixelize", "pixscope",
      "pp7", "premultiply", "premultiply_dynamic", "prewitt", "pseudocolor", "pullup",
      "qp", "random", "readeia608", "readvitc", "remap", "removegrain", "repeatfields",
      "replaygain", "reverse", "rgbashift", "rgbtestsrc", "roberts", "rotate",
      "sab", "scale", "scale2ref", "scdet", "scharr", "scroll", "segment", "select",
      "separatefields", "setdar", "setfield", "setparams", "setpts", "setrange",
      "setsar", "settb", "shear", "showcwt", "showfreqs", "showinfo", "showpalette",
      "showspatial", "showspectrum", "showspectrumpic", "showvolume", "showwaves",
      "showwavespic", "shuffleframes", "shufflepixels", "shuffleplanes", "sidechaincompress",
      "sidechaingate", "sidedata", "sierpinski", "signalstats", "silencedetect",
      "silenceremove", "sinc", "sine", "siti", "smartblur", "smptebars", "smptehdbars",
      "sobel", "spectrumsynth", "speechnorm", "split", "spp", "stereo3d", "stereotools",
      "stereowiden", "streamselect", "super2xsai", "superequalizer", "surround",
      "swaprect", "swapuv", "tblend", "telecine", "testsrc", "testsrc2", "thistogram",
      "threshold", "thumbnail", "tile", "tiltandshift", "tiltshelf", "tinterlace",
      "tlut2", "tmedian", "tmidequalizer", "tmix", "tonemap", "tpad", "transpose",
      "treble", "tremolo", "trim", "unpremultiply", "unsharp", "untile", "uspp",
      "v360", "vaguedenoiser", "varblur", "vectorscope", "vflip", "vfrdet", "vibrance",
      "vibrato", "vif", "vignette", "virtualbass", "volume", "volumedetect", "vstack",
      "w3fdif", "waveform", "weave", "xbr", "xcorrelate", "xfade", "xmedian",
      "xstack", "yadif", "yaepblur", "yuvtestsrc", "zoneplate", "zoompan",};
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
      throw std::runtime_error("native media filter is not granted: " +
                               chain.substr(i, end - i));
    start = false;
    i = end - 1;
  }
}
// RAII for every libav handle the host owns (native/AGENTS.md rule 6).
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
struct PacketDelete {
  void operator()(AVPacket *p) const { av_packet_free(&p); }
};
using Packet = std::unique_ptr<AVPacket, PacketDelete>;
Packet newPacket() {
  Packet p(av_packet_alloc());
  if (!p)
    throw std::bad_alloc();
  return p;
}
struct CodecDelete {
  void operator()(AVCodecContext *c) const { avcodec_free_context(&c); }
};
using Codec = std::unique_ptr<AVCodecContext, CodecDelete>;
Codec codecFor(const AVCodec *c) {
  Codec codec(avcodec_alloc_context3(c));
  if (!codec)
    throw std::bad_alloc();
  return codec;
}
struct InputFormatDelete {
  void operator()(AVFormatContext *f) const { avformat_close_input(&f); }
};
using InputFormat = std::unique_ptr<AVFormatContext, InputFormatDelete>;
struct OutputFormatDelete {
  void operator()(AVFormatContext *f) const {
    if (f->pb)
      avio_closep(&f->pb);
    avformat_free_context(f);
  }
};
using OutputFormat = std::unique_ptr<AVFormatContext, OutputFormatDelete>;
// avformat_alloc_output_context2 leaves null on failure.
OutputFormat outputFormat(const char *format, const std::string &path) {
  AVFormatContext *raw = nullptr;
  const int result =
      avformat_alloc_output_context2(&raw, nullptr, format, path.c_str());
  OutputFormat owned(raw);
  check(result);
  return owned;
}
struct GraphDelete {
  void operator()(AVFilterGraph *g) const { avfilter_graph_free(&g); }
};
using Graph = std::unique_ptr<AVFilterGraph, GraphDelete>;
Graph filterGraph() {
  Graph g(avfilter_graph_alloc());
  if (!g)
    throw std::bad_alloc();
  g->nb_threads = 1;
  return g;
}
struct InOutDelete {
  void operator()(AVFilterInOut *i) const { avfilter_inout_free(&i); }
};
using InOut = std::unique_ptr<AVFilterInOut, InOutDelete>;
InOut inOut(const std::string &name, AVFilterContext *context) {
  InOut io(avfilter_inout_alloc());
  if (!io)
    throw std::bad_alloc();
  io->name = av_strdup(name.c_str());
  io->filter_ctx = context;
  io->pad_idx = 0;
  return io;
}
// avfilter_graph_parse_ptr consumes and rewrites both lists.
void parseGraph(AVFilterGraph &graph, const std::string &chain, InOut &inputs,
                InOut &outputs) {
  AVFilterInOut *in = inputs.release(), *out = outputs.release();
  const int result =
      avfilter_graph_parse_ptr(&graph, chain.c_str(), &in, &out, nullptr);
  inputs.reset(in);
  outputs.reset(out);
  check(result);
}

// The media grant's limits and codecs. Immutable after installMedia.
//
// Thread affinity: thread-safe, since it is never written after creation.
// Ownership: shared by the host's state and every job and session body,
// which can outlive the engine.
struct Limits {
  size_t maxPixels = 0;
  size_t maxFrames = 0;
  size_t maxBytes = 0;
  size_t maxSessions = 0;
  std::set<std::string> encoders;
  MediaTestHooks hooks;
  void pixels(int w, int h) const {
    if (w <= 0 || h <= 0 || size_t(w) > maxPixels / size_t(h))
      throw std::runtime_error("native media pixel quota exceeded");
  }
  const AVCodec *encoder(const std::string &name) const {
    if (!encoders.contains(name))
      throw std::runtime_error("native media codec is not granted: " + name);
    auto c = avcodec_find_encoder_by_name(name.c_str());
    if (!c)
      throw std::runtime_error("native media encoder unavailable: " + name);
    return c;
  }
  // The most bytes one decoded frame hands to JavaScript: what each `next`
  // reserves for its result (design section 4.7).
  uint64_t frameBytes() const {
    return std::min<uint64_t>(maxBytes, checkedMul(maxPixels, 4));
  }
};
// The most JSON text a probe returns. Codec and format names are short.
constexpr uint64_t kProbeBytes = 64 * 1024;

// One filter input, its path resolved and leased on the worker.
struct InputSpec {
  std::string path;
  bool audio = false;
  std::string label;
  double seekSec = 0;
};
// A filter graph and its inputs, read from the guest's options on the
// worker. Plain data owned by the job or operation that opens it.
struct FilterSpec {
  std::vector<InputSpec> inputs;
  std::string graph;
  std::string output;
  bool audio = false;
};

// An opened input file and its decoder.
//
// Thread affinity: the thread of the operation that uses it: inside one
// job, or a session's active operation, handed over by its control.
// Ownership: by value in the body or job that opened it, after its stop
// bridge, so the interrupt callback never outlives the bridge.
struct Input {
  InputFormat format;
  Codec codec;
  Packet packet;
  int stream = -1;
  bool eof = false;
  double seek = 0;
  const Limits *limits = nullptr;
  MediaStop stop;
  void open(const Limits &l, MediaStop s, const std::string &resolved,
            bool audio = false, double start = 0, bool decode = true) {
    limits = &l;
    stop = s;
    packet = newPacket();
    InputFormat allocated(avformat_alloc_context());
    if (!allocated)
      throw std::bad_alloc();
    // The bridge, not this operation's stop token: libav keeps the callback
    // for the life of the context (design section 4.9).
    allocated->interrupt_callback = {&SessionStopBridge::interrupt,
                                     stop.opaque()};
    Dictionary dictionary;
    auto &opts = dictionary.value;
    av_dict_set(&opts, "protocol_whitelist", "file", 0);
    // Exclude playlist/concat/image-sequence demuxers that can open additional
    // paths.
    av_dict_set(
        &opts, "format_whitelist",
        "mov,matroska,webm,wav,mp3,ogg,flac,aac,png_pipe,jpeg_pipe,webp_pipe",
        0);
    // avformat_open_input frees the context on failure and leaves null.
    AVFormatContext *raw = allocated.release();
    int opened = avformat_open_input(&raw, resolved.c_str(), nullptr, &opts);
    format.reset(raw);
    check(opened);
    if (format->pb && avio_size(format->pb) > int64_t(l.maxBytes))
      throw std::runtime_error("native media input byte quota exceeded");
    check(avformat_find_stream_info(format.get(), nullptr));
    stream = av_find_best_stream(
        format.get(), audio ? AVMEDIA_TYPE_AUDIO : AVMEDIA_TYPE_VIDEO, -1, -1,
        nullptr, 0);
    if (stream < 0 || !decode)
      return;
    auto par = format->streams[stream]->codecpar;
    if (!audio)
      l.pixels(par->width, par->height);
    auto decoder = avcodec_find_decoder(par->codec_id);
    if (!decoder)
      throw std::runtime_error("native media decoder unavailable");
    codec = codecFor(decoder);
    check(avcodec_parameters_to_context(codec.get(), par));
    codec->thread_count = 1;
    codec->max_pixels = l.maxPixels;
    check(avcodec_open2(codec.get(), decoder, nullptr));
    seek = std::max(0.0, start);
    if (seek > 0) {
      auto s = format->streams[stream];
      check(av_seek_frame(
          format.get(), stream,
          int64_t(seek / av_q2d(s->time_base)) +
              (s->start_time == AV_NOPTS_VALUE ? 0 : s->start_time),
          AVSEEK_FLAG_BACKWARD));
    }
  }
  Frame next() {
    if (!codec)
      return {};
    for (;;) {
      stop.check();
      auto f = frame();
      int r = avcodec_receive_frame(codec.get(), f.get());
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
          limits->pixels(f->width, f->height);
        return f;
      }
      if (r != AVERROR(EAGAIN))
        check(r);
      if (eof)
        return {};
      for (;;) {
        // Between packets (evidence restriction Q2.3).
        stop.check();
        r = av_read_frame(format.get(), packet.get());
        if (r < 0) {
          if (r != AVERROR_EOF)
            check(r);
          eof = true;
          check(avcodec_send_packet(codec.get(), nullptr));
          break;
        }
        if (packet->stream_index == stream) {
          int sent = avcodec_send_packet(codec.get(), packet.get());
          av_packet_unref(packet.get());
          check(sent);
          break;
        }
        av_packet_unref(packet.get());
      }
    }
  }
};
// A filter graph fed by decoded inputs.
//
// Thread affinity and ownership: as Input.
struct Filter {
  Graph graph;
  // Owned by `graph`.
  AVFilterContext *sink = nullptr;
  std::vector<AVFilterContext *> sources;
  std::vector<std::unique_ptr<Input>> inputs;
  std::vector<Frame> first;
  std::vector<bool> ended;
  size_t count = 0;
  const Limits *limits = nullptr;
  MediaStop stop;
  bool audio = false;
  void init(const Limits &l, MediaStop s, const FilterSpec &spec) {
    limits = &l;
    stop = s;
    audio = spec.audio;
    graph = filterGraph();
    check(avfilter_graph_create_filter(
        &sink, avfilter_get_by_name(audio ? "abuffersink" : "buffersink"),
        "out", nullptr, nullptr, graph.get()));
    InOut in = inOut(spec.output, sink);
    InOut outputs;
    for (const auto &item : spec.inputs) {
      if (inputs.size() >= l.maxSessions)
        throw std::runtime_error("native media input quota exceeded");
      auto input = std::make_unique<Input>();
      input->open(l, s, item.path, item.audio, item.seekSec);
      auto f = input->next();
      if (!f)
        throw std::runtime_error("native media input has no frames");
      AVFilterContext *src = nullptr;
      std::string args;
      auto tb = input->format->streams[input->stream]->time_base;
      if (item.audio) {
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
          &src, avfilter_get_by_name(item.audio ? "abuffer" : "buffer"),
          ("in" + std::to_string(inputs.size())).c_str(), args.c_str(),
          nullptr, graph.get()));
      InOut out = inOut(item.label, src);
      out->next = outputs.release();
      outputs = std::move(out);
      sources.push_back(src);
      first.push_back(std::move(f));
      inputs.push_back(std::move(input));
      ended.push_back(false);
    }
    filterPolicy(spec.graph);
    parseGraph(*graph, spec.graph, in, outputs);
    if (in || outputs)
      throw std::runtime_error("native media unconnected filter pads");
    if (graph->nb_filters > 256)
      throw std::runtime_error("native media filter count quota exceeded");
    check(avfilter_graph_config(graph.get(), nullptr));
    if (!audio)
      l.pixels(av_buffersink_get_w(sink), av_buffersink_get_h(sink));
  }
  Frame next() {
    if (!sink)
      throw std::runtime_error("native media reader is not open");
    stop.check();
    if (++count > limits->maxFrames)
      throw std::runtime_error("native media frame quota exceeded");
    for (;;) {
      auto f = frame();
      int r = av_buffersink_get_frame(sink, f.get());
      if (r == AVERROR_EOF)
        return {};
      if (r >= 0) {
        f->time_base = av_buffersink_get_time_base(sink);
        if (f->width)
          limits->pixels(f->width, f->height);
        return f;
      }
      if (r != AVERROR(EAGAIN))
        check(r);
      bool fed = false;
      for (size_t i = 0; i < sources.size(); ++i) {
        // Between frames (evidence restriction Q2.3).
        stop.check();
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
// The encoder options openEncoder reads, field by field, from the guest's
// object. Only these fields are copied, each after its bytes were reserved,
// so extra properties never reach native memory. A codec or muxer option
// that is not granted, or not a string, is kept as `invalid` and fails the
// first write, as before.
struct EncoderSpec {
  int width = 0;
  int height = 0;
  double fps = 0;
  std::string codec;
  std::string pixelFormat = "yuv420p";
  std::string filter;
  std::vector<std::pair<std::string, std::string>> codecOptions;
  std::vector<std::pair<std::string, std::string>> muxerOptions;
  std::string invalid;
  // The native bytes the strings hold.
  uint64_t bytes() const {
    uint64_t total = codec.size() + pixelFormat.size() + filter.size() +
                     invalid.size();
    for (const auto *options : {&codecOptions, &muxerOptions})
      for (const auto &[key, value] : *options)
        total += key.size() + value.size();
    return total;
  }
};
// An output file, its encoder and the filter that converts RGBA frames.
//
// Thread affinity and ownership: as Input. Members are destroyed in reverse
// order, so the output file is closed after the codec.
struct Encoder {
  const Limits *limits = nullptr;
  MediaStop stop;
  OutputFormat format;
  Codec codec;
  Graph graph;
  // Owned by `graph`.
  AVFilterContext *source = nullptr;
  AVFilterContext *sink = nullptr;
  Packet packet;
  // Owned by `format`.
  AVStream *stream = nullptr;
  size_t count = 0;
  // The number of the last write that succeeded. Writes are numbered on the
  // worker as they are submitted.
  uint64_t applied = 0;
  EncoderSpec spec;
  std::string path;
  // `rgba` holds `w` x `h` pixels when `decoded`, else the options' size.
  void write(const std::vector<uint8_t> &bytes, bool decoded, int decodedW,
             int decodedH) {
    if (limits->hooks.encoderWrite)
      limits->hooks.encoderWrite();
    stop.check();
    if (++count > limits->maxFrames)
      throw std::runtime_error("native media frame quota exceeded");
    int w = decoded ? decodedW : spec.width,
        h = decoded ? decodedH : spec.height;
    limits->pixels(w, h);
    if (!decoded && bytes.size() != size_t(w) * h * 4)
      throw std::runtime_error("native media RGBA frame length mismatch");
    if (!packet)
      packet = newPacket();
    auto input = frame();
    input->format = AV_PIX_FMT_RGBA;
    input->width = w;
    input->height = h;
    input->pts = count - 1;
    check(av_frame_get_buffer(input.get(), 32));
    for (int y = 0; y < h; ++y)
      std::memcpy(input->data[0] + y * input->linesize[0],
                  bytes.data() + size_t(y) * w * 4, size_t(w) * 4);
    if (!graph) {
      graph = filterGraph();
      auto rate = av_d2q(spec.fps, 1000000);
      if (rate.num <= 0)
        throw std::runtime_error("native media invalid fps");
      std::string args = "video_size=" + std::to_string(w) + "x" +
                         std::to_string(h) +
                         ":pix_fmt=" + std::to_string(AV_PIX_FMT_RGBA) +
                         ":time_base=" + std::to_string(rate.den) + "/" +
                         std::to_string(rate.num) + ":pixel_aspect=1/1";
      check(avfilter_graph_create_filter(&source,
                                         avfilter_get_by_name("buffer"), "in",
                                         args.c_str(), nullptr, graph.get()));
      check(avfilter_graph_create_filter(&sink,
                                         avfilter_get_by_name("buffersink"),
                                         "out", nullptr, nullptr, graph.get()));
      InOut in = inOut("out", sink), out = inOut("in", source);
      std::string chain = spec.filter;
      filterPolicy(chain);
      if (!chain.empty())
        chain += ",";
      chain += "format=" + spec.pixelFormat;
      parseGraph(*graph, chain, in, out);
      check(avfilter_graph_config(graph.get(), nullptr));
    }
    check(av_buffersrc_add_frame_flags(source, input.get(),
                                       AV_BUFFERSRC_FLAG_KEEP_REF));
    auto filtered = frame();
    check(av_buffersink_get_frame(sink, filtered.get()));
    w = filtered->width;
    h = filtered->height;
    limits->pixels(w, h);
    if (!codec) {
      if (!spec.invalid.empty())
        throw std::runtime_error(spec.invalid);
      const auto *c = limits->encoder(spec.codec);
      codec = codecFor(c);
      codec->width = w;
      codec->height = h;
      codec->pix_fmt = av_get_pix_fmt(spec.pixelFormat.c_str());
      codec->framerate = av_d2q(spec.fps, 1000000);
      codec->time_base = av_inv_q(codec->framerate);
      codec->thread_count = 1;
      if (codec->framerate.num <= 0)
        throw std::runtime_error("native media invalid fps");
      format = outputFormat(nullptr, path);
      if (format->oformat->flags & AVFMT_GLOBALHEADER)
        codec->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
      Dictionary codecDictionary;
      auto &options = codecDictionary.value;
      for (const auto &[key, value] : spec.codecOptions)
        av_dict_set(&options, key.c_str(), value.c_str(), 0);
      check(avcodec_open2(codec.get(), c, &options));
      stream = avformat_new_stream(format.get(), nullptr);
      if (!stream)
        throw std::bad_alloc();
      stream->time_base = codec->time_base;
      stream->avg_frame_rate = codec->framerate;
      check(avcodec_parameters_from_context(stream->codecpar, codec.get()));
      check(avio_open(&format->pb, path.c_str(), AVIO_FLAG_WRITE));
      Dictionary muxerDictionary;
      auto &muxer = muxerDictionary.value;
      for (const auto &[key, value] : spec.muxerOptions)
        av_dict_set(&muxer, key.c_str(), value.c_str(), 0);
      check(avformat_write_header(format.get(), &muxer));
    }
    if (w != codec->width || h != codec->height)
      throw std::runtime_error("native media frame size changed");
    filtered->pts = count - 1;
    send(filtered.get());
  }

  void send(AVFrame *f) {
    check(avcodec_send_frame(codec.get(), f));
    for (;;) {
      // Between packets. The write itself is not interruptible (Q2.3).
      stop.check();
      int r = avcodec_receive_packet(codec.get(), packet.get());
      if (r == AVERROR(EAGAIN) || r == AVERROR_EOF)
        break;
      check(r);
      if (packet->duration <= 0 && codec->codec_type == AVMEDIA_TYPE_VIDEO)
        packet->duration = 1;
      av_packet_rescale_ts(packet.get(), codec->time_base, stream->time_base);
      packet->stream_index = stream->index;
      r = av_interleaved_write_frame(format.get(), packet.get());
      av_packet_unref(packet.get());
      check(r);
      if (avio_tell(format->pb) > int64_t(limits->maxBytes))
        throw std::runtime_error("native media output byte quota exceeded");
    }
  }
  // Publishes the file: when finish returns, the trailer is written and the
  // file closed, so the guest can read it at once. Its body is destroyed
  // later, on the lane's reaper.
  void finish() {
    if (!codec)
      throw std::runtime_error("native media no frames written");
    check(av_buffersrc_add_frame_flags(source, nullptr, 0));
    for (;;) {
      stop.check();
      auto f = frame();
      int r = av_buffersink_get_frame(sink, f.get());
      if (r == AVERROR_EOF || r == AVERROR(EAGAIN))
        break;
      check(r);
      send(f.get());
    }
    send(nullptr);
    check(av_write_trailer(format.get()));
    check(avio_closep(&format->pb));
  }
};
// muxAudio's inputs, resolved and checked on the worker.
struct MuxSpec {
  std::string videoPath;
  std::string outPath;
  std::string codec;
  int sampleRate = 48000;
  FilterSpec filter;
};
// Keep video packets compressed while encoding the filter graph's audio.
void muxAudio(const Limits &limits, MediaStop stop, const MuxSpec &spec) {
  Input video;
  video.open(limits, stop, spec.videoPath, false, 0, false);
  if (video.stream < 0)
    throw std::runtime_error("native media mux needs video");
  double duration = video.format->duration == AV_NOPTS_VALUE
                        ? 0
                        : double(video.format->duration) / AV_TIME_BASE;
  if (!(duration > 0))
    throw std::runtime_error("native media mux needs finite video duration");
  Encoder output;
  output.limits = &limits;
  output.stop = stop;
  output.packet = newPacket();
  output.format = outputFormat(nullptr, spec.outPath);
  auto picture = avformat_new_stream(output.format.get(), nullptr);
  if (!picture)
    throw std::bad_alloc();
  auto original = video.format->streams[video.stream];
  check(avcodec_parameters_copy(picture->codecpar, original->codecpar));
  picture->codecpar->codec_tag = 0;
  picture->time_base = original->time_base;
  auto codec = limits.encoder(spec.codec);
  output.codec = codecFor(codec);
  output.codec->sample_rate = spec.sampleRate;
  output.codec->sample_fmt = AV_SAMPLE_FMT_FLTP;
  av_channel_layout_default(&output.codec->ch_layout, 2);
  output.codec->time_base = {1, output.codec->sample_rate};
  output.codec->bit_rate = 192000;
  if (output.format->oformat->flags & AVFMT_GLOBALHEADER)
    output.codec->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
  check(avcodec_open2(output.codec.get(), codec, nullptr));
  output.stream = avformat_new_stream(output.format.get(), nullptr);
  if (!output.stream)
    throw std::bad_alloc();
  output.stream->time_base = output.codec->time_base;
  check(avcodec_parameters_from_context(output.stream->codecpar,
                                        output.codec.get()));
  Filter audio;
  audio.init(limits, stop, spec.filter);
  if (output.codec->frame_size)
    av_buffersink_set_frame_size(audio.sink, output.codec->frame_size);
  check(avio_open(&output.format->pb, spec.outPath.c_str(), AVIO_FLAG_WRITE));
  check(avformat_write_header(output.format.get(), nullptr));
  bool videoDone = false, audioDone = false;
  double pictureTime = 0, audioTime = 0;
  size_t frames = 0;
  while (!videoDone || !audioDone) {
    stop.check();
    if (++frames > limits.maxFrames * 4)
      throw std::runtime_error("native media mux packet quota exceeded");
    if (!videoDone && (audioDone || pictureTime <= audioTime)) {
      int r = av_read_frame(video.format.get(), video.packet.get());
      if (r == AVERROR_EOF) {
        videoDone = true;
        continue;
      }
      check(r);
      if (video.packet->stream_index == video.stream) {
        pictureTime = video.packet->dts * av_q2d(original->time_base);
        av_packet_rescale_ts(video.packet.get(), original->time_base,
                             picture->time_base);
        video.packet->stream_index = picture->index;
        check(av_interleaved_write_frame(output.format.get(),
                                         video.packet.get()));
      }
      av_packet_unref(video.packet.get());
    } else {
      auto f = audio.next();
      if (!f || f->pts * av_q2d(f->time_base) >= duration) {
        audioDone = true;
        output.send(nullptr);
        continue;
      }
      audioTime = f->pts * av_q2d(f->time_base);
      f->pts = av_rescale_q(f->pts, f->time_base, output.codec->time_base);
      // Cut in whole samples: a floating-point ceil of the remainder can
      // round 896.0000001 up and leave the audio one sample past the video.
      const int64_t endSample = av_rescale_q(video.format->duration, AV_TIME_BASE_Q,
                                             output.codec->time_base);
      if (f->pts >= endSample) {
        audioDone = true;
        output.send(nullptr);
        continue;
      }
      f->nb_samples = int(std::min<int64_t>(f->nb_samples, endSample - f->pts));
      output.send(f.get());
    }
  }
  check(av_write_trailer(output.format.get()));
  check(avio_closep(&output.format->pb));
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

// A reader session (design section 4.8): a filter graph and its inputs.
//
// Thread affinity: only its control's active operation touches it, one
// lane thread at a time, each handoff ordered by the control's mutex.
// Ownership: uniquely owned by its ResourceControl, which hands it to the
// CPU lane's reaper to be destroyed: the libav contexts are freed on that
// one owner lane, whose lifetime the lane's timed shutdown covers. The
// reader's staging leases are released after that.
struct ReaderBody final : nodetool::jobs::ResourceBody {
  explicit ReaderBody(std::shared_ptr<const Limits> l) : limits(std::move(l)) {}
  // Declared before the filter, which points at both.
  const std::shared_ptr<const Limits> limits;
  SessionStopBridge bridge;
  Filter filter;
  // A batched audio read that stopped at its size target holds the frame
  // that did not fit here, and an end of stream that came after frames.
  decltype(std::declval<Filter &>().next()) pending;
  bool ended = false;
  SessionStopBridge *stopBridge() override { return &bridge; }
  MediaStop stop() const { return {bridge, limits->hooks}; }
};
// An encoder session. Thread affinity and ownership: as ReaderBody.
struct EncoderBody final : nodetool::jobs::ResourceBody {
  EncoderBody(std::shared_ptr<const Limits> l, Reservation o)
      : limits(std::move(l)), options(std::move(o)) {}
  const std::shared_ptr<const Limits> limits;
  // The charge for the copied options in `encoder.spec` and its path,
  // retained for the session's life (design section 4.7) and released when
  // the body is destroyed.
  Reservation options;
  SessionStopBridge bridge;
  Encoder encoder;
  SessionStopBridge *stopBridge() override { return &bridge; }
};

// A Value result carrying JSON text, parsed on the worker.
//
// Thread affinity: none. Created on the lane, read and destroyed on the
// worker, or destroyed where a closed mailbox drops it.
struct JsonText final : JobPayload {
  explicit JsonText(std::string t) : text(std::move(t)) {}
  std::string text;
};
// packetTimes' result: null when the file has no video stream.
struct PacketTimes final : JobPayload {
  bool none = false;
  std::vector<double> times;
};
// One decoded frame copied out of libav on the lane: the payload never holds
// an AVFrame (native/AGENTS.md rule 5).
struct DecodedFrame final : JobPayload {
  bool end = false;
  bool video = false;
  double pts = 0;
  int width = 0, height = 0, channels = 0, sampleRate = 0;
  std::vector<uint8_t> bytes;
};

js::Value parse(ResultConversion &conversion, const std::string &text) {
  auto &e = conversion.engine();
  conversion.chargeCopy(text.size());
  return e.call(e.get(e.get(e.global(), "JSON"), "parse"), e.undefined(),
                {e.string(text)});
}
js::Value convertFrame(ResultConversion &conversion) {
  auto &e = conversion.engine();
  auto *f = static_cast<DecodedFrame *>(conversion.payload());
  if (f->end)
    return e.null();
  auto out = e.object();
  e.set(out, "ptsSec", e.number(f->pts));
  if (f->video) {
    e.set(out, "rgba", conversion.adoptBytes(std::move(f->bytes)));
    e.set(out, "width", e.number(f->width));
    e.set(out, "height", e.number(f->height));
  } else {
    e.set(out, "pcm", conversion.adoptBytes(std::move(f->bytes)));
    e.set(out, "channels", e.number(f->channels));
    e.set(out, "sampleRate", e.number(f->sampleRate));
  }
  return out;
}

// A media session as the worker sees it.
struct Session {
  std::shared_ptr<ResourceControl> control;
  bool pngInput = false;
  // Set when a write failed before it reached the session's queue. The
  // session was closed, and later writes and finish fail with it.
  std::string failure;
  // Writes submitted, which numbers them. A write that leaves the run's
  // admission queue refused never reaches the session: the next write or
  // finish sees the gap in the numbers and fails before it runs.
  uint64_t writes = 0;
};

// The engine's media host: the grant, the open sessions and the run they
// serve.
//
// Thread affinity: worker only: the host functions and the run cleanup.
// Jobs never reach it. The controls it holds are thread-safe.
// Ownership: shared by the host functions and the run cleanup the engine
// keeps.
struct State {
  bool enabled = false;
  std::function<bool()> cancelled;
  std::vector<Root> roots;
  std::string cwd;
  std::shared_ptr<const Limits> limits;
  std::shared_ptr<RunBinding> binding;
  std::shared_ptr<MediaStaging> staging;
  int id = 0;
  std::map<int, Session> readers;
  std::map<int, Session> encoders;

  void poll() const {
    if (!enabled)
      throw std::runtime_error("native media grant is disabled");
    if (cancelled && cancelled())
      throw std::runtime_error("native media cancelled");
  }
  std::string path(const std::string &p, bool write = false) const {
    poll();
    return confine(roots, cwd, p, write ? Access::Write : Access::Read, "media",
                   true)
        .real;
  }
  AsyncRun &run() const {
    AsyncRun *bound = binding->run();
    if (!bound)
      throw std::runtime_error("Native media calls need a running graph");
    return *bound;
  }
  std::shared_ptr<const MediaTestHooks> hooks() const {
    return {limits, &limits->hooks};
  }
  // Forgets sessions that left Open, then refuses one past the quota.
  void room() {
    poll();
    const auto closed = [](const auto &entry) {
      return entry.second.control->state() != ResourceControl::State::Open;
    };
    std::erase_if(readers, closed);
    std::erase_if(encoders, closed);
    if (readers.size() + encoders.size() >= limits->maxSessions)
      throw std::runtime_error("native media session quota exceeded");
  }
  // A write of encoder `id` failed before it reached the queue: the session
  // takes nothing more, and the writes accepted before it still run.
  void failEncoder(int id, std::string reason) {
    auto it = encoders.find(id);
    if (it == encoders.end())
      return;
    if (it->second.failure.empty())
      it->second.failure = std::move(reason);
    it->second.control->close();
  }
  // Run cleanup. Each session's queued operations reject, its active one is
  // asked to stop, and its body is destroyed once that returned.
  void abortAll() {
    for (auto *table : {&readers, &encoders})
      for (auto &[id, session] : *table)
        session.control->abort("The run ended");
    readers.clear();
    encoders.clear();
  }
  // Reads the guest's filter options: resolves and leases each input.
  FilterSpec filter(const Json &opts, std::vector<ResourceLease> &leases) const {
    FilterSpec spec;
    spec.audio = opts.value("outputKind", "video") == "audio";
    spec.graph = opts.at("graph").get<std::string>();
    spec.output = opts.value("output", "out");
    filterPolicy(spec.graph);
    for (const auto &item : opts.at("inputs")) {
      if (spec.inputs.size() >= limits->maxSessions)
        throw std::runtime_error("native media input quota exceeded");
      InputSpec input;
      input.path = path(item.at("filePath").get<std::string>());
      input.audio = item.value("kind", "video") == "audio";
      input.label = item.value("label", "in");
      input.seekSec = item.value("seekSec", 0.0);
      staging->lease(input.path, leases);
      spec.inputs.push_back(std::move(input));
    }
    return spec;
  }
};
// One string property of `object`, its bytes reserved before the copy.
// Undefined gives `fallback`.
std::string stringField(js::Engine &e, const js::Value &object,
                        const char *name, Reservation &reservation,
                        const char *fallback = nullptr) {
  js::Value value = e.get(object, name);
  if (fallback && e.isUndefined(value))
    return fallback;
  return snapshotString(e, value, std::string("Media encoder ") + name,
                        reservation);
}
// One number property of `object`. Undefined gives 0, so a missing size or
// frame rate fails the first write as before.
double numberField(js::Engine &e, const js::Value &object, const char *name) {
  js::Value value = e.get(object, name);
  if (e.isUndefined(value))
    return 0;
  if (!e.isNumber(value))
    throw std::invalid_argument(std::string("Media encoder ") + name +
                                " must be a number");
  return e.toNumber(value);
}
int dimension(double value) {
  return std::isfinite(value) && value >= 0 && value <= 1e9 ? int(value) : 0;
}
// The string entries of an options object whose keys `granted` accepts, in
// the order the former JSON copy (JSON.stringify into ordered JSON) kept:
// Object.keys order, without the keys JSON.stringify drops. The first
// refused key, or the first granted value that is not a JSON string, is
// recorded in `invalid` with the message the former copy gave. Only string
// values are copied, each under its reservation.
// The JSON type name nlohmann::json gives the value JSON.stringify makes of
// `v` under key `k`: toJSON is applied and boxed primitives are unboxed as
// JSON.stringify does, "dropped" for what it leaves out, and "string" with
// the text for a string. A BigInt throws, as JSON.stringify does.
constexpr const char *kJsonType = R"((function (v, k) {
  if (v !== null && (typeof v === 'object' || typeof v === 'bigint') && typeof v.toJSON === 'function') v = v.toJSON(k);
  if (v instanceof Number) v = Number(v);
  else if (v instanceof String) v = String(v);
  else if (v instanceof Boolean) v = v.valueOf();
  switch (typeof v) {
    case 'string': return ['string', v];
    case 'number': return [Number.isFinite(v) ? 'number' : 'null'];
    case 'boolean': return ['boolean'];
    case 'undefined': case 'function': case 'symbol': return ['dropped'];
    case 'bigint': throw new TypeError('Do not know how to serialize a BigInt');
  }
  return [v === null ? 'null' : Array.isArray(v) ? 'array' : 'object'];
}))";
void optionEntries(js::Engine &e, const js::Value &object, const char *name,
                   const std::function<bool(const std::string &)> &granted,
                   const std::function<std::string(const std::string &)> &refusal,
                   std::vector<std::pair<std::string, std::string>> &out,
                   std::string &invalid, Reservation &reservation) {
  js::Value options = e.get(object, name);
  if (e.isUndefined(options) || e.isNull(options))
    return;
  if (!e.isObject(options) || e.isFunction(options))
    throw std::invalid_argument(std::string("Media encoder ") + name +
                                " must be an object");
  js::Value keys = e.call(e.get(e.get(e.global(), "Object"), "keys"),
                          e.undefined(), {options});
  const double count = e.toNumber(e.get(keys, "length"));
  std::optional<js::Value> jsonType;
  for (double i = 0; i < count; ++i) {
    std::string key = snapshotString(
        e, e.get(keys, std::to_string(size_t(i))), "Media encoder option",
        reservation);
    js::Value value = e.get(options, key);
    // The JSON type the former copy saw, read from the JavaScript value
    // without serializing or parsing it: a parsed array or object can need
    // far more native memory than its text.
    std::string type = "string";
    if (!e.isString(value)) {
      if (!jsonType)
        jsonType = e.evaluateScript(kJsonType, "media-encoder-options.js");
      js::Value seen = e.call(*jsonType, e.undefined(), {value, e.string(key)});
      type = e.toString(e.get(seen, "0"));
      if (type == "dropped")
        continue;
      if (type == "string")
        value = e.get(seen, "1");
    }
    if (!granted(key)) {
      if (invalid.empty())
        invalid = refusal(key);
      continue;
    }
    if (type != "string") {
      // The JSON library's text for reading this type as a string.
      if (invalid.empty())
        invalid = "[json.exception.type_error.302] type must be string, but is " + type;
      continue;
    }
    std::string text =
        snapshotString(e, value, "Media encoder option", reservation);
    out.emplace_back(std::move(key), std::move(text));
  }
}
// Reads the encoder options openEncoder keeps, field by field. Every string
// is reserved before its copy, so an oversized one is refused before it is
// allocated, and properties the encoder does not use are never copied.
EncoderSpec encoderSpec(js::Engine &e, const js::Value &object,
                        Reservation &reservation) {
  if (!e.isObject(object) || e.isFunction(object))
    throw std::invalid_argument("Media encoder options must be an object");
  EncoderSpec spec;
  spec.width = dimension(numberField(e, object, "width"));
  spec.height = dimension(numberField(e, object, "height"));
  spec.fps = numberField(e, object, "fps");
  js::Value codec = e.get(object, "spec");
  if (!e.isObject(codec))
    throw std::invalid_argument("Media encoder spec must be an object");
  spec.codec = stringField(e, codec, "codec", reservation);
  spec.pixelFormat = stringField(e, codec, "pixelFormat", reservation, "yuv420p");
  spec.filter = stringField(e, codec, "filter", reservation, "");
  static const std::set<std::string> allowed = {
      "preset",      "crf",     "b",        "profile",  "level",
      "colorspace",  "color_primaries",     "color_trc", "color_range",
      "q",           "qscale",  "deadline", "cpu-used", "lossless",
      "row-mt"};
  optionEntries(
      e, codec, "options",
      [](const std::string &key) { return allowed.contains(key); },
      [](const std::string &key) {
        return "native media encoder option not granted: " + key;
      },
      spec.codecOptions, spec.invalid, reservation);
  optionEntries(
      e, object, "muxerOptions",
      [](const std::string &key) { return key == "movflags"; },
      [](const std::string &) {
        return std::string("native media muxer option not granted");
      },
      spec.muxerOptions, spec.invalid, reservation);
  return spec;
}
// The guest's options as JSON, its text reserved before the copy (design
// section 4.7). Returns the reserved size in `bytes`.
Json optionsArgument(js::Engine &e, const js::Value &v,
                     Reservation &reservation, uint64_t &bytes) {
  js::Value text = e.call(e.get(e.get(e.global(), "JSON"), "stringify"),
                          e.undefined(), {v});
  std::string copied = snapshotString(e, text, "Media options", reservation);
  bytes = copied.size();
  return Json::parse(copied);
}
std::string pathArgument(js::Engine &e, const js::Value &v,
                         Reservation &reservation) {
  return snapshotString(e, v, "Media path", reservation);
}
} // namespace
void installMedia(js::Engine &e, const js::Value &object,
                  const HostOptions &host, const MediaOptions &options) {
  // Shared: every host function and the run cleanup keep it, and the engine
  // destroys them in no fixed order.
  auto s = std::make_shared<State>();
  s->enabled = options.enabled;
  s->cancelled = options.cancelled;
  auto limits = std::make_shared<Limits>();
  limits->maxPixels = options.maxPixels;
  limits->maxFrames = options.maxFrames;
  limits->maxBytes = options.maxBytes;
  limits->maxSessions = options.maxSessions;
  limits->encoders = options.encoders;
  limits->hooks = options.hooks;
  s->limits = std::move(limits);
  std::vector<std::pair<std::string, bool>> roots;
  if (!host.workspaceDir.empty())
    roots.emplace_back(host.workspaceDir, true);
  if (!host.assetDir.empty())
    roots.emplace_back(host.assetDir, true);
  for (auto &p : host.readRoots)
    roots.emplace_back(p, false);
  s->roots = canonicalRoots(roots);
  s->cwd = host.workspaceDir;
  s->binding = RunBinding::of(e);
  s->staging = MediaStaging::of(e);
  e.addRunCleanup([s] { s->abortAll(); });
  auto bind = [&](const char *name, js::HostFunction f) {
    e.set(object, name, e.function(name, 1, std::move(f)));
  };
  bind("muxAudio", [s](auto &en, const auto &a) {
    s->poll();
    AsyncRun &run = s->run();
    Reservation reservation = run.reserve();
    uint64_t bytes = 0;
    Json opts = optionsArgument(en, a.at(0), reservation, bytes);
    std::vector<ResourceLease> leases;
    MuxSpec spec;
    spec.videoPath = s->path(opts.at("videoPath").get<std::string>());
    s->staging->lease(spec.videoPath, leases);
    spec.outPath = s->path(opts.at("outPath").get<std::string>(), true);
    s->staging->lease(spec.outPath, leases);
    spec.codec = opts.value("codec", "aac");
    s->limits->encoder(spec.codec);
    spec.sampleRate = opts.value("sampleRate", 48000);
    auto filter = opts.at("filter");
    std::string label = filter.value("output", "out");
    std::string graph = filter.at("graph");
    graph += ";[" + label + "]aformat=sample_fmts=fltp:sample_rates=" +
             std::to_string(spec.sampleRate) +
             ":channel_layouts=stereo[native_audio]";
    filter["graph"] = graph;
    filter["output"] = "native_audio";
    spec.filter = s->filter(filter, leases);
    return run.submit(
        run.executor(),
        makeMediaJob("muxAudio", s->hooks(), JobCost{bytes, 0, 0},
                     std::move(leases),
                     [limits = s->limits, spec = std::move(spec)](
                         MediaStop stop) {
                       muxAudio(*limits, stop, spec);
                       return JobOutcome::value(nullptr);
                     }),
        nullptr, true, std::move(reservation));
  });
  bind("hasEncoder", [s](auto &en, const auto &a) {
    s->poll();
    auto name = en.toString(a.at(0));
    return en.boolean(s->limits->encoders.contains(name) &&
                      avcodec_find_encoder_by_name(name.c_str()));
  });
  bind("probe", [s](auto &en, const auto &a) {
    s->poll();
    AsyncRun &run = s->run();
    Reservation reservation = run.reserve();
    const auto resolved = s->path(pathArgument(en, a.at(0), reservation));
    std::vector<ResourceLease> leases;
    s->staging->lease(resolved, leases);
    return run.submit(
        run.executor(),
        makeMediaJob("probe", s->hooks(),
                     JobCost{resolved.size(), kProbeBytes, 0},
                     std::move(leases),
                     [limits = s->limits, resolved](MediaStop stop) {
                       Input i;
                       i.open(*limits, stop, resolved, false, 0, false);
                       auto text = probe(i).dump();
                       if (text.size() > kProbeBytes)
                         throw std::runtime_error(
                             "native media probe result is too large");
                       return JobOutcome::value(
                           std::make_unique<JsonText>(std::move(text)));
                     }),
        [](ResultConversion &c) {
          return parse(c, static_cast<JsonText *>(c.payload())->text);
        },
        true, std::move(reservation));
  });
  bind("packetTimes", [s](auto &en, const auto &a) {
    s->poll();
    AsyncRun &run = s->run();
    Reservation reservation = run.reserve();
    const auto resolved = s->path(pathArgument(en, a.at(0), reservation));
    const double requested = en.toNumber(a.at(1));
    const size_t max =
        !(requested > 0) ? 0
        : requested >= double(s->limits->maxFrames)
            ? s->limits->maxFrames
            : size_t(requested);
    std::vector<ResourceLease> leases;
    s->staging->lease(resolved, leases);
    return run.submit(
        run.executor(),
        makeMediaJob(
            "packetTimes", s->hooks(),
            JobCost{resolved.size(), checkedMul(max, sizeof(double)), 0},
            std::move(leases),
            [limits = s->limits, resolved, max](MediaStop stop) {
              Input i;
              i.open(*limits, stop, resolved, false, 0, false);
              auto result = std::make_unique<PacketTimes>();
              if (i.stream < 0) {
                result->none = true;
                return JobOutcome::value(std::move(result));
              }
              const auto tb = i.format->streams[i.stream]->time_base;
              while (result->times.size() < max) {
                // Between packets (evidence restriction Q2.3).
                stop.check();
                int r = av_read_frame(i.format.get(), i.packet.get());
                if (r == AVERROR_EOF)
                  break;
                check(r);
                if (i.packet->stream_index == i.stream &&
                    i.packet->pts != AV_NOPTS_VALUE)
                  result->times.push_back(i.packet->pts * av_q2d(tb));
                av_packet_unref(i.packet.get());
              }
              return JobOutcome::value(std::move(result));
            }),
        [](ResultConversion &c) {
          auto *result = static_cast<PacketTimes *>(c.payload());
          if (result->none)
            return c.engine().null();
          return parse(c, Json(result->times).dump());
        },
        true, std::move(reservation));
  });
  // Resolves with the reader's id once its inputs and graph are open. A
  // reader that fails to open is retired, so its id never reaches the guest.
  bind("openFilter", [s](auto &en, const auto &a) {
    s->room();
    AsyncRun &run = s->run();
    Reservation reservation = run.reserve();
    uint64_t bytes = 0;
    Json opts = optionsArgument(en, a.at(0), reservation, bytes);
    nodetool::jobs::ResourceOptions resource;
    FilterSpec spec = s->filter(opts, resource.dependencies);
    const int id = ++s->id;
    auto control = ResourceControl::create(
        "native media reader " + std::to_string(id),
        std::make_unique<ReaderBody>(s->limits), run.executor(),
        std::move(resource));
    s->readers[id] = Session{control};
    try {
      return run.submit(
          control->operations(),
          makeSessionOperation<ReaderBody>(
              control, "openFilter", s->hooks(), JobCost{bytes, 0, 0},
              [spec = std::move(spec)](ReaderBody &body,
                                       ResourceOperationContext &context) {
                try {
                  body.filter.init(*body.limits, body.stop(), spec);
                } catch (const std::exception &e) {
                  context.retireSession(e.what());
                  throw;
                }
                return JobOutcome::value(nullptr);
              }),
          [id](js::Engine &engine, JobPayload *) { return engine.number(id); },
          true, std::move(reservation));
    } catch (...) {
      s->readers.erase(id);
      control->abort("native media reader was refused");
      throw;
    }
  });
  bind("next", [s](auto &en, const auto &a) {
    s->poll();
    AsyncRun &run = s->run();
    int id = intArg(en, a.at(0));
    auto it = s->readers.find(id);
    if (it == s->readers.end())
      throw std::runtime_error("native media reader closed");
    // Optional: batch audio frames up to about `batchSec` seconds for each
    // call, and make 16-bit samples from the float output. Video ignores
    // both. A batch is reserved at the audio ceiling, not the video one.
    const double batchSec =
        a.size() > 1 && en.isNumber(a[1]) ? std::max(0.0, en.toNumber(a[1])) : 0;
    const bool s16 = a.size() > 2 && en.toBoolean(a[2]);
    constexpr uint64_t kAudioBatchBytes = 8ull * 1024 * 1024;
    const uint64_t cap = batchSec > 0
                             ? std::min(s->limits->frameBytes(), kAudioBatchBytes)
                             : s->limits->frameBytes();
    auto control = it->second.control;
    return run.submit(
        control->operations(),
        makeSessionOperation<ReaderBody>(
            control, "next", s->hooks(), JobCost{0, cap, 0},
            [cap, batchSec, s16](ReaderBody &body, ResourceOperationContext &) {
              auto out = std::make_unique<DecodedFrame>();
              auto pull = [&] {
                if (body.pending)
                  return std::move(body.pending);
                if (body.ended)
                  return decltype(body.pending){};
                return body.filter.next();
              };
              auto f = pull();
              if (!f) {
                body.ended = true;
                out->end = true;
                return JobOutcome::value(std::move(out));
              }
              out->pts = f->pts * av_q2d(f->time_base);
              if (f->width) {
                body.limits->pixels(f->width, f->height);
                if (f->format != AV_PIX_FMT_RGBA)
                  throw std::runtime_error(
                      "native media expected RGBA output");
                const size_t size = size_t(f->width) * f->height * 4;
                if (size > cap)
                  throw std::runtime_error(
                      "native media frame exceeds its reserved size");
                out->video = true;
                out->width = f->width;
                out->height = f->height;
                out->bytes.resize(size);
                for (int y = 0; y < f->height; ++y)
                  std::memcpy(out->bytes.data() + size_t(y) * f->width * 4,
                              f->data[0] + y * f->linesize[0],
                              size_t(f->width) * 4);
                return JobOutcome::value(std::move(out));
              }
              out->channels = f->ch_layout.nb_channels;
              out->sampleRate = f->sample_rate;
              const uint64_t target =
                  uint64_t(batchSec * f->sample_rate * f->ch_layout.nb_channels * 4);
              uint64_t sourceBytes = 0;
              // The bytes of the output so far are in `out->bytes`.
              for (;;) {
                if (f->format != AV_SAMPLE_FMT_FLT)
                  throw std::runtime_error(
                      "native media expected interleaved float output");
                const size_t count =
                    size_t(f->nb_samples) * f->ch_layout.nb_channels;
                const size_t size = count * 4;
                if (size > body.limits->maxBytes)
                  throw std::runtime_error("native media audio quota exceeded");
                const size_t outSize = s16 ? count * 2 : size;
                if (out->bytes.size() + outSize > cap) {
                  if (out->bytes.empty())
                    throw std::runtime_error(
                        "native media frame exceeds its reserved size");
                  body.pending = std::move(f);
                  break;
                }
                const size_t at = out->bytes.size();
                if (s16) {
                  out->bytes.resize(at + outSize);
                  const float *in = reinterpret_cast<const float *>(f->data[0]);
                  auto *dst = out->bytes.data() + at;
                  for (size_t i = 0; i < count; ++i) {
                    // As the guest's Math.max(-1, Math.min(1, s)) followed
                    // by s < 0 ? s * 0x8000 : s * 0x7fff, truncated.
                    double v = in[i];
                    int16_t q = 0;
                    if (!std::isnan(v)) {
                      v = std::max(-1.0, std::min(1.0, v));
                      q = int16_t(v < 0 ? v * 0x8000 : v * 0x7fff);
                    }
                    dst[i * 2] = uint8_t(uint16_t(q) & 0xff);
                    dst[i * 2 + 1] = uint8_t(uint16_t(q) >> 8);
                  }
                } else {
                  out->bytes.insert(out->bytes.end(), f->data[0],
                                    f->data[0] + size);
                }
                sourceBytes += size;
                if (sourceBytes >= target)
                  break;
                f = body.filter.next();
                if (!f) {
                  body.ended = true;
                  break;
                }
              }
              return JobOutcome::value(std::move(out));
            }),
        convertFrame, true);
  });
  // Explicit close: operations already accepted still run, in order, then
  // the reader's body is destroyed (design section 4.8).
  bind("close", [s](auto &en, const auto &a) {
    auto it = s->readers.find(intArg(en, a.at(0)));
    if (it != s->readers.end()) {
      auto control = std::move(it->second.control);
      s->readers.erase(it);
      control->close();
    }
    return en.undefined();
  });
  // Synchronous: checks the grant and registers the session. The output
  // file is created by the first write.
  bind("openEncoder", [s](auto &en, const auto &a) {
    s->room();
    AsyncRun &run = s->run();
    const js::Value object = a.at(0);
    if (!en.isObject(object) || en.isFunction(object))
      throw std::invalid_argument("Media encoder options must be an object");
    Reservation reservation = run.reserve();
    nodetool::jobs::ResourceOptions resource;
    const auto path =
        s->path(stringField(en, object, "outPath", reservation), true);
    EncoderSpec spec = encoderSpec(en, object, reservation);
    s->limits->encoder(spec.codec);
    s->staging->lease(path, resource.dependencies);
    const bool png =
        stringField(en, object, "input", reservation, "rgba") == "png";
    // Keeps the charge for what the session holds, for as long as it does.
    // It can be more than was reserved for the copies: a default value, a
    // diagnostic, or a resolved path longer than the guest's. The growth is
    // charged, or refused, before the session exists.
    const uint64_t kept = nodetool::jobs::checkedAdd(spec.bytes(), path.size());
    if (kept > reservation.bytes())
      reservation.reserveSnapshot(kept - reservation.bytes());
    else
      reservation.releaseSnapshot(reservation.bytes() - kept);
    reservation.retain();
    auto body = std::make_unique<EncoderBody>(s->limits, std::move(reservation));
    body->encoder.limits = body->limits.get();
    body->encoder.stop = MediaStop(body->bridge, body->limits->hooks);
    body->encoder.spec = std::move(spec);
    body->encoder.path = path;
    const int id = ++s->id;
    s->encoders[id] = Session{
        ResourceControl::create("native media encoder " + std::to_string(id),
                                std::move(body), run.executor(),
                                std::move(resource)),
        png};
    return en.number(id);
  });
  // A failed write retires the encoder, so no finish can publish a file
  // without it. A write that fails in the session's queue rejects the
  // operations queued behind it, a finish among them, with its error. A
  // write refused at the call (a quota, its snapshot, admission) closes the
  // session: the writes accepted before it still run, and every later write
  // and finish fails with its error.
  bind("write", [s](auto &en, const auto &a) {
    s->poll();
    AsyncRun &run = s->run();
    int id = intArg(en, a.at(0));
    auto it = s->encoders.find(id);
    if (it == s->encoders.end())
      throw std::runtime_error("native media encoder closed");
    if (!it->second.failure.empty())
      throw std::runtime_error(it->second.failure);
    auto control = it->second.control;
    const bool png = it->second.pngInput;
    try {
      if (en.byteLength(a.at(1)) > s->limits->maxBytes)
        throw std::runtime_error("native media input byte quota exceeded");
      Reservation reservation = run.reserve();
      std::vector<uint8_t> bytes =
          snapshotBytes(en, a.at(1), "Media frame", reservation);
      int w = 0, h = 0;
      if (png) {
        // stb_image decodes on the worker, as before: the evidence does not
        // cover it on another thread.
        uint32_t width = 0, height = 0;
        imageSize(bytes.data(), bytes.size(), width, height);
        reservation.reserveSnapshot(
            checkedMul(checkedMul(width, height), 4));
        RgbaImage decoded = decodeImage(bytes.data(), bytes.size());
        reservation.releaseSnapshot(bytes.size());
        bytes = std::move(decoded.pixels);
        w = int(decoded.width);
        h = int(decoded.height);
      }
      const uint64_t size = bytes.size();
      const uint64_t number = it->second.writes + 1;
      js::Value promise = run.submit(
          control->operations(),
          makeSessionOperation<EncoderBody>(
              control, "write", s->hooks(),
              JobCost{size, 0, checkedMul(size, 2)},
              [bytes = std::move(bytes), png, w, h,
               number](EncoderBody &body, ResourceOperationContext &context) {
                try {
                  // A write before this one never reached the session, such
                  // as one the run's admission queue refused.
                  if (body.encoder.applied + 1 != number)
                    throw std::runtime_error(
                        "native media encoder write " +
                        std::to_string(body.encoder.applied + 1) +
                        " was refused before it ran");
                  body.encoder.write(bytes, png, w, h);
                  body.encoder.applied = number;
                } catch (const std::exception &e) {
                  context.retireSession(e.what());
                  throw;
                }
                return JobOutcome::value(nullptr);
              }),
          nullptr, true, std::move(reservation));
      it->second.writes = number;
      return promise;
    } catch (const std::exception &e) {
      s->failEncoder(id, e.what());
      throw;
    } catch (...) {
      s->failEncoder(id, "native media write failed");
      throw;
    }
  });
  // The terminal operation: it runs after the writes accepted before it,
  // publishes only when they all succeeded, and nothing is accepted after
  // it. An abort before it starts supersedes it.
  bind("finish", [s](auto &en, const auto &a) {
    s->poll();
    AsyncRun &run = s->run();
    int id = intArg(en, a.at(0));
    auto it = s->encoders.find(id);
    if (it == s->encoders.end())
      throw std::runtime_error("native media encoder closed");
    if (!it->second.failure.empty())
      throw std::runtime_error(it->second.failure);
    auto control = it->second.control;
    const uint64_t writes = it->second.writes;
    return run.submit(
        control->terminal(),
        makeSessionOperation<EncoderBody>(
            control, "finish", s->hooks(), JobCost{},
            [writes](EncoderBody &body, ResourceOperationContext &context) {
              if (context.precedingFailed())
                throw std::runtime_error(
                    "native media encoder failed before finish");
              // Publishes only the whole sequence: every write submitted
              // before finish succeeded.
              if (body.encoder.applied != writes)
                throw std::runtime_error(
                    "native media encoder write " +
                    std::to_string(body.encoder.applied + 1) +
                    " was refused before it ran");
              body.encoder.finish();
              return JobOutcome::value(nullptr);
            }),
        nullptr, true);
  });
  // Rejects the queued operations with an AbortError, asks the running one
  // to stop, and destroys the encoder once it returned. A finish that is
  // already running may still publish.
  bind("abort", [s](auto &en, const auto &a) {
    auto it = s->encoders.find(intArg(en, a.at(0)));
    if (it != s->encoders.end()) {
      auto control = std::move(it->second.control);
      s->encoders.erase(it);
      control->abort("native media encoder was aborted");
    }
    return en.undefined();
  });
}
} // namespace gr::host
