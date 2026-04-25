import { describe, expect, it } from "vitest";
import {
  runWeriftMediaSpike,
  type WebRtcSpikeResult
} from "../src/realtime/webrtc-spike.js";

describe("server-side WebRTC spike", () => {
  it("proves werift offer-answer, ICE connection, and clean teardown", async () => {
    const result = await runWeriftMediaSpike();

    expect(result.offerAnswer).toBe("passed");
    expect(result.iceConnected).toBe("passed");
    expect(result.teardown).toBe("passed");
  });

  it("reports inbound and outbound media feasibility explicitly", async () => {
    const result: WebRtcSpikeResult = await runWeriftMediaSpike();

    expect(result.inboundRtp).toBe("passed");
    expect(result.decodedVideoFrame).toBe("unsupported");
    expect(result.outboundEncodedTrack).toBe("unsupported");
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
