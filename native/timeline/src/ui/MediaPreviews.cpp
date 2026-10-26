#include "ui/MediaPreviews.h"

#include "ui/MediaVersion.h"
#include "ui/TimelineViewState.h"

#include <QDateTime>
#include <QImageReader>
#include <QFile>
#include <QUrl>
#include <QMetaObject>
#include <QPainter>
#include <QPainterPath>
#include <QMutex>
#include <QPointer>
#include <QSGFlatColorMaterial>
#include <QSGGeometryNode>
#include <QSGOpacityNode>
#include <QSGSimpleTextureNode>
#include <QQuickWindow>
#include <QCoreApplication>
#include <QThread>
#include <QThreadPool>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <optional>
#include <utility>
#include <limits>

#ifdef Q_OS_UNIX
#include <cerrno>
#include <condition_variable>
#include <fcntl.h>
#include <mutex>
#include <poll.h>
#include <span>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>
#endif

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/imgutils.h>
#include <libavutil/opt.h>
#include <libswresample/swresample.h>
#include <libswscale/swscale.h>
}

namespace nt::ui {

namespace {

constexpr int BLOCKS_PER_PEAK = 8;
constexpr int FALLBACK_BLOCK_SAMPLES = 256;
constexpr int MAX_THUMB_ENTRIES = 32;
constexpr qint64 FAILURE_RETRY_MS = 30000;

struct FormatCloser {
    void operator()(AVFormatContext* f) const { avformat_close_input(&f); }
};
struct CodecCloser {
    void operator()(AVCodecContext* c) const { avcodec_free_context(&c); }
};
struct FrameCloser {
    void operator()(AVFrame* f) const { av_frame_free(&f); }
};
struct PacketCloser {
    void operator()(AVPacket* p) const { av_packet_free(&p); }
};
using FormatPtr = std::unique_ptr<AVFormatContext, FormatCloser>;
using CodecPtr = std::unique_ptr<AVCodecContext, CodecCloser>;
using FramePtr = std::unique_ptr<AVFrame, FrameCloser>;
using PacketPtr = std::unique_ptr<AVPacket, PacketCloser>;

// Shared by FFmpeg's interrupt callback and local I/O. It must outlive
// the format context and the custom I/O callbacks.
struct ReadGuard {
    const std::atomic<bool>* cancel = nullptr;
    std::optional<std::chrono::steady_clock::time_point> openDeadline;
    static int interrupted(void* opaque) {
        const auto* g = static_cast<const ReadGuard*>(opaque);
        if (g->cancel && g->cancel->load()) return 1;
        return g->openDeadline && std::chrono::steady_clock::now() > *g->openDeadline ? 1 : 0;
    }
};

#ifdef Q_OS_UNIX
constexpr size_t MAX_LOCAL_IO_HELPERS = 8;
std::atomic<std::shared_ptr<const LocalIoHook>> localIoHook;

void beforeLocalIo(const char* operation, const QString& path) {
    if (const auto hook = localIoHook.load()) (*hook)(operation, path);
}

class FileDescriptor {
public:
    explicit FileDescriptor(int fd) : m_fd(fd) {}
    ~FileDescriptor() {
        if (m_fd >= 0) ::close(m_fd);
    }
    FileDescriptor(const FileDescriptor&) = delete;
    FileDescriptor& operator=(const FileDescriptor&) = delete;
    FileDescriptor(FileDescriptor&& other) noexcept : m_fd(std::exchange(other.m_fd, -1)) {}
    FileDescriptor& operator=(FileDescriptor&& other) noexcept {
        if (this != &other) {
            FileDescriptor old(std::exchange(m_fd, std::exchange(other.m_fd, -1)));
        }
        return *this;
    }
    int get() const { return m_fd; }

private:
    int m_fd;
};

class InterruptibleFile : public QIODevice {
    enum class Request { None, Read, Seek };
    struct State {
        std::mutex mutex;
        std::condition_variable changed;
        std::atomic<bool> abandoned{false};
        bool stop = false;
        bool completed = false;
        bool regular = false;
        qint64 size = 0;
        Request request = Request::None;
        size_t readSize = 0;
        qint64 offset = 0;
        int whence = SEEK_SET;
        qint64 result = 0;
        std::vector<char> buffer;
    };
    struct Registry {
        std::mutex mutex;
        std::vector<std::pair<QString, std::shared_ptr<State>>> running;
    };

