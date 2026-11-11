#pragma once

// Wall-clock budgets in the tests are set for an uninstrumented build. ASan
// and TSan slow the runner several times over, so a sanitizer build scales
// each budget by kSanitizerTimeScale. Clang does not define
// __SANITIZE_ADDRESS__, so __has_feature is checked as well.
#if defined(__SANITIZE_ADDRESS__) || defined(__SANITIZE_THREAD__)
#define GR_SANITIZED_BUILD 1
#endif
#if defined(__has_feature)
#if __has_feature(address_sanitizer) || __has_feature(thread_sanitizer)
#define GR_SANITIZED_BUILD 1
#endif
#endif

namespace gr::test {
#if defined(GR_SANITIZED_BUILD)
inline constexpr long long kSanitizerTimeScale = 5;
#else
inline constexpr long long kSanitizerTimeScale = 1;
#endif
}  // namespace gr::test
