import { describe, expect, it } from "vitest";

import { handleTestUiApiRequest } from "../src/test-ui-server.js";

// Study 14: "Edit app" and every example script step answered "Not found" on
// the test server, because only production mounted these routes.
describe("handleTestUiApiRequest", () => {
  const post = (path: string) =>
    handleTestUiApiRequest(
      new Request(`http://127.0.0.1:7777${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }),
      {}
    );

  it("routes an example install to the installer", async () => {
    const response = await post("/api/applications/examples/no-such-app/install");
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain('No example app named "no-such-app"');
  });

  it("routes an example script run to the script runner", async () => {
    const response = await post(
      "/api/applications/examples/no-such-app/scripts/analyze/run"
    );
    const body = (await response.json()) as { detail?: string };
    expect(response.status).toBe(404);
    expect(body.detail).toBe("Example app script not found");
  });
});