    static std::shared_ptr<Registry> registry() {
        // Each helper keeps its registry alive through detached work and removal,
        // even if the static owner has already been destroyed at process exit.
        static const auto value = std::make_shared<Registry>();
        return value;
    }
    static void unregisterHelper(const std::shared_ptr<Registry>& helpers, const std::shared_ptr<State>& state) {
        std::scoped_lock lock(helpers->mutex);
        std::erase_if(helpers->running, [&state](const auto& entry) { return entry.second == state; });
    }

public:
    InterruptibleFile(const QString& path, ReadGuard& guard)
        : m_guard(guard) {
        const auto helpers = registry();
        const QString version = mediaVersionKey(path);
        {
            std::scoped_lock lock(helpers->mutex);
            // Reserve active slots too, so simultaneous abandonments stay bounded.
            if (helpers->running.size() >= MAX_LOCAL_IO_HELPERS) {
                return;
            }
            // Match the cache's file version, so an abandoned old file does not
            // reject a healthy replacement at the same path.
            if (std::any_of(helpers->running.begin(), helpers->running.end(), [&version](const auto& entry) {
                    return entry.first == version && entry.second->abandoned.load();
                })) {
                return;
            }
            helpers->running.emplace_back(version, m_state);
        }
        try {
            m_thread = std::jthread([helpers, state = m_state, path]() {
                serve(state, path);
                unregisterHelper(helpers, state);
            });
        } catch (...) {
            unregisterHelper(helpers, m_state);
            throw;
        }
        std::unique_lock lock(m_state->mutex);
        if (waitForResult(lock) && m_state->result >= 0) {
            m_regular = m_state->regular;
            m_size = m_state->size;
            open(QIODevice::ReadOnly);
        }
    }
    static int outstanding() {
        const auto helpers = registry();
        std::scoped_lock lock(helpers->mutex);
        return static_cast<int>(helpers->running.size());
    }
    ~InterruptibleFile() override {
        if (!m_thread.joinable()) {
            return;
        }
        {
            std::scoped_lock lock(m_state->mutex);
            m_state->stop = true;
        }
        m_state->changed.notify_all();
        // A stuck syscall owns only shared state and its own buffer, never
        // the QIODevice, ReadGuard or a decoder's output memory.
        if (m_state->abandoned.load()) m_thread.detach();
        else m_thread.join();
    }
    bool isSequential() const override { return !m_regular; }
    qint64 size() const override { return m_regular ? m_size : 0; }
    bool seek(qint64 pos) override {
        if (seekOffset(pos, SEEK_SET) < 0) return false;
        return QIODevice::seek(pos);
    }
    qint64 seekOffset(qint64 offset, int whence) {
        if (!m_regular) return AVERROR(ESPIPE);
        std::unique_lock lock(m_state->mutex);
        if (m_state->abandoned.load()) return AVERROR_EXIT;
        m_state->offset = offset;
        m_state->whence = whence;
        return request(Request::Seek, lock);
    }
    int readBytes(std::span<char> data) {
        if (data.empty()) return 0;
        std::unique_lock lock(m_state->mutex);
        if (m_state->abandoned.load()) return AVERROR_EXIT;
        m_state->readSize = data.size();
        const auto n = request(Request::Read, lock);
        if (n > 0) std::copy_n(m_state->buffer.begin(), static_cast<size_t>(n), data.begin());
        return static_cast<int>(n);
    }

protected:
    qint64 readData(char* data, qint64 maxSize) override {
        const auto size = static_cast<size_t>(std::clamp<qint64>(maxSize, 0, std::numeric_limits<int>::max()));
        const int n = readBytes(std::span<char>(data, size));
        return n < 0 ? -1 : n;
    }
    qint64 writeData(const char*, qint64) override { return -1; }

private:
    bool waitForResult(std::unique_lock<std::mutex>& lock) {
        for (;;) {
            if (ReadGuard::interrupted(&m_guard) || m_state->abandoned.load()) {
                m_state->abandoned = true;
                m_state->changed.notify_all();
                return false;
            }
            if (m_state->completed) return true;
            m_state->changed.wait_for(lock, std::chrono::milliseconds(50));
        }
    }
    qint64 request(Request operation, std::unique_lock<std::mutex>& lock) {
        if (m_state->abandoned.load()) return AVERROR_EXIT;
        m_state->completed = false;
        m_state->request = operation;
        m_state->changed.notify_all();
        return waitForResult(lock) ? m_state->result : AVERROR_EXIT;
    }
    static qint64 readFile(int fd, State& state, const QString& path) {
        state.buffer.resize(state.readSize);
        while (!state.abandoned.load()) {
            pollfd descriptor{fd, POLLIN, 0};
            const int ready = ::poll(&descriptor, 1, 50);
            if (ready < 0) {
                if (errno == EINTR) continue;
                return AVERROR(errno);
            }
            if (ready == 0) continue;
            if (descriptor.revents & POLLNVAL) return AVERROR(EBADF);
            if (state.abandoned.load()) return AVERROR_EXIT;
            beforeLocalIo("read", path);
            const auto n = ::read(fd, state.buffer.data(), state.buffer.size());
            if (n >= 0) return n;
            if (errno != EAGAIN && errno != EINTR) return AVERROR(errno);
        }
        return AVERROR_EXIT;
    }
    static void serve(const std::shared_ptr<State>& state, const QString& path) {
        if (state->abandoned.load()) return;
        beforeLocalIo("open", path);
        FileDescriptor fd(::open(QFile::encodeName(path).constData(), O_RDONLY | O_NONBLOCK | O_CLOEXEC));
        qint64 result = fd.get() < 0 ? AVERROR(errno) : 0;
        struct stat st {};
        if (fd.get() >= 0) {
            if (state->abandoned.load()) return;
            beforeLocalIo("fstat", path);
            if (::fstat(fd.get(), &st) < 0) result = AVERROR(errno);
        }
        std::unique_lock lock(state->mutex);
        state->regular = S_ISREG(st.st_mode);
        state->size = st.st_size;
        state->result = result;
        state->completed = true;
        state->changed.notify_all();
        if (result < 0) return;
        for (;;) {
            state->changed.wait(lock, [&]() {
                return state->stop || state->abandoned.load() || state->request != Request::None;
            });
            if (state->stop || state->abandoned.load()) return;
            const Request operation = state->request;
            lock.unlock();
            if (operation == Request::Read) {
                result = readFile(fd.get(), *state, path);
            } else {
                if (state->abandoned.load()) return;
                beforeLocalIo("lseek", path);
                const auto pos = ::lseek(fd.get(), state->offset, state->whence);
                result = pos < 0 ? AVERROR(errno) : pos;
            }
            lock.lock();
            if (state->abandoned.load()) return;
            state->request = Request::None;
            state->result = result;
            state->completed = true;
            state->changed.notify_all();
        }
    }

    std::shared_ptr<State> m_state = std::make_shared<State>();
    ReadGuard& m_guard;
    std::jthread m_thread;
    bool m_regular = false;
    qint64 m_size = 0;
};

struct AvioCloser {
    void operator()(AVIOContext* context) const {
        av_freep(&context->buffer);
        avio_context_free(&context);
    }
};
#endif

// Declared before FormatPtr by callers: FFmpeg borrows pb and never frees it.
struct InputIo {
#ifdef Q_OS_UNIX
    std::unique_ptr<InterruptibleFile> file;
    std::unique_ptr<AVIOContext, AvioCloser> context;

