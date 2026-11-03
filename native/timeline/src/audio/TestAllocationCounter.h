// Counts heap allocations on the calling thread for the real-time audio tests.
// Include it from exactly one source file of a test executable: it defines the
// replaceable global operators, which the language forbids declaring inline.
//
// A sanitizer owns operator new and delete. A replacement collides with the
// TSan runtime at link time, and under ASan it frees what the runtime's own
// nothrow new allocated, so sanitized builds count through the allocator hooks
// instead.
#pragma once

#include "platform/SanitizerBuild.h"

#include <algorithm>
#include <cstddef>
#include <cstdlib>
#include <new>
#if defined(_MSC_VER)
#include <malloc.h>
#endif

#ifdef NT_SANITIZED
#include <sanitizer/allocator_interface.h>
#endif

namespace nt::testing {
// Volatile because GCC assumes new and delete leave globals alone, so it would drop plain
// stores around an allocation (-fassume-sane-operators-new-delete).
inline thread_local volatile bool countAllocations = false;
inline thread_local volatile std::size_t allocations = 0;
inline void noteAllocation() noexcept {
    if (countAllocations) {
        allocations = allocations + 1;
    }
}
// The check's own control: a zero count means nothing unless this returns true.
inline bool countsAnAllocation() {
    static int* volatile sink = nullptr;
    allocations = 0;
    countAllocations = true;
    sink = new int(1);
    delete sink;
    countAllocations = false;
    return allocations > 0;
}
}  // namespace nt::testing

#ifdef NT_SANITIZED
namespace {
// The runtime refuses a pair with a null hook.
const int ntAllocationHooksInstalled = __sanitizer_install_malloc_and_free_hooks(
    [](const volatile void*, std::size_t) { nt::testing::noteAllocation(); }, [](const volatile void*) {});
}
#else
void* operator new(std::size_t n) {
    nt::testing::noteAllocation();
    if (void* p = std::malloc(std::max(n, std::size_t{1}))) {
        return p;
    }
    throw std::bad_alloc();
}
void* operator new[](std::size_t n) {
    return ::operator new(n);
}
void operator delete(void* p) noexcept {
    std::free(p);
}
void operator delete[](void* p) noexcept {
    std::free(p);
}
void operator delete(void* p, std::size_t) noexcept {
    std::free(p);
}
void operator delete[](void* p, std::size_t) noexcept {
    std::free(p);
}
void* operator new(std::size_t n, std::align_val_t alignment) {
    nt::testing::noteAllocation();
#if defined(_MSC_VER)
    if (void* p = _aligned_malloc(std::max(n, std::size_t{1}), static_cast<std::size_t>(alignment))) {
        return p;
    }
#else
    void* p = nullptr;
    if (posix_memalign(&p, static_cast<std::size_t>(alignment), std::max(n, std::size_t{1})) == 0) {
        return p;
    }
#endif
    throw std::bad_alloc();
}
void* operator new[](std::size_t n, std::align_val_t a) {
    return ::operator new(n, a);
}
void operator delete(void* p, std::align_val_t) noexcept {
#if defined(_MSC_VER)
    _aligned_free(p);
#else
    std::free(p);
#endif
}
void operator delete[](void* p, std::align_val_t a) noexcept {
    ::operator delete(p, a);
}
void operator delete(void* p, std::size_t, std::align_val_t a) noexcept {
    ::operator delete(p, a);
}
void operator delete[](void* p, std::size_t, std::align_val_t a) noexcept {
    ::operator delete(p, a);
}
#endif
