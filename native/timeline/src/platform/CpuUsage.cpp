#include "platform/CpuUsage.h"

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

}  // namespace nt::cpu
