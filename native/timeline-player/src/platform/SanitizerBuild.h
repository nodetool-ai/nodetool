// Defines NT_SANITIZED in an ASan or TSan build. Older Clang, including 18 on
// CI, does not define __SANITIZE_ADDRESS__, so __has_feature is checked as well.
#pragma once

#if defined(__SANITIZE_ADDRESS__) || defined(__SANITIZE_THREAD__)
#define NT_SANITIZED 1
#elif defined(__has_feature)
#if __has_feature(address_sanitizer) || __has_feature(thread_sanitizer)
#define NT_SANITIZED 1
#endif
#endif
