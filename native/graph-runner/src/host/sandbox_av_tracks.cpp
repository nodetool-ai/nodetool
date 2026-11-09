#include "host/sandbox_av_tracks.h"
#include "host/media_job.h"
#include "host/paths.h"
#include "kernel/job_inputs.h"
#include "kernel/json.h"
#include <algorithm>
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

using nodetool::jobs::ResourceControl;

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
// RAII for the libav handles (native/AGENTS.md rule 6).
struct InputFormatDelete {
  void operator()(AVFormatContext *format) const {
    avformat_close_input(&format);
  }
};
struct OutputFormatDelete {
  void operator()(AVFormatContext *format) const {
    if (format->pb) {
      avio_closep(&format->pb);
    }
    avformat_free_context(format);
  }
};
struct PacketDelete {
  void operator()(AVPacket *packet) const { av_packet_free(&packet); }
};
struct DictionaryDelete {
  void operator()(AVDictionary *dictionary) const {
    av_dict_free(&dictionary);
  }
};
// One remux input.
//
// Thread affinity: the lane thread of the remux job that owns it.
struct Input {
  std::unique_ptr<AVFormatContext, InputFormatDelete> format;
  std::unique_ptr<AVPacket, PacketDelete> packet{av_packet_alloc()};
  std::vector<int> mapping;
  bool ready = false, eof = false;
  void next(size_t &count, size_t maximum, const MediaStop &stop) {
    ready = false;
    while (!eof) {
      // Between packets (evidence restriction Q2.3).
      stop.check();
      if (++count > maximum) {
        throw std::runtime_error("Code media track packet quota exceeded");
      }
      const int result = av_read_frame(format.get(), packet.get());
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
      av_packet_unref(packet.get());
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
// Copies the original video and audio tracks of `video` and the audio track
// of `audio` into `out`, packet by packet. Runs inside one job, so its
// contexts are created, used and freed on one lane thread.
void remux(const std::string &video, const std::string &audio,
           const std::string &out, const MediaOptions &grant,
           const MediaStop &stop) {
  Input original, added;
  for (auto pair : {std::pair{&original, video}, std::pair{&added, audio}}) {
    auto &input = *pair.first;
    if (std::filesystem::file_size(pair.second) > grant.maxBytes) {
      throw std::runtime_error("Code media track input byte quota exceeded");
    }
    std::unique_ptr<AVFormatContext, InputFormatDelete> allocated(
        avformat_alloc_context());
    if (!allocated || !input.packet) {
      throw std::bad_alloc();
    }
    // The job's bridge, which outlives the context (design section 4.9).
    allocated->interrupt_callback = {
        &nodetool::jobs::SessionStopBridge::interrupt, stop.opaque()};
    std::unique_ptr<AVDictionary, DictionaryDelete> options;
    AVDictionary *dictionary = nullptr;
    av_dict_set(&dictionary, "protocol_whitelist", "file", 0);
    av_dict_set(&dictionary, "format_whitelist", "mov,matroska,webm", 0);
    // avformat_open_input frees the context on failure and leaves null, and
    // replaces the dictionary with the options it did not use.
    AVFormatContext *raw = allocated.release();
    const int opened =
        avformat_open_input(&raw, pair.second.c_str(), nullptr, &dictionary);
    options.reset(dictionary);
    input.format.reset(raw);
    check(opened);
    check(avformat_find_stream_info(input.format.get(), nullptr));
    if (input.format->nb_streams > 16) {
      throw std::runtime_error("Code media track stream quota exceeded");
    }
    input.mapping.assign(input.format->nb_streams, -1);
  }
  AVFormatContext *rawOutput = nullptr;
  const int allocated =
      avformat_alloc_output_context2(&rawOutput, nullptr, "mp4", out.c_str());
  std::unique_ptr<AVFormatContext, OutputFormatDelete> output(rawOutput);
  check(allocated);
  int videos = 0, audios = 0;
  for (auto *input : {&original, &added}) {
    for (unsigned i = 0; i < input->format->nb_streams; ++i) {
      auto *source = input->format->streams[i];
      const auto kind = source->codecpar->codec_type;
      if (input == &original
              ? (kind != AVMEDIA_TYPE_VIDEO && kind != AVMEDIA_TYPE_AUDIO)
              : (kind != AVMEDIA_TYPE_AUDIO)) {
        continue;
      }
      auto *stream = avformat_new_stream(output.get(), nullptr);
      if (!stream) {
        throw std::bad_alloc();
      }
      check(avcodec_parameters_copy(stream->codecpar, source->codecpar));
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
  check(avio_open(&output->pb, out.c_str(), AVIO_FLAG_WRITE));
  check(avformat_write_header(output.get(), nullptr));
  size_t count = 0;
  original.next(count, grant.maxFrames * 4, stop);
  added.next(count, grant.maxFrames * 4, stop);
  while (original.ready || added.ready) {
    stop.check();
    auto &input = !added.ready || (original.ready &&
                                   original.time() <= added.time())
                      ? original
                      : added;
    const auto sourceIndex = input.packet->stream_index,
               targetIndex = input.mapping[sourceIndex];
    av_packet_rescale_ts(input.packet.get(),
                         input.format->streams[sourceIndex]->time_base,
                         output->streams[targetIndex]->time_base);
    input.packet->stream_index = targetIndex;
    input.packet->pos = -1;
    // Not interruptible: output writes have no interrupt callback (Q2.3).
    check(av_interleaved_write_frame(output.get(), input.packet.get()));
    av_packet_unref(input.packet.get());
    if (avio_tell(output->pb) > int64_t(grant.maxBytes)) {
      throw std::runtime_error("Code media track output byte quota exceeded");
    }
    input.next(count, grant.maxFrames * 4, stop);
  }
  check(av_write_trailer(output.get()));
  // Published when the promise resolves: the file is closed here.
  check(avio_closep(&output->pb));
}
// A staging directory: removed when the body is destroyed, on the I/O
// lane's reaper, after every dependent released its lease.
//
// Thread affinity: created on the worker, destroyed on the destruction
// thread of its ResourceControl. Ownership: uniquely owned by that control.
struct StagingDirectory final : nodetool::jobs::ResourceBody {
  explicit StagingDirectory(std::string p) : path(std::move(p)) {}
  ~StagingDirectory() override {
    std::error_code error;
    std::filesystem::remove_all(path, error);
  }
  const std::string path;
};
constexpr const char *kStagingState = "gr.mediaStaging";
} // namespace

std::shared_ptr<MediaStaging> MediaStaging::of(js::Engine &engine) {
  if (auto existing = engine.hostState(kStagingState)) {
    return std::static_pointer_cast<MediaStaging>(existing);
  }
  // Shared: the engine's host state stores shared pointers, and the run
  // cleanup and each host function keep their own reference.
  auto made = std::make_shared<MediaStaging>();
  engine.setHostState(kStagingState, made);
  engine.addRunCleanup([made] { made->abortAll(); });
  return made;
}

void MediaStaging::add(const std::string &path,
                       nodetool::jobs::JobExecutor &lane) {
  prune();
  directories_[path] = ResourceControl::create(
      "Code media staging directory",
      std::make_unique<StagingDirectory>(path), lane);
}

void MediaStaging::release(const std::string &path) {
  auto it = directories_.find(path);
  if (it == directories_.end() ||
      it->second->state() != ResourceControl::State::Open) {
    throw std::runtime_error("Code media staging path is not registered");
  }
  // Kept until it is removed, so a later lease on it fails.
  it->second->close();
}

void MediaStaging::lease(const std::string &real,
                         std::vector<nodetool::jobs::ResourceLease> &leases) {
  prune();
  for (auto &[path, control] : directories_) {
    if (!isWithin(path, real)) {
      continue;
    }
    auto held = control->lease();
    if (!held) {
      throw std::runtime_error(
          "Code media staging directory was released: " + path);
    }
    leases.push_back(std::move(*held));
  }
}

size_t MediaStaging::open() {
  prune();
  return size_t(std::count_if(
      directories_.begin(), directories_.end(), [](const auto &entry) {
        return entry.second->state() == ResourceControl::State::Open;
      }));
}

void MediaStaging::abortAll() {
  for (auto &[path, control] : directories_) {
    control->abort("The run ended");
  }
  directories_.clear();
}

void MediaStaging::prune() {
  std::erase_if(directories_, [](const auto &entry) {
    return entry.second->state() == ResourceControl::State::Retired;
  });
}

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
  const auto staging = MediaStaging::of(engine);
  const auto binding = RunBinding::of(engine);
  // Shared with every remux job, which may outlive the engine.
  const auto hooks = std::make_shared<const MediaTestHooks>(grant.hooks);
  // The grant without the worker-only cancellation predicate, for jobs.
  auto limits = grant;
  limits.cancelled = nullptr;
  const auto jobGrant = std::make_shared<const MediaOptions>(std::move(limits));
  engine.set(
      object, "tempDir",
      engine.function(
          "tempDir", 0,
          [staging, binding, host, grant,
           roots](js::Engine &e, const std::vector<js::Value> &) {
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
            nodetool::jobs::JobExecutor *io = binding->io();
            if (!binding->run() || !io) {
              throw std::runtime_error(
                  "Code media staging needs a running graph");
            }
            if (staging->open() >= grant.maxSessions) {
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
            staging->add(path, *io);
            return e.string(path);
          }));
  // Removal waits for every reader, encoder and job that reads or writes
  // inside the directory (design section 4.8).
  engine.set(
      object, "releaseTempDir",
      engine.function(
          "releaseTempDir", 1,
          [staging](js::Engine &e, const std::vector<js::Value> &args) {
            if (args.size() != 1) {
              throw std::runtime_error("Code media staging path is required");
            }
            staging->release(e.toString(args[0]));
            return e.undefined();
          }));
  // Returns a promise. The remux runs on the run's CPU lane.
  engine.set(
      object, "remuxTracks",
      engine.function(
          "remuxTracks", 1,
          [staging, binding, host, grant, roots, hooks,
           jobGrant](js::Engine &e, const std::vector<js::Value> &args) {
            if (!grant.enabled) {
              throw std::runtime_error("native media grant is disabled");
            }
            if (grant.cancelled && grant.cancelled()) {
              throw std::runtime_error("Code media tracks cancelled");
            }
            if (args.size() != 1) {
              throw std::runtime_error("Code media tracks requires paths");
            }
            AsyncRun *run = binding->run();
            if (!run) {
              throw std::runtime_error(
                  "Code media tracks need a running graph");
            }
            // The options' text is reserved before it is copied (design
            // section 4.7).
            nodetool::jobs::Reservation reservation = run->reserve();
            const js::Value text =
                e.call(e.get(e.get(e.global(), "JSON"), "stringify"),
                       e.undefined(), {args[0]});
            const auto options = Json::parse(
                snapshotString(e, text, "Code media tracks", reservation));
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
            std::vector<nodetool::jobs::ResourceLease> leases;
            for (const auto *each : {&video, &audio, &out}) {
              staging->lease(*each, leases);
            }
            const uint64_t bytes = video.size() + audio.size() + out.size();
            return run->submit(
                run->executor(),
                makeMediaJob(
                    "remuxTracks", hooks, nodetool::jobs::JobCost{bytes, 0, 0},
                    std::move(leases),
                    [video, audio, out, jobGrant](const MediaStop &stop) {
                      remux(video, audio, out, *jobGrant, stop);
                      return nodetool::jobs::JobOutcome::value(nullptr);
                    }),
                nullptr, true, std::move(reservation));
          }));
}
} // namespace gr::host
