#include "audio/vst/VstLiveChannel.h"

#include <QDir>
#include <QUuid>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <thread>

#ifndef Q_OS_WIN
#include <cerrno>
#include <fcntl.h>
#include <poll.h>
#include <sys/mman.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/un.h>
#include <unistd.h>
#endif

#ifdef Q_OS_MACOS
#include <mach/mach.h>
#include <mach/thread_info.h>
#include <pthread.h>
#include <pthread/qos.h>
#include <sys/event.h>
#elif defined(__linux__)
#include <pthread.h>
#include <sched.h>
#include <time.h>
#endif

#if defined(__aarch64__) || defined(_M_ARM64)
static inline void cpuRelax() noexcept { asm volatile("yield" ::: "memory"); }
#elif defined(__x86_64__) || defined(_M_X64) || defined(__i386__)
#include <immintrin.h>
static inline void cpuRelax() noexcept { _mm_pause(); }
#else
static inline void cpuRelax() noexcept { std::this_thread::yield(); }
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
    ScopedFd(ScopedFd&& o) noexcept : fd_(o.fd_) { o.fd_ = -1; }
    ScopedFd& operator=(ScopedFd&& o) noexcept {
        if (this != &o) { reset(); fd_ = o.fd_; o.fd_ = -1; }
        return *this;
    }
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

void promoteClientAudioIpcWorkerThread() noexcept {
#ifdef Q_OS_MACOS
    // Keep the lightweight IPC relay thread at high interactive QoS rather than consuming
    // a Mach THREAD_TIME_CONSTRAINT_POLICY real-time slot per plug-in instance.
    (void)pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#elif defined(__linux__)
    sched_param sp{};
    const int maxPrio = sched_get_priority_max(SCHED_FIFO);
    if (maxPrio > 0) {
        sp.sched_priority = std::max(1, maxPrio / 4);
        (void)pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);
    }
#endif
}

struct OpenedTransport {
    vsthost::ShmBuffer* shm = nullptr;
    int sockFd = -1;
    std::uint64_t epoch = 0;
    int latency = 0;
    std::uint64_t latencyGen = 0;
    int configuredQuantum = VstLiveChannel::kDefaultRenderQuantumFrames;
};

bool openTransportSession(VstHostClient& client, const QString& instance, const QString& path,
                          const QString& uid, const QString& state, double sampleRate,
                          int renderQuantumFrames, OpenedTransport& out, QString* error) {
    if (!client.available()) {
        if (error) *error = client.unavailableReason();
        return false;
    }
    const QString tag = QUuid::createUuid().toString(QUuid::Id128).left(16);
    const QString shmPath = QDir::temp().filePath(QStringLiteral("ntv-shm-%1.bin").arg(tag));
    // Keep Unix domain socket path short (macOS sun_path max is 104 bytes).
    const QString sockPath = QStringLiteral("/tmp/ntv-%1.sock").arg(tag);

    // 1. Create and mmap shared-memory buffer.
    ScopedFd shmFd(::open(shmPath.toUtf8().constData(), O_CREAT | O_RDWR | O_EXCL, 0600));
    if (!shmFd.valid()) {
        if (error) *error = QStringLiteral("Failed to create VST shared memory file");
        return false;
    }
    if (::ftruncate(shmFd.get(), static_cast<off_t>(sizeof(vsthost::ShmBuffer))) != 0) {
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("Failed to size VST shared memory file");
        return false;
    }
    void* raw = ::mmap(nullptr, sizeof(vsthost::ShmBuffer), PROT_READ | PROT_WRITE, MAP_SHARED, shmFd.get(), 0);
    if (raw == MAP_FAILED) {
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("Failed to mmap VST shared memory");
        return false;
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
        return false;
    }
    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    const QByteArray sockUtf8 = sockPath.toUtf8();
    if (static_cast<std::size_t>(sockUtf8.size()) >= sizeof(addr.sun_path)) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("VST unix socket path too long");
        return false;
    }
    ::unlink(sockUtf8.constData());
    std::memcpy(addr.sun_path, sockUtf8.constData(), static_cast<std::size_t>(sockUtf8.size()) + 1);
    if (::bind(listenFd.get(), reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0 ||
        ::listen(listenFd.get(), 1) != 0) {
        ::unlink(sockUtf8.constData());
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        ::unlink(shmPath.toUtf8().constData());
        if (error) *error = QStringLiteral("Failed to listen on VST unix socket");
        return false;
    }

    // 3. Tell NodeToolVstHost to load/prepare the instance, map shm, and connect to sockPath.
    //    Pass the actual render quantum separately from SHM capacity so host RT scheduling
    //    uses the real period during the quiescent openLive handshake (C6).
    int latency = 0;
    std::uint64_t latencyGen = 0;
    int configuredQuantum = std::clamp(renderQuantumFrames, 16, static_cast<int>(vsthost::kShmMaxFrames));
    const std::uint64_t epoch = client.hostEpoch();
    const bool opened = client.openLive(instance, path, uid, state, sampleRate,
                                        static_cast<int>(vsthost::kShmMaxFrames), shmPath, sockPath,
                                        &latency, error, 30000, &latencyGen, configuredQuantum,
                                        &configuredQuantum);
    // Unlink both paths right away: the kernel keeps both alive until all open fds/mmaps close.
    ::unlink(sockUtf8.constData());
    ::unlink(shmPath.toUtf8().constData());
    if (!opened) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        return false;
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
        return false;
    }
    ScopedFd peerFd(::accept(listenFd.get(), nullptr, nullptr));
    if (!peerFd.valid()) {
        ::munmap(raw, sizeof(vsthost::ShmBuffer));
        client.closeLiveAsync(instance);
        if (error) *error = QStringLiteral("Failed to accept VST live audio socket");
        return false;
    }
#ifdef Q_OS_MACOS
    int noSigPipe = 1;
    ::setsockopt(peerFd.get(), SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));
#endif
    // Bound send() so a wedged peer cannot block the IPC worker indefinitely.
    timeval sndTimeout{};
    sndTimeout.tv_sec = 0;
    sndTimeout.tv_usec = 250000;
    ::setsockopt(peerFd.get(), SOL_SOCKET, SO_SNDTIMEO, &sndTimeout, sizeof(sndTimeout));

    out.shm = shm;
    out.sockFd = peerFd.release();
    out.epoch = epoch;
    out.latency = latency;
    out.latencyGen = latencyGen;
    out.configuredQuantum = configuredQuantum;
    return true;
}

