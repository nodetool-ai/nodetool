# Native C++ and Qt — Agent Rules

These rules apply to every project under `native/`: the C++/Qt editors, the
media pipeline, the graph runner and the VST host. Area overlays such as
[Native UI primitives](ui_primitives/AGENTS.md) and
[Native chat](chat/AGENTS.md) add to them. For C++ idioms, use the
[modern-cpp skill](../.claude/skills/modern-cpp/SKILL.md).

The memory and thread ownership rules below are non-negotiable. Code that
breaks any of them has a bug, even when it compiles and its tests pass. If a
requirement cannot be met cleanly, stop and explain the conflict instead of
working around these rules.

Code that predates these rules carries a marker at each known violation:
`// native-rules #N: <why it breaks rule N>`. When you change marked code,
bring it into line with the rule and delete the marker. Never add new code
that needs a marker.

## Ownership

1. Every heap object has exactly one owner, expressed in the type.
   - Unique ownership uses `std::unique_ptr`. This is the default.
   - Shared ownership uses `std::shared_ptr` only with a comment that
     explains why unique ownership is impossible.
   - Raw pointers and references are non-owning and must never outlive the
     owner. Never call `delete` on a raw pointer.
2. Never write a naked `new` or `delete`. Use `std::make_unique` or
   `std::make_shared`. The exception is a Qt object parented to a QObject
   tree, whose parent must be documented.
3. Never mix Qt parent ownership and smart pointers on the same object.
4. Function signatures state ownership.
   - A function that takes ownership receives `std::unique_ptr<T>` by value.
   - A function that borrows receives `T&` or `const T&`, or `T*` when the
     argument is nullable.
   - Never return a raw pointer that the caller is expected to free.

## Media buffers and frames

5. Frames, audio buffers and GPU resources are owned by a single RAII handle
   type, such as `FrameHandle` or `GpuTexture`. Never pass a raw `AVFrame*`,
   buffer pointer or native GPU handle across a module boundary.
6. Wrap every C API resource (FFmpeg, Vulkan, Metal, audio APIs) in an RAII
   type with a custom deleter, immediately at the call site.
7. Moving a frame between pipeline stages is a move, never a copy of the
   pointer. After `std::move`, the source is not touched again.
8. A pooled buffer returns to its pool through its RAII destructor, never
   through a manual `release()` call.

## Threads

9. Every class declares its thread affinity in a comment at its top: UI
   thread only, decoder thread only, render thread only, or thread-safe with
   the synchronization mechanism named.
10. Data crosses threads only through an explicit handoff: a queue, a
    channel or a Qt queued signal. Shared mutable state needs a mutex,
    documented next to the data it guards.
11. A QObject is touched only on its owning thread. Make cross-thread calls
    with `QMetaObject::invokeMethod` and `Qt::QueuedConnection`.
12. Never capture a raw `this` or a raw pointer in a lambda that runs on
    another thread or later in time. Capture a `std::weak_ptr` or a
    `QPointer` and check it before use.

## Lifetime

13. Callbacks, signals and async tasks must not outlive the objects they
    reference. Disconnect or cancel them in the destructor.
14. Do not add global or static mutable state. One exception exists: the
    graph runner's process lane registry in
    `graph-runner/src/kernel/host_lanes.cpp` is never destroyed, because lane
    threads can still run when static destructors do. It may hold the host
    lanes, the job disposer and the asset destination queue, and nothing
    else. Its markers stay. Adding anything else to it needs a new decision.

## Verification

15. All code must pass AddressSanitizer, UndefinedBehaviorSanitizer and
    ThreadSanitizer builds. Fix sanitizer findings instead of suppressing
    them.
16. For every change that touches buffers or threads, the summary states who
    owns each new object, which thread touches it, and how it is destroyed.
17. After a C++ change, run `npm run test:affected:native`. It builds and runs
    only the ctest tests that depend on the changed files. Pass
    `--build <project>=<dir>` to reuse a build directory, and `--dry-run` to
    see the selection first. A project with changes and no configured build
    fails the run and prints the command that configures it.
