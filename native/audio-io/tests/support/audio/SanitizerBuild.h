// Defines NT_SANITIZED in an ASan or TSan build, for tests that link
// nodetool_audio_io_test_support. timeline-player's platform/SanitizerBuild.h
// makes the same check for code that does not. Older Clang, including 18 on
// CI, does not define __SANITIZE_ADDRESS__, so __has_feature is checked as well.
#pragma once

#ifndef NT_SANITIZED
#if defined(__SANITIZE_ADDRESS__) || defined(__SANITIZE_THREAD__)
#define NT_SANITIZED 1
#elif defined(__has_feature)
#if __has_feature(address_sanitizer) || __has_feature(thread_sanitizer)
#define NT_SANITIZED 1
#endif
#endif
#endif
