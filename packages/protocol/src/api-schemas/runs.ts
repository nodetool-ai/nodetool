import { z } from "zod";
export * from "../run-readers.js";
export const runReaderIdSchema = z.object({ id: z.string().min(1).max(200) });