    bool open(const QString& path, ReadGuard& guard) {
        file = std::make_unique<InterruptibleFile>(path, guard);
        if (!file->isOpen()) return false;
        constexpr int bufferSize = 32768;
        auto* buffer = static_cast<unsigned char*>(av_malloc(bufferSize));
        if (!buffer) return false;
        context.reset(avio_alloc_context(buffer, bufferSize, 0, file.get(),
            [](void* opaque, uint8_t* data, int size) {
                const int n = static_cast<InterruptibleFile*>(opaque)->readBytes(
                    std::span<char>(reinterpret_cast<char*>(data), static_cast<size_t>(std::max(0, size))));
                return n == 0 ? AVERROR_EOF : n;
            }, nullptr,
            [](void* opaque, int64_t offset, int whence) -> int64_t {
                auto* file = static_cast<InterruptibleFile*>(opaque);
                whence &= ~AVSEEK_FORCE;
                if (whence == AVSEEK_SIZE) return file->isSequential() ? AVERROR(ESPIPE) : file->size();
                return file->seekOffset(offset, whence);
            }));
        if (!context) {
            av_free(buffer);
            return false;
        }
        context->seekable = file->isSequential() ? 0 : AVIO_SEEKABLE_NORMAL;
        return true;
    }
#endif
};

// The first stream of `type` and an open decoder for it.
bool openStream(const QString& path, AVMediaType type, FormatPtr& format, CodecPtr& codec, int& streamIndex,
                ReadGuard& guard, int openTimeoutMs, [[maybe_unused]] InputIo& io) {
    if (openTimeoutMs > 0) {
        guard.openDeadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(openTimeoutMs);
    }
    AVFormatContext* f = avformat_alloc_context();
    if (!f) return false;
    f->interrupt_callback.callback = &ReadGuard::interrupted;
    f->interrupt_callback.opaque = &guard;
#ifdef Q_OS_UNIX
    const QUrl url(path);
    if (url.scheme().isEmpty() || url.isLocalFile()) {
        if (!io.open(url.isLocalFile() ? url.toLocalFile() : path, guard)) {
            avformat_free_context(f);
            return false;
        }
        f->pb = io.context.get();
        f->flags |= AVFMT_FLAG_CUSTOM_IO;
    }
    // On failure the open frees the format context, but custom pb stays ours.
    if (avformat_open_input(&f, path.toUtf8().constData(), nullptr, nullptr) < 0) return false;
#else
    // On failure the open frees the context.
    if (avformat_open_input(&f, path.toUtf8().constData(), nullptr, nullptr) < 0) return false;
#endif
    format.reset(f);
    if (avformat_find_stream_info(f, nullptr) < 0) return false;
    guard.openDeadline.reset();  // the decode itself stops on `cancel` only
    streamIndex = -1;
    for (unsigned i = 0; i < f->nb_streams; ++i) {
        if (f->streams[i]->codecpar->codec_type == type) {
            streamIndex = static_cast<int>(i);
            break;
        }
    }
    if (streamIndex < 0) return false;
    const AVCodecParameters* par = f->streams[streamIndex]->codecpar;
    const AVCodec* decoder = avcodec_find_decoder(par->codec_id);
    if (!decoder) return false;
    codec.reset(avcodec_alloc_context3(decoder));
    if (!codec || avcodec_parameters_to_context(codec.get(), par) < 0) return false;
    codec->thread_count = 1;
    return avcodec_open2(codec.get(), decoder, nullptr) >= 0;
}

}  // namespace

#ifdef Q_OS_UNIX
void setLocalIoStallForTesting(LocalIoHook hook) {
    localIoHook.store(hook ? std::make_shared<const LocalIoHook>(std::move(hook)) : nullptr);
}
int outstandingLocalIoForTesting() {
    return InterruptibleFile::outstanding();
}
#endif

std::shared_ptr<const AudioPeaks> computeAudioPeaks(const QString& path, int count, const std::atomic<bool>* cancel,
                                                    int openTimeoutMs) {
    ReadGuard guard{cancel, std::nullopt};
    InputIo io;
    FormatPtr format;
    CodecPtr codec;
    int stream = -1;
    if (count <= 0 || !openStream(path, AVMEDIA_TYPE_AUDIO, format, codec, stream, guard, openTimeoutMs, io)) return nullptr;
    const int sampleRate = codec->sample_rate;
    if (sampleRate <= 0) return nullptr;
    const double durationSec = format->duration > 0 ? double(format->duration) / AV_TIME_BASE : -1;
    const long long blockSamples =
        durationSec > 0 ? std::max<long long>(1, static_cast<long long>(std::floor(durationSec * sampleRate /
                                                                                   (double(count) * BLOCKS_PER_PEAK))))
                        : FALLBACK_BLOCK_SAMPLES;

    // The first channel as float ("pan=mono|c0=c0", pcm_f32le).
    SwrContext* swr = nullptr;
    AVChannelLayout mono = AV_CHANNEL_LAYOUT_MONO;
    AVChannelLayout inLayout;
    if (codec->ch_layout.nb_channels > 0) {
        av_channel_layout_copy(&inLayout, &codec->ch_layout);
    } else {
        av_channel_layout_default(&inLayout, 1);
    }
    // A mix matrix that keeps only input channel 0.
    if (swr_alloc_set_opts2(&swr, &mono, AV_SAMPLE_FMT_FLT, sampleRate, &inLayout, codec->sample_fmt, sampleRate, 0,
                            nullptr) < 0) {
        av_channel_layout_uninit(&inLayout);
        return nullptr;
    }
    std::vector<double> matrix(static_cast<size_t>(inLayout.nb_channels), 0.0);
    matrix[0] = 1.0;
    swr_set_matrix(swr, matrix.data(), inLayout.nb_channels);
    av_channel_layout_uninit(&inLayout);
    if (swr_init(swr) < 0) {
        swr_free(&swr);
        return nullptr;
    }

    std::vector<float> blocks;
    long long totalSamples = 0;
    float blockMax = 0;
    long long inBlock = 0;
    std::vector<float> out;
    const auto consume = [&](const float* s, int n) {
        for (int i = 0; i < n; ++i) {
            const float v = std::abs(s[i]);
            if (v > blockMax) blockMax = v;
            if (++inBlock == blockSamples) {
                blocks.push_back(blockMax);
                blockMax = 0;
                inBlock = 0;
            }
        }
        totalSamples += n;
    };
    const auto convert = [&](const AVFrame* frame) {
        const int capacity = swr_get_out_samples(swr, frame ? frame->nb_samples : 0);
        if (capacity <= 0) return;
        out.resize(static_cast<size_t>(capacity));
        auto* dst = reinterpret_cast<uint8_t*>(out.data());
        const int n = swr_convert(swr, &dst, capacity, frame ? const_cast<const uint8_t**>(frame->extended_data) : nullptr,
                                  frame ? frame->nb_samples : 0);
        if (n > 0) consume(out.data(), n);
    };

    PacketPtr packet(av_packet_alloc());
    FramePtr frame(av_frame_alloc());
    bool ok = true;
    const auto drain = [&]() {
        while (true) {
            const int r = avcodec_receive_frame(codec.get(), frame.get());
            if (r == AVERROR(EAGAIN) || r == AVERROR_EOF) return;
            if (r < 0) {
                ok = false;
                return;
            }
            convert(frame.get());
            av_frame_unref(frame.get());
        }
    };
    while (av_read_frame(format.get(), packet.get()) >= 0) {
        if (cancel && cancel->load()) {
            av_packet_unref(packet.get());
            swr_free(&swr);
            return nullptr;
        }
        if (packet->stream_index == stream) {
            // A damaged packet is skipped, as ffmpeg's command line does.
            if (avcodec_send_packet(codec.get(), packet.get()) >= 0) drain();
        }
        av_packet_unref(packet.get());
        if (!ok) break;
    }
    avcodec_send_packet(codec.get(), nullptr);
    drain();
    convert(nullptr);  // the resampler's tail
    swr_free(&swr);
    if (!ok) return nullptr;
    if (inBlock > 0) blocks.push_back(blockMax);

    auto result = std::make_shared<AudioPeaks>();
    result->durationMs = double(totalSamples) / sampleRate * 1000.0;
    if (totalSamples == 0) return result;
    // reduceToPeaks
    result->peaks.resize(static_cast<size_t>(count));
    const double samplesPerBucket = double(totalSamples) / count;
    for (int i = 0; i < count; ++i) {
        const long long start = static_cast<long long>(std::floor(i * samplesPerBucket));
        const long long end = std::max(start + 1, static_cast<long long>(std::floor((i + 1) * samplesPerBucket)));
        const long long firstBlock = start / blockSamples;
        const long long endBlock =
            std::max(firstBlock + 1, static_cast<long long>(std::ceil(double(end) / double(blockSamples))));
        float max = 0;
        for (long long b = firstBlock; b < endBlock && b < static_cast<long long>(blocks.size()); ++b) {
            max = std::max(max, blocks[static_cast<size_t>(b)]);
        }
        result->peaks[static_cast<size_t>(i)] = static_cast<float>(std::round(double(max) * 10000.0) / 10000.0);
    }
    return result;
}

std::vector<Thumbnail> extractThumbnails(const QString& path, int count, int width, const std::atomic<bool>* cancel,
                                         int openTimeoutMs) {
    std::vector<Thumbnail> thumbs;
    ReadGuard guard{cancel, std::nullopt};
    InputIo io;
    FormatPtr format;
    CodecPtr codec;
    int stream = -1;
    if (count <= 0 || width <= 0 || !openStream(path, AVMEDIA_TYPE_VIDEO, format, codec, stream, guard, openTimeoutMs, io))
        return thumbs;
    const AVStream* st = format->streams[stream];
    double durationSec = st->duration > 0 ? st->duration * av_q2d(st->time_base) : -1;
    if (durationSec <= 0 && format->duration > 0) durationSec = double(format->duration) / AV_TIME_BASE;
    if (durationSec <= 0 || codec->width <= 0 || codec->height <= 0) return thumbs;
    // The picture's aspect, as the video element reports it (square pixels).
    const double aspect = double(codec->height) / double(codec->width);
    const int height = std::max(1, static_cast<int>(std::lround(width * aspect)));

    PacketPtr packet(av_packet_alloc());
    FramePtr frame(av_frame_alloc());
    SwsContext* sws = nullptr;
    const double startSec = st->start_time != AV_NOPTS_VALUE ? st->start_time * av_q2d(st->time_base) : 0.0;

    // The frame shown at `t`: the last frame whose time is at or before it.
    const auto frameAt = [&](double t) -> QImage {
        const int64_t target = static_cast<int64_t>((t + startSec) / av_q2d(st->time_base));
        if (av_seek_frame(format.get(), stream, target, AVSEEK_FLAG_BACKWARD) < 0) return {};
        avcodec_flush_buffers(codec.get());
        QImage best;
        bool done = false;
        const auto take = [&](AVFrame* f) {
            const int64_t pts = f->best_effort_timestamp;
            if (!best.isNull() && pts != AV_NOPTS_VALUE && pts > target) {
                done = true;
                return;
            }
            sws = sws_getCachedContext(sws, f->width, f->height, static_cast<AVPixelFormat>(f->format), width, height,
                                       AV_PIX_FMT_RGB32, SWS_BILINEAR, nullptr, nullptr, nullptr);
            if (!sws) {
                done = true;
                return;
            }
            QImage image(width, height, QImage::Format_RGB32);
            uint8_t* dst[4] = {image.bits(), nullptr, nullptr, nullptr};
            int dstStride[4] = {static_cast<int>(image.bytesPerLine()), 0, 0, 0};
            sws_scale(sws, f->data, f->linesize, 0, f->height, dst, dstStride);
            best = image;
            if (pts != AV_NOPTS_VALUE && pts >= target) done = true;
        };
        while (!done && av_read_frame(format.get(), packet.get()) >= 0) {
            if (cancel && cancel->load()) {
                av_packet_unref(packet.get());
                return {};
            }
            if (packet->stream_index == stream && avcodec_send_packet(codec.get(), packet.get()) >= 0) {
                while (!done && avcodec_receive_frame(codec.get(), frame.get()) >= 0) {
                    take(frame.get());
                    av_frame_unref(frame.get());
                }
            }
            av_packet_unref(packet.get());
        }
        if (!done) {
            avcodec_send_packet(codec.get(), nullptr);
            while (!done && avcodec_receive_frame(codec.get(), frame.get()) >= 0) {
                take(frame.get());
                av_frame_unref(frame.get());
            }
        }
        return best;
    };

    for (int i = 0; i < count; ++i) {
        const double t = count <= 1 ? 0.0 : double(i) / double(count - 1) * durationSec;
        const double clamped = std::max(0.0, std::min(std::max(0.0, durationSec - 0.001), t));
        QImage image = frameAt(clamped);
        if (cancel && cancel->load()) {
            thumbs.clear();
            break;
        }
        if (image.isNull()) break;
        thumbs.push_back({clamped, std::move(image)});
    }
    sws_freeContext(sws);
    return thumbs;
}

std::vector<Thumbnail> loadImageThumbnail(const QString& path, int width, const std::atomic<bool>* cancel,
                                           [[maybe_unused]] int openTimeoutMs) {
    if (cancel && cancel->load()) return {};
#ifdef Q_OS_UNIX
    ReadGuard guard{cancel, std::nullopt};
    if (openTimeoutMs > 0) {
        guard.openDeadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(openTimeoutMs);
    }
    InterruptibleFile file(path, guard);
    if (!file.isOpen()) return {};
    QImageReader reader(&file);
#else
    QImageReader reader(path);
#endif
    reader.setAutoTransform(true);
    const QSize size = reader.size();
    if (size.isValid() && size.width() > width) {
        reader.setScaledSize(QSize(width, std::max(1, static_cast<int>(std::lround(double(width) * size.height() / size.width())))));
    }
    QImage image = reader.read();
    if (image.isNull() || (cancel && cancel->load())) return {};
    return {Thumbnail{0, std::move(image)}};
}

float samplePeakAt(const std::vector<float>& fullPeaks, double sourceDurationMs, double inPointMs, double outPointMs,
                   int peakCount, int i) {
    if (peakCount <= 0 || fullPeaks.empty() || sourceDurationMs <= 0) return 0.0f;
    const double n = double(fullPeaks.size());
    const double inFrac = std::max(0.0, std::min(1.0, inPointMs / sourceDurationMs));
    const double outFrac = std::max(0.0, std::min(1.0, outPointMs / sourceDurationMs));
    const double startIdx = inFrac * n;
    const double endIdx = std::max(startIdx + 1, outFrac * n);
    const double span = endIdx - startIdx;
    const long long lo = static_cast<long long>(std::floor(startIdx + span * i / peakCount));
    const long long hi = std::max(lo + 1, static_cast<long long>(std::floor(startIdx + span * (i + 1) / peakCount)));
    float max = 0;
    for (long long j = lo; j < hi && j < static_cast<long long>(fullPeaks.size()); ++j) {
        if (fullPeaks[static_cast<size_t>(j)] > max) max = fullPeaks[static_cast<size_t>(j)];
    }
    return max;
}

std::vector<float> samplePeaksWindow(const std::vector<float>& fullPeaks, double sourceDurationMs, double inPointMs,
                                     double outPointMs, int peakCount) {
    if (peakCount <= 0) return {};
    std::vector<float> out(static_cast<size_t>(peakCount), 0.0f);
    for (int i = 0; i < peakCount; ++i) {
        out[static_cast<size_t>(i)] = samplePeakAt(fullPeaks, sourceDurationMs, inPointMs, outPointMs, peakCount, i);
    }
    return out;
}

int filmstripCellAt(const std::vector<Thumbnail>& thumbnails, int cellCount, double inPointMs, double outPointMs,
                    int i) {
    if (thumbnails.empty() || cellCount <= 0) return -1;
    const double spanMs = std::max(0.0, outPointMs - inPointMs);
    const int steps = std::max(1, cellCount - 1);
    const double targetSec = (inPointMs + double(i) / steps * spanMs) / 1000.0;
    int best = 0;
    double bestDelta = std::abs(thumbnails[0].timeSec - targetSec);
    for (size_t k = 1; k < thumbnails.size(); ++k) {
        const double delta = std::abs(thumbnails[k].timeSec - targetSec);
        if (delta < bestDelta) {
            best = static_cast<int>(k);
            bestDelta = delta;
        } else if (delta > bestDelta) {
            break;
        }
    }
    return best;
}

std::vector<int> selectFilmstripCells(const std::vector<Thumbnail>& thumbnails, int cellCount, double inPointMs,
                                      double outPointMs) {
    std::vector<int> cells;
    if (thumbnails.empty() || cellCount <= 0) return cells;
    for (int i = 0; i < cellCount; ++i) cells.push_back(filmstripCellAt(thumbnails, cellCount, inPointMs, outPointMs, i));
    return cells;
}

std::shared_ptr<const ThumbnailSet> makeThumbnailSet(std::vector<Thumbnail> thumbs) {
    auto set = std::make_shared<ThumbnailSet>();
    if (thumbs.empty()) return set;
    set->thumbSize = thumbs.front().image.size();
    if (thumbs.size() == 1) {
        set->atlas = thumbs.front().image;
    } else {
        set->atlas = QImage(set->thumbSize.width() * static_cast<int>(thumbs.size()), set->thumbSize.height(),
                            QImage::Format_RGB32);
        QPainter painter(&set->atlas);
        for (size_t i = 0; i < thumbs.size(); ++i) {
            painter.drawImage(QPointF(double(i) * set->thumbSize.width(), 0), thumbs[i].image);
        }
    }
    set->thumbs = std::move(thumbs);
    return set;
}

double beyondSourceFraction(const std::vector<Thumbnail>& thumbnails, double inPointMs, double outPointMs) {
    if (thumbnails.size() < 2) return 0;
    const double first = thumbnails.front().timeSec;
    const double last = thumbnails.back().timeSec;
    const double intervalSec = (last - first) / double(thumbnails.size() - 1);
    const double sourceEndMs = (last + intervalSec) * 1000.0;
    const double spanMs = outPointMs - inPointMs;
    if (spanMs <= 0 || outPointMs <= sourceEndMs) return 0;
    return std::min(1.0, (outPointMs - sourceEndMs) / spanMs);
}


// ── Cache ──

namespace {

QThreadPool& decodePool() {
    static QThreadPool* pool = [] {
        auto* p = new QThreadPool;
        p->setMaxThreadCount(2);  // MAX_CONCURRENT
        return p;
    }();
    return *pool;
}

qint64 nowMs() {
    return QDateTime::currentMSecsSinceEpoch();
}

}  // namespace

MediaPreviewCache::MediaPreviewCache() = default;

MediaPreviewCache& MediaPreviewCache::instance() {
    static MediaPreviewCache* cache = new MediaPreviewCache;
    return *cache;
}

bool MediaPreviewCache::failedRecently(const QString& key) const {
    const auto it = m_failedAtMs.constFind(key);
    return it != m_failedAtMs.constEnd() && nowMs() - it.value() < FAILURE_RETRY_MS;
}

void MediaPreviewCache::subscribe(const std::shared_ptr<Job>& job, const QObject* subscriber) {
    if (!subscriber) return;
    job->subscribers.insert(subscriber);
    if (!m_watched.contains(subscriber)) {
        m_watched.insert(subscriber, connect(subscriber, &QObject::destroyed, this,
                                             [this, subscriber]() { unsubscribe(subscriber); }));
    }
}

void MediaPreviewCache::unsubscribe(const QObject* subscriber) {
    if (const auto it = m_watched.find(subscriber); it != m_watched.end()) {
        disconnect(it.value());
        m_watched.erase(it);
    }
    for (auto it = m_jobs.begin(); it != m_jobs.end();) {
        Job& job = *it.value();
        if (job.subscribers.remove(subscriber) && job.subscribers.isEmpty()) {
            // Nobody waits for it: a queued job never starts its decode, a
            // running one stops at its next packet.
            job.cancel = true;
            ++m_cancelled;
            it = m_jobs.erase(it);
        } else {
            ++it;
        }
    }
}

void MediaPreviewCache::start(const QString& key, const QString& path, const QString& kind, const QString& version,
                              const QObject* subscriber) {
    auto job = std::make_shared<Job>();
    job->key = key;
    job->path = path;
    job->kind = kind;
    job->version = version;
    job->openTimeoutMs = m_openTimeoutMs;
    subscribe(job, subscriber);
    m_jobs.insert(key, job);
    ++m_decodes;
    QPointer<MediaPreviewCache> self(this);
    decodePool().start([self, job]() {
        std::shared_ptr<const AudioPeaks> peaks;
        std::shared_ptr<const ThumbnailSet> thumbs;
        if (!job->cancel) {
            if (QThread::currentThread() == qApp->thread() && self) ++self->m_guiThreadDecodes;
            if (job->kind == u"peaks") {
                peaks = computeAudioPeaks(job->path, FULL_ASSET_PEAK_COUNT, &job->cancel, job->openTimeoutMs);
            } else {
                // The atlas is built here too, once per file version.
                thumbs = makeThumbnailSet(job->kind == u"image"
                                              ? loadImageThumbnail(job->path, 2 * THUMBNAIL_WIDTH_PX, &job->cancel, job->openTimeoutMs)
                                              : extractThumbnails(job->path, THUMBNAIL_COUNT, THUMBNAIL_WIDTH_PX,
                                                                  &job->cancel, job->openTimeoutMs));
            }
        }
        QMetaObject::invokeMethod(qApp, [self, job, peaks, thumbs]() {
            if (self) self->finish(job, peaks, thumbs);
        });
    });
}

void MediaPreviewCache::finish(const std::shared_ptr<Job>& job, std::shared_ptr<const AudioPeaks> peaks,
                               std::shared_ptr<const ThumbnailSet> thumbs) {
    // Dropped (nobody waited, or a clear) while it ran.
    if (m_jobs.value(job->key) != job) return;
    m_jobs.remove(job->key);
    const bool isPeaks = job->kind == u"peaks";
    // The file changed while it decoded: this result is of no version the
    // file has now. The items ask again and get the new one decoded.
    if (mediaVersionKey(job->path) == job->version) {
        const bool ok = isPeaks ? peaks != nullptr : thumbs && !thumbs->thumbs.empty();
        if (!ok) {
            m_failedAtMs.insert(job->key, nowMs());
        } else if (isPeaks) {
            m_peaks.insert(job->key, peaks);
        } else {
            m_thumbs.insert(job->key, thumbs);
            m_thumbLru.remove(job->key);
            m_thumbLru.push_front(job->key);
            // Keep the 32 most recently used files.
            while (static_cast<int>(m_thumbLru.size()) > MAX_THUMB_ENTRIES) {
                m_thumbs.remove(m_thumbLru.back());
                m_thumbLru.pop_back();
            }
        }
    }
    if (isPeaks) {
        emit peaksReady(job->path);
    } else {
        emit thumbnailsReady(job->path);
    }
}

std::shared_ptr<const AudioPeaks> MediaPreviewCache::peaks(const QString& path, const QObject* subscriber) {
    if (path.isEmpty()) return nullptr;
    const QString version = mediaVersionKey(path);
    const QString key = QStringLiteral("peaks|") + version;
    if (const auto it = m_peaks.constFind(key); it != m_peaks.constEnd()) return it.value();
    if (const auto job = m_jobs.value(key)) {
        subscribe(job, subscriber);
        return nullptr;
    }
    if (!failedRecently(key)) start(key, path, QStringLiteral("peaks"), version, subscriber);
    return nullptr;
}

std::shared_ptr<const ThumbnailSet> MediaPreviewCache::thumbnails(const QString& path, const QString& kind,
                                                                  const QObject* subscriber) {
    if (path.isEmpty()) return nullptr;
    const QString version = mediaVersionKey(path);
    const QString key = kind + u'|' + version;
    if (const auto it = m_thumbs.constFind(key); it != m_thumbs.constEnd()) {
        m_thumbLru.remove(key);
        m_thumbLru.push_front(key);
        return it.value();
    }
    if (const auto job = m_jobs.value(key)) {
        subscribe(job, subscriber);
        return nullptr;
    }
    if (!failedRecently(key)) start(key, path, kind, version, subscriber);
    return nullptr;
}

void MediaPreviewCache::clear() {
    for (const auto& job : std::as_const(m_jobs)) job->cancel = true;
    m_jobs.clear();
    waitForIdle();
    QCoreApplication::processEvents();  // the dropped jobs' completions
    m_peaks.clear();
    m_thumbs.clear();
    m_thumbLru.clear();
    m_failedAtMs.clear();
    m_cancelled = 0;
}

void MediaPreviewCache::setOpenTimeoutMs(int ms) {
    m_openTimeoutMs = ms < 0 ? OPEN_TIMEOUT_MS : ms;
}

void MediaPreviewCache::waitForIdle() {
    decodePool().waitForDone();
}

// ── Filmstrip textures ──

namespace {

class TextureCache {
public:
    static TextureCache* of(QQuickWindow* window) {
        QMutexLocker guard(&registryLock());
        if (TextureCache* cache = registry().value(window)) return cache;
        auto* cache = new TextureCache(window);
        registry().insert(window, cache);
        // Direct: these run on the scene graph's thread.
        QObject::connect(window, &QQuickWindow::beforeSynchronizing, window, [cache]() { cache->trim(); },
                         Qt::DirectConnection);
        QObject::connect(window, &QQuickWindow::sceneGraphInvalidated, window, [cache]() { cache->clear(); },
                         Qt::DirectConnection);
        QObject::connect(window, &QObject::destroyed, [window]() {
            QMutexLocker inner(&registryLock());
            delete registry().take(window);
        });
        return cache;
    }
    static TextureCache* existing(QQuickWindow* window) {
        QMutexLocker guard(&registryLock());
        return registry().value(window);
    }

