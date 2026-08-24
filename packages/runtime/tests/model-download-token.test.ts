/**
 * Regression: `models.download` carries an optional HuggingFace token.
 *
 * A rented worker holds no credential, so a gated repo (FLUX.1-dev, RMBG-2.0)
 * answers `401 ... Token present: False`. The host supplies the token per
 * request and the worker uses it for that download only — the Python half is
 * nodetool-ai/nodetool-core#1008.
 *
 * Drives the real bridge against the in-process fake worker and reads the frame
 * the worker actually received, so this measures the wire, not the call.
 */

import { describe, it, expect, afterEach } from "vitest";

import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import {
  startFakeWorker,
  type FakeWorkerHandle
} from "./python-websocket-bridge.test-helpers.js";

describe("models.download token", () => {
  let worker: FakeWorkerHandle | null = null;
  let bridge: WebsocketPythonBridge | null = null;

  afterEach(async () => {
    if (bridge) {
      bridge.close();
      bridge = null;
    }
    if (worker) {
      await worker.close();
      worker = null;
    }
  });

  /** Connect, run one download, and return the payload the worker received. */
  async function downloadWith(
    token: string | null | undefined
  ): Promise<Record<string, unknown>> {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();

    await bridge.downloadModel({ repo_id: "org/gated", token }, () => {});

    const frames = worker.received("models.download");
    expect(frames).toHaveLength(1);
    return frames[0]!.data as Record<string, unknown>;
  }

  it("sends the token when the host resolved one", async () => {
    const data = await downloadWith("hf_supplied_by_host");
    expect(data["token"]).toBe("hf_supplied_by_host");
    expect(data["repo_id"]).toBe("org/gated");
  });

  it("omits the field entirely when no token is available", async () => {
    const data = await downloadWith(undefined);
    expect(data).not.toHaveProperty("token");
  });

  it("treats an empty string as absent rather than sending a blank credential", async () => {
    // `Authorization: Bearer ` fails differently than sending no header, and
    // worse for a public repo — so a blank value must not reach the wire.
    const data = await downloadWith("");
    expect(data).not.toHaveProperty("token");
  });

  it("treats a whitespace-only token as absent", async () => {
    const data = await downloadWith("   ");
    expect(data).not.toHaveProperty("token");
  });

  it("treats null as absent", async () => {
    const data = await downloadWith(null);
    expect(data).not.toHaveProperty("token");
  });

  it("trims a padded token before sending it", async () => {
    const data = await downloadWith("  hf_padded\n");
    expect(data["token"]).toBe("hf_padded");
  });

  it("keeps the token out of every frame the worker sends back", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();

    const updates: unknown[] = [];
    await bridge.downloadModel({ repo_id: "org/gated", token: "hf_secret" }, (u) =>
      updates.push(u)
    );

    expect(updates.length).toBeGreaterThan(0);
    expect(JSON.stringify(updates)).not.toContain("hf_secret");
  });
});