bool writeByte(int fd, std::uint8_t value, bool* peerDead) noexcept {
#ifdef MSG_NOSIGNAL
    constexpr int kFlags = MSG_NOSIGNAL;
#else
    constexpr int kFlags = 0;
#endif
    ssize_t n = 0;
    do {
        n = ::send(fd, &value, 1, kFlags);
    } while (n < 0 && errno == EINTR);
    if (n == 1) return true;
    if (peerDead) {
        const int err = errno;
        *peerDead = (n == 0) || (err == EPIPE) || (err == ECONNRESET) || (err == ENOTCONN) || (err == EBADF);
    }
    return false;
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

std::int64_t VstLiveChannel::workerCpuTimeUs() noexcept {
#ifdef Q_OS_WIN
    return -1;
#else
    std::lock_guard<std::mutex> ctrlLock(m_controlMutex);
    if (m_closed.load(std::memory_order_acquire) || !m_worker.joinable()) {
        return -1;
    }
#ifdef Q_OS_MACOS
    const mach_port_t machThread = pthread_mach_thread_np(m_worker.native_handle());
    if (machThread == MACH_PORT_NULL) return -1;
    thread_basic_info_data_t info{};
    mach_msg_type_number_t count = THREAD_BASIC_INFO_COUNT;
    if (thread_info(machThread, THREAD_BASIC_INFO, reinterpret_cast<thread_info_t>(&info), &count) != KERN_SUCCESS) {
        return -1;
    }
    const std::int64_t userUs = static_cast<std::int64_t>(info.user_time.seconds) * 1000000LL + info.user_time.microseconds;
    const std::int64_t sysUs = static_cast<std::int64_t>(info.system_time.seconds) * 1000000LL + info.system_time.microseconds;
    return userUs + sysUs;
#elif defined(__linux__)
    clockid_t clockId{};
    timespec ts{};
    if (pthread_getcpuclockid(m_worker.native_handle(), &clockId) != 0 || clock_gettime(clockId, &ts) != 0) {
        return -1;
    }
    return static_cast<std::int64_t>(ts.tv_sec) * 1000000LL + static_cast<std::int64_t>(ts.tv_nsec) / 1000LL;
#else
    return -1;
#endif
#endif
}

void VstLiveChannel::setRecoveryHookForTest(std::function<void(bool afterOpen)> hook) {
    std::lock_guard<std::mutex> lock(m_stateMutex);
    m_recoveryHookForTest = std::move(hook);
    m_hasRecoveryHookForTest.store(static_cast<bool>(m_recoveryHookForTest), std::memory_order_release);
}

void VstLiveChannel::wakeWorker() noexcept {
#ifndef Q_OS_WIN
    std::lock_guard<std::mutex> lock(m_wakeMutex);
    if (m_wakeWriteFd >= 0) {
        const std::uint8_t byte = 1;
        ssize_t r = 0;
        do {
            r = ::write(m_wakeWriteFd, &byte, 1);
        } while (r < 0 && errno == EINTR);
        (void)r;
    }
#endif
}

void VstLiveChannel::drainWakePipe() noexcept {
#ifndef Q_OS_WIN
    if (m_wakeReadFd < 0) return;
    std::uint8_t buf[64];
    for (;;) {
        const ssize_t n = ::read(m_wakeReadFd, buf, sizeof(buf));
        if (n <= 0) {
            if (n < 0 && errno == EINTR) continue;
            break;
        }
    }
#endif
}

void VstLiveChannel::armForPlayback(std::chrono::milliseconds window) noexcept {
    if (m_closed.load(std::memory_order_acquire)) return;
    const auto clamped = std::clamp(window, std::chrono::milliseconds(1), std::chrono::milliseconds(2000));
    const auto deadline = std::chrono::steady_clock::now() + clamped;
    const std::int64_t targetNs =
        std::chrono::duration_cast<std::chrono::nanoseconds>(deadline.time_since_epoch()).count();
    std::int64_t prev = m_armedUntilNs.load(std::memory_order_relaxed);
    while (targetNs > prev &&
           !m_armedUntilNs.compare_exchange_weak(prev, targetNs, std::memory_order_release,
                                                  std::memory_order_relaxed)) {}
    wakeWorker();
}

void VstLiveChannel::waitWorkerIdle(std::chrono::steady_clock::time_point lastJobTime,
                                    bool& spinAfterHandoff) noexcept {
    // C3 / E2 / G1: Device callback performs a pure atomic handoff with zero kernel calls.
    // Spin ONLY once immediately after a real handoff (tight bursts / sub-block handoffs);
    // once cleared, the idle path sleeps with an adaptive interval while monitoring both
    // `m_sockFd` (for peer EOF) and `m_wakeReadFd` (so non-RT transport start / plan publish
    // interrupts deep idle immediately before callbacks begin).
    const auto now = std::chrono::steady_clock::now();
    const std::int64_t nowNs =
        std::chrono::duration_cast<std::chrono::nanoseconds>(now.time_since_epoch()).count();
    const bool armed = nowNs < m_armedUntilNs.load(std::memory_order_acquire);

    if (spinAfterHandoff) {
        spinAfterHandoff = false;
        constexpr auto kSpinBudget = std::chrono::microseconds(100);
        const auto spinStart = now;
        for (int iter = 0; ; ++iter) {
            if (hasPendingWorkerJobs() || m_stop.load(std::memory_order_acquire) ||
                m_peerDead.load(std::memory_order_acquire)) {
                return;
            }
            if ((iter & 31) == 31 && (std::chrono::steady_clock::now() - spinStart) >= kSpinBudget) {
                break;
            }
            cpuRelax();
        }
    }

    constexpr auto kActiveStreamWindow = std::chrono::milliseconds(50);
    constexpr auto kWarmIdleWindow = std::chrono::milliseconds(200);
    constexpr int kDeepIdleWaitUs = 5000;
    const int periodUs = m_callbackPeriodUs.load(std::memory_order_acquire);
    int waitUs = kDeepIdleWaitUs;
    bool activeOrArmed = false;
    if (armed) {
        waitUs = std::clamp(periodUs / 6, 100, 400);
        activeOrArmed = true;
    } else if (lastJobTime != std::chrono::steady_clock::time_point{}) {
        const auto idleFor = now - lastJobTime;
        if (idleFor < kActiveStreamWindow) {
            waitUs = std::clamp(periodUs / 6, 100, 1000);
            activeOrArmed = true;
        } else if (idleFor < kWarmIdleWindow) {
            waitUs = 2000;
        }
    }

#ifndef Q_OS_WIN
    if (m_sockFd >= 0) {
        bool sockReady = false;
#if defined(__linux__)
        pollfd pfds[2]{};
        nfds_t nfds = 1;
        pfds[0].fd = m_sockFd;
        pfds[0].events = POLLIN;
        if (m_wakeReadFd >= 0) {
            pfds[1].fd = m_wakeReadFd;
            pfds[1].events = POLLIN;
            nfds = 2;
        }
        timespec ts{};
        ts.tv_sec = 0;
        ts.tv_nsec = static_cast<long>(waitUs) * 1000L;
        const int pr = ::ppoll(pfds, nfds, &ts, nullptr);
        if (pr > 0) {
            if (nfds == 2 && (pfds[1].revents & POLLIN) != 0) {
                drainWakePipe();
            }
            if (pfds[0].revents & (POLLERR | POLLHUP | POLLNVAL)) {
                ::shutdown(m_sockFd, SHUT_RDWR);
                m_peerDead.store(true, std::memory_order_release);
                return;
            }
            sockReady = (pfds[0].revents & POLLIN) != 0;
        }
#elif defined(Q_OS_MACOS)
        if (m_kqueueFd >= 0) {
            struct kevent changes[2]{};
            int nChanges = 0;
            if (m_kqueueSockFd != m_sockFd) {
                EV_SET(&changes[nChanges++], static_cast<uintptr_t>(m_sockFd), EVFILT_READ,
                       EV_ADD, 0, 0, nullptr);
                m_kqueueSockFd = m_sockFd;
            }
            timespec ts{};
            if (activeOrArmed) {
                // Non-coalesced microsecond timer while armed/active so 64-frame/48 kHz (1.33 ms)
                // callbacks never suffer macOS select() timer-coalescing stalls.
                EV_SET(&changes[nChanges++], 1u, EVFILT_TIMER, EV_ADD | EV_ONESHOT,
                       NOTE_USECONDS | NOTE_CRITICAL, waitUs, nullptr);
                m_kqueueTimerArmed = true;
                ts.tv_sec = 0;
                ts.tv_nsec = 10'000'000L;
            } else {
                if (m_kqueueTimerArmed) {
                    EV_SET(&changes[nChanges++], 1u, EVFILT_TIMER, EV_DELETE, 0, 0, nullptr);
                    m_kqueueTimerArmed = false;
                }
                ts.tv_sec = 0;
                ts.tv_nsec = static_cast<long>(waitUs) * 1000L;
            }
            struct kevent events[4]{};
            const int kr = ::kevent(m_kqueueFd, nChanges > 0 ? changes : nullptr, nChanges,
                                    events, 4, &ts);
            if (kr > 0) {
                for (int i = 0; i < kr; ++i) {
                    if (events[i].filter == EVFILT_TIMER) {
                        m_kqueueTimerArmed = false;
                    } else if (events[i].filter == EVFILT_READ) {
                        if (m_wakeReadFd >= 0 && events[i].ident == static_cast<uintptr_t>(m_wakeReadFd)) {
                            drainWakePipe();
                        } else if (events[i].ident == static_cast<uintptr_t>(m_sockFd)) {
                            sockReady = true;
                        }
                    }
                }
            }
        } else {
            std::this_thread::sleep_for(std::chrono::microseconds(waitUs));
            drainWakePipe();
            pollfd pfd{};
            pfd.fd = m_sockFd;
            pfd.events = POLLIN;
            if (::poll(&pfd, 1, 0) > 0) {
                sockReady = true;
            }
        }
#else
        if (m_sockFd < FD_SETSIZE && m_wakeReadFd < FD_SETSIZE) {
            fd_set rfds;
            FD_ZERO(&rfds);
            FD_SET(m_sockFd, &rfds);
            int maxFd = m_sockFd;
            if (m_wakeReadFd >= 0) {
                FD_SET(m_wakeReadFd, &rfds);
                maxFd = std::max(maxFd, m_wakeReadFd);
            }
            timeval tv{};
            tv.tv_sec = 0;
            tv.tv_usec = waitUs;
            const int sr = ::select(maxFd + 1, &rfds, nullptr, nullptr, &tv);
            if (sr > 0) {
                if (m_wakeReadFd >= 0 && FD_ISSET(m_wakeReadFd, &rfds)) {
                    drainWakePipe();
                }
                if (FD_ISSET(m_sockFd, &rfds)) {
                    sockReady = true;
                }
            }
        } else {
            std::this_thread::sleep_for(std::chrono::microseconds(waitUs));
            drainWakePipe();
            pollfd pfd{};
            pfd.fd = m_sockFd;
            pfd.events = POLLIN;
            if (::poll(&pfd, 1, 0) > 0) {
                sockReady = true;
            }
        }
#endif
        if (sockReady && !m_stop.load(std::memory_order_acquire)) {
            std::uint8_t probe = 0;
            const ssize_t n = ::recv(m_sockFd, &probe, 1, MSG_PEEK | MSG_DONTWAIT);
            if (n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR)) {
                ::shutdown(m_sockFd, SHUT_RDWR);
                m_peerDead.store(true, std::memory_order_release);
            }
        }
        return;
    }
#endif
    std::this_thread::sleep_for(std::chrono::microseconds(waitUs));
}