    // The texture of `image`, with one more user, and the generation that
    // user is counted in. Scene graph thread.
    QSGTexture* acquire(const QImage& image, bool repeat, quint64* generation) {
        QMutexLocker guard(&m_lock);
        *generation = m_generation;
        const qint64 key = image.cacheKey();
        Entry& e = m_entries[key];
        if (!e.texture) {
            e.texture = m_window->createTextureFromImage(
                image, repeat ? QQuickWindow::CreateTextureOptions() : QQuickWindow::TextureCanUseAtlas);
            if (!e.texture) {
                m_entries.remove(key);
                return nullptr;
            }
            e.texture->setFiltering(QSGTexture::Linear);
            if (repeat) {
                e.texture->setHorizontalWrapMode(QSGTexture::Repeat);
                e.texture->setVerticalWrapMode(QSGTexture::Repeat);
            }
            e.bytes = qint64(image.width()) * image.height() * 4;
        }
        ++e.users;
        e.lastUse = ++m_clock;
        return e.texture;
    }
    // One user fewer, counted in `generation`. A user of a generation the
    // scene graph has since invalidated was dropped with the textures: its
    // release would take a user of the new graph's texture. Any thread; the
    // texture stays until a trim.
    void release(qint64 key, quint64 generation) {
        QMutexLocker guard(&m_lock);
        if (generation != m_generation) return;
        const auto it = m_entries.find(key);
        if (it != m_entries.end() && it->users > 0) --it->users;
    }
    void setBudget(qint64 bytes) {
        QMutexLocker guard(&m_lock);
        m_budget = bytes;
    }
    FilmstripTextureStats stats() {
        QMutexLocker guard(&m_lock);
        FilmstripTextureStats st;
        for (const Entry& e : std::as_const(m_entries)) {
            ++st.textures;
            if (e.users == 0) ++st.unused;
            st.bytes += e.bytes;
        }
        return st;
    }

private:
    struct Entry {
        QSGTexture* texture = nullptr;
        int users = 0;
        qint64 bytes = 0;
        quint64 lastUse = 0;
    };
    explicit TextureCache(QQuickWindow* window) : m_window(window) {}
    ~TextureCache() { clear(); }
    static QMutex& registryLock() {
        static QMutex lock;
        return lock;
    }
    static QHash<QQuickWindow*, TextureCache*>& registry() {
        static QHash<QQuickWindow*, TextureCache*> caches;
        return caches;
    }
    // Frees the least recently used unused textures until the unused ones
    // fit the budget. Scene graph thread, before the sync: no node that
    // draws this frame holds a texture with no user.
    void trim() {
        QMutexLocker guard(&m_lock);
        qint64 unused = 0;
        std::vector<std::pair<quint64, qint64>> candidates;
        for (auto it = m_entries.cbegin(); it != m_entries.cend(); ++it) {
            if (it->users > 0) continue;
            unused += it->bytes;
            candidates.emplace_back(it->lastUse, it.key());
        }
        if (unused <= m_budget) return;
        std::sort(candidates.begin(), candidates.end());
        for (const auto& [use, key] : candidates) {
            if (unused <= m_budget) break;
            Entry e = m_entries.take(key);
            unused -= e.bytes;
            delete e.texture;
        }
    }
    void clear() {
        QMutexLocker guard(&m_lock);
        for (const Entry& e : std::as_const(m_entries)) delete e.texture;
        m_entries.clear();
        ++m_generation;
    }

