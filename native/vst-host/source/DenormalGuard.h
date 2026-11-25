#pragma once

// Stack-only RAII guard enabling FTZ/DAZ (x86/x86_64) or FZ (ARM64/ARM VFP)
// for the VST host's audio processing threads, restoring prior state on exit.
//
// Thread affinity: audio processing thread; stack-only, zero allocation, lock-free.

#include <atomic>
#include <cstdint>

#if defined(__x86_64__) || defined(_M_X64) || defined(__SSE__) || (defined(_M_IX86_FP) && _M_IX86_FP >= 1)
#define VSTHOST_HAS_X86_SSE_MXCSR 1
#include <xmmintrin.h>
#if defined(__x86_64__) || defined(_M_X64) || defined(__SSE2__) || (defined(_M_IX86_FP) && _M_IX86_FP >= 2)
#define VSTHOST_HAS_X86_SSE2_DAZ 1
#endif
#elif defined(_M_ARM64)
#include <intrin.h>
#endif

namespace vsthost {

class ScopedDenormalGuard final {
public:
    ScopedDenormalGuard() noexcept {
#if defined(VSTHOST_HAS_X86_SSE_MXCSR)
#if defined(VSTHOST_HAS_X86_SSE2_DAZ)
        constexpr unsigned int kFtzDazMask = 0x8040u;  // FTZ (bit 15) | DAZ (bit 6)
#else
        constexpr unsigned int kFtzDazMask = 0x8000u;  // FTZ (bit 15); SSE1 lacks DAZ
#endif
        saved_ = _mm_getcsr();
        if ((saved_ & kFtzDazMask) != kFtzDazMask) {
            _mm_setcsr(saved_ | kFtzDazMask);
        }
        std::atomic_signal_fence(std::memory_order_acq_rel);
#elif defined(__aarch64__)
        constexpr std::uint64_t kFzMask = 1ULL << 24;
        std::uint64_t fpcr = 0;
        asm volatile("mrs %0, fpcr" : "=r"(fpcr) : : "memory");
        saved_ = fpcr;
        if ((fpcr & kFzMask) == 0) {
            asm volatile("msr fpcr, %0" : : "r"(fpcr | kFzMask) : "memory");
        }
#elif defined(_M_ARM64)
        constexpr std::uint64_t kFzMask = 1ULL << 24;
        const std::uint64_t fpcr = static_cast<std::uint64_t>(_ReadStatusReg(ARM64_FPCR));
        saved_ = fpcr;
        if ((fpcr & kFzMask) == 0) {
            _WriteStatusReg(ARM64_FPCR, static_cast<__int64>(fpcr | kFzMask));
        }
        std::atomic_signal_fence(std::memory_order_acq_rel);
#elif defined(__arm__) && defined(__VFP_FP__)
        constexpr std::uint32_t kFzMask = 1u << 24;
        std::uint32_t fpscr = 0;
        asm volatile("vmrs %0, fpscr" : "=r"(fpscr) : : "memory");
        saved_ = fpscr;
        if ((fpscr & kFzMask) == 0) {
            asm volatile("vmsr fpscr, %0" : : "r"(fpscr | kFzMask) : "memory");
        }
#endif
    }

    ~ScopedDenormalGuard() noexcept {
#if defined(VSTHOST_HAS_X86_SSE_MXCSR)
        std::atomic_signal_fence(std::memory_order_acq_rel);
        constexpr unsigned int kStatusMask = 0x3Fu;
        const unsigned int current = _mm_getcsr();
        _mm_setcsr((saved_ & ~kStatusMask) | (current & kStatusMask));
#elif defined(__aarch64__)
        asm volatile("msr fpcr, %0" : : "r"(saved_) : "memory");
#elif defined(_M_ARM64)
        std::atomic_signal_fence(std::memory_order_acq_rel);
        _WriteStatusReg(ARM64_FPCR, static_cast<__int64>(saved_));
#elif defined(__arm__) && defined(__VFP_FP__)
        constexpr std::uint32_t kStatusMask = 0x9Fu;
        std::uint32_t current = 0;
        asm volatile("vmrs %0, fpscr" : "=r"(current) : : "memory");
        asm volatile("vmsr fpscr, %0" : : "r"((saved_ & ~kStatusMask) | (current & kStatusMask)) : "memory");
#endif
    }

    ScopedDenormalGuard(const ScopedDenormalGuard&) = delete;
    ScopedDenormalGuard& operator=(const ScopedDenormalGuard&) = delete;

private:
#if defined(VSTHOST_HAS_X86_SSE_MXCSR)
    unsigned int saved_ = 0;
#elif defined(__aarch64__) || defined(_M_ARM64)
    std::uint64_t saved_ = 0;
#elif defined(__arm__) && defined(__VFP_FP__)
    std::uint32_t saved_ = 0;
#endif
};

}  // namespace vsthost

#undef VSTHOST_HAS_X86_SSE_MXCSR
#undef VSTHOST_HAS_X86_SSE2_DAZ