bool VstLiveChannel::hasPendingWorkerJobs() const noexcept {
    return m_syncPending.load(std::memory_order_acquire) ||
           m_reqRead.load(std::memory_order_relaxed) < m_reqWrite.load(std::memory_order_acquire);
}

std::shared_ptr<VstLiveChannel> VstLiveChannel::open(VstHostClient& client, const QString& instance,
                                                     const QString& path, const QString& uid, const QString& state,
                                                     double sampleRate, QString* error, int renderQuantumFrames) {
#ifdef Q_OS_WIN
    (void)client; (void)instance; (void)path; (void)uid; (void)state; (void)sampleRate; (void)renderQuantumFrames;
    if (error) *error = QStringLiteral("Live shared-memory VST hosting is not supported on Windows yet");
    return nullptr;
#else
    const int targetQuantum = std::clamp(renderQuantumFrames > 0 ? renderQuantumFrames : kDefaultRenderQuantumFrames,
                                         16, static_cast<int>(vsthost::kShmMaxFrames));
    OpenedTransport transport;
    if (!openTransportSession(client, instance, path, uid, state, sampleRate, targetQuantum, transport, error)) {
        return nullptr;
    }

    // Shared ownership: returned to both VstLivePool and active MixPlan BlockProcessors.
    auto channel = std::make_shared<VstLiveChannel>(PrivateTag{});
    channel->m_shm = transport.shm;
    channel->m_sockFd = transport.sockFd;
    int wakeFds[2] = {-1, -1};
    if (::pipe(wakeFds) == 0) {
        for (int fd : wakeFds) {
            const int flags = ::fcntl(fd, F_GETFL, 0);
            if (flags >= 0) {
                (void)::fcntl(fd, F_SETFL, flags | O_NONBLOCK);
            }
            const int fdFlags = ::fcntl(fd, F_GETFD, 0);
            if (fdFlags >= 0) {
                (void)::fcntl(fd, F_SETFD, fdFlags | FD_CLOEXEC);
            }
        }
        channel->m_wakeReadFd = wakeFds[0];
        channel->m_wakeWriteFd = wakeFds[1];
    }
#ifdef Q_OS_MACOS
    const int kq = ::kqueue();
    if (kq >= 0) {
        const int fdFlags = ::fcntl(kq, F_GETFD, 0);
        if (fdFlags >= 0) {
            (void)::fcntl(kq, F_SETFD, fdFlags | FD_CLOEXEC);
        }
        channel->m_kqueueFd = kq;
        if (channel->m_wakeReadFd >= 0) {
            struct kevent wakeEv{};
            EV_SET(&wakeEv, static_cast<uintptr_t>(channel->m_wakeReadFd), EVFILT_READ,
                   EV_ADD, 0, 0, nullptr);
            (void)::kevent(kq, &wakeEv, 1, nullptr, 0, nullptr);
        }
    }
#endif
    channel->m_reqSlots = std::make_unique<AsyncRequest[]>(kQueueCapacity);
    channel->m_respSlots = std::make_unique<AsyncResponse[]>(kQueueCapacity);
    channel->m_epoch.store(transport.epoch, std::memory_order_release);
    channel->m_client = &client;
    channel->m_preparedRate.store(sampleRate, std::memory_order_release);
    channel->m_renderQuantumFrames.store(transport.configuredQuantum, std::memory_order_release);
    const double sr = (sampleRate >= 8000.0 && sampleRate <= 384000.0) ? sampleRate : 48000.0;
    const int initPeriodUs = std::clamp(static_cast<int>(std::llround(transport.configuredQuantum * 1e6 / sr)),
                                        150, 20000);
    channel->m_callbackPeriodUs.store(initPeriodUs, std::memory_order_release);
    const auto initArmedUntil = std::chrono::steady_clock::now() + kDefaultArmWindow;
    channel->m_armedUntilNs.store(
        std::chrono::duration_cast<std::chrono::nanoseconds>(initArmedUntil.time_since_epoch()).count(),
        std::memory_order_release);
    channel->m_instance = instance;
    channel->m_path = path;
    channel->m_uid = uid;
    channel->m_appliedState = state;
    channel->m_latencyState->store(packVstLatency(transport.latencyGen, transport.latency), std::memory_order_release);
    client.registerLatencyTarget(instance, channel->m_latencyState);
    channel->m_connected.store(true, std::memory_order_release);
    // Owned by VstLiveChannel; stopped and joined in close() / ~VstLiveChannel().
    channel->m_worker = std::jthread([raw = channel.get()]() { raw->workerLoop(); });
    return channel;
#endif
}

