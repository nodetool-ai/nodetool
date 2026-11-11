#pragma once

#include <cstdlib>

// Wall-clock budgets in the tests are set for an uninstrumented build on a
// developer machine. ASan and TSan slow the runner several times over, so a
// sanitizer build scales each budget by kSanitizerTimeScale. A slower host,
// such as a shared CI runner, sets GR_TEST_TIME_SCALE to scale them further.
// Clang does not define __SANITIZE_ADDRESS__, so __has_feature is checked as
// well.
#if defined(__SANITIZE_ADDRESS__)
#define GR_ASAN_BUILD 1
#endif
#if defined(__SANITIZE_THREAD__)
#define GR_TSAN_BUILD 1
#endif
#if defined(__has_feature)
#if __has_feature(address_sanitizer)
#define GR_ASAN_BUILD 1
#endif
#if __has_feature(thread_sanitizer)
#define GR_TSAN_BUILD 1
#endif
#endif

namespace gr::test {
// TSan instruments every memory access and runs the guest about ten times
// slower than an uninstrumented build. ASan costs about three times.
#if defined(GR_TSAN_BUILD)
inline constexpr long long kSanitizerTimeScale = 20;
#elif defined(GR_ASAN_BUILD)
inline constexpr long long kSanitizerTimeScale = 5;
#else
inline constexpr long long kSanitizerTimeScale = 1;
#endif

/** kSanitizerTimeScale times GR_TEST_TIME_SCALE (a whole number, default 1). */
inline long long timeBudgetScale() {
  const char* value = std::getenv("GR_TEST_TIME_SCALE");
  const long long host = value ? std::atoll(value) : 1;
  return kSanitizerTimeScale * (host > 1 ? host : 1);
}
}  // namespace gr::test
