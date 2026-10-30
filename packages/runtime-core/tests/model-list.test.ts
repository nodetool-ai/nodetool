import { expect, it } from "vitest";
import { OpenAITextProvider } from "../src/index.js";

it("lists model metadata through the authenticated official SDK transport", async () => {
  const calls: string[] = [];
  const provider = new OpenAITextProvider({
    apiKey: "fixture-secret",
    baseURL: "https://compatible.example/v1",
    fetch: async (input, init) => {
      calls.push(String(input));
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-secret");
      expect(init?.redirect).toBe("manual");
      return Response.json({ object: "list", data: [
        { id: "fixture-one", object: "model", created: 123, owned_by: "example" },
        { id: "fixture-two", object: "model", created: 456, owned_by: "other" }
      ] });
    }
  });
  expect(await provider.listModels(new AbortController().signal)).toEqual([
    { id: "fixture-one", created: 123, ownedBy: "example" },
    { id: "fixture-two", created: 456, ownedBy: "other" }
  ]);
  expect(calls).toEqual(["https://compatible.example/v1/models"]);
});

it("cancels in-flight model listing and rejects already-aborted calls without fetching", async () => {
  const controller = new AbortController();
  let calls = 0;
  const provider = new OpenAITextProvider({
    apiKey: "fixture",
    fetch: async (_input, init) => {
      calls++;
      const signal = init?.signal;
      if (!signal) { throw new Error("Missing cancellation signal"); }
      return await new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
        controller.abort();
      });
    }
  });
  await expect(provider.listModels(controller.signal)).rejects.toThrow();
  expect(calls).toBe(1);
  await expect(provider.listModels(controller.signal)).rejects.toThrow();
  expect(calls).toBe(1);
});