VstLiveChannel::ExchangeStatus VstLiveChannel::exchangeOnShm(const AsyncRequest& req, AsyncResponse& resp,
                                                             int timeoutMs, bool isSync) noexcept {
#ifdef Q_OS_WIN
    (void)req; (void)resp; (void)timeoutMs; (void)isSync;
    return ExchangeStatus::PeerDead;
#else
    resp.gen = req.gen;
    resp.seq = req.seq;
    resp.numFrames = req.numFrames;
    resp.ok = false;

    if (!m_shm || m_sockFd < 0 || req.numFrames == 0 || req.numFrames > vsthost::kShmMaxFrames) {
        return ExchangeStatus::PeerDead;
    }

    const std::size_t frames = req.numFrames;
    for (std::size_t i = 0; i < frames; ++i) {
        m_shm->inLeft[i] = req.stereo[i * 2];
        m_shm->inRight[i] = req.stereo[i * 2 + 1];
    }
    const std::size_t nMidi = std::min<std::size_t>(req.numMidiEvents, vsthost::kShmMaxMidiEvents);
    for (std::size_t i = 0; i < nMidi; ++i) {
        m_shm->midi[i] = req.midi[i];
    }

    const bool recoveryReset = m_recoveryResetPending.exchange(false, std::memory_order_acq_rel);
    const bool forceReset = req.reset || recoveryReset;
    const std::uint64_t seq = ++m_shmSeq;
    m_shm->header.sampleRate = req.sampleRate;
    m_shm->header.numFrames = static_cast<std::uint32_t>(frames);
    m_shm->header.numMidiEvents = static_cast<std::uint32_t>(nMidi);
    m_shm->header.flags = forceReset ? vsthost::kShmFlagReset : 0u;
    m_shm->header.requestSeq.store(seq, std::memory_order_release);

    bool deadOnWrite = false;
    if (!writeByte(m_sockFd, 1, &deadOnWrite)) {
        return deadOnWrite ? ExchangeStatus::PeerDead : ExchangeStatus::Timeout;
    }

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(std::max(1, timeoutMs));
    pollfd pfd{};
    pfd.fd = m_sockFd;
    pfd.events = POLLIN;
    for (;;) {
        if (m_stop.load(std::memory_order_acquire)) {
            return ExchangeStatus::PeerDead;
        }
        const auto now = std::chrono::steady_clock::now();
        int waitMs = 50;
        if (isSync) {
            if (now >= deadline) return ExchangeStatus::Timeout;
            const auto rem = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - now).count();
            waitMs = static_cast<int>(std::clamp<std::int64_t>(rem, 1, 50));
        } else if (now >= deadline) {
            // Even in async mode, give up after a multi-second total hang so a frozen host
            // does not pin the worker forever. Normal delays (tens/hundreds of ms) keep waiting.
            return ExchangeStatus::Timeout;
        }
        int pr = 0;
        do {
            pr = ::poll(&pfd, 1, waitMs);
        } while (pr < 0 && errno == EINTR);
        if (pr < 0) return ExchangeStatus::PeerDead;
        if (pr == 0) continue;
        if (pfd.revents & (POLLERR | POLLNVAL)) return ExchangeStatus::PeerDead;
        if (pfd.revents & POLLIN) {
            std::uint8_t pong = 0;
            ssize_t n = 0;
            do {
                n = ::read(m_sockFd, &pong, 1);
            } while (n < 0 && errno == EINTR);
            if (n <= 0) return ExchangeStatus::PeerDead;
            break;
        }
        if (pfd.revents & POLLHUP) return ExchangeStatus::PeerDead;
    }

    if (m_shm->header.responseSeq.load(std::memory_order_acquire) != seq || m_shm->header.status != 0) {
        return ExchangeStatus::BlockError;
    }
    (void)updateLatency(m_shm->header.latencySamples, m_shm->header.latencyGeneration);

    for (std::size_t i = 0; i < frames; ++i) {
        resp.stereo[i * 2] = m_shm->outLeft[i];
        resp.stereo[i * 2 + 1] = m_shm->outRight[i];
    }
    resp.ok = true;
    return ExchangeStatus::Ok;
#endif
}

void VstLiveChannel::workerLoop() {
#ifndef Q_OS_WIN
    promoteClientAudioIpcWorkerThread();
    auto lastJobTime = std::chrono::steady_clock::time_point{};
    bool spinAfterHandoff = false;
    while (!m_stop.load(std::memory_order_acquire)) {
        if (m_peerDead.load(std::memory_order_acquire)) {
            // Fail any waiting synchronous caller immediately.
            if (m_syncPending.exchange(false, std::memory_order_acq_rel)) {
                {
                    std::lock_guard<std::mutex> lk(m_syncWaitMutex);
                    m_syncResp.ok = false;
                    m_syncDone = true;
                    m_syncInFlight = false;
                }
                m_syncCv.notify_all();
            }
            // Skip queued async requests while dead so slots free up for recovery.
            std::uint64_t r = m_reqRead.load(std::memory_order_relaxed);
            const std::uint64_t w = m_reqWrite.load(std::memory_order_acquire);
            if (r < w) {
                m_reqRead.store(w, std::memory_order_release);
                m_workerSkipped.fetch_add(w - r, std::memory_order_release);
            }
            std::unique_lock<std::mutex> parkLock(m_workerParkMutex);
            m_workerParked = true;
            m_workerParkCv.notify_all();
            m_workerParkCv.wait(parkLock, [this]() {
                return m_stop.load(std::memory_order_acquire) || !m_peerDead.load(std::memory_order_acquire);
            });
            m_workerParked = false;
#ifdef Q_OS_MACOS
            m_kqueueSockFd = -1;
#endif
            lastJobTime = std::chrono::steady_clock::time_point{};
            spinAfterHandoff = false;
            continue;
        }

        if (m_syncPending.exchange(false, std::memory_order_acq_rel)) {
            const ExchangeStatus st = exchangeOnShm(m_syncReq, m_syncResp, m_syncTimeoutMs, /*isSync=*/true);
            // D1: treat Timeout identically to PeerDead so the host cannot remain mid-block on
            // the same SHM/socket pair and cause permanent framing desync or SHM data races.
            if (st == ExchangeStatus::PeerDead || st == ExchangeStatus::Timeout) {
                if (m_sockFd >= 0) {
                    ::shutdown(m_sockFd, SHUT_RDWR);
                }
                m_peerDead.store(true, std::memory_order_release);
            }
            {
                std::lock_guard<std::mutex> lk(m_syncWaitMutex);
                m_syncDone = true;
                m_syncInFlight = false;
            }
            m_syncCv.notify_all();
            lastJobTime = std::chrono::steady_clock::now();
            spinAfterHandoff = true;
            continue;
        }

        const std::uint64_t r = m_reqRead.load(std::memory_order_relaxed);
        const std::uint64_t w = m_reqWrite.load(std::memory_order_acquire);
        if (r < w) {
            const AsyncRequest& req = m_reqSlots[r & kQueueMask];
            if (req.gen < m_streamGen.load(std::memory_order_acquire)) {
                m_reqRead.store(r + 1, std::memory_order_release);
                m_workerSkipped.fetch_add(1, std::memory_order_release);
                lastJobTime = std::chrono::steady_clock::now();
                spinAfterHandoff = false;
                continue;
            }
            const std::uint64_t rw = m_respWrite.load(std::memory_order_relaxed);
            AsyncResponse& resp = m_respSlots[rw & kQueueMask];
            const ExchangeStatus st = exchangeOnShm(req, resp, /*timeoutMs=*/5000, /*isSync=*/false);
            m_reqRead.store(r + 1, std::memory_order_release);
            if (st == ExchangeStatus::PeerDead || st == ExchangeStatus::Timeout) {
                if (m_sockFd >= 0) {
                    ::shutdown(m_sockFd, SHUT_RDWR);
                }
                m_workerSkipped.fetch_add(1, std::memory_order_release);
                m_peerDead.store(true, std::memory_order_release);
                continue;
            }
            if (st != ExchangeStatus::Ok) {
                // Zero-fill errored block so consumer keeps frame count intact without disconnecting.
                std::fill_n(resp.stereo.begin(), static_cast<std::size_t>(req.numFrames) * 2, 0.0f);
                resp.ok = false;
            }
            m_respWrite.store(rw + 1, std::memory_order_release);
            lastJobTime = std::chrono::steady_clock::now();
            spinAfterHandoff = true;
            continue;
        }

        waitWorkerIdle(lastJobTime, spinAfterHandoff);
    }
    // Wake any remaining synchronous caller on shutdown.
    if (m_syncPending.exchange(false, std::memory_order_acq_rel)) {
        {
            std::lock_guard<std::mutex> lk(m_syncWaitMutex);
            m_syncResp.ok = false;
            m_syncDone = true;
            m_syncInFlight = false;
        }
        m_syncCv.notify_all();
    }
#endif
}

