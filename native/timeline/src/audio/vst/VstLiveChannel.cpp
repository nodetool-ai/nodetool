#include "audio/vst/VstLiveChannel.h"

#include <QDir>
#include <QUuid>

#include <algorithm>
#include <chrono>
#include <thread>
#include <cstring>

#ifndef Q_OS_WIN
#include <cerrno>
#include <fcntl.h>
#include <poll.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#endif

namespace nt::audio::vst {
namespace {

#ifndef Q_OS_WIN
class ScopedFd {
public:
    ScopedFd() = default;
    explicit ScopedFd(int fd) : fd_(fd) {}
    ~ScopedFd() { reset(); }
    ScopedFd(const ScopedFd&) = delete;
    ScopedFd& operator=(const ScopedFd&) = delete;
    int get() const noexcept { return fd_; }
    bool valid() const noexcept { return fd_ >= 0; }
    int release() noexcept {
        const int fd = fd_;
        fd_ = -1;
        return fd;
    }
    void reset(int fd = -1) noexcept {
        if (fd_ >= 0) ::close(fd_);
        fd_ = fd;
    }
private:
    int fd_ = -1;
};

bool writeByte(int fd, std::uint8_t value) noexcept {
#ifdef MSG_NOSIGNAL
    constexpr int kFlags = MSG_NOSIGNAL;
#else
    constexpr int kFlags = 0;
#endif
    ssize_t n = 0;
    do {
        n = ::send(fd, &value, 1, kFlags);
    } while (n < 0 && errno == EINTR);
    return n == 1;
}

bool readByteWithTimeout(int fd, std::uint8_t* value, int timeoutMs) noexcept {
    pollfd pfd{};
    pfd.fd = fd;
    pfd.events = POLLIN;
    int pr = 0;
    do {
        pr = ::poll(&pfd, 1, timeoutMs);
    } while (pr < 0 && errno == EINTR);
    if (pr <= 0) return false;
    if (pfd.revents & (POLLERR | POLLNVAL)) return false;
    if (!(pfd.revents & POLLIN)) return false;
    ssize_t n = 0;
    do {
        n = ::read(fd, value, 1);
    } while (n < 0 && errno == EINTR);
    return n == 1;
}
#endif

}  // namespace

VstLiveChannel::~VstLiveChannel() { close(nullptr); }

QString VstLiveChannel::appliedState() const {
    std::lock_guard<std::mutex> lock(m_stateMutex);
    return m_appliedState;
}

void VstLiveChannel::setAppliedState(const QString& state) {
    std::lock_guard<std::mutex> lock(m_stateMutex);
    m_appliedState = state;
}

std::shared_ptr<VstLiveChannel> VstLiveChannel::open(VstHostClient& client, const QString& instance,
                                                     const QString& path, const QString& uid, const QString& state,
                                                     double sampleRate, QString* error) {
#ifdef Q_OS_WIN
    if (error) *error = QStringLiteral("Live shared-memory VST hosting is not supported on Windows yet");
    return nullptr;
#else
    if (!client.available()) {
        if (error) *error = client.unavailableReason();
        return nullptr;
    }
    const QString tag = QUuid::createUuid().toString(QUuid::Id128).left(16);
    const QString shmPath = QDir::temp().filePath(QStringLiteral("ntv-shm-%1.bin").arg(tag));
    // Keep Unix domain socket path short (macOS sun_path max is 104 bytes).
    const QString sockPath = QStringLiteral("/tmp/ntv-%1.sock").arg(tag);

    // 1. Create and mmap shared-memory buffer.
    ScopedFd shmFd(::open(shmPath.toUtf8().constData(), O_CREAT | O_RDWR | O_EXCL, 0600));
    if (!shmFd.valid()) {
        if (error) *error = QStringLiteral("Failed to create VST shared memory file");
        return nullptr;
    }
    if (::ftruncate(shmFd.get(), static_cast<off_t>(sizeof(vsthost::ShmBuffer))) != 0) {
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("Failed to size VST shared memory file");
        return nullptr;
    }
    void* raw = ::mmap(nullptr, sizeof(vsthost::ShmBuffer), PROT_READ | PROT_WRITE, MAP_SHARED, shmFd.get(), 0);
    if (raw == MAP_FAILED) {
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("Failed to mmap VST shared memory");
        return nullptr;
    }
    auto* shm = static_cast<vsthost::ShmBuffer*>(raw);
    std::memset(shm, 0, sizeof(vsthost::ShmBuffer));
    shm->header.magic = vsthost::kShmMagic;
    shm->header.version = vsthost::kShmVersion;
    shm->header.maxFrames = vsthost::kShmMaxFrames;
    shm->header.requestSeq.store(0, std::memory_order_relaxed);
    shm->header.responseSeq.store(0, std::memory_order_relaxed);

    // 2. Bind and listen on AF_UNIX socket before asking host to connect.
    ScopedFd listenFd(::socket(AF_UNIX, SOCK_STREAM, 0));
    if (!listenFd.valid()) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("Failed to create VST unix socket");
        return nullptr;
    }
    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    const QByteArray sockUtf8 = sockPath.toUtf8();
    if (static_cast<std::size_t>(sockUtf8.size()) >= sizeof(addr.sun_path)) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("VST unix socket path too long");
        return nullptr;
    }
    ::unlink(sockUtf8.constData());
    std::memcpy(addr.sun_path, sockUtf8.constData(), static_cast<std::size_t>(sockUtf8.size()) + 1);
    if (::bind(listenFd.get(), reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0 ||
        ::listen(listenFd.get(), 1) != 0) {
        ::unlink(sockUtf8.constData());
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("Failed to listen on VST unix socket");
        return nullptr;
    }

    // 3. Tell NodeToolVstHost to load/prepare the instance, map shm, and connect to sockPath.
    int latency = 0;
    const std::uint64_t epoch = client.hostEpoch();
    const bool opened = client.openLive(instance, path, uid, state, sampleRate,
                                        static_cast<int>(vsthost::kShmMaxFrames), shmPath, sockPath, &latency, error);
    // Unlink both paths right away: the kernel keeps both alive until all open fds/mmaps close.
    ::unlink(sockUtf8.constData());
    ::unlink(shmPath.toUtf8().constData());
    if (!opened) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        return nullptr;
    }

    // 4. Accept the already-connected host peer from the backlog.
    pollfd pfd{};
    pfd.fd = listenFd.get();
    pfd.events = POLLIN;
    int pr = 0;
    do {
        pr = ::poll(&pfd, 1, 2000);
    } while (pr < 0 && errno == EINTR);
    if (pr <= 0) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        client.closeLiveAsync(instance);
        if (error) *error = QStringLiteral("Timed out accepting VST live audio socket");
        return nullptr;
    }
    ScopedFd peerFd(::accept(listenFd.get(), nullptr, nullptr));
    if (!peerFd.valid()) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        client.closeLiveAsync(instance);
        if (error) *error = QStringLiteral("Failed to accept VST live audio socket");
        return nullptr;
    }
