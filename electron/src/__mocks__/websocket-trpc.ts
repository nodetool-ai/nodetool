// Minimal stub for @nodetool-ai/websocket/trpc.
// The real module requires the full server bundle to be built.
// api.ts only uses `AppRouter` as a type to parameterise createTRPCClient<AppRouter>.
import type { AnyRouter } from "@trpc/server";
export type AppRouter = AnyRouter;
