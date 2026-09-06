/**
 * A line's failure reason is written to the document, synced to the server and
 * rendered in the editor (F8), so whatever a provider put in its error body
 * travels with it. Repo rule: secrets never appear in messages. This pins the
 * redaction that runs before the reason is recorded — and that the reason
 * itself survives it, because a remedy the creator cannot read is no remedy.
 */
import { describe, expect, it } from "@jest/globals";

import { redactSecrets } from "../scriptVoicing";

describe("redactSecrets", () => {
  it("takes the credential out and leaves the reason", () => {
    expect(
      redactSecrets(
        "401 Unauthorized: request used Bearer sk-live-abcdefgh12345678"
      )
    ).toBe("401 Unauthorized: request used Bearer [redacted]");

    expect(redactSecrets('{"api_key":"abc123def456ghi"} was rejected')).toBe(
      '{"api_key":"[redacted]"} was rejected'
    );

    expect(
      redactSecrets("no key for provider elevenlabs (set ELEVENLABS_API_KEY)")
    ).toBe("no key for provider elevenlabs (set ELEVENLABS_API_KEY)");
  });

  it("catches an unlabelled token by its shape", () => {
    expect(
      redactSecrets("timed out: 0123456789abcdef0123456789abcdef0123")
    ).toBe("timed out: [redacted]");
  });

  it("leaves an ordinary failure alone", () => {
    for (const message of [
      "TTS returned no audio asset",
      "Line has no voice — assign the speaker a voice or set a per-line override",
      "that voice is offline"
    ]) {
      expect(redactSecrets(message)).toBe(message);
    }
  });
});