#ifdef Q_OS_MAC
    int noSigPipe = 1;
    ::setsockopt(peerFd.get(), SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));
#endif

    // Shared ownership: returned to both VstLivePool and active MixPlan BlockProcessors.
    auto channel = std::make_shared<VstLiveChannel>(PrivateTag{});
    channel->m_shm = shm;
    channel->m_sockFd = peerFd.release();
    channel->m_epoch = epoch;
    channel->m_client = &client;
    channel->m_preparedRate.store(sampleRate, std::memory_order_release);
    channel->m_instance = instance;
    channel->m_path = path;
    channel->m_uid = uid;
    channel->m_appliedState = state;
    channel->m_latencySamples.store(latency, std::memory_order_release);
    channel->m_connected.store(true, std::memory_order_release);
    return channel;
#endif
}

bool VstLiveChannel::processBlock(std::span<float> stereo, std::span<const vsthost::ShmMidiEvent> midiEvents,
                                  double sampleRate, bool reset, int timeoutMs) noexcept {
#ifdef Q_OS_WIN
    (void)stereo; (void)midiEvents; (void)sampleRate; (void)reset; (void)timeoutMs;
    return false;
#else
    // m_shm and m_sockFd are only read after the busy flag is held: close() takes the flag
    // before it releases them.
    if (!m_connected.load(std::memory_order_acquire)) return false;
    const std::size_t frames = stereo.size() / 2;
    if (frames == 0 || frames > vsthost::kShmMaxFrames) return false;

    // Non-blocking guard: if another thread (e.g. concurrent offline export) is
    // momentarily mid-exchange, never stall the real-time audio callback.
    if (m_busy.test_and_set(std::memory_order_acquire)) return false;
    struct BusyGuard {
        explicit BusyGuard(std::atomic_flag& busy) : flag(busy) {}
        BusyGuard(const BusyGuard&) = delete;
        BusyGuard& operator=(const BusyGuard&) = delete;
        ~BusyGuard() { flag.clear(std::memory_order_release); }
        std::atomic_flag& flag;
    } busyGuard{m_busy};

    if (!m_connected.load(std::memory_order_acquire) || !m_shm || m_sockFd < 0) return false;

    for (std::size_t i = 0; i < frames; ++i) {
        m_shm->inLeft[i] = stereo[i * 2];
        m_shm->inRight[i] = stereo[i * 2 + 1];
    }
    const std::size_t nMidi = std::min<std::size_t>(midiEvents.size(), vsthost::kShmMaxMidiEvents);
    for (std::size_t i = 0; i < nMidi; ++i) {
        m_shm->midi[i] = midiEvents[i];
    }

    const std::uint64_t seq = ++m_seq;
    m_shm->header.sampleRate = sampleRate;
    m_shm->header.numFrames = static_cast<std::uint32_t>(frames);
    m_shm->header.numMidiEvents = static_cast<std::uint32_t>(nMidi);
    m_shm->header.flags = reset ? vsthost::kShmFlagReset : 0u;
    m_shm->header.requestSeq.store(seq, std::memory_order_release);

    if (!writeByte(m_sockFd, 1)) {
        m_connected.store(false, std::memory_order_release);
        return false;
    }
    std::uint8_t pong = 0;
    if (!readByteWithTimeout(m_sockFd, &pong, timeoutMs)) {
        m_connected.store(false, std::memory_order_release);
        return false;
    }
    if (m_shm->header.responseSeq.load(std::memory_order_acquire) != seq || m_shm->header.status != 0) {
        return false;
    }
    m_latencySamples.store(m_shm->header.latencySamples, std::memory_order_release);

    for (std::size_t i = 0; i < frames; ++i) {
        stereo[i * 2] = m_shm->outLeft[i];
        stereo[i * 2 + 1] = m_shm->outRight[i];
    }
    return true;
#endif
}

