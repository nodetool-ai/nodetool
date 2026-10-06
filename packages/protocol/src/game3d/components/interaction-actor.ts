import { z } from "zod";

export const gameInteractionActor3DComponent = z.strictObject({ collects: z.boolean().default(false), activatesTriggers: z.boolean().default(false) }).optional();
