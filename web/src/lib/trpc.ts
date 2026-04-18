// Single vanilla tRPC client for non-React contexts (Zustand stores, helpers).
// React components use `trpc` from `web/src/trpc/client.ts` (react-query hooks).
// This module re-exports the singleton from `trpc/client.ts` to avoid two
// clients with separate httpBatchLink batches.
export { trpcClient as trpc } from "../trpc/client";
