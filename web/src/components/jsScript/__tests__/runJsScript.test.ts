import { stub } from "../../../test-utils/doubles";
import { restFetch } from "../../../lib/rest-fetch";
import { runJsScript } from "../runJsScript";

jest.mock("../../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));

it("passes the reserved app run identity with a pinned script request", async () => {
  const result = {
    ok: true,
    outputs: { answer: "result" },
    logs: [],
    duration_ms: 1
  };
  jest.mocked(restFetch).mockResolvedValue(
    stub<Response>({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => result
    })
  );
  await expect(
    runJsScript("script", { prompt: "input" }, undefined, 2, undefined, {
      app_run_id: "full-run-id",
      instance_id: "full-instance-id"
    })
  ).resolves.toEqual(result);
  const [path, init] = jest.mocked(restFetch).mock.calls[0];
  expect(path).toBe("/api/js-scripts/script/run");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({
    inputs: { prompt: "input" },
    script_version: 2,
    app_run_id: "full-run-id",
    instance_id: "full-instance-id"
  });
});
