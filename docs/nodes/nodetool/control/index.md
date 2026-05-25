---
layout: page
title: "nodetool.control Nodes"
---

This namespace contains 17 node(s).

## Available Nodes

- **[Chunk](chunk.md)** - Group every N items into a list and emit as a batch. Trailing partial batch i...
- **[Collect](collect.md)** - Collect items until the end of the stream and return them as a list.
- **[Count](count.md)** - Emit the total number of items when the stream ends.
- **[Distinct](distinct.md)** - Drop duplicate items from a stream. Optional key expression for grouping.
- **[Drop](drop.md)** - Skip the first N items of a stream, pass the rest through.
- **[Drop While](dropwhile.md)** - Drop items while a predicate is truthy, then pass everything after.
- **[Filter (Code)](filtercode.md)** - Pass items through when a JavaScript predicate returns truthy.
- **[Filter Equal](filterequal.md)** - Pass items through only when they equal a target value.
- **[For Each](foreach.md)** - Iterate over a list and emit each item sequentially.
- **[If](if.md)** - Conditionally executes one of two branches based on a condition.
- **[Last](last.md)** - Emit only the final item of a stream.
- **[Reroute](reroute.md)** - Pass data through unchanged for tidier workflow layouts.
- **[Switch](switch.md)** - Multi-branch routing: match a value against cases and route to the matching o...
- **[Take](take.md)** - Pass through the first N items of a stream and stop.
- **[Take While](takewhile.md)** - Pass items through while a predicate is truthy. Stops at the first failure.
- **[Tap](tap.md)** - Passthrough that logs each item to the console as a side effect.
- **[Try / Catch](trycatch.md)** - Error handling wrapper: passes the value through on success, or returns error...