void VstLiveChannel::skipStaleResponses() noexcept {
    std::uint64_t rr = m_respRead.load(std::memory_order_relaxed);
    const std::uint64_t rw = m_respWrite.load(std::memory_order_acquire);
    while (rr < rw) {
        if (m_respSlots[rr & kQueueMask].gen == m_activeGen) break;
        ++rr;
        m_curRespOffset = 0;
    }
    m_respRead.store(rr, std::memory_order_release);
}

void VstLiveChannel::discardDebtFrames() noexcept {
    if (m_debtFrames == 0) return;
    std::uint64_t rr = m_respRead.load(std::memory_order_relaxed);
    const std::uint64_t rw = m_respWrite.load(std::memory_order_acquire);
    while (m_debtFrames > 0 && rr < rw) {
        const AsyncResponse& slot = m_respSlots[rr & kQueueMask];
        if (slot.gen != m_activeGen) {
            ++rr;
            m_curRespOffset = 0;
            continue;
        }
        const std::size_t rem = (m_curRespOffset < slot.numFrames) ? (slot.numFrames - m_curRespOffset) : 0;
        const std::size_t drop = std::min(rem, m_debtFrames);
        m_curRespOffset += drop;
        m_debtFrames -= drop;
        if (m_curRespOffset >= slot.numFrames) {
            ++rr;
            m_curRespOffset = 0;
        }
    }
    m_respRead.store(rr, std::memory_order_release);
}

std::size_t VstLiveChannel::availableCurrentGenFrames() const noexcept {
    std::uint64_t rr = m_respRead.load(std::memory_order_relaxed);
    const std::uint64_t rw = m_respWrite.load(std::memory_order_acquire);
    std::size_t total = 0;
    std::size_t offset = m_curRespOffset;
    while (rr < rw) {
        const AsyncResponse& slot = m_respSlots[rr & kQueueMask];
        if (slot.gen != m_activeGen) {
            ++rr;
            offset = 0;
            continue;
        }
        if (offset < slot.numFrames) {
            total += slot.numFrames - offset;
        }
        ++rr;
        offset = 0;
    }
    return total;
}

void VstLiveChannel::consumeResponseFrames(float* dstStereo, std::size_t count) noexcept {
    std::uint64_t rr = m_respRead.load(std::memory_order_relaxed);
    const std::uint64_t rw = m_respWrite.load(std::memory_order_acquire);
    std::size_t written = 0;
    while (written < count && rr < rw) {
        const AsyncResponse& slot = m_respSlots[rr & kQueueMask];
        if (slot.gen != m_activeGen) {
            ++rr;
            m_curRespOffset = 0;
            continue;
        }
        const std::size_t rem = (m_curRespOffset < slot.numFrames) ? (slot.numFrames - m_curRespOffset) : 0;
        const std::size_t take = std::min(rem, count - written);
        if (take > 0) {
            std::memcpy(dstStereo + written * 2,
                        slot.stereo.data() + m_curRespOffset * 2,
                        take * 2 * sizeof(float));
            written += take;
            m_curRespOffset += take;
        }
        if (m_curRespOffset >= slot.numFrames) {
            ++rr;
            m_curRespOffset = 0;
        }
    }
    m_respRead.store(rr, std::memory_order_release);
}

