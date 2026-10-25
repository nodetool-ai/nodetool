---
name: modern-cpp
description: Guides C++ code toward modern idioms (C++20/23/26). Use when writing new C++ code, modernizing legacy patterns, or working on security-critical C++. Replaces raw pointers with smart pointers, SFINAE with concepts, printf with std::print, error codes with std::expected.
---

# Modern C++

Guide for writing modern C++ using C++20, C++23, and C++26 idioms. Focuses on patterns that eliminate vulnerability classes and reduce boilerplate, with a security emphasis from Trail of Bits.

## NodeTool Project Rules

These rules take precedence over the rest of this skill when you work in
`native/timeline/`. The plan in
[PLAN-GAPS.md](../../../native/timeline/docs/PLAN-GAPS.md) is the source of
truth when the two differ.

- **The standard is C++20.** `CMAKE_CXX_STANDARD` is 20, and the code builds
  with libc++ (macOS), libstdc++ (Linux) and MSVC (Windows). Do not use
  C++23 or C++26 features: no `std::expected`, `std::print`, deducing
  `this`, `std::flat_map`, monadic `std::optional`, contracts or reflection.
  For a fallible function, follow the surrounding code: `std::optional`, or a
  result struct with an error string.
- **Package V owns the compiler flags.** Do not add warning, hardening or
  sanitizer flags in a package. V adds hardening (`_GLIBCXX_ASSERTIONS`
  for libstdc++, the libc++ hardening mode, `_FORTIFY_SOURCE=3`,
  `-fstack-protector-strong`, `-ftrivial-auto-var-init=zero`), the
  `sanitize` and `tsan` presets, and clang-tidy. Warnings stay `-Wall
  -Wextra` (MSVC `/W4`). V measures `-Werror` and `-Wpedantic` against a
  baseline. New code adds no warning.
- **Qt objects follow Qt ownership.** A `QObject` with a parent is owned.
  Every `connect()` with a lambda passes a context object. A lambda that can
  outlive an object holds a `QPointer`. moc and `Q_OBJECT` stay.
- **C handles have one owner.** Wrap each FFmpeg object, VA surface, Vulkan
  handle and file descriptor in a `std::unique_ptr` with a deleter or a
  move-only class.
- **Output:** the app logs through Qt logging. CLI modes keep the existing
  `stdout`/`stderr` output. Do not convert existing `fprintf` calls.
- **Threads:** use `std::jthread` for a new plain thread. Use `QThread` when
  Qt objects live in the thread. Do not rewrite threads in files that your
  package does not own.
- **Modernize only the code you change.** Unrelated modernization in a
  file you touch is out of scope.

## When to Use This Skill

- Writing new C++ functions, classes, or libraries
- Modernizing existing C++ code (pre-C++20 patterns)
- Choosing between legacy and modern approaches
- Working on security-critical or safety-sensitive C++
- Reviewing C++ code for modern idiom adoption

## When NOT to Use This Skill

- **User explicitly requires older standard**: Respect constraints (embedded, legacy ABI)
- **Pure C code**: This skill is C++-specific
- **Build system questions**: CMake, Meson, Bazel configuration is out of scope
- **Non-C++ projects**: Mixed codebases where C++ isn't primary

## Anti-Patterns to Avoid

| Avoid | Use Instead | Why |
|-------|-------------|-----|
| `new`/`delete` | `std::make_unique`, `std::make_shared` | Eliminates leaks, double-free |
| Raw owning pointers | `std::unique_ptr`, `std::shared_ptr` | RAII ownership semantics |
| C arrays (`int arr[N]`) | `std::array<int, N>` | Bounds-aware, value semantics |
| Pointer + length params | `std::span<T>` | Non-owning, bounds-checkable |
| `printf` / `sprintf` | `std::format` (`std::print` is C++23, not in NodeTool) | Type-safe, no buffer overflow |
| C-style casts `(int)x` | `static_cast<int>(x)` | Explicit intent, auditable |
| `#define` constants | `constexpr` variables | Scoped, typed, debuggable |
| SFINAE / `enable_if` | Concepts + `requires` | Readable constraints and errors |
| Error codes + out params | `std::expected<T, E>` (C++23; NodeTool uses `std::optional` or a result struct) | Composable, type-safe errors |
| `union` | `std::variant` | Type-safe, no silent UB |
| Raw `mutex.lock()/unlock()` | `std::scoped_lock` | Exception-safe, no deadlocks |
| `std::thread` | `std::jthread` | Auto-join, stop token support |
| `assert()` macro | `contract_assert` (C++26, not in NodeTool) | Visible to tooling, configurable |
| Manual CRTP | Deducing `this` (C++23, not in NodeTool) | Simpler, no template boilerplate |
| Macro code generation | Reflection (C++26, not in NodeTool; moc stays) | Zero-overhead, composable |