    QQuickWindow* m_window;
    QMutex m_lock;
    QHash<qint64, Entry> m_entries;
    qint64 m_budget = qint64(64) << 20;
    quint64 m_clock = 0;
    quint64 m_generation = 0;  // advanced by each clear (scene graph invalidation)
};

}  // namespace

FilmstripTextureStats filmstripTextureStats(QQuickWindow* window) {
    TextureCache* cache = TextureCache::existing(window);
    return cache ? cache->stats() : FilmstripTextureStats{};
}

void setFilmstripTextureBudget(QQuickWindow* window, qint64 bytes) {
    TextureCache::of(window)->setBudget(bytes);
}

}  // namespace nt::ui

// ── ClipPictureItem ──

using nt::ui::MediaPreviewCache;

ClipPictureItem::ClipPictureItem(QQuickItem* parent) : QQuickItem(parent) {
    setFlag(ItemHasContents, true);
    connect(this, &QQuickItem::widthChanged, this, [this]() { invalidate(); });
    connect(this, &QQuickItem::heightChanged, this, [this]() { invalidate(); });
}

ClipPictureItem::~ClipPictureItem() {
    MediaPreviewCache::instance().unsubscribe(this);
}

void ClipPictureItem::invalidate() {
    m_dirty = true;
    update();
}

