#include "platform/CpuUsage.h"

#if defined(__APPLE__) && !defined(NT_PORTABLE_PLATFORM)

#include <mach/mach.h>
#include <pthread.h>
#include <pthread/qos.h>
#include <sys/resource.h>

namespace nt::cpu {

int64_t processNs() {
    rusage usage{};
    if (getrusage(RUSAGE_SELF, &usage) != 0) return -1;
    const auto ns = [](const timeval& tv) { return int64_t(tv.tv_sec) * 1000000000 + int64_t(tv.tv_usec) * 1000; };
    return ns(usage.ru_utime) + ns(usage.ru_stime);
}

unsigned currentThread() {
    return pthread_mach_thread_np(pthread_self());
}

int64_t threadNs(unsigned thread) {
    if (thread == 0) return -1;
    thread_basic_info_data_t info{};
    mach_msg_type_number_t count = THREAD_BASIC_INFO_COUNT;
    if (thread_info(thread, THREAD_BASIC_INFO, reinterpret_cast<thread_info_t>(&info), &count) != KERN_SUCCESS) {
        return -1;
    }
    const auto ns = [](const time_value_t& t) { return int64_t(t.seconds) * 1000000000 + int64_t(t.microseconds) * 1000; };
    return ns(info.user_time) + ns(info.system_time);
}

const char* currentThreadQos() {
    qos_class_t q = QOS_CLASS_UNSPECIFIED;
    int relative = 0;
    pthread_get_qos_class_np(pthread_self(), &q, &relative);
    switch (q) {
    case QOS_CLASS_USER_INTERACTIVE: return "user-interactive";
    case QOS_CLASS_USER_INITIATED: return "user-initiated";
    case QOS_CLASS_DEFAULT: return "default";
    case QOS_CLASS_UTILITY: return "utility";
    case QOS_CLASS_BACKGROUND: return "background";
    default: return "unspecified";
    }
}

int processNice() {
    return getpriority(PRIO_PROCESS, 0);
}

// Mach thread ports need no registration: each live thread counts once.
int registeredThreads() {
    return 0;
}

}  // namespace nt::cpu

#else

// Linux and Windows (M6), and macOS with NT_PORTABLE_PLATFORM. A thread
// handle is an index into a table of native thread handles, because a
// pthread_t or a Windows HANDLE does not fit the `unsigned` of the API.
#include <mutex>
#include <utility>
#include <vector>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#else
#include <pthread.h>
#include <sys/resource.h>
#include <time.h>
#endif

namespace nt::cpu {
namespace {
#if defined(_WIN32)
using NativeThread = HANDLE;
int64_t fileTimeNs(const FILETIME& t) {
    ULARGE_INTEGER v;
    v.LowPart = t.dwLowDateTime;
    v.HighPart = t.dwHighDateTime;
    return static_cast<int64_t>(v.QuadPart) * 100;  // 100 ns units
}
#else
using NativeThread = pthread_t;
#endif
// One slot per registered thread; a slot is freed (and its Windows handle
// closed) when its thread ends, and stays empty: handles are not reused.
struct Slot {
    NativeThread native{};
    bool live = false;
};
std::mutex g_mutex;
std::vector<Slot> g_threads;
int g_live = 0;
#if defined(__linux__)
testing::NativeQuery g_nativeQuery;
#endif

void releaseSlot(unsigned index) {
    std::lock_guard lock(g_mutex);
    Slot& slot = g_threads[index - 1];
    if (!slot.live) return;
#if defined(_WIN32)
    CloseHandle(slot.native);
#endif
    slot.live = false;
    --g_live;
}

// The calling thread's registration, made once and released at thread exit.
struct Registration {
    unsigned index = 0;
    ~Registration() {
        if (index) releaseSlot(index);
    }
};
thread_local Registration t_registration;
}  // namespace

int64_t processNs() {
#if defined(_WIN32)
    FILETIME created, exited, kernel, user;
    if (!GetProcessTimes(GetCurrentProcess(), &created, &exited, &kernel, &user)) return -1;
    return fileTimeNs(kernel) + fileTimeNs(user);
#else
    rusage usage{};
    if (getrusage(RUSAGE_SELF, &usage) != 0) return -1;
    const auto ns = [](const timeval& tv) { return int64_t(tv.tv_sec) * 1000000000 + int64_t(tv.tv_usec) * 1000; };
    return ns(usage.ru_utime) + ns(usage.ru_stime);
#endif
}

unsigned currentThread() {
    if (t_registration.index) return t_registration.index;
#if defined(_WIN32)
    HANDLE self = nullptr;
    if (!DuplicateHandle(GetCurrentProcess(), GetCurrentThread(), GetCurrentProcess(), &self,
                         THREAD_QUERY_LIMITED_INFORMATION, FALSE, 0)) {
        return 0;
    }
#else
    const pthread_t self = pthread_self();
#endif
    std::lock_guard lock(g_mutex);
    g_threads.push_back(Slot{self, true});
    ++g_live;
    t_registration.index = static_cast<unsigned>(g_threads.size());
    return t_registration.index;
}

int64_t threadNs(unsigned thread) {
    // The lock is held through the native query (review F2): a thread's exit
    // releases its slot under the same lock, so a live slot here means the
    // thread has not finished, its pthread_t is valid and its Windows handle
    // is still open (not closed and reused for another thread).
    std::lock_guard lock(g_mutex);
    if (thread == 0 || thread > g_threads.size() || !g_threads[thread - 1].live) return -1;
    const NativeThread native = g_threads[thread - 1].native;
#if defined(_WIN32)
    FILETIME created, exited, kernel, user;
    if (!GetThreadTimes(native, &created, &exited, &kernel, &user)) return -1;
    return fileTimeNs(kernel) + fileTimeNs(user);
#elif defined(__APPLE__)
    // NT_PORTABLE_PLATFORM on macOS (a compile check of this branch): macOS
    // has no per-thread CPU clock id.
    (void)native;
    return -1;
#else
#if defined(__linux__)
    if (g_nativeQuery) return g_nativeQuery(static_cast<std::uintptr_t>(native));
#endif
    clockid_t clock;
    if (pthread_getcpuclockid(native, &clock) != 0) return -1;
    timespec ts{};
    if (clock_gettime(clock, &ts) != 0) return -1;
    return int64_t(ts.tv_sec) * 1000000000 + ts.tv_nsec;
#endif
}

#if defined(__linux__)
void testing::setNativeQuery(NativeQuery query) {
    std::lock_guard lock(g_mutex);
    g_nativeQuery = std::move(query);
}
#endif

int registeredThreads() {
    std::lock_guard lock(g_mutex);
    return g_live;
}

// QoS classes are a macOS concept.
const char* currentThreadQos() {
    return "unspecified";
}

int processNice() {
#if defined(_WIN32)
    return 0;
#else
    return getpriority(PRIO_PROCESS, 0);
#endif
}

}  // namespace nt::cpu

#endif
