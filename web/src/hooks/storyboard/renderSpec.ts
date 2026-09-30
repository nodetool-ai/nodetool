/**
 * The fixed part of what a storyboard render asks for.
 *
 * Resolution tiers the old generation nodes applied implicitly through their
 * property defaults — `1K` on the image nodes (packages/image-nodes), `1080p`
 * on ImageToVideo (packages/video-nodes). The direct requests must carry them
 * or the provider falls back to its own default.
 *
 * They live apart from `useGenerateShot` so the cost estimate can price the
 * rung the render actually sends without pulling in the websocket machinery
 * that starts one.
 */

export { STILL_RESOLUTION, CLIP_RESOLUTION } from "@nodetool-ai/protocol";
