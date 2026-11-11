# Graph runner async host: review backlog

Review findings at P2 or lower that remain open after the host conversions
in [the async host plan](graph-runner-async-host.md). Only P0 and P1
findings block a merge. Close an item by moving it to the Closed section with
the commit that fixed it.

| ID | Area | Finding | Notes |
|---|---|---|---|
| B1 | Files | Recursive removal on platforms other than Linux reads names through a directory stream whose buffer is assumed to be at most 64 KiB. | Unverified on macOS. Replace with a bounded enumeration that owns its buffer, such as `getattrlistbulk`, once a macOS build can test it. |
| B2 | Files | Removal's final `unlinkat(..., AT_REMOVEDIR)` can remove an empty directory that another process swapped in at the same name. Concurrent insertion fails with ENOTEMPTY. | It cannot follow a symlink or remove contents. No test covers these outcomes. |
| B3 | Assets | A synchronous asset write or removal fails with EBUSY when the asset has a pending operation. This includes a concurrent synchronous write from a second unbound engine, which used to succeed. | Accepted to remove the queue wait and its deadlocks. The caller retries. Documented in the graph runner README. |
| B4 | Images | libvips worker threads produce ThreadSanitizer reports on the synchronous path, before these changes. | A rule 15 violation in [native/AGENTS.md](../../native/AGENTS.md). Needs a libvips answer or a separate fix. |
| B5 | Images | Duplicate keys in an image spec do not always resolve to the last occurrence. | Not reachable from the guest, which builds specs with `JSON.stringify`. |
| B6 | Images | The spec parser rejects a number that underflows, such as `1e-999`, where the old parser read 0. | Not reachable from the guest. |
| B7 | Images | The spec parser does not validate unescaped UTF-8 in strings it skips. | Not reachable from the guest. |
| B8 | Images | The 89-byte bound on parser error messages is derived for libstdc++. Floating-point `std::from_chars` support in older Apple libc++ is unverified. | |
| B9 | Media | The encoder option classifier can disagree with `JSON.stringify` for unusual guest values: it reads `toJSON` twice, treats objects inheriting from `String.prototype` as boxed strings, and calls an overridable Boolean `valueOf`. | Read `toJSON` once, check boxed values by their internal slot, and add tests for these cases. |

## Closed

None yet.
