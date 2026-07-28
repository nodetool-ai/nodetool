import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  packWebSocketMessage,
  unpackWebSocketMessage
} from "../src/messagepack.js";

interface BaselineFixture {
  websocket: {
    request: Record<string, unknown>;
    response: Record<string, unknown>;
    text_request: string;
    text_response: string;
    messagepack_request_hex: string;
    messagepack_hex: string;
  };
}

function loadFixture(): BaselineFixture {
  const path = new URL(
    "../../protocol/fixtures/sdk-v1-baseline.json",
    import.meta.url
  );
  return JSON.parse(readFileSync(path, "utf8")) as BaselineFixture;
}

describe("SDK v1 baseline wire fixtures", () => {
  const fixture = loadFixture();

  it("locks the JSON-text request and response bytes", () => {
    expect(JSON.stringify(fixture.websocket.request)).toBe(
      fixture.websocket.text_request
    );
    expect(JSON.stringify(fixture.websocket.response)).toBe(
      fixture.websocket.text_response
    );
  });

  it("locks interoperable MessagePack request and response bytes", () => {
    const encodedRequest = packWebSocketMessage(fixture.websocket.request);
    expect(Buffer.from(encodedRequest).toString("hex")).toBe(
      fixture.websocket.messagepack_request_hex
    );
    expect(unpackWebSocketMessage(encodedRequest)).toEqual(
      fixture.websocket.request
    );

    const encodedResponse = packWebSocketMessage(fixture.websocket.response);
    expect(Buffer.from(encodedResponse).toString("hex")).toBe(
      fixture.websocket.messagepack_hex
    );
    expect(unpackWebSocketMessage(encodedResponse)).toEqual(
      fixture.websocket.response
    );
  });
});