void ClipPictureItem::setSource(const QString& s) {
    if (s == m_source) return;
    MediaPreviewCache::instance().unsubscribe(this);
    m_source = s;
    emit changed();
    fetch();
}

void ClipPictureItem::setInPointMs(double v) {
    if (v == m_in) return;
    m_in = v;
    emit changed();
    invalidate();
}

void ClipPictureItem::setOutPointMs(double v) {
    if (v == m_out) return;
    m_out = v;
    emit changed();
    invalidate();
}

void ClipPictureItem::setContentX(double v) {
    if (v == m_contentX) return;
    m_contentX = v;
    emit changed();
    onViewMoved();
}

void ClipPictureItem::setViewState(TimelineViewState* v) {
    if (v == m_view) return;
    if (m_view) disconnect(m_view, nullptr, this, nullptr);
    m_view = v;
    if (m_view) {
        connect(m_view, &TimelineViewState::scrollLeftPxChanged, this, &ClipPictureItem::onViewMoved);
        connect(m_view, &TimelineViewState::viewportChanged, this, &ClipPictureItem::onViewMoved);
    }
    emit changed();
    invalidate();
}

ClipPictureItem::Span ClipPictureItem::visibleSpan() const {
    if (!m_view || m_view->viewportWidthPx() <= 0) return {0, width()};
    const double from = m_view->scrollLeftPx() - m_contentX;
    return {std::max(0.0, from), std::min(width(), from + m_view->viewportWidthPx())};
}