bool VstLiveChannel::prepareRate(double sampleRate, QString* error) {
    if (!m_client || !m_connected.load(std::memory_order_acquire)) return false;
    if (m_preparedRate.load(std::memory_order_acquire) == sampleRate) return true;
    int latency = 0;
    if (!m_client->prepareLive(m_instance, sampleRate, static_cast<int>(vsthost::kShmMaxFrames), &latency, error)) {
        return false;
    }
    m_latencySamples.store(latency, std::memory_order_release);
    m_preparedRate.store(sampleRate, std::memory_order_release);
    return true;
}

void VstLiveChannel::close(VstHostClient* client) {
    m_connected.store(false, std::memory_order_release);
#ifndef Q_OS_WIN
    // The audio callback holds m_busy for one exchange (25 ms at most). Taking the flag here
    // waits for it to leave processBlock. Later callbacks see m_connected false and return.
    while (m_busy.test_and_set(std::memory_order_acquire)) {
        std::this_thread::sleep_for(std::chrono::microseconds(200));
    }
    if (m_sockFd >= 0) {
        if (m_shm) {
            m_shm->header.flags = vsthost::kShmFlagClose;
            m_shm->header.requestSeq.store(++m_seq, std::memory_order_release);
            (void)writeByte(m_sockFd, 1);
        }
        ::shutdown(m_sockFd, SHUT_RDWR);
        ::close(m_sockFd);
        m_sockFd = -1;
    }
    if (m_shm) {
        ::munmap(m_shm, sizeof(vsthost::ShmBuffer));
        m_shm = nullptr;
    }
    m_busy.clear(std::memory_order_release);
#endif
    if (client && !m_instance.isEmpty()) {
        client->closeLiveAsync(m_instance);
    }
}

VstLivePool::~VstLivePool() { evictAll(nullptr); }

std::shared_ptr<VstLiveChannel> VstLivePool::acquire(VstHostClient& client, const QString& instance,
                                                     const QString& path, const QString& uid, const QString& state,
                                                     double sampleRate, QString* error) {
    const std::string key = instance.toStdString();
    std::shared_ptr<VstLiveChannel> existing;
    bool editorOpen = false;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (auto it = m_channels.find(key); it != m_channels.end()) {
            existing = it->second;
        }
        if (auto eit = m_openEditors.find(key); eit != m_openEditors.end()) {
            editorOpen = eit->second;
        }
    }

    const std::uint64_t currentEpoch = client.hostEpoch();
    if (existing && existing->connected() && existing->epoch() == currentEpoch &&
        existing->path() == path && existing->uid() == uid) {
        if (!editorOpen && existing->appliedState() != state) {
            if (client.setLiveState(instance, state, error)) {
                existing->setAppliedState(state);
            }
        }
        return existing;
    }

    if (existing) {
        existing->close(&client);
    }

    auto opened = VstLiveChannel::open(client, instance, path, uid, state, sampleRate, error);
    if (!opened) return nullptr;

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_channels[key] = opened;
    }
    return opened;
}

void VstLivePool::noteStateFromEditor(const QString& instance, const QString& state) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (auto it = m_channels.find(instance.toStdString()); it != m_channels.end() && it->second) {
        it->second->setAppliedState(state);
    }
}

void VstLivePool::setEditorOpen(const QString& instance, bool open) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_openEditors[instance.toStdString()] = open;
}

void VstLivePool::evictAll(VstHostClient* client) {
    std::unordered_map<std::string, std::shared_ptr<VstLiveChannel>> old;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        old.swap(m_channels);
        m_openEditors.clear();
    }
    for (auto& [_, ch] : old) {
        if (ch) ch->close(client);
    }
}

void VstLivePool::closeInstance(const QString& instance, VstHostClient* client) {
    std::shared_ptr<VstLiveChannel> ch;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        const std::string key = instance.toStdString();
        if (auto it = m_channels.find(key); it != m_channels.end()) {
            ch = std::move(it->second);
            m_channels.erase(it);
        }
        m_openEditors.erase(key);
    }
    if (ch) ch->close(client);
}

VstLivePool& sharedVstLivePool() {
    static VstLivePool pool;
    return pool;
}

}  // namespace nt::audio::vst
