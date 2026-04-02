import type { NodeClass, NodeRegistry } from "@nodetool/node-sdk";

// Generated modules — will be populated after code generation
export { KIE_IMAGE_NODES } from "./generated/image.js";
export { KIE_AUDIO_NODES } from "./generated/audio.js";
export { KIE_VIDEO_NODES } from "./generated/video.js";

/** Register all Kie.ai nodes in a registry. */
export function registerKieNodes(registry: NodeRegistry): void {
  // Dynamic import to avoid circular deps at load time
  const modules = [
    import("./generated/image.js"),
    import("./generated/audio.js"),
    import("./generated/video.js")
  ];
  for (const mod of modules) {
    void mod.then((m) => {
      for (const [, value] of Object.entries(m)) {
        if (Array.isArray(value)) {
          for (const cls of value as NodeClass[]) {
            registry.register(cls);
          }
        }
      }
    });
  }
}