VstLiveChannel::AsyncBlockResult VstLiveChannel::processBlockAsync(
    std::span<float> stereo, std::span<const vsthost::ShmMidiEvent> midiEvents,
    double sampleRate, bool reset, int desiredLatencyFrames) noexcept {
    AsyncBlockResult result;
#ifdef Q_OS_WIN
    (void)stereo; (void)midiEvents; (void)sampleRate; (void)reset; (void)desiredLatencyFrames;
    result.peerDead = true;
    return result;
#else
    const std::size_t frames = stereo.size() / 2;
    if (frames == 0 || frames > vsthost::kShmMaxFrames) return result;
    if (m_closed.load(std::memory_order_acquire) || !m_connected.load(std::memory_order_acquire)) {
        std::fill_n(stereo.begin(), frames * 2, 0.0f);
        result.peerDead = true;
        return result;
    }

    // Non-blocking guard so close() can wait for any active audio callback to leave.
    if (m_asyncBusy.test_and_set(std::memory_order_acquire)) {
        std::fill_n(stereo.begin(), frames * 2, 0.0f);
        return result;
    }
    struct BusyGuard {
        explicit BusyGuard(std::atomic_flag& flag) : f(flag) {}
        BusyGuard(const BusyGuard&) = delete;
        BusyGuard& operator=(const BusyGuard&) = delete;
        ~BusyGuard() { f.clear(std::memory_order_release); }
        std::atomic_flag& f;
    } busyGuard{m_asyncBusy};

    if (m_closed.load(std::memory_order_acquire) || !m_reqSlots || !m_respSlots) {
        std::fill_n(stereo.begin(), frames * 2, 0.0f);
        result.peerDead = true;
        return result;
    }

    const bool dead = m_peerDead.load(std::memory_order_acquire);
    result.peerDead = dead;
    const std::uint64_t recCount = m_recoveryCount.load(std::memory_order_acquire);
    const bool justRecovered = !dead && (recCount != m_lastSeenRecoveryCount);
    if (justRecovered) {
        m_lastSeenRecoveryCount = recCount;
        result.recovered = true;
    }
    // C1 + C2: Accept processor-supplied look-ahead at plan handoff on the audio thread
    // (never mutated on the control thread while an older plan still renders), and ensure
    // active look-ahead always covers the submitted block size `frames` so large callbacks
    // never accrue permanent debt.
    const int requestedLatency = desiredLatencyFrames > 0
        ? std::clamp(desiredLatencyFrames, 1, kMaxAsyncLatencyFrames)
        : m_asyncLatencyFrames.load(std::memory_order_acquire);
    const int framesInt = static_cast<int>(frames);
    int targetLatency = m_activeAsyncLatency;
    if (!m_asyncPrimed || reset || justRecovered || requestedLatency != m_lastRequestedLatency) {
        m_lastRequestedLatency = requestedLatency;
        targetLatency = std::max(requestedLatency, framesInt);
    } else if (framesInt > m_activeAsyncLatency) {
        targetLatency = framesInt;
    }
    const bool latencyChanged = !dead && m_asyncPrimed && (targetLatency != m_activeAsyncLatency);

    // Only prime/re-seed on reset, recovery, or look-ahead depth change when the peer is alive;
    // while dead, keep draining buffered audio and then enter smooth fade-out concealment.
    if (!dead && (reset || !m_asyncPrimed || justRecovered || latencyChanged)) {
        const std::uint64_t nextGen = m_streamGen.fetch_add(1, std::memory_order_acq_rel) + 1;
        m_activeGen = nextGen;
        const std::uint64_t rw = m_respWrite.load(std::memory_order_acquire);
        m_respRead.store(rw, std::memory_order_release);
        m_curRespOffset = 0;
        m_activeAsyncLatency = targetLatency;
        m_effectiveAsyncLatency.store(targetLatency, std::memory_order_release);
        m_seedZeroFrames = static_cast<std::size_t>(targetLatency);
        m_debtFrames = 0;
        m_asyncPrimed = true;
        if (!m_inUnderrun) {
            if (m_lastOutL != 0.0f || m_lastOutR != 0.0f) {
                // Smoothly fade out any residual sample during initial latency seeding.
                m_fadeOutStartL = m_lastOutL;
                m_fadeOutStartR = m_lastOutR;
                m_fadeOutPos = 0;
            } else {
                m_fadeOutPos = kConcealFadeFrames;
            }
            m_fadingIn = false;
            m_fadeInPos = 0;
        }
    }

    // 1. Submit input audio + MIDI to the bounded lock-free request queue via pure atomic handoff
    //    (C3: zero kernel calls, zero locks, zero wake syscalls on the device callback).
    std::size_t pushedFrames = 0;
    if (!dead) {
        const std::uint64_t w = m_reqWrite.load(std::memory_order_relaxed);
        const std::uint64_t rr = m_respRead.load(std::memory_order_relaxed);
        const std::uint64_t skipped = m_workerSkipped.load(std::memory_order_acquire);
        const std::uint64_t inFlight = (w >= rr + skipped) ? (w - rr - skipped) : 0;
        if (inFlight < kQueueCapacity) {
            AsyncRequest& req = m_reqSlots[w & kQueueMask];
            req.gen = m_activeGen;
            req.seq = ++m_asyncSeq;
            req.sampleRate = sampleRate;
            req.numFrames = static_cast<std::uint32_t>(frames);
            const std::size_t nMidi = std::min<std::size_t>(midiEvents.size(), vsthost::kShmMaxMidiEvents);
            req.numMidiEvents = static_cast<std::uint32_t>(nMidi);
            req.reset = reset || justRecovered;
            std::memcpy(req.stereo.data(), stereo.data(), frames * 2 * sizeof(float));
            if (nMidi > 0) {
                std::memcpy(req.midi.data(), midiEvents.data(), nMidi * sizeof(vsthost::ShmMidiEvent));
            }
            const double sr = (sampleRate >= 8000.0 && sampleRate <= 384000.0) ? sampleRate : 48000.0;
            const int periodUs = std::clamp(static_cast<int>(static_cast<double>(frames) * 1e6 / sr), 150, 20000);
            m_callbackPeriodUs.store(periodUs, std::memory_order_relaxed);
            m_reqWrite.store(w + 1, std::memory_order_release);
            pushedFrames = frames;
            result.submitted = true;
        }
    }

    // 2. Consume initial pre-buffered pipeline latency zeros if still seeding (while peer is alive).
    const std::size_t seedCount = dead ? 0 : std::min(frames, m_seedZeroFrames);
    if (seedCount > 0) {
        for (std::size_t f = 0; f < seedCount; ++f) {
            if (m_fadeOutPos < kConcealFadeFrames) {
                const float g = 1.0f - static_cast<float>(m_fadeOutPos + 1) / static_cast<float>(kConcealFadeFrames);
                stereo[f * 2] = m_fadeOutStartL * g;
                stereo[f * 2 + 1] = m_fadeOutStartR * g;
                ++m_fadeOutPos;
            } else {
                stereo[f * 2] = 0.0f;
                stereo[f * 2 + 1] = 0.0f;
            }
        }
        m_seedZeroFrames -= seedCount;
        m_lastOutL = stereo[(seedCount - 1) * 2];
        m_lastOutR = stereo[(seedCount - 1) * 2 + 1];
    }
    if (seedCount == frames) {
        result.outputReady = true;
        return result;
    }

    // 3. Skip stale-generation responses and discard catch-up debt to keep exact latency.
    skipStaleResponses();
    discardDebtFrames();

    const std::size_t need = frames - seedCount;
    const std::size_t avail = availableCurrentGenFrames();

    if (avail >= need) {
        float* dst = stereo.data() + seedCount * 2;
        consumeResponseFrames(dst, need);
        if (m_inUnderrun) {
            m_inUnderrun = false;
            m_fadingIn = true;
            m_fadeInPos = 0;
            m_fadeInFromL = m_lastOutL;
            m_fadeInFromR = m_lastOutR;
        }
        if (m_fadingIn) {
            for (std::size_t f = 0; f < need && m_fadingIn; ++f) {
                const float alpha = static_cast<float>(m_fadeInPos + 1) / static_cast<float>(kConcealFadeFrames);
                const float oneMinus = 1.0f - alpha;
                dst[f * 2] = m_fadeInFromL * oneMinus + dst[f * 2] * alpha;
                dst[f * 2 + 1] = m_fadeInFromR * oneMinus + dst[f * 2 + 1] * alpha;
                ++m_fadeInPos;
                if (m_fadeInPos >= kConcealFadeFrames) {
                    m_fadingIn = false;
                }
            }
        }
        m_lastOutL = stereo[(frames - 1) * 2];
        m_lastOutR = stereo[(frames - 1) * 2 + 1];
        result.outputReady = true;
        return result;
    }

    // 4. Underrun: host block is late (or peer is dead). Never set connected=false on a late block!
    //    Conceal with a short fade-out from the last emitted sample to silence.
    //    D10: While already in underrun, do not consume a partial fragment (0 < avail < need);
    //    keep emitting silence and leave it queued until avail >= need exits via the fade-in path.
    m_underrunCount.fetch_add(1, std::memory_order_relaxed);
    float* dst = stereo.data() + seedCount * 2;
    std::size_t consumedAvail = 0;
    if (!m_inUnderrun) {
        if (avail > 0) {
            consumeResponseFrames(dst, avail);
            if (m_fadingIn) {
                for (std::size_t f = 0; f < avail && m_fadingIn; ++f) {
                    const float alpha = static_cast<float>(m_fadeInPos + 1) / static_cast<float>(kConcealFadeFrames);
                    const float oneMinus = 1.0f - alpha;
                    dst[f * 2] = m_fadeInFromL * oneMinus + dst[f * 2] * alpha;
                    dst[f * 2 + 1] = m_fadeInFromR * oneMinus + dst[f * 2 + 1] * alpha;
                    ++m_fadeInPos;
                    if (m_fadeInPos >= kConcealFadeFrames) {
                        m_fadingIn = false;
                    }
                }
            }
            m_lastOutL = dst[(avail - 1) * 2];
            m_lastOutR = dst[(avail - 1) * 2 + 1];
            consumedAvail = avail;
        }
        m_inUnderrun = true;
        m_fadeOutPos = 0;
        m_fadeOutStartL = m_lastOutL;
        m_fadeOutStartR = m_lastOutR;
        m_fadingIn = false;
    }
    const std::size_t missing = need - consumedAvail;
    float* concealDst = dst + consumedAvail * 2;
    for (std::size_t f = 0; f < missing; ++f) {
        if (m_fadeOutPos < kConcealFadeFrames) {
            const float g = 1.0f - static_cast<float>(m_fadeOutPos + 1) / static_cast<float>(kConcealFadeFrames);
            concealDst[f * 2] = m_fadeOutStartL * g;
            concealDst[f * 2 + 1] = m_fadeOutStartR * g;
            ++m_fadeOutPos;
        } else {
            concealDst[f * 2] = 0.0f;
            concealDst[f * 2 + 1] = 0.0f;
        }
    }
    m_lastOutL = stereo[(frames - 1) * 2];
    m_lastOutR = stereo[(frames - 1) * 2 + 1];

    const std::size_t consumed = seedCount + consumedAvail;
    if (pushedFrames > consumed) {
        m_debtFrames += (pushedFrames - consumed);
    }
    result.outputReady = false;
    return result;
#endif
}

