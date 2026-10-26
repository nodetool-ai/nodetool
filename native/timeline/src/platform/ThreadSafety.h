#pragma once

#include <mutex>

#if defined(__clang__)
#define NT_GUARDED_BY(...) __attribute__((guarded_by(__VA_ARGS__)))
#define NT_REQUIRES(...) __attribute__((requires_capability(__VA_ARGS__)))
#define NT_ACQUIRE(...) __attribute__((acquire_capability(__VA_ARGS__)))
#define NT_RELEASE(...) __attribute__((release_capability(__VA_ARGS__)))
#define NT_CAPABILITY(name) __attribute__((capability(name)))
#define NT_SCOPED_CAPABILITY __attribute__((scoped_lockable))
#define NT_EXCLUDES(...) __attribute__((locks_excluded(__VA_ARGS__)))
#define NT_NO_THREAD_SAFETY_ANALYSIS __attribute__((no_thread_safety_analysis))
#else
#define NT_GUARDED_BY(...)
#define NT_REQUIRES(...)
#define NT_ACQUIRE(...)
#define NT_RELEASE(...)
#define NT_CAPABILITY(name)
#define NT_SCOPED_CAPABILITY
#define NT_EXCLUDES(...)
#define NT_NO_THREAD_SAFETY_ANALYSIS
#endif

namespace nt {

// libstdc++'s std::mutex has no Clang capability annotations.
class NT_CAPABILITY("mutex") Mutex {
public:
    void lock() NT_ACQUIRE() { m_mutex.lock(); }
    void unlock() NT_RELEASE() { m_mutex.unlock(); }

private:
    std::mutex m_mutex;
};

class NT_SCOPED_CAPABILITY MutexLocker {
public:
    explicit MutexLocker(Mutex& mutex) NT_ACQUIRE(mutex) : m_mutex(mutex) { m_mutex.lock(); }
    ~MutexLocker() NT_RELEASE() { m_mutex.unlock(); }
    MutexLocker(const MutexLocker&) = delete;
    MutexLocker& operator=(const MutexLocker&) = delete;

private:
    Mutex& m_mutex;
};

}  // namespace nt
