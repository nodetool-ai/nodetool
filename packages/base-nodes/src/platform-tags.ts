/**
 * Platform tagging helpers for base-nodes.
 *
 * `tagAsPortable(classes)` stamps `static platforms` on every class in a
 * registration array so the registry / runner sees the broader platform
 * set without a per-class boilerplate line. Classes that already declare
 * their own `static platforms` are left alone — a per-class override
 * always wins.
 *
 * Usage:
 *   export const CONTROL_NODES = tagAsPortable([IfNode, ForEachNode, ...]);
 *
 * The mutation is a one-time `Object.defineProperty` at module load. After
 * that the class reads `platforms` like any other static — `getNodeMetadata`
 * picks it up and the registry filter / validator behave correctly.
 */

import type { NodeClass } from "@nodetool-ai/node-sdk";
import { ALL_PLATFORMS, type Platform } from "@nodetool-ai/protocol";

function tagWith<T extends readonly NodeClass[]>(
  classes: T,
  platforms: readonly Platform[]
): T {
  for (const cls of classes) {
    if (cls.platforms !== undefined) continue;
    Object.defineProperty(cls, "platforms", {
      value: platforms,
      writable: false,
      configurable: true,
      enumerable: true
    });
  }
  return classes;
}

/** Tag every class in `classes` as supporting node + workers + edge. */
export function tagAsPortable<T extends readonly NodeClass[]>(classes: T): T {
  return tagWith(classes, ALL_PLATFORMS);
}
