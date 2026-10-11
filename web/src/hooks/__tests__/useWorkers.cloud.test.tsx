/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("../../lib/env", () => ({
  isLocalhost: false,
  isElectron: false,
  isProduction: true
}));

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    worker: {
      profiles: { list: { query: jest.fn() } },
      instances: { list: { query: jest.fn() } },
      apiKeyStatus: { query: jest.fn() },
      health: { query: jest.fn() }
    }
  }
}));

import { trpcClient } from "../../trpc/client";
import { useActiveWorker, useWorkerHealth, useWorkers } from "../useWorkers";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

describe("useWorkers on the hosted app", () => {
  it("never calls the worker router, which the cloud API refuses", async () => {
    const { result } = renderHook(
      () => ({
        workers: useWorkers(),
        active: useActiveWorker(),
        health: useWorkerHealth("i-1", true)
      }),
      { wrapper }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trpcClient.worker.profiles.list.query).not.toHaveBeenCalled();
    expect(trpcClient.worker.instances.list.query).not.toHaveBeenCalled();
    expect(trpcClient.worker.apiKeyStatus.query).not.toHaveBeenCalled();
    expect(trpcClient.worker.health.query).not.toHaveBeenCalled();
    expect(result.current.workers.profiles).toEqual([]);
    expect(result.current.workers.instances).toEqual([]);
    expect(result.current.active).toBeNull();
  });
});
