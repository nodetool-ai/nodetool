---
layout: page
title: "nodetool.control Nodes"
---

This namespace contains 22 node(s).

## Available Nodes

- **[Asset Collection](assetcollection.md)** - A curated collection of assets of a single type. Streams each item one at a t...
- **[Chunk](chunk.md)** - Group every N items into a list and emit as a batch. Trailing partial batch i...
- **[Collect](collect.md)** - Collect items until the end of the stream and return them as a list.
- **[Count](count.md)** - Emit the total number of items when the stream ends.
- **[Cross](cross.md)** - Emit the cartesian product of two iteration sources within their common parent.
- **[Distinct](distinct.md)** - Drop duplicate items from a stream. Optional key expression for grouping.
- **[Drop](drop.md)** - Skip the first N items of a stream, pass the rest through.
- **[Drop While](dropwhile.md)** - Drop items while a predicate is truthy, then pass everything after.
- **[Fallback](fallback.md)** - Substitute a fallback value when the input is null or undefined. Does not cat...
- **[Filter (Expression)](filterexpression.md)** - Pass items through when a safe expression returns truthy (comparisons, boolea...
- **[Filter Equal](filterequal.md)** - Pass items through only when they equal a target value.
- **[For Each](foreach.md)** - Iterate over a list and emit each item sequentially.
- **[If](if.md)** - Conditionally executes one of two branches based on a condition.
- **[Last](last.md)** - Emit only the final item of a stream.
- **[Repeat Count](repeatcount.md)** - Emit N sequential ticks without needing an input list.
- **[Repeat Value](repeatvalue.md)** - Emit the same value N times without building a list first.
- **[Reroute](reroute.md)** - Pass data through unchanged for tidier workflow layouts.
- **[Switch](switch.md)** - Multi-branch routing: match a value against cases and route to the matching o...
- **[Take](take.md)** - Pass through the first N items of a stream and stop.
- **[Take While](takewhile.md)** - Pass items through while a predicate is truthy. Stops at the first failure.
- **[Tap](tap.md)** - Passthrough that logs each item to the console as a side effect.
- **[Zip](zip.md)** - Pair items from two independent iteration sources by matched index within the...
