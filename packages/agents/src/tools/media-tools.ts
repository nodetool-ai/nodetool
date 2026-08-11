/**
 * Generic provider-backed media generation tools for any agent loop.
 *
 * The implementations live in the `media` capability module
 * (`../capabilities/media.ts`) and arrive here through the registry's eager
 * spec table: each spec becomes a `Tool` whose implementation loads at first
 * call. The run is built per call from the `ProcessingContext`, so the tools
 * work wherever a context exists — an AgentNode hydrating a saved belt does
 * not need a providers map up front.
 */

import { mediaSpecs } from "../capabilities/media.specs.js";
import { toolFromLazyCapability } from "../capabilities/lazy-tool.js";
import type { Tool } from "./base-tool.js";

/** Every media capability as a `Tool`. */
export function getMediaTools(): Tool[] {
  return mediaSpecs.map((spec) => toolFromLazyCapability(spec));
}
