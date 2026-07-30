import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockMutate = jest.fn();
jest.mock("../../trpc/client", () => ({
  __esModule: true,
  trpcClient: {
    codeGen: { generate: { mutate: (...args: unknown[]) => mockMutate(...args) } }
  }
}));

import { toCodeGenFailure, useGenerateCode } from "../codeGen";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

const request: codeGen.CodeGenRequest = {
  instruction: "merge them",
  inputs: [],
  provider: "anthropic",
  model: "claude-sonnet-5"
};

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("toCodeGenFailure", () => {
  const onLine = (value: boolean) =>
    Object.defineProperty(navigator, "onLine", {
      value,
      configurable: true
    });

  afterEach(() => onLine(true));

  it("maps an aborted fetch onto the aborted code", () => {
    const error = new DOMException("aborted", "AbortError");
    expect(toCodeGenFailure(error)).toEqual({
      code: "aborted",
      message: "Generation cancelled."
    });
  });

  it("maps tRPC UNAUTHORIZED onto its own code", () => {
    const error = Object.assign(new Error("nope"), {
      data: { code: "UNAUTHORIZED" }
    });
    expect(toCodeGenFailure(error).code).toBe("unauthorized");
  });

  it("reports offline before falling back to internal", () => {
    onLine(false);
    expect(toCodeGenFailure(new Error("failed to fetch")).code).toBe("offline");
  });

  it("falls back to internal with the thrown message", () => {
    expect(toCodeGenFailure(new Error("boom"))).toEqual({
      code: "internal",
      message: "boom"
    });
  });
});

describe("useGenerateCode", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the server's response unchanged", async () => {
    const submission = {
      title: "t",
      summary: "s",
      code: "return { x: 1 };",
      inputs: [],
      outputs: [{ name: "x", type: { type: "int", type_args: [] } }]
    };
    mockMutate.mockResolvedValue({ status: "ok", submission });

    const { result } = renderHook(() => useGenerateCode(), { wrapper });
    act(() => result.current.generate(request));

    await waitFor(() =>
      expect(result.current.result).toEqual({ status: "ok", submission })
    );
    expect(mockMutate).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("never rejects — a thrown transport error becomes a failure result", async () => {
    mockMutate.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useGenerateCode(), { wrapper });
    act(() => result.current.generate(request));

    await waitFor(() =>
      expect(result.current.result).toEqual({
        status: "error",
        error: { code: "internal", message: "boom" }
      })
    );
  });

  it("aborts the in-flight request on cancel", async () => {
    let captured: AbortSignal | undefined;
    mockMutate.mockImplementation(
      (_input: unknown, opts: { signal: AbortSignal }) => {
        captured = opts.signal;
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        });
      }
    );

    const { result } = renderHook(() => useGenerateCode(), { wrapper });
    act(() => result.current.generate(request));
    await waitFor(() => expect(captured).toBeDefined());

    act(() => result.current.cancel());

    expect(captured?.aborted).toBe(true);
    await waitFor(() =>
      expect(result.current.result).toEqual({
        status: "error",
        error: { code: "aborted", message: "Generation cancelled." }
      })
    );
  });
});