See [anti-patterns.md](./references/anti-patterns.md) for the full table (30+ patterns).

## Decision Tree

```
What are you doing?
|
+-- Writing new C++ code?
|   +-- Use modern idioms by default (C++20/23)
|   +-- Choose the newest standard your compiler supports
|   |   (NodeTool: C++20 only, see NodeTool Project Rules)
|   +-- See Feature Tiers below
|
+-- Modernizing existing code?
|   +-- Start with Tier 1 (C++20/23) replacements
|   +-- Prioritize by security impact (memory > types > style)
|   +-- See anti-patterns.md for the migration table
|
+-- Security-critical code?
|   +-- Enable compiler hardening flags (see below)
|   +-- Enable hardened libc++ mode
|   +-- Run sanitizers in CI
|   +-- See safe-idioms.md and compiler-hardening.md
|
+-- Using C++26 features?
    +-- Reflection: YES, plan for it (GCC 16+)
    +-- Contracts: cautiously, for new API boundaries
    +-- std::execution: wait for ecosystem maturity
    +-- See cpp26-features.md
```

## Feature Tiers

Features are ranked by **practical usability today**, not by standard version.

### Tier 1: Use Today (C++20/23, solid compiler support)

| Feature | Replaces | Standard |
|---------|----------|----------|
| Concepts + `requires` | SFINAE, `enable_if` | C++20 |
| Ranges + views | Raw iterator loops | C++20 |
| `std::span<T>` | Pointer + length | C++20 |
| `std::format` | `sprintf`, iostream chains | C++20 |
| Three-way comparison `<=>` | Manual comparison operators | C++20 |
| `std::jthread` | `std::thread` + manual join | C++20 |
| Designated initializers | Positional struct init | C++20 |
| `std::expected<T,E>` | Error codes, exceptions at boundaries | C++23 |
| `std::print` / `std::println` | `printf`, `std::cout <<` | C++23 |
| Deducing `this` | CRTP, const/non-const duplication | C++23 |
| `std::flat_map` | `std::map` for read-heavy use | C++23 |
| Monadic `std::optional` | Nested if-checks on optionals | C++23 |

See [cpp20-features.md](./references/cpp20-features.md) and [cpp23-features.md](./references/cpp23-features.md).

### Tier 2: Deploy Now (no standard bump needed)

These improve safety without changing your C++ standard version:

- **Compiler hardening flags** — `-D_FORTIFY_SOURCE=3`, `-fstack-protector-strong`, `-ftrivial-auto-var-init=zero`
- **Hardened libc++** — `-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST` for ~0.3% overhead bounds-checking
- **Sanitizers in CI** — ASan + UBSan as minimum; TSan for concurrent code
- **Warning flags** — `-Wall -Wextra -Wpedantic -Werror` (NodeTool: package V owns the flags and measures `-Werror` against a baseline)
- **Hardened libstdc++** — `-D_GLIBCXX_ASSERTIONS` bounds-checks `operator[]` and similar calls on GCC's standard library

See [compiler-hardening.md](./references/compiler-hardening.md).

### Tier 3: Plan For (C++26, worth restructuring around)

**Reflection** is the single most transformative C++26 feature. It eliminates:
- Serialization boilerplate (one generic function replaces per-struct `to_json`)
- Code generators (protobuf codegen, Qt MOC)
- Macro-based registration and enum-to-string hacks

