import { z } from "zod";
import { gameEnvironment3D, gameSky3D, gamePostProcessing3D } from "./game3d/components/environment.js";
import { gameShadowSettings3D } from "./game3d/components/shadows.js";
import { gameHeightFog3D } from "./game3d/components/height-fog.js";
import { gameLight3D } from "./game3d/components/light.js";
import { gameMaterial3D } from "./game3d/components/material.js";
import { gameDecal3D } from "./game3d/components/decal.js";
import { gameParticleEmitter, gameParticleShape, gameParticleRender } from "./game-particles.js";
import { gameUiTree, gameUiFrame, gameUiNode } from "./game-ui.js";

/** Native presentation currently implements the BLACKSITE branches of the shared authoring vocabulary. */
export const nativeGameEnvironment3D = gameEnvironment3D.extend({
  shadows: gameShadowSettings3D.extend({extent:z.number().finite().positive().max(1_000_000)}).default({enabled:true,mapSize:1024,extent:30}),
  sky: z.discriminatedUnion("kind", [gameSky3D.options[0], gameSky3D.options[2]]).optional(),
  fog: gameHeightFog3D.optional(),
  postProcessing: gamePostProcessing3D.extend({ enabled: z.literal(true).default(true), toneMapping: z.literal("agx"), antialias: z.literal("smaa") })
});
export const nativeGameLight3D = z.discriminatedUnion("kind", [gameLight3D.options[0], gameLight3D.options[1].extend({range:z.number().finite().positive().max(1_000_000)})]);
export const nativeGameMaterial3D = gameMaterial3D.pick({ color: true, metalness: true, roughness: true, opacity: true, emissive: true, alphaMode: true, alphaCutoff: true });
export const nativeGameDecal3D = gameDecal3D;
export const nativeGameParticleRender = z.discriminatedUnion("kind", [
  gameParticleRender.options[0], gameParticleRender.options[1],
  gameParticleRender.options[2].extend({ shape: z.literal("tetrahedron"), align: z.literal("world").default("world") })
]);
const rotation = z.number().finite().min(-1_000_000).max(1_000_000);
const rotationRange = z.union([rotation, z.strictObject({min:rotation,max:rotation})]);
export const nativeGameParticleEmitter = gameParticleEmitter.omit({ onDeath: true, sprite: true, speedOverLifetime: true, layer: true }).extend({
  rotation: rotationRange.default(0), angularVelocity: rotationRange.default(0),
  opacityOverLifetime: gameParticleEmitter.shape.opacityOverLifetime.unwrap().element.extend({value:z.number().finite().min(0).max(1)}).array().min(1).max(16).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  shape: z.discriminatedUnion("kind", [gameParticleShape.options[0], gameParticleShape.options[2], gameParticleShape.options[3], gameParticleShape.options[4]]).default({ kind: "point" }),
  render: nativeGameParticleRender.optional()
});
export const nativeGameParticles = z.strictObject({ emitters: z.array(nativeGameParticleEmitter).min(1).max(8) });
const uiNode = z.discriminatedUnion("kind", [gameUiNode.options[0], gameUiNode.options[2], gameUiNode.options[3].omit({ source: true })]);
export const nativeGameUiTree = gameUiTree.omit({ focusNavigation: true }).extend({ nodes: z.array(uiNode).max(256) });
export const nativeGameUiFrame = gameUiFrame.extend({ focusNavigation: z.literal(false), nodes: z.array(uiNode).max(256) });
export const nativeGamePresentation = z.strictObject({ aspectRatio: z.number().finite().positive().max(100), hudWidth: z.number().finite().positive().max(4096), hudHeight: z.number().finite().positive().max(4096) });
const vector3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const nativeGameParticleSample = z.strictObject({
  entityId: z.string().min(1).max(128), emitterId: z.string().min(1).max(64),
  position: vector3, velocity: vector3, color: vector3, opacity: z.number().finite().min(0).max(1),
  life: z.number().finite().min(0).max(1), size: z.number().finite().min(0).max(100_000), rotation: z.number().finite(), age: z.number().finite().min(0).max(60), lifetime: z.number().finite().positive().max(60),
  render: nativeGameParticleRender, blend: z.enum(["normal", "additive"]), unlit: z.boolean(), softness: z.number().finite().min(0).max(100)
});
export type NativeGameParticleSample = z.infer<typeof nativeGameParticleSample>;
