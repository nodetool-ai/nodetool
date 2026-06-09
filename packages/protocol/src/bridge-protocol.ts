/**
 * Bridge protocol versioning between the JS runtime and the Python worker.
 *
 * Lives in @nodetool-ai/protocol (not @nodetool-ai/runtime) so the Electron
 * main process can read these constants without dragging the runtime barrel
 * — which re-exports every LLM provider with their heavy SDK imports —
 * into the main bundle.
 *
 * Two distinct numbers, deliberately decoupled so the JS and Python sides can
 * ship on independent cadences:
 *
 *   - `BRIDGE_PROTOCOL_VERSION` — the protocol the JS runtime currently
 *     *speaks*. Bumped whenever the JS side gains awareness of new wire
 *     features (e.g. new message types). Features are negotiated against the
 *     value the worker reports in its `discover`/`worker.status` response, so
 *     a newer JS runtime can still drive an older worker for everything that
 *     worker understands.
 *   - `MIN_BRIDGE_PROTOCOL_VERSION` — the *hard floor*. The JS runtime refuses
 *     to connect to a worker reporting a protocol below this. Bumped ONLY for
 *     genuinely backward-incompatible changes (framing changes, schema breaks,
 *     a removed/changed message). Additive changes (new message types the old
 *     worker simply never receives) MUST NOT move this floor — they are gated
 *     per-feature instead (see `supportsModelManagement`).
 *
 * Coupling rules:
 *
 *   - The Python worker reports its own `BRIDGE_PROTOCOL_VERSION` in its
 *     `discover`/`worker.status` responses.
 *   - `MIN_NODETOOL_CORE_VERSION` is the lowest published `nodetool-core`
 *     PEP 440 version the Electron installer pins. The prebuild check refuses
 *     to ship if the registry has no wheel that satisfies the constraint.
 *
 * On an ADDITIVE protocol change (new message types, no break):
 *
 *   1. Bump `BRIDGE_PROTOCOL_VERSION` here AND in
 *      `nodetool-core/src/nodetool/worker/__init__.py` (lockstep).
 *   2. Gate the new feature on the reported version (e.g. a `supportsX()`
 *      capability check). Leave `MIN_BRIDGE_PROTOCOL_VERSION` untouched so
 *      existing workers keep connecting and simply don't offer the feature.
 *
 * On a BREAKING protocol change:
 *
 *   1. Bump `BRIDGE_PROTOCOL_VERSION` AND `MIN_BRIDGE_PROTOCOL_VERSION` here
 *      and in `nodetool-core` (lockstep).
 *   2. Cut a new `nodetool-core` release containing the bump.
 *   3. Update `MIN_NODETOOL_CORE_VERSION` to that new release.
 */

export const BRIDGE_PROTOCOL_VERSION = 2;

/**
 * Hard floor: the JS runtime rejects (at `discover`) any worker reporting a
 * protocol below this. Stays at 1 because every protocol change so far has
 * been additive — `models.*` (v2) is negotiated via `supportsModelManagement`,
 * so a v1 worker still connects and runs every pre-v2 feature; it just doesn't
 * expose worker model management. Move this only for a real wire break.
 */
export const MIN_BRIDGE_PROTOCOL_VERSION = 1;

/**
 * Lowest published nodetool-core version (PEP 440 string) the Electron
 * installer pins. Used by the prebuild registry check and the installer's pin
 * specifier.
 *
 * This tracks `MIN_BRIDGE_PROTOCOL_VERSION` (the connection floor), NOT
 * `BRIDGE_PROTOCOL_VERSION`: an additive bump does not require a new minimum
 * wheel, because older wheels still connect and run. Bump this only when
 * `MIN_BRIDGE_PROTOCOL_VERSION` moves and a wheel carrying that floor exists.
 */
export const MIN_NODETOOL_CORE_VERSION = "0.7.0";