bool VstLiveChannel::processBlock(std::span<float> stereo, std::span<const vsthost::ShmMidiEvent> midiEvents,
                                  double sampleRate, bool reset, int timeoutMs) noexcept {
#ifdef Q_OS_WIN
    (void)stereo; (void)midiEvents; (void)sampleRate; (void)reset; (void)timeoutMs;
    return false;
#else
    if (!connected() || m_closed.load(std::memory_order_acquire)) return false;
    const std::size_t frames = stereo.size() / 2;
    if (frames == 0 || frames > vsthost::kShmMaxFrames) return false;

    std::lock_guard<std::mutex> syncLock(m_syncMutex);
    if (!connected() || m_closed.load(std::memory_order_acquire)) return false;

    // D3: Never overwrite m_syncReq/m_syncResp while a prior sync request is still in flight on m_worker.
    {
        std::unique_lock<std::mutex> waitLock(m_syncWaitMutex);
        if (m_syncInFlight) {
            const auto prevWait = std::chrono::milliseconds(std::max(1, timeoutMs) + 50);
            m_syncCv.wait_for(waitLock, prevWait, [this]() {
                return !m_syncInFlight || m_stop.load(std::memory_order_acquire);
            });
            if (m_syncInFlight || m_stop.load(std::memory_order_acquire) ||
                !connected() || m_closed.load(std::memory_order_acquire)) {
                return false;
            }
        }
    }

    m_syncReq.gen = 0;
    m_syncReq.seq = 0;
    m_syncReq.sampleRate = sampleRate;
    m_syncReq.numFrames = static_cast<std::uint32_t>(frames);
    const std::size_t nMidi = std::min<std::size_t>(midiEvents.size(), vsthost::kShmMaxMidiEvents);
    m_syncReq.numMidiEvents = static_cast<std::uint32_t>(nMidi);
    m_syncReq.reset = reset;
    std::memcpy(m_syncReq.stereo.data(), stereo.data(), frames * 2 * sizeof(float));
    if (nMidi > 0) {
        std::memcpy(m_syncReq.midi.data(), midiEvents.data(), nMidi * sizeof(vsthost::ShmMidiEvent));
    }
    m_syncTimeoutMs = std::max(1, timeoutMs);

    {
        std::lock_guard<std::mutex> waitLock(m_syncWaitMutex);
        m_syncDone = false;
        m_syncInFlight = true;
    }
    m_syncPending.store(true, std::memory_order_release);
    // Wake quiescent worker immediately (processBlock is offline/control thread only).
    wakeWorker();
    {
        std::lock_guard<std::mutex> parkLock(m_workerParkMutex);
    }
    m_workerParkCv.notify_all();

    std::unique_lock<std::mutex> waitLock(m_syncWaitMutex);
    const auto waitLimit = std::chrono::milliseconds(std::max(1, timeoutMs) + 50);
    const bool finished = m_syncCv.wait_for(waitLock, waitLimit, [this]() {
        return m_syncDone || m_stop.load(std::memory_order_acquire);
    });
    if (!finished || !m_syncDone) {
        if (m_syncPending.exchange(false, std::memory_order_acq_rel)) {
            m_syncInFlight = false;
        }
        return false;
    }
    if (!m_syncResp.ok) {
        return false;
    }
    std::memcpy(stereo.data(), m_syncResp.stereo.data(), frames * 2 * sizeof(float));
    return true;
#endif
}

bool VstLiveChannel::recoverIfNeeded() {
#ifdef Q_OS_WIN
    return false;
#else
    if (m_closed.load(std::memory_order_acquire) || !m_peerDead.load(std::memory_order_acquire) || !m_client) {
        return false;
    }
    std::lock_guard<std::mutex> ctrlLock(m_controlMutex);
    if (m_closed.load(std::memory_order_acquire) || !m_peerDead.load(std::memory_order_acquire) || !m_client) {
        return false;
    }
    const auto now = std::chrono::steady_clock::now();
    if (m_lastRecoveryAttempt != std::chrono::steady_clock::time_point{} &&
        (now - m_lastRecoveryAttempt) < std::chrono::milliseconds(100)) {
        return false;
    }
    m_lastRecoveryAttempt = now;

    // Wait until the IPC worker has observed m_peerDead and parked off m_shm/m_sockFd.
    {
        std::unique_lock<std::mutex> parkLock(m_workerParkMutex);
        m_workerParkCv.wait_for(parkLock, std::chrono::milliseconds(500), [this]() {
            return m_workerParked || m_stop.load(std::memory_order_acquire);
        });
        if (!m_workerParked || m_stop.load(std::memory_order_acquire)) {
            return false;
        }
    }

    const double rate = m_preparedRate.load(std::memory_order_acquire);
    const double targetRate = (rate >= 8000.0 && rate <= 384000.0) ? rate : 48000.0;
    const int targetQuantum = m_renderQuantumFrames.load(std::memory_order_acquire);
    std::function<void(bool)> recoveryHook;
    if (m_hasRecoveryHookForTest.load(std::memory_order_acquire)) {
        std::lock_guard<std::mutex> lock(m_stateMutex);
        recoveryHook = m_recoveryHookForTest;
    }
    if (recoveryHook) {
        recoveryHook(/*afterOpen=*/false);
    }
    OpenedTransport transport;
    QString err;
    if (!openTransportSession(*m_client, m_instance, m_path, m_uid, appliedState(), targetRate,
                              targetQuantum, transport, &err)) {
        return false;
    }
    if (recoveryHook) {
        recoveryHook(/*afterOpen=*/true);
    }

    // Worker is parked and cannot touch m_shm or m_sockFd while m_workerParkMutex is held.
    bool stoppedDuringRecovery = false;
    {
        std::lock_guard<std::mutex> parkLock(m_workerParkMutex);
        if (m_stop.load(std::memory_order_acquire)) {
            ::close(transport.sockFd);
            ::munmap(transport.shm, sizeof(vsthost::ShmBuffer));
            stoppedDuringRecovery = true;
        } else {
            if (m_sockFd >= 0) {
                ::shutdown(m_sockFd, SHUT_RDWR);
                ::close(m_sockFd);
            }
            if (m_shm) {
                ::munmap(m_shm, sizeof(vsthost::ShmBuffer));
            }
            m_shm = transport.shm;
            m_sockFd = transport.sockFd;
            m_shmSeq = 0;
            m_epoch.store(transport.epoch, std::memory_order_release);
            m_renderQuantumFrames.store(transport.configuredQuantum, std::memory_order_release);
            m_latencyState->store(packVstLatency(transport.latencyGen, transport.latency), std::memory_order_release);
            m_client->registerLatencyTarget(m_instance, m_latencyState);
            m_recoveryResetPending.store(true, std::memory_order_release);
            // Publish recoveryCount BEFORE clearing m_peerDead so audio callback never sees
            // peerDead==false without also observing the incremented recoveryCount (D4).
            m_recoveryCount.fetch_add(1, std::memory_order_release);
            const auto armUntil = std::chrono::steady_clock::now() + kDefaultArmWindow;
            m_armedUntilNs.store(
                std::chrono::duration_cast<std::chrono::nanoseconds>(armUntil.time_since_epoch()).count(),
                std::memory_order_release);
            m_peerDead.store(false, std::memory_order_release);
        }
    }
    if (stoppedDuringRecovery) {
        // D13: close the newly opened host LiveSession so it does not leak if close(nullptr) ran.
        if (m_client && !m_instance.isEmpty()) {
            m_client->closeLiveAsync(m_instance);
        }
        return false;
    }
    m_workerParkCv.notify_all();
    return true;
#endif
}

