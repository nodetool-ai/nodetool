#include "host/sandbox_av_tracks.h"
#include "host/paths.h"
#include "kernel/json.h"
#include <filesystem>
#include <limits>
#include <memory>
#include <random>
#include <set>
#include <stdexcept>
extern "C" {
#include <libavformat/avformat.h>
#include <libavutil/error.h>
}
namespace gr::host {
namespace {
void check(int code) {
  if (code >= 0) {
    return;
  }
  char message[AV_ERROR_MAX_STRING_SIZE];
  av_strerror(code, message, sizeof(message));
  throw std::runtime_error(std::string("Code media tracks: ") + message);
}
struct Input {
  // native-rules #6: raw libav handles freed by hand in the destructor, no per-handle RAII
  AVFormatContext *format = nullptr;
  AVPacket *packet = av_packet_alloc();
  std::vector<int> mapping;
  bool ready = false, eof = false;
  ~Input() {
    av_packet_free(&packet);
    avformat_close_input(&format);
  }
  void next(size_t &count, size_t maximum, const std::function<void()> &poll) {
    ready = false;
    while (!eof) {
      poll();
      if (++count > maximum) {
        throw std::runtime_error("Code media track packet quota exceeded");
      }
      const int result = av_read_frame(format, packet);
      if (result == AVERROR_EOF) {
        eof = true;
        return;
      }
      check(result);
      if (packet->stream_index >= 0 &&
          size_t(packet->stream_index) < mapping.size() &&
          mapping[packet->stream_index] >= 0) {
        ready = true;
        return;
      }
      av_packet_unref(packet);
    }
  }
  double time() const {
    const auto value =
        packet->dts != AV_NOPTS_VALUE ? packet->dts : packet->pts;
    return value == AV_NOPTS_VALUE
               ? 0
               : value *
                     av_q2d(format->streams[packet->stream_index]->time_base);
  }
};
struct Output {
  AVFormatContext *format = nullptr;
  ~Output() {
    if (format) {
      if (format->pb) {
        avio_closep(&format->pb);
      }
      avformat_free_context(format);
    }
  }
};
} // namespace
void installSandboxAvTracks(js::Engine &engine, const js::Value &object,
                            const HostOptions &host,
                            const MediaOptions &grant) {
  std::vector<std::pair<std::string, bool>> paths;
  if (!host.workspaceDir.empty()) {
    paths.emplace_back(host.workspaceDir, true);
  }
  if (!host.assetDir.empty()) {
    paths.emplace_back(host.assetDir, true);
  }
  for (const auto &root : host.readRoots) {
    paths.emplace_back(root, false);
  }
  const auto roots = canonicalRoots(paths);
  // native-rules #1: state shared with the cleanup callback, no justification
  const auto temporary = std::make_shared<std::set<std::string>>();
  engine.addRunCleanup([temporary] {
    for (const auto &path : *temporary) {
      std::error_code error;
      std::filesystem::remove_all(path, error);
    }
    temporary->clear();
  });
  engine.set(
      object, "tempDir",
      engine.function(
          "tempDir", 0,
          [temporary, host, grant, roots](js::Engine &e,
                                          const std::vector<js::Value> &) {
            if (!grant.enabled) {
              throw std::runtime_error("native media grant is disabled");
            }
            if (grant.cancelled && grant.cancelled()) {
              throw std::runtime_error("Code media cancelled");
            }
            if (host.workspaceDir.empty()) {
              throw std::runtime_error(
                  "Code native media requires an explicitly granted workspace");
            }
            if (temporary->size() >= grant.maxSessions) {
              throw std::runtime_error(
                  "Code media staging session limit exceeded");
            }
            std::random_device entropy;
            constexpr char hex[] = "0123456789abcdef";
            std::string token;
            for (int i = 0; i < 16; ++i) {
              const auto byte = entropy() & 255;
              token += hex[byte >> 4];
              token += hex[byte & 15];
            }
            const auto path =
                confine(roots, host.workspaceDir,
                        host.workspaceDir + "/.code-media-" + token,
                        Access::Write, "Code media staging", true)
                    .real;
            if (!std::filesystem::create_directory(path)) {
              throw std::runtime_error(
                  "Cannot create Code media staging directory");
            }
            temporary->insert(path);
            return e.string(path);
          }));
  engine.set(
      object, "releaseTempDir",
      engine.function(
          "releaseTempDir", 1,
          [temporary](js::Engine &e, const std::vector<js::Value> &args) {
            if (args.size() != 1) {
              throw std::runtime_error("Code media staging path is required");
            }
            const auto path = e.toString(args[0]);
            if (!temporary->contains(path)) {
              throw std::runtime_error(
                  "Code media staging path is not registered");
            }
            std::filesystem::remove_all(path);
            temporary->erase(path);
            return e.undefined();
          }));
  engine.set(
      object, "remuxTracks",
      engine.function(
          "remuxTracks", 1,
          [host, grant, roots](js::Engine &e,
                               const std::vector<js::Value> &args) {
            const auto poll = [&] {
              if (!grant.enabled) {
                throw std::runtime_error("native media grant is disabled");
              }
              if (grant.cancelled && grant.cancelled()) {
                throw std::runtime_error("Code media tracks cancelled");
              }
            };
            poll();
            if (args.size() != 1) {
              throw std::runtime_error("Code media tracks requires paths");
            }
            const auto options = Json::parse(
                e.toString(e.call(e.get(e.get(e.global(), "JSON"), "stringify"),
                                  e.undefined(), {args[0]})));
            const auto path = [&](const char *key, Access access) {
              return confine(roots, host.workspaceDir,
                             options.at(key).get<std::string>(), access,
                             "Code media tracks", true)
                  .real;
            };
            const auto video = path("videoPath", Access::Read),
                       audio = path("audioPath", Access::Read),
                       out = path("outPath", Access::Write);
            if (video == out || audio == out) {
              throw std::runtime_error(
                  "Code media tracks cannot overwrite an input");
            }
            Input original, added;
            for (auto pair :
                 {std::pair{&original, video}, std::pair{&added, audio}}) {
              auto &input = *pair.first;
              if (std::filesystem::file_size(pair.second) > grant.maxBytes) {
                throw std::runtime_error(
                    "Code media track input byte quota exceeded");
              }
              input.format = avformat_alloc_context();
              if (!input.format || !input.packet) {
                throw std::bad_alloc();
              }
              input.format->interrupt_callback = {
                  [](void *opaque) {
                    auto *fn =
                        static_cast<const std::function<bool()> *>(opaque);
                    return *fn && (*fn)() ? 1 : 0;
                  },
                  const_cast<std::function<bool()> *>(&grant.cancelled)};
              // native-rules #6: raw AVDictionary freed by hand with av_dict_free
              AVDictionary *dictionary = nullptr;
              av_dict_set(&dictionary, "protocol_whitelist", "file", 0);
              av_dict_set(&dictionary, "format_whitelist", "mov,matroska,webm",
                          0);
              const int opened = avformat_open_input(
                  &input.format, pair.second.c_str(), nullptr, &dictionary);
              av_dict_free(&dictionary);
              check(opened);
              check(avformat_find_stream_info(input.format, nullptr));
              if (input.format->nb_streams > 16) {
                throw std::runtime_error(
                    "Code media track stream quota exceeded");
              }
              input.mapping.assign(input.format->nb_streams, -1);
            }
            Output output;
            check(avformat_alloc_output_context2(&output.format, nullptr, "mp4",
                                                 out.c_str()));
            int videos = 0, audios = 0;
            for (auto *input : {&original, &added}) {
              for (unsigned i = 0; i < input->format->nb_streams; ++i) {
                auto *source = input->format->streams[i];
                const auto kind = source->codecpar->codec_type;
                if (input == &original ? (kind != AVMEDIA_TYPE_VIDEO &&
                                          kind != AVMEDIA_TYPE_AUDIO)
                                       : (kind != AVMEDIA_TYPE_AUDIO)) {
                  continue;
                }
                auto *stream = avformat_new_stream(output.format, nullptr);
                if (!stream) {
                  throw std::bad_alloc();
                }
                check(avcodec_parameters_copy(stream->codecpar,
                                              source->codecpar));
                stream->codecpar->codec_tag = 0;
                stream->time_base = source->time_base;
                check(av_dict_copy(&stream->metadata, source->metadata, 0));
                stream->disposition = source->disposition;
                input->mapping[i] = stream->index;
                if (kind == AVMEDIA_TYPE_VIDEO) {
                  ++videos;
                } else {
                  ++audios;
                }
              }
            }
            if (videos != 1 || audios < 2) {
              throw std::runtime_error("Code media track preservation requires "
                                       "video, original audio and added audio");
            }
            check(avio_open(&output.format->pb, out.c_str(), AVIO_FLAG_WRITE));
            check(avformat_write_header(output.format, nullptr));
            size_t count = 0;
            original.next(count, grant.maxFrames * 4, poll);
            added.next(count, grant.maxFrames * 4, poll);
            while (original.ready || added.ready) {
              poll();
              auto &input = !added.ready || (original.ready &&
                                             original.time() <= added.time())
                                ? original
                                : added;
              const auto sourceIndex = input.packet->stream_index,
                         targetIndex = input.mapping[sourceIndex];
              av_packet_rescale_ts(
                  input.packet, input.format->streams[sourceIndex]->time_base,
                  output.format->streams[targetIndex]->time_base);
              input.packet->stream_index = targetIndex;
              input.packet->pos = -1;
              check(av_interleaved_write_frame(output.format, input.packet));
              av_packet_unref(input.packet);
              if (avio_tell(output.format->pb) > int64_t(grant.maxBytes)) {
                throw std::runtime_error(
                    "Code media track output byte quota exceeded");
              }
              input.next(count, grant.maxFrames * 4, poll);
            }
            check(av_write_trailer(output.format));
            poll();
            return e.undefined();
          }));
}
} // namespace gr::host