ClipPictureItem::Span ClipPictureItem::drawSpan() const {
    const Span vis = visibleSpan();
    const double margin = m_view ? m_view->viewportWidthPx() : 0;
    if (vis.to < vis.from) return vis;  // off the view: nothing
    return {std::max(0.0, vis.from - margin), std::min(width(), vis.to + margin)};
}

void ClipPictureItem::onViewMoved() {
    const Span vis = visibleSpan();
    if (vis.to <= vis.from) return;  // not in view: keep what was drawn
    const bool empty = m_drawn.to < m_drawn.from;
    if (empty || vis.from < m_drawn.from - 0.5 || vis.to > m_drawn.to + 0.5) invalidate();
}

// ── WaveformItem ──

WaveformItem::WaveformItem(QQuickItem* parent) : ClipPictureItem(parent) {
    connect(&MediaPreviewCache::instance(), &MediaPreviewCache::peaksReady, this, [this](const QString& path) {
        if (path == m_source) fetch();
    });
}

void WaveformItem::fetch() {
    const bool was = m_peaks != nullptr;
    const auto next = MediaPreviewCache::instance().peaks(m_source, this);
    const bool changedResult = next != m_peaks;
    m_peaks = next;
    if (was != (m_peaks != nullptr) || changedResult) emit loadedChanged();
    invalidate();
}

void WaveformItem::setColor(const QColor& c) {
    if (c == m_color) return;
    m_color = c;
    emit changed();
    invalidate();
}

std::vector<QRectF> WaveformItem::computeBars(Span span) const {
    std::vector<QRectF> bars;
    if (!m_peaks || m_peaks->durationMs <= 0 || span.to <= span.from) return bars;
    const int cssWidth = std::max(1, static_cast<int>(std::floor(width())));
    const double cssHeight = height() > 0 ? height() : 32;
    // The visible window: [in, out] cut to the source; past the source end
    // is empty space, not a stretched waveform.
    const double dur = m_peaks->durationMs;
    const double visibleIn = std::max(0.0, std::min(dur, m_in));
    const double visibleOut = std::max(visibleIn, std::min(dur, m_out));
    const double clipSpan = std::max(1.0, m_out - m_in);
    const double visibleWidth = cssWidth * ((visibleOut - visibleIn) / clipSpan);
    if (visibleWidth <= 0) return bars;
    const int count = std::max(1, static_cast<int>(std::floor(visibleWidth / 2)));
    const double mid = cssHeight / 2;
    const double w = std::max(1.0, visibleWidth / count - 0.5);
    // Only the bars that cross the span, on the whole clip's bar grid.
    const int first = std::max(0, static_cast<int>(std::floor(span.from / visibleWidth * count)) - 1);
    const int last = std::min(count, static_cast<int>(std::ceil(span.to / visibleWidth * count)) + 1);
    bars.reserve(static_cast<size_t>(std::max(0, last - first)));
    for (int i = first; i < last; ++i) {
        const float peak = nt::ui::samplePeakAt(m_peaks->peaks, dur, visibleIn, visibleOut, count, i);
        const double h = std::max(1.0, peak * (cssHeight - 2));
        bars.emplace_back(double(i) / count * visibleWidth, mid - h / 2, w, h);
    }
    return bars;
}

QVariantList WaveformItem::barRects() const {
    QVariantList out;
    for (const QRectF& r : m_bars) out.append(r);
    return out;
}

QSGNode* WaveformItem::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    auto* node = static_cast<QSGGeometryNode*>(old);
    if (!m_dirty && node) return node;
    m_dirty = false;
    ++m_paintCount;
    m_drawn = drawSpan();
    m_bars = computeBars(m_drawn);
    m_barCount = static_cast<int>(m_bars.size());
    if (!node) {
        node = new QSGGeometryNode;
        auto* geometry = new QSGGeometry(QSGGeometry::defaultAttributes_Point2D(), 0);
        geometry->setDrawingMode(QSGGeometry::DrawTriangles);
        node->setGeometry(geometry);
        node->setFlag(QSGNode::OwnsGeometry);
        node->setMaterial(new QSGFlatColorMaterial);
        node->setFlag(QSGNode::OwnsMaterial);
    }
    auto* material = static_cast<QSGFlatColorMaterial*>(node->material());
    if (material->color() != m_color) {
        material->setColor(m_color);
        node->markDirty(QSGNode::DirtyMaterial);
    }
    QSGGeometry* geometry = node->geometry();
    geometry->allocate(static_cast<int>(m_bars.size()) * 6);
    QSGGeometry::Point2D* v = geometry->vertexDataAsPoint2D();
    for (const QRectF& r : m_bars) {
        const float x0 = float(r.left()), x1 = float(r.right()), y0 = float(r.top()), y1 = float(r.bottom());
        v[0].set(x0, y0);
        v[1].set(x1, y0);
        v[2].set(x0, y1);
        v[3].set(x1, y0);
        v[4].set(x1, y1);
        v[5].set(x0, y1);
        v += 6;
    }
    node->markDirty(QSGNode::DirtyGeometry);
    QMetaObject::invokeMethod(this, &WaveformItem::painted, Qt::QueuedConnection);
    return node;
}

// ── FilmstripItem ──

namespace {

// The source rect of `cover` for a cell of `cell` size over a `src` image.
QRectF coverSource(const QRectF& src, const QSizeF& cell) {
    if (cell.width() <= 0 || cell.height() <= 0) return src;
    const double scale = std::max(cell.width() / src.width(), cell.height() / src.height());
    const double sw = cell.width() / scale;
    const double sh = cell.height() / scale;
    return QRectF(src.x() + (src.width() - sw) / 2, src.y() + (src.height() - sh) / 2, sw, sh);
}

// One period of the 135deg stripes: 3 px of `color` every 8 px across the
// stripes, which repeats every 8 x sqrt(2) px along x and y.
QImage stripeTile(const QColor& color) {
    const int p = static_cast<int>(std::lround(8 * std::sqrt(2.0)));
    QImage tile(p, p, QImage::Format_ARGB32_Premultiplied);
    tile.fill(Qt::transparent);
    QPainter painter(&tile);
    painter.setRenderHint(QPainter::Antialiasing, true);
    QPen pen(color);
    pen.setWidthF(3.0);
    painter.setPen(pen);
    for (int k = -1; k <= 1; ++k) painter.drawLine(QPointF(k * p, p), QPointF(k * p + p, 0));
    return tile;
}

// One tile per colour, shared, so its texture is shared too.
const QImage& sharedStripeTile(const QColor& color) {
    static QMutex lock;
    static QHash<QRgb, QImage> tiles;
    QMutexLocker guard(&lock);
    QImage& tile = tiles[color.rgba()];
    if (tile.isNull()) tile = stripeTile(color);
    return tile;
}

}  // namespace

