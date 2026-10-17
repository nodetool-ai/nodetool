import { z } from "zod";
import { gameVector3 } from "@nodetool-ai/protocol";
import { MAX_GAME_ROUTE_TICKS } from "@nodetool-ai/game-runtime";

const tick = z.number().int().min(0).max(MAX_GAME_ROUTE_TICKS);
const noScriptErrors = z.strictObject({ no_script_errors: z.literal(true) });
const event = z.strictObject({ event: z.string().min(1), before_tick: tick.optional() });

export const gameAssertions2D = z.array(z.union([
  noScriptErrors,
  event,
  z.strictObject({
    entity_id: z.string().min(1),
    near: z.strictObject({ x: z.number().finite(), y: z.number().finite(), tolerance: z.number().finite().nonnegative().optional() }),
    at_tick: tick.optional()
  })
]));

export const gameAssertions3D = z.array(z.union([
  noScriptErrors,
  event,
  z.strictObject({ replay_matches: z.literal(true) }),
  z.strictObject({
    entity_id: z.string().min(1),
    near: gameVector3.extend({ tolerance: z.number().finite().nonnegative() }),
    at_tick: tick.optional()
  }),
  z.strictObject({
    entity_id: z.string().min(1),
    region: z.strictObject({ min: gameVector3, max: gameVector3 }),
    at_tick: tick.optional()
  }),
  z.strictObject({ entity_id: z.string().min(1), grounded: z.boolean(), at_tick: tick.optional() })
]));