GCC 16 (April 2026) has reflection merged. Plan new code to benefit from it.

### Tier 4: Watch (C++26, needs maturation)

- **Contracts** (`pre`/`post`/`contract_assert`) — Better than `assert()`, but no virtual function support and limited compiler support. Adopt cautiously for new API boundaries.
- **std::execution** (senders/receivers) — Powerful async framework, but steep learning curve, no scheduler ships with it, and poor documentation. Wait for ecosystem maturity.

See [cpp26-features.md](./references/cpp26-features.md).

## Compiler Hardening Quick Reference

### Essential Flags (GCC + Clang)

In NodeTool, package V sets these flags. A package does not add them.

```
-Wall -Wextra -Wpedantic -Werror
-D_FORTIFY_SOURCE=3
-fstack-protector-strong
-fstack-clash-protection
-ftrivial-auto-var-init=zero
-fPIE -pie
-Wl,-z,relro,-z,now
```

### Clang-Specific

```
-Wunsafe-buffer-usage
```

### Hardened libc++ (Clang/libc++ only)

```
-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST
```

Google deployed this across Chrome and their server fleet: ~0.3% overhead, 1000+ bugs found, 30% reduction in production segfaults.

See [compiler-hardening.md](./references/compiler-hardening.md) for the full guide.

## Rationalizations to Reject

| Rationalization | Why It's Wrong |
|----------------|----------------|
| "It compiles without warnings" | Warnings depend on which flags you enable. Add `-Wall -Wextra -Wpedantic`. |
| "ASan is too slow for production" | Use GWP-ASan for sampling-based production detection (~0% overhead). |
| "We only use safe containers" | Iterator invalidation and unchecked `optional` access are still exploitable. |
| "Smart pointers are slower" | `std::unique_ptr` has zero overhead vs raw pointers. Measure before claiming. |
| "Our code doesn't have memory bugs" | Google found 1000+ bugs when enabling hardened libc++. So did everyone else. |
| "C++26 features aren't available yet" | C++20/23 features are. Hardening flags work on any standard. Start there. |
| "Modern C++ is harder to read" | `std::expected` is more readable than checking error codes across 5 out-params. |

## Best Practices Checklist

- [ ] Use smart pointers for ownership, raw pointers only for non-owning observation
- [ ] Prefer `std::span` over pointer + length for function parameters
- [ ] Use `std::expected` for functions that can fail with typed errors (NodeTool: `std::optional` or a result struct, as the surrounding code does)
- [ ] Constrain templates with concepts, not SFINAE
- [ ] Enable compiler hardening flags and hardened libc++ in all builds
- [ ] Run ASan + UBSan in CI; add TSan for concurrent code
- [ ] Use `constexpr` / `consteval` where possible (UB-free by design)
- [ ] Mark functions `[[nodiscard]]` when ignoring the return value is likely a bug
- [ ] Prefer value semantics; use `std::variant` over `union`, `enum class` over `enum`
- [ ] Initialize all variables at declaration

## Read Next

- [anti-patterns.md](./references/anti-patterns.md) — Full legacy-to-modern migration table (30+ patterns)
- [cpp20-features.md](./references/cpp20-features.md) — Concepts, ranges, span, format, coroutines
- [cpp23-features.md](./references/cpp23-features.md) — expected, print, deducing this, flat_map
- [cpp26-features.md](./references/cpp26-features.md) — Reflection, contracts, memory safety improvements
- [compiler-hardening.md](./references/compiler-hardening.md) — Flags, sanitizers, hardened libc++
- [safe-idioms.md](./references/safe-idioms.md) — Security patterns by vulnerability class

## Source

Adapted from [trailofbits/skills](https://github.com/trailofbits/skills/tree/123037ec8aed26f0d86327cc39137ee5043e5deb/plugins/modern-cpp/skills/modern-cpp)
under [CC BY-SA 4.0](../LICENSE-trailofbits-skills). NodeTool changed this
file: it added the NodeTool Project Rules section and the NodeTool notes in
the anti-pattern table, the decision tree, Tier 2, the flag reference and
the checklist. The reference files are unchanged.
