# Realtime engine

Follow the [native ownership and sanitizer rules](../AGENTS.md) and the
[realtime design](../../docs/plans/graph-runner-realtime.md).

The engine is C++20 and has no Qt or QuickJS dependency. Prepare-thread code
loads and validates immutable plans. Frame and quantum execution must not
parse JSON, allocate, block, log or perform file I/O.

Keep the [provisional milestone status](M1_STATUS.md) accurate. M0 hardware
measurements and R1/R2 decisions remain prerequisites for qualification.
Offline tests cannot replace device, surface or physical-recording evidence.

Keep fixtures, schema and loader validation in agreement. Rejections identify
the graph node and a stable reason. Reject a candidate before publishing it,
so the caller can retain its active plan.

Use [the build and test commands](README.md#build-and-test). Include negative
cases for each new validation rule and test graph validation on large inputs.