bool VstLiveChannel::prepareRate(double sampleRate, QString* error, int renderQuantumFrames) {
    if (!m_client || m_closed.load(std::memory_order_acquire)) return false;
    std::lock_guard<std::mutex> ctrlLock(m_controlMutex);
    if (m_closed.load(std::memory_order_acquire) || !connected()) return false;
    const bool rateChanged = (m_preparedRate.load(std::memory_order_acquire) != sampleRate);
    const int currentQuantum = m_renderQuantumFrames.load(std::memory_order_acquire);
    const int requestedQuantum = renderQuantumFrames > 0
        ? std::clamp(renderQuantumFrames, 16, static_cast<int>(vsthost::kShmMaxFrames))
        : currentQuantum;
    const bool quantumChanged = (requestedQuantum != currentQuantum);
    if (!rateChanged && !quantumChanged) return true;
    int latency = 0;
    std::uint64_t latencyGen = 0;
    int configuredQuantum = requestedQuantum;
    // C2 + C6: When only the render quantum changed (same sample rate), update host worker
    // scheduling without resetting the plug-in so an active plan using this channel is undisturbed.
    const bool schedulingOnly = !rateChanged && quantumChanged;
    if (!m_client->prepareLive(m_instance, sampleRate, static_cast<int>(vsthost::kShmMaxFrames),
                               &latency, error, 15000, &latencyGen, requestedQuantum,
                               schedulingOnly, &configuredQuantum)) {
        return false;
    }
    (void)updateLatency(latency, latencyGen);
    m_preparedRate.store(sampleRate, std::memory_order_release);
    m_renderQuantumFrames.store(configuredQuantum, std::memory_order_release);
    const double sr = (sampleRate >= 8000.0 && sampleRate <= 384000.0) ? sampleRate : 48000.0;
    const int periodUs = std::clamp(static_cast<int>(std::llround(configuredQuantum * 1e6 / sr)), 150, 20000);
    m_callbackPeriodUs.store(periodUs, std::memory_order_release);
    return true;
}

bool VstLiveChannel::probeLatency(double sampleRate, QString* error) {
    if (!m_client || m_closed.load(std::memory_order_acquire)) return false;
    std::lock_guard<std::mutex> ctrlLock(m_controlMutex);
    if (m_closed.load(std::memory_order_acquire) || !connected()) return false;
    int latency = 0;
    std::uint64_t latencyGen = 0;
    if (!m_client->probeLiveLatency(m_instance, sampleRate, static_cast<int>(vsthost::kShmMaxFrames),
                                    &latency, error, 15000, &latencyGen)) {
        return false;
    }
    (void)updateLatency(latency, latencyGen);
    if (sampleRate >= 8000.0 && sampleRate <= 384000.0) {
        m_preparedRate.store(sampleRate, std::memory_order_release);
    }
    return true;
}

void VstLiveChannel::close(VstHostClient* client) {
    m_closed.store(true, std::memory_order_release);
    m_connected.store(false, std::memory_order_release);
    // D2: Publish m_stop under m_workerParkMutex so a worker entering wait() cannot miss notify_all().
    {
        std::lock_guard<std::mutex> parkLock(m_workerParkMutex);
        m_stop.store(true, std::memory_order_release);
    }
    m_workerParkCv.notify_all();
    wakeWorker();
    // D3: Wake any synchronous processBlock() waiting on m_syncCv.
    {
        std::lock_guard<std::mutex> waitLock(m_syncWaitMutex);
    }
    m_syncCv.notify_all();
#ifndef Q_OS_WIN
    std::lock_guard<std::mutex> ctrlLock(m_controlMutex);
    // Wake the worker from quiescent idle wait, peer-dead park, or in-flight socket wait.
    m_workerParkCv.notify_all();
    wakeWorker();
    if (m_sockFd >= 0) {
        ::shutdown(m_sockFd, SHUT_RDWR);
    }
    if (m_worker.joinable()) {
        m_worker.join();
    }
#ifdef Q_OS_MACOS
    if (m_kqueueFd >= 0) {
        ::close(m_kqueueFd);
        m_kqueueFd = -1;
        m_kqueueSockFd = -1;
        m_kqueueTimerArmed = false;
    }
#endif
    // Worker is joined; close both ends of the self-pipe under m_wakeMutex so concurrent
    // control-thread callers cannot write to a closed/reused descriptor.
    {
        std::lock_guard<std::mutex> wakeLock(m_wakeMutex);
        if (m_wakeWriteFd >= 0) {
            ::close(m_wakeWriteFd);
            m_wakeWriteFd = -1;
        }
        if (m_wakeReadFd >= 0) {
            ::close(m_wakeReadFd);
            m_wakeReadFd = -1;
        }
    }
    // D3: Serialize with any concurrent processBlock() before tearing down resources.
    std::lock_guard<std::mutex> syncLock(m_syncMutex);
    // Wait for any audio callback currently inside processBlockAsync (microseconds, never blocks).
    while (m_asyncBusy.test_and_set(std::memory_order_acquire)) {
        std::this_thread::sleep_for(std::chrono::microseconds(100));
    }
    if (m_sockFd >= 0) {
        if (m_shm && !m_peerDead.load(std::memory_order_acquire)) {
            m_shm->header.flags = vsthost::kShmFlagClose;
            m_shm->header.requestSeq.store(++m_shmSeq, std::memory_order_release);
        }
        ::close(m_sockFd);
        m_sockFd = -1;
    }
    if (m_shm) {
        ::munmap(m_shm, sizeof(vsthost::ShmBuffer));
        m_shm = nullptr;
    }
    m_reqSlots.reset();
    m_respSlots.reset();
    m_asyncBusy.clear(std::memory_order_release);
#endif
    if (client && !m_instance.isEmpty()) {
        if (client->unregisterLatencyTarget(m_instance, m_latencyState.get())) {
            client->closeLiveAsync(m_instance);
        }
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
            int updatedLatency = -1;
            std::uint64_t updatedGen = 0;
            if (client.setLiveState(instance, state, error, 15000, &updatedLatency, &updatedGen)) {
                existing->setAppliedState(state);
                if (updatedLatency >= 0) {
                    (void)existing->updateLatency(updatedLatency, updatedGen);
                }
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