FilmstripItem::FilmstripItem(QQuickItem* parent) : ClipPictureItem(parent) {
    connect(&MediaPreviewCache::instance(), &MediaPreviewCache::thumbnailsReady, this, [this](const QString& path) {
        if (path == m_source) fetch();
    });
}

FilmstripItem::~FilmstripItem() {
    releaseTextures();
}

void FilmstripItem::releaseTextures() {
    if (auto* cache = m_textureWindow ? nt::ui::TextureCache::existing(m_textureWindow) : nullptr) {
        for (qint64 key : std::as_const(m_textureKeys)) cache->release(key, m_textureGeneration);
    }
    m_textureKeys.clear();
}

void FilmstripItem::releaseResources() {
    releaseTextures();
    m_dirty = true;
}

void FilmstripItem::fetch() {
    const bool was = m_thumbs != nullptr;
    const auto next = MediaPreviewCache::instance().thumbnails(m_source, m_kind, this);
    const bool changedResult = next != m_thumbs;
    m_thumbs = next;
    if (was != (m_thumbs != nullptr) || changedResult) emit loadedChanged();
    invalidate();
}

void FilmstripItem::setKind(const QString& k) {
    if (k == m_kind) return;
    MediaPreviewCache::instance().unsubscribe(this);
    m_kind = k;
    emit changed();
    fetch();
}

void FilmstripItem::setClipWidthPx(double v) {
    if (v == m_clipWidth) return;
    m_clipWidth = v;
    emit changed();
    invalidate();
}

void FilmstripItem::setStripeColor(const QColor& c) {
    if (c == m_stripe) return;
    m_stripe = c;
    emit changed();
    invalidate();
}

QVariantList FilmstripItem::cellThumbnails() const {
    QVariantList out;
    if (!m_thumbs || m_kind == u"image") return out;
    const int cells = std::max(1, static_cast<int>(std::floor(m_clipWidth / nt::ui::FILMSTRIP_CELL_PX)));
    for (int i : nt::ui::selectFilmstripCells(m_thumbs->thumbs, cells, m_in, m_out)) out.append(i);
    return out;
}

QVariantList FilmstripItem::cellRects() const {
    QVariantList out;
    for (const QRectF& r : m_cellRects) out.append(r);
    return out;
}

QSGNode* FilmstripItem::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    if (!m_dirty && old) return old;
    m_dirty = false;
    ++m_paintCount;
    delete old;
    m_cellCount = 0;
    m_drawnCells = 0;
    m_cellRects.clear();
    m_stripedFraction = 0;
    m_drawn = drawSpan();
    QMetaObject::invokeMethod(this, &FilmstripItem::painted, Qt::QueuedConnection);
    // The textures of the new node are taken before the old ones are let go,
    // so one the two share is never unused in between.
    const QList<qint64> previous = m_textureKeys;
    const quint64 previousGeneration = m_textureGeneration;
    QPointer<QQuickWindow> previousWindow = m_textureWindow;
    m_textureKeys.clear();
    m_textureWindow = window();
    const auto done = [&](QSGNode* node) {
        if (auto* cache = previousWindow ? nt::ui::TextureCache::existing(previousWindow) : nullptr) {
            for (qint64 key : previous) cache->release(key, previousGeneration);
        }
        return node;
    };
    if (!m_thumbs || m_thumbs->thumbs.empty() || m_thumbs->atlas.isNull() || !window() ||
        m_drawn.to <= m_drawn.from) {
        return done(nullptr);
    }
    auto* cache = nt::ui::TextureCache::of(window());
    QSGTexture* texture = cache->acquire(m_thumbs->atlas, false, &m_textureGeneration);
    if (!texture) return done(nullptr);
    m_textureKeys.append(m_thumbs->atlas.cacheKey());

    auto* root = new QSGOpacityNode;
    root->setOpacity(0.78);
    const double w = width();
    const double h = height();
    const QSizeF thumbSize = m_thumbs->thumbSize;
    const auto addCell = [&](const QRectF& rect, int index) {
        auto* node = new QSGSimpleTextureNode;
        node->setTexture(texture);
        node->setFiltering(QSGTexture::Linear);
        node->setRect(rect);
        m_cellRects.push_back(rect);
        node->setSourceRect(coverSource(QRectF(index * thumbSize.width(), 0, thumbSize.width(), thumbSize.height()),
                                        rect.size()));
        root->appendChildNode(node);
    };
    if (m_kind == u"image") {
        addCell(QRectF(0, 0, w, h), 0);
        m_cellCount = 1;
        m_drawnCells = 1;
        return done(root);
    }
    const int cells = std::max(1, static_cast<int>(std::floor(m_clipWidth / nt::ui::FILMSTRIP_CELL_PX)));
    const double gap = 2;  // display flex, gap 2 px: equal cells
    const double cellWidth = (w - gap * (cells - 1)) / cells;
    m_cellCount = cells;
    if (cellWidth > 0) {
        // Only the cells that cross the drawn span.
        const double pitch = cellWidth + gap;
        const int first = std::max(0, static_cast<int>(std::floor(m_drawn.from / pitch)));
        const int last = std::min(cells, static_cast<int>(std::ceil(m_drawn.to / pitch)) + 1);
        for (int i = first; i < last; ++i) {
            const int pick = nt::ui::filmstripCellAt(m_thumbs->thumbs, cells, m_in, m_out, i);
            addCell(QRectF(i * pitch, 0, cellWidth, h), pick);
            ++m_drawnCells;
        }
    }

    // The tail past the source end, once a cell wide, cut to the drawn span.
    const double fraction = nt::ui::beyondSourceFraction(m_thumbs->thumbs, m_in, m_out);
    if (fraction * m_clipWidth >= nt::ui::FILMSTRIP_CELL_PX && m_stripe.isValid()) {
        const double tailFrom = std::max(w - fraction * w, m_drawn.from);
        const double tailTo = std::min(w, m_drawn.to);
        const QImage& tile = sharedStripeTile(m_stripe);
        QSGTexture* stripes = tailTo > tailFrom ? cache->acquire(tile, true, &m_textureGeneration) : nullptr;
        if (stripes) {
            m_textureKeys.append(tile.cacheKey());
            auto* node = new QSGSimpleTextureNode;
            node->setTexture(stripes);
            node->setRect(QRectF(tailFrom, 0, tailTo - tailFrom, h));
            node->setSourceRect(QRectF(tailFrom, 0, tailTo - tailFrom, h));
            // The stripes are opaque to the cells' 78 %: not under the
            // opacity node.
            auto* group = new QSGNode;
            group->appendChildNode(root);
            group->appendChildNode(node);
            m_stripedFraction = fraction;
            return done(group);
        }
    }
    return done(root);
}
