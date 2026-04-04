/**
 * Playwright global setup: starts the mock API server before any tests run.
 *
 * The mock server listens on port 4444.
 * The Vite dev server must be started with PROXY_API_TARGET=http://localhost:4444
 * so its proxy forwards all /api/* requests to the mock server.
 *
 * playwright.config.ts references this file via `globalSetup`.
 */

import { startMockServer } from "./benchmarks/helpers/mockServer.js";

const MOCK_PORT = 4444;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await startMockServer(MOCK_PORT);

  // Return teardown function (called after all tests complete)
  return async () => {
    await server.close();
    console.log("[mock-server] Stopped");
  };
}
