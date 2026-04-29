/**
 * Bridge protocol versioning between the JS runtime and the Python worker.
 *
 * Lives in @nodetool-ai/protocol (not @nodetool-ai/runtime) so the Electron
 * main process can read these constants without dragging the runtime barrel
 * — which re-exports every LLM provider with their heavy SDK imports —
 * into the main bundle.
 *
 * Bumped only when the stdio worker protocol changes in a non-backward-
 * compatible way (new message types, framing changes, schema breaks).
 * Most JS or Python releases do NOT bump this — we want to allow the JS
 * and Python sides to ship on independent cadences.
 *
 * Coupling rules:
 *
 *   - `BRIDGE_PROTOCOL_VERSION` is what the JS runtime speaks. The Python
 *     worker reports its own value in its `discover` response.
 *   - `MIN_NODETOOL_CORE_VERSION` is the lowest published `nodetool-core`
 *     PEP 440 version that ships `BRIDGE_PROTOCOL_VERSION`. The Electron
 *     installer pins `nodetool-core>=MIN_NODETOOL_CORE_VERSION` and the
 *     prebuild check refuses to ship if the registry has no wheel that
 *     satisfies the constraint.
 *
 * On a breaking protocol change:
 *
 *   1. Bump `BRIDGE_PROTOCOL_VERSION` here AND in
 *      `nodetool-core/src/nodetool/worker/__init__.py` (lockstep).
 *   2. Cut a new `nodetool-core` release containing the bump.
 *   3. Update `MIN_NODETOOL_CORE_VERSION` to that new release.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

/**
 * Lowest published nodetool-core version (PEP 440 string) that speaks
 * `BRIDGE_PROTOCOL_VERSION` AND reports it in its `discover` response.
 * Used by the prebuild registry check and the Electron installer's pin
 * specifier.
 *
 * IMPORTANT: when you publish a new nodetool-core release that bumps
 * BRIDGE_PROTOCOL_VERSION, update this string to that new release. The
 * prebuild check will refuse to build the Electron app until a wheel
 * satisfying this lower bound exists on the registry.
 */
export const MIN_NODETOOL_CORE_VERSION = "0.7.0rc8";
